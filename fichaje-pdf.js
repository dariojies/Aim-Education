import PDFDocument from 'pdfkit';

// ─────────────────────────────────────────────────────────────────────────────
// Documentos del registro de jornada (ticket #252).
//
// · Informe por trabajador y periodo: lo que se enseña a la Inspección o se le da
//   al trabajador. Todos los días con sus fichajes, lo anulado y lo corregido (con
//   quién, cuándo y por qué), el cómputo mensual y las solicitudes de corrección.
//   Al pie, la huella de la cadena de auditoría con la que se puede comprobar que
//   nada se ha tocado desde entonces.
// · Resumen mensual de horas (tiempo parcial): ordinarias y complementarias del
//   mes, semana a semana, con la constancia de su entrega.
// ─────────────────────────────────────────────────────────────────────────────

const TINTA = '#1A1A1A';
const SUAVE = '#6B7280';
const LINEA = '#E5E7EB';
const VERDE = '#21B668';
const NARANJA = '#E07A00';
const ROJO = '#C62828';

const TZ = 'Europe/Madrid';
const hora = (ts) => new Date(ts).toLocaleTimeString('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const fechaHora = (ts) => ts ? new Date(ts).toLocaleString('es-ES', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const diaLargo = (iso) => new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const diaCorto = (iso) => new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
const horas = (n) => n == null ? '—' : `${Number(n).toFixed(2).replace('.', ',')} h`;
const hm = (seg) => {
    seg = Math.max(0, Math.round(seg || 0));
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
    return `${h} h ${String(m).padStart(2, '0')} min`;
};
const ETQ = { entrada: 'Entrada', salida: 'Salida', pausa_inicio: 'Inicio pausa', pausa_fin: 'Fin pausa' };
const ORIGEN = { web: 'fichaje', correccion: 'corrección', incidencia: 'incidencia' };
const ESTADO = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', cancelada: 'Retirada' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (mes) => { const [y, m] = String(mes).split('-').map(Number); return `${MESES[m - 1]} de ${y}`; };
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const textoJornada = (c) => !c ? 'Sin indicar'
    : `${c.jornada === 'parcial' ? 'Tiempo parcial' : 'Completa'}${c.horasSemana != null ? ` · ${String(c.horasSemana).replace('.', ',')} h/semana` : ''}`;

// La cabecera de siempre (la de las facturas y los gastos).
function cabecera(doc, empresa, titulo, subtitulo) {
    const izq = 50, ancho = doc.page.width - 100;
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(18).text('AIM Education', izq, 50);
    doc.font('Helvetica').fontSize(8.5).fillColor(SUAVE);
    for (const l of [[empresa?.nombre, empresa?.nif].filter(Boolean).join(' · '), [empresa?.direccion, empresa?.cp].filter(Boolean).join(', ')]) {
        if (l) doc.text(l, izq, doc.y);
    }
    const yFranja = doc.y + 8;
    const degradado = doc.linearGradient(izq, yFranja, izq + ancho, yFranja);
    degradado.stop(0, '#5233A8').stop(.3, '#FF99D3').stop(.6, '#FFD526').stop(1, '#21B668');
    doc.rect(izq, yFranja, ancho, 3).fill(degradado);
    let y = yFranja + 18;
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(14).text(titulo, izq, y);
    y = doc.y + 2;
    doc.font('Helvetica').fontSize(10.5).fillColor(SUAVE).text(subtitulo, izq, y, { width: ancho });
    return doc.y + 12;
}

// Cajas de totales. El valor se encoge si no cabe en una línea, y la caja crece
// si la etiqueta ocupa dos: nada se monta encima de nada.
function cajas(doc, y, lista) {
    const izq = 50, ancho = doc.page.width - 100;
    const w = (ancho - 10 * (lista.length - 1)) / lista.length;
    const interior = w - 18;
    const medidas = lista.map(([t, v]) => {
        const altoEtq = doc.font('Helvetica').fontSize(7.5).heightOfString(t.toUpperCase(), { width: interior });
        let tam = 12.5;
        doc.font('Helvetica-Bold');
        while (tam > 7 && doc.fontSize(tam).widthOfString(String(v)) > interior) tam -= 0.5;
        return { altoEtq, tam };
    });
    const altoEtqMax = Math.max(...medidas.map(m => m.altoEtq));
    const alto = 8 + altoEtqMax + 4 + 16 + 6;
    lista.forEach(([t, v, c], i) => {
        const x = izq + i * (w + 10);
        doc.rect(x, y, w, alto).fill('#F5F3EF');
        doc.fillColor(SUAVE).font('Helvetica').fontSize(7.5).text(t.toUpperCase(), x + 9, y + 8, { width: interior });
        doc.fillColor(c || TINTA).font('Helvetica-Bold').fontSize(medidas[i].tam)
            .text(String(v), x + 9, y + 8 + altoEtqMax + 4 + (12.5 - medidas[i].tam) / 2, { width: interior, lineBreak: false });
    });
    return y + alto + 12;
}

function titulo(doc, y, texto) {
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(10.5).text(texto, 50, y);
    return doc.y + 6;
}

// Tabla sencilla: nunca parte una fila entre dos páginas y repite la cabecera.
function tabla(doc, y, cols, filas, { tam = 8, alAbrirPagina } = {}) {
    const izq = 50, ancho = doc.page.width - 100, abajo = doc.page.height - 70;
    const cab = () => {
        doc.font('Helvetica-Bold').fontSize(7).fillColor(SUAVE);
        for (const c of cols) doc.text(c.t.toUpperCase(), c.x, y, { width: c.w, align: c.der ? 'right' : 'left' });
        y += 10;
        doc.moveTo(izq, y).lineTo(izq + ancho, y).strokeColor(LINEA).stroke();
        y += 5;
    };
    cab();
    // Alto de las celdas con la misma letra con la que se escriben (la negrita es
    // más ancha y puede partir la línea).
    const altoCeldas = (f) => Math.max(11, ...cols.map((c, i) => doc.font(f.estilos?.[i]?.negrita ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(tam).heightOfString(String(f.celdas[i] ?? ''), { width: c.w })));
    for (const f of filas) {
        const alto = altoCeldas(f)
            + (f.notas || []).reduce((s, n) => s + doc.font('Helvetica').fontSize(tam - 1).heightOfString(n, { width: ancho - (cols[1]?.x - izq || 0) }) + 1, 0);
        if (y + alto > abajo) {
            doc.addPage();
            y = 50;
            alAbrirPagina?.();
            cab();
        }
        cols.forEach((c, i) => {
            const v = String(f.celdas[i] ?? '');
            const estilo = f.estilos?.[i] || {};
            doc.font(estilo.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(tam).fillColor(estilo.color || TINTA)
                .text(v, c.x, y, { width: c.w, align: c.der ? 'right' : 'left', strike: !!estilo.tachado });
        });
        let yy = y + altoCeldas(f);
        for (const n of f.notas || []) {
            const x = cols[1]?.x ?? izq;
            doc.font('Helvetica').fontSize(tam - 1).fillColor(SUAVE).text(n, x, yy, { width: izq + ancho - x });
            yy = doc.y + 1;
        }
        y = yy + 4;
        doc.moveTo(izq, y - 2).lineTo(izq + ancho, y - 2).strokeColor('#F1F1F1').stroke();
    }
    return y + 6;
}

// Pie en todas las páginas (con "página X de Y"): se escribe al final.
function pies(doc, texto) {
    const rango = doc.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i++) {
        doc.switchToPage(i);
        const izq = 50, ancho = doc.page.width - 100;
        const margen = doc.page.margins.bottom;
        doc.page.margins.bottom = 0; // si no, escribir en el margen abre otra página
        doc.font('Helvetica').fontSize(7).fillColor(SUAVE)
            .text(texto, izq, doc.page.height - 48, { width: ancho - 60, lineBreak: true })
            .text(`Pág. ${i + 1} de ${rango.count}`, izq + ancho - 60, doc.page.height - 48, { width: 60, align: 'right' });
        doc.page.margins.bottom = margen;
    }
}

// ── Informe por trabajador y periodo ─────────────────────────────────────────
export function generarInformeJornadaPdf(t, salida) {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: {
        Title: `Registro de jornada · ${t.trabajador} · ${t.periodo}`, Author: 'AIM Education',
    } });
    doc.pipe(salida);
    const izq = 50;

    let y = cabecera(doc, t.empresa, 'Registro de jornada', `${t.trabajador} · ${t.periodo}`);
    const diasConRegistro = t.dias.filter(d => d.apuntes.some(a => !a.anulado)).length;
    const nCorr = t.dias.reduce((s, d) => s + d.apuntes.filter(a => a.origen !== 'web' || a.anulado).length, 0);
    y = cajas(doc, y, [
        ['Tiempo trabajado', hm(t.totalSeg)],
        ['Días con registro', String(diasConRegistro)],
        ['Jornada', !t.contrato ? 'Sin indicar' : `${t.contrato.jornada === 'parcial' ? 'Parcial' : 'Completa'}${t.contrato.horasSemana != null ? ` · ${String(t.contrato.horasSemana).replace('.', ',')} h/sem` : ''}`],
        ['Correcciones y anulaciones', String(nCorr), nCorr ? NARANJA : SUAVE],
    ]);

    // Cómputo mensual (meses del periodo, completos).
    if (t.meses?.length) {
        y = titulo(doc, y, 'Cómputo mensual');
        const parcial = t.contrato?.jornada === 'parcial';
        const cols = [
            { t: 'Mes', x: izq, w: 165 },
            { t: 'Contratadas', x: izq + 170, w: 75, der: true },
            { t: 'Trabajadas', x: izq + 250, w: 75, der: true },
            { t: 'Ordinarias', x: izq + 330, w: 70, der: true },
            { t: parcial ? 'Complementarias' : 'Exceso de jornada', x: izq + 405, w: 90, der: true },
        ];
        y = tabla(doc, y, cols, t.meses.map(m => ({
            celdas: [cap(nombreMes(m.mes)) + (m.estado === 'en_curso' ? ' (en curso)' : ''), horas(m.contratadas), horas(m.trabajadas),
                horas(m.ordinarias), m.contratadas == null ? '—' : horas(m.complementarias)],
            estilos: [{ negrita: true }, {}, { negrita: true }, {}, { color: m.complementarias > 0 ? NARANJA : TINTA }],
        })), { tam: 8.5 });
        if (t.meses.some(m => m.contratadas == null)) {
            doc.font('Helvetica').fontSize(7.5).fillColor(SUAVE).text('Sin horas contratadas indicadas no se puede separar lo ordinario de lo que excede la jornada.', izq, y - 4);
            y = doc.y + 8;
        }
    }

    // Detalle diario.
    y = titulo(doc, y, 'Detalle diario');
    doc.font('Helvetica').fontSize(7.5).fillColor(SUAVE)
        .text('Horas en hora oficial de Madrid, puestas por el servidor. Lo marcado como [anulado] no cuenta, pero se conserva. (c) = añadido por corrección o incidencia.', izq, y, { width: doc.page.width - 100 });
    y = doc.y + 6;
    const colsDia = [
        { t: 'Día', x: izq, w: 78 },
        { t: 'Fichajes', x: izq + 82, w: 340 },
        { t: 'Trabajado', x: izq + 425, w: 70, der: true },
    ];
    const filasDia = [...t.dias].sort((a, b) => a.dia.localeCompare(b.dia)).map(d => {
        const notas = [];
        for (const a of d.apuntes) {
            if (a.origen !== 'web' && !a.anulado) {
                notas.push(`(c) ${ETQ[a.tipo]} ${hora(a.ts)}: ${ORIGEN[a.origen] || 'corrección'}${a.creadoPor ? ` propuesta por ${a.creadoPor}` : ''}${a.aprobadoPor ? `, aprobada por ${a.aprobadoPor}` : ''}${a.motivo ? ` — «${a.motivo}»` : ''}${a.corrigeId ? ` (sustituye al nº ${a.corrigeId})` : ''}`);
            }
            if (a.anulado) {
                notas.push(`Anulado ${ETQ[a.tipo].toLowerCase()} ${hora(a.ts)} (nº ${a.id}) el ${fechaHora(a.anulacion?.at)}${a.anulacion?.por ? `, propuesto por ${a.anulacion.por}` : ''}${a.anulacion?.motivo ? ` — «${a.anulacion.motivo}»` : ''}`);
            }
        }
        // Los apuntes en una línea; los anulados entre corchetes (pdfkit no tacha
        // un trozo de una línea, así que se marcan así y se explican debajo).
        const linea = d.apuntes.map(a => {
            const txt = `${ETQ[a.tipo]} ${hora(a.ts)}${a.origen !== 'web' ? ' (c)' : ''}`;
            return a.anulado ? `[anulado: ${txt}]` : txt;
        }).join('  ·  ');
        return { celdas: [diaLargo(d.dia), linea, hm(d.segundos)], estilos: [{ negrita: true }, {}, { negrita: true }], notas };
    });
    if (!filasDia.length) {
        doc.font('Helvetica').fontSize(9).fillColor(SUAVE).text('Sin fichajes en este periodo.', izq, y);
        y = doc.y + 10;
    } else {
        y = tabla(doc, y, colsDia, filasDia);
    }
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TINTA).text(`TOTAL TRABAJADO  ${hm(t.totalSeg)}`, izq, y, { width: doc.page.width - 100, align: 'right' });
    y = doc.y + 14;

    // Solicitudes de corrección del periodo.
    if (t.solicitudes?.length) {
        if (y > doc.page.height - 160) { doc.addPage(); y = 50; }
        y = titulo(doc, y, 'Solicitudes de corrección');
        const cols = [
            { t: 'Nº', x: izq, w: 22 },
            { t: 'Qué se pidió', x: izq + 25, w: 175 },
            { t: 'Pedida', x: izq + 203, w: 110 },
            { t: 'Resolución', x: izq + 316, w: 179 },
        ];
        y = tabla(doc, y, cols, t.solicitudes.map(s => ({
            celdas: [
                s.id,
                `${s.descripcion}${s.origen === 'incidencia' ? ' (incidencia)' : ''}\nMotivo: ${s.motivo}`,
                `${s.iniciadoPor === 'empresa' ? 'Por la empresa' : 'Por el trabajador'}: ${s.solicitadoPor || '—'}\n${fechaHora(s.creadaAt)}`,
                `${ESTADO[s.estado] || s.estado}${s.resueltoPor ? ` por ${s.resueltoPor}` : ''}${s.resueltoAt ? `\n${fechaHora(s.resueltoAt)}` : ''}${s.respuesta ? `\n«${s.respuesta}»` : ''}`,
            ],
            estilos: [{}, {}, {}, { color: s.estado === 'aprobada' ? VERDE : s.estado === 'rechazada' ? ROJO : s.estado === 'pendiente' ? NARANJA : SUAVE }],
        })), { tam: 7.5 });
    }

    // Integridad.
    if (y > doc.page.height - 130) { doc.addPage(); y = 50; }
    y = titulo(doc, y, 'Integridad del registro');
    const ok = t.integridad?.ok;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ok ? VERDE : ROJO)
        .text(ok ? 'Comprobado: la cadena de auditoría está íntegra y cada fichaje coincide con su apunte original.'
            : 'ATENCIÓN: la comprobación de la cadena de auditoría ha encontrado diferencias.', izq, y, { width: doc.page.width - 100 });
    doc.font('Helvetica').fontSize(7.5).fillColor(SUAVE)
        .text(`Cada fichaje, corrección, anulación y cambio queda anotado con una huella SHA-256 encadenada a la anterior; modificar cualquier apunte antiguo rompería la cadena. `
            + `Apuntes en la cadena: ${t.integridad?.eventos ?? '—'}. Huella final en el momento de generar este informe:`, izq, doc.y + 3, { width: doc.page.width - 100 });
    doc.font('Courier').fontSize(7.5).fillColor(TINTA).text(t.integridad?.cabeza || '—', izq, doc.y + 2);

    pies(doc, `Registro diario de jornada (art. 34.9 del Estatuto de los Trabajadores) · ${t.trabajador} · Generado el ${fechaHora(t.generadoAt)}${t.generadoPor ? ` por ${t.generadoPor}` : ''}. Se conserva durante cuatro años.`);
    doc.end();
}

