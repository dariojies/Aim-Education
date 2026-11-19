// ─────────────────────────────────────────────────────────────────────────────
// Conectar Facebook e Instagram con un botón (#468). Antes había que generar el
// token de la página a mano en Meta (con los permisos justos de cada cosa:
// mensajes, publicar, estadísticas…) y pegarlo en Heroku (META_PAGE_TOKEN).
// Ahora, desde el panel, «Conectar con Facebook»: se inicia sesión en Facebook,
// se aceptan todos los permisos de una vez y se eligen las páginas. Aquí se saca
// su token (el de una página no caduca), su Instagram, se apunta la página a los
// avisos de mensajes y se guarda cifrado (la clave sale de META_APP_SECRET, que
// sigue en Heroku). Si no hay nada guardado, vale el de Heroku de antes.
//
// Varias cuentas (#651): se pueden conectar varias páginas a la vez (AIM
// Education, Brickslab…), cada una con su Instagram. Cada página es una fila de
// aim_social_cuentas con su token. Una es la «principal»: la de siempre, a la que
// va lo que no dice otra cosa (las publicaciones de antes, las automáticas, las
// noticias…). La principal se copia también en aim_ajustes ('meta_conexion'),
// como antes, por si hubiera que volver a una versión anterior de la web.
//
// Meta corta el acceso a los datos a los 90 días de la última autorización: la
// vigilancia avisa antes para volver a pulsar el botón.
//
// En la app de Meta, una sola vez: el producto «Inicio de sesión con Facebook»
// con la dirección de vuelta (/api/admin/meta/vuelta) y los permisos de PERMISOS_META.
// Lo pueden cambiar el Equipo IT y la dirección.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';
import { mandaAlMenos } from './permisos.js';

const VERSION = 'v21.0';
const GRAPH = () => (process.env.META_GRAPH_URL || `https://graph.facebook.com/${VERSION}`).replace(/\/+$/, '');
// El identificador de la app «AIM Education Web» (es público; el secreto, no).
export const appIdMeta = () => process.env.META_APP_ID || '1482155590408358';
const CLAVE = 'meta_conexion';
// Todo lo que usa la web: mensajes de Messenger e Instagram, publicar en los dos
// y sus estadísticas. Se piden juntos para no tener que volver por uno más.
export const PERMISOS_META = [
    'pages_show_list', 'pages_read_engagement', 'pages_manage_metadata', 'pages_messaging', 'pages_manage_posts', 'read_insights',
    'instagram_basic', 'instagram_manage_messages', 'instagram_content_publish', 'instagram_manage_insights', 'business_management',
];

