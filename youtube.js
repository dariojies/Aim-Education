// ─────────────────────────────────────────────────────────────────────────────
// YouTube (#651, fase 2): conectar canales y subir vídeos desde Publicaciones.
//
// Usa el mismo acceso de Google Cloud que «Entrar con Google» (GOOGLE_CLIENT_ID
// y GOOGLE_CLIENT_SECRET), con dos cosas más en ese proyecto, una sola vez:
//   · la «YouTube Data API v3» activada;
//   · la dirección de vuelta /api/admin/youtube/vuelta entre las autorizadas.
// Si la pantalla de consentimiento es «Interna», Google no pide revisar nada,
// siempre que el canal se gestione con una cuenta del dominio.
//
// Se pueden conectar varios canales. De cada uno se guarda (cifrado, con una
// clave que sale de GOOGLE_CLIENT_SECRET) el permiso de larga duración (refresh
// token) en aim_social_cuentas, red 'youtube'. Para subir, se pide un permiso de
// una hora y se sube el vídeo en dos pasos (subida «reanudable»).
//
// Desde noviembre de 2026 Google ya no deja en privado lo subido desde una app
// sin auditar: los vídeos salen públicos.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';
import { mandaAlMenos } from './permisos.js';

const PERMISOS = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];
const API = () => (process.env.YOUTUBE_API_URL || 'https://www.googleapis.com').replace(/\/+$/, '');
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
export const youtubeListo = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const llave = () => crypto.createHash('sha256').update(`aim-youtube:${process.env.GOOGLE_CLIENT_SECRET || ''}`).digest();
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
    if (!r.ok || d.error) {
        const m = d.error?.message || d.error_description || (typeof d.error === 'string' ? d.error : null) || `Google ha respondido ${r.status}`;
        throw Object.assign(new Error(m), { status: r.status });
    }
    return d;
}

