// ─────────────────────────────────────────────────────────────────────────────
// Formas e iconos de Aim Design. Cada forma se dibuja a la medida de su caja
// (x, y, w, h), así vale igual para una forma rellena (estrella, flecha,
// bocadillo…) que para el marco de una foto (la foto se recorta con ella).
// Los iconos son trazos de 24×24 (los de Material Design, licencia Apache 2.0).
// ─────────────────────────────────────────────────────────────────────────────

export const FIGURAS = [
  { id: 'rect', nombre: 'Rectángulo' }, { id: 'elipse', nombre: 'Círculo' }, { id: 'triangulo', nombre: 'Triángulo' },
  { id: 'rombo', nombre: 'Rombo' }, { id: 'hexagono', nombre: 'Hexágono' }, { id: 'estrella', nombre: 'Estrella' },
  { id: 'destello', nombre: 'Destello' }, { id: 'sello', nombre: 'Sello' }, { id: 'corazon', nombre: 'Corazón' },
  { id: 'flecha', nombre: 'Flecha' }, { id: 'flecha2', nombre: 'Flecha doble' }, { id: 'chevron', nombre: 'Galón' },
  { id: 'bocadillo', nombre: 'Bocadillo' }, { id: 'bocadillo2', nombre: 'Bocadillo redondo' }, { id: 'nube', nombre: 'Nube' },
  { id: 'cinta', nombre: 'Cinta' }, { id: 'cruz', nombre: 'Cruz' }, { id: 'gota', nombre: 'Gota' }, { id: 'arco', nombre: 'Arco' },
];
// Los marcos para fotos: las formas que tienen sentido como recorte.
export const MARCOS = ['rect', 'elipse', 'arco', 'estrella', 'corazon', 'hexagono', 'sello', 'bocadillo2', 'gota', 'rombo'];

// Un polígono de puntos entre 0 y 1, estirado a la caja.
function poligono(ctx, pts, x, y, w, h) {
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * w, y + py * h) : ctx.moveTo(x + px * w, y + py * h)));
  ctx.closePath();
}
// Un polígono regular (o una estrella), ajustado para llenar la caja entera.
const cacheRegular = new Map();
function regular(lados, interior = 1) {
  const clave = `${lados}:${interior}`;
  if (!cacheRegular.has(clave)) {
    const n = interior < 1 ? lados * 2 : lados;
    const pts = Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n, r = interior < 1 && i % 2 ? interior : 1;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), sx = Math.max(...xs) - x0, sy = Math.max(...ys) - y0;
    cacheRegular.set(clave, pts.map(([px, py]) => [(px - x0) / sx, (py - y0) / sy]));
  }
  return cacheRegular.get(clave);
}
// Curvas de Bézier con puntos entre 0 y 1: [mover, [c1x,c1y,c2x,c2y,x,y]…].
function curvas(ctx, inicio, tramos, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x + inicio[0] * w, y + inicio[1] * h);
  for (const t of tramos) ctx.bezierCurveTo(x + t[0] * w, y + t[1] * h, x + t[2] * w, y + t[3] * h, x + t[4] * w, y + t[5] * h);
  ctx.closePath();
}

