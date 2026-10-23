// ─────────────────────────────────────────────────────────────────────────────
// Estilos: cambiar de una vez los colores y las letras de todo un diseño.
//
// Colores: se ordenan los que usa el diseño por lo que ocupan (el fondo, lo
// grande, lo pequeño) y a cada uno se le da uno de la paleta, en orden; un texto
// que quedaría sin contraste con su fondo pasa al color de la paleta (o blanco o
// negro) que mejor se lee. Letras: los títulos (en negrita o grandes) llevan la
// de títulos y el resto, la de texto. Los códigos QR no se tocan.
// ─────────────────────────────────────────────────────────────────────────────
import { numPaginas, paginaDe, conPagina, ajustarTexto } from './render.js';
import { COLORES_GRAFICO } from './tablas.js';

export const PALETAS_LISTAS = [
  { nombre: 'El club', colores: ['#5233A8', '#FF5FA2', '#F99B35', '#FFD526', '#21B668', '#00BBF4'] },
  { nombre: 'Noche', colores: ['#17151C', '#5233A8', '#FF5FA2', '#FFFFFF'] },
  { nombre: 'Pastel', colores: ['#FFF6D6', '#FFE3F1', '#D9F2FF', '#5233A8', '#374151'] },
  { nombre: 'Verano', colores: ['#21B668', '#00BBF4', '#FFD526', '#FFFFFF', '#1A1A1A'] },
  { nombre: 'Elegante', colores: ['#F6F4EF', '#1A1A1A', '#C9A227', '#FFFFFF'] },
  { nombre: 'Navidad', colores: ['#B91C1C', '#166534', '#F6F4EF', '#C9A227', '#FFFFFF'] },
  { nombre: 'Otoño', colores: ['#FFF7ED', '#C2410C', '#92400E', '#F59E0B', '#1C1917'] },
  { nombre: 'Mar', colores: ['#E0F2FE', '#0369A1', '#0EA5E9', '#FFFFFF', '#0C4A6E'] },
];
export const PARES_LETRAS = [
  { nombre: 'Moderna', titulos: { fuente: 'Plus Jakarta Sans' }, texto: { fuente: 'Montserrat' } },
  { nombre: 'Cartel', titulos: { fuente: 'Bebas Neue' }, texto: { fuente: 'Montserrat' } },
  { nombre: 'Elegante', titulos: { fuente: 'Playfair Display' }, texto: { fuente: 'Lora' } },
  { nombre: 'Divertida', titulos: { fuente: 'Pacifico' }, texto: { fuente: 'Montserrat' } },
  { nombre: 'Deportiva', titulos: { fuente: 'Oswald' }, texto: { fuente: 'Montserrat' } },
  { nombre: 'Clásica', titulos: { fuente: 'Georgia' }, texto: { fuente: 'Georgia' } },
];

