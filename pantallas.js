// ─────────────────────────────────────────────────────────────────────────────
// Pantallas: el carrusel de la tele de recepción (una LG 55XS4J, en vertical, en
// el escaparate). Se eligen diseños de Aim Design (una entrada por página), cuánto
// se ve cada uno, en qué orden y, si se quiere, entre qué fechas. La tele abre
// /tele/<clave> (ver tele-pagina.js) y lo pasa en bucle a pantalla completa.
//
// La tele lleva un navegador de 2016 (Chromium 53): no pinta diseños, solo pone
// imágenes y vídeos ya hechos. Por eso cada entrada se «prepara»:
// - sin vídeo ni animación: la pinta el servidor (disenos-servidor.js) en JPEG,
//   sola, al añadirla y cada vez que cambia el diseño;
// - con vídeo o animación: se graba en MP4 en el navegador de quien la prepara
//   (como «Exportar → Vídeo»), desde Aim Design → Pantallas, y se sube aquí.
// Cada preparación lleva la huella de la página que se usó: si el diseño cambia,
// se sabe que hay que volver a prepararla (la tele sigue con la de antes).
// Los archivos van en aim_medios (medios.js), con uso 'pantalla'.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';
import { paginaDe, numPaginas, tieneAnimacion, duracionAnimacion } from './src/disenos/render.js';
import { pintarEnServidor } from './disenos-servidor.js';
import { nuevoMedio, guardarTrozo, terminarMedio, urlMedio, TROZO } from './medios.js';
import { paginaTele } from './tele-pagina.js';

