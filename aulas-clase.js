// ─────────────────────────────────────────────────────────────────────────────
// Aulas de clase: un «Classroom» para cada clase del club (tul_groups).
//
// Aparte del aula virtual (cursos online, aula.js). Aquí cada clase tiene su
// aula sola, sin apuntar a nadie: sus alumnos (y sus familias) por estar en la
// clase, y su profe por darla. Durante el curso se va publicando en un tablón:
//   · aviso     · material (archivos y enlaces)
//   · tarea     (con fecha de entrega; nota de 0 a 10 o «hecha / no hecha»)
//   · hoy       («Lo de hoy»: lo que se trabajó en la sesión; se escribe
//                 también desde Pasar lista, uno por clase y día)
// Todo va por temporada: al cambiarla, el aula empieza limpia y lo del curso
// anterior queda guardado para consultarlo.
//
// Quién: publica el profe que da la clase, secretaría y dirección, y el profe
// sustituto el día que la sustituye. Ven el aula y comentan los alumnos y sus
// familias; en las tareas, además, entregan y tienen comentarios privados con
// el profe (los ve el profe, la dirección y esa familia).
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import { mandaAlMenos } from './permisos.js';

export const MAX_ARCHIVO_AULA_CLASE = 10 * 1024 * 1024;
const TOPE_TOTAL = 1536 * 1024 * 1024;   // para todas las aulas de clase juntas
const TIPOS = ['aviso', 'material', 'tarea', 'hoy'];
const MIME_OK = /^(image\/(png|jpeg|gif|webp|heic|heif)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|ogg|webm|wav|x-m4a|aac)|application\/pdf|application\/msword|application\/vnd\.ms-(excel|powerpoint)|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|application\/vnd\.oasis\.opendocument\.(text|spreadsheet|presentation)|text\/(plain|csv)|application\/(zip|x-zip-compressed))$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOMBRE = (u) => `NULLIF(TRIM(CONCAT(${u}.name, ' ', COALESCE(${u}.surname, ''))), '')`;
const hoyMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

