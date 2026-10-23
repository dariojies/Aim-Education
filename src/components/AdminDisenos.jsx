import React, { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext } from 'react';
import { I } from './Icons.jsx';
import { subirImagen } from './EditorDiseno.jsx';
import { useRouter } from '../App.jsx';
import {
  TAMANOS, FUENTES_DISENO, VARIABLES_DIPLOMA, EJEMPLO_DIPLOMA, nuevoId, pintarDiseno, cargarImagenes, cargarImagen, cargarFuentes,
  pedirFuentes, miniatura, exportarDiseno, exportarLote, lienzoDe, ajustarTexto, adaptarDiseno, posicionEnTexto,
} from '../disenos/render.js';
import { PLANTILLAS } from '../disenos/plantillas.js';
import { Plantillas as PlantillasCorreo, Marca as MarcaCorreo } from './AdminDisenoCorreos.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Aim Design: todo lo que se diseña en el club, en un solo sitio. Las imágenes
// y los diplomas (aquí) y los correos (plantillas y marca, AdminDisenoCorreos).
//
// Imágenes y diplomas: el «Canva» del club. Carteles, posts, historias y diplomas en un
// lienzo libre: textos, imágenes y formas que se mueven, se cambian de tamaño
// y se giran; capas, alinear, deshacer; y se exporta a PNG, JPG o PDF. Los de
// tipo diploma llevan huecos ({alumno}, {curso}…) y son los diplomas del aula.
// Se pinta con src/disenos/render.js (lo mismo que se exporta).
//
// Lo que lo acerca a Canva: se escribe en el propio lienzo (doble clic en un
// texto), la marca del club en todos los colores, códigos QR, el horario y los
// eventos de verdad, las fotos de la galería con permiso, y el menú «Usar»:
// publicar en redes (un borrador en Publicaciones), el mismo diseño en otros
// tamaños, diplomas en lote (un PDF para toda una clase o un examen), guardarlo
// para los correos y las noticias, y plantillas del equipo.
// ─────────────────────────────────────────────────────────────────────────────

const inp = { fontFamily: 'inherit', fontSize: 13, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box' };
const etq = { display: 'grid', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' };
const seccionT = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)', margin: '6px 0 2px' };
const tamanoTexto = (d) => TAMANOS.find(t => t.ancho === d.ancho && t.alto === d.alto)?.nombre || `${d.ancho} × ${d.alto} px`;
// La marca (colores y logo de «Marca de los correos»), para todos los paneles del editor.
const PALETA_CLUB = ['#5233A8', '#FF5FA2', '#F99B35', '#FFD526', '#21B668', '#00BBF4', '#1A1A1A', '#FFFFFF', '#F6F4EF'];
const KitMarca = createContext(null);
const coloresMarca = (kit) => (kit?.colores?.length ? kit.colores : PALETA_CLUB);
const LOGOS_MARCA = [
  ['/src/brand/Aim_Horizontal.png', 'Logo'], ['/src/brand/Aim_White.png', 'Logo blanco', true], ['/src/brand/Aim_Black.png', 'Logo negro'],
  ['/src/brand/Aim_Gradient.png', 'Logo en degradado'], ['/src/brand/Aim_Vertical.png', 'Logo vertical'],
];
const PEGATINAS = ['/src/brand/Aim_Sticker01.png', '/src/brand/Aim_Sticker02.png', '/src/brand/Aim_Sticker03.png'];
const WEB = 'https://www.aimeducation.es';
const ENLACES_QR = [
  ['Inscripción', `${WEB}/auth?mode=register`], ['Campamento', `${WEB}/campamento`], ['Actividades', `${WEB}/actividades`],
  ['Calendario', `${WEB}/calendario`], ['Contacto', `${WEB}/contacto`], ['La web', WEB],
];
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const hoyLargo = () => new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });
const fechaLarga = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : hoyLargo());
const lienzoAJpeg = (c, calidad = 0.9) => new Promise((ok, ko) => c.toBlob(b => (b ? ok(b) : ko(new Error('No se ha podido preparar la imagen.'))), 'image/jpeg', calidad));

