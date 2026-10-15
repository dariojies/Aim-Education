import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { fmtFecha } from '../fechas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Medios de comunicación (#428): los contactos de prensa y la casilla para
// mandarles una noticia. El correo sale a cada medio por separado, desde info@
// con el nombre de quien la manda, con la plantilla «Medios de comunicación:
// noticia» (se cambia en las plantillas de correo) y la noticia entera debajo.
// ─────────────────────────────────────────────────────────────────────────────

const campo = { fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', minWidth: 0, width: '100%', boxSizing: 'border-box' };
const vacio = () => ({ id: '', nombre: '', medio: '', email: '' });

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido.');
  return d;
}

// La lista de contactos de prensa, para editarla.
export function MediosPanel({ onCerrar, onCambio }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState(false);
  useEffect(() => { api('/api/admin/medios').then(d => setLista(d.contactos.length ? d.contactos : [vacio()])).catch(e => setError(e.message)); }, []);
  const cambiar = (i, k, v) => { setHecho(false); setLista(l => l.map((c, j) => (j === i ? { ...c, [k]: v } : c))); };
  async function guardar() {
    setGuardando(true); setError(null);
    try {
      const d = await api('/api/admin/medios', { method: 'PUT', body: { contactos: lista.filter(c => c.email.trim() || c.medio.trim() || c.nombre.trim()) } });
      setLista(d.contactos.length ? d.contactos : [vacio()]);
      setHecho(true);
      onCambio?.(d.contactos.length);
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  }
  return (
    <div className="panel" style={{ margin: 0, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ margin: 0, flex: 1 }}>Medios de comunicación</h3>
        {onCerrar && <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar} aria-label="Cerrar"><I.X width={14} height={14} /></button>}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>
        Al guardar una noticia con «Enviar a los medios de comunicación», le llega a cada uno un correo suyo (no uno para todos), desde info@ y con tu nombre:
        una presentación corta y, debajo, la noticia entera. La presentación es la plantilla «Medios de comunicación: noticia», que se puede cambiar en las plantillas de correo.
      </p>
      {error && <p style={{ margin: 0, color: 'var(--orange)', fontSize: 13 }}>{error}</p>}
      {!lista ? <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Cargando…</p> : (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.3fr) 32px', gap: 6, fontSize: 11, fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            <span>Medio</span><span>Persona de contacto</span><span>Correo</span><span />
          </div>
          {lista.map((c, i) => (
            <div key={c.id || `n${i}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.3fr) 32px', gap: 6, alignItems: 'center' }}>
              <input style={campo} value={c.medio} onChange={e => cambiar(i, 'medio', e.target.value)} placeholder="Europa Sur" aria-label="Medio" />
              <input style={campo} value={c.nombre} onChange={e => cambiar(i, 'nombre', e.target.value)} placeholder="Nombre (opcional)" aria-label="Persona de contacto" />
              <input style={campo} type="email" value={c.email} onChange={e => cambiar(i, 'email', e.target.value)} placeholder="redaccion@medio.es" aria-label="Correo" />
              <button type="button" className="icon-btn danger" title="Quitar" onClick={() => { setHecho(false); setLista(l => (l.length > 1 ? l.filter((_, j) => j !== i) : [vacio()])); }}><I.Trash /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setLista(l => [...l, vacio()])}><I.Plus width={14} height={14} /> Añadir medio</button>
            <div style={{ flex: 1 }} />
            {hecho && <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 700 }}>Guardado.</span>}
            <button type="button" className="btn btn-sm btn-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// La casilla del editor de noticias. «item» es la noticia que se edita.
export function EnviarAMedios({ item, onCambio }) {
  const [n, setN] = useState(null);
  useEffect(() => { api('/api/admin/medios').then(d => setN(d.contactos.length)).catch(() => setN(0)); }, []);
  const ya = item.medios?.enviado_at;
  if (!['published', 'scheduled'].includes(item.status)) return null;
  if (ya) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
        <b style={{ color: 'var(--teal)' }}>Ya se mandó a los medios</b> el {fmtFecha(ya)}{item.medios?.a ? ` (${item.medios.a.length} correo${item.medios.a.length !== 1 ? 's' : ''})` : ''}{item.medios?.fallos?.length ? ` · ${item.medios.fallos.length} no salieron` : ''}.
      </p>
    );
  }
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, cursor: n ? 'pointer' : 'default', color: 'var(--ink)' }}>
      <input type="checkbox" checked={!!item.enviarMedios} disabled={!n} onChange={e => onCambio(e.target.checked)} style={{ marginTop: 3 }} />
      <span>
        <b>Enviar a los medios de comunicación</b>{n ? ` (${n})` : ''}
        <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)' }}>
          {n === 0 ? 'No hay ningún medio apuntado: añádelos en Noticias → «Medios de comunicación».'
            : item.status === 'scheduled' ? 'Les llega al guardar, diciendo el día en que se publicará.'
            : 'Les llega al guardar, con el enlace a la noticia ya publicada.'}
        </span>
      </span>
    </label>
  );
}
