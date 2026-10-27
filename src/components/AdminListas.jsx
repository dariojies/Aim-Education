import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Personas → Contactos (#499): la gente de las listas hechas a mano (AMPAs,
// colegios, asociaciones…), que no es alumna ni familia. Se busca como a los
// alumnos; cada una tiene su ficha (sus datos, en qué listas está, notas) y sus
// correos con el club. Las listas se crean en Comunicación → Segmentos («Nuevo
// segmento a mano») y aquí también se puede apuntar a alguien en ellas.
// ─────────────────────────────────────────────────────────────────────────────

const campo = { fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', minWidth: 0, width: '100%', boxSizing: 'border-box' };
const etiqueta = { display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' };
async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido.');
  return d;
}
const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const VACIA = { nombre: '', entidad: '', cargo: '', email: '', telefono: '', notas: '', listas: [] };

export default function AdminListas({ showToast }) {
  const [listas, setListas] = useState([]);
  const [personas, setPersonas] = useState(null);
  const [q, setQ] = useState('');
  const [lista, setLista] = useState('');
  const [ficha, setFicha] = useState(null);   // la persona abierta (o una nueva)
  const cargar = useCallback(() => {
    api('/api/admin/listas').then(d => setListas(d.listas)).catch(() => {});
    return api(`/api/admin/listas/personas?q=${encodeURIComponent(q)}${lista ? `&lista=${lista}` : ''}`).then(d => setPersonas(d.personas)).catch(e => { alert(e.message); setPersonas([]); });
  }, [q, lista]);
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [cargar]);
  const nombreLista = (id) => listas.find(l => l.id === id)?.nombre;

  return (
    <div style={{ display: 'grid', gap: 14 }} data-contactos>
      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, entidad, cargo o correo…" aria-label="Buscar" style={{ ...campo, flex: '1 1 260px', width: 'auto', fontSize: 14 }} />
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setFicha({ ...VACIA, listas: lista ? [Number(lista)] : [] })}><I.Plus /> Nueva persona</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className={`filter-pill ${!lista ? 'is-active' : ''}`} onClick={() => setLista('')}>Todas</button>
          {listas.map(l => <button key={l.id} type="button" className={`filter-pill ${String(lista) === String(l.id) ? 'is-active' : ''}`} onClick={() => setLista(String(l.id))}>{l.nombre} · {l.personas}</button>)}
        </div>
        <p className="sub" style={{ margin: 0 }}>Personas que no son alumnos: AMPAs, colegios, asociaciones… Las listas se crean en Comunicación → Segmentos → «Nuevo segmento a mano», y desde ahí se les escribe con una campaña.</p>
      </div>
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        {personas === null && <p style={{ padding: 16, color: 'var(--ink-3)', margin: 0 }}>Cargando…</p>}
        {personas?.length === 0 && <p style={{ padding: 16, color: 'var(--ink-3)', margin: 0 }}>{q || lista ? 'Nadie con ese filtro.' : 'Aún no hay nadie. Crea una lista en Segmentos o pulsa «Nueva persona».'}</p>}
        {personas?.map(p => (
          <button key={p.id} type="button" data-persona={p.id} onClick={() => setFicha(p)}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1.5fr)', gap: 10, width: '100%', textAlign: 'left', padding: '10px 14px', border: 0, borderBottom: '1px solid var(--line)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', alignItems: 'center' }}>
            <span style={{ minWidth: 0 }}>
              <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre || p.entidad || p.email}</b>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{[p.nombre ? p.entidad : null, p.cargo].filter(Boolean).join(' · ')}</span>
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email || 'sin correo'}{p.telefono ? ` · ${p.telefono}` : ''}</span>
            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {p.listas.map(id => <span key={id} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'color-mix(in oklab, var(--purple) 12%, transparent)', color: 'var(--purple)' }}>{nombreLista(id) || '…'}</span>)}
            </span>
          </button>
        ))}
      </div>
      {ficha && <Ficha inicial={ficha} listas={listas} showToast={showToast} onCerrar={(cambio) => { setFicha(null); if (cambio) cargar(); }} />}
    </div>
  );
}

