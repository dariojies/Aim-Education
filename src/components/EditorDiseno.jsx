import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { I } from './Icons.jsx';
import {
  piezasCorreo, htmlCorreo, nuevoBloque, idBloque, TIPOS_BLOQUE, FUENTES, MARCA_POR_DEFECTO, DISENO_VACIO,
  PLANTILLAS_BASE, VARIABLES_CRM, faltanObligatorios, disenoDesdeTexto,
} from '../../correo-diseno.js';

// ─────────────────────────────────────────────────────────────────────────────
// El «Canva» de los correos (ticket #326). A la izquierda las piezas que se
// pueden añadir (se arrastran al correo o se pulsan), en el centro el correo tal
// cual llegará, y a la derecha lo que se puede cambiar de la pieza elegida.
// El correo se pinta con correo-diseno.js, el mismo código que usa el servidor
// al enviarlo: lo que se ve aquí es lo que llega.
// ─────────────────────────────────────────────────────────────────────────────

// La marca del club (logo, colores, pie), una vez por visita.
let marcaGuardada = null;
export function useMarca() {
  const [marca, setMarca] = useState(marcaGuardada);
  useEffect(() => {
    if (marcaGuardada) return;
    fetch('/api/admin/correo/marca', { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { marcaGuardada = d?.marca || MARCA_POR_DEFECTO; setMarca(marcaGuardada); })
      .catch(() => setMarca(MARCA_POR_DEFECTO));
  }, []);
  return marca || MARCA_POR_DEFECTO;
}
export const olvidarMarca = (m) => { marcaGuardada = m || null; };

// Sube una imagen: la achica antes (máximo 1200 px de ancho) para que el correo
// pese poco. Los GIF se suben tal cual para no perder la animación.
export async function subirImagen(archivo) {
  if (!/^image\/(png|jpeg|gif|webp)$/.test(archivo.type)) throw new Error('Tiene que ser una imagen JPG, PNG o GIF.');
  const leer = (f) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(f); });
  let datos = await leer(archivo), ancho = null, alto = null;
  const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No se ha podido abrir esa imagen.')); i.src = datos; });
  ancho = img.naturalWidth; alto = img.naturalHeight;
  if (archivo.type !== 'image/gif') {
    const escala = Math.min(1, 1200 / ancho);
    const c = document.createElement('canvas');
    c.width = Math.round(ancho * escala); c.height = Math.round(alto * escala);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, c.width, c.height);
    // Con transparencia se queda en PNG (un logo); si no, JPG, que pesa menos.
    let transparente = false;
    if (archivo.type === 'image/png' || archivo.type === 'image/webp') {
      const px = g.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < px.length; i += 16) if (px[i] < 250) { transparente = true; break; }
    }
    datos = transparente ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86);
    ancho = c.width; alto = c.height;
  }
  const r = await fetch('/api/admin/correo/imagenes', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ datos, nombre: archivo.name, ancho, alto }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido subir la imagen.');
  return d;
}

// ── Piezas pequeñas ─────────────────────────────────────────────────────────
const etiqueta = { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', display: 'grid', gap: 5 };
const campo = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 13 };
const botonIcono = (activo = false) => ({
  border: '1px solid var(--line)', background: activo ? 'var(--ink)' : 'var(--bg-2)', color: activo ? '#fff' : 'var(--ink-2)',
  borderRadius: 8, padding: '6px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, lineHeight: 1,
});

function Segmentado({ valor, opciones, onCambio }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {opciones.map(([v, t]) => (
        <button key={String(v)} type="button" style={{ ...botonIcono(valor === v), flex: 1, padding: '7px 8px' }} onClick={() => onCambio(v)}>{t}</button>
      ))}
    </div>
  );
}

const MUESTRAS = ['#ffffff', '#f4f2ee', '#1a1a1a', '#666666', '#0a7d3c', '#e9f7ef', '#b45309', '#fff4e5', '#c62828', '#fdecec', '#1d4ed8', '#e8efff', '#efeaff'];
function Color({ etiqueta: txt, valor, onCambio, marca, vacio = 'Automático' }) {
  const deMarca = [marca?.colorPrincipal, marca?.colorTexto].filter(Boolean);
  const lista = [...new Set([...deMarca, ...MUESTRAS])];
  return (
    <div style={etiqueta}>
      <span>{txt}</span>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        {vacio && (
          <button type="button" title="El de la marca" onClick={() => onCambio('')} style={{ ...botonIcono(!valor), padding: '5px 8px', fontSize: 11 }}>{vacio}</button>
        )}
        {lista.map(c => (
          <button key={c} type="button" title={c} onClick={() => onCambio(c)} style={{
            width: 22, height: 22, borderRadius: 6, background: c, cursor: 'pointer', padding: 0,
            border: valor?.toLowerCase() === c.toLowerCase() ? '2px solid var(--purple)' : '1px solid var(--line)',
            boxShadow: valor?.toLowerCase() === c.toLowerCase() ? '0 0 0 2px var(--bg-2) inset' : 'none',
          }} />
        ))}
        <label title="Otro color" style={{ position: 'relative', width: 22, height: 22, borderRadius: 6, border: '1px dashed var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 14, color: 'var(--ink-3)' }}>
          +
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(valor || '') ? valor : '#5233a8'} onChange={e => onCambio(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
        </label>
      </div>
    </div>
  );
}

function Deslizador({ etiqueta: txt, valor, min, max, paso = 1, unidad = '', onCambio }) {
  return (
    <label style={etiqueta}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{txt}</span><span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{valor}{unidad}</span></span>
      <input type="range" min={min} max={max} step={paso} value={valor} onChange={e => onCambio(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--purple)' }} />
    </label>
  );
}

// Un texto con sus botones de formato y los datos que se rellenan solos.
function CampoTexto({ etiqueta: txt, valor, onCambio, variables, filas = 5, linea = false, ayuda }) {
  const ref = useRef(null);
  const envolver = (antes, despues = antes, relleno = 'texto') => {
    const el = ref.current;
    const a = el?.selectionStart ?? valor.length, b = el?.selectionEnd ?? valor.length;
    const sel = valor.slice(a, b) || relleno;
    const nuevo = valor.slice(0, a) + antes + sel + despues + valor.slice(b);
    onCambio(nuevo);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + antes.length, a + antes.length + sel.length); });
  };
  const meter = (t) => {
    const el = ref.current;
    const a = el?.selectionStart ?? valor.length, b = el?.selectionEnd ?? valor.length;
    onCambio(valor.slice(0, a) + t + valor.slice(b));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + t.length, a + t.length); });
  };
  const enlazar = () => {
    const url = window.prompt('¿A qué dirección lleva el enlace?', 'https://');
    if (url && url !== 'https://') envolver('[', `](${url.trim()})`, 'pulsa aquí');
  };
  const vars = Object.entries(variables || {});
  const Tag = linea ? 'input' : 'textarea';
  return (
    <div style={etiqueta}>
      <span>{txt}</span>
      {!linea && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button type="button" style={botonIcono()} onClick={() => envolver('**')} title="Negrita"><b>N</b></button>
          <button type="button" style={botonIcono()} onClick={() => envolver('*')} title="Cursiva"><i>C</i></button>
          <button type="button" style={botonIcono()} onClick={enlazar} title="Enlace">Enlace</button>
        </div>
      )}
      <Tag ref={ref} value={valor} rows={linea ? undefined : filas} onChange={e => onCambio(e.target.value)}
        style={{ ...campo, resize: linea ? undefined : 'vertical', lineHeight: 1.5 }} />
      {vars.length > 0 && (
        <select value="" onChange={e => { if (e.target.value) meter(`{${e.target.value}}`); }} style={{ ...campo, padding: '6px 8px', fontWeight: 600, color: 'var(--purple)' }}>
          <option value="">+ Añadir un dato que se rellena solo…</option>
          {vars.map(([k, v]) => <option key={k} value={k}>{v.que}</option>)}
        </select>
      )}
      {ayuda && <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>{ayuda}</span>}
    </div>
  );
}

