import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { fmtFecha, fmtFechaHora } from '../fechas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Candidatos (#368): los currículums que llegan por «Trabaja con nosotros» de la
// web. Se filtran por la clase que pueden dar («necesito a alguien de inglés»),
// se marca en qué punto está cada uno y se apuntan notas. El PDF se abre aquí.
// ─────────────────────────────────────────────────────────────────────────────

const ESTADOS = {
  nuevo: { label: 'Nuevo', color: 'var(--purple)' },
  visto: { label: 'Visto', color: '#ccac00' },
  contactado: { label: 'Contactado', color: 'var(--teal)' },
  descartado: { label: 'Descartado', color: 'var(--ink-3)' },
};
const chip = (color, extra = {}) => ({ fontSize: 11, fontWeight: 800, color, background: `color-mix(in oklab, ${color} 13%, var(--bg-2))`, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', ...extra });
const kb = (n) => (n ? (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n < 1024 ? '<1 KB' : `${Math.round(n / 1024)} KB`) : '');

export default function AdminCandidatos({ showToast }) {
  const [datos, setDatos] = useState(null);
  const [clase, setClase] = useState('todas');
  const [estado, setEstado] = useState('activos'); // activos = todo menos descartados
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(null);
  const [notas, setNotas] = useState({});

  const cargar = useCallback(() => {
    fetch('/api/admin/candidatos', { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(d => setDatos(d || { candidatos: [], clases: [] })).catch(() => setDatos({ candidatos: [], clases: [] }));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function cambiar(c, cambios, aviso) {
    const r = await fetch(`/api/admin/candidatos/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(cambios) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { showToast?.(d.error || 'No se ha podido guardar.'); return; }
    if (aviso) showToast?.(aviso);
    setDatos(x => ({ ...x, candidatos: x.candidatos.map(y => (y.id === c.id ? { ...y, ...cambios } : y)) }));
  }
  async function borrar(c) {
    if (!window.confirm(`¿Borrar la candidatura de ${c.nombre} con su currículum? No se puede deshacer.`)) return;
    const r = await fetch(`/api/admin/candidatos/${c.id}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) { showToast?.('Candidatura borrada.'); setDatos(x => ({ ...x, candidatos: x.candidatos.filter(y => y.id !== c.id) })); }
  }
  function abrir(c) {
    const ya = abierto === c.id;
    setAbierto(ya ? null : c.id);
    setNotas(n => ({ ...n, [c.id]: n[c.id] ?? c.notas }));
    // Al abrir uno nuevo, pasa a «visto».
    if (!ya && c.estado === 'nuevo') cambiar(c, { estado: 'visto' });
  }

  const lista = useMemo(() => {
    if (!datos) return [];
    const n = q.trim().toLowerCase();
    return datos.candidatos.filter(c =>
      (clase === 'todas' || (clase === 'otras' ? !!c.otros : c.clases.includes(clase)))
      && (estado === 'todos' || (estado === 'activos' ? c.estado !== 'descartado' : c.estado === estado))
      && (!n || [c.nombre, c.email, c.telefono, c.otros, c.mensaje, c.notas].some(v => (v || '').toLowerCase().includes(n))));
  }, [datos, clase, estado, q]);
  const cuantasPorClase = useMemo(() => {
    const m = {};
    for (const c of datos?.candidatos || []) if (c.estado !== 'descartado') for (const k of c.clases) m[k] = (m[k] || 0) + 1;
    return m;
  }, [datos]);

  if (!datos) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</p>;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', maxWidth: 760 }}>
        Los currículums que llegan por «Trabaja con nosotros» de la web. Elige una clase para ver quién puede darla. Al abrir uno pasa a «Visto»; marca «Contactado» cuando le escribáis.
        La sección se enciende y se cambia su texto en Web pública → Portada.
      </p>

      {/* Por clase: lo que se busca normalmente */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className={`filter-pill ${clase === 'todas' ? 'is-active' : ''}`} onClick={() => setClase('todas')}>Todas las clases</button>
        {(datos.clases || []).map(k => (
          <button key={k} className={`filter-pill ${clase === k ? 'is-active' : ''}`} onClick={() => setClase(k)}>
            {k}{cuantasPorClase[k] ? ` · ${cuantasPorClase[k]}` : ''}
          </button>
        ))}
        <button className={`filter-pill ${clase === 'otras' ? 'is-active' : ''}`} onClick={() => setClase('otras')}>Otras</button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-input" style={{ flex: '1 1 260px', maxWidth: 420 }}><I.Search /><input placeholder="Buscar por nombre, correo, notas…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar" /></div>
        <select value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado"
          style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' }}>
          <option value="activos">Sin los descartados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          <option value="todos">Todos</option>
        </select>
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{lista.length} candidatura{lista.length !== 1 ? 's' : ''}</span>
      </div>

      {!lista.length && (
        <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          {datos.candidatos.length ? 'Nadie con estos filtros.' : 'Todavía no ha llegado ninguna candidatura.'}
        </div>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        {lista.map(c => {
          const e = ESTADOS[c.estado] || ESTADOS.nuevo;
          const ab = abierto === c.id;
          return (
            <div key={c.id} style={{ background: 'var(--bg-2)', borderTop: '1px solid var(--line)', borderRight: '1px solid var(--line)', borderBottom: '1px solid var(--line)', borderLeft: `5px solid ${e.color}`, borderRadius: 14, padding: '14px 18px', display: 'grid', gap: 8, opacity: c.estado === 'descartado' ? 0.7 : 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => abrir(c)} role="button" tabIndex={0} onKeyDown={ev => { if (ev.key === 'Enter') abrir(c); }}>
                <b style={{ fontSize: 15, flex: '1 1 200px', minWidth: 0 }}>{ab ? '▾' : '▸'} {c.nombre}</b>
                <span style={chip(e.color, { textTransform: 'uppercase' })}>{e.label}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }} title={fmtFechaHora(c.fecha)}>{fmtFecha(c.fecha)}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {c.clases.map(k => <span key={k} style={chip(k === clase ? 'var(--purple)' : 'var(--ink-2)')}>{k}</span>)}
                {c.otros && <span style={chip('var(--orange)')}>Otras: {c.otros}</span>}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--ink-2)', alignItems: 'center' }}>
                <a href={`mailto:${c.email}`} onClick={ev => ev.stopPropagation()}><I.Mail width={14} height={14} style={{ verticalAlign: 'middle' }} /> {c.email}</a>
                {c.telefono && <a href={`tel:${c.telefono.replace(/\s+/g, '')}`}><I.Phone width={14} height={14} style={{ verticalAlign: 'middle' }} /> {c.telefono}</a>}
                {c.tieneCv
                  ? <a className="btn btn-sm btn-outline" href={`/api/admin/candidatos/${c.id}/cv`} target="_blank" rel="noopener noreferrer">📄 Ver currículum <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>{kb(c.cvBytes)}</span></a>
                  : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Sin currículum adjunto</span>}
              </div>
              {ab && (
                <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  {c.mensaje && <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{c.mensaje}</p>}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Object.entries(ESTADOS).map(([k, v]) => (
                      <button key={k} type="button" onClick={() => k !== c.estado && cambiar(c, { estado: k }, `${c.nombre}: ${v.label.toLowerCase()}.`)}
                        style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 12, fontFamily: 'inherit', border: `1.5px solid ${k === c.estado ? v.color : 'var(--line)'}`, background: k === c.estado ? `color-mix(in oklab, ${v.color} 15%, var(--bg-2))` : 'var(--bg-3)', color: k === c.estado ? v.color : 'var(--ink-2)' }}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                  <textarea rows={2} value={notas[c.id] ?? ''} onChange={ev => setNotas(n => ({ ...n, [c.id]: ev.target.value }))} placeholder="Notas internas (entrevista, disponibilidad…)"
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 13, padding: 10, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn btn-sm btn-primary" disabled={(notas[c.id] ?? '') === c.notas} onClick={() => cambiar(c, { notas: notas[c.id] ?? '' }, 'Notas guardadas.')}>Guardar notas</button>
                    {c.actualizadoPor && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Último cambio: {c.actualizadoPor}, {fmtFechaHora(c.actualizadoAt)}</span>}
                    <div style={{ flex: 1 }} />
                    <button className="btn btn-sm btn-outline" style={{ color: 'var(--orange)' }} onClick={() => borrar(c)}><I.Trash width={14} height={14} /> Borrar candidatura</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
