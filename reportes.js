// ─────────────────────────────────────────────────────────────────────────────
// Reportes (ticket #416): cómo va el negocio, todo junto y con las mismas cuentas
// en todas partes. Cada pestaña de la pantalla tiene aquí su consulta, y todas
// reciben el mismo mes (?mes=AAAA-MM) y lo comparan con el anterior; si es el mes
// en curso, con el anterior hasta el mismo día, para comparar lo mismo con lo
// mismo.
//
// Las cuentas, una sola vez y para todos:
//  · Ingresos (sin IVA): la base de las facturas, del libro registro
//    (aim_factura_registro), por la fecha de la factura (que es la del cobro:
//    aquí solo se factura al cobrar). Es lo que es del club.
//  · Cobrado (con IVA): el total de esas mismas facturas. La diferencia es el
//    IVA, que se paga a Hacienda.
//  · Rectificativas: por diferencias restan lo devuelto en el mes en que se
//    hacen; por sustitución, la diferencia con la que sustituyen (su importe es
//    lo que queda, no lo devuelto: sumarlo tal cual duplicaba).
//  · Pagos: un cobro puede dar hasta tres facturas (MAT, IVA, SIVA, con el
//    mismo factura_grupo): se cuentan cobros, no facturas.
//  · Por cobrar: los cargos pendientes de hasta este mes, con su descuento y su
//    IVA (lo que de verdad hay que pedir); los de meses futuros, aparte.
//  · Los días y los meses, siempre en hora de Madrid.
// Solo lo ven quienes tienen las cifras generales (reportesGenerales: dirección,
// Equipo IT y secretaría); un instructor no ve dinero.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import { alumnosPorMes } from './tul-clases.js';
import { generarReportesPdf, nombreMes } from './reportes-pdf.js';

export const HOY = `(now() AT TIME ZONE 'Europe/Madrid')::date`;
const MES_ACTUAL = `date_trunc('month', ${HOY})::date`;

// Cada factura con su efecto en dinero: total (con IVA) y base (sin IVA).
export const SQL_MOVIMIENTOS = `
    SELECT rc.id, rc.fecha, rc.serie, rc.medio_pago, rc.tipo, rc.rect_metodo, rc.pagador_id, rc.rectifica_id,
           COALESCE(rc.factura_grupo::text, rc.id::text) AS pago,
           (CASE WHEN rc.tipo = 'rectificativo' AND rc.rect_metodo = 'sustitucion'
                 THEN rc.importe - COALESCE(o.importe, 0) ELSE rc.importe END)::numeric AS total,
           (CASE WHEN rc.tipo = 'rectificativo' AND rc.rect_metodo = 'sustitucion'
                 THEN COALESCE(fr.base, rc.importe) - COALESCE(fo.base, o.importe, 0) ELSE COALESCE(fr.base, rc.importe) END)::numeric AS base
    FROM aim_recibos rc
    LEFT JOIN aim_recibos o ON o.id = rc.rectifica_id
    LEFT JOIN LATERAL (SELECT f.base FROM aim_factura_registro f WHERE f.recibo_id = rc.id ORDER BY f.id LIMIT 1) fr ON true
    LEFT JOIN LATERAL (SELECT f.base FROM aim_factura_registro f WHERE f.recibo_id = o.id ORDER BY f.id LIMIT 1) fo ON true
    WHERE rc.estado <> 'anulado'`;

// Lo que vale de verdad un cargo pendiente: con su descuento y su IVA. Los
// exentos al 100 % no cuentan.
const SQL_IMPORTE_PENDIENTE = `(c.precio * (1 - COALESCE(c.descuento_pct, 0) / 100) * (1 + COALESCE(c.iva_pct, 0) / 100))`;
const SQL_BASE_PENDIENTE = `(c.precio * (1 - COALESCE(c.descuento_pct, 0) / 100))`;
// Las tres series de factura (#423): AIMMT (venta de material y productos),
// AIMSP (actividades deportivas, con IVA) y AIMED (educativas, sin IVA). Todo lo
// que va por AIMMT cuenta como «Ventas», sea de la actividad que sea; los bonos
// (es_bono en el catálogo: Bono Flexi, Aim Pass, Pase Explorador) van aparte.
// Hace falta «LEFT JOIN aim_precios pr ON pr.concepto = c.concepto».
const SQL_ES_VENTA = (rc = 'rc') => `${rc}.serie IN ('MAT', 'MATR')`;
export const SQL_GRUPO_INGRESO = (rc = 'rc') => `(CASE WHEN ${SQL_ES_VENTA(rc)} THEN 'Ventas' WHEN pr.es_bono THEN 'Bonos'
                              ELSE COALESCE(NULLIF(c.actividad, ''), 'General') END)`;
// Mensualidades, Ventas, Bonos, Matrícula, Campamento u Otros.
const SQL_TIPO_CARGO = `(CASE WHEN ${SQL_ES_VENTA()} THEN 'Ventas (material y productos)'
                              WHEN pr.es_bono THEN 'Bonos'
                              WHEN c.concepto = '00000' OR c.origen = 'inscripcion' THEN 'Matrícula'
                              WHEN c.origen = 'campamento' THEN 'Campamento'
                              WHEN c.tipo = 'Mensualidad' THEN 'Mensualidades'
                              ELSE 'Otros' END)`;

