import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Lista de clases y Reportes: el menú de gestión de Aim-Tul recreado en nuestra
// interfaz. Mismos flujos y mismos campos (actividades → grupos con sesiones,
// aulas, edades y plazas → alumnos matriculados; y el informe con visión
// general, altas/bajas, churn, gamificación, asistencia y evaluaciones), pero
// con nuestro aspecto y nuestra sesión. Habla con /api/admin/tul/*, que escribe
// en las mismas tablas que la app de Aim-Tul.
// ─────────────────────────────────────────────────────────────────────────────

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']; // índice 0 = lunes, como aim-tul

// Los iconos se guardan con los nombres de MaterialCommunityIcons que usa
// aim-tul (así su app los pinta bien); aquí los mostramos con un emoji.
const ICONOS = [
  ['karate', '🥋'], ['shoe-ballet', '🩰'], ['yoga', '🧘'], ['run', '🏃'], ['soccer', '⚽'],
  ['basketball', '🏀'], ['tennis', '🎾'], ['swim', '🏊'], ['bike', '🚴'], ['boxing-glove', '🥊'],
  ['palette', '🎨'], ['music', '🎵'], ['robot', '🤖'], ['translate', '🗣️'], ['weight-lifter', '🏋️'],
  ['dumbbell', '💪'], ['human-handsup', '🙌'], ['meditation', '🧘‍♀️'], ['sword-cross', '⚔️'], ['shield-half-full', '🛡️'],
];
const emojiDe = (icon) => (ICONOS.find(([n]) => n === icon) || [null, '🏃'])[1];

const TIPOS_ACTIVIDAD = [
  ['general', 'General'], ['taekwondo_itf', 'Taekwondo ITF'], ['ingles', 'Inglés'], ['ballet', 'Ballet'],
];

