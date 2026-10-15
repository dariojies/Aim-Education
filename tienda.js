// ─────────────────────────────────────────────────────────────────────────────
// Tienda online (ticket #432): material del club (guantes, doboks, cascos…)
// para comprar desde la web, recoger en el club o recibir en casa.
//
//  · Un producto agrupa artículos del catálogo como variantes (tallas, colores).
//    El precio y el IVA son los del catálogo, y el stock el del almacén: no se
//    llevan dos veces. Una variante sin artículo en el almacén no tiene límite.
//  · Comprar crea el pedido y sus cargos, uno por unidad, como el mostrador, y
//    se paga en el momento con tarjeta o Bizum (solo online). Al cobrarse, la
//    factura sale en la serie de material y el almacén se descuenta solo.
//  · Lo de los pedidos sin pagar queda reservado (no se vende dos veces) hasta
//    RESERVA_HORAS; pasado ese tiempo el pedido se cancela solo.
//  · El envío a casa es un cargo más (concepto TIENDA-ENVIO, serie de material).
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';

export const RESERVA_HORAS = 24;
export const CONCEPTO_ENVIO = 'TIENDA-ENVIO';
const MAX_UNIDADES = 10;
const MAX_FOTO = 2 * 1024 * 1024;
export const ESTADOS = ['pendiente_pago', 'pagado', 'listo', 'enviado', 'entregado', 'cancelado'];

