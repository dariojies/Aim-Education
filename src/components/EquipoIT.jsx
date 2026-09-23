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
      <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
        Lo que se ponga aquí son las horas que cada uno tiene que fichar ese día —mandan sobre su horario
        semanal— y salen como ocupadas en «Mi día».
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

      {puede && <EstadoServidor />}
    </div>
  );
}

// Estado del servidor (ticket #298): cómo va ahora y qué peticiones han tardado
// más de 2 s desde el último arranque. Para saber, si algo vuelve a ir lento,
// qué fue y si estaba esperando conexión a la base.
function EstadoServidor() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/diagnostico', { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo cargar.');
      setD(j); setError(null);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const dato = (t, v, aviso) => (
    <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--bg-3)', minWidth: 120 }}>
      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{t}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: aviso ? 'var(--orange)' : 'var(--ink)' }}>{v}</div>
    </div>
  );
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <b style={{ fontSize: 15 }}>Estado del servidor</b>
        <button className="btn btn-sm btn-outline" onClick={cargar}>Actualizar</button>
      </div>
      {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--orange)' }}>{error}</p>}
      {d && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {dato('Arrancado hace', d.arrancadoHaceMin >= 60 ? `${Math.floor(d.arrancadoHaceMin / 60)} h ${d.arrancadoHaceMin % 60} min` : `${d.arrancadoHaceMin} min`)}
            {dato('Memoria', `${d.memoriaMb} MB`, d.memoriaMb > 450)}
            {dato('Respuesta de la base', `${d.baseMs} ms`, d.baseMs > 500)}
            {dato('Conexiones propias', `${d.pool.total} de ${d.pool.max} · ${d.pool.libres} libres`)}
            {dato('Esperando conexión', String(d.pool.esperando), d.pool.esperando > 0)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            En la base (20 como máximo, compartidas con Aim-Tul):{' '}
            {d.conexionesBase.map(c => `${c.n} ${c.state || '?'} desde ${c.ip || 'local'}`).join(' · ') || '—'}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Peticiones que han tardado más de 2 s</div>
            {!d.lentas.length ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Ninguna desde el último arranque.</p>
            ) : (
              <div style={{ display: 'grid', gap: 3, fontSize: 12, fontFamily: 'var(--font-mono, monospace)', maxHeight: 260, overflowY: 'auto' }}>
                {d.lentas.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--ink-3)' }}>{new Date(l.cuando).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</span>
                    <b style={{ color: l.ms > 10000 ? 'var(--orange)' : 'var(--ink)' }}>{(l.ms / 1000).toFixed(1)} s</b>
                    <span>{l.metodo} {l.ruta} → {l.estado}</span>
                    <span style={{ color: 'var(--ink-3)' }}>base: {l.pool.total} abiertas, {l.pool.libres} libres, {l.pool.esperando} esperando</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