async function api(url, { method = 'GET', body } = {}) {
  const r = await fetch(url, { method, credentials: 'include', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido hacer.');
  return d;
}

// ═══════════════════════ Aim Design ═══════════════════════
const PESTANAS_DESIGN = [['imagenes', 'Imágenes y diplomas'], ['correos', 'Plantillas de correo'], ['marca', 'Marca de los correos']];
const pastillaDesign = (activa) => ({
  padding: '8px 16px', fontSize: 13, borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
  border: `1px solid ${activa ? 'var(--ink)' : 'var(--line)'}`, background: activa ? 'var(--ink)' : 'var(--bg-2)', color: activa ? '#fff' : 'var(--ink-2)',
});
export default function AimDesign({ showToast, pestana: inicial, conCorreos = true }) {
  const pestanas = conCorreos ? PESTANAS_DESIGN : PESTANAS_DESIGN.slice(0, 1);
  const [pestana, setPestana] = useState(pestanas.some(([k]) => k === inicial) ? inicial : 'imagenes');
  useEffect(() => { if (pestanas.some(([k]) => k === inicial)) setPestana(inicial); }, [inicial]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {pestanas.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pestanas.map(([k, t]) => <button key={k} type="button" style={pastillaDesign(pestana === k)} onClick={() => setPestana(k)}>{t}</button>)}
        </div>
      )}
      {pestana === 'imagenes' && <DisenosGraficos showToast={showToast} puedePublicar={conCorreos} />}
      {pestana === 'correos' && <PlantillasCorreo showToast={showToast} />}
      {pestana === 'marca' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14, maxWidth: 760 }}>El logo, los colores, la letra y el pie que llevan todos los correos del club.</p>
          <MarcaCorreo showToast={showToast} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════ La lista de imágenes y diplomas ═══════════════════════
function DisenosGraficos({ showToast, puedePublicar }) {
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

  if (abierto) return <Editor inicial={abierto} showToast={showToast} puedePublicar={puedePublicar} onCerrar={() => { setAbierto(null); cargar(); }} />;
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
                {d.plantilla && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--purple)' }}>★ Plantilla del equipo</span>}
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
      {nuevo && <NuevoDiseno equipo={(datos?.disenos || []).filter(d => d.plantilla)} onCerrar={() => setNuevo(false)} onCrear={(d) => { setNuevo(false); setAbierto(d); }} />}
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

function NuevoDiseno({ equipo = [], onCerrar, onCrear }) {
  const [ancho, setAncho] = useState(1080);
  const [alto, setAlto] = useState(1080);
  const blanco = (t) => onCrear({ id: null, nombre: t.nombre, tipo: 'libre', datos: { ancho: t.ancho, alto: t.alto, fondo: { tipo: 'color', color: '#ffffff' }, elementos: [] } });
  // Una plantilla del equipo: se trabaja sobre una copia (la plantilla no se toca).
  async function deEquipo(p) {
    try {
      const d = await api(`/api/admin/disenos/${p.id}`);
      const { esPlantilla, ...datos } = d.datos; // eslint-disable-line no-unused-vars
      onCrear({ id: null, nombre: d.nombre, tipo: d.tipo, datos });
    } catch (e) { alert(e.message); }
  }
  return (
    <Ventana titulo="Nuevo diseño" onCerrar={onCerrar} ancho={860}>
      {equipo.length > 0 && <>
        <div style={seccionT}>Plantillas del equipo</div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {equipo.map(p => (
            <button key={p.id} type="button" onClick={() => deEquipo(p)}
              style={{ font: 'inherit', cursor: 'pointer', padding: 8, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', display: 'grid', gap: 6, textAlign: 'left' }}>
              <span style={{ display: 'grid', placeItems: 'center', aspectRatio: '4 / 3', background: 'var(--bg-2)', borderRadius: 8 }}>
                {p.miniatura && <img src={p.miniatura} alt="" style={{ maxWidth: '90%', maxHeight: '90%' }} />}
              </span>
              <b style={{ fontSize: 12.5 }}>{p.nombre}</b>
            </button>
          ))}
        </div>
      </>}
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
const NOMBRE_TIPO = { texto: 'Texto', imagen: 'Imagen', rect: 'Rectángulo', elipse: 'Círculo', linea: 'Línea', qr: 'Código QR' };
const etiquetaElemento = (e) => (e.tipo === 'texto' ? `«${String(e.texto || '').split('\n')[0].slice(0, 26)}»` : NOMBRE_TIPO[e.tipo] || e.tipo);

function Editor({ inicial, showToast, onCerrar, puedePublicar }) {
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
  const [editando, setEditando] = useState(null);     // { id, cursor }: el texto que se escribe en el lienzo
  const [verUsar, setVerUsar] = useState(false);
  const [ventana, setVentana] = useState(null);       // 'redes' | 'tamanos' | 'lote' | 'biblioteca' | 'fotos'
  const [kit, setKit] = useState(null);
  const { go } = useRouter();
  const zonaRef = useRef(null), lienzoRef = useRef(null), textoRef = useRef(null), arrastre = useRef(null), edicion = useRef(null);
  const disenoRef = useRef(diseno); disenoRef.current = diseno;
  const ejemplo = tipo === 'diploma' ? EJEMPLO_DIPLOMA : null;
  const elegido = diseno.elementos.find(e => e.id === sel) || null;

  useEffect(() => { pedirFuentes(); api('/api/admin/disenos/marca').then(setKit).catch(() => setKit(null)); }, []);
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
    // El texto que se está escribiendo no se pinta: se ve el de la caja de escribir.
    pintarDiseno(ctx, diseno, { imagenes, variables: ejemplo, ocultar: editando?.id });
  }, [diseno, escala, imagenes, version, ejemplo, editando]);

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
  const anadirImagen = async (url, ancho, alto) => {
    if (!ancho || !alto) { const i = await cargarImagen(url); ancho = i?.naturalWidth || 600; alto = i?.naturalHeight || 600; }
    const k = Math.min(1, (diseno.ancho * 0.5) / ancho, (diseno.alto * 0.5) / alto);
    anadir({ tipo: 'imagen', url, w: Math.round(ancho * k), h: Math.round(alto * k), ajuste: 'contener', radio: 0 });
  };
  const anadirQr = (texto) => { const lado = Math.round(base * 0.28); anadir({ tipo: 'qr', texto, w: lado, h: lado, color: '#1A1A1A', fondo: '#FFFFFF', radio: 0 }); };
  // Un título y su texto debajo (el horario, los eventos…), en el centro.
  function anadirBloque(titulo, cuerpo) {
    const w = Math.round(diseno.ancho * 0.8), x = Math.round((diseno.ancho - w) / 2), hueco = Math.round(base * 0.03);
    const t = ajustarTexto({ id: nuevoId(), tipo: 'texto', rot: 0, opacidad: 1, texto: titulo, x, y: 0, w, h: 100, fuente: 'Plus Jakarta Sans', tamano: Math.round(base * 0.06), negrita: true, color: '#1A1A1A', alinear: 'centro', interlineado: 1.2 }, ejemplo);
    const c = ajustarTexto({ ...t, id: nuevoId(), texto: cuerpo, fuente: 'Montserrat', tamano: Math.round(base * 0.032), negrita: false, interlineado: 1.45 }, ejemplo);
    t.y = Math.max(0, Math.round((diseno.alto - (t.h + hueco + c.h)) / 2)); c.y = t.y + t.h + hueco;
    aplicar(d => ({ ...d, elementos: [...d.elementos, t, c] }));
    setSel(c.id); setPanel('anadir');
  }
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

  // ── Escribir en el propio lienzo: doble clic en un texto (o Intro con él elegido) ──
  // Se escribe en una caja encima, con la misma letra; al salir (clic fuera, Esc)
  // todo lo escrito es un solo paso de deshacer.
  function editarTexto(idEl, punto) {
    const el = disenoRef.current.elementos.find(e => e.id === idEl);
    if (!el || el.tipo !== 'texto' || el.bloqueado) return;
    let cursor = String(el.texto || '').length;
    if (punto && lienzoRef.current) {
      // El punto del clic, en la caja del texto (sin su giro).
      const r = lienzoRef.current.getBoundingClientRect();
      const cx = r.left + (el.x + el.w / 2) * escala, cy = r.top + (el.y + el.h / 2) * escala;
      const a = -(el.rot || 0) * Math.PI / 180, vx = punto.x - cx, vy = punto.y - cy;
      cursor = posicionEnTexto(el, (vx * Math.cos(a) - vy * Math.sin(a)) / escala + el.w / 2, (vx * Math.sin(a) + vy * Math.cos(a)) / escala + el.h / 2);
    }
    edicion.current = { id: idEl, previo: disenoRef.current };
    setSel(idEl); setEditando({ id: idEl, cursor });
  }
  function terminarTexto() {
    const ed = edicion.current; edicion.current = null; setEditando(null);
    if (ed && disenoRef.current !== ed.previo) setHist(h => ({ atras: [...h.atras.slice(-99), ed.previo], adelante: [] }));
  }

  // ── Arrastrar, cambiar de tamaño y girar ──
  function empezar(ev, idEl, modo, hx = 0, hy = 0) {
    ev.stopPropagation(); ev.preventDefault();
    if (edicion.current) document.activeElement?.blur?.();
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
        if (esquina && (e0.tipo === 'imagen' || e0.tipo === 'texto' || e0.tipo === 'qr' || ev.shiftKey)) {
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
      else if (ev.key === 'Enter' && sel && elegido?.tipo === 'texto') { ev.preventDefault(); editarTexto(sel); }
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
    aplicar(d => (ajustar ? adaptarDiseno(d, t.ancho, t.alto, ejemplo) : { ...d, ancho: t.ancho, alto: t.alto }));
    setVerTamano(false);
  }
  // ── Usar el diseño en otro sitio ──
  async function guardarSiHaceFalta() { if (sucio) await guardar(); }
  async function comoPlantilla() {
    setVerUsar(false);
    const n = window.prompt('Nombre de la plantilla (la verá todo el equipo al pulsar «Nuevo diseño»):', nombre);
    if (!n?.trim()) return;
    try {
      const mini = await miniatura(diseno, ejemplo).catch(() => null);
      await api('/api/admin/disenos', { method: 'POST', body: { nombre: n.trim(), tipo, datos: { ...diseno, esPlantilla: true }, miniatura: mini } });
      showToast?.('Guardada como plantilla del equipo: sale al pulsar «Nuevo diseño».');
    } catch (e) { alert(e.message); }
  }
  const usar = (v) => { setVerUsar(false); setVerExportar(false); setVentana(v); };

  const marco = { position: 'absolute', left: 0, top: 0, width: diseno.ancho * escala, height: diseno.alto * escala };
  const botonBarra = { font: 'inherit', fontSize: 13, fontWeight: 700, padding: '7px 11px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center' };

  return (
    <KitMarca.Provider value={kit}>
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--bg)', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      {/* Barra de arriba */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
        <button type="button" style={botonBarra} onClick={cerrar}>← Aim Design</button>
        <input value={nombre} onChange={e => { setNombre(e.target.value); setSucio(true); }} aria-label="Nombre del diseño" style={{ ...inp, width: 230, fontWeight: 700, fontSize: 14 }} />
        <select value={tipo} onChange={e => { setTipo(e.target.value); setSucio(true); }} aria-label="Tipo" style={{ ...inp, width: 'auto' }}>
          <option value="libre">Diseño</option><option value="diploma">Diploma del aula</option>
        </select>
        <button type="button" style={botonBarra} onClick={() => setVerTamano(true)} title="Cambiar el tamaño del lienzo">{tamanoTexto(diseno)}</button>
        {diseno.esPlantilla && (
          <label style={{ fontSize: 12, fontWeight: 800, color: 'var(--purple)', display: 'inline-flex', gap: 6, alignItems: 'center' }} title="Sale en «Nuevo diseño» para todo el equipo">
            <input type="checkbox" checked onChange={() => { if (window.confirm('¿Deja de ser una plantilla del equipo? (El diseño se queda.)')) aplicar(d => { const { esPlantilla, ...resto } = d; return resto; }); }} /> ★ Plantilla del equipo
          </label>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" style={botonBarra} onClick={deshacer} disabled={!hist.atras.length} title="Deshacer (Ctrl+Z)">↶</button>
        <button type="button" style={botonBarra} onClick={rehacer} disabled={!hist.adelante.length} title="Rehacer (Ctrl+Y)">↷</button>
        <div style={{ position: 'relative' }}>
          <button type="button" style={botonBarra} onClick={() => { setVerExportar(v => !v); setVerUsar(false); }}><I.Download width={14} height={14} /> Exportar</button>
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
        <div style={{ position: 'relative' }}>
          <button type="button" style={botonBarra} onClick={() => { setVerUsar(v => !v); setVerExportar(false); }}>✦ Usar ▾</button>
          {verUsar && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 5, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 6, display: 'grid', minWidth: 270 }}>
              {[
                puedePublicar && ['redes', 'Publicar en redes', 'Un borrador en Publicaciones, listo para Facebook e Instagram'],
                ['tamanos', 'En otros tamaños', 'El mismo diseño como post, historia, A4…'],
                tipo === 'diploma' && ['lote', 'Diplomas en lote', 'Un PDF con uno para cada alumno de una clase o un examen'],
                ['biblioteca', 'Para correos y noticias', 'Se guarda en las imágenes de la web'],
                ['plantilla', 'Guardar como plantilla del equipo', 'Para que todos empiecen desde aquí'],
              ].filter(Boolean).map(([k, t, d]) => (
                <button key={k} type="button" onClick={() => (k === 'plantilla' ? comoPlantilla() : usar(k))} style={{ font: 'inherit', textAlign: 'left', padding: '8px 10px', border: 0, borderRadius: 8, background: 'none', color: 'var(--ink)', cursor: 'pointer', display: 'grid' }}>
                  <b style={{ fontSize: 13 }}>{t}</b><span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{d}</span>
                </button>
              ))}
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
            <PanelAnadir tipo={tipo} kit={kit} anadirTexto={anadirTexto} anadirForma={anadirForma} anadirImagen={anadirImagen} anadirQr={anadirQr}
              anadirBloque={anadirBloque} verFotos={() => setVentana('fotos')} subir={subir} />
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
        <div ref={zonaRef} onPointerDown={() => { if (edicion.current) document.activeElement?.blur?.(); setSel(null); }} style={{ position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center',
          background: 'repeating-conic-gradient(color-mix(in oklab, var(--ink) 4%, var(--bg)) 0% 25%, var(--bg) 0% 50%) 50% / 24px 24px' }}>
          <div style={{ position: 'relative', width: diseno.ancho * escala, height: diseno.alto * escala, boxShadow: '0 10px 40px -10px rgba(0,0,0,.35)' }}>
            <canvas ref={lienzoRef} style={{ ...marco, width: diseno.ancho * escala, height: diseno.alto * escala, display: 'block' }} />
            <div style={marco}>
              {diseno.elementos.map(e => (e.oculto ? null : (
                <div key={e.id} onPointerDown={(ev) => empezar(ev, e.id, 'mover')} onDoubleClick={(ev) => { if (e.tipo === 'texto') editarTexto(e.id, { x: ev.clientX, y: ev.clientY }); }}
                  title={e.tipo === 'texto' && !e.bloqueado && e.id === sel && !editando ? 'Doble clic para escribir' : undefined}
                  style={{ position: 'absolute', left: e.x * escala, top: e.y * escala, width: e.w * escala, height: e.h * escala, transform: `rotate(${e.rot || 0}deg)`,
                    cursor: e.bloqueado ? 'default' : e.tipo === 'texto' && e.id === sel ? 'text' : 'move', outline: e.id === sel && editando?.id !== e.id ? '2px solid #7C5CFF' : 'none', outlineOffset: 1, touchAction: 'none' }}>
                  {e.id === sel && !e.bloqueado && editando?.id !== e.id && (
                    <>
                      {[[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]].filter(([hx, hy]) => (e.tipo === 'linea' ? hy === 0 : e.tipo === 'qr' ? hx && hy : true)).map(([hx, hy]) => (
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
              {editando && (() => {
                const el = diseno.elementos.find(x => x.id === editando.id);
                return el ? <TextoEnLienzo key={el.id} e={el} escala={escala} cursor={editando.cursor} onCambio={(texto) => cambiarEl(el.id, { texto }, { historia: false })} onFin={terminarTexto} /> : null;
              })()}
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
            <Propiedades e={elegido} tipo={tipo} cambiar={(c) => cambiarEl(elegido.id, c)} textoRef={textoRef} subir={subir} onEscribir={() => editarTexto(elegido.id)}
              acciones={{ duplicar: duplicarSel, borrar: borrarSel, capa, alinear }} />
          )}
        </aside>
      </div>

      {verTamano && (
        <Ventana titulo="Cambiar el tamaño del lienzo" onCerrar={() => setVerTamano(false)}>
          <CambiarTamano actual={diseno} onElegir={cambiarTamano} />
        </Ventana>
      )}
      {ventana === 'redes' && <PublicarEnRedes diseno={diseno} ejemplo={ejemplo} onCerrar={() => setVentana(null)}
        onHecho={async (id) => { await guardarSiHaceFalta().catch(() => {}); go(`/admin/publicaciones?abrir=${id}`); }} />}
      {ventana === 'tamanos' && <OtrosTamanos diseno={diseno} nombre={nombre} tipo={tipo} ejemplo={ejemplo} showToast={showToast} onCerrar={() => setVentana(null)} />}
      {ventana === 'lote' && <DiplomasEnLote diseno={diseno} nombre={nombre} onCerrar={() => setVentana(null)} />}
      {ventana === 'biblioteca' && <ParaCorreosYNoticias diseno={diseno} nombre={nombre} ejemplo={ejemplo} onCerrar={() => setVentana(null)} />}
      {ventana === 'fotos' && <FotosDelClub onCerrar={() => setVentana(null)} onElegir={(f) => { setVentana(null); anadirImagen(`/api/admin/disenos/foto-club/${f.id}/grande`, f.ancho, f.alto); }} />}
    </div>
    </KitMarca.Provider>
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

function PanelAnadir({ tipo, kit, anadirTexto, anadirForma, anadirImagen, anadirQr, anadirBloque, verFotos, subir }) {
  const [subidas, setSubidas] = useState(null);
  const [qr, setQr] = useState('');
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
            {VARIABLES_DIPLOMA.map(v => <button key={v.id} type="button" className="btn btn-sm btn-outline" title={v.nombre} style={v.lote ? { borderStyle: 'dashed' } : undefined} onClick={() => anadirTexto(v.id === 'alumno' ? 'titulo' : 'subtitulo', `{${v.id}}`)}>{`{${v.id}}`}</button>)}
          </div>
        </>
      )}
      <div style={seccionT}>Formas</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        <button type="button" style={{ ...bloque, textAlign: 'center' }} onClick={() => anadirForma('rect')} title="Rectángulo"><span style={{ display: 'inline-block', width: 30, height: 22, background: '#5233A8', borderRadius: 4 }} /></button>
        <button type="button" style={{ ...bloque, textAlign: 'center' }} onClick={() => anadirForma('elipse')} title="Círculo"><span style={{ display: 'inline-block', width: 24, height: 24, background: '#FF5FA2', borderRadius: 99 }} /></button>
        <button type="button" style={{ ...bloque, textAlign: 'center' }} onClick={() => anadirForma('linea')} title="Línea"><span style={{ display: 'inline-block', width: 30, height: 3, background: 'var(--ink)', verticalAlign: 'middle' }} /></button>
      </div>
      <div style={seccionT}>Código QR</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {ENLACES_QR.map(([t, u]) => <button key={t} type="button" className="btn btn-sm btn-outline" style={{ padding: '3px 8px', fontSize: 12 }} title={u} onClick={() => anadirQr(u)}>{t}</button>)}
        {kit?.redes?.whatsapp && <button type="button" className="btn btn-sm btn-outline" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => anadirQr(kit.redes.whatsapp)}>WhatsApp</button>}
        {kit?.redes?.instagram && <button type="button" className="btn btn-sm btn-outline" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => anadirQr(kit.redes.instagram)}>Instagram</button>}
      </div>
      <form style={{ display: 'flex', gap: 6 }} onSubmit={(ev) => { ev.preventDefault(); if (qr.trim()) { anadirQr(qr.trim()); setQr(''); } }}>
        <input value={qr} onChange={e => setQr(e.target.value)} placeholder="Otro enlace o texto" aria-label="Enlace del código QR" style={inp} />
        <button type="submit" className="btn btn-sm btn-primary" disabled={!qr.trim()}>QR</button>
      </form>

      <DatosDelClub anadirBloque={anadirBloque} kit={kit} />

      <div style={seccionT}>Imágenes</div>
      <BotonSubir texto="⬆ Subir una imagen" onArchivo={(f) => subir(f, (r) => anadirImagen(r.url, r.ancho, r.alto))} />
      <button type="button" className="btn btn-sm btn-outline" onClick={verFotos} title="Las de la galería en las que todos los que salen tienen permiso de fotos">📷 Fotos del club</button>
      <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>La marca</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[...(kit?.logo && !LOGOS_MARCA.some(([u]) => u === kit.logo) ? [[kit.logo, 'Logo de los correos']] : []), ...LOGOS_MARCA].map(([u, t, oscuro]) => (
          <button key={u} type="button" style={{ ...bloque, display: 'grid', placeItems: 'center', height: 56, ...(oscuro ? { background: '#2a2a2a' } : {}) }} onClick={() => anadirImagen(u)} title={t}><img src={u} alt={t} style={{ maxWidth: '90%', maxHeight: 40 }} /></button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {PEGATINAS.map((u, i) => <button key={u} type="button" style={{ ...bloque, display: 'grid', placeItems: 'center', height: 64, padding: 4 }} onClick={() => anadirImagen(u)} title={`Pegatina ${i + 1}`}><img src={u} alt={`Pegatina ${i + 1}`} style={{ maxWidth: '100%', maxHeight: 54 }} /></button>)}
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
  const kit = useContext(KitMarca);
  const nada = !valor || valor === 'transparent';
  return (
    <div style={etq}><span>{etiqueta}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="color" aria-label={etiqueta} value={nada ? '#ffffff' : valor} onChange={e => onCambio(e.target.value)} style={{ width: 38, height: 32, padding: 0, border: '1px solid var(--line)', borderRadius: 8, background: 'none' }} />
        <input aria-label={`${etiqueta} (código)`} value={nada ? '' : valor} placeholder={permiteNada ? 'Sin color' : '#000000'} onChange={e => onCambio(e.target.value || (permiteNada ? 'transparent' : '#000000'))} style={{ ...inp, fontFamily: 'monospace' }} />
        {permiteNada && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onCambio('transparent')} title="Sin color">∅</button>}
      </div>
      {/* Los colores de la marca, a un toque. */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {coloresMarca(kit).map(c => (
          <button key={c} type="button" title={c} aria-label={`${etiqueta}: ${c}`} onClick={() => onCambio(c)}
            style={{ width: 17, height: 17, borderRadius: 5, padding: 0, cursor: 'pointer', background: c, border: String(valor).toUpperCase() === c ? '2px solid var(--ink)' : '1px solid var(--line)' }} />
        ))}
      </div>
    </div>
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
      <div style={seccionT}>Fondos de la marca</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <button type="button" title="Degradado del club" onClick={() => cambiar({ tipo: 'degradado', color: '#5233A8', color2: '#FF5FA2', angulo: 135 })} style={{ height: 44, borderRadius: 8, border: '1px solid var(--line)', cursor: 'pointer', background: 'linear-gradient(135deg, #5233A8, #FF5FA2)' }} />
        {['/src/brand/Aim_PatternH.png', '/src/brand/Aim_PatternV.png'].map((u, i) => (
          <button key={u} type="button" title={`Trama de la marca ${i + 1}`} onClick={() => cambiar({ tipo: 'imagen', url: u, opacidad: 1 })} style={{ height: 44, borderRadius: 8, border: '1px solid var(--line)', cursor: 'pointer', background: `center / cover url(${u})` }} />
        ))}
      </div>
    </div>
  );
}

function Propiedades({ e, tipo, cambiar, textoRef, subir, acciones, onEscribir }) {
  const fila = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'start' };
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
        {!e.bloqueado && <button type="button" className="btn btn-sm btn-ghost" style={{ justifySelf: 'start', fontSize: 12 }} onClick={onEscribir} title="También con doble clic en el texto, o Intro">✎ Escribir en el lienzo</button>}
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

      {e.tipo === 'qr' && <>
        <label style={etq}>Enlace o texto del QR
          <input value={e.texto || ''} onChange={x => cambiar({ texto: x.target.value })} style={inp} />
        </label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {ENLACES_QR.map(([t, u]) => <button key={t} type="button" className="btn btn-sm btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }} onClick={() => cambiar({ texto: u })}>{t}</button>)}
        </div>
        <Color etiqueta="Color de los cuadros" valor={e.color || '#1A1A1A'} onCambio={(v) => cambiar({ color: v })} />
        <Color etiqueta="Fondo" valor={e.fondo} onCambio={(v) => cambiar({ fondo: v })} permiteNada />
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Que se lea bien: cuadros oscuros sobre fondo claro. Pruébalo con el móvil antes de imprimir.</span>
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
        <Num etiqueta={e.tipo === 'qr' ? 'Lado' : 'Ancho'} valor={e.w} onCambio={(v) => cambiar(e.tipo === 'qr' ? { w: Math.max(40, v), h: Math.max(40, v) } : { w: Math.max(5, v) })} min={5} />
        {e.tipo !== 'texto' && e.tipo !== 'linea' && e.tipo !== 'qr' && <Num etiqueta="Alto" valor={e.h} onCambio={(v) => cambiar({ h: Math.max(5, v) })} min={5} />}
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

// ═══════════════════════ Escribir en el lienzo ═══════════════════════
// La caja donde se escribe un texto en el propio lienzo: encima de él, con su
// misma letra, tamaño, color y giro (el del lienzo se esconde mientras tanto).
// Esc, Ctrl+Intro o pulsar fuera, y listo.
const DE_EJEMPLO = /^(Un título|Un subtítulo|Escribe aquí tu texto|Título del post|Nombre|Tu mensaje\naquí)$/;
function TextoEnLienzo({ e, escala, cursor, onCambio, onFin }) {
  const ref = useRef(null);
  useEffect(() => {
    const t = ref.current; if (!t) return;
    t.focus({ preventScroll: true });
    // Lo de ejemplo se selecciona entero (se escribe encima); si no, el cursor va donde el clic.
    if (DE_EJEMPLO.test(e.texto || '')) t.select();
    else t.setSelectionRange(cursor, cursor);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const k = escala, tam = (e.tamano || 48) * k;
  return (
    <textarea ref={ref} value={e.texto || ''} aria-label="Escribir el texto" spellCheck
      onChange={x => onCambio(x.target.value)} onBlur={onFin} onPointerDown={x => x.stopPropagation()} onDoubleClick={x => x.stopPropagation()}
      onKeyDown={x => { if (x.key === 'Escape' || (x.key === 'Enter' && (x.ctrlKey || x.metaKey))) { x.preventDefault(); x.currentTarget.blur(); } }}
      style={{
        position: 'absolute', left: e.x * k, top: e.y * k, width: e.w * k, height: e.h * k, transform: `rotate(${e.rot || 0}deg)`, zIndex: 3,
        margin: 0, padding: 0, border: 0, outline: '2px dashed #7C5CFF', outlineOffset: 3, background: 'transparent', resize: 'none', overflow: 'hidden',
        font: `${e.cursiva ? 'italic ' : ''}${e.negrita ? 700 : 400} ${tam}px "${e.fuente || 'Montserrat'}", Montserrat, Arial, sans-serif`,
        lineHeight: `${tam * (e.interlineado || 1.25)}px`, letterSpacing: `${(e.espaciado || 0) * k}px`, color: e.color || '#1A1A1A', opacity: e.opacidad ?? 1,
        textAlign: e.alinear === 'centro' ? 'center' : e.alinear === 'derecha' ? 'right' : 'left', textTransform: e.mayusculas ? 'uppercase' : 'none',
        whiteSpace: 'pre-wrap', overflowWrap: 'normal', wordBreak: 'normal', caretColor: '#7C5CFF',
        textShadow: e.sombra ? `0 ${8 * k}px ${24 * k}px rgba(0,0,0,.28)` : 'none',
      }} />
  );
}

// ═══════════════════════ Datos y fotos del club ═══════════════════════
const nombreWeb = (n) => String(n || '').replace(/taekwon-?do/gi, 'Taekwon-Do');
function diasTexto(dias) {
  const n = [...dias].sort((a, b) => a - b);
  if (n.length >= 3 && n.every((d, i) => !i || d === n[i - 1] + 1)) return `De ${DIAS[n[0]].toLowerCase()} a ${DIAS[n[n.length - 1]].toLowerCase()}`;
  const t = n.map(d => DIAS[d].toLowerCase());
  const s = t.length > 1 ? `${t.slice(0, -1).join(', ')} y ${t[t.length - 1]}` : t[0] || '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const fechaCorta = (v) => new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

// El horario y los próximos eventos de verdad (los mismos que la web), como
// texto que luego se retoca.
function DatosDelClub({ anadirBloque, kit }) {
  const [clases, setClases] = useState(null);
  const [eventos, setEventos] = useState(null);
  const [act, setAct] = useState('');
  useEffect(() => {
    fetch('/api/publico/clases').then(r => r.json()).then(d => setClases(d.actividades || [])).catch(() => setClases([]));
    fetch('/api/events').then(r => r.json()).then(d => setEventos(Array.isArray(d) ? d : [])).catch(() => setEventos([]));
  }, []);
  const conHorario = (clases || []).filter(a => a.grupos?.some(g => g.sesiones?.length));
  function horario() {
    const a = conHorario.find(x => x.id === act) || conHorario[0]; if (!a) return;
    const cuerpo = a.grupos.filter(g => g.sesiones?.length)
      .map(g => [g.nombre, ...g.sesiones.map(s => `${diasTexto(s.dias)} · ${s.inicio}${s.fin ? `–${s.fin}` : ''}`)].join('\n')).join('\n\n');
    anadirBloque(`Horario de ${nombreWeb(a.nombre)}`, cuerpo);
  }
  function proximos() {
    const lista = (eventos || []).slice(0, 6); if (!lista.length) return;
    anadirBloque('Próximos eventos', lista.map(ev => `${fechaCorta(ev.date)}${ev.time ? ` · ${String(ev.time).slice(0, 5)}` : ''} · ${ev.title}`).join('\n'));
  }
  return (
    <>
      <div style={seccionT}>Datos del club</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={act} onChange={e => setAct(e.target.value)} aria-label="Actividad" style={{ ...inp, flex: 1, minWidth: 0 }} disabled={!conHorario.length}>
          {!clases ? <option>Cargando…</option> : !conHorario.length ? <option>Sin horarios</option> : conHorario.map(a => <option key={a.id} value={a.id}>{nombreWeb(a.nombre)}</option>)}
        </select>
        <button type="button" className="btn btn-sm btn-outline" disabled={!conHorario.length} onClick={horario}>Horario</button>
      </div>
      <button type="button" className="btn btn-sm btn-outline" disabled={!eventos?.length} onClick={proximos}>
        {!eventos ? 'Cargando eventos…' : eventos.length ? `Próximos eventos (${Math.min(6, eventos.length)})` : 'No hay eventos próximos'}
      </button>
      {(kit?.pie || kit?.web) && <button type="button" className="btn btn-sm btn-outline" onClick={() => anadirBloque('Contacto', [kit.pie, kit.web?.replace(/^https?:\/\//, '')].filter(Boolean).join('\n'))}>Datos de contacto</button>}
    </>
  );
}

// Fotos de la galería: solo las que se pueden usar (todos los que salen tienen
// permiso de fotos). Quedan enlazadas a la galería: si alguien retira su
// permiso, su foto deja de salir en los diseños.
function FotosDelClub({ onCerrar, onElegir }) {
  const [d, setD] = useState(null);
  const cargar = (album) => api(`/api/admin/disenos/fotos-club${album ? `?album=${album}` : ''}`).then(setD).catch(e => setD({ error: e.message }));
  useEffect(() => { cargar(); }, []);
  return (
    <Ventana titulo="Fotos del club" onCerrar={onCerrar} ancho={860}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
        Solo salen las fotos de la galería en las que <b>todos los que salen tienen permiso de fotos</b>. Las que no tienen a nadie etiquetado tampoco salen: etiquétalas en «Fotos» y aparecerán aquí.
      </p>
      {!d ? <span style={{ color: 'var(--ink-3)' }}>Cargando…</span> : d.error ? <span style={{ color: 'var(--orange)' }}>{d.error}</span> : !d.albumes.length ? (
        <span style={{ color: 'var(--ink-3)' }}>Aún no hay fotos en la galería.</span>
      ) : <>
        <select value={String(d.album || '')} onChange={e => cargar(e.target.value)} aria-label="Álbum" style={inp}>
          {d.albumes.map(a => <option key={a.id} value={String(a.id)}>{a.titulo} · {a.validas} de {a.fotos} se pueden usar</option>)}
        </select>
        {!d.fotos.length ? <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>En este álbum no hay ninguna que se pueda usar.</span> : (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {d.fotos.map(f => (
              <button key={f.id} type="button" onClick={() => onElegir(f)} aria-label="Usar esta foto"
                style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 0, aspectRatio: '1', cursor: 'pointer', background: `center / cover no-repeat url(/api/admin/disenos/foto-club/${f.id}/mini), var(--bg-3)` }} />
            ))}
          </div>
        )}
      </>}
    </Ventana>
  );
}

// ═══════════════════════ Usar el diseño ═══════════════════════
// Publicar en redes: el diseño como foto de un borrador de Publicaciones (que
// luego se programa o se publica allí). Para Instagram, con bandas blancas si
// se sale de lo que admite (de 4:5 a 1,91:1).
function PublicarEnRedes({ diseno, ejemplo, onCerrar, onHecho }) {
  const ratio = diseno.ancho / diseno.alto;
  const [redes, setRedes] = useState(['facebook', 'instagram']);
  const [tipo, setTipo] = useState(1 / ratio > 1.6 ? 'story' : 'post');
  const [texto, setTexto] = useState('');
  const [paso, setPaso] = useState(null);
  const [error, setError] = useState(null);
  const bandas = redes.includes('instagram') && tipo === 'post' && (ratio < 0.8 || ratio > 1.91);
  async function crear() {
    setError(null);
    let id = null;
    try {
      setPaso('Preparando la imagen…');
      const k = Math.min(1, 2048 / Math.max(diseno.ancho, diseno.alto));
      const c = await lienzoDe(diseno, { variables: ejemplo, ancho: Math.round(diseno.ancho * k) });
      let W = c.width, H = c.height;
      if (bandas) { if (W / H < 0.8) W = Math.round(H * 0.8); else H = Math.round(W / 1.91); }
      const f = document.createElement('canvas'); f.width = W; f.height = H;
      const g = f.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
      g.drawImage(c, Math.round((W - c.width) / 2), Math.round((H - c.height) / 2));
      const foto = await lienzoAJpeg(f, 0.9);
      setPaso('Creando el borrador…');
      ({ id } = await api('/api/admin/publicaciones', { method: 'POST', body: { texto, redes, tipo } }));
      const r = await fetch(`/api/admin/publicaciones/${id}/medios?ancho=${W}&alto=${H}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'image/jpeg' }, body: foto });
      const m = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(m.error || 'No se ha podido subir la imagen.');
      // La miniatura, si la foto es grande (la del calendario de Publicaciones).
      if (foto.size >= 400_000) {
        const t = document.createElement('canvas'), kt = 360 / Math.max(W, H);
        t.width = Math.round(W * kt); t.height = Math.round(H * kt);
        t.getContext('2d').drawImage(f, 0, 0, t.width, t.height);
        await fetch(`/api/admin/publicaciones/${id}/medios/${m.id}/miniatura`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'image/jpeg' }, body: await lienzoAJpeg(t, 0.8) }).catch(() => {});
      }
      setPaso('Abriendo Publicaciones…');
      await onHecho(id);
    } catch (e) {
      // Sin su foto, el borrador no sirve: fuera.
      if (id) await api(`/api/admin/publicaciones/${id}`, { method: 'DELETE' }).catch(() => {});
      setError(e.message); setPaso(null);
    }
  }
  const casilla = (r, t) => (
    <label key={r} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, fontWeight: 700 }}>
      <input type="checkbox" checked={redes.includes(r)} onChange={x => setRedes(v => (x.target.checked ? [...v, r] : v.filter(y => y !== r)))} /> {t}
    </label>
  );
  return (
    <Ventana titulo="Publicar en redes" onCerrar={paso ? () => {} : onCerrar} ancho={560}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>Se crea un <b>borrador en Publicaciones</b> con este diseño de foto. No sale nada hasta que allí lo programes o pulses «Publicar».</p>
      <div style={{ display: 'flex', gap: 18 }}>{casilla('facebook', 'Facebook')}{casilla('instagram', 'Instagram')}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[['post', 'Publicación'], ['story', 'Historia']].map(([k, t]) => <button key={k} type="button" className={`btn btn-sm ${tipo === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTipo(k)}>{t}</button>)}
      </div>
      {tipo === 'post' && <label style={etq}>Texto de la publicación (se puede cambiar luego)
        <textarea rows={4} value={texto} onChange={e => setTexto(e.target.value)} style={{ ...inp, resize: 'vertical', fontSize: 14 }} />
      </label>}
      {bandas && <span style={{ fontSize: 12.5, color: '#B45309' }}>Instagram no admite estas proporciones en una publicación: se le pondrán bandas blancas. Si no las quieres, haz una copia «En otros tamaños» como post de Instagram.</span>}
      {tipo === 'story' && 1 / ratio < 1.6 && <span style={{ fontSize: 12.5, color: '#B45309' }}>Una historia es vertical (9:16): este diseño se verá con bordes. Mejor una copia como «Historia» en «En otros tamaños».</span>}
      {error && <span style={{ color: 'var(--orange)', fontSize: 13 }}>{error}</span>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        {paso && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{paso}</span>}
        <button type="button" className="btn btn-sm btn-ghost" disabled={!!paso} onClick={onCerrar}>Cancelar</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={!!paso || !redes.length} onClick={crear}>Crear el borrador y abrirlo</button>
      </div>
    </Ventana>
  );
}

// El mismo diseño en otros tamaños (cada uno, un diseño nuevo en la lista).
function OtrosTamanos({ diseno, nombre, tipo, ejemplo, showToast, onCerrar }) {
  const opciones = useMemo(() => TAMANOS.filter(t => !(t.ancho === diseno.ancho && t.alto === diseno.alto)), [diseno]);
  const [elegidos, setElegidos] = useState([]);
  const [vistas, setVistas] = useState({});
  const [creando, setCreando] = useState(false);
  const [hechos, setHechos] = useState(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      for (const t of opciones) {
        const c = await lienzoDe(adaptarDiseno(diseno, t.ancho, t.alto, ejemplo), { variables: ejemplo, ancho: 240 }).catch(() => null);
        if (!vivo) return;
        if (c) setVistas(v => ({ ...v, [t.id]: c.toDataURL('image/jpeg', 0.8) }));
      }
    })();
    return () => { vivo = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function crear() {
    setCreando(true);
    try {
      const nombres = [];
      for (const t of opciones.filter(x => elegidos.includes(x.id))) {
        const { esPlantilla, ...datos } = adaptarDiseno(diseno, t.ancho, t.alto, ejemplo); // eslint-disable-line no-unused-vars
        await api('/api/admin/disenos', { method: 'POST', body: { nombre: `${nombre} · ${t.nombre}`.slice(0, 150), tipo, datos, miniatura: await miniatura(datos, ejemplo).catch(() => null) } });
        nombres.push(t.nombre);
      }
      setHechos(nombres);
      showToast?.(`${nombres.length === 1 ? 'Creada 1 copia' : `Creadas ${nombres.length} copias`} en la lista de diseños.`);
    } catch (e) { alert(e.message); } finally { setCreando(false); }
  }
  return (
    <Ventana titulo="El mismo diseño, en otros tamaños" onCerrar={creando ? () => {} : onCerrar} ancho={900}>
      {hechos ? <>
        <p style={{ margin: 0, fontSize: 14 }}>Hecho: {hechos.join(', ')}. Las tienes en la lista de diseños al salir del editor; retoca lo que no haya quedado a tu gusto.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" className="btn btn-sm btn-primary" onClick={onCerrar}>Vale</button></div>
      </> : <>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>Cada cosa se coloca sola en el nuevo tamaño (lo que va pegado a un borde sigue pegado, los fondos se estiran y la letra se ajusta). Este diseño no cambia: se crea una copia por tamaño.</p>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {opciones.map(t => {
            const si = elegidos.includes(t.id);
            return (
              <button key={t.id} type="button" onClick={() => setElegidos(v => (si ? v.filter(x => x !== t.id) : [...v, t.id]))} aria-pressed={si}
                style={{ font: 'inherit', cursor: 'pointer', padding: 8, borderRadius: 12, border: `2px solid ${si ? 'var(--purple)' : 'var(--line)'}`, background: si ? 'color-mix(in oklab, var(--purple) 8%, var(--bg-2))' : 'var(--bg-3)', color: 'var(--ink)', display: 'grid', gap: 6, textAlign: 'left' }}>
                <span style={{ display: 'grid', placeItems: 'center', height: 130, background: 'var(--bg-2)', borderRadius: 8 }}>
                  {vistas[t.id] ? <img src={vistas[t.id]} alt="" style={{ maxWidth: '92%', maxHeight: 120, boxShadow: '0 2px 8px rgba(0,0,0,.18)' }} /> : <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>…</span>}
                </span>
                <b style={{ fontSize: 12.5 }}>{si ? '✓ ' : ''}{t.nombre}</b>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{t.ancho} × {t.alto}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-sm btn-ghost" disabled={creando} onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={creando || !elegidos.length} onClick={crear}>
            {creando ? 'Creando…' : elegidos.length ? `Crear ${elegidos.length === 1 ? '1 copia' : `${elegidos.length} copias`}` : 'Elige algún tamaño'}
          </button>
        </div>
      </>}
    </Ventana>
  );
}

// Diplomas en lote: uno por alumno de una clase o de una convocatoria de examen,
// todos en un PDF (una página cada uno).
const HUECOS_VACIOS = Object.fromEntries(VARIABLES_DIPLOMA.map(v => [v.id, '']));
function DiplomasEnLote({ diseno, nombre, onCerrar }) {
  const [origenes, setOrigenes] = useState(null);
  const [origen, setOrigen] = useState('grupo');
  const [elegido, setElegido] = useState('');
  const [datos, setDatos] = useState(null);
  const [marcados, setMarcados] = useState(new Set());
  const [fecha, setFecha] = useState(hoyLargo());
  const [profesor, setProfesor] = useState('');
  const [progreso, setProgreso] = useState(null);
  useEffect(() => { api('/api/admin/disenos/lote').then(setOrigenes).catch(e => setOrigenes({ error: e.message })); }, []);
  useEffect(() => {
    setDatos(null);
    if (!elegido) return;
    api(`/api/admin/disenos/lote/${origen}/${elegido}`).then(d => {
      setDatos(d); setMarcados(new Set(d.personas.filter(p => p.marcado).map(p => p.id)));
      setFecha(d.fecha ? fechaLarga(d.fecha) : hoyLargo()); setProfesor(d.personas[0]?.variables.profesor || '');
    }).catch(e => setDatos({ error: e.message }));
  }, [origen, elegido]);
  // Los huecos del diseño que en este lote saldrían vacíos.
  const usados = useMemo(() => [...new Set(diseno.elementos.filter(e => e.tipo === 'texto').flatMap(e => [...String(e.texto || '').matchAll(/\{(\w+)\}/g)].map(m => m[1])))], [diseno]);
  const vacios = datos?.personas ? usados.filter(h => h !== 'fecha' && !(h === 'profesor' && profesor) && !datos.personas.some(p => p.variables[h])) : [];
  const lista = (origenes?.[origen === 'grupo' ? 'grupos' : 'convocatorias'] || []).filter(x => (origen === 'grupo' ? x.alumnos : x.participantes) > 0);
  async function crear() {
    const vars = datos.personas.filter(p => marcados.has(p.id)).map(p => ({ ...HUECOS_VACIOS, ...p.variables, fecha, ...(profesor ? { profesor } : {}) }));
    setProgreso({ hechos: 0, total: vars.length });
    try { await exportarLote(diseno, vars, `${nombre} · ${datos.titulo}`, (h, t) => setProgreso({ hechos: h, total: t })); onCerrar(); }
    catch (e) { alert(`No se ha podido crear el PDF: ${e.message}`); setProgreso(null); }
  }
  const cambiarTodos = (si) => setMarcados(si ? new Set(datos.personas.map(p => p.id)) : new Set());
  return (
    <Ventana titulo="Diplomas en lote" onCerrar={progreso ? () => {} : onCerrar} ancho={720}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>Un PDF con un diploma por alumno (una página cada uno), con su nombre y sus datos en los huecos del diseño.</p>
      {!origenes ? <span style={{ color: 'var(--ink-3)' }}>Cargando…</span> : origenes.error ? <span style={{ color: 'var(--orange)' }}>{origenes.error}</span> : <>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['grupo', 'De una clase'], ['convocatoria', 'De un examen']].map(([k, t]) => <button key={k} type="button" className={`btn btn-sm ${origen === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setOrigen(k); setElegido(''); }}>{t}</button>)}
        </div>
        <select value={elegido} onChange={e => setElegido(e.target.value)} aria-label={origen === 'grupo' ? 'Clase' : 'Convocatoria'} style={inp}>
          <option value="">{origen === 'grupo' ? 'Elige la clase…' : 'Elige la convocatoria…'}</option>
          {lista.map(x => <option key={x.id} value={String(x.id)}>{origen === 'grupo' ? `${nombreWeb(x.actividad)} · ${x.nombre} (${x.alumnos})` : `${fechaCorta(x.fecha)} · ${x.nombre}${x.actividad ? ` · ${nombreWeb(x.actividad)}` : ''} (${x.aptos} aptos de ${x.participantes})`}</option>)}
        </select>
      </>}
      {datos?.error && <span style={{ color: 'var(--orange)' }}>{datos.error}</span>}
      {datos?.personas && <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={etq}>Fecha del diploma<input value={fecha} onChange={e => setFecha(e.target.value)} style={inp} /></label>
          <label style={etq}>Profesor/a<input value={profesor} onChange={e => setProfesor(e.target.value)} placeholder="Para {profesor}" style={inp} /></label>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <b style={{ flex: 1 }}>{marcados.size} de {datos.personas.length} {origen === 'convocatoria' ? '(los aptos, ya marcados)' : ''}</b>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => cambiarTodos(true)}>Todos</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => cambiarTodos(false)}>Ninguno</button>
        </div>
        <div style={{ display: 'grid', gap: 2, maxHeight: 280, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 6 }}>
          {!datos.personas.length && <span style={{ color: 'var(--ink-3)', fontSize: 13, padding: 6 }}>No hay nadie.</span>}
          {datos.personas.map(p => (
            <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, padding: '4px 6px' }}>
              <input type="checkbox" checked={marcados.has(p.id)} onChange={x => setMarcados(s => { const n = new Set(s); if (x.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
              <span style={{ flex: 1 }}>{p.variables.alumno}</span>
              {p.nota && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{p.nota}</span>}
            </label>
          ))}
        </div>
        {vacios.length > 0 && <span style={{ fontSize: 12.5, color: '#B45309' }}>En este lote no hay {vacios.map(h => `{${h}}`).join(', ')}: saldrán vacíos. Quítalos del diseño o cámbialos por texto.</span>}
      </>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        {progreso && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Haciendo {progreso.hechos} de {progreso.total}…</span>}
        <button type="button" className="btn btn-sm btn-ghost" disabled={!!progreso} onClick={onCerrar}>Cancelar</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={!!progreso || !datos?.personas || !marcados.size} onClick={crear}>
          {marcados.size ? `Crear el PDF (${marcados.size} ${marcados.size === 1 ? 'diploma' : 'diplomas'})` : 'Crear el PDF'}
        </button>
      </div>
    </Ventana>
  );
}

// Para correos y noticias: el diseño, como imagen de la web (/ci/…). Sale en
// «Ya subidas» al diseñar un correo y en «De Aim Design» en las noticias.
function ParaCorreosYNoticias({ diseno, nombre, ejemplo, onCerrar }) {
  const [r, setR] = useState(null);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const k = Math.min(1, 1800 / Math.max(diseno.ancho, diseno.alto));
        const c = await lienzoDe(diseno, { variables: ejemplo, ancho: Math.round(diseno.ancho * k) });
        const d = await api('/api/admin/disenos/biblioteca', { method: 'POST', body: { datos: c.toDataURL('image/jpeg', 0.88), nombre, ancho: c.width, alto: c.height } });
        setR({ url: d.url });
      } catch (e) { setR({ error: e.message }); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const completa = r?.url ? `${window.location.origin}${r.url}` : '';
  return (
    <Ventana titulo="Para correos y noticias" onCerrar={onCerrar} ancho={620}>
      {!r ? <span style={{ color: 'var(--ink-3)' }}>Guardando la imagen…</span> : r.error ? <span style={{ color: 'var(--orange)' }}>{r.error}</span> : <>
        <img src={r.url} alt="" style={{ maxWidth: '100%', maxHeight: 300, justifySelf: 'center', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,.15)' }} />
        <p style={{ margin: 0, fontSize: 13.5 }}>Lista. La tienes en <b>«Ya subidas»</b> al diseñar un correo y en <b>«De Aim Design»</b> al elegir la portada de una noticia. También puedes pegar el enlace donde quieras.</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <input readOnly value={completa} aria-label="Enlace de la imagen" style={{ ...inp, fontFamily: 'monospace', fontSize: 12 }} onFocus={e => e.target.select()} />
          <button type="button" className="btn btn-sm btn-outline" onClick={() => navigator.clipboard?.writeText(completa).then(() => setCopiado(true)).catch(() => {})}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
        </div>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Si cambias el diseño, vuelve a guardarla: se crea otra imagen y la de antes sigue donde ya la hayas puesto.</span>
      </>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" className="btn btn-sm btn-primary" onClick={onCerrar}>Cerrar</button></div>
    </Ventana>
  );
}

// Para la portada de una noticia: elegir una imagen hecha en Aim Design.
export function ElegirDeAimDesign({ onElegir }) {
  const [lista, setLista] = useState(null);
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!abierto || lista) return;
    api('/api/admin/posts/imagenes-design').then(d => setLista(d.imagenes || [])).catch(() => setLista([]));
  }, [abierto, lista]);
  return (
    <>
      <button type="button" className="btn btn-sm btn-outline" onClick={() => setAbierto(v => !v)}>✦ De Aim Design</button>
      {abierto && (
        <div style={{ flexBasis: '100%', display: 'grid', gap: 6 }}>
          {!lista ? <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Cargando…</span> : !lista.length ? (
            <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Aún no hay ninguna. En Aim Design, abre un diseño y pulsa «Usar → Para correos y noticias».</span>
          ) : (
            <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
              {lista.map(x => (
                <button key={x.id} type="button" title={x.nombre?.replace(/^Aim Design · /, '') || ''} onClick={() => { onElegir(x.url); setAbierto(false); }}
                  style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 0, aspectRatio: '4 / 3', cursor: 'pointer', background: `center / cover no-repeat url(${x.url}?w=320), var(--bg-3)` }} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
