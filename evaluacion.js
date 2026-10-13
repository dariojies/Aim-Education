// ─────────────────────────────────────────────────────────────────────────────
// Evaluación (ticket #411), de momento para inglés y preparada para otras
// actividades (Taekwon-Do, por ejemplo).
//
//  · Currículo de cada actividad: categorías (Speaking, Reading…), sus contenidos
//    y los objetivos, cada uno de una categoría y relacionado con contenidos. Lo
//    editan la dirección y el Equipo IT (editarCurriculo); los profes lo usan.
//  · Fichero de actividades: las que los profes van guardando para reutilizarlas,
//    con los contenidos que trabajan y sus categorías.
//  · Sesiones: lo que se hizo en una clase un día, con sus actividades (del
//    fichero o escritas en el momento). Cada actividad dice qué contenidos trabaja,
//    a qué categorías pertenece y en cuál se evalúa ese día.
//  · Notas: de 1 a 3 estrellas por alumno y categoría evaluada, cada día. Al final
//    del trimestre, la media se pasa a una nota sobre 5: media ÷ 3 × 5, redondeada
//    a media estrella.
//
// Es una prueba interna: las familias no ven nada de esto.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';

// Las categorías con las que empieza el inglés (se pueden cambiar).
const CATEGORIAS_INGLES = ['Speaking', 'Listening', 'Reading', 'Writing', 'Use of English'];

export async function crearTablasEvaluacion(client) {
    // activity_id es de tul_activities (la crea Learning Dungeon): sin clave
    // ajena, para no atar las dos apps.
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_eval_categorias (
            id SERIAL PRIMARY KEY,
            activity_id UUID NOT NULL,
            nombre VARCHAR(80) NOT NULL,
            orden SMALLINT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_eval_categorias_act ON aim_eval_categorias (activity_id, orden)`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_eval_contenidos (
            id SERIAL PRIMARY KEY,
            categoria_id INTEGER NOT NULL REFERENCES aim_eval_categorias(id) ON DELETE CASCADE,
            nombre VARCHAR(200) NOT NULL,
            orden SMALLINT NOT NULL DEFAULT 0
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_eval_objetivos (
            id SERIAL PRIMARY KEY,
            categoria_id INTEGER NOT NULL REFERENCES aim_eval_categorias(id) ON DELETE CASCADE,
            texto TEXT NOT NULL,
            contenido_ids INTEGER[] NOT NULL DEFAULT '{}',
            orden SMALLINT NOT NULL DEFAULT 0
        )`);
    // El fichero de actividades.
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_eval_actividades (
            id SERIAL PRIMARY KEY,
            activity_id UUID NOT NULL,
            nombre VARCHAR(150) NOT NULL,
            descripcion TEXT,
            categoria_ids INTEGER[] NOT NULL DEFAULT '{}',
            contenido_ids INTEGER[] NOT NULL DEFAULT '{}',
            autor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            archivada BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )`);
    // Una sesión por clase y día. actividades = [{ actividadId|null, nombre,
    // descripcion, contenidoIds, categoriaIds, evaluaEn|null }].
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_eval_sesiones (
            id SERIAL PRIMARY KEY,
            group_id UUID NOT NULL,
            fecha DATE NOT NULL,
            notas TEXT,
            actividades JSONB NOT NULL DEFAULT '[]',
            autor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (group_id, fecha)
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_eval_notas (
            sesion_id INTEGER NOT NULL REFERENCES aim_eval_sesiones(id) ON DELETE CASCADE,
            student_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            categoria_id INTEGER NOT NULL REFERENCES aim_eval_categorias(id) ON DELETE CASCADE,
            estrellas SMALLINT NOT NULL CHECK (estrellas BETWEEN 1 AND 3),
            actualizado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            actualizado_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (sesion_id, student_id, categoria_id)
        )`);
}

