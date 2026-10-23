// ─────────────────────────────────────────────────────────────────────────────
// Traducir un diseño (una copia en otro idioma): los textos, las celdas de las
// tablas y los nombres de los gráficos. Primero con el traductor que trae el
// propio navegador (Chrome: se hace dentro del ordenador, gratis); si no hay,
// con el del servidor (MyMemory, gratis y sin cuenta).
//
// Los huecos ({alumno}…) y los saltos de línea no se traducen: se traduce lo de
// entre medias. «Taekwon-Do» se queda escrito así. Las partes con otro estilo de un texto se pierden (se traduce
// la frase entera, que es como queda bien).
// ─────────────────────────────────────────────────────────────────────────────
import { numPaginas, paginaDe, conPagina, ajustarTexto } from './render.js';

export const IDIOMAS = [['en', 'Inglés'], ['fr', 'Francés'], ['de', 'Alemán'], ['it', 'Italiano'], ['pt', 'Portugués']];
const SEPARA = /(\{\w+\}|\n)/;
const SIGNO = /[.,;:!?¡¿…]$/;

// Lo que los traductores hacen con una frase suelta: la mayúscula del principio
// a su manera, un punto o una coma de más… y algo de vocabulario del club.
function retocar(origen, sale, a) {
  let t = String(sale || '').trim() || origen;
  // El signo del final, el del original (o ninguno).
  const fin = origen.match(SIGNO)?.[0];
  if (!fin) t = t.replace(/\s*[.,;:]$/, '');
  else if (/[.,;:]$/.test(t) && /[.,;:]/.test(fin)) t = t.slice(0, -1) + fin;
  const ini = origen.charAt(0);
  if (ini && ini === ini.toUpperCase() && ini !== ini.toLowerCase()) t = t.charAt(0).toUpperCase() + t.slice(1);
  else if (ini && ini === ini.toLowerCase() && ini !== ini.toUpperCase()) t = t.charAt(0).toLowerCase() + t.slice(1);
  t = t.replace(/taekwon[- ]?do/gi, 'Taekwon-Do');
  if (a === 'en') t = t.replace(/\b(S|s)eat (b|B)elt(s?)\b/g, (_, s1, b1, pl) => (s1 === 'S' ? 'B' : 'b') + 'elt' + pl);
  return t;
}

async function traductor(a) {
  try {
    if (typeof self !== 'undefined' && 'Translator' in self) {
      const disp = await self.Translator.availability({ sourceLanguage: 'es', targetLanguage: a });
      if (disp && disp !== 'unavailable') {
        const t = await self.Translator.create({ sourceLanguage: 'es', targetLanguage: a });
        return async (lista) => Promise.all(lista.map(x => t.translate(x)));
      }
    }
  } catch { /* sin traductor del navegador */ }
  return async (lista) => {
    const r = await fetch('/api/admin/disenos/traducir', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ textos: lista, a }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'No se ha podido traducir.');
    return d.traducciones;
  };
}

export async function traducirDiseno(doc, a, { variables, onProgreso } = {}) {
  // Lo que hay que traducir, sin repetir.
  const trozosDe = (t) => String(t ?? '').split(SEPARA);
  const textos = new Set();
  const mirar = (t) => trozosDe(t).forEach(x => { if (x.trim() && !SEPARA.test(x)) textos.add(x.trim()); });
  for (let i = 0; i < numPaginas(doc); i++) {
    for (const e of paginaDe(doc, i).elementos) {
      if (e.tipo === 'texto') mirar(e.texto);
      if (e.tipo === 'tabla') (e.celdas || []).flat().forEach(mirar);
      if (e.tipo === 'grafico') (e.datos || []).forEach(d => mirar(d.etiqueta));
    }
  }
  const lista = [...textos], traducir = await traductor(a), hecho = new Map();
  for (let i = 0; i < lista.length; i += 20) {
    const parte = lista.slice(i, i + 20), sale = await traducir(parte);
    parte.forEach((x, j) => hecho.set(x, retocar(x, sale[j], a)));
    onProgreso?.(Math.min(lista.length, i + 20), lista.length);
  }
  const pasar = (t) => trozosDe(t).map(x => (x.trim() && !SEPARA.test(x) ? x.replace(x.trim(), hecho.get(x.trim()) || x.trim()) : x)).join('');
  let r = doc;
  for (let i = 0; i < numPaginas(doc); i++) {
    const v = paginaDe(r, i);
    r = conPagina(r, i, { ...v, elementos: v.elementos.map(e => {
      if (e.tipo === 'texto') { const { trozos, ...resto } = e; return ajustarTexto({ ...resto, texto: pasar(e.texto) }, variables); } // eslint-disable-line no-unused-vars
      if (e.tipo === 'tabla') return ajustarTexto({ ...e, celdas: (e.celdas || []).map(f => f.map(pasar)) }, variables);
      if (e.tipo === 'grafico') return { ...e, datos: (e.datos || []).map(d => ({ ...d, etiqueta: pasar(d.etiqueta) })) };
      return e;
    }) });
  }
  return r;
}
