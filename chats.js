// ─────────────────────────────────────────────────────────────────────────────
// Mensajes: el chat interno de la web.
//
// Tres clases de conversación:
// - 'it': el Equipo IT con cualquier persona de la web (una familia, un alumno,
//   alguien del personal). Una por persona; la llevan todos los del Equipo IT y
//   la persona la ve en su área («Mensajes»).
// - 'privado': entre dos personas del personal.
// - 'grupo': como un grupo de WhatsApp del personal. Los crea la dirección (y el
//   Equipo IT), que también pone el nombre y quién está.
// Se pueden mandar archivos e imágenes (hasta 10 MB cada uno) y todo queda
// guardado. Lo que no se ha leído sale en la campanita y llega al móvil.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import { mandaAlMenos } from './permisos.js';
import { filtroNombreSQL } from './buscar.js';

export const MAX_ARCHIVO_CHAT = 10 * 1024 * 1024;
// Imágenes, vídeos cortos, audio, PDF, Office, OpenOffice, texto y zip.
const MIME_CHAT = /^(image\/(png|jpeg|gif|webp|heic|heif)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|ogg|webm|wav|x-m4a|aac)|application\/pdf|application\/msword|application\/vnd\.ms-(excel|powerpoint)|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|application\/vnd\.oasis\.opendocument\.(text|spreadsheet|presentation)|text\/(plain|csv)|application\/(zip|x-zip-compressed))$/;

