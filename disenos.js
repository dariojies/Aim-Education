// ─────────────────────────────────────────────────────────────────────────────
// Diseños: el «Canva» del club (carteles, posts, historias, diplomas…). Aquí
// solo se guardan: el diseño entero es un JSON (lienzo, fondo y elementos) y se
// pinta en el navegador (src/disenos/render.js), igual al diseñar que al
// exportar a PNG, JPG o PDF. Las imágenes que se suben van a las de los correos
// (aim_correo_imagenes, /ci/…), que ya son públicas y para siempre.
//
// Los de tipo «diploma» llevan huecos ({alumno}, {curso}…) y son los diplomas
// del aula virtual: uno por defecto (aim_ajustes «diploma_diseno») y, si un
// curso quiere otro, el suyo (aim_aula_cursos.diploma_diseno_id).
// Lo llevan secretaría y la dirección (sección «grafico», «Aim Design»).
// (No confundir con los diseños de correo de Comunicación.)
//
// Lo que el editor trae del resto de la web (todo con el permiso de Aim Design):
//  · la marca: los colores y el logo de «Marca de los correos»;
//  · las fotos del club: solo las de la galería en las que todos los que salen
//    tienen permiso de fotos. Se sirven desde aquí y se vuelve a mirar el
//    permiso cada vez: si alguien lo retira, su foto deja de salir en los diseños;
//  · los datos para los diplomas en lote: los alumnos de una clase o los de una
//    convocatoria de examen;
//  · y guarda un diseño terminado en las imágenes de los correos y las noticias.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';
import { limpiarMarca, MARCA_POR_DEFECTO } from './correo-diseno.js';

export async function crearTablasDisenos(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_disenos (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(150) NOT NULL,
            tipo VARCHAR(10) NOT NULL DEFAULT 'libre',
            ancho INTEGER NOT NULL,
            alto INTEGER NOT NULL,
            datos JSONB NOT NULL,
            miniatura TEXT,
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    // El diploma propio de un curso (si no, el de por defecto).
    await client.query(`ALTER TABLE aim_aula_cursos ADD COLUMN IF NOT EXISTS diploma_diseno_id INTEGER REFERENCES aim_disenos(id) ON DELETE SET NULL`).catch(() => {});
}

const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
const fallo = (res, err) => {
    if (!err.status) console.error('[diseños]', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'No se ha podido hacer. Inténtalo otra vez.' });
};
const MAX_DATOS = 600_000;       // el JSON de un diseño (sin imágenes dentro: van por URL)
const MAX_MINIATURA = 250_000;
export const CLAVE_DIPLOMA = 'diploma_diseno';

// Los colores del club (los del arcoíris del logo y los neutros).
const PALETA_CLUB = ['#5233A8', '#FF5FA2', '#F99B35', '#FFD526', '#21B668', '#00BBF4', '#1A1A1A', '#FFFFFF', '#F6F4EF'];
// Una foto de la galería vale para un diseño si sale alguien etiquetado y todos
// los que salen tienen permiso de fotos (una sin etiquetar no se sabe quién sale).
const SQL_FOTO_CON_PERMISO = (f) => `EXISTS (SELECT 1 FROM aim_galeria_etiquetas e WHERE e.foto_id = ${f}.id)
    AND NOT EXISTS (SELECT 1 FROM aim_galeria_etiquetas e JOIN users u ON u.user_id = e.user_id
                    WHERE e.foto_id = ${f}.id AND COALESCE(u.media_consent, false) = false)`;
const nombreDe = (u) => `TRIM(CONCAT(${u}.name, ' ', COALESCE(${u}.surname, '')))`;
// Quien da la clase, sacado de sus sesiones (como en el horario).
function profesoresDe(sesiones) {
    const nombres = [];
    for (const s of Array.isArray(sesiones) ? sesiones : []) {
        const lista = (Array.isArray(s?.instructors) ? s.instructors : []).map(d => d?.name).filter(Boolean);
        for (const n of lista.length ? lista : s?.instructorName ? [s.instructorName] : []) if (!nombres.includes(n)) nombres.push(n);
    }
    return nombres.join(' y ');
}

