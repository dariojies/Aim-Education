// ─────────────────────────────────────────────────────────────────────────────
// LinkedIn (#651, fase 3): conectar perfiles y páginas de empresa y publicar en
// ellos desde Publicaciones (texto, fotos o un vídeo).
//
// Hace falta una app en developer.linkedin.com, asociada a la página de AIM
// Education, con LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET en Heroku y la
// dirección de vuelta /api/admin/linkedin/vuelta. Dos formas de conectar:
//   · perfil personal: productos «Share on LinkedIn» y «Sign In with LinkedIn
//     using OpenID Connect» (se dan solos, al momento);
//   · páginas de empresa: el producto «Community Management API», que LinkedIn
//     tiene que aprobar (privacidad, vídeo de cómo se usa…). Hasta entonces, el
//     botón de las páginas da error en LinkedIn.
//
// El permiso que da LinkedIn dura 60 días y no se renueva solo (eso solo lo
// tienen algunos socios suyos): hay que volver a conectar. La pantalla avisa.
// Cada perfil o página es una fila de aim_social_cuentas, red 'linkedin', con su
// permiso cifrado (la clave sale de LINKEDIN_CLIENT_SECRET).
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';
import { mandaAlMenos } from './permisos.js';

const API = () => (process.env.LINKEDIN_API_URL || 'https://api.linkedin.com').replace(/\/+$/, '');
const OAUTH = () => (process.env.LINKEDIN_OAUTH_URL || 'https://www.linkedin.com/oauth/v2').replace(/\/+$/, '');
export const linkedinListo = () => !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
// La versión de la API (YYYYMM). LinkedIn mantiene cada una al menos un año: por
// defecto, la de hace dos meses (siempre en vigor); se puede fijar con LINKEDIN_VERSION.
const versionApi = () => {
    if (/^\d{6}$/.test(process.env.LINKEDIN_VERSION || '')) return process.env.LINKEDIN_VERSION;
    const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 2);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const PERMISOS = {
    perfil: ['openid', 'profile', 'w_member_social'],
    empresa: ['openid', 'profile', 'w_organization_social', 'r_organization_admin'],
};

const llave = () => crypto.createHash('sha256').update(`aim-linkedin:${process.env.LINKEDIN_CLIENT_SECRET || ''}`).digest();
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
async function json(r) {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.message || d.error_description || d.error || `LinkedIn ha respondido ${r.status}`), { status: r.status });
    return d;
}
// «person:abc» → «urn:li:person:abc».
const urnDe = (externo) => `urn:li:${externo}`;

