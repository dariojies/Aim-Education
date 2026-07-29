import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { colorOcupacion, IconoActividad } from './AdminTulClases.jsx';
import { fmtFecha } from '../fechas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Ficha de una persona: sus clases, su rango en cada actividad y su familia.
//
// Cada actividad tiene su propia escala y no se pisan: el mismo alumno puede
// ser cinturón azul de Taekwondo y estar en Grado 3 de Ballet. Los rangos se
// eligen de una lista cerrada, no se escriben, para que no acaben en la base
// valores que no existen.
// ─────────────────────────────────────────────────────────────────────────────

async function api(url, opts = {}) {
  const r = await fetch(url.startsWith('/api') ? url : `/api/admin/tul${url}`, {
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Error de conexión.');
  return d;
}

// Insignia del nivel, igual que en Learning Dungeon. Los cinturones de punta
// son bicolor: se pinta la punta como una banda al final del cinturón.
export function Insignia({ nivel }) {
  if (!nivel) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', overflow: 'hidden',
      fontSize: 11, fontWeight: 800, borderRadius: 999, whiteSpace: 'nowrap',
      background: nivel.color, color: nivel.textColor || '#1A1A1A',
      border: `1px solid ${nivel.borde || 'rgba(0,0,0,.18)'}`,
    }}>
      <span style={{ padding: '2px 10px' }}>{nivel.name}</span>
      {nivel.punta && <span style={{ alignSelf: 'stretch', width: 10, background: nivel.punta }} />}
    </span>
  );
}

// Los horarios vienen con un salto de línea por sesión; el HTML los aplastaba
// todos en un renglón ilegible.
const horario = { fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'pre-line', lineHeight: 1.5 };

export function edadDe(fecha) {
  if (!fecha) return null;
  const n = new Date(String(fecha).slice(0, 10));
  if (isNaN(n)) return null;
  const hoy = new Date();
  let a = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

function Seccion({ titulo, extra, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)' }}>
          {titulo}
        </span>
        <div style={{ flex: 1 }} />
        {extra}
      </div>
      {children}
    </div>
  );
}

const fila = {
  display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
  background: 'var(--bg-3)', borderRadius: 10, padding: '8px 12px',
};
const campo = {
  fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)',
  width: '100%', minWidth: 0,
};

// ── Elegir clase ─────────────────────────────────────────────────────────────
// El mismo menú que "Asignar a Grupo" de Learning Dungeon: una sección plegable
// por actividad, y dentro las clases que encajan con la edad del alumno
// destacadas arriba. Las que ya tiene salen marcadas, para verlo mientras se
// elige, y las llenas se pueden elegir igual: se va a la lista de espera.
function FilaClase({ g, elegida, recomendada, yaVa, onElegir }) {
  const completa = g.maxStudents != null && g.studentCount >= g.maxStudents;
  const edades = (g.minAge != null || g.maxAge != null)
    ? `${g.minAge ?? '0'} – ${g.maxAge ?? '∞'} años` : null;

  return (
    <button type="button" onClick={() => !yaVa && onElegir(g)} disabled={yaVa}
      style={{
        display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', width: '100%',
        padding: '10px 12px', borderRadius: 10, marginBottom: 6, fontFamily: 'inherit',
        cursor: yaVa ? 'default' : 'pointer',
        background: yaVa ? 'color-mix(in oklab, var(--teal) 10%, transparent)'
          : elegida ? 'color-mix(in oklab, var(--purple) 14%, transparent)'
          : recomendada ? 'color-mix(in oklab, #D69E2E 12%, transparent)' : 'var(--bg-2)',
        border: `1px solid ${yaVa ? 'var(--teal)' : elegida ? 'var(--purple)'
          : recomendada ? '#D69E2E88' : 'var(--line)'}`,
      }}>
      <span style={{
        width: 20, height: 20, borderRadius: 999, flexShrink: 0,
        border: `2px solid ${yaVa ? 'var(--teal)' : elegida ? 'var(--purple)' : 'var(--line)'}`,
        background: yaVa ? 'var(--teal)' : elegida ? 'var(--purple)' : 'transparent',
        display: 'grid', placeItems: 'center', color: '#fff',
      }}>{(yaVa || elegida) && <I.Check width={12} height={12} />}</span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>
          {g.name}
          {yaVa && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: 'var(--teal)' }}>YA VA</span>}
        </span>
        <span style={{ display: 'block', ...horario }}>{g.time}</span>
      </span>

      <span style={{ display: 'grid', gap: 3, justifyItems: 'end', flexShrink: 0 }}>
        {edades && (
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-3)', background: 'var(--bg-3)', borderRadius: 6, padding: '2px 6px' }}>
            {edades}
          </span>
        )}
        {g.maxStudents != null && (
          <span style={{ fontSize: 11, fontWeight: 800, color: colorOcupacion(g.studentCount, g.maxStudents) }}>
            {g.studentCount}/{g.maxStudents}{completa ? ' · LLENA' : ''}
          </span>
        )}
      </span>
    </button>
  );
}

