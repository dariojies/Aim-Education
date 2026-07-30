import PDFDocument from 'pdfkit';

// ─────────────────────────────────────────────────────────────────────────────
// El resumen de gastos de un periodo, para archivar o llevárselo a la gestoría.
//
// Sale con el periodo que se haya elegido en pantalla (un mes, un trimestre, un
// año o un rango a mano) y con los mismos filtros: si en pantalla se están viendo
// solo los pendientes, el PDF trae solo los pendientes. Lo que se ve es lo que se
// descarga; si no, el papel no cuadra con la pantalla y no hay quien lo cuadre.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => `${Number(n || 0).toFixed(2)} €`;
// La fecha puede llegar como Date (columna DATE de Postgres) o como texto. Con
// texto se fija el mediodía para que el huso horario no la mueva un día atrás.
const fecha = (f) => {
    if (!f) return '';
    const d = f instanceof Date ? f : new Date(String(f).slice(0, 10) + 'T12:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const TINTA = '#1A1A1A';
const SUAVE = '#6B7280';
const LINEA = '#E5E7EB';

const REPARTOS = { iguales: 'A partes iguales', alumnos: 'Según alumnos', horas: 'Según horas' };

export function generarGastosPdf(t, salida) {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
        Title: `Gastos ${t.periodo}`,
        Author: t.empresa?.nombre || 'AIM Education',
    } });
    doc.pipe(salida);

    const izq = 50;
    const ancho = doc.page.width - 100;
    const abajo = doc.page.height - 60;

    // ── Cabecera, igual que la de las facturas ──
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(20)
        .text(t.empresa?.nombre || 'AIM Education', izq, 50);
    doc.font('Helvetica').fontSize(9).fillColor(SUAVE);
    for (const linea of [t.empresa?.nif, t.empresa?.direccion, t.empresa?.cp,
                         [t.empresa?.tel, t.empresa?.web].filter(Boolean).join(' · ')]) {
        if (linea) doc.text(linea, izq, doc.y);
    }

    const yFranja = doc.y + 10;
    const degradado = doc.linearGradient(izq, yFranja, izq + ancho, yFranja);
    degradado.stop(0, '#5233A8').stop(.3, '#FF99D3').stop(.6, '#FFD526').stop(1, '#21B668');
    doc.rect(izq, yFranja, ancho, 3).fill(degradado);

    let y = yFranja + 22;
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(15).text('Resumen de gastos', izq, y);
    y = doc.y + 2;
    doc.font('Helvetica').fontSize(11).fillColor(SUAVE).text(t.periodo, izq, y);
    y = doc.y + 4;
    if (t.filtros?.length) {
        doc.fontSize(9).fillColor(SUAVE).text(`Filtros aplicados: ${t.filtros.join(' · ')}`, izq, y);
        y = doc.y;
    }
    y += 12;

    // ── Totales ──
    const cajas = [
        ['Total del periodo', eur(t.total), TINTA],
        ['Pagado', eur(t.pagado), '#21B668'],
        ['Pendiente de pago', eur(t.pendiente), t.pendiente > 0 ? '#E07A00' : SUAVE],
    ];
    const anchoCaja = (ancho - 20) / 3;
    for (let i = 0; i < cajas.length; i++) {
        const x = izq + i * (anchoCaja + 10);
        doc.rect(x, y, anchoCaja, 46).fill('#F5F3EF');
        doc.fillColor(SUAVE).font('Helvetica').fontSize(8).text(cajas[i][0].toUpperCase(), x + 10, y + 9, { width: anchoCaja - 20 });
        doc.fillColor(cajas[i][2]).font('Helvetica-Bold').fontSize(14).text(cajas[i][1], x + 10, y + 23, { width: anchoCaja - 20 });
    }
    y += 60;

    // ── Reparto por actividad y por criterio ──
    y = bloqueResumen(doc, izq, ancho, y, 'Por actividad', t.porActividad);
    y = bloqueResumen(doc, izq, ancho, y, 'Gastos comunes por criterio de reparto', t.porReparto);

    // ── El detalle, línea a línea ──
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(10).text(`Detalle (${t.gastos.length})`, izq, y);
    y = doc.y + 8;

    const cols = [
        { t: 'Fecha', x: izq, w: 55 },
        { t: 'Proveedor', x: izq + 58, w: 115 },
        { t: 'Concepto', x: izq + 176, w: 130 },
        { t: 'Actividad', x: izq + 309, w: 85 },
        { t: 'Estado', x: izq + 397, w: 48 },
        { t: 'Importe', x: izq + 448, w: 47, der: true },
    ];
    const cabecera = () => {
        doc.font('Helvetica-Bold').fontSize(7).fillColor(SUAVE);
        for (const c of cols) doc.text(c.t.toUpperCase(), c.x, y, { width: c.w, align: c.der ? 'right' : 'left' });
        y += 11;
        doc.moveTo(izq, y).lineTo(izq + ancho, y).strokeColor(LINEA).stroke();
        y += 6;
    };
    cabecera();

    doc.font('Helvetica').fontSize(8);
    for (const g of t.gastos) {
        // Una fila nunca se parte entre dos páginas: se pasa entera.
        if (y > abajo - 30) {
            doc.addPage();
            y = 50;
            cabecera();
            doc.font('Helvetica').fontSize(8);
        }
        const alto = Math.max(
            doc.heightOfString(g.proveedor || '—', { width: cols[1].w }),
            doc.heightOfString(g.concepto || '—', { width: cols[2].w }),
            11
        );
        doc.fillColor(TINTA).text(fecha(g.fecha), cols[0].x, y, { width: cols[0].w });
        doc.text(g.proveedor || '—', cols[1].x, y, { width: cols[1].w });
        doc.fillColor(SUAVE).text(g.concepto || '—', cols[2].x, y, { width: cols[2].w });
        doc.text(g.tipo === 'especifico' ? (g.actividad || '—') : 'Común', cols[3].x, y, { width: cols[3].w });
        doc.fillColor(g.pagado ? '#21B668' : '#E07A00').text(g.pagado ? 'Pagado' : 'Pendiente', cols[4].x, y, { width: cols[4].w });
        doc.fillColor(TINTA).font('Helvetica-Bold').text(eur(g.importe), cols[5].x, y, { width: cols[5].w, align: 'right' });
        doc.font('Helvetica');
        y += alto + 6;
    }

    y += 2;
    doc.moveTo(izq, y).lineTo(izq + ancho, y).strokeColor(LINEA).stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TINTA)
        .text(`TOTAL  ${eur(t.total)}`, izq, y, { width: ancho, align: 'right' });

    // ── Pie ──
    doc.font('Helvetica').fontSize(8).fillColor(SUAVE)
        .text(`Resumen interno de gastos · Generado el ${fecha(new Date())}`,
              izq, doc.page.height - 60, { width: ancho, align: 'center' });

    doc.end();
}

