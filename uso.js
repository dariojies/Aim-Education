// ─────────────────────────────────────────────────────────────────────────────
// El uso de la web: qué secciones del panel y del área de familias se abren,
// cuántas veces y cuántas personas distintas, por día y por tipo de persona.
// Para decidir qué mejorar primero (y ver lo que no usa nadie).
//
// No se guarda quién: cada persona se apunta con una huella hecha con una sal
// que cambia cada día (aim_ajustes «uso_sal»). Al cambiar la sal, la del día
// anterior se pierde y ya no se puede saber de quién era. Así se cuentan las
// personas distintas de cada día, pero no se puede seguir a nadie.
//
// Se junta en memoria y se guarda cada minuto, de una vez (la base la comparten
// cinco apps y tiene las conexiones contadas). Más de 13 meses: fuera.
// La web pública ya tiene sus visitas (aim_web_visitas, con las cookies de
// análisis aceptadas): aquí solo se leen para el resumen.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import { seccionDeRuta } from './src/rutasAdmin.js';

// Las secciones del área de familias, por su dirección (/dashboard/<…>).
const SECCIONES_FAMILIA = {
    '': 'resumen', noticias: 'noticias', mensajes: 'mensajes', pedidos: 'pedidos', cursos: 'cursos', clases: 'clases',
    campamento: 'campamento', asistencia: 'asistencia', fotos: 'fotos', brickslab: 'brickslab', pagos: 'pagos',
    cartera: 'cartera', perfil: 'perfil', ajustes: 'ajustes', soporte: 'soporte', mas: 'mas',
};

// De la dirección a la zona y la sección (null si no es del panel ni del área).
export function seccionDeUso(ruta) {
    const seg = String(ruta || '').split('?')[0].split('/').filter(Boolean);
    if (seg[0] === 'admin') {
        const { view, pestana } = seccionDeRuta(seg);
        return { zona: 'admin', seccion: view === 'comunicaciones' && pestana ? `comunicaciones/${pestana}` : view };
    }
    if (seg[0] === 'dashboard') {
        const s = SECCIONES_FAMILIA[seg[1] || ''];
        return s ? { zona: 'familias', seccion: s } : null;
    }
    return null;
}

