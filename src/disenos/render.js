// ─────────────────────────────────────────────────────────────────────────────
// Diseños (el «Canva» del club): cómo se pinta un diseño. Una sola función,
// pintarDiseno, la usan el editor, las exportaciones (PNG, JPG, PDF) y el
// diploma de cada alumno del aula: lo que se ve al diseñar es lo que sale.
//
// Un diseño: { ancho, alto, fondo, elementos: [...] } en píxeles del propio
// diseño. Cada elemento tiene su caja (x, y, w, h), su giro (rot, en grados,
// alrededor del centro) y su opacidad; los textos pueden llevar huecos como
// {alumno} que se rellenan al exportar (diplomas).
// ─────────────────────────────────────────────────────────────────────────────

// Tamaños listos. Los A4/A3 a 150 ppp (de sobra para imprimir y no pesan).
export const TAMANOS = [
  { id: 'a4h', nombre: 'A4 apaisado', ancho: 1754, alto: 1240, pdf: { formato: 'a4', orientacion: 'landscape' } },
  { id: 'a4v', nombre: 'A4 vertical', ancho: 1240, alto: 1754, pdf: { formato: 'a4', orientacion: 'portrait' } },
  { id: 'a3v', nombre: 'Cartel A3', ancho: 1754, alto: 2480, pdf: { formato: 'a3', orientacion: 'portrait' } },
  { id: 'ig', nombre: 'Post de Instagram', ancho: 1080, alto: 1080 },
  { id: 'igv', nombre: 'Instagram vertical', ancho: 1080, alto: 1350 },
  { id: 'historia', nombre: 'Historia (Instagram, WhatsApp)', ancho: 1080, alto: 1920 },
  { id: 'fb', nombre: 'Portada de Facebook', ancho: 1640, alto: 624 },
  { id: 'pres', nombre: 'Presentación 16:9', ancho: 1920, alto: 1080 },
];

// Fuentes: las de la web, las de siempre y unas de Google para carteles y diplomas.
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
];
export const EJEMPLO_DIPLOMA = Object.fromEntries(VARIABLES_DIPLOMA.map(v => [v.id, v.ejemplo]));
export const rellenar = (texto, variables) => (variables
  ? String(texto ?? '').replace(/\{(\w+)\}/g, (m, k) => (variables[k] != null ? String(variables[k]) : m))
  : String(texto ?? ''));

let id = 0;
export const nuevoId = () => `e${Date.now().toString(36)}${(id++).toString(36)}`;

// ── Cargar lo que hace falta antes de pintar ────────────────────────────────
let fuentesPedidas = false;
export async function cargarFuentes(diseno) {
  if (typeof document === 'undefined') return;
  const usadas = new Set((diseno?.elementos || []).filter(e => e.tipo === 'texto').map(e => e.fuente || 'Montserrat'));
  if (!fuentesPedidas && [...usadas].some(f => FUENTES_DISENO.find(x => x.id === f)?.google)) {
    fuentesPedidas = true;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = URL_FUENTES; document.head.appendChild(l);
    await new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 4000); });
  }
  await Promise.all((diseno?.elementos || []).filter(e => e.tipo === 'texto').map(e =>
    document.fonts?.load?.(`${e.cursiva ? 'italic ' : ''}${e.negrita ? 700 : 400} 40px "${e.fuente || 'Montserrat'}"`).catch(() => null)));
}
// Pide las fuentes de Google ya (para el editor: que se vean al elegirlas).
export function pedirFuentes() {
  if (fuentesPedidas || typeof document === 'undefined') return;
  fuentesPedidas = true;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = URL_FUENTES; document.head.appendChild(l);
}

