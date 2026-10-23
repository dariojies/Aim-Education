// ─────────────────────────────────────────────────────────────────────────────
// Tablas y gráficos de Aim Design: cómo se pintan dentro de su caja.
//
// Tabla: { celdas: [[texto…]…], cabecera, colores… }. Las columnas se reparten
// según lo que ocupa su texto (sin pasarse del ancho de la caja) y el alto sale
// solo, como en los textos (ajustarTabla).
// Gráfico: { clase: columnas | barras | circular | anillo | lineas,
// datos: [{ etiqueta, valor }], colores }.
// ─────────────────────────────────────────────────────────────────────────────
export const COLORES_GRAFICO = ['#5233A8', '#FF5FA2', '#F99B35', '#FFD526', '#21B668', '#00BBF4'];
export const CLASES_GRAFICO = [['columnas', 'Columnas'], ['barras', 'Barras'], ['circular', 'Circular'], ['anillo', 'Anillo'], ['lineas', 'Líneas']];

const letra = (e, negrita, tam) => `${e.cursiva ? 'italic ' : ''}${negrita ? 700 : 400} ${tam}px "${e.fuente || 'Montserrat'}", Montserrat, Arial, sans-serif`;
function partir(ctx, texto, ancho) {
  const lineas = [];
  for (const parrafo of String(texto ?? '').split('\n')) {
    let l = '';
    for (const p of parrafo.split(/(\s+)/)) {
      const prueba = l + p;
      if (l && ctx.measureText(prueba.trimEnd()).width > ancho && p.trim()) { lineas.push(l.trimEnd()); l = p.trimStart(); } else l = prueba;
    }
    lineas.push(l.trimEnd());
  }
  return lineas;
}

