// ─────────────────────────────────────────────────────────────────────────────
// Agrupaciones dentro de una clase (ticket #441), como en iDoceo: cada clase
// puede tener hasta MAX_AGRUPACIONES formas de repartir a sus alumnos («Clase
// del cole», con 2 años A, B y C; «Equipos de 4»…), cada una con sus
// subgrupos. Al pasar lista se elige una y los alumnos salen agrupados.
//
// Los alumnos de la clase siguen siendo los de tul_group_students (los mismos
// que en Learning Dungeon): aquí solo se apunta en qué subgrupo va cada uno.
// Un alumno que deja la clase sale solo de la vista (su fila se queda, por si
// vuelve); si se borra la clase, se borra todo.
// Lo lleva quien gestiona las clases; un profe, solo las clases que da.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';

export const MAX_AGRUPACIONES = 10;
const MAX_SUBGRUPOS = 20;
const COLORES = ['#5233A8', '#21B668', '#F99B35', '#00BBF4', '#FF5FA2', '#AF99FF', '#E53935', '#8D6E63'];

export async function crearTablasAgrupaciones(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_agrupaciones (
            id SERIAL PRIMARY KEY,
            group_id UUID NOT NULL REFERENCES tul_groups(group_id) ON DELETE CASCADE,
            nombre VARCHAR(60) NOT NULL,
            orden INTEGER NOT NULL DEFAULT 0,
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_agrupaciones_grupo ON aim_agrupaciones (group_id, orden)`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_agrupacion_subgrupos (
            id SERIAL PRIMARY KEY,
            agrupacion_id INTEGER NOT NULL REFERENCES aim_agrupaciones(id) ON DELETE CASCADE,
            nombre VARCHAR(60) NOT NULL,
            color VARCHAR(9),
            orden INTEGER NOT NULL DEFAULT 0
        )`);
    // En cada agrupación, un alumno está en un subgrupo como mucho.
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_agrupacion_alumnos (
            agrupacion_id INTEGER NOT NULL REFERENCES aim_agrupaciones(id) ON DELETE CASCADE,
            student_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            subgrupo_id INTEGER NOT NULL REFERENCES aim_agrupacion_subgrupos(id) ON DELETE CASCADE,
            PRIMARY KEY (agrupacion_id, student_id)
        )`);
}

const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
const fallo = (res, err) => {
    if (!err.status) console.error('[agrupaciones]', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'No se ha podido hacer. Inténtalo otra vez.' });
};
const nombre = (v, que) => { const s = String(v ?? '').trim().slice(0, 60); if (!s) corta(400, `Ponle nombre ${que}.`); return s; };
const esUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

export function crearAgrupaciones({ pool, authenticateSession, requireSeccion, grupoSuyo }) {
    const router = express.Router();
    const ver = [authenticateSession, requireSeccion('classes')];
    async function suya(req, groupId) {
        if (!esUuid(groupId)) corta(404, 'Esa clase no existe.');
        const g = (await pool.query(`SELECT group_id FROM tul_groups WHERE group_id = $1`, [groupId])).rows[0];
        if (!g) corta(404, 'Esa clase no existe.');
        if (!(await grupoSuyo(req, groupId))) corta(403, 'Esa clase no es tuya.');
    }
    async function deAgrupacion(req, id) {
        const a = (await pool.query(`SELECT * FROM aim_agrupaciones WHERE id = $1`, [Number(id) || 0])).rows[0];
        if (!a) corta(404, 'Esa agrupación ya no existe.');
        await suya(req, a.group_id);
        return a;
    }

    // Las agrupaciones de una clase, con sus subgrupos y quién va en cada uno.
    async function agrupacionesDe(groupId) {
        const [ags, subs, als] = await Promise.all([
            pool.query(`SELECT id, nombre FROM aim_agrupaciones WHERE group_id = $1 ORDER BY orden, id`, [groupId]),
            pool.query(`SELECT s.id, s.agrupacion_id, s.nombre, s.color FROM aim_agrupacion_subgrupos s JOIN aim_agrupaciones a ON a.id = s.agrupacion_id
                        WHERE a.group_id = $1 ORDER BY s.orden, s.id`, [groupId]),
            pool.query(`SELECT x.agrupacion_id, x.student_id, x.subgrupo_id FROM aim_agrupacion_alumnos x JOIN aim_agrupaciones a ON a.id = x.agrupacion_id
                        WHERE a.group_id = $1`, [groupId]),
        ]);
        return ags.rows.map(a => ({
            id: a.id, nombre: a.nombre,
            subgrupos: subs.rows.filter(s => s.agrupacion_id === a.id).map(({ agrupacion_id, ...s }) => s),
            // { idAlumno: idSubgrupo }
            alumnos: Object.fromEntries(als.rows.filter(x => x.agrupacion_id === a.id).map(x => [x.student_id, x.subgrupo_id])),
        }));
    }
    router.get('/api/admin/clases/:groupId/agrupaciones', ...ver, async (req, res) => {
        try {
            await suya(req, req.params.groupId);
            const alumnos = (await pool.query(
                `SELECT u.user_id AS id, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS nombre
                 FROM tul_group_students gs JOIN users u ON u.user_id = gs.student_id WHERE gs.group_id = $1 ORDER BY u.name, u.surname`, [req.params.groupId])).rows;
            res.set('Cache-Control', 'no-store');
            res.json({ agrupaciones: await agrupacionesDe(req.params.groupId), alumnos, max: MAX_AGRUPACIONES });
        } catch (err) { fallo(res, err); }
    });

    // Guardar una agrupación entera: nombre, subgrupos (los que traen id se
    // conservan; los nuevos se crean; los que faltan se quitan) y el reparto.
    async function guardar(req, res, a, groupId) {
        const b = req.body || {};
        const nom = nombre(b.nombre, 'a la agrupación');
        const subs = (Array.isArray(b.subgrupos) ? b.subgrupos : []).slice(0, MAX_SUBGRUPOS + 1);
        if (subs.length > MAX_SUBGRUPOS) corta(400, `Como mucho ${MAX_SUBGRUPOS} subgrupos.`);
        if (!subs.length) corta(400, 'Pon al menos un subgrupo.');
        const matriculados = new Set((await pool.query(`SELECT student_id FROM tul_group_students WHERE group_id = $1`, [groupId])).rows.map(x => String(x.student_id)));
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let id = a?.id;
            if (!id) {
                // Uno detrás de otro: con dos pestañas no se pasa del máximo.
                await client.query(`SELECT pg_advisory_xact_lock(441, hashtext($1))`, [groupId]);
                const n = (await client.query(`SELECT COUNT(*)::int n FROM aim_agrupaciones WHERE group_id = $1`, [groupId])).rows[0].n;
                if (n >= MAX_AGRUPACIONES) corta(400, `Como mucho ${MAX_AGRUPACIONES} agrupaciones por clase.`);
                id = (await client.query(`INSERT INTO aim_agrupaciones (group_id, nombre, orden, creado_por) VALUES ($1,$2,$3,$4) RETURNING id`,
                    [groupId, nom, n, req.userSession.userId])).rows[0].id;
            } else {
                await client.query(`UPDATE aim_agrupaciones SET nombre = $2 WHERE id = $1`, [id, nom]);
            }
            const antes = new Set((await client.query(`SELECT id FROM aim_agrupacion_subgrupos WHERE agrupacion_id = $1`, [id])).rows.map(x => x.id));
            const clave = new Map();   // la clave de la pantalla (id o «nuevo-…») → id de verdad
            const quedan = [];
            for (let i = 0; i < subs.length; i++) {
                const s = subs[i];
                const n = nombre(s?.nombre, `al subgrupo ${i + 1}`);
                const color = /^#[0-9a-f]{6}$/i.test(s?.color || '') ? s.color : COLORES[i % COLORES.length];
                let sid = Number(s?.id);
                if (sid && antes.has(sid)) await client.query(`UPDATE aim_agrupacion_subgrupos SET nombre = $2, color = $3, orden = $4 WHERE id = $1`, [sid, n, color, i]);
                else sid = (await client.query(`INSERT INTO aim_agrupacion_subgrupos (agrupacion_id, nombre, color, orden) VALUES ($1,$2,$3,$4) RETURNING id`, [id, n, color, i])).rows[0].id;
                clave.set(String(s?.id ?? s?.clave), sid);
                quedan.push(sid);
            }
            await client.query(`DELETE FROM aim_agrupacion_subgrupos WHERE agrupacion_id = $1 AND NOT (id = ANY($2::int[]))`, [id, quedan]);
            // El reparto: { idAlumno: clave del subgrupo }. Solo alumnos de la clase.
            await client.query(`DELETE FROM aim_agrupacion_alumnos WHERE agrupacion_id = $1 AND student_id IN (SELECT student_id FROM tul_group_students WHERE group_id = $2)`, [id, groupId]);
            for (const [alumno, sub] of Object.entries(b.alumnos && typeof b.alumnos === 'object' ? b.alumnos : {})) {
                const sid = clave.get(String(sub));
                if (!sid || !matriculados.has(alumno)) continue;
                await client.query(`INSERT INTO aim_agrupacion_alumnos (agrupacion_id, student_id, subgrupo_id) VALUES ($1,$2,$3)
                                    ON CONFLICT (agrupacion_id, student_id) DO UPDATE SET subgrupo_id = EXCLUDED.subgrupo_id`, [id, alumno, sid]);
            }
            await client.query('COMMIT');
            res.status(a ? 200 : 201).json({ success: true, id });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    }
    router.post('/api/admin/clases/:groupId/agrupaciones', ...ver, async (req, res) => {
        try { await suya(req, req.params.groupId); await guardar(req, res, null, req.params.groupId); } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/agrupaciones/:id', ...ver, async (req, res) => {
        try { const a = await deAgrupacion(req, req.params.id); await guardar(req, res, a, a.group_id); } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/agrupaciones/:id', ...ver, async (req, res) => {
        try {
            const a = await deAgrupacion(req, req.params.id);
            await pool.query(`DELETE FROM aim_agrupaciones WHERE id = $1`, [a.id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    return { router };
}
