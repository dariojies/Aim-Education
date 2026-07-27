import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { colorOcupacion } from './AdminTulClases.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Clases y rangos de un alumno, dentro de su ficha.
//
// Cada actividad tiene su propia escala y no se pisan: el mismo alumno puede
// ser cinturón azul de Taekwondo y estar en Grado 3 de Ballet. Los rangos se
// eligen de una lista cerrada, no se escriben, para que no acaben en la base
// valores que no existen.
// ─────────────────────────────────────────────────────────────────────────────

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

export default function FichaAlumnoClases({ studentId, nombre, showToast }) {
  const [escalas, setEscalas] = useState([]);
  const [ficha, setFicha] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [anadiendo, setAnadiendo] = useState(false);
  const [nuevoGrupo, setNuevoGrupo] = useState('');
  const [nuevoNivel, setNuevoNivel] = useState('');
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

  const grupoElegido = grupos.find(g => g.id === nuevoGrupo);
  const actividadDelGrupo = grupoElegido ? actPorId[grupoElegido.activityId] : null;

  async function cambiarRango(actividad, levelOrder) {
    setGuardando(true);
    try {
      await api(`/students/${studentId}/rango`, { method: 'PUT', body: { activityId: actividad.id, levelOrder: Number(levelOrder) } });
      await cargar();
      showToast?.(`Rango de ${actividad.name} actualizado.`);
    } catch (e) { alert(e.message); }
    finally { setGuardando(false); }
  }

  async function apuntar() {
    if (!nuevoGrupo) return;
    setGuardando(true);
    try {
      await api(`/students/${studentId}/clases`, {
        method: 'POST', body: { groupId: nuevoGrupo, levelOrder: nuevoNivel === '' ? null : Number(nuevoNivel) },
      });
      setNuevoGrupo(''); setNuevoNivel(''); setAnadiendo(false);
      await cargar();
      showToast?.('Alumno apuntado a la clase.');
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

  if (!ficha) return <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cargando sus clases...</p>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* ── Clases ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)' }}>
            Clases {ficha.clases.length > 0 && `(${ficha.clases.length})`}
          </span>
          <div style={{ flex: 1 }} />
          {!anadiendo && (
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setAnadiendo(true)}>
              <I.Plus /> Apuntar a una clase
            </button>
          )}
        </div>

        {!ficha.clases.length && !anadiendo && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>No está apuntado a ninguna clase.</p>
        )}

        <div style={{ display: 'grid', gap: 6 }}>
          {ficha.clases.map(c => (
            <div key={c.groupId} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--bg-3)', borderRadius: 10, padding: '8px 12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.grupo}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.actividad}{c.time ? ` · ${c.time}` : ''}</div>
              </div>
              <button type="button" className="icon-btn danger" title="Dar de baja" onClick={() => quitar(c)}><I.Trash /></button>
            </div>
          ))}
        </div>

        {anadiendo && (
          <div style={{ display: 'grid', gap: 8, marginTop: 8, background: 'var(--bg-3)', borderRadius: 10, padding: 12 }}>
            <select value={nuevoGrupo} onChange={e => { setNuevoGrupo(e.target.value); setNuevoNivel(''); }} style={sel}>
              <option value="">Elige la clase...</option>
              {grupos
                .filter(g => !ficha.clases.some(c => c.groupId === g.id))
                .map(g => {
                  const lleno = g.maxStudents != null && g.studentCount >= g.maxStudents;
                  const act = actPorId[g.activityId];
                  return (
                    <option key={g.id} value={g.id} disabled={lleno}>
                      {act ? `${act.name} · ` : ''}{g.name} ({g.studentCount}{g.maxStudents ? `/${g.maxStudents}` : ''}){lleno ? ' — COMPLETA' : ''}
                    </option>
                  );
                })}
            </select>
            {/* Si la actividad tiene rangos, se le puede poner el suyo al apuntarle */}
            {actividadDelGrupo?.tieneRangos && (
              <select value={nuevoNivel} onChange={e => setNuevoNivel(e.target.value)} style={sel}>
                <option value="">
                  {ficha.rangos[actividadDelGrupo.id]
                    ? `Mantener su nivel actual (${ficha.rangos[actividadDelGrupo.id].levelName})`
                    : `Sin nivel de ${actividadDelGrupo.name} por ahora`}
                </option>
                {actividadDelGrupo.niveles.map(n => <option key={n.order} value={n.order}>{n.name}</option>)}
              </select>
            )}
            {grupoElegido && (
              <div style={{ fontSize: 11, color: colorOcupacion(grupoElegido.studentCount, grupoElegido.maxStudents), fontWeight: 700 }}>
                {grupoElegido.studentCount}{grupoElegido.maxStudents ? `/${grupoElegido.maxStudents}` : ''} alumnos
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => { setAnadiendo(false); setNuevoGrupo(''); }}>Cancelar</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={!nuevoGrupo || guardando} onClick={apuntar}>
                {guardando ? 'Apuntando...' : 'Apuntar'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Rangos, uno por actividad ── */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)', marginBottom: 8 }}>
          Rangos por actividad
        </div>
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
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-3)', borderRadius: 10, padding: '8px 12px' }}>
                <span style={{ fontWeight: 700, fontSize: 13, minWidth: 110 }}>{a.name}</span>
                <Insignia nivel={nivelActual} />
                <div style={{ flex: 1 }} />
                <select value={actual?.levelOrder ?? ''} disabled={guardando}
                  onChange={e => cambiarRango(a, e.target.value)} style={{ ...sel, maxWidth: 220 }}>
                  <option value="" disabled>Sin asignar</option>
                  {a.niveles.map(n => <option key={n.order} value={n.order}>{n.name}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const sel = {
  fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', width: '100%', minWidth: 0,
};