// Las cinco categorías del inglés, la primera vez (si esa actividad aún no tiene).
export async function sembrarCategoriasIngles(pool, clubId) {
    const act = (await pool.query(
        `SELECT activity_id FROM tul_activities WHERE club_id = $1 AND LOWER(name) IN ('inglés', 'ingles', 'english') ORDER BY name LIMIT 1`, [clubId])).rows[0];
    if (!act) return;
    await pool.query(
        `INSERT INTO aim_eval_categorias (activity_id, nombre, orden)
         SELECT $1, x.nombre, x.orden FROM unnest($2::text[]) WITH ORDINALITY AS x(nombre, orden)
         WHERE NOT EXISTS (SELECT 1 FROM aim_eval_categorias WHERE activity_id = $1)`,
        [act.activity_id, CATEGORIAS_INGLES]);
}

// Las fechas de cada trimestre de un curso (el que empieza en septiembre de `curso`).
export function trimestre(curso, t) {
    const y = Number(curso);
    return ({ 1: [`${y}-09-01`, `${y}-12-31`], 2: [`${y + 1}-01-01`, `${y + 1}-03-31`], 3: [`${y + 1}-04-01`, `${y + 1}-08-31`] })[t] || null;
}
export function trimestreDeFecha(fecha) {
    const [y, m] = String(fecha).split('-').map(Number);
    if (m >= 9) return { curso: y, t: 1 };
    return { curso: y - 1, t: m <= 3 ? 2 : 3 };
}
// De la media de estrellas (1 a 3) a la nota sobre 5, a media estrella.
export const notaSobre5 = (media) => (media == null ? null : Math.round((media / 3) * 5 * 2) / 2);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const enteros = (v, max = 50) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, max);
const fallo = (res, err) => res.status(err?.httP || 500).json({ error: err?.msg || err?.message || 'Error' });
const corta = (httP, msg) => { throw { httP, msg }; };