export function crearUso({ pool, hoy }) {
    const BUFFER = new Map();   // dia|zona|seccion|canal|quien → { …, veces }
    let sal = null;             // { dia, sal }
    let purgado = null;
    const porPersona = new Map();

    async function salDe(dia) {
        if (sal?.dia === dia) return sal.sal;
        // La de hoy, o una nueva si la guardada es de otro día (con dos dynos, la misma).
        const r = await pool.query(
            `INSERT INTO aim_ajustes (clave, valor, actualizado_at) VALUES ('uso_sal', $1::jsonb, NOW())
             ON CONFLICT (clave) DO UPDATE SET valor = CASE WHEN aim_ajustes.valor->>'dia' = $2 THEN aim_ajustes.valor ELSE EXCLUDED.valor END,
                                               actualizado_at = CASE WHEN aim_ajustes.valor->>'dia' = $2 THEN aim_ajustes.actualizado_at ELSE NOW() END
             RETURNING valor`,
            [JSON.stringify({ dia, sal: crypto.randomBytes(24).toString('hex') }), dia]);
        sal = { dia, sal: r.rows[0].valor.sal };
        return sal.sal;
    }

    // Una sección abierta. Se apunta con el id de la persona; la huella se hace al guardar.
    function apuntar(sesion, ruta, app) {
        const s = seccionDeUso(ruta);
        if (!s || !sesion?.userId) return false;
        // Freno: 60 por minuto y persona (un bucle en la pantalla no llena la tabla).
        const ahora = Date.now();
        const l = (porPersona.get(sesion.userId) || []).filter(t => ahora - t < 60_000);
        if (l.length >= 60) return false;
        porPersona.set(sesion.userId, [...l, ahora]);
        if (porPersona.size > 5000) porPersona.clear();
        const rol = sesion.canAccessAdmin ? (sesion.rolVisible || sesion.rol || 'personal') : 'familia';
        const canal = app ? 'app' : 'web';
        const dia = hoy();
        const k = [dia, s.zona, s.seccion, canal, sesion.userId].join('|');
        const b = BUFFER.get(k) || { dia, zona: s.zona, seccion: s.seccion, canal, userId: sesion.userId, rol, veces: 0 };
        b.veces++;
        BUFFER.set(k, b);
        return true;
    }

    async function volcar() {
        if (!BUFFER.size) return;
        const filas = [...BUFFER.values()];
        BUFFER.clear();
        try {
            const sales = {};
            for (const d of new Set(filas.map(f => f.dia))) sales[d] = await salDe(d);
            const v = [], p = [];
            filas.forEach((f, i) => {
                const quien = crypto.createHash('sha256').update(`${sales[f.dia]}|${f.userId}`).digest('hex').slice(0, 20);
                p.push(f.dia, f.zona, f.seccion, f.canal, quien, f.rol, f.veces);
                const b = i * 7;
                v.push(`($${b + 1}::date, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`);
            });
            await pool.query(
                `INSERT INTO aim_uso_diario (dia, zona, seccion, canal, quien, rol, veces) VALUES ${v.join(',')}
                 ON CONFLICT (dia, zona, seccion, canal, quien) DO UPDATE SET veces = aim_uso_diario.veces + EXCLUDED.veces`, p);
        } catch (e) {
            // Si la base no contesta, se vuelve a intentar en el siguiente minuto.
            for (const f of filas) {
                const k = [f.dia, f.zona, f.seccion, f.canal, f.userId].join('|');
                const b = BUFFER.get(k);
                if (b) b.veces += f.veces; else BUFFER.set(k, f);
            }
            console.error('[uso] no se ha podido guardar:', e.message);
        }
        if (purgado !== hoy()) {
            purgado = hoy();
            await pool.query(`DELETE FROM aim_uso_diario WHERE dia < $1::date - interval '13 months'`, [hoy()]).catch(() => {});
        }
    }
    setInterval(function guardarUsoDeLaWeb() { volcar().catch(() => {}); }, 60_000);
    // Al apagar (cada deploy), lo que quede.
    process.on('SIGTERM', () => { volcar().catch(() => {}); });

    // El resumen de los últimos «dias» días.
    async function resumen(dias) {
        await volcar();
        const n = [7, 30, 90].includes(Number(dias)) ? Number(dias) : 30;
        // Desde hace «n» días, o desde que se empezó a medir si es después.
        const { inicio, medidos } = (await pool.query(
            `WITH x AS (SELECT GREATEST($2::date - $1::int + 1, COALESCE(MIN(dia), $2::date)) AS i FROM aim_uso_diario)
             SELECT to_char(i, 'YYYY-MM-DD') AS inicio, ($2::date - i + 1)::int AS medidos FROM x`, [n, hoy()])).rows[0];
        const [secciones, roles, canales, zonas, web] = await Promise.all([
            pool.query(
                `WITH d AS (SELECT dia, zona, seccion, COUNT(DISTINCT quien) AS p, SUM(veces) AS v FROM aim_uso_diario WHERE dia >= $1 GROUP BY 1, 2, 3)
                 SELECT zona, seccion, SUM(v)::int AS veces, SUM(p)::int AS personas_dia, COUNT(*)::int AS dias FROM d GROUP BY 1, 2 ORDER BY 3 DESC`, [inicio]),
            pool.query(`SELECT zona, seccion, rol, SUM(veces)::int AS veces FROM aim_uso_diario WHERE dia >= $1 GROUP BY 1, 2, 3`, [inicio]),
            pool.query(`SELECT zona, seccion, canal, SUM(veces)::int AS veces FROM aim_uso_diario WHERE dia >= $1 GROUP BY 1, 2, 3`, [inicio]),
            pool.query(
                `WITH d AS (SELECT dia, zona, canal, COUNT(DISTINCT quien) AS p FROM aim_uso_diario WHERE dia >= $1 GROUP BY 1, 2, 3)
                 SELECT zona, canal, SUM(p)::int AS personas_dia FROM d GROUP BY 1, 2`, [inicio]),
            pool.query(
                `SELECT ruta, COUNT(*)::int AS veces, COUNT(DISTINCT visitante)::int AS navegadores FROM aim_web_visitas
                 WHERE created_at >= $1::date AND ruta LIKE '/%' AND ruta NOT LIKE '/dashboard%' AND ruta NOT LIKE '/admin%'
                 GROUP BY 1 ORDER BY 2 DESC LIMIT 15`, [inicio]),
        ]);
        const de = (rows, zona, seccion, campo) => Object.fromEntries(rows.filter(r => r.zona === zona && r.seccion === seccion).map(r => [r[campo], r.veces]));
        const media = (x) => Math.round((x / medidos) * 10) / 10;
        const lista = (zona) => secciones.rows.filter(r => r.zona === zona).map(r => ({
            seccion: r.seccion, veces: r.veces, personasDia: media(r.personas_dia), dias: r.dias,
            roles: de(roles.rows, zona, r.seccion, 'rol'), canales: de(canales.rows, zona, r.seccion, 'canal'),
        }));
        const personas = (zona) => Object.fromEntries(zonas.rows.filter(r => r.zona === zona).map(r => [r.canal, media(r.personas_dia)]));
        return {
            dias: n, desde: inicio, medidos,
            admin: lista('admin'), familias: lista('familias'),
            personas: { admin: personas('admin'), familias: personas('familias') },
            web: web.rows,
        };
    }

    return { apuntar, volcar, resumen };
}