// Lo que hay por cobrar ahora (lo usa también el Resumen del panel, para que
// den lo mismo). Por alumnos: un cargo es de un alumno; la familia que paga
// puede llevar varios.
export async function pendienteAhora(pool) {
    const x = (await pool.query(
        `SELECT COUNT(*) FILTER (WHERE c.mes IS NULL OR c.mes <= ${MES_ACTUAL})::int AS n,
                COUNT(DISTINCT c.cliente_id) FILTER (WHERE c.mes IS NULL OR c.mes <= ${MES_ACTUAL})::int AS alumnos,
                COALESCE(SUM(${SQL_IMPORTE_PENDIENTE}) FILTER (WHERE c.mes IS NULL OR c.mes <= ${MES_ACTUAL}), 0)::numeric AS total,
                COALESCE(SUM(${SQL_BASE_PENDIENTE}) FILTER (WHERE c.mes IS NULL OR c.mes <= ${MES_ACTUAL}), 0)::numeric AS base,
                COALESCE(SUM(${SQL_IMPORTE_PENDIENTE}) FILTER (WHERE c.mes < ${MES_ACTUAL}), 0)::numeric AS atrasado,
                COUNT(*) FILTER (WHERE c.mes > ${MES_ACTUAL})::int AS n_futuro,
                COALESCE(SUM(${SQL_IMPORTE_PENDIENTE}) FILTER (WHERE c.mes > ${MES_ACTUAL}), 0)::numeric AS futuro
         FROM aim_cargos c
         WHERE c.estado = 'pendiente' AND c.recibo_id IS NULL AND COALESCE(c.descuento_pct, 0) < 100`)).rows[0];
    return {
        cargos: x.n, alumnos: x.alumnos, total: r2(x.total), base: r2(x.base), atrasado: r2(x.atrasado),
        futuro: { cargos: x.n_futuro, total: r2(x.futuro) },
    };
}

function r2(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    const c = Math.round(Number((Math.abs(x) * 100).toFixed(6)));
    return (x < 0 ? -c : c) / 100;
}
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

