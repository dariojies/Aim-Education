// ─────────────────────────────────────────────────────────────────────────────
// Mensajes de redes sociales (ticket #341): Messenger, Instagram y WhatsApp en
// el panel, para contestar desde aquí, repartirlos y fichar a quien escribe.
//
// Meta nos avisa de cada mensaje (webhook /webhooks/meta) y por su API se
// contesta. Las claves van en variables de Heroku, nunca en el código:
//   META_VERIFY_TOKEN  la palabra secreta que se pone al dar de alta el webhook
//   META_APP_SECRET    la clave secreta de la app de Meta (firma los avisos)
//   META_PAGE_TOKEN    el token de la página de Facebook (Messenger e Instagram)
//   WHATSAPP_TOKEN     el token del usuario del sistema (WhatsApp Business)
//   WHATSAPP_PHONE_ID  el identificador del número de WhatsApp
// Los pasos para conseguirlas están en el ticket #341.
//
// Meta solo deja contestar en las 24 h siguientes al último mensaje de la
// persona; pasado ese plazo, en WhatsApp hay que usar una plantilla aprobada.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';

const GRAPH = 'https://graph.facebook.com/v21.0';
export const CANALES = { messenger: 'Messenger', instagram: 'Instagram', whatsapp: 'WhatsApp' };
const VENTANA_MS = 24 * 3600_000;

export const canalesActivos = () => ({
    messenger: !!process.env.META_PAGE_TOKEN,
    instagram: !!process.env.META_PAGE_TOKEN,
    whatsapp: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
});

export async function crearTablasRedes(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_social_conversaciones (
            id SERIAL PRIMARY KEY,
            canal VARCHAR(12) NOT NULL,
            externo_id VARCHAR(80) NOT NULL,
            nombre VARCHAR(160),
            usuario VARCHAR(120),
            telefono VARCHAR(40),
            persona_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            contacto_id INTEGER,
            asignado_a UUID REFERENCES users(user_id) ON DELETE SET NULL,
            estado VARCHAR(10) NOT NULL DEFAULT 'abierta',
            no_leidos INTEGER NOT NULL DEFAULT 0,
            ultimo_at TIMESTAMPTZ,
            ultimo_entrante_at TIMESTAMPTZ,
            ultimo_texto VARCHAR(300),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (canal, externo_id)
        )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_social_conv_ultimo ON aim_social_conversaciones (estado, ultimo_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_social_conv_persona ON aim_social_conversaciones (persona_id) WHERE persona_id IS NOT NULL`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_social_mensajes (
            id BIGSERIAL PRIMARY KEY,
            conversacion_id INTEGER NOT NULL REFERENCES aim_social_conversaciones(id) ON DELETE CASCADE,
            entrante BOOLEAN NOT NULL,
            texto TEXT,
            adjuntos JSONB,
            externo_id VARCHAR(200) UNIQUE,
            enviado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            estado VARCHAR(12) NOT NULL DEFAULT 'ok',
            error TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_social_msg_conv ON aim_social_mensajes (conversacion_id, created_at)`);
}

