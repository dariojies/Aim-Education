import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ─────────────────────────────────────────────────────────────────────────────
// Diploma de aprovechamiento de un curso del aula virtual (ticket #455): A4
// apaisado, con el logo, el nombre del alumno, el curso y la fecha en que lo
// terminó. Lleva un código propio (se calcula, no se
// guarda): el mismo alumno y el mismo curso dan siempre el mismo código.
// ─────────────────────────────────────────────────────────────────────────────

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LOGO = path.join(DIR, 'src', 'brand', 'Aim_Horizontal.png');
const COLORES = ['#5233A8', '#FF5FA2', '#F99B35', '#FFD526', '#21B668', '#00BBF4'];
const TINTA = '#1A1A1A';
const SUAVE = '#6B7280';

const fechaLarga = (f) => new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });

// { alumno, curso, profesor, lecciones, terminado (fecha), codigo, empresa }
export function generarDiplomaPdf(d, salida) {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `Diploma · ${d.curso}`, Author: d.empresa?.nombre || 'AIM Education' } });
    doc.pipe(salida);
    const W = doc.page.width, H = doc.page.height;

    // Marco: una franja de los colores de la marca arriba y abajo, y un filete.
    const franja = (y) => COLORES.forEach((c, i) => doc.rect((W / COLORES.length) * i, y, W / COLORES.length + 1, 10).fill(c));
    franja(0); franja(H - 10);
    doc.lineWidth(1.2).strokeColor('#D9D4EC').roundedRect(28, 34, W - 56, H - 68, 14).stroke();

    if (fs.existsSync(LOGO)) doc.image(LOGO, W / 2 - 80, 62, { width: 160 });

    const centro = (texto, y, { font = 'Helvetica', size = 14, color = TINTA, gap = 0 } = {}) => {
        doc.font(font).fontSize(size).fillColor(color).text(texto, 70, y, { width: W - 140, align: 'center', characterSpacing: gap });
        return doc.y;
    };
    let y = 150;
    y = centro('DIPLOMA DE APROVECHAMIENTO', y, { font: 'Helvetica-Bold', size: 30, color: '#5233A8', gap: 2 }) + 18;
    y = centro(`${d.empresa?.nombre || 'AIM Education'} certifica que`, y, { size: 14, color: SUAVE }) + 14;
    y = centro(d.alumno, y, { font: 'Helvetica-Bold', size: 34 }) + 6;
    doc.lineWidth(1).strokeColor('#E5E7EB').moveTo(W / 2 - 170, y + 4).lineTo(W / 2 + 170, y + 4).stroke();
    y += 22;
    y = centro('ha completado con aprovechamiento el curso', y, { size: 14, color: SUAVE }) + 10;
    y = centro(`«${d.curso}»`, y, { font: 'Helvetica-Bold', size: 22, color: TINTA }) + 10;
    centro(`del aula virtual de AIM Education, superando sus ${d.lecciones} ${d.lecciones === 1 ? 'lección' : 'lecciones'}.`, y, { size: 13, color: SUAVE });

    // Pie: fecha y lugar a un lado; quien lo imparte al otro; el código en medio.
    const pie = H - 118;
    doc.font('Helvetica').fontSize(11).fillColor(SUAVE).text('Algeciras, a', 90, pie, { width: 260 });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(TINTA).text(fechaLarga(d.terminado), 90, pie + 16, { width: 260 });
    if (d.profesor) {
        doc.font('Helvetica').fontSize(11).fillColor(SUAVE).text('Profesor/a del curso', W - 350, pie, { width: 260, align: 'right' });
        doc.font('Helvetica-Bold').fontSize(13).fillColor(TINTA).text(d.profesor, W - 350, pie + 16, { width: 260, align: 'right' });
    }
    doc.font('Helvetica').fontSize(8.5).fillColor(SUAVE)
        .text(`Código del diploma: ${d.codigo} · ${d.empresa?.web || 'www.aimeducation.es'}`, 70, H - 52, { width: W - 140, align: 'center' });
    doc.end();
}
