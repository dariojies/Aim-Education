// ─────────────────────────────────────────────────────────────────────────────
// Editar a varias manos: qué ha cambiado entre dos versiones de un diseño
// (elemento a elemento) y cómo se aplica eso al diseño de otro navegador.
//
// Se mandan solo los elementos tocados, los borrados y el orden; al aplicarlo
// no se pierde lo que el otro haya añadido a la vez (lo que no está en el orden
// que llega se queda al final). Si cambia el número de páginas, va el diseño
// entero.
// ─────────────────────────────────────────────────────────────────────────────
import { numPaginas, paginaDe, conPagina } from './render.js';

const metaDe = (d) => { const { fondo, elementos, paginas, ...m } = d; return m; }; // eslint-disable-line no-unused-vars
const igual = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

export function diferencias(a, b) {
  if (!a || !b || a === b) return [];
  if (numPaginas(a) !== numPaginas(b)) return [{ reemplazo: b }];
  const ops = [];
  if (!igual(metaDe(a), metaDe(b))) ops.push({ meta: metaDe(b) });
  for (let p = 0; p < numPaginas(b); p++) {
    const va = paginaDe(a, p), vb = paginaDe(b, p), op = { p };
    if (va.fondo !== vb.fondo && !igual(va.fondo, vb.fondo)) op.fondo = vb.fondo ?? null;
    if (va.elementos !== vb.elementos) {
      const antes = new Map(va.elementos.map(e => [e.id, e])), ahora = new Set(vb.elementos.map(e => e.id));
      const els = vb.elementos.filter(e => antes.get(e.id) !== e && !igual(antes.get(e.id), e));
      const borrar = va.elementos.filter(e => !ahora.has(e.id)).map(e => e.id);
      const ordenA = va.elementos.filter(e => ahora.has(e.id)).map(e => e.id).join();
      const ordenB = vb.elementos.filter(e => antes.has(e.id)).map(e => e.id).join();
      if (els.length) op.els = els;
      if (borrar.length) op.borrar = borrar;
      if (ordenA !== ordenB || els.some(e => !antes.has(e.id))) op.orden = vb.elementos.map(e => e.id);
    }
    if (Object.keys(op).length > 1) ops.push(op);
  }
  return ops;
}

// sinReemplazo: para el historial de deshacer (un diseño entero que llega no
// se mete en cada paso de deshacer).
export function aplicarOps(d, ops, { sinReemplazo = false } = {}) {
  let n = d;
  for (const o of ops || []) {
    if (o.reemplazo) { if (!sinReemplazo) n = o.reemplazo; continue; }
    if (o.meta) { n = { ...o.meta, fondo: n.fondo, elementos: n.elementos, ...(n.paginas ? { paginas: n.paginas } : {}) }; continue; }
    if (!(o.p >= 0) || o.p >= numPaginas(n)) continue;
    const v = paginaDe(n, o.p);
    let els = v.elementos;
    if (o.els || o.borrar || o.orden) {
      const mapa = new Map(els.map(e => [e.id, e]));
      for (const id of o.borrar || []) mapa.delete(id);
      for (const e of o.els || []) mapa.set(e.id, e);
      const vistos = new Set(), lista = [];
      for (const id of o.orden || els.map(e => e.id)) if (mapa.has(id) && !vistos.has(id)) { lista.push(mapa.get(id)); vistos.add(id); }
      for (const [id, e] of mapa) if (!vistos.has(id)) lista.push(e);
      els = lista;
    }
    n = conPagina(n, o.p, { ...v, ...('fondo' in o ? { fondo: o.fondo } : {}), elementos: els });
  }
  return n;
}
