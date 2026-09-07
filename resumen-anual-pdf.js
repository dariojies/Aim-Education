import PDFDocument from 'pdfkit';

// ─────────────────────────────────────────────────────────────────────────────
// Resumen económico anual por pagador (ticket #222).
//
// El justificante que piden las familias al acabar el año: cronológicamente,
// cada factura del pagador con sus conceptos y su total, las rectificativas que
// devuelven importe, y el total abonado durante el periodo. Se dibuja a mano con
// pdfkit para no depender de cómo imprima el navegador, igual que la factura.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => `${Number(n || 0).toFixed(2)} €`;
const fechaCorta = (f) => {
    const d = new Date(String(f).slice(0, 10) + 'T12:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const TINTA = '#1A1A1A';
const SUAVE = '#6B7280';
const LINEA = '#D1D5DB';
const MALVA = '#5233A8';

export function generarResumenAnualPdf(d, salida) {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
        Title: `Resumen económico ${d.anio}`,
        Author: d.emisor?.nombre || 'AIM Education',
    } });
    doc.pipe(salida);

    const izq = 50;
    const ancho = doc.page.width - 100;
    const der = izq + ancho;

    // ── Cabecera ──
    doc.fillColor(MALVA).font('Helvetica-Bold').fontSize(20).text('Resumen económico', izq, 50);
    doc.fillColor(TINTA).fontSize(13).text(`Año ${d.anio}`, izq, 74);
    doc.font('Helvetica').fontSize(9).fillColor(SUAVE);
    doc.text(d.emisor?.nombre || '', izq, 52, { width: ancho, align: 'right' });
    doc.text(`NIF ${d.emisor?.nif || ''}`, izq, 64, { width: ancho, align: 'right' });
    doc.text(d.emisor?.direccion || '', izq, 76, { width: ancho, align: 'right' });
    doc.text(d.emisor?.cp || '', izq, 88, { width: ancho, align: 'right' });

    let y = 112;
    doc.moveTo(izq, y).lineTo(der, y).strokeColor(LINEA).lineWidth(1).stroke();
    y += 14;

    // ── Pagador ──
    doc.fillColor(SUAVE).font('Helvetica-Bold').fontSize(9).text('PAGADOR', izq, y);
    y += 13;
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(12).text(d.pagador?.nombre || '', izq, y);
    y += 16;
    doc.font('Helvetica').fontSize(9).fillColor(SUAVE);
    const datosPag = [
        d.pagador?.dni ? `NIF ${d.pagador.dni}` : null,
        [d.pagador?.domicilio, d.pagador?.cp, d.pagador?.poblacion].filter(Boolean).join(', ') || null,
        d.pagador?.email || null,
    ].filter(Boolean);
    for (const t of datosPag) { doc.text(t, izq, y); y += 12; }
    y += 8;

    // ── Facturas, agrupadas por mes ──
    const saltoSiHaceFalta = (alto) => {
        if (y + alto > doc.page.height - 90) { doc.addPage(); y = 50; }
    };

    if (!d.facturas.length) {
        doc.fillColor(SUAVE).font('Helvetica-Oblique').fontSize(11)
            .text(`No hay facturas de este pagador en ${d.anio}.`, izq, y);
        y += 24;
    }

    let mesActual = null;
    for (const f of d.facturas) {
        const mes = new Date(String(f.fecha).slice(0, 10) + 'T12:00:00').getMonth();
        if (mes !== mesActual) {
            mesActual = mes;
            saltoSiHaceFalta(40);
            y += 6;
            doc.fillColor(MALVA).font('Helvetica-Bold').fontSize(12)
                .text(`${MESES[mes][0].toUpperCase()}${MESES[mes].slice(1)} ${d.anio}`, izq, y);
            y += 20;
        }

        saltoSiHaceFalta(40 + (f.conceptos.length + 1) * 15);

        // Cabecera de la factura.
        doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(10.5)
            .text(`${f.rectificativa ? 'Factura rectificativa' : 'Factura'} nº ${f.numero}`, izq, y, { continued: true })
            .font('Helvetica').fillColor(SUAVE).text(`   ${fechaCorta(f.fecha)}`);
        y += 16;

        // Conceptos.
        doc.fontSize(9.5);
        for (const c of f.conceptos) {
            const etiqueta = [c.descripcion, c.alumno ? `(${c.alumno})` : null].filter(Boolean).join(' ');
            doc.fillColor(TINTA).font('Helvetica').text(etiqueta, izq + 14, y, { width: ancho - 100 });
            doc.fillColor(c.importe < 0 ? '#B91C1C' : TINTA).text(eur(c.importe), der - 90, y, { width: 90, align: 'right' });
            y += 14;
        }
        // Total de la factura.
        doc.moveTo(izq + 14, y + 1).lineTo(der, y + 1).strokeColor(LINEA).lineWidth(0.5).stroke();
        y += 5;
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(SUAVE)
            .text(f.rectificativa ? 'Total rectificado' : 'Total factura', izq + 14, y, { width: ancho - 100 });
        doc.fillColor(f.importe < 0 ? '#B91C1C' : TINTA).text(eur(f.importe), der - 90, y, { width: 90, align: 'right' });
        y += 22;
    }

    // ── Totales del periodo ──
    saltoSiHaceFalta(90);
    y += 6;
    doc.moveTo(izq, y).lineTo(der, y).strokeColor(MALVA).lineWidth(1.5).stroke();
    y += 12;

    const filaTotal = (etiqueta, valor, fuerte, color) => {
        doc.font(fuerte ? 'Helvetica-Bold' : 'Helvetica').fontSize(fuerte ? 12 : 10)
            .fillColor(fuerte ? TINTA : SUAVE).text(etiqueta, izq, y, { width: ancho - 120 });
        doc.fillColor(color || (fuerte ? MALVA : TINTA)).text(eur(valor), der - 120, y, { width: 120, align: 'right' });
        y += fuerte ? 22 : 16;
    };
    filaTotal('Facturado', d.facturado, false);
    if (d.devuelto) filaTotal('Devuelto (rectificativas)', d.devuelto, false, '#B91C1C');
    filaTotal(`Total abonado durante ${d.anio}`, d.totalNeto, true);

    if (d.haySustituciones) {
        y += 4;
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(SUAVE).text(
            'Nota: existen facturas rectificativas por sustitución. Se listan por transparencia pero no se suman ' +
            'al total, ya que reemplazan a la factura original que ya está contabilizada.',
            izq, y, { width: ancho });
        y += 20;
    }

    doc.font('Helvetica').fontSize(8).fillColor(SUAVE).text(
        `Documento informativo emitido por ${d.emisor?.nombre || 'AIM Education'} el ${fechaCorta(new Date().toISOString())}. ` +
        'Recoge los importes de actividades educativas y deportivas abonados por el pagador en el periodo indicado.',
        izq, doc.page.height - 70, { width: ancho, align: 'center' });

    doc.end();
}
