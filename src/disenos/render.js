// ─────────────────────────────────────────────────────────────────────────────
// Diseños (el «Canva» del club): cómo se pinta un diseño. Una sola función,
// pintarDiseno, la usan el editor, las exportaciones (PNG, JPG, PDF, GIF,
// vídeo) y el diploma de cada alumno del aula: lo que se ve al diseñar es lo
// que sale.
//
// Un diseño: { ancho, alto, fondo, elementos: [...] } en píxeles del propio
// diseño. Cada elemento tiene su caja (x, y, w, h), su giro (rot, en grados,
// alrededor del centro) y su opacidad; los textos pueden llevar huecos como
// {alumno} que se rellenan al exportar (diplomas).
//
// Varias páginas (carruseles, folletos): la primera es el propio diseño y las
// demás van en «paginas» ({ fondo, elementos }), así lo de una página (y los
// diplomas del aula) sigue igual que siempre.
//
// Tipos de elemento: texto (con contorno, sombra de color, fondo y curva),
// imagen (con marco, recorte y filtros; sin foto es un marco donde soltarla),
// rect, elipse, forma (estrella, flecha, bocadillo… ver formas.js), icono,
// linea, qr, tabla y grafico (ver tablas.js). Cualquiera puede llevar una
// animación (anim) para las historias.
// ─────────────────────────────────────────────────────────────────────────────
import QRCode from 'qrcode';
import { caminoFigura, pathIcono } from './formas.js';
import { pintarTabla, pintarGrafico, disposicionTabla } from './tablas.js';

// Tamaños listos. Los A4/A3 a 150 ppp (de sobra para imprimir y no pesan).
export const TAMANOS = [
  { id: 'a4h', nombre: 'A4 apaisado', ancho: 1754, alto: 1240, pdf: { formato: 'a4', orientacion: 'landscape' } },
  { id: 'a4v', nombre: 'A4 vertical', ancho: 1240, alto: 1754, pdf: { formato: 'a4', orientacion: 'portrait' } },
  { id: 'a3v', nombre: 'Cartel A3', ancho: 1754, alto: 2480, pdf: { formato: 'a3', orientacion: 'portrait' } },
  // El post de Instagram, el de siempre del club: un poco más alto que ancho (4:5, #472).
  { id: 'ig', nombre: 'Post de Instagram', ancho: 1080, alto: 1350 },
  { id: 'igc', nombre: 'Post cuadrado', ancho: 1080, alto: 1080 },
  { id: 'historia', nombre: 'Historia (Instagram, WhatsApp)', ancho: 1080, alto: 1920 },
  { id: 'fb', nombre: 'Portada de Facebook', ancho: 1640, alto: 624 },
  { id: 'pres', nombre: 'Presentación 16:9', ancho: 1920, alto: 1080 },
];
const MM_PAPEL = { a4: [210, 297], a3: [297, 420] };

// Fuentes: las de la web, las de siempre y unas de Google para carteles y diplomas.
// Las que sube el club van aparte (fuenteUrl en cada texto, ver cargarFuentes).
export const FUENTES_DISENO = [
  { id: 'Montserrat', nombre: 'Montserrat', google: false },
  { id: 'Plus Jakarta Sans', nombre: 'Plus Jakarta Sans', google: false },
  { id: 'Playfair Display', nombre: 'Playfair Display (elegante)', google: true },
  { id: 'Lora', nombre: 'Lora (clásica)', google: true },
  { id: 'Great Vibes', nombre: 'Great Vibes (caligrafía)', google: true },
  { id: 'Pacifico', nombre: 'Pacifico (divertida)', google: true },
  { id: 'Bebas Neue', nombre: 'Bebas Neue (titulares)', google: true },
  { id: 'Oswald', nombre: 'Oswald', google: true },
  { id: 'Georgia', nombre: 'Georgia', google: false },
  { id: 'Arial', nombre: 'Arial', google: false },
  { id: 'Courier New', nombre: 'Máquina de escribir', google: false },
];
const URL_FUENTES = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;0,700;1,400&family=Great+Vibes&family=Pacifico&family=Bebas+Neue&family=Oswald:wght@400;700&display=swap';

// Los huecos de un diploma y cómo se ven en el editor.
export const VARIABLES_DIPLOMA = [
  { id: 'alumno', nombre: 'Nombre del alumno', ejemplo: 'Lucía Martín García' },
  { id: 'curso', nombre: 'Curso', ejemplo: 'Inglés para viajar' },
  { id: 'fecha', nombre: 'Fecha en que lo terminó', ejemplo: '18 de octubre de 2026' },
  { id: 'profesor', nombre: 'Profesor del curso', ejemplo: 'Darío Francisco' },
  { id: 'lecciones', nombre: 'Número de lecciones', ejemplo: '12' },
  { id: 'codigo', nombre: 'Código del diploma', ejemplo: '35604DF46F' },
  // Estos solo se rellenan en los diplomas en lote (de una clase o de un examen).
  { id: 'nivel', nombre: 'Nivel o cinturón (diplomas en lote)', ejemplo: 'Cinturón amarillo', lote: true },
  { id: 'grupo', nombre: 'Clase o convocatoria (diplomas en lote)', ejemplo: 'Infantil lunes y miércoles', lote: true },
  { id: 'resultado', nombre: 'Resultado del examen (diplomas en lote)', ejemplo: 'Sobresaliente', lote: true },
];
export const EJEMPLO_DIPLOMA = Object.fromEntries(VARIABLES_DIPLOMA.map(v => [v.id, v.ejemplo]));
// Los huecos de las plantillas que salen solas (#471): la historia de un festivo y
// la felicitación de cumpleaños (ver disenos-automaticos.js, que los rellena).
export const VARIABLES_AUTO = {
  festivo: [
    { id: 'dia', nombre: 'El día del festivo', ejemplo: 'Lunes 8 de diciembre' },
    { id: 'festivo', nombre: 'Qué festivo es', ejemplo: 'Día de la Inmaculada Concepción' },
    { id: 'vuelta', nombre: 'Cuándo se vuelve', ejemplo: 'el martes' },
  ],
  cumple: [
    { id: 'nombre', nombre: 'Nombre del alumno', ejemplo: 'Lucía' },
    { id: 'edad', nombre: 'Años que cumple', ejemplo: '9' },
  ],
};
export const EJEMPLO_AUTO = Object.fromEntries(Object.entries(VARIABLES_AUTO).map(([k, l]) => [k, Object.fromEntries(l.map(v => [v.id, v.ejemplo]))]));
export const rellenar = (texto, variables) => (variables
  ? String(texto ?? '').replace(/\{(\w+)\}/g, (m, k) => (variables[k] != null ? String(variables[k]) : m))
  : String(texto ?? ''));

