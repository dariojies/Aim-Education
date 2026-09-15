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
  const [cargando, setCargando] = useState(true);

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
      const r = await fetch(`/api/admin/tul/groups/${groupId}/attendance/${f}`, { credentials: 'include' });
      if (r.ok) setAlumnos((await r.json()).alumnos || []);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { cargarClases(fecha); setClase(null); setAlumnos([]); }, [fecha, cargarClases]);

  async function marcar(alumno, status) {
    // Se pinta al momento; si el guardado falla, se recarga y vuelve a lo real.
    setAlumnos(prev => prev.map(a => a.id === alumno.id ? { ...a, status, isAuto: false } : a));
    try {
      const r = await fetch(`/api/admin/tul/groups/${clase.id}/attendance`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ studentId: alumno.id, fecha, status }),
      });
      if (!r.ok) { alert('No se pudo guardar.'); await cargarAlumnos(clase.id, fecha); }
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
              </div>
            ))}
          </div>
        </>
      )}

      {clase && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-outline" onClick={() => { setClase(null); cargarClases(fecha); }}>← Clases del día</button>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{clase.name}</h3>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{clase.activityName} · {clase.horario}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal)' }}>{presentes}/{alumnos.length} presentes</span>
            <div style={{ flex: 1 }} />
            {ESTADOS.map(([v, l]) => (
              <button key={v} className="btn btn-sm btn-outline" onClick={() => marcarTodos(v)} title={`Marcar "${l}" a los que falten por marcar`}>
                Todos: {l}
              </button>
            ))}
            <button className="btn btn-sm btn-outline" onClick={imprimir} disabled={!alumnos.length}><I.Print /> Imprimir</button>
          </div>

          {/* Mascota de la clase (ticket #244): se gestiona aquí mismo, sin cambiar
              de pantalla — asignar peluche, sortear a quién le toca, prestar y
              marcar devolución. */}
          <MascotaPasarLista groupId={clase.id} alumnos={alumnos} showToast={showToast} />

          {!alumnos.length && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Esta clase no tiene alumnos matriculados.</p>}
          {/* En columnas para que quepan todos de un vistazo */}
          <div className="camp-card-grid">
            {alumnos.map(a => (
              <div key={a.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', display: 'grid', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: a.cumpleHoy ? 800 : 700, fontSize: 13, color: a.cumpleHoy ? COLOR_CUMPLE : (a.status === 'absent' ? 'var(--ink-3)' : 'var(--ink)'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.cumpleHoy && <span title="¡Hoy es su cumpleaños!" style={{ marginRight: 3 }}>👑</span>}{a.nombre}{a.cumpleHoy && ' 🎂'}
                  </div>
                  {a.cinturon && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{a.cinturon}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {ESTADOS.map(([v, l, color]) => {
                    const on = a.status === v;
                    return (
                      <button key={v} onClick={() => marcar(a, v)}
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
            ))}
          </div>
        </>
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
      if (r.ok) setMascota((await r.json()).mascota);
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
