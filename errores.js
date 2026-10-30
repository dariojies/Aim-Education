// ─────────────────────────────────────────────────────────────────────────────
// Los errores de la web, a tickets. Lo que falla en la web de verdad abre solo
// un ticket de «Error» en Soporte, sin esperar a que una familia o alguien del
// equipo lo cuente:
//  · una petición que acaba en error del servidor (500 o más), a la primera;
//  · una tarea automática que falla, a la primera;
//  · un error del registro (console.error) fuera de una petición, a la tercera
//    vez en un día (alguno suelto es normal: un correo que rebota…);
//  · un error en el navegador de alguien: si se le rompe la pantalla y ha
//    entrado con su cuenta, a la primera; el resto, a la tercera.
//
// Cada error tiene su código (sale de qué es y dónde, sin números ni nombres).
// Si ya hay un ticket abierto con ese código, se apunta en su historial que se
// ha vuelto a dar (como mucho una vez por hora) en vez de abrir otro. Si estaba
// resuelto y vuelve, se abre uno nuevo que lo dice.
//
// Freno: como mucho 6 tickets nuevos por hora. Solo en Heroku (en local, con
// ERRORES_A_TICKETS=1, para probarlo: la base es la de verdad).
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import { alError, contexto } from './vigilancia.js';

const MINIMO = { peticion: 1, tarea: 1, registro: 3, navegador: 3, pantalla: 1 };
const MAX_POR_HORA = 6;
const DIA = 24 * 3600_000, HORA = 3600_000;
// Lo que no es un fallo de la web: las peticiones que se cortan, la base que
// se reinicia en el mantenimiento de Heroku… (se ve igual en la vigilancia).
const NO_ES_ERROR = /request aborted|ECONNRESET|socket hang up|EPIPE|client has encountered a connection error|terminating connection due to administrator command/i;

// Sin lo que cambia de una vez a otra: identificadores, números, correos y lo
// que va entre comillas. Lo que queda dice qué error es.
export function normalizar(t) {
    return String(t || '')
        .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ':correo')
        .replace(/"[^"]*"|'[^']*'|«[^»]*»|`[^`]*`/g, '""')
        .replace(/https?:\/\/\S+/g, ':url')
        .replace(/\d+/g, 'N')
        .replace(/\s+/g, ' ').trim().slice(0, 300);
}
const huellaDe = (partes) => crypto.createHash('sha1').update(partes.map(normalizar).join('|')).digest('hex').slice(0, 12);
const hora = (t) => new Date(t).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const corta = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

// De un aviso (de la vigilancia o del navegador) a lo que lleva su ticket.
function describir(e) {
    if (e.tipo === 'peticion') {
        const msg = e.mensaje || e.registro?.[0] || null;
        return {
            huella: huellaDe(['peticion', e.metodo, e.ruta, msg || String(e.estado)]),
            titulo: `${e.metodo} ${e.ruta} da error ${e.estado}${msg ? `: ${corta(msg, 90)}` : ''}`,
            que: msg ? `La web ha contestado con un error ${e.estado}: «${corta(msg, 400)}».` : `La web ha contestado con un error ${e.estado}.`,
            donde: `${e.metodo} ${e.ruta}`,
            detalle: (e.registro || []).join('\n'),
        };
    }
    if (e.tipo === 'tarea') {
        return {
            huella: huellaDe(['tarea', e.nombre, e.mensaje]),
            titulo: `La tarea automática ${e.nombre} falla: ${corta(e.mensaje, 90)}`,
            que: `Una tarea automática ha fallado: «${corta(e.mensaje, 400)}».`,
            donde: `La tarea ${e.nombre} (en Equipo IT → Vigilancia → Tareas automáticas)`,
            detalle: e.pila || '',
        };
    }
    if (e.tipo === 'registro') {
        return {
            huella: huellaDe(['registro', e.mensaje]),
            titulo: corta(e.mensaje, 120),
            que: `Se ha apuntado este error en el registro del servidor: «${corta(e.mensaje, 600)}».`,
            donde: e.etiqueta ? `La parte de la web que apunta «[${e.etiqueta}]»` : 'El servidor (sin una petición concreta)',
            detalle: '',
        };
    }
    // Del navegador: «pantalla» si se rompió lo que se estaba viendo.
    const pantalla = e.tipo === 'pantalla';
    const archivo = /\/assets\/[^/:)\s]+/.exec(e.pila || '')?.[0]?.replace(/-[\w-]{6,}\.js$/, '.js') || '';
    return {
        huella: huellaDe(['navegador', e.mensaje, archivo, e.ruta]),
        titulo: `${pantalla ? 'Se rompe la pantalla' : 'Error en el navegador'} en ${e.ruta}: ${corta(e.mensaje, 80)}`,
        que: pantalla
            ? `A alguien se le ha roto la pantalla (le salió «Algo ha fallado»): «${corta(e.mensaje, 400)}».`
            : `Ha saltado un error en el navegador: «${corta(e.mensaje, 400)}».`,
        donde: `La página ${e.ruta}${e.navegador ? ` · ${corta(e.navegador, 160)}` : ''}`,
        detalle: [e.pila, e.componentes ? `Componentes:\n${e.componentes}` : ''].filter(Boolean).join('\n\n'),
    };
}