// ── Tablas ──
export function disposicionTabla(ctx, e, rellenar = (t) => t) {
  const filas = e.celdas?.length ? e.celdas : [['']];
  const n = Math.max(...filas.map(f => f.length), 1), T = e.tamano || 30, pad = e.margenCelda ?? Math.round(T * 0.5), lh = T * 1.3;
  // El ancho de cada columna: lo que pide su texto más largo, repartido en el de la caja.
  const pide = Array.from({ length: n }, (_, c) => Math.max(T * 2, ...filas.map((f, i) => {
    ctx.font = letra(e, e.cabecera && i === 0, T);
    return Math.max(...String(rellenar(f[c] ?? '')).split('\n').map(l => ctx.measureText(l).width)) + pad * 2;
  })));
  // Lo mínimo de cada columna: su palabra más larga (así no se pisan los textos).
  const minimo = Array.from({ length: n }, (_, c) => Math.min(pide[c], Math.max(T * 2, ...filas.map((f, i) => {
    ctx.font = letra(e, e.cabecera && i === 0, T);
    return Math.max(0, ...String(rellenar(f[c] ?? '')).split(/\s+/).map(p => ctx.measureText(p).width)) + pad * 2;
  }))));
  const total = pide.reduce((a, b) => a + b, 0), totalMin = minimo.reduce((a, b) => a + b, 0);
  let anchos;
  if (e.anchos?.length === n) anchos = e.anchos.map(a => a * e.w);
  else if (total <= e.w) anchos = pide.map(p => (p / total) * e.w);
  else if (totalMin >= e.w) anchos = minimo.map(m => (m / totalMin) * e.w);
  else { const sobra = e.w - totalMin, falta = total - totalMin; anchos = pide.map((p, c) => minimo[c] + (sobra * (p - minimo[c])) / falta); }
  let x = 0;
  const cols = anchos.map(w => { const c = { x, w }; x += w; return c; });
  let y = 0;
  const filasL = filas.map((f, i) => {
    ctx.font = letra(e, e.cabecera && i === 0, T);
    const celdas = cols.map((c, j) => partir(ctx, rellenar(f[j] ?? ''), Math.max(10, c.w - pad * 2)));
    const h = Math.max(1, ...celdas.map(l => l.length)) * lh + pad * 2;
    const r = { y, h, celdas };
    y += h;
    return r;
  });
  return { cols, filas: filasL, alto: y, pad, lh, T };
}
export function pintarTabla(ctx, e, x0, y0, rellenar) {
  const d = disposicionTabla(ctx, e, rellenar);
  const radio = Math.min(e.radio ?? 0, d.alto / 2, e.w / 2);
  ctx.save();
  // La forma de la tabla (con las esquinas redondeadas) recorta las filas.
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x0, y0, e.w, d.alto, radio); else ctx.rect(x0, y0, e.w, d.alto);
  ctx.save(); ctx.clip();
  d.filas.forEach((f, i) => {
    const cab = e.cabecera && i === 0;
    const fondo = cab ? e.fondoCabecera || '#5233A8' : (e.rayas && (i - (e.cabecera ? 1 : 0)) % 2 === 1 ? e.fondoRayas || '#F6F4EF' : e.fondoFilas || 'transparent');
    if (fondo && fondo !== 'transparent') { ctx.fillStyle = fondo; ctx.fillRect(x0, y0 + f.y, e.w, f.h); }
    ctx.font = letra(e, cab || e.negrita, d.T);
    ctx.fillStyle = cab ? e.colorCabecera || '#FFFFFF' : e.color || '#1A1A1A';
    ctx.textBaseline = 'top';
    ctx.textAlign = e.alinear === 'centro' ? 'center' : e.alinear === 'derecha' ? 'right' : 'left';
    d.cols.forEach((c, j) => {
      const lineas = f.celdas[j], alto = lineas.length * d.lh;
      let ty = y0 + f.y + (f.h - alto) / 2 + (d.lh - d.T) / 2;
      const tx = x0 + (e.alinear === 'centro' ? c.x + c.w / 2 : e.alinear === 'derecha' ? c.x + c.w - d.pad : c.x + d.pad);
      // Cada texto, dentro de su celda.
      ctx.save(); ctx.beginPath(); ctx.rect(x0 + c.x, y0 + f.y, c.w, f.h); ctx.clip();
      for (const l of lineas) { ctx.fillText(l, tx, ty); ty += d.lh; }
      ctx.restore();
    });
  });
  ctx.restore();
  // Las rayas entre filas y columnas, y el borde.
  if (e.grosor > 0 && e.borde && e.borde !== 'transparent') {
    ctx.strokeStyle = e.borde; ctx.lineWidth = e.grosor;
    ctx.beginPath();
    d.filas.slice(1).forEach(f => { ctx.moveTo(x0, y0 + f.y); ctx.lineTo(x0 + e.w, y0 + f.y); });
    if (e.lineasColumnas !== false) d.cols.slice(1).forEach(c => { ctx.moveTo(x0 + c.x, y0); ctx.lineTo(x0 + c.x, y0 + d.alto); });
    ctx.stroke();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, e.w, d.alto, radio); else ctx.rect(x0, y0, e.w, d.alto);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Gráficos ──
