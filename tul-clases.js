import express from 'express';
import { escalaDe, escalasDelClub, TIPO_TAEKWONDO } from './rangos.js';

// ─────────────────────────────────────────────────────────────────────────────
// Gestión de clases y reportes de Aim-Tul, portados a Aim Education.
//
// Este módulo replica los endpoints de "aim-tul RNW/server.js" (actividades,
// grupos, matrículas y reportes) trabajando sobre las MISMAS tablas tul_* de la
// base compartida, con el mismo SQL y las mismas convenciones de columnas. Así
// lo que se crea aquí aparece en la app de Aim-Tul al instante y al revés.
// Si aim-tul cambia su formato, hay que cambiarlo aquí igual.
//
// Diferencias deliberadas con el original:
//  - El club va fijado (AIM_CLUB_ID): no se acepta clubId del cliente.
//  - Todo cuelga de la sesión de admin de Aim Education (se monta con
//    authenticateSession + requireAdmin), no del JWT de aim-tul.
// ─────────────────────────────────────────────────────────────────────────────

// Límites por plan, copiados de aim-tul para comportarnos exactamente igual.
const PLAN_LIMITS = {
    free:       { maxActivities: 1,  maxGroupsPerActivity: 1  },
    club_lite:  { maxActivities: 3,  maxGroupsPerActivity: 10 },
    club_pro:   { maxActivities: 5,  maxGroupsPerActivity: 15 },
    club_elite: { maxActivities: 10, maxGroupsPerActivity: 30 },
    elite:      { maxActivities: 10, maxGroupsPerActivity: 30 },
};
const getPlanLimits = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS['free'];

