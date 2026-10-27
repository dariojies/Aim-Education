// ─────────────────────────────────────────────────────────────────────────────
// Vídeos de Aim Design y lo preparado para la tele de recepción (pantallas.js).
// Se guardan en la base de datos, en trozos de 4 MB: se suben trozo a trozo (así
// ningún envío pasa del tiempo que deja Heroku) y se sirven por partes (Range),
// que es como los pide un <video>, sin tener nunca el vídeo entero en memoria.
// Cada uno tiene su clave larga e imposible de adivinar, y su dirección pública
// es /m/<clave>.mp4 (y /m/<clave>.jpg, su portada): así se ve igual en el editor,
// en el enlace para ver, en la tele y cuando el servidor pinta su portada.
// Como mucho 100 MB por vídeo y 3 GB entre todos. Los vídeos que ya no usa ningún
// diseño (ni sus versiones) se borran solos a los dos días.
// Los GIF (#495) se pasan aquí a vídeo (con ffmpeg), para que se muevan en bucle
// dentro del diseño: MP4 si son opacos; con transparencia, WebM con canal alfa.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';
import sharp from 'sharp';

export const TROZO = 4 * 1024 * 1024;
export const MAX_VIDEO = 100 * 1024 * 1024;
export const MAX_TOTAL = 3 * 1024 * 1024 * 1024;
const TIPOS = ['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png'];