// «AAAA-MM» → el mes, sus días y los del mes con el que se compara.
function hoyMadrid() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}
const ultimoDia = (mes) => { const [y, m] = mes.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const mesMas = (mes, n) => { const [y, m] = mes.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
export function periodo(q) {
    const hoy = hoyMadrid(), actual = hoy.slice(0, 7);
    const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(q || '')) && String(q) <= actual ? String(q) : actual;
    const enCurso = mes === actual;
    const hasta = enCurso ? hoy : ultimoDia(mes);
    const ant = mesMas(mes, -1);
    // El anterior, hasta el mismo día si este está a medias (sin pasarse de su último día).
    const hastaAnt = enCurso ? [`${ant}-${hoy.slice(8)}`, ultimoDia(ant)].sort()[0] : ultimoDia(ant);
    return { mes, desde: `${mes}-01`, hasta, enCurso, hoy, anterior: { mes: ant, desde: `${ant}-01`, hasta: hastaAnt } };
}
// Los doce meses que acaban en el elegido.
const docemeses = (mes) => Array.from({ length: 12 }, (_, i) => mesMas(mes, i - 11));

export function crearReportes({ pool, clubId, authenticateSession, requirePermiso, candidatosGeneracion, mesesDeTemporada, sqlEsIndividual, empresa = () => null }) {
    const router = express.Router();
    const ver = [authenticateSession, requirePermiso('reportesGenerales')];
    // Cada pestaña, también para el PDF (#434): las mismas cuentas que en pantalla.
    const calculos = {};
    const ruta = (path, fn) => (calculos[path] = fn, router.get(`/api/admin/reportes/${path}`, ...ver, async (req, res) => {
        try {
            res.set('Cache-Control', 'no-store');
            res.json(await fn(periodo(req.query.mes), req));
        } catch (err) {
            console.error(`Reportes (${path}):`, err);
            res.status(500).json({ error: 'No se ha podido calcular el informe.' });
        }
    }));

    // Ingresos y cobros de un rango de días.
    async function dinero(desde, hasta) {
        const x = (await pool.query(
            `SELECT COALESCE(SUM(base), 0)::numeric AS base, COALESCE(SUM(total), 0)::numeric AS total,
                    COUNT(DISTINCT pago) FILTER (WHERE tipo <> 'rectificativo')::int AS pagos,
                    COALESCE(SUM(total) FILTER (WHERE tipo = 'rectificativo'), 0)::numeric AS devuelto
             FROM (${SQL_MOVIMIENTOS}) m WHERE m.fecha BETWEEN $1::date AND $2::date`, [desde, hasta])).rows[0];
        return { ingresos: r2(x.base), cobrado: r2(x.total), iva: r2(Number(x.total) - Number(x.base)), pagos: x.pagos, devuelto: r2(x.devuelto) };
    }
    // Gastos de un rango de días (en hora de Madrid: un gasto del día 31 a las
    // 10:00 es del 31, no del mes siguiente ni fuera del rango).
    async function gastos(desde, hasta) {
        const x = (await pool.query(
            `SELECT COALESCE(SUM(amount), 0)::numeric AS total, COUNT(*)::int AS n
             FROM aim_gastos WHERE (date AT TIME ZONE 'Europe/Madrid')::date BETWEEN $1::date AND $2::date`, [desde, hasta])).rows[0];
        return { total: r2(x.total), n: x.n };
    }
    // Mes a mes: ingresos, cobrado y gastos de los doce meses.
    async function serie(mes) {
        const meses = docemeses(mes);
        const desde = `${meses[0]}-01`, hasta = ultimoDia(mes);
        const [ing, gas, alu] = await Promise.all([
            pool.query(
                `SELECT to_char(m.fecha, 'YYYY-MM') AS mes, SUM(m.base)::numeric AS base, SUM(m.total)::numeric AS total
                 FROM (${SQL_MOVIMIENTOS}) m WHERE m.fecha BETWEEN $1::date AND $2::date GROUP BY 1`, [desde, hasta]),
            pool.query(
                `SELECT to_char((date AT TIME ZONE 'Europe/Madrid')::date, 'YYYY-MM') AS mes, SUM(amount)::numeric AS total
                 FROM aim_gastos WHERE (date AT TIME ZONE 'Europe/Madrid')::date BETWEEN $1::date AND $2::date GROUP BY 1`, [desde, hasta]),
            // Alumnos distintos que pagaron cada mes (uno con dos actividades es uno).
            pool.query(
                `SELECT to_char(rc.fecha, 'YYYY-MM') AS mes, COUNT(DISTINCT c.cliente_id)::int AS n
                 FROM aim_cargos c JOIN aim_recibos rc ON rc.id = c.recibo_id
                 WHERE rc.tipo <> 'rectificativo' AND rc.estado <> 'anulado' AND rc.fecha BETWEEN $1::date AND $2::date GROUP BY 1`, [desde, hasta]),
        ]);
        const I = Object.fromEntries(ing.rows.map(x => [x.mes, x])), G = Object.fromEntries(gas.rows.map(x => [x.mes, x])), A = Object.fromEntries(alu.rows.map(x => [x.mes, x.n]));
        return meses.map(m => ({
            mes: m, ingresos: r2(I[m]?.base || 0), cobrado: r2(I[m]?.total || 0), gastos: r2(G[m]?.total || 0),
            alumnos: A[m] || 0, resultado: r2(Number(I[m]?.base || 0) - Number(G[m]?.total || 0)),
        }));
    }
    async function alumnosYPlazas(p) {
        const [act, altas, bajas, grupos] = await Promise.all([
            pool.query(`SELECT COUNT(DISTINCT gs.student_id)::int n FROM tul_group_students gs
                        JOIN tul_groups g ON g.group_id = gs.group_id JOIN tul_activities a ON a.activity_id = g.activity_id WHERE a.club_id = $1`, [clubId]),
            // Alta: su primera clase en el club es de ese mes.
            pool.query(`SELECT COUNT(*)::int n FROM (SELECT student_id, MIN(created_at) AS primera FROM tul_enrollment_history
                        WHERE club_id = $1 AND action = 'enrolled' GROUP BY student_id) t
                        WHERE (t.primera AT TIME ZONE 'Europe/Madrid')::date BETWEEN $2::date AND $3::date`, [clubId, p.desde, p.hasta]),
            // Baja: dejó una clase ese mes y ya no está en ninguna.
            pool.query(`SELECT COUNT(DISTINCT h.student_id)::int n FROM tul_enrollment_history h
                        WHERE h.club_id = $1 AND h.action = 'unenrolled' AND (h.created_at AT TIME ZONE 'Europe/Madrid')::date BETWEEN $2::date AND $3::date
                          AND NOT EXISTS (SELECT 1 FROM tul_group_students gs JOIN tul_groups g ON g.group_id = gs.group_id
                                          JOIN tul_activities a ON a.activity_id = g.activity_id WHERE gs.student_id = h.student_id AND a.club_id = $1)`, [clubId, p.desde, p.hasta]),
            pool.query(`SELECT g.max_students AS max, (SELECT COUNT(*) FROM tul_group_students gs WHERE gs.group_id = g.group_id)::int AS n,
                               (SELECT COUNT(*) FROM aim_lista_espera e WHERE e.group_id = g.group_id AND e.estado = 'esperando')::int AS espera
                        FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                        WHERE a.club_id = $1 AND COALESCE(g.max_students, 0) > 0 AND NOT ${sqlEsIndividual()}`, [clubId]),
        ]);
        const gs = grupos.rows;
        const plazas = gs.reduce((t, g) => t + g.max, 0), ocupadas = gs.reduce((t, g) => t + Math.min(g.n, g.max), 0);
        return {
            activos: act.rows[0].n, altas: altas.rows[0].n, bajas: bajas.rows[0].n,
            plazas, ocupadas, ocupacion: pct(ocupadas, plazas), llenas: gs.filter(g => g.n >= g.max).length,
            esperando: gs.reduce((t, g) => t + g.espera, 0),
        };
    }

    // ── Resumen ──
    ruta('resumen', async (p) => {
        const [d, dAnt, g, gAnt, cobrar, alumnos, meses, avisos] = await Promise.all([
            dinero(p.desde, p.hasta), dinero(p.anterior.desde, p.anterior.hasta),
            gastos(p.desde, p.hasta), gastos(p.anterior.desde, p.anterior.hasta),
            pendienteAhora(pool), alumnosYPlazas(p), serie(p.mes), avisosDatos(p),
        ]);
        return {
            periodo: p, ...d, gastos: g, resultado: r2(d.ingresos - g.total),
            anterior: { ...dAnt, gastos: gAnt, resultado: r2(dAnt.ingresos - gAnt.total) },
            porCobrar: cobrar, alumnos, meses, avisos,
        };
    });
    // Lo que hace que las cifras engañen, para decirlo al lado.
    async function avisosDatos(p) {
        const [g, viejos, sinAct, online] = await Promise.all([
            gastos(p.desde, p.hasta),
            pool.query(`SELECT COUNT(*)::int n, MIN(mes)::text AS desde, COALESCE(SUM(${SQL_IMPORTE_PENDIENTE}), 0)::numeric AS total
                        FROM aim_cargos c WHERE c.estado = 'pendiente' AND c.recibo_id IS NULL AND COALESCE(c.descuento_pct, 0) < 100
                          AND c.mes < ${MES_ACTUAL} - INTERVAL '6 months'`),
            pool.query(`SELECT COALESCE(SUM(c.importe), 0)::numeric AS total FROM aim_cargos c JOIN aim_recibos rc ON rc.id = c.recibo_id
                        LEFT JOIN aim_precios pr ON pr.concepto = c.concepto
                        WHERE rc.tipo <> 'rectificativo' AND rc.estado <> 'anulado' AND ${SQL_GRUPO_INGRESO()} = 'General' AND rc.fecha BETWEEN $1::date AND $2::date`, [p.desde, p.hasta]),
            pool.query(`SELECT COUNT(*)::int n, COALESCE(SUM(importe), 0)::numeric AS total FROM aim_tpv_pagos
                        WHERE entorno = 'real' AND estado <> 'pagado' AND (created_at AT TIME ZONE 'Europe/Madrid')::date BETWEEN $1::date AND $2::date`, [p.desde, p.hasta]),
        ]);
        const l = [];
        if (!g.n) l.push({ tipo: 'aviso', texto: 'No hay gastos apuntados este mes: el resultado es solo lo ingresado. Apúntalos en Gastos para ver el beneficio de verdad.' });
        const v = viejos.rows[0];
        if (v.n) l.push({ tipo: 'aviso', texto: `Hay ${v.n} cargo${v.n !== 1 ? 's' : ''} pendiente${v.n !== 1 ? 's' : ''} de hace más de seis meses (desde ${v.desde.slice(0, 7)}), por ${r2(v.total)} €: mira si siguen debiéndose o hay que quitarlos.` });
        if (Number(sinAct.rows[0].total) > 0) l.push({ tipo: 'info', texto: `${r2(sinAct.rows[0].total)} € de ingresos de este mes no son de ninguna actividad ni ventas ni bonos (matrícula, por ejemplo): salen en «General».` });
        const o = online.rows[0];
        if (o.n) l.push({ tipo: 'info', texto: `${o.n} pago${o.n !== 1 ? 's' : ''} por la web sin terminar o rechazado${o.n !== 1 ? 's' : ''} este mes (${r2(o.total)} €).` });
        return l;
    }

    // ── Ingresos ──
    ruta('ingresos', async (p) => {
        const actividades = async (desde, hasta) => (await pool.query(
            // Lo cobrado por actividad (base y con IVA) y, restando, lo devuelto
            // con rectificativas por diferencias ese mes.
            `SELECT actividad, SUM(base)::numeric AS base, SUM(bruto)::numeric AS bruto, COUNT(DISTINCT cliente_id)::int AS alumnos FROM (
                 SELECT ${SQL_GRUPO_INGRESO()} AS actividad, c.importe AS base,
                        COALESCE(c.importe_bruto, c.importe * (1 + COALESCE(c.iva_pct, 0) / 100)) AS bruto, c.cliente_id
                 FROM aim_cargos c JOIN aim_recibos rc ON rc.id = c.recibo_id LEFT JOIN aim_precios pr ON pr.concepto = c.concepto
                 WHERE rc.tipo <> 'rectificativo' AND rc.estado <> 'anulado' AND rc.fecha BETWEEN $1::date AND $2::date
                 UNION ALL
                 SELECT ${SQL_GRUPO_INGRESO()}, l.base, l.base * (1 + COALESCE(l.iva_pct, 0) / 100), NULL
                 FROM aim_recibo_rect_lineas l JOIN aim_recibos rc ON rc.id = l.recibo_id LEFT JOIN aim_cargos c ON c.id = l.cargo_id
                 LEFT JOIN aim_precios pr ON pr.concepto = c.concepto
                 WHERE rc.rect_metodo = 'diferencias' AND rc.estado <> 'anulado' AND rc.fecha BETWEEN $1::date AND $2::date
             ) t GROUP BY 1 ORDER BY 2 DESC`, [desde, hasta])).rows;
        const [d, dAnt, act, actAnt, tipos, medios, series, meses] = await Promise.all([
            dinero(p.desde, p.hasta), dinero(p.anterior.desde, p.anterior.hasta),
            actividades(p.desde, p.hasta), actividades(p.anterior.desde, p.anterior.hasta),
            // Por tipo, también con lo devuelto ese mes (como por actividad).
            pool.query(`SELECT tipo, SUM(base)::numeric AS base, COUNT(*) FILTER (WHERE base > 0)::int AS n FROM (
                          SELECT ${SQL_TIPO_CARGO} AS tipo, c.importe AS base
                          FROM aim_cargos c JOIN aim_recibos rc ON rc.id = c.recibo_id LEFT JOIN aim_precios pr ON pr.concepto = c.concepto
                          WHERE rc.tipo <> 'rectificativo' AND rc.estado <> 'anulado' AND rc.fecha BETWEEN $1::date AND $2::date
                          UNION ALL
                          SELECT ${SQL_TIPO_CARGO}, l.base
                          FROM aim_recibo_rect_lineas l JOIN aim_recibos rc ON rc.id = l.recibo_id LEFT JOIN aim_cargos c ON c.id = l.cargo_id
                          LEFT JOIN aim_precios pr ON pr.concepto = c.concepto
                          WHERE rc.rect_metodo = 'diferencias' AND rc.estado <> 'anulado' AND rc.fecha BETWEEN $1::date AND $2::date
                        ) t GROUP BY 1 ORDER BY 2 DESC`, [p.desde, p.hasta]),
            // Por cómo se pagó (los cobros con varios medios, repartidos).
            pool.query(`SELECT COALESCE(rp.medio, rc.medio_pago, 'otro') AS medio, SUM(COALESCE(rp.importe, rc.importe))::numeric AS total,
                               COUNT(DISTINCT COALESCE(rc.factura_grupo::text, rc.id::text))::int AS pagos
                        FROM aim_recibos rc LEFT JOIN aim_recibo_pagos rp ON rp.recibo_id = rc.id
                        WHERE rc.tipo <> 'rectificativo' AND rc.estado <> 'anulado' AND rc.fecha BETWEEN $1::date AND $2::date
                        GROUP BY 1 ORDER BY 2 DESC`, [p.desde, p.hasta]),
            pool.query(`SELECT COALESCE(serie, '—') AS serie, SUM(base)::numeric AS base, SUM(total)::numeric AS total, COUNT(*)::int AS facturas
                        FROM (${SQL_MOVIMIENTOS}) m WHERE m.fecha BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 1`, [p.desde, p.hasta]),
            serie(p.mes),
        ]);
        // El prefijo con el que sale cada serie en la factura (AIMMT, AIMSP, AIMED…).
        const numeracion = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = 'numeracion'`)).rows[0]?.valor || {};
        const alumnosMes = meses[meses.length - 1].alumnos;
        const ant = Object.fromEntries(actAnt.map(a => [a.actividad, r2(a.base)]));
        return {
            periodo: p, ...d, anterior: dAnt, alumnos: alumnosMes,
            porAlumno: alumnosMes ? r2(d.ingresos / alumnosMes) : 0,
            meses,
            porActividad: act.map(a => ({ actividad: a.actividad, ingresos: r2(a.base), cobrado: r2(a.bruto), alumnos: a.alumnos, anterior: ant[a.actividad] || 0 })),
            porTipo: tipos.rows.map(t => ({ tipo: t.tipo, ingresos: r2(t.base), cargos: t.n })),
            porMedio: medios.rows.map(m => ({ medio: m.medio, total: r2(m.total), pagos: m.pagos })),
            porSerie: series.rows.map(s => ({ serie: s.serie, prefijo: numeracion[s.serie]?.prefijo || null, ingresos: r2(s.base), cobrado: r2(s.total), iva: r2(Number(s.total) - Number(s.base)), facturas: s.facturas })),
        };
    });

    // ── Cobros y deudas ──
    ruta('cobros', async (p) => {
        const [ahora, porMes, deudores, tasa, online] = await Promise.all([
            pendienteAhora(pool),
            // Lo pendiente por mes de servicio (de qué mes es la cuota).
            pool.query(`SELECT COALESCE(to_char(c.mes, 'YYYY-MM'), 'sin mes') AS mes, COUNT(*)::int AS n, COUNT(DISTINCT c.cliente_id)::int AS alumnos,
                               SUM(${SQL_IMPORTE_PENDIENTE})::numeric AS total
                        FROM aim_cargos c WHERE c.estado = 'pendiente' AND c.recibo_id IS NULL AND COALESCE(c.descuento_pct, 0) < 100
                        GROUP BY 1 ORDER BY 1`),
            pool.query(`SELECT c.cliente_id, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS alumno, COUNT(*)::int AS n,
                               SUM(${SQL_IMPORTE_PENDIENTE})::numeric AS total, MIN(c.mes)::text AS desde
                        FROM aim_cargos c JOIN users u ON u.user_id = c.cliente_id
                        WHERE c.estado = 'pendiente' AND c.recibo_id IS NULL AND COALESCE(c.descuento_pct, 0) < 100
                          AND (c.mes IS NULL OR c.mes <= ${MES_ACTUAL})
                        GROUP BY 1, 2 ORDER BY 4 DESC LIMIT 20`),
            // De lo que había que cobrar de ese mes (sus cuotas), cuánto se ha cobrado.
            pool.query(`SELECT COUNT(*) FILTER (WHERE c.estado IN ('cobrado', 'pendiente', 'impagado'))::int AS cargos,
                               COUNT(*) FILTER (WHERE c.estado = 'cobrado')::int AS cobrados,
                               COALESCE(SUM(CASE WHEN c.estado = 'cobrado' THEN c.importe WHEN c.estado IN ('pendiente', 'impagado') THEN ${SQL_BASE_PENDIENTE} END), 0)::numeric AS debido,
                               COALESCE(SUM(c.importe) FILTER (WHERE c.estado = 'cobrado'), 0)::numeric AS cobrado,
                               COUNT(*) FILTER (WHERE c.estado = 'exento')::int AS exentos,
                               COUNT(*) FILTER (WHERE c.estado = 'quitado')::int AS quitados,
                               COUNT(*) FILTER (WHERE c.estado = 'impagado')::int AS impagados,
                               COALESCE(SUM(${SQL_BASE_PENDIENTE}) FILTER (WHERE c.estado = 'impagado'), 0)::numeric AS impagado
                        FROM aim_cargos c WHERE c.mes = $1::date`, [p.desde]),
            pool.query(`SELECT COUNT(*) FILTER (WHERE estado = 'pagado')::int AS pagados, COALESCE(SUM(importe) FILTER (WHERE estado = 'pagado'), 0)::numeric AS pagado,
                               COUNT(*) FILTER (WHERE estado = 'rechazado')::int AS rechazados, COALESCE(SUM(importe) FILTER (WHERE estado = 'rechazado'), 0)::numeric AS rechazado,
                               COUNT(*) FILTER (WHERE estado NOT IN ('pagado', 'rechazado'))::int AS sin_terminar, COALESCE(SUM(importe) FILTER (WHERE estado NOT IN ('pagado', 'rechazado')), 0)::numeric AS sin_terminar_total
                        FROM aim_tpv_pagos WHERE entorno = 'real' AND (created_at AT TIME ZONE 'Europe/Madrid')::date BETWEEN $1::date AND $2::date`, [p.desde, p.hasta]),
        ]);
        // Antigüedad de lo pendiente: de este mes, del anterior, de 2-3 meses, de más.
        const actual = p.hoy.slice(0, 7);
        const tramo = (m) => {
            if (m === 'sin mes' || m >= actual) return m > actual ? 'futuro' : 'este';
            const d = (Number(actual.slice(0, 4)) * 12 + Number(actual.slice(5))) - (Number(m.slice(0, 4)) * 12 + Number(m.slice(5)));
            return d === 1 ? 'uno' : d <= 3 ? 'tres' : 'mas';
        };
        const antiguedad = { este: 0, uno: 0, tres: 0, mas: 0, futuro: 0 };
        for (const x of porMes.rows) antiguedad[tramo(x.mes)] = r2(antiguedad[tramo(x.mes)] + Number(x.total));
        const t = tasa.rows[0], o = online.rows[0];
        return {
            periodo: p, ahora, antiguedad,
            porMes: porMes.rows.map(x => ({ mes: x.mes, cargos: x.n, alumnos: x.alumnos, total: r2(x.total), tramo: tramo(x.mes) })),
            deudores: deudores.rows.map(x => ({ id: x.cliente_id, alumno: x.alumno, cargos: x.n, total: r2(x.total), desde: x.desde?.slice(0, 7) || null })),
            mesServicio: {
                cargos: t.cargos, cobrados: t.cobrados, debido: r2(t.debido), cobrado: r2(t.cobrado), tasa: pct(Number(t.cobrado), Number(t.debido)),
                exentos: t.exentos, quitados: t.quitados, impagados: t.impagados, impagado: r2(t.impagado),
            },
            online: { pagados: o.pagados, pagado: r2(o.pagado), rechazados: o.rechazados, rechazado: r2(o.rechazado), sinTerminar: o.sin_terminar, sinTerminarTotal: r2(o.sin_terminar_total) },
        };
    });

    // ── Gastos ──
    ruta('gastos', async (p) => {
        const rango = `(date AT TIME ZONE 'Europe/Madrid')::date BETWEEN $1::date AND $2::date`;
        const [g, gAnt, d, cats, tipos, sinPagar, recurrentes, meses] = await Promise.all([
            gastos(p.desde, p.hasta), gastos(p.anterior.desde, p.anterior.hasta), dinero(p.desde, p.hasta),
            pool.query(`SELECT COALESCE(NULLIF(categoria, ''), 'Sin categoría') AS categoria, SUM(amount)::numeric AS total, COUNT(*)::int AS n
                        FROM aim_gastos WHERE ${rango} GROUP BY 1 ORDER BY 2 DESC`, [p.desde, p.hasta]),
            pool.query(`SELECT CASE WHEN COALESCE(categoria, '') = 'Venta' THEN 'Material para vender'
                                    WHEN expense_type = 'especifico' THEN COALESCE(NULLIF(actividad, ''), 'Sin actividad') ELSE 'Comunes' END AS de,
                               SUM(amount)::numeric AS total, COUNT(*)::int AS n
                        FROM aim_gastos WHERE ${rango} GROUP BY 1 ORDER BY 2 DESC`, [p.desde, p.hasta]),
            pool.query(`SELECT COUNT(*) FILTER (WHERE NOT COALESCE(is_paid, false))::int AS sin_pagar, COALESCE(SUM(amount) FILTER (WHERE NOT COALESCE(is_paid, false)), 0)::numeric AS sin_pagar_total,
                               COUNT(*) FILTER (WHERE NOT COALESCE(comprobado_banco, false))::int AS sin_comprobar
                        FROM aim_gastos WHERE ${rango}`, [p.desde, p.hasta]),
            pool.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::numeric AS total FROM (
                          SELECT DISTINCT ON (COALESCE(company, ''), COALESCE(concept, '')) amount FROM aim_gastos
                          WHERE recurrente ORDER BY COALESCE(company, ''), COALESCE(concept, ''), date DESC) t`),
            serie(p.mes),
        ]);
        const s = sinPagar.rows[0];
        return {
            periodo: p, total: g.total, n: g.n, anterior: gAnt, ingresos: d.ingresos, resultado: r2(d.ingresos - g.total),
            porCategoria: cats.rows.map(x => ({ categoria: x.categoria, total: r2(x.total), n: x.n })),
            porDestino: tipos.rows.map(x => ({ de: x.de, total: r2(x.total), n: x.n })),
            sinPagar: { n: s.sin_pagar, total: r2(s.sin_pagar_total) }, sinComprobar: s.sin_comprobar,
            recurrentes: { n: recurrentes.rows[0].n, total: r2(recurrentes.rows[0].total) },
            meses,
        };
    });

    // ── Previsión: cómo puede acabar la temporada ──
    ruta('prevision', async (p) => {
        const temp = (await pool.query('SELECT id, nombre FROM aim_temporadas WHERE activa = true')).rows[0];
        const rango = temp ? mesesDeTemporada(temp.nombre) : null;
        if (!temp || !rango) return { periodo: p, temporada: temp?.nombre || null, meses: [] };
        const ini = rango.inicio.slice(0, 7), fin = rango.fin.slice(0, 7), actual = p.hoy.slice(0, 7);
        const [cobrado, pendiente, iva] = await Promise.all([
            pool.query(`SELECT to_char(m.fecha, 'YYYY-MM') AS mes, SUM(m.base)::numeric AS base, SUM(m.total)::numeric AS total
                        FROM (${SQL_MOVIMIENTOS}) m WHERE m.fecha >= $1::date GROUP BY 1`, [rango.inicio]),
            // Lo que falta por cobrar de cada mes de la temporada (ya generado).
            pool.query(`SELECT to_char(c.mes, 'YYYY-MM') AS mes, SUM(${SQL_BASE_PENDIENTE})::numeric AS base, SUM(${SQL_IMPORTE_PENDIENTE})::numeric AS total
                        FROM aim_cargos c WHERE c.estado = 'pendiente' AND c.recibo_id IS NULL AND COALESCE(c.descuento_pct, 0) < 100 AND c.mes >= $1::date
                        GROUP BY 1`, [rango.inicio]),
            // El IVA de las facturas (el que se ingresa a Hacienda), por trimestre.
            pool.query(`SELECT EXTRACT(YEAR FROM fecha_expedicion)::int AS ano, EXTRACT(QUARTER FROM fecha_expedicion)::int AS t, SUM(cuota)::numeric AS iva, SUM(base)::numeric AS base
                        FROM aim_factura_registro WHERE fecha_expedicion >= date_trunc('quarter', ${HOY}) - INTERVAL '3 months'
                        GROUP BY 1, 2 ORDER BY 1, 2`),
        ]);
        const C = Object.fromEntries(cobrado.rows.map(x => [x.mes, x])), P = Object.fromEntries(pendiente.rows.map(x => [x.mes, x]));
        const meses = [];
        for (let m = ini; m <= fin; m = mesMas(m, 1)) meses.push(m);
        // Los meses que aún no se han generado: lo que se generaría con las
        // matrículas de ahora (si la gente sigue como hoy).
        const previsto = {};
        for (const m of meses.filter(x => x > actual)) {
            const filas = (await candidatosGeneracion(temp.id, `${m}-01`)).filter(r => !r.ya_existe);
            previsto[m] = {
                base: r2(filas.reduce((s, r) => s + Number(r.precio) * (1 - Number(r.descuento_pct) / 100), 0)),
                total: r2(filas.reduce((s, r) => s + Number(r.precio) * (1 - Number(r.descuento_pct) / 100) * (1 + Number(r.iva_pct) / 100), 0)),
                cargos: filas.length,
            };
        }
        const filas = meses.map(m => ({
            mes: m, cobrado: r2(C[m]?.base || 0), pendiente: r2(P[m]?.base || 0), previsto: previsto[m]?.base || 0,
            cargosPrevistos: previsto[m]?.cargos || 0, pasado: m < actual, actual: m === actual,
        }));
        const suma = (k) => r2(filas.reduce((s, f) => s + f[k], 0));
        // Pendiente de antes de la temporada (no sale en la tabla, pero se debe).
        const anterior = (await pool.query(`SELECT COALESCE(SUM(${SQL_BASE_PENDIENTE}), 0)::numeric AS base FROM aim_cargos c
            WHERE c.estado = 'pendiente' AND c.recibo_id IS NULL AND COALESCE(c.descuento_pct, 0) < 100 AND (c.mes IS NULL OR c.mes < $1::date)`, [rango.inicio])).rows[0].base;
        return {
            periodo: p, temporada: temp.nombre, desde: ini, hasta: fin, meses: filas,
            cobrado: suma('cobrado'), pendiente: suma('pendiente'), previsto: suma('previsto'), pendienteAnterior: r2(anterior),
            estimacion: r2(suma('cobrado') + suma('pendiente') + suma('previsto')),
            iva: iva.rows.map(x => ({ trimestre: `${x.t}T ${x.ano}`, iva: r2(x.iva), base: r2(x.base) })),
        };
    });

    // ── Caja: los cierres del mes ──
    ruta('caja', async (p) => {
        const MEDIOS = ['efectivo', 'tarjeta', 'bizum', 'transferencia'];
        const [arq, sinCerrar, efectivo] = await Promise.all([
            pool.query(`SELECT a.fecha::text AS fecha, a.esperado, a.contado, a.comentario, a.cerrado_at,
                               TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS quien
                        FROM aim_arqueos a LEFT JOIN users u ON u.user_id = a.cerrado_por
                        WHERE a.fecha BETWEEN $1::date AND $2::date ORDER BY a.fecha DESC`, [p.desde, p.hasta]),
            // Días con cobros en el mostrador y sin cerrar (hoy no cuenta: sigue abierto).
            pool.query(`SELECT DISTINCT r.fecha::text AS fecha FROM aim_recibos r
                        WHERE r.estado <> 'anulado' AND r.fecha BETWEEN $1::date AND $2::date AND r.fecha < ${HOY}
                          AND COALESCE(r.medio_pago, '') NOT IN ('tpv_online', 'compensacion')
                          AND NOT EXISTS (SELECT 1 FROM aim_arqueos a WHERE a.fecha = r.fecha) ORDER BY 1`, [p.desde, p.hasta]),
            pool.query(`SELECT COALESCE(SUM(COALESCE(rp.importe, rc.importe)), 0)::numeric AS total
                        FROM aim_recibos rc LEFT JOIN aim_recibo_pagos rp ON rp.recibo_id = rc.id
                        WHERE rc.estado <> 'anulado' AND rc.fecha BETWEEN $1::date AND $2::date AND COALESCE(rp.medio, rc.medio_pago) = 'efectivo'`, [p.desde, p.hasta]),
        ]);
        const dias = arq.rows.map(a => {
            const medios = MEDIOS.map(m => {
                const esperado = r2(a.esperado?.[m]?.neto || 0), contado = r2(Number(a.contado?.[m]) || 0);
                return { medio: m, esperado, contado, descuadre: r2(contado - esperado) };
            });
            return {
                fecha: a.fecha, quien: a.quien || null, comentario: a.comentario || null, cerrado: a.cerrado_at,
                esperado: r2(medios.reduce((s, x) => s + x.esperado, 0)), contado: r2(medios.reduce((s, x) => s + x.contado, 0)),
                descuadre: r2(medios.reduce((s, x) => s + x.descuadre, 0)), medios,
            };
        });
        return {
            periodo: p, dias, sinCerrar: sinCerrar.rows.map(x => x.fecha),
            cerrados: dias.length, conDescuadre: dias.filter(d => d.descuadre !== 0).length,
            descuadre: r2(dias.reduce((s, d) => s + d.descuadre, 0)), efectivo: r2(efectivo.rows[0].total),
        };
    });

    // ── Los reportes del mes en PDF (#434) ──
    // ?modo=equipo: solo alumnos y clases, sin dinero, para los trabajadores.
    // Las plazas, por actividad (sin las clases individuales), para el PDF.
    async function ocupacionPorActividad() {
        const r = await pool.query(
            `SELECT a.name AS nombre, COUNT(*)::int AS grupos, SUM(g.max_students)::int AS plazas,
                    SUM(LEAST((SELECT COUNT(*) FROM tul_group_students gs WHERE gs.group_id = g.group_id), g.max_students))::int AS ocupadas,
                    SUM((SELECT COUNT(*) FROM aim_lista_espera e WHERE e.group_id = g.group_id AND e.estado = 'esperando'))::int AS espera
             FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
             WHERE a.club_id = $1 AND COALESCE(g.max_students, 0) > 0 AND NOT ${sqlEsIndividual()}
             GROUP BY a.name ORDER BY a.name`, [clubId]);
        return r.rows;
    }
    router.get('/api/admin/reportes/pdf', ...ver, async (req, res) => {
        try {
            const p = periodo(req.query.mes);
            const equipo = req.query.modo === 'equipo';
            const [alumnos, porMes, distribucion, resumen, ingresos, cobros, gastosMes, prevision] = await Promise.all([
                alumnosYPlazas(p), alumnosPorMes(pool, clubId, { hasta: p.hasta }), ocupacionPorActividad(),
                ...(equipo ? [] : [calculos.resumen(p), calculos.ingresos(p), calculos.cobros(p), calculos.gastos(p), calculos.prevision(p)]),
            ]);
            const nombre = `${equipo ? 'Alumnos y clases' : 'Reportes'} ${nombreMes(p.mes)}`
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${nombre}.pdf"`);
            res.setHeader('Cache-Control', 'no-store');
            generarReportesPdf({
                mes: p.mes, hasta: p.hasta, enCurso: p.enCurso, equipo, empresa: empresa(),
                generado: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                alumnos, porMes, distribucion, resumen, ingresos, cobros, gastos: gastosMes, prevision,
            }, res);
        } catch (err) {
            console.error('Reportes (pdf):', err);
            if (!res.headersSent) res.status(500).json({ error: 'No se ha podido preparar el PDF.' });
            else res.end();
        }
    });

    return { router };
}