// ── Resumen mensual de horas (tiempo parcial) ────────────────────────────────
export function generarResumenMensualPdf(r, salida) {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: {
        Title: `Resumen de horas · ${r.trabajador} · ${nombreMes(r.mes)}`, Author: 'AIM Education',
    } });
    doc.pipe(salida);
    const izq = 50, ancho = doc.page.width - 100;
    const parcial = r.jornada === 'parcial';

    let y = cabecera(doc, r.empresa, parcial ? 'Resumen mensual de horas · tiempo parcial' : 'Resumen mensual de horas',
        `${r.trabajador} · ${cap(nombreMes(r.mes))}${r.version > 1 ? ` · versión ${r.version} (sustituye a la anterior)` : ''}`);
    y = cajas(doc, y, [
        ['Horas ordinarias', horas(r.ordinarias)],
        [parcial ? 'Complementarias' : 'Exceso de jornada', horas(r.complementarias), r.complementarias > 0 ? NARANJA : TINTA],
        ['Total trabajado', horas(r.trabajadas), VERDE],
        ['Contratadas en el mes', horas(r.contratadas)],
    ]);
    doc.font('Helvetica').fontSize(8).fillColor(SUAVE).text(
        `Jornada: ${textoJornada(r)}. Las horas contratadas se reparten ${r.detalle?.repartoBase === 'horario' ? 'según su horario laboral' : 'de lunes a viernes'}; `
        + `en cada semana, lo trabajado por encima de lo contratado se cuenta como ${parcial ? 'horas complementarias' : 'exceso sobre la jornada'}.`,
        izq, y - 4, { width: ancho });
    y = doc.y + 12;

    y = titulo(doc, y, 'Por semanas');
    y = tabla(doc, y, [
        { t: 'Semana', x: izq, w: 150 },
        { t: 'Contratadas', x: izq + 160, w: 100, der: true },
        { t: 'Trabajadas', x: izq + 270, w: 100, der: true },
        { t: parcial ? 'Complementarias' : 'Exceso', x: izq + 380, w: 115, der: true },
    ], (r.detalle?.semanas || []).map(s => ({
        celdas: [`${diaCorto(s.desde)} – ${diaCorto(s.hasta)}`, horas(s.contratadas), horas(s.trabajadas), horas(s.exceso)],
        estilos: [{ negrita: true }, {}, { negrita: true }, { color: s.exceso > 0 ? NARANJA : TINTA }],
    })), { tam: 8.5 });

    const dias = (r.detalle?.dias || []).filter(d => d.trabajadas > 0);
    if (dias.length) {
        y = titulo(doc, y, 'Horas trabajadas por día');
        // En dos columnas para que quepa en una hoja.
        const mitad = Math.ceil(dias.length / 2);
        const yIni = y;
        let yMax = y;
        [dias.slice(0, mitad), dias.slice(mitad)].forEach((lista, col) => {
            let yy = yIni;
            const x = izq + col * (ancho / 2);
            for (const d of lista) {
                if (yy > doc.page.height - 90) break;
                doc.font('Helvetica').fontSize(8.5).fillColor(TINTA).text(diaLargo(d.dia), x, yy, { width: 140 });
                doc.font('Helvetica-Bold').text(horas(d.trabajadas), x + 140, yy, { width: 80, align: 'right' });
                yy += 13;
            }
            yMax = Math.max(yMax, yy);
        });
        y = yMax + 10;
    }

    if (y > doc.page.height - 150) { doc.addPage(); y = 50; }
    y = titulo(doc, y, 'Constancia de la entrega');
    const lineas = [
        `Generado el ${fechaHora(r.generadoAt)}.`,
        r.enviadoAt ? `Enviado por correo a ${r.enviadoA} el ${fechaHora(r.enviadoAt)}.` : 'Pendiente de envío por correo.',
        r.confirmadoAt ? `Recibido y confirmado por el trabajador desde su cuenta el ${fechaHora(r.confirmadoAt)}${r.confirmadoIp ? ` (IP ${r.confirmadoIp})` : ''}.`
            : 'Pendiente de que el trabajador confirme que lo ha recibido.',
    ];
    doc.font('Helvetica').fontSize(8.5).fillColor(TINTA);
    for (const l of lineas) { doc.text(l, izq, y, { width: ancho }); y = doc.y + 2; }
    doc.font('Helvetica').fontSize(7.5).fillColor(SUAVE).text('Huella SHA-256 de este resumen:', izq, y + 4);
    doc.font('Courier').fontSize(7.5).fillColor(TINTA).text(r.hash, izq, doc.y + 1);

    pies(doc, `Resumen de horas ordinarias y complementarias (art. 12.4.c del Estatuto de los Trabajadores) · ${r.trabajador} · ${cap(nombreMes(r.mes))}`);
    doc.end();
}
