import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Equipo IT: planificación semanal. Cada semana el equipo se organiza qué días y
// a qué horas trabaja cada uno. Lo editan el propio Equipo IT y los superadmin;
// secretaría y dirección lo ven, pero no lo tocan (el servidor lo comprueba).
// ─────────────────────────────────────────────────────────────────────────────

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaMes = (iso) => { const [, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}`; };
const minutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const horasTxt = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

async function enviar(url, body, method = 'POST') {
  const r = await fetch(url, {
    method, credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
  return d;
}

const inp = { fontFamily: 'inherit', fontSize: 13, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', minWidth: 0 };

export default function EquipoIT({ showToast }) {
  const [semana, setSemana] = useState(hoyISO());
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [editando, setEditando] = useState(null); // { id?, userId, fecha, inicio, fin, nota }
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/admin/equipo-it?semana=${semana}`, { credentials: 'include', cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setDatos(d);
    } catch (e) { setError(e.message); }
  }, [semana]);
  useEffect(() => { cargar(); }, [cargar]);

  const puede = !!datos?.puedeEditar;

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      const { id, ...t } = editando;
      if (id) await enviar(`/api/admin/equipo-it/tramos/${id}`, t, 'PUT');
      else await enviar('/api/admin/equipo-it/tramos', t);
      setEditando(null);
      showToast?.('Guardado.');
      cargar();
    } catch (err) { alert(err.message); } finally { setGuardando(false); }
  }
  async function quitar() {
    if (!window.confirm('¿Quitar este tramo?')) return;
    try {
      await enviar(`/api/admin/equipo-it/tramos/${editando.id}`, null, 'DELETE');
      setEditando(null); showToast?.('Tramo quitado.'); cargar();
    } catch (err) { alert(err.message); }
  }
  async function copiarAnterior() {
    try {
      const d = await enviar('/api/admin/equipo-it/copiar', { semana: datos.semana });
      showToast?.(d.copiados ? `Copiados ${d.copiados} tramos de la semana anterior.` : 'No había nada que copiar (o ya estaba planificado).');
      cargar();
    } catch (err) { alert(err.message); }
  }

  if (error) return <p style={{ color: 'var(--orange)', fontSize: 14 }}>{error}</p>;
  if (!datos) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>;

  const deCelda = (userId, fecha) => datos.bloques.filter(b => b.userId === userId && b.fecha === fecha);
  const totalDe = (userId) => datos.bloques.filter(b => b.userId === userId)
    .reduce((s, b) => s + minutos(b.fin) - minutos(b.inicio), 0);
  const hoy = hoyISO();

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-outline" onClick={() => setSemana(sumarDias(datos.semana, -7))} aria-label="Semana anterior">‹</button>
        <b style={{ fontSize: 15 }}>Semana del {diaMes(datos.dias[0])} al {diaMes(datos.dias[6])}</b>
        <button className="btn btn-sm btn-outline" onClick={() => setSemana(sumarDias(datos.semana, 7))} aria-label="Semana siguiente">›</button>
        <button className="btn btn-sm btn-outline" onClick={() => setSemana(hoyISO())}>Esta semana</button>
        <div style={{ flex: 1 }} />
        {puede && <button className="btn btn-sm btn-outline" onClick={copiarAnterior}>Copiar la semana anterior</button>}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
        {puede
          ? 'Toca un día para añadir un tramo, o un tramo para cambiarlo o quitarlo. «Copiar la semana anterior» solo rellena a quien aún no tenga nada esta semana.'
          : 'Solo el Equipo IT puede cambiar esta planificación.'}
      </p>

      {!datos.miembros.length ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Nadie tiene el rango de Equipo IT todavía.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4, minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--ink-3)', fontWeight: 800, padding: '4px 6px' }}>Persona</th>
                {datos.dias.map((f, i) => (
                  <th key={f} style={{ fontSize: 11, fontWeight: 800, padding: '4px 6px', color: f === hoy ? 'var(--purple)' : 'var(--ink-3)', textAlign: 'left' }}>
                    {DIAS[i]} {diaMes(f)}
                  </th>
                ))}
                <th style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 800, padding: '4px 6px', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {datos.miembros.map(m => (
                <tr key={m.userId}>
                  <td style={{ fontSize: 13, fontWeight: 800, padding: '6px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{m.nombre}</td>
                  {datos.dias.map(f => {
                    const bloques = deCelda(m.userId, f);
                    return (
                      <td key={f} style={{ verticalAlign: 'top', background: f === hoy ? 'color-mix(in oklab, var(--purple) 7%, var(--bg-2))' : 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 5, minWidth: 96 }}>
                        <div style={{ display: 'grid', gap: 4 }}>
                          {bloques.map(b => (
                            <button key={b.id} type="button" disabled={!puede}
                              onClick={() => setEditando({ id: b.id, userId: b.userId, fecha: b.fecha, inicio: b.inicio, fin: b.fin, nota: b.nota })}
                              style={{ textAlign: 'left', border: 'none', borderRadius: 7, padding: '4px 6px', fontFamily: 'inherit', cursor: puede ? 'pointer' : 'default',
                                background: 'color-mix(in oklab, var(--teal) 16%, var(--bg-3))', color: 'var(--ink)' }}>
                              <div style={{ fontSize: 12, fontWeight: 800 }}>{b.inicio}–{b.fin}</div>
                              {b.nota && <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{b.nota}</div>}
                            </button>
                          ))}
                          {puede && (
                            <button type="button" onClick={() => setEditando({ userId: m.userId, fecha: f, inicio: '09:00', fin: '14:00', nota: '' })}
                              style={{ border: '1px dashed var(--line)', background: 'transparent', borderRadius: 7, padding: '2px 0', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 14 }}
                              aria-label="Añadir tramo">+</button>
                          )}
                          {!puede && !bloques.length && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>—</span>}
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ fontSize: 13, fontWeight: 800, padding: '6px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{horasTxt(totalDe(m.userId))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 16 }} onClick={() => setEditando(null)}>
          <form onClick={e => e.stopPropagation()} onSubmit={guardar}
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 10, width: 'min(420px, 100%)' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{editando.id ? 'Cambiar tramo' : 'Nuevo tramo'}</h3>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: 'var(--ink-2)' }}>Persona</span>
              <select value={editando.userId} onChange={e => setEditando(x => ({ ...x, userId: e.target.value }))} style={inp}>
                {datos.miembros.map(m => <option key={m.userId} value={m.userId}>{m.nombre}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: 'var(--ink-2)' }}>Día</span>
              <input type="date" value={editando.fecha} onChange={e => setEditando(x => ({ ...x, fecha: e.target.value }))} required style={inp} />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, flex: 1 }}>
                <span style={{ fontWeight: 700, color: 'var(--ink-2)' }}>De</span>
                <input type="time" value={editando.inicio} onChange={e => setEditando(x => ({ ...x, inicio: e.target.value }))} required style={inp} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, flex: 1 }}>
                <span style={{ fontWeight: 700, color: 'var(--ink-2)' }}>A</span>
                <input type="time" value={editando.fin} onChange={e => setEditando(x => ({ ...x, fin: e.target.value }))} required style={inp} />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: 'var(--ink-2)' }}>Nota (opcional)</span>
              <input value={editando.nota} maxLength={200} placeholder="p. ej. en remoto, migración de la base…"
                onChange={e => setEditando(x => ({ ...x, nota: e.target.value }))} style={inp} />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {editando.id && <button type="button" className="btn btn-sm btn-outline" style={{ color: 'var(--orange)' }} onClick={quitar}><I.Trash /> Quitar</button>}
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditando(null)}>Cancelar</button>
              <button type="submit" className="btn btn-sm btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
