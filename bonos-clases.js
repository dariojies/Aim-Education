// ─────────────────────────────────────────────────────────────────────────────
// Listas de clase y plazas con bono (ticket #253).
//
// · Quién está en una clase un día concreto: desde el día exacto de su alta hasta
//   el de su baja (histórico de tul_enrollment_history, ticket #246). Si se da de
//   baja a mitad de mes y ya tenía pagada la mensualidad de ese mes de esa clase,
//   sigue en la lista hasta el último día del mes.
// · Bonos: cada clase tiene su ajuste (aim_clase_bonos): no admite bonos, admite
//   el bono de su actividad, o además el bono de adultos (multiactividad). Inglés
//   nunca admite bonos. Cada domingo se abren las plazas libres de la semana
//   siguiente: quien tiene bono reserva un día y la clase del bono se gasta al
//   reservar; si cancela antes del día de la clase, se le devuelve.
// ─────────────────────────────────────────────────────────────────────────────

export const MODOS_BONO = ['no', 'actividad', 'adultos'];

const TZ = 'Europe/Madrid';
export const hoyMadridISO = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const ahoraHHMM = () => new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Día de la semana con la convención de aim-tul (0 = lunes).
export const diaSemanaISO = (iso) => (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7;

// ¿Es la clase de Speaking? (grupos o actividad con ese nombre, como en #228).
export const esSpeaking = (grupo, actividad) => /speaking/i.test(String(grupo || '')) || /speaking/i.test(String(actividad || ''));

// Estado de matrícula por el histórico en la fecha `f` (lo de #246). `g`, `f` y
// `sid` son expresiones SQL (placeholders o columnas).
export const sqlMatriculadoEnFecha = ({ g = '$1', f = '$2', sid }) => `
  COALESCE(
    (SELECT h.action FROM tul_enrollment_history h
      WHERE h.group_id = ${g} AND h.student_id = ${sid} AND h.created_at::date <= ${f}::date
      ORDER BY h.created_at DESC, h.id DESC LIMIT 1),
    (SELECT CASE WHEN h.action = 'unenrolled' THEN 'enrolled' ELSE 'unenrolled' END
      FROM tul_enrollment_history h
      WHERE h.group_id = ${g} AND h.student_id = ${sid}
      ORDER BY h.created_at ASC, h.id ASC LIMIT 1),
    CASE WHEN EXISTS (SELECT 1 FROM tul_group_students gs WHERE gs.group_id = ${g} AND gs.student_id = ${sid})
         THEN 'enrolled' ELSE 'unenrolled' END
  ) = 'enrolled'`;

// De baja ese mes, pero con la mensualidad de ese mes de esa clase cobrada: tiene
// la clase hasta fin de mes.
export const sqlBajaPagadaEnFecha = ({ g = '$1', f = '$2', sid }) => `
  EXISTS (
    SELECT 1 FROM (
      SELECT hb_.action, hb_.created_at FROM tul_enrollment_history hb_
      WHERE hb_.group_id = ${g} AND hb_.student_id = ${sid} AND hb_.created_at::date <= ${f}::date
      ORDER BY hb_.created_at DESC, hb_.id DESC LIMIT 1
    ) ult_
    WHERE ult_.action = 'unenrolled'
      AND date_trunc('month', ult_.created_at)::date = date_trunc('month', ${f}::date)::date
      AND EXISTS (SELECT 1 FROM aim_cargos cgm_
                  WHERE cgm_.cliente_id = ${sid} AND cgm_.target_ref = ${g}
                    AND cgm_.mes = date_trunc('month', ${f}::date)::date AND cgm_.estado = 'cobrado')
  )`;

export const sqlMiembroEnFecha = (o) => `((${sqlMatriculadoEnFecha(o)}) OR (${sqlBajaPagadaEnFecha(o)}))`;

// Ajuste de bonos efectivo de una clase: Inglés nunca admite bonos.
// `cb` = alias de aim_clase_bonos (LEFT JOIN), `a` = alias de tul_activities.
export const sqlModoBono = (cb = 'cb', a = 'a') =>
    `(CASE WHEN ${a}.activity_type = 'ingles' THEN 'no' ELSE COALESCE(${cb}.modo, 'no') END)`;

// ¿El bono `b` vale en una clase con ese modo y esa actividad?
export const sqlBonoValeEn = (b, modo, actividad) => `(
  ${modo} IN ('actividad', 'adultos')
  AND ((${b}.ambito = 'actividad' AND ${b}.actividad = ${actividad})
       OR (${modo} = 'adultos' AND ${b}.ambito = 'adultos'))
)`;

// Ventana de reservas para las familias: desde hoy hasta el domingo de la semana
// abierta. El domingo se abre la semana siguiente entera (lunes a domingo).
export function ventanaReservas(hoy = hoyMadridISO()) {
    const dow = diaSemanaISO(hoy);
    return { desde: hoy, hasta: sumarDias(hoy, dow === 6 ? 7 : 6 - dow) };
}

// Las sesiones de un grupo que caen en una fecha (por día de la semana).
const sesionesDelDia = (sessions, iso) => (Array.isArray(sessions) ? sessions : [])
    .filter(s => (s?.days || []).map(Number).includes(diaSemanaISO(iso)));

// Plazas con bono de las clases que admiten bono, día a día, dentro de un rango.
// Con `studentId`, solo las clases donde vale alguno de sus bonos con clases
// disponibles, marcando las que ya tiene reservadas o donde ya es alumno.
export async function plazasConBono(pool, { clubId, desde, hasta, studentId = null, groupId = null }) {
    const hoy = hoyMadridISO();
    const ahora = ahoraHHMM();
    const g = await pool.query(
        `SELECT g.group_id, g.name, g.sessions, g.max_students, a.name AS actividad, ${sqlModoBono()} AS modo
         FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
         LEFT JOIN aim_clase_bonos cb ON cb.group_id = g.group_id
         WHERE a.club_id = $1 AND ($2::uuid IS NULL OR g.group_id = $2)
           AND ${sqlModoBono()} <> 'no' AND g.max_students IS NOT NULL AND g.max_students > 0
           AND ($3::uuid IS NULL OR EXISTS (
                 SELECT 1 FROM aim_bonos b WHERE b.cliente_id = $3 AND b.clases_usadas < b.clases_total
                   AND ${sqlBonoValeEn('b', sqlModoBono(), 'a.name')}))
         ORDER BY a.name, g.name`, [clubId, groupId, studentId]);
    const pares = [];
    for (const x of g.rows) {
        for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
            if (f < hoy) continue;
            const ses = sesionesDelDia(x.sessions, f);
            if (!ses.length) continue;
            const hora = ses[0]?.startTime || '';
            // Hoy, solo si la clase aún no ha empezado.
            if (f === hoy && hora && hora <= ahora) continue;
            pares.push({ grupo: x, fecha: f, hora, horaFin: ses[0]?.endTime || '' });
        }
    }
    if (!pares.length) return [];
    const ocup = await pool.query(
        `SELECT p.group_id, p.fecha::text AS fecha,
                (SELECT COUNT(*) FROM (
                    SELECT student_id FROM tul_group_students WHERE group_id = p.group_id
                    UNION SELECT student_id FROM tul_enrollment_history WHERE group_id = p.group_id
                 ) c WHERE ${sqlMiembroEnFecha({ g: 'p.group_id', f: 'p.fecha', sid: 'c.student_id' })})::int AS miembros,
                (SELECT COUNT(*) FROM aim_bono_reservas r
                  WHERE r.group_id = p.group_id AND r.fecha = p.fecha AND r.estado = 'reservada')::int AS reservas,
                ($3::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM aim_bono_reservas r
                  WHERE r.group_id = p.group_id AND r.fecha = p.fecha AND r.estado = 'reservada' AND r.student_id = $3)) AS reservado,
                ($3::uuid IS NOT NULL AND ${sqlMiembroEnFecha({ g: 'p.group_id', f: 'p.fecha', sid: '$3::uuid' })}) AS es_alumno
         FROM unnest($1::uuid[], $2::date[]) AS p(group_id, fecha)`,
        [pares.map(p => p.grupo.group_id), pares.map(p => p.fecha), studentId]);
    const clave = (gid, f) => `${gid}|${f}`;
    const porPar = new Map(ocup.rows.map(r => [clave(r.group_id, r.fecha), r]));
    return pares.map(p => {
        const o = porPar.get(clave(p.grupo.group_id, p.fecha)) || { miembros: 0, reservas: 0 };
        const cap = Number(p.grupo.max_students);
        return {
            groupId: p.grupo.group_id, clase: p.grupo.name, actividad: p.grupo.actividad, modo: p.grupo.modo,
            fecha: p.fecha, hora: p.hora, horaFin: p.horaFin,
            plazas: cap, alumnos: o.miembros, reservas: o.reservas,
            libres: Math.max(0, cap - o.miembros - o.reservas),
            reservado: !!o.reservado, esAlumno: !!o.es_alumno,
        };
    });
}