// Un campo de dirección (enlace o imagen) que admite también datos {así}.
function CampoEnlace({ etiqueta: txt, valor, onCambio, variables, placeholder = 'https://…' }) {
  const deEnlace = Object.entries(variables || {}).filter(([k]) => /enlace|url|web/i.test(k));
  return (
    <label style={etiqueta}>
      <span>{txt}</span>
      <input value={valor || ''} placeholder={placeholder} onChange={e => onCambio(e.target.value)} style={campo} />
      {deEnlace.length > 0 && (
        <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {deEnlace.map(([k, v]) => (
            <button key={k} type="button" style={{ ...botonIcono(valor === `{${k}}`), fontWeight: 600 }} onClick={() => onCambio(`{${k}}`)}>{v.que}</button>
          ))}
        </span>
      )}
    </label>
  );
}

// Elegir o subir una imagen.
function CampoImagen({ valor, onCambio, onGaleria, showToast }) {
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef(null);
  const subir = async (f) => {
    if (!f) return;
    setSubiendo(true);
    try { const d = await subirImagen(f); onCambio(d.url); }
    catch (e) { showToast?.(e.message, 'error'); }
    finally { setSubiendo(false); }
  };
  return (
    <div style={etiqueta}>
      <span>Imagen</span>
      {valor && <img src={valor} alt="" style={{ width: '100%', maxHeight: 140, objectFit: 'contain', borderRadius: 8, background: 'var(--bg-3)' }} />}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-primary" disabled={subiendo} onClick={() => input.current?.click()}>{subiendo ? 'Subiendo…' : valor ? 'Cambiar' : 'Subir imagen'}</button>
        {onGaleria && <button type="button" className="btn btn-sm btn-outline" onClick={onGaleria}>Mis imágenes</button>}
        {valor && <button type="button" className="btn btn-sm btn-outline" onClick={() => onCambio('')}>Quitar</button>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={e => { subir(e.target.files?.[0]); e.target.value = ''; }} />
      <input value={valor || ''} placeholder="…o pega la dirección de una imagen" onChange={e => onCambio(e.target.value)} style={{ ...campo, fontWeight: 400 }} />
    </div>
  );
}

// Una miniatura del correo (para elegir plantillas).
export function Miniatura({ diseno, marca, alto = 220, vars = {}, automaticos = {} }) {
  const html = useMemo(() => htmlCorreo(diseno, { marca, vars, automaticos }), [diseno, marca, vars, automaticos]);
  const escala = 0.34;
  return (
    <div style={{ height: alto, overflow: 'hidden', borderRadius: 10, background: marca?.fondo || '#f4f2ee', position: 'relative', pointerEvents: 'none' }}>
      <iframe title="Miniatura" srcDoc={html} tabIndex={-1} sandbox="" style={{
        border: 0, width: 660, height: alto / escala, transform: `scale(${escala})`, transformOrigin: '0 0', position: 'absolute', left: '50%', marginLeft: -330 * escala,
      }} />
    </div>
  );
}

// ── Elegir por dónde empezar ────────────────────────────────────────────────
// Las plantillas del club y las de partida. `textoActual`: el texto que ya
// había escrito, para ofrecer pasarlo tal cual a diseño.
export function ElegirPlantilla({ onElegir, onCerrar, textoActual = '', soloBase = false }) {
  const marca = useMarca();
  const [propias, setPropias] = useState(soloBase ? [] : null);
  useEffect(() => {
    if (soloBase) return;
    fetch('/api/admin/correo/plantillas', { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : { plantillas: [] }).then(d => setPropias(d.plantillas || [])).catch(() => setPropias([]));
  }, [soloBase]);
  const base = useMemo(() => PLANTILLAS_BASE.map(p => ({ ...p, disenoHecho: p.diseno() })), []);
  const Tarjeta = ({ nombre, que, diseno, onClick }) => (
    <button type="button" onClick={onClick} style={{ textAlign: 'left', border: '1px solid var(--line)', borderRadius: 14, padding: 10, background: 'var(--bg-2)', cursor: 'pointer', fontFamily: 'inherit', display: 'grid', gap: 8 }}>
      <Miniatura diseno={diseno} marca={marca} alto={180} vars={{ nombre: 'Lucía' }} />
      <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>{nombre}</span>
      {que && <span style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: -4 }}>{que}</span>}
    </button>
  );
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2600, display: 'grid', placeItems: 'center', padding: 16 }} onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div style={{ background: 'var(--bg)', borderRadius: 18, width: 'min(1000px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 22, display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>¿Por dónde empiezas?</h2>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>Elige una plantilla y cámbiala a tu gusto. La cabecera y el pie son los de la marca del club.</p>
          </div>
          <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>Cancelar</button>
        </div>
        {!!String(textoActual).trim() && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            <Tarjeta nombre="Mi texto, con diseño" que="Lo que ya habías escrito, listo para ponerle imágenes y botones."
              diseno={disenoDesdeTexto(textoActual)} onClick={() => onElegir({ diseno: disenoDesdeTexto(textoActual) })} />
          </div>
        )}
        {propias === null ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cargando las plantillas del club…</p> : propias.length > 0 && (
          <section style={{ display: 'grid', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Plantillas del club</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              {propias.map(p => <Tarjeta key={p.id} nombre={p.nombre} diseno={p.diseno} onClick={() => onElegir({ diseno: p.diseno, asunto: p.asunto, plantillaId: p.id, nombre: p.nombre })} />)}
            </div>
          </section>
        )}
        <section style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Para empezar</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {base.map(p => <Tarjeta key={p.id} nombre={p.nombre} que={p.que} diseno={p.disenoHecho} onClick={() => onElegir({ diseno: p.diseno(), asunto: p.asunto })} />)}
          </div>
        </section>
      </div>
    </div>
  );
}

// Las imágenes ya subidas.
function Galeria({ onElegir, showToast }) {
  const [imgs, setImgs] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef(null);
  const cargar = useCallback(() => {
    fetch('/api/admin/correo/imagenes', { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : { imagenes: [] }).then(d => setImgs(d.imagenes || [])).catch(() => setImgs([]));
  }, []);
  useEffect(cargar, [cargar]);
  const subir = async (archivos) => {
    setSubiendo(true);
    try {
      for (const f of archivos) await subirImagen(f);
      cargar();
    } catch (e) { showToast?.(e.message, 'error'); }
    finally { setSubiendo(false); }
  };
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <button type="button" className="btn btn-sm btn-primary" disabled={subiendo} onClick={() => input.current?.click()}>{subiendo ? 'Subiendo…' : 'Subir imágenes'}</button>
      <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={e => { subir([...(e.target.files || [])]); e.target.value = ''; }} />
      <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Pulsa una para ponerla en el correo, o arrástrala encima de una imagen.</p>
      {imgs === null ? <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Cargando…</p> : imgs.length === 0
        ? <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Todavía no hay imágenes. Súbelas desde aquí o desde una pieza de imagen.</p>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {imgs.map(x => (
              <button key={x.id} type="button" draggable onDragStart={e => e.dataTransfer.setData('text/plain', `imagen:${x.url}`)}
                onClick={() => onElegir(x.url)} title={x.nombre || ''}
                style={{ padding: 0, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'var(--bg-3)', aspectRatio: '1', display: 'grid', placeItems: 'center' }}>
                <img src={x.url} alt="" loading="lazy" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

// ── Lo que se puede cambiar de cada pieza ───────────────────────────────────
function Propiedades({ b, cambiar, variables, automaticos, marca, onGaleria, showToast }) {
  const set = (k, v) => cambiar({ ...b, [k]: v });
  const alinear = (
    <label style={etiqueta}><span>Alineación</span>
      <Segmentado valor={b.alinear || 'left'} onCambio={v => set('alinear', v)} opciones={[['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']]} />
    </label>
  );
  const partes = [];
  if (b.tipo === 'titulo') {
    partes.push(
      <CampoTexto key="t" etiqueta="Título" valor={b.texto || ''} onCambio={v => set('texto', v)} variables={variables} linea />,
      <label key="n" style={etiqueta}><span>Tamaño</span>
        <Segmentado valor={Number(b.nivel) === 2 ? 2 : 1} onCambio={v => cambiar({ ...b, nivel: v, tamano: undefined })} opciones={[[1, 'Grande'], [2, 'Mediano']]} />
      </label>,
      alinear,
      <Color key="c" etiqueta="Color del texto" valor={b.color} onCambio={v => set('color', v)} marca={marca} />,
    );
  } else if (b.tipo === 'texto') {
    partes.push(
      <CampoTexto key="t" etiqueta="Texto" valor={b.texto || ''} onCambio={v => set('texto', v)} variables={variables} filas={8}
        ayuda="Deja una línea en blanco entre párrafos." />,
      <Deslizador key="s" etiqueta="Tamaño de letra" valor={b.tamano || 15} min={12} max={22} unidad=" px" onCambio={v => set('tamano', v)} />,
      alinear,
      <Color key="c" etiqueta="Color del texto" valor={b.color} onCambio={v => set('color', v)} marca={marca} />,
    );
  } else if (b.tipo === 'caja') {
    partes.push(
      <CampoTexto key="t" etiqueta="Texto del aviso" valor={b.texto || ''} onCambio={v => set('texto', v)} variables={variables} />,
      <Color key="f" etiqueta="Color de la caja" valor={b.fondo} onCambio={v => set('fondo', v)} marca={marca} vacio={null} />,
      <Color key="b" etiqueta="Color de la raya" valor={b.borde} onCambio={v => set('borde', v)} marca={marca} />,
      <Color key="c" etiqueta="Color del texto" valor={b.color} onCambio={v => set('color', v)} marca={marca} />,
    );
  } else if (b.tipo === 'imagen') {
    partes.push(
      <CampoImagen key="i" valor={b.src} onCambio={v => set('src', v)} onGaleria={onGaleria} showToast={showToast} />,
      <Deslizador key="a" etiqueta="Ancho" valor={b.ancho || 100} min={20} max={100} unidad=" %" onCambio={v => set('ancho', v)} />,
      alinear,
      <Deslizador key="r" etiqueta="Esquinas redondeadas" valor={b.radio ?? 10} min={0} max={30} unidad=" px" onCambio={v => set('radio', v)} />,
      <label key="c" style={{ ...etiqueta, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={!!b.completa} onChange={e => set('completa', e.target.checked)} /> <span>De borde a borde (sin margen a los lados)</span>
      </label>,
      <CampoEnlace key="e" etiqueta="Al pulsarla lleva a… (opcional)" valor={b.enlace} onCambio={v => set('enlace', v)} variables={variables} />,
      <label key="alt" style={etiqueta}><span>Qué se ve en la imagen</span>
        <input value={b.alt || ''} onChange={e => set('alt', e.target.value)} placeholder="Ej.: niños en el campamento" style={campo} />
        <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>Sale si el correo no carga las imágenes, y lo leen los lectores de pantalla.</span>
      </label>,
    );
  } else if (b.tipo === 'boton') {
    const lista = Array.isArray(b.botones) && b.botones.length ? b.botones : [{ texto: 'Ver más', url: '', fondo: '', color: '#ffffff' }];
    const setBtn = (i, k, v) => set('botones', lista.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
    lista.forEach((x, i) => partes.push(
      <div key={`b${i}`} style={{ display: 'grid', gap: 10, padding: 10, border: '1px solid var(--line)', borderRadius: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 12 }}>{lista.length > 1 ? `Botón ${i + 1}` : 'Botón'}</strong>
          {lista.length > 1 && <button type="button" style={botonIcono()} onClick={() => set('botones', lista.filter((_, j) => j !== i))}>Quitar</button>}
        </div>
        <label style={etiqueta}><span>Texto del botón</span><input value={x.texto || ''} onChange={e => setBtn(i, 'texto', e.target.value)} style={campo} /></label>
        <CampoEnlace etiqueta="Lleva a…" valor={x.url} onCambio={v => setBtn(i, 'url', v)} variables={variables} />
        <Color etiqueta="Color del botón" valor={x.fondo} onCambio={v => setBtn(i, 'fondo', v)} marca={marca} />
        <Color etiqueta="Color de la letra" valor={x.color} onCambio={v => setBtn(i, 'color', v)} marca={marca} vacio={null} />
      </div>,
    ));
    if (lista.length < 2) partes.push(<button key="mas" type="button" className="btn btn-sm btn-outline" onClick={() => set('botones', [...lista, { texto: 'Otro botón', url: '', fondo: '#eeeeee', color: '#333333' }])}>+ Añadir otro botón al lado</button>);
    partes.push(alinear, <Deslizador key="r" etiqueta="Esquinas redondeadas" valor={b.radio ?? 10} min={0} max={30} unidad=" px" onCambio={v => set('radio', v)} />);
    if (lista.length === 1) partes.push(
      <label key="l" style={{ ...etiqueta, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={!!b.lleno} onChange={e => set('lleno', e.target.checked)} /> <span>Que ocupe todo el ancho</span>
      </label>);
  } else if (b.tipo === 'columnas') {
    const cols = Array.isArray(b.cols) ? b.cols : [];
    const setCol = (i, k, v) => set('cols', cols.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
    cols.forEach((c, i) => partes.push(
      <div key={`c${i}`} style={{ display: 'grid', gap: 10, padding: 10, border: '1px solid var(--line)', borderRadius: 10 }}>
        <strong style={{ fontSize: 12 }}>{i === 0 ? 'Columna izquierda' : 'Columna derecha'}</strong>
        <CampoImagen valor={c.src} onCambio={v => setCol(i, 'src', v)} showToast={showToast} />
        <label style={etiqueta}><span>Título</span><input value={c.titulo || ''} onChange={e => setCol(i, 'titulo', e.target.value)} style={campo} /></label>
        <CampoTexto etiqueta="Texto" valor={c.texto || ''} onCambio={v => setCol(i, 'texto', v)} variables={variables} filas={3} />
        <label style={etiqueta}><span>Texto del botón (opcional)</span><input value={c.boton || ''} onChange={e => setCol(i, 'boton', e.target.value)} style={campo} /></label>
        <CampoEnlace etiqueta="Enlace del botón y de la imagen" valor={c.url} onCambio={v => setCol(i, 'url', v)} variables={variables} />
      </div>,
    ));
  } else if (b.tipo === 'separador') {
    partes.push(
      <Color key="c" etiqueta="Color de la línea" valor={b.color} onCambio={v => set('color', v)} marca={marca} vacio={null} />,
      <Deslizador key="g" etiqueta="Grosor" valor={b.grosor || 1} min={1} max={6} unidad=" px" onCambio={v => set('grosor', v)} />,
    );
  } else if (b.tipo === 'espacio') {
    partes.push(<Deslizador key="a" etiqueta="Altura" valor={b.alto || 24} min={4} max={100} unidad=" px" onCambio={v => set('alto', v)} />);
  } else if (b.tipo === 'redes') {
    partes.push(alinear, <p key="p" style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Salen las redes que estén puestas en <b>Marca</b>, con sus enlaces.</p>);
  } else if (b.tipo === 'auto') {
    const opciones = Object.entries(automaticos || {});
    partes.push(
      <label key="a" style={etiqueta}><span>Qué pieza es</span>
        <select value={b.clave || ''} onChange={e => set('clave', e.target.value)} style={campo}>
          {opciones.map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
        </select>
        <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>La monta la app al enviar el correo, con los datos de cada persona. Aquí ves un ejemplo.</span>
      </label>,
    );
  }
  // Lo común a todas.
  if (!['espacio'].includes(b.tipo)) {
    partes.push(<Deslizador key="pad" etiqueta="Aire arriba y abajo" valor={b.pad ?? 10} min={0} max={40} unidad=" px" onCambio={v => set('pad', v)} />);
  }
  if (!['caja'].includes(b.tipo)) {
    partes.push(<Color key="fondo" etiqueta="Fondo de esta pieza" valor={b.fondo} onCambio={v => set('fondo', v)} marca={marca} vacio="Sin fondo" />);
  }
  const vars = Object.entries(variables || {});
  if (vars.length) {
    partes.push(
      <label key="si" style={etiqueta}><span>¿Cuándo sale?</span>
        <select value={b.siHay || ''} onChange={e => set('siHay', e.target.value || undefined)} style={campo}>
          <option value="">Siempre</option>
          {vars.map(([k, v]) => <option key={k} value={k}>Solo si hay: {v.que.toLowerCase()}</option>)}
        </select>
      </label>,
    );
  }
  return <div style={{ display: 'grid', gap: 14 }}>{partes}</div>;
}

// Iconos de las piezas del panel.
const DIBUJO = {
  titulo: <span style={{ fontWeight: 900, fontSize: 18 }}>T</span>,
  texto: <span style={{ fontSize: 13, fontWeight: 700 }}>¶</span>,
  imagen: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" /></svg>,
  boton: <span style={{ fontSize: 10, fontWeight: 800, border: '2px solid currentColor', borderRadius: 6, padding: '2px 5px' }}>OK</span>,
  caja: <span style={{ width: 20, height: 14, borderLeft: '4px solid currentColor', background: 'color-mix(in oklab, currentColor 20%, transparent)', borderRadius: 3 }} />,
  columnas: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="8" height="16" rx="1.5" /><rect x="13" y="4" width="8" height="16" rx="1.5" /></svg>,
  separador: <span style={{ width: 20, borderTop: '2px solid currentColor' }} />,
  espacio: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" /></svg>,
  redes: <I.Share width={18} height={18} />,
  auto: <I.Spark width={18} height={18} />,
};

// ── El editor ───────────────────────────────────────────────────────────────
// valor: { asunto, diseno, nombre }. onGuardar recibe lo mismo.
//  variables: {clave: {que, ejemplo}} · automaticos: {clave: {nombre, ejemplo}}
//  def: la definición del correo automático (para no dejar sin lo imprescindible)
//  conNombre: para las plantillas del club (se les pone nombre).
export default function EditorDiseno({
  titulo = 'Diseñar el correo', valor, onGuardar, onCerrar, showToast,
  variables = VARIABLES_CRM, automaticos = {}, def = null, clavePrueba = null,
  conAsunto = true, conNombre = false, textoGuardar = 'Guardar', puedeGuardarComoPlantilla = true,
}) {
  const marca = useMarca();
  const [diseno, setDiseno] = useState(() => valor?.diseno ? JSON.parse(JSON.stringify(valor.diseno)) : DISENO_VACIO());
  const [asunto, setAsunto] = useState(valor?.asunto || '');
  const [nombre, setNombre] = useState(valor?.nombre || '');
  const [sel, setSel] = useState(null);
  const [panel, setPanel] = useState('anadir');
  const [movil, setMovil] = useState(false);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [indicador, setIndicadorEstado] = useState(null);
  // La posición también en una ref: al soltar, el último «dragover» puede no
  // haber llegado aún al estado.
  const indicadorRef = useRef(null);
  const setIndicador = useCallback((v) => { indicadorRef.current = v; setIndicadorEstado(v); }, []);
  const [guardando, setGuardando] = useState(false);
  const [cambios, setCambios] = useState(false);
  const pasado = useRef([]), futuro = useRef([]), ultimo = useRef(0);
  const ejemplos = useMemo(() => Object.fromEntries(Object.entries(variables || {}).map(([k, v]) => [k, v.ejemplo ?? ''])), [variables]);
  const ejemplosAuto = useMemo(() => Object.fromEntries(Object.entries(automaticos || {}).map(([k, v]) => [k, v.ejemplo ?? ''])), [automaticos]);

  // Cada cambio se guarda para poder deshacerlo; lo que se escribe seguido
  // cuenta como un solo cambio.
  const cambiar = useCallback((nuevo, juntar = true) => {
    setDiseno(prev => {
      const ahora = Date.now();
      if (!juntar || ahora - ultimo.current > 700) {
        pasado.current.push(prev);
        if (pasado.current.length > 80) pasado.current.shift();
      }
      ultimo.current = ahora;
      futuro.current = [];
      return typeof nuevo === 'function' ? nuevo(prev) : nuevo;
    });
    setCambios(true);
  }, []);
  const deshacer = useCallback(() => {
    if (!pasado.current.length) return;
    setDiseno(prev => { futuro.current.push(prev); return pasado.current.pop(); });
    ultimo.current = 0;
  }, []);
  const rehacer = useCallback(() => {
    if (!futuro.current.length) return;
    setDiseno(prev => { pasado.current.push(prev); return futuro.current.pop(); });
    ultimo.current = 0;
  }, []);

  const bloques = diseno.bloques || [];
  const elegido = bloques.find(b => b.id === sel) || null;
  const setBloques = (fn, juntar = false) => cambiar(d => ({ ...d, bloques: fn(d.bloques || []) }), juntar);
  const cambiarBloque = (b) => setBloques(bs => bs.map(x => (x.id === b.id ? b : x)), true);
  const insertar = (tipo, pos = null) => {
    const b = nuevoBloque(tipo);
    if (tipo === 'auto') b.clave = Object.keys(automaticos || {})[0] || '';
    setBloques(bs => {
      const i = pos ?? (sel ? bs.findIndex(x => x.id === sel) + 1 : bs.length);
      return [...bs.slice(0, i), b, ...bs.slice(i)];
    });
    setSel(b.id);
    setPanel('pieza');
  };
  const mover = (id, pos) => setBloques(bs => {
    const i = bs.findIndex(x => x.id === id);
    if (i < 0) return bs;
    const b = bs[i];
    const resto = bs.filter(x => x.id !== id);
    const destino = pos > i ? pos - 1 : pos;
    return [...resto.slice(0, destino), b, ...resto.slice(destino)];
  });
  const subirBajar = (id, d) => setBloques(bs => {
    const i = bs.findIndex(x => x.id === id), j = i + d;
    if (i < 0 || j < 0 || j >= bs.length) return bs;
    const n = [...bs]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const duplicar = (id) => {
    const nuevoId = idBloque();
    setBloques(bs => {
      const i = bs.findIndex(x => x.id === id);
      return [...bs.slice(0, i + 1), { ...JSON.parse(JSON.stringify(bs[i])), id: nuevoId }, ...bs.slice(i + 1)];
    });
    setSel(nuevoId);
  };
  const borrar = (id) => { setBloques(bs => bs.filter(x => x.id !== id)); setSel(null); setPanel('anadir'); };
  // Una imagen de la galería: a la pieza de imagen elegida, o una pieza nueva.
  const ponerImagen = (url, idDestino = null) => {
    const destino = bloques.find(b => b.id === (idDestino || sel));
    if (destino?.tipo === 'imagen') { cambiarBloque({ ...destino, src: url }); setSel(destino.id); setPanel('pieza'); return; }
    const b = { ...nuevoBloque('imagen'), src: url };
    setBloques(bs => { const i = sel ? bs.findIndex(x => x.id === sel) + 1 : bs.length; return [...bs.slice(0, i), b, ...bs.slice(i)]; });
    setSel(b.id); setPanel('pieza');
  };

  // Atajos: deshacer, rehacer, borrar la pieza elegida.
  useEffect(() => {
    const tecla = (e) => {
      const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !escribiendo) { e.preventDefault(); e.shiftKey ? rehacer() : deshacer(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !escribiendo) { e.preventDefault(); rehacer(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !escribiendo) { e.preventDefault(); borrar(sel); }
      else if (e.key === 'Escape' && !escribiendo) { setSel(null); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  // Que no se salga sin querer con cambios sin guardar.
  useEffect(() => {
    const aviso = (e) => { if (cambios) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [cambios]);
  // Mientras se diseña, la página de detrás no se mueve.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, []);

  const piezas = useMemo(() => piezasCorreo(diseno, { marca, vars: ejemplos, automaticos: ejemplosAuto, editor: true }),
    [diseno, marca, ejemplos, ejemplosAuto]);
  const faltan = def ? faltanObligatorios(def, diseno, asunto) : [];

  // ── Arrastrar ──
  const posDesde = (e, i) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? i : i + 1;
  };
  const soltar = (e) => {
    e.preventDefault();
    const dato = e.dataTransfer.getData('text/plain') || '';
    const pos = indicadorRef.current ?? bloques.length;
    setIndicador(null);
    if (dato.startsWith('nuevo:')) insertar(dato.slice(6), pos);
    else if (dato.startsWith('mover:')) mover(dato.slice(6), pos);
    else if (dato.startsWith('imagen:')) {
      const url = dato.slice(7);
      const b = { ...nuevoBloque('imagen'), src: url };
      setBloques(bs => [...bs.slice(0, pos), b, ...bs.slice(pos)]);
      setSel(b.id); setPanel('pieza');
    }
  };
  const Linea = ({ activa }) => (
    <div style={{ height: activa ? 4 : 0, background: 'var(--purple)', borderRadius: 4, margin: activa ? '2px 10px' : 0, transition: 'height .1s' }} />
  );

  const salir = () => {
    if (cambios && !window.confirm('Tienes cambios sin guardar. ¿Salir sin guardarlos?')) return;
    onCerrar();
  };
  const guardar = async () => {
    if (faltan.length) { showToast?.(`A este correo no le puede faltar: ${faltan.join(', ')}.`, 'error'); return; }
    if (conAsunto && !asunto.trim()) { showToast?.('Falta el asunto.', 'error'); return; }
    if (conNombre && !nombre.trim()) { showToast?.('Ponle un nombre a la plantilla.', 'error'); return; }
    setGuardando(true);
    try {
      await onGuardar({ asunto: asunto.trim(), diseno, nombre: nombre.trim() });
      setCambios(false);
    } catch (e) { showToast?.(e.message || 'No se ha podido guardar.', 'error'); }
    finally { setGuardando(false); }
  };
  const comoPlantilla = async () => {
    const n = window.prompt('¿Cómo se llama la plantilla?', nombre || asunto || 'Mi plantilla');
    if (!n?.trim()) return;
    const r = await fetch('/api/admin/correo/plantillas', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: n.trim(), asunto, diseno }),
    });
    const d = await r.json().catch(() => ({}));
    showToast?.(r.ok ? `Guardada en Plantillas como «${n.trim()}».` : (d.error || 'No se ha podido guardar.'), r.ok ? 'success' : 'error');
  };
  const prueba = async () => {
    const r = await fetch('/api/admin/correo/prueba', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asunto: asunto || nombre || 'Prueba de diseño', diseno, clave: clavePrueba }),
    });
    const d = await r.json().catch(() => ({}));
    showToast?.(r.ok ? `Prueba enviada a ${d.enviadaA}. Los datos son de ejemplo.` : (d.error || 'No se ha podido enviar.'), r.ok ? 'success' : 'error');
  };

  const ancho = movil ? 375 : piezas.ancho;
  const pestanaIzq = (id, txt) => (
    <button type="button" onClick={() => setPanel(id)} style={{
      flex: 1, padding: '10px 6px', border: 0, borderBottom: `2px solid ${panel === id || (id === 'anadir' && panel === 'pieza' && !elegido) ? 'var(--purple)' : 'transparent'}`,
      background: 'transparent', color: panel === id ? 'var(--ink)' : 'var(--ink-3)', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
    }}>{txt}</button>
  );
  const tipos = Object.entries(TIPOS_BLOQUE).filter(([t]) => t !== 'auto' || Object.keys(automaticos || {}).length);

  return (
    <div role="dialog" aria-label={titulo} style={{ position: 'fixed', inset: 0, zIndex: 2500, background: 'var(--bg)', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
      {/* Barra de arriba */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={salir}>← Salir</button>
        <strong style={{ fontSize: 14, marginRight: 6, whiteSpace: 'nowrap' }}>{titulo}</strong>
        {conNombre && (
          <input value={nombre} onChange={e => { setNombre(e.target.value); setCambios(true); }} placeholder="Nombre de la plantilla"
            style={{ ...campo, width: 200, fontWeight: 700 }} />
        )}
        {conAsunto && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 260px', minWidth: 200 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}>Asunto</span>
            <input value={asunto} onChange={e => { setAsunto(e.target.value); setCambios(true); }} placeholder="Lo que se lee en la bandeja de entrada" style={{ ...campo, fontWeight: 600 }} />
            {Object.keys(variables || {}).length > 0 && (
              <select value="" title="Añadir un dato" onChange={e => { if (e.target.value) { setAsunto(a => `${a}{${e.target.value}}`); setCambios(true); } }} style={{ ...campo, width: 44, padding: '8px 4px', color: 'var(--purple)', fontWeight: 800 }}>
                <option value="">+</option>
                {Object.entries(variables).map(([k, v]) => <option key={k} value={k}>{v.que}</option>)}
              </select>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button type="button" style={botonIcono()} onClick={deshacer} disabled={!pasado.current.length} title="Deshacer (Ctrl+Z)">↶</button>
          <button type="button" style={botonIcono()} onClick={rehacer} disabled={!futuro.current.length} title="Rehacer (Ctrl+Y)">↷</button>
          <Segmentado valor={movil} onCambio={setMovil} opciones={[[false, 'Ordenador'], [true, 'Móvil']]} />
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setVistaPrevia(true)}><I.Eye width={14} height={14} /> Vista previa</button>
          <button type="button" className="btn btn-sm btn-outline" onClick={prueba}><I.Mail width={14} height={14} /> Enviarme una prueba</button>
          {puedeGuardarComoPlantilla && <button type="button" className="btn btn-sm btn-outline" onClick={comoPlantilla}>Guardar como plantilla</button>}
          <button type="button" className="btn btn-sm btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : textoGuardar}</button>
        </div>
      </header>

      <div className="editor-diseno-cuerpo" style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr) 310px', minHeight: 0 }}>
        {/* Izquierda: piezas, imágenes y estilo */}
        <aside style={{ borderRight: '1px solid var(--line)', background: 'var(--bg-2)', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: 0 }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
            {pestanaIzq('anadir', 'Añadir')}{pestanaIzq('imagenes', 'Imágenes')}{pestanaIzq('estilo', 'Estilo')}
          </div>
          <div style={{ overflow: 'auto', padding: 14 }}>
            {(panel === 'anadir' || panel === 'pieza') && (
              <div style={{ display: 'grid', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Arrastra una pieza al correo o púlsala para ponerla {sel ? 'debajo de la elegida' : 'al final'}.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {tipos.map(([t, v]) => (
                    <button key={t} type="button" draggable title={v.que}
                      onDragStart={e => { e.dataTransfer.setData('text/plain', `nuevo:${t}`); e.dataTransfer.effectAllowed = 'copy'; }}
                      onDragEnd={() => setIndicador(null)}
                      onClick={() => insertar(t)}
                      style={{ display: 'grid', justifyItems: 'center', gap: 6, padding: '12px 6px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--bg)', cursor: 'grab', fontFamily: 'inherit', color: 'var(--ink-2)' }}>
                      <span style={{ height: 22, display: 'grid', placeItems: 'center', color: 'var(--purple)' }}>{DIBUJO[t]}</span>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{v.nombre}</span>
                    </button>
                  ))}
                </div>
                {Object.keys(variables || {}).length > 0 && (
                  <details style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Datos que se rellenan solos</summary>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 16, display: 'grid', gap: 3 }}>
                      {Object.entries(variables).map(([k, v]) => <li key={k}><code>{`{${k}}`}</code> · {v.que}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {panel === 'imagenes' && <Galeria onElegir={(url) => ponerImagen(url)} showToast={showToast} />}
            {panel === 'estilo' && (
              <div style={{ display: 'grid', gap: 14 }}>
                <Color etiqueta="Fondo de fuera" valor={diseno.fondo} onCambio={v => cambiar(d => ({ ...d, fondo: v }))} marca={marca} vacio="De la marca" />
                <Color etiqueta="Fondo del correo" valor={diseno.lienzo} onCambio={v => cambiar(d => ({ ...d, lienzo: v }))} marca={marca} vacio="De la marca" />
                <label style={etiqueta}><span>Tipo de letra</span>
                  <select value={diseno.fuente || ''} onChange={e => cambiar(d => ({ ...d, fuente: e.target.value }))} style={campo}>
                    <option value="">La de la marca</option>
                    {Object.entries(FUENTES).map(([k, f]) => <option key={k} value={k} style={{ fontFamily: f.css }}>{f.nombre}</option>)}
                  </select>
                </label>
                <label style={{ ...etiqueta, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={diseno.cabecera !== false} onChange={e => cambiar(d => ({ ...d, cabecera: e.target.checked }))} /> <span>Cabecera con el logo</span>
                </label>
                <label style={{ ...etiqueta, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={diseno.pie !== false} onChange={e => cambiar(d => ({ ...d, pie: e.target.checked }))} /> <span>Pie con los datos del club</span>
                </label>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>El logo, los colores del club y el texto del pie se cambian en <b>CRM → Diseño de correos → Marca</b>, y valen para todos los correos.</p>
              </div>
            )}
          </div>
        </aside>

        {/* Centro: el correo */}
        <section style={{ overflow: 'auto', background: piezas.fondo, padding: '26px 14px 60px' }}
          onClick={e => { if (e.target === e.currentTarget) { setSel(null); setPanel('anadir'); } }}
          onDragOver={e => { e.preventDefault(); if (e.target === e.currentTarget) setIndicador(bloques.length); }}
          onDrop={soltar}>
          {faltan.length > 0 && (
            <div style={{ maxWidth: ancho, margin: '0 auto 12px', padding: '10px 14px', borderRadius: 10, background: '#fdecec', color: '#8a1c1c', fontSize: 13 }}>
              <b>A este correo le falta:</b> {faltan.join(', ')}. Sin eso no funciona: vuelve a ponerlo antes de guardar.
            </div>
          )}
          <div style={{ width: ancho, maxWidth: '100%', margin: '0 auto', background: piezas.lienzo, borderRadius: movil ? 0 : piezas.radio, boxShadow: '0 10px 40px rgba(0,0,0,.12)', overflow: 'hidden', transition: 'width .2s' }}
            onClickCapture={e => { if (e.target.closest?.('a')) e.preventDefault(); }}>
            {piezas.cabecera
              ? <div title="La cabecera se cambia en Marca" dangerouslySetInnerHTML={{ __html: piezas.cabecera + '<div style="height:10px"></div>' }} />
              : <div style={{ height: 18 }} />}
            {bloques.length === 0 && (
              <div onDragOver={e => { e.preventDefault(); setIndicador(0); }} style={{ margin: 20, padding: '46px 16px', border: '2px dashed var(--line)', borderRadius: 12, textAlign: 'center', color: '#8a857d', fontSize: 14 }}>
                Arrastra aquí las piezas del panel de la izquierda.
              </div>
            )}
            {piezas.bloques.map((p, i) => {
              const activo = sel === p.id;
              return (
                <React.Fragment key={p.id}>
                  <Linea activa={indicador === i} />
                  <div draggable
                    onDragStart={e => { e.dataTransfer.setData('text/plain', `mover:${p.id}`); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setIndicador(null)}
                    onDragOver={e => {
                      e.preventDefault(); e.stopPropagation();
                      // Una imagen encima de una pieza de imagen la cambia.
                      setIndicador(posDesde(e, i));
                    }}
                    onDrop={e => {
                      const dato = e.dataTransfer.getData('text/plain') || '';
                      if (dato.startsWith('imagen:') && bloques[i]?.tipo === 'imagen') {
                        e.preventDefault(); e.stopPropagation(); setIndicador(null); ponerImagen(dato.slice(7), p.id);
                      }
                    }}
                    onClick={e => { e.stopPropagation(); setSel(p.id); setPanel('pieza'); }}
                    style={{ position: 'relative', cursor: 'pointer', outline: activo ? '2px solid var(--purple)' : 'none', outlineOffset: -2, minHeight: p.html ? undefined : 18 }}
                    className="pieza-correo">
                    {p.html
                      ? <div dangerouslySetInnerHTML={{ __html: p.html }} />
                      : <div style={{ padding: '6px 28px', fontSize: 12, color: '#8a857d', fontStyle: 'italic' }}>{TIPOS_BLOQUE[p.tipo]?.nombre} (ahora no sale: su dato está vacío)</div>}
                    {activo && (
                      <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 3, background: 'var(--ink)', borderRadius: 8, padding: 3, boxShadow: '0 4px 12px rgba(0,0,0,.25)' }}
                        onClick={e => e.stopPropagation()}>
                        {[['↑', 'Subir', () => subirBajar(p.id, -1)], ['↓', 'Bajar', () => subirBajar(p.id, 1)], ['⧉', 'Duplicar', () => duplicar(p.id)], ['✕', 'Borrar', () => borrar(p.id)]].map(([t, n, f]) => (
                          <button key={n} type="button" title={n} onClick={f} style={{ border: 0, background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 800, padding: '4px 7px', borderRadius: 6 }}>{t}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
            <Linea activa={indicador === bloques.length && bloques.length > 0} />
            <div onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIndicador(bloques.length); }} style={{ height: 18 }} />
            {piezas.pie && <div title="El pie se cambia en Marca" dangerouslySetInnerHTML={{ __html: piezas.pie }} />}
          </div>
          <style>{`.pieza-correo:hover{outline:2px dashed color-mix(in oklab, var(--purple) 55%, transparent)!important;outline-offset:-2px}`}</style>
        </section>

        {/* Derecha: la pieza elegida */}
        <aside style={{ borderLeft: '1px solid var(--line)', background: 'var(--bg-2)', overflow: 'auto', padding: 16 }}>
          {elegido ? (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>{TIPOS_BLOQUE[elegido.tipo]?.nombre}</h3>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" style={botonIcono()} title="Duplicar" onClick={() => duplicar(elegido.id)}>Duplicar</button>
                  <button type="button" style={{ ...botonIcono(), color: '#c62828' }} title="Borrar" onClick={() => borrar(elegido.id)}>Borrar</button>
                </div>
              </div>
              <Propiedades b={elegido} cambiar={cambiarBloque} variables={variables} automaticos={automaticos} marca={marca}
                onGaleria={() => setPanel('imagenes')} showToast={showToast} />
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12, fontSize: 13, color: 'var(--ink-3)' }}>
              <h3 style={{ margin: 0, fontSize: 15, color: 'var(--ink)' }}>Cómo se usa</h3>
              <p style={{ margin: 0 }}>1. <b>Añade piezas</b> desde la izquierda: arrástralas al sitio exacto del correo o púlsalas.</p>
              <p style={{ margin: 0 }}>2. <b>Pulsa una pieza</b> del correo para cambiar su texto, sus colores o su imagen aquí.</p>
              <p style={{ margin: 0 }}>3. <b>Arrástrala</b> para cambiarla de sitio. Con la pieza elegida, <kbd>Supr</kbd> la borra y <kbd>Ctrl+Z</kbd> deshace.</p>
              <p style={{ margin: 0 }}>4. Mira cómo queda en el <b>móvil</b> y <b>envíate una prueba</b> antes de guardar.</p>
              {Object.keys(variables || {}).length > 0 && <p style={{ margin: 0 }}>Los datos como <code>{'{nombre}'}</code> se cambian por los de cada persona al enviarlo. Aquí ves un ejemplo.</p>}
            </div>
          )}
        </aside>
      </div>

      {vistaPrevia && <VistaPrevia diseno={diseno} marca={marca} vars={ejemplos} automaticos={ejemplosAuto} asunto={asunto} onCerrar={() => setVistaPrevia(false)} />}
      <style>{`@media (max-width: 1000px){.editor-diseno-cuerpo{grid-template-columns:200px minmax(0,1fr) 260px!important}}
        @media (max-width: 760px){.editor-diseno-cuerpo{grid-template-columns:1fr!important;grid-template-rows:auto minmax(0,1fr) auto;overflow:auto}}`}</style>
    </div>
  );
}

// El correo tal cual, en una ventana, en ordenador y en móvil.
export function VistaPrevia({ diseno, marca, vars = {}, automaticos = {}, asunto = '', onCerrar }) {
  const [movil, setMovil] = useState(false);
  const html = useMemo(() => htmlCorreo(diseno, { marca, vars, automaticos, titulo: asunto }), [diseno, marca, vars, automaticos, asunto]);
  const asuntoVisto = String(asunto || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 2700, display: 'grid', placeItems: 'center', padding: 16 }} onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div style={{ background: 'var(--bg)', borderRadius: 16, width: movil ? 420 : 'min(760px, 100%)', maxWidth: '100%', height: '90vh', display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Asunto</div>
            <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asuntoVisto || '(sin asunto)'}</div>
          </div>
          <Segmentado valor={movil} onCambio={setMovil} opciones={[[false, 'Ordenador'], [true, 'Móvil']]} />
          <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>Cerrar</button>
        </div>
        <iframe title="Vista previa del correo" srcDoc={html} sandbox="allow-popups" style={{ border: 0, width: '100%', height: '100%', background: '#fff' }} />
      </div>
    </div>
  );
}
