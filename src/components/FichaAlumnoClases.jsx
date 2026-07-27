import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { colorOcupacion } from './AdminTulClases.jsx';
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

// Insignia con el color del nivel, igual que en Learning Dungeon.
export function Insignia({ nivel }) {
  if (!nivel) return null;
  return (
    <span style={{
      fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 999,
      background: nivel.color, color: nivel.textColor || (nivel.color === '#FFFFFF' ? '#333' : '#1a1a1a'),
      border: '1px solid rgba(0,0,0,.18)', whiteSpace: 'nowrap',
    }}>{nivel.name}</span>
  );
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
// El desplegable con las 50 clases del club era ilegible. Aquí se escribe para
// filtrar y se ve de un vistazo el horario y cuántos huecos quedan.
function ElegirClase({ grupos, actPorId, yaApuntado, onElegir, onCancelar }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [nivel, setNivel] = useState('');

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return grupos
      .filter(g => !yaApuntado.has(g.id))
      .map(g => ({ ...g, actividad: actPorId[g.activityId]?.name || '' }))
      .filter(g => !t || `${g.actividad} ${g.name}`.toLowerCase().includes(t))
      .sort((a, b) => a.actividad.localeCompare(b.actividad) || a.name.localeCompare(b.name));
  }, [grupos, actPorId, yaApuntado, q]);

  const act = sel ? actPorId[sel.activityId] : null;
  const lleno = !!sel && sel.maxStudents != null && sel.studentCount >= sel.maxStudents;

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8, background: 'var(--bg-3)', borderRadius: 12, padding: 12 }}>
      <input autoFocus value={q} onChange={e => { setQ(e.target.value); setSel(null); setNivel(''); }}
        placeholder="Filtrar por actividad o clase..." style={campo} />

      <div className="scroll-oculto" style={{
        maxHeight: 230, overflowY: 'auto', display: 'grid', gap: 4,
        border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg-2)', padding: 4,
      }}>
        {!lista.length && <p style={{ margin: 0, padding: 10, fontSize: 12, color: 'var(--ink-3)' }}>Ninguna clase coincide.</p>}
        {lista.map(g => {
          const completa = g.maxStudents != null && g.studentCount >= g.maxStudents;
          const elegida = sel?.id === g.id;
          return (
            <button key={g.id} type="button" onClick={() => { setSel(g); setNivel(''); }}
              style={{
                display: 'flex', gap: 8, alignItems: 'center', textAlign: 'left', width: '100%',
                padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                background: elegida ? 'color-mix(in oklab, var(--purple) 14%, transparent)' : 'transparent',
                border: elegida ? '1px solid var(--purple)' : '1px solid transparent',
              }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{g.name}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>
                  {g.actividad}{g.time ? ` · ${g.time}` : ''}
                </span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: colorOcupacion(g.studentCount, g.maxStudents), whiteSpace: 'nowrap' }}>
                {g.studentCount}{g.maxStudents ? `/${g.maxStudents}` : ''}
              </span>
              {completa && <span style={{ fontSize: 10, fontWeight: 800, color: '#E5484D' }}>LLENA</span>}
            </button>
          );
        })}
      </div>

      {sel && act?.tieneRangos && (
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
          Su rango en {act.name}
          <select value={nivel} onChange={e => setNivel(e.target.value)} style={campo}>
            <option value="">Sin rango por ahora</option>
            {act.niveles.map(n => <option key={n.order} value={n.order}>{n.name}</option>)}
          </select>
        </label>
      )}

      {lleno && (
        <p style={{ margin: 0, fontSize: 12, color: '#E5484D', fontWeight: 700 }}>
          Esa clase está completa. Se apunta desde Clases y horarios, en su lista de espera.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={!sel || lleno}
          onClick={() => onElegir(sel, nivel)}>Apuntar</button>
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
                    <button key={x.id} type="button" onClick={() => { setElegido(x); setSug([]); }}
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
                {['Madre', 'Padre', 'Hijo/a', 'Hermano/a', 'Abuelo/a', 'Tutor/a', 'Tío/a', 'Primo/a'].map(x => <option key={x} value={x} />)}
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
export default function FichaAlumnoClases({ studentId, nombre, showToast }) {
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

  async function apuntar(grupo, nivel) {
    setGuardando(true);
    try {
      await api(`/students/${studentId}/clases`, {
        method: 'POST', body: { groupId: grupo.id, levelOrder: nivel === '' ? null : Number(nivel) },
      });
      setAnadiendo(false);
      await cargar();
      showToast?.(`Apuntado a ${grupo.name}.`);
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
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.actividad}{c.time ? ` · ${c.time}` : ''}</div>
              </div>
              <button type="button" className="icon-btn danger" title="Dar de baja" onClick={() => quitar(c)}><I.Trash /></button>
            </div>
          ))}
        </div>

        {anadiendo && (
          <ElegirClase grupos={grupos} actPorId={actPorId} yaApuntado={yaApuntado}
            onElegir={apuntar} onCancelar={() => setAnadiendo(false)} />
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
