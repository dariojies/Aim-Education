import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';
import { fmtFechaLarga, fmtFecha } from '../fechas.js';
import { colorOcupacion } from './AdminTulClases.jsx';
import { COLOR_CUMPLE } from './Shared.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Pasar lista de las clases del día.
//
// Se elige el día, salen las clases que tocan según sus horarios, y al abrir
// una aparecen sus alumnos en columnas para que quepan todos de un vistazo sin
// hacer scroll, igual que en el campamento. Escribe en las mismas tablas que
// Learning Dungeon, así que lo marcado aquí se ve allí y al revés.
// ─────────────────────────────────────────────────────────────────────────────

const hoyISO = () => new Date().toISOString().slice(0, 10);
const enDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// Fecha local (Madrid en los equipos del club) como 'AAAA-MM-DD', sin el salto de
// día de toISOString (que es UTC).
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// El próximo día (a partir de mañana) en que toca esa clase, según sus días de la
// semana (convención aim-tul: 0 = lunes). Para proponerlo como devolución (#244).
const proximoDiaClase = (days) => {
  if (!Array.isArray(days) || !days.length) return enDias(7);
  const d = new Date();
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + 1);
    if (days.includes((d.getDay() + 6) % 7)) return isoLocal(d);
  }
  return enDias(7);
};
const fmtDiaCorto = (d) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';

const ESTADOS = [
  ['present', 'Vino', 'var(--teal)'],
  ['late', 'Tarde', '#FFD526'],
  ['absent', 'Faltó', 'var(--orange)'],
];