export function crearLinkedIn({ pool, authenticateSession, requireAdmin, urlPublica }) {
    const router = express.Router();
    const puede = (req) => mandaAlMenos(req.userSession?.rol, 'club_owner');
    const vuelta = () => `${String(urlPublica).replace(/\/+$/, '')}/api/admin/linkedin/vuelta`;
    const alPanel = (res, q) => res.redirect(`/admin/redes?${new URLSearchParams(q)}`);
    const estados = new Map(); // state → { userId, modo, hasta }
    const cabeceras = (token, extra = {}) => ({ Authorization: `Bearer ${token}`, 'LinkedIn-Version': versionApi(), 'X-Restli-Protocol-Version': '2.0.0', ...extra });

    async function guardarCuenta({ externo, nombre, acceso, caduca, permisos, userId }) {
        await pool.query(
            `INSERT INTO aim_social_cuentas (red, externo_id, nombre, token, permisos, datos_caducan, conectado_por, conectado_at)
             VALUES ('linkedin', $1, $2, $3, $4::jsonb, $5, $6, NOW())
             ON CONFLICT (red, externo_id) DO UPDATE SET nombre = EXCLUDED.nombre, token = EXCLUDED.token, permisos = EXCLUDED.permisos,
                 datos_caducan = EXCLUDED.datos_caducan, conectado_por = EXCLUDED.conectado_por, conectado_at = NOW()`,
            [externo, nombre, cifrar(acceso), JSON.stringify(permisos), caduca, userId]);
    }
    async function cuentas() {
        return (await pool.query(`SELECT id, externo_id, nombre, datos_caducan, conectado_at FROM aim_social_cuentas WHERE red = 'linkedin' ORDER BY externo_id LIKE 'organization:%' DESC, nombre`)).rows
            .map(c => ({ id: c.id, nombre: c.nombre, tipo: c.externo_id.startsWith('organization:') ? 'empresa' : 'perfil', caduca: c.datos_caducan, conectadoAt: c.conectado_at }));
    }
    const existe = async (id) => (await pool.query(`SELECT 1 FROM aim_social_cuentas WHERE id = $1 AND red = 'linkedin'`, [Number(id) || 0])).rowCount > 0;
    async function accesoDe(cuentaId) {
        const f = (await pool.query(`SELECT externo_id, nombre, token, datos_caducan FROM aim_social_cuentas WHERE id = $1 AND red = 'linkedin'`, [cuentaId])).rows[0];
        if (!f) throw new Error('Esa cuenta de LinkedIn ya no está conectada.');
        if (f.datos_caducan && new Date(f.datos_caducan) < new Date()) throw new Error(`El permiso de LinkedIn de «${f.nombre}» ha caducado (dura 60 días): vuelve a conectarla en Redes sociales.`);
        let token;
        try { token = descifrar(f.token); } catch { throw new Error('No se puede leer el permiso de LinkedIn (¿cambió LINKEDIN_CLIENT_SECRET?): vuelve a conectarla.'); }
        return { token, autor: urnDe(f.externo_id), nombre: f.nombre };
    }

    // Subir una foto: se pide dónde y se manda.
    async function subirImagen(token, autor, m) {
        const ini = await json(await fetch(`${API()}/rest/images?action=initializeUpload`, {
            method: 'POST', headers: cabeceras(token, { 'Content-Type': 'application/json' }), signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({ initializeUploadRequest: { owner: autor } }),
        }));
        const up = await fetch(ini.value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: m.datos, signal: AbortSignal.timeout(120_000) });
        if (!up.ok) throw new Error(`LinkedIn no ha cogido la foto (${up.status}).`);
        return ini.value.image;
    }
    // Subir un vídeo: en trozos (los que diga LinkedIn) y se cierra con sus «etiquetas».
    async function subirVideo(token, autor, m) {
        const ini = await json(await fetch(`${API()}/rest/videos?action=initializeUpload`, {
            method: 'POST', headers: cabeceras(token, { 'Content-Type': 'application/json' }), signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({ initializeUploadRequest: { owner: autor, fileSizeBytes: m.datos.length, uploadCaptions: false, uploadThumbnail: false } }),
        }));
        const v = ini.value;
        const partes = [];
        for (const ins of v.uploadInstructions || []) {
            const trozo = m.datos.subarray(Number(ins.firstByte), Number(ins.lastByte) + 1);
            const r = await fetch(ins.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: trozo, signal: AbortSignal.timeout(10 * 60_000) });
            if (!r.ok) throw new Error(`LinkedIn no ha cogido un trozo del vídeo (${r.status}).`);
            partes.push(r.headers.get('etag'));
        }
        const fin = await fetch(`${API()}/rest/videos?action=finalizeUpload`, {
            method: 'POST', headers: cabeceras(token, { 'Content-Type': 'application/json' }), signal: AbortSignal.timeout(60_000),
            body: JSON.stringify({ finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken || '', uploadedPartIds: partes } }),
        });
        if (!fin.ok) await json(fin);
        return v.video;
    }

    // Publicar. medios: [{ mime, datos }] (ya leídos de la base).
    async function publicar(cuentaId, { texto, medios = [] }) {
        const { token, autor } = await accesoDe(cuentaId);
        const imgs = medios.filter(m => m.mime.startsWith('image/')), vids = medios.filter(m => m.mime.startsWith('video/'));
        let content;
        if (vids.length) content = { media: { id: await subirVideo(token, autor, vids[0]) } };
        else if (imgs.length === 1) content = { media: { id: await subirImagen(token, autor, imgs[0]) } };
        else if (imgs.length > 1) {
            const ids = [];
            for (const m of imgs) ids.push({ id: await subirImagen(token, autor, m) });
            content = { multiImage: { images: ids } };
        }
        const r = await fetch(`${API()}/rest/posts`, {
            method: 'POST', headers: cabeceras(token, { 'Content-Type': 'application/json' }), signal: AbortSignal.timeout(60_000),
            body: JSON.stringify({
                author: autor, commentary: String(texto || '').slice(0, 3000), visibility: 'PUBLIC',
                distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
                ...(content ? { content } : {}), lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
            }),
        });
        if (!r.ok) await json(r);
        const id = r.headers.get('x-restli-id') || null;
        return { id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : null };
    }

    router.get('/api/admin/linkedin/cuentas', authenticateSession, requireAdmin, async (req, res) => {
        try { res.set('Cache-Control', 'no-store'); res.json({ listo: linkedinListo(), puedeCambiar: puede(req), direccionVuelta: vuelta(), cuentas: await cuentas() }); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Ir a LinkedIn: ?modo=perfil (el perfil de quien conecta) o ?modo=empresa (sus páginas).
    router.get('/api/admin/linkedin/conectar', authenticateSession, requireAdmin, (req, res) => {
        if (!puede(req)) return alPanel(res, { linkedin: 'error', motivo: 'Solo el Equipo IT y la dirección pueden conectar LinkedIn.' });
        if (!linkedinListo()) return alPanel(res, { linkedin: 'error', motivo: 'Falta la app de LinkedIn (LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET en Heroku).' });
        const modo = req.query.modo === 'empresa' ? 'empresa' : 'perfil';
        for (const [k, v] of estados) if (v.hasta < Date.now()) estados.delete(k);
        const state = crypto.randomBytes(24).toString('base64url');
        estados.set(state, { userId: req.userSession.userId, modo, hasta: Date.now() + 15 * 60_000 });
        res.redirect(`${OAUTH()}/authorization?${new URLSearchParams({ response_type: 'code', client_id: process.env.LINKEDIN_CLIENT_ID, redirect_uri: vuelta(), state, scope: PERMISOS[modo].join(' ') })}`);
    });

    router.get('/api/admin/linkedin/vuelta', async (req, res) => {
        const ida = estados.get(String(req.query.state || ''));
        estados.delete(String(req.query.state || ''));
        if (!ida || ida.hasta < Date.now()) return alPanel(res, { linkedin: 'error', motivo: 'El enlace ha caducado. Vuelve a pulsar el botón de LinkedIn.' });
        if (req.query.error) {
            const sinAprobar = ida.modo === 'empresa' && /scope/i.test(String(req.query.error) + String(req.query.error_description || ''));
            return alPanel(res, sinAprobar
                ? { linkedin: 'error', motivo: 'LinkedIn aún no deja publicar en páginas de empresa: falta que apruebe la app («Community Management API»).' }
                : { linkedin: 'cancelado' });
        }
        try {
            const t = await json(await fetch(`${OAUTH()}/accessToken`, {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(20_000),
                body: new URLSearchParams({ grant_type: 'authorization_code', code: String(req.query.code || ''), client_id: process.env.LINKEDIN_CLIENT_ID, client_secret: process.env.LINKEDIN_CLIENT_SECRET, redirect_uri: vuelta() }),
            }));
            const caduca = new Date(Date.now() + (Number(t.expires_in) || 60 * 86400) * 1000).toISOString();
            const permisos = String(t.scope || '').split(/[ ,]+/).filter(Boolean);
            const yo = await json(await fetch(`${API()}/v2/userinfo`, { headers: { Authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(20_000) }));
            const nombres = [];
            if (ida.modo === 'perfil') {
                await guardarCuenta({ externo: `person:${yo.sub}`, nombre: yo.name || 'Perfil de LinkedIn', acceso: t.access_token, caduca, permisos, userId: ida.userId });
                nombres.push(yo.name || 'tu perfil');
            } else {
                const acl = await json(await fetch(`${API()}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=50`, { headers: cabeceras(t.access_token), signal: AbortSignal.timeout(20_000) }));
                const orgs = [...new Set((acl.elements || []).map(e => String(e.organization || e.organizationTarget || '')).filter(u => u.startsWith('urn:li:organization:')))];
                if (!orgs.length) return alPanel(res, { linkedin: 'error', motivo: 'Esa cuenta no es administradora de ninguna página de empresa en LinkedIn.' });
                for (const urn of orgs) {
                    const id = urn.split(':').pop();
                    const o = await json(await fetch(`${API()}/rest/organizations/${id}`, { headers: cabeceras(t.access_token), signal: AbortSignal.timeout(20_000) })).catch(() => ({}));
                    const nombre = o.localizedName || o.name?.localized?.es_ES || `Página ${id}`;
                    await guardarCuenta({ externo: `organization:${id}`, nombre, acceso: t.access_token, caduca, permisos, userId: ida.userId });
                    nombres.push(nombre);
                }
            }
            alPanel(res, { linkedin: 'conectado', cuentas: nombres.join(', ') });
        } catch (e) {
            console.error('[linkedin] conectar:', e.message);
            alPanel(res, { linkedin: 'error', motivo: `LinkedIn no ha dejado conectar: ${e.message}` });
        }
    });

    router.delete('/api/admin/linkedin/cuentas/:id(\\d+)', authenticateSession, requireAdmin, async (req, res) => {
        try {
            if (!puede(req)) return res.status(403).json({ error: 'Solo el Equipo IT y la dirección pueden cambiar la conexión.' });
            const r = await pool.query(`DELETE FROM aim_social_cuentas WHERE id = $1 AND red = 'linkedin'`, [Number(req.params.id)]);
            if (!r.rowCount) return res.status(404).json({ error: 'Esa cuenta ya no está conectada.' });
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    return { router, publicar, existe, cuentas };
}
