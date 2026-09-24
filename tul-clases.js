import express from 'express';
import { escalaDe, escalasDelClub, TIPO_TAEKWONDO } from './rangos.js';
import {
    MODOS_BONO, esSpeaking, sqlMatriculadoEnFecha, sqlMiembroEnFecha, sqlModoBono, sqlBonoValeEn,
    plazasConBono, reservarPlazaBono, cancelarReservaBono, hoyMadridISO,
} from './bonos-clases.js';
import { filtroNombreSQL } from './buscar.js';

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
    // Plan de la casa: sin tope de nada. No se ofrece ni se vende, no sale en
    // ninguna pantalla y solo se pone a mano en tul_clubs.plan. Tiene que estar
    // aqui declarado porque un plan que no figure en esta tabla cae a 'free',
    // que es justo lo contrario de lo que se busca.
    aim:        { maxActivities: Infinity, maxGroupsPerActivity: Infinity },
};
const getPlanLimits = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS['free'];

// ¿La persona da esta sesión? Mira los dos monitores posibles (ticket #224): el
// array `instructors` si está, y siempre el instructorId de toda la vida por si
// la sesión es antigua o la escribió aim-tul.
function esDocenteSes(s, id) {
    if (!id) return false;
    if (String(s?.instructorId || '') === String(id)) return true;
    return (Array.isArray(s?.instructors) ? s.instructors : []).some(d => String(d?.id || '') === String(id));
}
// La misma comprobación en SQL, para una sesión `sess` ya desanidada con
// jsonb_array_elements. `ph` es el placeholder del id (p. ej. "$2").
const sqlEsDocente = (ph) =>
    `(sess->>'instructorId' = ${ph} OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(sess->'instructors','[]'::jsonb)) d WHERE d->>'id' = ${ph}))`;
// Los nombres de los monitores de una sesión.
function nombresDocentesSes(s) {
    const arr = (Array.isArray(s?.instructors) ? s.instructors : []).map(d => d?.name).filter(Boolean);
    if (arr.length) return arr;
    return s?.instructorName ? [s.instructorName] : [];
}

// Cambia el cinturón de Taekwon-Do de un alumno de forma que valga para las dos
// apps. Learning Dungeon (aim-tul) lee el cinturón vigente de tul_user_belts —la
// última fila por fecha— y lo usa en el multiplicador de combate, el acceso a
// los tuls y el BeltDisplay; y guarda ahí el histórico de cambios. Así que hay
// que dejar el cinturón en `users` (que es la columna de referencia) Y apuntarlo
// en tul_user_belts. Solo se registra si cambia de verdad respecto a lo último
// anotado: repetir el mismo nivel no aporta nada y solo ensuciaría el histórico.
// `db` es el pool o un client de transacción; los dos tienen .query.
async function aplicarCinturonTKD(db, studentId, levelOrder, levelName) {
    await db.query('UPDATE users SET belt = $1, belt_level = $2 WHERE user_id = $3',
        [levelName, levelOrder, studentId]);
    await db.query(
        `INSERT INTO tul_user_belts (user_id, belt_level, updated_at)
         SELECT $1, $2, NOW()
         WHERE $2 <> COALESCE((SELECT belt_level FROM tul_user_belts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1), -1)`,
        [studentId, levelOrder]);
}