// Una llamada a la API de Meta. Devuelve el JSON o lanza su error, en claro.
async function graph(ruta, { method = 'GET', token, body } = {}) {
    const r = await fetch(`${GRAPH}${ruta}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) {
        const e = new Error(d.error?.error_user_msg || d.error?.message || `Meta ha respondido ${r.status}`);
        e.codigo = d.error?.code;
        throw e;
    }
    return d;
}

// ¿Viene de verdad de Meta? La firma es un HMAC del cuerpo con la clave de la app.
export function firmaValida(req) {
    const secreto = process.env.META_APP_SECRET;
    const firma = String(req.headers['x-hub-signature-256'] || '');
    if (!secreto || !req.rawBody || !firma.startsWith('sha256=')) return false;
    const esperada = 'sha256=' + crypto.createHmac('sha256', secreto).update(req.rawBody).digest('hex');
    const a = Buffer.from(firma), b = Buffer.from(esperada);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function crearRedes({ pool, companeros, fichaPorTelefono, clubId }) {
    // ── Guardar lo que llega (y lo que sale) ──
    async function guardar({ canal, externo, entrante, texto, adjuntos, mid, fecha, nombre, telefono, enviadoPor = null }) {
        const f = fecha && !Number.isNaN(fecha.getTime()) ? fecha : new Date();
        const resumen = String(texto || (adjuntos?.length ? `[${adjuntos[0].tipo}]` : '')).slice(0, 300);
        const c = await pool.query(
            `INSERT INTO aim_social_conversaciones (canal, externo_id, nombre, telefono, ultimo_at, ultimo_texto, ultimo_entrante_at, no_leidos)
             VALUES ($1, $2, $3, $4, $5::timestamptz, $6, CASE WHEN $7::boolean THEN $5::timestamptz END, CASE WHEN $7::boolean THEN 1 ELSE 0 END)
             ON CONFLICT (canal, externo_id) DO UPDATE SET
                nombre = COALESCE(aim_social_conversaciones.nombre, EXCLUDED.nombre),
                telefono = COALESCE(aim_social_conversaciones.telefono, EXCLUDED.telefono),
                ultimo_at = GREATEST(aim_social_conversaciones.ultimo_at, EXCLUDED.ultimo_at),
                ultimo_texto = EXCLUDED.ultimo_texto,
                ultimo_entrante_at = CASE WHEN $7::boolean THEN GREATEST(aim_social_conversaciones.ultimo_entrante_at, $5::timestamptz) ELSE aim_social_conversaciones.ultimo_entrante_at END,
                no_leidos = aim_social_conversaciones.no_leidos + CASE WHEN $7::boolean THEN 1 ELSE 0 END,
                estado = CASE WHEN $7::boolean THEN 'abierta' ELSE aim_social_conversaciones.estado END
             RETURNING id, (xmax = 0) AS nueva, persona_id`,
            [canal, String(externo).slice(0, 80), nombre || null, telefono || null, f, resumen, !!entrante]);
        const conv = c.rows[0];
        const m = await pool.query(
            `INSERT INTO aim_social_mensajes (conversacion_id, entrante, texto, adjuntos, externo_id, enviado_por, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (externo_id) DO NOTHING RETURNING id`,
            [conv.id, !!entrante, texto || null, adjuntos?.length ? JSON.stringify(adjuntos) : null, mid || null, enviadoPor, f]);
        // Repetido (Meta reintenta, o es el eco de uno nuestro): no cuenta dos veces.
        if (!m.rowCount && entrante) await pool.query(`UPDATE aim_social_conversaciones SET no_leidos = GREATEST(0, no_leidos - 1) WHERE id = $1`, [conv.id]);
        if (conv.nueva) completar(conv.id, canal, externo, telefono).catch(e => console.error('[redes] datos del perfil:', e.message));
        return conv.id;
    }
    // La primera vez: su nombre (Messenger e Instagram no lo mandan) y, por el
    // teléfono, su ficha si ya es del club.
    async function completar(id, canal, externo, telefono) {
        let nombre = null, usuario = null;
        const token = process.env.META_PAGE_TOKEN;
        if (canal === 'messenger' && token) {
            const p = await graph(`/${externo}?fields=first_name,last_name`, { token }).catch(() => null);
            if (p) nombre = [p.first_name, p.last_name].filter(Boolean).join(' ') || null;
        } else if (canal === 'instagram' && token) {
            const p = await graph(`/${externo}?fields=name,username`, { token }).catch(() => null);
            if (p) { nombre = p.name || null; usuario = p.username || null; }
        }
        const ficha = telefono ? await fichaPorTelefono(telefono).catch(() => null) : null;
        await pool.query(
            `UPDATE aim_social_conversaciones SET nombre = COALESCE(nombre, $2), usuario = COALESCE(usuario, $3), persona_id = COALESCE(persona_id, $4) WHERE id = $1`,
            [id, nombre, usuario, ficha?.id || null]);
    }

    // ── El aviso de Meta ──
    async function procesar(body) {
        if (body?.object === 'page' || body?.object === 'instagram') {
            const canal = body.object === 'page' ? 'messenger' : 'instagram';
            for (const e of body.entry || []) {
                for (const ev of e.messaging || []) {
                    const msg = ev.message || (ev.postback ? { mid: `pb-${ev.timestamp}-${ev.sender?.id}`, text: ev.postback.title } : null);
                    if (!msg || msg.is_deleted) continue;
                    const eco = !!msg.is_echo;
                    const externo = eco ? ev.recipient?.id : ev.sender?.id;
                    if (!externo) continue;
                    const adjuntos = (msg.attachments || []).map(a => ({ tipo: a.type, url: a.payload?.url || null }));
                    await guardar({ canal, externo, entrante: !eco, texto: msg.text || '', adjuntos, mid: msg.mid, fecha: new Date(ev.timestamp) });
                }
            }
        } else if (body?.object === 'whatsapp_business_account') {
            for (const e of body.entry || []) {
                for (const ch of e.changes || []) {
                    const v = ch.value || {};
                    for (const msg of v.messages || []) {
                        const contacto = (v.contacts || []).find(c => c.wa_id === msg.from);
                        const media = msg[msg.type];
                        const texto = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title
                            || media?.caption || (msg.type !== 'text' ? '' : '');
                        const adjuntos = ['image', 'document', 'audio', 'video', 'sticker'].includes(msg.type)
                            ? [{ tipo: msg.type, mediaId: media?.id || null, nombre: media?.filename || null }] : [];
                        if (msg.type === 'location') adjuntos.push({ tipo: 'ubicación', url: `https://maps.google.com/?q=${msg.location?.latitude},${msg.location?.longitude}` });
                        await guardar({
                            canal: 'whatsapp', externo: msg.from, entrante: true, texto, adjuntos, mid: msg.id,
                            fecha: new Date(Number(msg.timestamp) * 1000), nombre: contacto?.profile?.name || null, telefono: `+${msg.from}`,
                        });
                    }
                    for (const st of v.statuses || []) {
                        const error = st.errors?.[0] ? (st.errors[0].error_data?.details || st.errors[0].title) : null;
                        await pool.query(`UPDATE aim_social_mensajes SET estado = $2, error = COALESCE($3, error) WHERE externo_id = $1`,
                            [st.id, String(st.status || 'ok').slice(0, 12), error]);
                    }
                }
            }
        }
    }

    // ── Enviar ──
    async function enviar(conv, texto) {
        if (conv.canal === 'whatsapp') {
            if (!canalesActivos().whatsapp) throw new Error('WhatsApp no está conectado todavía (ticket #341).');
            const d = await graph(`/${process.env.WHATSAPP_PHONE_ID}/messages`, {
                method: 'POST', token: process.env.WHATSAPP_TOKEN,
                body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: conv.externo_id, type: 'text', text: { preview_url: true, body: texto } },
            });
            return d.messages?.[0]?.id || null;
        }
        if (!process.env.META_PAGE_TOKEN) throw new Error(`${CANALES[conv.canal]} no está conectado todavía (ticket #341).`);
        const d = await graph('/me/messages', {
            method: 'POST', token: process.env.META_PAGE_TOKEN,
            body: { recipient: { id: conv.externo_id }, messaging_type: 'RESPONSE', message: { text: texto } },
        });
        return d.message_id || null;
    }

    // ── Rutas del panel ──
    const router = express.Router();
    const mapConv = (x) => ({
        id: x.id, canal: x.canal, nombre: x.nombre || x.usuario || (x.telefono ? x.telefono : 'Sin nombre'), usuario: x.usuario, telefono: x.telefono,
        persona: x.persona_id ? { id: x.persona_id, nombre: x.persona_nombre } : null,
        contactoId: x.contacto_id, asignado: x.asignado_a ? { id: x.asignado_a, nombre: x.asignado_nombre } : null,
        estado: x.estado, noLeidos: x.no_leidos, ultimoAt: x.ultimo_at, ultimoTexto: x.ultimo_texto,
        puedeContestar: !!x.ultimo_entrante_at && Date.now() - new Date(x.ultimo_entrante_at).getTime() < VENTANA_MS,
        ultimoEntranteAt: x.ultimo_entrante_at,
    });
    const SELECT_CONV = `SELECT c.*, TRIM(CONCAT(p.name, ' ', COALESCE(p.surname, ''))) AS persona_nombre,
                                TRIM(CONCAT(a.name, ' ', COALESCE(a.surname, ''))) AS asignado_nombre
                         FROM aim_social_conversaciones c
                         LEFT JOIN users p ON p.user_id = c.persona_id LEFT JOIN users a ON a.user_id = c.asignado_a`;
    const error = (res, e) => { console.error('[redes]', e.message); res.status(e.http || 500).json({ error: e.message }); };

    router.get('/estado', async (req, res) => {
        try {
            const n = await pool.query(`SELECT canal, COUNT(*)::int AS n, COALESCE(SUM(no_leidos), 0)::int AS sin_leer FROM aim_social_conversaciones GROUP BY canal`);
            res.json({ canales: canalesActivos(), webhook: !!(process.env.META_VERIFY_TOKEN && process.env.META_APP_SECRET), cuentas: n.rows, companeros: await companeros() });
        } catch (e) { error(res, e); }
    });

    router.get('/conversaciones', async (req, res) => {
        const vista = String(req.query.vista || 'abiertas');
        const canal = CANALES[req.query.canal] ? req.query.canal : null;
        const q = String(req.query.q || '').trim().slice(0, 80);
        const vals = [], w = [];
        const p = (v) => { vals.push(v); return `$${vals.length}`; };
        if (vista === 'hechas') w.push(`c.estado = 'hecha'`); else w.push(`c.estado = 'abierta'`);
        if (vista === 'mias') w.push(`c.asignado_a = ${p(req.userSession.userId)}`);
        if (vista === 'sin_asignar') w.push(`c.asignado_a IS NULL`);
        if (canal) w.push(`c.canal = ${p(canal)}`);
        if (q) w.push(`(c.nombre ILIKE ${p(`%${q}%`)} OR c.usuario ILIKE $${vals.length} OR c.telefono ILIKE $${vals.length})`);
        try {
            const r = await pool.query(`${SELECT_CONV} WHERE ${w.join(' AND ')} ORDER BY c.ultimo_at DESC NULLS LAST LIMIT 100`, vals);
            res.set('Cache-Control', 'no-store');
            res.json({ conversaciones: r.rows.map(mapConv) });
        } catch (e) { error(res, e); }
    });

    router.get('/conversaciones/:id(\\d+)', async (req, res) => {
        try {
            const c = (await pool.query(`${SELECT_CONV} WHERE c.id = $1`, [Number(req.params.id)])).rows[0];
            if (!c) return res.status(404).json({ error: 'Esa conversación ya no está.' });
            const m = await pool.query(
                `SELECT m.*, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS autor FROM aim_social_mensajes m
                 LEFT JOIN users u ON u.user_id = m.enviado_por WHERE m.conversacion_id = $1 ORDER BY m.created_at, m.id LIMIT 500`, [c.id]);
            if (c.no_leidos) await pool.query(`UPDATE aim_social_conversaciones SET no_leidos = 0 WHERE id = $1`, [c.id]);
            res.set('Cache-Control', 'no-store');
            res.json({
                conversacion: mapConv({ ...c, no_leidos: 0 }),
                mensajes: m.rows.map(x => ({ id: x.id, entrante: x.entrante, texto: x.texto, adjuntos: x.adjuntos || [], fecha: x.created_at, estado: x.estado, error: x.error, autor: x.autor || null })),
            });
        } catch (e) { error(res, e); }
    });

    router.post('/conversaciones/:id(\\d+)/responder', async (req, res) => {
        const texto = String(req.body?.texto || '').trim().slice(0, 4000);
        if (!texto) return res.status(400).json({ error: 'Escribe algo.' });
        try {
            const c = (await pool.query(`SELECT * FROM aim_social_conversaciones WHERE id = $1`, [Number(req.params.id)])).rows[0];
            if (!c) return res.status(404).json({ error: 'Esa conversación ya no está.' });
            if (!c.ultimo_entrante_at || Date.now() - new Date(c.ultimo_entrante_at).getTime() >= VENTANA_MS) {
                return res.status(409).json({ error: `Han pasado más de 24 horas desde su último mensaje y ${CANALES[c.canal]} no deja escribir primero. Llámale, escríbele por correo o espera a que vuelva a escribir.` });
            }
            let mid;
            try { mid = await enviar(c, texto); }
            catch (e) { return res.status(502).json({ error: `${CANALES[c.canal]} no lo ha aceptado: ${e.message}` }); }
            await guardar({ canal: c.canal, externo: c.externo_id, entrante: false, texto, mid: mid || `local-${Date.now()}`, enviadoPor: req.userSession.userId });
            res.json({ success: true });
        } catch (e) { error(res, e); }
    });

    // asignar · hecha · reabrir · fichar (con una ficha) · desfichar · contacto (nuevo en Consultas web)
    router.post('/conversaciones/:id(\\d+)/accion', async (req, res) => {
        const { accion, a, personaId } = req.body || {};
        const id = Number(req.params.id);
        try {
            const c = (await pool.query(`SELECT * FROM aim_social_conversaciones WHERE id = $1`, [id])).rows[0];
            if (!c) return res.status(404).json({ error: 'Esa conversación ya no está.' });
            if (accion === 'asignar') {
                if (a && !(await companeros()).some(x => String(x.id) === String(a))) return res.status(400).json({ error: 'Esa persona no lleva las redes.' });
                await pool.query(`UPDATE aim_social_conversaciones SET asignado_a = $2 WHERE id = $1`, [id, a || null]);
            } else if (accion === 'hecha') await pool.query(`UPDATE aim_social_conversaciones SET estado = 'hecha', no_leidos = 0 WHERE id = $1`, [id]);
            else if (accion === 'reabrir') await pool.query(`UPDATE aim_social_conversaciones SET estado = 'abierta' WHERE id = $1`, [id]);
            else if (accion === 'fichar') {
                const u = (await pool.query(`SELECT user_id FROM users WHERE user_id = $1 AND club_id = $2`, [personaId, clubId])).rows[0];
                if (!u) return res.status(400).json({ error: 'Esa ficha no es del club.' });
                await pool.query(`UPDATE aim_social_conversaciones SET persona_id = $2 WHERE id = $1`, [id, u.user_id]);
            } else if (accion === 'desfichar') await pool.query(`UPDATE aim_social_conversaciones SET persona_id = NULL WHERE id = $1`, [id]);
            else if (accion === 'contacto') {
                // A «Consultas web», como si hubiera escrito por el formulario: así
                // se atiende y se le puede dar de alta desde allí.
                const b = req.body || {};
                const nombre = String(b.nombre || c.nombre || '').trim().slice(0, 120);
                const email = String(b.email || '').trim().toLowerCase().slice(0, 255);
                if (!nombre) return res.status(400).json({ error: 'Falta el nombre.' });
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Para guardarlo como contacto hace falta su correo (pídeselo en la conversación).' });
                const primero = (await pool.query(`SELECT texto FROM aim_social_mensajes WHERE conversacion_id = $1 AND entrante AND texto IS NOT NULL ORDER BY created_at LIMIT 1`, [id])).rows[0];
                const r = await pool.query(
                    `INSERT INTO aim_contactos (nombre, email, telefono, mensaje) VALUES ($1, $2, $3, $4) RETURNING id`,
                    [nombre, email, String(b.telefono || c.telefono || '').slice(0, 40) || null, `[${CANALES[c.canal]}] ${primero?.texto || 'Escribió por redes sociales.'}`.slice(0, 3000)]);
                await pool.query(`UPDATE aim_social_conversaciones SET contacto_id = $2, nombre = COALESCE(nombre, $3) WHERE id = $1`, [id, r.rows[0].id, nombre]);
            } else return res.status(400).json({ error: 'Acción desconocida.' });
            res.json({ success: true });
        } catch (e) { error(res, e); }
    });

    // Para fichar: buscar entre las fichas del club por nombre, correo o teléfono.
    router.get('/buscar-ficha', async (req, res) => {
        const q = String(req.query.q || '').trim().slice(0, 80);
        if (q.length < 2) return res.json({ fichas: [] });
        try {
            const digitos = q.replace(/\D/g, '');
            const r = await pool.query(
                `SELECT u.user_id, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS nombre, u.email, u.phone FROM users u
                 WHERE u.club_id = $1 AND (TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) ILIKE $2 OR u.email ILIKE $2
                       ${digitos.length >= 6 ? `OR regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g') LIKE $3` : ''})
                 ORDER BY u.name LIMIT 10`, digitos.length >= 6 ? [clubId, `%${q}%`, `%${digitos.slice(-9)}%`] : [clubId, `%${q}%`]);
            res.json({ fichas: r.rows.map(x => ({ id: x.user_id, nombre: x.nombre, email: x.email, telefono: x.phone })) });
        } catch (e) { error(res, e); }
    });

    // Las fotos y documentos de WhatsApp se piden a Meta con el token: pasan por aquí.
    router.get('/media/:mediaId([0-9]+)', async (req, res) => {
        try {
            if (!canalesActivos().whatsapp) return res.status(404).end();
            const info = await graph(`/${req.params.mediaId}`, { token: process.env.WHATSAPP_TOKEN });
            const r = await fetch(info.url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
            if (!r.ok) return res.status(404).end();
            res.set('Content-Type', info.mime_type || 'application/octet-stream');
            res.set('Cache-Control', 'private, max-age=3600');
            res.send(Buffer.from(await r.arrayBuffer()));
        } catch (e) { error(res, e); }
    });

    // Cuántos sin leer tiene cada uno (los suyos y los sin asignar), para la campanita.
    async function sinLeerDe(userId) {
        const r = await pool.query(
            `SELECT COALESCE(SUM(no_leidos), 0)::int AS n, COUNT(*) FILTER (WHERE no_leidos > 0)::int AS conv, MAX(ultimo_entrante_at) AS ultimo
             FROM aim_social_conversaciones WHERE estado = 'abierta' AND no_leidos > 0 AND (asignado_a IS NULL OR asignado_a = $1)`, [userId]);
        return r.rows[0];
    }

    return { router, procesar, sinLeerDe };
}
