import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Agrupaciones dentro de una clase (ticket #441), como en iDoceo: varias formas
// de repartir a los alumnos («Clase del cole»: 2 años A, B y C; «Equipos de 4»…)
// para ver la lista agrupada al pasar lista. El servidor está en agrupaciones.js.
// ─────────────────────────────────────────────────────────────────────────────

const COLORES = ['#5233A8', '#21B668', '#F99B35', '#00BBF4', '#FF5FA2', '#AF99FF', '#E53935', '#8D6E63'];
const inp = { fontFamily: 'inherit', fontSize: 14, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' };

async function api(url, { method = 'GET', body } = {}) {
  const r = await fetch(url, { method, credentials: 'include', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido hacer.');
  return d;
}

// Las agrupaciones de una clase y cuál se está mirando (se recuerda por clase).
export function useAgrupaciones(groupId) {
  const [datos, setDatos] = useState(null);
  const clave = `aim_agrupacion_${groupId}`;
  const leer = () => { try { return Number(localStorage.getItem(clave)) || null; } catch { return null; } };
  const [elegida, setElegidaE] = useState(leer);
  // Al cambiar de clase, la que se eligió en esa.
  useEffect(() => { setElegidaE(leer()); setDatos(null); }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  const setElegida = (id) => { setElegidaE(id); try { if (id) localStorage.setItem(clave, String(id)); else localStorage.removeItem(clave); } catch { /* sin almacenamiento */ } };
  const recargar = useCallback(() => {
    if (!groupId) return;
    api(`/api/admin/clases/${groupId}/agrupaciones`).then(setDatos).catch(() => setDatos({ agrupaciones: [], alumnos: [], max: 10 }));
  }, [groupId]);
  useEffect(() => { recargar(); }, [recargar]);
  const actual = datos?.agrupaciones.find(a => a.id === elegida) || null;
  return { datos, actual, elegida: actual ? elegida : null, setElegida, recargar };
}

// Reparte una lista de alumnos ({ id, ... }) por los subgrupos de una agrupación:
// [{ subgrupo, alumnos }], y al final los que no están en ninguno.
export function repartir(agrupacion, alumnos) {
  if (!agrupacion) return null;
  const grupos = agrupacion.subgrupos.map(s => ({ subgrupo: s, alumnos: alumnos.filter(a => agrupacion.alumnos[a.id] === s.id) }));
  const sin = alumnos.filter(a => !agrupacion.subgrupos.some(s => agrupacion.alumnos[a.id] === s.id));
  if (sin.length) grupos.push({ subgrupo: { id: 'sin', nombre: 'Sin subgrupo', color: 'var(--ink-3)' }, alumnos: sin });
  return grupos.filter(g => g.alumnos.length);
}

// «Ver: Todos juntos · Clase del cole · Equipos…» y el botón para gestionarlas.
export function SelectorAgrupacion({ ag, onGestionar }) {
  const lista = ag.datos?.agrupaciones || [];
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>Ver:</span>
      <button type="button" className={`filter-pill ${!ag.elegida ? 'is-active' : ''}`} onClick={() => ag.setElegida(null)}>Todos juntos</button>
      {lista.map(a => (
        <button key={a.id} type="button" className={`filter-pill ${ag.elegida === a.id ? 'is-active' : ''}`} onClick={() => ag.setElegida(a.id)}>{a.nombre}</button>
      ))}
      <button type="button" className="btn btn-sm btn-ghost" onClick={onGestionar}>{lista.length ? '⚙ Agrupaciones' : '＋ Hacer subgrupos'}</button>
    </div>
  );
}

// El título de un subgrupo en la lista.
export function TituloSubgrupo({ subgrupo, n }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>
      <span style={{ width: 12, height: 12, borderRadius: 4, background: subgrupo.color || 'var(--purple)' }} />
      {subgrupo.nombre} <span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>({n})</span>
    </div>
  );
}

// Crear, cambiar y borrar las agrupaciones de una clase, y repartir a los alumnos.
export function GestorAgrupaciones({ groupId, nombreClase, onCerrar, onCambio, inicial = null }) {
  const [datos, setDatos] = useState(null);
  const [editando, setEditando] = useState(null);   // { id?, nombre, subgrupos: [{ clave, id?, nombre, color }], alumnos: { idAlumno: clave } }
  const [guardando, setGuardando] = useState(false);
  const [tamano, setTamano] = useState(4);
  const cargar = useCallback(() => api(`/api/admin/clases/${groupId}/agrupaciones`).then(d => { setDatos(d); return d; }), [groupId]);
  useEffect(() => {
    cargar().then(d => {
      const a = d.agrupaciones.find(x => x.id === inicial) || d.agrupaciones[0];
      setEditando(a ? aEdicion(a) : null);
    }).catch(e => alert(e.message));
  }, [cargar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);

  const aEdicion = (a) => ({ id: a.id, nombre: a.nombre, subgrupos: a.subgrupos.map(s => ({ ...s, clave: String(s.id) })),
    alumnos: Object.fromEntries(Object.entries(a.alumnos).map(([k, v]) => [k, String(v)])) });
  const nueva = () => setEditando({ nombre: '', subgrupos: [{ clave: 'n1', nombre: 'Grupo 1', color: COLORES[0] }, { clave: 'n2', nombre: 'Grupo 2', color: COLORES[1] }], alumnos: {} });
  const cambiar = (k, v) => setEditando(e => ({ ...e, [k]: v }));
  const sub = (i, k, v) => setEditando(e => ({ ...e, subgrupos: e.subgrupos.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));
  const otroSub = () => setEditando(e => {
    const n = e.subgrupos.length;
    return { ...e, subgrupos: [...e.subgrupos, { clave: `n${Date.now()}`, nombre: `Grupo ${n + 1}`, color: COLORES[n % COLORES.length] }] };
  });
  const quitarSub = (i) => setEditando(e => {
    const fuera = e.subgrupos[i].clave;
    return { ...e, subgrupos: e.subgrupos.filter((_, j) => j !== i), alumnos: Object.fromEntries(Object.entries(e.alumnos).filter(([, v]) => v !== fuera)) };
  });
  const asignar = (alumno, clave) => setEditando(e => {
    const a = { ...e.alumnos };
    if (a[alumno] === clave) delete a[alumno]; else a[alumno] = clave;
    return { ...e, alumnos: a };
  });
  // Grupos de N al azar, como en iDoceo: tantos subgrupos como hagan falta.
  function alAzar() {
    const n = Math.max(2, Math.min(15, Number(tamano) || 4));
    const al = [...(datos?.alumnos || [])];
    for (let i = al.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [al[i], al[j]] = [al[j], al[i]]; }
    const k = Math.max(1, Math.ceil(al.length / n));
    const subgrupos = Array.from({ length: k }, (_, i) => ({ clave: `a${i}`, nombre: `Grupo ${i + 1}`, color: COLORES[i % COLORES.length] }));
    // Repartidos por turnos: los grupos salen igualados (de 4 y 5, no de 4 y 1).
    const alumnos = Object.fromEntries(al.map((a, i) => [a.id, `a${i % k}`]));
    setEditando(e => ({ ...e, nombre: e.nombre || `Grupos de ${n}`, subgrupos, alumnos }));
  }
  async function guardar() {
    setGuardando(true);
    try {
      const body = { nombre: editando.nombre, subgrupos: editando.subgrupos.map(s => ({ id: s.id, clave: s.clave, nombre: s.nombre, color: s.color })), alumnos: editando.alumnos };
      const r = editando.id ? await api(`/api/admin/agrupaciones/${editando.id}`, { method: 'PUT', body }) : await api(`/api/admin/clases/${groupId}/agrupaciones`, { method: 'POST', body });
      const d = await cargar();
      const a = d.agrupaciones.find(x => x.id === (editando.id || r.id));
      setEditando(a ? aEdicion(a) : null);
      onCambio?.(a?.id);
    } catch (err) { alert(err.message); } finally { setGuardando(false); }
  }
  async function borrar() {
    if (!window.confirm(`¿Borrar la agrupación «${editando.nombre}»? Los alumnos siguen en la clase; solo se quita este reparto.`)) return;
    try {
      await api(`/api/admin/agrupaciones/${editando.id}`, { method: 'DELETE' });
      const d = await cargar();
      setEditando(d.agrupaciones[0] ? aEdicion(d.agrupaciones[0]) : null);
      onCambio?.(null);
    } catch (err) { alert(err.message); }
  }

  const lista = datos?.agrupaciones || [];
  const sinSubgrupo = editando ? (datos?.alumnos || []).filter(a => !editando.alumnos[a.id]).length : 0;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 70, padding: 16 }} onClick={onCerrar}>
      <div role="dialog" aria-label="Agrupaciones" onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 14, width: 'min(860px, 100%)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Agrupaciones · {nombreClase}</h3>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Formas de repartir a los alumnos en subgrupos, para ver la lista así al pasarla. Hasta {datos?.max || 10}.</span>
          </div>
          <button type="button" className="icon-btn" onClick={onCerrar} aria-label="Cerrar"><I.X /></button>
        </div>
        {!datos && <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>}
        {datos && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {lista.map(a => (
              <button key={a.id} type="button" className={`filter-pill ${editando?.id === a.id ? 'is-active' : ''}`} onClick={() => setEditando(aEdicion(a))}>{a.nombre}</button>
            ))}
            <button type="button" className={`filter-pill ${editando && !editando.id ? 'is-active' : ''}`} disabled={lista.length >= (datos.max || 10)} onClick={nueva}>＋ Nueva agrupación</button>
          </div>
        )}
        {datos && !editando && (
          <div style={{ padding: 22, textAlign: 'center', borderRadius: 14, border: '1px dashed var(--line)', color: 'var(--ink-3)', fontSize: 14 }}>
            Esta clase no tiene agrupaciones. Crea una para repartir a los alumnos (por ejemplo, por su clase del cole o en equipos).
          </div>
        )}
        {editando && datos && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', flex: 1, minWidth: 220 }}>Nombre de la agrupación
                <input autoFocus={!editando.id} value={editando.nombre} onChange={e => cambiar('nombre', e.target.value)} placeholder="Clase del cole, Equipos de 4…" style={inp} maxLength={60} />
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>Grupos de</span>
                <input type="number" min={2} max={15} value={tamano} onChange={e => setTamano(e.target.value)} style={{ ...inp, width: 64 }} aria-label="Alumnos por grupo" />
                <button type="button" className="btn btn-sm btn-outline" onClick={alAzar} disabled={!datos.alumnos.length}>🎲 Al azar</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <b style={{ fontSize: 13 }}>Subgrupos</b>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {editando.subgrupos.map((s, i) => (
                  <div key={s.clave} style={{ display: 'flex', gap: 4, alignItems: 'center', padding: 4, borderRadius: 10, border: `2px solid ${s.color}` }}>
                    <input type="color" value={s.color} onChange={e => sub(i, 'color', e.target.value)} aria-label={`Color de ${s.nombre}`} style={{ width: 26, height: 26, border: 0, padding: 0, background: 'none', cursor: 'pointer' }} />
                    <input value={s.nombre} onChange={e => sub(i, 'nombre', e.target.value)} style={{ ...inp, width: 130, padding: '5px 8px' }} maxLength={60} aria-label={`Nombre del subgrupo ${i + 1}`} />
                    <button type="button" className="icon-btn" onClick={() => quitarSub(i)} disabled={editando.subgrupos.length <= 1} aria-label={`Quitar ${s.nombre}`}><I.X /></button>
                  </div>
                ))}
                <button type="button" className="btn btn-sm btn-ghost" onClick={otroSub} disabled={editando.subgrupos.length >= 20}>＋ Subgrupo</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <b style={{ fontSize: 13 }}>Alumnos <span style={{ fontWeight: 500, color: 'var(--ink-3)' }}>· toca el subgrupo de cada uno{sinSubgrupo ? ` · ${sinSubgrupo} sin subgrupo` : ''}</span></b>
              {!datos.alumnos.length && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>La clase no tiene alumnos.</span>}
              <div style={{ display: 'grid', gap: 4, maxHeight: '42vh', overflowY: 'auto' }}>
                {datos.alumnos.map(a => (
                  <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 8px', borderRadius: 10, background: 'var(--bg-3)' }}>
                    <span style={{ flex: 1, minWidth: 150, fontWeight: 600, fontSize: 14 }}>{a.nombre}</span>
                    {editando.subgrupos.map(s => {
                      const si = editando.alumnos[a.id] === s.clave;
                      return (
                        <button key={s.clave} type="button" onClick={() => asignar(a.id, s.clave)} aria-pressed={si}
                          style={{ font: 'inherit', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                            border: `1.5px solid ${s.color}`, background: si ? s.color : 'transparent', color: si ? '#fff' : 'var(--ink-2)' }}>{s.nombre}</button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm btn-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
              <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>Cerrar</button>
              <div style={{ flex: 1 }} />
              {editando.id && <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--pink)' }} onClick={borrar}><I.Trash /> Borrar agrupación</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