// Reserva una plaza con bono y gasta ya la clase del bono. `familia` = la hace la
// familia: tiene que estar dentro de la semana abierta. Lanza { httP, msg }.
export async function reservarPlazaBono(pool, { clubId, studentId, groupId, fecha, actorId, familia }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) throw { httP: 400, msg: 'Fecha no válida.' };
    const hoy = hoyMadridISO();
    if (fecha < hoy) throw { httP: 400, msg: 'Ese día ya ha pasado.' };
    if (familia) {
        const v = ventanaReservas(hoy);
        if (fecha > v.hasta) throw { httP: 400, msg: 'Las plazas de esa semana aún no están abiertas: se abren el domingo anterior.' };
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Una reserva a la vez por clase y día: no se reparten dos veces la última plaza.
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`bono-plaza:${groupId}:${fecha}`]);
        const plazas = await plazasConBono(client, { clubId, desde: fecha, hasta: fecha, studentId, groupId });
        const p = plazas[0];
        if (!p) {
            const info = await client.query(
                `SELECT ${sqlModoBono()} AS modo, g.max_students FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                 LEFT JOIN aim_clase_bonos cb ON cb.group_id = g.group_id WHERE g.group_id = $1 AND a.club_id = $2`, [groupId, clubId]);
            const i = info.rows[0];
            if (!i) throw { httP: 404, msg: 'Esa clase no existe.' };
            if (i.modo === 'no') throw { httP: 400, msg: 'Esa clase no admite bonos.' };
            if (!i.max_students) throw { httP: 400, msg: 'Esa clase no tiene un número de plazas fijado: no se pueden reservar plazas con bono.' };
            throw { httP: 400, msg: 'Ese día no hay esa clase, ya ha empezado o no tiene un bono válido para ella.' };
        }
        if (p.esAlumno) throw { httP: 409, msg: 'Ya es alumno de esa clase ese día: no necesita bono.' };
        if (p.reservado) throw { httP: 409, msg: 'Ya tiene reservada esa clase ese día.' };
        if (p.libres <= 0) throw { httP: 409, msg: 'Esa clase está completa ese día.' };
        // El bono con el que se paga: primero uno de la propia actividad, y si no el
        // de adultos; de cada tipo, el más antiguo.
        const b = await client.query(
            `SELECT b.id, b.clases_total, b.clases_usadas FROM aim_bonos b
             JOIN tul_groups g ON g.group_id = $2
             JOIN tul_activities a ON a.activity_id = g.activity_id
             LEFT JOIN aim_clase_bonos cb ON cb.group_id = g.group_id
             WHERE b.cliente_id = $1 AND b.clases_usadas < b.clases_total
               AND ${sqlBonoValeEn('b', sqlModoBono(), 'a.name')}
               AND NOT EXISTS (SELECT 1 FROM aim_bono_usos u WHERE u.bono_id = b.id AND u.group_id = $2 AND u.fecha = $3::date)
             ORDER BY (b.ambito = 'actividad') DESC, b.created_at ASC
             LIMIT 1 FOR UPDATE OF b`, [studentId, groupId, fecha]);
        if (!b.rowCount) throw { httP: 400, msg: 'No le quedan clases en un bono válido para esa clase.' };
        const bono = b.rows[0];
        const ins = await client.query(
            `INSERT INTO aim_bono_reservas (bono_id, student_id, group_id, fecha, origen, created_by)
             VALUES ($1, $2, $3, $4::date, $5, $6) RETURNING id`,
            [bono.id, studentId, groupId, fecha, familia ? 'familia' : 'club', actorId || null]);
        await client.query(
            `INSERT INTO aim_bono_usos (bono_id, group_id, fecha, created_by, reserva_id) VALUES ($1, $2, $3::date, $4, $5)`,
            [bono.id, groupId, fecha, actorId || null, ins.rows[0].id]);
        await client.query(`UPDATE aim_bonos SET clases_usadas = clases_usadas + 1 WHERE id = $1`, [bono.id]);
        await client.query('COMMIT');
        return { reservaId: ins.rows[0].id, bonoId: bono.id, restantes: bono.clases_total - bono.clases_usadas - 1, clase: p.clase, hora: p.hora };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally { client.release(); }
}