function Ficha({ inicial, listas, onCerrar, showToast }) {
  const [p, setP] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [correos, setCorreos] = useState(null);
  const nueva = !inicial.id;
  useEffect(() => { if (!nueva && inicial.email) api(`/api/admin/listas/personas/${inicial.id}/correos`).then(setCorreos).catch(() => setCorreos({ disponible: false, correos: [], campanas: [] })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setP(x => ({ ...x, [k]: v }));
  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      if (nueva) await api('/api/admin/listas/personas', { method: 'POST', body: p });
      else await api(`/api/admin/listas/personas/${p.id}`, { method: 'PATCH', body: p });
      showToast?.('Guardado.'); onCerrar(true);
    } catch (err) { alert(err.message); } finally { setGuardando(false); }
  }
  async function borrar() {
    if (!window.confirm(`¿Borrar a ${p.nombre || p.entidad || p.email} de todas las listas?`)) return;
    try { await api(`/api/admin/listas/personas/${p.id}`, { method: 'DELETE' }); onCerrar(true); } catch (err) { alert(err.message); }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: 16 }} onClick={e => e.target === e.currentTarget && onCerrar(false)}>
      <form onSubmit={guardar} style={{ background: 'var(--bg-2)', borderRadius: 16, width: 'min(720px, 100%)', maxHeight: '92vh', overflow: 'auto', padding: 20, display: 'grid', gap: 12 }} data-ficha-contacto>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>{nueva ? 'Nueva persona' : p.nombre || p.entidad || p.email}</h2>
          <button type="button" className="icon-btn" onClick={() => onCerrar(false)} aria-label="Cerrar">✕</button>
        </div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <label style={etiqueta}>Nombre<input value={p.nombre} onChange={e => set('nombre', e.target.value)} style={campo} autoFocus={nueva} /></label>
          <label style={etiqueta}>Entidad (colegio, AMPA, asociación…)<input value={p.entidad} onChange={e => set('entidad', e.target.value)} style={campo} /></label>
          <label style={etiqueta}>Cargo<input value={p.cargo} onChange={e => set('cargo', e.target.value)} style={campo} /></label>
          <label style={etiqueta}>Correo<input type="email" value={p.email} onChange={e => set('email', e.target.value)} style={campo} /></label>
          <label style={etiqueta}>Teléfono<input value={p.telefono} onChange={e => set('telefono', e.target.value)} style={campo} /></label>
        </div>
        <label style={etiqueta}>Notas<textarea rows={3} value={p.notas} onChange={e => set('notas', e.target.value)} style={{ ...campo, resize: 'vertical' }} placeholder="De qué hablamos, cuándo volver a llamar…" /></label>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>En qué listas está</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {listas.map(l => (
              <label key={l.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, padding: '5px 10px', borderRadius: 999, border: '1px solid var(--line)', cursor: 'pointer' }}>
                <input type="checkbox" checked={p.listas.includes(l.id)} onChange={e => set('listas', e.target.checked ? [...p.listas, l.id] : p.listas.filter(x => x !== l.id))} style={{ accentColor: 'var(--purple)' }} />{l.nombre}
              </label>
            ))}
            {!listas.length && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Aún no hay listas: créalas en Comunicación → Segmentos.</span>}
          </div>
        </div>
        {!nueva && (
          <div style={{ display: 'grid', gap: 6 }} data-correos-contacto>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Correos</span>
            {!p.email && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>No tiene correo.</span>}
            {p.email && correos === null && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Mirando…</span>}
            {correos?.campanas?.map(c => (
              <div key={`c${c.id}`} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-3)' }}>
                📣 <b>{c.asunto || c.nombre}</b> <span style={{ color: 'var(--ink-3)' }}>· campaña · {c.enviado_at ? fecha(c.enviado_at) : c.estado}{c.aperturas ? ' · lo abrió' : ''}{c.clics ? ` · ${c.clics} clic${c.clics !== 1 ? 's' : ''}` : ''}{c.baja_at ? ' · se dio de baja' : ''}</span>
              </div>
            ))}
            {correos?.correos?.map((c, i) => (
              <div key={`m${i}`} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-3)' }}>
                {c.entrante ? '↘' : '↗'} <b>{c.asunto || '(sin asunto)'}</b> <span style={{ color: 'var(--ink-3)' }}>· {c.entrante ? 'nos escribió' : 'le escribimos'} · {fecha(c.fecha)}</span>
              </div>
            ))}
            {correos && !correos.disponible && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>El buzón no se puede mirar ahora mismo.</span>}
            {correos?.disponible && !correos.correos.length && !correos.campanas.length && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Aún no hay correos con esta persona.</span>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {!nueva && <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--pink)', marginRight: 'auto' }} onClick={borrar}>Borrar</button>}
          <button type="button" className="btn btn-sm btn-outline" onClick={() => onCerrar(false)}>Cancelar</button>
          <button type="submit" className="btn btn-sm btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}
