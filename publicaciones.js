// ─────────────────────────────────────────────────────────────────────────────
// Publicaciones en redes (ticket #410): nuestro propio «Metricool» dentro del
// CRM. Se escribe una publicación (texto, fotos, carrusel, vídeo, reel o
// historia), se elige en qué redes sale (Facebook e Instagram), se publica ya o
// se programa, y aquí se ven el calendario y las estadísticas de las cuentas.
//
// Usa la misma app de Meta que «Redes sociales» (#341) y su token de la página
// (el de «Conectar con Facebook», #468, o si no META_PAGE_TOKEN en Heroku). Para publicar, ese token necesita los permisos
// pages_manage_posts y, para Instagram, instagram_basic e instagram_content_publish;
// para las estadísticas, read_insights e instagram_manage_insights. La pantalla
// dice cuáles faltan. La cuenta de Instagram tiene que ser profesional y estar
// vinculada a la página.
//
// Meta no recibe los archivos: los descarga de una dirección pública nuestra
// (/publico/medios/<clave>) en el momento de publicar. Por eso las fotos y
// vídeos se guardan aquí (en la base de datos) hasta que se publican; después
// se borran y solo queda la miniatura (la base es pequeña).
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';
import { tokenPagina } from './meta-conexion.js';
import { historiasPrevistas, programarHistoriaYa, imagenPrevista } from './disenos-automaticos.js';

const REDES = ['facebook', 'instagram'];
const TIPOS = ['post', 'reel', 'story'];
const MAX_IMAGEN = 8 * 1024 * 1024;
const MAX_VIDEO = 100 * 1024 * 1024;
const MAX_MEDIOS = 10;
const espera = (ms) => new Promise(r => setTimeout(r, ms));