// Cancela una reserva y devuelve la clase al bono. La familia solo puede hasta el
// día anterior a la clase; el club, cuando haga falta. `soloDe` limita a unos
// alumnos (la familia solo cancela las suyas).
export async function cancelarReservaBono(pool, { reservaId, actorId, familia, soloDe = null }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const r = await client.query(
            `SELECT * FROM aim_bono_reservas WHERE id = $1 AND estado = 'reservada' FOR UPDATE`, [reservaId]);
        const x = r.rows[0];
        if (!x || (soloDe && !soloDe.map(String).includes(String(x.student_id)))) throw { httP: 404, msg: 'Esa reserva no existe o ya está cancelada.' };
        if (familia && String(x.fecha).slice(0, 10) <= hoyMadridISO()) {
            throw { httP: 409, msg: 'Las reservas se pueden cancelar hasta el día antes de la clase. Habla con el club.' };
        }
        await client.query(
            `UPDATE aim_bono_reservas SET estado = 'cancelada', cancelada_at = NOW(), cancelada_por = $2, devuelta = true WHERE id = $1`,
            [x.id, actorId || null]);
        const del = await client.query(`DELETE FROM aim_bono_usos WHERE reserva_id = $1 RETURNING bono_id`, [x.id]);
        if (del.rowCount) await client.query(`UPDATE aim_bonos SET clases_usadas = GREATEST(0, clases_usadas - 1) WHERE id = $1`, [x.bono_id]);
        await client.query('COMMIT');
        return { studentId: x.student_id, groupId: x.group_id, fecha: String(x.fecha).slice(0, 10) };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally { client.release(); }
}