let id = 0;
export const nuevoId = () => `e${Date.now().toString(36)}${(id++).toString(36)}`;

// ── Páginas ─────────────────────────────────────────────────────────────────
export const numPaginas = (d) => 1 + (Array.isArray(d?.paginas) ? d.paginas.length : 0);
// La página i, como un diseño de una página (la 0 es el propio diseño).
export function paginaDe(d, i) {
  if (!i) return d;
  const p = d.paginas?.[i - 1];
  return p ? { ...d, fondo: p.fondo, elementos: p.elementos || [] } : d;
}
// Devuelve el diseño con la página i cambiada por v (lo que devuelve paginaDe, retocado).
export function conPagina(d, i, v) {
  if (!i) return v;
  const { fondo, elementos, paginas, ...resto } = v; // eslint-disable-line no-unused-vars
  return { ...d, ...resto, paginas: (d.paginas || []).map((p, j) => (j === i - 1 ? { ...p, fondo, elementos } : p)) };
}
export const todasLasPaginas = (d) => Array.from({ length: numPaginas(d) }, (_, i) => paginaDe(d, i));
const todosLosElementos = (d) => [...(d?.elementos || []), ...(d?.paginas || []).flatMap(p => p.elementos || [])];

// ── Dónde se pinta ──────────────────────────────────────────────────────────
// En el navegador, su canvas, sus imágenes y sus letras. El servidor (las
// historias de los festivos y las felicitaciones, #471) pone los suyos con
// usarEntorno: { lienzo(w, h), cargarImagen(url), cargarFuentes(elementos) }.
const entorno = {};
export function usarEntorno(e) { Object.assign(entorno, e); }
const hayLienzo = () => !!entorno.lienzo || typeof document !== 'undefined';
function crearLienzo(w, h) {
  if (entorno.lienzo) return entorno.lienzo(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}

// ── Cargar lo que hace falta antes de pintar ────────────────────────────────
// La hoja de las letras de Google: una sola vez, y todos esperan a la misma.
let hoja = null;
function hojaFuentes() {
  if (!hoja) {
    hoja = new Promise(r => {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = URL_FUENTES;
      l.onload = r; l.onerror = r; setTimeout(r, 4000);
      document.head.appendChild(l);
    });
  }
  return hoja;
}
const fuentesPropias = new Map();
// Una letra subida por el club (TTF, OTF, WOFF): se carga una vez por nombre.
export function cargarFuentePropia(nombre, url) {
  if (typeof document === 'undefined' || !url || typeof FontFace === 'undefined') return Promise.resolve();
  if (!fuentesPropias.has(nombre)) {
    fuentesPropias.set(nombre, new FontFace(nombre, `url(${url})`).load().then(f => { document.fonts.add(f); }).catch(() => {}));
  }
  return fuentesPropias.get(nombre);
}
export async function cargarFuentes(diseno) {
  // Los textos y lo demás que lleva letra (tablas y gráficos).
  const conLetra = todosLosElementos(diseno).filter(e => e.tipo === 'texto' || e.tipo === 'tabla' || e.tipo === 'grafico');
  if (entorno.cargarFuentes) { await entorno.cargarFuentes(conLetra); return; }
  if (typeof document === 'undefined') return;
  if (conLetra.some(e => FUENTES_DISENO.find(x => x.id === (e.fuente || 'Montserrat'))?.google)) await hojaFuentes();
  await Promise.all(conLetra.flatMap(e => (e.fuenteUrl ? [cargarFuentePropia(e.fuente, e.fuenteUrl)]
    : [400, 700].map(peso => document.fonts?.load?.(`${e.cursiva ? 'italic ' : ''}${peso} 40px "${e.fuente || 'Montserrat'}"`).catch(() => null)))));
}
// Pide las fuentes de Google ya (para el editor: que se vean al elegirlas).
export function pedirFuentes() {
  if (typeof document !== 'undefined') hojaFuentes();
}

const cacheImg = new Map();
export function cargarImagen(url) {
  if (!url) return Promise.resolve(null);
  if (entorno.cargarImagen) return entorno.cargarImagen(url);
  if (!cacheImg.has(url)) {
    cacheImg.set(url, new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; }));
  }
  return cacheImg.get(url);
}
export async function cargarImagenes(diseno) {
  const urls = [diseno?.fondo?.tipo === 'imagen' ? diseno.fondo.url : null, ...(diseno?.elementos || []).filter(e => e.tipo === 'imagen').map(e => e.url)].filter(Boolean);
  const pares = await Promise.all(urls.map(async u => [u, await cargarImagen(u)]));
  return new Map(pares);
}

// ── Filtros de las fotos ────────────────────────────────────────────────────
// Brillo, contraste, saturación, calidez (de -100 a 100), blanco y negro y sepia.
// Se hacen a mano, píxel a píxel (iguales en todos los navegadores), una vez
// por foto y filtro: se guardan.
export const sinFiltros = (f) => !f || (!f.brillo && !f.contraste && !f.saturacion && !f.calidez && !f.bn && !f.sepia);
const cacheFiltros = new WeakMap();
function conFiltros(img, f) {
  if (!img || sinFiltros(f) || !hayLienzo()) return img;
  const clave = [f.brillo || 0, f.contraste || 0, f.saturacion || 0, f.calidez || 0, !!f.bn, !!f.sepia].join('|');
  let m = cacheFiltros.get(img);
  if (!m) { m = new Map(); cacheFiltros.set(img, m); }
  if (m.has(clave)) return m.get(clave);
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k = Math.min(1, 2400 / Math.max(iw, ih));
  const c = crearLienzo(Math.max(1, Math.round(iw * k)), Math.max(1, Math.round(ih * k)));
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  let datos;
  try { datos = g.getImageData(0, 0, c.width, c.height); } catch { m.set(clave, img); return img; }
  const px = datos.data, br = (f.brillo || 0) * 1.28, C = (f.contraste || 0) * 2.55, cf = (259 * (C + 255)) / (255 * (259 - C));
  const sat = f.bn ? 0 : 1 + (f.saturacion || 0) / 100, cal = (f.calidez || 0) * 0.4;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] + br, gr = px[i + 1] + br, b = px[i + 2] + br;
    r = cf * (r - 128) + 128; gr = cf * (gr - 128) + 128; b = cf * (b - 128) + 128;
    const l = 0.299 * r + 0.587 * gr + 0.114 * b;
    r = l + (r - l) * sat; gr = l + (gr - l) * sat; b = l + (b - l) * sat;
    if (f.sepia) { const r2 = 0.393 * r + 0.769 * gr + 0.189 * b, g2 = 0.349 * r + 0.686 * gr + 0.168 * b, b2 = 0.272 * r + 0.534 * gr + 0.131 * b; r = r2; gr = g2; b = b2; }
    px[i] = r + cal; px[i + 1] = gr; px[i + 2] = b - cal;
  }
  g.putImageData(datos, 0, 0);
  // Como mucho tres versiones por foto (al mover un deslizador salen muchas).
  if (m.size >= 3) m.delete(m.keys().next().value);
  m.set(clave, c);
  return c;
}