export function crearErroresATickets({ pool, anotarHistorial, avisar, activo, version = () => null }) {
    const PENDIENTES = new Map();   // huella → { …describir(), tipo, veces, nuevas, primera, ultima, quien, ticket, anotadoAt }
    let creados = [];               // cuándo se abrió cada ticket (para el freno)

    function anotar(e) {
        if (!activo()) return;
        if (NO_ES_ERROR.test(`${e.mensaje || ''} ${(e.registro || []).join(' ')}`)) return;
        // Lo de los propios avisos (los correos de los tickets) no cuenta.
        if (e.tipo === 'registro' && /^(errores|SMTP ERROR|soporte)$/i.test(e.etiqueta || '')) return;
        const d = describir(e);
        const ahora = Date.now();
        const p = PENDIENTES.get(d.huella) || { ...d, tipo: e.tipo, veces: 0, nuevas: 0, primera: ahora, quien: null };
        p.veces++; p.nuevas++; p.ultima = ahora;
        if (e.quien) p.quien = e.quien;
        // Un navegador sin cuenta (cualquiera puede mandar uno) nunca abre a la primera.
        if (e.tipo === 'pantalla' && !e.quien) p.tipo = 'navegador';
        PENDIENTES.set(d.huella, p);
        if (PENDIENTES.size > 500) for (const [k, v] of PENDIENTES) { if (!v.ticket) { PENDIENTES.delete(k); break; } }
    }
    alError(anotar);

    function descripcion(p, anterior) {
        const quien = p.quien ? `${p.quien.nombre || 'Alguien'} (${p.quien.rol || 'sin rol'})` : 'No se sabe (sin cuenta o una tarea automática)';
        const v = version();
        return [
            'Este ticket lo ha abierto la web sola al detectar un error: no lo ha escrito nadie.',
            '',
            `Qué ha pasado: ${p.que}`,
            `Dónde: ${p.donde}`,
            `A quién le pasó: ${quien}`,
            `Cuándo: la primera vez el ${hora(p.primera)}${p.veces > 1 ? `; ${p.veces} veces hasta abrir este ticket` : ''}.`,
            ...(v ? [`Versión de la web: ${v}`] : []),
            ...(anterior ? ['', `Ya pasó antes: el #${anterior} se dio por resuelto y ha vuelto a ocurrir.`] : []),
            ...(p.detalle ? ['', 'Detalle técnico:', p.detalle.slice(0, 3000)] : []),
            '',
            'Si vuelve a pasar mientras este ticket esté abierto, se apunta en su historial. Si ya está resuelto, se abre otro.',
            `Código del error: ${p.huella}`,
        ].join('\n');
    }

    async function procesar(p) {
        const c = await pool.connect();
        try {
            await c.query('BEGIN');
            // Con dos dynos, el mismo error solo lo trata uno.
            await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`errores:${p.huella}`]);
            const t = (await c.query(
                `SELECT id, status FROM tickets_registrosoporte WHERE description LIKE $1 ORDER BY id DESC LIMIT 1`,
                [`%Código del error: ${p.huella}%`])).rows[0];
            if (t && t.status === 'open') {
                if (Date.now() - (p.anotadoAt || 0) >= HORA) {
                    await anotarHistorial(c, t.id, null, [{ campo: 'se repite', antes: null, despues: `${p.nuevas} ${p.nuevas === 1 ? 'vez' : 'veces'} más (la última, el ${hora(p.ultima)})` }]);
                    p.nuevas = 0; p.anotadoAt = Date.now();
                }
                p.ticket = t.id;
                await c.query('COMMIT');
                return;
            }
            creados = creados.filter(x => Date.now() - x < HORA);
            if (creados.length >= MAX_POR_HORA) { await c.query('ROLLBACK'); return; }
            const asunto = `Error automático: ${p.titulo}`.slice(0, 255);
            const texto = descripcion(p, t?.id);
            const id = (await c.query(
                `INSERT INTO tickets_registrosoporte (user_id, subject, description, app_label, priority, categoria)
                 VALUES (NULL, $1, $2, ARRAY['Aim Education']::TEXT[], $3, 'error') RETURNING id`,
                [asunto, texto, p.tipo === 'pantalla' || p.tipo === 'peticion' ? 'medium' : 'low'])).rows[0].id;
            await anotarHistorial(c, id, null, [{ campo: 'creado', antes: null, despues: 'Abierto solo al detectar un error' }]);
            await c.query('COMMIT');
            creados.push(Date.now());
            p.ticket = id; p.nuevas = 0; p.anotadoAt = Date.now();
            avisar(id, asunto, texto).catch(() => {});
        } catch (e) {
            await c.query('ROLLBACK').catch(() => {});
            throw e;
        } finally { c.release(); }
    }

    // Cada minuto: lo que ya ha llegado a su mínimo, a su ticket.
    async function volcar() {
        if (!activo()) return;
        const ahora = Date.now();
        for (const [h, p] of PENDIENTES) {
            if (ahora - p.ultima > DIA) { PENDIENTES.delete(h); continue; }
            if (!p.nuevas || p.veces < MINIMO[p.tipo]) continue;
            try { await procesar(p); } catch (e) { console.warn('[errores] no se ha podido apuntar:', e.message); }
        }
    }
    setInterval(function erroresATickets() { contexto.run({ silencio: true }, () => volcar()).catch(() => {}); }, 60_000);

    return { anotar, volcar: () => contexto.run({ silencio: true }, () => volcar()), pendientes: () => [...PENDIENTES.values()] };
}

// Lo que manda el navegador: se limpia y se descarta lo que no es de la web
// (extensiones, «Script error.» sin datos, cortes de conexión…).
export function errorDelNavegador(b, quien) {
    const mensaje = String(b?.mensaje || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    const ruta = String(b?.ruta || '').split('?')[0].replace(/\/[0-9a-f-]{20,}/gi, '/:id').replace(/\/\d+(?=\/|$)/g, '/:n').slice(0, 200);
    const pila = String(b?.pila || '').split('\n').slice(0, 8).map(l => l.slice(0, 300)).join('\n');
    if (!mensaje || !ruta.startsWith('/')) return null;
    if (/^Script error\.?$|ResizeObserver loop|Failed to fetch|Load failed|NetworkError|network error|AbortError|The operation was aborted|dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(mensaje)) return null;
    if (/chrome-extension:|moz-extension:|safari-extension:|safari-web-extension:/.test(pila)) return null;
    return {
        tipo: b?.tipo === 'pantalla' ? 'pantalla' : 'navegador', mensaje, ruta, pila,
        componentes: String(b?.componentes || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 8).join('\n').slice(0, 800),
        navegador: String(b?.navegador || '').slice(0, 200),
        quien,
    };
}
