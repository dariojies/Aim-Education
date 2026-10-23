// ─────────────────────────────────────────────────────────────────────────────
// Buscar y cambiar texto en todo el diseño (todas las páginas): los textos, las
// celdas de las tablas y los nombres de los gráficos.
//
// Un texto con partes de otro estilo se cambia parte a parte: si lo buscado
// cae entre dos estilos (media palabra en negrita), esa vez no se cambia y se
// cuenta aparte, para avisar.
// ─────────────────────────────────────────────────────────────────────────────
import { numPaginas, paginaDe, conPagina } from './render.js';

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patron = (q, mayus) => new RegExp(escapar(q), mayus ? 'g' : 'gi');

// Los textos de un elemento: [dónde, texto].
const textosDe = (e) => (e.tipo === 'texto' ? [['texto', e.texto || '']]
  : e.tipo === 'tabla' ? (e.celdas || []).flatMap((f, i) => f.map((c, j) => [`celda ${i + 1}·${j + 1}`, c || '']))
    : e.tipo === 'grafico' ? (e.datos || []).map((x, i) => [`dato ${i + 1}`, x.etiqueta || '']) : []);

// Dónde sale: [{ pagina, id, tipo, donde, antes, hallado, despues, fijo }].
export function buscarTexto(doc, q, { mayus = false, fijo = () => false } = {}) {
  if (!q) return [];
  const re = patron(q, mayus), salen = [];
  for (let p = 0; p < numPaginas(doc); p++) {
    for (const e of paginaDe(doc, p).elementos) {
      for (const [donde, t] of textosDe(e)) {
        for (const m of t.matchAll(re)) {
          salen.push({ pagina: p, id: e.id, tipo: e.tipo, donde, fijo: fijo(e),
            antes: t.slice(Math.max(0, m.index - 24), m.index), hallado: m[0], despues: t.slice(m.index + m[0].length, m.index + m[0].length + 24) });
        }
      }
    }
  }
  return salen;
}

// Cambiarlo todo. saltar(e): lo que no se toca (lo fijo); ajustar(e): el alto de los textos.
export function reemplazarTexto(doc, q, por, { mayus = false, saltar = () => false, ajustar = (e) => e } = {}) {
  if (!q) return { doc, cambios: 0, sinCambiar: 0, fijas: 0 };
  const re = patron(q, mayus);
  const cuenta = (t) => (String(t || '').match(re) || []).length;
  const cambia = (t) => String(t ?? '').replace(re, () => por);
  let r = doc, cambios = 0, sinCambiar = 0, fijas = 0;
  for (let p = 0; p < numPaginas(doc); p++) {
    const v = paginaDe(r, p);
    let tocado = false;
    const elementos = v.elementos.map(e => {
      const n = textosDe(e).reduce((s, [, t]) => s + cuenta(t), 0);
      if (!n) return e;
      if (saltar(e)) { fijas += n; return e; }
      let x;
      if (e.tipo === 'texto' && e.trozos?.length) {
        const hechos = e.trozos.reduce((s, t) => s + cuenta(t.t), 0);
        sinCambiar += n - hechos;
        if (!hechos) return e;
        const trozos = e.trozos.map(t => ({ ...t, t: cambia(t.t) }));
        x = { ...e, trozos, texto: trozos.map(t => t.t).join('') };
        cambios += hechos;
      } else {
        x = e.tipo === 'texto' ? { ...e, texto: cambia(e.texto) }
          : e.tipo === 'tabla' ? { ...e, celdas: e.celdas.map(f => f.map(cambia)) }
            : { ...e, datos: e.datos.map(d => ({ ...d, etiqueta: cambia(d.etiqueta) })) };
        cambios += n;
      }
      tocado = true;
      return ajustar(x);
    });
    if (tocado) r = conPagina(r, p, { ...v, elementos });
  }
  return { doc: r, cambios, sinCambiar, fijas };
}
