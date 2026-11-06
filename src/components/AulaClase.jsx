import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Aulas de clase (tipo Classroom): una por clase, con su tablón (avisos,
// materiales, tareas y «Lo de hoy»), los temas, las tareas con sus notas y
// quién está. La misma pantalla para el panel (ambito 'equipo') y para el área
// de familias (ambito 'familia'). Ver aulas-clase.js.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ARCHIVO = 10 * 1024 * 1024;
const jsonDe = (r) => r.json().catch(() => ({}));
const pedir = async (url, o = {}) => {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', ...o });
  const d = await jsonDe(r);
  if (!r.ok) throw new Error(d.error || 'No se ha podido hacer.');
  return d;
};
const conJson = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const iniciales = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?';
const fechaCorta = (f) => (f ? new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '');
const fechaHora = (f) => (f ? new Date(f).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const cuando = (f) => {
  if (!f) return '';
  const d = new Date(f), hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return `hoy, ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: d.getFullYear() === hoy.getFullYear() ? undefined : 'numeric' });
};
const diaLargo = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
const hoyISO = () => new Date().toLocaleDateString('sv-SE');
const tamano = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const aLocal = (f) => { if (!f) return ''; const d = new Date(f); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const nota = (n) => String(n).replace('.', ',');
const TIPOS = {
  aviso: { nombre: 'Aviso', icono: '📢', fondo: 'color-mix(in oklab, var(--orange) 14%, var(--bg-2))', color: '#c2410c' },
  material: { nombre: 'Material', icono: '📎', fondo: 'color-mix(in oklab, #1e6fd9 12%, var(--bg-2))', color: '#1e6fd9' },
  tarea: { nombre: 'Tarea', icono: '📝', fondo: 'color-mix(in oklab, var(--purple) 12%, var(--bg-2))', color: 'var(--purple)' },
  hoy: { nombre: 'Lo de hoy', icono: '📒', fondo: 'color-mix(in oklab, var(--teal) 14%, var(--bg-2))', color: '#15803d' },
};
const Etiqueta = ({ tipo, extra }) => (
  <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: TIPOS[tipo].fondo, color: TIPOS[tipo].color, whiteSpace: 'nowrap' }}>
    {TIPOS[tipo].icono} {TIPOS[tipo].nombre}{extra ? ` · ${extra}` : ''}
  </span>
);
const Av = ({ nombre, size = 34, color = 'var(--orange)' }) => (
  <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: size * 0.36, background: `color-mix(in oklab, ${color} 22%, var(--bg-2))`, color }}>{iniciales(nombre)}</span>
);
const tarjeta = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16 };
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box' };

function ConEnlaces({ texto }) {
  return String(texto || '').split(/(https?:\/\/[^\s<]+)/g).map((t, i) => (i % 2
    ? <a key={i} href={t} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--purple)', wordBreak: 'break-all' }}>{t}</a>
    : <React.Fragment key={i}>{t}</React.Fragment>));
}
// Una foto grande se achica antes de subirla (el servidor lo vuelve a mirar).
async function prepararArchivo(f) {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 400 * 1024) return f;
  try {
    const img = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
    return b && b.size < f.size ? new File([b], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f;
  } catch { return f; }
}
async function subirArchivo(url, f) {
  const g = await prepararArchivo(f);
  if (g.size > MAX_ARCHIVO) throw new Error(`«${f.name}» pasa de 10 MB. Los vídeos largos, mejor por enlace (YouTube).`);
  const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}nombre=${encodeURIComponent(g.name)}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': g.type || 'application/octet-stream' }, body: g });
  const d = await jsonDe(r);
  if (!r.ok) throw new Error(d.error || 'No se ha podido subir.');
  return d.archivo;
}
const esYoutube = (u) => /youtu\.?be/.test(u);

function Modal({ titulo, onCerrar, children, ancho = 640 }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: ancho, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', padding: 22, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, flex: 1 }}>{titulo}</h3>
          <button type="button" className="icon-btn" onClick={onCerrar} aria-label="Cerrar"><I.X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Archivos({ archivos = [], onQuitar }) {
  if (!archivos.length) return null;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {archivos.map(f => /^image\//.test(f.mime) ? (
        <div key={f.id} style={{ position: 'relative', justifySelf: 'start' }}>
          <a href={f.url} target="_blank" rel="noopener noreferrer"><img src={f.url} alt={f.nombre} loading="lazy" style={{ display: 'block', maxWidth: '100%', maxHeight: 280, borderRadius: 10, border: '1px solid var(--line)' }} /></a>
          {onQuitar && <button type="button" className="icon-btn" onClick={() => onQuitar(f)} aria-label={`Quitar ${f.nombre}`} style={{ position: 'absolute', top: 6, right: 6, background: 'var(--bg-2)' }}><I.X width={14} height={14} /></button>}
        </div>
      ) : (
        <div key={f.id} style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', background: 'var(--bg-3)' }}>
          <span style={{ width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--bg-2)', flexShrink: 0 }}>{/pdf/.test(f.mime) ? '📄' : /^video/.test(f.mime) ? '🎬' : /^audio/.test(f.mime) ? '🎧' : '📎'}</span>
          <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, color: 'var(--ink)', textDecoration: 'none' }}>
            <b style={{ fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</b>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{tamano(f.bytes)}</span>
          </a>
          {onQuitar && <button type="button" className="icon-btn" onClick={() => onQuitar(f)} aria-label={`Quitar ${f.nombre}`}><I.X width={14} height={14} /></button>}
        </div>
      ))}
    </div>
  );
}

// ── Escribir o cambiar una publicación ──
function Editor({ tipo, post, temas, grupoId, temaInicial = null, onHecho, onCancelar, avisar }) {
  const [f, setF] = useState(() => ({
    titulo: post?.titulo || '', texto: post?.texto || '', temaId: post?.temaId ?? temaInicial ?? '', enlaces: post?.enlaces || [],
    entregaAt: aLocal(post?.entregaAt), calificacion: post?.calificacion || 'nota', fechaClase: post?.fechaClase || hoyISO(),
    programar: !!post?.programado, publicarAt: post?.programado ? aLocal(post.fecha) : '',
  }));
  const [enlace, setEnlace] = useState('');
  const [nuevos, setNuevos] = useState([]);
  const [existentes, setExistentes] = useState(post?.archivos || []);
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const archivoRef = useRef(null);
  const anadirEnlace = () => {
    const u = enlace.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) { avisar('Pega un enlace que empiece por http:// o https://'); return; }
    set('enlaces', [...f.enlaces, { url: u, titulo: '' }]); setEnlace('');
  };
  async function guardar(e) {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    try {
      const cuerpo = {
        tipo, titulo: f.titulo, texto: f.texto, temaId: f.temaId || null, enlaces: f.enlaces,
        ...(tipo === 'tarea' ? { entregaAt: f.entregaAt ? new Date(f.entregaAt).toISOString() : null, calificacion: f.calificacion } : {}),
        ...(tipo === 'hoy' ? { fechaClase: f.fechaClase } : {}),
        ...(f.programar && f.publicarAt ? { publicarAt: new Date(f.publicarAt).toISOString() } : post ? { publicarAt: post.programado ? null : undefined } : {}),
      };
      let id = post?.id;
      if (post) await pedir(`/api/aulas-clase/posts/${post.id}`, conJson('PATCH', cuerpo));
      else id = (await pedir(`/api/aulas-clase/${grupoId}/posts`, conJson('POST', cuerpo))).id;
      for (const a of nuevos) {
        try { await subirArchivo(`/api/aulas-clase/posts/${id}/archivos`, a); } catch (err) { avisar(err.message); }
      }
      onHecho(post ? 'Guardado.' : f.programar && f.publicarAt ? `Programado para el ${fechaHora(f.publicarAt)}.` : 'Publicado: les llega a las familias de la clase.');
    } catch (err) { avisar(err.message); } finally { setGuardando(false); }
  }
  async function quitarExistente(a) {
    if (!window.confirm(`¿Quitar «${a.nombre}»?`)) return;
    try { await pedir(`/api/aulas-clase/archivos/${a.id}`, { method: 'DELETE' }); setExistentes(l => l.filter(x => x.id !== a.id)); } catch (err) { avisar(err.message); }
  }
  return (
    <form onSubmit={guardar} style={{ ...tarjeta, padding: 16, display: 'grid', gap: 10, borderColor: TIPOS[tipo].color }} data-editor={tipo}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Etiqueta tipo={tipo} /><b style={{ fontSize: 14 }}>{post ? 'Cambiar' : 'Nuevo'}</b></div>
      {(tipo === 'tarea' || tipo === 'material') && (
        <input value={f.titulo} onChange={e => set('titulo', e.target.value)} placeholder={tipo === 'tarea' ? 'Título de la tarea' : 'Título (opcional)'} maxLength={200} style={{ ...campo, fontWeight: 700 }} aria-label="Título" required={tipo === 'tarea'} />
      )}
      {tipo === 'hoy' && (
        <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>Día de la clase
          <input type="date" value={f.fechaClase} max={hoyISO()} onChange={e => set('fechaClase', e.target.value)} style={{ ...campo, width: 'auto' }} /></label>
      )}
      <textarea value={f.texto} onChange={e => set('texto', e.target.value)} rows={tipo === 'aviso' || tipo === 'hoy' ? 3 : 4} aria-label="Texto"
        placeholder={{ aviso: 'Lo que tienen que saber…', material: 'Para qué es (opcional)…', tarea: 'Qué hay que hacer…', hoy: 'Qué se ha trabajado hoy en clase…' }[tipo]}
        style={{ ...campo, resize: 'vertical', lineHeight: 1.45 }} />
      {tipo === 'tarea' && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Entrega <input type="datetime-local" value={f.entregaAt} onChange={e => set('entregaAt', e.target.value)} style={{ ...campo, width: 'auto' }} /></label>
          <span style={{ display: 'flex', gap: 10 }} data-calificacion>
            <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="radio" checked={f.calificacion === 'nota'} onChange={() => set('calificacion', 'nota')} /> Nota de 0 a 10</label>
            <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="radio" checked={f.calificacion === 'hecha'} onChange={() => set('calificacion', 'hecha')} /> Hecha / no hecha</label>
          </span>
        </div>
      )}
      {temas.length > 0 && (
        <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>Tema
          <select value={f.temaId ?? ''} onChange={e => set('temaId', e.target.value ? Number(e.target.value) : '')} style={{ ...campo, width: 'auto' }}>
            <option value="">Sin tema</option>
            {temas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select></label>
      )}
      {tipo !== 'hoy' && (
        <>
          {f.enlaces.map((x, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <span>{esYoutube(x.url) ? '▶️' : '🔗'}</span><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.url}</span>
              <button type="button" className="icon-btn" aria-label="Quitar el enlace" onClick={() => set('enlaces', f.enlaces.filter((_, j) => j !== i))}><I.X width={14} height={14} /></button>
            </div>
          ))}
          <Archivos archivos={existentes} onQuitar={quitarExistente} />
          {nuevos.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>📎 <span style={{ flex: 1 }}>{a.name} <span style={{ color: 'var(--ink-3)' }}>({tamano(a.size)})</span></span>
              <button type="button" className="icon-btn" aria-label="No subirlo" onClick={() => setNuevos(l => l.filter((_, j) => j !== i))}><I.X width={14} height={14} /></button></div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input ref={archivoRef} type="file" multiple hidden onChange={e => { setNuevos(l => [...l, ...e.target.files]); e.target.value = ''; }} />
            <button type="button" className="btn btn-sm btn-outline" onClick={() => archivoRef.current?.click()}><I.Clip width={14} height={14} /> Archivo</button>
            <input value={enlace} onChange={e => setEnlace(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); anadirEnlace(); } }} placeholder="Pega un enlace (YouTube, una web…)" style={{ ...campo, flex: '1 1 220px', width: 'auto' }} aria-label="Enlace" />
            <button type="button" className="btn btn-sm btn-outline" onClick={anadirEnlace} disabled={!enlace.trim()}>Añadir enlace</button>
          </div>
        </>
      )}
      {tipo !== 'hoy' && (
        <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="checkbox" checked={f.programar} onChange={e => set('programar', e.target.checked)} /> Publicarlo más tarde
          {f.programar && <input type="datetime-local" value={f.publicarAt} onChange={e => set('publicarAt', e.target.value)} style={{ ...campo, width: 'auto' }} required />}
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : post ? 'Guardar' : f.programar ? 'Programar' : 'Publicar'}</button>
      </div>
    </form>
  );
}

// ── Comentarios privados de una tarea (entre el profe y ese alumno o su familia) ──
function Privados({ postId, alumnoId, ambito, avisar, puedeEscribir = true }) {
  const [lista, setLista] = useState(null);
  const [texto, setTexto] = useState('');
  const cargar = useCallback(() => pedir(`/api/aulas-clase/posts/${postId}/privados/${alumnoId}?ambito=${ambito}`).then(d => setLista(d.comentarios)).catch(e => avisar(e.message)), [postId, alumnoId, ambito]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [cargar]);
  async function enviar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    try { await pedir(`/api/aulas-clase/posts/${postId}/comentarios`, conJson('POST', { texto, alumnoId, ambito })); setTexto(''); cargar(); } catch (err) { avisar(err.message); }
  }
  return (
    <div style={{ display: 'grid', gap: 6, background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 12, padding: 10 }} data-privados>
      <b style={{ fontSize: 12 }}>🔒 Comentarios privados {ambito === 'familia' ? 'con el profe' : 'con la familia'}</b>
      {lista === null ? <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Cargando…</span> : !lista.length ? <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Aún no hay ninguno.</span> : lista.map(c => (
        <div key={c.id} style={{ fontSize: 13, lineHeight: 1.4 }}><b>{c.mio ? 'Tú' : c.autor}</b> <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>{cuando(c.fecha)}</span><div style={{ whiteSpace: 'pre-wrap' }}><ConEnlaces texto={c.texto} /></div></div>
      ))}
      {puedeEscribir && (
        <form onSubmit={enviar} style={{ display: 'flex', gap: 6 }}>
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe un comentario privado…" style={{ ...campo, padding: '7px 10px', fontSize: 13 }} aria-label="Comentario privado" />
          <button type="submit" className="btn btn-sm btn-primary" disabled={!texto.trim()}>Enviar</button>
        </form>
      )}
    </div>
  );
}

// ── Una tarea: el profe ve las entregas de todos y corrige; la familia entrega ──
function Tarea({ postId, ambito, onCerrar, onCambio, avisar }) {
  const [d, setD] = useState(null);
  const [abiertoPriv, setAbiertoPriv] = useState(null);
  const [borrador, setBorrador] = useState({});
  const [notas, setNotas] = useState({});
  const archivoRef = useRef(null);
  const [subiendoPara, setSubiendoPara] = useState(null);
  const cargar = useCallback(() => pedir(`/api/aulas-clase/posts/${postId}/entregas?ambito=${ambito}`).then(x => {
    setD(x);
    setBorrador(b => ({ ...Object.fromEntries(x.alumnos.map(a => [a.id, a.entrega?.texto || ''])), ...b }));
    setNotas(Object.fromEntries(x.alumnos.map(a => [a.id, a.entrega?.nota != null ? nota(a.entrega.nota) : ''])));
  }).catch(e => { avisar(e.message); onCerrar(); }), [postId, ambito]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [cargar]);
  const equipo = ambito === 'equipo';
  const tarde = (a) => a.entrega?.entregada && d?.tarea?.entregaAt && new Date(a.entrega.entregada) > new Date(d.tarea.entregaAt);
  async function corregir(a, valor) {
    try {
      await pedir(`/api/aulas-clase/posts/${postId}/corregir`, conJson('POST', d.tarea.calificacion === 'hecha' ? { alumnoId: a.id, hecha: valor } : { alumnoId: a.id, nota: valor }));
      await cargar(); onCambio?.();
    } catch (e) { avisar(e.message); }
  }
  async function entregar(a, deshacer = false) {
    try {
      await pedir(`/api/aulas-clase/posts/${postId}/entrega`, conJson('POST', { alumnoId: a.id, texto: borrador[a.id] || '', deshacer }));
      avisar(deshacer ? 'Entrega anulada: puedes cambiarla y volver a entregar.' : 'Entregada. El profe la verá en su aula.');
      await cargar(); onCambio?.();
    } catch (e) { avisar(e.message); }
  }
  async function adjuntar(files) {
    const a = subiendoPara;
    for (const f of files) {
      try { await subirArchivo(`/api/aulas-clase/posts/${postId}/entrega/archivos?alumnoId=${a}`, f); } catch (e) { avisar(e.message); }
    }
    setSubiendoPara(null); cargar();
  }
  async function quitarArchivo(f) {
    if (!window.confirm(`¿Quitar «${f.nombre}»?`)) return;
    try { await pedir(`/api/aulas-clase/archivos/${f.id}`, { method: 'DELETE' }); cargar(); } catch (e) { avisar(e.message); }
  }
  const estado = (a) => (a.entrega?.devuelta ? 'corregida' : a.entrega?.entregada ? 'entregada' : 'sin entregar');
  return (
    <Modal titulo={d?.tarea?.titulo || 'Tarea'} onCerrar={onCerrar} ancho={equipo ? 860 : 620}>
      <input ref={archivoRef} type="file" multiple hidden onChange={e => { adjuntar([...e.target.files]); e.target.value = ''; }} />
      {!d ? <span style={{ color: 'var(--ink-3)' }}>Cargando…</span> : (
        <>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {d.tarea.entregaAt && <span>🗓 Entrega: <b>{fechaHora(d.tarea.entregaAt)}</b></span>}
            <span>{d.tarea.calificacion === 'hecha' ? '✓ Se marca hecha / no hecha' : '🔢 Nota de 0 a 10'}</span>
            {equipo && <span>{d.alumnos.filter(a => a.entrega?.entregada).length} de {d.alumnos.length} entregadas</span>}
          </div>
          <div style={{ display: 'grid', gap: 8 }} data-entregas>
            {d.alumnos.map(a => (
              <div key={a.id} style={{ ...tarjeta, padding: 12, display: 'grid', gap: 8 }} data-alumno={a.id}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Av nombre={a.nombre} size={30} color="var(--purple)" />
                  <b style={{ flex: '1 1 160px' }}>{a.nombre}</b>
                  <span style={{ fontSize: 12, fontWeight: 700, color: estado(a) === 'corregida' ? 'var(--teal)' : estado(a) === 'entregada' ? 'var(--purple)' : 'var(--ink-3)' }}>
                    {estado(a) === 'corregida' ? `Corregida${d.tarea.calificacion === 'hecha' ? (a.entrega.hecha ? ' · Hecha ✓' : ' · No hecha') : a.entrega.nota != null ? ` · ${nota(a.entrega.nota)} / 10` : ''}`
                      : estado(a) === 'entregada' ? `Entregada ${fechaCorta(a.entrega.entregada)}${tarde(a) ? ' (tarde)' : ''}` : 'Sin entregar'}
                  </span>
                  {equipo && d.puedeCorregir && (d.tarea.calificacion === 'hecha' ? (
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button type="button" className={`btn btn-sm ${a.entrega?.hecha === true ? 'btn-primary' : 'btn-outline'}`} onClick={() => corregir(a, true)}>Hecha</button>
                      <button type="button" className={`btn btn-sm ${a.entrega?.hecha === false ? 'btn-primary' : 'btn-outline'}`} onClick={() => corregir(a, false)}>No hecha</button>
                    </span>
                  ) : (
                    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input value={notas[a.id] ?? ''} onChange={e => setNotas(n => ({ ...n, [a.id]: e.target.value }))} placeholder="Nota" inputMode="decimal" aria-label={`Nota de ${a.nombre}`} style={{ ...campo, width: 70, padding: '6px 8px' }} />
                      <button type="button" className="btn btn-sm btn-primary" disabled={notas[a.id] === '' || notas[a.id] == null} onClick={() => corregir(a, notas[a.id])}>{a.entrega?.devuelta ? 'Cambiar' : 'Devolver'}</button>
                    </span>
                  ))}
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setAbiertoPriv(p => (p === a.id ? null : a.id))}>🔒 Privado{a.privados ? ` (${a.privados})` : ''}</button>
                </div>
                {equipo ? (
                  (a.entrega?.texto || a.entrega?.archivos?.length > 0) && (
                    <div style={{ display: 'grid', gap: 6, paddingLeft: 40 }}>
                      {a.entrega.texto && <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', background: 'var(--bg-3)', borderRadius: 10, padding: 10 }}><ConEnlaces texto={a.entrega.texto} /></div>}
                      <Archivos archivos={a.entrega.archivos} />
                    </div>
                  )
                ) : a.entrega?.devuelta ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {a.entrega.texto && <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', background: 'var(--bg-3)', borderRadius: 10, padding: 10 }}>{a.entrega.texto}</div>}
                    <Archivos archivos={a.entrega.archivos} />
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <textarea value={borrador[a.id] || ''} onChange={e => setBorrador(b => ({ ...b, [a.id]: e.target.value }))} rows={3} placeholder="Escribe aquí la tarea o una nota para el profe (opcional si adjuntas algo)…" style={{ ...campo, resize: 'vertical' }} aria-label="Entrega" disabled={!!a.entrega?.entregada} />
                    <Archivos archivos={a.entrega?.archivos || []} onQuitar={a.entrega?.entregada ? null : quitarArchivo} />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {!a.entrega?.entregada && <button type="button" className="btn btn-sm btn-outline" onClick={() => { setSubiendoPara(a.id); archivoRef.current?.click(); }} disabled={subiendoPara === a.id}><I.Clip width={14} height={14} /> {subiendoPara === a.id ? 'Subiendo…' : 'Adjuntar'}</button>}
                      {a.entrega?.entregada
                        ? <button type="button" className="btn btn-sm btn-outline" onClick={() => entregar(a, true)}>Anular la entrega para cambiarla</button>
                        : <button type="button" className="btn btn-sm btn-primary" onClick={() => entregar(a)} disabled={!(borrador[a.id] || '').trim() && !a.entrega?.archivos?.length}>Entregar</button>}
                    </div>
                  </div>
                )}
                {abiertoPriv === a.id && <Privados postId={postId} alumnoId={a.id} ambito={ambito} avisar={avisar} />}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Una publicación del tablón ──
function Publicacion({ p, d, ambito, onEditar, onCambio, avisar, onTarea }) {
  const [verTodos, setVerTodos] = useState(false);
  const [comentario, setComentario] = useState('');
  const [menu, setMenu] = useState(false);
  const equipo = ambito === 'equipo';
  const tema = d.temas.find(t => t.id === p.temaId);
  const activa = d.temporada === d.activa;
  async function comentar(e) {
    e.preventDefault();
    if (!comentario.trim()) return;
    try { await pedir(`/api/aulas-clase/posts/${p.id}/comentarios`, conJson('POST', { texto: comentario, ambito })); setComentario(''); onCambio(); } catch (err) { avisar(err.message); }
  }
  async function quitar() {
    setMenu(false);
    if (!window.confirm('¿Quitar esta publicación? Se borra con sus comentarios, archivos y entregas.')) return;
    try { await pedir(`/api/aulas-clase/posts/${p.id}`, { method: 'DELETE' }); onCambio('Quitada.'); } catch (err) { avisar(err.message); }
  }
  async function quitarComentario(c) {
    if (!window.confirm('¿Quitar este comentario?')) return;
    try { await pedir(`/api/aulas-clase/comentarios/${c.id}?ambito=${ambito}`, { method: 'DELETE' }); onCambio(); } catch (err) { avisar(err.message); }
  }
  const coms = verTodos ? p.comentarios : p.comentarios.slice(-2);
  return (
    <article style={{ ...tarjeta, padding: '16px 18px', display: 'grid', gap: 10, opacity: p.programado ? 0.8 : 1, borderStyle: p.programado ? 'dashed' : 'solid' }} data-post={p.id} data-tipo={p.tipo}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Av nombre={p.autor} color={p.tipo === 'hoy' ? 'var(--teal)' : 'var(--orange)'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>{p.autor}</b>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {p.tipo === 'hoy' && p.fechaClase ? `Clase del ${diaLargo(p.fechaClase)}` : cuando(p.fecha)}{p.editado ? ' · editado' : ''}{tema ? ` · ${tema.nombre}` : ''}
          </div>
        </div>
        <Etiqueta tipo={p.tipo} extra={p.tipo === 'tarea' ? (p.calificacion === 'hecha' ? 'hecha / no hecha' : 'nota de 0 a 10') : null} />
        {equipo && p.puedeCambiar && (
          <span style={{ position: 'relative' }}>
            <button type="button" className="icon-btn" aria-label="Opciones" onClick={() => setMenu(m => !m)}>⋯</button>
            {menu && (
              <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 10, ...tarjeta, borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.15)', padding: 4, display: 'grid', minWidth: 140 }}>
                <button type="button" className="btn btn-sm btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => { setMenu(false); onEditar(p); }}>✏️ Cambiar</button>
                <button type="button" className="btn btn-sm btn-ghost" style={{ justifyContent: 'flex-start', color: 'var(--danger, #dc2626)' }} onClick={quitar}>🗑 Quitar</button>
              </div>
            )}
          </span>
        )}
      </div>
      {p.programado && <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>⏰ Programada: sale el {fechaHora(p.fecha)}. Las familias aún no la ven.</div>}
      {p.titulo && <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16 }}>{p.titulo}</div>}
      {p.texto && <div style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap', fontSize: 14 }}><ConEnlaces texto={p.texto} /></div>}
      <Archivos archivos={p.archivos} />
      {p.enlaces.map((x, i) => (
        <a key={i} href={x.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', background: 'var(--bg-3)', color: 'var(--ink)', textDecoration: 'none' }}>
          <span style={{ width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--bg-2)' }}>{esYoutube(x.url) ? '▶️' : '🔗'}</span>
          <span style={{ minWidth: 0 }}><b style={{ fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.titulo || x.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70)}</b><span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{esYoutube(x.url) ? 'YouTube' : 'Enlace'}</span></span>
        </a>
      ))}
      {p.tipo === 'tarea' && (equipo ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {p.entregaAt && <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: '#fff3cd', color: '#92400e' }}>🗓 Entrega: {fechaHora(p.entregaAt)}</span>}
          <span style={{ flex: '1 1 120px', height: 6, borderRadius: 99, background: 'var(--bg-3)', border: '1px solid var(--line)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${p.entregas.total ? p.entregas.entregadas / p.entregas.total * 100 : 0}%`, background: 'var(--teal)' }} /></span>
          <b style={{ fontSize: 12.5 }}>{p.entregas.entregadas} de {p.entregas.total} entregadas{p.entregas.corregidas ? ` · ${p.entregas.corregidas} corregidas` : ''}</b>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => onTarea(p.id)}>Ver entregas</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {p.entregaAt && <span style={{ fontSize: 12.5, color: '#92400e', fontWeight: 700 }}>🗓 Entrega: {fechaHora(p.entregaAt)}</span>}
          {(p.mias || []).map(m => (
            <div key={m.alumnoId} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              {(p.mias || []).length > 1 && <b>{m.alumno.split(' ')[0]}:</b>}
              <span style={{ fontWeight: 700, color: m.devuelta ? 'var(--teal)' : m.entregada ? 'var(--purple)' : 'var(--ink-3)' }}>
                {m.devuelta ? (p.calificacion === 'hecha' ? (m.hecha ? 'Hecha ✓' : 'No hecha') : m.nota != null ? `Nota: ${nota(m.nota)} / 10` : 'Corregida') : m.entregada ? 'Entregada ✓' : 'Sin entregar'}
              </span>
              <button type="button" className={`btn btn-sm ${!m.entregada && !m.devuelta && activa ? 'btn-primary' : 'btn-outline'}`} onClick={() => onTarea(p.id)}>
                {m.devuelta || !activa ? 'Ver' : m.entregada ? 'Ver la entrega' : 'Entregar'}{m.privados ? ` · 🔒 ${m.privados}` : ''}
              </button>
            </div>
          ))}
        </div>
      ))}
      {/* Comentarios de la clase */}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, display: 'grid', gap: 6 }} data-comentarios>
        {p.comentarios.length > 2 && !verTodos && <button type="button" onClick={() => setVerTodos(true)} style={{ justifySelf: 'start', border: 0, background: 'none', color: 'var(--ink-3)', fontSize: 12.5, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>💬 Ver los {p.nComentarios} comentarios</button>}
        {coms.map(c => (
          <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
            <Av nombre={c.autor} size={24} color="var(--purple)" />
            <div style={{ flex: 1, minWidth: 0 }}><b>{c.mio ? 'Tú' : c.autor}</b> <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>{cuando(c.fecha)}</span><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}><ConEnlaces texto={c.texto} /></div></div>
            {(c.mio || equipo) && activa && <button type="button" className="icon-btn" aria-label="Quitar el comentario" onClick={() => quitarComentario(c)} style={{ opacity: 0.6 }}><I.X width={12} height={12} /></button>}
          </div>
        ))}
        {activa && (
          <form onSubmit={comentar} style={{ display: 'flex', gap: 6 }}>
            <input value={comentario} onChange={e => setComentario(e.target.value)} placeholder="💬 Añadir un comentario a la clase…" style={{ ...campo, padding: '7px 10px', fontSize: 13, background: 'var(--bg-2)' }} aria-label="Comentario" />
            {comentario.trim() && <button type="submit" className="btn btn-sm btn-primary">Enviar</button>}
          </form>
        )}
      </div>
    </article>
  );
}

