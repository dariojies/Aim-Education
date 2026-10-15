import PDFDocument from 'pdfkit';

// ─────────────────────────────────────────────────────────────────────────────
// Los reportes de un mes en PDF (ticket #434), con las mismas cuentas que la
// pantalla (reportes.js). Dos versiones:
//  · completo: lo económico (resumen, ingresos, cobros, gastos y previsión) y
//    los alumnos y las clases, para la dirección;
//  · equipo: solo alumnos y clases, sin una sola cifra de dinero, para
//    enseñárselo a los trabajadores.
// ─────────────────────────────────────────────────────────────────────────────

const TINTA = '#1A1A1A';
const SUAVE = '#6B7280';
const LINEA = '#E5E7EB';
const FONDO = '#F5F3EE';
const MORADO = '#5233A8';
const VERDE = '#21B668';
const NARANJA = '#E8742A';

const eur = (n) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const num = (n) => Number(n || 0).toLocaleString('es-ES');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const nombreMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
const mesCorto = (m) => `${CORTO[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const comparado = (a, b) => {
    if (!b) return null;
    const p = Math.round(((a - b) / Math.abs(b)) * 100);
    return `${p > 0 ? '+' : ''}${p} % que el mes anterior`;
};
const MEDIO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', bizum: 'Bizum', transferencia: 'Transferencia', tpv_online: 'Por la web', compensacion: 'Pase Explorador descontado', mixto: 'Varios', otro: 'Otro' };

export function generarReportesPdf(t, salida) {
    const titulo = t.equipo ? 'Alumnos y clases' : 'Reportes del mes';
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: {
        Title: `${titulo} · ${nombreMes(t.mes)}`, Author: t.empresa?.nombre || 'AIM Education',
    } });
    doc.pipe(salida);
    const izq = 50, ancho = doc.page.width - 100, abajo = doc.page.height - 60;
    let y = 50;
    const sitio = (alto) => { if (y + alto > abajo) { doc.addPage(); y = 50; } };

    // ── Cabecera ──
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(20).text(t.empresa?.nombre || 'AIM Education', izq, y);
    doc.font('Helvetica').fontSize(9).fillColor(SUAVE);
    if (t.empresa?.nif) doc.text(t.empresa.nif, izq, doc.y);
    const yFranja = doc.y + 8;
    const degradado = doc.linearGradient(izq, yFranja, izq + ancho, yFranja);
    degradado.stop(0, MORADO).stop(.3, '#FF99D3').stop(.6, '#FFD526').stop(1, VERDE);
    doc.rect(izq, yFranja, ancho, 3).fill(degradado);
    y = yFranja + 18;
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(16).text(titulo, izq, y);
    y = doc.y + 2;
    const sub = `${nombreMes(t.mes).charAt(0).toUpperCase()}${nombreMes(t.mes).slice(1)}${t.enCurso ? ` (hasta el ${t.hasta.slice(8)})` : ''}`;
    doc.font('Helvetica').fontSize(11).fillColor(SUAVE).text(sub, izq, y);
    y = doc.y + 2;
    if (t.equipo) { doc.fontSize(9).text('Versión para el equipo: sin cifras económicas.', izq, y); y = doc.y; }
    y += 14;

    // ── Piezas ──
    function seccion(nombre, nota) {
        sitio(70);
        doc.fillColor(MORADO).font('Helvetica-Bold').fontSize(13).text(nombre, izq, y);
        y = doc.y + 2;
        if (nota) { doc.fillColor(SUAVE).font('Helvetica').fontSize(8.5).text(nota, izq, y, { width: ancho }); y = doc.y; }
        doc.moveTo(izq, y + 4).lineTo(izq + ancho, y + 4).lineWidth(.5).strokeColor(LINEA).stroke();
        y += 12;
    }
    // Recuadros de cifras, tres por fila.
    function cifras(lista) {
        const gap = 10, w = (ancho - gap * 2) / 3, h = 54;
        for (let i = 0; i < lista.length; i += 3) {
            sitio(h + gap);
            lista.slice(i, i + 3).forEach((c, k) => {
                const x = izq + k * (w + gap);
                doc.roundedRect(x, y, w, h, 8).fill(FONDO);
                doc.fillColor(SUAVE).font('Helvetica-Bold').fontSize(7.5).text(c.etiqueta.toUpperCase(), x + 10, y + 8, { width: w - 20, characterSpacing: .4 });
                doc.fillColor(c.color || TINTA).font('Helvetica-Bold').fontSize(15).text(c.valor, x + 10, y + 20, { width: w - 20 });
                if (c.detalle) doc.fillColor(SUAVE).font('Helvetica').fontSize(7.5).text(c.detalle, x + 10, y + 39, { width: w - 20, height: 12, ellipsis: true });
            });
            y += h + gap;
        }
        y += 4;
    }
    // Una tabla: columnas { t, w (proporción), a ('right' para números) }.
    function tabla(cols, filas, { vacio = 'Nada en este mes.', pie } = {}) {
        const total = cols.reduce((s, c) => s + c.w, 0);
        const xs = []; let x = izq;
        for (const c of cols) { xs.push(x); x += (c.w / total) * ancho; }
        const anchoDe = (i) => (cols[i].w / total) * ancho - 8;
        const cabecera = () => {
            doc.fillColor(SUAVE).font('Helvetica-Bold').fontSize(7.5);
            cols.forEach((c, i) => doc.text(c.t.toUpperCase(), xs[i] + 4, y, { width: anchoDe(i), align: c.a || 'left' }));
            y += 13;
            doc.moveTo(izq, y - 3).lineTo(izq + ancho, y - 3).lineWidth(.5).strokeColor(LINEA).stroke();
        };
        sitio(40);
        cabecera();
        if (!filas.length) { doc.fillColor(SUAVE).font('Helvetica').fontSize(9).text(vacio, izq + 4, y); y = doc.y + 10; return; }
        const todas = pie ? [...filas, { pie: true, celdas: pie }] : filas.map(f => ({ celdas: f }));
        todas.forEach((f, n) => {
            const celdas = f.celdas || f;
            if (y + 16 > abajo) { doc.addPage(); y = 50; cabecera(); }
            if (f.pie) doc.moveTo(izq, y - 1).lineTo(izq + ancho, y - 1).lineWidth(.8).strokeColor(TINTA).stroke();
            else if (n % 2) doc.rect(izq, y - 3, ancho, 15).fill(FONDO);
            doc.fillColor(TINTA).font(f.pie ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
            celdas.forEach((v, i) => doc.text(String(v ?? ''), xs[i] + 4, y, { width: anchoDe(i), align: cols[i].a || 'left', height: 11, ellipsis: true }));
            y += 15;
        });
        y += 8;
    }
    // Barras de los doce meses, con el número encima.
    function barras(meses, valores, { color = MORADO, alto = 110 } = {}) {
        sitio(alto + 40);
        const n = meses.length, hueco = ancho / n, w = Math.min(26, hueco - 8);
        const max = Math.max(1, ...valores.filter((_, i) => !meses[i].sinHistorial));
        const base = y + alto + 14;
        doc.moveTo(izq, base).lineTo(izq + ancho, base).lineWidth(.5).strokeColor(LINEA).stroke();
        meses.forEach((m, i) => {
            const x = izq + i * hueco + (hueco - w) / 2;
            if (m.sinHistorial) {
                doc.rect(x, base - 3, w, 3).fill(LINEA);
                doc.fillColor(SUAVE).font('Helvetica').fontSize(7).text('s/d', x - 6, base - 15, { width: w + 12, align: 'center' });
            } else {
                const h = Math.max(2, (valores[i] / max) * alto);
                doc.roundedRect(x, base - h, w, h, 3).fill(color);
                doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(8).text(num(valores[i]), x - 8, base - h - 11, { width: w + 16, align: 'center' });
            }
            doc.fillColor(SUAVE).font('Helvetica').fontSize(7).text(mesCorto(m.mes), x - 8, base + 4, { width: w + 16, align: 'center' });
        });
        y = base + 20;
    }
    function nota(texto) {
        sitio(24);
        doc.fillColor(SUAVE).font('Helvetica').fontSize(8).text(texto, izq, y, { width: ancho });
        y = doc.y + 10;
    }

    // ════════════════ Lo económico (solo la versión completa) ════════════════
    if (!t.equipo) {
        const r = t.resumen;
        seccion('Resumen del mes', 'Ingresos sin IVA (lo que es del club); cobrado con IVA. Comparado con el mes anterior.');
        cifras([
            { etiqueta: 'Ingresos (sin IVA)', valor: eur(r.ingresos), detalle: comparado(r.ingresos, r.anterior.ingresos) },
            { etiqueta: 'Cobrado (con IVA)', valor: eur(r.cobrado), detalle: `${num(r.pagos)} pagos · IVA ${eur(r.iva)}` },
            { etiqueta: 'Gastos', valor: eur(r.gastos.total), detalle: `${num(r.gastos.n)} apuntados` },
            { etiqueta: 'Resultado', valor: eur(r.resultado), color: r.resultado < 0 ? NARANJA : VERDE, detalle: 'ingresos menos gastos' },
            { etiqueta: 'Por cobrar ahora', valor: eur(r.porCobrar.total), detalle: `${num(r.porCobrar.cargos)} cargos de ${num(r.porCobrar.alumnos)} alumnos · con IVA` },
            { etiqueta: 'Devuelto', valor: eur(Math.abs(r.devuelto)), detalle: 'con facturas rectificativas' },
        ]);
        for (const a of r.avisos || []) nota(`· ${a.texto}`);

        seccion('Los últimos doce meses');
        tabla([{ t: 'Mes', w: 2 }, { t: 'Ingresos', w: 2, a: 'right' }, { t: 'Cobrado', w: 2, a: 'right' }, { t: 'Gastos', w: 2, a: 'right' }, { t: 'Resultado', w: 2, a: 'right' }, { t: 'Pagaron', w: 1.3, a: 'right' }],
            r.meses.map(m => [mesCorto(m.mes), eur(m.ingresos), eur(m.cobrado), eur(m.gastos), eur(m.resultado), num(m.alumnos)]));

        const i = t.ingresos;
        seccion('Ingresos por actividad', 'Ventas son el material y los productos; Bonos, los bonos de clases; General, lo que no es de ninguna actividad (matrículas, por ejemplo).');
        tabla([{ t: 'Actividad', w: 3 }, { t: 'Sin IVA', w: 1.6, a: 'right' }, { t: 'Con IVA', w: 1.6, a: 'right' }, { t: 'Alumnos', w: 1.1, a: 'right' }, { t: 'Mes anterior', w: 1.6, a: 'right' }],
            i.porActividad.map(a => [a.actividad, eur(a.ingresos), eur(a.cobrado), num(a.alumnos), eur(a.anterior)]),
            { pie: ['Total', eur(i.ingresos), eur(i.cobrado), num(i.alumnos), eur(i.anterior.ingresos)] });
        tabla([{ t: 'Forma de pago', w: 3 }, { t: 'Cobrado', w: 2, a: 'right' }, { t: 'Pagos', w: 1, a: 'right' }],
            i.porMedio.map(m => [MEDIO[m.medio] || m.medio, eur(m.total), num(m.pagos)]));

        const c = t.cobros;
        seccion('Cobros y deudas', 'Lo pendiente, con IVA y descuentos. Los cargos de meses que aún no han llegado van aparte.');
        cifras([
            { etiqueta: 'Por cobrar ahora', valor: eur(c.ahora.total), detalle: `${num(c.ahora.cargos)} cargos · ${num(c.ahora.alumnos)} alumnos` },
            { etiqueta: 'Atrasado', valor: eur(c.ahora.atrasado), color: c.ahora.atrasado > 0 ? NARANJA : TINTA, detalle: 'de meses anteriores' },
            { etiqueta: 'Cuotas del mes cobradas', valor: c.mesServicio.tasa == null ? '—' : `${String(c.mesServicio.tasa).replace('.', ',')} %`, detalle: `${eur(c.mesServicio.cobrado)} de ${eur(c.mesServicio.debido)}` },
        ]);
        tabla([{ t: 'Antigüedad', w: 3 }, { t: 'Pendiente', w: 2, a: 'right' }],
            [['De este mes', eur(c.antiguedad.este)], ['Del mes anterior', eur(c.antiguedad.uno)], ['De hace 2 o 3 meses', eur(c.antiguedad.tres)],
             ['De hace más de 3 meses', eur(c.antiguedad.mas)], ['De meses que aún no han llegado', eur(c.antiguedad.futuro)]]);
        if (c.deudores.length) {
            tabla([{ t: 'Quién debe más', w: 4 }, { t: 'Cargos', w: 1, a: 'right' }, { t: 'Desde', w: 1.4, a: 'right' }, { t: 'Debe', w: 1.6, a: 'right' }],
                c.deudores.slice(0, 10).map(d => [d.alumno, num(d.cargos), d.desde ? mesCorto(d.desde) : '—', eur(d.total)]));
        }

        const g = t.gastos;
        seccion('Gastos');
        cifras([
            { etiqueta: 'Gastos del mes', valor: eur(g.total), detalle: comparado(g.total, g.anterior.total) },
            { etiqueta: 'Sin pagar', valor: eur(g.sinPagar.total), detalle: `${num(g.sinPagar.n)} gastos` },
            { etiqueta: 'Fijos cada mes', valor: eur(g.recurrentes.total), detalle: `${num(g.recurrentes.n)} recurrentes` },
        ]);
        tabla([{ t: 'Categoría', w: 4 }, { t: 'Gastos', w: 1, a: 'right' }, { t: 'Importe', w: 2, a: 'right' }],
            g.porCategoria.map(x => [x.categoria, num(x.n), eur(x.total)]), { vacio: 'No hay gastos apuntados este mes.' });
        if (g.porDestino.length) tabla([{ t: 'De qué', w: 4 }, { t: 'Gastos', w: 1, a: 'right' }, { t: 'Importe', w: 2, a: 'right' }],
            g.porDestino.map(x => [x.de, num(x.n), eur(x.total)]));

        const p = t.prevision;
        if (p?.meses?.length) {
            seccion(`Previsión de la temporada ${p.temporada}`, 'Sin IVA. Lo previsto es lo que se generaría con las matrículas de hoy, si la gente sigue como ahora.');
            cifras([
                { etiqueta: 'Cobrado', valor: eur(p.cobrado) },
                { etiqueta: 'Pendiente', valor: eur(p.pendiente), detalle: p.pendienteAnterior ? `y ${eur(p.pendienteAnterior)} de antes` : null },
                { etiqueta: 'Estimación al final', valor: eur(p.estimacion), detalle: `incluye ${eur(p.previsto)} previsto` },
            ]);
            tabla([{ t: 'Mes', w: 2 }, { t: 'Cobrado', w: 2, a: 'right' }, { t: 'Pendiente', w: 2, a: 'right' }, { t: 'Previsto', w: 2, a: 'right' }],
                p.meses.map(m => [`${mesCorto(m.mes)}${m.actual ? ' (actual)' : ''}`, m.pasado || m.actual ? eur(m.cobrado) : '—', eur(m.pendiente), m.previsto ? eur(m.previsto) : '—']));
        }
    }

    // ════════════════ Alumnos y clases (las dos versiones) ════════════════
    const a = t.alumnos, pm = t.porMes;
    const ultimo = pm.meses[pm.meses.length - 1];
    seccion(t.equipo ? 'El mes en números' : 'Alumnos y clases', 'Las plazas y la lista de espera son las de hoy.');
    cifras([
        { etiqueta: t.enCurso ? 'Alumnos hoy' : 'Alumnos al acabar el mes', valor: num(ultimo.total), detalle: 'personas distintas en alguna clase' },
        { etiqueta: 'Altas', valor: num(a.altas), color: VERDE, detalle: 'primera clase en el club este mes' },
        { etiqueta: 'Bajas', valor: num(a.bajas), color: a.bajas ? NARANJA : TINTA, detalle: 'dejaron todas sus clases' },
        { etiqueta: 'Ocupación', valor: a.ocupacion == null ? '—' : `${String(a.ocupacion).replace('.', ',')} %`, detalle: `${num(a.ocupadas)} de ${num(a.plazas)} plazas` },
        { etiqueta: 'Grupos llenos', valor: num(a.llenas) },
        { etiqueta: 'En lista de espera', valor: num(a.esperando) },
    ]);

    seccion('Alumnos por mes', pm.desde && pm.meses.some(m => m.sinHistorial)
        ? `Al final de cada mes. «s/d»: sin datos (el historial de altas y bajas empieza el ${pm.desde.split('-').reverse().join('/')}).`
        : 'Alumnos apuntados al final de cada mes.');
    barras(pm.meses, pm.meses.map(m => m.total));
    if (pm.actividades.length) {
        const meses6 = pm.meses.slice(-6);
        tabla([{ t: 'Actividad', w: 3.2 }, ...meses6.map(m => ({ t: mesCorto(m.mes), w: 1, a: 'right' }))],
            pm.actividades.map(x => [x.nombre, ...x.meses.slice(-6).map((v, k) => (meses6[k].sinHistorial ? 's/d' : num(v)))]),
            { pie: ['Total (sin repetir)', ...meses6.map(m => (m.sinHistorial ? 's/d' : num(m.total)))] });
        nota('Quien está en dos grupos de una actividad cuenta una vez en ella; quien hace dos actividades, una vez en cada una (por eso el total es menor que la suma).');
    }

    if (t.distribucion?.length) {
        seccion('Ocupación por actividad', 'Grupos con plazas limitadas, sin las clases individuales.');
        tabla([{ t: 'Actividad', w: 3.2 }, { t: 'Grupos', w: 1, a: 'right' }, { t: 'Plazas', w: 1, a: 'right' }, { t: 'Ocupadas', w: 1.1, a: 'right' }, { t: 'Ocupación', w: 1.2, a: 'right' }, { t: 'Espera', w: 1, a: 'right' }],
            t.distribucion.map(d => [d.nombre, num(d.grupos), num(d.plazas), num(d.ocupadas), d.plazas ? `${Math.round((d.ocupadas / d.plazas) * 100)} %` : '—', num(d.espera)]));
    }

    // ── Pie de cada página ──
    const paginas = doc.bufferedPageRange();
    for (let p = paginas.start; p < paginas.start + paginas.count; p++) {
        doc.switchToPage(p);
        // Por debajo del margen: sin quitarlo, pdfkit abriría otra página.
        const margen = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.fillColor(SUAVE).font('Helvetica').fontSize(7.5).text(
            `${t.empresa?.nombre || 'AIM Education'} · ${titulo} · ${nombreMes(t.mes)} · generado el ${t.generado} · página ${p + 1} de ${paginas.count}`,
            izq, doc.page.height - 40, { width: ancho, align: 'center', lineBreak: false });
        doc.page.margins.bottom = margen;
    }
    doc.end();
}
