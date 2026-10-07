import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from './Icons.jsx';
import { fmtFecha } from '../fechas.js';
import { alAtras } from '../app-movil.js';

// ─────────────────────────────────────────────────────────────────────────────
// Galería de fotos (#364). Dos pantallas:
//  · AdminGaleria: el club crea álbumes, sube fotos (se reducen en el navegador
//    antes de subirlas) y etiqueta a quien sale, viendo si tiene permiso de fotos.
//  · FotosFamilia: cada familia ve solo lo suyo (las fotos donde sale alguien de
//    la familia y los álbumes de sus clases o actividades) y puede descargarlas.
// ─────────────────────────────────────────────────────────────────────────────

const AUDIENCIAS = {
  etiquetados: { label: 'Solo quien sale', ayuda: 'Cada foto la ve solo la familia de quien está etiquetado en ella.' },
  grupo: { label: 'Una clase', ayuda: 'Todo el álbum lo ven las familias de esa clase.' },
  actividad: { label: 'Una actividad', ayuda: 'Todo el álbum lo ven las familias de esa actividad (todas sus clases).' },
  club: { label: 'Todo el club', ayuda: 'Todo el álbum lo ven todas las familias con alguien apuntado.' },
};
const mini = (id) => `/api/galeria/fotos/${id}/mini`;
const grande = (id) => `/api/galeria/fotos/${id}/grande`;
const mb = (b) => `${(b / 1024 / 1024).toFixed(b > 100 * 1024 * 1024 ? 0 : 1)} MB`;
// Lo que se reserva para la galería en la base (1 GB entre todas las apps).
const CUPO_GALERIA = 700 * 1024 * 1024;
const paraQuien = (a) => (a.audiencia === 'grupo' ? `Clase ${a.grupo || ''}` : a.audiencia === 'actividad' ? a.actividad : AUDIENCIAS[a.audiencia]?.label);

const esHeic = (f) => /^image\/hei[cf]/i.test(f.type || '') || /\.hei[cf]$/i.test(f.name || '');
// Abre la imagen. Las fotos del iPhone (HEIC) solo las entiende Safari: en el
// resto se pasan a JPG aquí mismo con heic2any, que se descarga solo cuando hace
// falta (pesa bastante y la mayoría de fotos no lo necesitan).
async function abrirImagen(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (bmp) return bmp;
  if (esHeic(file)) {
    const heic2any = (await import('heic2any')).default;
    const jpg = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const b = Array.isArray(jpg) ? jpg[0] : jpg;
    return createImageBitmap(b, { imageOrientation: 'from-image' });
  }
  return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('No se puede leer esta imagen')); i.src = URL.createObjectURL(file); });
}
// ¿Tiene partes transparentes? (se mira una muestra de puntos, que basta).
function tieneTransparencia(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const paso = Math.max(4, Math.floor(d.length / 4 / 40000)) * 4;
  for (let i = 3; i < d.length; i += paso) if (d[i] < 250) return true;
  return false;
}
// Reduce una foto en el navegador: lado largo 'max' px. Sale en JPEG, salvo un
// PNG con transparencias (un logo, un diploma recortado), que se queda en PNG
// para no ponerle un fondo blanco. Respeta la orientación de la cámara.
async function reducir(img, max, calidad, { png = false } = {}) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
  const ctx = c.getContext('2d');
  if (png) {
    ctx.drawImage(img, 0, 0, c.width, c.height);
    if (tieneTransparencia(ctx, c.width, c.height)) {
      const data = c.toDataURL('image/png');
      if (data.length < max * 560) return { data, ancho: c.width, alto: c.height };
    }
    ctx.globalCompositeOperation = 'destination-over';
  }
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  if (!png) ctx.drawImage(img, 0, 0, c.width, c.height);
  let q = calidad, data = c.toDataURL('image/jpeg', q);
  while (data.length > max * 700 && q > 0.5) { q -= 0.08; data = c.toDataURL('image/jpeg', q); }
  return { data, ancho: c.width, alto: c.height };
}

