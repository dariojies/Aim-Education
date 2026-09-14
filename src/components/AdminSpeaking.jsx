import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Clase de Speaking / Inglés (ticket #228).
// El profesor apunta alumnos a una sesión de un día concreto, a una o varias de
// las 3 franjas de 20 minutos. Al guardar, se avisa a secretaría (campanita) y se
// manda un correo a los padres para que confirmen. Esta clase NO usa las clases
// normales, así que no cuenta en los reportes de altas y bajas de alumnos.
// ─────────────────────────────────────────────────────────────────────────────

const HOY = () => new Date().toISOString().slice(0, 10);
const FRANJAS = [[1, '1ª · 0–20'], [2, '2ª · 20–40'], [3, '3ª · 40–60']];
const fmtDia = (f) => new Date(String(f).slice(0, 10) + 'T12:00:00')
  .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

export default function AdminSpeaking({ showToast }) {
  const [sesiones, setSesiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [fecha, setFecha] = useState(HOY());
  const [q, setQ] = useState('');
  const [sug, setSug] = useState([]);
  const [nuevos, setNuevos] = useState([]); // { id, name, franjas: {1,2,3} }
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch('/api/admin/speaking', { credentials: 'include', cache: 'no-store' });
      if (r.ok) setSesiones((await r.json()).sesiones || []);
    } catch { /* noop */ } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Buscar alumnos para apuntar.
  useEffect(() => {
    if (q.trim().length < 2) { setSug([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/tul/students?q=${encodeURIComponent(q.trim())}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : { students: [] }).then(d => setSug(d.students || [])).catch(() => { });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const añadir = (s) => {
    if (!nuevos.some(n => n.id === s.id)) {
      setNuevos(x => [...x, { id: s.id, name: s.name, franjas: { 1: true, 2: true, 3: true } }]);
    }
    setQ(''); setSug([]);
  };
  const toggleFranja = (id, f) => setNuevos(x => x.map(n => n.id === id ? { ...n, franjas: { ...n.franjas, [f]: !n.franjas[f] } } : n));

  async function guardar() {
    const alumnos = nuevos
      .map(n => ({ studentId: n.id, franjas: [1, 2, 3].filter(f => n.franjas[f]) }))
      .filter(a => a.franjas.length);
    if (!alumnos.length) return alert('Añade al menos un alumno con alguna franja marcada.');
    if (fecha < HOY()) return alert('Ese día ya ha pasado.');
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/speaking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ fecha, alumnos }),
      });
      const d = await r.json();
      if (!r.ok) return alert(d.error || 'No se pudo guardar.');
      showToast?.(`${d.creados} alumno${d.creados !== 1 ? 's' : ''} apuntado${d.creados !== 1 ? 's' : ''}${d.correo ? ' · correo enviado a los padres' : ' · (correo no configurado en el servidor)'}.`);
      setNuevos([]); await cargar();
    } catch { alert('Error de conexión.'); } finally { setGuardando(false); }
  }

  async function marcarLlamado(s) {
    setSesiones(prev => prev.map(x => x.id === s.id ? { ...x, llamado: !x.llamado } : x));
    await fetch(`/api/admin/speaking/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ llamado: !s.llamado }),
    }).catch(() => { });
  }
  async function borrar(s) {
    if (!window.confirm(`¿Quitar a ${s.alumno} de la sesión del ${fmtDia(s.fecha)}?`)) return;
    const r = await fetch(`/api/admin/speaking/${s.id}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) { await cargar(); showToast?.('Quitado.'); }
  }

  const porDia = {};
  for (const s of sesiones) (porDia[String(s.fecha).slice(0, 10)] ||= []).push(s);
  const dias = Object.keys(porDia).sort();

  const estado = (s) => s.confirmado === true ? { t: '✓ Confirmado', c: 'var(--teal)' }
    : s.confirmado === false ? { t: '✗ No puede', c: 'var(--orange)' }
      : { t: s.emailEnviado ? 'Esperando respuesta' : 'Sin correo', c: 'var(--ink-3)' };
  const franjasTxt = (arr) => (arr || []).length === 3 ? 'Hora entera'
    : (arr || []).map(f => (FRANJAS.find(x => x[0] === f) || [, '?'])[1].split(' · ')[0]).join(', ');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
        Apunta alumnos a una sesión de Speaking de un día concreto (no todos los días), a una o varias de las 3 franjas de 20 minutos.
        Al guardar, secretaría recibe el aviso para llamar a los padres y se les manda un correo para confirmar la asistencia. Esta clase no cuenta en los reportes de alumnos.
      </p>

      {/* Nueva sesión */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>Día de la clase</label>
          <input type="date" min={HOY()} value={fecha} onChange={e => e.target.value && setFecha(e.target.value)}
            style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }} />
          <span style={{ fontSize: 13, color: 'var(--ink-3)', textTransform: 'capitalize' }}>{fmtDia(fecha)}</span>
        </div>

        <div style={{ position: 'relative', maxWidth: 420 }}>
          <div className="search-input"><I.Search /><input placeholder="Buscar alumno para apuntar..." value={q} onChange={e => setQ(e.target.value)} /></div>
          {sug.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 6, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, marginTop: 2, overflow: 'hidden', maxHeight: 240, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
              {sug.map(s => (
                <button key={s.id} type="button" onMouseDown={e => { e.preventDefault(); añadir(s); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--line-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                  <b>{s.name}</b>{s.email ? <span style={{ color: 'var(--ink-3)' }}> · {s.email}</span> : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        {nuevos.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {nuevos.map(n => (
              <div key={n.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 12, padding: '8px 12px' }}>
                <span style={{ fontWeight: 700, fontSize: 14, flex: '1 1 160px', minWidth: 0 }}>{n.name}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {FRANJAS.map(([f, l]) => (
                    <button key={f} type="button" onClick={() => toggleFranja(n.id, f)}
                      className={`filter-pill ${n.franjas[f] ? 'is-active' : ''}`} style={{ fontSize: 11 }}>{l}</button>
                  ))}
                </div>
                <button className="icon-btn danger" onClick={() => setNuevos(x => x.filter(y => y.id !== n.id))} aria-label="Quitar"><I.X /></button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-sm btn-primary" onClick={guardar} disabled={guardando}>
                {guardando ? 'Guardando...' : `Apuntar y avisar a los padres (${nuevos.length})`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sesiones próximas */}
      {cargando && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
      {!cargando && dias.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          No hay sesiones de Speaking próximas.
        </div>
      )}
      {dias.map(dia => (
        <div key={dia} style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, textTransform: 'capitalize' }}>{fmtDia(dia)}</h3>
          <div className="data-table">
            <div className="data-table-head" style={{ gridTemplateColumns: '1.4fr 120px 1.6fr 130px 130px 70px' }}>
              <span>Alumno</span><span>Franjas</span><span>Contacto familia</span><span>Confirmación</span><span>Secretaría</span><span></span>
            </div>
            {porDia[dia].map(s => {
              const e = estado(s);
              return (
                <div key={s.id} className="data-table-row" style={{ gridTemplateColumns: '1.4fr 120px 1.6fr 130px 130px 70px', alignItems: 'center' }}>
                  <div className="pri">{s.alumno}</div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>{franjasTxt(s.franjas)}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.contactos || 'sin contacto'}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: e.c }}>{e.t}</span>
                  <button onClick={() => marcarLlamado(s)} title="Marcar que ya has llamado a los padres"
                    style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', border: '1px solid',
                      borderColor: s.llamado ? 'color-mix(in oklab, var(--teal) 40%, transparent)' : 'color-mix(in oklab, var(--orange) 40%, transparent)',
                      color: s.llamado ? 'var(--teal)' : 'var(--orange)',
                      background: `color-mix(in oklab, ${s.llamado ? 'var(--teal)' : 'var(--orange)'} 12%, var(--bg-2))` }}>
                    {s.llamado ? '✓ Llamado' : 'Llamar'}
                  </button>
                  <div className="row-actions"><button className="icon-btn danger" onClick={() => borrar(s)} aria-label="Quitar"><I.Trash /></button></div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
