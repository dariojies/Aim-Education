// ─────────────────────────────────────────────────────────────────────────────
// Conectar Facebook e Instagram con un botón (#468). Antes había que generar el
// token de la página a mano en Meta (con los permisos justos de cada cosa:
// mensajes, publicar, estadísticas…) y pegarlo en Heroku (META_PAGE_TOKEN).
// Ahora, desde el panel, «Conectar con Facebook»: se inicia sesión en Facebook,
// se aceptan todos los permisos de una vez y se elige la página. Aquí se saca su
// token (el de una página no caduca), su Instagram, se apunta la página a los
// avisos de mensajes y se guarda cifrado en aim_ajustes (la clave sale de
// META_APP_SECRET, que sigue en Heroku). Si no hay nada guardado, vale el de
// Heroku de antes.
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

let conexion = null;   // { token, pagina, instagram, permisos, datosCaducan, conectadoPor, conectadoAt, avisos }
export const tokenPagina = () => conexion?.token || process.env.META_PAGE_TOKEN || '';
export const conexionMeta = () => (conexion ? { ...conexion, token: undefined } : null);

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

// Al arrancar (y cada rato, por si otro proceso la cambió).
export async function cargarConexionMeta(pool) {
    try {
        const v = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = $1`, [CLAVE])).rows[0]?.valor;
        conexion = v?.token ? { ...v, token: descifrar(v.token) } : null;
    } catch (e) {
        // Si cambió META_APP_SECRET, lo guardado ya no se puede leer: hay que volver a conectar.
        console.error('[meta] no se puede leer la conexión guardada:', e.message);
        conexion = null;
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

    async function guardar(pagina, { permisos, datosCaducan, userId }) {
        const avisos = [];
        // Que los mensajes de la página lleguen a la web (el webhook de la app).
        try {
            await graph(`/${pagina.id}/subscribed_apps`, { subscribed_fields: 'messages,messaging_postbacks', access_token: pagina.access_token }, { method: 'POST' });
        } catch (e) { avisos.push(`No se ha podido apuntar la página a los avisos de mensajes: ${e.message}`); }
        const valor = {
            token: cifrar(pagina.access_token),
            pagina: { id: pagina.id, nombre: pagina.name },
            instagram: pagina.instagram_business_account ? { id: pagina.instagram_business_account.id, usuario: pagina.instagram_business_account.username || null } : null,
            permisos, datosCaducan, conectadoPor: userId, conectadoAt: new Date().toISOString(), avisos,
        };
        await pool.query(
            `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ($1, $2::jsonb, NOW(), $3)
             ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = EXCLUDED.actualizado_por`,
            [CLAVE, JSON.stringify(valor), userId]);
        conexion = { ...valor, token: pagina.access_token };
        alCambiar();
    }

    router.get('/api/admin/meta/conexion', authenticateSession, requireAdmin, async (req, res) => {
        try {
            const c = conexion;
            const quien = c?.conectadoPor ? (await pool.query(`SELECT TRIM(CONCAT(name, ' ', COALESCE(surname, ''))) AS n FROM users WHERE user_id = $1`, [c.conectadoPor]).catch(() => ({ rows: [] }))).rows[0]?.n : null;
            res.set('Cache-Control', 'no-store');
            res.json({
                origen: c ? 'boton' : process.env.META_PAGE_TOKEN ? 'heroku' : null,
                pagina: c?.pagina || null, instagram: c?.instagram || null,
                faltan: c ? PERMISOS_META.filter(p => !(c.permisos || []).includes(p)) : [],
                datosCaducan: c?.datosCaducan || null, conectadoPor: quien || null, conectadoAt: c?.conectadoAt || null, avisos: c?.avisos || [],
                puedeCambiar: puede(req), listo: !!process.env.META_APP_SECRET, direccionVuelta: vuelta(), appId: appIdMeta(),
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
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
            if (!paginas.length) return alPanel(res, { meta: 'error', motivo: 'Esa cuenta de Facebook no lleva ninguna página (o no se marcó al dar permiso). Vuelve a conectar y elige la página del club.' });
            if (paginas.length === 1) {
                await guardar(paginas[0], { permisos, datosCaducan, userId: ida.userId });
                return alPanel(res, { meta: 'conectado' });
            }
            const clave = guardarPendiente({ userId: ida.userId, paso: 'elegir', paginas, permisos, datosCaducan });
            alPanel(res, { meta: 'elegir', clave });
        } catch (e) {
            console.error('[meta] conectar:', e.message);
            alPanel(res, { meta: 'error', motivo: `Facebook no ha dejado conectar: ${e.message}` });
        }
    });

    // Con varias páginas: cuáles hay y cuál se elige.
    router.get('/api/admin/meta/elegir', authenticateSession, requireAdmin, (req, res) => {
        const p = pendientes.get(String(req.query.clave || ''));
        if (!p || p.paso !== 'elegir' || p.hasta < Date.now() || String(p.userId) !== String(req.userSession.userId)) return res.status(410).json({ error: 'Ha caducado. Vuelve a pulsar «Conectar con Facebook».' });
        res.json({ paginas: p.paginas.map(x => ({ id: x.id, nombre: x.name, instagram: x.instagram_business_account?.username || null })) });
    });
    router.post('/api/admin/meta/elegir', authenticateSession, requireAdmin, async (req, res) => {
        try {
            if (!puede(req)) return res.status(403).json({ error: 'Solo el Equipo IT y la dirección pueden conectar Facebook.' });
            const clave = String(req.body?.clave || '');
            const p = pendientes.get(clave);
            if (!p || p.paso !== 'elegir' || p.hasta < Date.now() || String(p.userId) !== String(req.userSession.userId)) return res.status(410).json({ error: 'Ha caducado. Vuelve a pulsar «Conectar con Facebook».' });
            const pagina = p.paginas.find(x => x.id === String(req.body?.paginaId));
            if (!pagina) return res.status(400).json({ error: 'Elige una de las páginas.' });
            pendientes.delete(clave);
            await guardar(pagina, { permisos: p.permisos, datosCaducan: p.datosCaducan, userId: req.userSession.userId });
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Quitar lo conectado con el botón (vuelve a valer el de Heroku, si lo hay).
    router.post('/api/admin/meta/desconectar', authenticateSession, requireAdmin, async (req, res) => {
        try {
            if (!puede(req)) return res.status(403).json({ error: 'Solo el Equipo IT y la dirección pueden cambiar la conexión.' });
            await pool.query(`DELETE FROM aim_ajustes WHERE clave = $1`, [CLAVE]);
            conexion = null;
            alCambiar();
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    return { router };
}
