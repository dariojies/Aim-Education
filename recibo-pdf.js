import PDFDocument from 'pdfkit';

// ─────────────────────────────────────────────────────────────────────────────
// La factura en PDF, tal y como la recibe la familia.
//
// Lleva lo que una factura tiene que llevar: los datos del emisor y también los
// del destinatario (nombre, NIF y domicilio), el número, la fecha, las líneas
// con su IVA, las bases por tipo y el total. Se dibuja a mano con pdfkit para no
// depender de que el navegador imprima bien.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => `${Number(n || 0).toFixed(2)} €`;
const fecha = (f) => {
    const d = new Date(String(f).slice(0, 10) + 'T12:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const TINTA = '#1A1A1A';
const SUAVE = '#6B7280';

export function generarReciboPdf(t, salida) {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
        Title: `Factura ${t.recibo.numero}`,
        Author: t.empresa?.nombre || 'AIM Education',
    } });
    doc.pipe(salida);

    const izq = 50;
    const ancho = doc.page.width - 100;
    const rect = t.recibo.tipo === 'rectificativo';
    const anulado = t.recibo.estado === 'anulado';

    // ── Cabecera ──
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(20)
        .text(t.empresa?.nombre || 'AIM Education', izq, 50);
    doc.font('Helvetica').fontSize(9).fillColor(SUAVE);
    for (const linea of [t.empresa?.nif, t.empresa?.direccion, t.empresa?.cp, [t.empresa?.tel, t.empresa?.web].filter(Boolean).join(' · ')]) {
        if (linea) doc.text(linea, izq, doc.y);
    }

    // Línea con el degradado de la marca, del morado al verde sin cortes. Antes
    // eran cuatro trozos de color pegados y se notaba el salto.
    const yFranja = doc.y + 10;
    const degradado = doc.linearGradient(izq, yFranja, izq + ancho, yFranja);
    degradado.stop(0, '#5233A8').stop(.3, '#FF99D3').stop(.6, '#FFD526').stop(1, '#21B668');
    doc.rect(izq, yFranja, ancho, 3).fill(degradado);

    let y = yFranja + 22;
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(15)
        .text(rect ? 'Factura rectificativa' : 'Factura', izq, y);
    y = doc.y + 6;

    if (anulado) {
        doc.rect(izq, y, ancho, 22).fillAndStroke('#FEE', '#C00');
        doc.fillColor('#C00').font('Helvetica-Bold').fontSize(10)
            .text('FACTURA ANULADA', izq, y + 6, { width: ancho, align: 'center' });
        y += 32;
    }

    // ── Datos del documento ──
    doc.font('Helvetica').fontSize(10).fillColor(TINTA);
    const datos = [
        ['Número', `${t.recibo.serie || 'A'}-${t.recibo.numero}`],
        ['Fecha', fecha(t.recibo.fecha)],
        ['Forma de pago', nombreMedio(t.recibo.medioPago)],
    ];
    for (const [k, v] of datos) {
        doc.fillColor(SUAVE).text(k, izq, y, { width: 110 });
        doc.fillColor(TINTA).font('Helvetica-Bold').text(String(v), izq + 110, y, { width: ancho - 110 });
        doc.font('Helvetica');
        y += 16;
    }

    // ── Destinatario ──
    // Sin NIF o sin domicilio la factura no está completa, así que se dice a las
    // claras en vez de dejar el hueco en blanco.
    y += 10;
    doc.rect(izq, y, ancho, 1).fill('#E5E7EB');
    y += 12;
    doc.fillColor(SUAVE).fontSize(9).font('Helvetica-Bold').text('FACTURAR A', izq, y);
    y += 14;
    doc.fillColor(TINTA).fontSize(11).font('Helvetica-Bold').text(t.recibo.pagador || '—', izq, y, { width: ancho });
    y = doc.y + 2;
    doc.font('Helvetica').fontSize(10);
    const falta = [];
    if (t.recibo.pagadorDni) {
        doc.fillColor(TINTA).text(`NIF: ${t.recibo.pagadorDni}`, izq, y, { width: ancho });
        y = doc.y;
    } else { falta.push('el NIF'); }
    if (t.recibo.pagadorDomicilio) {
        doc.fillColor(TINTA).text(t.recibo.pagadorDomicilio, izq, y, { width: ancho });
        y = doc.y;
    } else { falta.push('el domicilio'); }
    if (falta.length) {
        doc.fillColor('#C2410C').fontSize(9)
            .text(`Faltan ${falta.join(' y ')} del pagador en su ficha.`, izq, y, { width: ancho });
        y = doc.y;
    }
    y += 6;

    // ── Líneas ──
    y += 12;
    const colIva = izq + ancho - 150;
    const colImporte = izq + ancho - 70;
    doc.fillColor(SUAVE).fontSize(9).font('Helvetica-Bold');
    doc.text('CONCEPTO', izq, y);
    doc.text('IVA', colIva, y, { width: 60, align: 'right' });
    doc.text('IMPORTE', colImporte, y, { width: 70, align: 'right' });
    y += 14;
    doc.moveTo(izq, y).lineTo(izq + ancho, y).strokeColor('#E5E7EB').stroke();
    y += 8;

    doc.font('Helvetica').fontSize(10);
    for (const d of t.detalle || []) {
        doc.fillColor(TINTA).text(d.descripcion || '', izq, y, { width: colIva - izq - 10 });
        const alto = doc.y - y;
        doc.fillColor(SUAVE).fontSize(9);
        if (d.cliente) { doc.text(d.cliente, izq, doc.y, { width: colIva - izq - 10 }); }
        doc.fontSize(10).fillColor(TINTA);
        doc.text(`${Number(d.ivaPct || 0)}%`, colIva, y, { width: 60, align: 'right' });
        doc.text(eur(d.total), colImporte, y, { width: 70, align: 'right' });
        y = Math.max(doc.y, y + alto) + 8;
        if (y > doc.page.height - 160) { doc.addPage(); y = 60; }
    }

    doc.moveTo(izq, y).lineTo(izq + ancho, y).strokeColor('#E5E7EB').stroke();
    y += 10;

    // ── Bases por tipo de IVA y total ──
    doc.fontSize(9).fillColor(SUAVE);
    for (const b of t.basesPorIva || []) {
        doc.text(`Base ${b.ivaPct}%`, colIva - 60, y, { width: 120, align: 'right' });
        doc.text(`${eur(b.base)} (IVA ${eur(b.iva)})`, colImporte - 60, y, { width: 130, align: 'right' });
        y += 13;
    }

    y += 6;
    doc.rect(izq + ancho - 220, y, 220, 34).fill('#F5F3EF');
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(14)
        .text(`TOTAL  ${eur(t.recibo.total)}`, izq + ancho - 210, y + 10, { width: 200, align: 'right' });
    y += 46;

    if (t.ahorro > 0) {
        doc.font('Helvetica').fontSize(9).fillColor('#21B668')
            .text(`Ahorro por varias mensualidades: ${eur(t.ahorro)}`, izq, y, { width: ancho, align: 'right' });
        y += 16;
    }

    // ── Pie ──
    doc.font('Helvetica').fontSize(9).fillColor(SUAVE)
        .text('Gracias por confiar en nosotros.', izq, doc.page.height - 90, { width: ancho, align: 'center' });

    doc.end();
}

function nombreMedio(m) {
    return ({
        tpv_online: 'Tarjeta (web)', tarjeta: 'Tarjeta', bizum: 'Bizum',
        efectivo: 'Efectivo', transferencia: 'Transferencia',
    })[m] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : '—');
}
