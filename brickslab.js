// ─────────────────────────────────────────────────────────────────────────────
// Brickslab y Biblioteca dentro de la web (#291): préstamo de sets de LEGO y de
// libros del club.
//
// Brickslab sigue siendo una app aparte para otros clubes, y comparte con esta
// web sus tablas (bricks_*). Aquí se lee y se escribe en ellas EXACTAMENTE como
// lo hace esa app (mismos estados, mismos ids, misma forma de los datos), solo
// para el club Aim Education: lo que se haga aquí se ve allí y al revés.
//
// Lo propio de la web:
//  · El permiso «Normal» de LEGO sale solo a quien está matriculado en la clase
//    de Brickslab (se puede dar también a mano, como siempre).
//  · El «Pro» se paga por la web: es una cuota mensual. Al activarlo, el alumno
//    queda matriculado en una clase propia «Brickslab Pro» enlazada con el
//    concepto que se elija en los ajustes; se le genera el mes como cualquier
//    mensualidad y tiene Pro mientras ese mes esté pagado.
//  · Lo gestionan secretaría y dirección (sección «brickslab» de permisos.js).
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';

// Estados de una reserva viva (el «Active» es de las reservas antiguas).
const VIVAS = `('Reserved', 'Delivered', 'Active')`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOY = `(NOW() AT TIME ZONE 'Europe/Madrid')::date`;
const MES = `date_trunc('month', ${HOY})::date`;
const ICONOS = ['Box', 'Book', 'Package', 'Puzzle', 'Gamepad2', 'Music', 'Palette', 'Rocket', 'Star', 'Trophy'];
const nombreCorto = (n, a) => `${String(n || '').trim()}${a ? ` ${String(a).trim()[0]}.` : ''}`;
const nombreLargo = (n, a) => `${n || ''} ${a || ''}`.trim();
const r2 = (x) => Math.round(Number(x) * 100) / 100;
// Una categoría de LEGO (las que dan el Normal automático y el Pro pagado).
const esLego = (c) => (c?.config?.reservationMode || (/brick|lego/i.test(c?.name || '') ? 'brickslab' : 'library')) === 'brickslab';