export function crearEvaluacion({ pool, clubId, authenticateSession, requireSeccion, permisos, grupoSuyo }) {
    const router = express.Router();
    const ver = [authenticateSession, requireSeccion('evaluacion')];
    const puedeCurriculo = (req) => !!permisos(req).editarCurriculo;

    // La actividad (tul_activities) de una clase del club, o corta si no es suya.
    async function claseDe(req, groupId) {
        if (!UUID.test(String(groupId || ''))) corta(400, 'Clase no válida.');
        const g = (await pool.query(
            `SELECT g.group_id, g.name, g.activity_id, a.name AS actividad FROM tul_groups g
             JOIN tul_activities a ON a.activity_id = g.activity_id WHERE g.group_id = $1 AND a.club_id = $2`, [groupId, clubId])).rows[0];
        if (!g) corta(404, 'Esa clase no es de este club.');
        if (!(await grupoSuyo(req, groupId))) corta(403, 'Esa clase no es tuya.');
        return g;
    }
    async function actividadDelClub(activityId) {
        if (!UUID.test(String(activityId || ''))) corta(400, 'Actividad no válida.');
        const a = (await pool.query(`SELECT activity_id, name FROM tul_activities WHERE activity_id = $1 AND club_id = $2`, [activityId, clubId])).rows[0];
        if (!a) corta(404, 'Esa actividad no es de este club.');
        return a;
    }
    // Las categorías válidas de una actividad (para comprobar lo que llega).
    async function categoriasDe(activityId) {
        return new Set((await pool.query(`SELECT id FROM aim_eval_categorias WHERE activity_id = $1`, [activityId])).rows.map(x => x.id));
    }
    async function contenidosDe(activityId) {
        return new Set((await pool.query(
            `SELECT c.id FROM aim_eval_contenidos c JOIN aim_eval_categorias k ON k.id = c.categoria_id WHERE k.activity_id = $1`, [activityId])).rows.map(x => x.id));
    }

    // ── Actividades del club con su currículo ──
    router.get('/api/admin/evaluacion/actividades', ...ver, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT a.activity_id AS id, a.name AS nombre,
                        (SELECT COUNT(*) FROM aim_eval_categorias k WHERE k.activity_id = a.activity_id)::int AS categorias
                 FROM tul_activities a WHERE a.club_id = $1 ORDER BY a.name`, [clubId]);
            res.set('Cache-Control', 'no-store');
            res.json({ actividades: r.rows, puedeCurriculo: puedeCurriculo(req) });
        } catch (err) { fallo(res, err); }
    });

    // ── Currículo de una actividad ──
    async function curriculo(activityId) {
        const [cats, conts, objs] = await Promise.all([
            pool.query(`SELECT id, nombre, orden FROM aim_eval_categorias WHERE activity_id = $1 ORDER BY orden, id`, [activityId]),
            pool.query(`SELECT c.id, c.categoria_id, c.nombre, c.orden FROM aim_eval_contenidos c JOIN aim_eval_categorias k ON k.id = c.categoria_id
                        WHERE k.activity_id = $1 ORDER BY c.orden, c.id`, [activityId]),
            pool.query(`SELECT o.id, o.categoria_id, o.texto, o.contenido_ids, o.orden FROM aim_eval_objetivos o JOIN aim_eval_categorias k ON k.id = o.categoria_id
                        WHERE k.activity_id = $1 ORDER BY o.orden, o.id`, [activityId]),
        ]);
        return cats.rows.map(k => ({
            id: k.id, nombre: k.nombre, orden: k.orden,
            contenidos: conts.rows.filter(c => c.categoria_id === k.id).map(c => ({ id: c.id, nombre: c.nombre })),
            objetivos: objs.rows.filter(o => o.categoria_id === k.id).map(o => ({ id: o.id, texto: o.texto, contenidoIds: o.contenido_ids || [] })),
        }));
    }
    router.get('/api/admin/evaluacion/curriculo', ...ver, async (req, res) => {
        try {
            const a = await actividadDelClub(req.query.actividad);
            res.set('Cache-Control', 'no-store');
            res.json({ actividad: { id: a.activity_id, nombre: a.name }, categorias: await curriculo(a.activity_id), puedeCurriculo: puedeCurriculo(req) });
        } catch (err) { fallo(res, err); }
    });

    // Crear, cambiar y borrar piezas del currículo (dirección y Equipo IT).
    const editar = (req, res, next) => (puedeCurriculo(req) ? next() : res.status(403).json({ error: 'El currículo lo cambian la dirección y el Equipo IT.' }));
    async function categoriaDelClub(id) {
        const k = (await pool.query(
            `SELECT k.id, k.activity_id FROM aim_eval_categorias k JOIN tul_activities a ON a.activity_id = k.activity_id
             WHERE k.id = $1 AND a.club_id = $2`, [Number(id) || 0, clubId])).rows[0];
        if (!k) corta(404, 'Esa categoría no existe.');
        return k;
    }
    router.post('/api/admin/evaluacion/categorias', ...ver, editar, async (req, res) => {
        try {
            const a = await actividadDelClub(req.body?.actividadId);
            const nombre = texto(req.body?.nombre, 80);
            if (!nombre) corta(400, 'Pon el nombre de la categoría.');
            const r = await pool.query(
                `INSERT INTO aim_eval_categorias (activity_id, nombre, orden)
                 VALUES ($1, $2, COALESCE((SELECT MAX(orden) + 1 FROM aim_eval_categorias WHERE activity_id = $1), 1)) RETURNING id`, [a.activity_id, nombre]);
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/evaluacion/categorias/:id', ...ver, editar, async (req, res) => {
        try {
            const k = await categoriaDelClub(req.params.id);
            const nombre = texto(req.body?.nombre, 80);
            if (!nombre) corta(400, 'Pon el nombre de la categoría.');
            await pool.query(`UPDATE aim_eval_categorias SET nombre = $2 WHERE id = $1`, [k.id, nombre]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/evaluacion/categorias/:id', ...ver, editar, async (req, res) => {
        try {
            const k = await categoriaDelClub(req.params.id);
            const n = (await pool.query(`SELECT COUNT(*)::int n FROM aim_eval_notas WHERE categoria_id = $1`, [k.id])).rows[0].n;
            if (n) corta(409, `Esa categoría ya tiene ${n} nota${n === 1 ? '' : 's'} puestas: no se puede borrar (sí cambiarle el nombre).`);
            await pool.query(`DELETE FROM aim_eval_categorias WHERE id = $1`, [k.id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/admin/evaluacion/contenidos', ...ver, editar, async (req, res) => {
        try {
            const k = await categoriaDelClub(req.body?.categoriaId);
            const nombre = texto(req.body?.nombre, 200);
            if (!nombre) corta(400, 'Escribe el contenido.');
            const r = await pool.query(
                `INSERT INTO aim_eval_contenidos (categoria_id, nombre, orden)
                 VALUES ($1, $2, COALESCE((SELECT MAX(orden) + 1 FROM aim_eval_contenidos WHERE categoria_id = $1), 1)) RETURNING id`, [k.id, nombre]);
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    async function contenidoDelClub(id) {
        const c = (await pool.query(
            `SELECT c.id, k.activity_id FROM aim_eval_contenidos c JOIN aim_eval_categorias k ON k.id = c.categoria_id
             JOIN tul_activities a ON a.activity_id = k.activity_id WHERE c.id = $1 AND a.club_id = $2`, [Number(id) || 0, clubId])).rows[0];
        if (!c) corta(404, 'Ese contenido no existe.');
        return c;
    }
    router.put('/api/admin/evaluacion/contenidos/:id', ...ver, editar, async (req, res) => {
        try {
            const c = await contenidoDelClub(req.params.id);
            const nombre = texto(req.body?.nombre, 200);
            if (!nombre) corta(400, 'Escribe el contenido.');
            await pool.query(`UPDATE aim_eval_contenidos SET nombre = $2 WHERE id = $1`, [c.id, nombre]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/evaluacion/contenidos/:id', ...ver, editar, async (req, res) => {
        try {
            const c = await contenidoDelClub(req.params.id);
            // Fuera también de los objetivos y del fichero que lo nombraban.
            await pool.query(`UPDATE aim_eval_objetivos SET contenido_ids = array_remove(contenido_ids, $1) WHERE $1 = ANY(contenido_ids)`, [c.id]);
            await pool.query(`UPDATE aim_eval_actividades SET contenido_ids = array_remove(contenido_ids, $1) WHERE $1 = ANY(contenido_ids)`, [c.id]);
            await pool.query(`DELETE FROM aim_eval_contenidos WHERE id = $1`, [c.id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    async function datosObjetivo(req) {
        const k = await categoriaDelClub(req.body?.categoriaId);
        const t = texto(req.body?.texto, 1000);
        if (!t) corta(400, 'Escribe el objetivo.');
        const validos = await contenidosDe(k.activity_id);
        return { k, t, ids: enteros(req.body?.contenidoIds).filter(id => validos.has(id)) };
    }
    router.post('/api/admin/evaluacion/objetivos', ...ver, editar, async (req, res) => {
        try {
            const { k, t, ids } = await datosObjetivo(req);
            const r = await pool.query(
                `INSERT INTO aim_eval_objetivos (categoria_id, texto, contenido_ids, orden)
                 VALUES ($1, $2, $3::int[], COALESCE((SELECT MAX(orden) + 1 FROM aim_eval_objetivos WHERE categoria_id = $1), 1)) RETURNING id`, [k.id, t, ids]);
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/evaluacion/objetivos/:id', ...ver, editar, async (req, res) => {
        try {
            const o = (await pool.query(
                `SELECT o.id FROM aim_eval_objetivos o JOIN aim_eval_categorias k ON k.id = o.categoria_id
                 JOIN tul_activities a ON a.activity_id = k.activity_id WHERE o.id = $1 AND a.club_id = $2`, [Number(req.params.id) || 0, clubId])).rows[0];
            if (!o) corta(404, 'Ese objetivo no existe.');
            const { k, t, ids } = await datosObjetivo(req);
            await pool.query(`UPDATE aim_eval_objetivos SET categoria_id = $2, texto = $3, contenido_ids = $4::int[] WHERE id = $1`, [o.id, k.id, t, ids]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/evaluacion/objetivos/:id', ...ver, editar, async (req, res) => {
        try {
            const r = await pool.query(
                `DELETE FROM aim_eval_objetivos o USING aim_eval_categorias k, tul_activities a
                 WHERE o.id = $1 AND k.id = o.categoria_id AND a.activity_id = k.activity_id AND a.club_id = $2 RETURNING o.id`, [Number(req.params.id) || 0, clubId]);
            if (!r.rowCount) corta(404, 'Ese objetivo no existe.');
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // ── Fichero de actividades ──
    // Lo usan todos los profes; cada uno cambia las suyas, y la dirección todas.
    router.get('/api/admin/evaluacion/fichero', ...ver, async (req, res) => {
        try {
            const a = await actividadDelClub(req.query.actividad);
            const r = await pool.query(
                `SELECT x.id, x.nombre, x.descripcion, x.categoria_ids, x.contenido_ids, x.archivada, x.autor_id, x.updated_at,
                        TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS autor,
                        (SELECT COUNT(*) FROM aim_eval_sesiones s, jsonb_array_elements(s.actividades) e
                          WHERE (e->>'actividadId')::int = x.id)::int AS usada
                 FROM aim_eval_actividades x LEFT JOIN users u ON u.user_id = x.autor_id
                 WHERE x.activity_id = $1 AND ($2::boolean OR NOT x.archivada)
                 ORDER BY x.archivada, x.nombre`, [a.activity_id, req.query.archivadas === '1']);
            const yo = String(req.userSession.userId);
            res.set('Cache-Control', 'no-store');
            res.json({
                actividades: r.rows.map(x => ({
                    id: x.id, nombre: x.nombre, descripcion: x.descripcion || '', categoriaIds: x.categoria_ids || [], contenidoIds: x.contenido_ids || [],
                    archivada: x.archivada, autor: x.autor || null, usada: x.usada, actualizada: x.updated_at,
                    puedeEditar: puedeCurriculo(req) || String(x.autor_id || '') === yo,
                })),
            });
        } catch (err) { fallo(res, err); }
    });
    async function datosFichero(req, activityId) {
        const nombre = texto(req.body?.nombre, 150);
        if (!nombre) corta(400, 'Pon el nombre de la actividad.');
        const [cats, conts] = await Promise.all([categoriasDe(activityId), contenidosDe(activityId)]);
        return {
            nombre, descripcion: texto(req.body?.descripcion, 4000) || null,
            categoriaIds: enteros(req.body?.categoriaIds).filter(id => cats.has(id)),
            contenidoIds: enteros(req.body?.contenidoIds, 100).filter(id => conts.has(id)),
        };
    }
    router.post('/api/admin/evaluacion/fichero', ...ver, async (req, res) => {
        try {
            const a = await actividadDelClub(req.body?.actividadId);
            const d = await datosFichero(req, a.activity_id);
            const r = await pool.query(
                `INSERT INTO aim_eval_actividades (activity_id, nombre, descripcion, categoria_ids, contenido_ids, autor_id)
                 VALUES ($1, $2, $3, $4::int[], $5::int[], $6) RETURNING id`,
                [a.activity_id, d.nombre, d.descripcion, d.categoriaIds, d.contenidoIds, req.userSession.userId]);
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    async function ficheroEditable(req, id) {
        const x = (await pool.query(
            `SELECT x.id, x.activity_id, x.autor_id FROM aim_eval_actividades x JOIN tul_activities a ON a.activity_id = x.activity_id
             WHERE x.id = $1 AND a.club_id = $2`, [Number(id) || 0, clubId])).rows[0];
        if (!x) corta(404, 'Esa actividad no está en el fichero.');
        if (!puedeCurriculo(req) && String(x.autor_id || '') !== String(req.userSession.userId)) corta(403, 'Solo quien la escribió (o la dirección) puede cambiarla.');
        return x;
    }
    router.put('/api/admin/evaluacion/fichero/:id', ...ver, async (req, res) => {
        try {
            const x = await ficheroEditable(req, req.params.id);
            if (typeof req.body?.archivada === 'boolean' && req.body?.nombre === undefined) {
                await pool.query(`UPDATE aim_eval_actividades SET archivada = $2, updated_at = NOW() WHERE id = $1`, [x.id, req.body.archivada]);
                return res.json({ success: true });
            }
            const d = await datosFichero(req, x.activity_id);
            await pool.query(
                `UPDATE aim_eval_actividades SET nombre = $2, descripcion = $3, categoria_ids = $4::int[], contenido_ids = $5::int[], updated_at = NOW() WHERE id = $1`,
                [x.id, d.nombre, d.descripcion, d.categoriaIds, d.contenidoIds]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // ── Sesión de una clase un día, con las notas ──
    router.get('/api/admin/evaluacion/sesion', ...ver, async (req, res) => {
        try {
            const g = await claseDe(req, req.query.grupo);
            const fecha = String(req.query.fecha || '');
            if (!FECHA.test(fecha)) corta(400, 'Fecha no válida.');
            const s = (await pool.query(
                `SELECT s.id, s.notas, s.actividades, s.updated_at, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS autor
                 FROM aim_eval_sesiones s LEFT JOIN users u ON u.user_id = s.autor_id WHERE s.group_id = $1 AND s.fecha = $2::date`, [g.group_id, fecha])).rows[0];
            const notas = s ? (await pool.query(`SELECT student_id, categoria_id, estrellas FROM aim_eval_notas WHERE sesion_id = $1`, [s.id])).rows : [];
            res.set('Cache-Control', 'no-store');
            res.json({
                clase: { id: g.group_id, nombre: g.name, actividad: g.actividad, actividadId: g.activity_id },
                categorias: await curriculo(g.activity_id),
                sesion: s ? { id: s.id, notas: s.notas || '', actividades: s.actividades || [], autor: s.autor || null, actualizada: s.updated_at } : null,
                notas: notas.map(n => ({ studentId: n.student_id, categoriaId: n.categoria_id, estrellas: n.estrellas })),
            });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/evaluacion/sesion', ...ver, async (req, res) => {
        try {
            const g = await claseDe(req, req.body?.grupo);
            const fecha = String(req.body?.fecha || '');
            if (!FECHA.test(fecha)) corta(400, 'Fecha no válida.');
            const [cats, conts] = await Promise.all([categoriasDe(g.activity_id), contenidosDe(g.activity_id)]);
            const delFichero = new Set((await pool.query(`SELECT id FROM aim_eval_actividades WHERE activity_id = $1`, [g.activity_id])).rows.map(x => x.id));
            const actividades = (Array.isArray(req.body?.actividades) ? req.body.actividades : []).slice(0, 30).map(a => {
                const categoriaIds = enteros(a?.categoriaIds).filter(id => cats.has(id));
                const evaluaEn = cats.has(Number(a?.evaluaEn)) ? Number(a.evaluaEn) : null;
                return {
                    actividadId: delFichero.has(Number(a?.actividadId)) ? Number(a.actividadId) : null,
                    nombre: texto(a?.nombre, 150),
                    descripcion: texto(a?.descripcion, 2000),
                    contenidoIds: enteros(a?.contenidoIds, 100).filter(id => conts.has(id)),
                    // Se evalúa en una de sus categorías (si no la tiene, se le añade).
                    categoriaIds: evaluaEn && !categoriaIds.includes(evaluaEn) ? [...categoriaIds, evaluaEn] : categoriaIds,
                    evaluaEn,
                };
            }).filter(a => a.nombre);
            const r = await pool.query(
                `INSERT INTO aim_eval_sesiones (group_id, fecha, notas, actividades, autor_id)
                 VALUES ($1, $2::date, $3, $4::jsonb, $5)
                 ON CONFLICT (group_id, fecha) DO UPDATE SET notas = EXCLUDED.notas, actividades = EXCLUDED.actividades,
                     autor_id = EXCLUDED.autor_id, updated_at = NOW()
                 RETURNING id`, [g.group_id, fecha, texto(req.body?.notas, 4000) || null, JSON.stringify(actividades), req.userSession.userId]);
            res.json({ success: true, id: r.rows[0].id, actividades });
        } catch (err) { fallo(res, err); }
    });
    // Una nota: de 1 a 3 estrellas, o null para quitarla.
    router.put('/api/admin/evaluacion/nota', ...ver, async (req, res) => {
        try {
            const s = (await pool.query(`SELECT id, group_id, actividades FROM aim_eval_sesiones WHERE id = $1`, [Number(req.body?.sesionId) || 0])).rows[0];
            if (!s) corta(404, 'Guarda primero la sesión.');
            await claseDe(req, s.group_id);
            const cat = Number(req.body?.categoriaId);
            const evaluadas = new Set((s.actividades || []).map(a => a.evaluaEn).filter(Boolean));
            if (!evaluadas.has(cat)) corta(400, 'Esa categoría no se evalúa en esta sesión.');
            if (!UUID.test(String(req.body?.studentId || ''))) corta(400, 'Alumno no válido.');
            const e = req.body?.estrellas == null ? null : Number(req.body.estrellas);
            if (e === null) {
                await pool.query(`DELETE FROM aim_eval_notas WHERE sesion_id = $1 AND student_id = $2 AND categoria_id = $3`, [s.id, req.body.studentId, cat]);
            } else {
                if (![1, 2, 3].includes(e)) corta(400, 'De 1 a 3 estrellas.');
                await pool.query(
                    `INSERT INTO aim_eval_notas (sesion_id, student_id, categoria_id, estrellas, actualizado_por)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (sesion_id, student_id, categoria_id) DO UPDATE SET estrellas = EXCLUDED.estrellas,
                         actualizado_por = EXCLUDED.actualizado_por, actualizado_at = NOW()`,
                    [s.id, req.body.studentId, cat, e, req.userSession.userId]);
            }
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // Las sesiones de una clase (para ver cuáles hay hechas).
    router.get('/api/admin/evaluacion/sesiones', ...ver, async (req, res) => {
        try {
            const g = await claseDe(req, req.query.grupo);
            const r = await pool.query(
                `SELECT s.fecha::text AS fecha, jsonb_array_length(s.actividades)::int AS actividades,
                        (SELECT COUNT(*) FROM aim_eval_notas n WHERE n.sesion_id = s.id)::int AS notas
                 FROM aim_eval_sesiones s WHERE s.group_id = $1 ORDER BY s.fecha DESC LIMIT 200`, [g.group_id]);
            res.set('Cache-Control', 'no-store');
            res.json({ sesiones: r.rows });
        } catch (err) { fallo(res, err); }
    });

    // ── Notas del trimestre de una clase ──
    router.get('/api/admin/evaluacion/trimestre', ...ver, async (req, res) => {
        try {
            const g = await claseDe(req, req.query.grupo);
            const actual = trimestreDeFecha(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }));
            const curso = /^\d{4}$/.test(String(req.query.curso || '')) ? Number(req.query.curso) : actual.curso;
            const t = [1, 2, 3].includes(Number(req.query.t)) ? Number(req.query.t) : actual.t;
            const [desde, hasta] = trimestre(curso, t);
            const r = await pool.query(
                `SELECT n.student_id, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS nombre, n.categoria_id,
                        AVG(n.estrellas)::float AS media, COUNT(*)::int AS veces
                 FROM aim_eval_notas n JOIN aim_eval_sesiones s ON s.id = n.sesion_id JOIN users u ON u.user_id = n.student_id
                 WHERE s.group_id = $1 AND s.fecha BETWEEN $2::date AND $3::date
                 GROUP BY 1, 2, 3 ORDER BY 2`, [g.group_id, desde, hasta]);
            const sesiones = (await pool.query(
                `SELECT COUNT(*)::int n FROM aim_eval_sesiones WHERE group_id = $1 AND fecha BETWEEN $2::date AND $3::date`, [g.group_id, desde, hasta])).rows[0].n;
            const alumnos = new Map();
            for (const x of r.rows) {
                if (!alumnos.has(x.student_id)) alumnos.set(x.student_id, { id: x.student_id, nombre: x.nombre, categorias: {} });
                alumnos.get(x.student_id).categorias[x.categoria_id] = { media: Math.round(x.media * 100) / 100, veces: x.veces, nota: notaSobre5(x.media) };
            }
            // La nota global: la media de las notas de sus categorías.
            const lista = [...alumnos.values()].map(a => {
                const notas = Object.values(a.categorias).map(c => c.nota);
                return { ...a, global: notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 2) / 2 : null };
            });
            res.set('Cache-Control', 'no-store');
            res.json({ curso, t, desde, hasta, sesiones, categorias: await curriculo(g.activity_id), alumnos: lista });
        } catch (err) { fallo(res, err); }
    });

    return { router };
}
