import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Clase de Speaking / Inglés (ticket #228), vinculada a las clases "Speaking"
// reservadas del horario (los espacios que ya existen). El profesor elige una de
// esas clases y un día de los suyos, y apunta alumnos a una o varias de las 3
// franjas de 20 min en que se parte su hora. Secretaría recibe aviso para llamar
// a los padres y a estos les llega un correo para confirmar. No usa las clases
// normales, así que no cuenta en los reportes de altas y bajas.
// ─────────────────────────────────────────────────────────────────────────────

const HOY = () => new Date().toISOString().slice(0, 10);
const fmtDia = (f) => new Date(String(f).slice(0, 10) + 'T12:00:00')
  .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
// getDay() es 0=domingo; en el horario del club 0=lunes.
const aimtulDia = (isoDate) => (new Date(isoDate + 'T12:00:00').getDay() + 6) % 7;
const min = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const hhmm = (v) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
function franjasDe(inicio, fin) {
  const a = min(inicio), b = min(fin);
  if (!inicio || !fin || b <= a) return [1, 2, 3].map(n => ({ n, label: `${n}ª franja` }));
  const paso = (b - a) / 3;
  return [1, 2, 3].map(n => ({ n, label: `${hhmm(Math.round(a + paso * (n - 1)))}–${hhmm(Math.round(a + paso * n))}` }));
}
// Una franja como texto. El servidor las manda como { n, desde, hasta } (o con
// label si la sesión no tiene horas); antes se pintaba el objeto tal cual y en la
// lista salía «[object Object]».
const franjaTxt = (f) => (typeof f === 'string' ? f
  : f?.label || (f?.desde ? `${f.desde}–${f.hasta}` : f?.n ? `${f.n}ª franja` : ''));
const franjasTxt = (arr) => {
  if (!arr?.length) return '';
  if (arr.length === 3) {
    const [a, , c] = arr;
    return a?.desde && c?.hasta ? `Hora entera (${a.desde}–${c.hasta})` : 'Hora entera';
  }
  return arr.map(franjaTxt).join(', ');
};

export default function AdminSpeaking({ showToast }) {
  const [clases, setClases] = useState([]);
  const [claseId, setClaseId] = useState('');
  const [sesiones, setSesiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [fecha, setFecha] = useState('');
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

  // Clases "Speaking" reservadas del horario.
  useEffect(() => {
    fetch('/api/admin/speaking/clases', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { clases: [] })
      .then(d => { setClases(d.clases || []); if (d.clases?.[0]) setClaseId(d.clases[0].groupId); })
      .catch(() => { });
  }, []);

  const clase = clases.find(c => c.groupId === claseId) || null;

  // Próximas fechas válidas: los días de las sesiones de esa clase (2 meses vista).
  const fechasValidas = useMemo(() => {
    if (!clase) return [];
    const dias = new Set(clase.sesiones.flatMap(s => s.days));
    const out = [];
    const d = new Date(HOY() + 'T12:00:00');
    for (let i = 0; i < 70 && out.length < 16; i++) {
      const iso = d.toISOString().slice(0, 10);
      if (dias.has(aimtulDia(iso))) out.push(iso);
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [clase]);
  useEffect(() => { setFecha(fechasValidas[0] || ''); }, [claseId, fechasValidas.length]);

  // La sesión (horas) que cae en el día elegido → franjas con horas reales.
  const sesionDia = clase && fecha ? clase.sesiones.find(s => s.days.includes(aimtulDia(fecha))) : null;
  const franjas = franjasDe(sesionDia?.startTime, sesionDia?.endTime);

  // Buscar alumnos.
  useEffect(() => {
    if (q.trim().length < 2) { setSug([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/tul/students?q=${encodeURIComponent(q.trim())}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : { students: [] }).then(d => setSug(d.students || [])).catch(() => { });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const añadir = (s) => {
    if (!nuevos.some(n => n.id === s.id)) setNuevos(x => [...x, { id: s.id, name: s.name, franjas: { 1: true, 2: true, 3: true } }]);
    setQ(''); setSug([]);
  };
  const toggleFranja = (id, f) => setNuevos(x => x.map(n => n.id === id ? { ...n, franjas: { ...n.franjas, [f]: !n.franjas[f] } } : n));
  // Mejora de selección de franjas (ticket #241): fijar una franja concreta, la
  // hora entera o ninguna para un alumno o de golpe para todos los añadidos.
  const setFranjasDe = (id, sel) => setNuevos(x => x.map(n => n.id === id ? { ...n, franjas: { ...sel } } : n));
  const setFranjasTodos = (sel) => setNuevos(x => x.map(n => ({ ...n, franjas: { ...sel } })));
  const TODAS = { 1: true, 2: true, 3: true }, NINGUNA = { 1: false, 2: false, 3: false };
  const nFranjas = (fr) => [1, 2, 3].filter(f => fr[f]).length;

  async function guardar() {
    const alumnos = nuevos.map(n => ({ studentId: n.id, franjas: [1, 2, 3].filter(f => n.franjas[f]) })).filter(a => a.franjas.length);
    if (!claseId) return alert('Elige la clase de Speaking.');
    if (!fecha) return alert('Elige un día.');
    if (!alumnos.length) return alert('Añade al menos un alumno con alguna franja marcada.');
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/speaking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ fecha, groupId: claseId, alumnos }),
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
  const franjasFila = (s) => franjasTxt((s.franjasTexto || []).filter(f => (s.franjas || []).includes(f.n)));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
        Apunta alumnos a una sesión de <b>Speaking</b> de un día concreto. Se vincula con las clases "Speaking" reservadas del horario: eliges la clase, un día de los suyos, y una o varias de las 3 franjas de 20 minutos en que se divide su hora. Secretaría recibe el aviso para llamar a los padres y a estos les llega un correo para confirmar. No cuenta en los reportes de alumnos.
      </p>

      {clases.length === 0 && (
        <div style={{ padding: 20, background: 'color-mix(in oklab, var(--orange) 8%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--orange) 30%, var(--line))', borderRadius: 14, fontSize: 14, color: 'var(--ink-2)' }}>
          No hay ninguna clase llamada <b>"Speaking"</b> en el horario. Créala en <b>Clases y horarios</b> (una clase de Inglés con ese nombre y sus días/horas reservadas) y aquí podrás apuntar a los alumnos.
        </div>
      )}

      {/* Nueva sesión */}
      {clases.length > 0 && (
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>Clase</label>
            <select value={claseId} onChange={e => setClaseId(e.target.value)}
              style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
              {clases.map(c => <option key={c.groupId} value={c.groupId}>{c.name} · {c.actividad}</option>)}
            </select>
            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>Día</label>
            <select value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', textTransform: 'capitalize' }}>
              {fechasValidas.length === 0 && <option value="">Esta clase no tiene días en el horario</option>}
              {fechasValidas.map(f => <option key={f} value={f}>{fmtDia(f)}</option>)}
            </select>
            {sesionDia && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sesionDia.startTime}–{sesionDia.endTime}{sesionDia.aula ? ` · ${sesionDia.aula}` : ''}</span>}
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
              {/* Aplicar la misma selección de franjas a todos los añadidos. */}
              {nuevos.length > 1 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-3)' }}>
                  <span style={{ fontWeight: 700 }}>Para todos:</span>
                  <button type="button" className="filter-pill" style={{ fontSize: 11 }} onClick={() => setFranjasTodos(TODAS)}>Hora entera</button>
                  {franjas.map(f => (
                    <button key={f.n} type="button" className="filter-pill" style={{ fontSize: 11 }}
                      onClick={() => setFranjasTodos({ ...NINGUNA, [f.n]: true })}>Solo {f.label}</button>
                  ))}
                </div>
              )}
              {nuevos.map(n => (
                <div key={n.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 12, padding: '8px 12px' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, flex: '1 1 140px', minWidth: 0 }}>{n.name}</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setFranjasDe(n.id, nFranjas(n.franjas) === 3 ? NINGUNA : TODAS)}
                      className={`filter-pill ${nFranjas(n.franjas) === 3 ? 'is-active' : ''}`} style={{ fontSize: 11 }}
                      title="La hora entera (las tres franjas)">Hora entera</button>
                    <span style={{ color: 'var(--line)' }}>|</span>
                    {franjas.map(f => (
                      <button key={f.n} type="button" onClick={() => toggleFranja(n.id, f.n)}
                        className={`filter-pill ${n.franjas[f.n] ? 'is-active' : ''}`} style={{ fontSize: 11 }}>{f.label}</button>
                    ))}
                  </div>
                  <button className="icon-btn danger" onClick={() => setNuevos(x => x.filter(y => y.id !== n.id))} aria-label="Quitar"><I.X /></button>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-sm btn-primary" onClick={guardar} disabled={guardando || !fecha}>
                  {guardando ? 'Guardando...' : `Apuntar y avisar a los padres (${nuevos.length})`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sesiones próximas */}
      {cargando && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
      {!cargando && dias.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          No hay sesiones de Speaking próximas.
        </div>
      )}
      {dias.map(dia => (
        <div key={dia} style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, textTransform: 'capitalize' }}>
            {fmtDia(dia)} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)' }}>· {porDia[dia][0]?.clase || 'Speaking'}</span>
          </h3>
          <div className="data-table">
            <div className="data-table-head" style={{ gridTemplateColumns: '1.3fr 140px 1.5fr 130px 120px 60px' }}>
              <span>Alumno</span><span>Franjas</span><span>Contacto familia</span><span>Confirmación</span><span>Secretaría</span><span></span>
            </div>
            {porDia[dia].map(s => {
              const e = estado(s);
              return (
                <div key={s.id} className="data-table-row" style={{ gridTemplateColumns: '1.3fr 140px 1.5fr 130px 120px 60px', alignItems: 'center' }}>
                  <div className="pri">{s.alumno}</div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>{franjasFila(s)}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.contactos || 'sin contacto'}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: e.c }}>{e.t}</span>
                  {/* Si la familia ya confirmó (sí), no hay que llamar (ticket #241). */}
                  {s.confirmado === true ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>No hace falta llamar</span>
                  ) : (
                    <button onClick={() => marcarLlamado(s)} title="Marcar que ya has llamado a los padres"
                      style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', border: '1px solid',
                        borderColor: s.llamado ? 'color-mix(in oklab, var(--teal) 40%, transparent)' : 'color-mix(in oklab, var(--orange) 40%, transparent)',
                        color: s.llamado ? 'var(--teal)' : 'var(--orange)',
                        background: `color-mix(in oklab, ${s.llamado ? 'var(--teal)' : 'var(--orange)'} 12%, var(--bg-2))` }}>
                      {s.llamado ? '✓ Llamado' : 'Llamar'}
                    </button>
                  )}
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