// ── Pintar ───────────────────────────────────────────────────────────────────
function degradado(ctx, x0, y0, w, h, c1, c2, angulo = 135) {
  const a = (angulo - 90) * Math.PI / 180, cx = x0 + w / 2, cy = y0 + h / 2;
  const L = Math.abs(w * Math.cos(a)) / 2 + Math.abs(h * Math.sin(a)) / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(a) * L, cy - Math.sin(a) * L, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
  // Un color que no vale (un código a medio escribir, #474) no rompe el dibujo: el de siempre.
  try { g.addColorStop(0, c1 || '#5233A8'); } catch { g.addColorStop(0, '#5233A8'); }
  try { g.addColorStop(1, c2 || '#21B668'); } catch { g.addColorStop(1, '#21B668'); }
  return g;
}
// enc (recorte): { zoom, x, y }: la foto llena la caja, con su zoom y el punto
// de la foto (x, y de 0 a 1) que queda en el centro, sin dejar huecos.
function dibujarImagen(ctx, img, x, y, w, h, ajuste = 'cubrir', enc = null) {
  if (!img) return;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  if (enc) {
    const k = Math.max(w / iw, h / ih) * Math.max(1, enc.zoom || 1), dw = iw * k, dh = ih * k;
    const dx = Math.min(x, Math.max(x + w - dw, x + w / 2 - (enc.x ?? 0.5) * dw));
    const dy = Math.min(y, Math.max(y + h - dh, y + h / 2 - (enc.y ?? 0.5) * dh));
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }
  if (ajuste === 'estirar') { ctx.drawImage(img, x, y, w, h); return; }
  const k = ajuste === 'contener' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
  const dw = iw * k, dh = ih * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
const fuenteCss = (e) => `${e.cursiva ? 'italic ' : ''}${e.negrita ? 700 : 400} ${e.tamano || 48}px "${e.fuente || 'Montserrat'}", Montserrat, Arial, sans-serif`;
// Las líneas de un texto dentro de su ancho (respeta los saltos de línea).
export function lineasTexto(ctx, e, texto) {
  ctx.font = fuenteCss(e);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${e.espaciado || 0}px`;
  const t = e.mayusculas ? texto.toUpperCase() : texto;
  const lineas = [];
  for (const parrafo of t.split('\n')) {
    const palabras = parrafo.split(/(\s+)/);
    let linea = '';
    for (const p of palabras) {
      const prueba = linea + p;
      if (linea && ctx.measureText(prueba.trimEnd()).width > e.w && p.trim()) { lineas.push(linea.trimEnd()); linea = p.trimStart(); }
      else linea = prueba;
    }
    lineas.push(linea.trimEnd());
  }
  return lineas;
}
export const altoTexto = (ctx, e, texto) => lineasTexto(ctx, e, texto).length * (e.tamano || 48) * (e.interlineado || 1.25);

// Texto curvo: todo en una línea sobre un arco. curva de -100 (sonrisa) a 100
// (arco hacia arriba); 100 es casi un círculo entero.
function geometriaCurva(ctx, e, texto) {
  ctx.font = fuenteCss(e);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const t = (e.mayusculas ? texto.toUpperCase() : texto).replace(/\s*\n\s*/g, ' ');
  const esp = e.espaciado || 0, letras = [...t];
  const anchos = letras.map(c => ctx.measureText(c).width + esp);
  const total = Math.max(1, anchos.reduce((a, b) => a + b, 0) - esp);
  const ang = (Math.min(100, Math.abs(e.curva)) / 100) * Math.PI * 1.9, R = total / ang, T = e.tamano || 48;
  const alto = R * (1 - Math.cos(Math.min(ang / 2, Math.PI))) + T * 1.15;
  const ancho = (ang / 2 >= Math.PI / 2 ? 2 * R : 2 * R * Math.sin(ang / 2)) + T;
  return { letras, anchos, total, R, T, alto, ancho, s: e.curva > 0 ? 1 : -1 };
}
const curvo = (e) => e.tipo === 'texto' && Math.abs(e.curva || 0) >= 1;

// ── Texto con partes de otro estilo y listas (ver textoRico.js) ──
// Cada palabra lleva su estilo; se reparten en líneas midiendo cada una con su
// letra. Las listas llevan su viñeta o su número y la sangría.
export const esRico = (e) => e.tipo === 'texto' && ((Array.isArray(e.trozos) && e.trozos.length > 0) || !!e.lista || !!e.subrayado || !!e.tachado);
const estiloDe = (e, t) => ({ negrita: t.negrita ?? !!e.negrita, cursiva: t.cursiva ?? !!e.cursiva, color: t.color || e.color || '#1A1A1A', subrayado: t.subrayado ?? !!e.subrayado, tachado: t.tachado ?? !!e.tachado });
const fuenteDe = (e, s) => `${s.cursiva ? 'italic ' : ''}${s.negrita ? 700 : 400} ${e.tamano || 48}px "${e.fuente || 'Montserrat'}", Montserrat, Arial, sans-serif`;
const trozosDe = (e, variables) => (Array.isArray(e.trozos) && e.trozos.length ? e.trozos : [{ t: e.texto || '' }]).map(x => ({ ...x, t: rellenar(x.t, variables) }));
export function lineasRicas(ctx, e, trozos) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${e.espaciado || 0}px`;
  const parrafos = [[]];
  for (const tr of trozos) {
    const s = estiloDe(e, tr), t = e.mayusculas ? String(tr.t).toUpperCase() : String(tr.t);
    t.split('\n').forEach((parte, i) => { if (i) parrafos.push([]); if (parte) parrafos[parrafos.length - 1].push({ t: parte, s }); });
  }
  const T = e.tamano || 48, lineas = [];
  parrafos.forEach((p, n) => {
    let marca = null, sangria = 0;
    if (e.lista) {
      marca = e.lista === 'numeros' ? `${n + 1}.` : '•';
      ctx.font = fuenteDe(e, estiloDe(e, {}));
      sangria = Math.max(ctx.measureText('00.').width, ctx.measureText(marca).width) + T * 0.4;
    }
    const libre = Math.max(10, e.w - sangria), piezas = [];
    for (const q of p) for (const w of q.t.split(/(\s+)/)) if (w) piezas.push({ t: w, s: q.s });
    let linea = { segs: [], ancho: 0, marca, sangria };
    const cerrar = (l) => { while (l.segs.length && !l.segs[l.segs.length - 1].t.trim()) l.ancho -= l.segs.pop().w; lineas.push(l); };
    for (const pz of piezas) {
      ctx.font = fuenteDe(e, pz.s);
      const w = ctx.measureText(pz.t).width, espacio = !pz.t.trim();
      if (espacio && !linea.segs.length) continue;
      if (!espacio && linea.segs.length && linea.ancho + w > libre) { cerrar(linea); linea = { segs: [], ancho: 0, marca: null, sangria }; }
      linea.segs.push({ t: pz.t, s: pz.s, w }); linea.ancho += w;
    }
    cerrar(linea);
  });
  return lineas;
}
function pintarRico(ctx, e, trozos, x, y, letras, contorno) {
  const lineas = lineasRicas(ctx, e, trozos), T = e.tamano || 48, lh = T * (e.interlineado || 1.25);
  const y0 = (e.vertical === 'arriba' ? y : y + (e.h - lineas.length * lh) / 2) + (lh - T) / 2;
  const filas = lineas.map((l, i) => {
    const libre = e.w - l.sangria;
    return { l, x0: x + l.sangria + (e.alinear === 'centro' ? (libre - l.ancho) / 2 : e.alinear === 'derecha' ? libre - l.ancho : 0), y: y0 + i * lh };
  });
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  if (e.resalte && e.resalte !== 'transparent') {
    const m = e.resalteMargen ?? T * 0.3;
    for (const f of filas) {
      if (!f.l.ancho) continue;
      ctx.save(); ctx.fillStyle = e.resalte;
      caminoFigura(ctx, 'rect', f.x0 - m, f.y - m * 0.45, f.l.ancho + m * 2, T + m * 0.9, e.resalteRadio ?? m * 0.6); ctx.fill();
      ctx.restore();
    }
    if (e.sombra) quitarSombra(ctx);
  }
  // Máquina de escribir: cuántas letras se ven.
  let quedan = letras == null ? Infinity : Math.floor(lineas.reduce((s, l) => s + l.segs.reduce((a, g) => a + g.t.length, 0), 0) * letras);
  const cada = (pinta) => {
    let q = quedan;
    for (const f of filas) {
      let cx = f.x0;
      for (const g of f.l.segs) {
        if (q <= 0) return;
        const t = g.t.slice(0, Math.max(0, q)); q -= g.t.length;
        pinta(g, t, cx, f.y); cx += g.w;
      }
    }
  };
  if (contorno) { cada((g, t, cx, cy) => { ctx.font = fuenteDe(e, g.s); ctx.strokeText(t, cx, cy); }); if (e.sombra) quitarSombra(ctx); }
  // Las viñetas o los números.
  for (const f of filas) if (f.l.marca && quedan > 0) { ctx.font = fuenteDe(e, estiloDe(e, {})); ctx.fillStyle = e.color || '#1A1A1A'; ctx.fillText(f.l.marca, x, f.y); }
  cada((g, t, cx, cy) => {
    ctx.font = fuenteDe(e, g.s); ctx.fillStyle = g.s.color; ctx.fillText(t, cx, cy);
    const w = t === g.t ? g.w : ctx.measureText(t).width, grueso = Math.max(1, T * 0.06);
    if (g.s.subrayado && t.trim()) ctx.fillRect(cx, cy + T * 0.95, w, grueso);
    if (g.s.tachado && t.trim()) ctx.fillRect(cx, cy + T * 0.52, w, grueso);
  });
  quedan = 0;
}

// La caja de un texto se ajusta a lo que ocupa (con los huecos rellenos).
let medidor = null;
const elMedidor = () => (medidor = medidor || crearLienzo(1, 1).getContext('2d'));
export function ajustarTexto(e, variables) {
  if (e.tipo === 'tabla' && typeof document !== 'undefined') return { ...e, h: Math.max(10, Math.ceil(disposicionTabla(elMedidor(), e, t => rellenar(t, variables)).alto)) };
  if (e.tipo !== 'texto' || typeof document === 'undefined') return e;
  if (curvo(e)) {
    const g = geometriaCurva(elMedidor(), e, rellenar(e.texto, variables));
    const w = Math.ceil(g.ancho), h = Math.ceil(g.alto);
    // Crece o mengua desde su centro.
    return { ...e, x: Math.round(e.x + (e.w - w) / 2), w, h };
  }
  if (esRico(e)) return { ...e, h: Math.max(10, Math.ceil(lineasRicas(elMedidor(), e, trozosDe(e, variables)).length * (e.tamano || 48) * (e.interlineado || 1.25))) };
  return { ...e, h: Math.max(10, Math.ceil(altoTexto(elMedidor(), e, rellenar(e.texto, variables)))) };
}

// Dónde cae un punto de la caja de un texto (en píxeles del diseño, desde su
// esquina) dentro del texto: para dejar ahí el cursor al escribir en el lienzo.
export function posicionEnTexto(e, dx, dy) {
  const texto = String(e.texto || '');
  if (typeof document === 'undefined' || !texto || curvo(e)) return texto.length;
  const ctx = elMedidor();
  const lineas = lineasTexto(ctx, e, texto);
  const lh = (e.tamano || 48) * (e.interlineado || 1.25);
  const arriba = e.vertical === 'arriba' ? 0 : (e.h - lineas.length * lh) / 2;
  const n = Math.max(0, Math.min(lineas.length - 1, Math.floor((dy - arriba) / lh)));
  // Dónde empieza cada línea en el texto (una vacía es un salto de párrafo).
  const fuente = e.mayusculas ? texto.toUpperCase() : texto;
  let pos = 0, inicio = 0;
  for (let i = 0; i <= n; i++) {
    const j = lineas[i] ? fuente.indexOf(lineas[i], pos) : i === 0 ? 0 : fuente.indexOf('\n', pos) + 1;
    inicio = j > 0 || (j === 0 && i === 0) ? j : pos;
    pos = inicio + lineas[i].length;
  }
  const linea = lineas[n], ancho = ctx.measureText(linea).width;
  const x0 = e.alinear === 'centro' ? (e.w - ancho) / 2 : e.alinear === 'derecha' ? e.w - ancho : 0;
  let mejor = 0, dist = Infinity;
  for (let c = 0; c <= linea.length; c++) {
    const d = Math.abs(ctx.measureText(linea.slice(0, c)).width - (dx - x0));
    if (d < dist) { dist = d; mejor = c; }
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  return Math.min(texto.length, inicio + mejor);
}

// Los cuadraditos de un QR (se guardan: un diseño con un QR se pinta muchas veces).
const cacheQr = new Map();
function matrizQr(texto) {
  const t = String(texto || '').trim() || 'https://www.aimeducation.es';
  if (!cacheQr.has(t)) {
    let m = null;
    try { const q = QRCode.create(t, { errorCorrectionLevel: 'M' }); m = { n: q.modules.size, datos: q.modules.data }; } catch { m = null; }
    if (cacheQr.size > 50) cacheQr.clear();
    cacheQr.set(t, m);
  }
  return cacheQr.get(t);
}

// ── Animaciones (historias animadas) ────────────────────────────────────────
// anim: { tipo, retraso, duracion } en segundos. Las de entrada pasan una vez;
// «latir» y «flotar» siguen mientras dura el vídeo.
export const ANIMACIONES = [
  { id: 'aparecer', nombre: 'Aparecer' }, { id: 'subir', nombre: 'Subir' }, { id: 'bajar', nombre: 'Bajar' },
  { id: 'izquierda', nombre: 'Entrar por la izquierda' }, { id: 'derecha', nombre: 'Entrar por la derecha' },
  { id: 'zoom', nombre: 'Crecer' }, { id: 'rebote', nombre: 'Rebotar' }, { id: 'girar', nombre: 'Girar' },
  { id: 'escribir', nombre: 'Máquina de escribir (textos)' }, { id: 'latido', nombre: 'Latir (sin parar)' }, { id: 'flotar', nombre: 'Flotar (sin parar)' },
];
export const tieneAnimacion = (d) => (d?.elementos || []).some(e => e.anim?.tipo);
export const duracionAnimacion = (d) => Math.max(2, Math.min(15, d?.animacion?.duracion || 5));
function estadoAnim(e, t, W, H) {
  const a = e.anim;
  if (!a?.tipo || t == null) return null;
  const ret = a.retraso || 0, dur = Math.max(0.1, a.duracion || 0.8);
  const p = Math.max(0, Math.min(1, (t - ret) / dur)), q = 1 - (1 - p) ** 3;
  switch (a.tipo) {
    case 'aparecer': return { alfa: q };
    case 'subir': return { alfa: q, dy: (1 - q) * H * 0.06 };
    case 'bajar': return { alfa: q, dy: -(1 - q) * H * 0.06 };
    case 'izquierda': return { alfa: q, dx: -(1 - q) * W * 0.3 };
    case 'derecha': return { alfa: q, dx: (1 - q) * W * 0.3 };
    case 'zoom': return { alfa: q, esc: 0.4 + 0.6 * q };
    case 'rebote': { const c = 1.70158, b = 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; return { alfa: Math.min(1, p * 4), esc: Math.max(0, b) }; }
    case 'girar': return { alfa: q, rot: (1 - q) * -120, esc: 0.6 + 0.4 * q };
    case 'escribir': return { letras: p };
    case 'latido': return t < ret ? {} : { esc: 1 + 0.06 * (0.5 - 0.5 * Math.cos(((t - ret) * Math.PI * 2) / 1.1)) };
    case 'flotar': return t < ret ? {} : { dy: Math.sin(((t - ret) * Math.PI * 2) / 2.4) * H * 0.012 };
    default: return null;
  }
}

// La sombra, a la escala a la que se pinta (las sombras del canvas no escalan solas).
const conAlfa = (hex, a) => {
  const h = String(hex || '#000000').replace('#', ''), n = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
  const v = parseInt(n, 16);
  return Number.isFinite(v) ? `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})` : `rgba(0,0,0,${a})`;
};
function ponerSombra(ctx, e) {
  const t = ctx.getTransform(), k = Math.hypot(t.a, t.b) || 1;
  ctx.shadowColor = conAlfa(e.sombraColor, e.sombraOpacidad ?? 0.28);
  ctx.shadowBlur = (e.sombraDifu ?? 24) * k;
  ctx.shadowOffsetX = (e.sombraX ?? 0) * k;
  ctx.shadowOffsetY = (e.sombraY ?? 8) * k;
}
const quitarSombra = (ctx) => { ctx.shadowColor = 'transparent'; };

function pintarTexto(ctx, e, texto, x, y, letras, variables) {
  ctx.fillStyle = e.color || '#1A1A1A';
  const contorno = e.contorno && e.contornoGrosor > 0;
  if (contorno) { ctx.strokeStyle = e.contorno; ctx.lineWidth = e.contornoGrosor * 2; ctx.lineJoin = 'round'; ctx.miterLimit = 2; }
  if (esRico(e) && !curvo(e)) { pintarRico(ctx, e, trozosDe(e, variables), x, y, letras, contorno); return; }
  if (curvo(e)) {
    const g = geometriaCurva(ctx, e, texto);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cy = g.s > 0 ? -e.h / 2 + g.T * 0.55 + g.R : e.h / 2 - g.T * 0.55 - g.R;
    const n = letras == null ? g.letras.length : Math.floor(g.letras.length * letras);
    const cadaLetra = (pinta) => {
      let cur = -g.total / 2;
      for (let i = 0; i < n; i++) {
        const a = (cur + (g.anchos[i] - (e.espaciado || 0)) / 2) / g.R;
        cur += g.anchos[i];
        ctx.save();
        if (g.s > 0) { ctx.translate(g.R * Math.sin(a), cy - g.R * Math.cos(a)); ctx.rotate(a); }
        else { ctx.translate(g.R * Math.sin(a), cy + g.R * Math.cos(a)); ctx.rotate(-a); }
        pinta(g.letras[i]);
        ctx.restore();
      }
    };
    // Primero el contorno (con la sombra) y encima las letras.
    if (contorno) { cadaLetra(l => ctx.strokeText(l, 0, 0)); if (e.sombra) quitarSombra(ctx); }
    cadaLetra(l => ctx.fillText(l, 0, 0));
    return;
  }
  let lineas = lineasTexto(ctx, e, texto);
  // Máquina de escribir: solo las primeras letras.
  if (letras != null) {
    let quedan = Math.floor(lineas.join('').length * letras);
    lineas = lineas.map(l => { const t = l.slice(0, Math.max(0, quedan)); quedan -= l.length; return t; });
  }
  const T = e.tamano || 48, lh = T * (e.interlineado || 1.25);
  ctx.textBaseline = 'top';
  ctx.textAlign = e.alinear === 'centro' ? 'center' : e.alinear === 'derecha' ? 'right' : 'left';
  const tx = e.alinear === 'centro' ? 0 : e.alinear === 'derecha' ? e.w / 2 : x;
  // Centrado en vertical dentro de su caja.
  const alto = lineas.length * lh;
  const y0 = (e.vertical === 'arriba' ? y : y + (e.h - alto) / 2) + (lh - T) / 2;
  const filas = lineas.map((l, i) => [l, y0 + i * lh]);
  // El fondo detrás de cada línea (como un rotulador); la sombra, para él.
  if (e.resalte && e.resalte !== 'transparent') {
    const m = e.resalteMargen ?? T * 0.3;
    for (const [l, yl] of filas) {
      if (!l) continue;
      const w = ctx.measureText(l).width, x0 = e.alinear === 'centro' ? -w / 2 : e.alinear === 'derecha' ? tx - w : tx;
      ctx.save(); ctx.fillStyle = e.resalte;
      caminoFigura(ctx, 'rect', x0 - m, yl - m * 0.45, w + m * 2, T + m * 0.9, e.resalteRadio ?? m * 0.6); ctx.fill();
      ctx.restore();
    }
    if (e.sombra) quitarSombra(ctx);
  }
  // Primero el contorno (con la sombra) y encima las letras.
  if (contorno) { for (const [l, yl] of filas) ctx.strokeText(l, tx, yl); if (e.sombra) quitarSombra(ctx); }
  for (const [l, yl] of filas) ctx.fillText(l, tx, yl);
}

// opciones: imagenes (Map url → img), variables (huecos de diploma), ocultar
// (id o lista de ids que no se pintan: el texto que se escribe), tiempo (para
// las animaciones, en segundos), editor (pinta los marcos vacíos) y sinFondo
// (para un PNG transparente).
export function pintarDiseno(ctx, diseno, { imagenes = new Map(), variables = null, ocultar = null, tiempo = null, editor = false, sinFondo = false } = {}) {
  const { ancho: W, alto: H } = diseno;
  const oculto = (idEl) => (Array.isArray(ocultar) ? ocultar.includes(idEl) : idEl === ocultar);
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  const f = sinFondo ? { tipo: 'nada' } : diseno.fondo || { tipo: 'color', color: '#ffffff' };
  if (f.tipo === 'nada') { /* transparente */ } else if (f.tipo === 'degradado') ctx.fillStyle = degradado(ctx, 0, 0, W, H, f.color, f.color2, f.angulo);
  else ctx.fillStyle = f.color || '#ffffff';
  if (f.tipo !== 'nada') ctx.fillRect(0, 0, W, H);
  if (f.tipo === 'imagen') {
    ctx.globalAlpha = f.opacidad ?? 1;
    dibujarImagen(ctx, imagenes.get(f.url), 0, 0, W, H, 'cubrir');
    ctx.globalAlpha = 1;
  }
  for (const e of diseno.elementos || []) {
    if (!e || e.oculto || oculto(e.id)) continue;
    const an = estadoAnim(e, tiempo, W, H);
    ctx.save();
    // Si algo de un elemento no se puede pintar, se salta ese y se pintan los demás.
    try {
    ctx.globalAlpha = (e.opacidad ?? 1) * (an?.alfa ?? 1);
    if (ctx.globalAlpha <= 0.001) { ctx.restore(); continue; }
    ctx.translate(e.x + e.w / 2 + (an?.dx || 0), e.y + e.h / 2 + (an?.dy || 0));
    if (e.rot || an?.rot) ctx.rotate(((e.rot || 0) + (an?.rot || 0)) * Math.PI / 180);
    if (an?.esc != null) ctx.scale(an.esc, an.esc);
    // Volteado en espejo.
    if (e.espejoH || e.espejoV) ctx.scale(e.espejoH ? -1 : 1, e.espejoV ? -1 : 1);
    const x = -e.w / 2, y = -e.h / 2;
    if (e.sombra) ponerSombra(ctx, e);
    if (e.tipo === 'trazo') {
      // Dibujo a mano alzada: sus puntos (en partes de su caja), suavizados.
      const ps = e.puntos || [];
      if (ps.length) {
        const P = ([u, v]) => [x + u * e.w, y + v * e.h];
        let [ax, ay] = P(ps[0]);
        ctx.beginPath(); ctx.moveTo(ax, ay);
        if (ps.length === 1) ctx.lineTo(ax + 0.01, ay);
        for (let i = 1; i < ps.length; i++) { const [bx, by] = P(ps[i]); ctx.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2); ax = bx; ay = by; }
        ctx.lineTo(ax, ay);
        ctx.strokeStyle = e.color || '#1A1A1A'; ctx.lineWidth = e.grosor || 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      }
    } else if (e.tipo === 'rect' || e.tipo === 'elipse' || e.tipo === 'forma') {
      caminoFigura(ctx, e.tipo === 'forma' ? e.figura : e.tipo, x, y, e.w, e.h, e.radio);
      if (e.relleno && e.relleno !== 'transparent') { ctx.fillStyle = e.relleno2 ? degradado(ctx, x, y, e.w, e.h, e.relleno, e.relleno2, e.angulo) : e.relleno; ctx.fill(); }
      quitarSombra(ctx);
      if (e.borde && e.grosor) { ctx.strokeStyle = e.borde; ctx.lineWidth = e.grosor; ctx.lineJoin = 'round'; ctx.stroke(); }
    } else if (e.tipo === 'linea') {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + e.w, 0);
      ctx.strokeStyle = e.color || '#1A1A1A'; ctx.lineWidth = e.grosor || 4; ctx.lineCap = 'round';
      if (e.discontinua) ctx.setLineDash([e.grosor * 3, e.grosor * 2.5]);
      ctx.stroke();
    } else if (e.tipo === 'icono') {
      const ps = pathIcono(e.icono, e.camino), lado = Math.min(e.w, e.h);
      if (ps) { ctx.translate(-lado / 2, -lado / 2); ctx.scale(lado / 24, lado / 24); ctx.fillStyle = e.color || '#1A1A1A'; ps.forEach(p => ctx.fill(p)); }
    } else if (e.tipo === 'qr') {
      const lado = Math.min(e.w, e.h), conFondo = e.fondo && e.fondo !== 'transparent';
      if (conFondo) { caminoFigura(ctx, 'rect', -lado / 2, -lado / 2, lado, lado, e.radio); ctx.fillStyle = e.fondo; ctx.fill(); }
      quitarSombra(ctx);
      const m = matrizQr(e.texto);
      if (m) {
        // Con fondo, su margen de dos cuadraditos (lo que necesita el móvil para leerlo).
        const margen = conFondo ? 2 : 0, k = lado / (m.n + margen * 2), o = -lado / 2 + margen * k;
        ctx.fillStyle = e.color || '#1A1A1A';
        // Fila a fila, los tramos seguidos de una vez: sin rayitas entre cuadraditos.
        for (let fi = 0; fi < m.n; fi++) {
          for (let c = 0; c < m.n; c++) {
            if (!m.datos[fi * m.n + c]) continue;
            let fin = c; while (fin + 1 < m.n && m.datos[fi * m.n + fin + 1]) fin++;
            ctx.fillRect(o + c * k, o + fi * k, (fin - c + 1) * k, k + 0.6);
            c = fin;
          }
        }
      }
    } else if (e.tipo === 'imagen') {
      const img = conFiltros(imagenes.get(e.url), e.filtros);
      const marco = e.marco && e.marco !== 'rect' ? e.marco : 'rect';
      // La sombra va con la forma del marco (si la foto se recorta, la sombra no se ve).
      if (e.sombra && img) { caminoFigura(ctx, marco, x, y, e.w, e.h, e.radio); ctx.fillStyle = '#ffffff'; ctx.fill(); }
      quitarSombra(ctx);
      ctx.save();
      caminoFigura(ctx, marco, x, y, e.w, e.h, e.radio); ctx.clip();
      if (img) dibujarImagen(ctx, img, x, y, e.w, e.h, e.ajuste || 'contener', e.encuadre);
      else if (editor) {
        // Un marco vacío (o una foto que ya no se puede usar): en el editor, para soltar ahí otra.
        ctx.fillStyle = '#E7E3F3'; ctx.fillRect(x, y, e.w, e.h);
        const s = Math.min(e.w, e.h) * 0.22;
        ctx.fillStyle = '#9C91C7';
        ctx.beginPath(); ctx.moveTo(-s, s * 0.6); ctx.lineTo(-s * 0.3, -s * 0.3); ctx.lineTo(s * 0.15, s * 0.25); ctx.lineTo(s * 0.45, -s * 0.05); ctx.lineTo(s, s * 0.6); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.45, -s * 0.5, s * 0.18, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      if (e.borde && e.grosor) { caminoFigura(ctx, marco, x, y, e.w, e.h, e.radio); ctx.strokeStyle = e.borde; ctx.lineWidth = e.grosor; ctx.stroke(); }
    } else if (e.tipo === 'tabla') {
      pintarTabla(ctx, e, x, y, t => rellenar(t, variables));
    } else if (e.tipo === 'grafico') {
      quitarSombra(ctx);
      pintarGrafico(ctx, e, x, y);
    } else if (e.tipo === 'texto') {
      pintarTexto(ctx, e, rellenar(e.texto, variables), x, y, an?.letras ?? null, variables);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
    } catch (err) { console.warn('[diseño] no se ha podido pintar un elemento', e.id, err?.message); }
    ctx.restore();
  }
  ctx.restore();
}

// ── Cambiar de tamaño «con magia»: lo mismo, en otro tamaño ─────────────────
// Cada cosa conserva su sitio relativo (lo que toca un borde sigue pegado a él)
// y su proporción, a la escala del lado que menos crece; lo que ocupa el lienzo
// de lado a lado (un fondo, una franja) se estira; y los textos aprovechan el
// ancho que ganan, con la letra a escala. Todas las páginas.
const CUADRADOS = ['qr', 'icono'];
function adaptarElementos(elementos, d, ancho, alto, variables) {
  const sx = ancho / d.ancho, sy = alto / d.alto, k = Math.min(sx, sy);
  const eje = (pos, tam, total, nuevo, nuevoTotal, s) => {
    const antes = pos, despues = total - (pos + tam), pegado = total * 0.02;
    if (antes >= 0 && antes <= pegado) return antes * k;
    if (despues >= 0 && despues <= pegado) return nuevoTotal - nuevo - despues * k;
    return (pos + tam / 2) * s - nuevo / 2;
  };
  return (elementos || []).map(e => {
    const todoAncho = e.w >= d.ancho * 0.95, todoAlto = e.h >= d.alto * 0.95;
    const dentro = e.x >= 0 && e.y >= 0 && e.x + e.w <= d.ancho + 1 && e.y + e.h <= d.alto + 1;
    let n = { ...e };
    for (const p of ['radio', 'espaciado', 'contornoGrosor', 'resalteMargen', 'sombraX', 'sombraY', 'sombraDifu']) if (e[p]) n[p] = Math.round(e[p] * k * 10) / 10;
    if (e.tamano) n.tamano = Math.max(6, Math.round(e.tamano * k));
    if (e.grosor) n.grosor = Math.max(1, Math.round(e.grosor * k));
    if (e.tipo === 'texto' || e.tipo === 'tabla') {
      n.w = Math.round(Math.max(e.w * k, Math.min(e.w * sx, ancho * 0.94)));
      if (e.margenCelda) n.margenCelda = Math.round(e.margenCelda * k);
      n = ajustarTexto(n, variables);
    } else if (e.tipo === 'linea') {
      n.w = Math.round(todoAncho ? e.w * sx : e.w * k); n.h = Math.max(16, Math.round(e.h * k));
    } else if (CUADRADOS.includes(e.tipo)) {
      n.w = n.h = Math.round(Math.min(e.w, e.h) * k);
    } else {
      n.w = Math.round(todoAncho ? e.w * sx : e.w * k); n.h = Math.round(todoAlto ? e.h * sy : e.h * k);
      if (e.tipo === 'imagen' && todoAncho && todoAlto && !e.encuadre) n.ajuste = 'cubrir';
    }
    n.x = Math.round(eje(e.x, e.w, d.ancho, n.w, ancho, sx));
    n.y = Math.round(eje(e.y, e.h, d.alto, n.h, alto, sy));
    if (dentro) { n.x = Math.max(0, Math.min(n.x, ancho - n.w)); n.y = Math.max(0, Math.min(n.y, alto - n.h)); }
    return n;
  });
}
export function adaptarDiseno(d, ancho, alto, variables = null) {
  return {
    ...d, ancho, alto, elementos: adaptarElementos(d.elementos, d, ancho, alto, variables),
    ...(d.paginas ? { paginas: d.paginas.map(p => ({ ...p, elementos: adaptarElementos(p.elementos, d, ancho, alto, variables) })) } : {}),
  };
}

// Pinta una página en un canvas nuevo (para exportar o miniaturas).
export async function lienzoDe(diseno, { variables = null, ancho = null, tiempo = null, sinFondo = false } = {}) {
  await cargarFuentes(diseno);
  const imagenes = await cargarImagenes(diseno);
  const k = ancho ? ancho / diseno.ancho : 1;
  const c = crearLienzo(Math.round(diseno.ancho * k), Math.round(diseno.alto * k));
  const ctx = c.getContext('2d');
  ctx.scale(k, k);
  pintarDiseno(ctx, diseno, { imagenes, variables, tiempo, sinFondo });
  return c;
}
export const miniatura = async (diseno, variables) => (await lienzoDe(diseno, { variables, ancho: 420 })).toDataURL('image/jpeg', 0.8);

export const nombreArchivo = (t) => String(t || 'diseno').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'diseno';
export function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 20000);
}
// Un PDF del tamaño del diseño (A4/A3 si lo es) y cómo se le añade otra página.
async function pdfPara(diseno) {
  const { jsPDF } = await import('jspdf');
  const t = TAMANOS.find(x => x.ancho === diseno.ancho && x.alto === diseno.alto)?.pdf;
  const orientacion = diseno.ancho >= diseno.alto ? 'landscape' : 'portrait';
  const doc = t ? new jsPDF({ orientation: t.orientacion, unit: 'mm', format: t.formato })
    : new jsPDF({ orientation: orientacion, unit: 'px', format: [diseno.ancho, diseno.alto], hotfixes: ['px_scaling'] });
  const otra = () => (t ? doc.addPage(t.formato, t.orientacion) : doc.addPage([diseno.ancho, diseno.alto], orientacion));
  return { doc, otra, pw: doc.internal.pageSize.getWidth(), ph: doc.internal.pageSize.getHeight() };
}
// Exporta: 'png', 'jpg' o 'pdf'. Con `escala` (1, 2) para PNG/JPG más grandes.
// El PDF lleva todas las páginas; en PNG/JPG, `pagina` (o todas, una por archivo).
export async function exportarDiseno(diseno, formato, nombre, { variables = null, escala = 1, pagina = null, sinFondo = false } = {}) {
  const base = nombreArchivo(nombre), n = numPaginas(diseno);
  if (formato === 'png' || formato === 'jpg') {
    const paginas = pagina != null ? [pagina] : Array.from({ length: n }, (_, i) => i);
    for (const i of paginas) {
      const v = paginaDe(diseno, i);
      const c = await lienzoDe(v, { variables, ancho: Math.round(v.ancho * escala), sinFondo: sinFondo && formato === 'png' });
      const blob = await new Promise(r => c.toBlob(r, formato === 'png' ? 'image/png' : 'image/jpeg', 0.92));
      descargar(blob, `${base}${n > 1 ? `-${i + 1}` : ''}.${formato}`);
      if (paginas.length > 1) await new Promise(r => setTimeout(r, 400));
    }
    return;
  }
  const { doc, otra, pw, ph } = await pdfPara(diseno);
  for (let i = 0; i < n; i++) {
    if (i) otra();
    const c = await lienzoDe(paginaDe(diseno, i), { variables });
    doc.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pw, ph);
  }
  doc.save(`${base}.pdf`);
}
// Diplomas en lote: un solo PDF con las páginas del diseño para cada persona.
export async function exportarLote(diseno, listaVariables, nombre, onProgreso) {
  const { doc, otra, pw, ph } = await pdfPara(diseno);
  const n = numPaginas(diseno);
  for (let i = 0; i < listaVariables.length; i++) {
    for (let p = 0; p < n; p++) {
      if (i || p) otra();
      const c = await lienzoDe(paginaDe(diseno, p), { variables: listaVariables[i] });
      doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pw, ph);
    }
    onProgreso?.(i + 1, listaVariables.length);
  }
  doc.save(`${nombreArchivo(nombre)}.pdf`);
}