// El acordeón de clases por actividad. Se usa al apuntar desde la ficha y al
// elegir la clase provisional mientras alguien espera plaza.
export function AcordeonClases({ grupos, actPorId, yaApuntado, edad, sel, onSel, ocultarLlenas, alto = 340 }) {
  const [abiertas, setAbiertas] = useState(new Set());

  const secciones = useMemo(() => {
    const porActividad = new Map();
    for (const g of grupos) {
      if (ocultarLlenas && g.maxStudents != null && g.studentCount >= g.maxStudents) continue;
      const a = actPorId[g.activityId];
      const clave = g.activityId || 'sin';
      const e = porActividad.get(clave) || { id: clave, nombre: a?.name || 'Sin actividad', icon: a?.icon, grupos: [] };
      e.grupos.push(g);
      porActividad.set(clave, e);
    }
    return [...porActividad.values()]
      .map(e => {
        // Recomendada = tiene rango de edad y la del alumno encaja. Sin rango
        // configurado nunca se recomienda, igual que en Learning Dungeon.
        const recomendadas = edad == null ? [] : e.grupos.filter(g =>
          (g.minAge != null || g.maxAge != null) &&
          (g.minAge == null || edad >= g.minAge) &&
          (g.maxAge == null || edad <= g.maxAge));
        return {
          ...e,
          recomendadas,
          otras: e.grupos.filter(g => !recomendadas.includes(g)),
          yaTiene: e.grupos.filter(g => yaApuntado.has(g.id)).length,
          sinRangos: e.grupos.every(g => g.minAge == null && g.maxAge == null),
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [grupos, actPorId, yaApuntado, edad, ocultarLlenas]);

  function alternar(id) {
    setAbiertas(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const pinta = (g, recomendada) => (
    <FilaClase key={g.id} g={g} recomendada={recomendada} elegida={sel?.id === g.id}
      yaVa={yaApuntado.has(g.id)} onElegir={onSel} />
  );

  return (
    <div className="scroll-oculto" style={{ maxHeight: alto, overflowY: 'auto', display: 'grid', gap: 6 }}>
      {!secciones.length && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>No hay clases disponibles.</p>
      )}
      {secciones.map(sec => {
        const abierta = abiertas.has(sec.id);
        return (
          <div key={sec.id}>
            <button type="button" onClick={() => alternar(sec.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                background: 'var(--bg-2)', border: '1px solid var(--line)',
              }}>
              <IconoActividad icon={sec.icon} size={18} style={{ color: 'var(--purple)', flexShrink: 0 }} />
              <span style={{ fontWeight: 800, fontSize: 13.5, flex: 1 }}>{sec.nombre}</span>
              {sec.yaTiene > 0 && (
                <span style={{ background: 'var(--teal)', color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 800 }}>
                  {sec.yaTiene}
                </span>
              )}
              <I.Chevron width={16} height={16} style={{ color: 'var(--ink-3)', transform: abierta ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </button>

            {abierta && (
              <div style={{ marginTop: 6 }}>
                {sec.recomendadas.length > 0 && (
                  <div style={{ border: '1px solid #D69E2E55', borderRadius: 10, padding: 8, marginBottom: 6 }}>
                    <div style={{ color: '#D69E2E', fontWeight: 800, fontSize: 11.5, marginBottom: 6 }}>
                      <I.Sparkle width={12} height={12} style={{ marginRight: 5, verticalAlign: '-1px' }} />
                      RECOMENDADO PARA SU EDAD ({edad} años)
                    </div>
                    {sec.recomendadas.map(g => pinta(g, true))}
                  </div>
                )}

                {sec.otras.length > 0 && (
                  <>
                    {sec.recomendadas.length > 0 && (
                      <div style={{ color: 'var(--ink-3)', fontSize: 11, margin: '8px 0 4px 4px' }}>Otras clases</div>
                    )}
                    {sec.otras.map(g => pinta(g, false))}
                  </>
                )}

                {edad != null && sec.recomendadas.length === 0 && sec.sinRangos && (
                  <div style={{ color: 'var(--ink-3)', fontSize: 11, fontStyle: 'italic', margin: '0 0 6px 4px' }}>
                    Sin rango de edad configurado en estas clases
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ChipEdad({ edad }) {
  if (edad == null) return null;
  return (
    <span style={{
      justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 5,
      background: 'color-mix(in oklab, var(--purple) 15%, transparent)', color: 'var(--purple)',
      borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800,
    }}>
      <I.User width={13} height={13} /> {edad} años
    </span>
  );
}

function ElegirClase({ grupos, actPorId, yaApuntado, edad, rangos, onElegir, onCancelar }) {
  const [sel, setSel] = useState(null);
  const [nivel, setNivel] = useState('');
  const [nota, setNota] = useState('');
  const [provisional, setProvisional] = useState(null);
  const [eligiendoProvisional, setEligiendoProvisional] = useState(false);

  const act = sel ? actPorId[sel.activityId] : null;
  const llena = !!sel && sel.maxStudents != null && sel.studentCount >= sel.maxStudents;

  function elegir(g) {
    setSel(g); setNivel(''); setProvisional(null); setEligiendoProvisional(false);
  }

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8, background: 'var(--bg-3)', borderRadius: 12, padding: 12 }}>
      <ChipEdad edad={edad} />

      <AcordeonClases grupos={grupos} actPorId={actPorId} yaApuntado={yaApuntado}
        edad={edad} sel={sel} onSel={elegir} />

      {sel && act?.tieneRangos && (
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
          Su rango en {act.name}
          <select value={nivel} onChange={e => setNivel(e.target.value)} style={campo}>
            <option value="">
              {rangos?.[act.id]
                ? `Mantener el que tiene (${rangos[act.id].levelName})`
                : 'Sin rango por ahora'}
            </option>
            {act.niveles.map(n => <option key={n.order} value={n.order}>{n.name}</option>)}
          </select>
        </label>
      )}

      {/* Si está llena no se bloquea: se le guarda turno en la lista de espera. */}
      {llena && (
        <div style={{ display: 'grid', gap: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
          <span style={{ fontSize: 12, color: '#E5484D', fontWeight: 700 }}>
            {sel.name} está completa ({sel.studentCount}/{sel.maxStudents}). Se le guarda turno por orden de llegada.
          </span>

          <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
            Mientras espera, puede ir a:{' '}
            <b>{provisional ? provisional.name : 'ninguna clase de momento'}</b>
            <button type="button" className="btn btn-sm btn-outline" style={{ marginLeft: 8 }}
              onClick={() => setEligiendoProvisional(v => !v)}>
              {eligiendoProvisional ? 'Cerrar' : provisional ? 'Cambiar' : 'Elegir'}
            </button>
            {provisional && (
              <button type="button" className="btn btn-sm btn-outline" style={{ marginLeft: 6 }}
                onClick={() => setProvisional(null)}>Quitar</button>
            )}
          </div>

          {eligiendoProvisional && (
            <AcordeonClases grupos={grupos.filter(g => g.id !== sel.id)} actPorId={actPorId}
              yaApuntado={yaApuntado} edad={edad} sel={provisional} alto={220} ocultarLlenas
              onSel={g => { setProvisional(g); setEligiendoProvisional(false); }} />
          )}

          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
            Nota (opcional)
            <input value={nota} onChange={e => setNota(e.target.value)}
              placeholder="Ej. solo puede los martes" style={campo} />
          </label>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--ink-3)', flex: 1, minWidth: 140 }}>
          {sel ? <>Se le apunta a <b>{sel.name}</b></> : 'Elige una clase para apuntarle.'}
        </span>
        <button type="button" className="btn btn-sm btn-outline" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={!sel}
          onClick={() => onElegir(sel, nivel, llena ? { espera: true, nota, provisionalId: provisional?.id || null } : null)}>
          {llena ? 'Apuntar a la espera' : 'Apuntar'}
        </button>
      </div>
    </div>
  );
}

// ── Familia ──────────────────────────────────────────────────────────────────
function Familia({ personaId, nombre, showToast }) {
  const [lista, setLista] = useState([]);
  const [anadiendo, setAnadiendo] = useState(false);
  const [q, setQ] = useState('');
  const [sug, setSug] = useState([]);
  const [elegido, setElegido] = useState(null);
  const [tipo, setTipo] = useState('');
  const [tipoInverso, setTipoInverso] = useState('');

  const cargar = useCallback(async () => {
    try { setLista(await api(`/api/admin/billing/familias/${personaId}`)); }
    catch { /* noop */ }
  }, [personaId]);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (q.trim().length < 2) { setSug([]); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const d = await api(`/api/admin/personas?q=${encodeURIComponent(q.trim())}`);
        if (vivo) setSug(d.filter(x => x.id !== personaId && !lista.some(f => f.familiarId === x.id)));
      } catch { /* noop */ }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, personaId, lista]);

  async function enlazar() {
    if (!elegido || !tipo.trim()) return;
    try {
      await api('/api/admin/billing/familias', {
        method: 'POST',
        body: { personaId, familiarId: elegido.id, tipo: tipo.trim(), tipoInverso: tipoInverso.trim() || null },
      });
      setAnadiendo(false); setElegido(null); setQ(''); setTipo(''); setTipoInverso('');
      await cargar();
      showToast?.('Familiar enlazado.');
    } catch (e) { alert(e.message); }
  }

  async function quitar(f) {
    if (!window.confirm(`¿Quitar a ${f.nombre} de la familia de ${nombre}?`)) return;
    try { await api(`/api/admin/billing/familias/${f.id}`, { method: 'DELETE' }); await cargar(); }
    catch (e) { alert(e.message); }
  }

  return (
    <Seccion titulo={`Familia${lista.length ? ` (${lista.length})` : ''}`}
      extra={!anadiendo && (
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setAnadiendo(true)}>
          <I.Plus /> Enlazar familiar
        </button>
      )}>
      {!lista.length && !anadiendo && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Sin familiares enlazados.</p>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        {lista.map(f => (
          <div key={f.id} style={fila}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {f.nombre} {f.apellidos || ''}
                <span style={{ fontWeight: 600, color: 'var(--ink-3)' }}> · {f.tipo}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                {f.email}{f.nacimiento ? ` · nac. ${fmtFecha(f.nacimiento)}` : ''}
              </div>
            </div>
            <button type="button" className="icon-btn danger" title="Quitar parentesco" onClick={() => quitar(f)}><I.Trash /></button>
          </div>
        ))}
      </div>

      {anadiendo && (
        <div style={{ display: 'grid', gap: 8, marginTop: 8, background: 'var(--bg-3)', borderRadius: 12, padding: 12 }}>
          {!elegido ? (
            <>
              <input autoFocus value={q} onChange={e => setQ(e.target.value)}
                placeholder="Buscar a la persona por nombre o email..." style={campo} />
              {sug.length > 0 && (
                <div className="scroll-oculto" style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg-2)' }}>
                  {sug.map(x => (
                    <button key={x.id} type="button"
                      onMouseDown={(e) => { e.preventDefault(); setElegido(x); setSug([]); }}
                      onClick={(e) => e.preventDefault()}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--line-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                      <b>{x.nombre}</b>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>{x.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <b>{elegido.nombre}</b>
              <button type="button" className="btn btn-sm btn-outline"
                onClick={() => { setElegido(null); setQ(''); }}>Cambiar</button>
            </div>
          )}

          {elegido && (
            <>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
                {elegido.nombre} es su...
                <input list="parentescos" value={tipo} onChange={e => setTipo(e.target.value)}
                  placeholder="Madre, Padre, Hermano/a, Tutor/a..." style={campo} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
                Y {nombre} es su... <span style={{ color: 'var(--ink-3)' }}>(opcional, para verlo desde el otro lado)</span>
                <input list="parentescos" value={tipoInverso} onChange={e => setTipoInverso(e.target.value)}
                  placeholder="Hijo/a, Hermano/a..." style={campo} />
              </label>
              <datalist id="parentescos">
                {['Madre', 'Padre', 'Hijo/a', 'Cónyuge', 'Hermano/a', 'Abuelo/a', 'Tutor/a', 'Tío/a', 'Primo/a'].map(x => <option key={x} value={x} />)}
              </datalist>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => { setAnadiendo(false); setElegido(null); setQ(''); }}>Cancelar</button>
            <button type="button" className="btn btn-sm btn-primary" disabled={!elegido || !tipo.trim()} onClick={enlazar}>Enlazar</button>
          </div>
        </div>
      )}
    </Seccion>
  );
}

// ── Clases y rangos ──────────────────────────────────────────────────────────
export default function FichaAlumnoClases({ studentId, nombre, nacimiento, showToast }) {
  const [escalas, setEscalas] = useState([]);
  const [ficha, setFicha] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [anadiendo, setAnadiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [e, f, g] = await Promise.all([api('/escalas'), api(`/students/${studentId}/ficha`), api('/groups')]);
      setEscalas(e.actividades || []);
      setFicha(f);
      setGrupos(g.groups || []);
    } catch { /* noop */ }
  }, [studentId]);
  useEffect(() => { if (studentId) cargar(); }, [studentId, cargar]);

  const actPorId = useMemo(() => Object.fromEntries(escalas.map(a => [a.id, a])), [escalas]);

  // Actividades en las que tiene rango que fijar: las que hace o ha hecho y
  // tienen escala. Las de tipo general (Pilates, Pintura...) no tienen.
  const conRango = useMemo(() => {
    if (!ficha) return [];
    return (ficha.actividadesDelAlumno || [])
      .map(id => actPorId[id])
      .filter(a => a && a.tieneRangos);
  }, [ficha, actPorId]);

  async function cambiarRango(actividad, levelOrder) {
    setGuardando(true);
    try {
      await api(`/students/${studentId}/rango`, { method: 'PUT', body: { activityId: actividad.id, levelOrder: Number(levelOrder) } });
      await cargar();
      showToast?.(`Rango de ${actividad.name} actualizado.`);
    } catch (e) { alert(e.message); }
    finally { setGuardando(false); }
  }

  async function apuntar(grupo, nivel, espera) {
    setGuardando(true);
    const levelOrder = nivel === '' ? null : Number(nivel);
    try {
      if (espera) {
        await api(`/groups/${grupo.id}/espera`, {
          method: 'POST',
          body: { studentId, levelOrder, nota: espera.nota || null, grupoProvisionalId: espera.provisionalId },
        });
        showToast?.(`En la lista de espera de ${grupo.name}.`);
      } else {
        await api(`/students/${studentId}/clases`, { method: 'POST', body: { groupId: grupo.id, levelOrder } });
        showToast?.(`Apuntado a ${grupo.name}.`);
      }
      setAnadiendo(false);
      await cargar();
    } catch (e) { alert(e.message); }
    finally { setGuardando(false); }
  }

  async function quitar(c) {
    if (!window.confirm(`¿Dar de baja a ${nombre} de ${c.grupo}?`)) return;
    try {
      await api(`/students/${studentId}/clases/${c.groupId}`, { method: 'DELETE' });
      await cargar();
      showToast?.(`Dado de baja de ${c.grupo}.`);
    } catch (e) { alert(e.message); }
  }

  if (!ficha) return <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cargando su ficha...</p>;

  const yaApuntado = new Set(ficha.clases.map(c => c.groupId));

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Seccion titulo={`Clases${ficha.clases.length ? ` (${ficha.clases.length})` : ''}`}
        extra={!anadiendo && (
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setAnadiendo(true)}>
            <I.Plus /> Apuntar a una clase
          </button>
        )}>
        {!ficha.clases.length && !anadiendo && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>No está apuntado a ninguna clase.</p>
        )}

        <div style={{ display: 'grid', gap: 6 }}>
          {ficha.clases.map(c => (
            <div key={c.groupId} style={fila}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.grupo}</div>
                <div style={horario}>{c.actividad}{c.time ? `\n${c.time}` : ''}</div>
              </div>
              <button type="button" className="icon-btn danger" title="Dar de baja" onClick={() => quitar(c)}><I.Trash /></button>
            </div>
          ))}
        </div>

        {anadiendo && (
          <ElegirClase grupos={grupos} actPorId={actPorId} yaApuntado={yaApuntado}
            edad={edadDe(nacimiento)} rangos={ficha.rangos} onElegir={apuntar} onCancelar={() => setAnadiendo(false)} />
        )}
      </Seccion>

      <Seccion titulo="Rangos por actividad">
        {!conRango.length && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>
            Sus actividades no llevan rangos. Los cinturones son de Taekwon-Do ITF; Ballet e Inglés tienen su propia escala.
          </p>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {conRango.map(a => {
            const actual = ficha.rangos[a.id];
            const nivelActual = actual ? a.niveles.find(n => n.order === actual.levelOrder) : null;
            return (
              <div key={a.id} style={fila}>
                <span style={{ fontWeight: 700, fontSize: 13, minWidth: 110 }}>{a.name}</span>
                <Insignia nivel={nivelActual} />
                <div style={{ flex: 1 }} />
                <select value={actual?.levelOrder ?? ''} disabled={guardando}
                  onChange={e => cambiarRango(a, e.target.value)} style={{ ...campo, maxWidth: 220 }}>
                  <option value="" disabled>Sin asignar</option>
                  {a.niveles.map(n => <option key={n.order} value={n.order}>{n.name}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </Seccion>

      <Familia personaId={studentId} nombre={nombre} showToast={showToast} />
    </div>
  );
}