export async function crearTablasCuentasMeta(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_social_cuentas (
            id SERIAL PRIMARY KEY,
            red VARCHAR(12) NOT NULL DEFAULT 'meta',
            externo_id VARCHAR(80) NOT NULL,
            nombre VARCHAR(160),
            instagram_id VARCHAR(80),
            instagram_usuario VARCHAR(120),
            token TEXT NOT NULL,
            permisos JSONB NOT NULL DEFAULT '[]',
            datos_caducan TIMESTAMPTZ,
            principal BOOLEAN NOT NULL DEFAULT false,
            avisos JSONB NOT NULL DEFAULT '[]',
            conectado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            conectado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (red, externo_id)
        )`);
}

// Las cuentas en memoria (con su token): [{ id, pagina, instagram, token, principal, permisos, datosCaducan, avisos, conectadoPor, conectadoAt }]
let cuentas = [];
const principalEnMemoria = () => cuentas.find(c => c.principal) || cuentas[0] || null;
// El token de la principal (o el de Heroku): lo de siempre, para lo que no sabe de cuentas.
export const tokenPagina = () => principalEnMemoria()?.token || process.env.META_PAGE_TOKEN || '';
// La principal, sin token (la vigilancia mira cuándo caduca).
export const conexionMeta = () => { const c = principalEnMemoria(); return c ? { ...c, token: undefined } : null; };
// Todas, sin token.
export const cuentasMeta = () => cuentas.map(c => ({ ...c, token: undefined }));
// Una cuenta con su token: por su número, por su página o por su Instagram.
export const cuentaMetaPorId = (id) => cuentas.find(c => c.id === Number(id)) || null;
export const cuentaMetaDeExterno = (externo) => cuentas.find(c => c.pagina.id === String(externo) || c.instagram?.id === String(externo)) || null;
export const cuentaPrincipalMeta = () => principalEnMemoria();

const llave = () => crypto.createHash('sha256').update(`aim-meta-conexion:${process.env.META_APP_SECRET || ''}`).digest();
function cifrar(texto) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', llave(), iv);
    const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
    return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}
function descifrar(s) {
    const [iv, tag, enc] = String(s).split('.').map(x => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', llave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

const deFila = (f) => ({
    id: f.id, pagina: { id: f.externo_id, nombre: f.nombre }, instagram: f.instagram_id ? { id: f.instagram_id, usuario: f.instagram_usuario } : null,
    token: descifrar(f.token), principal: f.principal, permisos: f.permisos || [], datosCaducan: f.datos_caducan ? new Date(f.datos_caducan).toISOString() : null,
    avisos: f.avisos || [], conectadoPor: f.conectado_por, conectadoAt: f.conectado_at ? new Date(f.conectado_at).toISOString() : null,
});

// Al arrancar (y cada rato, por si otro proceso la cambió). La primera vez, la
// conexión de antes (una sola página en aim_ajustes) pasa a ser la principal.
export async function cargarConexionMeta(pool) {
    try {
        const n = (await pool.query(`SELECT COUNT(*)::int n FROM aim_social_cuentas WHERE red = 'meta'`)).rows[0].n;
        if (!n) {
            const v = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = $1`, [CLAVE])).rows[0]?.valor;
            if (v?.token && v?.pagina?.id) {
                await pool.query(
                    `INSERT INTO aim_social_cuentas (red, externo_id, nombre, instagram_id, instagram_usuario, token, permisos, datos_caducan, principal, avisos, conectado_por, conectado_at)
                     VALUES ('meta', $1, $2, $3, $4, $5, $6::jsonb, $7, true, $8::jsonb, $9, COALESCE($10::timestamptz, NOW())) ON CONFLICT (red, externo_id) DO NOTHING`,
                    [String(v.pagina.id), v.pagina.nombre || null, v.instagram?.id || null, v.instagram?.usuario || null, v.token,
                     JSON.stringify(v.permisos || []), v.datosCaducan || null, JSON.stringify(v.avisos || []), v.conectadoPor || null, v.conectadoAt || null]);
                console.log('[meta] la conexión de antes pasa a ser la cuenta principal');
            }
        } else {
            // Si la conexión de antes es más nueva que la principal (se volvió a
            // conectar con una versión anterior de la web), manda la de antes.
            const v = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = $1`, [CLAVE])).rows[0]?.valor;
            if (v?.token && v?.pagina?.id && v.conectadoAt) {
                await pool.query(
                    `UPDATE aim_social_cuentas SET token = $2, nombre = $3, instagram_id = $4, instagram_usuario = $5, permisos = $6::jsonb, datos_caducan = $7, conectado_at = $8::timestamptz
                     WHERE red = 'meta' AND principal AND externo_id = $1 AND conectado_at < $8::timestamptz - INTERVAL '5 seconds'`,
                    [String(v.pagina.id), v.token, v.pagina.nombre || null, v.instagram?.id || null, v.instagram?.usuario || null, JSON.stringify(v.permisos || []), v.datosCaducan || null, v.conectadoAt]);
            }
        }
        const filas = (await pool.query(`SELECT * FROM aim_social_cuentas WHERE red = 'meta' ORDER BY principal DESC, id`)).rows;
        const leidas = [];
        for (const f of filas) {
            // Si cambió META_APP_SECRET, lo guardado ya no se puede leer: hay que volver a conectar.
            try { leidas.push(deFila(f)); } catch (e) { console.error(`[meta] no se puede leer la cuenta ${f.nombre}:`, e.message); }
        }
        cuentas = leidas;
    } catch (e) {
        // Recién desplegado, la tabla aún puede no existir: se queda con lo que había.
        if (e.code !== '42P01') console.error('[meta] no se pueden leer las cuentas:', e.message);
    }
}

async function graph(ruta, params = {}, { method = 'GET' } = {}) {
    const q = new URLSearchParams(params);
    const r = await fetch(`${GRAPH()}${ruta}${method === 'GET' ? `?${q}` : ''}`, {
        method, signal: AbortSignal.timeout(30_000),
        ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q } : {}),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error?.error_user_msg || d.error?.message || `Meta ha respondido ${r.status}`);
    return d;
}

export function crearConexionMeta({ pool, authenticateSession, requireAdmin, urlPublica, alCambiar = () => {} }) {
    const router = express.Router();
    const puede = (req) => mandaAlMenos(req.userSession?.rol, 'club_owner');
    const vuelta = () => `${String(urlPublica).replace(/\/+$/, '')}/api/admin/meta/vuelta`;
    const alPanel = (res, q) => res.redirect(`/admin/redes?${new URLSearchParams(q)}`);
    // Lo que va de ida y vuelta a Facebook (y las páginas por elegir): en memoria, 15 minutos.
    const pendientes = new Map();
    const guardarPendiente = (datos) => {
        const clave = crypto.randomBytes(18).toString('hex');
        pendientes.set(clave, { ...datos, hasta: Date.now() + 15 * 60_000 });
        for (const [k, v] of pendientes) if (v.hasta < Date.now()) pendientes.delete(k);
        return clave;
    };
    const tomar = (clave) => { const p = pendientes.get(String(clave || '')); pendientes.delete(String(clave || '')); return p && p.hasta > Date.now() ? p : null; };
    const recargar = setInterval(() => cargarConexionMeta(pool), 10 * 60_000);
    recargar.unref?.();

    // La principal, también en aim_ajustes como antes (por si se vuelve a una versión anterior).
    async function copiarPrincipal() {
        const p = (await pool.query(`SELECT * FROM aim_social_cuentas WHERE red = 'meta' AND principal LIMIT 1`)).rows[0];
        if (!p) { await pool.query(`DELETE FROM aim_ajustes WHERE clave = $1`, [CLAVE]); return; }
        const valor = {
            token: p.token, pagina: { id: p.externo_id, nombre: p.nombre },
            instagram: p.instagram_id ? { id: p.instagram_id, usuario: p.instagram_usuario } : null,
            permisos: p.permisos, datosCaducan: p.datos_caducan, conectadoPor: p.conectado_por, conectadoAt: p.conectado_at, avisos: p.avisos,
        };
        await pool.query(
            `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ($1, $2::jsonb, NOW(), $3)
             ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = EXCLUDED.actualizado_por`,
            [CLAVE, JSON.stringify(valor), p.conectado_por]);
    }

    // Guardar (o renovar) las páginas elegidas. Si aún no hay principal, la primera lo es.
    async function guardar(paginas, { permisos, datosCaducan, userId }) {
        for (const pagina of paginas) {
            const avisos = [];
            // Que los mensajes de la página lleguen a la web (el webhook de la app).
            try {
                await graph(`/${pagina.id}/subscribed_apps`, { subscribed_fields: 'messages,messaging_postbacks', access_token: pagina.access_token }, { method: 'POST' });
            } catch (e) { avisos.push(`No se ha podido apuntar la página a los avisos de mensajes: ${e.message}`); }
            const hayPrincipal = (await pool.query(`SELECT 1 FROM aim_social_cuentas WHERE red = 'meta' AND principal`)).rowCount > 0;
            await pool.query(
                `INSERT INTO aim_social_cuentas (red, externo_id, nombre, instagram_id, instagram_usuario, token, permisos, datos_caducan, principal, avisos, conectado_por, conectado_at)
                 VALUES ('meta', $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, NOW())
                 ON CONFLICT (red, externo_id) DO UPDATE SET nombre = EXCLUDED.nombre, instagram_id = EXCLUDED.instagram_id, instagram_usuario = EXCLUDED.instagram_usuario,
                     token = EXCLUDED.token, permisos = EXCLUDED.permisos, datos_caducan = EXCLUDED.datos_caducan, avisos = EXCLUDED.avisos,
                     conectado_por = EXCLUDED.conectado_por, conectado_at = NOW()`,
                [String(pagina.id), pagina.name || null, pagina.instagram_business_account?.id || null, pagina.instagram_business_account?.username || null,
                 cifrar(pagina.access_token), JSON.stringify(permisos || []), datosCaducan || null, !hayPrincipal, JSON.stringify(avisos), userId]);
        }
        await copiarPrincipal();
        await cargarConexionMeta(pool);
        alCambiar();
    }

    const quienEs = async (id) => (id ? (await pool.query(`SELECT TRIM(CONCAT(name, ' ', COALESCE(surname, ''))) AS n FROM users WHERE user_id = $1`, [id]).catch(() => ({ rows: [] }))).rows[0]?.n || null : null);
    const paraVer = async (c) => ({
        id: c.id, pagina: c.pagina, instagram: c.instagram, principal: !!c.principal,
        faltan: PERMISOS_META.filter(p => !(c.permisos || []).includes(p)),
        datosCaducan: c.datosCaducan || null, conectadoPor: await quienEs(c.conectadoPor), conectadoAt: c.conectadoAt || null, avisos: c.avisos || [],
    });

    router.get('/api/admin/meta/conexion', authenticateSession, requireAdmin, async (req, res) => {
        try {
            const p = principalEnMemoria();
            const lista = await Promise.all(cuentas.map(paraVer));
            const pv = p ? lista.find(x => x.id === p.id) : null;
            res.set('Cache-Control', 'no-store');
            res.json({
                // La principal, como antes (lo usa todo lo que no sabe de cuentas).
                origen: p ? 'boton' : process.env.META_PAGE_TOKEN ? 'heroku' : null,
                pagina: pv?.pagina || null, instagram: pv?.instagram || null,
                faltan: pv?.faltan || [], datosCaducan: pv?.datosCaducan || null, conectadoPor: pv?.conectadoPor || null, conectadoAt: pv?.conectadoAt || null, avisos: pv?.avisos || [],
                // Todas (#651).
                cuentas: lista,
                puedeCambiar: puede(req), listo: !!process.env.META_APP_SECRET, direccionVuelta: vuelta(), appId: appIdMeta(),
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    // La lista corta, para elegir a qué cuentas va una publicación.
    router.get('/api/admin/meta/cuentas', authenticateSession, requireAdmin, (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({ cuentas: cuentas.map(c => ({ id: c.id, nombre: c.pagina.nombre, paginaId: c.pagina.id, instagram: c.instagram?.usuario || null, conInstagram: !!c.instagram, principal: !!c.principal })) });
    });

    // Ir a Facebook. Es una navegación (no una llamada): los errores vuelven al panel.
    router.get('/api/admin/meta/conectar', authenticateSession, requireAdmin, (req, res) => {
        if (!puede(req)) return alPanel(res, { meta: 'error', motivo: 'Solo el Equipo IT y la dirección pueden conectar Facebook.' });
        if (!process.env.META_APP_SECRET) return alPanel(res, { meta: 'error', motivo: 'Falta la clave secreta de la app de Meta (META_APP_SECRET) en Heroku.' });
        const estado = guardarPendiente({ userId: req.userSession.userId, paso: 'ida' });
        res.redirect(`https://www.facebook.com/${VERSION}/dialog/oauth?${new URLSearchParams({
            client_id: appIdMeta(), redirect_uri: vuelta(), state: estado, response_type: 'code',
            scope: PERMISOS_META.join(','), auth_type: 'rerequest',
        })}`);
    });

    // La vuelta de Facebook. Sin sesión (la cookie no viaja desde otro sitio):
    // vale el «state», que solo conoce quien pulsó el botón.
    router.get('/api/admin/meta/vuelta', async (req, res) => {
        const ida = tomar(req.query.state);
        if (!ida || ida.paso !== 'ida') return alPanel(res, { meta: 'error', motivo: 'El enlace ha caducado. Vuelve a pulsar «Conectar con Facebook».' });
        if (req.query.error) return alPanel(res, { meta: 'cancelado' });
        try {
            const corto = await graph('/oauth/access_token', { client_id: appIdMeta(), client_secret: process.env.META_APP_SECRET, redirect_uri: vuelta(), code: String(req.query.code || '') });
            const largo = await graph('/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: appIdMeta(), client_secret: process.env.META_APP_SECRET, fb_exchange_token: corto.access_token });
            const info = (await graph('/debug_token', { input_token: largo.access_token, access_token: `${appIdMeta()}|${process.env.META_APP_SECRET}` })).data || {};
            const permisos = Array.isArray(info.scopes) ? info.scopes : [];
            const datosCaducan = info.data_access_expires_at ? new Date(info.data_access_expires_at * 1000).toISOString() : null;
            // Las páginas que lleva quien ha iniciado sesión, con su token (que no caduca).
            const paginas = (await graph('/me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '100', access_token: largo.access_token })).data || [];
            if (!paginas.length) return alPanel(res, { meta: 'error', motivo: 'Esa cuenta de Facebook no lleva ninguna página (o no se marcó al dar permiso). Vuelve a conectar y elige las páginas.' });
            // Las que ya estaban conectadas se renuevan solas (otros 90 días de acceso).
            const yaEstaban = paginas.filter(p => cuentas.some(c => c.pagina.id === String(p.id)));
            if (yaEstaban.length) await guardar(yaEstaban, { permisos, datosCaducan, userId: ida.userId });
            if (paginas.length === 1 && !yaEstaban.length) {
                await guardar(paginas, { permisos, datosCaducan, userId: ida.userId });
                return alPanel(res, { meta: 'conectado' });
            }
            // Si no hay nada nuevo que elegir, ya está.
            if (paginas.every(p => yaEstaban.includes(p))) return alPanel(res, { meta: 'conectado' });
            const clave = guardarPendiente({ userId: ida.userId, paso: 'elegir', paginas, permisos, datosCaducan });
            alPanel(res, { meta: 'elegir', clave });
        } catch (e) {
            console.error('[meta] conectar:', e.message);
            alPanel(res, { meta: 'error', motivo: `Facebook no ha dejado conectar: ${e.message}` });
        }
    });

    // Con varias páginas: cuáles hay (y cuáles ya están) y cuáles se eligen.
    router.get('/api/admin/meta/elegir', authenticateSession, requireAdmin, (req, res) => {
        const p = pendientes.get(String(req.query.clave || ''));
        if (!p || p.paso !== 'elegir' || p.hasta < Date.now() || String(p.userId) !== String(req.userSession.userId)) return res.status(410).json({ error: 'Ha caducado. Vuelve a pulsar «Conectar con Facebook».' });
        res.json({ paginas: p.paginas.map(x => ({ id: x.id, nombre: x.name, instagram: x.instagram_business_account?.username || null, conectada: cuentas.some(c => c.pagina.id === String(x.id)) })) });
    });
    router.post('/api/admin/meta/elegir', authenticateSession, requireAdmin, async (req, res) => {
        try {
            if (!puede(req)) return res.status(403).json({ error: 'Solo el Equipo IT y la dirección pueden conectar Facebook.' });
            const clave = String(req.body?.clave || '');
            const p = pendientes.get(clave);
            if (!p || p.paso !== 'elegir' || p.hasta < Date.now() || String(p.userId) !== String(req.userSession.userId)) return res.status(410).json({ error: 'Ha caducado. Vuelve a pulsar «Conectar con Facebook».' });
            const ids = new Set((Array.isArray(req.body?.paginaIds) ? req.body.paginaIds : [req.body?.paginaId]).filter(Boolean).map(String));
            const elegidas = p.paginas.filter(x => ids.has(String(x.id)));
            if (!elegidas.length) return res.status(400).json({ error: 'Elige al menos una página.' });
            pendientes.delete(clave);
            await guardar(elegidas, { permisos: p.permisos, datosCaducan: p.datosCaducan, userId: req.userSession.userId });
            res.json({ success: true, conectadas: elegidas.map(x => x.name) });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // La principal: a la que va lo que no dice otra cosa.
    router.post('/api/admin/meta/cuentas/:id(\\d+)/principal', authenticateSession, requireAdmin, async (req, res) => {
        const client = await pool.connect();
        try {
            if (!puede(req)) return res.status(403).json({ error: 'Solo el Equipo IT y la dirección pueden cambiar la conexión.' });
            await client.query('BEGIN');
            const r = await client.query(`SELECT id FROM aim_social_cuentas WHERE id = $1 AND red = 'meta'`, [Number(req.params.id)]);
            if (!r.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Esa cuenta ya no está conectada.' }); }
            await client.query(`UPDATE aim_social_cuentas SET principal = (id = $1) WHERE red = 'meta'`, [Number(req.params.id)]);
            await client.query('COMMIT');
            await copiarPrincipal();
            await cargarConexionMeta(pool);
            alCambiar();
            res.json({ success: true });
        } catch (e) { await client.query('ROLLBACK').catch(() => {}); res.status(500).json({ error: e.message }); } finally { client.release(); }
    });
    // Quitar una cuenta. Si era la principal, pasa a serlo la siguiente.
    router.delete('/api/admin/meta/cuentas/:id(\\d+)', authenticateSession, requireAdmin, async (req, res) => {
        try {
            if (!puede(req)) return res.status(403).json({ error: 'Solo el Equipo IT y la dirección pueden cambiar la conexión.' });
            const r = (await pool.query(`DELETE FROM aim_social_cuentas WHERE id = $1 AND red = 'meta' RETURNING principal`, [Number(req.params.id)])).rows[0];
            if (!r) return res.status(404).json({ error: 'Esa cuenta ya no está conectada.' });
            if (r.principal) await pool.query(`UPDATE aim_social_cuentas SET principal = true WHERE id = (SELECT id FROM aim_social_cuentas WHERE red = 'meta' ORDER BY id LIMIT 1)`);
            await copiarPrincipal();
            await cargarConexionMeta(pool);
            alCambiar();
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    // Quitar todo lo conectado con el botón (vuelve a valer el de Heroku, si lo hay).
    router.post('/api/admin/meta/desconectar', authenticateSession, requireAdmin, async (req, res) => {
        try {
            if (!puede(req)) return res.status(403).json({ error: 'Solo el Equipo IT y la dirección pueden cambiar la conexión.' });
            await pool.query(`DELETE FROM aim_social_cuentas WHERE red = 'meta'`);
            await pool.query(`DELETE FROM aim_ajustes WHERE clave = $1`, [CLAVE]);
            cuentas = [];
            alCambiar();
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    return { router };
}