export async function crearTablasChats(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_chats (
            id SERIAL PRIMARY KEY,
            tipo VARCHAR(10) NOT NULL,
            nombre VARCHAR(120),
            persona_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ultimo_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    // Con cada persona, una sola conversación del Equipo IT.
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_aim_chats_it ON aim_chats (persona_id) WHERE tipo = 'it'`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_chat_miembros (
            chat_id INTEGER NOT NULL REFERENCES aim_chats(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            leido_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (chat_id, user_id)
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_aim_chat_miembros_user ON aim_chat_miembros (user_id)`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_chat_mensajes (
            id BIGSERIAL PRIMARY KEY,
            chat_id INTEGER NOT NULL REFERENCES aim_chats(id) ON DELETE CASCADE,
            autor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            texto TEXT,
            archivo BYTEA,
            archivo_nombre VARCHAR(200),
            archivo_mime VARCHAR(120),
            archivo_bytes INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_aim_chat_mensajes_chat ON aim_chat_mensajes (chat_id, id)`);
}

// Quién es del Equipo IT y quién puede crear grupos (la dirección y el Equipo IT).
export const esIT = (rol) => rol === 'equipo_it' || rol === 'superadmin';
export const creaGrupos = (rol) => mandaAlMenos(rol, 'club_owner');
// Lo mismo en SQL, para cuando no hay sesión (la campanita, el móvil).
const SQL_ES_IT = (u) => `(EXISTS (SELECT 1 FROM aim_rangos r WHERE r.user_id = ${u} AND r.rango = 'equipo_it')
    OR EXISTS (SELECT 1 FROM users su WHERE su.user_id = ${u} AND (su.dev_role = 'superadmin' OR LOWER(COALESCE(su.role, '')) = 'superadmin')))`;
const SQL_ES_PERSONAL = (u) => `(EXISTS (SELECT 1 FROM aim_rangos rg WHERE rg.user_id = ${u}.user_id)
    OR LOWER(COALESCE(${u}.role, '')) IN ('instructor', 'club_owner', 'superadmin') OR ${u}.dev_role = 'superadmin')`;
const NOMBRE = (u) => `NULLIF(TRIM(CONCAT(${u}.name, ' ', COALESCE(${u}.surname, ''))), '')`;
// Los mensajes que cuentan como sin leer para $1 en la conversación c (con su
// fila de miembro mb): los de otros desde que la abrió por última vez. En las del
// Equipo IT, a los del equipo solo les cuenta lo que escribe la persona (lo que
// contesta un compañero no es para ellos), y como mucho de los últimos 30 días.
const SQL_SIN_LEER = `m.autor_id IS DISTINCT FROM $1
    AND m.created_at > GREATEST(COALESCE(mb.leido_at, c.created_at), NOW() - INTERVAL '30 days')
    AND (c.tipo <> 'it' OR c.persona_id = $1 OR m.autor_id = c.persona_id)`;
// El nombre de la conversación para quien la mira ($1).
const SQL_TITULO = `CASE c.tipo
    WHEN 'grupo' THEN c.nombre
    WHEN 'privado' THEN (SELECT ${NOMBRE('u')} FROM aim_chat_miembros o JOIN users u ON u.user_id = o.user_id WHERE o.chat_id = c.id AND o.user_id <> $1 LIMIT 1)
    ELSE CASE WHEN c.persona_id = $1 THEN 'Equipo IT de Aim Education' ELSE (SELECT COALESCE(${NOMBRE('u')}, u.email) FROM users u WHERE u.user_id = c.persona_id) END
  END`;

const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
const fallo = (res, err) => {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[chats]', err.message || err);
    res.status(500).json({ error: 'No se ha podido hacer.' });
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lo que tiene sin leer una persona, conversación a conversación (la campanita
// del panel, la de su área y el móvil).
export async function chatsSinLeer(pool, userId) {
    const r = await pool.query(
        `WITH yo AS (SELECT ${SQL_ES_IT('$1::uuid')} AS it, EXISTS (SELECT 1 FROM users u WHERE u.user_id = $1 AND ${SQL_ES_PERSONAL('u')}) AS personal)
         SELECT c.id, c.tipo, c.persona_id, (${SQL_TITULO}) AS titulo, COUNT(m.id)::int AS n, MAX(m.created_at) AS ultimo,
                (SELECT personal FROM yo) AS personal,
                (SELECT COALESCE(NULLIF(m2.texto, ''), '📎 ' || m2.archivo_nombre) FROM aim_chat_mensajes m2 WHERE m2.chat_id = c.id ORDER BY m2.id DESC LIMIT 1) AS texto,
                (SELECT ${NOMBRE('u')} FROM aim_chat_mensajes m2 JOIN users u ON u.user_id = m2.autor_id WHERE m2.chat_id = c.id ORDER BY m2.id DESC LIMIT 1) AS autor
         FROM aim_chats c
         LEFT JOIN aim_chat_miembros mb ON mb.chat_id = c.id AND mb.user_id = $1
         JOIN aim_chat_mensajes m ON m.chat_id = c.id AND ${SQL_SIN_LEER}
         WHERE (c.tipo <> 'it' AND mb.user_id IS NOT NULL)
            OR (c.tipo = 'it' AND (c.persona_id = $1 OR (SELECT it FROM yo)))
         GROUP BY c.id
         ORDER BY MAX(m.created_at) DESC`, [userId]);
    return r.rows;
}

// Los avisos de la campanita (y del móvil) con lo que hay sin leer. Al personal
// le llevan al panel; al resto, a «Mensajes» de su área.
export async function avisosChats(pool, userId) {
    const filas = await chatsSinLeer(pool, userId).catch(() => []);
    return filas.slice(0, 8).map(c => {
        const corto = String(c.texto || '').replace(/\s+/g, ' ').trim();
        return {
            tipo: 'mensajes', clave: `chat:${c.id}`, n: c.n, marca: c.ultimo, fecha: c.ultimo,
            destino: !c.personal ? `/dashboard/mensajes?chat=${c.id}` : `/admin/mensajes?chat=${c.id}`,
            texto: c.n === 1 ? `Mensaje nuevo de ${c.tipo === 'grupo' ? `«${c.titulo}»` : c.titulo}` : `${c.n} mensajes nuevos de ${c.tipo === 'grupo' ? `«${c.titulo}»` : c.titulo}`,
            detalle: `${c.tipo === 'grupo' && c.autor ? `${c.autor}: ` : ''}${corto.length > 80 ? `${corto.slice(0, 78).trim()}…` : corto}`,
        };
    });
}

export function crearChats({ pool, clubId, authenticateSession, avisar = () => {} }) {
    const router = express.Router();
    const yoDe = (req) => req.userSession.userId;
    const rolDe = (req) => req.userSession?.rol || null;
    const idDe = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) corta(400, 'Falta cuál.'); return n; };

    // La conversación, si quien pregunta puede verla.
    async function conversacion(req, id) {
        const c = (await pool.query(`SELECT * FROM aim_chats WHERE id = $1`, [id])).rows[0];
        if (!c) corta(404, 'Esa conversación ya no existe.');
        const yo = yoDe(req);
        if (c.tipo === 'it') {
            if (String(c.persona_id) !== String(yo) && !esIT(rolDe(req))) corta(404, 'Esa conversación ya no existe.');
        } else {
            if (!req.userSession?.canAccessAdmin) corta(404, 'Esa conversación ya no existe.');
            const m = await pool.query(`SELECT 1 FROM aim_chat_miembros WHERE chat_id = $1 AND user_id = $2`, [id, yo]);
            if (!m.rowCount) corta(404, 'Esa conversación ya no existe.');
        }
        return c;
    }
    const gestiona = (req, c) => c.tipo === 'grupo' && (String(c.creado_por) === String(yoDe(req)) || creaGrupos(rolDe(req)));

    // A quién avisar de un mensaje nuevo: en las del Equipo IT, si escribe la
    // persona, a todo el equipo; si escribe el equipo, a la persona.
    async function destinatarios(c, autor) {
        if (c.tipo === 'it') {
            if (String(c.persona_id) !== String(autor)) return [c.persona_id];
            const r = await pool.query(`SELECT user_id FROM aim_rangos WHERE rango = 'equipo_it'`);
            return r.rows.map(x => x.user_id).filter(u => String(u) !== String(autor));
        }
        const r = await pool.query(`SELECT user_id FROM aim_chat_miembros WHERE chat_id = $1 AND user_id <> $2`, [c.id, autor]);
        return r.rows.map(x => x.user_id);
    }

    const mapMensaje = (m, yo) => ({
        id: Number(m.id), autorId: m.autor_id, autor: m.autor || 'Alguien que ya no está', mio: String(m.autor_id) === String(yo),
        texto: m.texto || '', fecha: m.created_at,
        archivo: m.archivo_nombre ? { nombre: m.archivo_nombre, mime: m.archivo_mime, bytes: m.archivo_bytes, url: `/api/chats/archivo/${m.id}` } : null,
    });
    const SEL_MENSAJE = `m.id, m.autor_id, m.texto, m.archivo_nombre, m.archivo_mime, m.archivo_bytes, m.created_at, ${NOMBRE('u')} AS autor
        FROM aim_chat_mensajes m LEFT JOIN users u ON u.user_id = m.autor_id`;

    // ── La lista ── ?ambito=familia (su área: lo que le escribe el Equipo IT) o
    // equipo (el panel: privados, grupos y, al Equipo IT, todas las suyas).
    router.get('/api/chats', authenticateSession, async (req, res) => {
        try {
            const yo = yoDe(req), equipo = req.query.ambito === 'equipo' && req.userSession?.canAccessAdmin;
            const filtro = equipo
                ? `((c.tipo <> 'it' AND mb.user_id IS NOT NULL) OR (c.tipo = 'it' AND ($2::boolean OR c.persona_id = $1)))`
                : `(c.tipo = 'it' AND c.persona_id = $1 AND $2::boolean IS NOT NULL)`;
            const r = await pool.query(
                `SELECT c.id, c.tipo, c.persona_id, c.ultimo_at, (${SQL_TITULO}) AS titulo,
                        (SELECT COUNT(*)::int FROM aim_chat_mensajes m WHERE m.chat_id = c.id AND ${SQL_SIN_LEER}) AS sin_leer,
                        (SELECT COUNT(*)::int FROM aim_chat_miembros o WHERE o.chat_id = c.id) AS miembros,
                        (SELECT row_to_json(x) FROM (SELECT m.texto, m.archivo_nombre, m.autor_id, m.created_at, ${NOMBRE('u')} AS autor
                           FROM aim_chat_mensajes m LEFT JOIN users u ON u.user_id = m.autor_id WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) x) AS ultimo
                 FROM aim_chats c LEFT JOIN aim_chat_miembros mb ON mb.chat_id = c.id AND mb.user_id = $1
                 WHERE ${filtro}
                 ORDER BY c.ultimo_at DESC LIMIT 300`, [yo, esIT(rolDe(req))]);
            res.set('Cache-Control', 'no-store');
            res.json({
                chats: r.rows.map(c => ({
                    id: c.id, tipo: c.tipo, titulo: c.titulo || '(sin nombre)', sinLeer: c.sin_leer, miembros: c.miembros, fecha: c.ultimo_at,
                    conmigo: String(c.persona_id) === String(yo),
                    ultimo: c.ultimo ? { texto: c.ultimo.texto || (c.ultimo.archivo_nombre ? `📎 ${c.ultimo.archivo_nombre}` : ''), autor: c.ultimo.autor, mio: String(c.ultimo.autor_id) === String(yo) } : null,
                })),
                puede: { it: esIT(rolDe(req)) && !!req.userSession?.canAccessAdmin, grupos: creaGrupos(rolDe(req)), privados: !!req.userSession?.canAccessAdmin },
            });
        } catch (err) { fallo(res, err); }
    });

    // A quién se puede escribir: el personal (privados y grupos) o, al Equipo IT
    // con ?todos=1, cualquiera de la web (por nombre o correo).
    router.get('/api/chats/personas', authenticateSession, async (req, res) => {
        try {
            if (!req.userSession?.canAccessAdmin) corta(403, 'Solo para el personal.');
            const todos = req.query.todos === '1';
            if (todos && !esIT(rolDe(req))) corta(403, 'Solo el Equipo IT escribe a cualquiera de la web.');
            const vals = [clubId, yoDe(req)];
            const filtro = filtroNombreSQL(String(req.query.q || '').slice(0, 80), `(u.name || ' ' || COALESCE(u.surname, ''))`, vals, 'u.email');
            if (todos && !filtro) return res.json({ personas: [] });
            const r = await pool.query(
                `SELECT u.user_id AS id, COALESCE(${NOMBRE('u')}, u.email) AS nombre, u.email,
                        COALESCE((SELECT ar.rango FROM aim_rangos ar WHERE ar.user_id = u.user_id), u.role) AS rango, ${SQL_ES_PERSONAL('u')} AS personal
                 FROM users u WHERE u.club_id = $1 AND u.user_id <> $2 ${todos ? '' : `AND ${SQL_ES_PERSONAL('u')}`} ${filtro ? `AND ${filtro}` : ''}
                 ORDER BY u.name, u.surname LIMIT ${todos ? 20 : 200}`, vals);
            res.json({ personas: r.rows });
        } catch (err) { fallo(res, err); }
    });

    // Lo que no ha leído, en total (el número de la pestaña).
    router.get('/api/chats/resumen', authenticateSession, async (req, res) => {
        try {
            const yo = yoDe(req);
            const filas = await chatsSinLeer(pool, yo);
            const tiene = req.query.ambito === 'equipo' ? true
                : (await pool.query(`SELECT 1 FROM aim_chats WHERE tipo = 'it' AND persona_id = $1 LIMIT 1`, [yo])).rowCount > 0;
            const de = req.query.ambito === 'equipo' ? filas : filas.filter(c => c.tipo === 'it' && String(c.persona_id) === String(yo));
            res.set('Cache-Control', 'no-store');
            res.json({ tiene, sinLeer: de.reduce((s, c) => s + c.n, 0) });
        } catch (err) { fallo(res, err); }
    });

    // Empezar una conversación (o volver a la que ya había).
    router.post('/api/chats', authenticateSession, express.json(), async (req, res) => {
        const client = await pool.connect();
        try {
            const b = req.body || {}, yo = yoDe(req), rol = rolDe(req);
            if (!req.userSession?.canAccessAdmin) corta(403, 'Solo para el personal.');
            await client.query('BEGIN');
            let id;
            if (b.tipo === 'it') {
                if (!esIT(rol)) corta(403, 'Solo el Equipo IT escribe a cualquiera de la web.');
                if (!UUID.test(String(b.persona || ''))) corta(400, 'Elige a quién escribir.');
                if (String(b.persona) === String(yo)) corta(400, 'No puedes escribirte a ti.');
                const p = await client.query(`SELECT 1 FROM users WHERE user_id = $1 AND club_id = $2`, [b.persona, clubId]);
                if (!p.rowCount) corta(404, 'Esa persona no está en la web.');
                await client.query(`INSERT INTO aim_chats (tipo, persona_id, creado_por) VALUES ('it', $1, $2) ON CONFLICT DO NOTHING`, [b.persona, yo]);
                id = (await client.query(`SELECT id FROM aim_chats WHERE tipo = 'it' AND persona_id = $1`, [b.persona])).rows[0].id;
                await client.query(`INSERT INTO aim_chat_miembros (chat_id, user_id) VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING`, [id, b.persona, yo]);
            } else if (b.tipo === 'privado') {
                if (!UUID.test(String(b.con || '')) || String(b.con) === String(yo)) corta(400, 'Elige con quién.');
                const p = await client.query(`SELECT 1 FROM users u WHERE u.user_id = $1 AND u.club_id = $2 AND ${SQL_ES_PERSONAL('u')}`, [b.con, clubId]);
                if (!p.rowCount) corta(400, 'Los privados son entre el personal del club.');
                // Que dos a la vez no abran dos privados iguales.
                await client.query(`SELECT pg_advisory_xact_lock(4830, hashtext($1))`, [[String(yo), String(b.con)].sort().join('|')]);
                const ya = await client.query(
                    `SELECT c.id FROM aim_chats c WHERE c.tipo = 'privado'
                       AND EXISTS (SELECT 1 FROM aim_chat_miembros a WHERE a.chat_id = c.id AND a.user_id = $1)
                       AND EXISTS (SELECT 1 FROM aim_chat_miembros a WHERE a.chat_id = c.id AND a.user_id = $2) LIMIT 1`, [yo, b.con]);
                if (ya.rowCount) id = ya.rows[0].id;
                else {
                    id = (await client.query(`INSERT INTO aim_chats (tipo, creado_por) VALUES ('privado', $1) RETURNING id`, [yo])).rows[0].id;
                    await client.query(`INSERT INTO aim_chat_miembros (chat_id, user_id) VALUES ($1, $2), ($1, $3)`, [id, yo, b.con]);
                }
            } else if (b.tipo === 'grupo') {
                if (!creaGrupos(rol)) corta(403, 'Los grupos los crea la dirección.');
                const nombre = String(b.nombre || '').trim().slice(0, 120);
                if (!nombre) corta(400, 'Ponle nombre al grupo.');
                const miembros = await personalValido(client, b.miembros);
                id = (await client.query(`INSERT INTO aim_chats (tipo, nombre, creado_por) VALUES ('grupo', $1, $2) RETURNING id`, [nombre, yo])).rows[0].id;
                await client.query(`INSERT INTO aim_chat_miembros (chat_id, user_id) SELECT $1, x FROM unnest($2::uuid[]) x ON CONFLICT DO NOTHING`, [id, [...new Set([String(yo), ...miembros])]]);
            } else corta(400, 'Qué conversación no se entiende.');
            await client.query('COMMIT');
            res.status(201).json({ id });
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            fallo(res, err);
        } finally { client.release(); }
    });
    // De una lista de ids, los que son del personal del club.
    async function personalValido(db, lista) {
        const ids = [...new Set([].concat(lista || []).map(String).filter(x => UUID.test(x)))].slice(0, 200);
        if (!ids.length) return [];
        const r = await db.query(`SELECT u.user_id FROM users u WHERE u.user_id = ANY($1::uuid[]) AND u.club_id = $2 AND ${SQL_ES_PERSONAL('u')}`, [ids, clubId]);
        return r.rows.map(x => String(x.user_id));
    }

    // Un grupo: el nombre y quién está (quien lo creó o la dirección).
    router.patch('/api/chats/:id', authenticateSession, express.json(), async (req, res) => {
        try {
            const c = await conversacion(req, idDe(req.params.id));
            if (!gestiona(req, c)) corta(403, 'El grupo lo lleva quien lo creó o la dirección.');
            const b = req.body || {};
            if (b.nombre !== undefined) {
                const nombre = String(b.nombre || '').trim().slice(0, 120);
                if (!nombre) corta(400, 'Ponle nombre al grupo.');
                await pool.query(`UPDATE aim_chats SET nombre = $2 WHERE id = $1`, [c.id, nombre]);
            }
            const anadir = await personalValido(pool, b.anadir);
            if (anadir.length) await pool.query(`INSERT INTO aim_chat_miembros (chat_id, user_id) SELECT $1, x FROM unnest($2::uuid[]) x ON CONFLICT DO NOTHING`, [c.id, anadir]);
            const quitar = [].concat(b.quitar || []).map(String).filter(x => UUID.test(x));
            if (quitar.length) await pool.query(`DELETE FROM aim_chat_miembros WHERE chat_id = $1 AND user_id = ANY($2::uuid[])`, [c.id, quitar]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Salirse de un grupo.
    router.post('/api/chats/:id/salir', authenticateSession, async (req, res) => {
        try {
            const c = await conversacion(req, idDe(req.params.id));
            if (c.tipo !== 'grupo') corta(400, 'Solo se sale de los grupos.');
            await pool.query(`DELETE FROM aim_chat_miembros WHERE chat_id = $1 AND user_id = $2`, [c.id, yoDe(req)]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Borrar un grupo entero, con sus mensajes.
    router.delete('/api/chats/:id', authenticateSession, async (req, res) => {
        try {
            const c = await conversacion(req, idDe(req.params.id));
            if (!gestiona(req, c)) corta(403, 'El grupo lo lleva quien lo creó o la dirección.');
            await pool.query(`DELETE FROM aim_chats WHERE id = $1`, [c.id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // La conversación: los últimos 100 mensajes (o, con ?desde=<id>, los nuevos;
    // con ?antes=<id>, los de antes). Al mirarla queda leída.
    router.get('/api/chats/:id', authenticateSession, async (req, res) => {
        try {
            const yo = yoDe(req), c = await conversacion(req, idDe(req.params.id));
            const desde = Number(req.query.desde) || 0, antes = Number(req.query.antes) || 0;
            const r = desde
                ? await pool.query(`SELECT ${SEL_MENSAJE} WHERE m.chat_id = $1 AND m.id > $2 ORDER BY m.id LIMIT 200`, [c.id, desde])
                : await pool.query(`SELECT * FROM (SELECT ${SEL_MENSAJE} WHERE m.chat_id = $1 ${antes ? 'AND m.id < $2' : ''} ORDER BY m.id DESC LIMIT 100) x ORDER BY id`, antes ? [c.id, antes] : [c.id]);
            await pool.query(`INSERT INTO aim_chat_miembros (chat_id, user_id, leido_at) VALUES ($1, $2, NOW())
                              ON CONFLICT (chat_id, user_id) DO UPDATE SET leido_at = NOW()`, [c.id, yo]);
            // Hasta dónde lo han leído los demás (el ✓✓ de lo suyo). En las del
            // Equipo IT, la persona por un lado y el equipo (cualquiera) por otro.
            const leido = (await pool.query(
                c.tipo === 'it'
                    ? (String(c.persona_id) === String(yo)
                        ? `SELECT MAX(leido_at) AS t FROM aim_chat_miembros WHERE chat_id = $1 AND user_id <> $2`
                        : `SELECT leido_at AS t FROM aim_chat_miembros WHERE chat_id = $1 AND user_id = (SELECT persona_id FROM aim_chats WHERE id = $1) AND $2::uuid IS NOT NULL`)
                    : `SELECT MIN(leido_at) AS t FROM aim_chat_miembros WHERE chat_id = $1 AND user_id <> $2`, [c.id, yo])).rows[0]?.t || null;
            let chat = null;
            if (!desde) {
                const t = (await pool.query(`SELECT (${SQL_TITULO}) AS titulo FROM aim_chats c WHERE c.id = $2`, [yo, c.id])).rows[0];
                const miembros = c.tipo === 'grupo' ? (await pool.query(
                    `SELECT u.user_id AS id, COALESCE(${NOMBRE('u')}, u.email) AS nombre FROM aim_chat_miembros o JOIN users u ON u.user_id = o.user_id
                     WHERE o.chat_id = $1 ORDER BY u.name, u.surname`, [c.id])).rows : [];
                const persona = c.tipo === 'it' && String(c.persona_id) !== String(yo)
                    ? (await pool.query(`SELECT u.email, COALESCE((SELECT ar.rango FROM aim_rangos ar WHERE ar.user_id = u.user_id), u.role) AS rango FROM users u WHERE u.user_id = $1`, [c.persona_id])).rows[0] || null
                    : null;
                chat = { id: c.id, tipo: c.tipo, titulo: t?.titulo || '(sin nombre)', miembros, persona, conmigo: String(c.persona_id) === String(yo), gestiona: gestiona(req, c) };
            }
            res.set('Cache-Control', 'no-store');
            res.json({ chat, mensajes: r.rows.map(m => mapMensaje(m, yo)), leidoHasta: leido, hayMas: !desde && r.rows.length === 100 });
        } catch (err) { fallo(res, err); }
    });

    async function guardarMensaje(c, autor, { texto = null, archivo = null }) {
        const m = (await pool.query(
            `INSERT INTO aim_chat_mensajes (chat_id, autor_id, texto, archivo, archivo_nombre, archivo_mime, archivo_bytes)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [c.id, autor, texto, archivo?.datos || null, archivo?.nombre || null, archivo?.mime || null, archivo?.datos?.length || null])).rows[0];
        await pool.query(`UPDATE aim_chats SET ultimo_at = NOW() WHERE id = $1`, [c.id]);
        // Lo que ha escrito ya lo ha leído.
        await pool.query(`INSERT INTO aim_chat_miembros (chat_id, user_id, leido_at) VALUES ($1, $2, NOW())
                          ON CONFLICT (chat_id, user_id) DO UPDATE SET leido_at = NOW()`, [c.id, autor]);
        destinatarios(c, autor).then(ids => ids.length && avisar(ids)).catch(() => {});
        const r = await pool.query(`SELECT ${SEL_MENSAJE} WHERE m.id = $1`, [m.id]);
        return mapMensaje(r.rows[0], autor);
    }

    router.post('/api/chats/:id/mensajes', authenticateSession, express.json(), async (req, res) => {
        try {
            const c = await conversacion(req, idDe(req.params.id));
            const texto = String(req.body?.texto || '').trim().slice(0, 8000);
            if (!texto) corta(400, 'Escribe algo.');
            res.status(201).json({ mensaje: await guardarMensaje(c, yoDe(req), { texto }) });
        } catch (err) { fallo(res, err); }
    });
    // Un archivo (o una imagen), con su texto si se quiere: ?nombre=…&texto=…
    router.post('/api/chats/:id/archivo', authenticateSession, express.raw({ type: () => true, limit: '11mb' }), async (req, res) => {
        try {
            const c = await conversacion(req, idDe(req.params.id));
            const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
            const datos = Buffer.isBuffer(req.body) ? req.body : null;
            if (!datos?.length) corta(400, 'No ha llegado el archivo.');
            if (!MIME_CHAT.test(mime)) corta(400, 'Ese tipo de archivo no se puede mandar: imágenes, vídeos, audio, PDF, Word, Excel, PowerPoint, texto o zip.');
            if (datos.length > MAX_ARCHIVO_CHAT) corta(413, 'El archivo pasa de 10 MB.');
            const nombre = String(req.query.nombre || '').replace(/[\r\n"\\/]/g, '').trim().slice(0, 200) || 'archivo';
            const texto = String(req.query.texto || '').trim().slice(0, 2000) || null;
            res.status(201).json({ mensaje: await guardarMensaje(c, yoDe(req), { texto, archivo: { datos, nombre, mime } }) });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/chats/archivo/:mid', authenticateSession, async (req, res) => {
        try {
            if (!/^\d+$/.test(req.params.mid)) corta(404, 'Ese archivo ya no está.');
            const m = (await pool.query(`SELECT chat_id, archivo, archivo_nombre, archivo_mime FROM aim_chat_mensajes WHERE id = $1 AND archivo IS NOT NULL`, [req.params.mid])).rows[0];
            if (!m) corta(404, 'Ese archivo ya no está.');
            await conversacion(req, m.chat_id);
            const enLinea = !req.query.descargar && /^(image\/(png|jpeg|gif|webp)|video\/|audio\/|application\/pdf$)/.test(m.archivo_mime);
            res.set({
                'Content-Type': m.archivo_mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400',
                'Content-Disposition': `${enLinea ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(m.archivo_nombre)}`,
            });
            // Que nada de lo subido se ejecute como página (al PDF no: el visor del navegador no abre en un sandbox).
            if (m.archivo_mime !== 'application/pdf') res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
            res.send(m.archivo);
        } catch (err) { fallo(res, err); }
    });

    return { router };
}