// ── Efemérides (#479) ──
// Los días señalados (Día de la Paz, de Andalucía…) en que conviene publicar algo.
// Salen en el calendario y, una semana antes, la campanita avisa si ese día aún no
// hay nada programado. Se guardan en aim_ajustes («efemerides»); hasta que se
// cambien, valen las de abajo. Cada una: { nombre, dia }, con dia «MM-DD» (cada
// año), «AAAA-MM-DD» (un día concreto) o «N-dom-MM» (el N.º domingo de un mes,
// como el Día de la Madre).
const CLAVE_EFEMERIDES = 'efemerides';
export const EFEMERIDES_DE_FABRICA = [
    ['01-01', 'Año Nuevo'], ['01-06', 'Día de Reyes'], ['01-24', 'Día Internacional de la Educación'], ['01-30', 'Día Escolar de la No Violencia y la Paz'],
    ['02-14', 'San Valentín'], ['02-28', 'Día de Andalucía'], ['03-08', 'Día Internacional de la Mujer'], ['03-19', 'Día del Padre'],
    ['04-02', 'Día Internacional del Libro Infantil'], ['04-06', 'Día Internacional del Deporte'], ['04-11', 'Día del Taekwon-Do (ITF)'], ['04-23', 'Día del Libro'],
    ['04-29', 'Día Internacional de la Danza'], ['1-dom-05', 'Día de la Madre'], ['05-15', 'Día Internacional de las Familias'], ['06-05', 'Día Mundial del Medio Ambiente'],
    ['06-21', 'Día de la Música'], ['10-31', 'Halloween'], ['11-20', 'Día Universal del Niño'], ['11-27', 'Día del Maestro'],
    ['12-06', 'Día de la Constitución'], ['12-24', 'Nochebuena'], ['12-25', 'Navidad'], ['12-31', 'Nochevieja'],
].map(([dia, nombre]) => ({ dia, nombre }));
const valeDia = (d) => /^(\d{2}-\d{2}|\d{4}-\d{2}-\d{2}|[1-5]-dom-\d{2})$/.test(String(d || ''));
export async function efemeridesGuardadas(pool) {
    const v = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = $1`, [CLAVE_EFEMERIDES])).rows[0]?.valor;
    return Array.isArray(v) ? v : EFEMERIDES_DE_FABRICA;
}
// Los días de cada efeméride entre dos fechas: [{ fecha, nombre }].
export function efemeridesEntre(lista, desde, hasta) {
    const out = [];
    for (let y = Number(desde.slice(0, 4)); y <= Number(hasta.slice(0, 4)); y++) {
        for (const e of lista) {
            let fecha = null;
            if (/^\d{4}-\d{2}-\d{2}$/.test(e.dia)) fecha = e.dia.startsWith(`${y}-`) ? e.dia : null;
            else if (/^\d{2}-\d{2}$/.test(e.dia)) fecha = `${y}-${e.dia}`;
            else {
                const [n, , mes] = e.dia.split('-');
                const d = new Date(Date.UTC(y, Number(mes) - 1, 1));
                d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7) + (Number(n) - 1) * 7);
                if (d.getUTCMonth() === Number(mes) - 1) fecha = d.toISOString().slice(0, 10);
            }
            if (fecha && fecha >= desde && fecha <= hasta) out.push({ fecha, nombre: e.nombre });
        }
    }
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
const hoyMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const sumarDia = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Los días con algo programado o publicado (en España).
async function diasConPublicacion(pool, desde, hasta) {
    const r = await pool.query(
        `SELECT DISTINCT ((COALESCE(publicada_at, programada_at)) AT TIME ZONE 'Europe/Madrid')::date::text AS d FROM aim_social_publicaciones
         WHERE estado IN ('programada', 'publicando', 'publicada', 'parcial') AND COALESCE(publicada_at, programada_at) IS NOT NULL
           AND (COALESCE(publicada_at, programada_at) AT TIME ZONE 'Europe/Madrid')::date BETWEEN $1::date AND $2::date`, [desde, hasta]);
    return new Set(r.rows.map(x => x.d));
}
// Para la campanita: las efemérides de los próximos 7 días sin nada programado ese día.
export async function efemeridesSinPublicar(pool, dias = 7) {
    const hoy = hoyMadrid(), hasta = sumarDia(hoy, dias);
    const proximas = efemeridesEntre(await efemeridesGuardadas(pool), hoy, hasta);
    if (!proximas.length) return [];
    const con = await diasConPublicacion(pool, hoy, hasta);
    return proximas.filter(e => !con.has(e.fecha));
}

export async function crearTablasPublicaciones(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_social_publicaciones (
            id SERIAL PRIMARY KEY,
            texto TEXT NOT NULL DEFAULT '',
            redes TEXT[] NOT NULL DEFAULT '{}',
            tipo VARCHAR(10) NOT NULL DEFAULT 'post',
            estado VARCHAR(12) NOT NULL DEFAULT 'borrador',
            programada_at TIMESTAMPTZ,
            publicada_at TIMESTAMPTZ,
            resultado JSONB NOT NULL DEFAULT '{}',
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            actualizado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_social_pub_estado ON aim_social_publicaciones (estado, programada_at)`);
    // De qué noticia salió (#491): para no repetirla y para quitarla si la noticia se despublica.
    await client.query(`ALTER TABLE aim_social_publicaciones ADD COLUMN IF NOT EXISTS noticia TEXT`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_social_medios (
            id SERIAL PRIMARY KEY,
            publicacion_id INTEGER NOT NULL REFERENCES aim_social_publicaciones(id) ON DELETE CASCADE,
            orden SMALLINT NOT NULL DEFAULT 0,
            mime VARCHAR(40) NOT NULL,
            datos BYTEA,
            miniatura BYTEA,
            bytes INTEGER,
            ancho INTEGER,
            alto INTEGER,
            token VARCHAR(64) NOT NULL UNIQUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_social_medios_pub ON aim_social_medios (publicacion_id, orden)`);
}

// Lo que se comprueba antes de programar o publicar. Devuelve el error o null.
export function problemaPublicacion({ texto, redes, tipo, medios }) {
    const imgs = medios.filter(m => m.mime.startsWith('image/')), vids = medios.filter(m => m.mime.startsWith('video/'));
    if (!redes.length) return 'Elige al menos una red.';
    // Las historias, también en la página de Facebook (#470): una foto o un vídeo.
    if (tipo === 'story' && medios.length !== 1) return 'Una historia lleva una sola foto o un solo vídeo.';
    if (tipo === 'reel' && (vids.length !== 1 || imgs.length)) return 'Un reel lleva un solo vídeo.';
    if (redes.includes('instagram')) {
        if (!medios.length) return 'Instagram necesita al menos una foto o un vídeo.';
        if (texto.length > 2200) return `En Instagram el texto puede tener 2.200 caracteres como mucho (lleva ${texto.length}).`;
        if ((texto.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30) return 'Instagram admite 30 hashtags como mucho.';
    }
    if (redes.includes('facebook')) {
        if (!texto.trim() && !medios.length) return 'Escribe algo o añade una foto.';
        if (vids.length && medios.length > 1) return 'En Facebook un vídeo va solo, sin más fotos ni vídeos.';
    }
    if (medios.length > MAX_MEDIOS) return `Como mucho ${MAX_MEDIOS} fotos o vídeos.`;
    return null;
}

export function crearPublicaciones({ pool, authenticateSession, requireSeccion, urlPublica, fetch: fetchImpl = (...a) => globalThis.fetch(...a) }) {
    const router = express.Router();
    const ver = [authenticateSession, requireSeccion('comunicaciones')];
    const GRAPH = () => (process.env.META_GRAPH_URL || 'https://graph.facebook.com/v21.0').replace(/\/+$/, '');
    // El de «Conectar con Facebook» (#468) o, si no, el de Heroku.
    const TOKEN = () => tokenPagina();
    const BASE_MEDIOS = () => (process.env.URL_MEDIOS_PUBLICA || urlPublica).replace(/\/+$/, '');

    // Una llamada a la API de Meta, con su error en claro.
    async function graph(ruta, { method = 'GET', body } = {}) {
        const sep = ruta.includes('?') ? '&' : '?';
        const r = await fetchImpl(`${GRAPH()}${ruta}${method === 'GET' ? `${sep}access_token=${encodeURIComponent(TOKEN())}` : ''}`, {
            method,
            headers: { ...(method !== 'GET' ? { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(60_000),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.error) {
            const e = new Error(d.error?.error_user_msg || d.error?.message || `Meta ha respondido ${r.status}`);
            e.codigo = d.error?.code;
            throw e;
        }
        return d;
    }

    // ── La cuenta: la página, su Instagram y los permisos del token ──
    let cuentaCache = null;
    async function cuentaMeta(forzar = false) {
        if (!TOKEN()) return { conectado: false, motivo: 'No está conectado: pulsa «Conectar con Facebook».' };
        if (!forzar && cuentaCache && Date.now() - cuentaCache.t < 10 * 60_000) return cuentaCache.v;
        let v;
        try {
            const pag = await graph('/me?fields=id,name,link,followers_count,fan_count,picture{url}');
            let ig = null;
            try {
                const x = await graph(`/${pag.id}?fields=instagram_business_account{id,username,followers_count,media_count,profile_picture_url}`);
                const a = x.instagram_business_account;
                if (a) ig = { id: a.id, usuario: a.username || null, seguidores: a.followers_count ?? null, publicaciones: a.media_count ?? null, foto: a.profile_picture_url || null };
            } catch { /* sin Instagram vinculado o sin permiso */ }
            let permisos = null;
            try {
                const d = await graph(`/debug_token?input_token=${encodeURIComponent(TOKEN())}`);
                permisos = Array.isArray(d.data?.scopes) ? d.data.scopes : null;
            } catch { /* si no se pueden leer, no se dice nada */ }
            const necesarios = ['pages_manage_posts', 'pages_read_engagement', ...(ig ? ['instagram_basic', 'instagram_content_publish'] : [])];
            const estadisticas = ['read_insights', ...(ig ? ['instagram_manage_insights'] : [])];
            v = {
                conectado: true,
                facebook: { id: pag.id, nombre: pag.name, enlace: pag.link || `https://www.facebook.com/${pag.id}`, seguidores: pag.followers_count ?? pag.fan_count ?? null, foto: pag.picture?.data?.url || null },
                instagram: ig,
                permisos,
                faltan: permisos ? necesarios.filter(p => !permisos.includes(p)) : [],
                faltanEstadisticas: permisos ? estadisticas.filter(p => !permisos.includes(p)) : [],
            };
        } catch (err) {
            v = { conectado: false, motivo: `Meta no acepta el token de la página: ${err.message}` };
        }
        cuentaCache = { t: Date.now(), v };
        return v;
    }

    // ── Publicar ──
    const urlMedio = (m) => `${BASE_MEDIOS()}/publico/medios/${m.token}.${m.mime.startsWith('video/') ? 'mp4' : 'jpg'}`;

    // Una historia en la página de Facebook (#470). La foto se sube sin publicar y se
    // publica como historia; el vídeo, en tres pasos (empezar, que Meta lo coja de
    // nuestra dirección, terminar). Las historias no tienen enlace propio.
    async function historiaFacebook(page, m) {
        if (m.mime.startsWith('video/')) {
            const ini = await graph(`/${page}/video_stories`, { method: 'POST', body: { upload_phase: 'start' } });
            const r = await fetchImpl(ini.upload_url, { method: 'POST', headers: { Authorization: `OAuth ${TOKEN()}`, file_url: urlMedio(m) }, signal: AbortSignal.timeout(120_000) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d.success === false) throw new Error(d.error?.message || d.debug_info?.message || `Facebook no ha cogido el vídeo (${r.status}).`);
            const fin = await graph(`/${page}/video_stories`, { method: 'POST', body: { video_id: ini.video_id, upload_phase: 'finish' } });
            return { id: fin.post_id || ini.video_id, url: `https://www.facebook.com/${page}` };
        }
        const foto = await graph(`/${page}/photos`, { method: 'POST', body: { url: urlMedio(m), published: false } });
        const r = await graph(`/${page}/photo_stories`, { method: 'POST', body: { photo_id: foto.id } });
        return { id: r.post_id || foto.id, url: `https://www.facebook.com/${page}` };
    }
    async function publicarFacebook(p, medios, cuenta) {
        const page = cuenta.facebook.id;
        if (p.tipo === 'story') return historiaFacebook(page, medios[0]);
        const imgs = medios.filter(m => m.mime.startsWith('image/')), vids = medios.filter(m => m.mime.startsWith('video/'));
        let id;
        if (vids.length) {
            id = (await graph(`/${page}/videos`, { method: 'POST', body: { file_url: urlMedio(vids[0]), description: p.texto } })).id;
        } else if (imgs.length === 1) {
            const d = await graph(`/${page}/photos`, { method: 'POST', body: { url: urlMedio(imgs[0]), message: p.texto } });
            id = d.post_id || d.id;
        } else if (imgs.length > 1) {
            const fotos = [];
            for (const m of imgs) fotos.push((await graph(`/${page}/photos`, { method: 'POST', body: { url: urlMedio(m), published: false } })).id);
            id = (await graph(`/${page}/feed`, { method: 'POST', body: { message: p.texto, attached_media: fotos.map(f => ({ media_fbid: f })) } })).id;
        } else {
            id = (await graph(`/${page}/feed`, { method: 'POST', body: { message: p.texto } })).id;
        }
        let url = `https://www.facebook.com/${id}`;
        try { url = (await graph(`/${id}?fields=permalink_url`)).permalink_url || url; } catch { /* vale la de por defecto */ }
        return { id, url };
    }

    // Instagram procesa los vídeos un rato antes de dejar publicarlos.
    async function esperarContenedor(id) {
        for (let i = 0; i < 60; i++) {
            const s = await graph(`/${id}?fields=status_code,status`);
            if (s.status_code === 'FINISHED' || s.status_code === 'PUBLISHED') return;
            if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram no ha podido procesarlo${s.status ? ` (${s.status})` : ''}.`);
            await espera(i < 3 ? 2000 : 5000);
        }
        throw new Error('Instagram tarda demasiado en procesar el vídeo. Prueba a reintentarlo.');
    }
    async function publicarInstagram(p, medios, cuenta) {
        const ig = cuenta.instagram?.id;
        if (!ig) throw new Error('La página no tiene una cuenta de Instagram profesional vinculada.');
        const esVideo = (m) => m.mime.startsWith('video/');
        const contenedor = async (body) => (await graph(`/${ig}/media`, { method: 'POST', body })).id;
        let creacion;
        if (p.tipo === 'story') {
            const m = medios[0];
            creacion = await contenedor({ media_type: 'STORIES', ...(esVideo(m) ? { video_url: urlMedio(m) } : { image_url: urlMedio(m) }) });
        } else if (p.tipo === 'reel' || (medios.length === 1 && esVideo(medios[0]))) {
            creacion = await contenedor({ media_type: 'REELS', video_url: urlMedio(medios[0]), caption: p.texto });
        } else if (medios.length === 1) {
            creacion = await contenedor({ image_url: urlMedio(medios[0]), caption: p.texto });
        } else {
            const hijos = [];
            for (const m of medios) {
                const h = await contenedor({ is_carousel_item: true, ...(esVideo(m) ? { media_type: 'VIDEO', video_url: urlMedio(m) } : { image_url: urlMedio(m) }) });
                if (esVideo(m)) await esperarContenedor(h);
                hijos.push(h);
            }
            creacion = await contenedor({ media_type: 'CAROUSEL', children: hijos.join(','), caption: p.texto });
        }
        await esperarContenedor(creacion);
        const id = (await graph(`/${ig}/media_publish`, { method: 'POST', body: { creation_id: creacion } })).id;
        let url = null;
        try { url = (await graph(`/${id}?fields=permalink`)).permalink || null; } catch { /* sin enlace */ }
        return { id, url };
    }

    async function publicarUna(p) {
        const cuenta = await cuentaMeta(true);
        const medios = (await pool.query(
            `SELECT id, mime, token FROM aim_social_medios WHERE publicacion_id = $1 AND datos IS NOT NULL ORDER BY orden, id`, [p.id])).rows;
        const resultado = { ...(p.resultado || {}) };
        for (const red of p.redes) {
            if (resultado[red]?.ok) continue;     // al reintentar, lo que ya salió no se repite
            try {
                if (!cuenta.conectado) throw new Error(cuenta.motivo);
                const r = red === 'facebook' ? await publicarFacebook(p, medios, cuenta) : await publicarInstagram(p, medios, cuenta);
                resultado[red] = { ok: true, ...r, at: new Date().toISOString() };
            } catch (err) {
                resultado[red] = { ok: false, error: String(err?.message || err).slice(0, 500), at: new Date().toISOString() };
            }
        }
        const bien = p.redes.filter(r => resultado[r]?.ok).length;
        const estado = bien === p.redes.length ? 'publicada' : bien ? 'parcial' : 'error';
        await pool.query(
            `UPDATE aim_social_publicaciones SET estado = $2, resultado = $3::jsonb, updated_at = NOW(),
                    publicada_at = CASE WHEN $4 THEN COALESCE(publicada_at, NOW()) ELSE publicada_at END
             WHERE id = $1`, [p.id, estado, JSON.stringify(resultado), bien > 0]);
        // Publicada en todas: los archivos ya no hacen falta (queda la miniatura).
        if (estado === 'publicada') await pool.query(`UPDATE aim_social_medios SET datos = NULL WHERE publicacion_id = $1`, [p.id]);
        return { estado, resultado };
    }

    // Lo que toca: las programadas cuya hora ha llegado. También desatasca las que
    // se quedaron «publicando» (un reinicio a medias): pasan a error para revisarlas.
    let publicando = false;
    async function publicarPendientes() {
        if (publicando) return;
        publicando = true;
        try {
            await pool.query(
                `UPDATE aim_social_publicaciones SET estado = 'error', updated_at = NOW(),
                        resultado = resultado || jsonb_build_object('aviso', 'Se cortó mientras se publicaba: comprueba en la red si salió antes de reintentarlo.')
                 WHERE estado = 'publicando' AND updated_at < NOW() - INTERVAL '20 minutes'`);
            for (;;) {
                const r = await pool.query(
                    `UPDATE aim_social_publicaciones SET estado = 'publicando', updated_at = NOW()
                     WHERE id = (SELECT id FROM aim_social_publicaciones WHERE estado = 'programada' AND programada_at <= NOW()
                                 ORDER BY programada_at LIMIT 1 FOR UPDATE SKIP LOCKED)
                     RETURNING *`);
                if (!r.rowCount) break;
                await publicarUna(r.rows[0]).catch(err => console.error('[publicaciones]', err.message));
            }
        } catch (err) { console.error('[publicaciones]', err.message); } finally { publicando = false; }
    }

    // Lanza el publicador y espera como mucho unos segundos (lo normal, una foto,
    // da tiempo; si no, la pantalla vuelve a preguntar).
    async function lanzarYEsperarUnPoco() {
        const tarea = publicarPendientes();
        await Promise.race([tarea, espera(8000)]);
    }

    // ── Estadísticas ──
    const CLAVE_SEGUIDORES = 'social_seguidores';
    async function apuntarSeguidores(cuenta) {
        if (!cuenta?.conectado) return;
        const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
        const fila = { fecha: hoy, facebook: cuenta.facebook?.seguidores ?? null, instagram: cuenta.instagram?.seguidores ?? null };
        // Una por día (la última del día manda) y solo los últimos 400 días.
        await pool.query(
            `INSERT INTO aim_ajustes (clave, valor, actualizado_at) VALUES ($1, jsonb_build_array($2::jsonb), NOW())
             ON CONFLICT (clave) DO UPDATE SET actualizado_at = NOW(), valor = (
                 SELECT COALESCE(jsonb_agg(x ORDER BY x->>'fecha'), '[]'::jsonb) FROM (
                     SELECT x FROM (
                         SELECT x FROM jsonb_array_elements(aim_ajustes.valor) x WHERE x->>'fecha' <> $3
                         UNION ALL SELECT $2::jsonb) u
                     ORDER BY x->>'fecha' DESC LIMIT 400) t)`,
            [CLAVE_SEGUIDORES, JSON.stringify(fila), hoy]);
    }
    async function fotoSeguidores() {
        try { await apuntarSeguidores(await cuentaMeta(true)); } catch (err) { console.warn('[publicaciones] seguidores:', err.message); }
    }

    // Las últimas publicaciones de cada red (también las hechas desde el móvil),
    // con sus números. Lo que Meta no dé (según permisos), queda en blanco.
    let statsCache = null;
    async function estadisticas(forzar = false) {
        if (!forzar && statsCache && Date.now() - statsCache.t < 15 * 60_000) return statsCache.v;
        const cuenta = await cuentaMeta(true);
        if (!cuenta.conectado) return { cuenta, facebook: [], instagram: [], seguidores: [] };
        await apuntarSeguidores(cuenta).catch(() => {});
        const errores = {};
        let facebook = [], instagram = [];
        try {
            const d = await graph(`/${cuenta.facebook.id}/posts?fields=id,message,created_time,permalink_url,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)&limit=20`);
            facebook = await Promise.all((d.data || []).map(async p => {
                let alcance = null;
                try {
                    const i = await graph(`/${p.id}/insights?metric=post_impressions_unique`);
                    alcance = i.data?.[0]?.values?.[0]?.value ?? null;
                } catch { /* sin permiso de estadísticas o métrica retirada */ }
                return {
                    id: p.id, texto: (p.message || '').slice(0, 300), fecha: p.created_time, url: p.permalink_url, imagen: p.full_picture || null,
                    reacciones: p.reactions?.summary?.total_count ?? 0, comentarios: p.comments?.summary?.total_count ?? 0, compartidos: p.shares?.count ?? 0, alcance,
                };
            }));
        } catch (err) { errores.facebook = err.message; }
        if (cuenta.instagram) {
            try {
                const d = await graph(`/${cuenta.instagram.id}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url&limit=20`);
                instagram = await Promise.all((d.data || []).map(async m => {
                    const met = {};
                    for (const lista of ['reach,saved,shares,views', 'reach,saved']) {
                        try {
                            const i = await graph(`/${m.id}/insights?metric=${lista}`);
                            for (const x of i.data || []) met[x.name] = x.values?.[0]?.value ?? x.total_value?.value ?? null;
                            break;
                        } catch { /* se prueba con menos métricas */ }
                    }
                    return {
                        id: m.id, texto: (m.caption || '').slice(0, 300), fecha: m.timestamp, url: m.permalink, tipo: m.media_product_type || m.media_type,
                        imagen: m.thumbnail_url || (m.media_type === 'VIDEO' ? null : m.media_url) || null,
                        meGusta: m.like_count ?? 0, comentarios: m.comments_count ?? 0,
                        alcance: met.reach ?? null, guardados: met.saved ?? null, compartidos: met.shares ?? null, reproducciones: met.views ?? null,
                    };
                }));
            } catch (err) { errores.instagram = err.message; }
        }
        // Las que salieron desde aquí, para marcarlas.
        const nuestras = (await pool.query(
            `SELECT id, resultado FROM aim_social_publicaciones WHERE estado IN ('publicada', 'parcial') AND publicada_at > NOW() - INTERVAL '120 days'`)).rows;
        const deAqui = {};
        for (const p of nuestras) for (const red of REDES) if (p.resultado?.[red]?.id) deAqui[`${red}:${p.resultado[red].id}`] = p.id;
        const seg = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = $1`, [CLAVE_SEGUIDORES])).rows[0]?.valor || [];
        const v = {
            cuenta, errores, seguidores: seg,
            facebook: facebook.map(p => ({ ...p, deAqui: deAqui[`facebook:${p.id}`] || null })),
            instagram: instagram.map(p => ({ ...p, deAqui: deAqui[`instagram:${p.id}`] || null })),
            actualizado: new Date().toISOString(),
        };
        statsCache = { t: Date.now(), v };
        return v;
    }

    // ── API del panel ──
    const fallo = (res, err) => res.status(err?.httP || 500).json({ error: err?.msg || err?.message || 'Error' });
    const corta = (httP, msg) => { throw { httP, msg }; };
    const idDe = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) corta(400, 'No válido.'); return n; };

    async function leer(id, client = pool) {
        const p = (await client.query(
            `SELECT p.*, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS autor FROM aim_social_publicaciones p
             LEFT JOIN users u ON u.user_id = p.creado_por WHERE p.id = $1`, [id])).rows[0];
        if (!p) corta(404, 'Esa publicación ya no existe.');
        return p;
    }
    async function mediosDe(ids) {
        if (!ids.length) return new Map();
        const r = await pool.query(
            `SELECT id, publicacion_id, orden, mime, bytes, ancho, alto, (datos IS NOT NULL) AS archivo, (miniatura IS NOT NULL) AS miniatura
             FROM aim_social_medios WHERE publicacion_id = ANY($1::int[]) ORDER BY orden, id`, [ids]);
        const m = new Map();
        for (const x of r.rows) {
            if (!m.has(x.publicacion_id)) m.set(x.publicacion_id, []);
            m.get(x.publicacion_id).push({ id: x.id, orden: x.orden, mime: x.mime, bytes: x.bytes, ancho: x.ancho, alto: x.alto, archivo: x.archivo, miniatura: x.miniatura });
        }
        return m;
    }
    const salida = (p, medios) => ({
        id: p.id, texto: p.texto, redes: p.redes, tipo: p.tipo, estado: p.estado,
        programadaAt: p.programada_at, publicadaAt: p.publicada_at, resultado: p.resultado || {},
        autor: p.autor || null, actualizada: p.updated_at, medios: medios || [],
        // La programó sola la web (la historia de un festivo, #471): si se cambia, deja de serlo.
        auto: p.resultado?.auto?.uso || null,
    });

    // ── Lo previsto y las efemérides (#479) ──
    const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;
    router.get('/api/admin/publicaciones/previstas/:fecha/imagen', ...ver, async (req, res) => {
        try {
            if (!FECHA_OK.test(req.params.fecha)) corta(400, 'Fecha no válida.');
            const img = await imagenPrevista(pool, req.params.fecha);
            if (!img) return res.status(404).end();
            res.set('Content-Type', img.mime).set('Cache-Control', 'private, max-age=300').send(img.buf);
        } catch (err) { fallo(res, err); }
    });
    // «Programarla ya»: la historia de ese festivo se crea ahora, para verla y cambiarla.
    router.post('/api/admin/publicaciones/previstas/:fecha', ...ver, async (req, res) => {
        try {
            if (!FECHA_OK.test(req.params.fecha)) corta(400, 'Fecha no válida.');
            const id = await programarHistoriaYa(pool, req.params.fecha).catch(e => corta(e.status || 500, e.message));
            const p = await leer(id);
            res.status(201).json({ success: true, publicacion: salida(p, (await mediosDe([id])).get(id)) });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/admin/publicaciones/efemerides', ...ver, async (req, res) => {
        try {
            res.set('Cache-Control', 'no-store');
            res.json({ efemerides: await efemeridesGuardadas(pool), deFabrica: EFEMERIDES_DE_FABRICA });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/publicaciones/efemerides', ...ver, async (req, res) => {
        try {
            const lista = (Array.isArray(req.body?.efemerides) ? req.body.efemerides : []).slice(0, 200)
                .map(e => ({ dia: String(e?.dia || '').trim(), nombre: String(e?.nombre || '').trim().slice(0, 100) }))
                .filter(e => e.nombre && valeDia(e.dia));
            await pool.query(
                `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ($1, $2::jsonb, NOW(), $3)
                 ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = EXCLUDED.actualizado_por`,
                [CLAVE_EFEMERIDES, JSON.stringify(lista), req.userSession.userId]);
            res.json({ success: true, efemerides: lista });
        } catch (err) { fallo(res, err); }
    });

    router.get('/api/admin/publicaciones/cuenta', ...ver, async (req, res) => {
        try { res.set('Cache-Control', 'no-store'); res.json(await cuentaMeta(req.query.forzar === '1')); } catch (err) { fallo(res, err); }
    });

    router.get('/api/admin/publicaciones', ...ver, async (req, res) => {
        try {
            const FECHA = /^\d{4}-\d{2}-\d{2}$/;
            const desde = FECHA.test(req.query.desde || '') ? req.query.desde : null, hasta = FECHA.test(req.query.hasta || '') ? req.query.hasta : null;
            const r = await pool.query(
                `SELECT p.*, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS autor FROM aim_social_publicaciones p
                 LEFT JOIN users u ON u.user_id = p.creado_por
                 WHERE ($1::date IS NULL OR COALESCE(p.publicada_at, p.programada_at, p.created_at) >= $1::date)
                   AND ($2::date IS NULL OR COALESCE(p.publicada_at, p.programada_at, p.created_at) < $2::date + 1)
                 ORDER BY COALESCE(p.programada_at, p.publicada_at, p.created_at) DESC LIMIT 500`, [desde, hasta]);
            const medios = await mediosDe(r.rows.map(p => p.id));
            // #479: las historias de los festivos que se programarán solas (aún no lo
            // están) y las efemérides, con si ese día ya hay algo.
            const hoy = hoyMadrid(), hasta2 = sumarDia(hoy, 183), desde2 = sumarDia(hoy, -60);
            const previstas = await historiasPrevistas(pool, hoy, hasta2).catch(() => []);
            const efem = efemeridesEntre(await efemeridesGuardadas(pool), desde2, sumarDia(hoy, 365));
            const con = await diasConPublicacion(pool, desde2, sumarDia(hoy, 365));
            res.set('Cache-Control', 'no-store');
            res.json({
                publicaciones: r.rows.map(p => salida(p, medios.get(p.id))),
                previstas: previstas.map(x => ({ fecha: x.fecha, nombre: x.nombre, programadaAt: x.programadaAt, imagen: `/api/admin/publicaciones/previstas/${x.fecha}/imagen` })),
                efemerides: efem.map(e => ({ ...e, cubierta: con.has(e.fecha) })),
            });
        } catch (err) { fallo(res, err); }
    });

    // Los datos de una publicación (y qué se hace con ella: borrador, programar, publicar ya).
    async function guardarDatos(req, id) {
        const texto = String(req.body?.texto ?? '').replace(/\r\n/g, '\n').slice(0, 5000);
        const redes = [...new Set((Array.isArray(req.body?.redes) ? req.body.redes : []).filter(r => REDES.includes(r)))];
        const tipo = TIPOS.includes(req.body?.tipo) ? req.body.tipo : 'post';
        const accion = ['borrador', 'programar', 'publicar'].includes(req.body?.accion) ? req.body.accion : 'borrador';
        let programada = null;
        if (accion === 'programar') {
            const t = Date.parse(req.body?.programadaAt || '');
            if (Number.isNaN(t)) corta(400, 'Elige el día y la hora.');
            if (t < Date.now() - 60_000) corta(400, 'Esa hora ya ha pasado.');
            if (t > Date.now() + 183 * 864e5) corta(400, 'Se puede programar con seis meses de antelación como mucho.');
            programada = new Date(t).toISOString();
        }
        if (accion !== 'borrador') {
            const medios = id ? (await pool.query(`SELECT mime FROM aim_social_medios WHERE publicacion_id = $1 AND datos IS NOT NULL`, [id])).rows : [];
            const prob = problemaPublicacion({ texto, redes, tipo, medios });
            if (prob) corta(400, prob);
        }
        return { texto, redes, tipo, accion, programada: accion === 'publicar' ? new Date().toISOString() : programada };
    }

    router.post('/api/admin/publicaciones', ...ver, async (req, res) => {
        try {
            const d = await guardarDatos({ body: { ...req.body, accion: 'borrador' } }, null);
            const r = await pool.query(
                `INSERT INTO aim_social_publicaciones (texto, redes, tipo, estado, creado_por, actualizado_por)
                 VALUES ($1, $2::text[], $3, 'borrador', $4, $4) RETURNING id`, [d.texto, d.redes, d.tipo, req.userSession.userId]);
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });

    router.put('/api/admin/publicaciones/:id', ...ver, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            const p = await leer(id);
            if (['publicada', 'publicando', 'parcial'].includes(p.estado)) corta(409, 'Ya se ha publicado (o se está publicando): no se puede cambiar.');
            const d = await guardarDatos(req, id);
            const estado = d.accion === 'borrador' ? 'borrador' : 'programada';
            // «Publicar ya» con la hora de la base de datos (la que mira el publicador).
            await pool.query(
                `UPDATE aim_social_publicaciones SET texto = $2, redes = $3::text[], tipo = $4, estado = $5,
                        programada_at = CASE WHEN $8 THEN NOW() ELSE $6::timestamptz END,
                        resultado = '{}'::jsonb, actualizado_por = $7, updated_at = NOW() WHERE id = $1`,
                [id, d.texto, d.redes, d.tipo, estado, estado === 'borrador' ? null : d.programada, req.userSession.userId, d.accion === 'publicar']);
            // «Publicar ya»: se lanza en el momento, sin esperar a que acabe (un vídeo
            // de Instagram puede tardar minutos); la pantalla va mirando cómo va.
            if (d.accion === 'publicar') await lanzarYEsperarUnPoco();
            const fin = await leer(id);
            res.json({ success: true, publicacion: salida(fin, (await mediosDe([id])).get(id)) });
        } catch (err) { fallo(res, err); }
    });

    // Reintentar lo que falló (solo en las redes que fallaron).
    router.post('/api/admin/publicaciones/:id/reintentar', ...ver, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            const p = await leer(id);
            if (!['error', 'parcial'].includes(p.estado)) corta(409, 'Solo se reintenta lo que ha fallado.');
            const r = await pool.query(
                `UPDATE aim_social_publicaciones SET estado = 'programada', programada_at = NOW(), resultado = resultado - 'aviso', updated_at = NOW()
                 WHERE id = $1 AND estado IN ('error', 'parcial') RETURNING id`, [id]);
            if (r.rowCount) await lanzarYEsperarUnPoco();
            const fin = await leer(id);
            res.json({ success: true, publicacion: salida(fin, (await mediosDe([id])).get(id)) });
        } catch (err) { fallo(res, err); }
    });

    router.delete('/api/admin/publicaciones/:id', ...ver, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            const p = await leer(id);
            if (p.estado === 'publicando') corta(409, 'Se está publicando ahora mismo: espera un momento.');
            await pool.query(`DELETE FROM aim_social_publicaciones WHERE id = $1`, [id]);
            res.json({ success: true, yaPublicada: ['publicada', 'parcial'].includes(p.estado) });
        } catch (err) { fallo(res, err); }
    });

    // Duplicar (para volver a usar una publicación).
    router.post('/api/admin/publicaciones/:id/duplicar', ...ver, async (req, res) => {
        const client = await pool.connect();
        try {
            const id = idDe(req.params.id);
            const p = await leer(id, client);
            await client.query('BEGIN');
            const n = (await client.query(
                `INSERT INTO aim_social_publicaciones (texto, redes, tipo, estado, creado_por, actualizado_por)
                 VALUES ($1, $2::text[], $3, 'borrador', $4, $4) RETURNING id`, [p.texto, p.redes, p.tipo, req.userSession.userId])).rows[0].id;
            await client.query(
                `INSERT INTO aim_social_medios (publicacion_id, orden, mime, datos, miniatura, bytes, ancho, alto, token)
                 SELECT $2, orden, mime, datos, miniatura, bytes, ancho, alto, md5(random()::text || id::text || clock_timestamp()::text)
                 FROM aim_social_medios WHERE publicacion_id = $1 AND datos IS NOT NULL`, [id, n]);
            await client.query('COMMIT');
            res.status(201).json({ success: true, id: n });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });

    // ── Fotos y vídeos ──
    const crudo = express.raw({ type: () => true, limit: '110mb' });
    async function editable(id) {
        const p = await leer(id);
        if (!['borrador', 'programada', 'error'].includes(p.estado)) corta(409, 'Ya se ha publicado: no se pueden cambiar sus fotos.');
        return p;
    }
    router.post('/api/admin/publicaciones/:id/medios', ...ver, crudo, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            await editable(id);
            const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
            const datos = Buffer.isBuffer(req.body) ? req.body : null;
            if (!datos?.length) corta(400, 'No ha llegado el archivo.');
            if (!['image/jpeg', 'video/mp4', 'video/quicktime'].includes(mime)) corta(400, 'Las fotos van en JPG y los vídeos en MP4 o MOV.');
            if (mime === 'image/jpeg' && datos.length > MAX_IMAGEN) corta(400, 'La foto pasa de 8 MB.');
            if (mime.startsWith('video/') && datos.length > MAX_VIDEO) corta(400, 'El vídeo pasa de 100 MB.');
            const n = (await pool.query(`SELECT COUNT(*)::int n FROM aim_social_medios WHERE publicacion_id = $1`, [id])).rows[0].n;
            if (n >= MAX_MEDIOS) corta(400, `Como mucho ${MAX_MEDIOS} fotos o vídeos.`);
            const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
            const r = await pool.query(
                `INSERT INTO aim_social_medios (publicacion_id, orden, mime, datos, miniatura, bytes, ancho, alto, token)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
                [id, n, mime, datos, mime === 'image/jpeg' && datos.length < 400_000 ? datos : null, datos.length, num(req.query.ancho), num(req.query.alto),
                 crypto.randomBytes(24).toString('hex')]);
            await pool.query(`UPDATE aim_social_publicaciones SET updated_at = NOW() WHERE id = $1`, [id]);
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    // La miniatura (de un vídeo, o de una foto grande), hecha en el navegador.
    router.post('/api/admin/publicaciones/:id/medios/:mid/miniatura', ...ver, crudo, async (req, res) => {
        try {
            const id = idDe(req.params.id), mid = idDe(req.params.mid);
            await editable(id);
            if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length > 600_000) corta(400, 'Miniatura no válida.');
            const r = await pool.query(`UPDATE aim_social_medios SET miniatura = $3 WHERE id = $2 AND publicacion_id = $1 RETURNING id`, [id, mid, req.body]);
            if (!r.rowCount) corta(404, 'Esa foto ya no está.');
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/publicaciones/:id/medios/:mid', ...ver, async (req, res) => {
        try {
            const id = idDe(req.params.id), mid = idDe(req.params.mid);
            await editable(id);
            await pool.query(`DELETE FROM aim_social_medios WHERE id = $2 AND publicacion_id = $1`, [id, mid]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/publicaciones/:id/medios/orden', ...ver, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            await editable(id);
            const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger);
            for (let i = 0; i < ids.length; i++) await pool.query(`UPDATE aim_social_medios SET orden = $3 WHERE id = $2 AND publicacion_id = $1`, [id, ids[i], i]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/admin/publicaciones/medios/:mid/miniatura', ...ver, async (req, res) => {
        try {
            const m = (await pool.query(`SELECT miniatura FROM aim_social_medios WHERE id = $1`, [idDe(req.params.mid)])).rows[0];
            if (!m?.miniatura) return res.status(404).end();
            res.set('Content-Type', 'image/jpeg').set('Cache-Control', 'private, max-age=86400').send(m.miniatura);
        } catch (err) { fallo(res, err); }
    });
    // Para que Meta se lleve el archivo al publicar: público, con una clave que
    // no se adivina, y solo mientras la publicación está programada o publicándose.
    router.get('/publico/medios/:clave', async (req, res) => {
        try {
            const token = String(req.params.clave || '').replace(/\.(jpg|mp4)$/i, '');
            if (!/^[0-9a-f]{48}$/i.test(token)) return res.status(404).end();
            const m = (await pool.query(
                `SELECT m.mime, m.datos FROM aim_social_medios m JOIN aim_social_publicaciones p ON p.id = m.publicacion_id
                 WHERE m.token = $1 AND m.datos IS NOT NULL AND p.estado IN ('programada', 'publicando', 'error', 'parcial')`, [token])).rows[0];
            if (!m) return res.status(404).end();
            res.set('Content-Type', m.mime).set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex').send(m.datos);
        } catch { res.status(500).end(); }
    });

    router.get('/api/admin/publicaciones/estadisticas', ...ver, async (req, res) => {
        try { res.set('Cache-Control', 'no-store'); res.json(await estadisticas(req.query.forzar === '1')); } catch (err) { fallo(res, err); }
    });

    return { router, publicarPendientes, publicarUna, fotoSeguidores, cuentaMeta, olvidarCuenta: () => { cuentaCache = null; } };
}