const formato = (v) => (Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 }));
export function pintarGrafico(ctx, e, x0, y0) {
  const datos = (e.datos || []).filter(d => Number.isFinite(Number(d.valor)));
  if (!datos.length) return;
  const colores = e.colores?.length ? e.colores : COLORES_GRAFICO, col = (i) => colores[i % colores.length];
  const T = e.tamano || 28, texto = e.color || '#1A1A1A', valores = e.valores !== false;
  const max = Math.max(...datos.map(d => Number(d.valor)), 0) || 1;
  ctx.save();
  ctx.textBaseline = 'middle';
  if (e.clase === 'circular' || e.clase === 'anillo') {
    // El círculo a la izquierda y la leyenda a la derecha (o debajo, si es estrecho).
    const ancho = e.w > e.h * 1.25, lado = ancho ? Math.min(e.h, e.w * 0.55) : Math.min(e.w, e.h * 0.62);
    const cx = x0 + (ancho ? lado / 2 : e.w / 2), cy = y0 + (ancho ? e.h / 2 : lado / 2), r = lado / 2 * 0.96;
    const suma = datos.reduce((s, d) => s + Math.max(0, Number(d.valor)), 0) || 1;
    let a = -Math.PI / 2;
    datos.forEach((d, i) => {
      const parte = (Math.max(0, Number(d.valor)) / suma) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a, a + parte); ctx.closePath();
      ctx.fillStyle = col(i); ctx.fill();
      if (e.clase !== 'anillo') { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1, r * 0.015); ctx.stroke(); }
      a += parte;
    });
    if (e.clase === 'anillo') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = texto; ctx.textAlign = 'center'; ctx.font = letra(e, true, T * 1.4);
      ctx.fillText(formato(suma), cx, cy);
    }
    // La leyenda.
    ctx.font = letra(e, false, T); ctx.textAlign = 'left';
    const lx = ancho ? x0 + lado + T : x0, ly0 = ancho ? y0 + (e.h - datos.length * T * 1.6) / 2 : y0 + lado + T * 0.8;
    datos.forEach((d, i) => {
      const ly = ly0 + i * T * 1.6 + T * 0.8;
      ctx.fillStyle = col(i); ctx.fillRect(lx, ly - T * 0.4, T * 0.8, T * 0.8);
      ctx.fillStyle = texto;
      const pct = Math.round((Math.max(0, Number(d.valor)) / suma) * 100);
      ctx.fillText(`${d.etiqueta}${valores ? ` · ${formato(d.valor)} (${pct} %)` : ''}`, lx + T * 1.2, ly, Math.max(10, x0 + e.w - lx - T * 1.2));
    });
  } else if (e.clase === 'barras') {
    ctx.font = letra(e, false, T);
    const izq = Math.min(e.w * 0.4, Math.max(...datos.map(d => ctx.measureText(String(d.etiqueta)).width)) + T * 0.8);
    const fila = e.h / datos.length, alto = fila * 0.62, hueco = valores ? ctx.measureText(formato(max)).width + T * 0.8 : 0;
    const largo = Math.max(10, e.w - izq - hueco);
    datos.forEach((d, i) => {
      const y = y0 + i * fila + (fila - alto) / 2, w = (Math.max(0, Number(d.valor)) / max) * largo;
      ctx.fillStyle = col(i); roundRect(ctx, x0 + izq, y, w, alto, Math.min(alto / 2, T * 0.3)); ctx.fill();
      ctx.fillStyle = texto; ctx.textAlign = 'right'; ctx.fillText(String(d.etiqueta), x0 + izq - T * 0.4, y + alto / 2);
      if (valores) { ctx.textAlign = 'left'; ctx.font = letra(e, true, T); ctx.fillText(formato(d.valor), x0 + izq + w + T * 0.3, y + alto / 2); ctx.font = letra(e, false, T); }
    });
  } else {
    // Columnas y líneas: los nombres debajo y los valores encima.
    const abajo = T * 1.8, arriba = valores ? T * 1.6 : T * 0.4, alto = Math.max(10, e.h - abajo - arriba), base = y0 + arriba + alto;
    const paso = e.w / datos.length;
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = Math.max(1, T * 0.05);
    ctx.beginPath(); ctx.moveTo(x0, base); ctx.lineTo(x0 + e.w, base); ctx.stroke();
    const punto = (d, i) => ({ x: x0 + paso * i + paso / 2, y: base - (Math.max(0, Number(d.valor)) / max) * alto });
    if (e.clase === 'lineas') {
      ctx.strokeStyle = col(0); ctx.lineWidth = Math.max(2, T * 0.18); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); datos.forEach((d, i) => { const p = punto(d, i); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.stroke();
      datos.forEach((d, i) => { const p = punto(d, i); ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(p.x, p.y, T * 0.32, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = col(0); ctx.lineWidth = Math.max(2, T * 0.12); ctx.stroke(); });
    } else {
      const ancho = paso * 0.62;
      datos.forEach((d, i) => { const p = punto(d, i); ctx.fillStyle = col(i); roundRect(ctx, p.x - ancho / 2, p.y, ancho, base - p.y, Math.min(ancho / 2, T * 0.3), true); ctx.fill(); });
    }
    ctx.textAlign = 'center';
    datos.forEach((d, i) => {
      const p = punto(d, i);
      ctx.fillStyle = texto; ctx.font = letra(e, false, T);
      ctx.fillText(String(d.etiqueta), p.x, base + abajo / 2, paso * 0.95);
      if (valores) { ctx.font = letra(e, true, T); ctx.fillText(formato(d.valor), p.x, p.y - T * (e.clase === 'lineas' ? 0.95 : 0.7)); }
    });
  }
  ctx.restore();
}
// Un rectángulo redondeado (solo arriba, para las columnas).
function roundRect(ctx, x, y, w, h, r, soloArriba = false) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  if (soloArriba) { ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
  else { ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h); ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr); }
  ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y); ctx.closePath();
}
