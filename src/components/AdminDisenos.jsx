import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { subirImagen } from './EditorDiseno.jsx';
import {
  TAMANOS, FUENTES_DISENO, VARIABLES_DIPLOMA, EJEMPLO_DIPLOMA, nuevoId, pintarDiseno, cargarImagenes, cargarFuentes,
  pedirFuentes, altoTexto, rellenar, miniatura, exportarDiseno,
} from '../disenos/render.js';
import { PLANTILLAS } from '../disenos/plantillas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Diseño gráfico: el «Canva» del club. Carteles, posts, historias y diplomas en un
// lienzo libre: textos, imágenes y formas que se mueven, se cambian de tamaño
// y se giran; capas, alinear, deshacer; y se exporta a PNG, JPG o PDF. Los de
// tipo diploma llevan huecos ({alumno}, {curso}…) y son los diplomas del aula.
// Se pinta con src/disenos/render.js (lo mismo que se exporta).
// ─────────────────────────────────────────────────────────────────────────────

const LOGO = '/src/brand/Aim_Horizontal.png';
const LOGO_BLANCO = '/src/brand/Aim_White.png';
const inp = { fontFamily: 'inherit', fontSize: 13, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box' };
const etq = { display: 'grid', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' };
const seccionT = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)', margin: '6px 0 2px' };
const tamanoTexto = (d) => TAMANOS.find(t => t.ancho === d.ancho && t.alto === d.alto)?.nombre || `${d.ancho} × ${d.alto} px`;

async function api(url, { method = 'GET', body } = {}) {
  const r = await fetch(url, { method, credentials: 'include', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido hacer.');
  return d;
}

// ═══════════════════════ La lista ═══════════════════════
export default function AdminDisenos({ showToast }) {
  const [datos, setDatos] = useState(null);
  const [abierto, setAbierto] = useState(null);       // { id, nombre, tipo, datos }
  const [nuevo, setNuevo] = useState(false);
  const cargar = useCallback(() => api('/api/admin/disenos').then(setDatos).catch(e => alert(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);

  async function abrir(id) {
    try { const d = await api(`/api/admin/disenos/${id}`); setAbierto(d); } catch (e) { alert(e.message); }
  }
  async function duplicar(d) { try { await api(`/api/admin/disenos/${d.id}/duplicar`, { method: 'POST' }); showToast?.('Duplicado.'); cargar(); } catch (e) { alert(e.message); } }
  async function borrar(d) {
    if (!window.confirm(`¿Borrar «${d.nombre}»? No se puede deshacer.`)) return;
    try { await api(`/api/admin/disenos/${d.id}`, { method: 'DELETE' }); showToast?.('Borrado.'); cargar(); } catch (e) { alert(e.message); }
  }
  async function porDefecto(d) {
    try { await api('/api/admin/disenos-diploma', { method: 'PUT', body: { id: datos.diplomaPorDefecto === d.id ? null : d.id } }); showToast?.(datos.diplomaPorDefecto === d.id ? 'El aula vuelve al diploma de siempre.' : 'Es el diploma del aula por defecto.'); cargar(); }
    catch (e) { alert(e.message); }
  }

  if (abierto) return <Editor inicial={abierto} showToast={showToast} onCerrar={() => { setAbierto(null); cargar(); }} />;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14, flex: '1 1 300px' }}>Carteles, posts, historias y diplomas, como en Canva. Se exportan a PNG, JPG o PDF; los diplomas los usa el aula virtual.</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setNuevo(true)}><I.Plus /> Nuevo diseño</button>
      </div>
      {!datos ? <p style={{ color: 'var(--ink-3)' }}>Cargando…</p> : !datos.disenos.length ? (
        <div style={{ padding: 30, textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 16, color: 'var(--ink-3)' }}>Aún no hay diseños. Empieza por una plantilla o un tamaño en blanco.</div>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {datos.disenos.map(d => (
            <div key={d.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', display: 'grid' }}>
              <button type="button" onClick={() => abrir(d.id)} style={{ border: 0, padding: 0, cursor: 'pointer', background: 'var(--bg-3)', aspectRatio: '4 / 3', display: 'grid', placeItems: 'center' }} aria-label={`Abrir ${d.nombre}`}>
                {d.miniatura ? <img src={d.miniatura} alt="" style={{ maxWidth: '92%', maxHeight: '92%', boxShadow: '0 4px 14px rgba(0,0,0,.15)' }} /> : <span style={{ color: 'var(--ink-3)' }}>Sin vista previa</span>}
              </button>
              <div style={{ padding: 12, display: 'grid', gap: 6 }}>
                <b style={{ fontSize: 14 }}>{d.nombre}</b>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{tamanoTexto(d)}{d.tipo === 'diploma' ? ' · diploma' : ''}</span>
                {d.tipo === 'diploma' && datos.diplomaPorDefecto === d.id && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)' }}>✓ Diploma del aula por defecto</span>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => abrir(d.id)}><I.Edit width={13} height={13} /> Abrir</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => duplicar(d)}>Duplicar</button>
                  {d.tipo === 'diploma' && <button type="button" className="btn btn-sm btn-ghost" onClick={() => porDefecto(d)}>{datos.diplomaPorDefecto === d.id ? 'Quitar de por defecto' : 'Diploma por defecto'}</button>}
                  <button type="button" className="icon-btn danger" onClick={() => borrar(d)} aria-label="Borrar"><I.Trash /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {nuevo && <NuevoDiseno onCerrar={() => setNuevo(false)} onCrear={(d) => { setNuevo(false); setAbierto(d); }} />}
    </div>
  );
}

function Ventana({ titulo, children, onCerrar, ancho = 720 }) {
  useEffect(() => { const f = (e) => { if (e.key === 'Escape') onCerrar(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onCerrar]);
  return (
    <div role="dialog" aria-label={titulo} onClick={onCerrar} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, width: `min(${ancho}px, 100%)`, maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto', padding: 20, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}><b style={{ fontSize: 17, flex: 1 }}>{titulo}</b><button type="button" className="icon-btn" onClick={onCerrar} aria-label="Cerrar"><I.X /></button></div>
        {children}
      </div>
    </div>
  );
}

function NuevoDiseno({ onCerrar, onCrear }) {
  const [ancho, setAncho] = useState(1080);
  const [alto, setAlto] = useState(1080);
  const blanco = (t) => onCrear({ id: null, nombre: t.nombre, tipo: 'libre', datos: { ancho: t.ancho, alto: t.alto, fondo: { tipo: 'color', color: '#ffffff' }, elementos: [] } });
  return (
    <Ventana titulo="Nuevo diseño" onCerrar={onCerrar} ancho={860}>
      <div style={seccionT}>Empezar con una plantilla</div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {PLANTILLAS.map(p => (
          <button key={p.id} type="button" onClick={() => onCrear({ id: null, nombre: p.nombre, tipo: p.tipo, datos: p.crear() })}
            style={{ font: 'inherit', cursor: 'pointer', padding: 12, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', display: 'grid', gap: 4, textAlign: 'left' }}>
            <b style={{ fontSize: 13 }}>{p.nombre}</b>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{TAMANOS.find(t => t.id === p.tamano)?.nombre}{p.tipo === 'diploma' ? ' · con nombre y curso' : ''}</span>
          </button>
        ))}
      </div>
      <div style={seccionT}>O en blanco, del tamaño que necesites</div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {TAMANOS.map(t => (
          <button key={t.id} type="button" className="btn btn-sm btn-outline" style={{ justifyContent: 'space-between' }} onClick={() => blanco(t)}>
            <span>{t.nombre}</span><span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>{t.ancho}×{t.alto}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
        <label style={etq}>Ancho (px)<input type="number" min="50" max="6000" value={ancho} onChange={e => setAncho(Number(e.target.value))} style={{ ...inp, width: 110 }} /></label>
        <label style={etq}>Alto (px)<input type="number" min="50" max="6000" value={alto} onChange={e => setAlto(Number(e.target.value))} style={{ ...inp, width: 110 }} /></label>
        <button type="button" className="btn btn-sm btn-primary" disabled={!(ancho >= 50 && ancho <= 6000 && alto >= 50 && alto <= 6000)}
          onClick={() => blanco({ nombre: 'Diseño a medida', ancho: Math.round(ancho), alto: Math.round(alto) })}>Crear a medida</button>
      </div>
    </Ventana>
  );
}

// ═══════════════════════ El editor ═══════════════════════
const NOMBRE_TIPO = { texto: 'Texto', imagen: 'Imagen', rect: 'Rectángulo', elipse: 'Círculo', linea: 'Línea' };
const etiquetaElemento = (e) => (e.tipo === 'texto' ? `«${String(e.texto || '').split('\n')[0].slice(0, 26)}»` : NOMBRE_TIPO[e.tipo] || e.tipo);
const medidor = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
// La caja de un texto se ajusta a lo que ocupa (con los huecos de ejemplo).
const ajustarTexto = (e, ejemplo) => (e.tipo === 'texto' && medidor
  ? { ...e, h: Math.max(10, Math.ceil(altoTexto(medidor, e, rellenar(e.texto, ejemplo)))) } : e);

function Editor({ inicial, showToast, onCerrar }) {
  const [id, setId] = useState(inicial.id);
  const [nombre, setNombre] = useState(inicial.nombre || 'Diseño sin nombre');
  const [tipo, setTipo] = useState(inicial.tipo || 'libre');
  const [diseno, setDiseno] = useState(inicial.datos);
  const [sel, setSel] = useState(null);
  const [hist, setHist] = useState({ atras: [], adelante: [] });
  const [sucio, setSucio] = useState(!inicial.id);
  const [guardando, setGuardando] = useState(false);
  const [panel, setPanel] = useState('anadir');
  const [imagenes, setImagenes] = useState(new Map());
  const [version, setVersion] = useState(0);
  const [guias, setGuias] = useState([]);
  const [verExportar, setVerExportar] = useState(false);
  const [verTamano, setVerTamano] = useState(false);
  const [zona, setZona] = useState({ w: 800, h: 600 });
  const zonaRef = useRef(null), lienzoRef = useRef(null), textoRef = useRef(null), arrastre = useRef(null);
  const disenoRef = useRef(diseno); disenoRef.current = diseno;
  const ejemplo = tipo === 'diploma' ? EJEMPLO_DIPLOMA : null;
  const elegido = diseno.elementos.find(e => e.id === sel) || null;

  useEffect(() => { pedirFuentes(); }, []);
  // El tamaño del hueco central, para que el lienzo quepa entero.
  useEffect(() => {
    const el = zonaRef.current; if (!el) return undefined;
    const ro = new ResizeObserver(([x]) => setZona({ w: x.contentRect.width, h: x.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const escala = Math.max(0.05, Math.min((zona.w - 48) / diseno.ancho, (zona.h - 48) / diseno.alto));

  // Imágenes y fuentes: al cargarse, se vuelve a pintar.
  const urls = useMemo(() => [diseno.fondo?.tipo === 'imagen' ? diseno.fondo.url : null, ...diseno.elementos.filter(e => e.tipo === 'imagen').map(e => e.url)].filter(Boolean).join('|'), [diseno]);
  useEffect(() => { cargarImagenes(diseno).then(m => { setImagenes(m); }); }, [urls]); // eslint-disable-line react-hooks/exhaustive-deps
  const fuentes = useMemo(() => diseno.elementos.filter(e => e.tipo === 'texto').map(e => `${e.fuente}|${e.negrita}|${e.cursiva}`).join(','), [diseno]);
  useEffect(() => { cargarFuentes(diseno).then(() => setVersion(v => v + 1)); }, [fuentes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pintar.
  useEffect(() => {
    const c = lienzoRef.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(diseno.ancho * escala * dpr); c.height = Math.round(diseno.alto * escala * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(escala * dpr, 0, 0, escala * dpr, 0, 0);
    pintarDiseno(ctx, diseno, { imagenes, variables: ejemplo });
  }, [diseno, escala, imagenes, version, ejemplo]);

  // ── Cambios con deshacer ──
  const aplicar = useCallback((fn, { historia = true } = {}) => {
    const prev = disenoRef.current, sig = fn(prev);
    if (sig === prev) return;
    if (historia) setHist(h => ({ atras: [...h.atras.slice(-99), prev], adelante: [] }));
    disenoRef.current = sig;
    setDiseno(sig); setSucio(true);
  }, []);
  const cambiarEl = (idEl, cambios, opts) => aplicar(d => ({ ...d, elementos: d.elementos.map(e => (e.id === idEl ? ajustarTexto({ ...e, ...cambios }, ejemplo) : e)) }), opts);
  function deshacer() {
    if (!hist.atras.length) return;
    const prev = hist.atras[hist.atras.length - 1];
    setHist({ atras: hist.atras.slice(0, -1), adelante: [diseno, ...hist.adelante] });
    disenoRef.current = prev; setDiseno(prev); setSucio(true);
  }
  function rehacer() {
    if (!hist.adelante.length) return;
    const sig = hist.adelante[0];
    setHist({ atras: [...hist.atras, diseno], adelante: hist.adelante.slice(1) });
    disenoRef.current = sig; setDiseno(sig); setSucio(true);
  }

  function anadir(el) {
    const e = ajustarTexto({ rot: 0, opacidad: 1, ...el, id: nuevoId() }, ejemplo);
    e.x = el.x ?? Math.round((diseno.ancho - e.w) / 2); e.y = el.y ?? Math.round((diseno.alto - e.h) / 2);
    aplicar(d => ({ ...d, elementos: [...d.elementos, e] }));
    setSel(e.id); setPanel('anadir');
  }
  const base = Math.min(diseno.ancho, diseno.alto);
  const anadirTexto = (nivel, texto) => anadir({ tipo: 'texto', texto: texto || { titulo: 'Un título', subtitulo: 'Un subtítulo', texto: 'Escribe aquí tu texto' }[nivel],
    w: Math.round(diseno.ancho * 0.7), h: 100, fuente: nivel === 'titulo' ? 'Plus Jakarta Sans' : 'Montserrat', tamano: Math.round(base * ({ titulo: 0.08, subtitulo: 0.05, texto: 0.032 }[nivel] || 0.04)),
    negrita: nivel !== 'texto', color: '#1A1A1A', alinear: 'centro', interlineado: 1.25 });
  const anadirForma = (t) => anadir(t === 'linea'
    ? { tipo: 'linea', w: Math.round(diseno.ancho * 0.4), h: 24, color: '#1A1A1A', grosor: Math.max(3, Math.round(base * 0.004)) }
    : { tipo: t, w: Math.round(base * 0.3), h: Math.round(base * 0.3), relleno: t === 'rect' ? '#5233A8' : '#FF5FA2', radio: t === 'rect' ? Math.round(base * 0.02) : 0, borde: '#1A1A1A', grosor: 0 });
  const anadirImagen = (url, ancho, alto) => {
    const k = Math.min(1, (diseno.ancho * 0.5) / (ancho || 600), (diseno.alto * 0.5) / (alto || 600));
    anadir({ tipo: 'imagen', url, w: Math.round((ancho || 600) * k), h: Math.round((alto || 600) * k), ajuste: 'contener', radio: 0 });
  };
  async function subir(file, alSubir) {
    if (!file) return;
    try { const r = await subirImagen(file); alSubir(r); } catch (e) { alert(e.message); }
  }
  function borrarSel() { if (!sel) return; aplicar(d => ({ ...d, elementos: d.elementos.filter(e => e.id !== sel) })); setSel(null); }
  function duplicarSel() {
    if (!elegido) return;
    const c = { ...elegido, id: nuevoId(), x: elegido.x + 30, y: elegido.y + 30 };
    aplicar(d => ({ ...d, elementos: [...d.elementos, c] })); setSel(c.id);
  }
  function capa(dir) {
    aplicar(d => {
      const l = [...d.elementos]; const i = l.findIndex(e => e.id === sel); if (i < 0) return d;
      const [e] = l.splice(i, 1);
      const j = dir === 'frente' ? l.length : dir === 'fondo' ? 0 : Math.max(0, Math.min(l.length, i + dir));
      l.splice(j, 0, e); return { ...d, elementos: l };
    });
  }
  function alinear(como) {
    if (!elegido) return;
    const { ancho: W, alto: H } = diseno;
    const pos = { izq: { x: 0 }, centroH: { x: (W - elegido.w) / 2 }, der: { x: W - elegido.w }, arriba: { y: 0 }, centroV: { y: (H - elegido.h) / 2 }, abajo: { y: H - elegido.h } }[como];
    cambiarEl(elegido.id, Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, Math.round(v)])));
  }

  // ── Arrastrar, cambiar de tamaño y girar ──
  function empezar(ev, idEl, modo, hx = 0, hy = 0) {
    ev.stopPropagation(); ev.preventDefault();
    const el = disenoRef.current.elementos.find(e => e.id === idEl);
    setSel(idEl);
    if (!el || el.bloqueado) return;
    arrastre.current = { modo, id: idEl, x0: ev.clientX, y0: ev.clientY, el0: { ...el }, hx, hy, movido: false, previo: disenoRef.current };
  }
  useEffect(() => {
    const mover = (ev) => {
      const a = arrastre.current; if (!a) return;
      const dx = (ev.clientX - a.x0) / escala, dy = (ev.clientY - a.y0) / escala;
      if (!a.movido && Math.abs(dx) + Math.abs(dy) < 2 / escala) return;
      a.movido = true;
      const e0 = a.el0, rad = (e0.rot || 0) * Math.PI / 180;
      let c = {};
      if (a.modo === 'mover') {
        let x = e0.x + dx, y = e0.y + dy;
        const { ancho: W, alto: H } = disenoRef.current, umbral = 8 / escala, gs = [];
        const cx = x + e0.w / 2, cy = y + e0.h / 2;
        if (Math.abs(cx - W / 2) < umbral) { x = W / 2 - e0.w / 2; gs.push({ v: W / 2 }); }
        else if (Math.abs(x) < umbral) { x = 0; gs.push({ v: 0 }); } else if (Math.abs(x + e0.w - W) < umbral) { x = W - e0.w; gs.push({ v: W }); }
        if (Math.abs(cy - H / 2) < umbral) { y = H / 2 - e0.h / 2; gs.push({ h: H / 2 }); }
        else if (Math.abs(y) < umbral) { y = 0; gs.push({ h: 0 }); } else if (Math.abs(y + e0.h - H) < umbral) { y = H - e0.h; gs.push({ h: H }); }
        setGuias(gs);
        c = { x: Math.round(x), y: Math.round(y) };
      } else if (a.modo === 'tamano') {
        const lx = dx * Math.cos(rad) + dy * Math.sin(rad), ly = -dx * Math.sin(rad) + dy * Math.cos(rad);
        let nw = a.hx ? Math.max(10, e0.w + a.hx * lx) : e0.w, nh = a.hy ? Math.max(10, e0.h + a.hy * ly) : e0.h;
        const esquina = a.hx && a.hy;
        if (esquina && (e0.tipo === 'imagen' || e0.tipo === 'texto' || ev.shiftKey)) {
          const k = Math.max(nw / e0.w, nh / e0.h); nw = e0.w * k; nh = e0.h * k;
        }
        const sx = a.hx * (nw - e0.w) / 2, sy = a.hy * (nh - e0.h) / 2;
        const cx = e0.x + e0.w / 2 + sx * Math.cos(rad) - sy * Math.sin(rad), cy = e0.y + e0.h / 2 + sx * Math.sin(rad) + sy * Math.cos(rad);
        c = { w: Math.round(nw), h: Math.round(nh), x: Math.round(cx - nw / 2), y: Math.round(cy - nh / 2) };
        // Un texto por la esquina crece con su letra.
        if (e0.tipo === 'texto' && esquina) c.tamano = Math.max(6, Math.round((e0.tamano || 48) * nw / e0.w));
        if (e0.tipo === 'linea') { c.h = e0.h; c.y = Math.round(cy - e0.h / 2); }
      } else if (a.modo === 'girar') {
        const r = lienzoRef.current.getBoundingClientRect();
        const cx = r.left + (e0.x + e0.w / 2) * escala, cy = r.top + (e0.y + e0.h / 2) * escala;
        let g = Math.round(Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90);
        if (ev.shiftKey) g = Math.round(g / 15) * 15;
        else for (const s of [0, 90, 180, 270, 360, -90]) if (Math.abs(g - s) < 4) g = s;
        c = { rot: ((g % 360) + 360) % 360 };
      }
      setDiseno(d => ({ ...d, elementos: d.elementos.map(e => (e.id === a.id ? ajustarTexto({ ...e, ...c }, ejemplo) : e)) }));
    };
    const soltar = () => {
      const a = arrastre.current; arrastre.current = null; setGuias([]);
      if (a?.movido) { setHist(h => ({ atras: [...h.atras.slice(-99), a.previo], adelante: [] })); setSucio(true); }
    };
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar);
    return () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
  }, [escala, ejemplo]);

  // ── Teclado ──
  useEffect(() => {
    const f = (ev) => {
      const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName || '') || ev.target?.isContentEditable;
      const ctrl = ev.ctrlKey || ev.metaKey;
      if (ctrl && ev.key.toLowerCase() === 's') { ev.preventDefault(); guardar(); return; }
      if (enCampo) return;
      if (ctrl && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) rehacer(); else deshacer(); }
      else if (ctrl && ev.key.toLowerCase() === 'y') { ev.preventDefault(); rehacer(); }
      else if (ctrl && ev.key.toLowerCase() === 'd') { ev.preventDefault(); duplicarSel(); }
      else if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel) { ev.preventDefault(); borrarSel(); }
      else if (ev.key === 'Escape') setSel(null);
      else if (sel && ev.key.startsWith('Arrow')) {
        ev.preventDefault();
        const p = ev.shiftKey ? 10 : 1, el = disenoRef.current.elementos.find(e => e.id === sel);
        if (!el || el.bloqueado) return;
        const d = { ArrowLeft: [-p, 0], ArrowRight: [p, 0], ArrowUp: [0, -p], ArrowDown: [0, p] }[ev.key];
        cambiarEl(sel, { x: el.x + d[0], y: el.y + d[1] });
      }
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  });

  // ── Guardar y exportar ──
  async function guardar() {
    if (guardando) return;
    setGuardando(true);
    try {
      const mini = await miniatura(diseno, ejemplo).catch(() => null);
      const body = { nombre, tipo, datos: diseno, miniatura: mini };
      if (id) await api(`/api/admin/disenos/${id}`, { method: 'PUT', body });
      else { const r = await api('/api/admin/disenos', { method: 'POST', body }); setId(r.id); }
      setSucio(false); showToast?.('Diseño guardado.');
    } catch (e) { alert(e.message); } finally { setGuardando(false); }
  }
  async function exportar(formato, escalaExp = 1) {
    setVerExportar(false);
    try { await exportarDiseno(diseno, formato, nombre, { variables: ejemplo, escala: escalaExp }); }
    catch (e) { alert(`No se ha podido exportar: ${e.message}`); }
  }
  function cerrar() { if (sucio && !window.confirm('Hay cambios sin guardar. ¿Salir sin guardarlos?')) return; onCerrar(); }
  function cambiarTamano(t, ajustar) {
    const sx = t.ancho / diseno.ancho, sy = t.alto / diseno.alto, k = Math.min(sx, sy);
    aplicar(d => ({
      ...d, ancho: t.ancho, alto: t.alto,
      elementos: ajustar ? d.elementos.map(e => ajustarTexto({ ...e, x: Math.round(e.x * sx), y: Math.round(e.y * sy), w: Math.round(e.w * (e.tipo === 'texto' ? sx : sx)), h: Math.round(e.h * (e.tipo === 'imagen' || e.tipo === 'elipse' ? sx : sy)),
        ...(e.tipo === 'texto' ? { tamano: Math.max(6, Math.round((e.tamano || 48) * k)) } : {}), ...(e.grosor ? { grosor: Math.max(1, Math.round(e.grosor * k)) } : {}) }, ejemplo)) : d.elementos,
    }));
    setVerTamano(false);
  }

  const marco = { position: 'absolute', left: 0, top: 0, width: diseno.ancho * escala, height: diseno.alto * escala };
  const botonBarra = { font: 'inherit', fontSize: 13, fontWeight: 700, padding: '7px 11px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--bg)', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      {/* Barra de arriba */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
        <button type="button" style={botonBarra} onClick={cerrar}>← Diseño gráfico</button>
        <input value={nombre} onChange={e => { setNombre(e.target.value); setSucio(true); }} aria-label="Nombre del diseño" style={{ ...inp, width: 230, fontWeight: 700, fontSize: 14 }} />
        <select value={tipo} onChange={e => { setTipo(e.target.value); setSucio(true); }} aria-label="Tipo" style={{ ...inp, width: 'auto' }}>
          <option value="libre">Diseño</option><option value="diploma">Diploma del aula</option>
        </select>
        <button type="button" style={botonBarra} onClick={() => setVerTamano(true)} title="Cambiar el tamaño del lienzo">{tamanoTexto(diseno)}</button>
        <div style={{ flex: 1 }} />
        <button type="button" style={botonBarra} onClick={deshacer} disabled={!hist.atras.length} title="Deshacer (Ctrl+Z)">↶</button>
        <button type="button" style={botonBarra} onClick={rehacer} disabled={!hist.adelante.length} title="Rehacer (Ctrl+Y)">↷</button>
        <div style={{ position: 'relative' }}>
          <button type="button" style={botonBarra} onClick={() => setVerExportar(v => !v)}><I.Download width={14} height={14} /> Exportar</button>
          {verExportar && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 5, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 6, display: 'grid', minWidth: 220 }}>
              {[['png', 1, 'PNG', 'Con la mejor calidad'], ['png', 2, 'PNG al doble', `${diseno.ancho * 2} × ${diseno.alto * 2} px`], ['jpg', 1, 'JPG', 'Pesa menos (redes, WhatsApp)'], ['pdf', 1, 'PDF', 'Para imprimir']].map(([f, k, t, d]) => (
                <button key={`${f}${k}`} type="button" onClick={() => exportar(f, k)} style={{ font: 'inherit', textAlign: 'left', padding: '8px 10px', border: 0, borderRadius: 8, background: 'none', color: 'var(--ink)', cursor: 'pointer', display: 'grid' }}>
                  <b style={{ fontSize: 13 }}>{t}</b><span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{d}</span>
                </button>
              ))}
              {tipo === 'diploma' && <span style={{ fontSize: 11, color: 'var(--ink-3)', padding: '4px 10px' }}>Sale con los datos de ejemplo; a cada alumno, con los suyos.</span>}
            </div>
          )}
        </div>
        <button type="button" className="btn btn-sm btn-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : sucio ? 'Guardar' : '✓ Guardado'}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '272px minmax(0, 1fr) 282px', minHeight: 0 }}>
        {/* Izquierda: añadir, fondo y capas */}
        <aside style={{ borderRight: '1px solid var(--line)', background: 'var(--bg-2)', overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['anadir', 'Añadir'], ['fondo', 'Fondo'], ['capas', 'Capas']].map(([k, t]) => (
              <button key={k} type="button" onClick={() => setPanel(k)} className={`btn btn-sm ${panel === k ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1 }}>{t}</button>
            ))}
          </div>
          {panel === 'anadir' && (
            <PanelAnadir tipo={tipo} anadirTexto={anadirTexto} anadirForma={anadirForma} anadirImagen={anadirImagen} subir={subir} />
          )}
          {panel === 'fondo' && <PanelFondo fondo={diseno.fondo || {}} cambiar={(f) => aplicar(d => ({ ...d, fondo: { ...d.fondo, ...f } }))} subir={subir} />}
          {panel === 'capas' && (
            <div style={{ display: 'grid', gap: 4 }}>
              {!diseno.elementos.length && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Aún no hay nada en el lienzo.</span>}
              {[...diseno.elementos].reverse().map(e => (
                <div key={e.id} onClick={() => setSel(e.id)} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  background: e.id === sel ? 'color-mix(in oklab, var(--purple) 12%, var(--bg-2))' : 'var(--bg-3)', opacity: e.oculto ? 0.5 : 1 }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etiquetaElemento(e)}</span>
                  <button type="button" title={e.oculto ? 'Mostrar' : 'Ocultar'} onClick={(x) => { x.stopPropagation(); cambiarEl(e.id, { oculto: !e.oculto }); }} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-2)' }}>{e.oculto ? '🚫' : '👁'}</button>
                  <button type="button" title={e.bloqueado ? 'Desbloquear' : 'Bloquear'} onClick={(x) => { x.stopPropagation(); cambiarEl(e.id, { bloqueado: !e.bloqueado }); }} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-2)' }}>{e.bloqueado ? '🔒' : '🔓'}</button>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Centro: el lienzo */}
        <div ref={zonaRef} onPointerDown={() => setSel(null)} style={{ position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center',
          background: 'repeating-conic-gradient(color-mix(in oklab, var(--ink) 4%, var(--bg)) 0% 25%, var(--bg) 0% 50%) 50% / 24px 24px' }}>
          <div style={{ position: 'relative', width: diseno.ancho * escala, height: diseno.alto * escala, boxShadow: '0 10px 40px -10px rgba(0,0,0,.35)' }}>
            <canvas ref={lienzoRef} style={{ ...marco, width: diseno.ancho * escala, height: diseno.alto * escala, display: 'block' }} />
            <div style={marco}>
              {diseno.elementos.map(e => (e.oculto ? null : (
                <div key={e.id} onPointerDown={(ev) => empezar(ev, e.id, 'mover')} onDoubleClick={() => { if (e.tipo === 'texto') { setSel(e.id); setTimeout(() => textoRef.current?.focus(), 30); } }}
                  style={{ position: 'absolute', left: e.x * escala, top: e.y * escala, width: e.w * escala, height: e.h * escala, transform: `rotate(${e.rot || 0}deg)`,
                    cursor: e.bloqueado ? 'default' : 'move', outline: e.id === sel ? '2px solid #7C5CFF' : 'none', outlineOffset: 1, touchAction: 'none' }}>
                  {e.id === sel && !e.bloqueado && (
                    <>
                      {[[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]].filter(([hx, hy]) => (e.tipo === 'linea' ? hy === 0 : true)).map(([hx, hy]) => (
                        <span key={`${hx}${hy}`} onPointerDown={(ev) => empezar(ev, e.id, 'tamano', hx, hy)}
                          style={{ position: 'absolute', width: 12, height: 12, borderRadius: 3, background: '#fff', border: '2px solid #7C5CFF', left: `calc(${(hx + 1) * 50}% - 6px)`, top: `calc(${(hy + 1) * 50}% - 6px)`,
                            cursor: hx && hy ? (hx === hy ? 'nwse-resize' : 'nesw-resize') : hx ? 'ew-resize' : 'ns-resize', touchAction: 'none' }} />
                      ))}
                      <span onPointerDown={(ev) => empezar(ev, e.id, 'girar')} title="Girar (Mayús: de 15 en 15)"
                        style={{ position: 'absolute', left: 'calc(50% - 9px)', top: -34, width: 18, height: 18, borderRadius: 99, background: '#fff', border: '2px solid #7C5CFF', cursor: 'grab', display: 'grid', placeItems: 'center', fontSize: 11, touchAction: 'none' }}>⟳</span>
                    </>
                  )}
                </div>
              )))}
              {guias.map((g, i) => <div key={i} style={{ position: 'absolute', pointerEvents: 'none', background: '#FF5FA2', ...(g.v != null ? { left: g.v * escala, top: 0, width: 1, height: '100%' } : { top: g.h * escala, left: 0, height: 1, width: '100%' }) }} />)}
            </div>
          </div>
        </div>

        {/* Derecha: lo que se puede cambiar */}
        <aside style={{ borderLeft: '1px solid var(--line)', background: 'var(--bg-2)', overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
          {!elegido ? (
            <div style={{ fontSize: 13, color: 'var(--ink-3)', display: 'grid', gap: 8 }}>
              <b style={{ color: 'var(--ink)' }}>Nada elegido</b>
              <span>Pulsa algo del lienzo para cambiarlo. Arrástralo para moverlo, tira de los cuadraditos para el tamaño y del círculo de arriba para girarlo.</span>
              <span>Atajos: Supr borra, Ctrl+D duplica, Ctrl+Z deshace, las flechas mueven (con Mayús, de 10 en 10), Ctrl+S guarda.</span>
              {tipo === 'diploma' && <span style={{ color: 'var(--purple)' }}>Es un diploma: los huecos ({'{alumno}'}, {'{curso}'}…) se ven con datos de ejemplo y a cada alumno le salen los suyos.</span>}
            </div>
          ) : (
            <Propiedades e={elegido} tipo={tipo} cambiar={(c) => cambiarEl(elegido.id, c)} textoRef={textoRef} subir={subir}
              acciones={{ duplicar: duplicarSel, borrar: borrarSel, capa, alinear }} />
          )}
        </aside>
      </div>

      {verTamano && (
        <Ventana titulo="Cambiar el tamaño del lienzo" onCerrar={() => setVerTamano(false)}>
          <CambiarTamano actual={diseno} onElegir={cambiarTamano} />
        </Ventana>
      )}
    </div>
  );
}

function CambiarTamano({ actual, onElegir }) {
  const [ajustar, setAjustar] = useState(true);
  const [ancho, setAncho] = useState(actual.ancho), [alto, setAlto] = useState(actual.alto);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={ajustar} onChange={e => setAjustar(e.target.checked)} /> Ajustar lo que hay al nuevo tamaño</label>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {TAMANOS.map(t => <button key={t.id} type="button" className="btn btn-sm btn-outline" style={{ justifyContent: 'space-between' }} onClick={() => onElegir(t, ajustar)}><span>{t.nombre}</span><span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>{t.ancho}×{t.alto}</span></button>)}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
        <label style={etq}>Ancho<input type="number" value={ancho} onChange={e => setAncho(Number(e.target.value))} style={{ ...inp, width: 110 }} /></label>
        <label style={etq}>Alto<input type="number" value={alto} onChange={e => setAlto(Number(e.target.value))} style={{ ...inp, width: 110 }} /></label>
        <button type="button" className="btn btn-sm btn-primary" disabled={!(ancho >= 50 && ancho <= 6000 && alto >= 50 && alto <= 6000)} onClick={() => onElegir({ ancho: Math.round(ancho), alto: Math.round(alto) }, ajustar)}>Aplicar</button>
      </div>
    </div>
  );
}

function BotonSubir({ texto, onArchivo, className = 'btn btn-sm btn-outline' }) {
  const [subiendo, setSubiendo] = useState(false);
  return (
    <label className={className} style={{ position: 'relative', cursor: 'pointer', justifyContent: 'center' }}>
      {subiendo ? 'Subiendo…' : texto}
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={subiendo} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setSubiendo(true); try { await onArchivo(f); } finally { setSubiendo(false); } }} />
    </label>
  );
}

function PanelAnadir({ tipo, anadirTexto, anadirForma, anadirImagen, subir }) {
  const [subidas, setSubidas] = useState(null);
  useEffect(() => { api('/api/admin/correo/imagenes').then(d => setSubidas(Array.isArray(d) ? d : d.imagenes || [])).catch(() => setSubidas([])); }, []);
  const bloque = { font: 'inherit', cursor: 'pointer', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', textAlign: 'left' };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={seccionT}>Texto</div>
      <button type="button" style={{ ...bloque, fontSize: 20, fontWeight: 800 }} onClick={() => anadirTexto('titulo')}>Añadir un título</button>
      <button type="button" style={{ ...bloque, fontSize: 15, fontWeight: 700 }} onClick={() => anadirTexto('subtitulo')}>Añadir un subtítulo</button>
      <button type="button" style={{ ...bloque, fontSize: 13 }} onClick={() => anadirTexto('texto')}>Añadir un párrafo</button>
      {tipo === 'diploma' && (
        <>
          <div style={seccionT}>Huecos del diploma</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {VARIABLES_DIPLOMA.map(v => <button key={v.id} type="button" className="btn btn-sm btn-outline" title={v.nombre} onClick={() => anadirTexto(v.id === 'alumno' ? 'titulo' : 'subtitulo', `{${v.id}}`)}>{`{${v.id}}`}</button>)}
          </div>
        </>
      )}
      <div style={seccionT}>Formas</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        <button type="button" style={{ ...bloque, textAlign: 'center' }} onClick={() => anadirForma('rect')} title="Rectángulo"><span style={{ display: 'inline-block', width: 30, height: 22, background: '#5233A8', borderRadius: 4 }} /></button>
        <button type="button" style={{ ...bloque, textAlign: 'center' }} onClick={() => anadirForma('elipse')} title="Círculo"><span style={{ display: 'inline-block', width: 24, height: 24, background: '#FF5FA2', borderRadius: 99 }} /></button>
        <button type="button" style={{ ...bloque, textAlign: 'center' }} onClick={() => anadirForma('linea')} title="Línea"><span style={{ display: 'inline-block', width: 30, height: 3, background: 'var(--ink)', verticalAlign: 'middle' }} /></button>
      </div>
      <div style={seccionT}>Imágenes</div>
      <BotonSubir texto="⬆ Subir una imagen" onArchivo={(f) => subir(f, (r) => anadirImagen(r.url, r.ancho, r.alto))} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button type="button" style={{ ...bloque, display: 'grid', placeItems: 'center', height: 56 }} onClick={() => anadirImagen(LOGO, 600, 225)} title="Logo"><img src={LOGO} alt="Logo" style={{ maxWidth: '90%', maxHeight: 34 }} /></button>
        <button type="button" style={{ ...bloque, display: 'grid', placeItems: 'center', height: 56, background: '#2a2a2a' }} onClick={() => anadirImagen(LOGO_BLANCO, 600, 300)} title="Logo blanco"><img src={LOGO_BLANCO} alt="Logo blanco" style={{ maxWidth: '90%', maxHeight: 34 }} /></button>
      </div>
      {subidas?.length > 0 && (
        <>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Ya subidas</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {subidas.slice(0, 30).map(x => (
              <button key={x.id} type="button" onClick={() => anadirImagen(x.url, x.ancho, x.alto)} title={x.nombre || ''}
                style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 0, aspectRatio: '1', background: `center / cover no-repeat url(${x.url}), var(--bg-3)`, cursor: 'pointer' }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Color({ etiqueta, valor, onCambio, permiteNada = false }) {
  const nada = !valor || valor === 'transparent';
  return (
    <label style={etq}>{etiqueta}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="color" value={nada ? '#ffffff' : valor} onChange={e => onCambio(e.target.value)} style={{ width: 38, height: 32, padding: 0, border: '1px solid var(--line)', borderRadius: 8, background: 'none' }} />
        <input value={nada ? '' : valor} placeholder={permiteNada ? 'Sin color' : '#000000'} onChange={e => onCambio(e.target.value || (permiteNada ? 'transparent' : '#000000'))} style={{ ...inp, fontFamily: 'monospace' }} />
        {permiteNada && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onCambio('transparent')} title="Sin color">∅</button>}
      </div>
    </label>
  );
}
const Num = ({ etiqueta, valor, onCambio, min, max, paso = 1 }) => (
  <label style={etq}>{etiqueta}<input type="number" value={Math.round((valor ?? 0) * 100) / 100} min={min} max={max} step={paso} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) onCambio(n); }} style={inp} /></label>
);

function PanelFondo({ fondo, cambiar, subir }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[['color', 'Color'], ['degradado', 'Degradado'], ['imagen', 'Imagen']].map(([k, t]) => (
          <button key={k} type="button" className={`btn btn-sm ${(fondo.tipo || 'color') === k ? 'btn-primary' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => cambiar({ tipo: k })}>{t}</button>
        ))}
      </div>
      <Color etiqueta={fondo.tipo === 'degradado' ? 'Color de inicio' : 'Color'} valor={fondo.color || '#ffffff'} onCambio={(v) => cambiar({ color: v })} />
      {fondo.tipo === 'degradado' && <>
        <Color etiqueta="Color final" valor={fondo.color2 || '#21B668'} onCambio={(v) => cambiar({ color2: v })} />
        <Num etiqueta="Ángulo (grados)" valor={fondo.angulo ?? 135} onCambio={(v) => cambiar({ angulo: v })} min={0} max={360} />
      </>}
      {fondo.tipo === 'imagen' && <>
        <BotonSubir texto={fondo.url ? 'Cambiar la imagen de fondo' : 'Subir la imagen de fondo'} onArchivo={(f) => subir(f, (r) => cambiar({ url: r.url }))} />
        <label style={etq}>Opacidad<input type="range" min="0.05" max="1" step="0.05" value={fondo.opacidad ?? 1} onChange={e => cambiar({ opacidad: Number(e.target.value) })} /></label>
      </>}
      <div style={seccionT}>Colores de la marca</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['#5233A8', '#FF5FA2', '#F99B35', '#FFD526', '#21B668', '#00BBF4', '#1A1A1A', '#FFFFFF', '#F6F4EF'].map(c => (
          <button key={c} type="button" title={c} onClick={() => cambiar({ color: c })} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--line)', background: c, cursor: 'pointer' }} />
        ))}
      </div>
    </div>
  );
}

function Propiedades({ e, tipo, cambiar, textoRef, subir, acciones }) {
  const fila = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
  const alinearBtn = (k, t, titulo) => <button key={k} type="button" className="btn btn-sm btn-ghost" title={titulo} onClick={() => acciones.alinear(k)} style={{ padding: '4px 6px' }}>{t}</button>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b style={{ flex: 1 }}>{NOMBRE_TIPO[e.tipo]}</b>
        <button type="button" className="btn btn-sm btn-ghost" onClick={acciones.duplicar} title="Duplicar (Ctrl+D)">⧉</button>
        <button type="button" className="icon-btn danger" onClick={acciones.borrar} aria-label="Borrar (Supr)"><I.Trash /></button>
      </div>

      {e.tipo === 'texto' && <>
        <label style={etq}>Texto
          <textarea ref={textoRef} rows={3} value={e.texto} onChange={x => cambiar({ texto: x.target.value })} style={{ ...inp, resize: 'vertical', fontSize: 14 }} />
        </label>
        {tipo === 'diploma' && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {VARIABLES_DIPLOMA.map(v => <button key={v.id} type="button" className="btn btn-sm btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }} title={`Añadir ${v.nombre.toLowerCase()}`} onClick={() => cambiar({ texto: `${e.texto}{${v.id}}` })}>{`{${v.id}}`}</button>)}
          </div>
        )}
        <label style={etq}>Fuente
          <select value={e.fuente || 'Montserrat'} onChange={x => cambiar({ fuente: x.target.value })} style={{ ...inp, fontFamily: `"${e.fuente || 'Montserrat'}"` }}>
            {FUENTES_DISENO.map(f => <option key={f.id} value={f.id} style={{ fontFamily: `"${f.id}"` }}>{f.nombre}</option>)}
          </select>
        </label>
        <div style={fila}>
          <Num etiqueta="Tamaño" valor={e.tamano || 48} onCambio={(v) => cambiar({ tamano: Math.max(4, v) })} min={4} max={1000} />
          <Color etiqueta="Color" valor={e.color || '#1A1A1A'} onCambio={(v) => cambiar({ color: v })} />
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button type="button" className={`btn btn-sm ${e.negrita ? 'btn-primary' : 'btn-outline'}`} onClick={() => cambiar({ negrita: !e.negrita })} style={{ fontWeight: 900 }}>N</button>
          <button type="button" className={`btn btn-sm ${e.cursiva ? 'btn-primary' : 'btn-outline'}`} onClick={() => cambiar({ cursiva: !e.cursiva })} style={{ fontStyle: 'italic' }}>K</button>
          <button type="button" className={`btn btn-sm ${e.mayusculas ? 'btn-primary' : 'btn-outline'}`} onClick={() => cambiar({ mayusculas: !e.mayusculas })} title="Mayúsculas">AA</button>
          {[['izquierda', '⇤'], ['centro', '↔'], ['derecha', '⇥']].map(([k, t]) => (
            <button key={k} type="button" className={`btn btn-sm ${(e.alinear || 'izquierda') === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => cambiar({ alinear: k })} title={`Alinear a la ${k}`}>{t}</button>
          ))}
        </div>
        <div style={fila}>
          <Num etiqueta="Interlineado" valor={e.interlineado || 1.25} onCambio={(v) => cambiar({ interlineado: Math.max(0.6, v) })} min={0.6} max={3} paso={0.05} />
          <Num etiqueta="Espaciado" valor={e.espaciado || 0} onCambio={(v) => cambiar({ espaciado: v })} min={-10} max={60} />
        </div>
      </>}

      {e.tipo === 'imagen' && <>
        <BotonSubir texto="Cambiar la imagen" onArchivo={(f) => subir(f, (r) => cambiar({ url: r.url }))} />
        <label style={etq}>Cómo se ve en su caja
          <select value={e.ajuste || 'contener'} onChange={x => cambiar({ ajuste: x.target.value })} style={inp}>
            <option value="contener">Entera</option><option value="cubrir">Llenando la caja (recorta)</option><option value="estirar">Estirada</option>
          </select>
        </label>
        <Num etiqueta="Esquinas redondeadas" valor={e.radio || 0} onCambio={(v) => cambiar({ radio: Math.max(0, v) })} min={0} />
      </>}

      {(e.tipo === 'rect' || e.tipo === 'elipse') && <>
        <Color etiqueta="Relleno" valor={e.relleno} onCambio={(v) => cambiar({ relleno: v })} permiteNada />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" checked={!!e.relleno2} onChange={x => cambiar({ relleno2: x.target.checked ? '#00BBF4' : null })} /> Degradado</label>
        {e.relleno2 && <div style={fila}><Color etiqueta="Hasta" valor={e.relleno2} onCambio={(v) => cambiar({ relleno2: v })} /><Num etiqueta="Ángulo" valor={e.angulo ?? 135} onCambio={(v) => cambiar({ angulo: v })} min={0} max={360} /></div>}
        <div style={fila}>
          <Color etiqueta="Borde" valor={e.borde || '#1A1A1A'} onCambio={(v) => cambiar({ borde: v })} />
          <Num etiqueta="Grosor del borde" valor={e.grosor || 0} onCambio={(v) => cambiar({ grosor: Math.max(0, v) })} min={0} />
        </div>
        {e.tipo === 'rect' && <Num etiqueta="Esquinas redondeadas" valor={e.radio || 0} onCambio={(v) => cambiar({ radio: Math.max(0, v) })} min={0} />}
      </>}

      {e.tipo === 'linea' && <>
        <div style={fila}>
          <Color etiqueta="Color" valor={e.color || '#1A1A1A'} onCambio={(v) => cambiar({ color: v })} />
          <Num etiqueta="Grosor" valor={e.grosor || 4} onCambio={(v) => cambiar({ grosor: Math.max(1, v), h: Math.max(24, v + 16) })} min={1} />
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" checked={!!e.discontinua} onChange={x => cambiar({ discontinua: x.target.checked })} /> Discontinua</label>
      </>}

      <div style={seccionT}>Posición y tamaño</div>
      <div style={fila}>
        <Num etiqueta="X" valor={e.x} onCambio={(v) => cambiar({ x: v })} />
        <Num etiqueta="Y" valor={e.y} onCambio={(v) => cambiar({ y: v })} />
        <Num etiqueta="Ancho" valor={e.w} onCambio={(v) => cambiar({ w: Math.max(5, v) })} min={5} />
        {e.tipo !== 'texto' && e.tipo !== 'linea' && <Num etiqueta="Alto" valor={e.h} onCambio={(v) => cambiar({ h: Math.max(5, v) })} min={5} />}
        <Num etiqueta="Giro (grados)" valor={e.rot || 0} onCambio={(v) => cambiar({ rot: ((v % 360) + 360) % 360 })} min={0} max={360} />
      </div>
      <label style={etq}>Transparencia<input type="range" min="0.05" max="1" step="0.05" value={e.opacidad ?? 1} onChange={x => cambiar({ opacidad: Number(x.target.value) })} /></label>
      {e.tipo !== 'linea' && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" checked={!!e.sombra} onChange={x => cambiar({ sombra: x.target.checked })} /> Sombra</label>}
      <div style={seccionT}>Alinear en el lienzo</div>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {alinearBtn('izq', '⇤', 'A la izquierda')}{alinearBtn('centroH', '↔', 'Al centro')}{alinearBtn('der', '⇥', 'A la derecha')}
        {alinearBtn('arriba', '⤒', 'Arriba')}{alinearBtn('centroV', '↕', 'En medio')}{alinearBtn('abajo', '⤓', 'Abajo')}
      </div>
      <div style={seccionT}>Capa</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => acciones.capa('frente')}>Al frente</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => acciones.capa(1)}>Subir</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => acciones.capa(-1)}>Bajar</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => acciones.capa('fondo')}>Al fondo</button>
      </div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" checked={!!e.bloqueado} onChange={x => cambiar({ bloqueado: x.target.checked })} /> Bloqueado (no se mueve sin querer)</label>
    </div>
  );
}
