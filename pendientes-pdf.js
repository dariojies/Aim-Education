import PDFDocument from 'pdfkit';

// ─────────────────────────────────────────────────────────────────────────────
// Los cargos pendientes de cobro en PDF (ticket #231). Lo mismo que se ve en
// pantalla —con el mes elegido y el buscador aplicado—, para imprimirlo o
// mandarlo. Si el mes es futuro, además va la previsión: lo que se cobrará ese
// mes y todavía no está generado (no es deuda).
// ─────────────────────────────────────────────────────────────────────────────

const TINTA = '#1A1A1A';
const SUAVE = '#6B7280';
const LINEA = '#E5E7EB';
const eur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesLargo = (iso) => {
    if (!iso) return '';
    const [y, m] = String(iso).slice(0, 7).split('-');
    return `${MESES[Number(m) - 1]} de ${y}`;
};
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

export function generarPendientesPdf(t, salida) {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: {
        Title: `Cargos pendientes · ${t.periodo}`, Author: 'AIM Education',
    } });
    doc.pipe(salida);
    const izq = 50, ancho = doc.page.width - 100;

    // Cabecera, la de siempre.
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(18).text('AIM Education', izq, 50);
    doc.font('Helvetica').fontSize(8.5).fillColor(SUAVE);
    for (const l of [[t.empresa?.nombre, t.empresa?.nif].filter(Boolean).join(' · '), [t.empresa?.direccion, t.empresa?.cp].filter(Boolean).join(', ')]) {
        if (l) doc.text(l, izq, doc.y);
    }
    const yFranja = doc.y + 8;
    const grad = doc.linearGradient(izq, yFranja, izq + ancho, yFranja);
    grad.stop(0, '#5233A8').stop(.3, '#FF99D3').stop(.6, '#FFD526').stop(1, '#21B668');
    doc.rect(izq, yFranja, ancho, 3).fill(grad);

    let y = yFranja + 18;
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(14).text('Cargos pendientes de cobro', izq, y);
    y = doc.y + 2;
    doc.font('Helvetica').fontSize(10.5).fillColor(SUAVE).text(t.periodo, izq, y, { width: ancho });
    if (t.filtros?.length) {
        doc.fontSize(9).text(`Filtros: ${t.filtros.join(' · ')}`, izq, doc.y + 2, { width: ancho });
    }
    y = doc.y + 12;

    // Totales de un vistazo.
    const cajas = [
        ['Cargos pendientes', String(t.cargos.length)],
        ['Base pendiente', eur(t.totalPendiente)],
        ['Alumnos', String(new Set(t.cargos.map(c => c.alumno)).size)],
        ...(t.prevision.length ? [['En previsión', `${t.prevision.length} · ${eur(t.totalPrevision)}`]] : []),
    ];
    const w = (ancho - 10 * (cajas.length - 1)) / cajas.length;
    cajas.forEach(([tt, v], i) => {
        const x = izq + i * (w + 10);
        doc.rect(x, y, w, 44).fill('#F5F3EF');
        doc.fillColor(SUAVE).font('Helvetica').fontSize(7.5).text(tt.toUpperCase(), x + 9, y + 8, { width: w - 18 });
        doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(12.5).text(v, x + 9, y + 24, { width: w - 18, lineBreak: false });
    });
    y += 58;

    const cols = [
        { t: 'Alumno', x: izq, w: 135 },
        { t: 'Concepto', x: izq + 140, w: 120 },
        { t: 'Mes', x: izq + 265, w: 78 },
        { t: 'Precio', x: izq + 347, w: 52, der: true },
        { t: 'Dto.', x: izq + 403, w: 28, der: true },
        { t: 'Base', x: izq + 435, w: 60, der: true },
    ];
    const tabla = (titulo, filas, nota) => {
        if (!filas.length) return;
        if (y > doc.page.height - 140) { doc.addPage(); y = 50; }
        doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(10.5).text(`${titulo} (${filas.length})`, izq, y);
        y = doc.y + (nota ? 2 : 6);
        if (nota) {
            doc.font('Helvetica').fontSize(7.5).fillColor(SUAVE).text(nota, izq, y, { width: ancho });
            y = doc.y + 6;
        }
        const cabecera = () => {
            doc.font('Helvetica-Bold').fontSize(7).fillColor(SUAVE);
            for (const c of cols) doc.text(c.t.toUpperCase(), c.x, y, { width: c.w, align: c.der ? 'right' : 'left' });
            y += 10;
            doc.moveTo(izq, y).lineTo(izq + ancho, y).strokeColor(LINEA).stroke();
            y += 5;
        };
        cabecera();
        let total = 0;
        for (const f of filas) {
            if (y > doc.page.height - 80) { doc.addPage(); y = 50; cabecera(); }
            const alto = Math.max(11, ...cols.map((c, i) => doc.font('Helvetica').fontSize(8)
                .heightOfString(String([f.alumno, f.descripcion, f.mes, '', '', ''][i] ?? ''), { width: c.w })));
            doc.font('Helvetica').fontSize(8).fillColor(TINTA);
            doc.text(f.alumno, cols[0].x, y, { width: cols[0].w });
            doc.text(f.descripcion, cols[1].x, y, { width: cols[1].w });
            doc.fillColor(SUAVE).text(f.mes ? cap(mesLargo(f.mes)) : '', cols[2].x, y, { width: cols[2].w });
            doc.fillColor(TINTA).text(eur(f.precio), cols[3].x, y, { width: cols[3].w, align: 'right', lineBreak: false });
            doc.text(f.descuentoPct ? `${f.descuentoPct}%` : '', cols[4].x, y, { width: cols[4].w, align: 'right', lineBreak: false });
            doc.font('Helvetica-Bold').text(eur(f.base), cols[5].x, y, { width: cols[5].w, align: 'right', lineBreak: false });
            total += Number(f.base || 0);
            y += alto + 4;
            doc.moveTo(izq, y - 2).lineTo(izq + ancho, y - 2).strokeColor('#F3F3F3').stroke();
        }
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TINTA)
            .text(`Total ${titulo.toLowerCase()}: ${eur(total)}`, izq, y + 2, { width: ancho, align: 'right' });
        y = doc.y + 14;
    };

    tabla('Cargos pendientes', t.cargos);
    tabla('Campamento', t.campamento, 'Los del campamento de verano, que van por su cuenta y no dependen del mes elegido.');
    tabla('Previsión', t.prevision, 'Lo que se cobrará ese mes y aún no está generado: todavía no es deuda.');

    if (!t.cargos.length && !t.campamento.length && !t.prevision.length) {
        doc.font('Helvetica').fontSize(10).fillColor(SUAVE).text('No hay ningún cargo pendiente con estos filtros.', izq, y);
    }

    // Pie con la fecha, en todas las páginas.
    const rango = doc.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i++) {
        doc.switchToPage(i);
        const margen = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font('Helvetica').fontSize(7).fillColor(SUAVE)
            .text(`Cargos pendientes de cobro · Generado el ${t.generadoEl}`, izq, doc.page.height - 48, { width: ancho - 60 })
            .text(`Pág. ${i + 1} de ${rango.count}`, izq + ancho - 60, doc.page.height - 48, { width: 60, align: 'right' });
        doc.page.margins.bottom = margen;
    }
    doc.end();
}