export function crearRouterTulClases({ pool, clubId, permisos, gruposDe, grupoSuyo }) {
    const router = express.Router();

    // Un instructor solo ve y toca las clases que lleva él. De quién es una
    // clase sale del horario: cada sesión guarda su instructorId.
    const soloSuyos = (req) => !!permisos?.(req)?.soloSusGrupos;

    // Corta la petición si el grupo no es suyo. Devuelve true cuando ya se ha
    // respondido, para poder salir del handler sin más.
    async function ajeno(req, res, groupId) {
        if (!soloSuyos(req)) return false;
        if (await grupoSuyo(req, groupId)) return false;
        res.status(403).json({ error: 'Esa clase no es tuya.' });
        return true;
    }

    // Los reportes de un instructor son los suyos y solo los suyos: se le fuerza
    // el filtro por su id y se le quita el de actividad, que en buildSegFilter
    // tiene preferencia y le dejaría ver los de toda la actividad.
    router.use('/report', (req, res, next) => {
        if (soloSuyos(req)) {
            req.query.instructorId = req.userSession.userId;
            delete req.query.activityId;
        }
        next();
    });

    // ── Actividades ──────────────────────────────────────────────────────────
    router.get('/activities', async (req, res) => {
        try {
            const result = await pool.query(
                'SELECT activity_id as id, club_id as "organizationId", name, icon, activity_type as "activityType" FROM tul_activities WHERE club_id = $1 ORDER BY name',
                [clubId]
            );
            res.json({ success: true, activities: result.rows });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/activities', async (req, res) => {
        const { name, icon, activityType } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
        try {
            const clubRes = await pool.query('SELECT plan FROM tul_clubs WHERE club_id = $1', [clubId]);
            const plan = clubRes.rows[0]?.plan || 'free';
            const limits = getPlanLimits(plan);
            const countRes = await pool.query('SELECT COUNT(*) FROM tul_activities WHERE club_id = $1', [clubId]);
            if (parseInt(countRes.rows[0].count) >= limits.maxActivities) {
                return res.status(403).json({ error: `Tu plan (${plan}) permite un máximo de ${limits.maxActivities} actividad(es).` });
            }
            const result = await pool.query(
                'INSERT INTO tul_activities (club_id, name, icon, activity_type) VALUES ($1, $2, $3, $4) RETURNING activity_id as id, club_id as "organizationId", name, icon, activity_type as "activityType"',
                [clubId, name.trim(), icon || 'run', activityType || 'general']
            );
            res.status(201).json({ success: true, activity: result.rows[0] });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.put('/activities/:activityId', async (req, res) => {
        const { name, icon, activityType } = req.body;
        try {
            const result = await pool.query(
                'UPDATE tul_activities SET name = $1, icon = $2, activity_type = COALESCE($3, activity_type) WHERE activity_id = $4 AND club_id = $5 RETURNING activity_id as id, club_id as "organizationId", name, icon, activity_type as "activityType"',
                [name, icon, activityType, req.params.activityId, clubId]
            );
            if (result.rowCount === 0) return res.status(404).json({ error: 'Actividad no encontrada.' });
            res.json({ success: true, activity: result.rows[0] });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/activities/:activityId', async (req, res) => {
        try {
            await pool.query('DELETE FROM tul_activities WHERE activity_id = $1 AND club_id = $2', [req.params.activityId, clubId]);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── Grupos ───────────────────────────────────────────────────────────────
    router.get('/groups', async (req, res) => {
        try {
            const mios = soloSuyos(req) ? await gruposDe(req.userSession.userId) : null;
            const result = await pool.query(`
                SELECT g.group_id as id, g.activity_id as "activityId", g.name, g.time,
                       g.max_students as "maxStudents", g.min_age as "minAge", g.max_age as "maxAge", g.sessions,
                       (SELECT COUNT(*) FROM tul_group_students gs WHERE gs.group_id = g.group_id) as "studentCount"
                FROM tul_groups g
                JOIN tul_activities a ON g.activity_id = a.activity_id
                WHERE a.club_id = $1
                  AND ($2::uuid[] IS NULL OR g.group_id = ANY($2::uuid[]))
                ORDER BY g.name`, [clubId, mios]);
            res.json({ success: true, groups: result.rows, soloMios: !!mios });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/groups', async (req, res) => {
        const { activityId, name, time, maxStudents, sessions, minAge, maxAge } = req.body;
        if (!activityId || !name?.trim()) return res.status(400).json({ error: 'Actividad y nombre son obligatorios.' });
        try {
            // La actividad debe ser de nuestro club: no fiarse del id recibido.
            const propia = await pool.query('SELECT 1 FROM tul_activities WHERE activity_id = $1 AND club_id = $2', [activityId, clubId]);
            if (!propia.rowCount) return res.status(404).json({ error: 'Esa actividad no es de este club.' });

            const clubRes = await pool.query('SELECT plan FROM tul_clubs WHERE club_id = $1', [clubId]);
            const plan = clubRes.rows[0]?.plan || 'free';
            const limits = getPlanLimits(plan);
            const countRes = await pool.query('SELECT COUNT(*) FROM tul_groups WHERE activity_id = $1', [activityId]);
            if (parseInt(countRes.rows[0].count) >= limits.maxGroupsPerActivity) {
                return res.status(403).json({ error: `Tu plan (${plan}) permite un máximo de ${limits.maxGroupsPerActivity} grupo(s) por actividad.` });
            }

            const maxStudentsVal = maxStudents ? parseInt(maxStudents) : null;
            const minAgeVal = minAge ? parseInt(minAge) : null;
            const maxAgeVal = maxAge ? parseInt(maxAge) : null;
            const sessionsVal = sessions && Array.isArray(sessions) && sessions.length > 0 ? JSON.stringify(sessions) : null;

            const result = await pool.query(
                `INSERT INTO tul_groups (activity_id, name, time, max_students, sessions, min_age, max_age)
                 VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
                 RETURNING group_id as id, activity_id as "activityId", name, time,
                           max_students as "maxStudents", sessions, min_age as "minAge", max_age as "maxAge",
                           0 as "studentCount"`,
                [activityId, name.trim(), time || '', maxStudentsVal, sessionsVal, minAgeVal, maxAgeVal]
            );
            res.status(201).json({ success: true, group: result.rows[0] });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.put('/groups/:groupId', async (req, res) => {
        if (await ajeno(req, res, req.params.groupId)) return;
        const { name, time, maxStudents, sessions, minAge, maxAge } = req.body;
        try {
            const maxStudentsVal = maxStudents != null && maxStudents !== '' ? parseInt(maxStudents) : null;
            const minAgeVal = minAge != null && minAge !== '' ? parseInt(minAge) : null;
            const maxAgeVal = maxAge != null && maxAge !== '' ? parseInt(maxAge) : null;
            const sessionsVal = sessions && Array.isArray(sessions) && sessions.length > 0 ? JSON.stringify(sessions) : null;
            const result = await pool.query(
                `UPDATE tul_groups g SET name = $1, time = $2, max_students = $3, sessions = $4::jsonb, min_age = $5, max_age = $6
                 FROM tul_activities a
                 WHERE g.group_id = $7 AND a.activity_id = g.activity_id AND a.club_id = $8
                 RETURNING g.group_id as id, g.activity_id as "activityId", g.name, g.time,
                           g.max_students as "maxStudents", g.sessions, g.min_age as "minAge", g.max_age as "maxAge"`,
                [name, time || '', maxStudentsVal, sessionsVal, minAgeVal, maxAgeVal, req.params.groupId, clubId]
            );
            if (result.rowCount === 0) return res.status(404).json({ error: 'Grupo no encontrado.' });
            res.json({ success: true, group: result.rows[0] });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/groups/:groupId', async (req, res) => {
        if (await ajeno(req, res, req.params.groupId)) return;
        try {
            await pool.query(
                `DELETE FROM tul_groups g USING tul_activities a
                 WHERE g.group_id = $1 AND a.activity_id = g.activity_id AND a.club_id = $2`,
                [req.params.groupId, clubId]
            );
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── Apoyo para el editor de sesiones ─────────────────────────────────────
    router.get('/aulas', async (req, res) => {
        try {
            const result = await pool.query(
                'SELECT aula_id as id, name, capacity, description, color FROM tul_aulas WHERE club_id = $1 ORDER BY name', [clubId]);
            res.json({ success: true, aulas: result.rows });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/instructors', async (req, res) => {
        // Un instructor no elige a otro en los filtros: solo se ve a sí mismo.
        if (soloSuyos(req)) {
            const yo = await pool.query(
                `SELECT user_id AS id, name, surname FROM users WHERE user_id = $1`,
                [req.userSession.userId]
            );
            return res.json({ success: true, instructors: yo.rows });
        }
        try {
            const result = await pool.query(
                `SELECT user_id as id, email, name, surname, role, activity_ids as "activityIds"
                 FROM users WHERE club_id = $1 AND (role = 'instructor' OR role = 'club_owner')
                 ORDER BY role DESC, name ASC`, [clubId]);
            res.json({
                success: true,
                instructors: result.rows.map(r => ({
                    id: r.id, email: r.email, name: `${r.name} ${r.surname || ''}`.trim(),
                    role: r.role, activityIds: r.activityIds || [],
                })),
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── Alumnos de un grupo, matrícula y baja ────────────────────────────────
    router.get('/groups/:groupId/students', async (req, res) => {
        if (await ajeno(req, res, req.params.groupId)) return;
        try {
            const result = await pool.query(`
                SELECT u.user_id as id, u.email, CONCAT(u.name, ' ', COALESCE(u.surname, '')) as name,
                       COALESCE(u.belt_level, 0)            as rank,
                       COALESCE(u.belt, 'Blanco (10º Gup)') as "beltName",
                       a.activity_id AS "activityId", a.activity_type AS tipo,
                       up.level_order AS "levelOrder", up.level_name AS "levelName"
                FROM users u
                JOIN tul_group_students gs ON u.user_id = gs.student_id
                JOIN tul_groups g ON gs.group_id = g.group_id
                JOIN tul_activities a ON g.activity_id = a.activity_id
                LEFT JOIN tul_user_progression up
                       ON up.user_id = u.user_id AND up.activity_id = a.activity_id
                WHERE gs.group_id = $1 AND a.club_id = $2
                ORDER BY name`, [req.params.groupId, clubId]);
            const tipo = result.rows[0]?.tipo;
            const escala = tipo ? await escalaDe(tipo, pool) : [];
            const porOrden = Object.fromEntries(escala.map(n => [n.order, n]));
            res.json({
                success: true,
                escala,
                students: result.rows.map(s => ({
                    ...s, name: s.name.trim(),
                    nivel: s.levelOrder != null ? porOrden[s.levelOrder] || { name: s.levelName, color: '#DDD' } : null,
                })),
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Poner el rango de un alumno en la actividad de una clase. Se usa al
    // matricular y al apuntar a la espera, para no tener que ir luego a su ficha.
    async function fijarNivel(groupId, studentId, levelOrder) {
        const a = await pool.query(
            `SELECT a.activity_id, a.activity_type FROM tul_groups g
             JOIN tul_activities a ON a.activity_id = g.activity_id
             WHERE g.group_id = $1 AND a.club_id = $2`, [groupId, clubId]);
        if (!a.rowCount) return;
        const { activity_id, activity_type } = a.rows[0];
        const nivel = (await escalaDe(activity_type, pool)).find(n => n.order === Number(levelOrder));
        if (!nivel) return;
        await pool.query(
            `INSERT INTO tul_user_progression (user_id, activity_id, activity_type, level_order, level_name, updated_at)
             VALUES ($1,$2,$3,$4,$5,NOW())
             ON CONFLICT (user_id, activity_id) DO UPDATE
               SET level_order = excluded.level_order, level_name = excluded.level_name, updated_at = NOW()`,
            [studentId, activity_id, activity_type, nivel.order, nivel.name]);
        await pool.query(
            `INSERT INTO tul_user_progression_history (user_id, activity_id, activity_type, level_order, level_name, updated_at)
             VALUES ($1,$2,$3,$4,$5,NOW())`,
            [studentId, activity_id, activity_type, nivel.order, nivel.name]);
        if (activity_type === TIPO_TAEKWONDO) {
            await pool.query('UPDATE users SET belt = $1, belt_level = $2 WHERE user_id = $3',
                [nivel.name, nivel.order, studentId]);
        }
    }

    // Buscar alumnos del club para matricular.
    router.get('/students', async (req, res) => {
        const q = `%${(req.query.q || '').trim()}%`;
        const act = req.query.activityId || null;
        try {
            const result = await pool.query(
                `SELECT u.user_id as id, CONCAT(u.name, ' ', COALESCE(u.surname, '')) as name, u.email,
                        u.birthday, up.level_order AS "levelOrder", up.level_name AS "levelName"
                 FROM users u
                 LEFT JOIN tul_user_progression up
                        ON up.user_id = u.user_id AND up.activity_id = $3::uuid
                 WHERE u.club_id = $1 AND u.role IN ('student', 'instructor', 'club_owner')
                   AND (u.name ILIKE $2 OR u.surname ILIKE $2 OR CONCAT(u.name,' ',COALESCE(u.surname,'')) ILIKE $2 OR u.email ILIKE $2)
                 ORDER BY u.surname, u.name LIMIT 25`, [clubId, q, act]);
            res.json({ success: true, students: result.rows.map(s => ({ ...s, name: s.name.trim() })) });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/groups/:groupId/students/enroll', async (req, res) => {
        if (await ajeno(req, res, req.params.groupId)) return;
        const { studentId, levelOrder } = req.body;
        try {
            const groupRes = await pool.query(
                `SELECT g.max_students FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE g.group_id = $1 AND a.club_id = $2`, [req.params.groupId, clubId]);
            if (!groupRes.rowCount) return res.status(404).json({ error: 'Grupo no encontrado.' });
            const maxStudents = groupRes.rows[0]?.max_students;
            if (maxStudents !== null && maxStudents !== undefined) {
                const countRes = await pool.query('SELECT COUNT(*) FROM tul_group_students WHERE group_id = $1', [req.params.groupId]);
                const currentCount = parseInt(countRes.rows[0].count);
                if (currentCount >= maxStudents) {
                    return res.status(403).json({ error: `Este grupo ya está lleno (${currentCount}/${maxStudents} alumnos).` });
                }
            }
            await matricular(req.params.groupId, studentId);
            if (levelOrder != null && levelOrder !== '') await fijarNivel(req.params.groupId, studentId, levelOrder);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Cambiar el rango de un alumno en la actividad de una clase, sin salir de ella.
    router.put('/groups/:groupId/students/:studentId/nivel', async (req, res) => {
        if (await ajeno(req, res, req.params.groupId)) return;
        try {
            await fijarNivel(req.params.groupId, req.params.studentId, req.body.levelOrder);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/groups/:groupId/students/:studentId/enroll', async (req, res) => {
        if (await ajeno(req, res, req.params.groupId)) return;
        try {
            await desmatricular(req.params.groupId, req.params.studentId);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Alta y baja de matrícula. Van aparte porque las usan tanto los endpoints
    // de matriculación como la lista de espera, y el histórico tiene que
    // quedar escrito igual en los dos casos: de ahí salen los reportes.
    async function matricular(groupId, studentId) {
        const ins = await pool.query(
            'INSERT INTO tul_group_students (group_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
            [groupId, studentId]
        );
        if (!ins.rowCount) return false;
        const info = await pool.query(
            `SELECT u.club_id, TRIM(CONCAT(u.name,' ',COALESCE(u.surname,''))) as student_name,
                    g.name as group_name, a.name as activity_name
             FROM users u
             JOIN tul_groups g ON g.group_id = $1
             JOIN tul_activities a ON a.activity_id = g.activity_id
             WHERE u.user_id = $2`, [groupId, studentId]);
        if (info.rowCount) {
            const { club_id, student_name, group_name, activity_name } = info.rows[0];
            await pool.query(
                `INSERT INTO tul_enrollment_history (club_id, group_id, student_id, student_name, group_name, activity_name, action)
                 VALUES ($1,$2,$3,$4,$5,$6,'enrolled')`,
                [club_id, groupId, studentId, student_name, group_name, activity_name]);
        }
        return true;
    }

    async function desmatricular(groupId, studentId) {
        const info = await pool.query(
            `SELECT u.club_id, TRIM(CONCAT(u.name,' ',COALESCE(u.surname,''))) as student_name,
                    g.name as group_name, a.name as activity_name
             FROM users u
             JOIN tul_groups g ON g.group_id = $1
             JOIN tul_activities a ON a.activity_id = g.activity_id
             WHERE u.user_id = $2 AND a.club_id = $3`, [groupId, studentId, clubId]);
        if (info.rowCount) {
            const { club_id, student_name, group_name, activity_name } = info.rows[0];
            await pool.query(
                `INSERT INTO tul_enrollment_history (club_id, group_id, student_id, student_name, group_name, activity_name, action)
                 VALUES ($1,$2,$3,$4,$5,$6,'unenrolled')`,
                [club_id, groupId, studentId, student_name, group_name, activity_name]);
        }
        await pool.query('DELETE FROM tul_group_students WHERE group_id = $1 AND student_id = $2', [groupId, studentId]);
    }

    // ── Rangos de los alumnos ────────────────────────────────────────────────
    // Cada actividad tiene su escala y no se pisan: el mismo alumno puede ser
    // cinturón azul de Taekwondo y Grado 3 de Ballet. Los valores válidos salen
    // del catálogo, así que no se puede escribir un rango que no existe.

    router.get('/escalas', async (req, res) => {
        try {
            res.set('Cache-Control', 'no-store');
            res.json({ actividades: await escalasDelClub(pool, clubId) });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Los rangos de todos los alumnos de golpe, para pintarlos en el listado.
    // Son pocas filas (una por alumno y actividad), así que va en una consulta.
    router.get('/rangos', async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT up.user_id AS "userId", a.name AS actividad, a.activity_type AS tipo,
                        up.level_order AS "levelOrder", up.level_name AS "levelName"
                 FROM tul_user_progression up
                 JOIN tul_activities a ON a.activity_id = up.activity_id
                 WHERE a.club_id = $1
                 ORDER BY a.name`, [clubId]
            );
            const colores = {};
            for (const tipo of new Set(r.rows.map(x => x.tipo))) {
                colores[tipo] = Object.fromEntries((await escalaDe(tipo, pool)).map(n => [n.order, n]));
            }
            const porAlumno = {};
            for (const x of r.rows) {
                const n = colores[x.tipo]?.[x.levelOrder];
                (porAlumno[x.userId] ||= []).push({
                    actividad: x.actividad, levelName: x.levelName,
                    color: n?.color || '#DDD', textColor: n?.textColor,
                    punta: n?.punta || null, borde: n?.borde || null,
                });
            }
            res.set('Cache-Control', 'no-store');
            res.json({ rangos: porAlumno });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Ficha completa de un alumno: sus clases y su rango en cada actividad.
    router.get('/students/:studentId/ficha', async (req, res) => {
        const { studentId } = req.params;
        try {
            const [clases, rangos, acts] = await Promise.all([
                pool.query(
                    `SELECT g.group_id AS "groupId", g.name AS grupo, g.time,
                            a.activity_id AS "activityId", a.name AS actividad, a.activity_type AS tipo
                     FROM tul_group_students gs
                     JOIN tul_groups g ON g.group_id = gs.group_id
                     JOIN tul_activities a ON a.activity_id = g.activity_id
                     WHERE gs.student_id = $1 AND a.club_id = $2
                     ORDER BY a.name, g.name`, [studentId, clubId]),
                pool.query(
                    `SELECT up.activity_id AS "activityId", up.level_order AS "levelOrder",
                            up.level_name AS "levelName", up.updated_at AS "updatedAt"
                     FROM tul_user_progression up
                     JOIN tul_activities a ON a.activity_id = up.activity_id
                     WHERE up.user_id = $1 AND a.club_id = $2`, [studentId, clubId]),
                pool.query(
                    `SELECT DISTINCT a.activity_id AS id FROM tul_enrollment_history h
                     JOIN tul_groups g ON g.group_id = h.group_id
                     JOIN tul_activities a ON a.activity_id = g.activity_id
                     WHERE h.student_id = $1 AND a.club_id = $2`, [studentId, clubId]),
            ]);
            // Actividades a las que va o ha ido: son las que le aplican rango.
            const suyas = new Set([...clases.rows.map(c => c.activityId), ...acts.rows.map(a => a.id),
                ...rangos.rows.map(r => r.activityId)]);
            res.set('Cache-Control', 'no-store');
            res.json({
                clases: clases.rows,
                rangos: Object.fromEntries(rangos.rows.map(r => [r.activityId, r])),
                actividadesDelAlumno: [...suyas],
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Fijar el rango de un alumno en una actividad. El nivel tiene que existir
    // en la escala de esa actividad.
    router.put('/students/:studentId/rango', async (req, res) => {
        const { activityId, levelOrder } = req.body;
        const client = await pool.connect();
        try {
            const a = await client.query(
                'SELECT activity_type AS tipo, name FROM tul_activities WHERE activity_id = $1 AND club_id = $2',
                [activityId, clubId]
            );
            if (!a.rowCount) return res.status(404).json({ error: 'Esa actividad no es de este club.' });
            const tipo = a.rows[0].tipo;
            const escala = await escalaDe(tipo, pool);
            if (!escala.length) return res.status(409).json({ error: `${a.rows[0].name} no tiene rangos.` });
            const nivel = escala.find(n => n.order === Number(levelOrder));
            if (!nivel) return res.status(400).json({ error: 'Ese nivel no existe en la escala de la actividad.' });

            await client.query('BEGIN');
            await client.query(
                `INSERT INTO tul_user_progression (user_id, activity_id, activity_type, level_order, level_name, updated_at)
                 VALUES ($1,$2,$3,$4,$5,NOW())
                 ON CONFLICT (user_id, activity_id) DO UPDATE
                   SET level_order = excluded.level_order, level_name = excluded.level_name, updated_at = NOW()`,
                [req.params.studentId, activityId, tipo, nivel.order, nivel.name]
            );
            await client.query(
                `INSERT INTO tul_user_progression_history (user_id, activity_id, activity_type, level_order, level_name, updated_at)
                 VALUES ($1,$2,$3,$4,$5,NOW())`,
                [req.params.studentId, activityId, tipo, nivel.order, nivel.name]
            );
            // En Taekwondo, el cinturón global del usuario se mantiene igual que
            // en Learning Dungeon: otras partes de su app siguen leyendo de ahí.
            if (tipo === TIPO_TAEKWONDO) {
                await client.query('UPDATE users SET belt = $1, belt_level = $2 WHERE user_id = $3',
                    [nivel.name, nivel.order, req.params.studentId]);
                await client.query(
                    'INSERT INTO tul_user_belts (user_id, belt_level, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT DO NOTHING',
                    [req.params.studentId, nivel.order]);
            }
            await client.query('COMMIT');
            res.json({ success: true, nivel });
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            res.status(500).json({ error: err.message });
        } finally { client.release(); }
    });

    // Matricular a un alumno en una clase desde su propia ficha, poniéndole de
    // paso su rango en esa actividad si aún no lo tiene.
    router.post('/students/:studentId/clases', async (req, res) => {
        const { groupId, levelOrder } = req.body;
        try {
            const g = await pool.query(
                `SELECT g.max_students, a.activity_id, a.activity_type,
                        (SELECT COUNT(*)::int FROM tul_group_students gs WHERE gs.group_id = g.group_id) AS n
                 FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE g.group_id = $1 AND a.club_id = $2`, [groupId, clubId]
            );
            if (!g.rowCount) return res.status(404).json({ error: 'Esa clase no es de este club.' });
            const info = g.rows[0];
            if (info.max_students && info.n >= info.max_students) {
                return res.status(409).json({ error: `Esa clase está llena (${info.n}/${info.max_students}). Puedes apuntarle a la lista de espera.` });
            }
            await matricular(groupId, req.params.studentId);
            if (levelOrder != null && levelOrder !== '') {
                const escala = await escalaDe(info.activity_type, pool);
                const nivel = escala.find(n => n.order === Number(levelOrder));
                if (nivel) {
                    await pool.query(
                        `INSERT INTO tul_user_progression (user_id, activity_id, activity_type, level_order, level_name, updated_at)
                         VALUES ($1,$2,$3,$4,$5,NOW())
                         ON CONFLICT (user_id, activity_id) DO UPDATE
                           SET level_order = excluded.level_order, level_name = excluded.level_name, updated_at = NOW()`,
                        [req.params.studentId, info.activity_id, info.activity_type, nivel.order, nivel.name]);
                    if (info.activity_type === TIPO_TAEKWONDO) {
                        await pool.query('UPDATE users SET belt = $1, belt_level = $2 WHERE user_id = $3',
                            [nivel.name, nivel.order, req.params.studentId]);
                    }
                }
            }
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/students/:studentId/clases/:groupId', async (req, res) => {
        try {
            await desmatricular(req.params.groupId, req.params.studentId);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── Lista de espera ──────────────────────────────────────────────────────
    // Cuando una clase está llena, el alumno se apunta y guarda su turno por
    // orden de llegada. Puede quedarse mientras tanto en otra hora, de la que
    // se le da de baja cuando entra en la que quería.

    // Estado de la espera de todo el club: quién espera qué, en qué puesto, y
    // dónde hay plazas libres con gente esperando.
    router.get('/espera', async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT e.id, e.group_id AS "groupId", e.student_id AS "studentId",
                        e.grupo_provisional_id AS "provisionalId", e.nota, e.created_at AS "createdAt",
                        g.name AS "grupoNombre", g.max_students AS "maxStudents",
                        a.name AS "actividad",
                        TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS alumno,
                        gp.name AS "provisionalNombre", ap.name AS "provisionalActividad",
                        a.activity_type AS tipo, up.level_order AS "levelOrder", up.level_name AS "levelName",
                        (SELECT COUNT(*)::int FROM tul_group_students gs WHERE gs.group_id = e.group_id) AS ocupadas
                 FROM aim_lista_espera e
                 JOIN tul_groups g ON g.group_id = e.group_id
                 JOIN tul_activities a ON a.activity_id = g.activity_id
                 JOIN users u ON u.user_id = e.student_id
                 LEFT JOIN tul_user_progression up ON up.user_id = e.student_id AND up.activity_id = a.activity_id
                 LEFT JOIN tul_groups gp ON gp.group_id = e.grupo_provisional_id
                 LEFT JOIN tul_activities ap ON ap.activity_id = gp.activity_id
                 WHERE e.estado = 'esperando' AND a.club_id = $1
                 ORDER BY e.group_id, e.created_at`, [clubId]
            );
            // El puesto es la posición dentro de su grupo, por orden de llegada.
            const porGrupo = new Map();
            const filas = r.rows.map(x => {
                const n = (porGrupo.get(x.groupId) || 0) + 1;
                porGrupo.set(x.groupId, n);
                const libres = x.maxStudents ? Math.max(0, x.maxStudents - x.ocupadas) : null;
                return {
                    ...x, puesto: n,
                    plazasLibres: libres,
                    // Le toca si hay tantas plazas libres como su puesto.
                    leToca: libres != null && libres >= n,
                };
            });
            res.set('Cache-Control', 'no-store');
            res.json({
                total: filas.length,
                conPlaza: filas.filter(f => f.leToca).length,
                filas,
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/groups/:groupId/espera', async (req, res) => {
        if (await ajeno(req, res, req.params.groupId)) return;
        const { studentId, grupoProvisionalId, nota, levelOrder } = req.body;
        if (!studentId) return res.status(400).json({ error: 'Falta el alumno.' });
        try {
            const g = await pool.query(
                `SELECT g.group_id FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE g.group_id = $1 AND a.club_id = $2`, [req.params.groupId, clubId]
            );
            if (!g.rowCount) return res.status(404).json({ error: 'Esa clase no es de este club.' });
            const ya = await pool.query(
                'SELECT 1 FROM tul_group_students WHERE group_id = $1 AND student_id = $2',
                [req.params.groupId, studentId]
            );
            if (ya.rowCount) return res.status(409).json({ error: 'Ese alumno ya está matriculado en esta clase.' });

            // Si se le pone una hora alternativa, se le matricula de verdad en
            // ella: va a esa clase mientras espera.
            if (grupoProvisionalId) {
                const gp = await pool.query(
                    `SELECT g.max_students,
                            (SELECT COUNT(*)::int FROM tul_group_students gs WHERE gs.group_id = g.group_id) AS n
                     FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                     WHERE g.group_id = $1 AND a.club_id = $2`, [grupoProvisionalId, clubId]
                );
                if (!gp.rowCount) return res.status(404).json({ error: 'La clase alternativa no es de este club.' });
                if (gp.rows[0].max_students && gp.rows[0].n >= gp.rows[0].max_students) {
                    return res.status(409).json({ error: 'La clase alternativa también está llena.' });
                }
                await matricular(grupoProvisionalId, studentId);
            }

            const ins = await pool.query(
                `INSERT INTO aim_lista_espera (group_id, student_id, grupo_provisional_id, nota, apuntado_por)
                 VALUES ($1,$2,$3,$4,$5)
                 ON CONFLICT (group_id, student_id) WHERE estado = 'esperando' DO NOTHING
                 RETURNING id`,
                [req.params.groupId, studentId, grupoProvisionalId || null, nota?.trim() || null, req.userSession.userId]
            );
            if (!ins.rowCount) return res.status(409).json({ error: 'Ese alumno ya estaba en la lista de espera de esta clase.' });
            if (levelOrder != null && levelOrder !== '') await fijarNivel(req.params.groupId, studentId, levelOrder);
            res.status(201).json({ success: true, id: ins.rows[0].id });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/espera/:id', async (req, res) => {
        try {
            await pool.query(
                `UPDATE aim_lista_espera SET estado = 'cancelado', resuelto_at = NOW(), resuelto_por = $2
                 WHERE id = $1 AND estado = 'esperando'`, [req.params.id, req.userSession.userId]
            );
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Darle la plaza: alta en la clase que esperaba y baja de la provisional.
    router.post('/espera/:id/asignar', async (req, res) => {
        try {
            const e = await pool.query(
                `SELECT e.*, g.max_students,
                        (SELECT COUNT(*)::int FROM tul_group_students gs WHERE gs.group_id = e.group_id) AS ocupadas
                 FROM aim_lista_espera e
                 JOIN tul_groups g ON g.group_id = e.group_id
                 JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE e.id = $1 AND e.estado = 'esperando' AND a.club_id = $2`, [req.params.id, clubId]
            );
            if (!e.rowCount) return res.status(404).json({ error: 'Esa espera ya no está activa.' });
            const esp = e.rows[0];
            if (esp.max_students && esp.ocupadas >= esp.max_students) {
                return res.status(409).json({ error: 'La clase sigue llena.' });
            }
            await matricular(esp.group_id, esp.student_id);
            if (esp.grupo_provisional_id) await desmatricular(esp.grupo_provisional_id, esp.student_id);
            await pool.query(
                `UPDATE aim_lista_espera SET estado = 'resuelto', resuelto_at = NOW(), resuelto_por = $2 WHERE id = $1`,
                [req.params.id, req.userSession.userId]
            );
            res.json({ success: true, dejoProvisional: !!esp.grupo_provisional_id });
        } catch (err) {
            console.error('Error asignando plaza de la lista de espera:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── Pasar lista de una clase ─────────────────────────────────────────────
    // Escribe en tul_attendance con los mismos estados y el mismo formato que
    // Learning Dungeon (present / absent / late, is_auto), para que lo que se
    // marque aquí lo vea su app y al revés.
    const ESTADOS_ASISTENCIA = ['present', 'absent', 'late'];

    // Qué clases tocan un día concreto, según los días de sus sesiones.
    router.get('/attendance/dia/:fecha', async (req, res) => {
        const { fecha } = req.params;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'Fecha no válida.' });
        try {
            // getDay() da 0=domingo; en aim-tul las sesiones usan 0=lunes.
            const js = new Date(fecha + 'T12:00:00').getDay();
            const diaSemana = (js + 6) % 7;
            const r = await pool.query(
                `SELECT g.group_id AS id, g.name, g.sessions, g.max_students AS "maxStudents", a.name AS "activityName",
                        (SELECT COUNT(*) FROM tul_group_students gs WHERE gs.group_id = g.group_id)::int AS "studentCount"
                 FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE a.club_id = $1
                   AND ($2::uuid[] IS NULL OR g.group_id = ANY($2::uuid[]))
                 ORDER BY a.name, g.name`,
                [clubId, soloSuyos(req) ? await gruposDe(req.userSession.userId) : null]
            );
            const marcados = await pool.query(
                `SELECT at.group_id, COUNT(*)::int n FROM tul_attendance at
                 JOIN tul_groups g ON g.group_id = at.group_id
                 JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE a.club_id = $1 AND at.date = $2::date GROUP BY 1`, [clubId, fecha]
            );
            const yaMarcados = Object.fromEntries(marcados.rows.map(x => [x.group_id, x.n]));
            const clases = [];
            for (const g of r.rows) {
                const ses = (Array.isArray(g.sessions) ? g.sessions : [])
                    .filter(s => (s?.days || []).map(Number).includes(diaSemana));
                if (!ses.length) continue;
                clases.push({
                    id: g.id, name: g.name, activityName: g.activityName,
                    studentCount: g.studentCount, maxStudents: g.maxStudents,
                    horario: ses.map(s => `${s.startTime || ''}${s.endTime ? `–${s.endTime}` : ''}${s.aulaName ? ` · ${s.aulaName}` : ''}`).join(' | '),
                    instructor: ses.map(s => s.instructorName).filter(Boolean)[0] || null,
                    hora: ses[0]?.startTime || '',
                    marcados: yaMarcados[g.id] || 0,
                });
            }
            clases.sort((a, b) => String(a.hora).localeCompare(String(b.hora)) || a.name.localeCompare(b.name));
            res.set('Cache-Control', 'no-store');
            res.json({ fecha, clases });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Alumnos de una clase con lo que tengan marcado ese día.
    router.get('/groups/:groupId/attendance/:fecha', async (req, res) => {
        const { groupId, fecha } = req.params;
        if (await ajeno(req, res, groupId)) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'Fecha no válida.' });
        try {
            const r = await pool.query(
                `SELECT u.user_id AS id, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS nombre,
                        COALESCE(u.belt, '') AS cinturon, at.status, at.is_auto AS "isAuto"
                 FROM tul_group_students gs
                 JOIN users u ON u.user_id = gs.student_id
                 JOIN tul_groups g ON g.group_id = gs.group_id
                 JOIN tul_activities a ON a.activity_id = g.activity_id
                 LEFT JOIN tul_attendance at ON at.group_id = gs.group_id AND at.student_id = gs.student_id AND at.date = $2::date
                 WHERE gs.group_id = $1 AND a.club_id = $3
                 ORDER BY u.surname, u.name`, [groupId, fecha, clubId]
            );
            res.set('Cache-Control', 'no-store');
            res.json({ fecha, alumnos: r.rows });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/groups/:groupId/attendance', async (req, res) => {
        if (await ajeno(req, res, req.params.groupId)) return;
        const { studentId, fecha, status } = req.body;
        if (!ESTADOS_ASISTENCIA.includes(status)) return res.status(400).json({ error: 'Estado no válido.' });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return res.status(400).json({ error: 'Fecha no válida.' });
        try {
            const propio = await pool.query(
                `SELECT 1 FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE g.group_id = $1 AND a.club_id = $2`, [req.params.groupId, clubId]
            );
            if (!propio.rowCount) return res.status(404).json({ error: 'Esa clase no es de este club.' });
            // is_auto a false: lo ha marcado una persona, no el generador automático.
            const existe = await pool.query(
                'SELECT attendance_id FROM tul_attendance WHERE group_id = $1 AND student_id = $2 AND date = $3::date',
                [req.params.groupId, studentId, fecha]
            );
            if (existe.rowCount) {
                await pool.query('UPDATE tul_attendance SET status = $1, is_auto = FALSE WHERE attendance_id = $2',
                    [status, existe.rows[0].attendance_id]);
            } else {
                await pool.query(
                    'INSERT INTO tul_attendance (group_id, student_id, date, status, is_auto) VALUES ($1, $2, $3::date, $4, FALSE)',
                    [req.params.groupId, studentId, fecha, status]);
            }
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Marcar de golpe a todos los que aún no tienen nada ese día.
    router.post('/groups/:groupId/attendance/todos', async (req, res) => {
        if (await ajeno(req, res, req.params.groupId)) return;
        const { fecha, status } = req.body;
        if (!ESTADOS_ASISTENCIA.includes(status)) return res.status(400).json({ error: 'Estado no válido.' });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return res.status(400).json({ error: 'Fecha no válida.' });
        try {
            const r = await pool.query(
                `INSERT INTO tul_attendance (group_id, student_id, date, status, is_auto)
                 SELECT gs.group_id, gs.student_id, $2::date, $3, FALSE
                 FROM tul_group_students gs
                 JOIN tul_groups g ON g.group_id = gs.group_id
                 JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE gs.group_id = $1 AND a.club_id = $4
                   AND NOT EXISTS (
                     SELECT 1 FROM tul_attendance at
                     WHERE at.group_id = gs.group_id AND at.student_id = gs.student_id AND at.date = $2::date)
                 RETURNING attendance_id`, [req.params.groupId, fecha, status, clubId]
            );
            res.json({ success: true, marcados: r.rowCount });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── Reportes ─────────────────────────────────────────────────────────────
    // Portados uno a uno de aim-tul; misma matemática y mismos nombres de campo
    // para que las dos apps cuenten lo mismo.

    const buildSegFilter = (paramsArr, { activityId, instructorId }) => {
        if (activityId) {
            paramsArr.push(activityId);
            return ` AND g.activity_id = $${paramsArr.length}::UUID`;
        }
        if (instructorId) {
            paramsArr.push(instructorId);
            return ` AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(g.sessions, '[]'::jsonb)) sess
                WHERE sess->>'instructorId' = $${paramsArr.length}
            )`;
        }
        return '';
    };

    // Quién estaba matriculado en una fecha dada. Se reconstruye desde la
    // matrícula de hoy deshaciendo hacia atrás los movimientos posteriores: sin
    // esto, los KPIs del informe daban siempre lo mismo aunque se cambiara de
    // mes, porque miraban el estado actual.
    async function matriculasEn(hasta) {
        const actuales = await pool.query(
            `SELECT gs.student_id AS "studentId", gs.group_id AS "groupId"
             FROM tul_group_students gs
             JOIN tul_groups g ON g.group_id = gs.group_id
             JOIN tul_activities a ON a.activity_id = g.activity_id
             WHERE a.club_id = $1`, [clubId]
        );
        const set = new Set(actuales.rows.map(r => `${r.studentId}|${r.groupId}`));
        if (!hasta) return set;
        // Del más reciente al más antiguo, deshaciendo cada movimiento.
        const posteriores = await pool.query(
            `SELECT student_id AS "studentId", group_id AS "groupId", action
             FROM tul_enrollment_history
             WHERE club_id = $1 AND created_at > ($2::date + INTERVAL '1 day')
             ORDER BY created_at DESC`, [clubId, hasta]
        );
        for (const ev of posteriores.rows) {
            const clave = `${ev.studentId}|${ev.groupId}`;
            if (ev.action === 'enrolled') set.delete(clave);
            else set.add(clave);
        }
        return set;
    }

    router.get('/report/overview', async (req, res) => {
        try {
            const { activityId, instructorId, hasta } = req.query;
            const segParams = [clubId];
            const segFilter = buildSegFilter(segParams, { activityId, instructorId });

            // Con fecha, el informe se calcula sobre la matrícula de ese momento.
            if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
                return res.json(await overviewEnFecha(hasta, { activityId, instructorId }));
            }

            const summaryRes = await pool.query(
                `WITH filtered_groups AS (
                    SELECT g.group_id, g.max_students
                    FROM tul_groups g JOIN tul_activities a ON g.activity_id = a.activity_id
                    WHERE a.club_id = $1 ${segFilter}
                ),
                group_caps AS (
                    SELECT fg.group_id,
                        CASE WHEN fg.max_students IS NOT NULL AND fg.max_students > 0 THEN fg.max_students
                             ELSE COUNT(gs.student_id) + 5 END AS capacity,
                        COUNT(gs.student_id) AS enrolled
                    FROM filtered_groups fg
                    LEFT JOIN tul_group_students gs ON gs.group_id = fg.group_id
                    GROUP BY fg.group_id, fg.max_students
                )
                SELECT
                    (SELECT COUNT(*) FROM filtered_groups)::int as group_count,
                    (SELECT COALESCE(SUM(capacity), 0) FROM group_caps)::int as total_capacity,
                    (SELECT COALESCE(SUM(enrolled), 0) FROM group_caps)::int as total_enrollments,
                    (SELECT COUNT(DISTINCT gs.student_id) FROM filtered_groups fg
                        JOIN tul_group_students gs ON gs.group_id = fg.group_id)::int as student_count`,
                segParams
            );

            const activitiesRes = await pool.query(
                `WITH group_caps AS (
                    SELECT g.group_id, g.activity_id,
                        CASE WHEN g.max_students IS NOT NULL AND g.max_students > 0 THEN g.max_students
                             ELSE COUNT(gs.student_id) + 5 END AS capacity,
                        COUNT(gs.student_id) AS enrolled
                    FROM tul_groups g
                    LEFT JOIN tul_group_students gs ON gs.group_id = g.group_id
                    GROUP BY g.group_id, g.activity_id, g.max_students
                ),
                activity_summary AS (
                    SELECT activity_id, COUNT(group_id)::int AS group_count,
                        SUM(capacity)::int AS total_capacity, SUM(enrolled)::int AS total_enrollments
                    FROM group_caps GROUP BY activity_id
                ),
                activity_students AS (
                    SELECT g.activity_id, COUNT(DISTINCT gs.student_id)::int AS student_count
                    FROM tul_groups g JOIN tul_group_students gs ON gs.group_id = g.group_id
                    GROUP BY g.activity_id
                )
                SELECT a.activity_id as "activityId", a.name,
                    COALESCE(s.group_count, 0) as "groupCount",
                    COALESCE(s.total_capacity, 0) as "totalCapacity",
                    COALESCE(s.total_enrollments, 0) as "totalEnrollments",
                    COALESCE(st.student_count, 0) as "studentCount"
                FROM tul_activities a
                LEFT JOIN activity_summary s ON s.activity_id = a.activity_id
                LEFT JOIN activity_students st ON st.activity_id = a.activity_id
                WHERE a.club_id = $1
                ORDER BY "studentCount" DESC`, [clubId]);

            const groupsRes = await pool.query(
                `SELECT g.group_id as "groupId", g.name, a.name as "activityName",
                    COALESCE(g.max_students, 0)::int as "maxStudents",
                    COUNT(gs.student_id)::int as "studentCount"
                 FROM tul_groups g
                 JOIN tul_activities a ON g.activity_id = a.activity_id
                 LEFT JOIN tul_group_students gs ON gs.group_id = g.group_id
                 WHERE a.club_id = $1 ${segFilter}
                 GROUP BY g.group_id, g.name, a.name, g.max_students
                 ORDER BY a.name, g.name`, segParams);

            const summary = summaryRes.rows[0] || {};
            const totalStudents = parseInt(summary.student_count || 0);
            const totalCapacity = parseInt(summary.total_capacity || 0);
            const groupCount = parseInt(summary.group_count || 0);
            const totalEnrollments = parseInt(summary.total_enrollments || 0);
            const avgStudentsPerGroup = groupCount > 0 ? Math.round(totalEnrollments / groupCount) : 0;
            const activities = activitiesRes.rows.map(r => ({
                ...r,
                capacityPct: r.totalCapacity > 0 ? Math.round((r.totalEnrollments / r.totalCapacity) * 100) : 0,
            }));
            res.json({
                success: true, totalStudents, totalCapacity, avgStudentsPerGroup,
                overallCapacityPct: totalCapacity > 0 ? Math.round((totalEnrollments / totalCapacity) * 100) : 0,
                activities, groups: groupsRes.rows,
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Mismo informe que overview pero a fecha pasada: los grupos y su capacidad
    // se toman de hoy (no hay histórico de eso), y la matrícula se reconstruye.
    async function overviewEnFecha(hasta, { activityId, instructorId }) {
        const [gruposRes, matriculas] = await Promise.all([
            pool.query(
                `SELECT g.group_id AS "groupId", g.name, g.max_students AS "maxStudents",
                        g.sessions, a.activity_id AS "activityId", a.name AS "activityName"
                 FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE a.club_id = $1 ORDER BY a.name, g.name`, [clubId]),
            matriculasEn(hasta),
        ]);
        const enSegmento = (g) => {
            if (activityId) return g.activityId === activityId;
            if (instructorId) {
                const ses = Array.isArray(g.sessions) ? g.sessions : [];
                return ses.some(s => s && s.instructorId === instructorId);
            }
            return true;
        };
        const porGrupo = new Map();
        for (const clave of matriculas) {
            const [studentId, groupId] = clave.split('|');
            if (!porGrupo.has(groupId)) porGrupo.set(groupId, new Set());
            porGrupo.get(groupId).add(studentId);
        }

        const grupos = [], alumnosSegmento = new Set();
        let totalCapacity = 0, totalEnrollments = 0;
        const porActividad = new Map();
        for (const g of gruposRes.rows) {
            const n = porGrupo.get(g.groupId)?.size || 0;
            const cap = g.maxStudents > 0 ? g.maxStudents : n + 5;
            const act = porActividad.get(g.activityId) || { activityId: g.activityId, name: g.activityName, groupCount: 0, totalCapacity: 0, totalEnrollments: 0, alumnos: new Set() };
            act.groupCount++; act.totalCapacity += cap; act.totalEnrollments += n;
            for (const s of porGrupo.get(g.groupId) || []) act.alumnos.add(s);
            porActividad.set(g.activityId, act);

            if (!enSegmento(g)) continue;
            grupos.push({ groupId: g.groupId, name: g.name, activityName: g.activityName, maxStudents: g.maxStudents || 0, studentCount: n });
            totalCapacity += cap; totalEnrollments += n;
            for (const s of porGrupo.get(g.groupId) || []) alumnosSegmento.add(s);
        }
        return {
            success: true, hasta,
            totalStudents: alumnosSegmento.size,
            totalCapacity,
            avgStudentsPerGroup: grupos.length > 0 ? Math.round(totalEnrollments / grupos.length) : 0,
            overallCapacityPct: totalCapacity > 0 ? Math.round((totalEnrollments / totalCapacity) * 100) : 0,
            activities: [...porActividad.values()].map(a => ({
                activityId: a.activityId, name: a.name, groupCount: a.groupCount,
                totalCapacity: a.totalCapacity, totalEnrollments: a.totalEnrollments,
                studentCount: a.alumnos.size,
                capacityPct: a.totalCapacity > 0 ? Math.round((a.totalEnrollments / a.totalCapacity) * 100) : 0,
            })).sort((x, y) => y.studentCount - x.studentCount),
            grupos: undefined, groups: grupos,
        };
    }

    // Histórico de altas/bajas con detección de cambios de horario internos
    // (baja+alta del mismo alumno el mismo día en la misma actividad).
    async function getRosterEvents({ activityId, instructorId } = {}) {
        const histRes = await pool.query(
            `SELECT h.student_id as "studentId", h.student_name as "studentName",
                    h.group_id as "groupId", h.group_name as "groupName",
                    h.activity_name as "activityName", h.action, h.created_at as "createdAt",
                    TO_CHAR(h.created_at, 'DD/MM/YYYY') as date
             FROM tul_enrollment_history h
             WHERE h.club_id = $1
             ORDER BY h.student_id, h.created_at ASC`, [clubId]);
        const groupIds = [...new Set(histRes.rows.map(r => r.groupId).filter(Boolean))];
        const groupInfo = new Map();
        if (groupIds.length > 0) {
            const groupsRes = await pool.query(
                `SELECT group_id as "groupId", activity_id as "activityId", sessions FROM tul_groups WHERE group_id = ANY($1::uuid[])`,
                [groupIds]);
            for (const g of groupsRes.rows) groupInfo.set(g.groupId, g);
        }
        const rows = histRes.rows.map(row => {
            const info = groupInfo.get(row.groupId);
            return { ...row, activityId: info?.activityId ?? null, sessions: info?.sessions ?? [] };
        });

        const matchesSegment = (row) => {
            if (instructorId) {
                const sessions = Array.isArray(row.sessions) ? row.sessions : [];
                return sessions.some(s => s && s.instructorId === instructorId);
            }
            if (activityId) return row.activityId === activityId;
            return true;
        };
        const toEntry = (row) => ({
            studentId: row.studentId, studentName: row.studentName,
            groupName: row.groupName, activityName: row.activityName,
            date: row.date, createdAt: row.createdAt,
        });

        const byStudent = new Map();
        for (const row of rows) {
            if (!byStudent.has(row.studentId)) byStudent.set(row.studentId, []);
            byStudent.get(row.studentId).push(row);
        }

        const enrolled = [], unenrolled = [], groupChanges = [];
        for (const records of byStudent.values()) {
            const used = new Set();
            for (let i = 0; i < records.length; i++) {
                const out = records[i];
                if (used.has(i) || out.action !== 'unenrolled') continue;
                let pairIdx = -1;
                for (let j = 0; j < records.length; j++) {
                    if (used.has(j) || j === i) continue;
                    const inn = records[j];
                    if (inn.action !== 'enrolled') continue;
                    if (inn.groupId === out.groupId) continue;
                    if (inn.date !== out.date) continue;
                    if (inn.activityId !== out.activityId) continue;
                    pairIdx = j;
                    break;
                }
                if (pairIdx === -1) continue;
                used.add(i); used.add(pairIdx);
                const inn = records[pairIdx];
                const oldMatches = matchesSegment(out);
                const newMatches = matchesSegment(inn);
                if (oldMatches && newMatches) {
                    groupChanges.push({
                        studentId: out.studentId, studentName: out.studentName,
                        fromActivityName: out.activityName, fromGroupName: out.groupName,
                        toActivityName: inn.activityName, toGroupName: inn.groupName,
                        date: out.date, createdAt: out.createdAt,
                    });
                } else if (oldMatches) unenrolled.push(toEntry(out));
                else if (newMatches) enrolled.push(toEntry(inn));
            }
            for (let i = 0; i < records.length; i++) {
                if (used.has(i)) continue;
                const row = records[i];
                if (!matchesSegment(row)) continue;
                if (row.action === 'enrolled') enrolled.push(toEntry(row));
                else unenrolled.push(toEntry(row));
            }
        }
        return { enrolled, unenrolled, groupChanges };
    }

    router.get('/report/roster-changes', async (req, res) => {
        try {
            const { activityId, instructorId } = req.query;
            const now = new Date();
            const from = req.query.from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const to = req.query.to || now.toISOString().split('T')[0];

            const { enrolled: allEnrolled, unenrolled: allUnenrolled, groupChanges: allGroupChanges } =
                await getRosterEvents({ activityId, instructorId });

            const inRange = (createdAt) => {
                const d = createdAt.toISOString().split('T')[0];
                return d >= from && d <= to;
            };
            const stripDate = ({ createdAt, ...rest }) => rest;
            const enrolled = allEnrolled.filter(r => inRange(r.createdAt)).map(stripDate);
            const unenrolled = allUnenrolled.filter(r => inRange(r.createdAt)).map(stripDate);
            const groupChanges = allGroupChanges.filter(r => inRange(r.createdAt)).map(stripDate);

            let newAccounts = [];
            if (!activityId && !instructorId) {
                const newAccountsRes = await pool.query(
                    `SELECT user_id as "studentId",
                            TRIM(CONCAT(name, ' ', COALESCE(surname, ''))) as "studentName",
                            email, TO_CHAR(created_at, 'DD/MM/YYYY') as date
                     FROM users
                     WHERE club_id = $1 AND role = 'student'
                     AND DATE(created_at) >= $2::DATE AND DATE(created_at) <= $3::DATE
                     ORDER BY created_at DESC`, [clubId, from, to]);
                newAccounts = newAccountsRes.rows;
            }
            res.json({
                success: true, enrolled, unenrolled, groupChanges,
                totalEnrolled: enrolled.length, totalUnenrolled: unenrolled.length,
                totalGroupChanges: groupChanges.length,
                newAccounts, totalNewAccounts: newAccounts.length,
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/report/monthly-churn', async (req, res) => {
        try {
            const { activityId, instructorId, hasta } = req.query;
            const totalParams = [clubId];
            const totalSeg = buildSegFilter(totalParams, { activityId, instructorId });
            const totalRes = await pool.query(
                `SELECT COUNT(DISTINCT gs.student_id) as total
                 FROM tul_group_students gs
                 JOIN tul_groups g ON gs.group_id = g.group_id
                 JOIN tul_activities a ON g.activity_id = a.activity_id
                 WHERE a.club_id = $1 ${totalSeg}`, totalParams);
            const currentTotal = parseInt(totalRes.rows[0]?.total || 0);

            const { enrolled, unenrolled } = await getRosterEvents({ activityId, instructorId });
            const earliest = [...enrolled, ...unenrolled]
                .reduce((min, e) => (!min || e.createdAt < min) ? e.createdAt : min, null);

            // Los 12 meses terminan en el periodo que se esté mirando, no siempre
            // en el mes actual: así el informe cambia al moverse de mes.
            const ref = hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? new Date(hasta + 'T12:00:00') : new Date();
            const windows = [];
            for (let i = 11; i >= 0; i--) {
                const start = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
                const end = new Date(ref.getFullYear(), ref.getMonth() - i + 1, 1);
                if (earliest && end <= earliest) continue;
                windows.push({ start, end });
            }
            const months = windows.map(w => {
                const bajas = unenrolled.filter(e => e.createdAt >= w.start && e.createdAt < w.end).length;
                const enrolledSince = enrolled.filter(e => e.createdAt >= w.start).length;
                const unenrolledSince = unenrolled.filter(e => e.createdAt >= w.start).length;
                const sociosInicio = Math.max(currentTotal - enrolledSince + unenrolledSince, 0);
                return {
                    month: `${w.start.getFullYear()}-${String(w.start.getMonth() + 1).padStart(2, '0')}`,
                    bajas, sociosInicio,
                };
            });
            res.json({ success: true, months });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/report/gamification', async (req, res) => {
        try {
            const { activityId, instructorId } = req.query;
            const params = [clubId];
            let segFilter = '';
            if (activityId) {
                params.push(activityId);
                segFilter = `AND u.user_id IN (
                     SELECT DISTINCT gs.student_id FROM tul_group_students gs
                     JOIN tul_groups g ON gs.group_id = g.group_id
                     WHERE g.activity_id = $${params.length}::UUID)`;
            } else if (instructorId) {
                params.push(instructorId);
                segFilter = `AND u.user_id IN (
                     SELECT DISTINCT gs.student_id FROM tul_group_students gs
                     JOIN tul_groups g ON gs.group_id = g.group_id
                     WHERE EXISTS (
                         SELECT 1 FROM jsonb_array_elements(COALESCE(g.sessions, '[]'::jsonb)) sess
                         WHERE sess->>'instructorId' = $${params.length}))`;
            }
            // Solo cuenta quien está apuntado a alguna actividad ahora o lo ha
            // estado en el último año: si no, el nivel medio salía diluido por
            // cientos de cuentas que nunca han jugado ni entrenado.
            const statsRes = await pool.query(
                `SELECT u.user_id as "userId",
                    TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) as "studentName",
                    COALESCE(r.level, 1)::int as level,
                    COALESCE(r.exp, 0)::int as exp,
                    COALESCE(r.rpg_class, 'Sin clase') as "rpgClass",
                    (SELECT COUNT(*)::int FROM tul_inventory i WHERE i.user_id = u.user_id) as "itemCount"
                 FROM users u
                 LEFT JOIN tul_rpg r ON r.user_id = u.user_id
                 WHERE (
                     u.club_id = $1
                     OR u.user_id IN (
                         SELECT cm.user_id FROM tul_clan_members cm
                         JOIN tul_clans c ON c.clan_id = cm.clan_id
                         WHERE c.club_id = $1)
                 )
                 AND u.role IN ('student', 'instructor', 'club_owner')
                 AND (
                     EXISTS (
                         SELECT 1 FROM tul_group_students gs
                         JOIN tul_groups g ON g.group_id = gs.group_id
                         JOIN tul_activities a ON a.activity_id = g.activity_id
                         WHERE gs.student_id = u.user_id AND a.club_id = $1)
                     OR EXISTS (
                         SELECT 1 FROM tul_enrollment_history h
                         WHERE h.student_id = u.user_id AND h.club_id = $1
                           AND h.created_at > NOW() - INTERVAL '12 months')
                 )
                 ${segFilter}
                 ORDER BY level DESC, exp DESC`, params);
            const students = statsRes.rows;
            const avgLevel = students.length > 0
                ? Math.round((students.reduce((s, st) => s + st.level, 0) / students.length) * 10) / 10 : 0;
            const classDist = {};
            students.forEach(s => { classDist[s.rpgClass] = (classDist[s.rpgClass] || 0) + 1; });
            const levelBuckets = { '1-5': 0, '6-10': 0, '11-20': 0, '21-50': 0, '51+': 0 };
            students.forEach(s => {
                if (s.level <= 5) levelBuckets['1-5']++;
                else if (s.level <= 10) levelBuckets['6-10']++;
                else if (s.level <= 20) levelBuckets['11-20']++;
                else if (s.level <= 50) levelBuckets['21-50']++;
                else levelBuckets['51+']++;
            });
            res.json({
                success: true, students, avgLevel, classDist, levelBuckets,
                topStudents: students.slice(0, 5),
                totalItemsCollected: students.reduce((s, st) => s + st.itemCount, 0),
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/report/evaluations', async (req, res) => {
        try {
            const { month, from, to, activityId, instructorId } = req.query;
            let dateCondition, queryParams;
            if (from && to) {
                dateCondition = "{alias}.evaluation_date >= $2::DATE AND {alias}.evaluation_date <= $3::DATE";
                queryParams = [clubId, from, to];
            } else {
                const m = parseInt(month) || new Date().getMonth() + 1;
                dateCondition = "EXTRACT(MONTH FROM {alias}.evaluation_date) = $2";
                queryParams = [clubId, m];
            }
            let extraConditions = '';
            if (activityId) {
                queryParams.push(activityId);
                extraConditions += ` AND EXISTS (
                    SELECT 1 FROM tul_group_students gs2
                    JOIN tul_groups g2 ON gs2.group_id = g2.group_id
                    WHERE gs2.student_id = u.user_id AND g2.activity_id = $${queryParams.length}::UUID)`;
            }
            if (instructorId) {
                queryParams.push(instructorId);
                extraConditions += ` AND {alias}.instructor_id = $${queryParams.length}::UUID`;
            }
            const fillAlias = (sql, alias) => sql.split('{alias}').join(alias);

            const tulQuery = `
                SELECT u.user_id as "studentId",
                    CONCAT(u.name, ' ', COALESCE(u.surname, '')) as "studentName",
                    COALESCE(u.belt, 'Blanco (10º Gup)') as "beltName",
                    'tul' as "evaluationType", 3 as "maxScore",
                    (SELECT ROUND(AVG(score), 1) FROM tul_evaluation_movements em WHERE em.evaluation_id = e.evaluation_id) as score
                FROM tul_evaluations e JOIN users u ON e.student_id = u.user_id
                WHERE u.club_id = $1 AND ${fillAlias(dateCondition, 'e')} ${fillAlias(extraConditions, 'e')}`;
            const categoryQuery = `
                SELECT u.user_id as "studentId",
                    CONCAT(u.name, ' ', COALESCE(u.surname, '')) as "studentName",
                    COALESCE(u.belt, 'Blanco (10º Gup)') as "beltName",
                    'category' as "evaluationType", 5 as "maxScore",
                    (SELECT ROUND(AVG(score), 1) FROM tul_category_evaluation_scores cs WHERE cs.evaluation_id = ce.evaluation_id) as score
                FROM tul_category_evaluations ce JOIN users u ON ce.student_id = u.user_id
                WHERE u.club_id = $1 AND ${fillAlias(dateCondition, 'ce')} ${fillAlias(extraConditions, 'ce')}`;
            const techniqueQuery = `
                SELECT u.user_id as "studentId",
                    CONCAT(u.name, ' ', COALESCE(u.surname, '')) as "studentName",
                    COALESCE(u.belt, 'Blanco (10º Gup)') as "beltName",
                    'technique' as "evaluationType", 5 as "maxScore",
                    te.score as score
                FROM tul_technique_evaluations te
                JOIN tul_technique_requests tr ON te.request_id = tr.request_id
                JOIN users u ON te.student_id = u.user_id
                WHERE u.club_id = $1 AND ${fillAlias(dateCondition, 'te')} ${fillAlias(extraConditions, 'te')}`;
            const [tulResult, categoryResult, techniqueResult] = await Promise.all([
                pool.query(tulQuery, queryParams),
                pool.query(categoryQuery, queryParams),
                pool.query(techniqueQuery, queryParams),
            ]);
            const evaluations = [...tulResult.rows, ...categoryResult.rows, ...techniqueResult.rows]
                .map(r => ({ ...r, score: r.score ? parseFloat(r.score) : 0 }));
            res.json({ success: true, evaluations });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/report/attendance', async (req, res) => {
        try {
            const { month, from, to, activityId, instructorId } = req.query;
            let dateCondition, queryParams;
            if (from && to) {
                dateCondition = 'a.date >= $2::DATE AND a.date <= $3::DATE';
                queryParams = [clubId, from, to];
            } else {
                const m = parseInt(month) || new Date().getMonth() + 1;
                dateCondition = 'EXTRACT(MONTH FROM a.date) = $2';
                queryParams = [clubId, m];
            }
            let extraConditions = '';
            let joinClause = '';
            if (activityId) {
                queryParams.push(activityId);
                joinClause = 'JOIN tul_groups g ON a.group_id = g.group_id';
                extraConditions += ` AND g.activity_id = $${queryParams.length}::UUID`;
            } else if (instructorId) {
                const groupsRes = await pool.query(
                    `SELECT g.group_id as "groupId", g.sessions
                     FROM tul_groups g JOIN tul_activities a ON g.activity_id = a.activity_id
                     WHERE a.club_id = $1`, [clubId]);
                const pairSet = new Set();
                const pairs = [];
                for (const row of groupsRes.rows) {
                    const sessions = Array.isArray(row.sessions) ? row.sessions : [];
                    for (const sess of sessions) {
                        if (!sess || sess.instructorId !== instructorId) continue;
                        const days = Array.isArray(sess.days) ? sess.days : [];
                        for (const d of days) {
                            const day = parseInt(d, 10);
                            if (isNaN(day)) continue;
                            const key = `${row.groupId}|${day}`;
                            if (pairSet.has(key)) continue;
                            pairSet.add(key);
                            pairs.push([row.groupId, day]);
                        }
                    }
                }
                if (pairs.length === 0) return res.json({ success: true, attendance: [] });
                const values = pairs.map((_, i) => `($${queryParams.length + i * 2 + 1}::uuid, $${queryParams.length + i * 2 + 2}::int)`).join(', ');
                joinClause = `JOIN (VALUES ${values}) AS gd(group_id, day) ON a.group_id = gd.group_id AND EXTRACT(DOW FROM a.date)::int = gd.day`;
                for (const [groupId, day] of pairs) queryParams.push(groupId, day);
            }
            const result = await pool.query(`
                SELECT u.user_id as "studentId",
                    CONCAT(u.name, ' ', COALESCE(u.surname, '')) as "studentName",
                    COALESCE(u.belt, 'Blanco (10º Gup)') as "beltName",
                    COUNT(CASE WHEN a.status IN ('present', 'late') THEN 1 END) as present,
                    COUNT(a.attendance_id) as total
                FROM tul_attendance a
                JOIN users u ON a.student_id = u.user_id
                ${joinClause}
                WHERE u.club_id = $1 AND ${dateCondition} ${extraConditions}
                GROUP BY u.user_id, u.name, u.surname, u.belt
                ORDER BY "studentName"`, queryParams);
            res.json({
                success: true,
                attendance: result.rows.map(r => ({ ...r, present: parseInt(r.present), total: parseInt(r.total) })),
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    return router;
}
