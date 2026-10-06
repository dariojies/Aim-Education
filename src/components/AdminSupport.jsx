import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { marcarAvisosVistos } from './Campanita.jsx';
import { useRouter } from '../App.jsx';
import { I } from './Icons.jsx';
import { fmtFecha, fmtFechaHora, fmtHora as fmtHoraCorta } from '../fechas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Soporte. El equipo lo usa como su lista de trabajo (bugs, mejoras, tareas) y
// las familias para sus consultas. Cada ticket tiene:
//  · estado: Abierto, En curso, Esperando respuesta (las tres son «abierto» en
//    la base; la etapa va aparte para que Aim-Tul y Brickslab lo sigan viendo
//    igual), Resuelto o Cerrado;
//  · categoría, prioridad, encargados, fecha límite, apps y si se repite;
//  · dos conversaciones: la del equipo (privada) y la de quien lo abrió;
//  · su historial de cambios.
// Se ve en lista o en tablero, con «sin leer», vencidos y parados, acciones
// sobre varios a la vez y un resumen de cómo va.
// ─────────────────────────────────────────────────────────────────────────────

// Las apps del grupo más 'General/A Futuro', para lo que no es de ninguna.
const APPS = ['Aim Education', 'Learning Dungeon', 'Aim Training', 'Aim Brickslab', 'Aim Artemis', 'Aim Eventos', 'General/A Futuro'];

const PRIORITY_COLOR = { high: 'var(--orange)', medium: '#FFD526', low: 'var(--teal)' };
const PRIORITY_LABEL = { high: 'Alta', medium: 'Media', low: 'Baja' };
const CATEGORIAS = {
  error: { label: 'Error', color: '#E5484D' },
  mejora: { label: 'Mejora', color: 'var(--purple)' },
  familia: { label: 'Petición de familia', color: 'var(--teal)' },
  interna: { label: 'Tarea interna', color: '#3E63DD' },
  facturacion: { label: 'Facturación', color: '#B45309' },
};
// El estado que se ve: «abierto» se parte en por atender, en curso y esperando.
const ESTADOS = {
  abierto: { label: 'Abierto', color: '#ccac00', cambio: { status: 'open', etapa: null } },
  en_curso: { label: 'En curso', color: 'var(--purple)', cambio: { status: 'open', etapa: 'en_curso' } },
  esperando: { label: 'Esperando respuesta', color: 'var(--orange)', cambio: { status: 'open', etapa: 'esperando' } },
  resolved: { label: 'Resuelto', color: 'var(--teal)', cambio: { status: 'resolved' } },
  closed: { label: 'Cerrado', color: 'var(--ink-3)', cambio: { status: 'closed' } },
};
const estadoDe = (t) => (t.status === 'open' ? (ESTADOS[t.etapa] ? t.etapa : 'abierto') : (ESTADOS[t.status] ? t.status : 'abierto'));