export async function crearTablasAulasClase(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aulaclase_temas (
            id SERIAL PRIMARY KEY,
            group_id UUID NOT NULL REFERENCES tul_groups(group_id) ON DELETE CASCADE,
            temporada_id INTEGER,
            nombre VARCHAR(120) NOT NULL,
            orden INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aulaclase_posts (
            id SERIAL PRIMARY KEY,
            group_id UUID NOT NULL REFERENCES tul_groups(group_id) ON DELETE CASCADE,
            temporada_id INTEGER,
            tipo VARCHAR(10) NOT NULL,
            titulo VARCHAR(200),
            texto TEXT,
            tema_id INTEGER REFERENCES aim_aulaclase_temas(id) ON DELETE SET NULL,
            enlaces JSONB NOT NULL DEFAULT '[]',
            fecha_clase DATE,
            entrega_at TIMESTAMPTZ,
            calificacion VARCHAR(6),
            autor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            publicar_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            editado_at TIMESTAMPTZ
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_aulaclase_posts_grupo ON aim_aulaclase_posts (group_id, temporada_id, publicar_at DESC)`);
    // «Lo de hoy»: uno por clase y día.
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_aulaclase_hoy ON aim_aulaclase_posts (group_id, fecha_clase) WHERE tipo = 'hoy'`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aulaclase_entregas (
            id SERIAL PRIMARY KEY,
            post_id INTEGER NOT NULL REFERENCES aim_aulaclase_posts(id) ON DELETE CASCADE,
            alumno_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            texto TEXT,
            entregada_at TIMESTAMPTZ,
            entregada_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            nota NUMERIC(4,1),
            hecha BOOLEAN,
            devuelta_at TIMESTAMPTZ,
            corregida_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            UNIQUE (post_id, alumno_id)
        )`);
    // Comentarios: públicos (alumno_id NULL) o privados de una tarea, entre el
    // profe y ese alumno (su familia).
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aulaclase_comentarios (
            id SERIAL PRIMARY KEY,
            post_id INTEGER NOT NULL REFERENCES aim_aulaclase_posts(id) ON DELETE CASCADE,
            alumno_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
            autor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            texto TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_aulaclase_coment_post ON aim_aulaclase_comentarios (post_id, alumno_id, id)`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aulaclase_archivos (
            id SERIAL PRIMARY KEY,
            post_id INTEGER REFERENCES aim_aulaclase_posts(id) ON DELETE CASCADE,
            entrega_id INTEGER REFERENCES aim_aulaclase_entregas(id) ON DELETE CASCADE,
            nombre VARCHAR(200) NOT NULL,
            mime VARCHAR(120) NOT NULL,
            bytes INTEGER NOT NULL,
            datos BYTEA NOT NULL,
            subido_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_aulaclase_archivos_post ON aim_aulaclase_archivos (post_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_aulaclase_archivos_entrega ON aim_aulaclase_archivos (entrega_id)`);
}

const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
const fallo = (res, err) => {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[aulas de clase]', err.message || err);
    res.status(500).json({ error: 'No se ha podido hacer. Inténtalo otra vez.' });
};
const txt = (v, max) => String(v ?? '').trim().slice(0, max);
// Los enlaces que se cuelgan en un material: solo http(s), con su título.
const limpiarEnlaces = (lista) => [].concat(lista || []).slice(0, 10).map(e => ({
    url: txt(typeof e === 'string' ? e : e?.url, 600), titulo: txt(typeof e === 'string' ? '' : e?.titulo, 160),
})).filter(e => /^https?:\/\/[^\s]+$/i.test(e.url));
const SQL_DA_CLASE = (col, param) => `EXISTS (SELECT 1 FROM tul_groups gg
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(gg.sessions::jsonb, '[]'::jsonb)) sess
    WHERE gg.group_id = ${col} AND (sess->>'instructorId' = ${param}
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(sess->'instructors', '[]'::jsonb)) d WHERE d->>'id' = ${param})))`;

export function crearAulasClase({ pool, clubId, authenticateSession, permisos, familiaIds, gruposDe, avisarFamilias = () => {}, achicarFoto = null }) {
    const router = express.Router();
    const yoDe = (req) => req.userSession.userId;
    const gestiona = (req) => !!req.userSession?.canAccessAdmin && !permisos(req)?.soloSusGrupos && mandaAlMenos(req.userSession?.rol, 'secretaria');
    const idDe = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) corta(400, 'Falta cuál.'); return n; };

    async function temporadaActiva() {
        return (await pool.query(`SELECT id FROM aim_temporadas WHERE activa ORDER BY id DESC LIMIT 1`).catch(() => ({ rows: [] }))).rows[0]?.id ?? null;
    }
    // Los alumnos de una clase en una temporada: los de ahora o, de una pasada, los del histórico.
    async function alumnosDe(groupId, temporadaId, activa) {
        const r = temporadaId == null || temporadaId === activa
            ? await pool.query(`SELECT u.user_id AS id, COALESCE(${NOMBRE('u')}, u.email) AS nombre FROM tul_group_students gs JOIN users u ON u.user_id = gs.student_id WHERE gs.group_id = $1 ORDER BY u.name, u.surname`, [groupId])
            : await pool.query(`SELECT u.user_id AS id, COALESCE(${NOMBRE('u')}, u.email) AS nombre FROM tul_group_students_historico h JOIN users u ON u.user_id = h.student_id WHERE h.group_id = $1 AND h.temporada_id = $2 ORDER BY u.name, u.surname`, [groupId, temporadaId]);
        return r.rows.map(x => ({ id: String(x.id), nombre: x.nombre }));
    }

    // Quién es esta persona en el aula de esta clase. ambito 'familia': como
    // familia (aunque sea del personal); si no, como personal.
    async function acceso(req, groupId, { temporadaId = undefined, familia = false } = {}) {
        if (!UUID.test(String(groupId || ''))) corta(404, 'Esa clase no existe.');
        const g = (await pool.query(
            `SELECT g.group_id, g.name, g.time, g.sessions, a.name AS actividad, a.activity_id
             FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id WHERE g.group_id = $1 AND a.club_id = $2`, [groupId, clubId])).rows[0];
        if (!g) corta(404, 'Esa clase no existe.');
        const activa = await temporadaActiva();
        const temporada = temporadaId === undefined || temporadaId === null ? activa : temporadaId;
        const yo = String(yoDe(req));
        const alumnos = await alumnosDe(groupId, temporada, activa);
        if (!familia && req.userSession?.canAccessAdmin) {
            if (gestiona(req)) return { g, temporada, activa, alumnos, rol: 'gestion', puedePublicar: true, mios: [] };
            const suyas = (await gruposDe(yo)).map(String);
            if (suyas.includes(String(groupId))) {
                const daClase = (await pool.query(`SELECT ${SQL_DA_CLASE('$1::uuid', '$2')} AS si`, [groupId, yo])).rows[0].si;
                const sustituyeHoy = !daClase && (await pool.query(`SELECT 1 FROM aim_sustituciones WHERE group_id = $1 AND sustituto_id = $2 AND fecha = $3::date`, [groupId, yo, hoyMadrid()]).catch(() => ({ rowCount: 0 }))).rowCount > 0;
                return { g, temporada, activa, alumnos, rol: 'profe', puedePublicar: daClase || sustituyeHoy, sustituto: !daClase, mios: [] };
            }
        }
        // Como familia: los suyos que están (o estuvieron) en la clase.
        const fam = (await familiaIds(yo)).map(String);
        const mios = alumnos.filter(a => fam.includes(a.id));
        if (!mios.length) corta(404, 'Esa clase no es de tu familia.');
        return { g, temporada, activa, alumnos, rol: 'familia', puedePublicar: false, mios };
    }
    const esPersonal = (a) => a.rol === 'gestion' || a.rol === 'profe';
    // Las ids de las personas a avisar de algo de la clase (sus alumnos; avisarFamilias llega a sus familias).
    const avisarClase = (a) => { const ids = a.alumnos.map(x => x.id); if (ids.length) avisarFamilias(ids); };

    async function postDe(id) {
        const p = (await pool.query(`SELECT * FROM aim_aulaclase_posts WHERE id = $1`, [idDe(id)])).rows[0];
        if (!p) corta(404, 'Esa publicación ya no está.');
        return p;
    }
    // El post, si quien pregunta puede verlo (las programadas, solo el personal).
    async function postConAcceso(req, id, familia) {
        const p = await postDe(id);
        const a = await acceso(req, p.group_id, { temporadaId: p.temporada_id, familia });
        if (!esPersonal(a) && new Date(p.publicar_at) > new Date()) corta(404, 'Esa publicación ya no está.');
        return { p, a };
    }
    const puedeCambiar = (req, a, p) => a.rol === 'gestion' || (a.rol === 'profe' && (String(p.autor_id) === String(yoDe(req)) || a.puedePublicar));

    // ── Las clases ──
    // Las del personal: dirección y secretaría, todas; un profe, las suyas (y las que sustituye).
    router.get('/api/aulas-clase', authenticateSession, async (req, res) => {
        try {
            if (!req.userSession?.canAccessAdmin) corta(403, 'Solo para el personal.');
            const activa = await temporadaActiva();
            const todas = gestiona(req);
            const ids = todas ? null : (await gruposDe(String(yoDe(req)))).map(String);
            const r = await pool.query(
                `SELECT g.group_id AS id, g.name AS nombre, g.time AS horario, a.name AS actividad, a.activity_id,
                        (SELECT COUNT(*)::int FROM tul_group_students gs WHERE gs.group_id = g.group_id) AS alumnos,
                        (SELECT COUNT(*)::int FROM aim_aulaclase_posts p WHERE p.group_id = g.group_id AND p.temporada_id IS NOT DISTINCT FROM $2) AS publicaciones,
                        (SELECT MAX(p.publicar_at) FROM aim_aulaclase_posts p WHERE p.group_id = g.group_id AND p.temporada_id IS NOT DISTINCT FROM $2 AND p.publicar_at <= NOW()) AS ultima,
                        (SELECT COUNT(*)::int FROM aim_aulaclase_entregas e JOIN aim_aulaclase_posts p ON p.id = e.post_id
                          WHERE p.group_id = g.group_id AND p.temporada_id IS NOT DISTINCT FROM $2 AND e.entregada_at IS NOT NULL AND e.devuelta_at IS NULL) AS por_corregir
                 FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE a.club_id = $1 ${ids ? 'AND g.group_id::text = ANY($3::text[])' : ''}
                 ORDER BY a.name, g.name`, ids ? [clubId, activa, ids] : [clubId, activa]);
            res.set('Cache-Control', 'no-store');
            res.json({ clases: r.rows, todas });
        } catch (err) { fallo(res, err); }
    });
    // Las de la familia (para su área).
    router.get('/api/aulas-clase/familia', authenticateSession, async (req, res) => {
        try {
            const fam = (await familiaIds(String(yoDe(req)))).map(String);
            const r = await pool.query(
                `SELECT g.group_id AS id, g.name AS nombre, a.name AS actividad, gs.student_id AS alumno_id, COALESCE(${NOMBRE('u')}, u.email) AS alumno
                 FROM tul_group_students gs JOIN tul_groups g ON g.group_id = gs.group_id JOIN tul_activities a ON a.activity_id = g.activity_id
                 JOIN users u ON u.user_id = gs.student_id
                 WHERE gs.student_id::text = ANY($1::text[]) AND a.club_id = $2 ORDER BY a.name, g.name`, [fam, clubId]);
            res.set('Cache-Control', 'no-store');
            res.json({ clases: r.rows });
        } catch (err) { fallo(res, err); }
    });

    // ── El aula de una clase: el tablón entero de una temporada ──
    router.get('/api/aulas-clase/:groupId', authenticateSession, async (req, res) => {
        try {
            const familia = req.query.ambito === 'familia';
            const tq = req.query.temporada !== undefined && req.query.temporada !== '' ? Number(req.query.temporada) : undefined;
            const a = await acceso(req, req.params.groupId, { temporadaId: Number.isInteger(tq) ? tq : undefined, familia });
            const yo = String(yoDe(req)), personal = esPersonal(a);
            const tempo = a.temporada;
            const temporadas = (await pool.query(
                `SELECT t.id, t.nombre, t.activa FROM aim_temporadas t
                 WHERE t.activa OR EXISTS (SELECT 1 FROM aim_aulaclase_posts p WHERE p.group_id = $1 AND p.temporada_id = t.id) ORDER BY t.id DESC`, [a.g.group_id]).catch(() => ({ rows: [] }))).rows;
            const temas = (await pool.query(`SELECT id, nombre, orden FROM aim_aulaclase_temas WHERE group_id = $1 AND temporada_id IS NOT DISTINCT FROM $2 ORDER BY orden, id`, [a.g.group_id, tempo])).rows;
            const posts = (await pool.query(
                `SELECT p.*, ${NOMBRE('u')} AS autor, (p.publicar_at > NOW()) AS programado,
                        (SELECT json_agg(json_build_object('id', f.id, 'nombre', f.nombre, 'mime', f.mime, 'bytes', f.bytes) ORDER BY f.id) FROM aim_aulaclase_archivos f WHERE f.post_id = p.id) AS archivos,
                        (SELECT COUNT(*)::int FROM aim_aulaclase_comentarios c WHERE c.post_id = p.id AND c.alumno_id IS NULL) AS n_comentarios
                 FROM aim_aulaclase_posts p LEFT JOIN users u ON u.user_id = p.autor_id
                 WHERE p.group_id = $1 AND p.temporada_id IS NOT DISTINCT FROM $2 ${personal ? '' : 'AND p.publicar_at <= NOW()'}
                 ORDER BY CASE WHEN p.tipo = 'hoy' THEN p.fecha_clase::timestamptz + INTERVAL '23 hours' ELSE p.publicar_at END DESC, p.id DESC LIMIT 400`, [a.g.group_id, tempo])).rows;
            const ids = posts.map(p => p.id);
            // Los comentarios públicos (los últimos 30 de cada uno).
            const coms = ids.length ? (await pool.query(
                `SELECT * FROM (SELECT c.id, c.post_id, c.texto, c.created_at, c.autor_id, ${NOMBRE('u')} AS autor,
                        ROW_NUMBER() OVER (PARTITION BY c.post_id ORDER BY c.id DESC) AS rn
                   FROM aim_aulaclase_comentarios c LEFT JOIN users u ON u.user_id = c.autor_id
                   WHERE c.post_id = ANY($1::int[]) AND c.alumno_id IS NULL) x WHERE rn <= 30 ORDER BY id`, [ids])).rows : [];
            // Las entregas: el personal, cuántas; la familia, las de los suyos.
            const tareas = posts.filter(p => p.tipo === 'tarea').map(p => p.id);
            const ent = tareas.length ? (await pool.query(
                `SELECT e.post_id, e.alumno_id, e.entregada_at, e.nota, e.hecha, e.devuelta_at,
                        (SELECT COUNT(*)::int FROM aim_aulaclase_comentarios c WHERE c.post_id = e.post_id AND c.alumno_id = e.alumno_id) AS privados
                 FROM aim_aulaclase_entregas e WHERE e.post_id = ANY($1::int[])`, [tareas])).rows : [];
            const misIds = a.mios.map(m => m.id);
            const privadosFam = tareas.length && misIds.length ? (await pool.query(
                `SELECT post_id, alumno_id, COUNT(*)::int AS n FROM aim_aulaclase_comentarios WHERE post_id = ANY($1::int[]) AND alumno_id::text = ANY($2::text[]) GROUP BY post_id, alumno_id`, [tareas, misIds])).rows : [];
            const total = a.alumnos.length;
            res.set('Cache-Control', 'no-store');
            res.json({
                clase: { id: a.g.group_id, nombre: a.g.name, actividad: a.g.actividad, horario: a.g.time || '', alumnos: total,
                    profes: [...new Set((Array.isArray(a.g.sessions) ? a.g.sessions : []).flatMap(s => [s?.instructorName, ...(Array.isArray(s?.instructors) ? s.instructors.map(d => d?.name) : [])]).filter(Boolean))] },
                yo: { id: yo, rol: a.rol, puedePublicar: a.puedePublicar && tempo === a.activa, sustituto: !!a.sustituto, alumnos: a.mios },
                temporada: tempo, activa: a.activa, temporadas,
                temas,
                alumnos: personal ? a.alumnos : [],
                posts: posts.map(p => {
                    const deEsta = ent.filter(e => e.post_id === p.id);
                    return {
                        id: p.id, tipo: p.tipo, titulo: p.titulo || '', texto: p.texto || '', temaId: p.tema_id, enlaces: p.enlaces || [],
                        fechaClase: p.fecha_clase ? String(p.fecha_clase instanceof Date ? p.fecha_clase.toISOString().slice(0, 10) : p.fecha_clase).slice(0, 10) : null,
                        entregaAt: p.entrega_at, calificacion: p.calificacion, autorId: p.autor_id, autor: p.autor || 'Alguien que ya no está',
                        fecha: p.publicar_at, programado: p.programado, editado: !!p.editado_at,
                        archivos: (p.archivos || []).map(f => ({ ...f, url: `/api/aulas-clase/archivo/${f.id}` })),
                        comentarios: coms.filter(c => c.post_id === p.id).map(c => ({ id: c.id, texto: c.texto, fecha: c.created_at, autor: c.autor || 'Alguien', autorId: c.autor_id, mio: String(c.autor_id) === yo })),
                        nComentarios: p.n_comentarios,
                        puedeCambiar: puedeCambiar(req, a, p) && tempo === a.activa,
                        ...(p.tipo === 'tarea' ? personal
                            ? { entregas: { entregadas: deEsta.filter(e => e.entregada_at).length, corregidas: deEsta.filter(e => e.devuelta_at).length, total } }
                            : { mias: a.mios.map(m => { const e = deEsta.find(x => String(x.alumno_id) === m.id); return { alumnoId: m.id, alumno: m.nombre, entregada: e?.entregada_at || null, nota: e?.nota != null ? Number(e.nota) : null, hecha: e?.hecha ?? null, devuelta: e?.devuelta_at || null, privados: privadosFam.find(x => x.post_id === p.id && String(x.alumno_id) === m.id)?.n || 0 }; }) }
                            : {}),
                    };
                }),
            });
        } catch (err) { fallo(res, err); }
    });

    // ── Publicar, cambiar y quitar ──
    function datosPost(b, { tipo }) {
        const titulo = txt(b.titulo, 200) || null;
        const texto = txt(b.texto, 20000) || null;
        if (tipo === 'tarea' && !titulo) corta(400, 'Ponle título a la tarea.');
        if (tipo !== 'material' && tipo !== 'tarea' && !texto) corta(400, 'Escribe algo.');
        if ((tipo === 'material' || tipo === 'tarea') && !texto && !titulo) corta(400, 'Escribe algo.');
        const entregaAt = tipo === 'tarea' && b.entregaAt ? new Date(b.entregaAt) : null;
        if (entregaAt && Number.isNaN(entregaAt.getTime())) corta(400, 'La fecha de entrega no se entiende.');
        const calificacion = tipo === 'tarea' ? (b.calificacion === 'hecha' ? 'hecha' : 'nota') : null;
        return { titulo, texto, entregaAt, calificacion, enlaces: limpiarEnlaces(b.enlaces) };
    }
    async function temaValido(groupId, temporada, v) {
        if (!v) return null;
        const r = await pool.query(`SELECT id FROM aim_aulaclase_temas WHERE id = $1 AND group_id = $2 AND temporada_id IS NOT DISTINCT FROM $3`, [Number(v) || 0, groupId, temporada]);
        return r.rows[0]?.id || null;
    }
    router.post('/api/aulas-clase/:groupId/posts', authenticateSession, express.json({ limit: '200kb' }), async (req, res) => {
        try {
            const a = await acceso(req, req.params.groupId);
            if (!a.puedePublicar || a.temporada !== a.activa) corta(403, a.rol === 'profe' && a.sustituto ? 'Como sustituto, solo puedes publicar el día que das la clase.' : 'No puedes publicar en esta clase.');
            const b = req.body || {};
            const tipo = TIPOS.includes(b.tipo) ? b.tipo : corta(400, 'Qué es no se entiende.');
            const d = datosPost(b, { tipo });
            const tema = await temaValido(a.g.group_id, a.temporada, b.temaId);
            const publicarAt = b.publicarAt ? new Date(b.publicarAt) : null;
            if (publicarAt && Number.isNaN(publicarAt.getTime())) corta(400, 'La fecha para publicarlo no se entiende.');
            let fechaClase = null;
            if (tipo === 'hoy') {
                fechaClase = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fechaClase || '')) ? b.fechaClase : hoyMadrid();
                const ya = (await pool.query(`SELECT id FROM aim_aulaclase_posts WHERE group_id = $1 AND fecha_clase = $2::date AND tipo = 'hoy'`, [a.g.group_id, fechaClase])).rows[0];
                if (ya) {
                    await pool.query(`UPDATE aim_aulaclase_posts SET texto = $2, tema_id = COALESCE($3, tema_id), editado_at = NOW() WHERE id = $1`, [ya.id, d.texto, tema]);
                    return res.json({ id: ya.id, actualizado: true });
                }
            }
            const r = await pool.query(
                `INSERT INTO aim_aulaclase_posts (group_id, temporada_id, tipo, titulo, texto, tema_id, enlaces, fecha_clase, entrega_at, calificacion, autor_id, publicar_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, COALESCE($12, NOW())) RETURNING id`,
                [a.g.group_id, a.temporada, tipo, d.titulo, d.texto, tema, JSON.stringify(d.enlaces), fechaClase, d.entregaAt, d.calificacion, yoDe(req), publicarAt]);
            if (!publicarAt || publicarAt <= new Date()) avisarClase(a);
            res.status(201).json({ id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.patch('/api/aulas-clase/posts/:id', authenticateSession, express.json({ limit: '200kb' }), async (req, res) => {
        try {
            const { p, a } = await postConAcceso(req, req.params.id, false);
            if (!esPersonal(a) || !puedeCambiar(req, a, p)) corta(403, 'No puedes cambiar esta publicación.');
            const b = req.body || {};
            const d = datosPost({ titulo: b.titulo ?? p.titulo, texto: b.texto ?? p.texto, entregaAt: b.entregaAt !== undefined ? b.entregaAt : p.entrega_at, calificacion: b.calificacion ?? p.calificacion, enlaces: b.enlaces ?? p.enlaces }, { tipo: p.tipo });
            const tema = b.temaId !== undefined ? await temaValido(p.group_id, p.temporada_id, b.temaId) : p.tema_id;
            const publicarAt = b.publicarAt !== undefined ? (b.publicarAt ? new Date(b.publicarAt) : new Date()) : null;
            await pool.query(
                `UPDATE aim_aulaclase_posts SET titulo = $2, texto = $3, entrega_at = $4, calificacion = $5, enlaces = $6::jsonb, tema_id = $7,
                        publicar_at = COALESCE($8, publicar_at), editado_at = NOW() WHERE id = $1`,
                [p.id, d.titulo, d.texto, d.entregaAt, d.calificacion, JSON.stringify(d.enlaces), tema, publicarAt]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/aulas-clase/posts/:id', authenticateSession, async (req, res) => {
        try {
            const { p, a } = await postConAcceso(req, req.params.id, false);
            if (!esPersonal(a) || !puedeCambiar(req, a, p)) corta(403, 'No puedes quitar esta publicación.');
            await pool.query(`DELETE FROM aim_aulaclase_posts WHERE id = $1`, [p.id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // ── «Lo de hoy» desde Pasar lista ──
    router.get('/api/aulas-clase/:groupId/hoy/:fecha', authenticateSession, async (req, res) => {
        try {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.fecha)) corta(400, 'Fecha no válida.');
            const a = await acceso(req, req.params.groupId);
            if (!esPersonal(a)) corta(403, 'Solo para el personal.');
            const r = (await pool.query(`SELECT id, texto, autor_id FROM aim_aulaclase_posts WHERE group_id = $1 AND fecha_clase = $2::date AND tipo = 'hoy'`, [a.g.group_id, req.params.fecha])).rows[0];
            res.set('Cache-Control', 'no-store');
            res.json({ texto: r?.texto || '', id: r?.id || null });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/aulas-clase/:groupId/hoy/:fecha', authenticateSession, express.json(), async (req, res) => {
        try {
            const fecha = req.params.fecha;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) corta(400, 'Fecha no válida.');
            if (fecha > hoyMadrid()) corta(400, 'Lo de hoy se escribe el día de la clase o después.');
            const a = await acceso(req, req.params.groupId);
            // Quien pasa lista (también el sustituto de ese día) puede contarlo.
            const pasaLista = a.rol === 'gestion' || a.rol === 'profe';
            if (!pasaLista || a.temporada !== a.activa) corta(403, 'No puedes escribir en esta clase.');
            const texto = txt(req.body?.texto, 4000);
            const ya = (await pool.query(`SELECT id FROM aim_aulaclase_posts WHERE group_id = $1 AND fecha_clase = $2::date AND tipo = 'hoy'`, [a.g.group_id, fecha])).rows[0];
            if (!texto) {
                if (ya) await pool.query(`DELETE FROM aim_aulaclase_posts WHERE id = $1`, [ya.id]);
                return res.json({ success: true, quitado: !!ya });
            }
            if (ya) await pool.query(`UPDATE aim_aulaclase_posts SET texto = $2, editado_at = NOW() WHERE id = $1`, [ya.id, texto]);
            else {
                await pool.query(`INSERT INTO aim_aulaclase_posts (group_id, temporada_id, tipo, texto, fecha_clase, autor_id) VALUES ($1, $2, 'hoy', $3, $4::date, $5)`,
                    [a.g.group_id, a.temporada, texto, fecha, yoDe(req)]);
                avisarClase(a);
            }
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // ── Temas ──
    router.post('/api/aulas-clase/:groupId/temas', authenticateSession, express.json(), async (req, res) => {
        try {
            const a = await acceso(req, req.params.groupId);
            if (!esPersonal(a) || a.temporada !== a.activa) corta(403, 'Los temas los pone el profe.');
            const nombre = txt(req.body?.nombre, 120);
            if (!nombre) corta(400, 'Ponle nombre al tema.');
            const orden = (await pool.query(`SELECT COALESCE(MAX(orden), 0) + 1 AS o FROM aim_aulaclase_temas WHERE group_id = $1 AND temporada_id IS NOT DISTINCT FROM $2`, [a.g.group_id, a.temporada])).rows[0].o;
            const r = await pool.query(`INSERT INTO aim_aulaclase_temas (group_id, temporada_id, nombre, orden) VALUES ($1, $2, $3, $4) RETURNING id`, [a.g.group_id, a.temporada, nombre, orden]);
            res.status(201).json({ id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.patch('/api/aulas-clase/temas/:id', authenticateSession, express.json(), async (req, res) => {
        try {
            const t = (await pool.query(`SELECT * FROM aim_aulaclase_temas WHERE id = $1`, [idDe(req.params.id)])).rows[0];
            if (!t) corta(404, 'Ese tema ya no está.');
            const a = await acceso(req, t.group_id, { temporadaId: t.temporada_id });
            if (!esPersonal(a)) corta(403, 'Los temas los pone el profe.');
            const nombre = txt(req.body?.nombre, 120);
            if (nombre) await pool.query(`UPDATE aim_aulaclase_temas SET nombre = $2 WHERE id = $1`, [t.id, nombre]);
            if (Number.isInteger(req.body?.orden)) await pool.query(`UPDATE aim_aulaclase_temas SET orden = $2 WHERE id = $1`, [t.id, req.body.orden]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/aulas-clase/temas/:id', authenticateSession, async (req, res) => {
        try {
            const t = (await pool.query(`SELECT * FROM aim_aulaclase_temas WHERE id = $1`, [idDe(req.params.id)])).rows[0];
            if (!t) corta(404, 'Ese tema ya no está.');
            const a = await acceso(req, t.group_id, { temporadaId: t.temporada_id });
            if (!esPersonal(a)) corta(403, 'Los temas los pone el profe.');
            await pool.query(`DELETE FROM aim_aulaclase_temas WHERE id = $1`, [t.id]);   // lo suyo se queda sin tema
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // ── Comentarios ──
    // Públicos (cualquiera de la clase) o privados de una tarea (alumnoId): entre
    // el profe y ese alumno o su familia.
    router.get('/api/aulas-clase/posts/:id/privados/:alumnoId', authenticateSession, async (req, res) => {
        try {
            const { p, a } = await postConAcceso(req, req.params.id, req.query.ambito === 'familia');
            const alumno = String(req.params.alumnoId);
            if (!esPersonal(a) && !a.mios.some(m => m.id === alumno)) corta(404, 'No está.');
            const r = await pool.query(
                `SELECT c.id, c.texto, c.created_at, c.autor_id, ${NOMBRE('u')} AS autor FROM aim_aulaclase_comentarios c LEFT JOIN users u ON u.user_id = c.autor_id
                 WHERE c.post_id = $1 AND c.alumno_id = $2 ORDER BY c.id`, [p.id, alumno]);
            res.set('Cache-Control', 'no-store');
            res.json({ comentarios: r.rows.map(c => ({ id: c.id, texto: c.texto, fecha: c.created_at, autor: c.autor || 'Alguien', mio: String(c.autor_id) === String(yoDe(req)) })) });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/aulas-clase/posts/:id/comentarios', authenticateSession, express.json(), async (req, res) => {
        try {
            const familia = req.body?.ambito === 'familia';
            const { p, a } = await postConAcceso(req, req.params.id, familia);
            if (a.temporada !== a.activa) corta(403, 'Esta clase es de otra temporada: ya no se comenta.');
            const texto = txt(req.body?.texto, 4000);
            if (!texto) corta(400, 'Escribe algo.');
            let alumno = req.body?.alumnoId ? String(req.body.alumnoId) : null;
            if (alumno) {
                if (p.tipo !== 'tarea') corta(400, 'Los comentarios privados son de las tareas.');
                if (esPersonal(a) ? !a.alumnos.some(x => x.id === alumno) : !a.mios.some(m => m.id === alumno)) corta(403, 'Ese alumno no es de esta clase.');
            }
            const r = await pool.query(`INSERT INTO aim_aulaclase_comentarios (post_id, alumno_id, autor_id, texto) VALUES ($1, $2, $3, $4) RETURNING id, created_at`, [p.id, alumno, yoDe(req), texto]);
            // Un privado del profe, a esa familia; uno público, a la clase.
            if (alumno && esPersonal(a)) avisarFamilias([alumno]);
            res.status(201).json({ id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/aulas-clase/comentarios/:id', authenticateSession, async (req, res) => {
        try {
            const c = (await pool.query(`SELECT c.*, p.group_id, p.temporada_id FROM aim_aulaclase_comentarios c JOIN aim_aulaclase_posts p ON p.id = c.post_id WHERE c.id = $1`, [idDe(req.params.id)])).rows[0];
            if (!c) corta(404, 'Ese comentario ya no está.');
            const a = await acceso(req, c.group_id, { temporadaId: c.temporada_id, familia: req.query.ambito === 'familia' });
            if (String(c.autor_id) !== String(yoDe(req)) && !esPersonal(a)) corta(403, 'Solo puedes quitar lo tuyo.');
            await pool.query(`DELETE FROM aim_aulaclase_comentarios WHERE id = $1`, [c.id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // ── Entregas y notas ──
    const mapEntrega = (e) => ({
        id: e.id, alumnoId: String(e.alumno_id), texto: e.texto || '', entregada: e.entregada_at, nota: e.nota != null ? Number(e.nota) : null,
        hecha: e.hecha, devuelta: e.devuelta_at, archivos: (e.archivos || []).map(f => ({ ...f, url: `/api/aulas-clase/archivo/${f.id}` })),
    });
    const SEL_ENTREGA = `e.*, (SELECT json_agg(json_build_object('id', f.id, 'nombre', f.nombre, 'mime', f.mime, 'bytes', f.bytes) ORDER BY f.id) FROM aim_aulaclase_archivos f WHERE f.entrega_id = e.id) AS archivos`;
    // La tarea, con las entregas: el personal, de todos; la familia, de los suyos.
    router.get('/api/aulas-clase/posts/:id/entregas', authenticateSession, async (req, res) => {
        try {
            const { p, a } = await postConAcceso(req, req.params.id, req.query.ambito === 'familia');
            if (p.tipo !== 'tarea') corta(400, 'No es una tarea.');
            const quienes = esPersonal(a) ? a.alumnos : a.mios;
            const r = await pool.query(`SELECT ${SEL_ENTREGA} FROM aim_aulaclase_entregas e WHERE e.post_id = $1`, [p.id]);
            const priv = (await pool.query(`SELECT alumno_id, COUNT(*)::int AS n, MAX(created_at) AS ultimo FROM aim_aulaclase_comentarios WHERE post_id = $1 AND alumno_id IS NOT NULL GROUP BY alumno_id`, [p.id])).rows;
            res.set('Cache-Control', 'no-store');
            res.json({
                tarea: { id: p.id, titulo: p.titulo, texto: p.texto, entregaAt: p.entrega_at, calificacion: p.calificacion },
                alumnos: quienes.map(al => {
                    const e = r.rows.find(x => String(x.alumno_id) === al.id);
                    return { id: al.id, nombre: al.nombre, entrega: e ? mapEntrega(e) : null, privados: priv.find(x => String(x.alumno_id) === al.id)?.n || 0 };
                }),
                puedeCorregir: esPersonal(a) && a.temporada === a.activa,
            });
        } catch (err) { fallo(res, err); }
    });
    // Entregar (o cambiar la entrega mientras no esté corregida). La familia o el alumno.
    router.post('/api/aulas-clase/posts/:id/entrega', authenticateSession, express.json({ limit: '200kb' }), async (req, res) => {
        try {
            const { p, a } = await postConAcceso(req, req.params.id, true);
            if (p.tipo !== 'tarea') corta(400, 'No es una tarea.');
            if (a.temporada !== a.activa) corta(403, 'Esta tarea es de otra temporada.');
            const alumno = String(req.body?.alumnoId || a.mios[0]?.id || '');
            if (!a.mios.some(m => m.id === alumno)) corta(403, 'Ese alumno no es de tu familia.');
            const ya = (await pool.query(`SELECT * FROM aim_aulaclase_entregas WHERE post_id = $1 AND alumno_id = $2`, [p.id, alumno])).rows[0];
            if (ya?.devuelta_at) corta(409, 'Esta tarea ya está corregida: no se puede cambiar la entrega.');
            const deshacer = req.body?.deshacer === true;
            const texto = txt(req.body?.texto, 20000) || null;
            const r = await pool.query(
                `INSERT INTO aim_aulaclase_entregas (post_id, alumno_id, texto, entregada_at, entregada_por) VALUES ($1, $2, $3, ${deshacer ? 'NULL' : 'NOW()'}, $4)
                 ON CONFLICT (post_id, alumno_id) DO UPDATE SET texto = EXCLUDED.texto, entregada_at = EXCLUDED.entregada_at, entregada_por = EXCLUDED.entregada_por RETURNING id`,
                [p.id, alumno, texto, yoDe(req)]);
            res.json({ id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    // Corregir y devolver: nota (0-10) o hecha / no hecha. También sin entrega
    // (lo que se hizo en clase). Con devolver:false, se guarda sin devolverla.
    router.post('/api/aulas-clase/posts/:id/corregir', authenticateSession, express.json(), async (req, res) => {
        try {
            const { p, a } = await postConAcceso(req, req.params.id, false);
            if (p.tipo !== 'tarea') corta(400, 'No es una tarea.');
            if (!esPersonal(a) || a.temporada !== a.activa) corta(403, 'Corrige el profe de la clase.');
            const alumno = String(req.body?.alumnoId || '');
            if (!a.alumnos.some(x => x.id === alumno)) corta(400, 'Ese alumno no es de esta clase.');
            let nota = null, hecha = null;
            if (p.calificacion === 'hecha') {
                if (typeof req.body?.hecha !== 'boolean' && req.body?.hecha !== null) corta(400, 'Di si está hecha o no.');
                hecha = req.body.hecha;
            } else if (req.body?.nota !== null && req.body?.nota !== undefined && req.body?.nota !== '') {
                nota = Math.round(Number(String(req.body.nota).replace(',', '.')) * 10) / 10;
                if (!Number.isFinite(nota) || nota < 0 || nota > 10) corta(400, 'La nota va de 0 a 10.');
            }
            const devolver = req.body?.devolver !== false && (nota !== null || hecha !== null);
            await pool.query(
                `INSERT INTO aim_aulaclase_entregas (post_id, alumno_id, nota, hecha, devuelta_at, corregida_por) VALUES ($1, $2, $3, $4, ${devolver ? 'NOW()' : 'NULL'}, $5)
                 ON CONFLICT (post_id, alumno_id) DO UPDATE SET nota = EXCLUDED.nota, hecha = EXCLUDED.hecha, devuelta_at = EXCLUDED.devuelta_at, corregida_por = EXCLUDED.corregida_por`,
                [p.id, alumno, nota, hecha, yoDe(req)]);
            if (devolver) avisarFamilias([alumno]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Todas las tareas con las notas de cada alumno (el personal).
    router.get('/api/aulas-clase/:groupId/notas', authenticateSession, async (req, res) => {
        try {
            const tq = req.query.temporada !== undefined && req.query.temporada !== '' ? Number(req.query.temporada) : undefined;
            const a = await acceso(req, req.params.groupId, { temporadaId: Number.isInteger(tq) ? tq : undefined });
            if (!esPersonal(a)) corta(403, 'Solo para el personal.');
            const tareas = (await pool.query(`SELECT id, titulo, entrega_at, calificacion FROM aim_aulaclase_posts WHERE group_id = $1 AND temporada_id IS NOT DISTINCT FROM $2 AND tipo = 'tarea' ORDER BY COALESCE(entrega_at, publicar_at), id`, [a.g.group_id, a.temporada])).rows;
            const ent = tareas.length ? (await pool.query(`SELECT post_id, alumno_id, entregada_at, nota, hecha, devuelta_at FROM aim_aulaclase_entregas WHERE post_id = ANY($1::int[])`, [tareas.map(t => t.id)])).rows : [];
            res.set('Cache-Control', 'no-store');
            res.json({
                tareas: tareas.map(t => ({ id: t.id, titulo: t.titulo, entregaAt: t.entrega_at, calificacion: t.calificacion })),
                alumnos: a.alumnos.map(al => ({ ...al, notas: Object.fromEntries(ent.filter(e => String(e.alumno_id) === al.id).map(e => [e.post_id, { entregada: e.entregada_at, nota: e.nota != null ? Number(e.nota) : null, hecha: e.hecha, devuelta: e.devuelta_at }])) })),
            });
        } catch (err) { fallo(res, err); }
    });

    // ── Archivos (de una publicación o de una entrega) ──
    async function guardarArchivo(req, { postId = null, entregaId = null }) {
        const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        let datos = Buffer.isBuffer(req.body) ? req.body : null;
        if (!datos?.length) corta(400, 'No ha llegado el archivo.');
        if (!MIME_OK.test(mime)) corta(400, 'Ese tipo de archivo no se puede subir: imágenes, vídeos cortos, audio, PDF, Word, Excel, PowerPoint, texto o zip.');
        if (datos.length > MAX_ARCHIVO_AULA_CLASE) corta(413, 'El archivo pasa de 10 MB. Los vídeos largos, mejor por enlace (YouTube).');
        let nombre = txt(req.query.nombre, 200).replace(/[\r\n"\\/]/g, '') || 'archivo';
        let tipo = mime;
        if (achicarFoto) { const f = await achicarFoto(datos, mime, nombre); datos = f.datos; tipo = f.mime; nombre = f.nombre; }
        const usado = Number((await pool.query(`SELECT COALESCE(SUM(bytes), 0)::bigint AS b FROM aim_aulaclase_archivos`)).rows[0].b);
        if (usado + datos.length > TOPE_TOTAL) corta(507, 'Las aulas de clase se han quedado sin sitio para archivos. Quita alguno viejo o usa enlaces.');
        const r = await pool.query(`INSERT INTO aim_aulaclase_archivos (post_id, entrega_id, nombre, mime, bytes, datos, subido_por) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, nombre, mime, bytes`,
            [postId, entregaId, nombre, tipo, datos.length, datos, yoDe(req)]);
        return { ...r.rows[0], url: `/api/aulas-clase/archivo/${r.rows[0].id}` };
    }
    const crudo = express.raw({ type: () => true, limit: '11mb' });
    router.post('/api/aulas-clase/posts/:id/archivos', authenticateSession, crudo, async (req, res) => {
        try {
            const { p, a } = await postConAcceso(req, req.params.id, false);
            if (!esPersonal(a) || !puedeCambiar(req, a, p)) corta(403, 'No puedes cambiar esta publicación.');
            res.status(201).json({ archivo: await guardarArchivo(req, { postId: p.id }) });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/aulas-clase/posts/:id/entrega/archivos', authenticateSession, crudo, async (req, res) => {
        try {
            const { p, a } = await postConAcceso(req, req.params.id, true);
            if (p.tipo !== 'tarea' || a.temporada !== a.activa) corta(400, 'Aquí no se puede entregar.');
            const alumno = String(req.query.alumnoId || a.mios[0]?.id || '');
            if (!a.mios.some(m => m.id === alumno)) corta(403, 'Ese alumno no es de tu familia.');
            const ya = (await pool.query(`SELECT * FROM aim_aulaclase_entregas WHERE post_id = $1 AND alumno_id = $2`, [p.id, alumno])).rows[0];
            if (ya?.devuelta_at) corta(409, 'Esta tarea ya está corregida.');
            const e = ya || (await pool.query(`INSERT INTO aim_aulaclase_entregas (post_id, alumno_id) VALUES ($1, $2) RETURNING *`, [p.id, alumno])).rows[0];
            res.status(201).json({ archivo: await guardarArchivo(req, { entregaId: e.id }) });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/aulas-clase/archivos/:id', authenticateSession, async (req, res) => {
        try {
            const f = (await pool.query(
                `SELECT f.id, f.post_id, f.entrega_id, COALESCE(p.id, pe.id) AS pid, e.alumno_id, e.devuelta_at
                 FROM aim_aulaclase_archivos f LEFT JOIN aim_aulaclase_posts p ON p.id = f.post_id
                 LEFT JOIN aim_aulaclase_entregas e ON e.id = f.entrega_id LEFT JOIN aim_aulaclase_posts pe ON pe.id = e.post_id WHERE f.id = $1`, [idDe(req.params.id)])).rows[0];
            if (!f) corta(404, 'Ese archivo ya no está.');
            if (f.post_id) {
                const { p, a } = await postConAcceso(req, f.pid, false);
                if (!esPersonal(a) || !puedeCambiar(req, a, p)) corta(403, 'No puedes quitarlo.');
            } else {
                const { a } = await postConAcceso(req, f.pid, true);
                if (!a.mios.some(m => m.id === String(f.alumno_id)) || f.devuelta_at) corta(403, 'No puedes quitarlo.');
            }
            await pool.query(`DELETE FROM aim_aulaclase_archivos WHERE id = $1`, [f.id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/aulas-clase/archivo/:id', authenticateSession, async (req, res) => {
        try {
            const f = (await pool.query(
                `SELECT f.*, COALESCE(f.post_id, e.post_id) AS pid, e.alumno_id FROM aim_aulaclase_archivos f LEFT JOIN aim_aulaclase_entregas e ON e.id = f.entrega_id WHERE f.id = $1`, [idDe(req.params.id)])).rows[0];
            if (!f) corta(404, 'Ese archivo ya no está.');
            // Como personal o como familia: el de una entrega, solo el personal y esa familia.
            let a;
            try { a = (await postConAcceso(req, f.pid, false)).a; } catch { a = (await postConAcceso(req, f.pid, true)).a; }
            if (f.entrega_id && !esPersonal(a) && !a.mios.some(m => m.id === String(f.alumno_id))) corta(404, 'Ese archivo ya no está.');
            const enLinea = !req.query.descargar && /^(image\/(png|jpeg|gif|webp)|video\/|audio\/|application\/pdf$)/.test(f.mime);
            res.set({ 'Content-Type': f.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400',
                'Content-Disposition': `${enLinea ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.nombre)}` });
            if (f.mime !== 'application/pdf') res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
            res.send(f.datos);
        } catch (err) { fallo(res, err); }
    });

    return { router };
}

// ── Avisos ──
// A la familia (campanita y móvil): lo nuevo de las clases de los suyos, las
// tareas corregidas y lo que le escribe el profe en privado. Últimas dos semanas.
export async function avisosAulaClaseFamilia(pool, fam) {
    const ids = fam.map(String);
    const posts = (await pool.query(
        `SELECT p.id, p.tipo, p.titulo, p.texto, p.publicar_at, p.group_id, g.name AS clase, gs.student_id, u.name AS alumno
         FROM aim_aulaclase_posts p JOIN tul_groups g ON g.group_id = p.group_id
         JOIN tul_group_students gs ON gs.group_id = p.group_id AND gs.student_id::text = ANY($1::text[])
         JOIN users u ON u.user_id = gs.student_id
         WHERE p.publicar_at <= NOW() AND p.publicar_at > NOW() - INTERVAL '14 days' AND p.autor_id::text <> ALL($1::text[])
         ORDER BY p.publicar_at DESC LIMIT 12`, [ids]).catch(() => ({ rows: [] }))).rows;
    const vistos = new Set();
    const avisos = [];
    const que = { aviso: 'Aviso', material: 'Material nuevo', tarea: 'Tarea nueva', hoy: 'Lo de hoy' };
    for (const p of posts) {
        if (vistos.has(p.id)) continue;
        vistos.add(p.id);
        const corto = String(p.titulo || p.texto || '').replace(/\s+/g, ' ').trim();
        avisos.push({
            tipo: 'clases', destino: `/dashboard/clases?aula=${p.group_id}`, clave: `aulaclase:post:${p.id}`, marca: p.publicar_at, fecha: p.publicar_at, alumnoId: p.student_id,
            texto: `${que[p.tipo] || 'Nuevo'} en ${p.clase}`, detalle: corto.length > 90 ? `${corto.slice(0, 88).trim()}…` : corto,
        });
    }
    const notas = (await pool.query(
        `SELECT e.id, e.nota, e.hecha, e.devuelta_at, p.titulo, p.group_id, p.calificacion, g.name AS clase, e.alumno_id, u.name AS alumno
         FROM aim_aulaclase_entregas e JOIN aim_aulaclase_posts p ON p.id = e.post_id JOIN tul_groups g ON g.group_id = p.group_id JOIN users u ON u.user_id = e.alumno_id
         WHERE e.alumno_id::text = ANY($1::text[]) AND e.devuelta_at > NOW() - INTERVAL '14 days' ORDER BY e.devuelta_at DESC LIMIT 6`, [ids]).catch(() => ({ rows: [] }))).rows;
    for (const n of notas) {
        avisos.push({
            tipo: 'clases', destino: `/dashboard/clases?aula=${n.group_id}`, clave: `aulaclase:nota:${n.id}`, marca: n.devuelta_at, fecha: n.devuelta_at, alumnoId: n.alumno_id,
            texto: `Corregida «${n.titulo}» de ${n.alumno}`, detalle: `${n.clase} · ${n.calificacion === 'hecha' ? (n.hecha ? 'Hecha ✓' : 'No hecha') : n.nota != null ? `${String(Number(n.nota)).replace('.', ',')} / 10` : 'corregida'}`,
        });
    }
    const priv = (await pool.query(
        `SELECT c.post_id, c.alumno_id, MAX(c.created_at) AS ultimo, p.titulo, p.group_id, g.name AS clase
         FROM aim_aulaclase_comentarios c JOIN aim_aulaclase_posts p ON p.id = c.post_id JOIN tul_groups g ON g.group_id = p.group_id
         WHERE c.alumno_id::text = ANY($1::text[]) AND c.autor_id::text <> ALL($1::text[]) AND c.created_at > NOW() - INTERVAL '14 days'
         GROUP BY c.post_id, c.alumno_id, p.titulo, p.group_id, g.name ORDER BY MAX(c.created_at) DESC LIMIT 6`, [ids]).catch(() => ({ rows: [] }))).rows;
    for (const c of priv) {
        avisos.push({
            tipo: 'clases', destino: `/dashboard/clases?aula=${c.group_id}`, clave: `aulaclase:privado:${c.post_id}:${c.alumno_id}`, marca: c.ultimo, fecha: c.ultimo, alumnoId: c.alumno_id,
            texto: `El profe te ha escrito en «${c.titulo}»`, detalle: c.clase,
        });
    }
    return avisos;
}
// Al personal: entregas por corregir y lo que escriben las familias, de sus clases.
export async function avisosAulaClasePersonal(pool, { grupos = null }) {
    const filtro = grupos ? `AND p.group_id::text = ANY($1::text[])` : '';
    const vals = grupos ? [grupos.map(String)] : [];
    const e = (await pool.query(
        `SELECT COUNT(*)::int AS n, COUNT(DISTINCT p.group_id)::int AS clases, MAX(e.entregada_at) AS ultima
         FROM aim_aulaclase_entregas e JOIN aim_aulaclase_posts p ON p.id = e.post_id
         WHERE e.entregada_at IS NOT NULL AND e.devuelta_at IS NULL ${filtro}`, vals).catch(() => ({ rows: [{ n: 0 }] }))).rows[0];
    const c = (await pool.query(
        `SELECT COUNT(*)::int AS n, MAX(c.created_at) AS ultimo
         FROM aim_aulaclase_comentarios c JOIN aim_aulaclase_posts p ON p.id = c.post_id
         WHERE c.created_at > NOW() - INTERVAL '3 days' AND c.autor_id IS DISTINCT FROM p.autor_id
           AND NOT EXISTS (SELECT 1 FROM aim_rangos r WHERE r.user_id = c.autor_id) ${filtro}`, vals).catch(() => ({ rows: [{ n: 0 }] }))).rows[0];
    const l = [];
    if (e.n) l.push({ tipo: 'clases', clave: 'aulaclase_entregas', n: e.n, texto: `${e.n} ${e.n === 1 ? 'entrega' : 'entregas'} por corregir en las aulas de clase`, detalle: `${e.clases} ${e.clases === 1 ? 'clase' : 'clases'}`, destino: '/admin/aulas-clase' });
    if (c.n) l.push({ tipo: 'clases', clave: 'aulaclase_comentarios', marca: c.ultimo, fecha: c.ultimo, n: c.n, texto: `${c.n} ${c.n === 1 ? 'comentario nuevo' : 'comentarios nuevos'} de las familias en las aulas de clase`, detalle: 'de los últimos tres días', destino: '/admin/aulas-clase' });
    return l;
}