export async function crearTablasMedios(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_medios (
            id SERIAL PRIMARY KEY,
            uso VARCHAR(20) NOT NULL,
            token VARCHAR(48) NOT NULL UNIQUE,
            nombre VARCHAR(200),
            mime VARCHAR(60) NOT NULL,
            bytes BIGINT NOT NULL DEFAULT 0,
            duracion REAL,
            ancho INTEGER,
            alto INTEGER,
            poster BYTEA,
            completo BOOLEAN NOT NULL DEFAULT false,
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_medios_trozos (
            medio_id INTEGER NOT NULL REFERENCES aim_medios(id) ON DELETE CASCADE,
            n INTEGER NOT NULL,
            datos BYTEA NOT NULL,
            PRIMARY KEY (medio_id, n)
        )`);
}

const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
const fallo = (res, err) => {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[medios]', err.message || err);
    res.status(500).json({ error: 'No se ha podido hacer.' });
};
export const urlMedio = (m) => `/m/${m.token}.${String(m.mime).startsWith('image/') ? (m.mime === 'image/png' ? 'png' : 'jpg') : m.mime === 'video/webm' ? 'webm' : 'mp4'}`;
export const urlPoster = (m) => `/m/${m.token}.jpg?portada=1`;

// Crea uno vacío (luego llegan sus trozos). Devuelve { id, token }.
export async function nuevoMedio(pool, { uso, nombre, mime, bytes, duracion, ancho, alto, userId }) {
    if (!TIPOS.includes(mime)) corta(400, 'Los vídeos van en MP4, WebM o MOV.');
    if (!(bytes > 0)) corta(400, 'El archivo está vacío.');
    if (bytes > MAX_VIDEO) corta(400, 'El vídeo pasa de 100 MB. Recórtalo o bájale la calidad antes de subirlo.');
    const usado = Number((await pool.query(`SELECT COALESCE(SUM(bytes), 0) AS b FROM aim_medios`)).rows[0].b);
    if (usado + bytes > MAX_TOTAL) corta(400, `Ya hay ${(usado / 1024 ** 3).toFixed(1)} GB de vídeos (el máximo son 3). Quita alguno que ya no se use.`);
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
    const r = await pool.query(
        `INSERT INTO aim_medios (uso, token, nombre, mime, bytes, duracion, ancho, alto, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, token`,
        [uso, crypto.randomBytes(24).toString('hex'), String(nombre || '').slice(0, 200), mime, Math.round(bytes), num(duracion),
         num(ancho) && Math.round(num(ancho)), num(alto) && Math.round(num(alto)), userId || null]);
    return r.rows[0];
}
// Un trozo (n desde 0). Todos miden TROZO menos el último.
export async function guardarTrozo(pool, id, n, datos) {
    const m = (await pool.query(`SELECT bytes, completo FROM aim_medios WHERE id = $1`, [id])).rows[0];
    if (!m) corta(404, 'Ese archivo ya no existe.');
    if (m.completo) corta(409, 'Ese archivo ya está entero.');
    const total = Math.ceil(Number(m.bytes) / TROZO), esperado = n === total - 1 ? Number(m.bytes) - n * TROZO : TROZO;
    if (!Number.isInteger(n) || n < 0 || n >= total) corta(400, 'Ese trozo no toca.');
    if (!Buffer.isBuffer(datos) || datos.length !== esperado) corta(400, 'El trozo no ha llegado entero: vuelve a intentarlo.');
    await pool.query(`INSERT INTO aim_medios_trozos (medio_id, n, datos) VALUES ($1, $2, $3) ON CONFLICT (medio_id, n) DO UPDATE SET datos = EXCLUDED.datos`, [id, n, datos]);
}
// Comprueba que han llegado todos los trozos y lo da por bueno.
export async function terminarMedio(pool, id) {
    const m = (await pool.query(`SELECT bytes FROM aim_medios WHERE id = $1`, [id])).rows[0];
    if (!m) corta(404, 'Ese archivo ya no existe.');
    const r = (await pool.query(`SELECT COUNT(*)::int n, COALESCE(SUM(length(datos)), 0)::bigint b FROM aim_medios_trozos WHERE medio_id = $1`, [id])).rows[0];
    if (r.n !== Math.ceil(Number(m.bytes) / TROZO) || Number(r.b) !== Number(m.bytes)) corta(400, 'No han llegado todos los trozos: vuelve a subirlo.');
    const x = (await pool.query(`UPDATE aim_medios SET completo = true WHERE id = $1 RETURNING id, token, mime, duracion, ancho, alto`, [id])).rows[0];
    return { ...x, url: urlMedio(x), poster: urlPoster(x) };
}

// Un GIF animado, a vídeo. Devuelve { buf, mime, poster, duracion, ancho, alto }.
export async function gifAVideo(gif) {
    const meta = await sharp(gif, { animated: true }).metadata();
    const ancho = meta.width, alto = meta.pageHeight || meta.height, paginas = meta.pages || 1;
    if (paginas < 2) return null;   // un GIF quieto se queda como imagen
    const pausas = (meta.delay || []).map(d => (Number(d) > 10 ? Number(d) : 100));
    const duracion = Math.max(0.2, pausas.reduce((s, d) => s + d, 0) / 1000 || paginas / 10);
    // ¿Tiene partes transparentes? (mirando como mucho 40 millones de píxeles)
    let alfa = false;
    if (meta.hasAlpha && ancho * alto * paginas <= 40_000_000) {
        const { data } = await sharp(gif, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { alfa = true; break; }
    }
    const { default: ffmpeg } = await import('@ffmpeg-installer/ffmpeg');
    const { execFile } = await import('child_process');
    const fs = await import('fs/promises'), os = await import('os'), path = await import('path');
    const base = path.join(os.tmpdir(), `gif-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
    const entrada = `${base}.gif`, salida = `${base}.${alfa ? 'webm' : 'mp4'}`;
    await fs.writeFile(entrada, gif);
    const pares = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
    const args = alfa
        ? ['-hide_banner', '-loglevel', 'error', '-y', '-i', entrada, '-vf', pares, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-auto-alt-ref', '0', '-an', salida]
        : ['-hide_banner', '-loglevel', 'error', '-y', '-i', entrada, '-vf', pares, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', salida];
    try {
        await new Promise((ok, mal) => execFile(ffmpeg.path, args, { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (e, so, se) => (e ? mal(new Error(`No se ha podido pasar el GIF a vídeo: ${String(se || e.message).trim().slice(0, 200)}`)) : ok())));
        const buf = await fs.readFile(salida);
        // La portada: el primer fotograma (en PNG si tiene transparencia).
        const primero = sharp(gif, { pages: 1 });
        const poster = alfa ? await primero.png().toBuffer() : await primero.flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();
        return { buf, mime: alfa ? 'video/webm' : 'video/mp4', poster, duracion: Math.round(duracion * 100) / 100, ancho: Math.round(ancho / 2) * 2, alto: Math.round(alto / 2) * 2 };
    } finally {
        await fs.unlink(entrada).catch(() => {});
        await fs.unlink(salida).catch(() => {});
    }
}

export function crearMedios({ pool, authenticateSession, requireSeccion }) {
    const router = express.Router();
    const gestion = [authenticateSession, requireSeccion('grafico')];
    const trozo = express.raw({ type: () => true, limit: TROZO + 1024 });
    const portada = express.raw({ type: () => true, limit: '2mb' });
    const idDe = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) corta(400, 'Falta el archivo.'); return n; };

    // ── Subir un vídeo para Aim Design: crear, trozos, portada y terminar ──
    router.post('/api/admin/disenos/videos', ...gestion, express.json(), async (req, res) => {
        try {
            const b = req.body || {};
            const m = await nuevoMedio(pool, { uso: 'video', nombre: b.nombre, mime: String(b.mime || '').toLowerCase(), bytes: Number(b.bytes), duracion: b.duracion, ancho: b.ancho, alto: b.alto, userId: req.userSession.userId });
            res.status(201).json({ id: m.id, trozo: TROZO });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/disenos/videos/:id/trozos/:n', ...gestion, trozo, async (req, res) => {
        try { await guardarTrozo(pool, idDe(req.params.id), Number(req.params.n), req.body); res.json({ success: true }); } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/disenos/videos/:id/portada', ...gestion, portada, async (req, res) => {
        try {
            if (!Buffer.isBuffer(req.body) || !req.body.length) corta(400, 'No ha llegado la portada.');
            await pool.query(`UPDATE aim_medios SET poster = $2 WHERE id = $1`, [idDe(req.params.id), req.body]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/admin/disenos/videos/:id/fin', ...gestion, async (req, res) => {
        try { res.json(await terminarMedio(pool, idDe(req.params.id))); } catch (err) { fallo(res, err); }
    });
    // Un GIF (subido ahora o uno de «Ya subidas», ?ci=<id>) a vídeo en bucle (#495).
    router.post('/api/admin/disenos/gif', ...gestion, express.raw({ type: () => true, limit: '25mb' }), async (req, res) => {
        try {
            let gif = Buffer.isBuffer(req.body) && req.body.length ? req.body : null, nombre = String(req.query.nombre || 'animación.gif').slice(0, 200);
            if (!gif && req.query.ci) {
                const r = (await pool.query(`SELECT mime, datos, nombre FROM aim_correo_imagenes WHERE id = $1`, [String(req.query.ci).slice(0, 40)])).rows[0];
                if (!r) corta(404, 'Esa imagen ya no está.');
                gif = r.datos; nombre = r.nombre || nombre;
            }
            if (!gif || gif.subarray(0, 3).toString('latin1') !== 'GIF') corta(400, 'Eso no es un GIF.');
            const v = await gifAVideo(gif);
            if (!v) return res.json({ quieto: true });
            const m = await nuevoMedio(pool, { uso: 'video', nombre, mime: v.mime, bytes: v.buf.length, duracion: v.duracion, ancho: v.ancho, alto: v.alto, userId: req.userSession.userId });
            for (let n = 0; n * TROZO < v.buf.length; n++) await guardarTrozo(pool, m.id, n, v.buf.subarray(n * TROZO, Math.min(v.buf.length, (n + 1) * TROZO)));
            await pool.query(`UPDATE aim_medios SET poster = $2 WHERE id = $1`, [m.id, v.poster]);
            const fin = await terminarMedio(pool, m.id);
            res.status(201).json({ url: fin.url, poster: fin.poster, duracion: v.duracion, ancho: v.ancho, alto: v.alto, transparente: v.mime === 'video/webm' });
        } catch (err) { fallo(res, err); }
    });
    // Cuánto se lleva gastado (para avisar antes de llegar al tope).
    router.get('/api/admin/disenos/videos/espacio', ...gestion, async (req, res) => {
        try {
            const b = Number((await pool.query(`SELECT COALESCE(SUM(bytes), 0) AS b FROM aim_medios`)).rows[0].b);
            res.json({ usado: b, maximo: MAX_TOTAL, maxVideo: MAX_VIDEO });
        } catch (err) { fallo(res, err); }
    });

    // ── Servirlo: /m/<clave>.mp4 (por partes) y su portada ──
    router.get('/m/:archivo', async (req, res) => {
        try {
            const token = String(req.params.archivo).replace(/\.[a-z0-9]+$/i, '');
            if (!/^[0-9a-f]{48}$/.test(token)) return res.status(404).end();
            const m = (await pool.query(`SELECT id, mime, bytes, completo, ${req.query.portada ? 'poster' : 'NULL AS poster'} FROM aim_medios WHERE token = $1`, [token])).rows[0];
            if (!m || !m.completo) return res.status(404).end();
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
            if (req.query.portada) {
                if (!m.poster) return res.status(404).end();
                return res.type(m.poster[0] === 0x89 ? 'image/png' : 'image/jpeg').send(m.poster);
            }
            const total = Number(m.bytes);
            let a = 0, b = total - 1;
            const rango = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
            if (rango) {
                if (rango[1] === '') { a = Math.max(0, total - Number(rango[2])); }
                else { a = Number(rango[1]); if (rango[2] !== '') b = Math.min(total - 1, Number(rango[2])); }
                if (a > b || a >= total) { res.set('Content-Range', `bytes */${total}`); return res.status(416).end(); }
                res.status(206).set('Content-Range', `bytes ${a}-${b}/${total}`);
            }
            res.set({ 'Content-Type': m.mime, 'Accept-Ranges': 'bytes', 'Content-Length': String(b - a + 1) });
            if (req.method === 'HEAD') return res.end();
            let cerrado = false;
            req.on('close', () => { cerrado = true; });
            for (let n = Math.floor(a / TROZO); n <= Math.floor(b / TROZO) && !cerrado; n++) {
                const ini = Math.max(a, n * TROZO) - n * TROZO, fin = Math.min(b, (n + 1) * TROZO - 1) - n * TROZO;
                const t = (await pool.query(`SELECT substring(datos FROM $3::int FOR $4::int) AS d FROM aim_medios_trozos WHERE medio_id = $1 AND n = $2`,
                    [m.id, n, ini + 1, fin - ini + 1])).rows[0];
                if (!t) break;
                if (!res.write(t.d)) await new Promise(ok => res.once('drain', ok));
            }
            res.end();
        } catch (err) {
            if (!res.headersSent) fallo(res, err); else res.destroy();
        }
    });
    return router;
}

// Los vídeos de Aim Design que ya no usa nadie (ni un diseño ni sus versiones) y
// los que se quedaron a medio subir: fuera, a los dos días.
export async function limpiarMedios(pool) {
    try {
        const r = await pool.query(
            `DELETE FROM aim_medios m
             WHERE m.created_at < NOW() - INTERVAL '2 days'
               AND (NOT m.completo OR (m.uso = 'video'
                    AND NOT EXISTS (SELECT 1 FROM aim_disenos d WHERE strpos(d.datos::text, m.token) > 0)
                    AND NOT EXISTS (SELECT 1 FROM aim_disenos_versiones v WHERE strpos(v.datos::text, m.token) > 0)))
             RETURNING m.id`);
        if (r.rowCount) console.log(`[medios] ${r.rowCount} archivo(s) sin usar borrado(s)`);
    } catch (e) { console.error('[medios] limpieza:', e.message); }
}