const hex = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toUpperCase() : /^#[0-9a-f]{3}$/i.test(String(c || '')) ? `#${c.slice(1).split('').map(x => x + x).join('')}`.toUpperCase() : null);
function luminancia(c) {
  const h = hex(c); if (!h) return 1;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contraste = (a, b) => { const x = luminancia(a), y = luminancia(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Un color entre dos (t = 0, el primero; 1, el segundo).
function mezcla(a, b, t) {
  const ha = hex(a) || '#FFFFFF', hb = hex(b) || '#FFFFFF';
  const c = [1, 3, 5].map(i => Math.round(parseInt(ha.slice(i, i + 2), 16) * (1 - t) + parseInt(hb.slice(i, i + 2), 16) * t));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
const elQueSeLee = (fondo, colores) => [...colores, '#FFFFFF', '#1A1A1A'].reduce((m, c) => (contraste(c, fondo) > contraste(m, fondo) ? c : m), '#1A1A1A');

// Los colores de un diseño, de más a menos «peso».
export function coloresDe(d) {
  const peso = new Map(), suma = (c, p) => { const h = hex(c); if (h) peso.set(h, (peso.get(h) || 0) + p); };
  for (let i = 0; i < numPaginas(d); i++) {
    const v = paginaDe(d, i);
    if (v.fondo?.tipo !== 'imagen') { suma(v.fondo?.color, d.ancho * d.alto); suma(v.fondo?.color2, d.ancho * d.alto * 0.5); }
    for (const e of v.elementos) {
      if (e.tipo === 'qr' || e.tipo === 'imagen') continue;
      const area = e.w * e.h;
      if (e.tipo === 'texto') { suma(e.color, (e.tamano || 48) ** 2 * String(e.texto || '').length * 0.3); suma(e.resalte, area * 0.5); suma(e.contorno, area * 0.1); }
      else if (e.tipo === 'tabla') { suma(e.fondoCabecera || '#5233A8', area * 0.2); suma(e.fondoFilas, area * 0.5); suma(e.fondoRayas, area * 0.3); suma(e.color, area * 0.1); }
      else if (e.tipo === 'grafico') (e.colores?.length ? e.colores : COLORES_GRAFICO).forEach(x => suma(x, area / 6));
      else if (e.tipo === 'linea' || e.tipo === 'icono') suma(e.color, area * 0.3);
      else { suma(e.relleno, area); suma(e.relleno2, area * 0.5); if (e.grosor) suma(e.borde, (e.w + e.h) * e.grosor); }
    }
  }
  return [...peso.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

// paleta: lista de colores (o null para no tocarlos); letras: { titulos, texto } (o null).
export function aplicarEstilo(d, { paleta = null, letras = null, giro = 0 } = {}) {
  const base = Math.min(d.ancho, d.alto);
  const mapa = new Map();
  if (paleta?.length) {
    const p = paleta.map(hex).filter(Boolean), n = p.length;
    coloresDe(d).forEach((c, i) => mapa.set(c, p[(i + giro) % n]));
  }
  const nuevo = (c) => { const h = hex(c); return h && mapa.has(h) ? mapa.get(h) : c; };
  let r = d;
  for (let i = 0; i < numPaginas(d); i++) {
    const v = paginaDe(r, i);
    const fondo = v.fondo?.tipo === 'imagen' || !paleta ? v.fondo : { ...v.fondo, color: nuevo(v.fondo?.color), ...(v.fondo?.color2 ? { color2: nuevo(v.fondo.color2) } : {}) };
    const colorFondo = fondo?.tipo === 'imagen' ? '#808080' : fondo?.color || '#FFFFFF';
    const elementos = v.elementos.map(e => {
      if (e.tipo === 'qr') return e;
      let n = { ...e };
      if (paleta) {
        for (const k of ['color', 'relleno', 'relleno2', 'borde', 'contorno', 'resalte', 'fondoCabecera', 'fondoFilas', 'fondoRayas']) if (n[k]) n[k] = nuevo(n[k]);
        if (n.tipo === 'tabla') {
          // Que la cabecera se distinga de las filas, las rayas sean suaves y todo se lea.
          const p = paleta.map(hex).filter(Boolean), filas = n.fondoFilas && n.fondoFilas !== 'transparent' ? n.fondoFilas : colorFondo;
          n.fondoCabecera = nuevo(n.fondoCabecera || '#5233A8');
          if (contraste(n.fondoCabecera, filas) < 1.6) n.fondoCabecera = p.reduce((m, x) => (contraste(x, filas) > contraste(m, filas) ? x : m), n.fondoCabecera);
          if (contraste(n.colorCabecera || '#FFFFFF', n.fondoCabecera) < 3) n.colorCabecera = elQueSeLee(n.fondoCabecera, p);
          if (contraste(n.color || '#1A1A1A', filas) < 3) n.color = elQueSeLee(filas, p);
          if (n.rayas) n.fondoRayas = mezcla(filas, n.fondoCabecera, 0.12);
        }
        if (n.tipo === 'grafico') n.colores = (n.colores?.length ? n.colores : COLORES_GRAFICO).map(nuevo);
        // Que el texto se lea: sobre su fondo (lo que tenga detrás o el de la página).
        if ((n.tipo === 'texto' || n.tipo === 'icono') && n.color) {
          const detras = n.resalte && n.resalte !== 'transparent' ? n.resalte : colorFondo;
          if (contraste(n.color, detras) < 3) n.color = elQueSeLee(detras, paleta.map(hex).filter(Boolean));
        }
      }
      if (letras && n.tipo === 'texto') {
        const titulo = n.negrita || (n.tamano || 48) >= base * 0.055;
        const l = titulo ? letras.titulos : letras.texto;
        if (l?.fuente) { n.fuente = l.fuente; if (l.url) n.fuenteUrl = l.url; else delete n.fuenteUrl; n = ajustarTexto(n); }
      }
      return n;
    });
    r = conPagina(r, i, { ...v, fondo, elementos });
  }
  return r;
}