export function crearRouterTulClases({ pool, clubId, permisos, gruposDe, grupoSuyo, generarCargosDeMatricula, generarCargoInscripcion, debeInscripcion }) {
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
                       (SELECT COUNT(*) FROM tul_group_students gs WHERE gs.group_id = g.group_id) as "studentCount",
                       ${sqlModoBono()} AS "bonoModo"
                FROM tul_groups g
                JOIN tul_activities a ON g.activity_id = a.activity_id
                LEFT JOIN aim_clase_bonos cb ON cb.group_id = g.group_id
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

    // Si la clase admite bonos y cuáles (ticket #253). Lo decide la dirección del
    // club, no el monitor. Inglés nunca admite bonos.
    router.put('/groups/:groupId/bonos-config', async (req, res) => {
        if (soloSuyos(req)) return res.status(403).json({ error: 'Esto lo decide secretaría o dirección.' });
        const modo = req.body?.modo === true || req.body?.modo === 'si' ? 'si' : String(req.body?.modo || 'no');
        if (!MODOS_BONO.includes(modo)) return res.status(400).json({ error: 'Opción de bonos no válida.' });
        try {
            const g = await pool.query(
                `SELECT a.activity_type FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE g.group_id = $1 AND a.club_id = $2`, [req.params.groupId, clubId]);
            if (!g.rowCount) return res.status(404).json({ error: 'Grupo no encontrado.' });
            if (g.rows[0].activity_type === 'ingles' && modo !== 'no') return res.status(400).json({ error: 'Las clases de inglés no funcionan con bonos.' });
            await pool.query(
                `INSERT INTO aim_clase_bonos (group_id, modo, updated_at, updated_by) VALUES ($1, $2, NOW(), $3)
                 ON CONFLICT (group_id) DO UPDATE SET modo = EXCLUDED.modo, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
                [req.params.groupId, modo, req.userSession.userId]);
            res.json({ success: true, modo });
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
                       -- El cinturón blanco por defecto es SOLO de Taekwondo (ticket #230):
                       -- en el resto de actividades, sin rango asignado no se pone nada.
                       CASE WHEN a.activity_type = 'taekwondo_itf' THEN COALESCE(u.belt_level, 0) ELSE u.belt_level END as rank,
                       CASE WHEN a.activity_type = 'taekwondo_itf' THEN COALESCE(u.belt, 'Blanco (10º Gup)') ELSE u.belt END as "beltName",
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
            const temporadaAnterior = await alumnosTemporadaAnterior(req.params.groupId);
            res.json({
                success: true,
                escala,
                students: result.rows.map(s => ({
                    ...s, name: s.name.trim(),
                    nivel: s.levelOrder != null ? porOrden[s.levelOrder] || { name: s.levelName, color: '#DDD' } : null,
                })),
                temporadaAnterior,
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Alumnos que estuvieron en esta clase en la última temporada cerrada y que
    // AÚN NO están matriculados esta temporada (ticket #198): salen en un
    // subapartado para poder promocionarlos a la clase con un clic.
    async function alumnosTemporadaAnterior(groupId) {
        const t = await pool.query(
            `SELECT t.id, t.nombre FROM aim_temporadas t
             WHERE t.activa = false
               AND EXISTS (SELECT 1 FROM tul_group_students_historico h
                           WHERE h.group_id = $1 AND h.temporada_id = t.id)
             ORDER BY t.nombre DESC LIMIT 1`, [groupId]);
        if (!t.rowCount) return null;
        const temporada = t.rows[0];
        const r = await pool.query(
            `SELECT u.user_id AS id, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS name, u.email,
                    -- Cinturón blanco por defecto solo en Taekwondo (ticket #230).
                    CASE WHEN a.activity_type = 'taekwondo_itf' THEN COALESCE(u.belt, 'Blanco (10º Gup)') ELSE u.belt END AS "beltName"
             FROM tul_group_students_historico h
             JOIN users u ON u.user_id = h.student_id
             JOIN tul_groups g ON g.group_id = h.group_id
             JOIN tul_activities a ON a.activity_id = g.activity_id
             WHERE h.group_id = $1 AND h.temporada_id = $2
               AND NOT EXISTS (SELECT 1 FROM tul_group_students gs
                               WHERE gs.group_id = $1 AND gs.student_id = h.student_id)
             ORDER BY name`, [groupId, temporada.id]);
        return { temporada, students: r.rows };
    }

    // Poner el rango de un alumno en la actividad de una clase. Se usa al
    // matricular y al apuntar a la espera, para no tener que ir luego a su ficha.
    async function fijarNivel(groupId, studentId, levelOrder) {
        const a = await pool.query(
            `SELECT a.activity_id, a.activity_type FROM tul_groups g
             JOIN tul_activities a ON a.activity_id = g.activity_id
             WHERE g.group_id = $1 AND a.club_id = $2`, [groupId, clubId]);
        if (!a.rowCount) return;
        const { activity_id, activity_type } = a.rows[0];
        // "Sin rango" (ticket #230): al elegir la opción vacía se le quita el rango
        // en esta actividad, para poder dejarlo sin título si toca.
        if (levelOrder === null || levelOrder === undefined || levelOrder === '') {
            await pool.query(`DELETE FROM tul_user_progression WHERE user_id = $1 AND activity_id = $2`, [studentId, activity_id]);
            return;
        }
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
            await aplicarCinturonTKD(pool, studentId, nivel.order, nivel.name);
        }
    }

    // Buscar alumnos del club para matricular.
    router.get('/students', async (req, res) => {
        const act = req.query.activityId || null;
        try {
            // Por palabras sueltas y sin tildes (ticket #254).
            const vals = [clubId, act];
            const filtro = filtroNombreSQL(req.query.q, `(u.name || ' ' || COALESCE(u.surname,''))`, vals, 'u.email') || 'true';
            const result = await pool.query(
                `SELECT u.user_id as id, CONCAT(u.name, ' ', COALESCE(u.surname, '')) as name, u.email,
                        u.birthday, up.level_order AS "levelOrder", up.level_name AS "levelName"
                 FROM users u
                 LEFT JOIN tul_user_progression up
                        ON up.user_id = u.user_id AND up.activity_id = $2::uuid
                 WHERE u.club_id = $1 AND u.role IN ('student', 'instructor', 'club_owner')
                   AND ${filtro}
                 ORDER BY u.surname, u.name LIMIT 25`, vals);
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
            // El hueco libre es de quien espera: no se matricula a nadie a dedo.
            if (await esperandoEn(req.params.groupId) > 0) return res.status(409).json(ERROR_ESPERA);
            const maxStudents = groupRes.rows[0]?.max_students;
            if (maxStudents !== null && maxStudents !== undefined) {
                const countRes = await pool.query('SELECT COUNT(*) FROM tul_group_students WHERE group_id = $1', [req.params.groupId]);
                const currentCount = parseInt(countRes.rows[0].count);
                if (currentCount >= maxStudents) {
                    return res.status(403).json({ error: `Este grupo ya está lleno (${currentCount}/${maxStudents} alumnos).` });
                }
            }
            const activoAntes = await tieneActividadActiva(studentId);
            // Ticket #290: si le toca inscripción se mira ANTES de apuntarle, que al
            // apuntarle se le reabre la matrícula y ya no se vería su baja.
            const tocaInscripcion = !activoAntes && debeInscripcion ? (await debeInscripcion(studentId)).debe : false;
            await matricular(req.params.groupId, studentId);
            if (levelOrder != null && levelOrder !== '') await fijarNivel(req.params.groupId, studentId, levelOrder);
            // Alumno nuevo (no tenía ninguna actividad): se le crea ya el cobro de
            // matrícula/inscripción pendiente (ticket #231), además de la cuota.
            // Ticket #290: solo se le cobra si es nuevo o vuelve tras una baja.
            let inscripcion = 0;
            if (tocaInscripcion && generarCargoInscripcion) {
                inscripcion = await generarCargoInscripcion({ userId: studentId, yaComprobado: true }).catch(e => { console.error('[#231 inscripción]', e.message); return 0; });
            }
            res.json({ success: true, matriculaNueva: !activoAntes, inscripcionCreada: inscripcion > 0 });
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
            // #219 (1): al inscribir desde Clases y horarios, el alumno aparece
            // también en Facturación > Fichas con esa clase, sin tener que
            // registrarlo dos veces. El descuento se ajusta luego en la ficha.
            // Solo si hay temporada activa; si el alumno ya tenía ficha de esa
            // clase esta temporada, se le reabre (se le quita la baja).
            const temp = await pool.query(`SELECT id FROM aim_temporadas WHERE activa = true LIMIT 1`);
            if (temp.rowCount) {
                await pool.query(
                    `INSERT INTO aim_matriculas (user_id, clase_ref, clase_origen, clase_nombre, actividad, temporada_id, descuento_pct, alta)
                     VALUES ($1,$2,'aimtul',$3,$4,$5,0,(now() AT TIME ZONE 'Europe/Madrid')::date)
                     ON CONFLICT (user_id, clase_ref, temporada_id) DO UPDATE SET baja = NULL`,
                    [studentId, groupId, group_name, activity_name, temp.rows[0].id]
                ).catch(() => {});
                // #231: al apuntarle, su cobro de esa actividad queda ya pendiente
                // (sin esperar al "generar" del mes). No duplica si ya lo tuviera.
                if (generarCargosDeMatricula) {
                    await generarCargosDeMatricula({
                        userId: studentId, claseRef: groupId, actividad: activity_name,
                        temporadaId: temp.rows[0].id, descuentoPct: 0,
                    }).catch(e => console.error('[#231 cargo matrícula]', e.message));
                }
            }
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

    // Cuánta gente lleva esperando esta clase. Si hay alguien, un hueco libre es
    // suyo por orden de llegada: no se puede matricular a nadie por la vía
    // directa saltándose la cola (ticket de lista de espera). La plaza se da
    // desde la propia lista con /espera/:id/asignar.
    async function esperandoEn(groupId) {
        const r = await pool.query(
            `SELECT COUNT(*)::int n FROM aim_lista_espera WHERE group_id = $1 AND estado = 'esperando'`,
            [groupId]);
        return r.rows[0].n;
    }
    const ERROR_ESPERA = {
        error: 'Esta clase tiene lista de espera: la plaza libre es para quien lleva esperando. Dásela desde la lista de espera.',
        listaEspera: true,
    };

    // ¿El alumno tiene ya alguna actividad activa? La matrícula es única por
    // alumno y se mantiene mientras siga en al menos una actividad (ticket #219).
    // Si no tiene ninguna, al inscribirle es una incorporación nueva: hay que
    // cobrarle matrícula. Si ya tiene alguna, la matrícula sigue vigente.
    async function tieneActividadActiva(studentId) {
        const r = await pool.query(`SELECT 1 FROM tul_group_students WHERE student_id = $1 LIMIT 1`, [studentId]);
        return r.rowCount > 0;
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
                await aplicarCinturonTKD(client, req.params.studentId, nivel.order, nivel.name);
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
            // Con lista de espera, el hueco es para la cola: no se matricula a dedo.
            if (await esperandoEn(groupId) > 0) return res.status(409).json(ERROR_ESPERA);
            if (info.max_students && info.n >= info.max_students) {
                return res.status(409).json({ error: `Esa clase está llena (${info.n}/${info.max_students}). Puedes apuntarle a la lista de espera.` });
            }
            const activoAntes = await tieneActividadActiva(req.params.studentId);
            // Igual que al inscribir desde la clase (#290): se mira antes del alta.
            const tocaInscripcion = !activoAntes && debeInscripcion ? (await debeInscripcion(req.params.studentId)).debe : false;
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
                        await aplicarCinturonTKD(pool, req.params.studentId, nivel.order, nivel.name);
                    }
                }
            }
            // Alumno nuevo: se le crea ya el cobro de matrícula/inscripción (#231).
            let inscripcion = 0;
            if (tocaInscripcion && generarCargoInscripcion) {
                inscripcion = await generarCargoInscripcion({ userId: req.params.studentId, yaComprobado: true }).catch(e => { console.error('[#231 inscripción]', e.message); return 0; });
            }
            res.json({ success: true, matriculaNueva: !activoAntes, inscripcionCreada: inscripcion > 0 });
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
                if (await esperandoEn(grupoProvisionalId) > 0) {
                    return res.status(409).json({ error: 'La clase alternativa tiene lista de espera, así que tampoco tiene plaza libre.' });
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

    // ¿El alumno era de la clase EN esa fecha? (ticket #246). Antes la lista de un
    // día se sacaba de tul_group_students (la plantilla de HOY), así que al quitar
    // a alguien desaparecía también de los días ya pasados, y al añadir a alguien
    // salía en clases que ya se habían dado. Ahora se reconstruye la plantilla del
    // día con el histórico de altas y bajas (tul_enrollment_history):
    //   - el último movimiento hasta esa fecha manda (alta = estaba, baja = no);
    //   - si no hay ninguno hasta la fecha pero sí después, se mira el primero de
    //     todos: si el primero es una baja, antes estaba (alta "de siempre", previa
    //     al histórico); si es un alta, aún no se había apuntado ese día;
    //   - si no hay histórico ninguno, vale la plantilla actual (alumnos antiguos).
    // Ticket #253: quien se da de baja a mitad de mes con la mensualidad de ese mes
    // de esa clase ya cobrada sigue en la lista hasta fin de mes (bonos-clases.js).
    // $1 = group_id, $2 = fecha. `sid` es la columna con el id del alumno.
    const miembroEnFecha = (sid) => sqlMiembroEnFecha({ g: '$1', f: '$2', sid });
    const matriculadoEnFecha = (sid) => sqlMatriculadoEnFecha({ g: '$1', f: '$2', sid });

    // Lo básico de una clase del club: si es la de Speaking y su ajuste de bonos.
    async function infoClase(groupId) {
        const r = await pool.query(
            `SELECT g.name, g.max_students, a.name AS actividad, a.activity_type, ${sqlModoBono()} AS modo
             FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
             LEFT JOIN aim_clase_bonos cb ON cb.group_id = g.group_id
             WHERE g.group_id = $1 AND a.club_id = $2`, [groupId, clubId]);
        const x = r.rows[0];
        return x ? { ...x, speaking: esSpeaking(x.name, x.actividad) } : null;
    }
    // Las franjas de Speaking con sus horas (la hora de clase partida en tres).
    const franjasSpeaking = (inicio, fin, franjas) => {
        const min = (t) => { const [h, m] = String(t || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
        const hhmm = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
        const lista = (Array.isArray(franjas) ? franjas : []).map(Number).sort();
        if (lista.length === 3) return 'la hora entera';
        const a = min(inicio), b = min(fin);
        if (!inicio || !fin || b <= a) return lista.map(n => `${n}ª franja`).join(', ');
        const paso = (b - a) / 3;
        return lista.map(n => `${hhmm(Math.round(a + paso * (n - 1)))}–${hhmm(Math.round(a + paso * n))}`).join(', ');
    };

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
                        ${sqlModoBono()} AS "bonoModo",
                        (SELECT COUNT(*) FROM tul_group_students gs WHERE gs.group_id = g.group_id)::int AS "studentCount"
                 FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                 LEFT JOIN aim_clase_bonos cb ON cb.group_id = g.group_id
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
            // Speaking (#253): solo hay clase los días con alumnos apuntados, y cuentan
            // los que han confirmado.
            const spk = await pool.query(
                `SELECT group_id, COUNT(*) FILTER (WHERE confirmado IS TRUE)::int AS si,
                        COUNT(*) FILTER (WHERE confirmado IS NULL)::int AS pendientes,
                        COUNT(*) FILTER (WHERE confirmado IS FALSE)::int AS no
                 FROM aim_speaking WHERE fecha = $1::date AND group_id IS NOT NULL GROUP BY group_id`, [fecha]);
            const speakingDe = new Map(spk.rows.map(x => [x.group_id, x]));
            // Plazas ocupadas con bono ese día y las que quedan libres (#253).
            const res2 = await pool.query(
                `SELECT group_id, COUNT(*)::int n FROM aim_bono_reservas
                 WHERE fecha = $1::date AND estado = 'reservada' GROUP BY group_id`, [fecha]);
            const reservasDe = new Map(res2.rows.map(x => [x.group_id, x.n]));
            const libresDe = new Map((await plazasConBono(pool, { clubId, desde: fecha, hasta: fecha }).catch(() => []))
                .map(p => [p.groupId, p.libres]));
            const clases = [];
            for (const g of r.rows) {
                const ses = (Array.isArray(g.sessions) ? g.sessions : [])
                    .filter(s => (s?.days || []).map(Number).includes(diaSemana));
                if (!ses.length) continue;
                const speaking = esSpeaking(g.name, g.activityName);
                const sp = speakingDe.get(g.id);
                if (speaking && !sp) continue; // ese día no hay Speaking
                clases.push({
                    id: g.id, name: g.name, activityName: g.activityName,
                    studentCount: speaking ? sp.si : g.studentCount, maxStudents: g.maxStudents,
                    horario: ses.map(s => `${s.startTime || ''}${s.endTime ? `–${s.endTime}` : ''}${s.aulaName ? ` · ${s.aulaName}` : ''}`).join(' | '),
                    instructor: [...new Set(ses.flatMap(nombresDocentesSes))].join(' y ') || null,
                    hora: ses[0]?.startTime || '',
                    marcados: yaMarcados[g.id] || 0,
                    speaking: speaking ? { si: sp.si, pendientes: sp.pendientes, no: sp.no } : null,
                    bonoModo: g.bonoModo, bonoReservas: reservasDe.get(g.id) || 0,
                    bonoLibres: libresDe.has(g.id) ? libresDe.get(g.id) : null,
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
            const info = await infoClase(groupId);
            if (!info) return res.status(404).json({ error: 'Esa clase no es de este club.' });
            const campos = `u.user_id AS id, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS nombre,
                        COALESCE(u.belt, '') AS cinturon, at.status, at.is_auto AS "isAuto",
                        -- ¿Cumple años el día que se pasa lista? Para la coronita.
                        (u.birthday IS NOT NULL
                         AND EXTRACT(MONTH FROM u.birthday) = EXTRACT(MONTH FROM $2::date)
                         AND EXTRACT(DAY FROM u.birthday) = EXTRACT(DAY FROM $2::date)) AS "cumpleHoy",
                        -- Salud (ticket #254): un solo campo, a la vista del profe.
                        NULLIF(sa.notas, '') AS salud,
                        -- Si puede salir en fotos y redes (ticket #170).
                        COALESCE(u.media_consent, false) AS fotos`;
            res.set('Cache-Control', 'no-store');

            // Speaking (ticket #253): la lista del día es la de quienes han aceptado
            // la clase. Los que aún no han contestado salen aparte (por si vienen) y
            // los que han dicho que no, no salen (salvo que ya se les marcara).
            if (info.speaking) {
                const r = await pool.query(
                    `WITH cand AS (
                         SELECT student_id FROM aim_speaking WHERE group_id = $1 AND fecha = $2::date
                         UNION SELECT student_id FROM tul_attendance WHERE group_id = $1 AND date = $2::date
                     )
                     SELECT ${campos}, s.id AS speaking_id, s.confirmado, s.franjas, s.hora_inicio, s.hora_fin
                     FROM cand c
                     JOIN users u ON u.user_id = c.student_id
                     LEFT JOIN aim_speaking s ON s.group_id = $1 AND s.fecha = $2::date AND s.student_id = c.student_id
                     LEFT JOIN tul_attendance at ON at.group_id = $1 AND at.student_id = c.student_id AND at.date = $2::date
                     LEFT JOIN aim_salud sa ON sa.user_id = c.student_id
                     WHERE s.confirmado IS DISTINCT FROM false OR at.status IS NOT NULL
                     ORDER BY (s.confirmado IS TRUE) DESC, u.surname, u.name`, [groupId, fecha]);
                const no = await pool.query(
                    `SELECT COUNT(*)::int n FROM aim_speaking WHERE group_id = $1 AND fecha = $2::date AND confirmado IS FALSE`, [groupId, fecha]);
                return res.json({
                    fecha, speaking: true, noVienen: no.rows[0].n,
                    alumnos: r.rows.map(({ speaking_id, confirmado, franjas, hora_inicio, hora_fin, ...a }) => ({
                        ...a, esMiembro: true,
                        speaking: !speaking_id ? null : confirmado === true ? 'si' : confirmado === false ? 'no' : 'pendiente',
                        franjas: speaking_id ? franjasSpeaking(hora_inicio, hora_fin, franjas) : null,
                    })),
                });
            }

            // Candidatos: los de la plantilla de hoy, los que alguna vez pasaron por
            // esta clase (histórico), los que tengan marca ese día y los que tienen
            // plaza reservada con bono. De ahí se quedan los que eran de la clase EN la
            // fecha (tickets #246 y #253), los ya marcados y los de las reservas.
            const r = await pool.query(
                `WITH cand AS (
                     SELECT student_id FROM tul_group_students WHERE group_id = $1
                     UNION SELECT student_id FROM tul_enrollment_history WHERE group_id = $1
                     UNION SELECT student_id FROM tul_attendance WHERE group_id = $1 AND date = $2::date
                     UNION SELECT student_id FROM aim_bono_reservas WHERE group_id = $1 AND fecha = $2::date AND estado = 'reservada'
                 )
                 SELECT ${campos},
                        -- Clases que le quedan en un bono válido para esta clase (#245/#253).
                        (SELECT MAX(b.clases_total - b.clases_usadas) FROM aim_bonos b
                          WHERE b.cliente_id = c.student_id AND b.clases_usadas < b.clases_total
                            AND ${sqlBonoValeEn('b', '$3::text')}) AS "bonoRestantes",
                        -- ¿Está en la clase por matrícula ese día, o solo por bono?
                        ${miembroEnFecha('c.student_id')} AS "esMiembro",
                        ${matriculadoEnFecha('c.student_id')} AS matriculado,
                        (SELECT MAX(h.created_at) FROM tul_enrollment_history h
                          WHERE h.group_id = $1 AND h.student_id = c.student_id AND h.action = 'unenrolled'
                            AND h.created_at::date <= $2::date) AS "bajaAt",
                        rv.id AS "reservaId", rv.origen AS "reservaOrigen"
                 FROM cand c
                 JOIN users u ON u.user_id = c.student_id
                 LEFT JOIN tul_attendance at ON at.group_id = $1 AND at.student_id = c.student_id AND at.date = $2::date
                 LEFT JOIN aim_salud sa ON sa.user_id = c.student_id
                 LEFT JOIN aim_bono_reservas rv ON rv.group_id = $1 AND rv.fecha = $2::date AND rv.student_id = c.student_id AND rv.estado = 'reservada'
                 WHERE at.status IS NOT NULL OR rv.id IS NOT NULL OR ${miembroEnFecha('c.student_id')}
                 ORDER BY u.surname, u.name`,
                // Solo tres: desde #231 el bono vale según el ajuste de la clase y ya
                // no mira la actividad. Mandar un cuarto parámetro que la consulta no
                // usa hace que Postgres la rechace entera y la lista no carga.
                [groupId, fecha, info.modo]
            );
            res.json({
                fecha, bonoModo: info.modo,
                alumnos: r.rows.map(({ matriculado, bajaAt, ...a }) => ({
                    ...a,
                    // De baja ese mes pero con el mes pagado: sigue hasta fin de mes.
                    deBaja: a.esMiembro && !matriculado ? { desde: bajaAt } : null,
                })),
            });
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
            const info = await infoClase(req.params.groupId);
            if (!info) return res.status(404).json({ error: 'Esa clase no es de este club.' });
            // Speaking (#253): "Todos" son los que han confirmado que vienen.
            if (info.speaking) {
                const r = await pool.query(
                    `INSERT INTO tul_attendance (group_id, student_id, date, status, is_auto)
                     SELECT $1, s.student_id, $2::date, $3, FALSE
                     FROM aim_speaking s
                     WHERE s.group_id = $1 AND s.fecha = $2::date AND s.confirmado IS TRUE
                       AND NOT EXISTS (SELECT 1 FROM tul_attendance at
                                       WHERE at.group_id = $1 AND at.student_id = s.student_id AND at.date = $2::date)
                     RETURNING attendance_id`, [req.params.groupId, fecha, status]);
                return res.json({ success: true, marcados: r.rowCount });
            }
            // Se marca a la plantilla que había EN esa fecha, no a la de hoy
            // (ticket #246): así "Todos" en un día pasado no arrastra a los que se
            // apuntaron después ni deja fuera a los que ya se dieron de baja. Entran
            // también quienes tienen la plaza reservada con bono ese día (#253).
            const r = await pool.query(
                `INSERT INTO tul_attendance (group_id, student_id, date, status, is_auto)
                 SELECT $1, c.student_id, $2::date, $3, FALSE
                 FROM (
                     SELECT student_id FROM tul_group_students WHERE group_id = $1
                     UNION SELECT student_id FROM tul_enrollment_history WHERE group_id = $1
                     UNION SELECT student_id FROM aim_bono_reservas WHERE group_id = $1 AND fecha = $2::date AND estado = 'reservada'
                 ) c
                 JOIN tul_groups g ON g.group_id = $1
                 JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE a.club_id = $4
                   AND (${miembroEnFecha('c.student_id')}
                        OR EXISTS (SELECT 1 FROM aim_bono_reservas rv WHERE rv.group_id = $1 AND rv.fecha = $2::date
                                   AND rv.student_id = c.student_id AND rv.estado = 'reservada'))
                   AND NOT EXISTS (
                     SELECT 1 FROM tul_attendance at
                     WHERE at.group_id = $1 AND at.student_id = c.student_id AND at.date = $2::date)
                 RETURNING attendance_id`, [req.params.groupId, fecha, status, clubId]
            );
            res.json({ success: true, marcados: r.rowCount });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Bonos de clases (ticket #245): al pasar lista se puede añadir a alguien que
    // NO está matriculado pero tiene un bono de la actividad de esta clase. El
    // buscador solo muestra a esos, con las clases que le quedan.
    router.get('/groups/:groupId/bonos', async (req, res) => {
        if (await ajeno(req, res, req.params.groupId)) return;
        const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha || '') ? req.query.fecha : hoyMadridISO();
        try {
            const vals = [req.params.groupId, clubId, fecha];
            const filtro = filtroNombreSQL(req.query.q, `(u.name || ' ' || COALESCE(u.surname,''))`, vals) || 'true';
            // Solo bonos que valen en esta clase según su ajuste (#253): el de su
            // actividad y, si la clase lo admite, el de adultos. Uno por persona.
            const r = await pool.query(
                `SELECT * FROM (
                   SELECT DISTINCT ON (b.cliente_id) b.id AS bono_id, b.cliente_id AS student_id, b.ambito,
                          TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS nombre,
                          b.clases_total, b.clases_usadas,
                          (b.clases_total - b.clases_usadas) AS restantes
                   FROM aim_bonos b
                   JOIN users u ON u.user_id = b.cliente_id
                   JOIN tul_groups g ON g.group_id = $1
                   JOIN tul_activities a ON a.activity_id = g.activity_id AND a.club_id = $2
                   LEFT JOIN aim_clase_bonos cb ON cb.group_id = g.group_id
                   WHERE ${sqlBonoValeEn('b', sqlModoBono(), 'a.name')}
                     AND b.clases_usadas < b.clases_total
                     AND ${filtro}
                     -- que no esté ya en esta clase ese día (ese sale en la lista normal)
                     AND NOT (${sqlMiembroEnFecha({ g: '$1', f: '$3', sid: 'b.cliente_id' })})
                     AND NOT EXISTS (SELECT 1 FROM aim_bono_reservas rv WHERE rv.group_id = $1 AND rv.fecha = $3::date
                                     AND rv.student_id = b.cliente_id AND rv.estado = 'reservada')
                   ORDER BY b.cliente_id, b.created_at
                 ) x
                 ORDER BY nombre
                 LIMIT 25`, vals);
            res.set('Cache-Control', 'no-store');
            res.json({ bonos: r.rows.map(x => ({
                bonoId: x.bono_id, studentId: x.student_id, nombre: x.nombre, ambito: x.ambito,
                total: x.clases_total, usadas: x.clases_usadas, restantes: x.restantes,
            })) });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Reservar (o quitar) una plaza con bono desde el club (#253). Gasta la clase
    // del bono al reservar; al quitarla se le devuelve.
    router.post('/groups/:groupId/bono-reservas', async (req, res) => {
        if (await ajeno(req, res, req.params.groupId)) return;
        try {
            const r = await reservarPlazaBono(pool, {
                clubId, studentId: req.body?.studentId, groupId: req.params.groupId, fecha: req.body?.fecha,
                actorId: req.userSession.userId, familia: false,
            });
            res.status(201).json({ success: true, ...r });
        } catch (err) {
            if (err && err.httP) return res.status(err.httP).json({ error: err.msg });
            res.status(500).json({ error: err.message });
        }
    });
    router.post('/bono-reservas/:id/cancelar', async (req, res) => {
        try {
            const g = await pool.query(`SELECT group_id FROM aim_bono_reservas WHERE id = $1`, [req.params.id]);
            if (!g.rowCount) return res.status(404).json({ error: 'Esa reserva no existe.' });
            if (await ajeno(req, res, g.rows[0].group_id)) return;
            await cancelarReservaBono(pool, { reservaId: req.params.id, actorId: req.userSession.userId, familia: false });
            res.json({ success: true });
        } catch (err) {
            if (err && err.httP) return res.status(err.httP).json({ error: err.msg });
            res.status(500).json({ error: err.message });
        }
    });

    // Marcar la asistencia de un alumno con bono y gastarle una clase (ticket #245).
    // Un uso por (bono, clase, día): marcar dos veces el mismo día no gasta dos. Si
    // se cambia a "faltó", se le devuelve la clase de ese día.
    router.post('/groups/:groupId/attendance/bono', async (req, res) => {
        if (await ajeno(req, res, req.params.groupId)) return;
        const { studentId, bonoId, fecha, status } = req.body;
        if (!studentId) return res.status(400).json({ error: 'Falta el alumno.' });
        if (!ESTADOS_ASISTENCIA.includes(status)) return res.status(400).json({ error: 'Estado no válido.' });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return res.status(400).json({ error: 'Fecha no válida.' });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // El bono del alumno para la actividad de esta clase. Se prefiere el que
            // ya se usó ese día (para poder cambiar su estado), y si no, uno con
            // clases disponibles. Todo dentro del club.
            const b = await client.query(
                `SELECT b.id, b.cliente_id, b.clases_total, b.clases_usadas
                 FROM aim_bonos b
                 JOIN tul_groups g ON g.group_id = $2
                 JOIN tul_activities a ON a.activity_id = g.activity_id AND a.club_id = $3
                 LEFT JOIN aim_clase_bonos cb ON cb.group_id = g.group_id
                 WHERE b.cliente_id = $1 AND ${sqlBonoValeEn('b', sqlModoBono(), 'a.name')}
                   AND ($4::int IS NULL OR b.id = $4)
                 ORDER BY
                   (EXISTS (SELECT 1 FROM aim_bono_usos bu WHERE bu.bono_id = b.id AND bu.group_id = $2 AND bu.fecha = $5::date)) DESC,
                   (b.clases_usadas < b.clases_total) DESC,
                   b.created_at ASC
                 LIMIT 1 FOR UPDATE OF b`,
                [studentId, req.params.groupId, clubId, bonoId || null, fecha]);
            if (!b.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Ese alumno no tiene un bono para esta clase.' }); }
            const bono = b.rows[0];
            const usoPrevio = await client.query(
                `SELECT reserva_id FROM aim_bono_usos WHERE bono_id = $1 AND group_id = $2 AND fecha = $3::date`,
                [bono.id, req.params.groupId, fecha]);
            const yaGastado = usoPrevio.rowCount > 0;
            // Si la clase se gastó al reservar (#253), faltar no la devuelve.
            const deReserva = yaGastado && usoPrevio.rows[0].reserva_id != null;
            const asiste = status === 'present' || status === 'late';

            if (asiste && !yaGastado) {
                if (bono.clases_usadas >= bono.clases_total) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ error: 'Ese bono ya no tiene clases disponibles.' });
                }
                await client.query(
                    `INSERT INTO aim_bono_usos (bono_id, group_id, fecha, created_by) VALUES ($1,$2,$3::date,$4)
                     ON CONFLICT (bono_id, group_id, fecha) DO NOTHING`,
                    [bono.id, req.params.groupId, fecha, req.userSession.userId]);
                await client.query(`UPDATE aim_bonos SET clases_usadas = clases_usadas + 1 WHERE id = $1`, [bono.id]);
            } else if (!asiste && yaGastado && !deReserva) {
                // Cambió a "faltó": se le devuelve la clase de ese día.
                await client.query(`DELETE FROM aim_bono_usos WHERE bono_id = $1 AND group_id = $2 AND fecha = $3::date`,
                    [bono.id, req.params.groupId, fecha]);
                await client.query(`UPDATE aim_bonos SET clases_usadas = GREATEST(0, clases_usadas - 1) WHERE id = $1`, [bono.id]);
            }

            // Registrar la asistencia (igual que la normal).
            const existe = await client.query(
                `SELECT attendance_id FROM tul_attendance WHERE group_id = $1 AND student_id = $2 AND date = $3::date`,
                [req.params.groupId, studentId, fecha]);
            if (existe.rowCount) {
                await client.query(`UPDATE tul_attendance SET status = $1, is_auto = FALSE WHERE attendance_id = $2`,
                    [status, existe.rows[0].attendance_id]);
            } else {
                await client.query(
                    `INSERT INTO tul_attendance (group_id, student_id, date, status, is_auto) VALUES ($1,$2,$3::date,$4,FALSE)`,
                    [req.params.groupId, studentId, fecha, status]);
            }
            const rest = await client.query(`SELECT clases_total - clases_usadas AS restantes FROM aim_bonos WHERE id = $1`, [bono.id]);
            await client.query('COMMIT');
            res.json({ success: true, restantes: rest.rows[0]?.restantes ?? null });
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            res.status(500).json({ error: err.message });
        } finally { client.release(); }
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
                WHERE ${sqlEsDocente('$' + paramsArr.length)}
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
                return ses.some(s => esDocenteSes(s, instructorId));
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
                return sessions.some(s => esDocenteSes(s, instructorId));
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
                         WHERE ${sqlEsDocente('$' + params.length)}))`;
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
                        if (!esDocenteSes(sess, instructorId)) continue;
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
                  -- Las plazas ocupadas con bono van en su propio informe (#253),
                  -- sin mezclarse con los alumnos de mensualidad.
                  AND NOT EXISTS (SELECT 1 FROM aim_bono_usos bu JOIN aim_bonos bb ON bb.id = bu.bono_id
                                  WHERE bb.cliente_id = a.student_id AND bu.group_id = a.group_id AND bu.fecha = a.date)
                GROUP BY u.user_id, u.name, u.surname, u.belt
                ORDER BY "studentName"`, queryParams);
            res.json({
                success: true,
                attendance: result.rows.map(r => ({ ...r, present: parseInt(r.present), total: parseInt(r.total) })),
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Plazas ocupadas con bono en el periodo (#253), aparte de los alumnos que pagan
    // mensualidad: cuántas plazas, cuántas personas distintas, cuántas se usaron de
    // verdad y cuántas se reservaron y no vino nadie; por actividad y por clase.
    router.get('/report/bonos', async (req, res) => {
        const { activityId, instructorId } = req.query;
        const hoy = hoyMadridISO();
        const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : `${hoy.slice(0, 7)}-01`;
        const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : hoy;
        try {
            const params = [clubId, from, to];
            let seg = '';
            if (activityId) { params.push(activityId); seg = ` AND g.activity_id = $${params.length}::uuid`; }
            const r = await pool.query(
                `SELECT bu.group_id, bu.fecha::text AS fecha, bu.reserva_id, bb.cliente_id, bb.ambito,
                        g.name AS clase, g.sessions, a.name AS actividad, at.status
                 FROM aim_bono_usos bu
                 JOIN aim_bonos bb ON bb.id = bu.bono_id
                 JOIN tul_groups g ON g.group_id = bu.group_id
                 JOIN tul_activities a ON a.activity_id = g.activity_id
                 LEFT JOIN tul_attendance at ON at.group_id = bu.group_id AND at.student_id = bb.cliente_id AND at.date = bu.fecha
                 WHERE a.club_id = $1 AND bu.fecha BETWEEN $2::date AND $3::date ${seg}`, params);
            const dow = (iso) => (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7;
            const filas = !instructorId ? r.rows : r.rows.filter(x => (Array.isArray(x.sessions) ? x.sessions : [])
                .some(s => (s.days || []).map(Number).includes(dow(x.fecha)) && esDocenteSes(s, instructorId)));
            const suma = (lista) => ({
                plazas: lista.length,
                personas: new Set(lista.map(x => x.cliente_id)).size,
                vinieron: lista.filter(x => x.status === 'present' || x.status === 'late').length,
                noVinieron: lista.filter(x => x.reserva_id != null && x.fecha < hoy && !(x.status === 'present' || x.status === 'late')).length,
                conBonoAdultos: lista.filter(x => x.ambito === 'adultos').length,
            });
            const agrupar = (clave) => {
                const m = new Map();
                for (const x of filas) { const k = clave(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
                return [...m.entries()].map(([k, l]) => ({ nombre: k, ...suma(l) })).sort((a, b) => b.plazas - a.plazas);
            };
            res.json({
                success: true, from, to, ...suma(filas),
                porActividad: agrupar(x => x.actividad),
                porClase: agrupar(x => `${x.clase} · ${x.actividad}`),
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    return router;
}
