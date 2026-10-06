import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { EditorNoPuede, choques, textoNoPuede } from './NoPuedeSpeaking.jsx';

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
  return [1, 2, 3].map(n => {
    const desde = hhmm(Math.round(a + paso * (n - 1))), hasta = hhmm(Math.round(a + paso * n));
    return { n, desde, hasta, label: `${desde}–${hasta}` };
  });
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

// ── Historial (#367): cuántas veces ha ido cada alumno y qué días ───────────
// Sale de las citas y de lo marcado al pasar lista en la clase de Speaking.
const fmtCorta = (f) => (f ? new Date(String(f).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const ESTADO_DIA = (d) => (d.asistencia === 'present' ? { t: '✓ Vino', c: 'var(--teal)' }
  : d.asistencia === 'late' ? { t: '✓ Vino (tarde)', c: 'var(--teal)' }
  : d.asistencia === 'absent' ? { t: '✗ No vino', c: '#E5484D' }
  : d.asistencia === 'excused' ? { t: 'Justificada', c: 'var(--ink-3)' }
  : d.confirmado === false ? { t: 'No podía', c: 'var(--orange)' }
  : d.perdida ? { t: '⌛ Plaza perdida', c: 'var(--ink-3)' }
  : String(d.fecha).slice(0, 10) >= new Date().toLocaleDateString('sv-SE') ? { t: d.confirmado ? 'Confirmado · próxima' : 'Próxima · sin confirmar', c: 'var(--purple)' }
  : { t: 'Sin lista pasada', c: 'var(--ink-3)' });

function HistorialSpeaking() {
  const [lista, setLista] = useState(null);
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(null);
  const [dias, setDias] = useState({});
  useEffect(() => {
    fetch('/api/admin/speaking/historial', { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { alumnos: [] })).then(d => setLista(d.alumnos || [])).catch(() => setLista([]));
  }, []);
  async function abrir(id) {
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    if (dias[id]) return;
    const d = await fetch(`/api/admin/speaking/historial?alumno=${id}`, { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    setDias(x => ({ ...x, [id]: d?.dias || [] }));
  }
  if (lista === null) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</p>;
  const n = q.trim().toLowerCase();
  const filas = lista.filter(a => !n || a.alumno.toLowerCase().includes(n));
  const tot = lista.reduce((t, a) => ({ citas: t.citas + a.citas, vino: t.vino + a.vino, falto: t.falto + a.falto }), { citas: 0, vino: 0, falto: 0 });
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
        Cuántas veces ha ido cada alumno a Speaking y qué días. «Vino» y «No vino» salen de lo que se marca al <b>pasar lista</b> en la clase de Speaking; mientras no se pase, el día sale como «Sin lista pasada».
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-input" style={{ flex: '1 1 260px', maxWidth: 420 }}><I.Search /><input placeholder="Buscar alumno…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar alumno" /></div>
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{lista.length} alumnos · {tot.citas} citas · <b style={{ color: 'var(--teal)' }}>{tot.vino} veces vinieron</b> · <b style={{ color: '#E5484D' }}>{tot.falto} faltas</b></span>
      </div>
      {!filas.length && <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>{lista.length ? 'Nadie con ese nombre.' : 'Todavía no hay nadie que haya ido a Speaking.'}</div>}
      {filas.length > 0 && (
        <div className="data-table">
          <div className="data-table-head" style={{ gridTemplateColumns: '1.5fr repeat(5, 84px) 1.1fr 1.1fr' }}>
            <span>Alumno</span><span>Citas</span><span>Vino</span><span>Faltó</span><span>No podía</span><span>Perdidas</span><span>Última vez</span><span>Próxima</span>
          </div>
          {filas.map(a => (
            <React.Fragment key={a.studentId}>
              <div className="data-table-row" role="button" tabIndex={0} onClick={() => abrir(a.studentId)} onKeyDown={e => { if (e.key === 'Enter') abrir(a.studentId); }}
                style={{ gridTemplateColumns: '1.5fr repeat(5, 84px) 1.1fr 1.1fr', alignItems: 'center', cursor: 'pointer' }}>
                <div className="pri">{abierto === a.studentId ? '▾' : '▸'} {a.alumno}</div>
                <span>{a.citas}</span>
                <span style={{ fontWeight: 800, color: 'var(--teal)' }}>{a.vino}</span>
                <span style={{ fontWeight: a.falto ? 800 : 400, color: a.falto ? '#E5484D' : 'var(--ink-3)' }}>{a.falto}</span>
                <span style={{ color: a.noPodia ? 'var(--orange)' : 'var(--ink-3)' }}>{a.noPodia}</span>
                <span style={{ color: 'var(--ink-3)' }}>{a.perdidas}</span>
                <span style={{ fontSize: 12 }}>{a.ultima ? fmtCorta(a.ultima) : '—'}</span>
                <span style={{ fontSize: 12, color: 'var(--purple)' }}>{a.proxima ? fmtCorta(a.proxima) : '—'}</span>
              </div>
              {abierto === a.studentId && (
                <div style={{ padding: '8px 14px 14px', display: 'grid', gap: 4, background: 'var(--bg-3)' }}>
                  {!dias[a.studentId] && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Cargando…</span>}
                  {(dias[a.studentId] || []).map((d, i) => {
                    const e = ESTADO_DIA(d);
                    return (
                      <div key={i} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
                        <span style={{ minWidth: 150, textTransform: 'capitalize', fontWeight: 700 }}>{fmtCorta(d.fecha)}</span>
                        <span style={{ color: 'var(--ink-3)', flex: 1, minWidth: 0 }}>{d.citado ? (d.franjas || 'citado') : 'vino sin estar citado'}{d.clase ? ` · ${d.clase}` : ''}</span>
                        <span style={{ fontWeight: 800, color: e.c }}>{e.t}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminSpeaking({ showToast }) {
  // Citas (apuntar y confirmar) o el historial de cada alumno (#367).
  const [vistaSpk, setVistaSpk] = useState('citas');
  const [clases, setClases] = useState([]);
  const [claseId, setClaseId] = useState('');
  const [sesiones, setSesiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [fecha, setFecha] = useState('');
  const [q, setQ] = useState('');
  const [sug, setSug] = useState([]);
  const [nuevos, setNuevos] = useState([]); // { id, name, franjas: {1,2,3}, noPuede, nota }
  const [guardando, setGuardando] = useState(false);
  // Editor de «cuándo no puede» (#363) abierto: id del alumno.
  const [editNoPuede, setEditNoPuede] = useState(null);
  const [guardandoNP, setGuardandoNP] = useState(false);

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

  // Al añadirle se trae cuándo no puede (#363) y se le marcan solo las franjas
  // en que sí puede ese día.
  const añadir = async (s) => {
    setQ(''); setSug([]);
    if (nuevos.some(n => n.id === s.id)) return;
    setNuevos(x => [...x, { id: s.id, name: s.name, franjas: { 1: true, 2: true, 3: true }, noPuede: [], nota: '' }]);
    const d = await fetch(`/api/admin/speaking/disponibilidad/${s.id}`, { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (!d) return;
    const ch = fecha ? choques(d.noPuede, fecha, franjas) : { franjas: [] };
    const libres = [1, 2, 3].filter(f => !ch.franjas.includes(f));
    setNuevos(x => x.map(n => (n.id === s.id ? {
      ...n, noPuede: d.noPuede || [], nota: d.nota || '',
      franjas: libres.length ? Object.fromEntries([1, 2, 3].map(f => [f, libres.includes(f)])) : n.franjas,
    } : n)));
  };
  async function guardarNoPuede(studentId, datos) {
    setGuardandoNP(true);
    try {
      const r = await fetch(`/api/admin/speaking/disponibilidad/${studentId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(datos),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return alert(d.error || 'No se ha podido guardar.');
      setNuevos(x => x.map(n => (n.id === studentId ? { ...n, noPuede: d.noPuede, nota: d.nota } : n)));
      setEditNoPuede(null);
      showToast?.('Anotado cuándo no puede.');
      cargar();
    } catch { alert('Error de conexión.'); } finally { setGuardandoNP(false); }
  }
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
  // La respuesta de la familia dada por teléfono (solo después de llamar).
  async function marcarRespuesta(s, confirmado) {
    setSesiones(prev => prev.map(x => x.id === s.id ? { ...x, confirmado } : x));
    const r = await fetch(`/api/admin/speaking/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ confirmado }),
    }).catch(() => null);
    if (!r?.ok) { showToast?.('No se ha podido guardar. Vuelve a intentarlo.'); await cargar(); }
  }
  async function borrar(s) {
    if (!window.confirm(`¿Quitar a ${s.alumno} de la sesión del ${fmtDia(s.fecha)}?`)) return;
    const r = await fetch(`/api/admin/speaking/${s.id}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) { await cargar(); showToast?.('Quitado.'); }
  }

  const porDia = {};
  for (const s of sesiones) (porDia[String(s.fecha).slice(0, 10)] ||= []).push(s);
  const dias = Object.keys(porDia).sort();
  const estado = (s) => s.perdida ? { t: '⌛ Plaza perdida', c: 'var(--danger, #dc2626)' }
    : s.confirmado === true ? { t: '✓ Confirmado', c: 'var(--teal)' }
    : s.confirmado === false ? { t: '✗ No puede', c: 'var(--orange)' }
      : { t: s.emailEnviado ? 'Esperando respuesta' : s.sinAvisos ? 'Sin correo · no quiere avisos' : 'Sin correo', c: 'var(--ink-3)' };
  const franjasFila = (s) => franjasTxt((s.franjasTexto || []).filter(f => (s.franjas || []).includes(f.n)));

  const pestanas = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {[['citas', 'Citas'], ['historial', 'Historial por alumno']].map(([v, l]) => (
        <button key={v} type="button" className={`filter-pill ${vistaSpk === v ? 'is-active' : ''}`} onClick={() => setVistaSpk(v)}>{l}</button>
      ))}
    </div>
  );
  if (vistaSpk === 'historial') return <div style={{ display: 'grid', gap: 16 }}>{pestanas}<HistorialSpeaking /></div>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {pestanas}
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
        Apunta alumnos a una sesión de <b>Speaking</b> de un día concreto. Se vincula con las clases "Speaking" reservadas del horario: eliges la clase, un día de los suyos, y una o varias de las 3 franjas de 20 minutos en que se divide su hora. Secretaría recibe el aviso para llamar a los padres y a estos les llega un correo para confirmar. No cuenta en los reportes de alumnos.
        {' '}Si un alumno tiene anotado cuándo no puede (lo anota secretaría o la familia desde su área), al añadirlo solo se marcan las franjas en que sí puede y se avisa si ese día no puede.
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
              {nuevos.map(n => {
                const ch = fecha ? choques(n.noPuede, fecha, franjas) : { dia: false, franjas: [] };
                const marcadasMal = ch.franjas.filter(f => n.franjas[f]);
                return (
                <div key={n.id} style={{ display: 'grid', gap: 8, background: 'var(--bg-3)', border: `1px solid ${marcadasMal.length ? 'var(--orange)' : 'var(--line)'}`, borderRadius: 12, padding: '8px 12px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{n.name}</span>
                    {/* Cuándo no puede (#363), y si choca con este día. */}
                    {n.noPuede.length > 0 && (
                      <span style={{ display: 'block', fontSize: 12, color: ch.dia || marcadasMal.length ? 'var(--orange)' : 'var(--ink-3)', fontWeight: ch.dia || marcadasMal.length ? 700 : 400 }}>
                        {ch.dia ? `⚠ Este día no puede: ${textoNoPuede(ch.reglas)}` : marcadasMal.length ? `⚠ No puede a esa hora: ${textoNoPuede(ch.reglas)}` : `No puede ${textoNoPuede(n.noPuede)}`}
                      </span>
                    )}
                    {n.nota && <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>{n.nota}</span>}
                    <button type="button" onClick={() => setEditNoPuede(editNoPuede === n.id ? null : n.id)}
                      style={{ background: 'none', border: 0, padding: 0, fontSize: 11, fontWeight: 700, color: 'var(--purple)', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                      {n.noPuede.length || n.nota ? 'Cambiar cuándo no puede' : 'Anotar cuándo no puede'}
                    </button>
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setFranjasDe(n.id, nFranjas(n.franjas) === 3 ? NINGUNA : TODAS)}
                      className={`filter-pill ${nFranjas(n.franjas) === 3 ? 'is-active' : ''}`} style={{ fontSize: 11 }}
                      title="La hora entera (las tres franjas)">Hora entera</button>
                    <span style={{ color: 'var(--line)' }}>|</span>
                    {franjas.map(f => {
                      const noPuede = ch.franjas.includes(f.n);
                      return (
                        <button key={f.n} type="button" onClick={() => toggleFranja(n.id, f.n)}
                          title={noPuede ? 'A esta hora no puede' : undefined}
                          className={`filter-pill ${n.franjas[f.n] ? 'is-active' : ''}`}
                          style={{ fontSize: 11, ...(noPuede ? { textDecoration: 'line-through', borderColor: 'var(--orange)', color: n.franjas[f.n] ? undefined : 'var(--orange)' } : {}) }}>{f.label}</button>
                      );
                    })}
                  </div>
                  <button className="icon-btn danger" onClick={() => setNuevos(x => x.filter(y => y.id !== n.id))} aria-label="Quitar"><I.X /></button>
                </div>
                {editNoPuede === n.id && (
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <EditorNoPuede key={n.id} inicial={n.noPuede} notaInicial={n.nota} quien={n.name.split(' ')[0]} guardando={guardandoNP}
                      onCancelar={() => setEditNoPuede(null)} onGuardar={(d) => guardarNoPuede(n.id, d)} />
                  </div>
                )}
                </div>
                );
              })}
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
            <div className="data-table-head" style={{ gridTemplateColumns: '1.3fr 140px 1.4fr 190px 120px 60px' }}>
              <span>Alumno</span><span>Franjas</span><span>Contacto familia</span><span>Confirmación</span><span>Secretaría</span><span></span>
            </div>
            {porDia[dia].map(s => {
              const e = estado(s);
              return (
                <div key={s.id} className="data-table-row" style={{ gridTemplateColumns: '1.3fr 140px 1.4fr 190px 120px 60px', alignItems: 'center' }}>
                  <div className="pri" style={{ minWidth: 0 }}>
                    {s.alumno}
                    {/* Citado cuando dijo que no podía (#363). */}
                    {s.choque ? (
                      <span title={s.notaNoPuede || undefined} style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--orange)' }}>
                        ⚠ No puede {textoNoPuede(s.noPuede)}
                      </span>
                    ) : (s.noPuede || []).length > 0 && (
                      <span title={s.notaNoPuede || undefined} style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)', fontWeight: 400 }}>
                        No puede {textoNoPuede(s.noPuede)}
                      </span>
                    )}
                    <button type="button" onClick={() => setEditNoPuede(editNoPuede === `s${s.id}` ? null : `s${s.id}`)}
                      style={{ display: 'block', background: 'none', border: 0, padding: 0, fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', cursor: 'pointer', textDecoration: 'underline dotted', fontFamily: 'inherit' }}>
                      {(s.noPuede || []).length || s.notaNoPuede ? 'cambiar cuándo no puede' : 'anotar cuándo no puede'}
                    </button>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>{franjasFila(s)}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.contactos || 'sin contacto'}</span>
                  {/* Lo normal es que confirme la familia desde el correo. Si
                      secretaría ya ha llamado y aún no hay respuesta, puede
                      apuntar lo que le han dicho por teléfono. */}
                  {s.llamado && s.confirmado == null && !s.perdida ? (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button onClick={() => marcarRespuesta(s, true)} title="Por teléfono han dicho que sí viene"
                        style={{ fontSize: 11, fontWeight: 800, padding: '4px 8px', borderRadius: 999, cursor: 'pointer', border: '1px solid color-mix(in oklab, var(--teal) 40%, transparent)', color: 'var(--teal)', background: 'color-mix(in oklab, var(--teal) 10%, var(--bg-2))', fontFamily: 'inherit' }}>
                        ✓ Confirmada
                      </button>
                      <button onClick={() => marcarRespuesta(s, false)} title="Por teléfono han dicho que no puede venir"
                        style={{ fontSize: 11, fontWeight: 800, padding: '4px 8px', borderRadius: 999, cursor: 'pointer', border: '1px solid color-mix(in oklab, var(--orange) 40%, transparent)', color: 'var(--orange)', background: 'color-mix(in oklab, var(--orange) 10%, var(--bg-2))', fontFamily: 'inherit' }}>
                        ✗ No puede
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 800, color: e.c }}>
                      {e.t}
                      {s.llamado && s.confirmado != null && s.plazoAbierto !== false && (
                        <button onClick={() => marcarRespuesta(s, null)} title="Volver a dejarla sin respuesta"
                          style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', background: 'none', border: 0, padding: 0, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>
                          cambiar
                        </button>
                      )}
                    </span>
                  )}
                  {/* Si la familia ya confirmó (sí), no hay que llamar (ticket #241).
                      Y si se acabó el plazo sin confirmar, ya no hay nada que hacer. */}
                  {(s.confirmado === true && !s.llamado) || s.perdida ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>{s.perdida ? 'Fuera de plazo' : 'No hace falta llamar'}</span>
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
                  {editNoPuede === `s${s.id}` && (
                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 6 }}>
                      <EditorNoPuede key={s.id} inicial={s.noPuede} notaInicial={s.notaNoPuede} quien={s.alumno.split(' ')[0]} guardando={guardandoNP}
                        onCancelar={() => setEditNoPuede(null)} onGuardar={(d) => guardarNoPuede(s.studentId, d)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