const api = async (url, opts = {}) => {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
};
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%' };
const chip = (color, extra = {}) => ({ fontSize: 11, fontWeight: 800, color, background: `color-mix(in oklab, ${color} 13%, var(--bg-2))`, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', ...extra });

// Sin tildes ni mayúsculas, para buscar: «danza» encuentra «Danza».
const sinTildes = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const MAX_ELEGIDOS = 200;

// ── Buscar una clase del club (para coger a su gente «por clase») ──
function BuscarClase({ grupos, onElegir, placeholder }) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const t = sinTildes(q.trim());
  const res = abierto ? grupos.filter(g => !t || sinTildes(`${g.name} ${g.actividad}`).includes(t)).slice(0, 40) : [];
  const elegir = (g) => { setQ(''); setAbierto(false); onElegir(g); };
  return (
    <div style={{ position: 'relative' }}>
      <input style={campo} value={q} placeholder={placeholder} aria-label="Buscar una clase"
        onChange={e => { setQ(e.target.value); setAbierto(true); }} onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (res[0]) elegir(res[0]); } if (e.key === 'Escape') setAbierto(false); }} />
      {abierto && (res.length > 0 || t) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 6, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, marginTop: 2, maxHeight: 240, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
          {!res.length && <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-3)' }}>Ninguna clase con ese nombre.</div>}
          {res.map(g => (
            <button key={g.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => elegir(g)}
              style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--line-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)' }}>
              <b style={{ flex: 1, minWidth: 0 }}>{g.name}<span style={{ fontWeight: 400, color: 'var(--ink-3)' }}> · {g.actividad}</span></b>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{g.alumnos ?? 0} alumno{g.alumnos !== 1 ? 's' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
// ── Buscar a alguien del club por su nombre (con sus clases y si tiene permiso
// de fotos); «excluir»: quien ya está y no hace falta ofrecer. ──
function BuscarPersona({ excluir, onElegir, placeholder }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(() => {
      api(`/api/admin/galeria-personas?q=${encodeURIComponent(q.trim())}`).then(d => setRes(d.personas || [])).catch(() => setRes([]));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);
  const lista = res.filter(p => !excluir.has(p.id));
  // Se vacía al elegir, salvo si se echa atrás (p. ej. en el aviso de «sin permiso de fotos»).
  const elegir = async (p) => { if ((await onElegir(p)) !== false) { setQ(''); setRes([]); } };
  return (
    <div style={{ position: 'relative' }}>
      {/* Intro no manda el formulario del álbum: elige, si solo sale una persona. */}
      <input style={campo} value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (lista.length === 1) elegir(lista[0]); } }} />
      {lista.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, marginTop: 2, maxHeight: 220, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
          {lista.map(p => (
            <button key={p.id} type="button" onClick={() => elegir(p)}
              style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--line-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)' }}>
              <b style={{ flex: 1, minWidth: 0 }}>{p.nombre}{p.clases ? <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}> · {p.clases}</span> : ''}</b>
              {!p.permiso && <span style={chip('#E5484D')}>Sin permiso de fotos</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
// La clase elegida en un BuscarClase, con sus alumnos (null mientras se cargan).
function useClaseElegida() {
  const [clase, setClase] = useState(null);
  const elegir = useCallback((g) => {
    setClase({ ...g, alumnos: null, error: '' });
    api(`/api/admin/galeria-clase/${g.id}`)
      .then(d => setClase(c => (c?.id === g.id ? { ...c, alumnos: d.alumnos || [] } : c)))
      .catch(e => setClase(c => (c?.id === g.id ? { ...c, alumnos: [], error: e.message } : c)));
  }, []);
  return [clase, elegir, () => setClase(null)];
}
const chipPersona = (p, extra = {}) => ({ ...chip(p.permiso ? 'var(--purple)' : '#E5484D'), display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 6px 4px 10px', ...extra });
const cruz = { border: 0, background: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1, fontSize: 14, fontFamily: 'inherit' };

// ── «Quién sale en este álbum» (álbumes «solo quien sale»): se busca una clase,
// se marca a quién y se repite con otras clases. Luego, en cada foto, esa gente
// sale para etiquetarla de un toque. ──
function QuienSale({ grupos, personas, onCambio }) {
  const [clase, elegirClase, cerrarClase] = useClaseElegida();
  const ya = new Set(personas.map(p => p.id));
  const alumnos = clase?.alumnos || [];
  const todos = alumnos.length > 0 && alumnos.every(a => ya.has(a.id));
  const marcar = (p, si) => onCambio(si ? (ya.has(p.id) ? personas : [...personas, p]) : personas.filter(x => x.id !== p.id));
  const marcarTodos = () => {
    const deLaClase = new Set(alumnos.map(a => a.id));
    onCambio(todos ? personas.filter(p => !deLaClase.has(p.id)) : [...personas, ...alumnos.filter(a => !ya.has(a.id))]);
  };
  return (
    <div style={{ display: 'grid', gap: 8, padding: 12, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--bg-2)' }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>Quién sale en este álbum <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(opcional)</span></span>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Busca una clase y marca a quién; puedes coger gente de varias clases (o a alguien suelto por su nombre). Luego, en cada foto, te saldrán para etiquetarlos de un toque (o a todos a la vez).</span>
      <BuscarClase grupos={grupos} onElegir={elegirClase} placeholder="Buscar una clase: escribe su nombre o la actividad…" />
      <BuscarPersona excluir={ya} onElegir={p => marcar({ id: p.id, nombre: p.nombre, permiso: p.permiso }, true)} placeholder="O añade a alguien suelto: escribe su nombre…" />
      {clase && (
        <div style={{ display: 'grid', gap: 6, padding: 10, borderRadius: 10, background: 'var(--bg-3)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13, flex: 1, minWidth: 0 }}>{clase.name} <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· {clase.actividad}</span></b>
            {alumnos.length > 0 && (
              <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <input type="checkbox" checked={todos} onChange={marcarTodos} /> Todos
              </label>
            )}
            <button type="button" onClick={cerrarClase} aria-label="Cerrar la clase" style={{ ...cruz, fontSize: 16, color: 'var(--ink-3)' }}>×</button>
          </div>
          {clase.alumnos === null && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Cargando alumnos…</span>}
          {clase.error && <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>{clase.error}</span>}
          {clase.alumnos && !clase.error && !alumnos.length && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Esta clase no tiene alumnos.</span>}
          {alumnos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: '2px 10px', maxHeight: 220, overflowY: 'auto' }}>
              {alumnos.map(a => (
                <label key={a.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, padding: '3px 0', cursor: 'pointer', color: a.permiso ? 'var(--ink)' : '#E5484D' }}
                  title={a.permiso ? undefined : 'No tiene permiso de fotos'}>
                  <input type="checkbox" checked={ya.has(a.id)} onChange={e => marcar(a, e.target.checked)} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.permiso ? '' : '⚠ '}{a.nombre}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {!personas.length
          ? <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Todavía no has elegido a nadie.</span>
          : <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Elegidos · {personas.length}</span>}
        {personas.map(p => (
          <span key={p.id} style={chipPersona(p)} title={p.permiso ? undefined : 'No tiene permiso de fotos'}>
            {p.permiso ? '' : '⚠ '}{p.nombre}
            <button type="button" onClick={() => marcar(p, false)} aria-label={`Quitar a ${p.nombre}`} style={cruz}>×</button>
          </span>
        ))}
        {personas.length > 1 && <button type="button" onClick={() => onCambio([])} style={{ ...cruz, fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', textDecoration: 'underline' }}>Quitar a todos</button>}
      </div>
      {personas.length > MAX_ELEGIDOS && <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>Como mucho {MAX_ELEGIDOS} personas por álbum: quita a {personas.length - MAX_ELEGIDOS}.</span>}
    </div>
  );
}

// ── El formulario de un álbum (nuevo o editar) ──
function FormAlbum({ inicial, opciones, onGuardar, onCancelar, guardando }) {
  // Un profe solo hace álbumes de sus clases: siempre «una clase».
  const soloClase = !!opciones.soloSusClases;
  const [f, setF] = useState(() => ({ titulo: '', descripcion: '', fecha: new Date().toLocaleDateString('sv-SE'), audiencia: soloClase ? 'grupo' : 'etiquetados', groupId: soloClase && opciones.grupos.length === 1 ? opciones.grupos[0].id : '', actividad: '', personas: [], ...inicial }));
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  // La gente elegida solo cuenta en «solo quien sale»: se mandan sus ids.
  const guardar = () => {
    const { personas, ...resto } = f;
    onGuardar(f.audiencia === 'etiquetados' && !soloClase ? { ...resto, personas: personas.map(p => p.id) } : resto);
  };
  return (
    <form onSubmit={e => { e.preventDefault(); guardar(); }} style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 700 }}>Título
          <input style={campo} value={f.titulo} onChange={set('titulo')} required maxLength={160} placeholder="Ej. Exhibición de Ballet · Navidad" /></label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 700 }}>Fecha
          <input style={campo} type="date" value={String(f.fecha || '').slice(0, 10)} onChange={set('fecha')} /></label>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{soloClase ? '¿De qué clase es?' : '¿Quién lo ve?'}</span>
        <div style={{ display: soloClase ? 'none' : 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(AUDIENCIAS).map(([k, v]) => (
            <button key={k} type="button" className={`filter-pill ${f.audiencia === k ? 'is-active' : ''}`} onClick={() => setF(x => ({ ...x, audiencia: k }))}>{v.label}</button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{AUDIENCIAS[f.audiencia].ayuda} Además, siempre lo ve la familia de quien sale etiquetado.</span>
        {soloClase && !opciones.grupos.length && <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>No tienes ninguna clase asignada en el horario.</span>}
        {f.audiencia === 'grupo' && (
          <select style={campo} value={f.groupId || ''} onChange={set('groupId')} required aria-label="Clase">
            <option value="">Elige la clase…</option>
            {opciones.grupos.map(g => <option key={g.id} value={g.id}>{g.actividad} · {g.name}</option>)}
          </select>
        )}
        {f.audiencia === 'actividad' && (
          <select style={campo} value={f.actividad || ''} onChange={set('actividad')} required aria-label="Actividad">
            <option value="">Elige la actividad…</option>
            {opciones.actividades.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {f.audiencia === 'etiquetados' && !soloClase && (
          <QuienSale grupos={opciones.grupos} personas={f.personas} onCambio={personas => setF(x => ({ ...x, personas }))} />
        )}
      </div>
      <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 700 }}>Descripción <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(opcional)</span>
        <textarea style={{ ...campo, resize: 'vertical' }} rows={2} value={f.descripcion || ''} onChange={set('descripcion')} maxLength={1000} /></label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        {onCancelar && <button type="button" className="btn btn-outline" onClick={onCancelar}>Cancelar</button>}
      </div>
    </form>
  );
}

// ── Etiquetar a quien sale en una foto ──
// onCambio recibe una función (foto → foto nueva): así dos toques seguidos no se pisan.
// «elegidos»: la gente elegida para el álbum («Quién sale en este álbum»).
// «grupos»: las clases para «Buscar por clase» (vacío = no se muestra).
function Etiquetas({ foto, sugeridos, elegidos = [], grupos = [], onCambio, showToast }) {
  const [clase, elegirClase, cerrarClase] = useClaseElegida();
  const [poniendo, setPoniendo] = useState(false);
  const ya = new Set(foto.etiquetas.map(e => e.userId));
  async function poner(p) {
    if (!p.permiso && !window.confirm(`${p.nombre} NO tiene permiso de fotos.\n\n¿Etiquetarle igualmente? Su familia y quien vea este álbum le verán en la foto.`)) return false;
    try {
      const d = await api(`/api/admin/galeria/fotos/${foto.id}/etiquetas`, { method: 'POST', body: { userId: p.id } });
      onCambio(x => ({ ...x, etiquetas: [...x.etiquetas.filter(e => e.userId !== p.id), { userId: p.id, nombre: d.nombre, permiso: d.permiso }] }));
    } catch (e) { showToast?.(e.message); return false; }
  }
  // «Etiquetar a todos»: de una vez, preguntando una sola vez si alguno no tiene permiso.
  async function ponerVarios(lista) {
    const nuevos = lista.filter(p => !ya.has(p.id));
    if (!nuevos.length || poniendo) return;
    const sin = nuevos.filter(p => !p.permiso);
    if (sin.length && !window.confirm(`${sin.length === 1 ? `${sin[0].nombre} NO tiene` : `${sin.length} personas NO tienen`} permiso de fotos${sin.length > 1 ? `: ${sin.map(p => p.nombre).join(', ')}` : ''}.\n\n¿Etiquetar a los ${nuevos.length} igualmente? Sus familias y quien vea este álbum les verán en la foto.`)) return;
    setPoniendo(true);
    try {
      const d = await api(`/api/admin/galeria/fotos/${foto.id}/etiquetas`, { method: 'POST', body: { userIds: nuevos.map(p => p.id) } });
      const otros = new Set((d.etiquetados || []).map(e => e.userId));
      onCambio(x => ({ ...x, etiquetas: [...x.etiquetas.filter(e => !otros.has(e.userId)), ...(d.etiquetados || [])] }));
    } catch (e) { showToast?.(e.message); } finally { setPoniendo(false); }
  }
  async function quitar(e) {
    try {
      await api(`/api/admin/galeria/fotos/${foto.id}/etiquetas/${e.userId}`, { method: 'DELETE' });
      onCambio(x => ({ ...x, etiquetas: x.etiquetas.filter(y => y.userId !== e.userId) }));
    } catch (er) { showToast?.(er.message); }
  }
  const sinEtiquetar = sugeridos.filter(s => !ya.has(s.id));
  const elegidosSin = elegidos.filter(s => !ya.has(s.id));
  const deLaClaseSin = (clase?.alumnos || []).filter(s => !ya.has(s.id));
  // Un botón «+ nombre» de un toque (con ⚠ si no tiene permiso de fotos).
  const unToque = (s) => (
    <button key={s.id} type="button" onClick={() => poner(s)} title={s.permiso ? undefined : 'Sin permiso de fotos'}
      style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${s.permiso ? 'var(--line)' : 'color-mix(in oklab, #E5484D 45%, var(--line))'}`, background: 'var(--bg-3)', color: s.permiso ? 'var(--ink-2)' : '#E5484D' }}>
      + {s.nombre}{s.permiso ? '' : ' ⚠'}
    </button>
  );
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <b style={{ fontSize: 13 }}>Quién sale {foto.etiquetas.length ? `· ${foto.etiquetas.length}` : ''}</b>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {!foto.etiquetas.length && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Nadie etiquetado todavía.</span>}
        {foto.etiquetas.map(e => (
          <span key={e.userId} style={chipPersona(e)} title={e.permiso ? undefined : 'No tiene permiso de fotos'}>
            {e.permiso ? '' : '⚠ '}{e.nombre}
            <button type="button" onClick={() => quitar(e)} aria-label={`Quitar a ${e.nombre}`} style={cruz}>×</button>
          </span>
        ))}
      </div>
      {elegidos.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-3)', flex: 1, minWidth: 0 }}>
              {elegidosSin.length ? 'Quién sale en este álbum (un toque para etiquetar):' : 'Ya están etiquetados todos los elegidos para este álbum.'}
            </span>
            {elegidosSin.length > 1 && (
              <button type="button" className="btn btn-sm btn-outline" disabled={poniendo} onClick={() => ponerVarios(elegidosSin)}>
                {poniendo ? 'Etiquetando…' : `Etiquetar a todos (${elegidosSin.length})`}
              </button>
            )}
          </div>
          {elegidosSin.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxHeight: 130, overflowY: 'auto' }}>{elegidosSin.map(unToque)}</div>}
        </div>
      )}
      <BuscarPersona excluir={ya} onElegir={poner} placeholder="Etiquetar a alguien: escribe su nombre…" />
      {sinEtiquetar.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>De la clase (un toque para etiquetar):</span>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxHeight: 130, overflowY: 'auto' }}>
            {sinEtiquetar.map(unToque)}
          </div>
        </div>
      )}
      {grupos.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <BuscarClase grupos={grupos} onElegir={elegirClase} placeholder="Buscar por clase: escribe su nombre o la actividad…" />
          {clase && (
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--ink-3)', flex: 1, minWidth: 0 }}>
                  <b style={{ color: 'var(--ink-2)' }}>{clase.name}</b> · {clase.actividad}
                  {clase.alumnos === null ? ' · cargando…' : clase.error ? '' : deLaClaseSin.length ? ' (un toque para etiquetar):' : clase.alumnos.length ? ' · ya están todos etiquetados.' : ' · no tiene alumnos.'}
                </span>
                <button type="button" onClick={cerrarClase} aria-label="Cerrar la clase" style={{ ...cruz, fontSize: 16, color: 'var(--ink-3)' }}>×</button>
              </div>
              {clase.error && <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>{clase.error}</span>}
              {deLaClaseSin.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxHeight: 130, overflowY: 'auto' }}>{deLaClaseSin.map(unToque)}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Un álbum por dentro ──
function Album({ id, opciones, onVolver, showToast }) {
  const [d, setD] = useState(null);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(null); // { hechas, total, fallos }
  const [abierta, setAbierta] = useState(null); // índice de la foto abierta
  const [encima, setEncima] = useState(false);
  const inputRef = useRef(null);
  const cargar = useCallback(() => api(`/api/admin/galeria/${id}`).then(setD).catch(e => showToast?.(e.message)), [id, showToast]);
  useEffect(() => { cargar(); }, [cargar]);

  async function subir(files) {
    const lista = [...(files || [])].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|hei[cf])$/i.test(f.name));
    if (!lista.length) return;
    setSubiendo({ hechas: 0, total: lista.length, fallos: [], convirtiendo: lista.some(esHeic) });
    for (const f of lista) {
      try {
        const img = await abrirImagen(f);
        const png = /png/i.test(f.type) || /\.png$/i.test(f.name);
        const g = await reducir(img, 1600, 0.82, { png });
        const m = await reducir(img, 420, 0.72, { png });
        await api(`/api/admin/galeria/${id}/fotos`, { method: 'POST', body: { imagen: g.data, miniatura: m.data, ancho: g.ancho, alto: g.alto } });
        setSubiendo(s => ({ ...s, hechas: s.hechas + 1 }));
      } catch (e) {
        setSubiendo(s => ({ ...s, hechas: s.hechas + 1, fallos: [...s.fallos, `${f.name}: ${esHeic(f) ? 'no se ha podido pasar esta foto del iPhone a JPG' : e.message}`] }));
      }
    }
    await cargar();
    setSubiendo(s => (s?.fallos.length ? s : null));
  }
  async function guardarAlbum(f) {
    setGuardando(true);
    try { await api(`/api/admin/galeria/${id}`, { method: 'PUT', body: f }); setEditando(false); showToast?.('Álbum guardado.'); cargar(); }
    catch (e) { showToast?.(e.message); } finally { setGuardando(false); }
  }
  async function publicar(si) {
    const a = d.album;
    const sinPermiso = [...new Map(d.fotos.flatMap(f => f.etiquetas).filter(e => !e.permiso).map(e => [e.userId, e.nombre])).values()];
    if (si) {
      const aviso = `¿Publicar «${a.titulo}»? Lo verán ${a.audiencia === 'etiquetados' ? 'las familias de quien sale en cada foto' : `las familias de ${paraQuien(a)}`} y les saldrá un aviso.`
        + (sinPermiso.length ? `\n\n⚠ Sale gente SIN permiso de fotos: ${sinPermiso.join(', ')}.` : '');
      if (!window.confirm(aviso)) return;
    }
    try { await api(`/api/admin/galeria/${id}`, { method: 'PUT', body: { publicado: si } }); showToast?.(si ? 'Publicado: ya lo ven las familias.' : 'Vuelve a ser un borrador.'); cargar(); }
    catch (e) { showToast?.(e.message); }
  }
  async function borrarAlbum() {
    if (!window.confirm(`¿Borrar el álbum «${d.album.titulo}» con sus ${d.fotos.length} fotos? No se puede deshacer.`)) return;
    try { await api(`/api/admin/galeria/${id}`, { method: 'DELETE' }); showToast?.('Álbum borrado.'); onVolver(true); }
    catch (e) { showToast?.(e.message); }
  }
  async function borrarFoto(f) {
    if (!window.confirm('¿Borrar esta foto?')) return;
    try {
      await api(`/api/admin/galeria/fotos/${f.id}`, { method: 'DELETE' });
      setD(x => ({ ...x, fotos: x.fotos.filter(y => y.id !== f.id) }));
      // Queda abierta la siguiente (o la anterior, si era la última); sin fotos, se cierra.
      setAbierta(i => { const quedan = d.fotos.length - 1; return quedan <= 0 || i === null ? null : Math.min(i, quedan - 1); });
    } catch (e) { showToast?.(e.message); }
  }
  // cambio: foto → foto nueva (sobre la última versión, por si llegan dos seguidos).
  const cambiarFoto = (id, cambio) => setD(x => ({ ...x, fotos: x.fotos.map(y => (y.id === id ? cambio(y) : y)) }));
  // Teclado en la foto abierta: flechas para pasar, Esc para cerrar.
  useEffect(() => {
    if (abierta === null) return;
    const k = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') setAbierta(null);
      if (e.key === 'ArrowRight') setAbierta(i => Math.min(d.fotos.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setAbierta(i => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [abierta, d?.fotos.length]);

  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  const a = d.album;
  const foto = abierta !== null ? d.fotos[abierta] : null;
  const sinEtiquetar = d.fotos.filter(f => !f.etiquetas.length).length;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <button type="button" onClick={() => onVolver(false)} style={{ justifySelf: 'start', background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--purple)', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>← Todos los álbumes</button>
      <div className="panel" style={{ margin: 0, display: 'grid', gap: 10 }}>
        {editando ? (
          <FormAlbum inicial={{ ...a, fecha: String(a.fecha).slice(0, 10), groupId: a.groupId || '', actividad: a.actividad || '', personas: d.elegidos || [] }} opciones={opciones} guardando={guardando} onGuardar={guardarAlbum} onCancelar={() => setEditando(false)} />
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0 }}>{a.titulo}</h2>
                <span style={chip(a.publicado ? 'var(--teal)' : 'var(--ink-3)', { textTransform: 'uppercase' })}>{a.publicado ? 'Publicado' : 'Borrador'}</span>
              </div>
              <p className="sub" style={{ margin: '4px 0 0' }}>{fmtFecha(a.fecha)} · Lo ve: <b>{paraQuien(a)}</b>{a.audiencia !== 'etiquetados' ? ' (y la familia de quien sale)' : ''} · {d.fotos.length} foto{d.fotos.length !== 1 ? 's' : ''}
                {a.audiencia === 'etiquetados' && d.elegidos?.length > 0 ? ` · ${d.elegidos.length} elegido${d.elegidos.length !== 1 ? 's' : ''} para etiquetar` : ''}</p>
              {a.descripcion && <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ink-2)' }}>{a.descripcion}</p>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className={`btn btn-sm ${a.publicado ? 'btn-outline' : 'btn-gradient'}`} onClick={() => publicar(!a.publicado)}>{a.publicado ? 'Volver a borrador' : 'Publicar'}</button>
              <button className="btn btn-sm btn-outline" onClick={() => setEditando(true)}><I.Edit width={14} height={14} /> Editar</button>
              <button className="btn btn-sm btn-outline" style={{ color: 'var(--orange)' }} onClick={borrarAlbum}><I.Trash width={14} height={14} /></button>
            </div>
          </div>
        )}
        {a.audiencia === 'etiquetados' && sinEtiquetar > 0 && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>{sinEtiquetar} foto{sinEtiquetar !== 1 ? 's' : ''} sin nadie etiquetado: como este álbum es «solo quien sale», esas no las verá nadie.</p>
        )}
      </div>

      {/* Subir: arrastrar o elegir, varias a la vez */}
      <div onDragOver={e => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)}
        onDrop={e => { e.preventDefault(); setEncima(false); subir(e.dataTransfer.files); }}
        onClick={() => !subiendo && inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') inputRef.current?.click(); }}
        style={{ border: `2px dashed ${encima ? 'var(--purple)' : 'var(--line)'}`, background: encima ? 'color-mix(in oklab, var(--purple) 8%, var(--bg-2))' : 'var(--bg-2)', borderRadius: 16, padding: 22, textAlign: 'center', cursor: subiendo ? 'default' : 'pointer' }}>
        {subiendo ? (
          <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
            <b>{subiendo.hechas < subiendo.total ? `Subiendo ${subiendo.hechas + 1} de ${subiendo.total}…` : `Subidas ${subiendo.total - subiendo.fallos.length} de ${subiendo.total}`}</b>
            {subiendo.convirtiendo && subiendo.hechas < subiendo.total && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Las fotos del iPhone se pasan a JPG antes de subir: tardan un poco más.</span>}
            <div style={{ width: 'min(360px, 100%)', height: 8, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden' }}>
              <div style={{ width: `${(subiendo.hechas / subiendo.total) * 100}%`, height: '100%', background: 'var(--purple)', transition: 'width .2s' }} />
            </div>
            {subiendo.fallos.map((x, i) => <span key={i} style={{ fontSize: 12, color: 'var(--orange)' }}>{x}</span>)}
            {subiendo.hechas >= subiendo.total && <button type="button" className="btn btn-sm btn-outline" onClick={e => { e.stopPropagation(); setSubiendo(null); }}>Entendido</button>}
          </div>
        ) : (
          <>
            <b style={{ fontSize: 15 }}>Arrastra aquí las fotos o pulsa para elegirlas</b>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>Varias a la vez: JPG, PNG o las del iPhone (HEIC), que se pasan solas a JPG. Se reducen antes de subir: no hace falta prepararlas.</div>
          </>
        )}
        <input ref={inputRef} type="file" accept="image/*,.heic,.heif" multiple style={{ display: 'none' }} onChange={e => { const fl = e.target.files; subir(fl); e.target.value = ''; }} />
      </div>

      {/* Las fotos */}
      {d.fotos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {d.fotos.map((f, i) => (
            <button key={f.id} type="button" onClick={() => setAbierta(i)} aria-label={`Foto ${i + 1}`}
              style={{ position: 'relative', padding: 0, border: 0, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1', background: 'var(--bg-3)' }}>
              <img src={mini(f.id)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <span style={{ position: 'absolute', left: 6, bottom: 6, ...chip(f.etiquetas.length ? 'var(--purple)' : 'var(--orange)', { background: 'rgba(255,255,255,.92)' }) }}>
                {f.etiquetas.length ? `👤 ${f.etiquetas.length}` : 'Sin etiquetar'}{f.etiquetas.some(e => !e.permiso) ? ' ⚠' : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Una foto abierta: grande, etiquetas y pie */}
      {foto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,20,.82)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setAbierta(null); }}>
          <div role="dialog" aria-modal="true" aria-label="Foto" style={{ background: 'var(--bg-2)', borderRadius: 20, width: 'min(1100px, 100%)', maxHeight: '94vh', overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>
            <div style={{ position: 'relative', background: '#111', display: 'grid', placeItems: 'center', minHeight: 300 }}>
              <img src={grande(foto.id)} alt="" style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }} />
              {abierta > 0 && <button type="button" onClick={() => setAbierta(i => i - 1)} aria-label="Anterior" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: 99, border: 0, background: 'rgba(255,255,255,.85)', cursor: 'pointer', fontSize: 20 }}>‹</button>}
              {abierta < d.fotos.length - 1 && <button type="button" onClick={() => setAbierta(i => i + 1)} aria-label="Siguiente" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: 99, border: 0, background: 'rgba(255,255,255,.85)', cursor: 'pointer', fontSize: 20 }}>›</button>}
            </div>
            <div style={{ padding: 18, display: 'grid', gap: 14, alignContent: 'start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ flex: 1 }}>Foto {abierta + 1} de {d.fotos.length}</b>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setAbierta(null)} aria-label="Cerrar"><I.X width={14} height={14} /></button>
              </div>
              <Etiquetas key={foto.id} foto={foto} sugeridos={d.sugeridos} elegidos={d.elegidos || []} grupos={opciones.soloSusClases ? [] : opciones.grupos}
                onCambio={c => cambiarFoto(foto.id, c)} showToast={showToast} />
              <PieFoto key={`p${foto.id}`} foto={foto} onGuardado={pie => cambiarFoto(foto.id, y => ({ ...y, pie }))} showToast={showToast} />
              <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start', color: 'var(--orange)' }} onClick={() => borrarFoto(foto)}><I.Trash width={14} height={14} /> Borrar esta foto</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function PieFoto({ foto, onGuardado, showToast }) {
  const [pie, setPie] = useState(foto.pie || '');
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <b style={{ fontSize: 13 }}>Pie de foto <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(opcional)</span></b>
      <div style={{ display: 'flex', gap: 6 }}>
        <input style={campo} value={pie} onChange={e => setPie(e.target.value)} maxLength={300} placeholder="Ej. El grupo de los martes con su diploma" />
        <button type="button" className="btn btn-sm btn-primary" disabled={pie === (foto.pie || '')} onClick={async () => {
          try { await api(`/api/admin/galeria/fotos/${foto.id}`, { method: 'PUT', body: { pie } }); onGuardado(pie); showToast?.('Pie guardado.'); }
          catch (e) { showToast?.(e.message); }
        }}>Guardar</button>
      </div>
    </div>
  );
}

export default function AdminGaleria({ showToast }) {
  const [lista, setLista] = useState(null);
  const [opciones, setOpciones] = useState({ grupos: [], actividades: [] });
  const [uso, setUso] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [album, setAlbum] = useState(null);
  const cargar = useCallback(() => api('/api/admin/galeria').then(d => { setLista(d.albumes || []); setUso(d.uso); }).catch(e => { setLista([]); showToast?.(e.message); }), [showToast]);
  useEffect(() => { cargar(); api('/api/admin/galeria/opciones').then(d => setOpciones({ grupos: d.grupos || [], actividades: d.actividades || [], soloSusClases: !!d.soloSusClases })).catch(() => {}); }, [cargar]);

  async function crear(f) {
    setGuardando(true);
    try { const d = await api('/api/admin/galeria', { method: 'POST', body: f }); setNuevo(false); await cargar(); setAlbum(d.id); }
    catch (e) { showToast?.(e.message); } finally { setGuardando(false); }
  }
  if (album) return <Album id={album} opciones={opciones} showToast={showToast} onVolver={() => { setAlbum(null); cargar(); }} />;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', flex: '1 1 320px', maxWidth: 720 }}>
          {opciones.soloSusClases
            ? 'Sube las fotos de tus clases y etiqueta a quien sale. Las familias de la clase las ven en su área («Fotos»). Mientras un álbum es borrador, no lo ve nadie.'
            : 'Sube las fotos de las clases y eventos y etiqueta a quien sale. Cada familia las ve en su área («Fotos»): las fotos donde sale alguien suyo y los álbumes de sus clases o actividades. Mientras un álbum es borrador, no lo ve nadie.'}
        </p>
        <button className="btn btn-gradient" onClick={() => setNuevo(true)}><I.Plus width={14} height={14} /> Nuevo álbum</button>
      </div>
      {uso && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-3)' }}>
          <span>La galería ocupa <b style={{ color: 'var(--ink)' }}>{mb(uso.bytes)}</b> ({uso.fotos} fotos) de unos {mb(CUPO_GALERIA)} disponibles</span>
          <span style={{ flex: '0 1 220px', height: 6, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.min(100, (uso.bytes / CUPO_GALERIA) * 100)}%`, background: uso.bytes > CUPO_GALERIA * 0.85 ? 'var(--orange)' : 'var(--teal)' }} />
          </span>
          {uso.bytes > CUPO_GALERIA * 0.85 && <b style={{ color: 'var(--orange)' }}>Queda poco sitio: borra álbumes antiguos o amplía el plan de la base de datos.</b>}
        </div>
      )}
      {nuevo && (
        <div className="panel" style={{ margin: 0 }}>
          <h2 style={{ marginTop: 0 }}>Nuevo álbum</h2>
          <FormAlbum opciones={opciones} guardando={guardando} onGuardar={crear} onCancelar={() => setNuevo(false)} />
        </div>
      )}
      {lista === null && <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>}
      {lista?.length === 0 && !nuevo && (
        <div style={{ padding: 32, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 16, color: 'var(--ink-3)', fontSize: 14 }}>
          Todavía no hay ningún álbum. Crea el primero con «Nuevo álbum».
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
        {(lista || []).map(a => (
          <button key={a.id} type="button" onClick={() => setAlbum(a.id)}
            style={{ textAlign: 'left', padding: 0, border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', background: 'var(--bg-2)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', display: 'grid' }}>
            <div style={{ aspectRatio: '4 / 3', background: 'var(--bg-3)', display: 'grid', placeItems: 'center', position: 'relative' }}>
              {a.portada ? <img src={mini(a.portada)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Sin fotos</span>}
              <span style={{ position: 'absolute', top: 8, left: 8, ...chip(a.publicado ? 'var(--teal)' : 'var(--ink-3)', { background: 'rgba(255,255,255,.92)', textTransform: 'uppercase' }) }}>{a.publicado ? 'Publicado' : 'Borrador'}</span>
            </div>
            <div style={{ padding: '10px 12px', display: 'grid', gap: 3 }}>
              <b style={{ fontSize: 14 }}>{a.titulo}</b>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtFecha(a.fecha)} · {a.fotos} foto{a.fotos !== 1 ? 's' : ''} · {paraQuien(a)}</span>
              {a.sinPermiso > 0 && <span style={{ fontSize: 12, color: '#E5484D', fontWeight: 700 }}>⚠ {a.sinPermiso} sin permiso de fotos</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Lo que ve la familia ────────────────────────────────────────────────────
export function FotosFamilia() {
  const [d, setD] = useState(null);
  const [quien, setQuien] = useState('todas');
  const [albumAbierto, setAlbumAbierto] = useState(null);
  const [abierta, setAbierta] = useState(null);
  useEffect(() => {
    fetch('/api/me/galeria', { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(x => setD(x || { albumes: [], familia: [] })).catch(() => setD({ albumes: [], familia: [] }));
  }, []);
  const albumes = (d?.albumes || []).map(a => ({ ...a, fotos: quien === 'todas' ? a.fotos : a.fotos.filter(f => f.salen.some(s => s.id === quien)) })).filter(a => a.fotos.length);
  const salenAlguna = new Set((d?.albumes || []).flatMap(a => a.fotos.flatMap(f => f.salen.map(s => s.id))));
  const album = albumes.find(a => a.id === albumAbierto) || null;
  const fotos = album?.fotos || [];
  const foto = abierta !== null ? fotos[abierta] : null;
  // En la app, el botón atrás de Android cierra la foto y luego el álbum (#218).
  useEffect(() => (albumAbierto !== null ? alAtras(() => setAlbumAbierto(null)) : undefined), [albumAbierto]);
  useEffect(() => (abierta !== null ? alAtras(() => setAbierta(null)) : undefined), [abierta !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (abierta === null) return;
    const k = (e) => {
      if (e.key === 'Escape') setAbierta(null);
      if (e.key === 'ArrowRight') setAbierta(i => Math.min(fotos.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setAbierta(i => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [abierta, fotos.length]);

  if (!d) return <div className="panel"><p className="sub">Cargando…</p></div>;
  return (
    <div className="panel">
      <h2><I.Sparkle /> Fotos</h2>
      <p className="sub">Las fotos del club donde salís y las de vuestras clases. Solo las ven las familias a las que les toca.</p>
      {(d.familia || []).filter(p => salenAlguna.has(p.id)).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 14px' }}>
          <button className={`filter-pill ${quien === 'todas' ? 'is-active' : ''}`} onClick={() => { setQuien('todas'); setAbierta(null); }}>Todas</button>
          {d.familia.filter(p => salenAlguna.has(p.id)).map(p => (
            <button key={p.id} className={`filter-pill ${quien === p.id ? 'is-active' : ''}`} onClick={() => { setQuien(p.id); setAbierta(null); }}>Donde sale {p.nombre}</button>
          ))}
        </div>
      )}
      {!albumes.length && <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>{d.albumes.length ? 'No hay fotos con este filtro.' : 'Todavía no hay fotos. Cuando el club suba las de vuestras clases, saldrán aquí y os avisaremos.'}</p>}
      {!album ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: 12 }}>
          {albumes.map(a => (
            <button key={a.id} type="button" onClick={() => setAlbumAbierto(a.id)}
              style={{ textAlign: 'left', padding: 0, border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', background: 'var(--bg-2)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
              <img src={mini(a.fotos[0].id)} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block', background: 'var(--bg-3)' }} />
              <div style={{ padding: '10px 12px' }}>
                <b style={{ display: 'block', fontSize: 14 }}>{a.titulo}</b>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtFecha(a.fecha)} · {a.fotos.length} foto{a.fotos.length !== 1 ? 's' : ''}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <button type="button" onClick={() => { setAlbumAbierto(null); setAbierta(null); }} style={{ justifySelf: 'start', background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--purple)', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>← Todos los álbumes</button>
          <div>
            <b style={{ fontSize: 17 }}>{album.titulo}</b>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{fmtFecha(album.fecha)}{album.descripcion ? ` · ${album.descripcion}` : ''}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(130px, 45%), 1fr))', gap: 6 }}>
            {fotos.map((f, i) => (
              <button key={f.id} type="button" onClick={() => setAbierta(i)} aria-label={`Foto ${i + 1}`} style={{ padding: 0, border: 0, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1', background: 'var(--bg-3)' }}>
                <img src={mini(f.id)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
          </div>
        </div>
      )}
      {foto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,20,.9)', zIndex: 2000, display: 'grid', gridTemplateRows: '1fr auto', padding: 12 }}
          onClick={e => { if (e.target === e.currentTarget) setAbierta(null); }}>
          <div style={{ position: 'relative', display: 'grid', placeItems: 'center', minHeight: 0 }} onClick={e => { if (e.target === e.currentTarget) setAbierta(null); }}>
            <img src={grande(foto.id)} alt={foto.pie || ''} style={{ maxWidth: '100%', maxHeight: '82vh', borderRadius: 8 }} />
            {abierta > 0 && <button type="button" onClick={() => setAbierta(i => i - 1)} aria-label="Anterior" style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, borderRadius: 99, border: 0, background: 'rgba(255,255,255,.85)', cursor: 'pointer', fontSize: 22 }}>‹</button>}
            {abierta < fotos.length - 1 && <button type="button" onClick={() => setAbierta(i => i + 1)} aria-label="Siguiente" style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, borderRadius: 99, border: 0, background: 'rgba(255,255,255,.85)', cursor: 'pointer', fontSize: 22 }}>›</button>}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', color: '#fff', padding: '10px 4px 0' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
              {foto.pie}{foto.pie && foto.salen.length ? ' · ' : ''}{foto.salen.length ? `Sale: ${foto.salen.map(s => s.nombre).join(', ')}` : ''}
            </span>
            <a className="btn btn-sm" href={`${grande(foto.id)}?descargar=1`} style={{ background: '#fff', color: '#111' }}><I.Download width={14} height={14} /> Descargar</a>
            <button type="button" className="btn btn-sm" onClick={() => setAbierta(null)} style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
