import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Mascotas de clase (ticket #244). Cada clase puede tener un peluche que los
// alumnos se llevan a casa por turnos. Se registra quién lo tiene, cuándo debe
// devolverlo, si lo ha devuelto y cuántas veces se lo ha llevado cada uno. El
// botón "Sortear" propone a quien MENOS veces se lo ha llevado (reparto justo),
// y también se puede asignar a mano.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (d) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
const enDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default function AdminMascotas({ showToast }) {
  const [mascotas, setMascotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [grupos, setGrupos] = useState([]);
  const [nuevoGrupo, setNuevoGrupo] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [detalle, setDetalle] = useState({}); // id -> { ranking, historico, actual, ... }
  const [abierta, setAbierta] = useState(null);
  const [form, setForm] = useState({}); // id -> { studentId, fecha }

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch('/api/admin/mascotas', { credentials: 'include', cache: 'no-store' });
      if (r.ok) setMascotas((await r.json()).mascotas || []);
    } catch { /* noop */ } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    fetch('/api/admin/groups', { credentials: 'include' })
      .then(r => r.ok ? r.json() : []).then(d => setGrupos(Array.isArray(d) ? d : [])).catch(() => { });
  }, []);

  const conMascota = new Set(mascotas.map(m => m.groupId));
  const gruposLibres = grupos.filter(g => !conMascota.has(g.id));

  const recargarDetalle = useCallback(async (id) => {
    const r = await fetch(`/api/admin/mascotas/${id}`, { credentials: 'include', cache: 'no-store' });
    if (r.ok) { const data = await r.json(); setDetalle(d => ({ ...d, [id]: data })); }
  }, []);

  async function crear() {
    if (!nuevoGrupo) return alert('Elige la clase.');
    const r = await fetch('/api/admin/mascotas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ groupId: nuevoGrupo, nombre: nuevoNombre }),
    });
    if (r.ok) { setNuevoGrupo(''); setNuevoNombre(''); showToast?.('Mascota asignada.'); cargar(); }
    else alert((await r.json()).error || 'No se pudo.');
  }

  async function abrir(id) {
    if (abierta === id) { setAbierta(null); return; }
    setAbierta(id);
    if (!form[id]) setForm(f => ({ ...f, [id]: { studentId: '', fecha: enDias(7) } }));
    await recargarDetalle(id);
  }

  async function quitar(m) {
    if (!window.confirm(`¿Quitar la mascota de ${m.clase}? Se borra también su histórico de préstamos.`)) return;
    const r = await fetch(`/api/admin/mascotas/${m.id}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) { showToast?.('Mascota quitada.'); if (abierta === m.id) setAbierta(null); cargar(); }
  }

  async function prestar(id) {
    const f = form[id] || {};
    if (!f.studentId) return alert('Elige a quién se la lleva (o pulsa Sortear).');
    const r = await fetch(`/api/admin/mascotas/${id}/prestar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ studentId: f.studentId, devolverAntes: f.fecha || null }),
    });
    if (r.ok) { showToast?.('¡A casa se va el peluche!'); setForm(x => ({ ...x, [id]: { studentId: '', fecha: enDias(7) } })); await recargarDetalle(id); cargar(); }
    else alert((await r.json()).error || 'No se pudo.');
  }

  async function devolver(id) {
    const r = await fetch(`/api/admin/mascotas/${id}/devolver`, { method: 'POST', credentials: 'include' });
    if (r.ok) { showToast?.('Devuelta. Ya puede llevársela otro.'); await recargarDetalle(id); cargar(); }
    else alert((await r.json()).error || 'No se pudo.');
  }

  async function sortear(id) {
    const r = await fetch(`/api/admin/mascotas/${id}/sugerencia`, { credentials: 'include', cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) return alert(d.error || 'No se pudo sortear.');
    setForm(x => ({ ...x, [id]: { ...(x[id] || { fecha: enDias(7) }), studentId: d.sugerido.studentId } }));
    showToast?.(`Le toca a ${d.sugerido.alumno}${d.veces > 0 ? ` (se la ha llevado ${d.veces} ${d.veces === 1 ? 'vez' : 'veces'})` : ' (aún no se la ha llevado)'}. Revisa la fecha y pulsa Prestar.`);
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
        Asigna un peluche a una clase y llévale la cuenta de a quién le toca llevárselo a casa. El botón <b>Sortear</b> propone al alumno que <b>menos veces</b> se lo ha llevado, para que sea justo; también puedes asignarlo a mano.
      </p>

      {/* Nueva mascota */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>Nueva mascota en</label>
        <select value={nuevoGrupo} onChange={e => setNuevoGrupo(e.target.value)}
          style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
          <option value="">Elige una clase…</option>
          {gruposLibres.map(g => <option key={g.id} value={g.id}>{g.name} · {g.activityName}</option>)}
        </select>
        <input placeholder="Nombre del peluche (opcional)" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
          style={{ fontFamily: 'inherit', fontSize: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', maxWidth: 220 }} />
        <button className="btn btn-sm btn-primary" onClick={crear} disabled={!nuevoGrupo}>Asignar mascota</button>
      </div>

      {cargando && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
      {!cargando && mascotas.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          Todavía no hay ninguna clase con mascota.
        </div>
      )}

      {mascotas.map(m => {
        const d = detalle[m.id];
        const f = form[m.id] || { studentId: '', fecha: enDias(7) };
        const abierto = abierta === m.id;
        return (
          <div key={m.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px', cursor: 'pointer', flexWrap: 'wrap' }} onClick={() => abrir(m.id)}>
              <span style={{ fontSize: 22 }}>🧸</span>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{m.nombre || 'Mascota'} <span style={{ fontWeight: 600, color: 'var(--ink-3)', fontSize: 13 }}>· {m.clase}</span></div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{m.actividad} · {m.alumnos} alumno{m.alumnos !== 1 ? 's' : ''} · {m.prestamos} préstamo{m.prestamos !== 1 ? 's' : ''}</div>
              </div>
              {m.actual ? (
                <span style={{ fontSize: 12, fontWeight: 800, padding: '5px 12px', borderRadius: 999,
                  color: m.actual.vencido ? 'var(--orange)' : 'var(--teal)',
                  background: `color-mix(in oklab, ${m.actual.vencido ? 'var(--orange)' : 'var(--teal)'} 12%, var(--bg-2))` }}>
                  La tiene {m.actual.alumno}{m.actual.devolverAntes ? ` · devolver antes de ${fmt(m.actual.devolverAntes)}` : ''}{m.actual.vencido ? ' · ¡vencido!' : ''}
                </span>
              ) : (
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', padding: '5px 12px', borderRadius: 999, background: 'var(--bg-3)' }}>En el club</span>
              )}
              <I.Chevron style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s', color: 'var(--ink-3)' }} />
            </div>

            {abierto && (
              <div style={{ borderTop: '1px solid var(--line)', padding: 16, display: 'grid', gap: 16 }}>
                {/* Prestar / devolver */}
                {m.actual ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14 }}>Ahora la tiene <b>{m.actual.alumno}</b>{m.actual.devolverAntes ? ` (debe devolverla antes del ${fmt(m.actual.devolverAntes)})` : ''}.</span>
                    <button className="btn btn-sm btn-primary" onClick={() => devolver(m.id)}>Marcar devuelta</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-sm" style={{ background: 'var(--purple)', color: '#fff' }} onClick={() => sortear(m.id)}>🎲 Sortear a quién le toca</button>
                    <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>o elige a mano:</span>
                    <select value={f.studentId} onChange={e => setForm(x => ({ ...x, [m.id]: { ...f, studentId: e.target.value } }))}
                      style={{ fontFamily: 'inherit', fontSize: 14, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
                      <option value="">Alumno…</option>
                      {(d?.ranking || []).map(a => <option key={a.studentId} value={a.studentId}>{a.alumno} — {a.veces} {a.veces === 1 ? 'vez' : 'veces'}</option>)}
                    </select>
                    <label style={{ fontSize: 13, color: 'var(--ink-3)' }}>Devolver antes de</label>
                    <input type="date" value={f.fecha || ''} onChange={e => setForm(x => ({ ...x, [m.id]: { ...f, fecha: e.target.value } }))}
                      style={{ fontFamily: 'inherit', fontSize: 14, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }} />
                    <button className="btn btn-sm btn-primary" onClick={() => prestar(m.id)} disabled={!f.studentId}>Prestar</button>
                  </div>
                )}

                {/* Reparto (ranking) */}
                {d?.ranking?.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: 'var(--ink-2)' }}>Veces que se la ha llevado cada uno</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {d.ranking.map(a => (
                        <span key={a.studentId} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--bg-3)',
                          color: a.veces === 0 ? 'var(--teal)' : 'var(--ink-2)', fontWeight: a.veces === 0 ? 800 : 600 }}>
                          {a.alumno} · {a.veces}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Histórico */}
                {d?.historico?.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: 'var(--ink-2)' }}>Histórico</h4>
                    <div style={{ display: 'grid', gap: 4 }}>
                      {d.historico.map(h => (
                        <div key={h.id} style={{ fontSize: 12, color: 'var(--ink-3)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <b style={{ color: 'var(--ink-2)' }}>{h.alumno}</b>
                          <span>se la llevó el {fmt(h.fechaPrestamo)}</span>
                          {h.devueltoAt ? <span style={{ color: 'var(--teal)' }}>· devuelta</span>
                            : <span style={{ color: 'var(--orange)', fontWeight: 700 }}>· sin devolver</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-sm" style={{ color: 'var(--orange)' }} onClick={() => quitar(m)}>Quitar mascota</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