async function api(url, opts = {}) {
  const r = await fetch(`/api/admin/tul${url}`, {
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Error de conexión.');
  return d;
}

function resumenSesiones(g) {
  const ses = Array.isArray(g.sessions) ? g.sessions : [];
  if (!ses.length) return g.time || 'Sin horario';
  return ses.map(s => {
    const dias = (s.days || []).map(d => DIAS[d] ?? d).join('');
    return `${dias} ${s.startTime || ''}${s.endTime ? `–${s.endTime}` : ''}${s.aulaName ? ` · ${s.aulaName}` : ''}`;
  }).join('  |  ');
}

const inputCss = { fontFamily: 'inherit', fontSize: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', minWidth: 0 };
const modalFondo = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const modalCaja = { background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 24 };

// ═════════════════════════════════════════════════════════════════════════════
// LISTA DE CLASES: actividades → grupos → alumnos
// ═════════════════════════════════════════════════════════════════════════════
export function ListaClases({ showToast }) {
  const [actividades, setActividades] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [aulas, setAulas] = useState([]);
  const [instructores, setInstructores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actividad, setActividad] = useState(null);   // actividad abierta (nivel 2)
  const [grupoAlumnos, setGrupoAlumnos] = useState(null); // grupo abierto (nivel 3)

  const [editAct, setEditAct] = useState(null);   // { id?, name, icon, activityType }
  const [editGrupo, setEditGrupo] = useState(null); // { id?, name, maxStudents, minAge, maxAge, sessions[] }
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [a, g, au, ins] = await Promise.all([
        api('/activities'), api('/groups'), api('/aulas'), api('/instructors'),
      ]);
      setActividades(a.activities || []);
      setGrupos(g.groups || []);
      setAulas(au.aulas || []);
      setInstructores(ins.instructors || []);
    } catch (e) { alert(e.message); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardarActividad() {
    if (!editAct.name?.trim()) { alert('Ponle nombre a la actividad.'); return; }
    setGuardando(true);
    try {
      if (editAct.id) await api(`/activities/${editAct.id}`, { method: 'PUT', body: editAct });
      else await api('/activities', { method: 'POST', body: editAct });
      setEditAct(null); await cargar();
      showToast?.('Actividad guardada.');
    } catch (e) { alert(e.message); }
    finally { setGuardando(false); }
  }

  async function borrarActividad(a) {
    const n = grupos.filter(g => g.activityId === a.id).length;
    if (!window.confirm(`¿Eliminar la actividad "${a.name}"${n ? ` y sus ${n} grupo(s)` : ''}?\nEsto también desaparece de la app de Aim-Tul.`)) return;
    try { await api(`/activities/${a.id}`, { method: 'DELETE' }); await cargar(); showToast?.('Actividad eliminada.'); }
    catch (e) { alert(e.message); }
  }

  async function guardarGrupo() {
    if (!editGrupo.name?.trim()) { alert('Ponle nombre al grupo.'); return; }
    setGuardando(true);
    try {
      const body = { ...editGrupo, activityId: actividad.id, time: resumenHorario(editGrupo.sessions) };
      if (editGrupo.id) await api(`/groups/${editGrupo.id}`, { method: 'PUT', body });
      else await api('/groups', { method: 'POST', body });
      setEditGrupo(null); await cargar();
      showToast?.('Grupo guardado.');
    } catch (e) { alert(e.message); }
    finally { setGuardando(false); }
  }

  // El campo "time" en texto es lo que muestra aim-tul en listados antiguos.
  function resumenHorario(sessions) {
    return (sessions || []).map(s => `${(s.days || []).map(d => DIAS[d]).join('')} ${s.startTime || ''}${s.endTime ? `-${s.endTime}` : ''}`).join(', ');
  }

  async function borrarGrupo(g) {
    if (!window.confirm(`¿Eliminar el grupo "${g.name}"? Sus ${g.studentCount} alumno(s) quedarán sin matrícula en él.`)) return;
    try { await api(`/groups/${g.id}`, { method: 'DELETE' }); await cargar(); showToast?.('Grupo eliminado.'); }
    catch (e) { alert(e.message); }
  }

  // ── Nivel 3: alumnos del grupo ──
  if (grupoAlumnos) {
    return <AlumnosDeGrupo grupo={grupoAlumnos} onVolver={() => { setGrupoAlumnos(null); cargar(); }} showToast={showToast} />;
  }

  // ── Nivel 2: grupos de una actividad ──
  if (actividad) {
    const propios = grupos.filter(g => g.activityId === actividad.id);
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-outline" onClick={() => setActividad(null)}>← Actividades</button>
          <span style={{ fontSize: 22 }}>{emojiDe(actividad.icon)}</span>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{actividad.name}</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{propios.length} grupo{propios.length !== 1 ? 's' : ''}</span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sm btn-primary" onClick={() => setEditGrupo({ name: '', maxStudents: '', minAge: '', maxAge: '', sessions: [] })}><I.Plus /> Nuevo grupo</button>
        </div>
        {!propios.length && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Esta actividad aún no tiene grupos.</p>}
        <div style={{ display: 'grid', gap: 10 }}>
          {propios.map(g => (
            <div key={g.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{g.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{resumenSesiones(g)}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>
                  {g.studentCount}{g.maxStudents ? `/${g.maxStudents}` : ''} alumnos
                  {(g.minAge || g.maxAge) ? ` · ${g.minAge ?? '¿'}–${g.maxAge ?? '?'} años` : ''}
                </div>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setGrupoAlumnos({ ...g, actividadNombre: actividad.name })}><I.Users /> Alumnos</button>
              <button className="icon-btn" title="Editar" onClick={() => setEditGrupo({ id: g.id, name: g.name, maxStudents: g.maxStudents ?? '', minAge: g.minAge ?? '', maxAge: g.maxAge ?? '', sessions: Array.isArray(g.sessions) ? g.sessions.map(s => ({ ...s })) : [] })}><I.Edit /></button>
              <button className="icon-btn danger" title="Eliminar" onClick={() => borrarGrupo(g)}><I.Trash /></button>
            </div>
          ))}
        </div>

        {editGrupo && (
          <div style={modalFondo} onClick={e => { if (e.target === e.currentTarget) setEditGrupo(null); }}>
            <div style={{ ...modalCaja, maxWidth: 640 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>{editGrupo.id ? 'Editar grupo' : `Nuevo grupo de ${actividad.name}`}</h3>
              <div style={{ display: 'grid', gap: 14 }}>
                <div className="field"><label>Nombre del grupo</label>
                  <input value={editGrupo.name} onChange={e => setEditGrupo(x => ({ ...x, name: e.target.value }))} placeholder="Ej. Movers 2" /></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
                  <div className="field"><label>Plazas (máx.)</label>
                    <input type="number" min="1" value={editGrupo.maxStudents} onChange={e => setEditGrupo(x => ({ ...x, maxStudents: e.target.value }))} placeholder="Sin límite" /></div>
                  <div className="field"><label>Edad mínima</label>
                    <input type="number" min="0" value={editGrupo.minAge} onChange={e => setEditGrupo(x => ({ ...x, minAge: e.target.value }))} /></div>
                  <div className="field"><label>Edad máxima</label>
                    <input type="number" min="0" value={editGrupo.maxAge} onChange={e => setEditGrupo(x => ({ ...x, maxAge: e.target.value }))} /></div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>Sesiones semanales</span>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditGrupo(x => ({ ...x, sessions: [...(x.sessions || []), { days: [], startTime: '16:00', endTime: '17:00', aulaId: null, aulaName: null, instructorId: null, instructorName: null }] }))}>+ Añadir sesión</button>
                  </div>
                  {!(editGrupo.sessions || []).length && <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>Sin sesiones: el grupo no aparecerá en el horario semanal.</p>}
                  <div style={{ display: 'grid', gap: 10 }}>
                    {(editGrupo.sessions || []).map((s, i) => (
                      <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'grid', gap: 10, background: 'var(--bg-3)' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          {DIAS.map((d, di) => {
                            const on = (s.days || []).includes(di);
                            return (
                              <button key={di} type="button" onClick={() => setEditGrupo(x => {
                                const ses = [...x.sessions];
                                const days = new Set(ses[i].days || []);
                                on ? days.delete(di) : days.add(di);
                                ses[i] = { ...ses[i], days: [...days].sort((a, b) => a - b) };
                                return { ...x, sessions: ses };
                              })}
                                style={{ width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 12, border: `1px solid ${on ? 'var(--purple)' : 'var(--line)'}`, background: on ? 'var(--purple)' : 'var(--bg-2)', color: on ? 'white' : 'var(--ink-3)' }}>{d}</button>
                            );
                          })}
                          <div style={{ flex: 1 }} />
                          <button type="button" className="icon-btn danger" title="Quitar sesión" onClick={() => setEditGrupo(x => ({ ...x, sessions: x.sessions.filter((_, j) => j !== i) }))}><I.Trash /></button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                          <input type="time" value={s.startTime || ''} style={inputCss} onChange={e => setEditGrupo(x => { const ses = [...x.sessions]; ses[i] = { ...ses[i], startTime: e.target.value }; return { ...x, sessions: ses }; })} />
                          <input type="time" value={s.endTime || ''} style={inputCss} onChange={e => setEditGrupo(x => { const ses = [...x.sessions]; ses[i] = { ...ses[i], endTime: e.target.value }; return { ...x, sessions: ses }; })} />
                          <select value={s.aulaId || ''} style={inputCss} onChange={e => setEditGrupo(x => {
                            const aula = aulas.find(a => a.id === e.target.value) || null;
                            const ses = [...x.sessions]; ses[i] = { ...ses[i], aulaId: aula?.id || null, aulaName: aula?.name || null }; return { ...x, sessions: ses };
                          })}>
                            <option value="">Sin aula</option>
                            {aulas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                          <select value={s.instructorId || ''} style={inputCss} onChange={e => setEditGrupo(x => {
                            const ins = instructores.find(a => a.id === e.target.value) || null;
                            const ses = [...x.sessions]; ses[i] = { ...ses[i], instructorId: ins?.id || null, instructorName: ins?.name || null }; return { ...x, sessions: ses };
                          })}>
                            <option value="">Sin monitor</option>
                            {instructores.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline" onClick={() => setEditGrupo(null)}>Cancelar</button>
                  <button className="btn btn-primary" disabled={guardando} onClick={guardarGrupo}>{guardando ? 'Guardando...' : 'Guardar grupo'}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Nivel 1: actividades ──
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Actividades del club</h3>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Lo que toques aquí cambia también en la app de Aim-Tul.</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-primary" onClick={() => setEditAct({ name: '', icon: 'run', activityType: 'general' })}><I.Plus /> Nueva actividad</button>
      </div>
      {cargando && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {actividades.map(a => {
          const n = grupos.filter(g => g.activityId === a.id);
          const alumnos = n.reduce((s, g) => s + Number(g.studentCount || 0), 0);
          return (
            <div key={a.id} onClick={() => setActividad(a)}
              style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-sm)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
              <span style={{ fontSize: 28 }}>{emojiDe(a.icon)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {n.length} grupo{n.length !== 1 ? 's' : ''} · {alumnos} matrícula{alumnos !== 1 ? 's' : ''}
                  {a.activityType && a.activityType !== 'general' ? ` · ${(TIPOS_ACTIVIDAD.find(([v]) => v === a.activityType) || [])[1] || a.activityType}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                <button className="icon-btn" title="Editar" onClick={() => setEditAct({ id: a.id, name: a.name, icon: a.icon, activityType: a.activityType || 'general' })}><I.Edit /></button>
                <button className="icon-btn danger" title="Eliminar" onClick={() => borrarActividad(a)}><I.Trash /></button>
              </div>
            </div>
          );
        })}
      </div>

      {editAct && (
        <div style={modalFondo} onClick={e => { if (e.target === e.currentTarget) setEditAct(null); }}>
          <div style={{ ...modalCaja, maxWidth: 520 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>{editAct.id ? 'Editar actividad' : 'Nueva actividad'}</h3>
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="field"><label>Nombre</label>
                <input value={editAct.name} onChange={e => setEditAct(x => ({ ...x, name: e.target.value }))} placeholder="Ej. Robótica" autoFocus /></div>
              <div className="field"><label>Icono</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ICONOS.map(([nombre, emoji]) => (
                    <button key={nombre} type="button" onClick={() => setEditAct(x => ({ ...x, icon: nombre }))}
                      title={nombre}
                      style={{ width: 40, height: 40, fontSize: 20, borderRadius: 10, cursor: 'pointer', border: `2px solid ${editAct.icon === nombre ? 'var(--purple)' : 'var(--line)'}`, background: editAct.icon === nombre ? 'color-mix(in oklab, var(--purple) 12%, var(--bg-2))' : 'var(--bg-2)' }}>{emoji}</button>
                  ))}
                </div>
              </div>
              <div className="field"><label>Tipo (condiciona niveles y evaluaciones en Aim-Tul)</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {TIPOS_ACTIVIDAD.map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setEditAct(x => ({ ...x, activityType: v }))}
                      style={{ padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, border: '1px solid var(--line)', background: editAct.activityType === v ? 'var(--purple)' : 'var(--bg-3)', color: editAct.activityType === v ? 'white' : 'var(--ink-2)' }}>{l}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setEditAct(null)}>Cancelar</button>
                <button className="btn btn-primary" disabled={guardando} onClick={guardarActividad}>{guardando ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Nivel 3: alumnos matriculados en un grupo ──
function AlumnosDeGrupo({ grupo, onVolver, showToast }) {
  const [alumnos, setAlumnos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');
  const [sug, setSug] = useState([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setAlumnos((await api(`/groups/${grupo.id}/students`)).students || []); }
    catch (e) { alert(e.message); }
    finally { setCargando(false); }
  }, [grupo.id]);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (q.trim().length < 2) { setSug([]); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const d = await api(`/students?q=${encodeURIComponent(q.trim())}`);
        if (vivo) setSug((d.students || []).filter(s => !alumnos.some(a => a.id === s.id)));
      } catch { /* noop */ }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, alumnos]);

  async function matricular(s) {
    try {
      await api(`/groups/${grupo.id}/students/enroll`, { method: 'POST', body: { studentId: s.id } });
      setQ(''); setSug([]); await cargar();
      showToast?.(`${s.name} matriculado en ${grupo.name}.`);
    } catch (e) { alert(e.message); }
  }

  async function darBaja(s) {
    if (!window.confirm(`¿Dar de baja a ${s.name} del grupo ${grupo.name}?\nQuedará registrado en el histórico de altas y bajas.`)) return;
    try {
      await api(`/groups/${grupo.id}/students/${s.id}/enroll`, { method: 'DELETE' });
      await cargar();
      showToast?.(`${s.name} dado de baja.`);
    } catch (e) { alert(e.message); }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-outline" onClick={onVolver}>← {grupo.actividadNombre}</button>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{grupo.name}</h3>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {alumnos.length}{grupo.maxStudents ? `/${grupo.maxStudents}` : ''} alumnos
        </span>
      </div>

      <div style={{ position: 'relative', maxWidth: 420 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar alumno del club para matricular..."
          style={{ ...inputCss, width: '100%' }} />
        {sug.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, marginTop: 2, overflow: 'hidden', maxHeight: 240, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
            {sug.map(s => (
              <button key={s.id} type="button" onClick={() => matricular(s)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--line-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                <b>{s.name}</b><span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>{s.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {cargando && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
      {!cargando && !alumnos.length && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Este grupo no tiene alumnos todavía.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {alumnos.map(s => (
          <div key={s.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{s.email}{s.beltName ? ` · ${s.beltName}` : ''}</div>
            </div>
            <button className="btn btn-sm btn-outline" style={{ color: 'var(--orange)' }} onClick={() => darBaja(s)}>Dar de baja</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// REPORTES: el informe completo de Aim-Tul con los datos del club
// ═════════════════════════════════════════════════════════════════════════════
const eurFmtNum = (n) => Number(n ?? 0).toLocaleString('es-ES');

function Kpi({ titulo, valor, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 150, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)' }}>{titulo}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</div>}
    </div>
  );
}

function Barra({ pct, color = 'var(--teal)' }) {
  return (
    <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-3)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', borderRadius: 999, background: color }} />
    </div>
  );
}

function Seccion({ titulo, children, extra }) {
  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{titulo}</h3>
        <div style={{ flex: 1 }} />
        {extra}
      </div>
      {children}
    </div>
  );
}

export function AdminReportes() {
  // Periodo: mensual o quincenal, navegable, igual que aim-tul.
  const [modo, setModo] = useState('monthly'); // 'monthly' | 'biweekly'
  const [inicio, setInicio] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [segmento, setSegmento] = useState('general'); // 'general' | 'activity' | 'instructor' | 'gamification'
  const [segmentoId, setSegmentoId] = useState(null);

  const [actividades, setActividades] = useState([]);
  const [instructores, setInstructores] = useState([]);
  const [overview, setOverview] = useState(null);
  const [roster, setRoster] = useState(null);
  const [churn, setChurn] = useState(null);
  const [gami, setGami] = useState(null);
  const [asistencia, setAsistencia] = useState([]);
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [cargando, setCargando] = useState(false);

  const periodo = useMemo(() => {
    const y = inicio.getFullYear(), m = inicio.getMonth();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (modo === 'monthly') {
      const fin = new Date(y, m + 1, 0);
      return { from: iso(new Date(y, m, 1)), to: iso(fin), label: inicio.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) };
    }
    const esPrimera = inicio.getDate() <= 15;
    const from = esPrimera ? new Date(y, m, 1) : new Date(y, m, 16);
    const to = esPrimera ? new Date(y, m, 15) : new Date(y, m + 1, 0);
    return { from: iso(from), to: iso(to), label: `${esPrimera ? '1ª' : '2ª'} quincena · ${inicio.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}` };
  }, [modo, inicio]);

  function mover(delta) {
    setInicio(prev => {
      const y = prev.getFullYear(), m = prev.getMonth();
      if (modo === 'monthly') return new Date(y, m + delta, 1);
      const esPrimera = prev.getDate() <= 15;
      if (delta > 0) return esPrimera ? new Date(y, m, 16) : new Date(y, m + 1, 1);
      return esPrimera ? new Date(y, m - 1, 16) : new Date(y, m, 1);
    });
  }

  const segParams = useMemo(() => {
    if (segmento === 'activity' && segmentoId) return `&activityId=${segmentoId}`;
    if (segmento === 'instructor' && segmentoId) return `&instructorId=${segmentoId}`;
    return '';
  }, [segmento, segmentoId]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const rango = `from=${periodo.from}&to=${periodo.to}`;
      const [a, ins, ov, rc, ch, gm, at, ev] = await Promise.all([
        api('/activities'), api('/instructors'),
        api(`/report/overview?x=1${segParams}`),
        api(`/report/roster-changes?${rango}${segParams}`),
        api(`/report/monthly-churn?x=1${segParams}`),
        api(`/report/gamification?x=1${segParams}`),
        api(`/report/attendance?${rango}${segParams}`),
        api(`/report/evaluations?${rango}${segParams}`),
      ]);
      setActividades(a.activities || []);
      setInstructores(ins.instructors || []);
      setOverview(ov); setRoster(rc); setChurn(ch); setGami(gm);
      setAsistencia(at.attendance || []);
      setEvaluaciones(ev.evaluations || []);
    } catch (e) { alert(e.message); }
    finally { setCargando(false); }
  }, [periodo, segParams]);
  useEffect(() => { cargar(); }, [cargar]);

  // Duración media de la membresía a partir del churn mensual, con la misma
  // fórmula que aim-tul: retención anual compuesta → churn mensual equivalente.
  const membresia = useMemo(() => {
    const meses = (churn?.months || []).filter(m => m.sociosInicio > 0);
    if (!meses.length) return null;
    let retencion = 1;
    for (const m of meses) retencion *= (1 - Math.min(m.bajas / m.sociosInicio, 1));
    const churnEq = 1 - Math.pow(retencion, 1 / meses.length);
    if (churnEq <= 0) return { meses: null, texto: 'sin bajas registradas' };
    const duracion = 1 / churnEq;
    return { meses: duracion, texto: `${duracion.toFixed(1)} meses` };
  }, [churn]);

  const mediaAsistencia = useMemo(() => {
    const conDatos = asistencia.filter(a => a.total > 0);
    if (!conDatos.length) return null;
    const p = conDatos.reduce((s, a) => s + a.present, 0);
    const t = conDatos.reduce((s, a) => s + a.total, 0);
    return t > 0 ? Math.round((p / t) * 100) : null;
  }, [asistencia]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Periodo */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {[['monthly', 'Mensual'], ['biweekly', 'Quincenal']].map(([v, l]) => (
          <button key={v} className={`filter-pill ${modo === v ? 'is-active' : ''}`} onClick={() => setModo(v)}>{l}</button>
        ))}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
          <button className="btn btn-icon" onClick={() => mover(-1)} aria-label="Anterior">‹</button>
          <span style={{ fontWeight: 800, fontSize: 14, minWidth: 180, textAlign: 'center', textTransform: 'capitalize' }}>{periodo.label}</span>
          <button className="btn btn-icon" onClick={() => mover(1)} aria-label="Siguiente">›</button>
        </div>
        {cargando && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Cargando...</span>}
      </div>

      {/* Segmento */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Ver:</span>
        {[['general', 'General'], ['activity', 'Por actividad'], ['instructor', 'Por monitor']].map(([v, l]) => (
          <button key={v} className={`filter-pill ${segmento === v ? 'is-active' : ''}`} onClick={() => { setSegmento(v); setSegmentoId(null); }}>{l}</button>
        ))}
        {segmento === 'activity' && (
          <select value={segmentoId || ''} onChange={e => setSegmentoId(e.target.value || null)} style={inputCss}>
            <option value="">Todas las actividades</option>
            {actividades.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {segmento === 'instructor' && (
          <select value={segmentoId || ''} onChange={e => setSegmentoId(e.target.value || null)} style={inputCss}>
            <option value="">Todos los monitores</option>
            {instructores.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {/* KPIs */}
      {overview && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Kpi titulo="Alumnos" valor={eurFmtNum(overview.totalStudents)} sub="personas únicas" />
          <Kpi titulo="Media por clase" valor={eurFmtNum(overview.avgStudentsPerGroup)} sub="matrículas por grupo" />
          <Kpi titulo="Ocupación" valor={`${overview.overallCapacityPct}%`} sub={`de ${eurFmtNum(overview.totalCapacity)} plazas`} />
          <Kpi titulo="Asistencia" valor={mediaAsistencia == null ? '—' : `${mediaAsistencia}%`} sub="del periodo elegido" />
          <Kpi titulo="Membresía media" valor={membresia ? membresia.texto : '—'} sub="estimada por el churn" />
        </div>
      )}

      {/* Distribución por actividad / grupos */}
      {overview && (
        <Seccion titulo={segParams ? 'Grupos del segmento' : 'Distribución por actividad'}>
          <div style={{ display: 'grid', gap: 10 }}>
            {(segParams ? overview.groups : overview.activities).map(x => {
              const nombre = segParams ? `${x.name} · ${x.activityName}` : x.name;
              const alumnos = segParams ? x.studentCount : x.totalEnrollments;
              const cap = segParams ? (x.maxStudents || 0) : x.totalCapacity;
              const pct = segParams
                ? (x.maxStudents > 0 ? Math.round((x.studentCount / x.maxStudents) * 100) : 0)
                : x.capacityPct;
              return (
                <div key={segParams ? x.groupId : x.activityId} style={{ display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ fontWeight: 700 }}>{nombre}</span>
                    <span style={{ color: 'var(--ink-3)' }}>
                      {alumnos}{cap ? `/${cap}` : ''}{!segParams && x.groupCount != null ? ` · ${x.groupCount} grupos` : ''}{pct ? ` · ${pct}%` : ''}
                    </span>
                  </div>
                  <Barra pct={pct} color={pct >= 90 ? 'var(--orange)' : 'var(--teal)'} />
                </div>
              );
            })}
          </div>
        </Seccion>
      )}

      {/* Altas y bajas */}
      {roster && (
        <Seccion titulo={`Altas y bajas · ${periodo.label}`}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Kpi titulo="Altas" valor={roster.totalEnrolled} />
            <Kpi titulo="Bajas" valor={roster.totalUnenrolled} />
            <Kpi titulo="Cambios de horario" valor={roster.totalGroupChanges} />
            {!segParams && <Kpi titulo="Cuentas nuevas" valor={roster.totalNewAccounts} />}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {[['Altas', roster.enrolled, 'var(--teal)'], ['Bajas', roster.unenrolled, 'var(--orange)']].map(([titulo, lista, color]) => (
              <div key={titulo}>
                <div style={{ fontSize: 12, fontWeight: 800, color, marginBottom: 6 }}>{titulo} ({lista.length})</div>
                {!lista.length && <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>Ninguna en este periodo.</p>}
                <div style={{ display: 'grid', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                  {lista.map((r, i) => (
                    <div key={i} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 8px', background: 'var(--bg-3)', borderRadius: 8 }}>
                      <span style={{ fontWeight: 700 }}>{r.studentName}</span>
                      <span style={{ color: 'var(--ink-3)', textAlign: 'right' }}>{r.activityName} · {r.groupName} · {r.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {roster.groupChanges.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--purple)', marginBottom: 6 }}>Cambios de horario ({roster.groupChanges.length})</div>
              <div style={{ display: 'grid', gap: 4 }}>
                {roster.groupChanges.map((r, i) => (
                  <div key={i} style={{ fontSize: 12, padding: '4px 8px', background: 'var(--bg-3)', borderRadius: 8 }}>
                    <b>{r.studentName}</b> · {r.fromGroupName} → {r.toGroupName} · {r.date}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!segParams && roster.newAccounts.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-2)', marginBottom: 6 }}>Cuentas nuevas ({roster.newAccounts.length})</div>
              <div style={{ display: 'grid', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {roster.newAccounts.map((r, i) => (
                  <div key={i} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 8px', background: 'var(--bg-3)', borderRadius: 8 }}>
                    <span style={{ fontWeight: 700 }}>{r.studentName}</span>
                    <span style={{ color: 'var(--ink-3)' }}>{r.email} · {r.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Seccion>
      )}

      {/* Churn mensual */}
      {churn && churn.months.length > 0 && (
        <Seccion titulo="Abandono mes a mes">
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', minWidth: 480 }}>
              {churn.months.map(m => {
                const pct = m.sociosInicio > 0 ? Math.round((m.bajas / m.sociosInicio) * 100) : 0;
                return (
                  <div key={m.month} style={{ flex: 1, textAlign: 'center', display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{m.bajas > 0 ? `${pct}%` : '—'}</div>
                    <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div style={{ width: 22, borderRadius: '6px 6px 0 0', background: m.bajas > 0 ? 'var(--orange)' : 'var(--bg-3)', height: `${Math.max(m.bajas > 0 ? 8 : 3, Math.min(100, pct * 4))}%` }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{m.month.slice(2)}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{m.bajas}/{m.sociosInicio}</div>
                  </div>
                );
              })}
            </div>
          </div>
          {membresia && <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Duración media estimada de la membresía: <b>{membresia.texto}</b>.</p>}
        </Seccion>
      )}

      {/* Asistencia del periodo */}
      <Seccion titulo={`Asistencia · ${periodo.label}`}>
        {!asistencia.length && <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>Sin registros de asistencia en este periodo.</p>}
        {asistencia.length > 0 && (
          <div style={{ display: 'grid', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {[...asistencia].sort((a, b) => (b.present / (b.total || 1)) - (a.present / (a.total || 1))).map(a => {
              const pct = a.total > 0 ? Math.round((a.present / a.total) * 100) : 0;
              return (
                <div key={a.studentId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) 3fr auto', gap: 10, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.studentName}</span>
                  <Barra pct={pct} color={pct >= 75 ? 'var(--teal)' : pct >= 50 ? '#FFD526' : 'var(--orange)'} />
                  <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{a.present}/{a.total} · {pct}%</span>
                </div>
              );
            })}
          </div>
        )}
      </Seccion>

      {/* Evaluaciones del periodo */}
      <Seccion titulo={`Evaluaciones · ${periodo.label}`}>
        {!evaluaciones.length && <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>Sin evaluaciones en este periodo.</p>}
        {evaluaciones.length > 0 && (
          <div style={{ display: 'grid', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {evaluaciones.map((e, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '6px 10px', background: 'var(--bg-3)', borderRadius: 8 }}>
                <span style={{ fontWeight: 700 }}>{e.studentName}</span>
                <span style={{ color: 'var(--ink-3)' }}>
                  {e.evaluationType === 'tul' ? 'Tul' : e.evaluationType === 'category' ? 'Rúbrica' : 'Técnica'} · <b style={{ color: 'var(--ink)' }}>{e.score}</b>/{e.maxScore}
                </span>
              </div>
            ))}
          </div>
        )}
      </Seccion>

      {/* Gamificación */}
      {gami && (
        <Seccion titulo="Gamificación">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Kpi titulo="Nivel medio" valor={gami.avgLevel} />
            <Kpi titulo="Jugadores" valor={gami.students.length} />
            <Kpi titulo="Objetos conseguidos" valor={eurFmtNum(gami.totalItemsCollected)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Top 5</div>
              <div style={{ display: 'grid', gap: 4 }}>
                {gami.topStudents.map((s, i) => (
                  <div key={s.userId} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--bg-3)', borderRadius: 8 }}>
                    <span style={{ fontWeight: 700 }}>{['🥇', '🥈', '🥉', '4º', '5º'][i]} {s.studentName}</span>
                    <span style={{ color: 'var(--ink-3)' }}>Nv. {s.level} · {s.rpgClass}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Niveles</div>
              <div style={{ display: 'grid', gap: 4 }}>
                {Object.entries(gami.levelBuckets).map(([rango, n]) => (
                  <div key={rango} style={{ display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: 'var(--ink-3)' }}>{rango}</span>
                    <Barra pct={gami.students.length ? (n / gami.students.length) * 100 : 0} color="var(--purple)" />
                    <span>{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Seccion>
      )}
    </div>
  );
}