// ── El aula de una clase ──
export function AulaDeClase({ grupoId, ambito = 'equipo', onVolver, showToast }) {
  const avisar = (t) => (showToast ? showToast(t) : window.alert(t));
  const equipo = ambito === 'equipo';
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('tablon');
  const [temporada, setTemporada] = useState('');
  const [nuevo, setNuevo] = useState(null);     // { tipo, temaId? }
  const [editando, setEditando] = useState(null);
  const [tarea, setTarea] = useState(null);
  const [temaVer, setTemaVer] = useState('todo');
  const [notas, setNotas] = useState(null);
  const [estrecho, setEstrecho] = useState(() => typeof window !== 'undefined' && window.innerWidth < 860);
  useEffect(() => { const f = () => setEstrecho(window.innerWidth < 860); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const cargar = useCallback(async () => {
    try { setD(await pedir(`/api/aulas-clase/${grupoId}?ambito=${ambito}${temporada !== '' ? `&temporada=${temporada}` : ''}`)); setError(null); }
    catch (e) { setError(e.message); }
  }, [grupoId, ambito, temporada]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (tab === 'tareas' && equipo) pedir(`/api/aulas-clase/${grupoId}/notas${temporada !== '' ? `?temporada=${temporada}` : ''}`).then(setNotas).catch(e => avisar(e.message)); }, [tab, grupoId, temporada, d]); // eslint-disable-line react-hooks/exhaustive-deps
  const hecho = (t) => { setNuevo(null); setEditando(null); if (t) avisar(t); cargar(); };

  if (error) return <div className="panel"><p style={{ color: 'var(--ink-3)' }}>{error}</p>{onVolver && <button className="btn btn-sm btn-outline" onClick={onVolver}>Volver</button>}</div>;
  if (!d) return <div className="panel"><p style={{ color: 'var(--ink-3)' }}>Cargando el aula…</p></div>;
  const tareas = d.posts.filter(p => p.tipo === 'tarea');
  const proximas = tareas.filter(p => p.entregaAt && new Date(p.entregaAt) >= new Date(Date.now() - 86400000) && !p.programado).sort((a, b) => new Date(a.entregaAt) - new Date(b.entregaAt)).slice(0, 5);
  const temp = d.temporadas.find(t => t.id === d.temporada);
  const pasada = d.temporada !== d.activa;
  const listaPosts = (lista) => lista.map(p => (editando?.id === p.id
    ? <Editor key={p.id} tipo={p.tipo} post={p} temas={d.temas} grupoId={grupoId} onHecho={hecho} onCancelar={() => setEditando(null)} avisar={avisar} />
    : <Publicacion key={p.id} p={p} d={d} ambito={ambito} onEditar={setEditando} onCambio={(t) => { if (t) avisar(t); cargar(); }} avisar={avisar} onTarea={setTarea} />));
  const publicar = d.yo.puedePublicar && (
    nuevo ? <Editor tipo={nuevo.tipo} temas={d.temas} grupoId={grupoId} temaInicial={nuevo.temaId} onHecho={hecho} onCancelar={() => setNuevo(null)} avisar={avisar} />
      : (
        <div style={{ ...tarjeta, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }} data-publicar>
          <span style={{ flex: '1 1 180px', color: 'var(--ink-3)', fontSize: 14 }}>Publica algo para la clase…</span>
          {Object.entries(TIPOS).map(([k, t]) => (
            <button key={k} type="button" className="btn btn-sm btn-outline" onClick={() => setNuevo({ tipo: k, temaId: tab === 'temas' && typeof temaVer === 'number' ? temaVer : null })}>{t.icono} {t.nombre}</button>
          ))}
        </div>
      ));
  const lateral = (
    <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
      <div style={{ ...tarjeta, padding: 14 }} data-proximas>
        <b style={{ fontSize: 13 }}>Próximas entregas</b>
        {!proximas.length && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 6 }}>Ninguna pendiente.</div>}
        {proximas.map(p => (
          <button key={p.id} type="button" onClick={() => setTarea(p.id)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'none', padding: '6px 0 0', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
            <span style={{ fontSize: 13 }}>📝 {p.titulo}</span>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fechaCorta(p.entregaAt)}{equipo ? ` · ${p.entregas.entregadas}/${p.entregas.total}` : (p.mias || []).every(m => m.entregada) ? ' · entregada ✓' : ' · sin entregar'}</div>
          </button>
        ))}
      </div>
      {d.temas.length > 0 && (
        <div style={{ ...tarjeta, padding: 14 }}>
          <b style={{ fontSize: 13 }}>Temas</b>
          {d.temas.map(t => <button key={t.id} type="button" onClick={() => { setTemaVer(t.id); setTab('temas'); }} style={{ display: 'block', border: 0, background: 'none', padding: '5px 0 0', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink-2)', fontSize: 13, textAlign: 'left' }}>{t.nombre}</button>)}
        </div>
      )}
    </div>
  );

  // Por temas
  const vistosTema = temaVer === 'todo' ? d.posts : temaVer === 'sin' ? d.posts.filter(p => !p.temaId) : d.posts.filter(p => p.temaId === temaVer);
  async function nuevoTema() {
    const nombre = window.prompt('Nombre del tema (por ejemplo «Unit 3 · Holidays», «1.er trimestre», «Cinturón amarillo»):');
    if (!nombre?.trim()) return;
    try { const r = await pedir(`/api/aulas-clase/${grupoId}/temas`, conJson('POST', { nombre })); await cargar(); setTemaVer(r.id); } catch (e) { avisar(e.message); }
  }
  async function renombrarTema(t) {
    const nombre = window.prompt('Nuevo nombre del tema:', t.nombre);
    if (!nombre?.trim() || nombre === t.nombre) return;
    try { await pedir(`/api/aulas-clase/temas/${t.id}`, conJson('PATCH', { nombre })); cargar(); } catch (e) { avisar(e.message); }
  }
  async function quitarTema(t) {
    if (!window.confirm(`¿Quitar el tema «${t.nombre}»? Lo que tiene se queda, sin tema.`)) return;
    try { await pedir(`/api/aulas-clase/temas/${t.id}`, { method: 'DELETE' }); setTemaVer('todo'); cargar(); } catch (e) { avisar(e.message); }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Cabecera */}
      <div style={{ ...tarjeta, overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(120deg,#5233A8,#7c5cff 55%,#ff99d3)', color: '#fff', padding: '22px 24px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {onVolver && <button type="button" onClick={onVolver} aria-label="Volver" style={{ border: 0, background: 'rgba(255,255,255,.18)', color: '#fff', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', flexShrink: 0 }}>‹</button>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', opacity: 0.85, textTransform: 'uppercase' }}>{d.clase.actividad}{temp ? ` · ${temp.nombre}` : ''}{!equipo && d.yo.alumnos.length ? ` · ${d.yo.alumnos.map(a => a.nombre.split(' ')[0]).join(', ')}` : ''}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: estrecho ? 22 : 28, fontWeight: 800, lineHeight: 1.15 }}>{d.clase.nombre}</div>
            <div style={{ opacity: 0.9, fontSize: 13, marginTop: 2 }}>{[d.clase.horario, d.clase.profes.join(', '), `${d.clase.alumnos} ${d.clase.alumnos === 1 ? 'alumno' : 'alumnos'}`].filter(Boolean).join(' · ')}</div>
          </div>
          {d.temporadas.length > 1 && (
            <select value={d.temporada ?? ''} onChange={e => setTemporada(e.target.value)} aria-label="Temporada" style={{ ...campo, width: 'auto', background: 'rgba(255,255,255,.95)' }}>
              {d.temporadas.map(t => <option key={t.id} value={t.id}>{t.nombre}{t.activa ? ' (ahora)' : ''}</option>)}
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderTop: '1px solid var(--line)', overflowX: 'auto' }} data-pestanas>
          {[['tablon', 'Tablón'], ['temas', 'Por temas'], ['tareas', equipo ? 'Tareas y notas' : 'Mis tareas'], ['personas', 'Personas']].map(([k, t]) => (
            <button key={k} type="button" className={`filter-pill ${tab === k ? 'is-active' : ''}`} onClick={() => setTab(k)} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{t}</button>
          ))}
        </div>
      </div>
      {pasada && <div style={{ ...tarjeta, padding: '10px 14px', fontSize: 13, background: '#fff8ec' }}>Estás viendo el curso <b>{temp?.nombre}</b>: lo que se trabajó entonces. Ya no se publica ni se entrega.</div>}
      {equipo && d.yo.sustituto && !d.yo.puedePublicar && !pasada && <div style={{ ...tarjeta, padding: '10px 14px', fontSize: 13 }}>Sustituyes en esta clase: podrás publicar el día que la des.</div>}

      {tab === 'tablon' && (
        <div style={{ display: 'grid', gridTemplateColumns: estrecho ? '1fr' : '240px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
          {lateral}
          <div style={{ display: 'grid', gap: 14 }}>
            {publicar}
            {!d.posts.length && <div style={{ ...tarjeta, padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>{d.yo.puedePublicar ? 'Aún no hay nada. Publica el primer aviso, material o tarea para la clase.' : 'Aún no hay nada en el aula de esta clase.'}</div>}
            {listaPosts(d.posts)}
          </div>
        </div>
      )}

      {tab === 'temas' && (
        <div style={{ display: 'grid', gridTemplateColumns: estrecho ? '1fr' : '260px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
          <div style={{ ...tarjeta, padding: 8, display: 'grid', gap: 2 }} data-temas>
            {[['todo', 'Todo el curso', d.posts.length], ...d.temas.map(t => [t.id, t.nombre, d.posts.filter(p => p.temaId === t.id).length, t]), ['sin', 'Sin tema', d.posts.filter(p => !p.temaId).length]].map(([k, n, c, t]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 10, background: temaVer === k ? 'color-mix(in oklab, var(--purple) 10%, var(--bg-2))' : 'transparent' }}>
                <button type="button" onClick={() => setTemaVer(k)} style={{ flex: 1, display: 'flex', justifyContent: 'space-between', border: 0, background: 'none', padding: '9px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: temaVer === k ? 800 : 500, color: temaVer === k ? 'var(--purple)' : 'var(--ink)', textAlign: 'left' }}>
                  <span>{n}</span><span style={{ color: 'var(--ink-3)' }}>{c}</span>
                </button>
                {t && equipo && !pasada && temaVer === k && <>
                  <button type="button" className="icon-btn" aria-label="Cambiar el nombre" onClick={() => renombrarTema(t)}><I.Edit width={13} height={13} /></button>
                  <button type="button" className="icon-btn" aria-label="Quitar el tema" onClick={() => quitarTema(t)}><I.Trash width={13} height={13} /></button>
                </>}
              </div>
            ))}
            {equipo && !pasada && <button type="button" onClick={nuevoTema} style={{ border: 0, background: 'none', padding: '9px 10px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink-3)', fontSize: 13.5 }}>＋ Nuevo tema</button>}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {publicar}
            {vistosTema.filter(p => p.tipo === 'hoy').length > 0 && (
              <div style={{ ...tarjeta, padding: '12px 16px' }}>
                <b style={{ fontSize: 13 }}>📒 Lo trabajado{typeof temaVer === 'number' ? ' en este tema' : ''}</b>
                <div style={{ fontSize: 13, lineHeight: 1.8, marginTop: 6 }}>
                  {vistosTema.filter(p => p.tipo === 'hoy').map(p => <div key={p.id}><span style={{ color: 'var(--ink-3)' }}>{p.fechaClase ? fechaCorta(`${p.fechaClase}T12:00:00`) : fechaCorta(p.fecha)}</span> · {p.texto}</div>)}
                </div>
              </div>
            )}
            {listaPosts(vistosTema.filter(p => p.tipo !== 'hoy'))}
            {!vistosTema.length && <div style={{ ...tarjeta, padding: 20, color: 'var(--ink-3)', textAlign: 'center' }}>Nada en este tema todavía.</div>}
          </div>
        </div>
      )}

      {tab === 'tareas' && (equipo ? (
        <div style={{ ...tarjeta, padding: 14, overflowX: 'auto' }} data-notas>
          {!notas ? <span style={{ color: 'var(--ink-3)' }}>Cargando…</span> : !notas.tareas.length ? <span style={{ color: 'var(--ink-3)' }}>Aún no hay tareas.</span> : (
            <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' }}>
              <thead><tr>
                <th style={{ textAlign: 'left', padding: '6px 10px', position: 'sticky', left: 0, background: 'var(--bg-2)' }}>Alumno</th>
                {notas.tareas.map(t => <th key={t.id} style={{ padding: '6px 10px', fontWeight: 700, maxWidth: 140, fontSize: 12 }}><button type="button" onClick={() => setTarea(t.id)} style={{ border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, color: 'var(--purple)' }} title={t.titulo}>{t.titulo.length > 22 ? `${t.titulo.slice(0, 20)}…` : t.titulo}</button><div style={{ color: 'var(--ink-3)', fontWeight: 500 }}>{t.entregaAt ? fechaCorta(t.entregaAt) : ''}</div></th>)}
                <th style={{ padding: '6px 10px' }}>Media</th>
              </tr></thead>
              <tbody>{notas.alumnos.map(a => {
                const conNota = notas.tareas.filter(t => t.calificacion !== 'hecha' && a.notas[t.id]?.nota != null).map(t => a.notas[t.id].nota);
                return (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--bg-2)' }}>{a.nombre}</td>
                    {notas.tareas.map(t => { const x = a.notas[t.id]; return (
                      <td key={t.id} style={{ padding: '7px 10px', textAlign: 'center', cursor: 'pointer' }} onClick={() => setTarea(t.id)}>
                        {x?.devuelta ? (t.calificacion === 'hecha' ? (x.hecha ? <span style={{ color: 'var(--teal)', fontWeight: 800 }}>✓</span> : <span style={{ color: 'var(--orange)' }}>✗</span>) : <b>{x.nota != null ? nota(x.nota) : '✓'}</b>)
                          : x?.entregada ? <span title="Entregada, sin corregir">📥</span> : <span style={{ color: 'var(--ink-3)' }}>—</span>}
                      </td>); })}
                    <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 800 }}>{conNota.length ? nota((conNota.reduce((s, x) => s + x, 0) / conNota.length).toFixed(1)) : '—'}</td>
                  </tr>);
              })}</tbody>
            </table>
          )}
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>📥 entregada sin corregir · ✓ / ✗ hecha o no · — sin entregar. Pulsa una casilla para corregir.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }} data-mis-tareas>
          {!tareas.length && <div style={{ ...tarjeta, padding: 20, color: 'var(--ink-3)' }}>Aún no hay tareas.</div>}
          {tareas.map(p => (
            <button key={p.id} type="button" onClick={() => setTarea(p.id)} style={{ ...tarjeta, padding: '12px 16px', display: 'grid', gap: 4, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
              <b>📝 {p.titulo}</b>
              <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{p.entregaAt ? `Entrega: ${fechaHora(p.entregaAt)}` : 'Sin fecha de entrega'}</span>
              {(p.mias || []).map(m => <span key={m.alumnoId} style={{ fontSize: 13, fontWeight: 700, color: m.devuelta ? 'var(--teal)' : m.entregada ? 'var(--purple)' : '#92400e' }}>
                {(p.mias || []).length > 1 ? `${m.alumno.split(' ')[0]}: ` : ''}{m.devuelta ? (p.calificacion === 'hecha' ? (m.hecha ? 'Hecha ✓' : 'No hecha') : m.nota != null ? `${nota(m.nota)} / 10` : 'Corregida') : m.entregada ? 'Entregada' : 'Sin entregar'}</span>)}
            </button>
          ))}
        </div>
      ))}

      {tab === 'personas' && (
        <div style={{ display: 'grid', gridTemplateColumns: estrecho ? '1fr' : '1fr 1fr', gap: 14, alignItems: 'start' }}>
          <div style={{ ...tarjeta, padding: 16, display: 'grid', gap: 8 }}>
            <b>Profes</b>
            {d.clase.profes.length ? d.clase.profes.map(n => <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Av nombre={n} size={30} /> {n}</div>) : <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>Sin profe asignado en el horario.</span>}
          </div>
          <div style={{ ...tarjeta, padding: 16, display: 'grid', gap: 8 }}>
            <b>Alumnos ({d.clase.alumnos})</b>
            {equipo ? d.alumnos.map(a => <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}><Av nombre={a.nombre} size={28} color="var(--purple)" /> {a.nombre}</div>)
              : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>En la clase {d.clase.alumnos === 1 ? 'hay 1 alumno' : `hay ${d.clase.alumnos} alumnos`}. De tu familia: {d.yo.alumnos.map(a => a.nombre).join(', ')}.</span>}
          </div>
        </div>
      )}

      {tarea && <Tarea postId={tarea} ambito={ambito} onCerrar={() => setTarea(null)} onCambio={cargar} avisar={avisar} />}
    </div>
  );
}

// ── «Lo de hoy» desde Pasar lista ──
export function LoDeHoy({ groupId, fecha, showToast }) {
  const [texto, setTexto] = useState('');
  const [guardado, setGuardado] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState(null);
  useEffect(() => {
    let vivo = true;
    setEstado(null); setTexto(''); setGuardado('');
    pedir(`/api/aulas-clase/${groupId}/hoy/${fecha}`).then(d => { if (vivo) { setTexto(d.texto); setGuardado(d.texto); setAbierto(!!d.texto); setEstado('listo'); } }).catch(() => vivo && setEstado('no'));
    return () => { vivo = false; };
  }, [groupId, fecha]);
  if (estado === 'no' || fecha > hoyISO()) return null;
  async function guardar() {
    try {
      await pedir(`/api/aulas-clase/${groupId}/hoy/${fecha}`, conJson('PUT', { texto }));
      setGuardado(texto.trim());
      showToast?.(texto.trim() ? 'Guardado en el aula de la clase.' : 'Quitado del aula de la clase.');
    } catch (e) { showToast ? showToast(e.message) : window.alert(e.message); }
  }
  return (
    <div style={{ background: 'color-mix(in oklab, var(--teal) 8%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--teal) 30%, var(--line))', borderRadius: 14, padding: '10px 14px', display: 'grid', gap: 8 }} data-lo-de-hoy>
      {!abierto ? (
        <button type="button" onClick={() => setAbierto(true)} style={{ border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: 'var(--ink-2)', padding: 0 }}>
          📒 <b>¿Qué habéis hecho hoy?</b> <span style={{ color: 'var(--ink-3)' }}>(opcional · sale en el aula de la clase)</span>
        </button>
      ) : (
        <>
          <b style={{ fontSize: 13.5 }}>📒 Lo de hoy <span style={{ fontWeight: 500, color: 'var(--ink-3)' }}>· sale en el aula de la clase para las familias</span></b>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} placeholder="Por ejemplo: «Repasamos el tul Chon-Ji y practicamos patadas laterales»." style={{ ...campo, resize: 'vertical', background: 'var(--bg-2)' }} aria-label="Lo de hoy" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn btn-sm btn-primary" onClick={guardar} disabled={texto.trim() === guardado}>Guardar</button>
            {guardado && texto.trim() === guardado && <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 700 }}>✓ En el aula</span>}
          </div>
        </>
      )}
    </div>
  );
}

// ── Panel: todas las aulas (o las suyas, un profe) ──
export default function AulasClase({ showToast, enlace }) {
  const [clases, setClases] = useState(null);
  const [q, setQ] = useState('');
  const [abierta, setAbierta] = useState(() => { try { return new URLSearchParams(window.location.search).get('clase') || null; } catch { return null; } });
  const cargar = useCallback(() => pedir('/api/aulas-clase').then(d => setClases(d.clases || [])).catch(() => setClases([])), []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { const c = enlace?.params?.clase; if (c) setAbierta(c); }, [enlace?.ruta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (abierta) u.searchParams.set('clase', abierta); else u.searchParams.delete('clase');
      window.history.replaceState(window.history.state, '', u.pathname + u.search);
    } catch { /* nada */ }
  }, [abierta]);
  const vistas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (clases || []).filter(c => !t || `${c.nombre} ${c.actividad}`.toLowerCase().includes(t));
  }, [clases, q]);
  if (abierta) return <AulaDeClase grupoId={abierta} ambito="equipo" showToast={showToast} onVolver={() => { setAbierta(null); cargar(); }} />;
  const porActividad = [...new Set(vistas.map(c => c.actividad))];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13.5, flex: '1 1 300px' }}>Cada clase tiene su aula: avisos, materiales, tareas y lo que se trabaja cada día. Sus alumnos y familias la ven en su área. Los cursos online siguen en «Aula virtual».</p>
        {(clases || []).length > 6 && <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar clase…" style={{ ...campo, width: 220 }} aria-label="Buscar clase" />}
      </div>
      {clases === null && <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>}
      {clases && !clases.length && <p style={{ color: 'var(--ink-3)' }}>No tienes clases.</p>}
      {porActividad.map(act => (
        <div key={act} style={{ display: 'grid', gap: 10 }}>
          <b style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{act}</b>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
            {vistas.filter(c => c.actividad === act).map(c => (
              <button key={c.id} type="button" onClick={() => setAbierta(c.id)} data-aula-clase={c.id}
                style={{ ...tarjeta, padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', display: 'grid' }}>
                <span style={{ height: 8, background: 'linear-gradient(90deg,#5233A8,#7c5cff,#ff99d3)' }} />
                <span style={{ padding: '12px 14px', display: 'grid', gap: 4 }}>
                  <b style={{ fontSize: 15 }}>{c.nombre}</b>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{[c.horario, `${c.alumnos} alumnos`].filter(Boolean).join(' · ')}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-2)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span>{c.publicaciones ? `${c.publicaciones} publicaciones` : 'Aún vacía'}</span>
                    {c.ultima && <span style={{ color: 'var(--ink-3)' }}>· última {fechaCorta(c.ultima)}</span>}
                    {c.por_corregir > 0 && <span style={{ color: 'var(--purple)', fontWeight: 800 }}>· 📥 {c.por_corregir} por corregir</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