// Deja en ctx el camino de la forma (para rellenar, perfilar o recortar).
export function caminoFigura(ctx, figura, x, y, w, h, radio = 0) {
  const m = Math.min(Math.abs(w), Math.abs(h));
  switch (figura) {
    case 'elipse': ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2); return;
    case 'triangulo': return poligono(ctx, [[0.5, 0], [1, 1], [0, 1]], x, y, w, h);
    case 'rombo': return poligono(ctx, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]], x, y, w, h);
    case 'hexagono': return poligono(ctx, [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]], x, y, w, h);
    case 'estrella': return poligono(ctx, regular(5, 0.42), x, y, w, h);
    case 'destello': return poligono(ctx, regular(4, 0.32), x, y, w, h);
    case 'sello': return poligono(ctx, regular(20, 0.86), x, y, w, h);
    case 'flecha': return poligono(ctx, [[0, 0.3], [0.62, 0.3], [0.62, 0], [1, 0.5], [0.62, 1], [0.62, 0.7], [0, 0.7]], x, y, w, h);
    case 'flecha2': return poligono(ctx, [[0, 0.5], [0.25, 0], [0.25, 0.3], [0.75, 0.3], [0.75, 0], [1, 0.5], [0.75, 1], [0.75, 0.7], [0.25, 0.7], [0.25, 1]], x, y, w, h);
    case 'chevron': return poligono(ctx, [[0, 0], [0.7, 0], [1, 0.5], [0.7, 1], [0, 1], [0.3, 0.5]], x, y, w, h);
    case 'cinta': return poligono(ctx, [[0, 0], [1, 0], [0.88, 0.5], [1, 1], [0, 1], [0.12, 0.5]], x, y, w, h);
    case 'cruz': return poligono(ctx, [[0.33, 0], [0.67, 0], [0.67, 0.33], [1, 0.33], [1, 0.67], [0.67, 0.67], [0.67, 1], [0.33, 1], [0.33, 0.67], [0, 0.67], [0, 0.33], [0.33, 0.33]], x, y, w, h);
    case 'corazon':
      return curvas(ctx, [0.5, 0.3], [[0.5, 0.15, 0.35, 0, 0.2, 0], [0.05, 0, 0, 0.15, 0, 0.3], [0, 0.55, 0.3, 0.75, 0.5, 1],
        [0.7, 0.75, 1, 0.55, 1, 0.3], [1, 0.15, 0.95, 0, 0.8, 0], [0.65, 0, 0.5, 0.15, 0.5, 0.3]], x, y, w, h);
    case 'gota':
      return curvas(ctx, [0.5, 0], [[0.5, 0, 0.08, 0.45, 0.08, 0.66], [0.08, 0.88, 0.27, 1, 0.5, 1], [0.73, 1, 0.92, 0.88, 0.92, 0.66], [0.92, 0.45, 0.5, 0, 0.5, 0]], x, y, w, h);
    case 'nube':
      return curvas(ctx, [0.22, 0.92], [[0.04, 0.92, -0.02, 0.68, 0.12, 0.6], [0.04, 0.38, 0.24, 0.24, 0.38, 0.34], [0.42, 0.08, 0.74, 0.06, 0.79, 0.32],
        [0.97, 0.3, 1.04, 0.52, 0.93, 0.63], [1.03, 0.8, 0.92, 0.94, 0.76, 0.92]], x, y, w, h);
    case 'arco': {
      const r = Math.min(Math.abs(w) / 2, Math.abs(h));
      ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.arc(x + w / 2, y + r, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath();
      if (r < Math.abs(w) / 2) { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w / 2, h, 0, Math.PI, 0); ctx.closePath(); }
      return;
    }
    case 'bocadillo': {
      // Un rectángulo redondeado con el pico abajo a la izquierda.
      const b = y + h * 0.8, r = Math.min(m * 0.16, (h * 0.8) / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, b, r); ctx.arcTo(x + w, b, x, b, r);
      ctx.lineTo(x + w * 0.42, b); ctx.lineTo(x + w * 0.14, y + h); ctx.lineTo(x + w * 0.24, b);
      ctx.arcTo(x, b, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
      return;
    }
    case 'bocadillo2': {
      // Una elipse con el pico abajo a la izquierda.
      const cx = x + w / 2, cy = y + h * 0.42, rx = Math.abs(w / 2), ry = Math.abs(h * 0.42), a1 = 1.95, a2 = 2.35;
      ctx.beginPath(); ctx.moveTo(cx + rx * Math.cos(a2), cy + ry * Math.sin(a2));
      ctx.ellipse(cx, cy, rx, ry, 0, a2, a1 + Math.PI * 2, false);
      ctx.lineTo(x + w * 0.08, y + h); ctx.closePath();
      return;
    }
    default: {
      // 'rect' (y lo que no se conozca): con las esquinas redondeadas que diga.
      const rr = Math.max(0, Math.min(radio || 0, Math.abs(w) / 2, Math.abs(h) / 2));
      ctx.beginPath();
      ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
      ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
      ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y); ctx.closePath();
    }
  }
}

