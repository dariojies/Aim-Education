import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { EditorNoPuede, choques, textoNoPuede } from './NoPuedeSpeaking.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Clases individuales (ticket #388; antes «Speaking», ticket #228). Vale para
// cualquier actividad: secretaría marca qué clases del horario son individuales
// (los espacios que ya existen) y, para apuntar, se elige la actividad, una de
// sus clases y un día de los suyos, y se apunta a los alumnos a una o varias de
// las 3 franjas de 20 min en que se parte su hora. Secretaría recibe aviso para
// llamar a los padres y a estos les llega un correo para confirmar. No usa las
// clases normales, así que no cuenta en los reportes de altas y bajas. Por
// dentro sigue llamándose «speaking» (sección, rutas de la API, tablas).
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

// La etiqueta de la actividad (Inglés, Taekwondo…) en las listas.
const Actividad = ({ nombre }) => (nombre ? (
  <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: 'var(--purple)', background: 'color-mix(in oklab, var(--purple) 10%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--purple) 25%, transparent)', whiteSpace: 'nowrap' }}>{nombre}</span>
) : null);

// Píldoras para filtrar por actividad: «Todas» y una por actividad.
function FiltroActividad({ actividades, valor, onCambio, todas = true }) {
  if (actividades.length < 2 && todas) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {todas && <button type="button" className={`filter-pill ${!valor ? 'is-active' : ''}`} onClick={() => onCambio('')}>Todas</button>}
      {actividades.map(a => (
        <button key={a.activityId} type="button" className={`filter-pill ${valor === a.activityId ? 'is-active' : ''}`} onClick={() => onCambio(a.activityId)}>{a.actividad}</button>
      ))}
    </div>
  );
}