export async function crearTablasPantallas(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_pantallas (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(120) NOT NULL,
            clave VARCHAR(48) NOT NULL UNIQUE,
            segundos SMALLINT NOT NULL DEFAULT 10,
            girar SMALLINT NOT NULL DEFAULT 0,
            transicion VARCHAR(12) NOT NULL DEFAULT 'fundido',
            visto_at TIMESTAMPTZ,
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_pantalla_items (
            id SERIAL PRIMARY KEY,
            pantalla_id INTEGER NOT NULL REFERENCES aim_pantallas(id) ON DELETE CASCADE,
            orden INTEGER NOT NULL DEFAULT 0,
            diseno_id INTEGER NOT NULL REFERENCES aim_disenos(id) ON DELETE CASCADE,
            pagina SMALLINT NOT NULL DEFAULT 0,
            segundos SMALLINT,
            activo BOOLEAN NOT NULL DEFAULT true,
            desde DATE,
            hasta DATE,
            medio_id INTEGER REFERENCES aim_medios(id) ON DELETE SET NULL,
            huella VARCHAR(40),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_pantalla_items ON aim_pantalla_items (pantalla_id, orden)`);
}

const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
const fallo = (res, err) => {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[pantallas]', err.message || err);
    res.status(500).json({ error: 'No se ha podido hacer.' });
};
const hoyMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
// La huella de una página: si cambia, lo preparado ya no vale.
export const huellaPagina = (datos, pagina) => crypto.createHash('md5').update(JSON.stringify(paginaDe(datos, pagina) || {})).digest('hex');
// ¿Esa página necesita vídeo (lleva vídeos o animaciones)?
const esVideo = (datos, pagina) => tieneAnimacion(paginaDe(datos, pagina));

// Guarda un archivo entero (lo pintado por el servidor) como medio de la pantalla.
async function guardarArchivo(pool, buf, meta) {
    const m = await nuevoMedio(pool, { uso: 'pantalla', bytes: buf.length, ...meta });
    for (let n = 0; n * TROZO < buf.length; n++) await guardarTrozo(pool, m.id, n, buf.subarray(n * TROZO, Math.min(buf.length, (n + 1) * TROZO)));
    return terminarMedio(pool, m.id);
}
// Pone lo preparado en una entrada y borra lo que tenía antes.
async function ponerMedio(pool, itemId, medioId, huella) {
    const antes = (await pool.query(`SELECT medio_id FROM aim_pantalla_items WHERE id = $1`, [itemId])).rows[0];
    await pool.query(`UPDATE aim_pantalla_items SET medio_id = $2, huella = $3 WHERE id = $1`, [itemId, medioId, huella]);
    if (antes?.medio_id && antes.medio_id !== medioId) await pool.query(`DELETE FROM aim_medios WHERE id = $1 AND uso = 'pantalla'`, [antes.medio_id]);
    await pool.query(`UPDATE aim_pantallas SET updated_at = NOW() WHERE id = (SELECT pantalla_id FROM aim_pantalla_items WHERE id = $1)`, [itemId]);
}

// Las entradas sin vídeo que hay que (volver a) pintar: el servidor las hace solas.
let preparando = false;
export async function prepararEstaticas(pool) {
    if (preparando) return;
    preparando = true;
    try {
        const r = await pool.query(
            `SELECT i.id, i.pagina, i.huella, d.datos FROM aim_pantalla_items i JOIN aim_disenos d ON d.id = i.diseno_id ORDER BY i.id`);
        for (const it of r.rows) {
            if (it.pagina >= numPaginas(it.datos) || esVideo(it.datos, it.pagina)) continue;
            const h = huellaPagina(it.datos, it.pagina);
            if (it.huella === h) continue;
            const img = await pintarEnServidor(paginaDe(it.datos, it.pagina), { calidad: 90 });
            const m = await guardarArchivo(pool, img.buf, { mime: 'image/jpeg', ancho: img.ancho, alto: img.alto });
            await ponerMedio(pool, it.id, m.id, h);
        }
    } catch (e) { console.error('[pantallas] preparar:', e.message); }
    finally { preparando = false; }
}

export function crearPantallas({ pool, authenticateSession, requireSeccion }) {
    const router = express.Router();
    const gestion = [authenticateSession, requireSeccion('grafico')];
    const idDe = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) corta(400, 'Falta cuál.'); return n; };

    // ── La lista, con cada entrada y si está lista ──
    async function pantallaCompleta(p) {
        const r = await pool.query(
            `SELECT i.*, d.nombre AS diseno_nombre, d.miniatura, d.datos, d.ancho AS d_ancho, d.alto AS d_alto,
                    m.token, m.mime, m.duracion AS m_duracion, m.completo
             FROM aim_pantalla_items i JOIN aim_disenos d ON d.id = i.diseno_id LEFT JOIN aim_medios m ON m.id = i.medio_id
             WHERE i.pantalla_id = $1 ORDER BY i.orden, i.id`, [p.id]);
        return {
            id: p.id, nombre: p.nombre, clave: p.clave, segundos: p.segundos, girar: p.girar, transicion: p.transicion, vistoAt: p.visto_at,
            items: r.rows.map(it => {
                const existe = it.pagina < numPaginas(it.datos), video = existe && esVideo(it.datos, it.pagina);
                const actual = existe ? huellaPagina(it.datos, it.pagina) : null;
                return {
                    id: it.id, disenoId: it.diseno_id, nombre: it.diseno_nombre, pagina: it.pagina, paginas: numPaginas(it.datos), miniatura: it.miniatura,
                    ancho: it.d_ancho, alto: it.d_alto, segundos: it.segundos, activo: it.activo,
                    desde: it.desde ? String(it.desde instanceof Date ? it.desde.toISOString() : it.desde).slice(0, 10) : null,
                    hasta: it.hasta ? String(it.hasta instanceof Date ? it.hasta.toISOString() : it.hasta).slice(0, 10) : null,
                    video, duracion: video ? duracionAnimacion(paginaDe(it.datos, it.pagina)) : null, existe,
                    // lista: preparada con la versión de ahora; vieja: hay una, pero el diseño ha cambiado.
                    estado: !existe ? 'sin_pagina' : it.token && it.completo ? (it.huella === actual ? 'lista' : 'vieja') : 'sin_preparar',
                    url: it.token && it.completo ? urlMedio({ token: it.token, mime: it.mime }) : null,
                };
            }),
        };
    }
    router.get('/api/admin/pantallas', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(`SELECT * FROM aim_pantallas ORDER BY id`);
            const pantallas = await Promise.all(r.rows.map(pantallaCompleta));
            // Si hay algo sin vídeo por (volver a) pintar, se pone a ello ya.
            if (pantallas.some(p => p.items.some(i => !i.video && i.existe && i.estado !== 'lista'))) prepararEstaticas(pool).catch(() => {});
            res.set('Cache-Control', 'no-store');
            res.json({ pantallas });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/admin/pantallas', ...gestion, express.json(), async (req, res) => {
        try {
            const nombre = String(req.body?.nombre || 'Tele de recepción').trim().slice(0, 120) || 'Tele de recepción';
            const r = await pool.query(`INSERT INTO aim_pantallas (nombre, clave, creado_por) VALUES ($1, $2, $3) RETURNING id`,
                [nombre, crypto.randomBytes(12).toString('hex'), req.userSession.userId]);
            res.status(201).json({ id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.patch('/api/admin/pantallas/:id', ...gestion, express.json(), async (req, res) => {
        try {
            const b = req.body || {}, id = idDe(req.params.id);
            const p = (await pool.query(`SELECT * FROM aim_pantallas WHERE id = $1`, [id])).rows[0];
            if (!p) corta(404, 'Esa pantalla ya no existe.');
            const nombre = b.nombre !== undefined ? String(b.nombre).trim().slice(0, 120) || p.nombre : p.nombre;
            const segundos = b.segundos !== undefined ? Math.max(3, Math.min(120, Math.round(Number(b.segundos) || 10))) : p.segundos;
            const girar = b.girar !== undefined ? ([0, 90, 180, 270].includes(Number(b.girar)) ? Number(b.girar) : 0) : p.girar;
            const transicion = b.transicion !== undefined ? (['fundido', 'corte'].includes(b.transicion) ? b.transicion : 'fundido') : p.transicion;
            await pool.query(`UPDATE aim_pantallas SET nombre = $2, segundos = $3, girar = $4, transicion = $5, updated_at = NOW() WHERE id = $1`, [id, nombre, segundos, girar, transicion]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/pantallas/:id', ...gestion, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            await pool.query(`DELETE FROM aim_medios WHERE id IN (SELECT medio_id FROM aim_pantalla_items WHERE pantalla_id = $1)`, [id]);
            await pool.query(`DELETE FROM aim_pantallas WHERE id = $1`, [id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Una dirección nueva para la tele (si la anterior se ha compartido de más).
    router.post('/api/admin/pantallas/:id/clave', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(`UPDATE aim_pantallas SET clave = $2, updated_at = NOW() WHERE id = $1 RETURNING clave`, [idDe(req.params.id), crypto.randomBytes(12).toString('hex')]);
            if (!r.rowCount) corta(404, 'Esa pantalla ya no existe.');
            res.json({ clave: r.rows[0].clave });
        } catch (err) { fallo(res, err); }
    });

    // ── Las entradas ──
    // Añadir un diseño: una entrada por página (o solo la que se diga).
    router.post('/api/admin/pantallas/:id/items', ...gestion, express.json(), async (req, res) => {
        try {
            const id = idDe(req.params.id), disenoId = idDe(req.body?.disenoId);
            const d = (await pool.query(`SELECT datos FROM aim_disenos WHERE id = $1 AND NOT datos ? 'papelera'`, [disenoId])).rows[0];
            if (!d) corta(404, 'Ese diseño ya no existe.');
            if (!(await pool.query(`SELECT 1 FROM aim_pantallas WHERE id = $1`, [id])).rowCount) corta(404, 'Esa pantalla ya no existe.');
            const n = numPaginas(d.datos);
            const paginas = req.body?.pagina != null ? [Math.max(0, Math.min(n - 1, Number(req.body.pagina) || 0))] : Array.from({ length: n }, (_, i) => i);
            const orden = Number((await pool.query(`SELECT COALESCE(MAX(orden), -1) + 1 AS o FROM aim_pantalla_items WHERE pantalla_id = $1`, [id])).rows[0].o);
            for (const [k, pagina] of paginas.entries()) {
                await pool.query(`INSERT INTO aim_pantalla_items (pantalla_id, orden, diseno_id, pagina) VALUES ($1, $2, $3, $4)`, [id, orden + k, disenoId, pagina]);
            }
            await pool.query(`UPDATE aim_pantallas SET updated_at = NOW() WHERE id = $1`, [id]);
            prepararEstaticas(pool).catch(() => {});
            res.status(201).json({ success: true, anadidas: paginas.length });
        } catch (err) { fallo(res, err); }
    });
    router.patch('/api/admin/pantallas/items/:iid', ...gestion, express.json(), async (req, res) => {
        try {
            const b = req.body || {}, iid = idDe(req.params.iid);
            const it = (await pool.query(`SELECT * FROM aim_pantalla_items WHERE id = $1`, [iid])).rows[0];
            if (!it) corta(404, 'Eso ya no está en la pantalla.');
            const fecha = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
            const segundos = b.segundos !== undefined ? (b.segundos == null || b.segundos === '' ? null : Math.max(3, Math.min(120, Math.round(Number(b.segundos) || 10)))) : it.segundos;
            const activo = b.activo !== undefined ? !!b.activo : it.activo;
            const desde = b.desde !== undefined ? fecha(b.desde) : it.desde, hasta = b.hasta !== undefined ? fecha(b.hasta) : it.hasta;
            await pool.query(`UPDATE aim_pantalla_items SET segundos = $2, activo = $3, desde = $4, hasta = $5 WHERE id = $1`, [iid, segundos, activo, desde, hasta]);
            await pool.query(`UPDATE aim_pantallas SET updated_at = NOW() WHERE id = $1`, [it.pantalla_id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/pantallas/items/:iid', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(`DELETE FROM aim_pantalla_items WHERE id = $1 RETURNING medio_id, pantalla_id`, [idDe(req.params.iid)]);
            if (r.rows[0]?.medio_id) await pool.query(`DELETE FROM aim_medios WHERE id = $1 AND uso = 'pantalla'`, [r.rows[0].medio_id]);
            if (r.rows[0]) await pool.query(`UPDATE aim_pantallas SET updated_at = NOW() WHERE id = $1`, [r.rows[0].pantalla_id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/pantallas/:id/orden', ...gestion, express.json(), async (req, res) => {
        try {
            const id = idDe(req.params.id), ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger);
            for (const [k, iid] of ids.entries()) await pool.query(`UPDATE aim_pantalla_items SET orden = $3 WHERE id = $1 AND pantalla_id = $2`, [iid, id, k]);
            await pool.query(`UPDATE aim_pantallas SET updated_at = NOW() WHERE id = $1`, [id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // ── Preparar una entrada con vídeo (en el navegador) ──
    // 1) Lo que hay que grabar: la página y su huella de ahora.
    router.get('/api/admin/pantallas/items/:iid/preparar', ...gestion, async (req, res) => {
        try {
            const it = (await pool.query(`SELECT i.pagina, d.datos FROM aim_pantalla_items i JOIN aim_disenos d ON d.id = i.diseno_id WHERE i.id = $1`, [idDe(req.params.iid)])).rows[0];
            if (!it || it.pagina >= numPaginas(it.datos)) corta(404, 'Esa página ya no existe.');
            res.set('Cache-Control', 'no-store');
            res.json({ pagina: paginaDe(it.datos, it.pagina), huella: huellaPagina(it.datos, it.pagina) });
        } catch (err) { fallo(res, err); }
    });
    // 2) Se crea el archivo y llegan sus trozos (como los vídeos de Aim Design).
    router.post('/api/admin/pantallas/items/:iid/medio', ...gestion, express.json(), async (req, res) => {
        try {
            const b = req.body || {};
            if (!(await pool.query(`SELECT 1 FROM aim_pantalla_items WHERE id = $1`, [idDe(req.params.iid)])).rowCount) corta(404, 'Eso ya no está en la pantalla.');
            const m = await nuevoMedio(pool, { uso: 'pantalla', mime: String(b.mime || '').toLowerCase(), bytes: Number(b.bytes), duracion: b.duracion, ancho: b.ancho, alto: b.alto, userId: req.userSession.userId });
            res.status(201).json({ id: m.id, trozo: TROZO });
        } catch (err) { fallo(res, err); }
    });
    const trozo = express.raw({ type: () => true, limit: TROZO + 1024 });
    router.put('/api/admin/pantallas/medios/:mid/trozos/:n', ...gestion, trozo, async (req, res) => {
        try {
            const mid = idDe(req.params.mid);
            if (!(await pool.query(`SELECT 1 FROM aim_medios WHERE id = $1 AND uso = 'pantalla'`, [mid])).rowCount) corta(404, 'Ese archivo ya no existe.');
            await guardarTrozo(pool, mid, Number(req.params.n), req.body); res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // 3) Terminado: queda puesto en la entrada, con la huella con que se grabó.
    router.post('/api/admin/pantallas/items/:iid/medio/:mid/fin', ...gestion, express.json(), async (req, res) => {
        try {
            const iid = idDe(req.params.iid), mid = idDe(req.params.mid);
            const m = await terminarMedio(pool, mid);
            await ponerMedio(pool, iid, mid, String(req.body?.huella || '').slice(0, 40) || null);
            res.json({ success: true, url: m.url });
        } catch (err) { fallo(res, err); }
    });

    // ── Lo que pide la tele ──
    router.get('/api/publico/pantallas/:clave', async (req, res) => {
        try {
            const p = (await pool.query(`SELECT * FROM aim_pantallas WHERE clave = $1`, [String(req.params.clave).slice(0, 48)])).rows[0];
            if (!p) return res.status(404).json({ error: 'Esta pantalla ya no existe.' });
            // Para saber si la tele está encendida (como mucho, una vez por minuto).
            pool.query(`UPDATE aim_pantallas SET visto_at = NOW() WHERE id = $1 AND (visto_at IS NULL OR visto_at < NOW() - INTERVAL '1 minute')`, [p.id]).catch(() => {});
            const hoy = hoyMadrid();
            const r = await pool.query(
                `SELECT i.id, i.segundos, m.token, m.mime, m.duracion, m.ancho, m.alto
                 FROM aim_pantalla_items i JOIN aim_medios m ON m.id = i.medio_id AND m.completo
                 JOIN aim_disenos d ON d.id = i.diseno_id AND NOT d.datos ? 'papelera'
                 WHERE i.pantalla_id = $1 AND i.activo AND (i.desde IS NULL OR i.desde <= $2::date) AND (i.hasta IS NULL OR i.hasta >= $2::date)
                 ORDER BY i.orden, i.id`, [p.id, hoy]);
            const items = r.rows.map(x => ({
                id: x.id, tipo: String(x.mime).startsWith('video/') ? 'video' : 'imagen', url: urlMedio(x),
                segundos: String(x.mime).startsWith('video/') ? Math.round((x.duracion || 10) * 10) / 10 : x.segundos || p.segundos,
            }));
            const ajustes = { girar: p.girar, transicion: p.transicion };
            const version = crypto.createHash('md5').update(JSON.stringify([items, ajustes])).digest('hex').slice(0, 16);
            res.set('Cache-Control', 'no-store');
            res.json({ version, ...ajustes, items });
        } catch (err) { fallo(res, err); }
    });
    router.get('/tele/:clave', (req, res) => {
        const clave = String(req.params.clave).replace(/[^0-9a-f]/gi, '').slice(0, 48);
        res.set('Cache-Control', 'no-cache').type('html').send(paginaTele(clave));
    });
    return router;
}

// Los archivos de la tele que ya no tiene ninguna entrada (se cambiaron a medias).
export async function limpiarMediosPantalla(pool) {
    await pool.query(
        `DELETE FROM aim_medios m WHERE m.uso = 'pantalla' AND m.created_at < NOW() - INTERVAL '1 day'
           AND NOT EXISTS (SELECT 1 FROM aim_pantalla_items i WHERE i.medio_id = m.id)`).catch(e => console.error('[pantallas] limpieza:', e.message));
}
