// ─────────────────────────────────────────────────────────────────────────────
// Sustitutos (ticket #445): cuando un profe tiene una ausencia aprobada
// (vacaciones, baja…), secretaría o dirección elige quién da cada una de sus
// clases esos días. El sustituto las ve en «Mi día» y en el calendario del
// móvil, puede pasar lista en ellas y le llega un aviso; al ausente le sale
// quién le sustituye. A las familias no se les dice nada.
//
// Las clases salen del horario (tul_groups, el de la web, compartido con
// Learning Dungeon). El horario es semanal y una sustitución es de un día, así
// que va aparte: una fila por clase concreta (día, grupo y hora de empezar).
// Las ausencias y los fichajes no se tocan: si se cancela la ausencia, se
// quitan sus sustituciones.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import { clasesEnRango } from './calendario-movil.js';

export async function crearTablasSustituciones(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_sustituciones (
            id SERIAL PRIMARY KEY,
            fecha DATE NOT NULL,
            group_id UUID NOT NULL REFERENCES tul_groups(group_id) ON DELETE CASCADE,
            hora VARCHAR(5) NOT NULL,
            ausente_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            sustituto_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            ausencia_id INTEGER REFERENCES aim_ausencias(id) ON DELETE SET NULL,
            created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (fecha, group_id, hora, ausente_id)
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_sustituciones_sustituto ON aim_sustituciones (sustituto_id, fecha)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_sustituciones_ausente ON aim_sustituciones (ausente_id, fecha)`);
}

// Hasta cuándo, alrededor de hoy, una sustitución hace «suya» la clase para
// pasar lista (como en Mi día, se mira el día de la clase y unos días después
// para corregir la lista).
export const SQL_SUSTITUYE = (col, param) => `EXISTS (SELECT 1 FROM aim_sustituciones su_
    WHERE su_.group_id = ${col} AND su_.sustituto_id::text = ${param}
      AND su_.fecha BETWEEN (now() AT TIME ZONE 'Europe/Madrid')::date - 7 AND (now() AT TIME ZONE 'Europe/Madrid')::date + 30)`;

const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
const fallo = (res, err) => {
    if (!err.status) console.error('[sustituciones]', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'No se ha podido hacer. Inténtalo otra vez.' });
};
const clave = (fecha, groupId, hora) => `${fecha}|${groupId}|${hora}`;

export function crearSustituciones({ pool, clubId, authenticateSession, requireAdmin, requireRol, rolEfectivo }) {
    const router = express.Router();
    const gestion = [authenticateSession, requireAdmin, requireRol('secretaria')];

    // Quién puede sustituir: el personal que da clase (ni trabajadores ni superadmin).
    async function personal() {
        const r = await pool.query(
            `SELECT u.user_id, u.name, u.surname, u.role, u.dev_role, ar.rango
             FROM users u LEFT JOIN aim_rangos ar ON ar.user_id = u.user_id
             WHERE u.club_id = $1 OR ar.rango IS NOT NULL`, [clubId]);
        return r.rows
            .map(u => ({ u, rol: rolEfectivo(u.role, u.dev_role, u.rango) }))
            .filter(({ rol }) => rol && !['trabajador', 'superadmin'].includes(rol))
            .map(({ u }) => ({ id: u.user_id, nombre: `${u.name || ''} ${u.surname || ''}`.trim() }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }
    async function ausencia(id) {
        const a = (await pool.query(
            `SELECT a.id, a.user_id, a.estado, a.desde::text AS desde, a.hasta::text AS hasta,
                    TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS trabajador
             FROM aim_ausencias a JOIN users u ON u.user_id = a.user_id WHERE a.id = $1`, [Number(id) || 0])).rows[0];
        if (!a) corta(404, 'Esa ausencia no existe.');
        return a;
    }
    // Las clases que tenía esos días (sin los de cierre), del horario.
    async function clasesDe(a) {
        const grupos = (await pool.query(
            `SELECT g.group_id, g.name, ac.name AS actividad, g.sessions
             FROM tul_groups g JOIN tul_activities ac ON ac.activity_id = g.activity_id WHERE ac.club_id = $1`, [clubId])).rows;
        const cierres = {};
        for (const x of (await pool.query(
            `SELECT fecha::text AS fecha, nombre, tipo FROM aim_calendario_laboral WHERE fecha BETWEEN $1::date AND $2::date`, [a.desde, a.hasta])).rows) {
            cierres[x.fecha] = x;
        }
        return clasesEnRango(grupos, a.user_id, a.desde, a.hasta, cierres);
    }

    router.get('/api/admin/ausencias/:id/sustitutos', ...gestion, async (req, res) => {
        try {
            const a = await ausencia(req.params.id);
            const [clases, gente, ya] = await Promise.all([
                clasesDe(a), personal(),
                pool.query(`SELECT s.fecha::text AS fecha, s.group_id, s.hora, s.sustituto_id FROM aim_sustituciones s
                            WHERE s.ausente_id = $1 AND s.fecha BETWEEN $2::date AND $3::date`, [a.user_id, a.desde, a.hasta]),
            ]);
            const puestos = new Map(ya.rows.map(x => [clave(x.fecha, x.group_id, x.hora), x.sustituto_id]));
            res.set('Cache-Control', 'no-store');
            res.json({
                ausencia: { id: a.id, trabajador: a.trabajador, desde: a.desde, hasta: a.hasta, estado: a.estado },
                clases: clases.filter(c => c.hora).map(c => ({
                    fecha: c.fecha, groupId: c.grupoId, hora: c.hora, horaFin: c.horaFin, grupo: c.grupo, actividad: c.actividad,
                    sustitutoId: puestos.get(clave(c.fecha, c.grupoId, c.hora)) || null,
                })),
                personal: gente.filter(p => String(p.id) !== String(a.user_id)),
            });
        } catch (err) { fallo(res, err); }
    });

    // Guardar quién da cada clase: { asignaciones: [{ fecha, groupId, hora, sustitutoId|null }] }.
    router.put('/api/admin/ausencias/:id/sustitutos', ...gestion, async (req, res) => {
        const client = await pool.connect();
        try {
            const a = await ausencia(req.params.id);
            if (a.estado !== 'aprobada') corta(400, 'Solo se ponen sustitutos en una ausencia aprobada.');
            const validas = new Set((await clasesDe(a)).map(c => clave(c.fecha, c.grupoId, c.hora)));
            const gente = new Set((await personal()).map(p => String(p.id)));
            const lista = Array.isArray(req.body?.asignaciones) ? req.body.asignaciones.slice(0, 500) : [];
            await client.query('BEGIN');
            let puestos = 0, quitados = 0;
            for (const x of lista) {
                const k = clave(String(x?.fecha || ''), String(x?.groupId || ''), String(x?.hora || ''));
                if (!validas.has(k)) continue;   // solo clases suyas de esos días
                const sid = x.sustitutoId ? String(x.sustitutoId) : null;
                if (!sid) {
                    quitados += (await client.query(`DELETE FROM aim_sustituciones WHERE fecha = $1::date AND group_id = $2 AND hora = $3 AND ausente_id = $4`,
                        [x.fecha, x.groupId, x.hora, a.user_id])).rowCount;
                    continue;
                }
                if (!gente.has(sid) || sid === String(a.user_id)) corta(400, 'Esa persona no puede sustituir.');
                const r = await client.query(
                    `INSERT INTO aim_sustituciones (fecha, group_id, hora, ausente_id, sustituto_id, ausencia_id, created_by)
                     VALUES ($1::date, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (fecha, group_id, hora, ausente_id) DO UPDATE
                        SET sustituto_id = EXCLUDED.sustituto_id, ausencia_id = EXCLUDED.ausencia_id, created_by = EXCLUDED.created_by, created_at = NOW()
                        WHERE aim_sustituciones.sustituto_id IS DISTINCT FROM EXCLUDED.sustituto_id`,
                    [x.fecha, x.groupId, x.hora, a.user_id, sid, a.id, req.userSession.userId]);
                puestos += r.rowCount;
            }
            await client.query('COMMIT');
            res.json({ success: true, puestos, quitados });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });

    return { router };
}

// Para «Mi día» y el calendario del móvil: las sustituciones de una persona en
// unas fechas, para marcar las clases que le cubren y añadir las que cubre.
export async function sustitucionesEnRango(pool, userId, desde, hasta) {
    return (await pool.query(
        `SELECT s.fecha::text AS fecha, s.group_id, s.hora, s.ausente_id, s.sustituto_id,
                TRIM(CONCAT(ua.name, ' ', COALESCE(ua.surname, ''))) AS ausente, TRIM(CONCAT(us.name, ' ', COALESCE(us.surname, ''))) AS sustituto
         FROM aim_sustituciones s JOIN users ua ON ua.user_id = s.ausente_id JOIN users us ON us.user_id = s.sustituto_id
         WHERE (s.sustituto_id = $1 OR s.ausente_id = $1) AND s.fecha BETWEEN $2::date AND $3::date`, [userId, desde, hasta]).catch(() => ({ rows: [] }))).rows;
}