export default function PasarListaClases({ showToast }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [clases, setClases] = useState([]);
  const [clase, setClase] = useState(null);
  const [alumnos, setAlumnos] = useState([]);
  const [meta, setMeta] = useState({}); // { speaking, noVienen, bonoModo } de la lista abierta
  const [cargando, setCargando] = useState(true);
  // Añadir alumnos con bono (ticket #245).
  const [buscaBono, setBuscaBono] = useState(false);
  const [qBono, setQBono] = useState('');
  const [bonosSug, setBonosSug] = useState([]);

  const cargarClases = useCallback(async (f) => {
    setCargando(true);
    try {
      const r = await fetch(`/api/admin/tul/attendance/dia/${f}`, { credentials: 'include' });
      if (r.ok) setClases((await r.json()).clases || []);
    } catch { /* noop */ }
    finally { setCargando(false); }
  }, []);

  const cargarAlumnos = useCallback(async (groupId, f) => {
    try {
      const r = await fetch(`/api/admin/tul/groups/${groupId}/attendance/${f}`, { credentials: 'include', cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        setAlumnos(d.alumnos || []);
        setMeta({ speaking: !!d.speaking, noVienen: d.noVienen || 0, bonoModo: d.bonoModo || 'no' });
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => { cargarClases(fecha); setClase(null); setAlumnos([]); setMeta({}); }, [fecha, cargarClases]);

  async function marcar(alumno, status) {
    // Se pinta al momento; si el guardado falla, se recarga y vuelve a lo real.
    setAlumnos(prev => prev.map(a => a.id === alumno.id ? { ...a, status, isAuto: false } : a));
    // Los que vienen por bono sin reserva (no matriculados ese día) van por su
    // endpoint, que además gasta o devuelve una clase del bono según el estado
    // (ticket #245). Con plaza reservada la clase ya se gastó al reservar (#253).
    const porBono = alumno.esMiembro === false && !alumno.reservaId;
    const url = porBono
      ? `/api/admin/tul/groups/${clase.id}/attendance/bono`
      : `/api/admin/tul/groups/${clase.id}/attendance`;
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ studentId: alumno.id, fecha, status }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'No se pudo guardar.'); await cargarAlumnos(clase.id, fecha); }
      else if (porBono) { await cargarAlumnos(clase.id, fecha); } // refresca las clases que le quedan
    } catch { alert('Error de conexión.'); await cargarAlumnos(clase.id, fecha); }
  }

  async function marcarTodos(status) {
    const sinMarcar = alumnos.filter(a => !a.status).length;
    if (!sinMarcar) { alert('Ya están todos marcados.'); return; }
    try {
      const r = await fetch(`/api/admin/tul/groups/${clase.id}/attendance/todos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ fecha, status }),
      });
      const d = await r.json();
      if (r.ok) {
        await cargarAlumnos(clase.id, fecha); await cargarClases(fecha);
        showToast?.(`${d.marcados} alumno(s) marcados.`);
      } else alert(d.error || 'No se pudo guardar.');
    } catch { alert('Error de conexión.'); }
  }

  // Buscar alumnos con bono de la actividad de esta clase (ticket #245).
  useEffect(() => {
    if (!clase || !buscaBono) { setBonosSug([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/tul/groups/${clase.id}/bonos?fecha=${fecha}&q=${encodeURIComponent(qBono.trim())}`, { credentials: 'include', cache: 'no-store' })
        .then(r => r.ok ? r.json() : { bonos: [] }).then(d => setBonosSug(d.bonos || [])).catch(() => { });
    }, 200);
    return () => clearTimeout(t);
  }, [qBono, clase, buscaBono, fecha]);

  // Un día que aún no ha llegado se le reserva la plaza (#253); el día de la clase
  // o uno pasado, se le marca que ha venido y se gasta la clase (#245).
  const esFuturo = fecha > isoLocal(new Date());
  async function añadirBono(b) {
    const r = esFuturo
      ? await fetch(`/api/admin/tul/groups/${clase.id}/bono-reservas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ studentId: b.studentId, fecha }),
      })
      : await fetch(`/api/admin/tul/groups/${clase.id}/attendance/bono`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ studentId: b.studentId, fecha, status: 'present' }),
      });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      showToast?.(`${b.nombre}: ${esFuturo ? 'plaza reservada' : 'añadido'} con bono${d.restantes != null ? ` · le quedan ${d.restantes} clase${d.restantes === 1 ? '' : 's'}` : ''}.`);
      setQBono(''); setBonosSug([]); setBuscaBono(false); await cargarAlumnos(clase.id, fecha);
    } else alert(d.error || 'No se pudo añadir.');
  }

  async function quitarReserva(a) {
    if (!window.confirm(`¿Quitar la plaza reservada de ${a.nombre}? Se le devuelve la clase al bono.`)) return;
    const r = await fetch(`/api/admin/tul/bono-reservas/${a.reservaId}/cancelar`, { method: 'POST', credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { showToast?.('Reserva quitada y clase devuelta al bono.'); await cargarAlumnos(clase.id, fecha); }
    else alert(d.error || 'No se pudo quitar.');
  }

  function moverDia(delta) {
    const d = new Date(fecha + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setFecha(d.toISOString().slice(0, 10));
  }

  function imprimir() {
    if (!clase || !alumnos.length) return;
    const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const filas = alumnos.map(a => `
      <tr><td>${esc(a.nombre)}</td><td>${esc(a.cinturon || '')}</td>
      <td class="c">${a.status === 'present' ? '✓' : ''}</td>
      <td class="c">${a.status === 'late' ? '✓' : ''}</td>
      <td class="c">${a.status === 'absent' ? '✓' : ''}</td></tr>`).join('');
    const html = `
      <style>
        #print-lista { font-family: sans-serif; color: #222; padding: 24px; }
        #print-lista h1 { color: #5233A8; border-bottom: 2px solid #5233A8; padding-bottom: 8px; margin: 0 0 4px; font-size: 20px; }
        #print-lista .meta { color: #666; font-size: 12px; margin: 0 0 16px; }
        #print-lista table { width: 100%; border-collapse: collapse; font-size: 13px; }
        #print-lista th { text-align: left; background: #f3f0fa; color: #5233A8; padding: 6px 8px; border-bottom: 2px solid #5233A8; }
        #print-lista td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; }
        #print-lista .c { text-align: center; width: 60px; }
      </style>
      <h1>${esc(clase.activityName)} · ${esc(clase.name)}</h1>
      <p class="meta">${fmtFechaLarga(fecha + 'T12:00:00')} · ${esc(clase.horario)}${clase.instructor ? ` · ${esc(clase.instructor)}` : ''}</p>
      <table><thead><tr><th>Alumno</th><th>Cinturón</th><th class="c">Vino</th><th class="c">Tarde</th><th class="c">Faltó</th></tr></thead>
      <tbody>${filas}</tbody></table>`;
    const style = document.createElement('style');
    style.id = 'print-lista-style';
    style.innerHTML = `@media print { body > *:not(#print-lista) { display: none !important; } #print-lista { display: block !important; } }`;
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.id = 'print-lista';
    el.style.display = 'none';
    el.innerHTML = html;
    document.body.appendChild(el);
    window.print();
    setTimeout(() => {
      document.getElementById('print-lista-style')?.remove();
      document.getElementById('print-lista')?.remove();
    }, 1000);
  }

  const presentes = alumnos.filter(a => a.status === 'present' || a.status === 'late').length;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-icon" onClick={() => moverDia(-1)} aria-label="Día anterior">‹</button>
        <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)}
          style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' }} />
        <button className="btn btn-icon" onClick={() => moverDia(1)} aria-label="Día siguiente">›</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'capitalize' }}>{fmtFechaLarga(fecha + 'T12:00:00')}</span>
        {fecha !== hoyISO() && <button className="btn btn-sm btn-outline" onClick={() => setFecha(hoyISO())}>Hoy</button>}
      </div>

      {!clase && (
        <>
          {cargando && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
          {!cargando && !clases.length && (
            <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
              Ese día no hay clases en el horario.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {clases.map(c => (
              <div key={c.id} onClick={() => { setClase(c); cargarAlumnos(c.id, fecha); }}
                style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-sm)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.activityName} · {c.horario}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: colorOcupacion(c.studentCount, c.maxStudents) }}>
                    {c.studentCount}{c.maxStudents ? `/${c.maxStudents}` : ''}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>alumno{c.studentCount !== 1 ? 's' : ''}</span>
                  {c.marcados > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: c.marcados >= c.studentCount ? 'var(--teal)' : 'var(--ink-3)' }}>
                      {c.marcados >= c.studentCount ? '✓ lista pasada' : `${c.marcados}/${c.studentCount} marcados`}
                    </span>
                  )}
                  {c.instructor && <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 'auto' }}>{c.instructor}</span>}
                </div>
                {c.speaking && (
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                    Speaking: {c.speaking.si} confirmado{c.speaking.si !== 1 ? 's' : ''}{c.speaking.pendientes ? ` · ${c.speaking.pendientes} sin contestar` : ''}{c.speaking.no ? ` · ${c.speaking.no} no vienen` : ''}
                  </div>
                )}
                {c.bonoModo && c.bonoModo !== 'no' && (c.bonoReservas > 0 || c.bonoLibres != null) && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)', marginTop: 4 }}>
                    🎫 {c.bonoReservas} con bono{c.bonoLibres != null ? ` · ${c.bonoLibres} plaza${c.bonoLibres !== 1 ? 's' : ''} libre${c.bonoLibres !== 1 ? 's' : ''}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {clase && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-outline" onClick={() => { setClase(null); cargarClases(fecha); setBuscaBono(false); setQBono(''); }}>← Clases del día</button>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{clase.name}</h3>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{clase.activityName} · {clase.horario}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal)' }}>{presentes}/{alumnos.length} presentes</span>
            <div style={{ flex: 1 }} />
            {ESTADOS.map(([v, l]) => (
              <button key={v} className="btn btn-sm btn-outline" onClick={() => marcarTodos(v)} title={`Marcar "${l}" a los que falten por marcar`}>
                Todos: {l}
              </button>
            ))}
            {!meta.speaking && meta.bonoModo !== 'no' && (
              <button className="btn btn-sm btn-outline" onClick={() => { setBuscaBono(v => !v); setQBono(''); }}
                title={esFuturo ? 'Reservar plaza a alguien con bono ese día' : 'Añadir un alumno con bono válido para esta clase'}>
                🎫 {esFuturo ? 'Reservar con bono' : 'Con bono'}
              </button>
            )}
            <button className="btn btn-sm btn-outline" onClick={imprimir} disabled={!alumnos.length}><I.Print /> Imprimir</button>
          </div>

          {/* Añadir alguien con bono de esta actividad (ticket #245): solo salen los
              que tienen bono de la actividad de esta clase, con las clases que les
              quedan. Al elegirlo se le marca "Vino" y se le gasta una clase. */}
          {buscaBono && (
            <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'grid', gap: 8, maxWidth: 460 }}>
              <input autoFocus placeholder="Buscar alumno con bono..." value={qBono} onChange={e => setQBono(e.target.value)}
                style={{ fontFamily: 'inherit', fontSize: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }} />
              {bonosSug.length === 0 && <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Nadie con un bono válido para esta clase{meta.bonoModo === 'adultos' ? ` (de ${clase.activityName} o de adultos)` : ` (de ${clase.activityName})`}{qBono.trim() ? ' con ese nombre' : ''}.</p>}
              {esFuturo && <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-3)' }}>Se le reserva la plaza de ese día y se le gasta ya la clase del bono (si se quita la reserva, se le devuelve).</p>}
              {bonosSug.map(b => (
                <button key={b.bonoId} type="button" onClick={() => añadirBono(b)}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', padding: '8px 12px', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)' }}>
                  <b>{b.nombre}</b>
                  <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 800 }}>{b.ambito === 'adultos' ? 'Bono adultos · ' : ''}{b.restantes}/{b.total} clases</span>
                </button>
              ))}
            </div>
          )}

          {/* Mascota de la clase (ticket #244): se gestiona aquí mismo, sin cambiar
              de pantalla — asignar peluche, sortear a quién le toca, prestar y
              marcar devolución. */}
          <MascotaPasarLista groupId={clase.id} alumnos={alumnos} showToast={showToast} />

          {meta.speaking && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
              Clase de Speaking: la lista es la de quienes han aceptado la clase de este día.{meta.noVienen ? ` ${meta.noVienen} ${meta.noVienen === 1 ? 'ha dicho' : 'han dicho'} que no ${meta.noVienen === 1 ? 'viene' : 'vienen'}.` : ''}
            </p>
          )}
          {!alumnos.length && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{meta.speaking ? 'Nadie ha confirmado todavía para este día.' : 'Esta clase no tiene alumnos matriculados.'}</p>}
          {/* En columnas para que quepan todos de un vistazo. En Speaking, primero los
              confirmados y aparte los que aún no han contestado (#253). */}
          {(meta.speaking
            ? [['Confirmados', alumnos.filter(a => a.speaking !== 'pendiente')], ['Sin contestar (por si vienen)', alumnos.filter(a => a.speaking === 'pendiente')]]
            : [[null, alumnos]]
          ).filter(([, lista]) => lista.length).map(([titulo, lista]) => (
            <div key={titulo || 'todos'} style={{ display: 'grid', gap: 8 }}>
              {titulo && meta.speaking && <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-2)' }}>{titulo} ({lista.length})</div>}
              <div className="camp-card-grid">
                {lista.map(a => <TarjetaAlumno key={a.id} a={a} onMarcar={marcar} onQuitarReserva={quitarReserva} />)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// Un alumno en la lista del día, con sus marcas: cumpleaños, viene con bono (o
// tiene la plaza reservada), de baja hasta fin de mes o Speaking confirmado.
function TarjetaAlumno({ a, onMarcar, onQuitarReserva }) {
  return (
    <div style={{ background: 'var(--bg-2)', border: `1px solid ${a.reservaId ? 'color-mix(in oklab, var(--purple) 35%, var(--line))' : 'var(--line)'}`, borderRadius: 12, padding: '10px 12px', display: 'grid', gap: 8 }}>
      <div>
        <div style={{ fontWeight: a.cumpleHoy ? 800 : 700, fontSize: 13, color: a.cumpleHoy ? COLOR_CUMPLE : (a.status === 'absent' ? 'var(--ink-3)' : 'var(--ink)'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {a.cumpleHoy && <span title="¡Hoy es su cumpleaños!" style={{ marginRight: 3 }}>👑</span>}{a.nombre}{a.cumpleHoy && ' 🎂'}
        </div>
        {a.cinturon && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{a.cinturon}</div>}
        {/* Salud (ticket #254): alergias y demás, a la vista de quien da la clase. */}
        {a.salud && (
          <div title={a.salud} style={{ fontSize: 10, fontWeight: 800, color: 'var(--orange)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ⚕ {a.salud}
          </div>
        )}
        {a.reservaId ? (
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--purple)', display: 'flex', gap: 6, alignItems: 'center' }}>
            🎫 plaza con bono{a.reservaOrigen === 'familia' ? ' (reservada por la familia)' : ''}
            {onQuitarReserva && <button onClick={() => onQuitarReserva(a)} style={{ fontSize: 10, background: 'none', border: 0, padding: 0, color: 'var(--ink-3)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>quitar</button>}
          </div>
        ) : a.esMiembro === false && (
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--purple)' }}>
            🎫 bono{a.bonoRestantes != null ? ` · ${a.bonoRestantes} rest.` : ''}
          </div>
        )}
        {a.deBaja && (
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--orange)' }} title="Se dio de baja con el mes ya pagado: tiene la clase hasta fin de mes">
            De baja{a.deBaja.desde ? ` el ${fmtDiaCorto(a.deBaja.desde)}` : ''} · hasta fin de mes
          </div>
        )}
        {a.speaking === 'si' && <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--teal)' }}>✓ confirmado{a.franjas ? ` · ${a.franjas}` : ''}</div>}
        {a.speaking === 'pendiente' && <div style={{ fontSize: 10, fontWeight: 800, color: '#b45309' }}>sin contestar{a.franjas ? ` · ${a.franjas}` : ''}</div>}
        {a.speaking === 'no' && <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--orange)' }}>dijo que no venía</div>}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {ESTADOS.map(([v, l, color]) => {
          const on = a.status === v;
          return (
            <button key={v} onClick={() => onMarcar(a, v)}
              style={{
                flex: 1, minWidth: 0, padding: '5px 0', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 11, fontWeight: 800,
                border: `1px solid ${on ? color : 'var(--line)'}`,
                background: on ? color : 'var(--bg-3)',
                color: on ? (v === 'late' ? '#000' : 'white') : 'var(--ink-3)',
              }}>{l}</button>
          );
        })}
      </div>
      {a.isAuto && a.status && (
        <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>marcado automáticamente</div>
      )}
    </div>
  );
}

// Mascota de la clase dentro del "pasar lista" (ticket #244). Se gestiona sin
// salir de la pantalla: asignar el peluche a la clase, sortear a quién le toca
// (prioriza a quien menos se lo ha llevado), prestarlo con fecha de devolución y
// marcar la devolución. Los alumnos salen de la lista ya cargada.
function MascotaPasarLista({ groupId, alumnos, showToast }) {
  const [mascota, setMascota] = useState(undefined); // undefined = cargando · null = no hay
  const [nombre, setNombre] = useState('');
  const [sel, setSel] = useState('');
  const [fechaDev, setFechaDev] = useState(enDias(7));
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/groups/${groupId}/mascota`, { credentials: 'include', cache: 'no-store' });
      if (r.ok) {
        const m = (await r.json()).mascota;
        setMascota(m);
        // Fecha de devolución propuesta: el próximo día que haya esta clase (#244).
        if (m && !m.actual) setFechaDev(proximoDiaClase(m.sessionDays));
      }
    } catch { /* noop */ }
  }, [groupId]);
  useEffect(() => { setMascota(undefined); setSel(''); setFechaDev(enDias(7)); setCreando(false); cargar(); }, [groupId, cargar]);

  async function crear() {
    const r = await fetch('/api/admin/mascotas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ groupId, nombre }),
    });
    if (r.ok) { setNombre(''); setCreando(false); showToast?.('Mascota asignada a la clase.'); cargar(); }
    else alert((await r.json()).error || 'No se pudo.');
  }
  async function sortear() {
    const r = await fetch(`/api/admin/mascotas/${mascota.id}/sugerencia`, { credentials: 'include', cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) return alert(d.error || 'No se pudo sortear.');
    setSel(d.sugerido.studentId);
    showToast?.(`Le toca a ${d.sugerido.alumno}${d.veces > 0 ? ` (se la ha llevado ${d.veces} ${d.veces === 1 ? 'vez' : 'veces'})` : ' (aún no se la ha llevado)'}.`);
  }
  async function prestar() {
    if (!sel) return alert('Elige a quién se la lleva o pulsa Sortear.');
    const r = await fetch(`/api/admin/mascotas/${mascota.id}/prestar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ studentId: sel, devolverAntes: fechaDev || null }),
    });
    if (r.ok) { setSel(''); showToast?.('¡El peluche se va a casa!'); cargar(); }
    else alert((await r.json()).error || 'No se pudo.');
  }
  async function devolver() {
    const r = await fetch(`/api/admin/mascotas/${mascota.id}/devolver`, { method: 'POST', credentials: 'include' });
    if (r.ok) { showToast?.('Devuelta. Ya puede llevársela otro.'); cargar(); }
    else alert((await r.json()).error || 'No se pudo.');
  }

  if (mascota === undefined) return null; // cargando: no estorba

  const marco = { background: 'color-mix(in oklab, var(--purple) 5%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--purple) 25%, var(--line))', borderRadius: 12, padding: '10px 14px' };

  // No hay mascota todavía: ofrecer asignarla sin salir de aquí.
  if (mascota === null) {
    return (
      <div style={{ ...marco, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18 }}>🧸</span>
        {!creando ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Esta clase no tiene mascota.</span>
            <button className="btn btn-sm btn-outline" onClick={() => setCreando(true)}>Añadir mascota</button>
          </>
        ) : (
          <>
            <input placeholder="Nombre del peluche (opcional)" value={nombre} onChange={e => setNombre(e.target.value)}
              style={{ fontFamily: 'inherit', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }} />
            <button className="btn btn-sm btn-primary" onClick={crear}>Guardar</button>
            <button className="btn btn-sm btn-outline" onClick={() => setCreando(false)}>Cancelar</button>
          </>
        )}
      </div>
    );
  }

  // veces por alumno (para ordenar el selector: primero los que menos).
  const vecesDe = {};
  (mascota.ranking || []).forEach(x => { vecesDe[x.studentId] = x.veces; });
  const opciones = alumnos.map(a => ({ id: a.id, nombre: a.nombre, veces: vecesDe[a.id] ?? 0 }))
    .sort((a, b) => a.veces - b.veces || a.nombre.localeCompare(b.nombre));

  return (
    <div style={{ ...marco, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18 }}>🧸</span>
        <b style={{ fontSize: 14 }}>{mascota.nombre || 'Mascota de clase'}</b>
        {mascota.actual ? (
          <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 999,
            color: mascota.actual.vencido ? 'var(--orange)' : 'var(--teal)',
            background: `color-mix(in oklab, ${mascota.actual.vencido ? 'var(--orange)' : 'var(--teal)'} 12%, var(--bg-2))` }}>
            La tiene {mascota.actual.alumno}{mascota.actual.devolverAntes ? ` · devolver antes de ${fmtDiaCorto(mascota.actual.devolverAntes)}` : ''}{mascota.actual.vencido ? ' · ¡vencido!' : ''}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>En el club</span>
        )}
        <div style={{ flex: 1 }} />
        {mascota.actual && <button className="btn btn-sm btn-primary" onClick={devolver}>Marcar devuelta</button>}
      </div>

      {!mascota.actual && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-sm" style={{ background: 'var(--purple)', color: '#fff' }} onClick={sortear}>🎲 Sortear</button>
          <select value={sel} onChange={e => setSel(e.target.value)}
            style={{ fontFamily: 'inherit', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
            <option value="">Alumno…</option>
            {opciones.map(o => <option key={o.id} value={o.id}>{o.nombre} — {o.veces} {o.veces === 1 ? 'vez' : 'veces'}</option>)}
          </select>
          <label style={{ fontSize: 12, color: 'var(--ink-3)' }}>Devolver antes de</label>
          <input type="date" value={fechaDev} onChange={e => setFechaDev(e.target.value)}
            style={{ fontFamily: 'inherit', fontSize: 13, padding: '6px 9px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }} />
          <button className="btn btn-sm btn-primary" onClick={prestar} disabled={!sel}>Prestar</button>
        </div>
      )}
    </div>
  );
}