// Una tablita de dos columnas: el nombre y su importe, con su total.
function bloqueResumen(doc, izq, ancho, y, titulo, filas) {
    if (!filas?.length) return y;
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(10).text(titulo, izq, y);
    y = doc.y + 6;
    doc.font('Helvetica').fontSize(9);
    for (const f of filas) {
        doc.fillColor(SUAVE).text(f.nombre, izq + 6, y, { width: ancho - 120 });
        doc.fillColor(TINTA).font('Helvetica-Bold').text(eur(f.total), izq, y, { width: ancho - 6, align: 'right' });
        doc.font('Helvetica');
        y += 14;
    }
    y += 8;
    return y;
}

// El nombre del periodo tal y como lo diría una persona: "Julio 2026", no
// "01/07/2026 - 31/07/2026". Solo cuando el rango cuadra con un mes, un
// trimestre o un año naturales; si no, se ponen las dos fechas.
export function nombrePeriodo(desde, hasta) {
    if (!desde && !hasta) return 'Todos los gastos registrados';
    if (!desde) return `Hasta el ${fecha(hasta)}`;
    if (!hasta) return `Desde el ${fecha(desde)}`;

    const d = new Date(desde + 'T12:00:00');
    const h = new Date(hasta + 'T12:00:00');
    if (isNaN(d) || isNaN(h)) return `${fecha(desde)} – ${fecha(hasta)}`;

    const mes = (x) => x.toLocaleDateString('es-ES', { month: 'long' });
    const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
    const primero = d.getDate() === 1;
    const ultimo = h.getDate() === new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate();
    const mismoAno = d.getFullYear() === h.getFullYear();

    if (primero && ultimo && mismoAno) {
        if (d.getMonth() === h.getMonth()) return `${cap(mes(d))} de ${d.getFullYear()}`;
        if (d.getMonth() === 0 && h.getMonth() === 11) return `Año ${d.getFullYear()}`;
        return `${cap(mes(d))} a ${mes(h)} de ${d.getFullYear()}`;
    }
    return `${fecha(desde)} – ${fecha(hasta)}`;
}

// El mismo resumen para una hoja de cálculo. Punto y coma y BOM porque es lo que
// entiende el Excel español; con comas abre todo en una sola columna.
export function gastosCsv(t) {
    const esc = (v) => {
        const s = v == null ? '' : String(v);
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const num = (n) => Number(n || 0).toFixed(2).replace('.', ',');
    const filas = [
        ['Resumen de gastos', t.periodo],
        ['Total', num(t.total)], ['Pagado', num(t.pagado)], ['Pendiente', num(t.pendiente)],
        [],
        ['Fecha', 'Proveedor', 'CIF', 'Nº factura', 'Concepto', 'Tipo', 'Actividad', 'Reparto', 'Medio de pago', 'Estado', 'En banco', 'Importe'],
        ...t.gastos.map(g => [
            fecha(g.fecha), g.proveedor, g.cif, g.numeroFactura, g.concepto,
            g.tipo === 'especifico' ? 'De una actividad' : 'Común',
            g.tipo === 'especifico' ? g.actividad : '',
            g.tipo === 'especifico' ? '' : (REPARTOS[g.reparto] || g.reparto),
            g.medioPago, g.pagado ? 'Pagado' : 'Pendiente', g.comprobadoBanco ? 'Sí' : 'No',
            num(g.importe),
        ]),
        [],
        ['TOTAL', '', '', '', '', '', '', '', '', '', '', num(t.total)],
    ];
    return '﻿' + filas.map(f => f.map(esc).join(';')).join('\r\n');
}