function limpiar(body) {
    const nombre = String(body?.nombre || '').trim().slice(0, 150) || 'Diseño sin nombre';
    const tipo = body?.tipo === 'diploma' ? 'diploma' : 'libre';
    const d = body?.datos;
    if (!d || typeof d !== 'object') corta(400, 'Falta el diseño.');
    const ancho = Math.round(Number(d.ancho)), alto = Math.round(Number(d.alto));
    if (!(ancho >= 50 && ancho <= 6000 && alto >= 50 && alto <= 6000)) corta(400, 'El tamaño tiene que estar entre 50 y 6000 píxeles.');
    if (!Array.isArray(d.elementos) || d.elementos.length > 400) corta(400, 'Como mucho 400 elementos por diseño.');
    const json = JSON.stringify(d);
    if (json.length > MAX_DATOS) corta(400, 'El diseño es demasiado grande. ¿Hay alguna imagen pegada dentro? Súbela.');
    if (/"url"\s*:\s*"data:/.test(json)) corta(400, 'Las imágenes se suben, no se pegan dentro del diseño.');
    const mini = typeof body?.miniatura === 'string' && body.miniatura.startsWith('data:image/') && body.miniatura.length <= MAX_MINIATURA ? body.miniatura : null;
    return { nombre, tipo, ancho, alto, json, mini };
}

export function crearDisenos({ pool, clubId, authenticateSession, requireSeccion }) {
    const router = express.Router();
    const gestion = [authenticateSession, requireSeccion('grafico')];
    const resumen = (x) => ({ id: x.id, nombre: x.nombre, tipo: x.tipo, ancho: x.ancho, alto: x.alto, miniatura: x.miniatura, autor: x.autor || null, actualizado: x.updated_at,
        plantilla: x.plantilla ?? x.datos?.esPlantilla === true });

    async function diplomaPorDefecto() {
        const v = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = $1`, [CLAVE_DIPLOMA])).rows[0]?.valor;
        return Number(v?.id) || null;
    }

    router.get('/api/admin/disenos', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT d.id, d.nombre, d.tipo, d.ancho, d.alto, d.miniatura, d.updated_at, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS autor,
                        COALESCE((d.datos->>'esPlantilla')::boolean, false) AS plantilla
                 FROM aim_disenos d LEFT JOIN users u ON u.user_id = d.creado_por ORDER BY d.updated_at DESC LIMIT 500`);
            res.set('Cache-Control', 'no-store');
            res.json({ disenos: r.rows.map(resumen), diplomaPorDefecto: await diplomaPorDefecto() });
        } catch (err) { fallo(res, err); }
    });
    // ── La marca: los colores y el logo de «Marca de los correos» y los del club ──
    router.get('/api/admin/disenos/marca', ...gestion, async (req, res) => {
        try {
            const v = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = 'marca_correo'`)).rows[0]?.valor;
            const m = v ? limpiarMarca(v) : { ...MARCA_POR_DEFECTO };
            const colores = [...new Set([m.colorPrincipal, m.colorTexto, ...PALETA_CLUB].map(c => String(c).toUpperCase()))];
            res.set('Cache-Control', 'no-store');
            res.json({ nombre: m.nombre, colores, logo: m.logo || null, web: m.web || '', pie: m.pieTexto || '', redes: m.redes || {} });
        } catch (err) { fallo(res, err); }
    });

    // ── Las fotos del club (solo las que se pueden usar) ──
    router.get('/api/admin/disenos/fotos-club', ...gestion, async (req, res) => {
        try {
            const albumId = Number(req.query.album) || null;
            const albumes = (await pool.query(
                `SELECT al.id, al.titulo, al.fecha, COUNT(f.id)::int AS fotos,
                        COUNT(f.id) FILTER (WHERE ${SQL_FOTO_CON_PERMISO('f')})::int AS validas
                 FROM aim_galeria_albumes al JOIN aim_galeria_fotos f ON f.album_id = al.id
                 GROUP BY al.id ORDER BY al.fecha DESC, al.id DESC LIMIT 60`)).rows;
            const elegido = albumId || albumes.find(a => a.validas)?.id || null;
            const fotos = elegido ? (await pool.query(
                `SELECT f.id, f.ancho, f.alto FROM aim_galeria_fotos f WHERE f.album_id = $1 AND ${SQL_FOTO_CON_PERMISO('f')}
                 ORDER BY f.orden, f.id LIMIT 120`, [elegido])).rows : [];
            res.set('Cache-Control', 'no-store');
            res.json({ albumes: albumes.map(a => ({ id: a.id, titulo: a.titulo, fecha: a.fecha, fotos: a.fotos, validas: a.validas })), album: elegido, fotos });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/admin/disenos/foto-club/:id/:tamano(grande|mini)', ...gestion, async (req, res) => {
        try {
            const col = req.params.tamano === 'mini' ? 'miniatura' : 'datos';
            const f = (await pool.query(`SELECT f.${col} AS img, f.mime FROM aim_galeria_fotos f WHERE f.id = $1 AND ${SQL_FOTO_CON_PERMISO('f')}`,
                [Number(req.params.id) || 0])).rows[0];
            if (!f?.img) return res.status(404).type('text/plain').send('Esa foto ya no se puede usar.');
            res.set({ 'Content-Type': f.mime || 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' }).send(f.img);
        } catch (err) { fallo(res, err); }
    });

    // ── Diplomas en lote: de una clase o de una convocatoria de examen ──
    router.get('/api/admin/disenos/lote', ...gestion, async (req, res) => {
        try {
            const [grupos, convocatorias] = await Promise.all([
                pool.query(
                    `SELECT g.group_id AS id, g.name AS nombre, a.name AS actividad,
                            (SELECT COUNT(*) FROM tul_group_students gs WHERE gs.group_id = g.group_id)::int AS alumnos
                     FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                     WHERE a.club_id = $1 ORDER BY a.name, g.name`, [clubId]),
                pool.query(
                    `SELECT c.id, COALESCE(c.nombre, 'Examen') AS nombre, c.actividad, c.fecha,
                            COUNT(e.id)::int AS participantes, COUNT(e.id) FILTER (WHERE e.apto)::int AS aptos
                     FROM aim_convocatorias c LEFT JOIN aim_examenes e ON e.convocatoria_id = c.id
                     GROUP BY c.id ORDER BY c.fecha DESC, c.id DESC LIMIT 60`),
            ]);
            res.set('Cache-Control', 'no-store');
            res.json({ grupos: grupos.rows, convocatorias: convocatorias.rows });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/admin/disenos/lote/:origen(grupo|convocatoria)/:id', ...gestion, async (req, res) => {
        try {
            if (req.params.origen === 'grupo') {
                if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) corta(400, 'Elige la clase.');
                const g = (await pool.query(
                    `SELECT g.group_id, g.name, g.sessions, a.activity_id, a.name AS actividad FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                     WHERE g.group_id = $1 AND a.club_id = $2`, [req.params.id, clubId])).rows[0];
                if (!g) corta(404, 'Esa clase ya no existe.');
                const r = await pool.query(
                    `SELECT DISTINCT u.user_id AS id, ${nombreDe('u')} AS alumno, up.level_name AS nivel
                     FROM tul_group_students gs JOIN users u ON u.user_id = gs.student_id
                     LEFT JOIN tul_user_progression up ON up.user_id = u.user_id AND up.activity_id = $2
                     WHERE gs.group_id = $1 ORDER BY alumno`, [g.group_id, g.activity_id]);
                const profesor = profesoresDe(g.sessions);
                res.set('Cache-Control', 'no-store');
                return res.json({
                    titulo: `${g.actividad} · ${g.name}`, fecha: null,
                    personas: r.rows.map(p => ({ id: p.id, marcado: true, nota: p.nivel || '', variables: { alumno: p.alumno, curso: g.actividad, grupo: g.name, profesor, nivel: p.nivel || '' } })),
                });
            }
            const c = (await pool.query(`SELECT * FROM aim_convocatorias WHERE id = $1`, [Number(req.params.id) || 0])).rows[0];
            if (!c) corta(404, 'Esa convocatoria ya no existe.');
            const r = await pool.query(
                `SELECT e.id, ${nombreDe('u')} AS alumno, e.nivel, e.resultado, e.apto FROM aim_examenes e JOIN users u ON u.user_id = e.alumno_id
                 WHERE e.convocatoria_id = $1 ORDER BY alumno`, [c.id]);
            res.set('Cache-Control', 'no-store');
            res.json({
                titulo: `${c.nombre || 'Examen'} · ${c.actividad || ''}`.replace(/ · $/, ''), fecha: c.fecha,
                personas: r.rows.map(p => ({
                    id: String(p.id), marcado: p.apto === true, nota: p.apto === true ? `Apto${p.nivel ? ` · ${p.nivel}` : ''}` : p.apto === false ? 'No apto' : 'Sin evaluar',
                    variables: { alumno: p.alumno, curso: c.actividad || '', grupo: c.nombre || '', profesor: '', nivel: p.nivel || '', resultado: p.resultado || '' },
                })),
            });
        } catch (err) { fallo(res, err); }
    });

    // ── Un diseño terminado, a las imágenes de los correos y las noticias ──
    router.post('/api/admin/disenos/biblioteca', ...gestion, async (req, res) => {
        try {
            const m = String(req.body?.datos || '').match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
            if (!m) corta(400, 'La imagen no ha llegado bien.');
            const datos = Buffer.from(m[2], 'base64');
            if (datos.length > 4 * 1024 * 1024) corta(413, 'La imagen pesa demasiado (máximo 4 MB).');
            const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
            const id = crypto.randomBytes(12).toString('hex');
            await pool.query(
                `INSERT INTO aim_correo_imagenes (id, mime, datos, nombre, ancho, alto, bytes, subido_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [id, m[1], datos, `Aim Design · ${String(req.body?.nombre || 'Diseño').slice(0, 180)}`, num(req.body?.ancho), num(req.body?.alto), datos.length, req.userSession.userId]);
            res.status(201).json({ success: true, url: `/ci/${id}` });
        } catch (err) { fallo(res, err); }
    });

    router.get('/api/admin/disenos/:id', ...gestion, async (req, res) => {
        try {
            const x = (await pool.query(`SELECT * FROM aim_disenos WHERE id = $1`, [Number(req.params.id) || 0])).rows[0];
            if (!x) corta(404, 'Ese diseño ya no existe.');
            res.set('Cache-Control', 'no-store');
            res.json({ ...resumen(x), datos: x.datos });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/admin/disenos', ...gestion, async (req, res) => {
        try {
            const d = limpiar(req.body);
            const r = await pool.query(
                `INSERT INTO aim_disenos (nombre, tipo, ancho, alto, datos, miniatura, creado_por) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING id`,
                [d.nombre, d.tipo, d.ancho, d.alto, d.json, d.mini, req.userSession.userId]);
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/disenos/:id', ...gestion, async (req, res) => {
        try {
            const d = limpiar(req.body);
            const r = await pool.query(
                `UPDATE aim_disenos SET nombre = $2, tipo = $3, ancho = $4, alto = $5, datos = $6::jsonb, miniatura = COALESCE($7, miniatura), updated_at = NOW()
                 WHERE id = $1 RETURNING id`, [Number(req.params.id) || 0, d.nombre, d.tipo, d.ancho, d.alto, d.json, d.mini]);
            if (!r.rowCount) corta(404, 'Ese diseño ya no existe.');
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/admin/disenos/:id/duplicar', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(
                `INSERT INTO aim_disenos (nombre, tipo, ancho, alto, datos, miniatura, creado_por)
                 SELECT LEFT(nombre || ' (copia)', 150), tipo, ancho, alto, datos, miniatura, $2 FROM aim_disenos WHERE id = $1 RETURNING id`,
                [Number(req.params.id) || 0, req.userSession.userId]);
            if (!r.rowCount) corta(404, 'Ese diseño ya no existe.');
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/disenos/:id', ...gestion, async (req, res) => {
        try {
            const id = Number(req.params.id) || 0;
            await pool.query(`DELETE FROM aim_disenos WHERE id = $1`, [id]);
            if (await diplomaPorDefecto() === id) await pool.query(`DELETE FROM aim_ajustes WHERE clave = $1`, [CLAVE_DIPLOMA]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // El diploma por defecto del aula (null: el de siempre, sin diseñar).
    router.put('/api/admin/disenos-diploma', ...gestion, async (req, res) => {
        try {
            const id = req.body?.id ? Number(req.body.id) : null;
            if (id) {
                const x = (await pool.query(`SELECT tipo FROM aim_disenos WHERE id = $1`, [id])).rows[0];
                if (!x) corta(404, 'Ese diseño ya no existe.');
                if (x.tipo !== 'diploma') corta(400, 'Ese diseño no es un diploma.');
                await pool.query(
                    `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ($1, $2::jsonb, NOW(), $3)
                     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = EXCLUDED.actualizado_por`,
                    [CLAVE_DIPLOMA, JSON.stringify({ id }), req.userSession.userId]);
            } else await pool.query(`DELETE FROM aim_ajustes WHERE clave = $1`, [CLAVE_DIPLOMA]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Para elegir el diploma de un curso (lo usa el aula, con su propio permiso).
    router.get('/api/admin/disenos-diplomas', authenticateSession, requireSeccion('aula'), async (req, res) => {
        try {
            const r = await pool.query(`SELECT id, nombre, miniatura FROM aim_disenos WHERE tipo = 'diploma' ORDER BY nombre`);
            res.set('Cache-Control', 'no-store');
            res.json({ diplomas: r.rows, porDefecto: await diplomaPorDefecto() });
        } catch (err) { fallo(res, err); }
    });

    return { router, diplomaPorDefecto };
}

// El diseño del diploma de un curso: el suyo o el de por defecto (null si no hay).
export async function disenoDiploma(pool, cursoId) {
    const r = (await pool.query(
        `SELECT d.datos FROM aim_disenos d WHERE d.tipo = 'diploma' AND d.id = COALESCE(
            (SELECT diploma_diseno_id FROM aim_aula_cursos WHERE id = $1),
            (SELECT (valor->>'id')::int FROM aim_ajustes WHERE clave = '${CLAVE_DIPLOMA}'))`, [cursoId])).rows[0];
    return r?.datos || null;
}