export function crearBrickslab({ pool, clubId, familiaIds, generarCargosDeMatricula, sqlPagandoDesde, onCambio = () => {} }) {
    const err = (res, e) => (e?.httP ? res.status(e.httP).json({ error: e.msg }) : (console.error('[BRICKSLAB]', e), res.status(500).json({ error: 'Algo ha fallado. Prueba otra vez.' })));
    const fallo = (httP, msg) => ({ httP, msg });

    // ── Ajustes (aim_ajustes «brickslab») ──
    async function ajustes() {
        const v = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = 'brickslab'`)).rows[0]?.valor || {};
        let clasesNormal = Array.isArray(v.clasesNormal) ? v.clasesNormal.filter(x => UUID.test(x)) : null;
        // Sin elegir: las clases que se llaman «Brickslab».
        if (!clasesNormal) {
            clasesNormal = (await pool.query(
                `SELECT g.group_id FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE a.club_id = $1 AND g.name ILIKE '%brick%'`, [clubId])).rows.map(x => x.group_id);
        }
        return { conceptoPro: v.conceptoPro || null, claseProId: UUID.test(v.claseProId || '') ? v.claseProId : null, clasesNormal, textoPro: v.textoPro || '' };
    }
    async function guardarAjustes(cambios, userId) {
        const antes = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = 'brickslab'`)).rows[0]?.valor || {};
        await pool.query(
            `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ('brickslab', $1::jsonb, NOW(), $2)
             ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = EXCLUDED.actualizado_por`,
            [JSON.stringify({ ...antes, ...cambios }), userId || null]);
    }

    // La clase «Brickslab Pro» y su enlace con el concepto en la temporada activa:
    // así el Pro se genera cada mes con las demás mensualidades. Se asegura al
    // guardar los ajustes, al activarlo y antes de generar los cargos del mes.
    async function asegurarEnlacePro() {
        const a = await ajustes();
        if (!a.conceptoPro) return null;
        const concepto = (await pool.query(`SELECT concepto FROM aim_precios WHERE concepto = $1 AND activo = true`, [a.conceptoPro])).rows[0];
        if (!concepto) return null;
        const temp = (await pool.query(`SELECT id FROM aim_temporadas WHERE activa = true LIMIT 1`)).rows[0];
        if (!temp) return null;
        let claseId = a.claseProId;
        if (claseId && !(await pool.query(`SELECT 1 FROM aim_clases WHERE id = $1`, [claseId])).rowCount) claseId = null;
        if (!claseId) {
            claseId = crypto.randomUUID();
            await pool.query(`INSERT INTO aim_clases (id, nombre, actividad) VALUES ($1, 'Brickslab Pro', $2)`, [claseId, await actividadBrickslab()]);
            await guardarAjustes({ claseProId: claseId });
        }
        await pool.query(`DELETE FROM aim_conceptos_temporada WHERE target_tipo = 'clase' AND target_ref = $1 AND temporada_id = $2 AND concepto <> $3`, [claseId, temp.id, a.conceptoPro]);
        await pool.query(
            `INSERT INTO aim_conceptos_temporada (concepto, target_tipo, target_ref, target_origen, target_nombre, temporada_id)
             VALUES ($1, 'clase', $2, 'custom', 'Brickslab Pro', $3) ON CONFLICT DO NOTHING`, [a.conceptoPro, claseId, temp.id]);
        return { conceptoPro: a.conceptoPro, claseProId: claseId, temporadaId: temp.id };
    }
    async function actividadBrickslab() {
        const a = await ajustes();
        const r = (await pool.query(
            `SELECT a.name FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id WHERE g.group_id = ANY($1::uuid[]) LIMIT 1`,
            [a.clasesNormal])).rows[0];
        return r?.name || 'Brickslab';
    }

    async function categorias() {
        return (await pool.query(
            `SELECT id, name, icon, description, "isHomeAllowed", "rankingEnabled", config, "createdAt"
             FROM bricks_categories WHERE "clubId" = $1
             ORDER BY (name = 'Aim Brickslab') DESC, (name = 'Biblioteca') DESC, "createdAt"`, [clubId])).rows
            .map(c => ({ id: c.id, nombre: c.name, icono: c.icon, descripcion: c.description || '', enCasa: c.isHomeAllowed, ranking: c.rankingEnabled,
                modo: esLego(c) ? 'brickslab' : 'library', campos: Array.isArray(c.config?.customFields) ? c.config.customFields : [], config: c.config || {} }));
    }
    // El catálogo con lo que queda libre de cada artículo.
    async function articulos() {
        const r = await pool.query(
            `SELECT i.id, i."categoryId", i.title, i.description, i."imageUrl", i.stock, i."isProOnly", i."isAvailable", i.metadata,
                    i."lastReviewedAt", i."createdAt",
                    (SELECT COUNT(*) FROM bricks_reservation r WHERE r."itemId" = i.id AND r.status IN ${VIVAS})::int AS ocupadas,
                    (SELECT COUNT(*) FROM bricks_userhistory h WHERE h."itemId" = i.id)::int AS veces
             FROM bricks_items i WHERE i."clubId" = $1
             ORDER BY i."createdAt" DESC`, [clubId]);
        return r.rows.map(i => {
            const stock = i.stock || 1;
            return {
                id: i.id, categoriaId: i.categoryId, titulo: i.title, descripcion: i.description || '', imagen: i.imageUrl || '',
                stock, ocupadas: i.ocupadas, libres: Math.max(0, stock - i.ocupadas), soloPro: i.isProOnly, activo: i.isAvailable,
                disponible: i.isAvailable && i.ocupadas < stock, datos: i.metadata || {}, revisado: i.lastReviewedAt, veces: i.veces,
            };
        });
    }

    // Qué puede hacer cada persona en cada categoría: lo dado a mano (Brickslab),
    // el Normal automático por la matrícula y el Pro pagado por la web.
    async function permisosDe(ids) {
        const out = new Map(ids.map(id => [String(id), {}]));
        if (!ids.length) return out;
        const [cats, a] = await Promise.all([categorias(), ajustes()]);
        const lego = cats.filter(esLegoCat).map(c => c.id);
        const [manual, matric, pagado, susc] = await Promise.all([
            pool.query(`SELECT p."userId", p."categoryId", p."isStandard", p."isPro" FROM bricks_user_permissions p
                        JOIN bricks_categories c ON c.id = p."categoryId" AND c."clubId" = $2 WHERE p."userId" = ANY($1::uuid[])`, [ids, clubId]),
            a.clasesNormal.length ? pool.query(
                `SELECT DISTINCT m.user_id FROM aim_matriculas m JOIN aim_temporadas t ON t.id = m.temporada_id AND t.activa
                 WHERE m.user_id = ANY($1::uuid[]) AND m.clase_ref = ANY($2::uuid[]) AND m.alta <= ${HOY} AND (m.baja IS NULL OR m.baja >= ${HOY})
                 UNION SELECT gs.student_id FROM tul_group_students gs WHERE gs.student_id = ANY($1::uuid[]) AND gs.group_id = ANY($2::uuid[])`,
                [ids, a.clasesNormal]) : { rows: [] },
            // Pro pagado: el mes en curso, o el siguiente si ya lo ha pagado (al
            // apuntarse pasado el día de corte se cobra el mes que viene).
            a.conceptoPro ? pool.query(
                `SELECT cliente_id, MAX(mes)::text AS hasta FROM aim_cargos WHERE concepto = $2 AND cliente_id = ANY($1::uuid[]) AND estado = 'cobrado'
                   AND mes >= ${MES} AND mes <= (${MES} + INTERVAL '1 month')::date GROUP BY cliente_id`, [ids, a.conceptoPro]) : { rows: [] },
            a.claseProId ? pool.query(
                `SELECT m.user_id, m.baja::text AS baja,
                        EXISTS (SELECT 1 FROM aim_cargos c WHERE c.cliente_id = m.user_id AND c.concepto = $3 AND c.estado = 'pendiente' AND c.recibo_id IS NULL) AS debe
                 FROM aim_matriculas m JOIN aim_temporadas t ON t.id = m.temporada_id AND t.activa
                 WHERE m.user_id = ANY($1::uuid[]) AND m.clase_ref = $2 AND (m.baja IS NULL OR m.baja >= ${HOY})`, [ids, a.claseProId, a.conceptoPro || '']) : { rows: [] },
        ]);
        const auto = new Set(matric.rows.map(x => String(x.user_id)));
        const pagos = new Map(pagado.rows.map(x => [String(x.cliente_id), x.hasta]));
        const suscritos = new Map(susc.rows.map(x => [String(x.user_id), x]));
        for (const id of ids) {
            const k = String(id), p = out.get(k);
            for (const c of cats) {
                const m = manual.rows.find(x => String(x.userId) === k && x.categoryId === c.id);
                const lg = lego.includes(c.id);
                const normalAuto = lg && auto.has(k), proPagado = lg && pagos.has(k);
                const proManual = !!m?.isPro, normalManual = !!m?.isStandard;
                const pro = proManual || proPagado;
                p[c.id] = { normal: normalManual || normalAuto || pro, pro, normalManual, normalAuto, proManual, proPagado };
            }
            const s = suscritos.get(k);
            p._pro = { suscrito: !!s && !s.baja, baja: s?.baja || null, debe: !!s?.debe, pagadoHasta: pagos.get(k) || null };
        }
        return out;
    }
    function esLegoCat(c) { return c.modo === 'brickslab'; }

    // Reservar: las mismas reglas que la app de Brickslab.
    async function reservar(userId, itemId) {
        if (!UUID.test(String(itemId || ''))) throw fallo(400, 'Ese artículo no existe.');
        const item = (await pool.query(`SELECT * FROM bricks_items WHERE id = $1 AND "clubId" = $2`, [itemId, clubId])).rows[0];
        if (!item) throw fallo(404, 'Ese artículo no existe.');
        if (!item.isAvailable) throw fallo(409, 'Este artículo no se presta ahora mismo.');
        const p = (await permisosDe([userId])).get(String(userId))?.[item.categoryId];
        if (!p?.normal) throw fallo(403, 'No tiene permiso para reservar en esta categoría.');
        if (item.isProOnly && !p.pro) throw fallo(403, 'Este artículo es solo para miembros Pro.');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Dos reservas a la vez del último que queda: la segunda espera y cuenta bien.
            await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ['bricks-item:' + itemId]);
            const viva = (await client.query(
                `SELECT r.id, i.title FROM bricks_reservation r LEFT JOIN bricks_items i ON i.id = r."itemId"
                 WHERE r."userId" = $1 AND r."categoryId" = $2 AND r.status IN ${VIVAS} LIMIT 1`, [userId, item.categoryId])).rows[0];
            if (viva) throw fallo(409, `Ya tiene una reserva en esta categoría (${viva.title || 'otro artículo'}). Hay que devolverla para reservar otra.`);
            const ocupadas = (await client.query(`SELECT COUNT(*)::int n FROM bricks_reservation WHERE "itemId" = $1 AND status IN ${VIVAS}`, [itemId])).rows[0].n;
            if (ocupadas >= (item.stock || 1)) throw fallo(409, 'No quedan unidades libres de este artículo.');
            const id = crypto.randomUUID();
            await client.query(
                `INSERT INTO bricks_reservation (id, "userId", "itemId", "categoryId", status, "reservationDate") VALUES ($1, $2, $3, $4, 'Reserved', NOW())`,
                [id, userId, itemId, item.categoryId]);
            await client.query('COMMIT');
            onCambio();
            return id;
        } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
    }

    async function reservasDe({ ids = null, vivas = true, limite = 300 } = {}) {
        const r = await pool.query(
            `SELECT r.id, r."userId", r."itemId", r."categoryId", r.status, r."reservationDate", r."returnDate",
                    i.title, i."imageUrl", i.metadata, c.name AS categoria, c."isHomeAllowed", u.name, u.surname
             FROM bricks_reservation r
             JOIN bricks_items i ON i.id = r."itemId" AND i."clubId" = $1
             LEFT JOIN bricks_categories c ON c.id = r."categoryId"
             JOIN users u ON u.user_id = r."userId"
             WHERE ${vivas ? `r.status IN ${VIVAS}` : `r.status = 'Returned'`} ${ids ? 'AND r."userId" = ANY($2::uuid[])' : ''}
             ORDER BY ${vivas ? 'r."reservationDate"' : 'r."returnDate" DESC NULLS LAST'} LIMIT ${Number(limite) || 300}`,
            ids ? [clubId, ids] : [clubId]);
        return r.rows.map(x => ({
            id: x.id, userId: x.userId, nombre: nombreLargo(x.name, x.surname), articuloId: x.itemId, categoriaId: x.categoryId,
            titulo: x.title, imagen: x.imageUrl || '', categoria: x.categoria, estado: x.status === 'Active' ? 'Reserved' : x.status,
            fecha: x.reservationDate, devuelta: x.returnDate, enCasaCategoria: !!x.isHomeAllowed, enCasaArticulo: x.metadata?.allowHomeBuild !== false,
        }));
    }

    // La votación activa del club (la más reciente sin caducar).
    async function votacionActiva() {
        const v = (await pool.query(
            `SELECT id, title, description, "expiresAt" FROM bricks_poll
             WHERE "clubId" = $1 AND "isActive" AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
             ORDER BY "createdAt" DESC LIMIT 1`, [clubId])).rows[0];
        if (!v) return null;
        const ops = (await pool.query(
            `SELECT o.id, o.title, o."imageUrl", (SELECT COUNT(*) FROM bricks_poll_vote x WHERE x."optionId" = o.id)::int AS votos
             FROM bricks_poll_option o WHERE o."pollId" = $1 ORDER BY o.title`, [v.id])).rows;
        return { id: v.id, titulo: v.title, descripcion: v.description || '', hasta: v.expiresAt, opciones: ops.map(o => ({ id: o.id, titulo: o.title, imagen: o.imageUrl || '', votos: o.votos })) };
    }

    // Ranking: devoluciones por persona en las categorías con ranking. A las
    // familias se les enseña el nombre y la inicial del apellido.
    async function ranking(cats) {
        const con = cats.filter(c => c.ranking).map(c => c.id);
        if (!con.length) return [];
        const r = await pool.query(
            `SELECT h."categoryId", h."userId", u.name, u.surname,
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE date_trunc('year', h."completedAt") = date_trunc('year', NOW()))::int AS anio,
                    COUNT(*) FILTER (WHERE date_trunc('month', h."completedAt") = date_trunc('month', NOW()))::int AS mes
             FROM bricks_userhistory h JOIN users u ON u.user_id = h."userId"
             WHERE h."categoryId" = ANY($1::uuid[]) GROUP BY 1, 2, 3, 4`, [con]);
        return con.map(cid => ({ categoriaId: cid, filas: r.rows.filter(x => x.categoryId === cid).map(x => ({ userId: x.userId, nombre: nombreCorto(x.name, x.surname), total: x.total, anio: x.anio, mes: x.mes })) }));
    }

    async function precioPro() {
        const a = await ajustes();
        if (!a.conceptoPro) return null;
        const p = (await pool.query(`SELECT descripcion, precio, iva_pct FROM aim_precios WHERE concepto = $1 AND activo = true`, [a.conceptoPro])).rows[0];
        return p ? { concepto: a.conceptoPro, nombre: p.descripcion, precio: r2(Number(p.precio) * (1 + Number(p.iva_pct || 0) / 100)), texto: a.textoPro } : null;
    }

    // ═══ Público: el catálogo, sin datos de nadie ═══
    const publico = express.Router();
    publico.get('/catalogo', async (req, res) => {
        try {
            const [cats, items] = await Promise.all([categorias(), articulos()]);
            res.set('Cache-Control', 'public, max-age=60');
            res.json({
                categorias: cats.map(({ config, ...c }) => c),
                articulos: items.filter(i => i.activo).map(({ ocupadas, revisado, ...i }) => i),
                pro: await precioPro().then(p => (p ? { precio: p.precio, texto: p.texto } : null)),
            });
        } catch (e) { err(res, e); }
    });

    // ═══ Familias ═══
    const familia = express.Router();
    const deMiFamilia = async (req, id) => {
        if (!UUID.test(String(id || ''))) return false;
        return (await familiaIds(req.userSession.userId)).map(String).includes(String(id));
    };
    familia.get('/', async (req, res) => {
        try {
            const fam = await familiaIds(req.userSession.userId);
            const [miembros, cats, items, perms, reservas, hist, votacion, pro] = await Promise.all([
                pool.query(`SELECT user_id AS id, name, surname FROM users WHERE user_id = ANY($1::uuid[]) ORDER BY birthday DESC NULLS LAST, name`, [fam]),
                categorias(), articulos(), permisosDe(fam), reservasDe({ ids: fam }),
                pool.query(
                    `SELECT h.id, h."userId", h."itemId", h."categoryId", h."completedAt", i.title, i."imageUrl"
                     FROM bricks_userhistory h JOIN bricks_items i ON i.id = h."itemId" AND i."clubId" = $2
                     WHERE h."userId" = ANY($1::uuid[]) ORDER BY h."completedAt" DESC LIMIT 300`, [fam, clubId]),
                votacionActiva(), precioPro(),
            ]);
            let votos = [];
            if (votacion) {
                votos = (await pool.query(
                    `SELECT v."userId", v."optionId" FROM bricks_poll_vote v JOIN bricks_poll_option o ON o.id = v."optionId"
                     WHERE o."pollId" = $1 AND v."userId" = ANY($2::uuid[])`, [votacion.id, fam])).rows;
            }
            const rk = await ranking(cats);
            const mios = new Set(fam.map(String));
            res.set('Cache-Control', 'no-store');
            res.json({
                categorias: cats.map(({ config, ...c }) => c),
                articulos: items.filter(i => i.activo).map(({ ocupadas, revisado, ...i }) => i),
                miembros: miembros.rows.map(m => ({
                    id: m.id, nombre: m.name, apellidos: m.surname || '',
                    permisos: perms.get(String(m.id)) || {},
                    voto: votos.find(v => String(v.userId) === String(m.id))?.optionId || null,
                })),
                reservas, historial: hist.rows.map(h => ({ id: h.id, userId: h.userId, articuloId: h.itemId, categoriaId: h.categoryId, titulo: h.title, imagen: h.imageUrl || '', fecha: h.completedAt })),
                votacion,
                ranking: rk.map(c => ({ ...c, filas: c.filas.map(f => ({ ...f, mio: mios.has(String(f.userId)), userId: mios.has(String(f.userId)) ? f.userId : null })) })),
                pro,
            });
        } catch (e) { err(res, e); }
    });
    familia.post('/reservas', async (req, res) => {
        const { alumnoId, articuloId } = req.body || {};
        try {
            if (!(await deMiFamilia(req, alumnoId))) throw fallo(403, 'Esa persona no es de tu familia.');
            res.status(201).json({ success: true, id: await reservar(alumnoId, articuloId) });
        } catch (e) { err(res, e); }
    });
    familia.delete('/reservas/:id', async (req, res) => {
        try {
            const r = (await pool.query(`SELECT "userId", status FROM bricks_reservation WHERE id = $1`, [String(req.params.id)])).rows[0];
            if (!r || !(await deMiFamilia(req, r.userId))) throw fallo(404, 'Esa reserva no existe.');
            if (!['Reserved', 'Active'].includes(r.status)) throw fallo(409, 'Ya se ha entregado: para devolverla, tráela al club.');
            await pool.query(`DELETE FROM bricks_reservation WHERE id = $1 AND status IN ('Reserved', 'Active')`, [String(req.params.id)]);
            onCambio();
            res.json({ success: true });
        } catch (e) { err(res, e); }
    });
    familia.post('/votar', async (req, res) => {
        const { alumnoId, opcionId } = req.body || {};
        try {
            if (!(await deMiFamilia(req, alumnoId))) throw fallo(403, 'Esa persona no es de tu familia.');
            const v = await votacionActiva();
            if (!v || !v.opciones.some(o => o.id === opcionId)) throw fallo(409, 'Esa votación ya está cerrada.');
            const cats = await categorias();
            const p = (await permisosDe([alumnoId])).get(String(alumnoId)) || {};
            if (!cats.filter(esLegoCat).some(c => p[c.id]?.normal)) throw fallo(403, 'Para votar hay que ser de Brickslab.');
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`bricks-voto:${v.id}:${alumnoId}`]);
                const ya = (await client.query(
                    `SELECT 1 FROM bricks_poll_vote x JOIN bricks_poll_option o ON o.id = x."optionId" WHERE o."pollId" = $1 AND x."userId" = $2`, [v.id, alumnoId])).rowCount;
                if (ya) throw fallo(409, 'Ya ha votado en esta votación.');
                await client.query(`INSERT INTO bricks_poll_vote (id, "optionId", "userId") VALUES ($1, $2, $3)`, [crypto.randomUUID(), opcionId, alumnoId]);
                await client.query('COMMIT');
            } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
            res.json({ success: true });
        } catch (e) { err(res, e); }
    });
    // Avisar de que faltan piezas de un set que tiene o que ha tenido.
    familia.post('/piezas', async (req, res) => {
        const { alumnoId, articuloId, descripcion } = req.body || {};
        const texto = String(descripcion || '').trim().slice(0, 2000);
        try {
            if (!(await deMiFamilia(req, alumnoId))) throw fallo(403, 'Esa persona no es de tu familia.');
            if (texto.length < 3) throw fallo(400, 'Cuéntanos qué piezas faltan.');
            if (!UUID.test(String(articuloId || ''))) throw fallo(400, 'Ese set no existe.');
            const lo = (await pool.query(
                `SELECT 1 FROM bricks_reservation WHERE "userId" = $1 AND "itemId" = $2
                 UNION SELECT 1 FROM bricks_userhistory WHERE "userId" = $1 AND "itemId" = $2`, [alumnoId, articuloId])).rowCount;
            if (!lo) throw fallo(403, 'Solo se avisa de los sets que se han tenido.');
            await pool.query(`INSERT INTO bricks_missing_pieces (id, "userId", "itemId", description, status, "reportedAt") VALUES ($1, $2, $3, $4, 'Pending', NOW())`,
                [crypto.randomUUID(), alumnoId, articuloId, texto]);
            res.status(201).json({ success: true });
        } catch (e) { err(res, e); }
    });
    // Activar el Pro: matrícula en «Brickslab Pro» y el cargo del mes, que se
    // paga por la web en «Pagos y recibos».
    familia.post('/pro', async (req, res) => {
        const { alumnoId } = req.body || {};
        try {
            if (!(await deMiFamilia(req, alumnoId))) throw fallo(403, 'Esa persona no es de tu familia.');
            const enlace = await asegurarEnlacePro();
            if (!enlace) throw fallo(409, 'El Pro todavía no se puede contratar por la web. Pregunta en secretaría.');
            const cats = await categorias();
            const p = (await permisosDe([alumnoId])).get(String(alumnoId)) || {};
            if (p._pro?.suscrito) throw fallo(409, 'Ya tiene el Pro activado.');
            if (!cats.filter(esLegoCat).some(c => p[c.id]?.normalManual || p[c.id]?.normalAuto)) throw fallo(403, 'El Pro es para quien ya está en Brickslab. Apúntate primero a la clase.');
            const actividad = await actividadBrickslab();
            await pool.query(
                `INSERT INTO aim_matriculas (user_id, clase_ref, clase_origen, clase_nombre, actividad, temporada_id, descuento_pct, alta)
                 VALUES ($1, $2, 'custom', 'Brickslab Pro', $3, $4, 0, ${HOY})
                 ON CONFLICT (user_id, clase_ref, temporada_id) DO UPDATE SET baja = NULL, alta = LEAST(aim_matriculas.alta, EXCLUDED.alta)`,
                [alumnoId, enlace.claseProId, actividad, enlace.temporadaId]);
            const creados = await generarCargosDeMatricula({ userId: alumnoId, claseRef: enlace.claseProId, actividad, temporadaId: enlace.temporadaId });
            const debe = (await pool.query(`SELECT COUNT(*)::int n FROM aim_cargos WHERE cliente_id = $1 AND concepto = $2 AND estado = 'pendiente' AND recibo_id IS NULL`, [alumnoId, enlace.conceptoPro])).rows[0].n;
            onCambio();
            res.status(201).json({ success: true, creados, porPagar: debe });
        } catch (e) { err(res, e); }
    });
    // Darse de baja: se queda hasta el final del último mes pagado. Lo que no se
    // ha pagado (y no está pagando ahora mismo) se quita.
    familia.delete('/pro/:alumnoId', async (req, res) => {
        const alumnoId = req.params.alumnoId;
        try {
            if (!(await deMiFamilia(req, alumnoId))) throw fallo(403, 'Esa persona no es de tu familia.');
            const a = await ajustes();
            if (!a.claseProId) throw fallo(409, 'No tiene el Pro activado.');
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(
                    `DELETE FROM aim_cargos c WHERE c.cliente_id = $1 AND c.concepto = $2 AND c.estado = 'pendiente' AND c.recibo_id IS NULL AND ${sqlPagandoDesde} IS NULL`,
                    [alumnoId, a.conceptoPro || '']);
                const hasta = (await client.query(
                    `SELECT (MAX(mes) + INTERVAL '1 month - 1 day')::date::text AS h FROM aim_cargos WHERE cliente_id = $1 AND concepto = $2 AND estado = 'cobrado' AND mes >= ${MES}`,
                    [alumnoId, a.conceptoPro || ''])).rows[0]?.h;
                const r = await client.query(
                    `UPDATE aim_matriculas m SET baja = GREATEST(m.alta, COALESCE($3::date, ${HOY}))
                     FROM aim_temporadas t WHERE t.id = m.temporada_id AND t.activa AND m.user_id = $1 AND m.clase_ref = $2 AND (m.baja IS NULL OR m.baja >= ${HOY})
                     RETURNING m.baja::text AS baja`, [alumnoId, a.claseProId, hasta || null]);
                await client.query('COMMIT');
                if (!r.rowCount) throw fallo(409, 'No tiene el Pro activado.');
                onCambio();
                res.json({ success: true, hasta: r.rows[0].baja });
            } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
        } catch (e) { err(res, e); }
    });

    // ═══ Panel (secretaría y dirección) ═══
    const admin = express.Router();
    admin.get('/', async (req, res) => {
        try {
            const [cats, items, vivas, devueltas, a, pro] = await Promise.all([categorias(), articulos(), reservasDe(), reservasDe({ vivas: false, limite: 60 }), ajustes(), precioPro()]);
            const perms = await permisosDe([...new Set(vivas.map(r => r.userId))]);
            res.set('Cache-Control', 'no-store');
            res.json({
                categorias: cats, articulos: items,
                reservas: vivas.map(r => ({ ...r, pro: !!perms.get(String(r.userId))?.[r.categoriaId]?.pro })),
                devueltas, pro, ajustes: a,
            });
        } catch (e) { err(res, e); }
    });
    // Personas del club, para reservar a mano o darles permisos.
    admin.get('/personas', async (req, res) => {
        const q = String(req.query.q || '').trim().slice(0, 60);
        if (q.length < 2) return res.json({ personas: [] });
        try {
            const palabras = q.split(/\s+/).slice(0, 4);
            const vals = [clubId, ...palabras.map(p => `%${p.toLowerCase()}%`)];
            const r = await pool.query(
                `SELECT u.user_id AS id, u.name, u.surname FROM users u WHERE u.club_id = $1
                   AND ${palabras.map((_, i) => `LOWER(u.name || ' ' || COALESCE(u.surname, '')) LIKE $${i + 2}`).join(' AND ')}
                 ORDER BY u.name, u.surname LIMIT 15`, vals);
            const perms = await permisosDe(r.rows.map(x => x.id));
            res.json({ personas: r.rows.map(x => ({ id: x.id, nombre: nombreLargo(x.name, x.surname), permisos: perms.get(String(x.id)) })) });
        } catch (e) { err(res, e); }
    });
    admin.post('/reservas', async (req, res) => {
        try { res.status(201).json({ success: true, id: await reservar(req.body?.userId, req.body?.articuloId) }); }
        catch (e) { err(res, e); }
    });
    admin.post('/reservas/:id/entregar', async (req, res) => {
        try {
            const r = await pool.query(`UPDATE bricks_reservation SET status = 'Delivered' WHERE id = $1 AND status IN ('Reserved', 'Active') RETURNING id`, [String(req.params.id)]);
            if (!r.rowCount) throw fallo(409, 'Esa reserva ya no está pendiente de entregar.');
            onCambio();
            res.json({ success: true });
        } catch (e) { err(res, e); }
    });
    // Devolver: queda en su historial (de ahí sale el ranking), como en la app.
    admin.post('/reservas/:id/devolver', async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const r = (await client.query(
                `UPDATE bricks_reservation SET status = 'Returned', "returnDate" = NOW() WHERE id = $1 AND status IN ${VIVAS}
                 RETURNING "userId", "itemId", "categoryId", "brickslabId", "libraryBookId"`, [String(req.params.id)])).rows[0];
            if (!r) throw fallo(409, 'Esa reserva ya está devuelta.');
            await client.query(
                `INSERT INTO bricks_userhistory (id, "userId", "itemId", "categoryId", "brickslabId", "libraryBookId", "completedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [crypto.randomUUID(), r.userId, r.itemId, r.categoryId, r.brickslabId, r.libraryBookId]);
            await client.query('COMMIT');
            onCambio();
            res.json({ success: true });
        } catch (e) { await client.query('ROLLBACK').catch(() => {}); err(res, e); } finally { client.release(); }
    });
    admin.delete('/reservas/:id', async (req, res) => {
        try {
            const r = await pool.query(`DELETE FROM bricks_reservation WHERE id = $1 AND status IN ('Reserved', 'Active') RETURNING id`, [String(req.params.id)]);
            if (!r.rowCount) throw fallo(409, 'Solo se anulan las reservas sin entregar. Si ya se entregó, márcala como devuelta.');
            onCambio();
            res.json({ success: true });
        } catch (e) { err(res, e); }
    });

    // ── Catálogo ──
    function datosArticulo(b, cats) {
        const titulo = String(b.titulo || '').trim().slice(0, 200);
        if (!titulo) throw fallo(400, 'Ponle un título.');
        const cat = cats.find(c => c.id === b.categoriaId);
        if (!cat) throw fallo(400, 'Elige la categoría.');
        const imagen = String(b.imagen || '').trim().slice(0, 1000);
        if (imagen && !/^https:\/\//i.test(imagen)) throw fallo(400, 'La imagen tiene que ser un enlace que empiece por https://');
        const stock = Math.max(1, Math.min(99, Math.round(Number(b.stock) || 1)));
        const datos = {};
        for (const f of cat.campos) if (b.datos?.[f.name] != null && String(b.datos[f.name]).trim() !== '') datos[f.name] = String(b.datos[f.name]).trim().slice(0, 300);
        datos.allowHomeBuild = b.datos?.allowHomeBuild !== false;
        return { titulo, categoriaId: cat.id, descripcion: String(b.descripcion || '').trim().slice(0, 3000), imagen, stock, soloPro: !!b.soloPro, activo: b.activo !== false, datos };
    }
    admin.post('/articulos', async (req, res) => {
        try {
            const d = datosArticulo(req.body || {}, await categorias());
            const r = await pool.query(
                `INSERT INTO bricks_items ("clubId", "categoryId", title, description, "imageUrl", stock, "isProOnly", "isAvailable", metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) RETURNING id`,
                [clubId, d.categoriaId, d.titulo, d.descripcion, d.imagen, d.stock, d.soloPro, d.activo, JSON.stringify(d.datos)]);
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (e) { err(res, e); }
    });
    admin.put('/articulos/:id', async (req, res) => {
        try {
            const d = datosArticulo(req.body || {}, await categorias());
            const r = await pool.query(
                `UPDATE bricks_items SET "categoryId" = $3, title = $4, description = $5, "imageUrl" = $6, stock = $7, "isProOnly" = $8, "isAvailable" = $9,
                        metadata = COALESCE(metadata, '{}'::jsonb) || $10::jsonb
                 WHERE id = $1 AND "clubId" = $2 RETURNING id`,
                [String(req.params.id), clubId, d.categoriaId, d.titulo, d.descripcion, d.imagen, d.stock, d.soloPro, d.activo, JSON.stringify(d.datos)]);
            if (!r.rowCount) throw fallo(404, 'Ese artículo no existe.');
            res.json({ success: true });
        } catch (e) { err(res, e); }
    });
    // Borrar solo lo que nunca se ha prestado; lo demás se retira (deja de salir).
    admin.delete('/articulos/:id', async (req, res) => {
        const id = String(req.params.id);
        try {
            if (!UUID.test(id)) throw fallo(404, 'Ese artículo no existe.');
            const usado = (await pool.query(
                `SELECT 1 FROM bricks_reservation WHERE "itemId" = $1 UNION SELECT 1 FROM bricks_userhistory WHERE "itemId" = $1
                 UNION SELECT 1 FROM bricks_missing_pieces WHERE "itemId" = $1`, [id])).rowCount;
            if (usado) {
                await pool.query(`UPDATE bricks_items SET "isAvailable" = false WHERE id = $1 AND "clubId" = $2`, [id, clubId]);
                return res.json({ success: true, retirado: true });
            }
            await pool.query(`DELETE FROM bricks_items WHERE id = $1 AND "clubId" = $2`, [id, clubId]);
            res.json({ success: true });
        } catch (e) { err(res, e); }
    });
    // Revisar un set: queda la fecha y, si faltan piezas, el aviso (con el formato
    // «pieza: cantidad» de la app, para su lista de pedido a LEGO).
    admin.post('/articulos/:id/revisar', async (req, res) => {
        const id = String(req.params.id);
        try {
            if (!UUID.test(id)) throw fallo(404, 'Ese artículo no existe.');
            const r = await pool.query(`UPDATE bricks_items SET "lastReviewedAt" = NOW() WHERE id = $1 AND "clubId" = $2 RETURNING id`, [id, clubId]);
            if (!r.rowCount) throw fallo(404, 'Ese artículo no existe.');
            const lineas = (Array.isArray(req.body?.piezas) ? req.body.piezas : [])
                .map(p => ({ pieza: String(p?.pieza || '').trim().slice(0, 40), cantidad: Math.round(Number(p?.cantidad) || 0) }))
                .filter(p => p.pieza && p.cantidad > 0).slice(0, 100);
            if (lineas.length) {
                await pool.query(`INSERT INTO bricks_missing_pieces (id, "userId", "itemId", description, status, "reportedAt") VALUES ($1, $2, $3, $4, 'Pending', NOW())`,
                    [crypto.randomUUID(), req.userSession.userId, id, lineas.map(p => `${p.pieza}: ${p.cantidad}`).join('\n')]);
            }
            res.json({ success: true, piezas: lineas.length });
        } catch (e) { err(res, e); }
    });

    // ── Categorías ──
    function datosCategoria(b) {
        const nombre = String(b.nombre || '').trim().slice(0, 80);
        if (!nombre) throw fallo(400, 'Ponle nombre a la categoría.');
        const campos = (Array.isArray(b.campos) ? b.campos : []).slice(0, 12)
            .map(f => ({ name: String(f?.name || f?.label || '').trim().replace(/[^\w]/g, '').slice(0, 40), label: String(f?.label || '').trim().slice(0, 60), type: f?.type === 'number' ? 'number' : 'text' }))
            .filter(f => f.name && f.label);
        return {
            nombre, icono: ICONOS.includes(b.icono) ? b.icono : 'Package', descripcion: String(b.descripcion || '').trim().slice(0, 300),
            enCasa: !!b.enCasa, ranking: b.ranking !== false, config: { reservationMode: b.modo === 'brickslab' ? 'brickslab' : 'library', customFields: campos },
        };
    }
    admin.post('/categorias', async (req, res) => {
        try {
            const d = datosCategoria(req.body || {});
            await pool.query(
                `INSERT INTO bricks_categories ("clubId", name, icon, description, "isHomeAllowed", "rankingEnabled", config) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
                [clubId, d.nombre, d.icono, d.descripcion, d.enCasa, d.ranking, JSON.stringify(d.config)]);
            res.status(201).json({ success: true });
        } catch (e) { err(res, e); }
    });
    admin.put('/categorias/:id', async (req, res) => {
        try {
            const d = datosCategoria(req.body || {});
            const r = await pool.query(
                `UPDATE bricks_categories SET name = $3, icon = $4, description = $5, "isHomeAllowed" = $6, "rankingEnabled" = $7,
                        config = COALESCE(config, '{}'::jsonb) || $8::jsonb WHERE id = $1 AND "clubId" = $2 RETURNING id`,
                [String(req.params.id), clubId, d.nombre, d.icono, d.descripcion, d.enCasa, d.ranking, JSON.stringify(d.config)]);
            if (!r.rowCount) throw fallo(404, 'Esa categoría no existe.');
            res.json({ success: true });
        } catch (e) { err(res, e); }
    });
    admin.delete('/categorias/:id', async (req, res) => {
        try {
            const id = String(req.params.id);
            if (!UUID.test(id)) throw fallo(404, 'Esa categoría no existe.');
            if ((await pool.query(`SELECT 1 FROM bricks_items WHERE "categoryId" = $1 LIMIT 1`, [id])).rowCount) throw fallo(409, 'Tiene artículos: quítalos o cámbialos de categoría antes.');
            await pool.query(`DELETE FROM bricks_user_permissions WHERE "categoryId" = $1`, [id]);
            await pool.query(`DELETE FROM bricks_categories WHERE id = $1 AND "clubId" = $2`, [id, clubId]);
            res.json({ success: true });
        } catch (e) { err(res, e); }
    });

    // ── Permisos ──
    // Quién tiene algo: lo dado a mano, los matriculados y los del Pro.
    admin.get('/permisos', async (req, res) => {
        try {
            const a = await ajustes();
            const ids = (await pool.query(
                `SELECT p."userId" AS id FROM bricks_user_permissions p JOIN bricks_categories c ON c.id = p."categoryId" AND c."clubId" = $1 WHERE p."isStandard" OR p."isPro"
                 UNION SELECT m.user_id FROM aim_matriculas m JOIN aim_temporadas t ON t.id = m.temporada_id AND t.activa
                   WHERE (m.clase_ref = ANY($2::uuid[]) OR m.clase_ref = $3) AND (m.baja IS NULL OR m.baja >= ${HOY})
                 UNION SELECT gs.student_id FROM tul_group_students gs WHERE gs.group_id = ANY($2::uuid[])`,
                [clubId, a.clasesNormal, a.claseProId || '00000000-0000-0000-0000-000000000000'])).rows.map(x => x.id);
            const [u, perms] = await Promise.all([
                pool.query(`SELECT user_id AS id, name, surname FROM users WHERE user_id = ANY($1::uuid[]) AND club_id = $2 ORDER BY name, surname`, [ids, clubId]),
                permisosDe(ids),
            ]);
            res.set('Cache-Control', 'no-store');
            res.json({ personas: u.rows.map(x => ({ id: x.id, nombre: nombreLargo(x.name, x.surname), permisos: perms.get(String(x.id)) })) });
        } catch (e) { err(res, e); }
    });
    admin.put('/permisos', async (req, res) => {
        const { userId, categoriaId } = req.body || {};
        try {
            if (!UUID.test(String(userId || '')) || !(await categorias()).some(c => c.id === categoriaId)) throw fallo(400, 'Faltan datos.');
            const normal = !!req.body.normal, pro = !!req.body.pro;
            await pool.query(
                `INSERT INTO bricks_user_permissions ("userId", "categoryId", "isStandard", "isPro") VALUES ($1, $2, $3, $4)
                 ON CONFLICT ("userId", "categoryId") DO UPDATE SET "isStandard" = EXCLUDED."isStandard", "isPro" = EXCLUDED."isPro"`,
                [userId, categoriaId, normal || pro, pro]);
            res.json({ success: true, permisos: (await permisosDe([userId])).get(String(userId)) });
        } catch (e) { err(res, e); }
    });

    // ── Piezas que faltan ──
    admin.get('/piezas', async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT p.id, p.description, p."reportedAt", p.status, i.id AS item_id, i.title, i.metadata, u.name, u.surname
                 FROM bricks_missing_pieces p JOIN bricks_items i ON i.id = p."itemId" AND i."clubId" = $1 JOIN users u ON u.user_id = p."userId"
                 ORDER BY (p.status = 'Pending') DESC, p."reportedAt" DESC LIMIT 500`, [clubId]);
            res.set('Cache-Control', 'no-store');
            res.json({ piezas: r.rows.map(x => ({ id: x.id, texto: x.description, fecha: x.reportedAt, pendiente: x.status === 'Pending', articuloId: x.item_id, articulo: x.title, referencia: x.metadata?.legoReference || '', quien: nombreLargo(x.name, x.surname) })) });
        } catch (e) { err(res, e); }
    });
    admin.post('/piezas/:id/repuesta', async (req, res) => {
        try {
            const r = await pool.query(`UPDATE bricks_missing_pieces SET status = $2 WHERE id = $1 RETURNING id`, [String(req.params.id), req.body?.pendiente ? 'Pending' : 'Replaced']);
            if (!r.rowCount) throw fallo(404, 'Ese aviso no existe.');
            res.json({ success: true });
        } catch (e) { err(res, e); }
    });

    // ── Votaciones ──
    admin.get('/votaciones', async (req, res) => {
        try {
            const v = (await pool.query(`SELECT id, title, description, "isActive", "expiresAt", "createdAt" FROM bricks_poll WHERE "clubId" = $1 ORDER BY "createdAt" DESC LIMIT 50`, [clubId])).rows;
            const ops = v.length ? (await pool.query(
                `SELECT o.id, o."pollId", o.title, o."imageUrl",
                        COALESCE((SELECT json_agg(TRIM(u.name || ' ' || COALESCE(u.surname, '')) ORDER BY u.name) FROM bricks_poll_vote x JOIN users u ON u.user_id = x."userId" WHERE x."optionId" = o.id), '[]') AS votantes
                 FROM bricks_poll_option o WHERE o."pollId" = ANY($1::text[]) ORDER BY o.title`, [v.map(x => x.id)])).rows : [];
            res.set('Cache-Control', 'no-store');
            res.json({ votaciones: v.map(x => ({
                id: x.id, titulo: x.title, descripcion: x.description || '', activa: x.isActive, hasta: x.expiresAt, creada: x.createdAt,
                abierta: x.isActive && (!x.expiresAt || new Date(x.expiresAt) > new Date()),
                opciones: ops.filter(o => o.pollId === x.id).map(o => ({ id: o.id, titulo: o.title, imagen: o.imageUrl || '', votantes: o.votantes })),
            })) });
        } catch (e) { err(res, e); }
    });
    function datosVotacion(b) {
        const titulo = String(b.titulo || '').trim().slice(0, 160);
        if (!titulo) throw fallo(400, 'Ponle un título.');
        const opciones = (Array.isArray(b.opciones) ? b.opciones : []).map(o => ({ id: o?.id || null, titulo: String(o?.titulo || '').trim().slice(0, 160), imagen: String(o?.imagen || '').trim().slice(0, 1000) }))
            .filter(o => o.titulo).slice(0, 12);
        if (opciones.length < 2) throw fallo(400, 'Pon al menos dos opciones.');
        if (opciones.some(o => o.imagen && !/^https:\/\//i.test(o.imagen))) throw fallo(400, 'Las imágenes tienen que ser enlaces que empiecen por https://');
        // Sin fecha: hasta el día 1 del mes que viene a las 10:00, como en la app.
        let hasta = b.hasta ? new Date(b.hasta) : null;
        if (hasta && isNaN(hasta)) throw fallo(400, 'La fecha de cierre no es válida.');
        if (!hasta) { const n = new Date(); hasta = new Date(n.getFullYear(), n.getMonth() + 1, 1, 10, 0, 0); }
        return { titulo, descripcion: String(b.descripcion || '').trim().slice(0, 1000), opciones, hasta };
    }
    admin.post('/votaciones', async (req, res) => {
        const client = await pool.connect();
        try {
            const d = datosVotacion(req.body || {});
            await client.query('BEGIN');
            // Una votación activa a la vez: la nueva cierra las anteriores.
            await client.query(`UPDATE bricks_poll SET "isActive" = false WHERE "clubId" = $1 AND "isActive"`, [clubId]);
            const id = crypto.randomUUID();
            await client.query(`INSERT INTO bricks_poll (id, "clubId", title, description, "isActive", "expiresAt", "createdAt") VALUES ($1, $2, $3, $4, true, $5, NOW())`,
                [id, clubId, d.titulo, d.descripcion, d.hasta]);
            for (const o of d.opciones) await client.query(`INSERT INTO bricks_poll_option (id, "pollId", title, "imageUrl") VALUES ($1, $2, $3, $4)`, [crypto.randomUUID(), id, o.titulo, o.imagen]);
            await client.query('COMMIT');
            res.status(201).json({ success: true, id });
        } catch (e) { await client.query('ROLLBACK').catch(() => {}); err(res, e); } finally { client.release(); }
    });
    admin.put('/votaciones/:id', async (req, res) => {
        const id = String(req.params.id);
        const client = await pool.connect();
        try {
            const d = datosVotacion(req.body || {});
            await client.query('BEGIN');
            const r = await client.query(`UPDATE bricks_poll SET title = $3, description = $4, "expiresAt" = $5 WHERE id = $1 AND "clubId" = $2 RETURNING id`, [id, clubId, d.titulo, d.descripcion, d.hasta]);
            if (!r.rowCount) throw fallo(404, 'Esa votación no existe.');
            const antes = (await client.query(`SELECT id FROM bricks_poll_option WHERE "pollId" = $1`, [id])).rows.map(x => x.id);
            const siguen = d.opciones.filter(o => o.id && antes.includes(o.id)).map(o => o.id);
            // Quitar una opción borra también sus votos.
            await client.query(`DELETE FROM bricks_poll_option WHERE "pollId" = $1 AND NOT (id = ANY($2::text[]))`, [id, siguen]);
            for (const o of d.opciones) {
                if (o.id && antes.includes(o.id)) await client.query(`UPDATE bricks_poll_option SET title = $2, "imageUrl" = $3 WHERE id = $1`, [o.id, o.titulo, o.imagen]);
                else await client.query(`INSERT INTO bricks_poll_option (id, "pollId", title, "imageUrl") VALUES ($1, $2, $3, $4)`, [crypto.randomUUID(), id, o.titulo, o.imagen]);
            }
            await client.query('COMMIT');
            res.json({ success: true });
        } catch (e) { await client.query('ROLLBACK').catch(() => {}); err(res, e); } finally { client.release(); }
    });
    admin.patch('/votaciones/:id', async (req, res) => {
        try {
            const activa = !!req.body?.activa;
            if (activa) await pool.query(`UPDATE bricks_poll SET "isActive" = false WHERE "clubId" = $1 AND "isActive" AND id <> $2`, [clubId, String(req.params.id)]);
            const r = await pool.query(`UPDATE bricks_poll SET "isActive" = $3 WHERE id = $1 AND "clubId" = $2 RETURNING id`, [String(req.params.id), clubId, activa]);
            if (!r.rowCount) throw fallo(404, 'Esa votación no existe.');
            res.json({ success: true });
        } catch (e) { err(res, e); }
    });

    // ── Ajustes ──
    admin.get('/ajustes', async (req, res) => {
        try {
            const [a, conceptos, grupos] = await Promise.all([
                ajustes(),
                pool.query(`SELECT concepto, descripcion, precio, iva_pct, tipo FROM aim_precios WHERE activo = true ORDER BY descripcion`),
                pool.query(`SELECT g.group_id AS id, a.name || ' · ' || g.name AS nombre FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id WHERE a.club_id = $1 ORDER BY a.name, g.name`, [clubId]),
            ]);
            res.set('Cache-Control', 'no-store');
            res.json({ ajustes: a, pro: await precioPro(),
                conceptos: conceptos.rows.map(c => ({ concepto: c.concepto, nombre: c.descripcion, precio: r2(Number(c.precio) * (1 + Number(c.iva_pct || 0) / 100)), tipo: c.tipo })),
                grupos: grupos.rows });
        } catch (e) { err(res, e); }
    });
    admin.put('/ajustes', async (req, res) => {
        const b = req.body || {};
        try {
            const cambios = {};
            if (b.conceptoPro !== undefined) {
                if (b.conceptoPro && !(await pool.query(`SELECT 1 FROM aim_precios WHERE concepto = $1 AND activo = true`, [String(b.conceptoPro)])).rowCount) throw fallo(400, 'Ese concepto no existe en el catálogo.');
                cambios.conceptoPro = b.conceptoPro ? String(b.conceptoPro) : null;
            }
            if (b.clasesNormal !== undefined) cambios.clasesNormal = (Array.isArray(b.clasesNormal) ? b.clasesNormal : []).filter(x => UUID.test(String(x))).slice(0, 20);
            if (b.textoPro !== undefined) cambios.textoPro = String(b.textoPro || '').trim().slice(0, 600);
            await guardarAjustes(cambios, req.userSession.userId);
            if (cambios.conceptoPro) await asegurarEnlacePro();
            res.json({ success: true });
        } catch (e) { err(res, e); }
    });

    // Para la campanita: reservas por entregar y avisos de piezas sin reponer.
    async function pendientes() {
        const r = (await pool.query(
            `SELECT (SELECT COUNT(*) FROM bricks_reservation r JOIN bricks_items i ON i.id = r."itemId" AND i."clubId" = $1 WHERE r.status IN ('Reserved', 'Active'))::int AS por_entregar,
                    (SELECT MAX(r."reservationDate") FROM bricks_reservation r JOIN bricks_items i ON i.id = r."itemId" AND i."clubId" = $1 WHERE r.status IN ('Reserved', 'Active')) AS ultima`,
            [clubId])).rows[0];
        return { porEntregar: r.por_entregar, ultima: r.ultima };
    }

    return { publico, familia, admin, asegurarEnlacePro, pendientes };
}