export function crearYouTube({ pool, authenticateSession, requireAdmin, urlPublica }) {
    const router = express.Router();
    const puede = (req) => mandaAlMenos(req.userSession?.rol, 'club_owner');
    const vuelta = () => `${String(urlPublica).replace(/\/+$/, '')}/api/admin/youtube/vuelta`;
    const alPanel = (res, q) => res.redirect(`/admin/redes?${new URLSearchParams(q)}`);
    const estados = new Map(); // state → { userId, hasta }

    // Un permiso de una hora para un canal (se guarda un rato).
    const permisos = new Map(); // cuentaId → { token, hasta }
    async function accesoDe(cuentaId) {
        const p = permisos.get(cuentaId);
        if (p && p.hasta > Date.now() + 60_000) return p.token;
        const fila = (await pool.query(`SELECT token FROM aim_social_cuentas WHERE id = $1 AND red = 'youtube'`, [cuentaId])).rows[0];
        if (!fila) throw new Error('Ese canal de YouTube ya no está conectado.');
        let refresh;
        try { refresh = descifrar(fila.token); } catch { throw new Error('No se puede leer el permiso del canal (¿cambió GOOGLE_CLIENT_SECRET?): vuelve a conectarlo.'); }
        const d = await json(await fetch(TOKEN_URL(), {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(20_000),
            body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
        })).catch(e => { throw new Error(/invalid_grant|expired|revoked/i.test(e.message) ? 'Google ha retirado el permiso del canal: vuelve a conectarlo en Redes sociales.' : `Google: ${e.message}`); });
        permisos.set(cuentaId, { token: d.access_token, hasta: Date.now() + (Number(d.expires_in) || 3600) * 1000 });
        return d.access_token;
    }

    // Los canales conectados (para elegir al publicar y para Redes sociales).
    async function canales() {
        return (await pool.query(`SELECT id, externo_id, nombre, conectado_at, conectado_por FROM aim_social_cuentas WHERE red = 'youtube' ORDER BY id`)).rows
            .map(c => ({ id: c.id, canalId: c.externo_id, nombre: c.nombre, conectadoAt: c.conectado_at }));
    }
    const existe = async (id) => (await pool.query(`SELECT 1 FROM aim_social_cuentas WHERE id = $1 AND red = 'youtube'`, [Number(id) || 0])).rowCount > 0;

    // Subir un vídeo. El título es lo que va en la primera línea del texto.
    async function subirVideo(cuentaId, { texto, mime, datos, privacidad = 'public' }) {
        const token = await accesoDe(cuentaId);
        const lineas = String(texto || '').split('\n').map(l => l.trim()).filter(Boolean);
        const titulo = (lineas[0] || 'Vídeo de AIM Education').replace(/[<>]/g, '').slice(0, 100);
        const descripcion = String(texto || '').replace(/[<>]/g, '').slice(0, 5000);
        const inicio = await fetch(`${API()}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
            method: 'POST', signal: AbortSignal.timeout(30_000),
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(datos.length) },
            body: JSON.stringify({ snippet: { title: titulo, description: descripcion, categoryId: '27' }, status: { privacyStatus: privacidad, selfDeclaredMadeForKids: false } }),
        });
        if (!inicio.ok) await json(inicio);
        const destino = inicio.headers.get('location');
        if (!destino) throw new Error('YouTube no ha dado dónde subir el vídeo.');
        const fin = await json(await fetch(destino, { method: 'PUT', headers: { 'Content-Type': mime, 'Content-Length': String(datos.length) }, body: datos, signal: AbortSignal.timeout(15 * 60_000) }));
        return { id: fin.id, url: `https://www.youtube.com/watch?v=${fin.id}` };
    }

    router.get('/api/admin/youtube/cuentas', authenticateSession, requireAdmin, async (req, res) => {
        try { res.set('Cache-Control', 'no-store'); res.json({ listo: youtubeListo(), puedeCambiar: puede(req), direccionVuelta: vuelta(), canales: await canales() }); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Ir a Google (una navegación: los errores vuelven al panel).
    router.get('/api/admin/youtube/conectar', authenticateSession, requireAdmin, (req, res) => {
        if (!puede(req)) return alPanel(res, { youtube: 'error', motivo: 'Solo el Equipo IT y la dirección pueden conectar YouTube.' });
        if (!youtubeListo()) return alPanel(res, { youtube: 'error', motivo: 'Falta el acceso de Google (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Heroku).' });
        for (const [k, v] of estados) if (v.hasta < Date.now()) estados.delete(k);
        const state = crypto.randomBytes(24).toString('base64url');
        estados.set(state, { userId: req.userSession.userId, hasta: Date.now() + 15 * 60_000 });
        res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: vuelta(), response_type: 'code', scope: PERMISOS.join(' '),
            access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'true', state,
        })}`);
    });

    // La vuelta de Google: el «state» dice quién pulsó el botón.
    router.get('/api/admin/youtube/vuelta', async (req, res) => {
        const ida = estados.get(String(req.query.state || ''));
        estados.delete(String(req.query.state || ''));
        if (!ida || ida.hasta < Date.now()) return alPanel(res, { youtube: 'error', motivo: 'El enlace ha caducado. Vuelve a pulsar «Conectar con YouTube».' });
        if (req.query.error) return alPanel(res, { youtube: 'cancelado' });
        try {
            const t = await json(await fetch(TOKEN_URL(), {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(20_000),
                body: new URLSearchParams({ code: String(req.query.code || ''), client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: vuelta(), grant_type: 'authorization_code' }),
            }));
            if (!t.refresh_token) return alPanel(res, { youtube: 'error', motivo: 'Google no ha dado el permiso duradero. Quita el acceso de la app en myaccount.google.com › Seguridad y vuelve a conectar.' });
            const ch = await json(await fetch(`${API()}/youtube/v3/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(20_000) }));
            const canal = ch.items?.[0];
            if (!canal) return alPanel(res, { youtube: 'error', motivo: 'Esa cuenta de Google no tiene canal de YouTube. Elige la cuenta (o el canal de marca) del club.' });
            await pool.query(
                `INSERT INTO aim_social_cuentas (red, externo_id, nombre, token, permisos, conectado_por, conectado_at)
                 VALUES ('youtube', $1, $2, $3, $4::jsonb, $5, NOW())
                 ON CONFLICT (red, externo_id) DO UPDATE SET nombre = EXCLUDED.nombre, token = EXCLUDED.token, permisos = EXCLUDED.permisos,
                     conectado_por = EXCLUDED.conectado_por, conectado_at = NOW()`,
                [canal.id, canal.snippet?.title || 'Canal de YouTube', cifrar(t.refresh_token), JSON.stringify(String(t.scope || '').split(' ').filter(Boolean)), ida.userId]);
            permisos.clear();
            alPanel(res, { youtube: 'conectado', canal: canal.snippet?.title || '' });
        } catch (e) {
            console.error('[youtube] conectar:', e.message);
            alPanel(res, { youtube: 'error', motivo: `Google no ha dejado conectar: ${e.message}` });
        }
    });

    router.delete('/api/admin/youtube/cuentas/:id(\\d+)', authenticateSession, requireAdmin, async (req, res) => {
        try {
            if (!puede(req)) return res.status(403).json({ error: 'Solo el Equipo IT y la dirección pueden cambiar la conexión.' });
            const r = await pool.query(`DELETE FROM aim_social_cuentas WHERE id = $1 AND red = 'youtube'`, [Number(req.params.id)]);
            if (!r.rowCount) return res.status(404).json({ error: 'Ese canal ya no está conectado.' });
            permisos.delete(Number(req.params.id));
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    return { router, subirVideo, existe, canales };
}