// La forma en pequeño (para los botones del panel), como SVG.
export function svgFigura(figura, color = 'currentColor') {
  const c = { beginPath() { this.d = ''; }, moveTo(a, b) { this.d += `M${a} ${b}`; }, lineTo(a, b) { this.d += `L${a} ${b}`; },
    bezierCurveTo(a, b, c2, d, e, f) { this.d += `C${a} ${b} ${c2} ${d} ${e} ${f}`; }, quadraticCurveTo(a, b, e, f) { this.d += `Q${a} ${b} ${e} ${f}`; },
    closePath() { this.d += 'Z'; }, d: '' };
  // Lo que usa arcos o elipses, dibujado aparte.
  if (figura === 'elipse') return `<svg viewBox="0 0 40 40"><ellipse cx="20" cy="20" rx="18" ry="18" fill="${color}"/></svg>`;
  if (figura === 'arco') return `<svg viewBox="0 0 40 40"><path d="M4 38V20a16 16 0 0 1 32 0v18z" fill="${color}"/></svg>`;
  if (figura === 'bocadillo2') return `<svg viewBox="0 0 40 40"><ellipse cx="20" cy="17" rx="18" ry="15" fill="${color}"/><path d="M10 27L4 38L17 31z" fill="${color}"/></svg>`;
  if (figura === 'bocadillo') return `<svg viewBox="0 0 40 40"><path d="M6 3h28a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H18L7 38l3-7H6a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z" fill="${color}"/></svg>`;
  caminoFigura(c, figura, 2, 2, 36, 36, 6);
  return `<svg viewBox="0 0 40 40"><path d="${c.d}" fill="${color}"/></svg>`;
}

export const ICONOS = [
  { id: 'estrella', nombre: 'Estrella', d: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z' },
  { id: 'corazon', nombre: 'Corazón', d: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' },
  { id: 'trofeo', nombre: 'Trofeo', d: 'M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z' },
  { id: 'calendario', nombre: 'Calendario', d: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' },
  { id: 'reloj', nombre: 'Hora', d: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z' },
  { id: 'lugar', nombre: 'Lugar', d: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z' },
  { id: 'telefono', nombre: 'Teléfono', d: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z' },
  { id: 'correo', nombre: 'Correo', d: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z' },
  { id: 'hecho', nombre: 'Hecho', d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
  { id: 'info', nombre: 'Información', d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z' },
  { id: 'aviso', nombre: 'Atención', d: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z' },
  { id: 'musica', nombre: 'Música', d: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z' },
  { id: 'tarta', nombre: 'Tarta', d: 'M12 6c1.11 0 2-.9 2-2 0-.38-.1-.73-.29-1.03L12 0l-1.71 2.97c-.19.3-.29.65-.29 1.03 0 1.1.9 2 2 2zm4.6 9.99l-1.07-1.07-1.08 1.07c-1.3 1.3-3.58 1.31-4.89 0l-1.07-1.07-1.09 1.07C6.75 16.64 5.88 17 4.96 17c-.73 0-1.4-.23-1.96-.61V21c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-4.61c-.56.38-1.23.61-1.96.61-.92 0-1.79-.36-2.44-1.01zM18 9h-5V7h-2v2H6c-1.66 0-3 1.34-3 3v1.54c0 1.08.88 1.96 1.96 1.96.52 0 1.02-.2 1.38-.57l2.14-2.13 2.13 2.13c.74.74 2.03.74 2.77 0l2.14-2.13 2.13 2.13c.37.37.86.57 1.38.57 1.08 0 1.96-.88 1.96-1.96V12C21 10.34 19.66 9 18 9z' },
  { id: 'grupo', nombre: 'Grupo', d: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { id: 'escuela', nombre: 'Clase', d: 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z' },
  { id: 'casa', nombre: 'Casa', d: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
  { id: 'etiqueta', nombre: 'Precio', d: 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z' },
  { id: 'flecha', nombre: 'Flecha', d: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z' },
];
const cachePath = new Map();
export function pathIcono(id) {
  if (!cachePath.has(id)) { const i = ICONOS.find(x => x.id === id); cachePath.set(id, i && typeof Path2D !== 'undefined' ? new Path2D(i.d) : null); }
  return cachePath.get(id);
}

// Los iconos de cada actividad (las submarcas del club) y los logos de cada una.
export const ICONOS_ACTIVIDAD = [
  ['ArtesMarciales', 'Artes marciales'], ['Ballet', 'Ballet'], ['BaileModerno', 'Baile moderno'], ['English', 'Inglés'], ['Robotica', 'Robótica'],
  ['Camaleon', 'Camaleón'], ['Entrenamiento', 'Entrenamiento'], ['Pilates', 'Pilates'], ['Pintura', 'Pintura'], ['CampVerano', 'Campamento'],
].map(([f, nombre]) => ({ nombre, icono: `/src/submarcas/simple/${f}.png`, logo: `/src/submarcas/${f}.png` }));
