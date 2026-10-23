import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useContext, createContext } from 'react';
import { I } from './Icons.jsx';
import { subirImagen } from './EditorDiseno.jsx';
import { useRouter } from '../App.jsx';
import {
  TAMANOS, FUENTES_DISENO, VARIABLES_DIPLOMA, EJEMPLO_DIPLOMA, nuevoId, pintarDiseno, cargarImagenes, cargarImagen, cargarFuentes, cargarFuentePropia,
  pedirFuentes, miniatura, exportarDiseno, exportarLote, exportarImprenta, medidasImprenta, SANGRADO_MM, lienzoDe, ajustarTexto, adaptarDiseno, posicionEnTexto,
  paginaDe, conPagina, numPaginas, todasLasPaginas, ANIMACIONES, tieneAnimacion, duracionAnimacion,
} from '../disenos/render.js';
import { FIGURAS, MARCOS, ICONOS, ICONOS_ACTIVIDAD, svgFigura } from '../disenos/formas.js';
import { formatoVideo, grabarVideo, exportarGif, exportarVideo } from '../disenos/animacion.js';
import { diferencias, aplicarOps } from '../disenos/vivo.js';
import { COLORES_GRAFICO, CLASES_GRAFICO } from '../disenos/tablas.js';
import { quitarFondo } from '../disenos/fondo.js';
import { PALETAS_LISTAS, PARES_LETRAS, aplicarEstilo, coloresDe, contraste } from '../disenos/estilos.js';
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
//
// Y además: varias cosas a la vez (Mayús + clic o un recuadro) para moverlas,
// agruparlas, alinearlas y repartirlas; formas, iconos y marcos para fotos; las
// fotos se recortan (doble clic) y llevan filtros; efectos de texto (contorno,
// sombra de color, fondo, curva); varias páginas (carruseles, folletos);
// animaciones (GIF y vídeo); PDF de imprenta; letras propias; carpetas y
// buscador; y la revisión en equipo: comentarios, aprobación de la dirección
// (sin ella no se publica en redes) y versiones para volver atrás.
//
// Varias personas a la vez en el mismo diseño: se ven sus cursores y lo que
// tienen elegido, y los cambios de cada uno les llegan a los demás al momento
// (ver disenos/vivo.js y la sala en disenos.js).
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
  const [buscar, setBuscar] = useState('');
  // '' todas · '__sin' sin carpeta · '__plantillas' · '__aprobar' (esperan a la dirección) · o el nombre de una carpeta
  const [carpeta, setCarpeta] = useState(() => { try { return localStorage.getItem('aim_design_carpeta') || ''; } catch { return ''; } });
  const enPapelera = carpeta === '__papelera';
  const cargar = useCallback(() => api(`/api/admin/disenos${enPapelera ? '?papelera=1' : ''}`).then(setDatos).catch(e => alert(e.message)), [enPapelera]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { try { localStorage.setItem('aim_design_carpeta', enPapelera ? '' : carpeta); } catch { /* sin almacenamiento */ } }, [carpeta, enPapelera]);

  async function abrir(id) {
    try { const d = await api(`/api/admin/disenos/${id}`); setAbierto(d); } catch (e) { alert(e.message); }
  }
  // Desde la campanita: ?abrir=<id> o ?revision=1 (los que esperan aprobación).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search), a = Number(q.get('abrir'));
    if (q.get('revision')) setCarpeta('__aprobar');
    if (a) abrir(a);
    if (a || q.get('revision')) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  async function duplicar(d) { try { await api(`/api/admin/disenos/${d.id}/duplicar`, { method: 'POST' }); showToast?.('Duplicado.'); cargar(); } catch (e) { alert(e.message); } }
  async function borrar(d) {
    if (!window.confirm(`¿Mover «${d.nombre}» a la papelera? Se puede recuperar durante 30 días.`)) return;
    try { await api(`/api/admin/disenos/${d.id}`, { method: 'DELETE' }); showToast?.('A la papelera (30 días para recuperarlo).'); cargar(); } catch (e) { alert(e.message); }
  }
  async function restaurar(d) { try { await api(`/api/admin/disenos/${d.id}/restaurar`, { method: 'POST' }); showToast?.('Recuperado.'); cargar(); } catch (e) { alert(e.message); } }
  async function borrarDelTodo(d) {
    if (!window.confirm(`¿Borrar «${d.nombre}» para siempre? Se borran también sus versiones y comentarios. No se puede deshacer.`)) return;
    try { await api(`/api/admin/disenos/${d.id}?definitivo=1`, { method: 'DELETE' }); showToast?.('Borrado para siempre.'); cargar(); } catch (e) { alert(e.message); }
  }
  async function porDefecto(d) {
    try { await api('/api/admin/disenos-diploma', { method: 'PUT', body: { id: datos.diplomaPorDefecto === d.id ? null : d.id } }); showToast?.(datos.diplomaPorDefecto === d.id ? 'El aula vuelve al diploma de siempre.' : 'Es el diploma del aula por defecto.'); cargar(); }
    catch (e) { alert(e.message); }
  }
  async function moverA(d, valor) {
    let c = valor;
    if (valor === '__nueva') { c = window.prompt('Nombre de la carpeta nueva:', ''); if (!c?.trim()) return; c = c.trim(); }
    try { await api(`/api/admin/disenos/${d.id}/carpeta`, { method: 'PATCH', body: { carpeta: c } }); cargar(); } catch (e) { alert(e.message); }
  }
  const todos = datos?.disenos || [];
  const carpetas = useMemo(() => [...new Set(todos.map(d => d.carpeta).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [todos]);
  const sinTildes = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const q = sinTildes(buscar.trim());
  const lista = todos.filter(d => {
    if (carpeta === '__sin' && d.carpeta) return false;
    if (carpeta === '__plantillas' && !d.plantilla) return false;
    if (carpeta === '__aprobar' && d.revision !== 'pendiente') return false;
    if (carpeta && !carpeta.startsWith('__') && d.carpeta !== carpeta) return false;
    if (enPapelera) return !q || sinTildes(d.nombre).includes(q);
    return !q || sinTildes(`${d.nombre} ${d.carpeta || ''} ${d.autor || ''}`).includes(q);
  });
  const porAprobar = todos.filter(d => d.revision === 'pendiente').length;
  const pastilla = (k, t, n) => (
    <button key={k} type="button" className={`filter-pill ${carpeta === k ? 'is-active' : ''}`} onClick={() => setCarpeta(k)} style={{ borderRadius: 999, padding: '6px 12px', fontSize: 12.5 }}>
      {t}{n != null ? <span style={{ opacity: 0.6, marginLeft: 4 }}>{n}</span> : null}
    </button>
  );

  if (abierto) return <Editor inicial={abierto} showToast={showToast} puedePublicar={puedePublicar} onCerrar={() => { setAbierto(null); cargar(); }} />;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14, flex: '1 1 300px' }}>Carteles, posts, carruseles, historias animadas y diplomas, como en Canva. Se exportan a PNG, JPG, PDF (también de imprenta), GIF o vídeo; los diplomas los usa el aula virtual.</p>
        <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar un diseño…" aria-label="Buscar un diseño" style={{ ...inp, width: 220 }} />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setNuevo(true)}><I.Plus /> Nuevo diseño</button>
      </div>
      {datos && !enPapelera && (todos.length > 0 || datos.papelera > 0) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {pastilla('', 'Todos', todos.length)}
          {carpetas.map(c => pastilla(c, `📁 ${c}`, todos.filter(d => d.carpeta === c).length))}
          {carpetas.length > 0 && pastilla('__sin', 'Sin carpeta', todos.filter(d => !d.carpeta).length)}
          {todos.some(d => d.plantilla) && pastilla('__plantillas', '★ Plantillas del equipo')}
          {(porAprobar > 0 || carpeta === '__aprobar') && pastilla('__aprobar', datos.puedoAprobar ? '⏳ Esperan tu aprobación' : '⏳ Esperan aprobación', porAprobar)}
          {datos.papelera > 0 && pastilla('__papelera', '🗑 Papelera', datos.papelera)}
        </div>
      )}
      {enPapelera && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: 'var(--ink-2)' }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setCarpeta('')}>← Volver a los diseños</button>
          <span>La papelera: lo que lleva más de 30 días se borra solo.</span>
        </div>
      )}
      {!datos ? <p style={{ color: 'var(--ink-3)' }}>Cargando…</p> : !todos.length && enPapelera ? (
        <div style={{ padding: 30, textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 16, color: 'var(--ink-3)' }}>La papelera está vacía.</div>
      ) : !todos.length ? (
        <div style={{ padding: 30, textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 16, color: 'var(--ink-3)' }}>Aún no hay diseños. Empieza por una plantilla o un tamaño en blanco.</div>
      ) : !lista.length ? (
        <div style={{ padding: 24, textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 16, color: 'var(--ink-3)' }}>{q ? `Nada con «${buscar}».` : 'Aquí no hay ninguno.'}</div>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {lista.map(d => (
            <div key={d.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', display: 'grid' }}>
              <button type="button" onClick={() => (enPapelera ? restaurar(d) : abrir(d.id))} title={enPapelera ? 'Recuperar' : undefined} style={{ border: 0, padding: 0, cursor: 'pointer', background: 'var(--bg-3)', aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', position: 'relative' }} aria-label={`Abrir ${d.nombre}`}>
                {d.miniatura ? <img src={d.miniatura} alt="" style={{ maxWidth: '92%', maxHeight: '92%', boxShadow: '0 4px 14px rgba(0,0,0,.15)' }} /> : <span style={{ color: 'var(--ink-3)' }}>Sin vista previa</span>}
                {d.paginas > 1 && <span style={{ position: 'absolute', right: 8, top: 8, fontSize: 11, fontWeight: 800, background: 'rgba(0,0,0,.65)', color: '#fff', borderRadius: 999, padding: '2px 8px' }}>{d.paginas} páginas</span>}
              </button>
              <div style={{ padding: 12, display: 'grid', gap: 6 }}>
                <b style={{ fontSize: 14 }}>{d.nombre}</b>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{tamanoTexto(d)}{d.tipo === 'diploma' ? ' · diploma' : ''}</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {d.revision && d.revision !== 'sin_pedir' && <EstadoRevision estado={d.revision} pequeno />}
                  {d.comentarios > 0 && <span title="Comentarios sin resolver" style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--purple)' }}>💬 {d.comentarios}</span>}
                  {d.plantilla && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--purple)' }}>★ Plantilla del equipo</span>}
                  {d.tipo === 'diploma' && datos.diplomaPorDefecto === d.id && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)' }}>✓ Diploma del aula por defecto</span>}
                </div>
                {enPapelera ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => restaurar(d)}>Recuperar</button>
                    <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--orange)' }} onClick={() => borrarDelTodo(d)}>Borrar para siempre</button>
                  </div>
                ) : <>
                <select value={d.carpeta || ''} onChange={e => moverA(d, e.target.value)} aria-label={`Carpeta de ${d.nombre}`} style={{ ...inp, fontSize: 12, padding: '4px 6px' }}>
                  <option value="">Sin carpeta</option>
                  {carpetas.map(c => <option key={c} value={c}>📁 {c}</option>)}
                  <option value="__nueva">＋ Carpeta nueva…</option>
                </select>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => abrir(d.id)}><I.Edit width={13} height={13} /> Abrir</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => duplicar(d)}>Duplicar</button>
                  {d.tipo === 'diploma' && <button type="button" className="btn btn-sm btn-ghost" onClick={() => porDefecto(d)}>{datos.diplomaPorDefecto === d.id ? 'Quitar de por defecto' : 'Diploma por defecto'}</button>}
                  <button type="button" className="icon-btn danger" onClick={() => borrar(d)} aria-label="A la papelera" title="A la papelera"><I.Trash /></button>
                </div>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}
      {nuevo && <NuevoDiseno equipo={todos.filter(d => d.plantilla)} onCerrar={() => setNuevo(false)}
        onCrear={(d) => { setNuevo(false); setAbierto(carpeta && !carpeta.startsWith('__') ? { ...d, datos: { ...d.datos, carpeta } } : d); }} />}
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
const NOMBRE_TIPO = { texto: 'Texto', imagen: 'Imagen', rect: 'Rectángulo', elipse: 'Círculo', forma: 'Forma', icono: 'Icono', linea: 'Línea', qr: 'Código QR', tabla: 'Tabla', grafico: 'Gráfico' };
const etiquetaElemento = (e) => (e.tipo === 'texto' ? `«${String(e.texto || '').split('\n')[0].slice(0, 26)}»`
  : e.tipo === 'forma' ? FIGURAS.find(f => f.id === e.figura)?.nombre || 'Forma'
    : e.tipo === 'icono' ? `Icono: ${ICONOS.find(i => i.id === e.icono)?.nombre || ''}`
      : e.tipo === 'imagen' && !e.url ? 'Marco para una foto' : NOMBRE_TIPO[e.tipo] || e.tipo);
// La caja que ocupan varios elementos (sin contar su giro).
const cajaDe = (els) => {
  const x = Math.min(...els.map(e => e.x)), y = Math.min(...els.map(e => e.y));
  return { x, y, w: Math.max(...els.map(e => e.x + e.w)) - x, h: Math.max(...els.map(e => e.y + e.h)) - y };
};
// Elegir uno de un grupo elige el grupo entero.
const conGrupo = (elementos, ids) => {
  const g = new Set(elementos.filter(e => ids.includes(e.id) && e.grupo).map(e => e.grupo));
  return elementos.filter(e => ids.includes(e.id) || (e.grupo && g.has(e.grupo))).map(e => e.id);
};
// ¿Cae el punto (en píxeles del diseño) dentro del elemento, con su giro?
function dentroDe(e, px, py) {
  const a = -(e.rot || 0) * Math.PI / 180, cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  const lx = (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a), ly = (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a);
  return Math.abs(lx) <= e.w / 2 && Math.abs(ly) <= e.h / 2;
}
// Las líneas guía: el borde o el centro de lo que se mueve, cerca de una línea, se pega a ella.
function encaje(pos, tam, lineas, umbral) {
  let mejor = null;
  for (const off of [0, tam / 2, tam]) for (const l of lineas) {
    const d = l - (pos + off);
    if (Math.abs(d) < umbral && (!mejor || Math.abs(d) < Math.abs(mejor.d))) mejor = { d, l };
  }
  return mejor;
}
// Los elementos de la página p, cambiados con fn.
const cambiarElementos = (d, p, fn) => { const v = paginaDe(d, p); return conPagina(d, p, { ...v, elementos: v.elementos.map(fn) }); };
// El diseño rehecho desde la lista de sus páginas ({ fondo, elementos }).
const desdePaginas = (d, lista) => {
  const { paginas, ...resto } = d; // eslint-disable-line no-unused-vars
  return { ...resto, fondo: lista[0].fondo, elementos: lista[0].elementos, ...(lista.length > 1 ? { paginas: lista.slice(1) } : {}) };
};
const paginasDe = (d) => todasLasPaginas(d).map(v => ({ fondo: v.fondo, elementos: v.elementos }));
// Lo que se arrastra desde el panel (una imagen) hasta el lienzo o un marco.
const TIPO_ARRASTRE = 'application/x-aim-design';
const arrastrable = (url, ancho, alto) => ({
  draggable: true,
  onDragStart: (ev) => { ev.dataTransfer.setData(TIPO_ARRASTRE, JSON.stringify({ url, ancho, alto })); ev.dataTransfer.effectAllowed = 'copy'; },
});

function Editor({ inicial, showToast, onCerrar, puedePublicar }) {
  const [id, setId] = useState(inicial.id);
  const [nombre, setNombre] = useState(inicial.nombre || 'Diseño sin nombre');
  const [tipo, setTipo] = useState(inicial.tipo || 'libre');
  const [doc, setDoc] = useState(inicial.datos);
  const [pagina, setPagina] = useState(0);
  const [seleccion, setSeleccion] = useState([]);
  const [hist, setHist] = useState({ atras: [], adelante: [] });
  const [sucio, setSucio] = useState(!inicial.id);
  const [guardando, setGuardando] = useState(false);
  const [panel, setPanel] = useState('anadir');
  const [imagenes, setImagenes] = useState(new Map());
  const [version, setVersion] = useState(0);
  const [guias, setGuias] = useState([]);
  const [recuadro, setRecuadro] = useState(null);     // el recuadro de elegir arrastrando
  const [verExportar, setVerExportar] = useState(false);
  const [verTamano, setVerTamano] = useState(false);
  const [zona, setZona] = useState({ w: 800, h: 600 });
  const [editando, setEditando] = useState(null);     // { id, cursor }: el texto que se escribe en el lienzo
  const [recortando, setRecortando] = useState(null); // la foto que se encuadra dentro de su caja
  const [tiempo, setTiempo] = useState(null);         // la animación, mientras se ve
  const [verUsar, setVerUsar] = useState(false);
  const [ventana, setVentana] = useState(null);       // 'redes' | 'tamanos' | 'lote' | 'biblioteca' | 'fotos' | 'animacion' | 'imprenta'
  const [kit, setKit] = useState(null);
  const [fuentesClub, setFuentesClub] = useState([]);
  const [revision, setRevision] = useState(null);
  const [soltando, setSoltando] = useState(false);
  const [zoom, setZoom] = useState(null);             // null: que quepa entero
  const [procesando, setProcesando] = useState(null); // un aviso mientras se hace algo largo (quitar el fondo)
  // La pantalla, como en Canva: una barra de iconos a la izquierda que abre y cierra su
  // panel, y las propiedades flotando sobre el lienzo solo cuando hay algo elegido.
  const [panelAbierto, setPanelAbierto] = useState(true);
  const [menu, setMenu] = useState(null);             // el menú del botón derecho: { x, y, id? }
  const [ayudas, setAyudas] = useState(() => { try { return JSON.parse(localStorage.getItem('aim_design_ayudas')) || {}; } catch { return {}; } });
  const { go } = useRouter();
  const scrollRef = useRef(null), anclaZoom = useRef(null), copiaRef = useRef(null), yo = useRef({});
  // En vivo: quién más está en el diseño, sus cursores y lo último que les he mandado.
  const [vivos, setVivos] = useState([]);
  const [cursores, setCursores] = useState({});
  const cliente = useMemo(() => `c${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`, []);
  const enviado = useRef(inicial.datos), hayOtros = useRef(false), temporizador = useRef(null), ultimoCursor = useRef({ t: 0, x: 0, y: 0 });
  const zonaRef = useRef(null), lienzoRef = useRef(null), textoRef = useRef(null), arrastre = useRef(null), edicion = useRef(null), tramo = useRef(null), anim = useRef(null);
  const docRef = useRef(doc); docRef.current = doc;
  const paginaRef = useRef(pagina); paginaRef.current = pagina;
  const selRef = useRef(seleccion); selRef.current = seleccion;
  const diseno = useMemo(() => paginaDe(doc, pagina), [doc, pagina]);
  const vista = () => paginaDe(docRef.current, paginaRef.current);
  const ejemplo = tipo === 'diploma' ? EJEMPLO_DIPLOMA : null;
  const sel = seleccion.length === 1 ? seleccion[0] : null;
  const setSel = useCallback((x) => setSeleccion(x ? [x] : []), []);
  const elegido = sel ? diseno.elementos.find(e => e.id === sel) || null : null;
  const elegidos = useMemo(() => diseno.elementos.filter(e => seleccion.includes(e.id)), [diseno, seleccion]);
  const paginas = numPaginas(doc);
  const kitConFuentes = useMemo(() => ({ ...(kit || {}), fuentes: fuentesClub }), [kit, fuentesClub]);

  useEffect(() => {
    pedirFuentes();
    api('/api/admin/disenos/marca').then(setKit).catch(() => setKit(null));
    api('/api/admin/disenos/fuentes').then(d => { setFuentesClub(d.fuentes || []); (d.fuentes || []).forEach(f => cargarFuentePropia(f.nombre, f.url)); }).catch(() => {});
  }, []);
  const cargarRevision = useCallback(() => { if (id) api(`/api/admin/disenos/${id}/revision`).then(setRevision).catch(() => {}); }, [id]);
  useEffect(() => { cargarRevision(); }, [cargarRevision]);
  useEffect(() => { if (pagina >= paginas) setPagina(paginas - 1); }, [pagina, paginas]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);
  // El tamaño del hueco central, para que el lienzo quepa entero (con la barra de páginas debajo).
  useEffect(() => {
    const el = zonaRef.current; if (!el) return undefined;
    const ro = new ResizeObserver(([x]) => setZona({ w: x.contentRect.width, h: x.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const ajustada = Math.max(0.05, Math.min((zona.w - 48) / diseno.ancho, (zona.h - 110) / diseno.alto));
  const escala = zoom ? Math.max(0.05, Math.min(6, zoom)) : ajustada;
  // La cuadrícula y los márgenes de seguridad (5 mm en papel; si no, el 5 % del lado corto).
  const enPapel = TAMANOS.some(t => t.pdf && t.ancho === diseno.ancho && t.alto === diseno.alto);
  const pasoRejilla = Math.max(10, Math.round(Math.min(diseno.ancho, diseno.alto) / 12));
  const margenSeguro = enPapel ? 30 : Math.round(Math.min(diseno.ancho, diseno.alto) * 0.05);
  useEffect(() => { try { localStorage.setItem('aim_design_ayudas', JSON.stringify(ayudas)); } catch { /* sin almacenamiento */ } }, [ayudas]);
  // ── Zoom: Ctrl + rueda (donde está el ratón), Ctrl + / Ctrl - / Ctrl 0, o los botones de abajo ──
  const PASOS_ZOOM = [0.1, 0.17, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6];
  function hacerZoom(dir, punto) {
    if (!dir) { setZoom(null); return; }
    const sig = dir > 0 ? PASOS_ZOOM.find(z => z > escala * 1.01) || 6 : [...PASOS_ZOOM].reverse().find(z => z < escala * 0.99) || 0.1;
    const r = lienzoRef.current?.getBoundingClientRect();
    const p = punto || (r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
    if (r && p) anclaZoom.current = { px: (p.x - r.left) / escala, py: (p.y - r.top) / escala, cx: p.x, cy: p.y };
    setZoom(sig);
  }
  useLayoutEffect(() => {
    const a = anclaZoom.current; anclaZoom.current = null;
    const sc = scrollRef.current;
    if (!a || !sc || !lienzoRef.current) return;
    const r = lienzoRef.current.getBoundingClientRect();
    sc.scrollLeft += r.left + a.px * escala - a.cx; sc.scrollTop += r.top + a.py * escala - a.cy;
  }, [escala]);
  useEffect(() => {
    const z = zonaRef.current; if (!z) return undefined;
    const f = (ev) => { if (!(ev.ctrlKey || ev.metaKey)) return; ev.preventDefault(); yo.current.hacerZoom(ev.deltaY < 0 ? 1 : -1, { x: ev.clientX, y: ev.clientY }); };
    z.addEventListener('wheel', f, { passive: false });
    return () => z.removeEventListener('wheel', f);
  }, []);

  // Imágenes y fuentes: al cargarse, se vuelve a pintar.
  const urls = useMemo(() => [diseno.fondo?.tipo === 'imagen' ? diseno.fondo.url : null, ...diseno.elementos.filter(e => e.tipo === 'imagen').map(e => e.url)].filter(Boolean).join('|'), [diseno]);
  useEffect(() => { cargarImagenes(diseno).then(m => { setImagenes(m); }); }, [urls]); // eslint-disable-line react-hooks/exhaustive-deps
  const fuentes = useMemo(() => diseno.elementos.filter(e => e.tipo === 'texto').map(e => `${e.fuente}|${e.negrita}|${e.cursiva}|${e.fuenteUrl || ''}`).join(','), [diseno]);
  useEffect(() => { cargarFuentes(diseno).then(() => setVersion(v => v + 1)); }, [fuentes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pintar.
  useEffect(() => {
    const c = lienzoRef.current; if (!c) return;
    const lado = Math.max(diseno.ancho, diseno.alto) * escala;
    const dpr = Math.min(Math.min(2, window.devicePixelRatio || 1), 8000 / lado);
    c.width = Math.round(diseno.ancho * escala * dpr); c.height = Math.round(diseno.alto * escala * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(escala * dpr, 0, 0, escala * dpr, 0, 0);
    // El texto que se está escribiendo no se pinta: se ve el de la caja de escribir.
    pintarDiseno(ctx, diseno, { imagenes, variables: ejemplo, ocultar: editando?.id, tiempo, editor: tiempo == null });
  }, [diseno, escala, imagenes, version, ejemplo, editando, tiempo]);

  // ── Cambios con deshacer ──
  // aplicar: cambia la página que se ve; aplicarDoc: el diseño entero (páginas, tamaño).
  const aplicarDoc = useCallback((fn, { historia = true } = {}) => {
    const prev = docRef.current, sig = fn(prev);
    if (sig === prev) return;
    if (historia) setHist(h => ({ atras: [...h.atras.slice(-99), prev], adelante: [] }));
    docRef.current = sig;
    setDoc(sig); setSucio(true);
  }, []);
  const aplicar = useCallback((fn, opts) => aplicarDoc(d => {
    const v = paginaDe(d, paginaRef.current), sv = fn(v);
    return sv === v ? d : conPagina(d, paginaRef.current, sv);
  }, opts), [aplicarDoc]);
  // Un deslizador: todo lo que se mueve mientras se arrastra es un solo paso de deshacer.
  const tramoTerminar = () => {
    const t = tramo.current; tramo.current = null;
    if (t && t !== docRef.current) setHist(h => ({ atras: [...h.atras.slice(-99), t], adelante: [] }));
  };
  const tramos = { empezar: () => { if (!tramo.current) tramo.current = docRef.current; }, terminar: tramoTerminar };
  const cambiarEl = (idEl, cambios, opts) => aplicar(d => ({ ...d, elementos: d.elementos.map(e => (e.id === idEl ? ajustarTexto({ ...e, ...cambios }, ejemplo) : e)) }), { historia: !tramo.current, ...opts });
  const cambiarVarios = (ids, fn) => aplicar(d => ({ ...d, elementos: d.elementos.map(e => (ids.includes(e.id) ? ajustarTexto(fn(e), ejemplo) : e)) }));
  function deshacer() {
    if (!hist.atras.length) return;
    const prev = hist.atras[hist.atras.length - 1];
    setHist({ atras: hist.atras.slice(0, -1), adelante: [doc, ...hist.adelante] });
    docRef.current = prev; setDoc(prev); setSucio(true);
  }
  function rehacer() {
    if (!hist.adelante.length) return;
    const sig = hist.adelante[0];
    setHist({ atras: [...hist.atras, doc], adelante: hist.adelante.slice(1) });
    docRef.current = sig; setDoc(sig); setSucio(true);
  }

  function anadir(el) {
    const e = ajustarTexto({ rot: 0, opacidad: 1, ...el, id: nuevoId() }, ejemplo);
    e.x = el.x ?? Math.round((diseno.ancho - e.w) / 2); e.y = el.y ?? Math.round((diseno.alto - e.h) / 2);
    aplicar(d => ({ ...d, elementos: [...d.elementos, e] }));
    setSel(e.id); setRecortando(null);
  }
  const base = Math.min(diseno.ancho, diseno.alto);
  const anadirTexto = (nivel, texto) => anadir({ tipo: 'texto', texto: texto || { titulo: 'Un título', subtitulo: 'Un subtítulo', texto: 'Escribe aquí tu texto' }[nivel],
    w: Math.round(diseno.ancho * 0.7), h: 100, fuente: nivel === 'titulo' ? 'Plus Jakarta Sans' : 'Montserrat', tamano: Math.round(base * ({ titulo: 0.08, subtitulo: 0.05, texto: 0.032 }[nivel] || 0.04)),
    negrita: nivel !== 'texto', color: '#1A1A1A', alinear: 'centro', interlineado: 1.25 });
  const anadirForma = (t) => anadir(t === 'linea'
    ? { tipo: 'linea', w: Math.round(diseno.ancho * 0.4), h: 24, color: '#1A1A1A', grosor: Math.max(3, Math.round(base * 0.004)) }
    : t === 'rect' || t === 'elipse'
      ? { tipo: t, w: Math.round(base * 0.3), h: Math.round(base * 0.3), relleno: t === 'rect' ? '#5233A8' : '#FF5FA2', radio: t === 'rect' ? Math.round(base * 0.02) : 0, borde: '#1A1A1A', grosor: 0 }
      : { tipo: 'forma', figura: t, w: Math.round(base * (['flecha', 'flecha2', 'cinta', 'chevron'].includes(t) ? 0.4 : 0.3)), h: Math.round(base * (['flecha', 'flecha2', 'cinta'].includes(t) ? 0.2 : 0.3)),
        relleno: { estrella: '#FFD526', corazon: '#FF5FA2', sello: '#F99B35', destello: '#FFD526', bocadillo: '#FFFFFF', bocadillo2: '#FFFFFF', nube: '#FFFFFF' }[t] || '#5233A8',
        borde: '#1A1A1A', grosor: ['bocadillo', 'bocadillo2', 'nube'].includes(t) ? Math.max(2, Math.round(base * 0.004)) : 0 });
  const anadirIcono = (icono) => { const lado = Math.round(base * 0.16); anadir({ tipo: 'icono', icono, w: lado, h: lado, color: '#5233A8' }); };
  const anadirMarco = (figura) => { const w = Math.round(base * 0.42); anadir({ tipo: 'imagen', url: null, marco: figura, ajuste: 'cubrir', w, h: figura === 'arco' ? Math.round(w * 1.25) : w, radio: figura === 'rect' ? Math.round(base * 0.03) : 0 }); };
  // Una imagen: si lo elegido es un marco vacío, va dentro; si no, se añade (en el punto, si se ha soltado ahí).
  const anadirImagen = async (url, ancho, alto, punto = null) => {
    const v = vista(), marco = selRef.current.length === 1 ? v.elementos.find(e => e.id === selRef.current[0] && e.tipo === 'imagen' && !e.url) : null;
    if (marco && !punto) { cambiarEl(marco.id, { url, encuadre: null, ajuste: 'cubrir' }); return; }
    if (!ancho || !alto) { const i = await cargarImagen(url); ancho = i?.naturalWidth || 600; alto = i?.naturalHeight || 600; }
    const k = Math.min(1, (diseno.ancho * 0.5) / ancho, (diseno.alto * 0.5) / alto), w = Math.round(ancho * k), h = Math.round(alto * k);
    anadir({ tipo: 'imagen', url, w, h, ajuste: 'contener', radio: 0, ...(punto ? { x: Math.round(punto.x - w / 2), y: Math.round(punto.y - h / 2) } : {}) });
  };
  const anadirQr = (texto) => { const lado = Math.round(base * 0.28); anadir({ tipo: 'qr', texto, w: lado, h: lado, color: '#1A1A1A', fondo: '#FFFFFF', radio: 0 }); };
  const anadirTabla = (celdas) => anadir({ tipo: 'tabla', celdas: celdas || [['Día', 'Hora', 'Clase'], ['Lunes', '17:30', 'Infantil'], ['Miércoles', '18:30', 'Adultos']],
    cabecera: true, rayas: true, fuente: 'Montserrat', tamano: Math.round(base * 0.03), color: '#1A1A1A', fondoCabecera: '#5233A8', colorCabecera: '#FFFFFF', fondoFilas: '#FFFFFF', fondoRayas: '#F3F0FA',
    borde: '#E5E1F2', grosor: 2, radio: Math.round(base * 0.015), alinear: 'izquierda', w: Math.round(diseno.ancho * 0.8), h: 100 });
  const anadirGrafico = (clase) => anadir({ tipo: 'grafico', clase, datos: [{ etiqueta: 'Oros', valor: 3 }, { etiqueta: 'Platas', valor: 5 }, { etiqueta: 'Bronces', valor: 4 }],
    colores: ['#FFD526', '#B8BCC6', '#D08A4E'], fuente: 'Montserrat', tamano: Math.round(base * 0.026), color: '#1A1A1A', valores: true,
    w: Math.round(base * (clase === 'circular' || clase === 'anillo' ? 0.62 : 0.6)), h: Math.round(base * (clase === 'circular' || clase === 'anillo' ? 0.36 : 0.42)) });
  // Un título y su texto debajo (el horario, los eventos…), en el centro.
  function anadirBloque(titulo, cuerpo) {
    const w = Math.round(diseno.ancho * 0.8), x = Math.round((diseno.ancho - w) / 2), hueco = Math.round(base * 0.03);
    const t = ajustarTexto({ id: nuevoId(), tipo: 'texto', rot: 0, opacidad: 1, texto: titulo, x, y: 0, w, h: 100, fuente: 'Plus Jakarta Sans', tamano: Math.round(base * 0.06), negrita: true, color: '#1A1A1A', alinear: 'centro', interlineado: 1.2 }, ejemplo);
    const c = ajustarTexto({ ...t, id: nuevoId(), texto: cuerpo, fuente: 'Montserrat', tamano: Math.round(base * 0.032), negrita: false, interlineado: 1.45 }, ejemplo);
    t.y = Math.max(0, Math.round((diseno.alto - (t.h + hueco + c.h)) / 2)); c.y = t.y + t.h + hueco;
    aplicar(d => ({ ...d, elementos: [...d.elementos, t, c] }));
    setSel(c.id);
  }
  async function subir(file, alSubir) {
    if (!file) return;
    try { const r = await subirImagen(file); alSubir(r); } catch (e) { alert(e.message); }
  }
  // Soltar en el lienzo una imagen del panel o un archivo del ordenador: dentro
  // de la foto o el marco que haya debajo (la cambia) o, si no, donde se suelta.
  async function soltar(ev) {
    ev.preventDefault(); setSoltando(false);
    const r = lienzoRef.current.getBoundingClientRect(), p = { x: (ev.clientX - r.left) / escala, y: (ev.clientY - r.top) / escala };
    let img = null;
    const dato = ev.dataTransfer.getData(TIPO_ARRASTRE);
    if (dato) { try { img = JSON.parse(dato); } catch { img = null; } }
    else if (ev.dataTransfer.files?.[0]) {
      const f = ev.dataTransfer.files[0];
      if (!/^image\//.test(f.type)) return;
      try { img = await subirImagen(f); } catch (e) { alert(e.message); return; }
    }
    if (!img?.url) return;
    const destino = [...vista().elementos].reverse().find(e => !e.oculto && !e.bloqueado && e.tipo === 'imagen' && dentroDe(e, p.x, p.y));
    if (destino) {
      cambiarEl(destino.id, { url: img.url, encuadre: null, ...(destino.url ? {} : { ajuste: 'cubrir' }) });
      setSel(destino.id);
    } else anadirImagen(img.url, img.ancho, img.alto, p);
  }

  // ── Copiar, cortar y pegar (también entre páginas, diseños y pestañas) ──
  const CLAVE_COPIA = 'aim_design_copia';
  const dondeEstoy = `${id || 'nuevo'}:${pagina}`;
  function leerCopia() { try { return JSON.parse(localStorage.getItem(CLAVE_COPIA)) || copiaRef.current; } catch { return copiaRef.current; } }
  function guardarCopia(c) { copiaRef.current = c; try { localStorage.setItem(CLAVE_COPIA, JSON.stringify(c)); } catch { /* sin espacio */ } }
  function copiar(cortar = false) {
    if (!elegidos.length) return;
    const c = { elementos: elegidos, origen: dondeEstoy, t: Date.now() };
    guardarCopia(c);
    // En el portapapeles del ordenador, una marca: así Ctrl+V sabe que es lo copiado aquí.
    navigator.clipboard?.writeText?.(`aim-design:${c.t}`).catch(() => {});
    if (cortar) borrarSel();
    showToast?.(`${cortar ? 'Cortado' : 'Copiado'}${elegidos.length > 1 ? ` (${elegidos.length})` : ''}: Ctrl+V lo pega aquí, en otra página o en otro diseño.`);
  }
  function pegarElementos(c) {
    if (!c?.elementos?.length) return false;
    const mismo = c.origen === dondeEstoy, caja = cajaDe(c.elementos);
    const grupos = new Map(), grupoNuevo = (g) => { if (!grupos.has(g)) grupos.set(g, nuevoId()); return grupos.get(g); };
    // Aquí mismo, un poco desplazado; en otro sitio, donde estaba (o en el centro, si no cabe).
    let dx = mismo ? 30 : 0, dy = mismo ? 30 : 0;
    if (!mismo && (caja.x + caja.w > diseno.ancho || caja.y + caja.h > diseno.alto || caja.x < 0 || caja.y < 0)) {
      dx = Math.round((diseno.ancho - caja.w) / 2 - caja.x); dy = Math.round((diseno.alto - caja.h) / 2 - caja.y);
    }
    const nuevos = c.elementos.map(e => ({ ...e, id: nuevoId(), x: e.x + dx, y: e.y + dy, ...(e.grupo ? { grupo: grupoNuevo(e.grupo) } : {}) }));
    aplicar(d => ({ ...d, elementos: [...d.elementos, ...nuevos] }));
    setSeleccion(nuevos.map(e => e.id)); setRecortando(null);
    if (mismo) guardarCopia({ ...c, elementos: nuevos });
    return true;
  }
  useEffect(() => {
    // Pegar: lo copiado en Aim Design, una imagen o un texto del ordenador.
    const f = async (ev) => {
      const t = ev.target;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName || '') || t?.isContentEditable || yo.current.ventana) return;
      const dt = ev.clipboardData; if (!dt) return;
      const archivo = [...dt.files].find(x => /^image\//.test(x.type)), texto = dt.getData('text/plain') || '', copia = yo.current.leerCopia();
      ev.preventDefault();
      if (archivo) { try { const r = await subirImagen(archivo); yo.current.anadirImagen(r.url, r.ancho, r.alto); } catch (e) { alert(e.message); } return; }
      if (copia && (!texto.trim() || texto.startsWith('aim-design:'))) { yo.current.pegarElementos(copia); return; }
      if (texto.trim() && !texto.startsWith('aim-design:')) yo.current.anadirTexto('texto', texto.trim().slice(0, 2000));
    };
    window.addEventListener('paste', f);
    return () => window.removeEventListener('paste', f);
  }, []);
  // Quitar el fondo de una foto (en el navegador). La de antes se guarda para recuperarla.
  async function quitarFondoSel() {
    const el = elegido;
    if (!el || el.tipo !== 'imagen' || !el.url) return;
    if (el.url.startsWith('/api/admin/disenos/foto-club/')) {
      alert('A las fotos de la galería no se les quita el fondo: la foto recortada saldría de la galería y dejaría de depender del permiso de fotos. Usa una foto subida.');
      return;
    }
    setProcesando('Quitando el fondo… (la primera vez tarda un poco más)');
    try {
      const img = await cargarImagen(el.url);
      if (!img) throw new Error('no se ha podido abrir la foto');
      const c = await quitarFondo(img);
      const r = await api('/api/admin/disenos/imagen', { method: 'POST', body: { datos: c.toDataURL('image/png'), nombre: 'Foto sin fondo' } });
      cambiarEl(el.id, { url: r.url, conFondo: el.conFondo || el.url, encuadre: null, ajuste: el.ajuste || 'contener' });
      showToast?.('Fondo quitado. Si no ha quedado bien: «Recuperar el fondo».');
    } catch (e) { alert(`No se ha podido quitar el fondo: ${e.message}`); } finally { setProcesando(null); }
  }
  // Voltear: uno, en su sitio; varios, como un bloque (también se cambian de lado).
  function voltear(eje) {
    if (!elegidos.length) return;
    const c = cajaDe(elegidos), varios = elegidos.length > 1;
    cambiarVarios(seleccion, e => (eje === 'h'
      ? { ...e, espejoH: !e.espejoH, rot: e.rot ? (360 - e.rot) % 360 : 0, ...(varios ? { x: Math.round(c.x + c.w - (e.x - c.x) - e.w) } : {}) }
      : { ...e, espejoV: !e.espejoV, rot: e.rot ? (360 - e.rot) % 360 : 0, ...(varios ? { y: Math.round(c.y + c.h - (e.y - c.y) - e.h) } : {}) }));
  }

  // ── Lo elegido (uno o varios) ──
  function borrarSel() { if (!seleccion.length) return; aplicar(d => ({ ...d, elementos: d.elementos.filter(e => !seleccion.includes(e.id)) })); setSeleccion([]); }
  function duplicarSel() {
    if (!elegidos.length) return;
    const grupos = new Map();
    const grupoNuevo = (g) => { if (!grupos.has(g)) grupos.set(g, nuevoId()); return grupos.get(g); };
    const copias = elegidos.map(e => ({ ...e, id: nuevoId(), x: e.x + 30, y: e.y + 30, ...(e.grupo ? { grupo: grupoNuevo(e.grupo) } : {}) }));
    aplicar(d => ({ ...d, elementos: [...d.elementos, ...copias] })); setSeleccion(copias.map(c => c.id));
  }
  function agrupar() { if (seleccion.length < 2) return; const g = nuevoId(); cambiarVarios(seleccion, e => ({ ...e, grupo: g })); }
  function desagrupar() { cambiarVarios(seleccion, ({ grupo, ...resto }) => resto); } // eslint-disable-line no-unused-vars
  function moverSel(dx, dy) { aplicar(d => ({ ...d, elementos: d.elementos.map(e => (seleccion.includes(e.id) && !e.bloqueado ? { ...e, x: e.x + dx, y: e.y + dy } : e)) })); }
  function capa(dir) {
    aplicar(d => {
      const dentro = d.elementos.filter(e => seleccion.includes(e.id)), fuera = d.elementos.filter(e => !seleccion.includes(e.id));
      if (!dentro.length) return d;
      if (dir === 'frente') return { ...d, elementos: [...fuera, ...dentro] };
      if (dir === 'fondo') return { ...d, elementos: [...dentro, ...fuera] };
      if (dentro.length > 1) return d;
      const l = [...d.elementos]; const i = l.findIndex(e => e.id === dentro[0].id);
      const [e] = l.splice(i, 1); l.splice(Math.max(0, Math.min(l.length, i + dir)), 0, e);
      return { ...d, elementos: l };
    });
  }
  // Uno, respecto al lienzo.
  function alinear(como) {
    if (!elegido) return;
    const { ancho: W, alto: H } = diseno;
    const pos = { izq: { x: 0 }, centroH: { x: (W - elegido.w) / 2 }, der: { x: W - elegido.w }, arriba: { y: 0 }, centroV: { y: (H - elegido.h) / 2 }, abajo: { y: H - elegido.h } }[como];
    cambiarEl(elegido.id, Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, Math.round(v)])));
  }
  // Varios, entre ellos (respecto a la caja que ocupan).
  function alinearVarios(como) {
    if (elegidos.length < 2) return;
    const c = cajaDe(elegidos);
    const pos = (e) => ({ izq: { x: c.x }, centroH: { x: c.x + c.w / 2 - e.w / 2 }, der: { x: c.x + c.w - e.w }, arriba: { y: c.y }, centroV: { y: c.y + c.h / 2 - e.h / 2 }, abajo: { y: c.y + c.h - e.h } }[como]);
    cambiarVarios(seleccion, e => (e.bloqueado ? e : { ...e, ...Object.fromEntries(Object.entries(pos(e)).map(([k, v]) => [k, Math.round(v)])) }));
  }
  // Repartir: el mismo hueco entre cada uno (los de los extremos no se mueven).
  function repartir(eje) {
    if (elegidos.length < 3) return;
    const [p, t] = eje === 'h' ? ['x', 'w'] : ['y', 'h'];
    const orden = [...elegidos].sort((a, b) => (a[p] + a[t] / 2) - (b[p] + b[t] / 2));
    const ini = orden[0][p], fin = orden[orden.length - 1][p] + orden[orden.length - 1][t];
    const hueco = (fin - ini - orden.reduce((s, e) => s + e[t], 0)) / (orden.length - 1);
    const nuevo = new Map(); let cur = ini;
    for (const e of orden) { nuevo.set(e.id, Math.round(cur)); cur += e[t] + hueco; }
    cambiarVarios(seleccion, e => ({ ...e, [p]: nuevo.get(e.id) }));
  }

  // ── Páginas (carruseles, folletos de dos caras) ──
  function irPagina(i) {
    if (edicion.current) document.activeElement?.blur?.();
    setRecortando(null); setSeleccion([]); setPagina(Math.max(0, Math.min(numPaginas(docRef.current) - 1, i)));
  }
  function nuevaPagina() {
    if (paginas >= 20) { alert('Como mucho 20 páginas.'); return; }
    const p = paginaRef.current;
    aplicarDoc(d => { const l = paginasDe(d); l.splice(p + 1, 0, { fondo: { ...(l[p].fondo || { tipo: 'color', color: '#ffffff' }) }, elementos: [] }); return desdePaginas(d, l); });
    irPagina(p + 1);
  }
  function duplicarPagina() {
    if (paginas >= 20) { alert('Como mucho 20 páginas.'); return; }
    const p = paginaRef.current;
    aplicarDoc(d => { const l = paginasDe(d); l.splice(p + 1, 0, { fondo: l[p].fondo, elementos: l[p].elementos.map(e => ({ ...e, id: nuevoId() })) }); return desdePaginas(d, l); });
    irPagina(p + 1);
  }
  function borrarPagina() {
    if (paginas < 2 || !window.confirm(`¿Borrar la página ${pagina + 1}? (Ctrl+Z la recupera.)`)) return;
    const p = paginaRef.current;
    aplicarDoc(d => desdePaginas(d, paginasDe(d).filter((_, i) => i !== p)));
    irPagina(Math.max(0, p - 1));
  }
  function moverPagina(dir) {
    const p = paginaRef.current, q = p + dir;
    if (q < 0 || q >= paginas) return;
    aplicarDoc(d => { const l = paginasDe(d); [l[p], l[q]] = [l[q], l[p]]; return desdePaginas(d, l); });
    setPagina(q);
  }

  // ── Escribir en el propio lienzo: doble clic en un texto (o Intro con él elegido) ──
  // Se escribe en una caja encima, con la misma letra; al salir (clic fuera, Esc)
  // todo lo escrito es un solo paso de deshacer.
  function editarTexto(idEl, punto) {
    const el = vista().elementos.find(e => e.id === idEl);
    if (!el || el.tipo !== 'texto' || el.bloqueado) return;
    let cursor = String(el.texto || '').length;
    if (punto && lienzoRef.current) {
      // El punto del clic, en la caja del texto (sin su giro).
      const r = lienzoRef.current.getBoundingClientRect();
      const cx = r.left + (el.x + el.w / 2) * escala, cy = r.top + (el.y + el.h / 2) * escala;
      const a = -(el.rot || 0) * Math.PI / 180, vx = punto.x - cx, vy = punto.y - cy;
      cursor = posicionEnTexto(el, (vx * Math.cos(a) - vy * Math.sin(a)) / escala + el.w / 2, (vx * Math.sin(a) + vy * Math.cos(a)) / escala + el.h / 2);
    }
    edicion.current = { id: idEl, previo: docRef.current };
    setSel(idEl); setEditando({ id: idEl, cursor });
  }
  function terminarTexto() {
    const ed = edicion.current; edicion.current = null; setEditando(null);
    if (ed && docRef.current !== ed.previo) setHist(h => ({ atras: [...h.atras.slice(-99), ed.previo], adelante: [] }));
  }
  // ── Recortar una foto: se arrastra la foto dentro de su caja y se acerca con el zoom ──
  function recortar(idEl) {
    const el = vista().elementos.find(e => e.id === idEl);
    if (!el || el.tipo !== 'imagen' || !el.url || el.bloqueado) return;
    if (!el.encuadre) cambiarEl(idEl, { encuadre: { zoom: 1, x: 0.5, y: 0.5 } });
    setSel(idEl); setRecortando(idEl);
  }

  // ── Arrastrar, cambiar de tamaño, girar, encuadrar y elegir con un recuadro ──
  function empezar(ev, idEl, modo, hx = 0, hy = 0) {
    ev.stopPropagation();
    setMenu(null);
    if (ev.button > 0) return;
    ev.preventDefault();
    if (edicion.current) document.activeElement?.blur?.();
    const v = vista(), el = v.elementos.find(e => e.id === idEl);
    if (!el) return;
    if (recortando && recortando !== idEl) setRecortando(null);
    let m = modo;
    if (m === 'mover' && recortando === idEl) m = 'encuadre';
    // Mayús + clic: añadir o quitar de lo elegido.
    if (m === 'mover' && ev.shiftKey) {
      const g = conGrupo(v.elementos, [idEl]), todos = g.every(x => selRef.current.includes(x));
      setSeleccion(s => (todos ? s.filter(x => !g.includes(x)) : [...new Set([...s, ...g])]));
      return;
    }
    const nueva = m === 'mover' ? (selRef.current.includes(idEl) ? selRef.current : conGrupo(v.elementos, [idEl])) : [idEl];
    setSeleccion(nueva);
    const a = { modo: m, id: idEl, x0: ev.clientX, y0: ev.clientY, el0: { ...el }, hx, hy, movido: false, previo: docRef.current, pagina: paginaRef.current };
    if (m === 'mover') {
      const mueven = v.elementos.filter(e => nueva.includes(e.id) && !e.bloqueado);
      if (!mueven.length) return;
      const quietos = v.elementos.filter(e => !nueva.includes(e.id) && !e.oculto);
      const { ancho: W, alto: H } = v, extraV = [], extraH = [];
      if (ayudas.cuadricula) { for (let p = pasoRejilla; p < W; p += pasoRejilla) extraV.push(p); for (let p = pasoRejilla; p < H; p += pasoRejilla) extraH.push(p); }
      if (ayudas.margenes) { extraV.push(margenSeguro, W - margenSeguro); extraH.push(margenSeguro, H - margenSeguro); }
      arrastre.current = { ...a, otros: mueven.map(e => ({ ...e })), caja: cajaDe(mueven),
        lineasV: [...quietos.flatMap(e => [e.x, e.x + e.w / 2, e.x + e.w]), ...extraV], lineasH: [...quietos.flatMap(e => [e.y, e.y + e.h / 2, e.y + e.h]), ...extraH] };
      return;
    }
    if (el.bloqueado) return;
    if (m === 'encuadre') {
      const i = imagenes.get(el.url); if (!i) return;
      a.img = { w: i.naturalWidth || i.width, h: i.naturalHeight || i.height };
    }
    arrastre.current = a;
  }
  useEffect(() => {
    const mover = (ev) => {
      const a = arrastre.current; if (!a) return;
      const dxp = ev.clientX - a.x0, dyp = ev.clientY - a.y0;
      if (!a.movido && Math.abs(dxp) + Math.abs(dyp) < 3) return;
      a.movido = true;
      if (a.modo === 'recuadro') { setRecuadro({ x: Math.min(a.x0, ev.clientX), y: Math.min(a.y0, ev.clientY), w: Math.abs(dxp), h: Math.abs(dyp) }); return; }
      const dx = dxp / escala, dy = dyp / escala;
      const e0 = a.el0, rad = (e0.rot || 0) * Math.PI / 180;
      if (a.modo === 'mover') {
        const bb = a.caja, { ancho: W, alto: H } = paginaDe(docRef.current, a.pagina), umbral = 8 / escala, gs = [];
        let x = bb.x + dx, y = bb.y + dy;
        const ex = encaje(x, bb.w, [0, W / 2, W, ...a.lineasV], umbral), ey = encaje(y, bb.h, [0, H / 2, H, ...a.lineasH], umbral);
        if (ex) { x += ex.d; gs.push({ v: ex.l }); }
        if (ey) { y += ey.d; gs.push({ h: ey.l }); }
        setGuias(gs);
        const ddx = Math.round(x - bb.x), ddy = Math.round(y - bb.y);
        const pos = new Map(a.otros.map(o => [o.id, { x: o.x + ddx, y: o.y + ddy }]));
        setDoc(d => { const n = cambiarElementos(d, a.pagina, e => (pos.has(e.id) ? { ...e, ...pos.get(e.id) } : e)); docRef.current = n; return n; });
        return;
      }
      let c = {};
      if (a.modo === 'encuadre') {
        const enc = e0.encuadre || { zoom: 1, x: 0.5, y: 0.5 };
        const k = Math.max(e0.w / a.img.w, e0.h / a.img.h) * Math.max(1, enc.zoom || 1), dw = a.img.w * k, dh = a.img.h * k;
        const lx = dx * Math.cos(rad) + dy * Math.sin(rad), ly = -dx * Math.sin(rad) + dy * Math.cos(rad);
        const lim = (v, m) => Math.max(m, Math.min(1 - m, v));
        c = { encuadre: { ...enc, x: lim((enc.x ?? 0.5) - lx / dw, e0.w / 2 / dw), y: lim((enc.y ?? 0.5) - ly / dh, e0.h / 2 / dh) } };
      } else if (a.modo === 'tamano') {
        const lx = dx * Math.cos(rad) + dy * Math.sin(rad), ly = -dx * Math.sin(rad) + dy * Math.cos(rad);
        let nw = a.hx ? Math.max(10, e0.w + a.hx * lx) : e0.w, nh = a.hy ? Math.max(10, e0.h + a.hy * ly) : e0.h;
        const esquina = a.hx && a.hy;
        if (esquina && (['imagen', 'texto', 'qr', 'icono', 'tabla'].includes(e0.tipo) || ev.shiftKey)) {
          const k = Math.max(nw / e0.w, nh / e0.h); nw = e0.w * k; nh = e0.h * k;
        }
        const sx = a.hx * (nw - e0.w) / 2, sy = a.hy * (nh - e0.h) / 2;
        const cx = e0.x + e0.w / 2 + sx * Math.cos(rad) - sy * Math.sin(rad), cy = e0.y + e0.h / 2 + sx * Math.sin(rad) + sy * Math.cos(rad);
        c = { w: Math.round(nw), h: Math.round(nh), x: Math.round(cx - nw / 2), y: Math.round(cy - nh / 2) };
        // Un texto por la esquina crece con su letra (y sus efectos).
        if ((e0.tipo === 'texto' || e0.tipo === 'tabla') && esquina) {
          const k = nw / e0.w;
          c.tamano = Math.max(6, Math.round((e0.tamano || 48) * k));
          for (const p of ['contornoGrosor', 'resalteMargen', 'sombraX', 'sombraY', 'sombraDifu', 'espaciado', 'margenCelda']) if (e0[p]) c[p] = Math.round(e0[p] * k * 10) / 10;
        }
        if (e0.tipo === 'linea') { c.h = e0.h; c.y = Math.round(cy - e0.h / 2); }
      } else if (a.modo === 'girar') {
        const r = lienzoRef.current.getBoundingClientRect();
        const cx = r.left + (e0.x + e0.w / 2) * escala, cy = r.top + (e0.y + e0.h / 2) * escala;
        let g = Math.round(Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90);
        if (ev.shiftKey) g = Math.round(g / 15) * 15;
        else for (const s of [0, 90, 180, 270, 360, -90]) if (Math.abs(g - s) < 4) g = s;
        c = { rot: ((g % 360) + 360) % 360 };
      }
      setDoc(d => { const n = cambiarElementos(d, a.pagina, e => (e.id === a.id ? ajustarTexto({ ...e, ...c }, ejemplo) : e)); docRef.current = n; return n; });
    };
    const soltarPuntero = (ev) => {
      tramoTerminar();
      const a = arrastre.current; arrastre.current = null; setGuias([]);
      if (!a) return;
      if (a.modo === 'recuadro') {
        setRecuadro(null);
        if (!a.movido) { if (!a.shift) setSeleccion([]); return; }
        const r = lienzoRef.current.getBoundingClientRect();
        const x1 = (Math.min(a.x0, ev.clientX) - r.left) / escala, x2 = (Math.max(a.x0, ev.clientX) - r.left) / escala;
        const y1 = (Math.min(a.y0, ev.clientY) - r.top) / escala, y2 = (Math.max(a.y0, ev.clientY) - r.top) / escala;
        const v = paginaDe(docRef.current, paginaRef.current);
        const tocados = v.elementos.filter(e => !e.oculto && !e.bloqueado && e.x < x2 && e.x + e.w > x1 && e.y < y2 && e.y + e.h > y1).map(e => e.id);
        const ids = conGrupo(v.elementos, tocados);
        setSeleccion(s => (a.shift ? [...new Set([...s, ...ids])] : ids));
        return;
      }
      if (a.movido) { setHist(h => ({ atras: [...h.atras.slice(-99), a.previo], adelante: [] })); setSucio(true); }
    };
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltarPuntero);
    return () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltarPuntero); };
  }, [escala, ejemplo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Teclado ──
  useEffect(() => {
    const f = (ev) => {
      const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName || '') || ev.target?.isContentEditable;
      const ctrl = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
      if (ctrl && k === 's') { ev.preventDefault(); guardar(); return; }
      if (ctrl && (k === '+' || k === '=' || k === '-' || k === '0')) { ev.preventDefault(); hacerZoom(k === '0' ? 0 : k === '-' ? -1 : 1); return; }
      if (enCampo || ventana) return;
      if (menu && ev.key === 'Escape') { setMenu(null); return; }
      if (recortando && (ev.key === 'Enter' || ev.key === 'Escape')) { ev.preventDefault(); setRecortando(null); return; }
      if (ctrl && (k === 'c' || k === 'x') && seleccion.length && !window.getSelection()?.toString()) { ev.preventDefault(); copiar(k === 'x'); return; }
      if (ctrl && k === 'z') { ev.preventDefault(); if (ev.shiftKey) rehacer(); else deshacer(); }
      else if (ctrl && k === 'y') { ev.preventDefault(); rehacer(); }
      else if (ctrl && k === 'd') { ev.preventDefault(); duplicarSel(); }
      else if (ctrl && k === 'a') { ev.preventDefault(); setSeleccion(diseno.elementos.filter(e => !e.oculto && !e.bloqueado).map(e => e.id)); }
      else if (ctrl && k === 'g') { ev.preventDefault(); if (ev.shiftKey) desagrupar(); else agrupar(); }
      else if ((ev.key === 'Delete' || ev.key === 'Backspace') && seleccion.length) { ev.preventDefault(); borrarSel(); }
      else if (ev.key === 'Escape') setSeleccion([]);
      else if (ev.key === 'Enter' && sel && elegido?.tipo === 'texto') { ev.preventDefault(); editarTexto(sel); }
      else if (seleccion.length && ev.key.startsWith('Arrow')) {
        ev.preventDefault();
        const p = ev.shiftKey ? 10 : 1, d = { ArrowLeft: [-p, 0], ArrowRight: [p, 0], ArrowUp: [0, -p], ArrowDown: [0, p] }[ev.key];
        if (d) moverSel(d[0], d[1]);
      }
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  });

  // ── En vivo ──
  const postVivo = (cuerpo) => (id ? fetch(`/api/admin/disenos/${id}/vivo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente, ...cuerpo }) }).catch(() => {}) : null);
  function mandarCambios() {
    clearTimeout(temporizador.current); temporizador.current = null;
    const ops = diferencias(enviado.current, docRef.current);
    enviado.current = docRef.current;
    if (ops.length && hayOtros.current) postVivo({ tipo: 'cambios', ops });
  }
  function alVivo(m) {
    if (m.tipo === 'hola') {
      const otros = m.participantes.filter(x => x.cliente !== cliente);
      setVivos(otros); hayOtros.current = otros.length > 0; enviado.current = docRef.current;
    } else if (m.tipo === 'entra') {
      setVivos(v => [...v.filter(x => x.cliente !== m.cliente), m]); hayOtros.current = true;
      showToast?.(`${m.nombre} también está en este diseño: veréis al momento lo que cambia el otro.`);
      // Le paso cómo está ahora (con lo que aún no he guardado).
      if (m.responde === cliente) { mandarCambios(); postVivo({ tipo: 'estado', para: m.cliente, doc: docRef.current, nombre, tipoDiseno: tipo, sucio }); }
    } else if (m.tipo === 'sale') {
      setVivos(v => { const r = v.filter(x => x.cliente !== m.cliente); hayOtros.current = r.length > 0; return r; });
      setCursores(c => { const r = { ...c }; delete r[m.cliente]; return r; });
    } else if (m.tipo === 'estado') {
      docRef.current = m.doc; enviado.current = m.doc; setDoc(m.doc);
      if (m.nombre) setNombre(m.nombre);
      if (m.tipoDiseno) setTipo(m.tipoDiseno);
      setSucio(!!m.sucio); setHist({ atras: [], adelante: [] }); setSeleccion([]);
    } else if (m.tipo === 'cambios') {
      // Primero lo mío pendiente; luego lo suyo (también en los pasos de deshacer).
      mandarCambios();
      const n = aplicarOps(docRef.current, m.ops);
      docRef.current = n; enviado.current = n; setDoc(n); setSucio(true);
      setHist(h => ({ atras: h.atras.map(x => aplicarOps(x, m.ops, { sinReemplazo: true })), adelante: h.adelante.map(x => aplicarOps(x, m.ops, { sinReemplazo: true })) }));
    } else if (m.tipo === 'cursor') {
      setCursores(c => ({ ...c, [m.de]: { x: m.x, y: m.y, pagina: m.pagina, sel: m.sel } }));
    } else if (m.tipo === 'guardado') {
      setSucio(false); cargarRevision();
    }
  }
  function moverCursor(ev) {
    if (!hayOtros.current || !lienzoRef.current) return;
    const r = lienzoRef.current.getBoundingClientRect(), u = ultimoCursor.current;
    u.x = (ev.clientX - r.left) / escala; u.y = (ev.clientY - r.top) / escala;
    const ahora = performance.now();
    if (ahora - u.t < 80) return;
    u.t = ahora;
    postVivo({ tipo: 'cursor', x: Math.round(u.x), y: Math.round(u.y), pagina: paginaRef.current, sel: selRef.current });
  }
  useEffect(() => {
    if (!id || typeof EventSource === 'undefined') return undefined;
    const es = new EventSource(`/api/admin/disenos/${id}/vivo?cliente=${cliente}`);
    es.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } yo.current.alVivo(m); };
    // Al salir de la página (recargar, cerrar, irse), fuera de la sala: el navegador
    // puede guardar la página «congelada» y la conexión seguiría abierta.
    const salir = () => es.close();
    const volver = (ev) => { if (ev.persisted) window.location.reload(); };
    window.addEventListener('pagehide', salir); window.addEventListener('pageshow', volver);
    return () => { window.removeEventListener('pagehide', salir); window.removeEventListener('pageshow', volver); es.close(); clearTimeout(temporizador.current); };
  }, [id, cliente]);
  // Lo que cambio, a los demás (como mucho cada 90 ms).
  useEffect(() => {
    if (!id) return;
    if (!hayOtros.current) { enviado.current = doc; return; }
    if (!temporizador.current) temporizador.current = setTimeout(() => yo.current.mandarCambios(), 90);
  }, [doc, id]);
  // Lo que tengo elegido (y en qué página estoy), también.
  useEffect(() => {
    if (hayOtros.current) postVivo({ tipo: 'cursor', x: Math.round(ultimoCursor.current.x), y: Math.round(ultimoCursor.current.y), pagina, sel: seleccion });
  }, [seleccion, pagina]); // eslint-disable-line react-hooks/exhaustive-deps

  yo.current = { hacerZoom, leerCopia, pegarElementos, anadirImagen, anadirTexto, ventana, alVivo, mandarCambios };

  // ── Guardar y exportar ──
  async function guardar() {
    if (guardando) return;
    setGuardando(true);
    try {
      const mini = await miniatura(doc, ejemplo).catch(() => null);
      const body = { nombre, tipo, datos: doc, miniatura: mini };
      if (id) await api(`/api/admin/disenos/${id}`, { method: 'PUT', body });
      else { const r = await api('/api/admin/disenos', { method: 'POST', body }); setId(r.id); }
      setSucio(false); showToast?.('Diseño guardado.');
      cargarRevision();
      if (hayOtros.current) postVivo({ tipo: 'guardado' });
    } catch (e) { alert(e.message); } finally { setGuardando(false); }
  }
  async function exportar(formato, escalaExp = 1, sinFondo = false) {
    setVerExportar(false);
    try { await exportarDiseno(doc, formato, nombre, { variables: ejemplo, escala: escalaExp, sinFondo }); }
    catch (e) { alert(`No se ha podido exportar: ${e.message}`); }
  }
  function cerrar() { if (sucio && !window.confirm('Hay cambios sin guardar. ¿Salir sin guardarlos?')) return; onCerrar(); }
  function cambiarTamano(t, ajustar) {
    aplicarDoc(d => (ajustar ? adaptarDiseno(d, t.ancho, t.alto, ejemplo) : { ...d, ancho: t.ancho, alto: t.alto }));
    setVerTamano(false);
  }
  // ── Ver la animación en el lienzo ──
  function verAnimacion() {
    if (tiempo != null) { cancelAnimationFrame(anim.current); setTiempo(null); return; }
    if (edicion.current) document.activeElement?.blur?.();
    setSeleccion([]); setRecortando(null);
    const dur = duracionAnimacion(docRef.current), t0 = performance.now();
    const paso = () => {
      const t = (performance.now() - t0) / 1000;
      if (t > dur + 0.4) { setTiempo(null); return; }
      setTiempo(t); anim.current = requestAnimationFrame(paso);
    };
    anim.current = requestAnimationFrame(paso);
  }
  // ── Usar el diseño en otro sitio ──
  async function guardarSiHaceFalta() { if (sucio) await guardar(); }
  async function comoPlantilla() {
    setVerUsar(false);
    const n = window.prompt('Nombre de la plantilla (la verá todo el equipo al pulsar «Nuevo diseño»):', nombre);
    if (!n?.trim()) return;
    try {
      const mini = await miniatura(doc, ejemplo).catch(() => null);
      const { carpeta, ...datos } = doc; // eslint-disable-line no-unused-vars
      await api('/api/admin/disenos', { method: 'POST', body: { nombre: n.trim(), tipo, datos: { ...datos, esPlantilla: true }, miniatura: mini } });
      showToast?.('Guardada como plantilla del equipo: sale al pulsar «Nuevo diseño».');
    } catch (e) { alert(e.message); }
  }
  const usar = (v) => { setVerUsar(false); setVerExportar(false); setVentana(v); };
  // Publicar en redes: con la aprobación de la dirección (la dirección, directamente).
  const permisoRedes = !id ? { ok: false, motivo: 'Guarda el diseño y pide a la dirección que lo apruebe.' }
    : revision?.puedoAprobar ? { ok: true }
      : sucio ? { ok: false, motivo: 'Hay cambios sin guardar: guárdalos y, si hace falta, pide otra vez la aprobación.' }
        : revision?.estado === 'aprobado' ? { ok: true }
          : { ok: false, motivo: { pendiente: 'Está esperando la aprobación de la dirección.', cambios: 'La dirección ha pedido cambios: míralos en «Revisión».', cambiado: 'Se ha cambiado después de aprobarlo: hay que pedir otra vez la aprobación.' }[revision?.estado] || 'Antes de publicarlo, la dirección tiene que aprobarlo.' };
  async function pedirAprobacion(texto) {
    if (!id) return;
    if (sucio) await guardar();
    try { setRevision(await api(`/api/admin/disenos/${id}/revision`, { method: 'POST', body: { accion: 'pedir', texto } })); showToast?.('Pedida la aprobación a la dirección.'); }
    catch (e) { alert(e.message); }
  }

  const marco = { position: 'absolute', left: 0, top: 0, width: diseno.ancho * escala, height: diseno.alto * escala };
  const botonBarra = { font: 'inherit', fontSize: 13, fontWeight: 700, padding: '7px 11px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center' };
  const pendientes = (revision?.comentarios || []).filter(c => c.tipo === 'comentario' && !c.resuelto).length;
  const animada = tieneAnimacion(diseno);
  const cajaVarios = elegidos.length > 1 ? cajaDe(elegidos) : null;
  const recortada = recortando ? diseno.elementos.find(e => e.id === recortando) : null;
  const fantasma = (() => {
    // Al recortar (sin giro), la foto entera se ve tenue alrededor de su caja.
    const e = recortada, i = e && imagenes.get(e.url);
    if (!i || e.rot) return null;
    const iw = i.naturalWidth || i.width, ih = i.naturalHeight || i.height, enc = e.encuadre || { zoom: 1, x: 0.5, y: 0.5 };
    const k = Math.max(e.w / iw, e.h / ih) * Math.max(1, enc.zoom || 1), dw = iw * k, dh = ih * k;
    const dx = Math.min(e.x, Math.max(e.x + e.w - dw, e.x + e.w / 2 - (enc.x ?? 0.5) * dw)), dy = Math.min(e.y, Math.max(e.y + e.h - dh, e.y + e.h / 2 - (enc.y ?? 0.5) * dh));
    return { url: e.url, x: dx, y: dy, w: dw, h: dh };
  })();

  return (
    <KitMarca.Provider value={kitConFuentes}>
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--bg)', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      {/* Barra de arriba */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
        <button type="button" style={botonBarra} onClick={cerrar}>← Aim Design</button>
        <input value={nombre} onChange={e => { setNombre(e.target.value); setSucio(true); }} aria-label="Nombre del diseño" style={{ ...inp, width: 230, fontWeight: 700, fontSize: 14 }} />
        <select value={tipo} onChange={e => { setTipo(e.target.value); setSucio(true); }} aria-label="Tipo" style={{ ...inp, width: 'auto' }}>
          <option value="libre">Diseño</option><option value="diploma">Diploma del aula</option>
        </select>
        <button type="button" style={botonBarra} onClick={() => setVerTamano(true)} title="Cambiar el tamaño del lienzo">{tamanoTexto(diseno)}</button>
        {revision && revision.estado !== 'sin_pedir' && <EstadoRevision estado={revision.estado} onClick={() => setPanel('revision')} />}
        {vivos.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 6 }} title={`También aquí: ${vivos.map(v => v.nombre).join(', ')}`}>
            <div style={{ display: 'flex' }}>
              {vivos.map((v, i) => (
                <span key={v.cliente} aria-label={`${v.nombre} está en este diseño`} style={{ width: 28, height: 28, borderRadius: 99, background: v.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, border: '2px solid var(--bg-2)', marginLeft: i ? -8 : 0 }}>
                  {v.nombre.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase()}
                </span>
              ))}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>{vivos.length === 1 ? `${vivos[0].nombre.split(' ')[0]} también está aquí` : `${vivos.length} personas más aquí`}</span>
          </div>
        )}
        {doc.esPlantilla && (
          <label style={{ fontSize: 12, fontWeight: 800, color: 'var(--purple)', display: 'inline-flex', gap: 6, alignItems: 'center' }} title="Sale en «Nuevo diseño» para todo el equipo">
            <input type="checkbox" checked onChange={() => { if (window.confirm('¿Deja de ser una plantilla del equipo? (El diseño se queda.)')) aplicarDoc(d => { const { esPlantilla, ...resto } = d; return resto; }); }} /> ★ Plantilla del equipo
          </label>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" style={botonBarra} onClick={deshacer} disabled={!hist.atras.length} title="Deshacer (Ctrl+Z)">↶</button>
        <button type="button" style={botonBarra} onClick={rehacer} disabled={!hist.adelante.length} title="Rehacer (Ctrl+Y)">↷</button>
        <div style={{ position: 'relative' }}>
          <button type="button" style={botonBarra} onClick={() => { setVerExportar(v => !v); setVerUsar(false); }}><I.Download width={14} height={14} /> Exportar</button>
          {verExportar && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 5, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 6, display: 'grid', minWidth: 240 }}>
              {[['png', 1, 'PNG', paginas > 1 ? `Un archivo por página (${paginas})` : 'Con la mejor calidad'], ['png', 2, 'PNG al doble', `${diseno.ancho * 2} × ${diseno.alto * 2} px`],
                ['png', 1, 'PNG sin fondo', 'Transparente: para logos, pegatinas y montajes', true],
                ['jpg', 1, 'JPG', 'Pesa menos (redes, WhatsApp)'], ['pdf', 1, 'PDF', paginas > 1 ? `Las ${paginas} páginas, para ver o imprimir en casa` : 'Para ver o imprimir en casa']].map(([f, k, t, d, sinFondo]) => (
                <button key={`${f}${k}${t}`} type="button" onClick={() => exportar(f, k, !!sinFondo)} style={{ font: 'inherit', textAlign: 'left', padding: '8px 10px', border: 0, borderRadius: 8, background: 'none', color: 'var(--ink)', cursor: 'pointer', display: 'grid' }}>
                  <b style={{ fontSize: 13 }}>{t}</b><span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{d}</span>
                </button>
              ))}
              {[['imprenta', 'PDF de imprenta', 'A 300 ppp, con 3 mm de sangrado y marcas de corte'], ['animacion', 'GIF o vídeo', animada ? 'La página con su animación (historias)' : 'Primero, anima algo en «Animar»']].map(([k, t, d]) => (
                <button key={k} type="button" onClick={() => usar(k)} disabled={k === 'animacion' && !animada} style={{ font: 'inherit', textAlign: 'left', padding: '8px 10px', border: 0, borderRadius: 8, background: 'none', color: 'var(--ink)', cursor: 'pointer', display: 'grid', opacity: k === 'animacion' && !animada ? 0.55 : 1 }}>
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
                puedePublicar && ['redes', 'Publicar en redes', permisoRedes.ok ? (paginas > 1 ? `Un carrusel con las ${paginas} páginas, en Publicaciones` : 'Un borrador en Publicaciones, listo para Facebook e Instagram') : '🔒 Necesita la aprobación de la dirección'],
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

      <div style={{ position: 'relative', display: 'grid', minHeight: 0, gridTemplateColumns: `76px ${panelAbierto ? '300px' : '0px'} minmax(0, 1fr)` }}>
        {(
          <nav aria-label="Paneles" style={{ background: 'var(--bg-2)', borderRight: '1px solid var(--line)', display: 'grid', alignContent: 'start', gap: 2, padding: '10px 6px', overflowY: 'auto' }}>
            {PANELES_EDITOR.map(([k, t, icono]) => {
              const activo = panel === k && panelAbierto;
              return (
                <button key={k} type="button" aria-pressed={activo} title={activo ? `Cerrar «${t}»` : t}
                  onClick={() => { if (activo) setPanelAbierto(false); else { setPanel(k); setPanelAbierto(true); } }}
                  style={{ position: 'relative', font: 'inherit', display: 'grid', placeItems: 'center', gap: 4, padding: '9px 2px', borderRadius: 10, border: 0, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
                    background: activo ? 'color-mix(in oklab, var(--purple) 14%, var(--bg-2))' : 'none', color: activo ? 'var(--purple)' : 'var(--ink-2)' }}>
                  {icono}<span>{t}</span>
                  {k === 'revision' && pendientes > 0 && <span style={{ position: 'absolute', top: 4, right: 10, minWidth: 16, height: 16, borderRadius: 99, background: 'var(--orange)', color: '#fff', fontSize: 10, display: 'grid', placeItems: 'center' }}>{pendientes}</span>}
                </button>
              );
            })}
            <span style={{ height: 1, background: 'var(--line)', margin: '6px 8px' }} />
            <button type="button" title="Cómo se usa (atajos)" onClick={() => setVentana('ayuda')}
              style={{ font: 'inherit', display: 'grid', placeItems: 'center', gap: 4, padding: '9px 2px', borderRadius: 10, border: 0, cursor: 'pointer', fontSize: 10.5, fontWeight: 700, background: 'none', color: 'var(--ink-2)' }}>
              {icono(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" /><path d="M12 17h.01" /></>)}<span>Ayuda</span>
            </button>
          </nav>
        )}
        {/* Izquierda: añadir, estilos, fondo, capas, animar y revisión */}
        <aside style={{ borderRight: panelAbierto ? '1px solid var(--line)' : 0, background: 'var(--bg-2)', overflowY: 'auto', padding: panelAbierto ? 12 : 0, display: 'grid', gap: 10, alignContent: 'start', minWidth: 0 }}>
          {panelAbierto && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <b style={{ flex: 1, fontSize: 15 }}>{PANELES_EDITOR.find(x => x[0] === panel)?.[1]}</b>
              <button type="button" className="icon-btn" onClick={() => setPanelAbierto(false)} title="Cerrar el panel (más sitio para el diseño)" aria-label="Cerrar el panel">«</button>
            </div>
          )}
          {panelAbierto && <>
          {panel === 'anadir' && (
            <PanelAnadir tipo={tipo} kit={kit} anadirTexto={anadirTexto} anadirForma={anadirForma} anadirIcono={anadirIcono} anadirMarco={anadirMarco} anadirImagen={anadirImagen} anadirQr={anadirQr} anadirTabla={anadirTabla} anadirGrafico={anadirGrafico}
              anadirBloque={anadirBloque} verFotos={() => setVentana('fotos')} verBanco={() => setVentana('banco')} subir={subir} />
          )}
          {panel === 'estilos' && <PanelEstilos doc={doc} aplicarDoc={aplicarDoc} showToast={showToast} />}
          {panel === 'fondo' && <PanelFondo fondo={diseno.fondo || {}} cambiar={(f) => aplicar(d => ({ ...d, fondo: { ...d.fondo, ...f } }))} subir={subir} />}
          {panel === 'capas' && (
            <div style={{ display: 'grid', gap: 4 }}>
              {!diseno.elementos.length && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Aún no hay nada en esta página.</span>}
              {diseno.elementos.length > 0 && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Con Mayús, se eligen varios.</span>}
              {[...diseno.elementos].reverse().map(e => (
                <div key={e.id} onClick={(x) => (x.shiftKey ? setSeleccion(s => (s.includes(e.id) ? s.filter(y => y !== e.id) : [...s, e.id])) : setSel(e.id))}
                  style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                    background: seleccion.includes(e.id) ? 'color-mix(in oklab, var(--purple) 12%, var(--bg-2))' : 'var(--bg-3)', opacity: e.oculto ? 0.5 : 1,
                    borderLeft: e.grupo ? '3px solid var(--purple)' : '3px solid transparent' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etiquetaElemento(e)}</span>
                  {e.anim?.tipo && <span title="Animado" style={{ fontSize: 11 }}>✨</span>}
                  <button type="button" title={e.oculto ? 'Mostrar' : 'Ocultar'} onClick={(x) => { x.stopPropagation(); cambiarEl(e.id, { oculto: !e.oculto }); }} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-2)' }}>{e.oculto ? '🚫' : '👁'}</button>
                  <button type="button" title={e.bloqueado ? 'Desbloquear' : 'Bloquear'} onClick={(x) => { x.stopPropagation(); cambiarEl(e.id, { bloqueado: !e.bloqueado }); }} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-2)' }}>{e.bloqueado ? '🔒' : '🔓'}</button>
                </div>
              ))}
            </div>
          )}
          {panel === 'animar' && (
            <PanelAnimar doc={doc} diseno={diseno} elegido={elegido} tiempo={tiempo} onVer={verAnimacion} tramos={tramos}
              cambiarEl={(c) => elegido && cambiarEl(elegido.id, c)} aplicar={aplicar} aplicarDoc={aplicarDoc} onExportar={() => usar('animacion')} />
          )}
          {panel === 'revision' && (
            <PanelRevision id={id} revision={revision} setRevision={setRevision} sucio={sucio} guardar={guardar} pedir={pedirAprobacion}
              elegido={elegido} pagina={pagina} showToast={showToast}
              onIr={(c) => { if (c.pagina != null) irPagina(c.pagina); if (c.elementoId) setTimeout(() => setSel(c.elementoId), 0); }}
              onVolver={async (v) => {
                try {
                  if (!sucio) await api(`/api/admin/disenos/${id}/versiones`, { method: 'POST' });
                  const d = await api(`/api/admin/disenos/${id}/versiones/${v.id}`);
                  aplicarDoc(() => d.datos); setSeleccion([]); setPagina(0);
                  showToast?.('Has vuelto a esa versión. Guarda para quedarte con ella (Ctrl+Z lo deshace).');
                } catch (e) { alert(e.message); }
              }} />
          )}
          </>}
        </aside>

        {/* Centro: el lienzo y las páginas */}
        <div ref={zonaRef}
          onPointerDown={(ev) => {
            if (edicion.current) document.activeElement?.blur?.();
            setMenu(null);
            if (ev.button > 0 || tiempo != null) return;
            // En la barra de desplazamiento, nada.
            const sc = scrollRef.current;
            if (sc && ev.target === sc && (ev.nativeEvent.offsetX > sc.clientWidth || ev.nativeEvent.offsetY > sc.clientHeight)) return;
            setRecortando(null);
            arrastre.current = { modo: 'recuadro', x0: ev.clientX, y0: ev.clientY, shift: ev.shiftKey, movido: false };
          }}
          onContextMenu={(ev) => { ev.preventDefault(); if (tiempo == null) setMenu({ x: ev.clientX, y: ev.clientY }); }}
          onPointerMove={moverCursor}
          onDragOver={(ev) => { if ([...ev.dataTransfer.types].some(t => t === TIPO_ARRASTRE || t === 'Files')) { ev.preventDefault(); setSoltando(true); } }}
          onDragLeave={(ev) => { if (ev.currentTarget === ev.target) setSoltando(false); }}
          onDrop={soltar}
          style={{ position: 'relative', overflow: 'hidden', display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', justifyItems: 'center',
            background: 'repeating-conic-gradient(color-mix(in oklab, var(--ink) 4%, var(--bg)) 0% 25%, var(--bg) 0% 50%) 50% / 24px 24px',
            outline: soltando ? '3px dashed #7C5CFF' : 'none', outlineOffset: -6 }}>
          <div ref={scrollRef} style={{ overflow: 'auto', width: '100%', height: '100%', minHeight: 0 }}>
          <div style={{ display: 'grid', placeItems: 'center', minWidth: '100%', minHeight: '100%', width: 'max-content', height: 'max-content', padding: 40, boxSizing: 'border-box' }}>
          <div style={{ position: 'relative', width: diseno.ancho * escala, height: diseno.alto * escala, boxShadow: '0 10px 40px -10px rgba(0,0,0,.35)' }}>
            {fantasma && <div style={{ position: 'absolute', left: fantasma.x * escala, top: fantasma.y * escala, width: fantasma.w * escala, height: fantasma.h * escala, background: `center / 100% 100% no-repeat url(${fantasma.url})`, opacity: 0.35, pointerEvents: 'none' }} />}
            <canvas ref={lienzoRef} style={{ ...marco, width: diseno.ancho * escala, height: diseno.alto * escala, display: 'block' }} />
            <div style={marco}>
              {tiempo == null && diseno.elementos.map(e => (e.oculto ? null : (
                <div key={e.id} onPointerDown={(ev) => empezar(ev, e.id, 'mover')}
                  onContextMenu={(ev) => {
                    ev.preventDefault(); ev.stopPropagation();
                    if (!selRef.current.includes(e.id)) setSeleccion(conGrupo(vista().elementos, [e.id]));
                    setMenu({ x: ev.clientX, y: ev.clientY, id: e.id });
                  }}
                  onDoubleClick={(ev) => {
                    if (e.tipo === 'texto') editarTexto(e.id, { x: ev.clientX, y: ev.clientY });
                    else if (e.tipo === 'imagen' && e.url) recortar(e.id);
                    else if (e.grupo) setSel(e.id);
                  }}
                  title={e.id === sel && !e.bloqueado && !editando ? (e.tipo === 'texto' ? 'Doble clic para escribir' : e.tipo === 'imagen' && e.url ? 'Doble clic para recortar' : e.tipo === 'imagen' ? 'Suelta aquí una foto' : undefined) : undefined}
                  style={{ position: 'absolute', left: e.x * escala, top: e.y * escala, width: e.w * escala, height: e.h * escala, transform: `rotate(${e.rot || 0}deg)`,
                    cursor: e.bloqueado ? 'default' : recortando === e.id ? 'grab' : e.tipo === 'texto' && e.id === sel ? 'text' : 'move',
                    outline: seleccion.includes(e.id) && editando?.id !== e.id ? `2px ${recortando === e.id ? 'dashed' : 'solid'} #7C5CFF` : 'none', outlineOffset: 1, touchAction: 'none' }}>
                  {e.id === sel && !e.bloqueado && editando?.id !== e.id && recortando !== e.id && (
                    <>
                      {[[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]].filter(([hx, hy]) => (e.tipo === 'linea' ? hy === 0 : CUADRADOS_EDITOR.includes(e.tipo) ? hx && hy : true)).map(([hx, hy]) => (
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
              {ayudas.cuadricula && tiempo == null && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundSize: `${pasoRejilla * escala}px ${pasoRejilla * escala}px`,
                backgroundImage: 'linear-gradient(to right, rgba(124,92,255,.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(124,92,255,.22) 1px, transparent 1px)' }} />}
              {ayudas.margenes && tiempo == null && <div title="Margen de seguridad: lo importante, por dentro" style={{ position: 'absolute', pointerEvents: 'none', left: margenSeguro * escala, top: margenSeguro * escala, right: margenSeguro * escala, bottom: margenSeguro * escala, border: '1.5px dashed #FF5FA2' }} />}
              {tiempo == null && Object.entries(cursores).map(([cid, c]) => {
                const v = vivos.find(x => x.cliente === cid);
                if (!v || c.pagina !== pagina) return null;
                return (
                  <React.Fragment key={cid}>
                    {diseno.elementos.filter(e => c.sel?.includes(e.id)).map(e => (
                      <div key={e.id} style={{ position: 'absolute', pointerEvents: 'none', left: e.x * escala - 3, top: e.y * escala - 3, width: e.w * escala + 6, height: e.h * escala + 6, transform: `rotate(${e.rot || 0}deg)`, outline: `2px solid ${v.color}`, borderRadius: 3 }} />
                    ))}
                    <div style={{ position: 'absolute', left: c.x * escala, top: c.y * escala, pointerEvents: 'none', zIndex: 6, display: 'flex', alignItems: 'flex-start', transition: 'left .09s linear, top .09s linear' }}>
                      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M1 1l6 15 2-6 6-2z" fill={v.color} stroke="#fff" strokeWidth="1.2" /></svg>
                      <span style={{ background: v.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 6, marginTop: 12, whiteSpace: 'nowrap' }}>{v.nombre.split(' ')[0]}</span>
                    </div>
                  </React.Fragment>
                );
              })}
              {cajaVarios && tiempo == null && <div style={{ position: 'absolute', pointerEvents: 'none', left: cajaVarios.x * escala - 4, top: cajaVarios.y * escala - 4, width: cajaVarios.w * escala + 8, height: cajaVarios.h * escala + 8, border: '1.5px dashed #7C5CFF', borderRadius: 4 }} />}
              {guias.map((g, i) => <div key={i} style={{ position: 'absolute', pointerEvents: 'none', background: '#FF5FA2', ...(g.v != null ? { left: g.v * escala, top: 0, width: 1, height: '100%' } : { top: g.h * escala, left: 0, height: 1, width: '100%' }) }} />)}
              {editando && (() => {
                const el = diseno.elementos.find(x => x.id === editando.id);
                return el ? <TextoEnLienzo key={el.id} e={el} escala={escala} cursor={editando.cursor} onCambio={(texto) => cambiarEl(el.id, { texto }, { historia: false })} onFin={terminarTexto} /> : null;
              })()}
            </div>
          </div>
          </div>
          </div>
          {/* Las páginas, el zoom y las ayudas */}
          <div onPointerDown={ev => ev.stopPropagation()} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 10px', margin: '0 0 12px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--shadow)', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '95%' }}>
            {recortada ? <>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>✂ Arrastra la foto para encuadrarla · Zoom</span>
              <input type="range" min="1" max="4" step="0.05" value={recortada.encuadre?.zoom || 1} aria-label="Zoom de la foto"
                onPointerDown={tramos.empezar} onPointerUp={tramos.terminar}
                onChange={x => cambiarEl(recortada.id, { encuadre: { ...(recortada.encuadre || { x: 0.5, y: 0.5 }), zoom: Number(x.target.value) } })} />
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setRecortando(null)}>Hecho</button>
            </> : <>
            {Array.from({ length: paginas }, (_, i) => (
              <button key={i} type="button" onClick={() => irPagina(i)} aria-label={`Página ${i + 1}`} aria-current={i === pagina}
                style={{ minWidth: 30, height: 30, borderRadius: 8, cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 800, border: `2px solid ${i === pagina ? '#7C5CFF' : 'var(--line)'}`, background: i === pagina ? 'color-mix(in oklab, #7C5CFF 12%, var(--bg-2))' : 'var(--bg-3)', color: 'var(--ink)' }}>{i + 1}</button>
            ))}
            <button type="button" className="btn btn-sm btn-ghost" onClick={nuevaPagina} title="Añadir una página (carrusel, folleto de dos caras…)">＋ Página</button>
            {paginas > 1 && <>
              <span style={{ width: 1, height: 22, background: 'var(--line)' }} />
              <button type="button" className="btn btn-sm btn-ghost" disabled={pagina === 0} onClick={() => moverPagina(-1)} title="Moverla antes">◀</button>
              <button type="button" className="btn btn-sm btn-ghost" disabled={pagina === paginas - 1} onClick={() => moverPagina(1)} title="Moverla después">▶</button>
            </>}
            <button type="button" className="btn btn-sm btn-ghost" onClick={duplicarPagina} title="Duplicar esta página">⧉</button>
            {paginas > 1 && <button type="button" className="btn btn-sm btn-ghost" onClick={borrarPagina} title="Borrar esta página" style={{ color: 'var(--orange)' }}>🗑</button>}
            <span style={{ width: 1, height: 22, background: 'var(--line)' }} />
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => hacerZoom(-1)} title="Alejar (Ctrl -)" aria-label="Alejar">−</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => hacerZoom(0)} title="Que quepa entero (Ctrl 0)" style={{ minWidth: 56, fontVariantNumeric: 'tabular-nums' }}>{Math.round(escala * 100)} %</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => hacerZoom(1)} title="Acercar (Ctrl +, o Ctrl + rueda)" aria-label="Acercar">＋</button>
            <span style={{ width: 1, height: 22, background: 'var(--line)' }} />
            <button type="button" className={`btn btn-sm ${ayudas.cuadricula ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAyudas(a => ({ ...a, cuadricula: !a.cuadricula }))} title="Cuadrícula (lo que se mueve se pega a ella)">▦</button>
            <button type="button" className={`btn btn-sm ${ayudas.margenes ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAyudas(a => ({ ...a, margenes: !a.margenes }))} title={`Márgenes de seguridad (${enPapel ? '5 mm' : 'el 5 %'})`}>⬚</button>
            </>}
          </div>
          {menu && (
            <MenuContextual x={menu.x} y={menu.y} onCerrar={() => setMenu(null)} opciones={menu.id ? [
              ['Copiar', 'Ctrl+C', () => copiar()], ['Cortar', 'Ctrl+X', () => copiar(true)], leerCopia() && ['Pegar', 'Ctrl+V', () => pegarElementos(leerCopia())],
              ['Duplicar', 'Ctrl+D', duplicarSel], null,
              elegido?.tipo === 'texto' && !elegido.bloqueado && ['Escribir', 'Intro', () => editarTexto(elegido.id)],
              elegido?.tipo === 'imagen' && elegido.url && !elegido.bloqueado && ['Recortar', 'doble clic', () => recortar(elegido.id)],
              elegido?.tipo === 'imagen' && elegido.url && !elegido.bloqueado && ['Quitar el fondo', '', quitarFondoSel],
              ['Voltear en horizontal', '', () => voltear('h')], ['Voltear en vertical', '', () => voltear('v')],
              elegidos.length > 1 && (elegidos.every(e => e.grupo && e.grupo === elegidos[0].grupo) ? ['Desagrupar', 'Ctrl+Mayús+G', desagrupar] : ['Agrupar', 'Ctrl+G', agrupar]),
              ['Al frente', '', () => capa('frente')], ['Al fondo', '', () => capa('fondo')],
              elegidos.every(e => e.bloqueado) ? ['Desbloquear', '', () => cambiarVarios(seleccion, e => ({ ...e, bloqueado: false }))] : ['Bloquear', '', () => cambiarVarios(seleccion, e => ({ ...e, bloqueado: true }))],
              id && ['Comentar…', '', () => setPanel('revision')], null,
              ['Borrar', 'Supr', borrarSel, true],
            ] : [
              leerCopia() && ['Pegar', 'Ctrl+V', () => pegarElementos(leerCopia())],
              ['Elegir todo', 'Ctrl+A', () => setSeleccion(diseno.elementos.filter(e => !e.oculto && !e.bloqueado).map(e => e.id))],
              ['Añadir una página', '', nuevaPagina], null,
              [ayudas.cuadricula ? 'Quitar la cuadrícula' : 'Ver la cuadrícula', '', () => setAyudas(a => ({ ...a, cuadricula: !a.cuadricula }))],
              [ayudas.margenes ? 'Quitar los márgenes' : 'Ver los márgenes de seguridad', '', () => setAyudas(a => ({ ...a, margenes: !a.margenes }))],
              zoom && ['Que quepa entero', 'Ctrl+0', () => hacerZoom(0)],
            ]} />
          )}
          {procesando && <div role="status" style={{ position: 'fixed', left: '50%', top: 80, transform: 'translateX(-50%)', zIndex: 96, background: 'var(--ink)', color: 'var(--bg)', borderRadius: 999, padding: '9px 18px', fontSize: 13.5, fontWeight: 700, boxShadow: 'var(--shadow)' }}>⏳ {procesando}</div>}
          {recuadro && <div style={{ position: 'fixed', left: recuadro.x, top: recuadro.y, width: recuadro.w, height: recuadro.h, border: '1px solid #7C5CFF', background: 'rgba(124,92,255,.1)', pointerEvents: 'none', zIndex: 4 }} />}
        </div>

        {/* Derecha: lo que se puede cambiar */}
        {elegidos.length > 0 && (
        <aside onPointerDown={ev => ev.stopPropagation()}
          style={{ position: 'absolute', right: 14, top: 14, bottom: 14, width: 300, zIndex: 20, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: '0 12px 40px -12px rgba(0,0,0,.35)', overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -6 }}>
            <button type="button" className="icon-btn" onClick={() => setSeleccion([])} title="Cerrar (deja de elegir)" aria-label="Cerrar las propiedades"><I.X /></button>
          </div>
          {elegidos.length > 1 ? (
            <PanelVarios elegidos={elegidos} voltear={voltear} agrupar={agrupar} desagrupar={desagrupar} alinear={alinearVarios} repartir={repartir}
              duplicar={duplicarSel} borrar={borrarSel} capa={capa} bloquear={(b) => cambiarVarios(seleccion, e => ({ ...e, bloqueado: b }))} />
          ) : (
            <Propiedades e={elegido} tipo={tipo} cambiar={(c) => cambiarEl(elegido.id, c)} textoRef={textoRef} subir={subir} tramos={tramos} voltear={voltear}
              onEscribir={() => editarTexto(elegido.id)} onRecortar={() => (recortando ? setRecortando(null) : recortar(elegido.id))} recortando={recortando === elegido.id} onQuitarFondo={quitarFondoSel}
              verFotos={() => setVentana('fotos')} onFuentesCambiadas={setFuentesClub}
              acciones={{ duplicar: duplicarSel, borrar: borrarSel, capa, alinear }} />
          )}
        </aside>
        )}
      </div>

      {verTamano && (
        <Ventana titulo="Cambiar el tamaño del lienzo" onCerrar={() => setVerTamano(false)}>
          <CambiarTamano actual={diseno} onElegir={cambiarTamano} />
        </Ventana>
      )}
      {ventana === 'redes' && <PublicarEnRedes doc={doc} pagina={pagina} ejemplo={ejemplo} permiso={permisoRedes} estado={revision?.estado} onPedir={pedirAprobacion}
        onRevision={() => { setVentana(null); setPanel('revision'); }} onCerrar={() => setVentana(null)}
        onHecho={async (pid) => { await guardarSiHaceFalta().catch(() => {}); go(`/admin/publicaciones?abrir=${pid}`); }} />}
      {ventana === 'tamanos' && <OtrosTamanos diseno={doc} nombre={nombre} tipo={tipo} ejemplo={ejemplo} showToast={showToast} onCerrar={() => setVentana(null)} />}
      {ventana === 'lote' && <DiplomasEnLote diseno={doc} nombre={nombre} onCerrar={() => setVentana(null)} />}
      {ventana === 'biblioteca' && <ParaCorreosYNoticias diseno={diseno} nombre={nombre} ejemplo={ejemplo} onCerrar={() => setVentana(null)} />}
      {ventana === 'imprenta' && <ParaImprenta doc={doc} nombre={nombre} ejemplo={ejemplo} onCerrar={() => setVentana(null)} />}
      {ventana === 'animacion' && <ExportarAnimacion diseno={diseno} nombre={nombre} onCerrar={() => setVentana(null)} />}
      {ventana === 'ayuda' && (
        <Ventana titulo="Cómo se usa" onCerrar={() => setVentana(null)} ancho={560}>
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)', display: 'grid', gap: 10 }}>
              <span>Pulsa algo del lienzo para cambiarlo. Arrástralo para moverlo, tira de los cuadraditos para el tamaño y del círculo de arriba para girarlo.</span>
              <span>Varios a la vez: con Mayús + clic o arrastrando un recuadro desde un hueco. Doble clic en un texto para escribir y en una foto para recortarla. Las fotos del panel (o del ordenador) se pueden soltar encima de un marco.</span>
              <span>Atajos: Ctrl+C / Ctrl+X / Ctrl+V copian, cortan y pegan (también imágenes y textos del ordenador), Supr borra, Ctrl+D duplica, Ctrl+G agrupa (con Mayús, desagrupa), Ctrl+A elige todo, Ctrl+Z deshace, las flechas mueven (con Mayús, de 10 en 10), Ctrl+S guarda. Zoom: Ctrl + rueda, Ctrl + y Ctrl −. Con el botón derecho, más opciones.</span>
              {tipo === 'diploma' && <span style={{ color: 'var(--purple)' }}>Es un diploma: los huecos ({'{alumno}'}, {'{curso}'}…) se ven con datos de ejemplo y a cada alumno le salen los suyos.</span>}
          </div>
        </Ventana>
      )}
      {ventana === 'banco' && <FotosDeBanco onCerrar={() => setVentana(null)} onElegir={(f) => { setVentana(null); anadirImagen(f.url, f.ancho, f.alto); }} />}
      {ventana === 'fotos' && <FotosDelClub onCerrar={() => setVentana(null)} onElegir={(f) => { setVentana(null); anadirImagen(`/api/admin/disenos/foto-club/${f.id}/grande`, f.ancho, f.alto); }} />}
    </div>
    </KitMarca.Provider>
  );
}
const CUADRADOS_EDITOR = ['qr', 'icono'];
const icono = (d) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const PANELES_EDITOR = [
  ['anadir', 'Añadir', icono(<><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></>)],
  ['estilos', 'Estilos', icono(<><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="7.5" r="1" /></>)],
  ['fondo', 'Fondo', icono(<><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></>)],
  ['capas', 'Capas', icono(<><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>)],
  ['animar', 'Animar', icono(<><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l6-3.5-6-3.5z" /></>)],
  ['revision', 'Revisión', icono(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />)],
];

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

function PanelAnadir({ tipo, kit, anadirTexto, anadirForma, anadirIcono, anadirMarco, anadirImagen, anadirQr, anadirTabla, anadirGrafico, anadirBloque, verFotos, verBanco, subir }) {
  const [subidas, setSubidas] = useState(null);
  const [qr, setQr] = useState('');
  const [mas, setMas] = useState({});
  useEffect(() => { api('/api/admin/correo/imagenes').then(d => setSubidas(Array.isArray(d) ? d : d.imagenes || [])).catch(() => setSubidas([])); }, []);
  const bloque = { font: 'inherit', cursor: 'pointer', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', textAlign: 'left' };
  const cuadro = { ...bloque, display: 'grid', placeItems: 'center', padding: 6, height: 44, textAlign: 'center' };
  const svg = (html) => <span style={{ width: 26, height: 26, display: 'block' }} dangerouslySetInnerHTML={{ __html: html.replace('<svg ', '<svg width="100%" height="100%" ') }} />;
  const verTodo = (k, t) => !mas[k] && <button type="button" className="btn btn-sm btn-ghost" style={{ fontSize: 12, justifySelf: 'start' }} onClick={() => setMas(m => ({ ...m, [k]: true }))}>{t}</button>;
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
        {(mas.formas ? FIGURAS : FIGURAS.slice(0, 9)).map(f => (
          <button key={f.id} type="button" style={{ ...cuadro, color: '#5233A8' }} title={f.nombre} aria-label={f.nombre} onClick={() => anadirForma(f.id)}>{svg(svgFigura(f.id))}</button>
        ))}
        <button type="button" style={cuadro} onClick={() => anadirForma('linea')} title="Línea" aria-label="Línea"><span style={{ display: 'inline-block', width: 26, height: 3, background: 'var(--ink)' }} /></button>
      </div>
      {verTodo('formas', `Ver todas las formas (${FIGURAS.length})`)}

      <div style={seccionT}>Tablas y gráficos</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
        <button type="button" style={{ ...cuadro, height: 50 }} onClick={() => anadirTabla()} title="Tabla" aria-label="Tabla">
          <svg viewBox="0 0 30 22" width="30" height="22"><rect x="1" y="1" width="28" height="20" rx="3" fill="none" stroke="#5233A8" strokeWidth="1.6" /><rect x="1" y="1" width="28" height="6" rx="2" fill="#5233A8" /><path d="M1 14h28M11 7v14M20 7v14" stroke="#5233A8" strokeWidth="1.2" /></svg>
        </button>
        {CLASES_GRAFICO.map(([k, t]) => (
          <button key={k} type="button" style={{ ...cuadro, height: 50 }} onClick={() => anadirGrafico(k)} title={`Gráfico de ${t.toLowerCase()}`} aria-label={`Gráfico de ${t.toLowerCase()}`}>
            <svg viewBox="0 0 30 22" width="30" height="22">{{
              columnas: <><rect x="3" y="10" width="6" height="11" fill="#5233A8" /><rect x="12" y="4" width="6" height="17" fill="#FF5FA2" /><rect x="21" y="13" width="6" height="8" fill="#F99B35" /></>,
              barras: <><rect x="2" y="2" width="22" height="5" fill="#5233A8" /><rect x="2" y="9" width="14" height="5" fill="#FF5FA2" /><rect x="2" y="16" width="26" height="5" fill="#F99B35" /></>,
              circular: <><circle cx="15" cy="11" r="10" fill="#5233A8" /><path d="M15 11V1a10 10 0 0 1 9.5 13z" fill="#FF5FA2" /></>,
              anillo: <><circle cx="15" cy="11" r="10" fill="none" stroke="#5233A8" strokeWidth="5" /><path d="M15 1a10 10 0 0 1 9.5 13" fill="none" stroke="#FF5FA2" strokeWidth="5" /></>,
              lineas: <path d="M2 18l8-8 6 5 12-12" fill="none" stroke="#5233A8" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />,
            }[k]}</svg>
          </button>
        ))}
      </div>

      <div style={seccionT}>Iconos</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
        {(mas.iconos ? ICONOS : ICONOS.slice(0, 12)).map(i => (
          <button key={i.id} type="button" style={{ ...cuadro, height: 38, color: '#5233A8' }} title={i.nombre} aria-label={i.nombre} onClick={() => anadirIcono(i.id)}>
            <svg viewBox="0 0 24 24" width="22" height="22"><path d={i.d} fill="currentColor" /></svg>
          </button>
        ))}
      </div>
      {verTodo('iconos', `Ver todos los iconos (${ICONOS.length})`)}

      <div style={seccionT}>Actividades del club</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
        {ICONOS_ACTIVIDAD.map(a => (
          <button key={a.icono} type="button" style={{ ...cuadro, padding: 3 }} title={`${a.nombre} (arrástralo o pulsa)`} onClick={() => anadirImagen(a.icono)} {...arrastrable(a.icono)}>
            <img src={a.icono} alt={a.nombre} style={{ maxWidth: '100%', maxHeight: 36, borderRadius: 6 }} draggable={false} />
          </button>
        ))}
      </div>
      {mas.submarcas ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 5 }}>
          {ICONOS_ACTIVIDAD.map(a => (
            <button key={a.logo} type="button" style={{ ...cuadro, height: 54 }} title={`Logo de ${a.nombre}`} onClick={() => anadirImagen(a.logo)} {...arrastrable(a.logo)}>
              <img src={a.logo} alt={`Logo de ${a.nombre}`} style={{ maxWidth: '95%', maxHeight: 44 }} draggable={false} />
            </button>
          ))}
        </div>
      ) : verTodo('submarcas', 'Ver el logo de cada actividad')}

      <div style={seccionT}>Marcos para fotos</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
        {MARCOS.map(m => (
          <button key={m} type="button" style={{ ...cuadro, color: '#B9AEDF' }} title={`Marco: ${FIGURAS.find(f => f.id === m)?.nombre}`} aria-label={`Marco ${FIGURAS.find(f => f.id === m)?.nombre}`} onClick={() => anadirMarco(m)}>{svg(svgFigura(m))}</button>
        ))}
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Suelta encima una foto (del panel o del ordenador) y se recorta con su forma.</span>

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

      <DatosDelClub anadirBloque={anadirBloque} anadirTabla={anadirTabla} kit={kit} />

      <div style={seccionT}>Imágenes</div>
      <BotonSubir texto="⬆ Subir una imagen" onArchivo={(f) => subir(f, (r) => anadirImagen(r.url, r.ancho, r.alto))} />
      <button type="button" className="btn btn-sm btn-outline" onClick={verFotos} title="Las de la galería en las que todos los que salen tienen permiso de fotos">📷 Fotos del club</button>
      <button type="button" className="btn btn-sm btn-outline" onClick={verBanco} title="Fotos de dominio público: gratis y sin citar a nadie">🔎 Fotos de banco (gratis)</button>
      <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>La marca</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[...(kit?.logo && !LOGOS_MARCA.some(([u]) => u === kit.logo) ? [[kit.logo, 'Logo de los correos']] : []), ...LOGOS_MARCA].map(([u, t, oscuro]) => (
          <button key={u} type="button" style={{ ...bloque, display: 'grid', placeItems: 'center', height: 56, ...(oscuro ? { background: '#2a2a2a' } : {}) }} onClick={() => anadirImagen(u)} title={t} {...arrastrable(u)}><img src={u} alt={t} style={{ maxWidth: '90%', maxHeight: 40 }} draggable={false} /></button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {PEGATINAS.map((u, i) => <button key={u} type="button" style={{ ...bloque, display: 'grid', placeItems: 'center', height: 64, padding: 4 }} onClick={() => anadirImagen(u)} title={`Pegatina ${i + 1}`} {...arrastrable(u)}><img src={u} alt={`Pegatina ${i + 1}`} style={{ maxWidth: '100%', maxHeight: 54 }} draggable={false} /></button>)}
      </div>
      {subidas?.length > 0 && (
        <>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Ya subidas (arrástralas o pulsa)</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {subidas.slice(0, mas.subidas ? 120 : 30).map(x => (
              <button key={x.id} type="button" onClick={() => anadirImagen(x.url, x.ancho, x.alto)} title={x.nombre || ''} {...arrastrable(x.url, x.ancho, x.alto)}
                style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 0, aspectRatio: '1', background: `center / cover no-repeat url(${x.url}?w=320), var(--bg-3)`, cursor: 'pointer' }} />
            ))}
          </div>
          {subidas.length > 30 && verTodo('subidas', `Ver más (${subidas.length})`)}
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

// Un deslizador: lo que cambia mientras se arrastra es un solo paso de deshacer.
function Rango({ etiqueta, valor, min, max, paso = 1, onCambio, tramos, sufijo = '' }) {
  return (
    <label style={etq}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>{etiqueta}<span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>{Math.round((valor ?? 0) * 100) / 100}{sufijo}</span></span>
      <input type="range" min={min} max={max} step={paso} value={valor ?? 0} onPointerDown={tramos?.empezar} onPointerUp={tramos?.terminar} onChange={e => onCambio(Number(e.target.value))} />
    </label>
  );
}
const casillaEstilo = { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, fontWeight: 700 };

// La letra: las de siempre y las que sube el club.
function ElegirFuente({ e, cambiar, onFuentesCambiadas }) {
  const kit = useContext(KitMarca);
  const propias = kit?.fuentes || [];
  const [subiendo, setSubiendo] = useState(false);
  async function subirFuente(f) {
    const nombre = window.prompt('¿Cómo se llama esta letra? (Así saldrá en la lista.)', f.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' '));
    if (!nombre?.trim()) return;
    setSubiendo(true);
    try {
      const r = await fetch(`/api/admin/disenos/fuentes?nombre=${encodeURIComponent(nombre.trim())}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido subir la letra.');
      await cargarFuentePropia(d.fuente.nombre, d.fuente.url);
      onFuentesCambiadas?.([...propias, d.fuente]);
      cambiar({ fuente: d.fuente.nombre, fuenteUrl: d.fuente.url });
    } catch (x) { alert(x.message); } finally { setSubiendo(false); }
  }
  const valor = e.fuente || 'Montserrat';
  return (
    <div style={etq}>
      <span>Fuente</span>
      <select value={valor} aria-label="Fuente" style={{ ...inp, fontFamily: `"${valor}"` }}
        onChange={x => { const p = propias.find(f => f.nombre === x.target.value); cambiar(p ? { fuente: p.nombre, fuenteUrl: p.url } : { fuente: x.target.value, fuenteUrl: undefined }); }}>
        <optgroup label="Las de siempre">{FUENTES_DISENO.map(f => <option key={f.id} value={f.id} style={{ fontFamily: `"${f.id}"` }}>{f.nombre}</option>)}</optgroup>
        {propias.length > 0 && <optgroup label="Las del club">{propias.map(f => <option key={f.id} value={f.nombre} style={{ fontFamily: `"${f.nombre}"` }}>{f.nombre}</option>)}</optgroup>}
        {e.fuenteUrl && !propias.some(f => f.nombre === valor) && <option value={valor}>{valor}</option>}
      </select>
      <label className="btn btn-sm btn-ghost" style={{ justifySelf: 'start', cursor: 'pointer', position: 'relative', fontSize: 12 }}>
        {subiendo ? 'Subiendo…' : '⬆ Subir una letra (TTF, OTF, WOFF)'}
        <input type="file" accept=".ttf,.otf,.woff,.woff2" disabled={subiendo} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
          onChange={x => { const f = x.target.files?.[0]; x.target.value = ''; if (f) subirFuente(f); }} />
      </label>
    </div>
  );
}

// La sombra (de cualquier cosa): color, transparencia, hacia dónde y cuánto difumina.
function ControlesSombra({ e, cambiar, tramos }) {
  return (
    <div style={{ display: 'grid', gap: 8, paddingLeft: 10, borderLeft: '2px solid var(--line)' }}>
      <Color etiqueta="Color de la sombra" valor={e.sombraColor || '#000000'} onCambio={(v) => cambiar({ sombraColor: v })} />
      <Rango etiqueta="Intensidad" valor={Math.round((e.sombraOpacidad ?? 0.28) * 100)} min={5} max={100} onCambio={(v) => cambiar({ sombraOpacidad: v / 100 })} tramos={tramos} sufijo=" %" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Rango etiqueta="A los lados" valor={e.sombraX ?? 0} min={-80} max={80} onCambio={(v) => cambiar({ sombraX: v })} tramos={tramos} />
        <Rango etiqueta="Abajo" valor={e.sombraY ?? 8} min={-80} max={80} onCambio={(v) => cambiar({ sombraY: v })} tramos={tramos} />
      </div>
      <Rango etiqueta="Difuminado" valor={e.sombraDifu ?? 24} min={0} max={150} onCambio={(v) => cambiar({ sombraDifu: v })} tramos={tramos} />
    </div>
  );
}

// Efectos de texto: contorno, sombra de color (neón), fondo detrás y curva.
function EfectosTexto({ e, cambiar, tramos }) {
  const T = e.tamano || 48;
  const estilos = [
    ['Ninguno', { sombra: false, contorno: null, contornoGrosor: 0, resalte: null, curva: 0 }],
    ['Sombra', { sombra: true, sombraColor: '#000000', sombraOpacidad: 0.35, sombraX: Math.round(T * 0.05), sombraY: Math.round(T * 0.08), sombraDifu: Math.round(T * 0.12) }],
    ['Neón', { sombra: true, sombraColor: e.color && e.color !== 'transparent' ? e.color : '#FF5FA2', sombraOpacidad: 0.95, sombraX: 0, sombraY: 0, sombraDifu: Math.round(T * 0.45) }],
    ['Contorno', { contorno: '#1A1A1A', contornoGrosor: Math.max(1, Math.round(T * 0.05)) }],
    ['Fondo', { resalte: '#FFD526', resalteMargen: Math.round(T * 0.3) }],
    ['Curvo', { curva: 45 }],
  ];
  return (
    <>
      <div style={seccionT}>Efectos</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {estilos.map(([t, c]) => <button key={t} type="button" className="btn btn-sm btn-outline" style={{ padding: '4px 6px', fontSize: 12 }} onClick={() => cambiar(c)}>{t}</button>)}
      </div>
      <label style={casillaEstilo}><input type="checkbox" checked={!!e.contorno && e.contornoGrosor > 0} onChange={x => cambiar(x.target.checked ? { contorno: e.contorno || '#1A1A1A', contornoGrosor: e.contornoGrosor || Math.max(1, Math.round(T * 0.05)) } : { contornoGrosor: 0 })} /> Contorno</label>
      {!!e.contorno && e.contornoGrosor > 0 && (
        <div style={{ display: 'grid', gap: 8, paddingLeft: 10, borderLeft: '2px solid var(--line)' }}>
          <Color etiqueta="Color del contorno" valor={e.contorno} onCambio={(v) => cambiar({ contorno: v })} />
          <Rango etiqueta="Grosor" valor={e.contornoGrosor} min={1} max={Math.max(20, Math.round(T * 0.25))} onCambio={(v) => cambiar({ contornoGrosor: v })} tramos={tramos} />
        </div>
      )}
      <label style={casillaEstilo}><input type="checkbox" checked={!!e.sombra} onChange={x => cambiar({ sombra: x.target.checked })} /> Sombra</label>
      {e.sombra && <ControlesSombra e={e} cambiar={cambiar} tramos={tramos} />}
      <label style={casillaEstilo}><input type="checkbox" checked={!!e.resalte && e.resalte !== 'transparent'} onChange={x => cambiar({ resalte: x.target.checked ? '#FFD526' : null })} /> Fondo detrás del texto</label>
      {!!e.resalte && e.resalte !== 'transparent' && (
        <div style={{ display: 'grid', gap: 8, paddingLeft: 10, borderLeft: '2px solid var(--line)' }}>
          <Color etiqueta="Color del fondo" valor={e.resalte} onCambio={(v) => cambiar({ resalte: v })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Rango etiqueta="Margen" valor={Math.round(e.resalteMargen ?? T * 0.3)} min={0} max={Math.round(T * 1.2)} onCambio={(v) => cambiar({ resalteMargen: v })} tramos={tramos} />
            <Rango etiqueta="Redondeo" valor={Math.round(e.resalteRadio ?? (e.resalteMargen ?? T * 0.3) * 0.6)} min={0} max={Math.round(T)} onCambio={(v) => cambiar({ resalteRadio: v })} tramos={tramos} />
          </div>
        </div>
      )}
      <Rango etiqueta="Curva (0, recto)" valor={e.curva || 0} min={-100} max={100} onCambio={(v) => cambiar({ curva: Math.abs(v) < 3 ? 0 : v })} tramos={tramos} />
      {!!e.curva && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>El texto curvo va en una sola línea. Negativo: hacia abajo, como una sonrisa.</span>}
    </>
  );
}

// Filtros de una foto: los listos y a mano.
const FILTROS_LISTOS = [['Original', {}], ['B/N', { bn: true, contraste: 10 }], ['Vivo', { saturacion: 35, contraste: 15 }], ['Cálido', { calidez: 35, saturacion: 10 }],
  ['Frío', { calidez: -35 }], ['Sepia', { sepia: true }], ['Suave', { brillo: 10, contraste: -15, saturacion: -15 }], ['Intenso', { contraste: 35, brillo: -5 }]];
function FiltrosFoto({ e, cambiar, tramos }) {
  const f = e.filtros || {};
  const pon = (c) => cambiar({ filtros: { ...f, ...c } });
  return (
    <>
      <div style={seccionT}>Filtros</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {FILTROS_LISTOS.map(([t, c]) => <button key={t} type="button" className="btn btn-sm btn-outline" style={{ padding: '4px 4px', fontSize: 11.5 }} onClick={() => cambiar({ filtros: c })}>{t}</button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Rango etiqueta="Brillo" valor={f.brillo || 0} min={-100} max={100} onCambio={(v) => pon({ brillo: v })} tramos={tramos} />
        <Rango etiqueta="Contraste" valor={f.contraste || 0} min={-100} max={100} onCambio={(v) => pon({ contraste: v })} tramos={tramos} />
        <Rango etiqueta="Saturación" valor={f.saturacion || 0} min={-100} max={100} onCambio={(v) => pon({ saturacion: v })} tramos={tramos} />
        <Rango etiqueta="Calidez" valor={f.calidez || 0} min={-100} max={100} onCambio={(v) => pon({ calidez: v })} tramos={tramos} />
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <label style={casillaEstilo}><input type="checkbox" checked={!!f.bn} onChange={x => pon({ bn: x.target.checked })} /> Blanco y negro</label>
        <label style={casillaEstilo}><input type="checkbox" checked={!!f.sepia} onChange={x => pon({ sepia: x.target.checked })} /> Sepia</label>
      </div>
    </>
  );
}

function Propiedades({ e, tipo, cambiar, textoRef, subir, acciones, onEscribir, onRecortar, recortando, verFotos, onFuentesCambiadas, tramos, voltear, onQuitarFondo }) {
  const fila = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'start' };
  const alinearBtn = (k, t, titulo) => <button key={k} type="button" className="btn btn-sm btn-ghost" title={titulo} onClick={() => acciones.alinear(k)} style={{ padding: '4px 6px' }}>{t}</button>;
  const nombre = e.tipo === 'forma' ? FIGURAS.find(f => f.id === e.figura)?.nombre || 'Forma' : e.tipo === 'imagen' && !e.url ? 'Marco para una foto' : NOMBRE_TIPO[e.tipo];
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b style={{ flex: 1 }}>{nombre}{e.grupo ? ' (de un grupo)' : ''}</b>
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
        <ElegirFuente e={e} cambiar={cambiar} onFuentesCambiadas={onFuentesCambiadas} />
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
        <EfectosTexto e={e} cambiar={cambiar} tramos={tramos} />
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

      {e.tipo === 'tabla' && <EditorTabla e={e} cambiar={cambiar} />}
      {e.tipo === 'grafico' && <EditorGrafico e={e} cambiar={cambiar} />}

      {e.tipo === 'icono' && <>
        <Color etiqueta="Color" valor={e.color || '#1A1A1A'} onCambio={(v) => cambiar({ color: v })} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
          {ICONOS.map(i => (
            <button key={i.id} type="button" title={i.nombre} aria-label={i.nombre} onClick={() => cambiar({ icono: i.id })}
              style={{ height: 34, borderRadius: 8, cursor: 'pointer', display: 'grid', placeItems: 'center', border: `1px solid ${e.icono === i.id ? 'var(--purple)' : 'var(--line)'}`, background: 'var(--bg-3)', color: 'var(--ink)' }}>
              <svg viewBox="0 0 24 24" width="18" height="18"><path d={i.d} fill="currentColor" /></svg>
            </button>
          ))}
        </div>
      </>}

      {e.tipo === 'imagen' && <>
        {!e.url ? (
          <div style={{ display: 'grid', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' }}>
            <span>Un marco vacío: suelta encima una foto del panel o del ordenador, o elígela aquí.</span>
            <BotonSubir texto="⬆ Subir una foto" onArchivo={(f) => subir(f, (r) => cambiar({ url: r.url, encuadre: null, ajuste: 'cubrir' }))} />
            <button type="button" className="btn btn-sm btn-outline" onClick={verFotos}>📷 Fotos del club</button>
          </div>
        ) : <>
          <BotonSubir texto="Cambiar la imagen" onArchivo={(f) => subir(f, (r) => cambiar({ url: r.url, encuadre: null }))} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className={`btn btn-sm ${recortando ? 'btn-primary' : 'btn-outline'}`} onClick={onRecortar}>{recortando ? '✓ Terminar de recortar' : '✂ Recortar'}</button>
            {e.encuadre && !recortando && <button type="button" className="btn btn-sm btn-ghost" onClick={() => cambiar({ encuadre: null })}>Quitar el recorte</button>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={onQuitarFondo} title="Deja solo lo que destaca (una persona, un objeto). Se hace en el navegador, gratis.">✨ Quitar el fondo</button>
            {e.conFondo && <button type="button" className="btn btn-sm btn-ghost" onClick={() => cambiar({ url: e.conFondo, conFondo: undefined })}>↩ Recuperar el fondo</button>}
          </div>
          {recortando && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Arrastra la foto dentro de su caja y usa el zoom de abajo. Cambia la caja de tamaño para recortarla más.</span>}
        </>}
        <div style={seccionT}>Marco</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
          {MARCOS.map(m => (
            <button key={m} type="button" title={FIGURAS.find(f => f.id === m)?.nombre} onClick={() => cambiar({ marco: m, ...(m !== 'rect' && !e.encuadre ? { ajuste: 'cubrir' } : {}) })}
              style={{ height: 34, borderRadius: 8, cursor: 'pointer', padding: 4, display: 'grid', placeItems: 'center', border: `2px solid ${(e.marco || 'rect') === m ? 'var(--purple)' : 'var(--line)'}`, background: 'var(--bg-3)', color: '#9C91C7' }}>
              <span style={{ width: 20, height: 20, display: 'block' }} dangerouslySetInnerHTML={{ __html: svgFigura(m).replace('<svg ', '<svg width="100%" height="100%" ') }} />
            </button>
          ))}
        </div>
        {!e.encuadre && e.url && (
          <label style={etq}>Cómo se ve en su caja
            <select value={e.ajuste || 'contener'} onChange={x => cambiar({ ajuste: x.target.value })} style={inp}>
              <option value="contener">Entera</option><option value="cubrir">Llenando la caja (recorta)</option><option value="estirar">Estirada</option>
            </select>
          </label>
        )}
        {(e.marco || 'rect') === 'rect' && <Num etiqueta="Esquinas redondeadas" valor={e.radio || 0} onCambio={(v) => cambiar({ radio: Math.max(0, v) })} min={0} />}
        <div style={fila}>
          <Color etiqueta="Borde" valor={e.borde || '#FFFFFF'} onCambio={(v) => cambiar({ borde: v })} />
          <Num etiqueta="Grosor del borde" valor={e.grosor || 0} onCambio={(v) => cambiar({ grosor: Math.max(0, v) })} min={0} />
        </div>
        {e.url && <FiltrosFoto e={e} cambiar={cambiar} tramos={tramos} />}
      </>}

      {(e.tipo === 'rect' || e.tipo === 'elipse' || e.tipo === 'forma') && <>
        {e.tipo === 'forma' && (
          <label style={etq}>Forma
            <select value={e.figura} onChange={x => cambiar({ figura: x.target.value })} style={inp}>
              {FIGURAS.filter(f => f.id !== 'rect' && f.id !== 'elipse').map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </label>
        )}
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
        <Num etiqueta={CUADRADOS_EDITOR.includes(e.tipo) ? 'Lado' : 'Ancho'} valor={e.w} onCambio={(v) => cambiar(CUADRADOS_EDITOR.includes(e.tipo) ? { w: Math.max(20, v), h: Math.max(20, v) } : { w: Math.max(5, v) })} min={5} />
        {e.tipo !== 'texto' && e.tipo !== 'linea' && !CUADRADOS_EDITOR.includes(e.tipo) && <Num etiqueta="Alto" valor={e.h} onCambio={(v) => cambiar({ h: Math.max(5, v) })} min={5} />}
        <Num etiqueta="Giro (grados)" valor={e.rot || 0} onCambio={(v) => cambiar({ rot: ((v % 360) + 360) % 360 })} min={0} max={360} />
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>
        Voltear
        <button type="button" className={`btn btn-sm ${e.espejoH ? 'btn-primary' : 'btn-outline'}`} onClick={() => voltear('h')} title="En horizontal (espejo)">⇋</button>
        <button type="button" className={`btn btn-sm ${e.espejoV ? 'btn-primary' : 'btn-outline'}`} onClick={() => voltear('v')} title="En vertical">⇵</button>
      </div>
      <Rango etiqueta="Transparencia" valor={Math.round((e.opacidad ?? 1) * 100)} min={5} max={100} onCambio={(v) => cambiar({ opacidad: v / 100 })} tramos={tramos} sufijo=" %" />
      {e.tipo !== 'linea' && e.tipo !== 'texto' && <>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" checked={!!e.sombra} onChange={x => cambiar({ sombra: x.target.checked })} /> Sombra</label>
        {e.sombra && <ControlesSombra e={e} cambiar={cambiar} tramos={tramos} />}
      </>}
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

// El menú del botón derecho: [texto, atajo, acción, peligrosa] o null (una raya).
function MenuContextual({ x, y, opciones, onCerrar }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) });
  }, [x, y]);
  const lista = opciones.filter(o => o !== false && o !== undefined && o !== 0 && o !== '').filter((o, i, l) => o || (i > 0 && l[i - 1] && i < l.length - 1));
  return (
    <div ref={ref} role="menu" onPointerDown={ev => ev.stopPropagation()} onContextMenu={ev => ev.preventDefault()}
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 95, minWidth: 230, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 5, display: 'grid' }}>
      {lista.map((o, i) => (o ? (
        <button key={o[0]} type="button" role="menuitem" onClick={() => { onCerrar(); o[2](); }}
          style={{ font: 'inherit', fontSize: 13, textAlign: 'left', padding: '7px 10px', border: 0, borderRadius: 7, background: 'none', cursor: 'pointer', display: 'flex', gap: 12, color: o[3] ? 'var(--orange)' : 'var(--ink)' }}
          onMouseEnter={ev => { ev.currentTarget.style.background = 'var(--bg-3)'; }} onMouseLeave={ev => { ev.currentTarget.style.background = 'none'; }}>
          <span style={{ flex: 1 }}>{o[0]}</span>{o[1] && <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>{o[1]}</span>}
        </button>
      ) : <div key={`r${i}`} style={{ height: 1, background: 'var(--line)', margin: '4px 6px' }} />))}
    </div>
  );
}

// Estilos: los colores y las letras de todo el diseño, de una vez. Combinaciones
// listas, «Mezclar» (otro reparto de la misma paleta) y el kit de la marca.
function PanelEstilos({ doc, aplicarDoc, showToast }) {
  const marca = useContext(KitMarca);
  const [kit, setKit] = useState(null);
  const [ultima, setUltima] = useState(null);
  const [giro, setGiro] = useState(0);
  useEffect(() => { api('/api/admin/disenos/kit').then(setKit).catch(() => setKit({ paletas: [] })); }, []);
  const delClub = kit?.paletas || [];
  const paletas = [...delClub.map(p => ({ ...p, club: true })), ...PALETAS_LISTAS];
  const pares = [...(kit?.titulos && kit?.texto ? [{ nombre: 'La del club', titulos: kit.titulos, texto: kit.texto }] : []), ...PARES_LETRAS];
  const combinaciones = paletas.slice(0, 8).map((p, i) => ({ paleta: p, letras: pares[i % pares.length] }));
  const propias = marca?.fuentes || [];
  const todasLetras = [...FUENTES_DISENO.map(f => ({ fuente: f.id, nombre: f.nombre })), ...propias.map(f => ({ fuente: f.nombre, nombre: `${f.nombre} (del club)`, url: f.url }))];
  function aplicar(paleta, letras, g = 0) {
    aplicarDoc(d => aplicarEstilo(d, { paleta: paleta?.colores || null, letras, giro: g }));
    if (paleta) setUltima(paleta);
    setGiro(g);
  }
  async function guardarKit(k) { try { setKit(await api('/api/admin/disenos/kit', { method: 'PUT', body: k })); showToast?.('Guardado en el kit de la marca.'); } catch (e) { alert(e.message); } }
  function paletaDeAqui() {
    const colores = coloresDe(doc).slice(0, 6);
    if (colores.length < 2) { alert('Este diseño tiene menos de dos colores.'); return; }
    const nombre = window.prompt('Nombre de la paleta (la verá todo el equipo):', 'Paleta del club');
    if (nombre?.trim()) guardarKit({ ...kit, paletas: [...delClub, { nombre: nombre.trim(), colores }] });
  }
  const muestras = (colores, tam = 16) => <span style={{ display: 'flex', gap: 2 }}>{colores.slice(0, 6).map(c => <span key={c} style={{ width: tam, height: tam, borderRadius: 4, background: c, border: '1px solid var(--line)' }} />)}</span>;
  const letraDe = (cual) => kit?.[cual]?.fuente || '';
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)' }}>Cambia de una vez los colores y las letras de todo el diseño (todas las páginas). Ctrl+Z lo deshace.</p>
      <div style={seccionT}>Combinaciones</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {combinaciones.map(({ paleta, letras }) => (
          <button key={`${paleta.nombre}${letras.nombre}`} type="button" onClick={() => aplicar(paleta, letras)} title={`${paleta.nombre} · letra ${letras.nombre}`}
            style={{ font: 'inherit', cursor: 'pointer', padding: 8, borderRadius: 10, border: '1px solid var(--line)', background: paleta.colores[0], color: [...paleta.colores.slice(1), '#1A1A1A', '#FFFFFF'].reduce((m, c) => (contraste(c, paleta.colores[0]) > contraste(m, paleta.colores[0]) + 1.5 ? c : m)), display: 'grid', gap: 6, textAlign: 'left' }}>
            <span style={{ fontFamily: `"${letras.titulos.fuente}"`, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>Aa</span>
            {muestras(paleta.colores, 12)}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-sm btn-outline" disabled={!ultima} onClick={() => aplicar(ultima, null, giro + 1)} title="Los mismos colores, repartidos de otra manera">🔀 Mezclar los colores</button>
      <div style={seccionT}>Paletas</div>
      <div style={{ display: 'grid', gap: 4 }}>
        {paletas.map((p, i) => (
          <div key={`${p.nombre}${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={() => aplicar(p, null)} style={{ font: 'inherit', fontSize: 12.5, flex: 1, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', cursor: 'pointer' }}>
              <span>{p.club ? '★ ' : ''}{p.nombre}</span>{muestras(p.colores)}
            </button>
            {p.club && <button type="button" className="icon-btn" aria-label={`Quitar la paleta ${p.nombre}`} onClick={() => { if (window.confirm(`¿Quitar la paleta «${p.nombre}» del kit?`)) guardarKit({ ...kit, paletas: delClub.filter(x => x !== delClub[i]) }); }}><I.X /></button>}
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm btn-ghost" style={{ justifySelf: 'start', fontSize: 12, whiteSpace: 'normal', textAlign: 'left' }} onClick={paletaDeAqui}>＋ Guardar los colores de este diseño como paleta del club</button>
      <div style={seccionT}>Letras</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {pares.map(par => (
          <button key={par.nombre} type="button" onClick={() => aplicar(null, par)} style={{ font: 'inherit', cursor: 'pointer', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', textAlign: 'left', display: 'grid' }}>
            <span style={{ fontFamily: `"${par.titulos.fuente}"`, fontSize: 15, fontWeight: 700 }}>{par.nombre}</span>
            <span style={{ fontFamily: `"${par.texto.fuente}"`, fontSize: 11, color: 'var(--ink-3)' }}>{par.titulos.fuente} + {par.texto.fuente}</span>
          </button>
        ))}
      </div>
      <div style={seccionT}>Letras de la marca</div>
      {['titulos', 'texto'].map(cual => (
        <label key={cual} style={etq}>{cual === 'titulos' ? 'Para los títulos' : 'Para el texto'}
          <select value={letraDe(cual)} onChange={x => { const l = todasLetras.find(f => f.fuente === x.target.value); guardarKit({ ...kit, [cual]: l ? { fuente: l.fuente, ...(l.url ? { url: l.url } : {}) } : null }); }} style={inp}>
            <option value="">Sin elegir</option>
            {todasLetras.map(f => <option key={f.fuente} value={f.fuente} style={{ fontFamily: `"${f.fuente}"` }}>{f.nombre}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

// ── Tablas: las celdas, filas y columnas, y sus colores ──
function EditorTabla({ e, cambiar }) {
  const celdas = e.celdas?.length ? e.celdas : [['']];
  const n = Math.max(...celdas.map(f => f.length), 1);
  const poner = (i, j, v) => cambiar({ celdas: celdas.map((f, a) => (a === i ? Array.from({ length: n }, (_, b) => (b === j ? v : f[b] ?? '')) : f)) });
  const fila = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'start' };
  const celdaEstilo = { ...inp, padding: '5px 6px', fontSize: 12, minWidth: 0 };
  return (
    <>
      <div style={seccionT}>Celdas</div>
      <div style={{ display: 'grid', gap: 3, gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, maxHeight: 320, overflowY: 'auto' }}>
        {celdas.map((f, i) => Array.from({ length: n }, (_, j) => (
          <input key={`${i}-${j}`} value={f[j] ?? ''} onChange={x => poner(i, j, x.target.value)} aria-label={`Fila ${i + 1}, columna ${j + 1}`}
            style={{ ...celdaEstilo, fontWeight: e.cabecera && i === 0 ? 800 : 400 }} />
        )))}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => cambiar({ celdas: [...celdas, Array(n).fill('')] })}>＋ Fila</button>
        <button type="button" className="btn btn-sm btn-outline" disabled={celdas.length < 2} onClick={() => cambiar({ celdas: celdas.slice(0, -1) })}>− Fila</button>
        <button type="button" className="btn btn-sm btn-outline" disabled={n >= 8} onClick={() => cambiar({ celdas: celdas.map(f => [...Array.from({ length: n }, (_, b) => f[b] ?? ''), '']), anchos: undefined })}>＋ Columna</button>
        <button type="button" className="btn btn-sm btn-outline" disabled={n < 2} onClick={() => cambiar({ celdas: celdas.map(f => f.slice(0, n - 1)), anchos: undefined })}>− Columna</button>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <label style={casillaEstilo}><input type="checkbox" checked={!!e.cabecera} onChange={x => cambiar({ cabecera: x.target.checked })} /> Cabecera</label>
        <label style={casillaEstilo}><input type="checkbox" checked={!!e.rayas} onChange={x => cambiar({ rayas: x.target.checked })} /> Filas a rayas</label>
      </div>
      <div style={fila}>
        <Num etiqueta="Tamaño de la letra" valor={e.tamano || 30} onCambio={(v) => cambiar({ tamano: Math.max(6, v) })} min={6} />
        <label style={etq}>Letra
          <select value={e.fuente || 'Montserrat'} onChange={x => cambiar({ fuente: x.target.value })} style={inp}>{FUENTES_DISENO.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[['izquierda', '⇤'], ['centro', '↔'], ['derecha', '⇥']].map(([k, t]) => <button key={k} type="button" className={`btn btn-sm ${(e.alinear || 'izquierda') === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => cambiar({ alinear: k })} title={`Alinear a la ${k}`}>{t}</button>)}
      </div>
      {e.cabecera && <div style={fila}>
        <Color etiqueta="Fondo de la cabecera" valor={e.fondoCabecera || '#5233A8'} onCambio={(v) => cambiar({ fondoCabecera: v })} />
        <Color etiqueta="Letra de la cabecera" valor={e.colorCabecera || '#FFFFFF'} onCambio={(v) => cambiar({ colorCabecera: v })} />
      </div>}
      <div style={fila}>
        <Color etiqueta="Fondo de las filas" valor={e.fondoFilas} onCambio={(v) => cambiar({ fondoFilas: v })} permiteNada />
        {e.rayas && <Color etiqueta="Las rayas" valor={e.fondoRayas || '#F3F0FA'} onCambio={(v) => cambiar({ fondoRayas: v })} />}
      </div>
      <Color etiqueta="Color del texto" valor={e.color || '#1A1A1A'} onCambio={(v) => cambiar({ color: v })} />
      <div style={fila}>
        <Color etiqueta="Líneas" valor={e.borde || '#E5E1F2'} onCambio={(v) => cambiar({ borde: v })} permiteNada />
        <Num etiqueta="Grosor" valor={e.grosor ?? 2} onCambio={(v) => cambiar({ grosor: Math.max(0, v) })} min={0} />
      </div>
      <Num etiqueta="Esquinas redondeadas" valor={e.radio || 0} onCambio={(v) => cambiar({ radio: Math.max(0, v) })} min={0} />
    </>
  );
}

// ── Gráficos: el tipo, los datos y los colores ──
function EditorGrafico({ e, cambiar }) {
  const datos = e.datos || [];
  const colores = e.colores?.length ? e.colores : COLORES_GRAFICO;
  const poner = (i, c) => cambiar({ datos: datos.map((d, a) => (a === i ? { ...d, ...c } : d)) });
  const fila = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'start' };
  return (
    <>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {CLASES_GRAFICO.map(([k, t]) => <button key={k} type="button" className={`btn btn-sm ${e.clase === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => cambiar({ clase: k })}>{t}</button>)}
      </div>
      <div style={seccionT}>Datos</div>
      <div style={{ display: 'grid', gap: 4 }}>
        {datos.map((d, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 76px 26px', gap: 4, alignItems: 'center' }}>
            <input type="color" value={colores[i % colores.length]} aria-label={`Color de ${d.etiqueta}`} style={{ width: 22, height: 26, padding: 0, border: 0, background: 'none' }}
              onChange={x => { const l = Array.from({ length: Math.max(colores.length, datos.length) }, (_, a) => colores[a % colores.length]); l[i] = x.target.value; cambiar({ colores: l }); }} />
            <input value={d.etiqueta} onChange={x => poner(i, { etiqueta: x.target.value })} aria-label={`Nombre ${i + 1}`} style={{ ...inp, padding: '5px 6px' }} />
            <input type="number" value={d.valor} onChange={x => poner(i, { valor: x.target.value === '' ? '' : Number(x.target.value) })} aria-label={`Valor ${i + 1}`} style={{ ...inp, padding: '5px 6px' }} />
            <button type="button" className="icon-btn" aria-label={`Quitar ${d.etiqueta}`} onClick={() => cambiar({ datos: datos.filter((_, a) => a !== i) })}><I.X /></button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm btn-outline" disabled={datos.length >= 12} onClick={() => cambiar({ datos: [...datos, { etiqueta: `Dato ${datos.length + 1}`, valor: 1 }] })}>＋ Dato</button>
      <label style={casillaEstilo}><input type="checkbox" checked={e.valores !== false} onChange={x => cambiar({ valores: x.target.checked })} /> Enseñar los números</label>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={() => cambiar({ colores: COLORES_GRAFICO })}>Colores del club</button>
        <button type="button" className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={() => cambiar({ colores: [colores[0]] })}>Todo de un color</button>
      </div>
      <div style={fila}>
        <Num etiqueta="Tamaño de la letra" valor={e.tamano || 28} onCambio={(v) => cambiar({ tamano: Math.max(6, v) })} min={6} />
        <Color etiqueta="Color del texto" valor={e.color || '#1A1A1A'} onCambio={(v) => cambiar({ color: v })} />
      </div>
    </>
  );
}

// Varias cosas elegidas: agrupar, alinear entre ellas y repartir el espacio.
function PanelVarios({ elegidos, voltear, agrupar, desagrupar, alinear, repartir, duplicar, borrar, capa, bloquear }) {
  const agrupados = elegidos.every(e => e.grupo && e.grupo === elegidos[0].grupo);
  const alinearBtn = (k, t, titulo) => <button key={k} type="button" className="btn btn-sm btn-outline" title={titulo} onClick={() => alinear(k)} style={{ padding: '4px 8px' }}>{t}</button>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b style={{ flex: 1 }}>{elegidos.length} elementos{agrupados ? ' · un grupo' : ''}</b>
        <button type="button" className="btn btn-sm btn-ghost" onClick={duplicar} title="Duplicar (Ctrl+D)">⧉</button>
        <button type="button" className="icon-btn danger" onClick={borrar} aria-label="Borrar (Supr)"><I.Trash /></button>
      </div>
      {agrupados
        ? <button type="button" className="btn btn-sm btn-outline" onClick={desagrupar}>Desagrupar (Ctrl+Mayús+G)</button>
        : <button type="button" className="btn btn-sm btn-primary" onClick={agrupar}>Agrupar (Ctrl+G)</button>}
      <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{agrupados ? 'Se eligen y se mueven juntos. Doble clic en uno para tocarlo solo.' : 'Agrupados, se eligen y se mueven juntos.'}</span>
      <div style={seccionT}>Alinear entre ellos</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {alinearBtn('izq', '⇤', 'A la izquierda')}{alinearBtn('centroH', '↔', 'Centrados')}{alinearBtn('der', '⇥', 'A la derecha')}
        {alinearBtn('arriba', '⤒', 'Arriba')}{alinearBtn('centroV', '↕', 'En medio')}{alinearBtn('abajo', '⤓', 'Abajo')}
      </div>
      <div style={seccionT}>Repartir el espacio</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" disabled={elegidos.length < 3} onClick={() => repartir('h')}>↔ En horizontal</button>
        <button type="button" className="btn btn-sm btn-outline" disabled={elegidos.length < 3} onClick={() => repartir('v')}>↕ En vertical</button>
      </div>
      {elegidos.length < 3 && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Repartir, con tres o más.</span>}
      <div style={seccionT}>Voltear el bloque</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => voltear('h')}>⇋ En horizontal</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => voltear('v')}>⇵ En vertical</button>
      </div>
      <div style={seccionT}>Capa</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => capa('frente')}>Al frente</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => capa('fondo')}>Al fondo</button>
      </div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
        <input type="checkbox" checked={elegidos.every(e => e.bloqueado)} onChange={x => bloquear(x.target.checked)} /> Bloqueados
      </label>
    </div>
  );
}

// Animar: lo que entra y cuándo (historias y reels).
function PanelAnimar({ doc, diseno, elegido, tiempo, onVer, tramos, cambiarEl, aplicar, aplicarDoc, onExportar }) {
  const dur = duracionAnimacion(doc);
  function todo(tipoA) {
    aplicar(d => {
      let i = 0;
      return { ...d, elementos: d.elementos.map(e => {
        const { anim, ...resto } = e; // eslint-disable-line no-unused-vars
        if (!tipoA) return resto;
        // Lo que ocupa todo el fondo no se anima.
        if (e.w >= d.ancho * 0.95 && e.h >= d.alto * 0.95) return resto;
        const a = { tipo: tipoA, retraso: Math.round(i * 0.3 * 100) / 100, duracion: 0.8 };
        i += 1;
        return { ...resto, anim: a };
      }) };
    });
  }
  const a = elegido?.anim;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)' }}>Para historias y reels: cada cosa entra a su tiempo. Se exporta en GIF o vídeo, y se puede publicar en redes como vídeo.</p>
      <button type="button" className="btn btn-sm btn-primary" onClick={onVer}>{tiempo != null ? '■ Parar' : '▶ Ver la animación'}</button>
      {tiempo != null && <progress value={tiempo} max={dur} style={{ width: '100%' }} />}
      <label style={etq}>Duración del vídeo
        <select value={dur} onChange={x => aplicarDoc(d => ({ ...d, animacion: { ...(d.animacion || {}), duracion: Number(x.target.value) } }))} style={inp}>
          {[3, 5, 8, 10, 15].map(s => <option key={s} value={s}>{s} segundos</option>)}
        </select>
      </label>
      <div style={seccionT}>Animar toda la página</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {[['aparecer', 'Aparecer uno a uno'], ['subir', 'Subir uno a uno'], ['zoom', 'Crecer uno a uno'], ['izquierda', 'Entrar de lado'], ['rebote', 'Rebotar uno a uno'], [null, 'Quitar las animaciones']].map(([k, t]) => (
          <button key={t} type="button" className="btn btn-sm btn-outline" style={{ fontSize: 12, padding: '5px 6px', whiteSpace: 'normal', lineHeight: 1.2, minWidth: 0 }} onClick={() => todo(k)}>{t}</button>
        ))}
      </div>
      <div style={seccionT}>{elegido ? 'Lo elegido' : 'Elige algo para animarlo a su aire'}</div>
      {elegido && <>
        <select value={a?.tipo || ''} aria-label="Animación" style={inp}
          onChange={x => cambiarEl({ anim: x.target.value ? { retraso: a?.retraso || 0, duracion: a?.duracion || 0.8, tipo: x.target.value } : undefined })}>
          <option value="">Sin animación</option>
          {ANIMACIONES.filter(t => t.id !== 'escribir' || elegido.tipo === 'texto').map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        {a?.tipo && <>
          <Rango etiqueta="Empieza en" valor={a.retraso || 0} min={0} max={dur} paso={0.1} sufijo=" s" tramos={tramos} onCambio={(v) => cambiarEl({ anim: { ...a, retraso: v } })} />
          {!['latido', 'flotar'].includes(a.tipo) && <Rango etiqueta="Dura" valor={a.duracion || 0.8} min={0.2} max={3} paso={0.1} sufijo=" s" tramos={tramos} onCambio={(v) => cambiarEl({ anim: { ...a, duracion: v } })} />}
        </>}
      </>}
      <button type="button" className="btn btn-sm btn-outline" onClick={onExportar} disabled={!tieneAnimacion(diseno)}>Exportar en GIF o vídeo</button>
    </div>
  );
}

// ── Revisión en equipo: estado de la aprobación, comentarios y versiones ──
const NOMBRE_ESTADO = {
  sin_pedir: ['Sin pedir aprobación', 'var(--ink-3)'], pendiente: ['⏳ Esperando a la dirección', '#B45309'], aprobado: ['✓ Aprobado', 'var(--teal)'],
  cambios: ['✎ Pide cambios', 'var(--orange)'], cambiado: ['Cambiado tras aprobarse', '#B45309'],
};
function EstadoRevision({ estado, onClick, pequeno }) {
  const [t, c] = NOMBRE_ESTADO[estado] || NOMBRE_ESTADO.sin_pedir;
  const estilo = { font: 'inherit', fontSize: pequeno ? 11 : 12, fontWeight: 800, color: c, border: `1px solid ${c}`, background: 'transparent', borderRadius: 999, padding: pequeno ? '1px 8px' : '3px 10px' };
  return onClick ? <button type="button" onClick={onClick} style={{ ...estilo, cursor: 'pointer' }}>{t}</button> : <span style={estilo}>{t}</span>;
}
const fechaHora = (v) => new Date(v).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const PASO_REVISION = { pedir: '⏳ pidió la aprobación', aprobado: '✓ lo aprobó', cambios: '✎ pidió cambios' };
function PanelRevision({ id, revision, setRevision, sucio, guardar, pedir, elegido, pagina, onIr, onVolver }) {
  const [texto, setTexto] = useState('');
  const [sobre, setSobre] = useState(true);
  const [decision, setDecision] = useState('');
  const [versiones, setVersiones] = useState(null);
  useEffect(() => { if (id) api(`/api/admin/disenos/${id}/versiones`).then(d => setVersiones(d.versiones || [])).catch(() => setVersiones([])); }, [id, revision]);
  if (!id) return (
    <div style={{ display: 'grid', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
      <span>Guarda el diseño para comentarlo, pedir la aprobación de la dirección y ver sus versiones.</span>
      <button type="button" className="btn btn-sm btn-primary" onClick={guardar}>Guardar</button>
    </div>
  );
  if (!revision) return <span style={{ color: 'var(--ink-3)' }}>Cargando…</span>;
  const llamar = async (url, method = 'POST', body) => { try { setRevision(await api(url, { method, body })); return true; } catch (e) { alert(e.message); return false; } };
  async function comentar() {
    if (!texto.trim()) return;
    if (await llamar(`/api/admin/disenos/${id}/comentarios`, 'POST', { texto, elementoId: sobre && elegido ? elegido.id : null, pagina })) setTexto('');
  }
  async function decidir(accion) {
    if (accion === 'cambios' && !decision.trim()) { alert('Escribe qué hay que cambiar.'); return; }
    if (sucio) await guardar();
    if (await llamar(`/api/admin/disenos/${id}/revision`, 'POST', { accion, texto: decision })) setDecision('');
  }
  const { estado, puedoAprobar, comentarios } = revision;
  const explicacion = {
    sin_pedir: 'Para publicarlo en redes, la dirección tiene que aprobarlo.',
    pendiente: puedoAprobar ? 'Espera tu aprobación.' : 'La dirección ya lo tiene en la campanita.',
    aprobado: 'Aprobado: ya se puede publicar en redes. Si se cambia, habrá que aprobarlo otra vez.',
    cambios: 'La dirección ha pedido cambios: cuando estén, vuelve a pedir la aprobación.',
    cambiado: 'Se ha cambiado después de aprobarlo: hay que aprobarlo otra vez.',
  }[estado];
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div><EstadoRevision estado={estado} /></div>
      <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{explicacion}{sucio ? ' (Hay cambios sin guardar.)' : ''}</span>
      {!puedoAprobar && ['sin_pedir', 'cambios', 'cambiado'].includes(estado) && <button type="button" className="btn btn-sm btn-primary" onClick={() => pedir()}>Pedir la aprobación a la dirección</button>}
      {puedoAprobar && estado !== 'aprobado' && <>
        <textarea rows={2} value={decision} onChange={e => setDecision(e.target.value)} placeholder="Si pides cambios, di cuáles" style={{ ...inp, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => decidir('aprobado')}>✓ Aprobar</button>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => decidir('cambios')}>Pedir cambios</button>
        </div>
      </>}

      <div style={seccionT}>Comentarios</div>
      {!comentarios.length && <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Aún no hay ninguno.</span>}
      {comentarios.map(c => (c.tipo !== 'comentario' ? (
        <div key={c.id} style={{ fontSize: 12, color: 'var(--ink-2)', fontStyle: 'italic' }}>
          <b style={{ fontStyle: 'normal' }}>{c.autor}</b> {PASO_REVISION[c.tipo]} · {fechaHora(c.fecha)}{c.texto ? <>: «{c.texto}»</> : null}
        </div>
      ) : (
        <div key={c.id} style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', display: 'grid', gap: 4, opacity: c.resuelto ? 0.55 : 1 }}>
          <div style={{ display: 'flex', gap: 6, fontSize: 12 }}><b style={{ flex: 1 }}>{c.autor}</b><span style={{ color: 'var(--ink-3)' }}>{fechaHora(c.fecha)}</span></div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', textDecoration: c.resuelto ? 'line-through' : 'none' }}>{c.texto}</div>
          <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
            {(c.elementoId || c.pagina != null) && <button type="button" className="link-btn" style={{ border: 0, background: 'none', padding: 0, color: 'var(--purple)', cursor: 'pointer', font: 'inherit' }} onClick={() => onIr(c)}>{c.elementoId ? 'Ver dónde' : `Página ${c.pagina + 1}`}</button>}
            <button type="button" style={{ border: 0, background: 'none', padding: 0, color: 'var(--ink-2)', cursor: 'pointer', font: 'inherit' }} onClick={() => llamar(`/api/admin/disenos/${id}/comentarios/${c.id}`, 'PATCH', { resuelto: !c.resuelto })}>{c.resuelto ? 'Reabrir' : '✓ Resuelto'}</button>
            {(c.mio || puedoAprobar) && <button type="button" style={{ border: 0, background: 'none', padding: 0, color: 'var(--orange)', cursor: 'pointer', font: 'inherit' }} onClick={() => { if (window.confirm('¿Borrar este comentario?')) llamar(`/api/admin/disenos/${id}/comentarios/${c.id}`, 'DELETE'); }}>Borrar</button>}
          </div>
        </div>
      )))}
      <textarea rows={3} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe un comentario para el equipo…" style={{ ...inp, resize: 'vertical' }} />
      {elegido && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={sobre} onChange={e => setSobre(e.target.checked)} /> Sobre lo elegido ({etiquetaElemento(elegido)})</label>}
      <button type="button" className="btn btn-sm btn-outline" disabled={!texto.trim()} onClick={comentar}>Comentar</button>

      <div style={seccionT}>Versiones</div>
      <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Al guardar se queda una copia de cómo estaba, si la anterior tiene más de 20 minutos (las 50 últimas).</span>
      {!versiones ? <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Cargando…</span> : !versiones.length ? <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Aún no hay versiones anteriores.</span> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {versiones.map(v => (
            <div key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 10, padding: 6 }}>
              <span style={{ width: 54, height: 42, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--bg-2)', borderRadius: 6 }}>{v.miniatura && <img src={v.miniatura} alt="" style={{ maxWidth: '95%', maxHeight: '95%' }} />}</span>
              <span style={{ flex: 1, fontSize: 12.5, display: 'grid' }}><b>{fechaHora(v.fecha)}</b>{v.nombre && <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>{v.nombre}</span>}</span>
              <button type="button" className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={() => { if (window.confirm(`¿Volver a como estaba el ${fechaHora(v.fecha)}? Lo de ahora se guarda antes como versión.`)) onVolver(v); }}>Volver a esta</button>
            </div>
          ))}
        </div>
      )}
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
function DatosDelClub({ anadirBloque, anadirTabla, kit }) {
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
  // El mismo horario, en una tabla (una fila por grupo y sesión).
  function horarioTabla() {
    const a = conHorario.find(x => x.id === act) || conHorario[0]; if (!a) return;
    const filas = a.grupos.filter(g => g.sesiones?.length).flatMap(g => g.sesiones.map(se => [g.nombre, diasTexto(se.dias), `${se.inicio}${se.fin ? `–${se.fin}` : ''}`]));
    anadirTabla([['Grupo', 'Días', 'Hora'], ...filas]);
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
        <button type="button" className="btn btn-sm btn-outline" disabled={!conHorario.length} onClick={horarioTabla} title="El horario, en una tabla">▦</button>
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

// Fotos de banco: Openverse, solo las de dominio público (se usan sin citar a nadie).
function FotosDeBanco({ onCerrar, onElegir }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [trayendo, setTrayendo] = useState(null);
  async function buscar(p = 1) {
    if (q.trim().length < 2) return;
    setRes({ cargando: true });
    try { setRes(await api(`/api/admin/disenos/banco?q=${encodeURIComponent(q.trim())}&pagina=${p}`)); setPagina(p); }
    catch (e) { setRes({ error: e.message }); }
  }
  async function usar(f) {
    setTrayendo(f.id);
    try { onElegir(await api(`/api/admin/disenos/banco/${f.id}`, { method: 'POST' })); }
    catch (e) { alert(e.message); } finally { setTrayendo(null); }
  }
  return (
    <Ventana titulo="Fotos de banco" onCerrar={trayendo ? () => {} : onCerrar} ancho={920}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>Fotos de <b>dominio público</b> (de Openverse): se pueden usar en lo que sea, también en redes y carteles, sin citar a nadie. Se encuentran más buscando en inglés: «karate», «summer camp», «ballet», «robot»…</p>
      <form style={{ display: 'flex', gap: 6 }} onSubmit={(ev) => { ev.preventDefault(); buscar(1); }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="¿Qué buscas?" aria-label="Buscar fotos" style={inp} />
        <button type="submit" className="btn btn-sm btn-primary" disabled={q.trim().length < 2}>Buscar</button>
      </form>
      {res?.cargando && <span style={{ color: 'var(--ink-3)' }}>Buscando…</span>}
      {res?.error && <span style={{ color: 'var(--orange)' }}>{res.error}</span>}
      {res?.fotos && (!res.fotos.length ? <span style={{ color: 'var(--ink-3)' }}>Nada. Prueba con otra palabra (mejor en inglés).</span> : <>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
          {res.fotos.map(f => (
            <button key={f.id} type="button" disabled={!!trayendo} onClick={() => usar(f)} title={`${f.titulo}${f.autor ? ` · ${f.autor}` : ''}`} aria-label={`Usar «${f.titulo}»`}
              style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 0, aspectRatio: '1', cursor: 'pointer', overflow: 'hidden', background: 'var(--bg-3)', position: 'relative', opacity: trayendo && trayendo !== f.id ? 0.5 : 1 }}>
              <img src={f.mini} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {trayendo === f.id && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)', color: '#fff', fontWeight: 800, fontSize: 12 }}>Trayéndola…</span>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
          <button type="button" className="btn btn-sm btn-ghost" disabled={pagina <= 1} onClick={() => buscar(pagina - 1)}>‹ Antes</button>
          <span>Página {pagina} de {Math.min(10, res.paginas)}</span>
          <button type="button" className="btn btn-sm btn-ghost" disabled={pagina >= Math.min(10, res.paginas)} onClick={() => buscar(pagina + 1)}>Más ›</button>
        </div>
      </>)}
    </Ventana>
  );
}

// ═══════════════════════ Usar el diseño ═══════════════════════
// Publicar en redes: el diseño como foto de un borrador de Publicaciones (que
// luego se programa o se publica allí). Para Instagram, con bandas blancas si
// se sale de lo que admite (de 4:5 a 1,91:1).
function PublicarEnRedes({ doc, pagina, ejemplo, permiso, estado, onPedir, onRevision, onCerrar, onHecho }) {
  const actual = paginaDe(doc, pagina), n = numPaginas(doc), ratio = doc.ancho / doc.alto;
  const fv = formatoVideo(), animada = tieneAnimacion(actual), puedeVideo = animada && fv?.ext === 'mp4';
  const [comoVideo, setComoVideo] = useState(puedeVideo);
  const [redes, setRedes] = useState(['facebook', 'instagram']);
  const [tipo, setTipo] = useState(1 / ratio > 1.6 ? 'story' : puedeVideo ? 'reel' : 'post');
  const [texto, setTexto] = useState('');
  const [paso, setPaso] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { if (comoVideo && tipo === 'post') setTipo('reel'); if (!comoVideo && tipo === 'reel') setTipo('post'); }, [comoVideo]); // eslint-disable-line react-hooks/exhaustive-deps
  const carrusel = !comoVideo && tipo === 'post' && n > 1;
  const bandas = !comoVideo && redes.includes('instagram') && tipo === 'post' && (ratio < 0.8 || ratio > 1.91);
  // Una página como foto JPG (con bandas blancas si Instagram no admite sus proporciones).
  async function foto(v) {
    const k = Math.min(1, 2048 / Math.max(v.ancho, v.alto));
    const c = await lienzoDe(v, { variables: ejemplo, ancho: Math.round(v.ancho * k) });
    let W = c.width, H = c.height;
    if (bandas) { if (W / H < 0.8) W = Math.round(H * 0.8); else H = Math.round(W / 1.91); }
    const f = document.createElement('canvas'); f.width = W; f.height = H;
    const g = f.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.drawImage(c, Math.round((W - c.width) / 2), Math.round((H - c.height) / 2));
    return { blob: await lienzoAJpeg(f, 0.9), lienzo: f, W, H };
  }
  async function miniDe(lienzo, W, H) {
    const t = document.createElement('canvas'), kt = 360 / Math.max(W, H);
    t.width = Math.round(W * kt); t.height = Math.round(H * kt);
    t.getContext('2d').drawImage(lienzo, 0, 0, t.width, t.height);
    return lienzoAJpeg(t, 0.8);
  }
  async function subirMedio(pid, blob, W, H, mini) {
    const r = await fetch(`/api/admin/publicaciones/${pid}/medios?ancho=${W}&alto=${H}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': blob.type }, body: blob });
    const m = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(m.error || 'No se ha podido subir.');
    if (mini) await fetch(`/api/admin/publicaciones/${pid}/medios/${m.id}/miniatura`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'image/jpeg' }, body: mini }).catch(() => {});
  }
  async function crear() {
    setError(null);
    let id = null;
    try {
      // Primero se prepara todo (lo que puede fallar) y luego se crea el borrador.
      const medios = [];
      if (comoVideo) {
        const v = await grabarVideo(actual, { onProgreso: (t, d) => setPaso(`Grabando el vídeo… ${Math.round(t)} de ${d} s`) });
        const portada = await lienzoDe(actual, { variables: ejemplo, ancho: 360, tiempo: duracionAnimacion(doc) });
        medios.push({ blob: v.blob, W: v.ancho, H: v.alto, mini: await lienzoAJpeg(portada, 0.8) });
      } else {
        const lista = carrusel ? todasLasPaginas(doc).slice(0, 10) : [actual];
        for (let i = 0; i < lista.length; i++) {
          setPaso(lista.length > 1 ? `Preparando la página ${i + 1} de ${lista.length}…` : 'Preparando la imagen…');
          const f = await foto(lista[i]);
          medios.push({ blob: f.blob, W: f.W, H: f.H, mini: f.blob.size >= 400_000 ? await miniDe(f.lienzo, f.W, f.H) : null });
        }
      }
      setPaso('Creando el borrador…');
      ({ id } = await api('/api/admin/publicaciones', { method: 'POST', body: { texto, redes, tipo } }));
      for (let i = 0; i < medios.length; i++) {
        setPaso(medios.length > 1 ? `Subiendo ${i + 1} de ${medios.length}…` : 'Subiendo…');
        await subirMedio(id, medios[i].blob, medios[i].W, medios[i].H, medios[i].mini);
      }
      setPaso('Abriendo Publicaciones…');
      await onHecho(id);
    } catch (e) {
      // A medias, el borrador no sirve: fuera.
      if (id) await api(`/api/admin/publicaciones/${id}`, { method: 'DELETE' }).catch(() => {});
      setError(e.message); setPaso(null);
    }
  }
  if (!permiso.ok) return (
    <Ventana titulo="Publicar en redes" onCerrar={onCerrar} ancho={520}>
      <p style={{ margin: 0, fontSize: 14 }}>🔒 {permiso.motivo}</p>
      <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>La dirección aprueba lo que sale en las redes del club. Le llega a la campanita y, en cuanto lo apruebe, te llega a ti el aviso.</span>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCerrar}>Cerrar</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={onRevision}>Ver la revisión</button>
        {estado && ['sin_pedir', 'cambios', 'cambiado'].includes(estado) && <button type="button" className="btn btn-sm btn-primary" onClick={async () => { await onPedir(); onCerrar(); }}>Pedir la aprobación</button>}
      </div>
    </Ventana>
  );
  const casilla = (r, t) => (
    <label key={r} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, fontWeight: 700 }}>
      <input type="checkbox" checked={redes.includes(r)} onChange={x => setRedes(v => (x.target.checked ? [...v, r] : v.filter(y => y !== r)))} /> {t}
    </label>
  );
  const tipos = comoVideo ? [['reel', 'Reel'], ['story', 'Historia']] : [['post', n > 1 ? 'Carrusel' : 'Publicación'], ['story', 'Historia']];
  return (
    <Ventana titulo="Publicar en redes" onCerrar={paso ? () => {} : onCerrar} ancho={580}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>Se crea un <b>borrador en Publicaciones</b> con este diseño. No sale nada hasta que allí lo programes o pulses «Publicar».</p>
      <div style={{ display: 'flex', gap: 18 }}>{casilla('facebook', 'Facebook')}{casilla('instagram', 'Instagram')}</div>
      {animada && (
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={comoVideo} disabled={!puedeVideo} onChange={x => setComoVideo(x.target.checked)} /> Con la animación (vídeo de {duracionAnimacion(doc)} s)
          {!puedeVideo && <span style={{ color: '#B45309', fontSize: 12 }}> · este navegador no graba MP4: usa Chrome o Safari al día</span>}
        </label>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        {tipos.map(([k, t]) => <button key={k} type="button" className={`btn btn-sm ${tipo === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTipo(k)}>{t}</button>)}
      </div>
      {carrusel && <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Las {Math.min(10, n)} páginas, como carrusel (una foto por página){n > 10 ? ': Instagram admite 10 como mucho' : ''}.</span>}
      {!carrusel && n > 1 && !comoVideo && <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Una historia lleva una sola imagen: la página {pagina + 1}.</span>}
      {tipo !== 'story' && <label style={etq}>Texto de la publicación (se puede cambiar luego)
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

// PDF de imprenta: a 300 ppp, con sangrado y marcas de corte.
function ParaImprenta({ doc, nombre, ejemplo, onCerrar }) {
  const [wmm, hmm] = medidasImprenta(doc), n = numPaginas(doc);
  const [prog, setProg] = useState(null);
  const papel = TAMANOS.some(t => t.pdf && t.ancho === doc.ancho && t.alto === doc.alto);
  async function crear() {
    setProg(`Preparando${n > 1 ? ` la página 1 de ${n}` : ''}…`);
    try { await exportarImprenta(doc, nombre, { variables: ejemplo, onProgreso: (h, t) => setProg(h < t ? `Preparando la página ${h + 1} de ${t}…` : 'Guardando el PDF…') }); onCerrar(); }
    catch (e) { alert(`No se ha podido crear: ${e.message}`); setProg(null); }
  }
  return (
    <Ventana titulo="PDF de imprenta" onCerrar={prog ? () => {} : onCerrar} ancho={560}>
      <p style={{ margin: 0, fontSize: 13.5 }}>Para mandarlo a la imprenta: <b>{wmm} × {hmm} mm</b> al corte{n > 1 ? `, ${n} páginas` : ''}, a 300 ppp, con <b>{SANGRADO_MM} mm de sangrado</b> alrededor y <b>marcas de corte</b> en las esquinas.</p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--ink-2)', display: 'grid', gap: 4 }}>
        <li>Lo que llega al borde del diseño (fondos, franjas) se alarga hasta el sangrado, para que no quede un filo blanco al cortar.</li>
        <li>Deja los textos y los logos a 5 mm o más del borde: el corte nunca es exacto.</li>
        <li>Sale en color RGB; si la imprenta lo quiere en CMYK, lo convierte ella.</li>
        {!papel && <li>Este tamaño no es un A4 ni un A3: se calcula a 150 ppp de sus píxeles.</li>}
      </ul>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        {prog && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{prog}</span>}
        <button type="button" className="btn btn-sm btn-ghost" disabled={!!prog} onClick={onCerrar}>Cancelar</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={!!prog} onClick={crear}>Crear el PDF de imprenta</button>
      </div>
    </Ventana>
  );
}

// Historias animadas: GIF o vídeo.
function ExportarAnimacion({ diseno, nombre, onCerrar }) {
  const f = formatoVideo();
  const [prog, setProg] = useState(null);
  async function hacer(como) {
    try {
      if (como === 'gif') { setProg('Haciendo el GIF…'); await exportarGif(diseno, nombre, { onProgreso: (h, t) => setProg(`Haciendo el GIF… ${Math.round((h / t) * 100)} %`) }); }
      else { setProg('Grabando…'); await exportarVideo(diseno, nombre, { onProgreso: (t, d) => setProg(`Grabando el vídeo… ${Math.round(t)} de ${d} s`) }); }
      onCerrar();
    } catch (e) { alert(`No se ha podido hacer: ${e.message}`); setProg(null); }
  }
  const opcion = (k, t, d, desactivado) => (
    <button key={k} type="button" disabled={!!prog || desactivado} onClick={() => hacer(k)}
      style={{ font: 'inherit', textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', cursor: 'pointer', display: 'grid', gap: 3, opacity: desactivado ? 0.5 : 1 }}>
      <b>{t}</b><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{d}</span>
    </button>
  );
  return (
    <Ventana titulo="Historia animada" onCerrar={prog ? () => {} : onCerrar} ancho={520}>
      <p style={{ margin: 0, fontSize: 13 }}>Esta página con sus animaciones, {duracionAnimacion(diseno)} segundos (se cambia en «Animar»).</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {opcion('video', `Vídeo ${f ? f.ext.toUpperCase() : ''}`, 'Para historias y reels de Instagram y Facebook. Tarda lo que dura el vídeo.', !f)}
        {opcion('gif', 'GIF', 'Para WhatsApp, correos y webs. Más pequeño y con menos colores.', false)}
      </div>
      {f?.ext === 'webm' && <span style={{ fontSize: 12.5, color: '#B45309' }}>Este navegador graba en WebM, que Instagram no admite. Con Chrome o Safari al día sale en MP4.</span>}
      {!f && <span style={{ fontSize: 12.5, color: '#B45309' }}>Este navegador no graba vídeo: usa el GIF o abre Aim Design en Chrome.</span>}
      {prog && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{prog}</span>}
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
  const usados = useMemo(() => [...new Set(todasLasPaginas(diseno).flatMap(p => p.elementos).filter(e => e.tipo === 'texto').flatMap(e => [...String(e.texto || '').matchAll(/\{(\w+)\}/g)].map(m => m[1])))], [diseno]);
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
