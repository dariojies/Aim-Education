// =============================================================================
// MOTOR DE CÁLCULO DE FACTURACIÓN
// =============================================================================
// Lógica pura (sin base de datos) para calcular las líneas y los totales de un
// recibo. Se aísla aquí a propósito: es la pieza donde un fallo cuesta dinero.
//
// Reglas del club:
//   1. Descuento manual por línea (%), lo pone secretaría a mano.
//   2. Descuento por nº de mensualidades: se agrupan las líneas de tipo
//      'Mensualidad' POR MES; según cuántas haya de ese mes se aplica un % A
//      CADA LÍNEA de ese mes (no al total). Así, pagar meses por adelantado no
//      hace perder el descuento: cada mes lleva el suyo.
//   3. Los dos descuentos van EN CASCADA: 100€ con 20% manual → 80€, y el 5%
//      se aplica sobre esos 80€ → 76€.
//   4. El IVA de cada línea sale de su propio iva_pct (congelado en el cargo).
//      El precio guardado es SIEMPRE base imponible: el IVA se suma encima.
//   5. El catálogo admite milésimas (ticket #301) para que el precio final salga
//      redondo: 35,496 + 21 % = 42,95. Lo facturado sigue en céntimos, pero el
//      total de esas líneas se saca del precio SIN redondear y el IVA es la
//      diferencia con la base, como con los anticipos (#243). Si se redondeara
//      la base primero saldría 35,50 + 7,46 = 42,96.
// =============================================================================