// ── PDF de imprenta ─────────────────────────────────────────────────────────
// A 300 ppp, con 3 mm de sangrado (lo que llega al borde se alarga hasta el
// sangrado) y marcas de corte en las esquinas, fuera del sangrado. Los A4 y
// A3 a su medida; lo demás, a 150 ppp de su tamaño en píxeles.
export const SANGRADO_MM = 3;
export function medidasImprenta(diseno) {
  const t = TAMANOS.find(x => x.ancho === diseno.ancho && x.alto === diseno.alto)?.pdf;
  if (t) { const [a, b] = MM_PAPEL[t.formato]; return t.orientacion === 'landscape' ? [b, a] : [a, b]; }
  return [Math.round((diseno.ancho / 150) * 25.4), Math.round((diseno.alto / 150) * 25.4)];
}
export async function exportarImprenta(diseno, nombre, { variables = null, onProgreso } = {}) {
  const { jsPDF } = await import('jspdf');
  const [wmm, hmm] = medidasImprenta(diseno), S = SANGRADO_MM, M = 12;
  const pw = wmm + 2 * M, ph = hmm + 2 * M, orient = pw >= ph ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation: orient, unit: 'mm', format: [pw, ph] });
  const ppmm = 300 / 25.4, W = Math.round(wmm * ppmm), H = Math.round(hmm * ppmm), B = Math.round(S * ppmm);
  const n = numPaginas(diseno);
  for (let i = 0; i < n; i++) {
    if (i) doc.addPage([pw, ph], orient);
    const base = await lienzoDe(paginaDe(diseno, i), { variables, ancho: W });
    const c = document.createElement('canvas'); c.width = W + 2 * B; c.height = H + 2 * B;
    const g = c.getContext('2d');
    g.drawImage(base, B, B, W, H);
    // El sangrado: el borde del diseño, alargado hacia fuera.
    g.drawImage(base, 0, 0, 1, base.height, 0, B, B, H);
    g.drawImage(base, base.width - 1, 0, 1, base.height, B + W, B, B, H);
    g.drawImage(c, 0, B, c.width, 1, 0, 0, c.width, B);
    g.drawImage(c, 0, B + H - 1, c.width, 1, 0, B + H, c.width, B);
    doc.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', M - S, M - S, wmm + 2 * S, hmm + 2 * S);
    // Marcas de corte: desde 1 mm fuera del sangrado hasta 1 mm antes del borde de la hoja.
    doc.setDrawColor(0); doc.setLineWidth(0.1);
    const dentro = M - S - 1;
    for (const x of [M, M + wmm]) for (const y of [M, M + hmm]) {
      const sx = x === M ? -1 : 1, sy = y === M ? -1 : 1;
      doc.line(x + sx * (S + 1), y, x + sx * (S + 1 + dentro - 1), y);
      doc.line(x, y + sy * (S + 1), x, y + sy * (S + 1 + dentro - 1));
    }
    doc.setFontSize(6); doc.setTextColor(90);
    doc.text(`${nombre} · ${n > 1 ? `página ${i + 1} de ${n} · ` : ''}${wmm} × ${hmm} mm al corte · ${S} mm de sangrado · RGB`, M, ph - 4);
    onProgreso?.(i + 1, n);
  }
  doc.save(`${nombreArchivo(nombre)}-imprenta.pdf`);
}