const cacheImg = new Map();
export function cargarImagen(url) {
  if (!url) return Promise.resolve(null);
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

// ── Pintar ───────────────────────────────────────────────────────────────────
function caminoRedondeado(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y); ctx.closePath();
}
function degradado(ctx, x0, y0, w, h, c1, c2, angulo = 135) {
  const a = (angulo - 90) * Math.PI / 180, cx = x0 + w / 2, cy = y0 + h / 2;
  const L = Math.abs(w * Math.cos(a)) / 2 + Math.abs(h * Math.sin(a)) / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(a) * L, cy - Math.sin(a) * L, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
  g.addColorStop(0, c1 || '#5233A8'); g.addColorStop(1, c2 || '#21B668');
  return g;
}
function dibujarImagen(ctx, img, x, y, w, h, ajuste = 'cubrir') {
  if (!img) return;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
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

export function pintarDiseno(ctx, diseno, { imagenes = new Map(), variables = null, ocultar = null } = {}) {
  const { ancho: W, alto: H } = diseno;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  const f = diseno.fondo || { tipo: 'color', color: '#ffffff' };
  if (f.tipo === 'degradado') ctx.fillStyle = degradado(ctx, 0, 0, W, H, f.color, f.color2, f.angulo);
  else ctx.fillStyle = f.color || '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (f.tipo === 'imagen') {
    ctx.globalAlpha = f.opacidad ?? 1;
    dibujarImagen(ctx, imagenes.get(f.url), 0, 0, W, H, 'cubrir');
    ctx.globalAlpha = 1;
  }
  for (const e of diseno.elementos || []) {
    if (e.oculto || e.id === ocultar) continue;
    ctx.save();
    ctx.globalAlpha = e.opacidad ?? 1;
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    if (e.rot) ctx.rotate(e.rot * Math.PI / 180);
    const x = -e.w / 2, y = -e.h / 2;
    if (e.sombra) { ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8; }
    if (e.tipo === 'rect' || e.tipo === 'elipse') {
      if (e.tipo === 'rect') caminoRedondeado(ctx, x, y, e.w, e.h, e.radio);
      else { ctx.beginPath(); ctx.ellipse(0, 0, Math.abs(e.w / 2), Math.abs(e.h / 2), 0, 0, Math.PI * 2); }
      if (e.relleno && e.relleno !== 'transparent') { ctx.fillStyle = e.relleno2 ? degradado(ctx, x, y, e.w, e.h, e.relleno, e.relleno2, e.angulo) : e.relleno; ctx.fill(); }
      ctx.shadowColor = 'transparent';
      if (e.borde && e.grosor) { ctx.strokeStyle = e.borde; ctx.lineWidth = e.grosor; ctx.stroke(); }
    } else if (e.tipo === 'linea') {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + e.w, 0);
      ctx.strokeStyle = e.color || '#1A1A1A'; ctx.lineWidth = e.grosor || 4; ctx.lineCap = 'round';
      if (e.discontinua) ctx.setLineDash([e.grosor * 3, e.grosor * 2.5]);
      ctx.stroke();
    } else if (e.tipo === 'imagen') {
      ctx.save();
      caminoRedondeado(ctx, x, y, e.w, e.h, e.radio); ctx.clip();
      dibujarImagen(ctx, imagenes.get(e.url), x, y, e.w, e.h, e.ajuste || 'contener');
      ctx.restore();
    } else if (e.tipo === 'texto') {
      const texto = rellenar(e.texto, variables);
      const lineas = lineasTexto(ctx, e, texto);
      const lh = (e.tamano || 48) * (e.interlineado || 1.25);
      ctx.fillStyle = e.color || '#1A1A1A';
      ctx.textBaseline = 'top';
      ctx.textAlign = e.alinear === 'centro' ? 'center' : e.alinear === 'derecha' ? 'right' : 'left';
      const tx = e.alinear === 'centro' ? 0 : e.alinear === 'derecha' ? e.w / 2 : x;
      // Centrado en vertical dentro de su caja.
      const alto = lineas.length * lh;
      let ty = e.vertical === 'arriba' ? y : y + (e.h - alto) / 2;
      for (const l of lineas) { ctx.fillText(l, tx, ty + (lh - (e.tamano || 48)) / 2); ty += lh; }
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
    ctx.restore();
  }
  ctx.restore();
}

// Pinta el diseño entero en un canvas nuevo (para exportar o miniaturas).
export async function lienzoDe(diseno, { variables = null, ancho = null } = {}) {
  await cargarFuentes(diseno);
  const imagenes = await cargarImagenes(diseno);
  const k = ancho ? ancho / diseno.ancho : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(diseno.ancho * k); c.height = Math.round(diseno.alto * k);
  const ctx = c.getContext('2d');
  ctx.scale(k, k);
  pintarDiseno(ctx, diseno, { imagenes, variables });
  return c;
}
export const miniatura = async (diseno, variables) => (await lienzoDe(diseno, { variables, ancho: 420 })).toDataURL('image/jpeg', 0.8);

const nombreArchivo = (t) => String(t || 'diseno').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'diseno';
function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 20000);
}
// Exporta: 'png', 'jpg' o 'pdf'. Con `escala` (1, 2) para PNG/JPG más grandes.
export async function exportarDiseno(diseno, formato, nombre, { variables = null, escala = 1 } = {}) {
  const c = await lienzoDe(diseno, { variables, ancho: Math.round(diseno.ancho * escala) });
  const base = nombreArchivo(nombre);
  if (formato === 'png' || formato === 'jpg') {
    const blob = await new Promise(r => c.toBlob(r, formato === 'png' ? 'image/png' : 'image/jpeg', 0.92));
    descargar(blob, `${base}.${formato}`);
    return;
  }
  const { jsPDF } = await import('jspdf');
  const t = TAMANOS.find(x => x.ancho === diseno.ancho && x.alto === diseno.alto)?.pdf;
  const doc = t ? new jsPDF({ orientation: t.orientacion, unit: 'mm', format: t.formato })
    : new jsPDF({ orientation: diseno.ancho >= diseno.alto ? 'landscape' : 'portrait', unit: 'px', format: [diseno.ancho, diseno.alto], hotfixes: ['px_scaling'] });
  const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
  doc.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pw, ph);
  doc.save(`${base}.pdf`);
}