// Redondeo a 2 decimales, medio céntimo hacia arriba (ticket #243): si el tercer
// decimal es 5 o más, sube al céntimo de arriba; si es 4 o menos, baja. Debe ser
// exacto: al club no le vale que un total suba o baje un céntimo.
//
// El truco de sumar Number.EPSILON no bastaba: a euros grandes (p. ej. 555.555)
// o con importes negativos, el error binario es mayor que ese épsilon y el
// redondeo caía al céntimo equivocado. Aquí se limpia primero el ruido llevando
// los céntimos a 6 decimales (1.005 se guarda como 1.00499999…, que así vuelve a
// 1.005) y se redondea medio hacia arriba en valor absoluto, para que negativos
// y positivos se comporten igual (-1.005 → -1.01).
export function r2(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    const centimos = Math.round(Number((Math.abs(x) * 100).toFixed(6)));
    return (x < 0 ? -centimos : centimos) / 100;
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

// ¿El precio lleva milésimas (35,496) y no solo céntimos? (regla 5, #301)
export function tieneMilesimas(precio) {
    const centimos = Math.abs(num(precio)) * 100;
    return Math.abs(centimos - Math.round(centimos)) > 1e-6;
}

// El total con IVA de una línea con milésimas: del precio sin redondear, con
// sus descuentos, y redondeado solo al final. Lo usan el motor y la rectificativa,
// para que un mismo cargo cueste lo mismo al cobrarlo y al rectificarlo.
export function brutoMilesimas({ precio, descuentoPct = 0, descuentoMensPct = 0, ivaPct = 0 }) {
    const sinRedondear = num(precio) * (1 - num(descuentoPct) / 100) * (1 - num(descuentoMensPct) / 100);
    return r2(sinRedondear * (1 + num(ivaPct) / 100));
}

// Los meses pueden venir como Date o como 'YYYY-MM-DD'; agrupamos por año-mes.
export function mesKey(mes) {
    if (!mes) return '';
    if (mes instanceof Date) {
        return `${mes.getUTCFullYear()}-${String(mes.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    return String(mes).slice(0, 7);
}

// Tramos de descuento según cuántas mensualidades del MISMO mes lleve el recibo.
export function tramoPorMensualidades(n) {
    if (n <= 1) return 0;
    if (n === 2) return 5;
    if (n === 3) return 8;
    return 10; // 4 o más
}

/**
 * Calcula el detalle y los totales de un recibo.
 *
 * @param {Array} lineas - cada una:
 *   { id?, concepto, descripcion, tipo, mes, precio, ivaPct, descuentoPct, clienteId? }
 * @returns {{ detalle, basesPorIva, baseTotal, ivaTotal, total, ahorro }}
 */
export function calcularRecibo(lineas) {
    const items = Array.isArray(lineas) ? lineas : [];

    // 1) Cuántas mensualidades hay de cada mes en este recibo.
    const mensualidadesPorMes = {};
    for (const l of items) {
        if (l.tipo === 'Mensualidad') {
            const k = mesKey(l.mes);
            mensualidadesPorMes[k] = (mensualidadesPorMes[k] || 0) + 1;
        }
    }

    // 2) Cada línea: descuento manual y, encima, el del tramo de su mes.
    const detalle = items.map(l => {
        const precio = num(l.precio);
        const descuentoPct = num(l.descuentoPct);
        // El tramo puede venir ya fijado desde fuera (ticket #293): cuando un cobro
        // se reparte en varias facturas, el tramo se cuenta sobre el cobro ENTERO
        // y cada factura lo recibe hecho; si se contara factura a factura, pagar
        // juntas una actividad con IVA y otra exenta perdería el descuento.
        const fijado = l.descuentoMensPctFijo;
        const descuentoMensPct = (fijado != null && Number.isFinite(Number(fijado)))
            ? num(fijado)
            : l.tipo === 'Mensualidad'
                ? tramoPorMensualidades(mensualidadesPorMes[mesKey(l.mes)] || 0)
                : 0;

        const trasManual = precio * (1 - descuentoPct / 100);
        const base = r2(trasManual * (1 - descuentoMensPct / 100));
        const ivaPct = num(l.ivaPct);

        // Total FIJO de la línea: en vez de grosar la base (base × (1+IVA), que
        // puede bailar un céntimo), se respeta el bruto exacto y el IVA sale de
        // restar (bruto − base). Así lo que paga la familia cuadra al céntimo
        // aunque el desglose no case con base × tipo justo. Lo llevan los
        // anticipos (#243) y los precios con milésimas (regla 5, #301).
        const brutoFijo = (l.brutoFijo !== undefined && Number.isFinite(Number(l.brutoFijo)))
            ? r2(Number(l.brutoFijo))
            : tieneMilesimas(precio)
                ? brutoMilesimas({ precio, descuentoPct, descuentoMensPct, ivaPct })
                : null;
        const iva = brutoFijo != null ? r2(brutoFijo - base) : r2(base * ivaPct / 100);
        const total = brutoFijo != null ? brutoFijo : r2(base + iva);

        return {
            ...l,
            precio: r2(precio),
            descuentoPct,
            descuentoMensPct,
            base,                        // base imponible de la línea (el "importe")
            iva,
            total,
            ivaFijo: brutoFijo != null,  // el IVA de esta línea es exacto (bruto−base)
            ahorro: r2(precio - base),
        };
    });

    // 3) Bases por tipo de IVA. El IVA se calcula sobre la base agregada de cada
    //    tipo (no sumando los IVA por línea ya redondeados), que es lo correcto.
    //    Las líneas con total fijo (anticipos) aportan su IVA ya cerrado (bruto−
    //    base) en vez de recalcularlo, para que el total no baile (ticket #243).
    const grupos = new Map();
    for (const d of detalle) {
        const ivaPct = num(d.ivaPct);
        const g = grupos.get(ivaPct) || { ivaPct, base: 0, baseVar: 0, ivaFija: 0 };
        g.base = r2(g.base + d.base);
        if (d.ivaFijo) g.ivaFija = r2(g.ivaFija + d.iva);
        else g.baseVar = r2(g.baseVar + d.base);
        grupos.set(ivaPct, g);
    }
    for (const g of grupos.values()) g.iva = r2(r2(g.baseVar * g.ivaPct / 100) + g.ivaFija);

    const basesPorIva = [...grupos.values()]
        .map(g => ({ ivaPct: g.ivaPct, base: g.base, iva: g.iva }))
        .sort((a, b) => a.ivaPct - b.ivaPct);
    const baseTotal = r2(detalle.reduce((s, d) => s + d.base, 0));
    const ivaTotal = r2(basesPorIva.reduce((s, g) => s + g.iva, 0));

    return {
        detalle,
        basesPorIva,
        baseTotal,
        ivaTotal,
        total: r2(baseTotal + ivaTotal),
        ahorro: r2(detalle.reduce((s, d) => s + d.ahorro, 0)),
    };
}

// ── Un cobro repartido en facturas por serie (tickets #291 y #293) ──────────
// Para la familia es un solo cobro; para Hacienda, una factura por bloque fiscal.
// Esta es la ÚNICA cuenta que vale para cobrar: la usan la pantalla del TPV, el
// cobro, el pago por internet y la emisión de las facturas, así que lo que se ve,
// lo que se cobra y lo que suman las facturas es siempre lo mismo, al céntimo.
export const SERIES_COBRO = ['MAT', 'IVA', 'SIVA'];

// A qué serie va una línea: la que fije su concepto y, si no, el material es
// entrega de bienes y del resto decide el IVA.
export function serieDeLinea(l) {
    const fijada = String(l?.serieFiscal ?? l?.serie_fiscal ?? '').trim();
    if (SERIES_COBRO.includes(fijada)) return fijada;
    if (l?.tipo === 'Material') return 'MAT';
    return num(l?.ivaPct ?? l?.iva_pct) > 0 ? 'IVA' : 'SIVA';
}

export function calcularCobro(lineas) {
    const items = Array.isArray(lineas) ? lineas : [];
    // 1) El tramo de descuento de cada línea, contado sobre TODO el cobro.
    const todo = calcularRecibo(items);
    const conTramo = items.map((l, i) => ({ ...l, descuentoMensPctFijo: todo.detalle[i].descuentoMensPct }));
    // 2) Una factura por serie, cada una con el tramo ya fijado.
    const porSerie = new Map();
    conTramo.forEach((l, i) => {
        const s = serieDeLinea(l);
        if (!porSerie.has(s)) porSerie.set(s, []);
        porSerie.get(s).push({ l, i });
    });
    const facturas = SERIES_COBRO.filter(s => porSerie.has(s)).map(serie => {
        const filas = porSerie.get(serie);
        return { serie, indices: filas.map(f => f.i), ...calcularRecibo(filas.map(f => f.l)) };
    });
    // 3) El cobro es la suma de sus facturas (cada una redondea su propio IVA).
    const grupos = new Map();
    for (const f of facturas) {
        for (const b of f.basesPorIva) {
            const g = grupos.get(b.ivaPct) || { ivaPct: b.ivaPct, base: 0, iva: 0 };
            g.base = r2(g.base + b.base); g.iva = r2(g.iva + b.iva);
            grupos.set(b.ivaPct, g);
        }
    }
    // El detalle en el orden en que vinieron las líneas.
    const detalle = new Array(items.length);
    for (const f of facturas) f.indices.forEach((idx, k) => { detalle[idx] = f.detalle[k]; });
    return {
        facturas,
        detalle,
        basesPorIva: [...grupos.values()].sort((a, b) => a.ivaPct - b.ivaPct),
        baseTotal: r2(facturas.reduce((s, f) => s + f.baseTotal, 0)),
        ivaTotal: r2(facturas.reduce((s, f) => s + f.ivaTotal, 0)),
        total: r2(facturas.reduce((s, f) => s + f.total, 0)),
        ahorro: r2(facturas.reduce((s, f) => s + f.ahorro, 0)),
    };
}

// Mes que toca generar. Los cargos del mes siguiente solo se generan a partir
// del día 25 del mes anterior (lo pidió el club): del 1 al 24, el mes en curso;
// del 25 en adelante, el siguiente. Antes era a partir del día 6.
export const DIA_GENERAR_SIGUIENTE = 25;
export function mesAGenerar(hoy = new Date()) {
    const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), 1));
    if (hoy.getDate() >= DIA_GENERAR_SIGUIENTE) d.setUTCMonth(d.getUTCMonth() + 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// Mes que le toca a quien se apunta HOY a una clase (ticket #289). Los primeros
// días del mes se le cobra el mes en curso; a partir del día de corte (por
// defecto el 20, configurable en Facturación > Ajustes), el mes siguiente.
export function mesDeAlta(hoy = new Date(), corte = 20) {
    const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), 1));
    if (hoy.getDate() >= corte) d.setUTCMonth(d.getUTCMonth() + 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