// Recurrencia (ticket #215): al cerrar uno, el servidor genera el siguiente.
const RECUR_OPCIONES = [['', 'No se repite'], ['diaria', 'Diaria'], ['semanal', 'Semanal'], ['quincenal', 'Quincenal'], ['mensual', 'Mensual'], ['anual', 'Anual']];
const RECUR_LABEL = { diaria: 'Diaria', semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual', anual: 'Anual' };

const cabecillaCss = { margin: "0 0 8px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)" };
const pillCss = (activo) => ({
  padding: "6px 14px", borderRadius: 8, border: "1px solid var(--line)", cursor: "pointer",
  fontSize: 12, fontWeight: 700, fontFamily: "inherit",
  background: activo ? "var(--purple)" : "var(--bg-3)", color: activo ? "white" : "var(--ink-2)",
});
const selectCss = { fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-2)", color: "var(--ink)", minWidth: 0 };
const chip = (color, extra = {}) => ({ fontSize: 11, fontWeight: 800, color, background: `color-mix(in oklab, ${color} 13%, var(--bg-2))`, padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap", ...extra });

const fmtDate = (str) => (str ? fmtFecha(str) : '—');
const fmtDue = (str) => (str ? fmtFecha(str, null) : null);
function fmtDateTime(str) {
  if (!str) return '—';
  const d = new Date(str);
  return isNaN(d) ? '—' : fmtFechaHora(d);
}
// Cuánto hace, para ver de un vistazo lo que lleva tiempo parado.
function hace(str) {
  if (!str) return null;
  const dias = Math.floor((Date.now() - new Date(str).getTime()) / 86400000);
  if (isNaN(dias) || dias < 0) return null;
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'hace 1 mes' : `hace ${meses} meses`;
}
function duracion(ms) {
  if (isNaN(ms) || ms < 0) return null;
  const horas = Math.round(ms / 3600000);
  if (horas < 1) return 'menos de 1 hora';
  if (horas < 48) return horas === 1 ? '1 hora' : `${horas} horas`;
  return `${Math.round(horas / 24)} días`;
}
const tardanza = (t) => (t?.created_at && t?.resolved_at ? duracion(new Date(t.resolved_at) - new Date(t.created_at)) : null);
const primeraRespuesta = (t) => (t?.created_at && t?.primera_respuesta_at ? duracion(new Date(t.primera_respuesta_at) - new Date(t.created_at)) : null);
const hoyISO = () => new Date().toLocaleDateString('sv-SE');
const esVencido = (t) => t.status === 'open' && t.due_date && String(t.due_date).slice(0, 10) < hoyISO();
const diasSinMoverse = (t) => Math.floor((Date.now() - new Date(t.updated_at || t.created_at).getTime()) / 86400000);
const esParado = (t, dias) => t.status === 'open' && diasSinMoverse(t) >= dias;

// Encargados (pueden ser varios; el principal va primero).
const encargadosDe = t => (t.asignados?.length ? t.asignados
  : t.assigned_to ? [{ id: t.assigned_to, name: t.assignee_name, surname: t.assignee_surname }] : []);
const nombresEncargados = t => encargadosDe(t).map(a => `${a.name || ''} ${a.surname || ''}`.trim()).join(', ');
const esEncargado = (t, id) => !!id && encargadosDe(t).some(a => a.id === id);
const sinEncargado = (t) => !encargadosDe(t).length;
const alternarEn = (lista, id) => (lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id]);
const appsDe = (t) => (Array.isArray(t.app_label) && t.app_label.length ? t.app_label : ['Aim Education']);

// Texto de un ticket (para «copiar este ticket» y el listado completo).
function ticketATexto(t) {
  let s = `[#${t.id}] ${(t.subject || '').toUpperCase()}\n`;
  s += `Estado: ${ESTADOS[estadoDe(t)].label} | Prioridad: ${PRIORITY_LABEL[t.priority] || t.priority || ''}${t.categoria ? ` | ${CATEGORIAS[t.categoria]?.label || t.categoria}` : ''}\n`;
  s += `Apps: ${appsDe(t).join(', ')}\n`;
  s += `Creado: ${fmtDateTime(t.created_at)}${hace(t.created_at) ? ` (${hace(t.created_at)})` : ''}\n`;
  s += `Creado por: ${t.name} ${t.surname || ''} (${t.email})\n`;
  s += `Encargados: ${nombresEncargados(t) || 'Sin asignar'}\n`;
  s += `Vence: ${t.due_date ? fmtDate(t.due_date) : 'N/A'}\n`;
  s += `Descripción: ${t.description}\n`;
  if (t.dev_response) s += `Respuesta: ${t.dev_response}\n`;
  return s;
}

// Copia al portapapeles (con plan B si el navegador no deja la API moderna).
async function copiarAlPortapapeles(texto) {
  try { await navigator.clipboard.writeText(texto); return true; }
  catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
}

// ── Adjuntos: imágenes, PDF, Word, Excel, texto y zip, hasta 4 MB ───────────
const MAX_ARCHIVO = 4 * 1024 * 1024;
const TIPOS_ARCHIVO = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|application\/msword|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|text\/plain|text\/csv|application\/zip|application\/x-zip-compressed)$/;
const ACEPTA = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';
const esImagen = (mime) => /^image\//.test(mime || '');
function leerArchivo(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve({ data: fr.result, nombre: file.name, mime: file.type });
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
async function aceptarArchivo(file) {
  if (!file) return {};
  if (!TIPOS_ARCHIVO.test(file.type || '')) return { error: 'Ese tipo de archivo no se puede adjuntar: imágenes, PDF, Word, Excel, texto o zip.' };
  if (file.size > MAX_ARCHIVO) return { error: 'El archivo no puede pasar de 4 MB.' };
  const archivo = await leerArchivo(file);
  // Una captura pegada llega sin nombre útil ("image.png").
  if (!archivo.nombre || archivo.nombre === 'image.png') {
    archivo.nombre = `captura-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
  }
  return { archivo };
}
function archivoDelPortapapeles(e) {
  for (const it of e.clipboardData?.items || []) if (it.type?.startsWith('image/')) return it.getAsFile();
  return null;
}
// Un archivo adjunto ya subido: la imagen se ve; lo demás, como ficha para abrir.
function Adjunto({ url, nombre, mime, alto = 200 }) {
  if (esImagen(mime)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
        <img src={url} alt={nombre || 'captura'} style={{ maxWidth: '100%', maxHeight: alto, borderRadius: 8, display: 'block', border: '1px solid var(--line)' }} />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', textDecoration: 'none', fontSize: 13, fontWeight: 700, maxWidth: '100%' }}>
      <span aria-hidden="true">📎</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre || 'adjunto'}</span>
    </a>
  );
}
// Adjuntar al crear: pegando con Ctrl+V, arrastrándolo encima o con el botón.
function AdjuntarArchivo({ archivo, onArchivo, onError, ayuda }) {
  const [encima, setEncima] = useState(false);
  const inputRef = useRef(null);
  async function tomar(file) {
    const { archivo: a, error } = await aceptarArchivo(file);
    if (error) onError?.(error);
    else if (a) { onError?.(''); onArchivo(a); }
  }
  if (archivo) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg-3)' }}>
        {esImagen(archivo.mime)
          ? <img src={archivo.data} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
          : <span aria-hidden="true" style={{ fontSize: 22 }}>📎</span>}
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{archivo.nombre}</span>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => onArchivo(null)}>Quitar</button>
      </div>
    );
  }
  return (
    <div
      onDragOver={e => { e.preventDefault(); setEncima(true); }}
      onDragLeave={() => setEncima(false)}
      onDrop={e => { e.preventDefault(); setEncima(false); tomar(e.dataTransfer.files?.[0]); }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `1.5px dashed ${encima ? 'var(--purple)' : 'var(--line)'}`,
        background: encima ? 'color-mix(in oklab, var(--purple) 8%, var(--bg-3))' : 'var(--bg-3)',
        borderRadius: 10, padding: '14px 16px', textAlign: 'center', cursor: 'pointer',
      }}>
      <span className="btn btn-sm btn-outline" style={{ pointerEvents: 'none' }}>Adjuntar archivo</span>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
        {ayuda || 'Una captura, un PDF, un Excel… Pégala con Ctrl+V o arrástrala aquí. Máx. 4 MB.'}
      </div>
      <input ref={inputRef} type="file" accept={ACEPTA} style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; tomar(f); }} />
    </div>
  );
}

function fmtHora(str) {
  const d = new Date(str);
  if (isNaN(d)) return '';
  return d.toDateString() === new Date().toDateString() ? fmtHoraCorta(d) : fmtFechaHora(d);
}

// ── Respuestas guardadas ────────────────────────────────────────────────────
// Para lo que se contesta a menudo. Se eligen desde el chat y se gestionan ahí.
function RespuestasGuardadas({ onUsar, onCerrar }) {
  const [lista, setLista] = useState(null);
  const [editando, setEditando] = useState(null); // { id?, titulo, texto }
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/support/respuestas', { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { respuestas: [] })).then(d => setLista(d.respuestas || [])).catch(() => setLista([]));
  }, []);
  async function guardarLista(nueva) {
    const r = await fetch('/api/support/respuestas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ respuestas: nueva }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'No se pudo guardar.'); return false; }
    setLista(d.respuestas || []); setError(''); return true;
  }
  const campo = { width: '100%', fontFamily: 'inherit', fontSize: 13, padding: 8, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' };
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--bg-3)', padding: 10, display: 'grid', gap: 8, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: 13, flex: 1 }}>Respuestas guardadas</b>
        {!editando && <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditando({ titulo: '', texto: '' })}><I.Plus width={13} height={13} /> Nueva</button>}
        <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar} aria-label="Cerrar"><I.X width={13} height={13} /></button>
      </div>
      {lista === null && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Cargando…</span>}
      {lista?.length === 0 && !editando && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Aún no hay ninguna. Crea las que más uséis («Ya está arreglado», «¿Nos mandas una captura?»…).</span>}
      {editando ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <input style={campo} placeholder="Título (para encontrarla)" value={editando.titulo} onChange={e => setEditando(x => ({ ...x, titulo: e.target.value }))} />
          <textarea style={{ ...campo, resize: 'vertical' }} rows={4} placeholder="El texto que se pega en el mensaje" value={editando.texto} onChange={e => setEditando(x => ({ ...x, texto: e.target.value }))} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditando(null)}>Cancelar</button>
            <button type="button" className="btn btn-sm btn-primary" disabled={!editando.titulo.trim() || !editando.texto.trim()} onClick={async () => {
              const nueva = editando.id ? lista.map(x => (x.id === editando.id ? editando : x)) : [...lista, editando];
              if (await guardarLista(nueva)) setEditando(null);
            }}>Guardar</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
          {(lista || []).map(x => (
            <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px' }}>
              <button type="button" onClick={() => onUsar(x.texto)} title={x.texto}
                style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{x.titulo}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.texto}</span>
              </button>
              <button type="button" className="icon-btn" onClick={() => setEditando(x)} aria-label="Editar"><I.Edit width={13} height={13} /></button>
              <button type="button" className="icon-btn danger" aria-label="Borrar" onClick={() => {
                if (window.confirm(`¿Borrar «${x.titulo}»?`)) guardarLista(lista.filter(y => y.id !== x.id));
              }}><I.Trash width={13} height={13} /></button>
            </div>
          ))}
        </div>
      )}
      {error && <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>{error}</span>}
    </div>
  );
}

// ── Conversación de un ticket ───────────────────────────────────────────────
// Dos canales separados: 'equipo' (entre el personal) y 'creador' (con quien
// abrió el ticket). Refresca cada 5 s pidiendo solo lo nuevo. Al verla, el
// ticket queda leído para quien mira (y la campanita lo quita).
function TicketChat({ ticketId, canal, alto = 260, staff = false, onLeido }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [verRespuestas, setVerRespuestas] = useState(false);
  const [cargado, setCargado] = useState(false);
  const ultimoId = useRef(0);
  const yaMarcado = useRef(false);
  const finRef = useRef(null);
  const cajaRef = useRef(null);
  const textoRef = useRef(null);

  // El sondeo y el envío pueden traerse el mismo mensaje: se añaden por id.
  const añadir = useCallback(nuevos => {
    if (!nuevos.length) return;
    ultimoId.current = Math.max(ultimoId.current, ...nuevos.map(m => m.id));
    setMensajes(prev => {
      const vistos = new Set(prev.map(m => m.id));
      const limpios = nuevos.filter(m => !vistos.has(m.id));
      return limpios.length ? [...prev, ...limpios] : prev;
    });
  }, []);

  useEffect(() => { setMensajes([]); ultimoId.current = 0; yaMarcado.current = false; setCargado(false); }, [canal, ticketId]);

  useEffect(() => {
    let vivo = true;
    async function traer() {
      try {
        const r = await fetch(`/api/support/${ticketId}/mensajes?canal=${canal}&desde=${ultimoId.current}`, { credentials: 'include', cache: 'no-store' });
        if (!r.ok || !vivo) return;
        const d = await r.json();
        if (!vivo) return;
        añadir(d.mensajes || []);
        setCargado(true);
        // Se están viendo los mensajes: el ticket queda leído (y la campanita lo quita).
        if ((d.mensajes || []).length || !yaMarcado.current) {
          yaMarcado.current = true;
          marcarAvisosVistos([{ clave: `ticket:${ticketId}` }]);
          onLeido?.();
        }
      } catch { /* la siguiente vuelta lo arregla */ }
    }
    traer();
    // Si la pestaña no se está viendo, no se pregunta: se ahorra servidor.
    const t = setInterval(() => { if (!document.hidden) traer(); }, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, [ticketId, canal, añadir]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bajar al último mensaje solo si ya estabas abajo.
  useEffect(() => {
    const caja = cajaRef.current;
    if (!caja) return;
    if (caja.scrollHeight - caja.scrollTop - caja.clientHeight < 160) finRef.current?.scrollIntoView({ block: 'nearest' });
  }, [mensajes]);

  async function enviar(e) {
    e?.preventDefault();
    if (!texto.trim() && !archivo) return;
    setEnviando(true); setError('');
    try {
      const r = await fetch(`/api/support/${ticketId}/mensajes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ canal, cuerpo: texto, archivo: archivo?.data || null, archivoNombre: archivo?.nombre || null, archivoMime: archivo?.mime || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setTexto(''); setArchivo(null);
        const rr = await fetch(`/api/support/${ticketId}/mensajes?canal=${canal}&desde=${ultimoId.current}`, { credentials: 'include', cache: 'no-store' });
        if (rr.ok) añadir((await rr.json()).mensajes || []);
      } else setError(d.error || 'No se pudo enviar.');
    } catch { setError('Error de conexión.'); }
    finally { setEnviando(false); }
  }
  async function tomarArchivo(file) {
    const { archivo: a, error: err } = await aceptarArchivo(file);
    if (err) setError(err);
    else if (a) { setError(''); setArchivo(a); }
  }
  async function pegar(e) {
    const f = archivoDelPortapapeles(e);
    if (!f) return;
    e.preventDefault();
    await tomarArchivo(f);
  }
  function usarRespuesta(t) {
    setTexto(x => (x.trim() ? `${x.trimEnd()}\n\n${t}` : t));
    setVerRespuestas(false);
    requestAnimationFrame(() => textoRef.current?.focus());
  }

  return (
    <div>
      <div ref={cajaRef} style={{ height: alto, overflowY: 'auto', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
        {cargado && !mensajes.length && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Todavía no hay mensajes en esta conversación.</p>}
        {!cargado && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Cargando…</p>}
        {mensajes.map(m => (
          <div key={m.id} style={{ justifySelf: m.mio ? 'end' : 'start', maxWidth: '85%', minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 2, textAlign: m.mio ? 'right' : 'left' }}>
              {m.mio ? 'Tú' : m.autor} · {fmtHora(m.createdAt)}
            </div>
            <div style={{ background: m.mio ? 'var(--purple)' : 'var(--bg-2)', color: m.mio ? 'white' : 'var(--ink)', border: m.mio ? 'none' : '1px solid var(--line)', borderRadius: 12, padding: '8px 12px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {m.cuerpo}
              {m.tieneArchivo && (
                <div style={{ marginTop: m.cuerpo ? 8 : 0 }}>
                  <Adjunto url={`/api/support/mensajes/${m.id}/archivo`} nombre={m.archivoNombre} mime={m.archivoMime} />
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={finRef} />
      </div>

      <form onSubmit={enviar} style={{ marginTop: 10 }}>
        {verRespuestas && <RespuestasGuardadas onUsar={usarRespuesta} onCerrar={() => setVerRespuestas(false)} />}
        {archivo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12, color: 'var(--ink-2)' }}>
            {esImagen(archivo.mime) ? <img src={archivo.data} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} /> : <span aria-hidden="true">📎</span>}
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{archivo.nombre}</span>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setArchivo(null)}>Quitar</button>
          </div>
        )}
        <textarea ref={textoRef} value={texto} onChange={e => setTexto(e.target.value)} rows={3} onPaste={pegar}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviar(e); }}
          placeholder="Escribe un mensaje… (Ctrl+V pega una captura, Ctrl+Enter envía)"
          aria-label="Mensaje"
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 14, padding: 10, background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
          <label className="btn btn-sm btn-outline" style={{ cursor: 'pointer' }} title="Adjuntar un archivo (imagen, PDF, Excel…)">
            📎 Adjuntar<input type="file" accept={ACEPTA} style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; tomarArchivo(f); }} />
          </label>
          {staff && (
            <button type="button" className={`btn btn-sm ${verRespuestas ? 'btn-primary' : 'btn-outline'}`} onClick={() => setVerRespuestas(v => !v)}>
              Respuestas guardadas
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button type="submit" className="btn btn-sm btn-primary" disabled={enviando || (!texto.trim() && !archivo)}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
        {error && <p style={{ color: 'var(--orange)', fontSize: 12, fontWeight: 600, margin: '6px 0 0' }}>{error}</p>}
      </form>
    </div>
  );
}

// ── Historial de un ticket ──────────────────────────────────────────────────
function Historial({ ticketId, recarga }) {
  const [lista, setLista] = useState(null);
  useEffect(() => {
    fetch(`/api/support/${ticketId}/historial`, { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { historial: [] })).then(d => setLista(d.historial || [])).catch(() => setLista([]));
  }, [ticketId, recarga]);
  if (lista === null) return <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>Cargando…</p>;
  if (!lista.length) return <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>Sin cambios apuntados todavía (el historial empezó a guardarse con esta versión).</p>;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {lista.map((h, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-3)' }}>
          <span style={{ color: 'var(--ink-3)', minWidth: 112 }}>{fmtDateTime(h.fecha)}</span>
          <b>{h.quien || 'Automático'}</b>
          <span style={{ color: 'var(--ink-2)', minWidth: 0 }}>
            {h.campo === 'creado' ? h.despues
              : <>cambió <b>{h.campo}</b>: {h.antes || '—'} → <b>{h.despues || '—'}</b></>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Resumen de cómo va el soporte ───────────────────────────────────────────
function ResumenSoporte({ onAbrir }) {
  const [dias, setDias] = useState(7);
  const [d, setD] = useState(null);
  useEffect(() => {
    setD(null);
    fetch(`/api/support/resumen?dias=${dias}`, { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(setD).catch(() => setD(false));
  }, [dias]);
  const horas = (v) => (v == null ? '—' : v < 48 ? `${v} h` : `${Math.round(v / 24)} días`);
  const tarjeta = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px' };
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Últimos</span>
        {[7, 30, 90].map(n => <button key={n} className={`filter-pill ${dias === n ? 'is-active' : ''}`} onClick={() => setDias(n)}>{n} días</button>)}
      </div>
      {d === null && <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cargando…</p>}
      {d === false && <p style={{ fontSize: 13, color: 'var(--orange)' }}>No se ha podido cargar el resumen.</p>}
      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {[
              ['Entraron', d.entraron, 'var(--purple)'], ['Resueltos', d.resueltos, 'var(--teal)'],
              ['Abiertos ahora', d.abiertos, '#ccac00'], ['Sin asignar', d.sinAsignar, 'var(--orange)'],
              ['Vencidos', d.vencidos, '#E5484D'], [`Parados (+${d.diasParado} días)`, d.parados, 'var(--orange)'],
              ['1ª respuesta (mediana)', horas(d.horasResponder), 'var(--ink)'], ['Resolver (mediana)', horas(d.horasResolver), 'var(--ink)'],
            ].map(([k, v, c]) => (
              <div key={k} style={tarjeta}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)' }}>{k}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: c }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
            <div style={tarjeta}>
              <b style={{ fontSize: 14 }}>Por persona</b>
              {!d.porPersona.length && <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '8px 0 0' }}>Nadie tiene tickets asignados.</p>}
              <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                {d.porPersona.map(p => (
                  <div key={p.id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--line-2)' }}>
                    <span style={{ flex: 1, fontWeight: 700 }}>{p.nombre}</span>
                    <span title="Abiertos">{p.abiertos} abiertos</span>
                    {p.vencidos > 0 && <span style={{ color: '#E5484D', fontWeight: 700 }}>{p.vencidos} vencidos</span>}
                    <span style={{ color: 'var(--teal)', fontWeight: 700 }}>{p.resueltos} resueltos</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={tarjeta}>
              <b style={{ fontSize: 14 }}>Qué ha entrado</b>
              {!d.porCategoria.length && <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '8px 0 0' }}>No ha entrado nada.</p>}
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                {d.porCategoria.map(c => {
                  const max = Math.max(...d.porCategoria.map(x => x.n));
                  const color = CATEGORIAS[c.categoria]?.color || 'var(--ink-3)';
                  return (
                    <div key={c.categoria} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 30px', gap: 8, alignItems: 'center', fontSize: 13 }}>
                      <span>{c.nombre}</span>
                      <span style={{ height: 10, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${(c.n / max) * 100}%`, background: color }} />
                      </span>
                      <b style={{ textAlign: 'right' }}>{c.n}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {d.listaParados.length > 0 && (
            <div style={tarjeta}>
              <b style={{ fontSize: 14 }}>Atascados: más de {d.diasParado} días sin moverse</b>
              <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                {d.listaParados.map(p => (
                  <button key={p.id} type="button" onClick={() => onAbrir(p.id)}
                    style={{ display: 'flex', gap: 8, textAlign: 'left', fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
                    <b style={{ color: 'var(--purple)' }}>#{p.id}</b>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.asunto}</span>
                    <span style={{ color: 'var(--orange)', fontWeight: 700, whiteSpace: 'nowrap' }}>{p.dias} días</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Una tarjeta de ticket (lista y tablero) ─────────────────────────────────
function TarjetaTicket({ t, diasParado, compacta = false, marcado, onMarcar, onAbrir, arrastrable = false }) {
  const est = ESTADOS[estadoDe(t)];
  const prioColor = PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.low;
  const cat = CATEGORIAS[t.categoria];
  const vencido = esVencido(t), parado = esParado(t, diasParado);
  return (
    <div
      draggable={arrastrable}
      onDragStart={arrastrable ? (e => { e.dataTransfer.setData('text/plain', String(t.id)); e.dataTransfer.effectAllowed = 'move'; }) : undefined}
      onClick={() => onAbrir(t)}
      onKeyDown={e => { if (e.key === 'Enter') onAbrir(t); }}
      tabIndex={0}
      role="button"
      aria-label={`Ticket ${t.id}: ${t.subject}`}
      style={{
        background: "var(--bg-2)", border: `1px solid ${marcado ? 'var(--purple)' : 'var(--line)'}`, borderRadius: 14,
        padding: compacta ? "10px 12px" : "14px 18px", cursor: "pointer", borderLeft: `5px solid ${prioColor}`,
        transition: "box-shadow var(--tx-base) ease", display: "grid", gap: 6, minWidth: 0,
        boxShadow: marcado ? '0 0 0 2px color-mix(in oklab, var(--purple) 30%, transparent)' : 'none',
      }}
      onMouseEnter={e => { if (!marcado) e.currentTarget.style.boxShadow = "var(--shadow)"; }}
      onMouseLeave={e => { if (!marcado) e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {onMarcar && (
          <input type="checkbox" checked={!!marcado} aria-label={`Seleccionar el ticket ${t.id}`}
            onClick={e => e.stopPropagation()} onChange={() => onMarcar(t.id)}
            style={{ width: 16, height: 16, accentColor: 'var(--purple)', margin: 0 }} />
        )}
        <span style={{ fontWeight: 800, color: "var(--purple)", fontSize: 13 }}>#{t.id}</span>
        {!compacta && <span style={chip(est.color, { textTransform: 'uppercase', letterSpacing: '.04em' })}>{est.label}</span>}
        {cat && <span style={chip(cat.color)}>{cat.label}</span>}
        <span style={chip(prioColor, { textTransform: 'uppercase' })}>{PRIORITY_LABEL[t.priority] || t.priority}</span>
        {t.sin_leer > 0 && <span style={chip('var(--purple)', { background: 'var(--purple)', color: '#fff' })} title="Mensajes que no has leído">● {t.sin_leer} sin leer</span>}
        {vencido && <span style={chip('#E5484D')}>Vencido</span>}
        {!vencido && parado && <span style={chip('var(--orange)')} title="Sin cambios ni mensajes">Parado {diasSinMoverse(t)} días</span>}
        {t.recurrencia && <span style={chip('var(--purple)')} title={`Se repite: ${RECUR_LABEL[t.recurrencia] || t.recurrencia}`}>🔁 {RECUR_LABEL[t.recurrencia] || t.recurrencia}</span>}
        {!compacta && appsDe(t).filter(a => a !== 'Aim Education').map(l => <span key={l} style={chip('var(--ink-3)')}>{l}</span>)}
      </div>
      <div style={{ fontWeight: 700, fontSize: compacta ? 14 : 15, color: "var(--ink)", lineHeight: 1.35 }}>{t.subject}</div>
      {!compacta && <div style={{ fontSize: 13, color: "var(--ink-2)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.description}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--ink-3)" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
          {!compacta && <span>De {t.name} {t.surname || ''}</span>}
          <span title={fmtDateTime(t.created_at)}>{hace(t.created_at)}</span>
          {t.due_date && <span style={{ color: vencido ? '#E5484D' : 'var(--orange)', fontWeight: 700 }}>Vence {fmtDue(t.due_date)}</span>}
          {(t.msgs_equipo + t.msgs_creador) > 0 && <span title="Mensajes">💬 {t.msgs_equipo + t.msgs_creador}</span>}
        </div>
        <span style={{ fontWeight: 600 }}>{nombresEncargados(t) ? `→ ${nombresEncargados(t)}` : 'Sin asignar'}</span>
      </div>
    </div>
  );
}

export function AdminSupport({ user, ticketId = null, enlace = null }) {
  const [tickets, setTickets] = useState([]);
  const [superadmins, setSuperadmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [soloMios, setSoloMios] = useState(false);
  const [diasParado, setDiasParado] = useState(7);

  const [activeTab, setActiveTab] = useState('list');      // list | resumen | recientes | create
  const [vista, setVista] = useState(() => { try { return localStorage.getItem('soporte-vista') || 'lista'; } catch { return 'lista'; } });
  // Filtros.
  const [fEstado, setFEstado] = useState('activos');       // activos | abierto | en_curso | esperando | resolved | closed | todos
  const [fCategoria, setFCategoria] = useState('todas');
  const [fPrioridad, setFPrioridad] = useState('todas');
  const [fApp, setFApp] = useState('todas');
  const [fQuien, setFQuien] = useState('todos');           // todos | mios | sin | <id>
  const [fRapido, setFRapido] = useState('');               // '' | sinLeer | vencidos | parados
  const [orden, setOrden] = useState('entrega');            // entrega | prioridad | recientes | antiguos | movidos
  const [busqueda, setBusqueda] = useState('');
  const [idsEnMensajes, setIdsEnMensajes] = useState([]);   // tickets cuya conversación casa con la búsqueda
  const [marcados, setMarcados] = useState(new Set());
  const [lote, setLote] = useState({ estado: '', priority: '', categoria: '', quien: '' });

  // Alta.
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [archivoAlta, setArchivoAlta] = useState(null);
  const [nuevaPrioridad, setNuevaPrioridad] = useState('low');
  const [nuevaCategoria, setNuevaCategoria] = useState('');
  const [nuevosAsignados, setNuevosAsignados] = useState([]);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [nuevasApps, setNuevasApps] = useState(['Aim Education']);
  const [nuevaRecurrencia, setNuevaRecurrencia] = useState('');

  // El ticket abierto y su gestión interna (lo que se edita, aparte del guardado).
  const [selected, setSelected] = useState(null);
  const [edit, setEdit] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');
  const [aviso, setAviso] = useState('');
  const [chatCanal, setChatCanal] = useState(null);         // null | equipo | creador
  const [vinculando, setVinculando] = useState('');
  const [verHistorial, setVerHistorial] = useState(false);
  const [recargaHist, setRecargaHist] = useState(0);
  const [arrastrandoSobre, setArrastrandoSobre] = useState(null);

  const fetchTickets = useCallback((silencioso = false) => {
    if (!silencioso) setLoading(true);
    return fetch('/api/support', { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { tickets: [] }))
      .then(d => {
        setTickets(d.tickets || []); setSoloMios(!!d.soloMios); if (d.diasParado) setDiasParado(d.diasParado);
        setLoading(false);
        return d.tickets || [];
      })
      .catch(() => { setLoading(false); return []; });
  }, []);

  useEffect(() => {
    fetchTickets();
    fetch('/api/admin/superadmins', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { superadmins: [] }))
      .then(d => setSuperadmins(d.superadmins || []))
      .catch(() => {});
  }, [fetchTickets]);
  // Al volver a la pestaña, al día (por si alguien ha escrito o cambiado algo).
  useEffect(() => {
    const f = () => { if (!document.hidden) fetchTickets(true); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [fetchTickets]);
  useEffect(() => { try { localStorage.setItem('soporte-vista', vista); } catch { /* sin almacenamiento */ } }, [vista]);

  // Buscar también dentro de las conversaciones (a partir de 3 letras).
  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 3 || /^#?\d+$/.test(q)) { setIdsEnMensajes([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/support/buscar?q=${encodeURIComponent(q)}`, { credentials: 'include' })
        .then(r => (r.ok ? r.json() : { ids: [] })).then(d => setIdsEnMensajes(d.ids || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  // /admin/soporte/180 abre ese ticket en cuanto cargue y vuelve a /admin/soporte
  // (si no, al volver a Soporte se abría otra vez, ticket #335).
  const { go } = useRouter() || {};
  const abiertoPorEnlace = useRef(null);
  useEffect(() => {
    if (!ticketId) { abiertoPorEnlace.current = null; return; }
    if (abiertoPorEnlace.current === ticketId || loading) return;
    abiertoPorEnlace.current = ticketId;
    const t = tickets.find(x => x.id === ticketId);
    if (t) openTicket(t);
    else avisar(`El ticket #${ticketId} no existe o no es tuyo.`);
    go?.('/admin/soporte', { replace: true });
  }, [ticketId, tickets, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Desde un aviso de la campanita: la lista ya filtrada.
  useEffect(() => {
    const f = enlace?.seg?.[1] === 'soporte' ? enlace.params?.filtro : null;
    if (!f) return;
    setSelected(null); setActiveTab('list'); setFEstado('activos'); setBusqueda(''); setFRapido(''); setFQuien('todos');
    if (f === 'mios') setFQuien('mios');
    if (f === 'sin_asignar') setFQuien('sin');
    if (f === 'mensajes') setFRapido('sinLeer');
    if (f === 'vencidos') { setFQuien('mios'); setFRapido('vencidos'); }
    if (f === 'parados') { setFQuien('mios'); setFRapido('parados'); }
  }, [enlace?.ruta]); // eslint-disable-line react-hooks/exhaustive-deps

  function avisar(texto) {
    setAviso(texto);
    setTimeout(() => setAviso(''), 2800);
  }

  function openTicket(t) {
    setSelected(t);
    setEdit({
      priority: t.priority || 'low', categoria: t.categoria || '',
      asignados: encargadosDe(t).map(a => a.id), dueDate: t.due_date ? String(t.due_date).slice(0, 10) : '',
      recurrencia: t.recurrencia || '', apps: appsDe(t),
    });
    setUpdateMsg(''); setChatCanal(null); setVerHistorial(false); setVinculando('');
  }
  const abrirPorId = (id) => { const t = tickets.find(x => x.id === id); if (t) openTicket(t); };

  // Guarda SOLO lo que se manda: cambiar el estado ya no guarda lo que se esté
  // tocando a medias en la gestión interna, ni cierra la ventana.
  async function guardar(id, cambios, texto) {
    setUpdating(true); setUpdateMsg('');
    try {
      const r = await fetch(`/api/support/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(cambios),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setUpdateMsg(d.error || 'No se ha podido guardar.'); return false; }
      const lista = await fetchTickets(true);
      const nuevo = lista.find(x => x.id === id);
      if (nuevo && selected?.id === id) setSelected(nuevo);
      setRecargaHist(x => x + 1);
      avisar(d.siguienteId ? `${texto} Se ha creado el siguiente: #${d.siguienteId}.` : texto);
      return true;
    } catch { setUpdateMsg('Error de conexión.'); return false; }
    finally { setUpdating(false); }
  }
  const cambiarEstado = (t, clave) => guardar(t.id, ESTADOS[clave].cambio, `#${t.id}: ${ESTADOS[clave].label}.`);

  // Lo que ha cambiado en la gestión interna respecto a lo guardado.
  const cambiosInternos = useMemo(() => {
    if (!selected || !edit) return {};
    const c = {};
    if (edit.priority !== (selected.priority || 'low')) c.priority = edit.priority;
    if ((edit.categoria || '') !== (selected.categoria || '')) c.categoria = edit.categoria || null;
    if (edit.asignados.join(',') !== encargadosDe(selected).map(a => a.id).join(',')) c.assignedIds = edit.asignados;
    if ((edit.dueDate || '') !== (selected.due_date ? String(selected.due_date).slice(0, 10) : '')) c.dueDate = edit.dueDate || null;
    if ((edit.recurrencia || '') !== (selected.recurrencia || '')) c.recurrencia = edit.recurrencia || null;
    if (edit.apps.join(',') !== appsDe(selected).join(',')) c.appLabel = edit.apps;
    return c;
  }, [selected, edit]);
  const hayCambios = Object.keys(cambiosInternos).length > 0;
  function cerrarModal() {
    if (hayCambios && !window.confirm('Tienes cambios sin guardar en la gestión interna. ¿Cerrar sin guardarlos?')) return;
    setSelected(null);
  }
  // Escape cierra (preguntando si hay cambios sin guardar).
  useEffect(() => {
    if (!selected) return;
    const f = (e) => { if (e.key === 'Escape') { if (chatCanal) setChatCanal(null); else cerrarModal(); } };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [selected, chatCanal, hayCambios]); // eslint-disable-line react-hooks/exhaustive-deps

  async function vincular(t) {
    const n = Number(String(vinculando).replace('#', '').trim());
    if (!Number.isInteger(n)) { avisar('Escribe el número del ticket.'); return; }
    try {
      const r = await fetch(`/api/support/${t.id}/vincular`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ticketId: n }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setVinculando(''); avisar(`Vinculado con el #${n}.`);
        const lista = await fetchTickets(true);
        const nuevo = lista.find(x => x.id === t.id); if (nuevo) setSelected(nuevo);
      } else avisar(d.error || 'No se pudo vincular.');
    } catch { avisar('Error de conexión.'); }
  }
  async function desvincular(t) {
    if (!window.confirm(`¿Sacar el ticket #${t.id} de su grupo?`)) return;
    try {
      const r = await fetch(`/api/support/${t.id}/vincular`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) {
        avisar('Desvinculado.');
        const lista = await fetchTickets(true);
        const nuevo = lista.find(x => x.id === t.id); if (nuevo) setSelected(nuevo);
      }
    } catch { avisar('Error de conexión.'); }
  }
  async function copiarEnlace(t) {
    avisar(await copiarAlPortapapeles(`${window.location.origin}/admin/soporte/${t.id}`) ? 'Enlace copiado.' : 'No se pudo copiar.');
  }
  async function copiarTicket(t) {
    avisar(await copiarAlPortapapeles(ticketATexto(t)) ? `Ticket #${t.id} copiado.` : 'No se pudo copiar.');
  }

  async function submitTicket(e) {
    e.preventDefault();
    setSubmitting(true); setSubmitMsg('');
    try {
      const r = await fetch('/api/support', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          subject, description,
          adjunto: archivoAlta?.data || null, adjuntoNombre: archivoAlta?.nombre || null, adjuntoMime: archivoAlta?.mime || null,
          priority: nuevaPrioridad, categoria: nuevaCategoria || null, assignedIds: nuevosAsignados,
          dueDate: nuevaFecha || null, appLabel: nuevasApps.length ? nuevasApps : ['Aim Education'],
          recurrencia: nuevaRecurrencia || null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.success) {
        setSubject(''); setDescription(''); setArchivoAlta(null);
        setNuevaPrioridad('low'); setNuevaCategoria(''); setNuevosAsignados([]); setNuevaFecha(''); setNuevasApps(['Aim Education']); setNuevaRecurrencia('');
        await fetchTickets(true);
        setActiveTab('list');
        avisar(`Ticket #${d.ticketId} creado.`);
      } else setSubmitMsg(d.error || 'Error al crear el ticket.');
    } catch { setSubmitMsg('Error de conexión.'); }
    finally { setSubmitting(false); }
  }
  async function pegarEnAlta(e) {
    const f = archivoDelPortapapeles(e);
    if (!f) return;
    e.preventDefault();
    const { archivo, error } = await aceptarArchivo(f);
    if (error) setSubmitMsg(error);
    else { setSubmitMsg(''); setArchivoAlta(archivo); }
  }

  // ── Filtrado ──
  const filtrar = useCallback((lista, { conEstado = true } = {}) => {
    const q = busqueda.trim().toLowerCase();
    const enMensajes = new Set(idsEnMensajes);
    const casa = t => {
      if (!q) return true;
      if (q.replace('#', '') === String(t.id)) return true;
      if (enMensajes.has(t.id)) return true;
      return [t.subject, t.description, t.dev_response, t.name, t.surname, t.email, nombresEncargados(t)]
        .some(v => (v || '').toString().toLowerCase().includes(q));
    };
    const peso = { high: 3, medium: 2, low: 1 };
    return lista
      .filter(t => casa(t)
        && (!conEstado || fEstado === 'todos' || (fEstado === 'activos' ? t.status === 'open' : estadoDe(t) === fEstado))
        && (fCategoria === 'todas' || (fCategoria === 'sin' ? !t.categoria : t.categoria === fCategoria))
        && (fPrioridad === 'todas' || t.priority === fPrioridad)
        && (fApp === 'todas' || appsDe(t).includes(fApp))
        && (fQuien === 'todos' || (fQuien === 'mios' ? esEncargado(t, user?.id) : fQuien === 'sin' ? sinEncargado(t) : esEncargado(t, fQuien)))
        && (!fRapido || (fRapido === 'sinLeer' ? t.sin_leer > 0 : fRapido === 'vencidos' ? esVencido(t) : esParado(t, diasParado))))
      .sort((a, b) => {
        const porPrioridad = () => (peso[b.priority] || 0) - (peso[a.priority] || 0);
        const cuando = (t) => (t.due_date ? new Date(t.due_date).getTime() : Infinity);
        if (orden === 'entrega') return (cuando(a) - cuando(b)) || porPrioridad() || (b.id - a.id);
        if (orden === 'prioridad') return porPrioridad() || (cuando(a) - cuando(b)) || (b.id - a.id);
        if (orden === 'movidos') return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
        if (orden === 'antiguos') return a.id - b.id;
        return b.id - a.id;
      });
  }, [busqueda, idsEnMensajes, fEstado, fCategoria, fPrioridad, fApp, fQuien, fRapido, orden, diasParado, user?.id]);

  const filtered = useMemo(() => filtrar(tickets), [filtrar, tickets]);
  const abiertos = tickets.filter(t => t.status === 'open');
  const cuenta = {
    sinLeer: abiertos.filter(t => t.sin_leer > 0).length,
    vencidos: abiertos.filter(esVencido).length,
    parados: abiertos.filter(t => esParado(t, diasParado)).length,
    urgentes: abiertos.filter(t => t.priority === 'high').length,
  };
  const hayFiltros = fEstado !== 'activos' || fCategoria !== 'todas' || fPrioridad !== 'todas' || fApp !== 'todas' || fQuien !== 'todos' || fRapido || busqueda;
  function limpiarFiltros() {
    setFEstado('activos'); setFCategoria('todas'); setFPrioridad('todas'); setFApp('todas'); setFQuien('todos'); setFRapido(''); setBusqueda('');
  }

  // Lo terminado en los últimos 3 días.
  const recientes = tickets
    .filter(t => ['resolved', 'closed'].includes(t.status) && t.resolved_at && Date.now() - new Date(t.resolved_at).getTime() <= 72 * 3600 * 1000)
    .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at));

  // ── Selección y acciones sobre varios ──
  const alternarMarcado = (id) => setMarcados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function aplicarLote() {
    const cambios = {};
    if (lote.estado) Object.assign(cambios, ESTADOS[lote.estado].cambio);
    if (lote.priority) cambios.priority = lote.priority;
    if (lote.categoria) cambios.categoria = lote.categoria === 'sin' ? null : lote.categoria;
    if (lote.quien) cambios.assignedIds = lote.quien === 'sin' ? [] : [lote.quien];
    if (!Object.keys(cambios).length) { avisar('Elige qué cambiar.'); return; }
    const ids = [...marcados];
    if (!window.confirm(`¿Cambiar ${ids.length} ticket${ids.length !== 1 ? 's' : ''}?`)) return;
    try {
      const r = await fetch('/api/support/lote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ids, cambios }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { avisar(d.error || 'No se ha podido.'); return; }
      avisar(`${d.cambiados} ticket${d.cambiados !== 1 ? 's' : ''} cambiado${d.cambiados !== 1 ? 's' : ''}.`);
      setMarcados(new Set()); setLote({ estado: '', priority: '', categoria: '', quien: '' });
      fetchTickets(true);
    } catch { avisar('Error de conexión.'); }
  }

  // ── Exportar / copiar ──
  function exportPDF() {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<style>
      #support-print-root{font-family:sans-serif;padding:20px;color:#333}
      #support-print-root h1{color:#5233A8;border-bottom:2px solid #5233A8;padding-bottom:8px}
      #support-print-root .ticket{border:1px solid #ddd;border-radius:8px;padding:15px;margin-bottom:18px;page-break-inside:avoid}
      #support-print-root .subject{font-size:17px;font-weight:bold;margin:8px 0}
      #support-print-root .meta{font-size:12px;color:#666;display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#f9f9f9;padding:10px;border-radius:4px;margin-top:10px}
    </style>
    <h1>Reporte de Soporte — Aim Education</h1>
    <p style="color:#666;font-size:13px">Generado: ${fmtFechaHora(new Date())} · ${filtered.length} tickets</p>
    ${filtered.map(t => `
      <div class="ticket">
        <div><strong style="color:#5233A8">#${t.id}</strong> · ${esc(ESTADOS[estadoDe(t)].label)} · Prioridad ${esc(PRIORITY_LABEL[t.priority] || t.priority)}${t.categoria ? ` · ${esc(CATEGORIAS[t.categoria]?.label)}` : ''}</div>
        <div class="subject">${esc(t.subject)}</div>
        <div style="font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(t.description)}</div>
        <div class="meta">
          <div><strong>Creado por:</strong><br>${esc(t.name)} ${esc(t.surname || '')}</div>
          <div><strong>Encargados:</strong><br>${esc(nombresEncargados(t) || 'Sin asignar')}</div>
          <div><strong>Creado:</strong><br>${fmtDate(t.created_at)}</div>
          <div><strong>Fecha límite:</strong><br>${t.due_date ? fmtDate(t.due_date) : 'Sin fecha'}</div>
        </div>
      </div>`).join('')}`;
    const style = document.createElement('style');
    style.id = 'support-print-style';
    style.innerHTML = `@media print { body > *:not(#support-print-root) { display: none !important; } #support-print-root { display: block !important; position: static; background: white; } } #support-print-root { display: none; }`;
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.id = 'support-print-root';
    el.innerHTML = html;
    document.body.appendChild(el);
    window.print();
    setTimeout(() => { document.getElementById('support-print-style')?.remove(); document.getElementById('support-print-root')?.remove(); }, 1000);
  }
  async function copyText() {
    let text = `REPORTE DE TICKETS — ${fmtFecha(new Date())} · ${filtered.length} tickets\n${'─'.repeat(50)}\n\n`;
    filtered.forEach(t => { text += ticketATexto(t) + `\n${'─'.repeat(50)}\n\n`; });
    avisar(await copiarAlPortapapeles(text) ? `${filtered.length} ticket${filtered.length !== 1 ? 's' : ''} copiado${filtered.length !== 1 ? 's' : ''}.` : 'No se pudo copiar.');
  }

  // Tablero: por atender, en curso, esperando y lo hecho en la última semana.
  const COLUMNAS = [
    { id: 'abierto', titulo: 'Por atender', de: t => estadoDe(t) === 'abierto' },
    { id: 'en_curso', titulo: 'En curso', de: t => estadoDe(t) === 'en_curso' },
    { id: 'esperando', titulo: 'Esperando respuesta', de: t => estadoDe(t) === 'esperando' },
    { id: 'resolved', titulo: 'Hecho (7 días)', de: t => ['resolved', 'closed'].includes(t.status) && t.resolved_at && Date.now() - new Date(t.resolved_at).getTime() <= 7 * 86400000 },
  ];
  const paraTablero = useMemo(() => filtrar(tickets, { conEstado: false }), [filtrar, tickets]);
  async function soltarEn(columna, e) {
    e.preventDefault(); setArrastrandoSobre(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    const t = tickets.find(x => x.id === id);
    if (!t || estadoDe(t) === columna || (columna === 'resolved' && ['resolved', 'closed'].includes(t.status))) return;
    await cambiarEstado(t, columna);
  }

  const vinculoId = selected ? (tickets.find(t => t.id === selected.id)?.vinculo_id ?? selected.vinculo_id) : null;
  const hermanos = vinculoId ? tickets.filter(t => t.vinculo_id === vinculoId && t.id !== selected.id) : [];
  const estSel = selected ? estadoDe(selected) : null;

  return (
    <>
      {aviso && (
        <div role="status" style={{position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 3000, background: "var(--ink)", color: "var(--bg-2)", padding: "10px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, boxShadow: "var(--shadow)", maxWidth: "calc(100vw - 32px)"}}>
          {aviso}
        </div>
      )}

      {/* Pestañas y números de lo que queda por hacer */}
      <div style={{display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap", alignItems: "center"}}>
        {[
          ['list', `Tickets · ${abiertos.length} abiertos`],
          ...(!soloMios ? [['resumen', 'Resumen']] : []),
          ['recientes', `Hechos (72 h) · ${recientes.length}`],
        ].map(([id, label]) => (
          <button key={id} className={`filter-pill ${activeTab === id ? "is-active" : ""}`} onClick={() => setActiveTab(id)} style={{whiteSpace: "nowrap"}}>{label}</button>
        ))}
        <div style={{flex: 1}} />
        <button className={`btn btn-sm ${activeTab === 'create' ? 'btn-primary' : 'btn-gradient'}`} onClick={() => setActiveTab('create')}><I.Plus width={14} height={14} /> Nuevo ticket</button>
      </div>

      {activeTab === 'resumen' && <ResumenSoporte onAbrir={(id) => { setActiveTab('list'); abrirPorId(id); }} />}

      {activeTab === 'create' && (
        <div className="panel" style={{maxWidth: 680}}>
          <h2>Nuevo ticket</h2>
          <p className="sub">Un error, una mejora o una tarea interna. Puedes pegar una captura con Ctrl+V en cualquier sitio del formulario.</p>
          <form onSubmit={submitTicket} onPaste={pegarEnAlta}>
            <div className="field" style={{marginTop: 16}}>
              <label>Asunto</label>
              <input placeholder="Ej. No se puede pasar lista desde el móvil" value={subject} onChange={e => setSubject(e.target.value)} required maxLength={255} />
            </div>
            <div className="field">
              <label>Descripción</label>
              <textarea placeholder="Qué pasa, dónde, cómo reproducirlo…" value={description} onChange={e => setDescription(e.target.value)} required rows={6} style={{width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 14, padding: 12, background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--ink)"}} />
            </div>
            <div className="field">
              <label>Adjunto (opcional)</label>
              <AdjuntarArchivo archivo={archivoAlta} onArchivo={setArchivoAlta} onError={m => setSubmitMsg(m)} />
            </div>

            <div style={{marginTop: 6, padding: 14, background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 12, display: "grid", gap: 14}}>
              <span style={{fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)"}}>Gestión interna</span>
              <div>
                <p style={cabecillaCss}>Categoría</p>
                <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
                  <button type="button" onClick={() => setNuevaCategoria('')} style={pillCss(!nuevaCategoria)}>Sin categoría</button>
                  {Object.entries(CATEGORIAS).map(([k, c]) => <button key={k} type="button" onClick={() => setNuevaCategoria(k)} style={pillCss(nuevaCategoria === k)}>{c.label}</button>)}
                </div>
              </div>
              <div>
                <p style={cabecillaCss}>Prioridad</p>
                <div style={{display: "flex", gap: 8}}>
                  {['low', 'medium', 'high'].map(p => (
                    <button key={p} type="button" onClick={() => setNuevaPrioridad(p)}
                      style={{flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid var(--line)", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit",
                        background: nuevaPrioridad === p ? PRIORITY_COLOR[p] : "var(--bg-3)", color: nuevaPrioridad === p ? (p === 'medium' ? '#000' : 'white') : "var(--ink-2)"}}>
                      {PRIORITY_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p style={cabecillaCss}>Encargados <span style={{textTransform: "none", letterSpacing: 0, fontWeight: 600}}>· puedes marcar varios</span></p>
                <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
                  <button type="button" onClick={() => setNuevosAsignados([])} style={pillCss(!nuevosAsignados.length)}>Sin asignar</button>
                  {superadmins.map(sa => (
                    <button key={sa.id} type="button" aria-pressed={nuevosAsignados.includes(sa.id)} onClick={() => setNuevosAsignados(l => alternarEn(l, sa.id))} style={pillCss(nuevosAsignados.includes(sa.id))}>{sa.name} {sa.surname || ''}</button>
                  ))}
                </div>
              </div>
              <div style={{display: "flex", gap: 16, flexWrap: "wrap"}}>
                <div className="field" style={{margin: 0}}>
                  <label>Fecha límite</label>
                  <input type="date" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} style={{maxWidth: 180}} />
                </div>
                <div className="field" style={{margin: 0}}>
                  <label>Se repite</label>
                  <select value={nuevaRecurrencia} onChange={e => setNuevaRecurrencia(e.target.value)} style={{...selectCss, fontSize: 14, padding: "10px 12px", background: "var(--bg-3)"}}>
                    {RECUR_OPCIONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <p style={cabecillaCss}>Aplicaciones</p>
                <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
                  {APPS.map(app => {
                    const sel = nuevasApps.includes(app);
                    return <button key={app} type="button" onClick={() => setNuevasApps(prev => (sel ? prev.filter(l => l !== app) : [...prev, app]))} style={pillCss(sel)}>{app}</button>;
                  })}
                </div>
              </div>
            </div>

            {submitMsg && <p style={{color: "var(--orange)", fontWeight: 600, fontSize: 13, marginBottom: 12, marginTop: 12}}>{submitMsg}</p>}
            <div style={{display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap"}}>
              <button type="submit" className="btn btn-gradient" disabled={submitting}>
                {submitting ? <span className="dot-loader" /> : <>Crear ticket <I.Arrow /></>}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setActiveTab('list')}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'recientes' && (
        <>
          <p style={{margin: "0 0 14px", fontSize: 13, color: "var(--ink-3)"}}>Resueltos o cerrados en las últimas 72 horas, del más reciente al más antiguo.</p>
          {!recientes.length && (
            <div style={{padding: 28, textAlign: "center", background: "var(--bg-2)", border: "1px dashed var(--line)", borderRadius: 14, color: "var(--ink-3)", fontSize: 14}}>Nada terminado en los últimos 3 días.</div>
          )}
          <div style={{display: "grid", gap: 10}}>
            {recientes.map(t => (
              <div key={t.id} onClick={() => openTicket(t)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') openTicket(t); }}
                style={{background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 18px", cursor: "pointer", borderLeft: `5px solid ${ESTADOS[estadoDe(t)].color}`}}>
                <div style={{display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6}}>
                  <span style={{fontWeight: 800, color: "var(--purple)", fontSize: 13}}>#{t.id}</span>
                  <span style={chip(ESTADOS[estadoDe(t)].color, { textTransform: 'uppercase' })}>{ESTADOS[estadoDe(t)].label}</span>
                  {CATEGORIAS[t.categoria] && <span style={chip(CATEGORIAS[t.categoria].color)}>{CATEGORIAS[t.categoria].label}</span>}
                  <div style={{flex: 1}} />
                  <span style={{fontSize: 12, color: "var(--ink-3)"}}>{fmtDateTime(t.resolved_at)}</span>
                </div>
                <div style={{fontWeight: 700, fontSize: 15, color: "var(--ink)"}}>{t.subject}</div>
                <div style={{fontSize: 12, color: "var(--ink-3)", marginTop: 4}}>
                  De {t.name} {t.surname || ''}{tardanza(t) ? ` · tardó ${tardanza(t)}` : ''}{nombresEncargados(t) ? ` · lo hizo ${nombresEncargados(t)}` : ''}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'list' && (
        <>
          {/* Atajos: lo que pide atención, con su número */}
          <div style={{display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12}}>
            {[
              ['sinLeer', `Sin leer · ${cuenta.sinLeer}`, 'var(--purple)'],
              ['vencidos', `Vencidos · ${cuenta.vencidos}`, '#E5484D'],
              ['parados', `Parados +${diasParado} días · ${cuenta.parados}`, 'var(--orange)'],
            ].map(([k, l, c]) => (
              <button key={k} className={`filter-pill ${fRapido === k ? 'is-active' : ''}`} onClick={() => setFRapido(f => (f === k ? '' : k))}
                style={fRapido === k ? undefined : { color: c, borderColor: `color-mix(in oklab, ${c} 35%, var(--line))` }}>{l}</button>
            ))}
            <button className={`filter-pill ${fQuien === 'mios' ? 'is-active' : ''}`} onClick={() => setFQuien(q => (q === 'mios' ? 'todos' : 'mios'))}>
              <I.User width={13} height={13} style={{verticalAlign: "middle"}} /> Los míos
            </button>
            {cuenta.urgentes > 0 && <span style={{...chip('var(--orange)'), alignSelf: 'center', padding: '4px 10px'}}>{cuenta.urgentes} urgente{cuenta.urgentes !== 1 ? 's' : ''} abierto{cuenta.urgentes !== 1 ? 's' : ''}</span>}
          </div>

          {/* Buscador y filtros: desplegables en vez de veinte botones */}
          <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(175px, 100%), 1fr))", gap: 8, marginBottom: 10, alignItems: "center"}}>
            <div style={{position: "relative", gridColumn: "1 / -1", maxWidth: 560}}>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar"
                placeholder="Buscar por nº, asunto, descripción, persona o lo que se ha dicho en el chat…"
                style={{width: "100%", fontFamily: "inherit", fontSize: 14, padding: "10px 34px 10px 14px", background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--ink)"}} />
              {busqueda && <button onClick={() => setBusqueda('')} aria-label="Limpiar la búsqueda" style={{position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, cursor: "pointer", color: "var(--ink-3)", fontSize: 16, lineHeight: 1}}>×</button>}
            </div>
            {vista === 'lista' && (
              <select value={fEstado} onChange={e => setFEstado(e.target.value)} style={selectCss} aria-label="Estado">
                <option value="activos">Abiertos (todos)</option>
                {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                <option value="todos">Cualquier estado</option>
              </select>
            )}
            <select value={fCategoria} onChange={e => setFCategoria(e.target.value)} style={selectCss} aria-label="Categoría">
              <option value="todas">Todas las categorías</option>
              {Object.entries(CATEGORIAS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
              <option value="sin">Sin categoría</option>
            </select>
            <select value={fPrioridad} onChange={e => setFPrioridad(e.target.value)} style={selectCss} aria-label="Prioridad">
              <option value="todas">Cualquier prioridad</option>
              {['high', 'medium', 'low'].map(p => <option key={p} value={p}>Prioridad {PRIORITY_LABEL[p].toLowerCase()}</option>)}
            </select>
            <select value={fQuien} onChange={e => setFQuien(e.target.value)} style={selectCss} aria-label="Encargado">
              <option value="todos">Cualquier encargado</option>
              <option value="mios">Los míos</option>
              <option value="sin">Sin asignar</option>
              {superadmins.filter(sa => sa.id !== user?.id).map(sa => <option key={sa.id} value={sa.id}>{sa.name} {sa.surname || ''}</option>)}
            </select>
            <select value={fApp} onChange={e => setFApp(e.target.value)} style={selectCss} aria-label="Aplicación">
              <option value="todas">Todas las apps</option>
              {APPS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={orden} onChange={e => setOrden(e.target.value)} style={selectCss} aria-label="Ordenar">
              <option value="entrega">Por fecha límite</option>
              <option value="prioridad">Por prioridad</option>
              <option value="movidos">Movidos hace poco</option>
              <option value="recientes">Más nuevos</option>
              <option value="antiguos">Más antiguos</option>
            </select>
          </div>
          <div style={{display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14}}>
            <span style={{fontSize: 13, color: "var(--ink-3)"}}>
              {vista === 'lista' ? `${filtered.length} ticket${filtered.length !== 1 ? 's' : ''}` : `${paraTablero.length} en el tablero`}
              {hayFiltros && <> · <button onClick={limpiarFiltros} style={{background: "none", border: 0, padding: 0, color: "var(--purple)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13}}>quitar filtros</button></>}
            </span>
            <div style={{flex: 1}} />
            <div role="group" aria-label="Vista" style={{display: "inline-flex", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden"}}>
              {[['lista', 'Lista'], ['tablero', 'Tablero']].map(([v, l]) => (
                <button key={v} onClick={() => setVista(v)} aria-pressed={vista === v}
                  style={{padding: "6px 14px", border: 0, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, background: vista === v ? "var(--ink)" : "var(--bg-2)", color: vista === v ? "var(--bg-2)" : "var(--ink-2)"}}>{l}</button>
              ))}
            </div>
            {vista === 'lista' && <button className="btn btn-sm btn-outline" onClick={() => setMarcados(m => (m.size ? new Set() : new Set(filtered.map(t => t.id))))}>{marcados.size ? 'Quitar selección' : 'Seleccionar todos'}</button>}
            <button className="btn btn-sm btn-outline" onClick={exportPDF}>PDF</button>
            <button className="btn btn-sm btn-outline" onClick={copyText}>Copiar</button>
          </div>

          {/* Acciones sobre varios */}
          {marcados.size > 0 && vista === 'lista' && (
            <div style={{position: "sticky", top: 8, zIndex: 5, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "var(--ink)", color: "var(--bg-2)", padding: "10px 12px", borderRadius: 14, marginBottom: 12, boxShadow: "var(--shadow)"}}>
              <b style={{fontSize: 13}}>{marcados.size} seleccionado{marcados.size !== 1 ? 's' : ''}</b>
              <select value={lote.estado} onChange={e => setLote(l => ({ ...l, estado: e.target.value }))} style={selectCss} aria-label="Nuevo estado">
                <option value="">Estado…</option>
                {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={lote.priority} onChange={e => setLote(l => ({ ...l, priority: e.target.value }))} style={selectCss} aria-label="Nueva prioridad">
                <option value="">Prioridad…</option>
                {['high', 'medium', 'low'].map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
              <select value={lote.categoria} onChange={e => setLote(l => ({ ...l, categoria: e.target.value }))} style={selectCss} aria-label="Nueva categoría">
                <option value="">Categoría…</option>
                {Object.entries(CATEGORIAS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                <option value="sin">Sin categoría</option>
              </select>
              <select value={lote.quien} onChange={e => setLote(l => ({ ...l, quien: e.target.value }))} style={selectCss} aria-label="Asignar a">
                <option value="">Asignar a…</option>
                <option value="sin">Nadie (sin asignar)</option>
                {superadmins.map(sa => <option key={sa.id} value={sa.id}>{sa.name} {sa.surname || ''}</option>)}
              </select>
              <button className="btn btn-sm btn-primary" onClick={aplicarLote}>Aplicar</button>
              <button className="btn btn-sm" style={{background: "transparent", color: "var(--bg-2)", border: "1px solid color-mix(in oklab, var(--bg-2) 40%, transparent)"}} onClick={() => setMarcados(new Set())}>Cancelar</button>
            </div>
          )}

          {loading && <p style={{color: "var(--ink-3)", fontSize: 14}}>Cargando tickets…</p>}

          {!loading && vista === 'lista' && (
            <>
              {!filtered.length && (
                <div style={{padding: 28, textAlign: "center", background: "var(--bg-2)", border: "1px dashed var(--line)", borderRadius: 14, color: "var(--ink-3)", fontSize: 14}}>
                  No hay tickets con estos filtros.{hayFiltros && <> <button onClick={limpiarFiltros} style={{background: "none", border: 0, color: "var(--purple)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 14}}>Quitar filtros</button></>}
                </div>
              )}
              <div style={{display: "grid", gap: 10}}>
                {filtered.map(t => <TarjetaTicket key={t.id} t={t} diasParado={diasParado} marcado={marcados.has(t.id)} onMarcar={alternarMarcado} onAbrir={openTicket} />)}
              </div>
            </>
          )}

          {!loading && vista === 'tablero' && (
            <>
              <p style={{margin: "0 0 10px", fontSize: 12, color: "var(--ink-3)"}}>Arrastra un ticket a otra columna para cambiar su estado (en el móvil, ábrelo y cámbialo arriba).</p>
              <div style={{display: "grid", gridTemplateColumns: "repeat(4, minmax(215px, 1fr))", gap: 10, overflowX: "auto", paddingBottom: 8}}>
                {COLUMNAS.map(col => {
                  const suyos = paraTablero.filter(col.de);
                  const color = ESTADOS[col.id].color;
                  return (
                    <div key={col.id}
                      onDragOver={e => { e.preventDefault(); setArrastrandoSobre(col.id); }}
                      onDragLeave={() => setArrastrandoSobre(c => (c === col.id ? null : c))}
                      onDrop={e => soltarEn(col.id, e)}
                      style={{background: arrastrandoSobre === col.id ? `color-mix(in oklab, ${color} 10%, var(--bg-3))` : "var(--bg-3)", border: `1px solid ${arrastrandoSobre === col.id ? color : 'var(--line)'}`, borderRadius: 16, padding: 10, minHeight: 200, display: "flex", flexDirection: "column", gap: 8}}>
                      <div style={{display: "flex", alignItems: "center", gap: 8, padding: "2px 4px"}}>
                        <span style={{width: 10, height: 10, borderRadius: 99, background: color}} />
                        <b style={{fontSize: 13}}>{col.titulo}</b>
                        <span style={{fontSize: 12, color: "var(--ink-3)"}}>{suyos.length}</span>
                      </div>
                      {suyos.map(t => <TarjetaTicket key={t.id} t={t} diasParado={diasParado} compacta arrastrable onAbrir={openTicket} />)}
                      {!suyos.length && <span style={{fontSize: 12, color: "var(--ink-3)", padding: "8px 4px"}}>Nada aquí.</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* El ticket abierto */}
      {selected && edit && (
        <div style={{position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center"}} onClick={e => { if (e.target === e.currentTarget) cerrarModal(); }}>
          <div role="dialog" aria-modal="true" aria-label={`Ticket ${selected.id}`} style={{
            background: "var(--bg-2)", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 760,
            maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 -8px 40px rgba(0,0,0,.3)",
          }}>
            {/* Cabecera */}
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "18px 20px 14px", borderBottom: "1px solid var(--line)"}}>
              <div style={{minWidth: 0, flex: 1}}>
                <div style={{display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap"}}>
                  <span style={{fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--purple)"}}>Ticket #{selected.id}</span>
                  <span style={chip(ESTADOS[estSel].color, { textTransform: 'uppercase' })}>{ESTADOS[estSel].label}</span>
                  {esVencido(selected) && <span style={chip('#E5484D')}>Vencido</span>}
                  {!esVencido(selected) && esParado(selected, diasParado) && <span style={chip('var(--orange)')}>Parado {diasSinMoverse(selected)} días</span>}
                </div>
                <h3 style={{margin: "4px 0 0", fontSize: 18, fontWeight: 800, wordBreak: "break-word"}}>{selected.subject}</h3>
                <p style={{margin: "4px 0 0", fontSize: 12, color: "var(--ink-3)"}}>
                  {selected.name} {selected.surname || ''} · {fmtDateTime(selected.created_at)}{hace(selected.created_at) ? ` · ${hace(selected.created_at)}` : ''}
                </p>
              </div>
              <div style={{display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end"}}>
                <button className="btn btn-sm btn-outline" onClick={() => copiarEnlace(selected)} title="Copiar el enlace directo a este ticket">Enlace</button>
                <button className="btn btn-sm btn-outline" onClick={() => copiarTicket(selected)} title="Copiar este ticket como texto">Copiar</button>
                <button onClick={cerrarModal} aria-label="Cerrar" style={{background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: "var(--ink)"}}><I.X /></button>
              </div>
            </div>

            <div style={{overflowY: "auto", padding: "16px 20px", flex: 1}}>
            {chatCanal ? (
              <>
                <button onClick={() => setChatCanal(null)} style={{background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--purple)", fontWeight: 700, fontSize: 13, fontFamily: "inherit", marginBottom: 12}}>← Volver al ticket</button>
                <details style={{background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px", marginBottom: 12}}>
                  <summary style={{cursor: "pointer", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)"}}>Motivo del ticket</summary>
                  <p style={{margin: "8px 0 0", fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6, whiteSpace: "pre-wrap"}}>{selected.description}</p>
                </details>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap"}}>
                  <p style={{margin: 0, fontSize: 13, fontWeight: 800}}>{chatCanal === 'equipo' ? 'Equipo' : `Con ${selected.name} ${selected.surname || ''}`}</p>
                  <span style={{fontSize: 11, color: "var(--ink-3)"}}>{chatCanal === 'equipo' ? 'Privado: quien abrió el ticket no lo ve.' : 'Lo ve quien abrió el ticket, y le llega un aviso.'}</span>
                </div>
                <TicketChat ticketId={selected.id} canal={chatCanal} alto={360} staff
                  onLeido={() => setTickets(l => l.map(x => (x.id === selected.id ? { ...x, sin_leer: 0 } : x)))} />
              </>
            ) : (
              <>
              {/* Estado: se guarda al pulsar, sin tocar lo demás */}
              <div style={{marginBottom: 18}}>
                <p style={cabecillaCss}>Estado</p>
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6}}>
                  {Object.entries(ESTADOS).map(([k, v]) => (
                    <button key={k} type="button" disabled={updating} onClick={() => k !== estSel && cambiarEstado(selected, k)} aria-pressed={k === estSel}
                      style={{padding: "9px 6px", borderRadius: 10, cursor: k === estSel ? "default" : "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit",
                        border: `1.5px solid ${k === estSel ? v.color : 'var(--line)'}`,
                        background: k === estSel ? `color-mix(in oklab, ${v.color} 16%, var(--bg-2))` : "var(--bg-3)",
                        color: k === estSel ? v.color : "var(--ink-2)"}}>
                      {v.label}
                    </button>
                  ))}
                </div>
                {selected.recurrencia && selected.status === 'open' && <p style={{margin: "6px 0 0", fontSize: 11.5, color: "var(--ink-3)"}}>Se repite: al resolverlo o cerrarlo se crea solo el siguiente.</p>}
              </div>

              {/* Lo que pide */}
              <div style={{background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 18}}>
                <p style={{margin: "0 0 2px", fontSize: 13}}><b>{selected.name} {selected.surname || ''}</b> <span style={{color: "var(--ink-3)"}}>· {selected.email}{selected.creador_personal ? '' : ' · familia'}</span></p>
                <p style={{margin: "8px 0 0", fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word"}}>{selected.description}</p>
                {selected.tiene_adjunto && (
                  <div style={{marginTop: 10}}><Adjunto url={`/api/support/${selected.id}/adjunto`} nombre={selected.adjunto_nombre} mime={selected.adjunto_mime || 'image/png'} alto={220} /></div>
                )}
                <div style={{display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, fontSize: 12, color: "var(--ink-3)"}}>
                  <span>Último movimiento: <b>{selected.updated_at ? fmtDateTime(selected.updated_at) : 'ninguno'}</b></span>
                  <span>Primera respuesta: <b>{primeraRespuesta(selected) ? `en ${primeraRespuesta(selected)}` : 'todavía no'}</b></span>
                  {selected.resolved_at && <span style={{color: "var(--teal)"}}>Resuelto: <b>{fmtDateTime(selected.resolved_at)}</b>{tardanza(selected) ? ` · tardó ${tardanza(selected)}` : ''}</span>}
                </div>
              </div>

              {/* Conversaciones */}
              <div style={{marginBottom: 18}}>
                <p style={cabecillaCss}>Conversación</p>
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8}}>
                  {[['creador', `Con ${selected.name || 'quien lo abrió'}`, selected.msgs_creador], ['equipo', 'Del equipo (privada)', selected.msgs_equipo]].map(([c, l, n]) => (
                    <button key={c} type="button" onClick={() => setChatCanal(c)}
                      style={{padding: "12px 10px", borderRadius: 10, border: "1px solid var(--line)", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit", background: "var(--bg-3)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8}}>
                      💬 {l}{n ? <span style={{color: "var(--purple)"}}>· {n}</span> : ''}
                    </button>
                  ))}
                </div>
                {selected.sin_leer > 0 && <p style={{margin: "6px 0 0", fontSize: 12, color: "var(--purple)", fontWeight: 700}}>Hay {selected.sin_leer} mensaje{selected.sin_leer !== 1 ? 's' : ''} que no has leído.</p>}
              </div>

              {/* Gestión interna */}
              <div style={{border: "1px solid var(--line)", borderRadius: 14, padding: 14, display: "grid", gap: 14, marginBottom: 18}}>
                <span style={{fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)"}}>Gestión interna</span>
                <div>
                  <p style={cabecillaCss}>Categoría</p>
                  <div style={{display: "flex", gap: 6, flexWrap: "wrap"}}>
                    <button type="button" onClick={() => setEdit(x => ({ ...x, categoria: '' }))} style={pillCss(!edit.categoria)}>Sin categoría</button>
                    {Object.entries(CATEGORIAS).map(([k, c]) => <button key={k} type="button" onClick={() => setEdit(x => ({ ...x, categoria: k }))} style={pillCss(edit.categoria === k)}>{c.label}</button>)}
                  </div>
                </div>
                <div>
                  <p style={cabecillaCss}>Prioridad</p>
                  <div style={{display: "flex", gap: 8}}>
                    {['low', 'medium', 'high'].map(p => (
                      <button key={p} type="button" onClick={() => setEdit(x => ({ ...x, priority: p }))}
                        style={{flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid var(--line)", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit",
                          background: edit.priority === p ? PRIORITY_COLOR[p] : "var(--bg-3)", color: edit.priority === p ? (p === 'medium' ? '#000' : 'white') : "var(--ink-2)"}}>
                        {PRIORITY_LABEL[p]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p style={cabecillaCss}>Encargados <span style={{textTransform: "none", letterSpacing: 0, fontWeight: 600}}>· el primero es el principal</span></p>
                  <div style={{display: "flex", gap: 6, flexWrap: "wrap"}}>
                    <button type="button" onClick={() => setEdit(x => ({ ...x, asignados: [] }))} style={pillCss(!edit.asignados.length)}>Sin asignar</button>
                    {[...superadmins, ...encargadosDe(selected).filter(a => !superadmins.some(sa => sa.id === a.id))].map(sa => (
                      <button key={sa.id} type="button" aria-pressed={edit.asignados.includes(sa.id)} onClick={() => setEdit(x => ({ ...x, asignados: alternarEn(x.asignados, sa.id) }))} style={pillCss(edit.asignados.includes(sa.id))}>
                        {sa.name} {sa.surname || ''}
                      </button>
                    ))}
                    {user?.id && !edit.asignados.includes(user.id) && superadmins.some(sa => sa.id === user.id) && (
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => setEdit(x => ({ ...x, asignados: [...x.asignados, user.id] }))}>Me lo quedo</button>
                    )}
                  </div>
                </div>
                <div style={{display: "flex", gap: 14, flexWrap: "wrap"}}>
                  <div className="field" style={{margin: 0}}>
                    <label>Fecha límite</label>
                    <div style={{display: "flex", gap: 6, alignItems: "center"}}>
                      <input type="date" value={edit.dueDate} onChange={e => setEdit(x => ({ ...x, dueDate: e.target.value }))} style={{maxWidth: 180}} />
                      {edit.dueDate && <button type="button" className="btn btn-sm btn-outline" onClick={() => setEdit(x => ({ ...x, dueDate: '' }))}>Quitar</button>}
                    </div>
                  </div>
                  <div className="field" style={{margin: 0}}>
                    <label>Se repite</label>
                    <select value={edit.recurrencia} onChange={e => setEdit(x => ({ ...x, recurrencia: e.target.value }))} style={{...selectCss, fontSize: 14, padding: "10px 12px", background: "var(--bg-3)"}}>
                      {RECUR_OPCIONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <p style={cabecillaCss}>Aplicaciones</p>
                  <div style={{display: "flex", gap: 6, flexWrap: "wrap"}}>
                    {APPS.map(app => {
                      const sel = edit.apps.includes(app);
                      return <button key={app} type="button" onClick={() => setEdit(x => ({ ...x, apps: sel ? x.apps.filter(l => l !== app) : [...x.apps, app] }))} style={pillCss(sel)}>{app}</button>;
                    })}
                  </div>
                </div>
                {updateMsg && <p style={{color: "var(--orange)", fontWeight: 600, fontSize: 13, margin: 0}}>{updateMsg}</p>}
                <div style={{display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center"}}>
                  <button className="btn btn-gradient" onClick={() => guardar(selected.id, cambiosInternos, 'Cambios guardados.')} disabled={updating || !hayCambios}>
                    {updating ? <span className="dot-loader" /> : <>Guardar cambios <I.Check /></>}
                  </button>
                  {hayCambios && <button className="btn btn-outline" onClick={() => openTicket(selected)}>Deshacer</button>}
                  {!hayCambios && <span style={{fontSize: 12, color: "var(--ink-3)"}}>Sin cambios por guardar.</span>}
                </div>
              </div>

              {/* Vinculados */}
              <div style={{marginBottom: 18}}>
                <p style={cabecillaCss}>Tickets vinculados{hermanos.length ? ` (${hermanos.length})` : ''}</p>
                {hermanos.length > 0 && (
                  <div style={{display: "grid", gap: 6, marginBottom: 8}}>
                    {hermanos.map(h => (
                      <button key={h.id} onClick={() => { if (!hayCambios || window.confirm('Tienes cambios sin guardar. ¿Ir a otro ticket sin guardarlos?')) openTicket(h); }}
                        style={{textAlign: "left", background: "var(--bg-3)", border: "1px solid var(--line)", borderLeft: `3px solid ${ESTADOS[estadoDe(h)].color}`, borderRadius: 10, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit", color: "var(--ink)"}}>
                        <div style={{fontSize: 13}}><b style={{color: "var(--purple)"}}>#{h.id}</b> {h.subject} <span style={chip(ESTADOS[estadoDe(h)].color, { marginLeft: 6 })}>{ESTADOS[estadoDe(h)].label}</span></div>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap"}}>
                  <input value={vinculando} onChange={e => setVinculando(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') vincular(selected); }}
                    placeholder="Nº de ticket" aria-label="Número del ticket a vincular" style={{width: 120, fontFamily: "inherit", fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-3)", color: "var(--ink)"}} />
                  <button className="btn btn-sm btn-outline" onClick={() => vincular(selected)}>Vincular</button>
                  {vinculoId && <button className="btn btn-sm btn-outline" style={{color: "var(--orange)"}} onClick={() => desvincular(selected)}>Sacar de este grupo</button>}
                </div>
              </div>

              {/* Historial */}
              <div style={{marginBottom: 24}}>
                <button type="button" onClick={() => setVerHistorial(v => !v)} style={{background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", ...cabecillaCss, margin: "0 0 8px"}}>
                  {verHistorial ? '▾' : '▸'} Historial de cambios
                </button>
                {verHistorial && <Historial ticketId={selected.id} recarga={recargaHist} />}
              </div>
              </>
            )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Soporte de las familias: escribir una consulta, ver cómo va y hablar con el
// club dentro de cada una. Nada interno: ni prioridad, ni quién la lleva.
// ─────────────────────────────────────────────────────────────────────────────
const ESTADO_FAMILIA = {
  abierto: { label: 'Recibida', color: '#ccac00' },
  en_curso: { label: 'Lo estamos mirando', color: 'var(--purple)' },
  esperando: { label: 'Esperando tu respuesta', color: 'var(--orange)' },
  resolved: { label: 'Resuelta', color: 'var(--teal)' },
  closed: { label: 'Cerrada', color: 'var(--ink-3)' },
};

export function UserSupport() {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, texto }
  const [misTickets, setMisTickets] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [verForm, setVerForm] = useState(true);

  const cargar = useCallback(() => {
    fetch('/api/support/mios', { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { tickets: [] }))
      .then(d => {
        const l = d.tickets || [];
        setMisTickets(l);
        // Si tiene consultas abiertas, el formulario empieza recogido: lo primero es lo que ya tiene.
        if (l.some(t => t.status === 'open')) setVerForm(false);
      })
      .catch(() => {});
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function pegarEnAlta(e) {
    const f = archivoDelPortapapeles(e);
    if (!f) return;
    e.preventDefault();
    const { archivo: a, error } = await aceptarArchivo(f);
    if (error) setMsg({ ok: false, texto: error });
    else { setMsg(null); setArchivo(a); }
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setMsg(null);
    try {
      const r = await fetch('/api/support', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ subject, description, adjunto: archivo?.data || null, adjuntoNombre: archivo?.nombre || null, adjuntoMime: archivo?.mime || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.success) {
        setMsg({ ok: true, texto: 'Consulta enviada. Te contestaremos aquí y te avisaremos por correo.' });
        setSubject(''); setDescription(''); setArchivo(null);
        cargar();
      } else setMsg({ ok: false, texto: d.error || 'No se ha podido enviar.' });
    } catch { setMsg({ ok: false, texto: 'Error de conexión.' }); }
    setLoading(false);
  }

  const abiertas = misTickets.filter(t => t.status === 'open');
  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 720 }}>
      {misTickets.length > 0 && (
        <div className="panel" style={{ margin: 0 }}>
          <h2><I.Bell /> Mis consultas</h2>
          <p className="sub">{abiertas.length ? `Tienes ${abiertas.length} consulta${abiertas.length !== 1 ? 's' : ''} en marcha.` : 'Todas tus consultas están resueltas.'} Las respuestas del club salen aquí y te avisamos por correo.</p>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {misTickets.map(t => {
              const est = ESTADO_FAMILIA[estadoDe(t)];
              const estaAbierto = abierto === t.id;
              return (
                <div key={t.id} style={{ background: 'var(--bg-3)', border: `1px solid ${t.sin_leer ? 'var(--purple)' : 'var(--line)'}`, borderRadius: 12, padding: '14px 16px', borderLeft: `4px solid ${est.color}`, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, minWidth: 0, wordBreak: 'break-word' }}>{t.subject}</span>
                    <span style={chip(est.color, { textTransform: 'uppercase', letterSpacing: '.04em' })}>{est.label}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
                    Enviada el {fmtDate(t.created_at)}
                    {t.resolved_at && t.status !== 'open' && <span style={{ color: 'var(--teal)' }}> · resuelta el {fmtDate(t.resolved_at)}</span>}
                  </p>
                  {t.sin_leer > 0 && <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--purple)', fontWeight: 800 }}>● Tienes {t.sin_leer} respuesta{t.sin_leer !== 1 ? 's' : ''} nueva{t.sin_leer !== 1 ? 's' : ''}</p>}
                  <button onClick={() => setAbierto(estaAbierto ? null : t.id)}
                    style={{ marginTop: 10, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--purple)', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>
                    {estaAbierto ? 'Ocultar' : `Ver la conversación${t.mensajes ? ` (${t.mensajes})` : ''}`}
                  </button>
                  {estaAbierto && (
                    <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                      <div style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
                        {t.description}
                        {t.tiene_adjunto && <div style={{ marginTop: 8 }}><Adjunto url={`/api/support/${t.id}/adjunto`} nombre={t.adjunto_nombre} mime={t.adjunto_mime || 'image/png'} alto={160} /></div>}
                      </div>
                      <TicketChat ticketId={t.id} canal="creador" alto={260}
                        onLeido={() => setMisTickets(l => l.map(x => (x.id === t.id ? { ...x, sin_leer: 0 } : x)))} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="panel" style={{ margin: 0 }}>
        <h2><I.Plus /> Nueva consulta</h2>
        <p className="sub">¿Tienes algún problema o sugerencia? Escríbenos y te contestaremos lo antes posible.</p>
        {!verForm ? (
          <button className="btn btn-outline" style={{ marginTop: 8 }} onClick={() => setVerForm(true)}>Escribir una consulta nueva</button>
        ) : (
          <form onSubmit={submit} onPaste={pegarEnAlta} style={{ marginTop: 14 }}>
            <div className="field">
              <label>Asunto</label>
              <input placeholder="Ej. No puedo ver los recibos" value={subject} onChange={e => setSubject(e.target.value)} required maxLength={255} />
            </div>
            <div className="field">
              <label>Cuéntanos</label>
              <textarea placeholder="Describe tu consulta o problema con el mayor detalle posible…" value={description} onChange={e => setDescription(e.target.value)} required rows={5} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 14, padding: 12, background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)' }} />
            </div>
            <div className="field">
              <label>Adjunto (opcional)</label>
              <AdjuntarArchivo archivo={archivo} onArchivo={setArchivo} onError={m => setMsg(m ? { ok: false, texto: m } : null)}
                ayuda="Una captura ayuda mucho a entender el problema. Pégala con Ctrl+V, arrástrala aquí o búscala. También PDF. Máx. 4 MB." />
            </div>
            {msg && <p role="status" style={{ color: msg.ok ? 'var(--teal)' : 'var(--orange)', fontWeight: 600, fontSize: 13, marginBottom: 12 }}>{msg.texto}</p>}
            <button type="submit" className="btn btn-gradient" disabled={loading}>
              {loading ? <span className="dot-loader" /> : <>Enviar consulta <I.Arrow /></>}
            </button>
          </form>
        )}
        {!verForm && msg && <p role="status" style={{ color: msg.ok ? 'var(--teal)' : 'var(--orange)', fontWeight: 600, fontSize: 13, margin: '10px 0 0' }}>{msg.texto}</p>}
      </div>
    </div>
  );
}