export async function crearTablasTienda(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_tienda_productos (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(160) NOT NULL,
            descripcion TEXT,
            categoria VARCHAR(60),
            publicado BOOLEAN NOT NULL DEFAULT FALSE,
            orden INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_tienda_fotos (
            id SERIAL PRIMARY KEY,
            producto_id INTEGER NOT NULL REFERENCES aim_tienda_productos(id) ON DELETE CASCADE,
            datos BYTEA NOT NULL,
            mime VARCHAR(40) NOT NULL DEFAULT 'image/jpeg',
            orden INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    // Cada talla o color: su artículo del catálogo (precio, IVA y, por el
    // concepto, su stock en el almacén).
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_tienda_variantes (
            id SERIAL PRIMARY KEY,
            producto_id INTEGER NOT NULL REFERENCES aim_tienda_productos(id) ON DELETE CASCADE,
            etiqueta VARCHAR(80) NOT NULL,
            concepto VARCHAR(100) NOT NULL,
            orden INTEGER NOT NULL DEFAULT 0,
            UNIQUE (producto_id, concepto)
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_tienda_pedidos (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            -- 'recogida' en el club o 'envio' a casa.
            entrega VARCHAR(10) NOT NULL DEFAULT 'recogida',
            nombre VARCHAR(160), telefono VARCHAR(30), direccion VARCHAR(255), cp VARCHAR(10), ciudad VARCHAR(80), provincia VARCHAR(80),
            notas TEXT,
            -- pendiente_pago → pagado → listo (para recoger) o enviado → entregado; o cancelado.
            estado VARCHAR(15) NOT NULL DEFAULT 'pendiente_pago',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            pagado_at TIMESTAMPTZ, listo_at TIMESTAMPTZ, enviado_at TIMESTAMPTZ, entregado_at TIMESTAMPTZ, cancelado_at TIMESTAMPTZ,
            motivo_cancelacion VARCHAR(200),
            gestionado_por UUID REFERENCES users(user_id) ON DELETE SET NULL
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_tienda_pedidos_user ON aim_tienda_pedidos (user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_tienda_pedidos_estado ON aim_tienda_pedidos (estado)`);
    // Lo que lleva cada pedido: una línea por unidad, con su cargo (el envío, también).
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_tienda_lineas (
            id SERIAL PRIMARY KEY,
            pedido_id INTEGER NOT NULL REFERENCES aim_tienda_pedidos(id) ON DELETE CASCADE,
            variante_id INTEGER REFERENCES aim_tienda_variantes(id) ON DELETE SET NULL,
            concepto VARCHAR(100) NOT NULL,
            descripcion VARCHAR(255) NOT NULL,
            cargo_id INTEGER REFERENCES aim_cargos(id) ON DELETE SET NULL,
            envio BOOLEAN NOT NULL DEFAULT FALSE
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_tienda_lineas_pedido ON aim_tienda_lineas (pedido_id)`);
}

const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
const fallo = (res, err) => {
    if (!err.status) console.error('[tienda]', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'No se ha podido hacer. Inténtalo otra vez.' });
};
const idDe = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) corta(404, 'No existe.'); return n; };
const txt = (v, max) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const r2 = (n) => Math.round(Number(n) * 100) / 100;
// Lo que paga, con IVA (los precios del catálogo van sin IVA y con milésimas).
const conIva = (precio, iva) => r2(Number(precio) * (1 + Number(iva || 0) / 100));

// Unidades reservadas de cada concepto: pedidos sin pagar aún dentro de plazo.
const SQL_RESERVADAS = `
    SELECT l.concepto, COUNT(*)::int AS n
    FROM aim_tienda_lineas l JOIN aim_tienda_pedidos p ON p.id = l.pedido_id JOIN aim_cargos c ON c.id = l.cargo_id
    WHERE p.estado = 'pendiente_pago' AND p.created_at > NOW() - INTERVAL '${RESERVA_HORAS} hours'
      AND c.estado = 'pendiente' AND NOT l.envio
    GROUP BY l.concepto`;

export function crearTienda({ pool, authenticateSession, requireSeccion, sesionOpcional, pagosOnlineAbiertos }) {
    const router = express.Router();
    const gestion = [authenticateSession, requireSeccion('tienda')];

    async function ajustes() {
        const v = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = 'tienda'`)).rows[0]?.valor || {};
        return { envio: { activo: !!v.envio?.activo, precio: Number(v.envio?.precio) || 0, texto: v.envio?.texto || '' }, recogida: v.recogida || '' };
    }

    // Las variantes de unos productos, con precio, stock y lo que queda libre.
    async function variantesDe(productoIds, { soloActivas = true } = {}) {
        if (!productoIds.length) return [];
        const r = await pool.query(
            `WITH res AS (${SQL_RESERVADAS})
             SELECT v.id, v.producto_id, v.etiqueta, v.concepto, v.orden, pr.descripcion AS concepto_desc, pr.precio, pr.iva_pct,
                    COALESCE(pr.activo, false) AS activo, a.id AS almacen_id, a.stock, COALESCE(res.n, 0) AS reservadas
             FROM aim_tienda_variantes v
             LEFT JOIN aim_precios pr ON pr.concepto = v.concepto
             LEFT JOIN aim_almacen a ON a.concepto = v.concepto
             LEFT JOIN res ON res.concepto = v.concepto
             WHERE v.producto_id = ANY($1::int[]) ORDER BY v.orden, v.id`, [productoIds]);
        return r.rows.filter(v => !soloActivas || (v.activo && Number(v.precio) > 0)).map(v => ({
            id: v.id, productoId: v.producto_id, etiqueta: v.etiqueta, concepto: v.concepto, conceptoDesc: v.concepto_desc,
            precio: v.precio == null ? null : conIva(v.precio, v.iva_pct), base: v.precio == null ? null : Number(v.precio), ivaPct: Number(v.iva_pct || 0),
            activo: v.activo, conStock: v.almacen_id != null, stock: v.almacen_id != null ? v.stock : null, reservadas: v.reservadas,
            disponibles: v.almacen_id != null ? Math.max(0, v.stock - v.reservadas) : null,
        }));
    }
    const fotoUrl = (f) => `/api/tienda/fotos/${f.id}`;
    async function fotosDe(productoIds) {
        if (!productoIds.length) return [];
        return (await pool.query(`SELECT id, producto_id, orden FROM aim_tienda_fotos WHERE producto_id = ANY($1::int[]) ORDER BY orden, id`, [productoIds])).rows;
    }
    // Para la web: solo lo publicado y con algo que vender.
    async function productosPublicos(id = null) {
        const r = await pool.query(
            `SELECT id, nombre, descripcion, categoria FROM aim_tienda_productos WHERE publicado ${id ? 'AND id = $1' : ''} ORDER BY orden, nombre`, id ? [id] : []);
        const ids = r.rows.map(p => p.id);
        const [vs, fs] = await Promise.all([variantesDe(ids), fotosDe(ids)]);
        return r.rows.map(p => {
            const variantes = vs.filter(v => v.productoId === p.id).map(({ productoId, concepto, conceptoDesc, base, activo, stock, reservadas, ...v }) => ({
                ...v, agotado: v.conStock && v.disponibles <= 0, pocas: v.conStock && v.disponibles > 0 && v.disponibles <= 2,
            }));
            const precios = variantes.map(v => v.precio);
            return {
                ...p, variantes, fotos: fs.filter(f => f.producto_id === p.id).map(fotoUrl),
                desde: precios.length ? Math.min(...precios) : null, distintos: new Set(precios).size > 1,
                agotado: variantes.length > 0 && variantes.every(v => v.agotado),
            };
        }).filter(p => p.variantes.length);
    }

    // ── El estado de un pedido según sus cargos: pagado cuando están todos cobrados ──
    async function ponerAlDia(ids = null) {
        await pool.query(
            `UPDATE aim_tienda_pedidos p SET estado = 'pagado', pagado_at = NOW()
             WHERE p.estado = 'pendiente_pago' ${ids ? 'AND p.id = ANY($1::int[])' : ''}
               AND EXISTS (SELECT 1 FROM aim_tienda_lineas l WHERE l.pedido_id = p.id)
               AND NOT EXISTS (SELECT 1 FROM aim_tienda_lineas l JOIN aim_cargos c ON c.id = l.cargo_id
                               WHERE l.pedido_id = p.id AND c.estado NOT IN ('cobrado', 'exento'))`, ids ? [ids] : []);
    }
    // Los pedidos sin pagar que pasan el plazo se cancelan (salvo un pago a medias).
    async function cancelarCaducados() {
        const r = await pool.query(
            `SELECT p.id FROM aim_tienda_pedidos p
             WHERE p.estado = 'pendiente_pago' AND p.created_at < NOW() - INTERVAL '${RESERVA_HORAS} hours'
               AND NOT EXISTS (SELECT 1 FROM aim_tpv_pagos t JOIN aim_tienda_lineas l ON l.cargo_id = ANY(t.cargo_ids)
                               WHERE l.pedido_id = p.id AND t.estado = 'creado' AND t.created_at > NOW() - INTERVAL '30 minutes')`);
        for (const { id } of r.rows) await cancelar(id, { motivo: `Sin pagar en ${RESERVA_HORAS} horas` });
        return r.rows.length;
    }
    async function cancelar(id, { motivo, por = null }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const p = (await client.query(`SELECT * FROM aim_tienda_pedidos WHERE id = $1 FOR UPDATE`, [id])).rows[0];
            if (!p || p.estado !== 'pendiente_pago') { await client.query('ROLLBACK'); return false; }
            const cobrados = (await client.query(
                `SELECT COUNT(*)::int n FROM aim_tienda_lineas l JOIN aim_cargos c ON c.id = l.cargo_id WHERE l.pedido_id = $1 AND c.estado <> 'pendiente'`, [id])).rows[0].n;
            if (cobrados) { await client.query('ROLLBACK'); corta(409, 'Este pedido ya tiene algo cobrado: no se puede cancelar desde aquí.'); }
            await client.query(
                `UPDATE aim_cargos SET estado = 'quitado', anulado_motivo = $2
                 WHERE id IN (SELECT cargo_id FROM aim_tienda_lineas WHERE pedido_id = $1) AND estado = 'pendiente' AND recibo_id IS NULL`,
                [id, `Pedido de la tienda cancelado: ${motivo}`.slice(0, 250)]);
            await client.query(`UPDATE aim_tienda_pedidos SET estado = 'cancelado', cancelado_at = NOW(), motivo_cancelacion = $2, gestionado_por = COALESCE($3, gestionado_por) WHERE id = $1`,
                [id, motivo.slice(0, 200), por]);
            await client.query('COMMIT');
            return true;
        } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
    }

    // Los pedidos con sus líneas y su total (con IVA).
    async function pedidos({ userId = null, estado = null, ids = null, limite = 200 } = {}) {
        const vals = [], filtros = [];
        if (userId) { vals.push(userId); filtros.push(`p.user_id = $${vals.length}`); }
        if (estado === 'abiertos') filtros.push(`p.estado IN ('pagado', 'listo', 'enviado')`);
        else if (estado) { vals.push(estado); filtros.push(`p.estado = $${vals.length}`); }
        if (ids) { vals.push(ids); filtros.push(`p.id = ANY($${vals.length}::int[])`); }
        const r = await pool.query(
            `SELECT p.*, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS cliente, u.email, u.phone
             FROM aim_tienda_pedidos p JOIN users u ON u.user_id = p.user_id
             ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''} ORDER BY p.created_at DESC LIMIT ${limite}`, vals);
        if (!r.rows.length) return [];
        const ls = await pool.query(
            `SELECT l.pedido_id, l.variante_id, l.concepto, l.descripcion, l.envio, l.cargo_id, c.estado AS cargo_estado,
                    COALESCE(c.importe_bruto, COALESCE(c.importe, c.precio) * (1 + COALESCE(c.iva_pct, 0) / 100)) AS total
             FROM aim_tienda_lineas l LEFT JOIN aim_cargos c ON c.id = l.cargo_id WHERE l.pedido_id = ANY($1::int[]) ORDER BY l.id`, [r.rows.map(p => p.id)]);
        return r.rows.map(p => {
            const mias = ls.rows.filter(l => l.pedido_id === p.id);
            // Las unidades iguales, juntas: «2 × Guantes · 10 oz».
            const grupos = new Map();
            for (const l of mias) {
                const k = `${l.envio}|${l.descripcion}`;
                const g = grupos.get(k) || { descripcion: l.descripcion, envio: l.envio, cantidad: 0, total: 0 };
                g.cantidad += 1; g.total = r2(g.total + Number(l.total || 0));
                grupos.set(k, g);
            }
            const pendientes = mias.filter(l => l.cargo_estado === 'pendiente').map(l => l.cargo_id);
            const caducado = p.estado === 'pendiente_pago' && Date.now() - new Date(p.created_at).getTime() > RESERVA_HORAS * 3600_000;
            return {
                id: p.id, estado: p.estado, caducado, entrega: p.entrega, creado: p.created_at, pagado: p.pagado_at, listo: p.listo_at,
                enviado: p.enviado_at, entregado: p.entregado_at, cancelado: p.cancelado_at, motivoCancelacion: p.motivo_cancelacion,
                envio: p.entrega === 'envio' ? { nombre: p.nombre, telefono: p.telefono, direccion: p.direccion, cp: p.cp, ciudad: p.ciudad, provincia: p.provincia } : null,
                notas: p.notas, cliente: { id: p.user_id, nombre: p.cliente, email: p.email, telefono: p.phone },
                lineas: [...grupos.values()], total: r2(mias.reduce((s, l) => s + Number(l.total || 0), 0)),
                unidades: mias.filter(l => !l.envio).length,
                cargosPendientes: p.estado === 'pendiente_pago' && !caducado ? pendientes : [],
            };
        });
    }

    // ════════════════════════ Para todos ════════════════════════

    router.get('/api/tienda/productos', async (req, res) => {
        try {
            const a = await ajustes();
            res.set('Cache-Control', 'no-store');
            res.json({ productos: await productosPublicos(), envio: a.envio, recogida: a.recogida, pagoOnline: pagosOnlineAbiertos(), reservaHoras: RESERVA_HORAS });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/tienda/productos/:id', async (req, res) => {
        try {
            const p = (await productosPublicos(idDe(req.params.id)))[0];
            if (!p) corta(404, 'Ese producto no está en la tienda.');
            const a = await ajustes();
            res.set('Cache-Control', 'no-store');
            res.json({ ...p, envio: a.envio, pagoOnline: pagosOnlineAbiertos() });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/tienda/fotos/:id', async (req, res) => {
        try {
            const f = (await pool.query(`SELECT datos, mime FROM aim_tienda_fotos WHERE id = $1`, [idDe(req.params.id)])).rows[0];
            if (!f) return res.status(404).end();
            res.set('Content-Type', f.mime).set('Cache-Control', 'public, max-age=604800, immutable').send(f.datos);
        } catch { res.status(404).end(); }
    });

    // Hacer el pedido: comprueba lo que queda, crea sus cargos y devuelve los
    // que hay que pagar (la pantalla lleva al banco con ellos).
    router.post('/api/tienda/pedidos', authenticateSession, async (req, res) => {
        const me = req.userSession.userId;
        const client = await pool.connect();
        try {
            if (!pagosOnlineAbiertos()) corta(503, 'La compra por internet estará disponible muy pronto.');
            const pedidas = (Array.isArray(req.body?.lineas) ? req.body.lineas : [])
                .map(l => ({ varianteId: Number(l.varianteId), cantidad: Math.floor(Number(l.cantidad)) }))
                .filter(l => Number.isInteger(l.varianteId) && l.varianteId > 0 && l.cantidad > 0);
            if (!pedidas.length) corta(400, 'El carrito está vacío.');
            const juntas = new Map();
            for (const l of pedidas) juntas.set(l.varianteId, (juntas.get(l.varianteId) || 0) + l.cantidad);
            if ([...juntas.values()].some(n => n > MAX_UNIDADES)) corta(400, `Como mucho ${MAX_UNIDADES} unidades de cada artículo.`);
            const a = await ajustes();
            const entrega = req.body?.entrega === 'envio' ? 'envio' : 'recogida';
            const dir = req.body?.direccion || {};
            const envio = entrega === 'envio' ? {
                nombre: txt(dir.nombre, 160), telefono: txt(dir.telefono, 30), direccion: txt(dir.direccion, 255),
                cp: txt(dir.cp, 10), ciudad: txt(dir.ciudad, 80), provincia: txt(dir.provincia, 80),
            } : null;
            if (envio) {
                if (!a.envio.activo) corta(400, 'Ahora mismo no se hacen envíos: elige recogerlo en el club.');
                if (!envio.nombre || !envio.direccion || !envio.ciudad || !/^\d{5}$/.test(envio.cp || '') || !/^[+\d\s]{9,}$/.test(envio.telefono || '')) {
                    corta(400, 'Para el envío faltan datos: nombre, dirección, código postal (5 cifras), población y teléfono.');
                }
            }

            await client.query('BEGIN');
            // Uno detrás de otro: así dos personas no se llevan la última unidad.
            await client.query(`SELECT pg_advisory_xact_lock(432, 0)`);
            const r = await client.query(
                `WITH res AS (${SQL_RESERVADAS})
                 SELECT v.id, v.etiqueta, v.concepto, p.nombre AS producto, p.publicado, pr.precio, pr.iva_pct, pr.tipo, pr.activo,
                        a.id AS almacen_id, a.stock, COALESCE(res.n, 0) AS reservadas
                 FROM aim_tienda_variantes v JOIN aim_tienda_productos p ON p.id = v.producto_id
                 LEFT JOIN aim_precios pr ON pr.concepto = v.concepto LEFT JOIN aim_almacen a ON a.concepto = v.concepto
                 LEFT JOIN res ON res.concepto = v.concepto
                 WHERE v.id = ANY($1::int[])`, [[...juntas.keys()]]);
            const vs = new Map(r.rows.map(v => [v.id, v]));
            for (const [vid, n] of juntas) {
                const v = vs.get(vid);
                if (!v || !v.publicado || !v.activo || !(Number(v.precio) > 0)) corta(409, 'Algo del carrito ya no está a la venta. Vuelve a la tienda y revísalo.');
                if (v.almacen_id != null && v.stock - v.reservadas < n) {
                    const quedan = Math.max(0, v.stock - v.reservadas);
                    corta(409, quedan ? `De «${v.producto} · ${v.etiqueta}» solo quedan ${quedan}.` : `«${v.producto} · ${v.etiqueta}» se ha agotado.`);
                }
            }
            const yo = (await client.query(`SELECT TRIM(CONCAT(name, ' ', COALESCE(surname, ''))) AS nombre FROM users WHERE user_id = $1`, [me])).rows[0];
            const pedido = (await client.query(
                `INSERT INTO aim_tienda_pedidos (user_id, entrega, nombre, telefono, direccion, cp, ciudad, provincia, notas)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
                [me, entrega, envio?.nombre || null, envio?.telefono || null, envio?.direccion || null, envio?.cp || null, envio?.ciudad || null, envio?.provincia || null,
                 txt(req.body?.notas, 1000)])).rows[0].id;
            const cargoIds = [];
            const cargo = async (concepto, descripcion, tipo, precio, iva) => (await client.query(
                `INSERT INTO aim_cargos (cliente_id, concepto, mes, descripcion, tipo, precio, iva_pct, descuento_pct, target_nombre, estado, origen)
                 VALUES ($1, $2, date_trunc('month', now() AT TIME ZONE 'Europe/Madrid')::date, $3, $4, $5, $6, 0, $7, 'pendiente', 'tienda') RETURNING id`,
                [me, concepto, descripcion.slice(0, 255), tipo || 'Material', precio, iva, (yo?.nombre || '').slice(0, 255)])).rows[0].id;
            for (const [vid, n] of juntas) {
                const v = vs.get(vid);
                const desc = `${v.producto} · ${v.etiqueta}`.slice(0, 255);
                for (let k = 0; k < n; k++) {
                    const c = await cargo(v.concepto, `Tienda: ${desc} (pedido ${pedido})`, v.tipo, v.precio, v.iva_pct);
                    cargoIds.push(c);
                    await client.query(`INSERT INTO aim_tienda_lineas (pedido_id, variante_id, concepto, descripcion, cargo_id) VALUES ($1,$2,$3,$4,$5)`, [pedido, vid, v.concepto, desc, c]);
                }
            }
            if (envio) {
                const pe = (await client.query(`SELECT precio, iva_pct, tipo, activo FROM aim_precios WHERE concepto = $1`, [CONCEPTO_ENVIO])).rows[0];
                if (!pe?.activo || !(Number(pe.precio) > 0)) corta(400, 'Ahora mismo no se hacen envíos: elige recogerlo en el club.');
                const c = await cargo(CONCEPTO_ENVIO, `Tienda: gastos de envío (pedido ${pedido})`, pe.tipo, pe.precio, pe.iva_pct);
                cargoIds.push(c);
                await client.query(`INSERT INTO aim_tienda_lineas (pedido_id, concepto, descripcion, cargo_id, envio) VALUES ($1,$2,'Gastos de envío',$3,TRUE)`, [pedido, CONCEPTO_ENVIO, c]);
            }
            await client.query('COMMIT');
            res.status(201).json({ success: true, id: pedido, cargoIds });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });

    router.get('/api/me/tienda/pedidos', authenticateSession, async (req, res) => {
        try {
            await ponerAlDia();
            res.set('Cache-Control', 'no-store');
            res.json({ pedidos: await pedidos({ userId: req.userSession.userId, limite: 50 }), pagoOnline: pagosOnlineAbiertos() });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/me/tienda/pedidos/:id/cancelar', authenticateSession, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            const p = (await pool.query(`SELECT user_id FROM aim_tienda_pedidos WHERE id = $1`, [id])).rows[0];
            if (!p || String(p.user_id) !== String(req.userSession.userId)) corta(404, 'Ese pedido no es tuyo.');
            if (!(await cancelar(id, { motivo: 'Lo canceló quien lo hizo', por: req.userSession.userId }))) corta(409, 'Ese pedido ya no se puede cancelar.');
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // ════════════════════════ Gestión ════════════════════════

    router.get('/api/admin/tienda', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(`SELECT id, nombre, descripcion, categoria, publicado, orden FROM aim_tienda_productos ORDER BY orden, nombre`);
            const ids = r.rows.map(p => p.id);
            const [vs, fs, a, cuenta] = await Promise.all([
                variantesDe(ids, { soloActivas: false }), fotosDe(ids), ajustes(),
                pool.query(`SELECT COUNT(*) FILTER (WHERE estado = 'pagado')::int AS por_preparar, COUNT(*) FILTER (WHERE estado IN ('listo', 'enviado'))::int AS en_camino,
                                   COUNT(*) FILTER (WHERE estado = 'pendiente_pago')::int AS sin_pagar FROM aim_tienda_pedidos`),
            ]);
            const pe = (await pool.query(`SELECT precio, iva_pct FROM aim_precios WHERE concepto = $1 AND activo`, [CONCEPTO_ENVIO])).rows[0];
            res.set('Cache-Control', 'no-store');
            res.json({
                productos: r.rows.map(p => ({ ...p, variantes: vs.filter(v => v.productoId === p.id), fotos: fs.filter(f => f.producto_id === p.id).map(f => ({ id: f.id, url: fotoUrl(f) })) })),
                ajustes: { ...a, envio: { ...a.envio, precio: pe ? conIva(pe.precio, pe.iva_pct) : a.envio.precio } },
                pedidos: cuenta.rows[0], pagoOnline: pagosOnlineAbiertos(),
            });
        } catch (err) { fallo(res, err); }
    });

    // Los artículos del catálogo que se pueden poner a la venta (con su stock).
    router.get('/api/admin/tienda/catalogo', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT pr.concepto, pr.descripcion, pr.precio, pr.iva_pct, pr.tipo, a.stock, a.categoria
                 FROM aim_precios pr LEFT JOIN aim_almacen a ON a.concepto = pr.concepto
                 WHERE pr.activo AND pr.precio > 0 AND pr.concepto <> $1 AND COALESCE(pr.es_bono, false) = false
                   AND (pr.tipo ILIKE 'material' OR a.id IS NOT NULL)
                 ORDER BY a.categoria NULLS LAST, pr.descripcion`, [CONCEPTO_ENVIO]);
            res.json(r.rows.map(x => ({ concepto: x.concepto, descripcion: x.descripcion, precio: conIva(x.precio, x.iva_pct), stock: x.stock ?? null, categoria: x.categoria || null })));
        } catch (err) { fallo(res, err); }
    });

    function datosProducto(b) {
        const nombre = txt(b?.nombre, 160);
        if (!nombre) corta(400, 'Ponle nombre al producto.');
        const variantes = (Array.isArray(b?.variantes) ? b.variantes : []).map((v, i) => ({ etiqueta: txt(v.etiqueta, 80), concepto: txt(v.concepto, 100), orden: i }));
        if (variantes.some(v => !v.concepto)) corta(400, 'Cada variante tiene que ser un artículo del catálogo.');
        if (variantes.some(v => !v.etiqueta)) corta(400, 'Ponle nombre a cada variante (la talla, el color…).');
        if (new Set(variantes.map(v => v.concepto)).size !== variantes.length) corta(400, 'Hay un artículo repetido en las variantes.');
        return { nombre, descripcion: txt(b?.descripcion, 5000), categoria: txt(b?.categoria, 60), publicado: !!b?.publicado, variantes };
    }
    async function guardarVariantes(client, productoId, variantes) {
        if (variantes.length) {
            const ok = (await client.query(`SELECT concepto FROM aim_precios WHERE concepto = ANY($1::text[])`, [variantes.map(v => v.concepto)])).rows.map(x => x.concepto);
            const falta = variantes.find(v => !ok.includes(v.concepto));
            if (falta) corta(400, `El artículo ${falta.concepto} no está en el catálogo.`);
        }
        await client.query(`DELETE FROM aim_tienda_variantes WHERE producto_id = $1 AND NOT (concepto = ANY($2::text[]))`, [productoId, variantes.map(v => v.concepto)]);
        for (const v of variantes) {
            await client.query(
                `INSERT INTO aim_tienda_variantes (producto_id, etiqueta, concepto, orden) VALUES ($1,$2,$3,$4)
                 ON CONFLICT (producto_id, concepto) DO UPDATE SET etiqueta = EXCLUDED.etiqueta, orden = EXCLUDED.orden`, [productoId, v.etiqueta, v.concepto, v.orden]);
        }
    }
    router.post('/api/admin/tienda/productos', ...gestion, async (req, res) => {
        const client = await pool.connect();
        try {
            const d = datosProducto(req.body);
            await client.query('BEGIN');
            const id = (await client.query(
                `INSERT INTO aim_tienda_productos (nombre, descripcion, categoria, publicado, orden)
                 VALUES ($1,$2,$3,$4,(SELECT COALESCE(MAX(orden), 0) + 1 FROM aim_tienda_productos)) RETURNING id`,
                [d.nombre, d.descripcion, d.categoria, d.publicado])).rows[0].id;
            await guardarVariantes(client, id, d.variantes);
            await client.query('COMMIT');
            res.status(201).json({ success: true, id });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });
    router.put('/api/admin/tienda/productos/:id', ...gestion, async (req, res) => {
        const client = await pool.connect();
        try {
            const id = idDe(req.params.id);
            const d = datosProducto(req.body);
            await client.query('BEGIN');
            const u = await client.query(`UPDATE aim_tienda_productos SET nombre = $2, descripcion = $3, categoria = $4, publicado = $5, updated_at = NOW() WHERE id = $1`,
                [id, d.nombre, d.descripcion, d.categoria, d.publicado]);
            if (!u.rowCount) corta(404, 'Ese producto ya no existe.');
            await guardarVariantes(client, id, d.variantes);
            await client.query('COMMIT');
            res.json({ success: true });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });
    // Borrar: los pedidos que lo llevan se quedan (sus líneas guardan qué era).
    router.delete('/api/admin/tienda/productos/:id', ...gestion, async (req, res) => {
        try {
            await pool.query(`DELETE FROM aim_tienda_productos WHERE id = $1`, [idDe(req.params.id)]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/admin/tienda/productos/:id/fotos', ...gestion, express.raw({ type: () => true, limit: '3mb' }), async (req, res) => {
        try {
            const id = idDe(req.params.id);
            const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
            const datos = Buffer.isBuffer(req.body) && req.body.length ? req.body : null;
            if (!datos) corta(400, 'No ha llegado la foto.');
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) corta(400, 'La foto tiene que ser JPG, PNG o WebP.');
            if (datos.length > MAX_FOTO) corta(400, 'La foto pasa de 2 MB.');
            const n = (await pool.query(`SELECT COUNT(*)::int n FROM aim_tienda_fotos WHERE producto_id = $1`, [id])).rows[0].n;
            if (n >= 8) corta(400, 'Como mucho 8 fotos por producto.');
            const r = await pool.query(`INSERT INTO aim_tienda_fotos (producto_id, datos, mime, orden) VALUES ($1,$2,$3,$4) RETURNING id`, [id, datos, mime, n]);
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err.code === '23503' ? Object.assign(new Error('Ese producto ya no existe.'), { status: 404 }) : err); }
    });
    router.delete('/api/admin/tienda/fotos/:id', ...gestion, async (req, res) => {
        try { await pool.query(`DELETE FROM aim_tienda_fotos WHERE id = $1`, [idDe(req.params.id)]); res.json({ success: true }); }
        catch (err) { fallo(res, err); }
    });
    // La foto que sale primero (la del catálogo).
    router.post('/api/admin/tienda/fotos/:id/principal', ...gestion, async (req, res) => {
        try {
            const f = (await pool.query(`SELECT producto_id FROM aim_tienda_fotos WHERE id = $1`, [idDe(req.params.id)])).rows[0];
            if (!f) corta(404, 'Esa foto ya no está.');
            await pool.query(`UPDATE aim_tienda_fotos SET orden = CASE WHEN id = $1 THEN -1 ELSE orden + 1 END WHERE producto_id = $2`, [idDe(req.params.id), f.producto_id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // El envío a casa: si se hace y cuánto cuesta (con IVA). Se cobra con su
    // concepto del catálogo, en la serie de material.
    router.put('/api/admin/tienda/ajustes', ...gestion, async (req, res) => {
        try {
            const e = req.body?.envio || {};
            const precio = r2(String(e.precio ?? '').replace(',', '.'));
            if (e.activo && !(precio > 0 && precio < 1000)) corta(400, 'Pon el precio del envío (con IVA).');
            const valor = { envio: { activo: !!e.activo, precio: e.activo ? precio : 0, texto: txt(e.texto, 300) || '' }, recogida: txt(req.body?.recogida, 300) || '' };
            await pool.query(`INSERT INTO aim_ajustes (clave, valor) VALUES ('tienda', $1) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`, [valor]);
            if (valor.envio.activo) {
                await pool.query(
                    `INSERT INTO aim_precios (concepto, descripcion, precio, tipo, iva_pct, activo, serie_fiscal) VALUES ($1, 'Gastos de envío (tienda online)', $2, 'Otros', 21, true, 'MAT')
                     ON CONFLICT (concepto) DO UPDATE SET precio = EXCLUDED.precio, iva_pct = 21, activo = true, serie_fiscal = 'MAT', updated_at = NOW()`,
                    [CONCEPTO_ENVIO, Math.round((precio / 1.21) * 1000) / 1000]);
            } else {
                await pool.query(`UPDATE aim_precios SET activo = false, updated_at = NOW() WHERE concepto = $1`, [CONCEPTO_ENVIO]);
            }
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    router.get('/api/admin/tienda/pedidos', ...gestion, async (req, res) => {
        try {
            await ponerAlDia();
            const estado = req.query.estado === 'abiertos' || ESTADOS.includes(req.query.estado) ? req.query.estado : null;
            res.set('Cache-Control', 'no-store');
            res.json({ pedidos: await pedidos({ estado, limite: 300 }) });
        } catch (err) { fallo(res, err); }
    });
    // Mover un pedido: listo para recoger, enviado, entregado; o cancelar uno sin pagar.
    router.put('/api/admin/tienda/pedidos/:id', ...gestion, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            await ponerAlDia([id]);
            const p = (await pool.query(`SELECT * FROM aim_tienda_pedidos WHERE id = $1`, [id])).rows[0];
            if (!p) corta(404, 'Ese pedido no existe.');
            const a = req.body?.estado;
            if (a === 'cancelado') {
                if (!(await cancelar(id, { motivo: txt(req.body?.motivo, 200) || 'Cancelado por el club', por: req.userSession.userId }))) corta(409, 'Solo se cancelan los pedidos sin pagar. Para devolver uno pagado, haz una rectificativa en Facturación.');
                return res.json({ success: true });
            }
            const pasos = { listo: ['pagado'], enviado: ['pagado'], entregado: ['pagado', 'listo', 'enviado'] };
            if (!pasos[a]) corta(400, 'Estado no válido.');
            if (!pasos[a].includes(p.estado)) corta(409, p.estado === 'pendiente_pago' ? 'Este pedido aún no está pagado.' : 'Ese pedido ya no está en ese paso.');
            if (a === 'listo' && p.entrega !== 'recogida') corta(400, 'Ese pedido va a casa: márcalo como enviado.');
            if (a === 'enviado' && p.entrega !== 'envio') corta(400, 'Ese pedido se recoge en el club: márcalo como listo para recoger.');
            await pool.query(`UPDATE aim_tienda_pedidos SET estado = $2, ${a}_at = NOW(), gestionado_por = $3 WHERE id = $1`, [id, a, req.userSession.userId]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    return { router, cancelarCaducados, ponerAlDia };
}

// ── Para la campanita ──
// Del personal: pedidos pagados por preparar o entregar.
export async function pedidosPorAtender(pool) {
    return (await pool.query(
        `SELECT COUNT(*) FILTER (WHERE estado = 'pagado')::int AS por_preparar, COUNT(*) FILTER (WHERE estado IN ('listo', 'enviado'))::int AS en_camino,
                MAX(COALESCE(pagado_at, created_at)) FILTER (WHERE estado = 'pagado') AS ultimo
         FROM aim_tienda_pedidos`)).rows[0];
}
// De quien compra: sus pedidos listos para recoger o enviados, de las dos últimas semanas.
export async function pedidosEnMarcha(pool, userId) {
    return (await pool.query(
        `SELECT id, estado, entrega, COALESCE(listo_at, enviado_at) AS cuando FROM aim_tienda_pedidos
         WHERE user_id = $1 AND estado IN ('listo', 'enviado') AND COALESCE(listo_at, enviado_at) > NOW() - INTERVAL '14 days'
         ORDER BY 4 DESC LIMIT 5`, [userId])).rows;
}
