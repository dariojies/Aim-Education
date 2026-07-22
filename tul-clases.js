import express from 'express';

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

export function crearRouterTulClases({ pool, clubId }) {
    const router = express.Router();

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
            const result = await pool.query(`
                SELECT g.group_id as id, g.activity_id as "activityId", g.name, g.time,
                       g.max_students as "maxStudents", g.min_age as "minAge", g.max_age as "maxAge", g.sessions,
                       (SELECT COUNT(*) FROM tul_group_students gs WHERE gs.group_id = g.group_id) as "studentCount"
                FROM tul_groups g
                JOIN tul_activities a ON g.activity_id = a.activity_id
                WHERE a.club_id = $1
                ORDER BY g.name`, [clubId]);
            res.json({ success: true, groups: result.rows });
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
        try {
            const result = await pool.query(`
                SELECT u.user_id as id, u.email, CONCAT(u.name, ' ', COALESCE(u.surname, '')) as name,
                       COALESCE(u.belt_level, 0)            as rank,
                       COALESCE(u.belt, 'Blanco (10º Gup)') as "beltName"
                FROM users u
                JOIN tul_group_students gs ON u.user_id = gs.student_id
                JOIN tul_groups g ON gs.group_id = g.group_id
                JOIN tul_activities a ON g.activity_id = a.activity_id
                WHERE gs.group_id = $1 AND a.club_id = $2
                ORDER BY name`, [req.params.groupId, clubId]);
            res.json({ success: true, students: result.rows.map(s => ({ ...s, name: s.name.trim() })) });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Buscar alumnos del club para matricular.
    router.get('/students', async (req, res) => {
        const q = `%${(req.query.q || '').trim()}%`;
        try {
            const result = await pool.query(
                `SELECT user_id as id, CONCAT(name, ' ', COALESCE(surname, '')) as name, email
                 FROM users WHERE club_id = $1 AND role = 'student'
                   AND (name ILIKE $2 OR surname ILIKE $2 OR CONCAT(name,' ',COALESCE(surname,'')) ILIKE $2 OR email ILIKE $2)
                 ORDER BY surname, name LIMIT 25`, [clubId, q]);
            res.json({ success: true, students: result.rows.map(s => ({ ...s, name: s.name.trim() })) });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/groups/:groupId/students/enroll', async (req, res) => {
        const { studentId } = req.body;
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
            const insertRes = await pool.query(
                'INSERT INTO tul_group_students (group_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
                [req.params.groupId, studentId]
            );
            if (insertRes.rowCount > 0) {
                // El histórico alimenta el reporte de altas/bajas: igual que aim-tul.
                const infoRes = await pool.query(
                    `SELECT u.club_id, TRIM(CONCAT(u.name,' ',COALESCE(u.surname,''))) as student_name,
                            g.name as group_name, a.name as activity_name
                     FROM users u
                     JOIN tul_groups g ON g.group_id = $1
                     JOIN tul_activities a ON a.activity_id = g.activity_id
                     WHERE u.user_id = $2`, [req.params.groupId, studentId]);
                if (infoRes.rows.length > 0) {
                    const { club_id, student_name, group_name, activity_name } = infoRes.rows[0];
                    await pool.query(
                        `INSERT INTO tul_enrollment_history (club_id, group_id, student_id, student_name, group_name, activity_name, action)
                         VALUES ($1, $2, $3, $4, $5, $6, 'enrolled')`,
                        [club_id, req.params.groupId, studentId, student_name, group_name, activity_name]);
                }
            }
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/groups/:groupId/students/:studentId/enroll', async (req, res) => {
        try {
            const infoRes = await pool.query(
                `SELECT u.club_id, TRIM(CONCAT(u.name,' ',COALESCE(u.surname,''))) as student_name,
                        g.name as group_name, a.name as activity_name
                 FROM users u
                 JOIN tul_groups g ON g.group_id = $1
                 JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE u.user_id = $2 AND a.club_id = $3`,
                [req.params.groupId, req.params.studentId, clubId]);
            if (infoRes.rows.length > 0) {
                const { club_id, student_name, group_name, activity_name } = infoRes.rows[0];
                await pool.query(
                    `INSERT INTO tul_enrollment_history (club_id, group_id, student_id, student_name, group_name, activity_name, action)
                     VALUES ($1, $2, $3, $4, $5, $6, 'unenrolled')`,
                    [club_id, req.params.groupId, req.params.studentId, student_name, group_name, activity_name]);
            }
            await pool.query('DELETE FROM tul_group_students WHERE group_id = $1 AND student_id = $2',
                [req.params.groupId, req.params.studentId]);
            res.json({ success: true });
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

    router.get('/report/overview', async (req, res) => {
        try {
            const { activityId, instructorId } = req.query;
            const segParams = [clubId];
            const segFilter = buildSegFilter(segParams, { activityId, instructorId });

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
            const { activityId, instructorId } = req.query;
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

            const now = new Date();
            const windows = [];
            for (let i = 11; i >= 0; i--) {
                const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
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
