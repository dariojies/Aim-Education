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
// =============================================================================

// Redondeo a 2 decimales evitando el clásico 1.005 -> 1.00 del binario.
export function r2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
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
        const descuentoMensPct = l.tipo === 'Mensualidad'
            ? tramoPorMensualidades(mensualidadesPorMes[mesKey(l.mes)] || 0)
            : 0;

        const trasManual = precio * (1 - descuentoPct / 100);
        const base = r2(trasManual * (1 - descuentoMensPct / 100));
        const ivaPct = num(l.ivaPct);

        return {
            ...l,
            precio: r2(precio),
            descuentoPct,
            descuentoMensPct,
            base,                        // base imponible de la línea (el "importe")
            iva: r2(base * ivaPct / 100),
            total: r2(base + r2(base * ivaPct / 100)),
            ahorro: r2(precio - base),
        };
    });

    // 3) Bases por tipo de IVA. El IVA se calcula sobre la base agregada de cada
    //    tipo (no sumando los IVA por línea ya redondeados), que es lo correcto.
    const grupos = new Map();
    for (const d of detalle) {
        const ivaPct = num(d.ivaPct);
        const g = grupos.get(ivaPct) || { ivaPct, base: 0, iva: 0 };
        g.base = r2(g.base + d.base);
        grupos.set(ivaPct, g);
    }
    for (const g of grupos.values()) g.iva = r2(g.base * g.ivaPct / 100);

    const basesPorIva = [...grupos.values()].sort((a, b) => a.ivaPct - b.ivaPct);
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

// Mes que toca generar: se factura por adelantado con corte el día 5.
// Días 1-5 -> mes en curso; día 6 en adelante -> mes siguiente.
// (Replica el 'hoy - 5 días + 1 mes' del sistema antiguo, pero explícito.)
export function mesAGenerar(hoy = new Date()) {
    const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
    d.setUTCDate(d.getUTCDate() - 5);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
