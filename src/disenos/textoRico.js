// ─────────────────────────────────────────────────────────────────────────────
// Texto con partes de otro estilo (negrita, cursiva, subrayado, tachado, color)
// y listas. Un texto lleva siempre «texto» (todo seguido, sin estilos) y, si
// alguna parte es distinta, «trozos»: [{ t, negrita?, cursiva?, subrayado?,
// tachado?, color? }]. Lo que no dice un trozo, lo dice el texto entero.
//
// Aquí: de trozos a HTML (para escribir en el lienzo) y del HTML que deja el
// navegador al escribir y dar formato, otra vez a trozos.
// ─────────────────────────────────────────────────────────────────────────────
export const CLAVES_ESTILO = ['negrita', 'cursiva', 'subrayado', 'tachado', 'color'];

const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function htmlDeTrozos(e) {
  const trozos = Array.isArray(e.trozos) && e.trozos.length ? e.trozos : [{ t: e.texto || '' }];
  return trozos.map(tr => {
    const css = [];
    if (tr.negrita !== undefined) css.push(`font-weight:${tr.negrita ? 700 : 400}`);
    if (tr.cursiva !== undefined) css.push(`font-style:${tr.cursiva ? 'italic' : 'normal'}`);
    const deco = [tr.subrayado && 'underline', tr.tachado && 'line-through'].filter(Boolean).join(' ');
    if (deco) css.push(`text-decoration:${deco}`);
    if (tr.color) css.push(`color:${tr.color}`);
    const html = escapar(tr.t).replace(/\n/g, '<br>');
    return css.length ? `<span style="${css.join(';')}">${html}</span>` : html;
  }).join('');
}

const aHex = (c) => {
  const m = String(c || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `#${[m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toUpperCase() : null;
};
const mismoEstilo = (a, b) => CLAVES_ESTILO.every(k => a[k] === b[k]);

// Del contenido del cuadro de escribir a { texto, trozos } (trozos solo si hace falta).
export function trozosDeHtml(raiz, e) {
  const trozos = [];
  const meter = (t, s) => {
    if (!t) return;
    const ult = trozos[trozos.length - 1];
    if (ult && mismoEstilo(ult, s)) ult.t += t; else trozos.push({ t, ...s });
  };
  const textoHasta = () => trozos.map(x => x.t).join('');
  const recorrer = (n, s) => {
    if (n.nodeType === 3) { meter(n.nodeValue.replace(/ /g, ' ').replace(/​/g, ''), s); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (tag === 'BR') { meter('\n', s); return; }
    const bloque = tag === 'DIV' || tag === 'P';
    // Un bloque nuevo (lo que mete Intro en algunos navegadores) empieza en otra línea.
    if (bloque && textoHasta() && !textoHasta().endsWith('\n')) meter('\n', s);
    const ns = { ...s };
    if (tag === 'B' || tag === 'STRONG') ns.negrita = true;
    if (tag === 'I' || tag === 'EM') ns.cursiva = true;
    if (tag === 'U') ns.subrayado = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') ns.tachado = true;
    if (tag === 'FONT' && n.getAttribute('color')) ns.color = aHex(n.getAttribute('color')) || ns.color;
    const st = n.style;
    if (st) {
      if (st.fontWeight) ns.negrita = st.fontWeight === 'bold' || Number(st.fontWeight) >= 600;
      if (st.fontStyle) ns.cursiva = st.fontStyle === 'italic';
      const deco = st.textDecorationLine || st.textDecoration || '';
      if (deco) { if (deco.includes('underline')) ns.subrayado = true; if (deco.includes('line-through')) ns.tachado = true; if (deco === 'none') { ns.subrayado = false; ns.tachado = false; } }
      if (st.color) ns.color = aHex(st.color) || ns.color;
    }
    for (const h of n.childNodes) recorrer(h, ns);
  };
  for (const h of raiz.childNodes) recorrer(h, {});
  // El último salto que deja el navegador al final no cuenta.
  if (trozos.length && trozos[trozos.length - 1].t.endsWith('\n') && raiz.lastChild?.nodeName === 'BR') {
    const u = trozos[trozos.length - 1]; u.t = u.t.slice(0, -1); if (!u.t) trozos.pop();
  }
  // Lo que coincide con el texto entero no hace falta guardarlo en el trozo.
  const base = { negrita: !!e.negrita, cursiva: !!e.cursiva, subrayado: !!e.subrayado, tachado: !!e.tachado, color: (e.color || '#1A1A1A').toUpperCase() };
  const limpios = trozos.map(tr => {
    const x = { t: tr.t };
    for (const k of CLAVES_ESTILO) if (tr[k] !== undefined && (k === 'color' ? tr[k] !== base.color : !!tr[k] !== base[k])) x[k] = k === 'color' ? tr[k] : !!tr[k];
    return x;
  });
  const unidos = [];
  for (const tr of limpios) { const u = unidos[unidos.length - 1]; if (u && mismoEstilo(u, tr)) u.t += tr.t; else unidos.push({ ...tr }); }
  const texto = unidos.map(x => x.t).join('');
  const conEstilo = unidos.some(x => CLAVES_ESTILO.some(k => x[k] !== undefined));
  return { texto, trozos: conEstilo ? unidos : undefined };
}

// Quitar de los trozos un estilo (cuando se cambia para todo el texto).
export const sinEstiloEnTrozos = (trozos, clave) => {
  if (!trozos) return undefined;
  const r = trozos.map(t => { const { [clave]: fuera, ...resto } = t; return resto; }); // eslint-disable-line no-unused-vars
  return r.some(x => CLAVES_ESTILO.some(k => x[k] !== undefined)) ? r : undefined;
};