// ── Historial (#367): cuántas veces ha ido cada alumno y qué días ───────────
// Sale de las citas y de lo marcado al pasar lista en las clases individuales.
const fmtCorta = (f) => (f ? new Date(String(f).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const ESTADO_DIA = (d) => (d.asistencia === 'present' ? { t: '✓ Vino', c: 'var(--teal)' }
  : d.asistencia === 'late' ? { t: '✓ Vino (tarde)', c: 'var(--teal)' }
  : d.asistencia === 'absent' ? { t: '✗ No vino', c: '#E5484D' }
  : d.asistencia === 'excused' ? { t: 'Justificada', c: 'var(--ink-3)' }
  : d.confirmado === false ? { t: 'No podía', c: 'var(--orange)' }
  : d.perdida ? { t: '⌛ Plaza perdida', c: 'var(--ink-3)' }
  : String(d.fecha).slice(0, 10) >= new Date().toLocaleDateString('sv-SE') ? { t: d.confirmado ? 'Confirmado · próxima' : 'Próxima · sin confirmar', c: 'var(--purple)' }
  : { t: 'Sin lista pasada', c: 'var(--ink-3)' });

function HistorialSpeaking({ actividades }) {
  const [lista, setLista] = useState(null);
  const [q, setQ] = useState('');
  const [act, setAct] = useState('');
  const [abierto, setAbierto] = useState(null);
  const [dias, setDias] = useState({});
  useEffect(() => {
    setLista(null); setAbierto(null); setDias({});
    fetch(`/api/admin/speaking/historial${act ? `?activityId=${act}` : ''}`, { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { alumnos: [] })).then(d => setLista(d.alumnos || [])).catch(() => setLista([]));
  }, [act]);
  async function abrir(id) {
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    if (dias[id]) return;
    const d = await fetch(`/api/admin/speaking/historial?alumno=${id}${act ? `&activityId=${act}` : ''}`, { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    setDias(x => ({ ...x, [id]: d?.dias || [] }));
  }
  const n = q.trim().toLowerCase();
  const filas = (lista || []).filter(a => !n || a.alumno.toLowerCase().includes(n));
  const tot = (lista || []).reduce((t, a) => ({ citas: t.citas + a.citas, vino: t.vino + a.vino, falto: t.falto + a.falto }), { citas: 0, vino: 0, falto: 0 });
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
        Cuántas veces ha ido cada alumno a sus clases individuales y qué días. «Vino» y «No vino» salen de lo que se marca al <b>pasar lista</b> en la clase individual; mientras no se pase, el día sale como «Sin lista pasada».
      </p>
      <FiltroActividad actividades={actividades} valor={act} onCambio={setAct} />
      {lista === null ? <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</p> : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search-input" style={{ flex: '1 1 260px', maxWidth: 420 }}><I.Search /><input placeholder="Buscar alumno…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar alumno" /></div>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{lista.length} alumnos · {tot.citas} citas · <b style={{ color: 'var(--teal)' }}>{tot.vino} veces vinieron</b> · <b style={{ color: '#E5484D' }}>{tot.falto} faltas</b></span>
          </div>
          {!filas.length && <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>{lista.length ? 'Nadie con ese nombre.' : 'Todavía no hay nadie que haya ido a una clase individual.'}</div>}
          {filas.length > 0 && (
            <div className="data-table">
              <div className="data-table-head" style={{ gridTemplateColumns: '1.5fr repeat(5, 84px) 1.1fr 1.1fr' }}>
                <span>Alumno</span><span>Citas</span><span>Vino</span><span>Faltó</span><span>No podía</span><span>Perdidas</span><span>Última vez</span><span>Próxima</span>
              </div>
              {filas.map(a => (
                <React.Fragment key={a.studentId}>
                  <div className="data-table-row" role="button" tabIndex={0} onClick={() => abrir(a.studentId)} onKeyDown={e => { if (e.key === 'Enter') abrir(a.studentId); }}
                    style={{ gridTemplateColumns: '1.5fr repeat(5, 84px) 1.1fr 1.1fr', alignItems: 'center', cursor: 'pointer' }}>
                    <div className="pri" style={{ minWidth: 0 }}>
                      {abierto === a.studentId ? '▾' : '▸'} {a.alumno}
                      {a.actividades && <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--purple)' }}>{a.actividades}</span>}
                    </div>
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
                          <div key={i} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
                            <span style={{ minWidth: 150, textTransform: 'capitalize', fontWeight: 700 }}>{fmtCorta(d.fecha)}</span>
                            <Actividad nombre={d.actividad} />
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
        </>
      )}
    </div>
  );
}

// ── Qué clases del horario son individuales (#388) ──────────────────────────
// Lo decide secretaría o dirección; el resto lo ve sin poder cambiarlo.
function ClasesIndividualesConfig({ showToast, onGuardado }) {
  const [d, setD] = useState(null);
  const [marcadas, setMarcadas] = useState(new Set());
  const [guardando, setGuardando] = useState(false);
  const cargar = useCallback(() => fetch('/api/admin/speaking/config', { credentials: 'include', cache: 'no-store' })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('No se ha podido cargar.'))))
    .then(x => { setD(x); setMarcadas(new Set(x.clases.filter(c => c.individual).map(c => c.groupId))); })
    .catch(e => setD({ error: e.message })), []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!d) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</p>;
  if (d.error) return <p style={{ color: 'var(--orange)', fontSize: 14 }}>{d.error}</p>;
  const porActividad = [...new Map(d.clases.map(c => [c.activityId, c.actividad])).entries()];
  const cambios = d.clases.filter(c => c.individual !== marcadas.has(c.groupId));
  const alternar = (id) => setMarcadas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function guardar() {
    // Al marcar una clase que ya se usaba como normal, lo que conviene saber antes.
    const usadas = cambios.filter(c => marcadas.has(c.groupId) && (c.alumnos > 0 || c.diasLista > 0 || c.reservasBono > 0));
    const reservas = usadas.reduce((n, c) => n + (c.reservasBono || 0), 0);
    const una = usadas.length === 1;
    if (usadas.length && !window.confirm([
      `Vas a marcar como individual ${una ? 'una clase que ya se usaba' : 'clases que ya se usaban'} como clase normal: ${usadas.map(c => `«${c.name}»`).join(', ')}.`,
      `· En «Pasar lista» solo ${una ? 'saldrá' : 'saldrán'} los días con alumnos citados y su lista será la de los citados.`,
      usadas.some(c => c.diasLista > 0) ? '· En el historial de clases individuales entrarán las listas que ya se pasaron: quienes vinieron saldrán como «vino sin estar citado».' : '',
      reservas ? `· Hay ${reservas === 1 ? '1 reserva' : `${reservas} reservas`} con bono por delante: no se ${reservas === 1 ? 'devuelve' : 'devuelven'} y no ${reservas === 1 ? 'saldrá' : 'saldrán'} en «Pasar lista» salvo los días con citas. Conviene ${reservas === 1 ? 'anularla' : 'anularlas'} antes.` : '',
      '¿Seguir?',
    ].filter(Boolean).join('\n\n'))) return;
    setGuardando(true);
    try {
      const enviar = (confirmar) => fetch('/api/admin/speaking/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ groupIds: [...marcadas], ...(confirmar ? { confirmar: true } : {}) }),
      });
      let r = await enviar(false);
      let x = await r.json().catch(() => ({}));
      // Si alguna que se desmarca tiene citas por delante, el servidor no guarda
      // y dice cuántas: se pregunta y, si sigue, se manda otra vez confirmándolo.
      if (r.status === 409 && x.citasFuturas) {
        const varias = (x.clases || []).length > 1;
        if (!window.confirm(`${x.error}\n\nSi ${varias ? 'dejan de ser individuales' : 'deja de ser individual'}, ${x.citasFuturas === 1 ? 'esa cita sigue' : 'esas citas siguen'} en la lista y con sus correos, pero en «Pasar lista» ${varias ? 'saldrán como clases normales' : 'saldrá como una clase normal'} (sin los citados) y el historial perderá su asistencia. Mejor quitar antes ${x.citasFuturas === 1 ? 'la cita' : 'las citas'} desde «Citas».\n\n¿Desmarcar${varias ? 'las' : 'la'} igualmente?`)) return;
        r = await enviar(true);
        x = await r.json().catch(() => ({}));
      }
      if (!r.ok) return alert(x.error || 'No se ha podido guardar.');
      showToast?.('Guardado: clases individuales actualizadas.');
      await cargar(); onGuardado?.();
    } catch { alert('Error de conexión.'); } finally { setGuardando(false); }
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0, lineHeight: 1.5 }}>
        Marca las clases del horario que son <b>individuales</b> (de cualquier actividad: Inglés, Taekwondo, Ballet…). Solo esas salen al apuntar alumnos aquí.
        Una clase individual solo sale en <b>Pasar lista</b> los días con alumnos citados (su lista es la de los citados) y <b>no admite bonos</b>.
        Si hace falta una clase nueva, créala primero en <b>Clases y horarios</b> con sus días y horas.
      </p>
      {d.porNombre && (
        <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0, fontStyle: 'italic' }}>
          Aún no se ha guardado ninguna lista: ahora cuentan como individuales las clases que se llaman «Speaking». Al guardar, manda lo que marques aquí.
        </p>
      )}
      {!d.puedeCambiar && <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)', margin: 0 }}>Esto lo decide secretaría o dirección: aquí solo puedes verlo.</p>}
      {porActividad.map(([id, nombre]) => (
        <div key={id} style={{ display: 'grid', gap: 4 }}>
          <b style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)' }}>{nombre}</b>
          {d.clases.filter(c => c.activityId === id).map(c => (
            <label key={c.groupId} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 10px', borderRadius: 10, background: 'var(--bg-3)', cursor: d.puedeCambiar ? 'pointer' : 'default', fontSize: 13, border: `1px solid ${marcadas.has(c.groupId) ? 'color-mix(in oklab, var(--purple) 35%, var(--line))' : 'transparent'}` }}>
              <input type="checkbox" disabled={!d.puedeCambiar} checked={marcadas.has(c.groupId)} onChange={() => alternar(c.groupId)} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{c.name}</b>{' '}
                <span style={{ color: 'var(--ink-3)' }}>· {c.sesiones.length ? c.sesiones.map(s => `${s.days.map(x => ['L', 'M', 'X', 'J', 'V', 'S', 'D'][x]).join('')} ${s.startTime || ''}${s.endTime ? `–${s.endTime}` : ''}`).join(' | ') : 'sin horario'}</span>
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.alumnos} matriculado{c.alumnos !== 1 ? 's' : ''}</span>
            </label>
          ))}
        </div>
      ))}
      {d.puedeCambiar && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '10px 0' }}>
          <button className="btn btn-primary" disabled={guardando || !cambios.length} onClick={guardar}>
            {guardando ? 'Guardando…' : cambios.length ? `Guardar (${cambios.length} cambio${cambios.length === 1 ? '' : 's'})` : 'Sin cambios'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminSpeaking({ showToast }) {
  // Citas (apuntar y confirmar), el historial de cada alumno (#367) o qué
  // clases son individuales (#388).
  const [vistaSpk, setVistaSpk] = useState('citas');
  const [clases, setClases] = useState(null);
  // Actividad y clase con las que se apunta.
  const [actId, setActId] = useState('');
  const [claseId, setClaseId] = useState('');
  // Filtro de la lista de próximas: '' = todas.
  const [filtroAct, setFiltroAct] = useState('');
  const [sesiones, setSesiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [fecha, setFecha] = useState('');
  const [q, setQ] = useState('');
  const [sug, setSug] = useState([]);
  const [buscando, setBuscando] = useState(false);
  // La búsqueda que ya ha contestado (actividad|texto|todo el club): hasta
  // entonces no se dice «nadie», que aún no se sabe.
  const [buscado, setBuscado] = useState('');
  // Por defecto se busca entre los alumnos de la actividad; con esto, en todo el club.
  const [todoClub, setTodoClub] = useState(false);
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

  // Las clases individuales del horario, de todas las actividades.
  const cargarClases = useCallback(() => fetch('/api/admin/speaking/clases', { credentials: 'include', cache: 'no-store' })
    .then(r => r.ok ? r.json() : { clases: [] })
    .then(d => setClases(d.clases || []))
    .catch(() => setClases([])), []);
  useEffect(() => { cargarClases(); }, [cargarClases]);

  // Las actividades que tienen alguna clase individual.
  const actividades = useMemo(() => [...new Map((clases || []).map(c => [c.activityId, { activityId: c.activityId, actividad: c.actividad }])).values()], [clases]);
  // Primera actividad y primera clase por defecto; si deja de existir, otra.
  useEffect(() => {
    if (!clases) return;
    if (!actividades.some(a => a.activityId === actId)) setActId(actividades[0]?.activityId || '');
  }, [clases, actividades, actId]);
  const clasesAct = useMemo(() => (clases || []).filter(c => c.activityId === actId), [clases, actId]);
  useEffect(() => {
    if (!clasesAct.some(c => c.groupId === claseId)) setClaseId(clasesAct[0]?.groupId || '');
  }, [clasesAct, claseId]);
  // Al cambiar de actividad, los añadidos de la otra no valen.
  useEffect(() => { setNuevos([]); setQ(''); setSug([]); }, [actId]);

  const clase = clasesAct.find(c => c.groupId === claseId) || null;
  const actividad = actividades.find(a => a.activityId === actId)?.actividad || '';

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
  useEffect(() => { setFecha(fechasValidas[0] || ''); }, [claseId, fechasValidas.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // La sesión (horas) que cae en el día elegido → franjas con horas reales.
  const sesionDia = clase && fecha ? clase.sesiones.find(s => s.days.includes(aimtulDia(fecha))) : null;
  const franjas = franjasDe(sesionDia?.startTime, sesionDia?.endTime);

  // Buscar alumnos: los de la actividad (aunque no se escriba nada) o, con
  // «todo el club», cualquiera (escribiendo al menos 2 letras).
  const [foco, setFoco] = useState(false);
  useEffect(() => {
    if (!foco || !actId || (todoClub && q.trim().length < 2)) { setSug([]); setBuscado(''); return; }
    const clave = `${actId}|${q.trim()}|${todoClub}`;
    const t = setTimeout(() => {
      setBuscando(true);
      const p = new URLSearchParams({ activityId: actId, q: q.trim(), ...(todoClub ? { todos: '1' } : {}) });
      fetch(`/api/admin/speaking/alumnos?${p}`, { credentials: 'include', cache: 'no-store' })
        .then(r => r.ok ? r.json() : { alumnos: [] }).then(d => { setSug(d.alumnos || []); setBuscado(clave); }).catch(() => { })
        .finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, foco, actId, todoClub]);

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
    if (!claseId) return alert('Elige la clase individual.');
    if (!fecha) return alert('Elige un día.');
    if (!alumnos.length) return alert('Añade al menos un alumno con alguna franja marcada.');
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/speaking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ fecha, groupId: claseId, alumnos }),
      });
      const d = await r.json();
      // Si alguno ya tiene otra clase individual ese día, el servidor no apunta a
      // nadie y lo dice (#388): se deja la lista como está para corregirla.
      if (!r.ok) return alert(d.error || 'No se pudo guardar.');
      showToast?.(`${d.creados} alumno${d.creados !== 1 ? 's' : ''} apuntado${d.creados !== 1 ? 's' : ''}${d.correo ? ' · correo enviado a los padres' : ' · (correo no configurado en el servidor)'}.${d.aviso ? ` ${d.aviso}` : ''}`);
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
    if (!window.confirm(`¿Quitar a ${s.alumno} de la clase individual del ${fmtDia(s.fecha)}?`)) return;
    const r = await fetch(`/api/admin/speaking/${s.id}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) { await cargar(); showToast?.('Quitado.'); }
  }

  // Próximas, por día y clase (un mismo día puede haber varias actividades), en
  // el orden en que llegan del servidor: día, actividad y clase.
  const visibles = sesiones.filter(s => !filtroAct || s.activityId === filtroAct);
  const porDia = {};
  const dias = [];
  for (const s of visibles) {
    const clave = `${String(s.fecha).slice(0, 10)}|${s.groupId || ''}`;
    if (!porDia[clave]) { porDia[clave] = []; dias.push(clave); }
    porDia[clave].push(s);
  }
  const estado = (s) => s.perdida ? { t: '⌛ Plaza perdida', c: 'var(--danger, #dc2626)' }
    : s.confirmado === true ? { t: '✓ Confirmado', c: 'var(--teal)' }
    : s.confirmado === false ? { t: '✗ No puede', c: 'var(--orange)' }
      : { t: s.emailEnviado ? 'Esperando respuesta' : s.sinAvisos ? 'Sin correo · no quiere avisos' : 'Sin correo', c: 'var(--ink-3)' };
  const franjasFila = (s) => franjasTxt((s.franjasTexto || []).filter(f => (s.franjas || []).includes(f.n)));
  // Las actividades de las próximas (aunque la clase ya no esté marcada).
  const actividadesProximas = [...new Map(sesiones.filter(s => s.activityId).map(s => [s.activityId, { activityId: s.activityId, actividad: s.actividad }])).values()];

  const pestanas = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {[['citas', 'Citas'], ['historial', 'Historial por alumno'], ['clases', 'Qué clases son individuales']].map(([v, l]) => (
        <button key={v} type="button" className={`filter-pill ${vistaSpk === v ? 'is-active' : ''}`} onClick={() => setVistaSpk(v)}>{l}</button>
      ))}
    </div>
  );
  if (vistaSpk === 'historial') return <div style={{ display: 'grid', gap: 16 }}>{pestanas}<HistorialSpeaking actividades={actividades} /></div>;
  if (vistaSpk === 'clases') return <div style={{ display: 'grid', gap: 16 }}>{pestanas}<ClasesIndividualesConfig showToast={showToast} onGuardado={() => { cargarClases(); cargar(); }} /></div>;

  const etiqueta = { fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' };
  const desplegable = { fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {pestanas}
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
        Apunta alumnos a una <b>clase individual</b> de un día concreto, de cualquier actividad. Eliges la actividad, una de sus clases individuales, un día de los suyos, y una o varias de las 3 franjas de 20 minutos en que se divide su hora. Secretaría recibe el aviso para llamar a los padres y a estos les llega un correo para confirmar. No cuenta en los reportes de alumnos.
        {' '}Si un alumno tiene anotado cuándo no puede (lo anota secretaría o la familia desde su área), al añadirlo solo se marcan las franjas en que sí puede y se avisa si ese día no puede. Un alumno solo puede tener una clase individual al día.
      </p>

      {clases && clases.length === 0 && (
        <div style={{ padding: 20, background: 'color-mix(in oklab, var(--orange) 8%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--orange) 30%, var(--line))', borderRadius: 14, fontSize: 14, color: 'var(--ink-2)', display: 'grid', gap: 10, justifyItems: 'start' }}>
          <span>Todavía no hay ninguna clase marcada como <b>individual</b>. Márcala en «Qué clases son individuales» (si no existe, créala antes en <b>Clases y horarios</b> con sus días y horas) y aquí podrás apuntar a los alumnos.</span>
          <button className="btn btn-sm btn-outline" onClick={() => setVistaSpk('clases')}>Marcar clases individuales</button>
        </div>
      )}

      {/* Nueva cita: actividad → clase → día → alumnos */}
      {clases && clases.length > 0 && (
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={etiqueta}>Actividad</span>
            <FiltroActividad actividades={actividades} valor={actId} onCambio={setActId} todas={false} />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={etiqueta} htmlFor="ci-clase">Clase</label>
            <select id="ci-clase" value={claseId} onChange={e => setClaseId(e.target.value)} style={desplegable}>
              {clasesAct.map(c => <option key={c.groupId} value={c.groupId}>{c.name}</option>)}
            </select>
            <label style={etiqueta} htmlFor="ci-dia">Día</label>
            <select id="ci-dia" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...desplegable, textTransform: 'capitalize' }}>
              {fechasValidas.length === 0 && <option value="">Esta clase no tiene días en el horario</option>}
              {fechasValidas.map(f => <option key={f} value={f}>{fmtDia(f)}</option>)}
            </select>
            {sesionDia && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sesionDia.startTime}–{sesionDia.endTime}{sesionDia.aula ? ` · ${sesionDia.aula}` : ''}</span>}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 420 }}>
              <div className="search-input"><I.Search />
                <input placeholder={todoClub ? 'Buscar en todo el club…' : `Alumnos de ${actividad || 'la actividad'}…`} value={q}
                  onChange={e => setQ(e.target.value)} onFocus={() => setFoco(true)} onBlur={() => setTimeout(() => setFoco(false), 150)}
                  aria-label="Buscar alumno para apuntar" />
              </div>
              {foco && (sug.length > 0 || (!buscando && buscado === `${actId}|${q.trim()}|${todoClub}` && (q.trim().length >= 2 || !todoClub))) && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 6, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, marginTop: 2, overflow: 'hidden', maxHeight: 260, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
                  {sug.length === 0 && (
                    <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--ink-3)' }}>
                      {todoClub ? 'Nadie con ese nombre en el club.' : `Nadie de ${actividad} con ese nombre. Prueba «Buscar en todo el club».`}
                    </div>
                  )}
                  {sug.map(s => (
                    <button key={s.id} type="button" onMouseDown={e => { e.preventDefault(); añadir(s); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--line-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)' }}>
                      <b>{s.name}</b>
                      {s.grupos ? <span style={{ color: 'var(--purple)' }}> · {s.grupos}</span> : todoClub ? <span style={{ color: 'var(--ink-3)' }}> · no va a {actividad}</span> : null}
                      {s.email ? <span style={{ color: 'var(--ink-3)' }}> · {s.email}</span> : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={todoClub} onChange={e => setTodoClub(e.target.checked)} />
              Buscar en todo el club
            </label>
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

      {/* Próximas clases individuales, filtrables por actividad */}
      {actividadesProximas.length > 1 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={etiqueta}>Próximas</span>
          <FiltroActividad actividades={actividadesProximas} valor={filtroAct} onCambio={setFiltroAct} />
        </div>
      )}
      {cargando && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
      {!cargando && dias.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          No hay clases individuales próximas.
        </div>
      )}
      {dias.map(clave => {
        const filas = porDia[clave];
        return (
        <div key={clave} style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ textTransform: 'capitalize' }}>{fmtDia(filas[0].fecha)}</span>
            <Actividad nombre={filas[0]?.actividad} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)' }}>{filas[0]?.clase || 'Clase individual'}</span>
          </h3>
          <div className="data-table">
            <div className="data-table-head" style={{ gridTemplateColumns: '1.3fr 140px 1.4fr 190px 120px 60px' }}>
              <span>Alumno</span><span>Franjas</span><span>Contacto familia</span><span>Confirmación</span><span>Secretaría</span><span></span>
            </div>
            {filas.map(s => {
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
                  {/* Si la familia ya ha contestado, que sí (ticket #241) o que no
                      (#406), no hay que llamar. Y si se acabó el plazo sin
                      confirmar, ya no hay nada que hacer. */}
                  {(s.confirmado != null && !s.llamado) || s.perdida ? (
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
        );
      })}
    </div>
  );
}
