import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';
import { fmtFechaLarga } from '../fechas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Evaluación (ticket #411). Cuatro pestañas:
//  · Sesiones: la clase de un día, con sus actividades (del fichero o nuevas),
//    qué contenidos trabajan, sus categorías y en cuál se evalúa cada una; debajo,
//    las estrellas (1 a 3) de cada alumno en cada categoría evaluada ese día.
//  · Notas del trimestre: la media de cada alumno por categoría, sobre 5.
//  · Fichero de actividades: las que se reutilizan de una sesión a otra.
//  · Currículo: categorías, contenidos y objetivos de cada actividad (los cambian
//    la dirección y el Equipo IT; el servidor lo comprueba).
// Las familias no ven nada de esto: es una prueba interna.
// ─────────────────────────────────────────────────────────────────────────────

const hoyISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', boxSizing: 'border-box' };
const caja = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'grid', gap: 12 };
const suave = { fontSize: 12, color: 'var(--ink-3)' };
const chip = (on, color = 'var(--purple)') => ({
  fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${on ? color : 'var(--line)'}`, background: on ? `color-mix(in oklab, ${color} 14%, var(--bg-2))` : 'var(--bg-2)',
  color: on ? color : 'var(--ink-2)',
});

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

// Estrellas: `max` huecos, se pulsa para poner; pulsar la misma la quita.
function Estrellas({ valor, max = 3, onCambio, tam = 22, soloVer = false }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {Array.from({ length: max }, (_, i) => {
        const n = i + 1, lleno = valor != null && valor >= n, medio = !lleno && valor != null && valor >= n - 0.5;
        const svg = (
          <svg width={tam} height={tam} viewBox="0 0 24 24" aria-hidden="true">
            <defs><linearGradient id={`m${n}`}><stop offset="50%" stopColor="#F5B400" /><stop offset="50%" stopColor="transparent" /></linearGradient></defs>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              fill={lleno ? '#F5B400' : medio ? `url(#m${n})` : 'none'} stroke={lleno || medio ? '#E0A100' : 'var(--ink-3)'} strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        );
        return soloVer ? <span key={n} style={{ lineHeight: 0 }}>{svg}</span> : (
          <button key={n} type="button" onClick={() => onCambio?.(valor === n ? null : n)} aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
            style={{ background: 'none', border: 0, padding: 2, cursor: 'pointer', lineHeight: 0 }}>{svg}</button>
        );
      })}
    </span>
  );
}

// Elegir contenidos, agrupados por categoría.
function SelectorContenidos({ categorias, valor, onCambio }) {
  const set = new Set(valor);
  const alternar = (id) => onCambio(set.has(id) ? valor.filter(x => x !== id) : [...valor, id]);
  if (!categorias.some(k => k.contenidos.length)) return <span style={suave}>Aún no hay contenidos en el currículo de esta actividad.</span>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {categorias.filter(k => k.contenidos.length).map(k => (
        <div key={k.id} style={{ display: 'grid', gap: 4 }}>
          <b style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)' }}>{k.nombre}</b>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {k.contenidos.map(c => <button key={c.id} type="button" style={chip(set.has(c.id), 'var(--teal)')} onClick={() => alternar(c.id)}>{c.nombre}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function SelectorCategorias({ categorias, valor, onCambio }) {
  const set = new Set(valor);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {categorias.map(k => <button key={k.id} type="button" style={chip(set.has(k.id))} onClick={() => onCambio(set.has(k.id) ? valor.filter(x => x !== k.id) : [...valor, k.id])}>{k.nombre}</button>)}
    </div>
  );
}

export default function AdminEvaluacion({ showToast }) {
  const [pestana, setPestana] = useState('sesiones');
  const [actividades, setActividades] = useState([]);
  const [puedeCurriculo, setPuedeCurriculo] = useState(false);
  useEffect(() => {
    api('/api/admin/evaluacion/actividades').then(d => { setActividades(d.actividades || []); setPuedeCurriculo(!!d.puedeCurriculo); }).catch(() => {});
  }, []);
  const pestanas = [['sesiones', 'Sesiones'], ['trimestre', 'Notas del trimestre'], ['fichero', 'Fichero de actividades'], ['curriculo', 'Currículo']];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)', maxWidth: 760 }}>
        Cada sesión se evalúa con 1 a 3 estrellas por alumno en la categoría que se trabaja ese día; al final del trimestre la media se convierte en una nota sobre 5. Es una prueba: <b>las familias no ven nada</b> de esto.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {pestanas.map(([id, l]) => (
          <button key={id} className={`filter-pill ${pestana === id ? 'is-active' : ''}`} onClick={() => setPestana(id)} style={{ borderRadius: 8, padding: '8px 16px' }}>{l}</button>
        ))}
      </div>
      {pestana === 'sesiones' && <Sesiones showToast={showToast} />}
      {pestana === 'trimestre' && <Trimestre />}
      {pestana === 'fichero' && <Fichero actividades={actividades} showToast={showToast} />}
      {pestana === 'curriculo' && <Curriculo actividades={actividades} puede={puedeCurriculo} showToast={showToast} />}
    </div>
  );
}

// Elegir actividad (las que tienen currículo primero).
function ElegirActividad({ actividades, valor, onCambio }) {
  const orden = [...actividades].sort((a, b) => (b.categorias > 0) - (a.categorias > 0) || a.nombre.localeCompare(b.nombre));
  return (
    <select value={valor || ''} onChange={e => onCambio(e.target.value)} style={{ ...campo, minWidth: 220 }} aria-label="Actividad">
      <option value="" disabled>Elige la actividad…</option>
      {orden.map(a => <option key={a.id} value={a.id}>{a.nombre}{a.categorias ? '' : ' (sin currículo)'}</option>)}
    </select>
  );
}
function useActividadInicial(actividades) {
  const [act, setAct] = useState('');
  useEffect(() => {
    if (act || !actividades.length) return;
    const ingles = actividades.find(a => a.categorias > 0) || actividades[0];
    setAct(ingles.id);
  }, [actividades, act]);
  return [act, setAct];
}

// ── Sesiones ────────────────────────────────────────────────────────────────
function Sesiones({ showToast }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [clases, setClases] = useState(null);
  const [todas, setTodas] = useState(false);
  const [verTodas, setVerTodas] = useState(false);
  const [clase, setClase] = useState(null);
  useEffect(() => {
    setClases(null); setClase(null);
    api(`/api/admin/tul/attendance/dia/${fecha}`).then(d => { setClases(d.clases || []); setTodas(!!d.todas); }).catch(() => setClases([]));
  }, [fecha]);
  const hayMias = (clases || []).some(c => c.mia);
  const visibles = (clases || []).filter(c => !(todas && hayMias && !verTodas) || c.mia);

  if (clase) return <Sesion clase={clase} fecha={fecha} onVolver={() => setClase(null)} showToast={showToast} />;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} style={{ ...campo, fontWeight: 700 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'capitalize' }}>{fmtFechaLarga(fecha + 'T12:00:00')}</span>
        {todas && hayMias && (
          <span style={{ display: 'flex', gap: 6 }}>
            <button className={`filter-pill ${!verTodas ? 'is-active' : ''}`} onClick={() => setVerTodas(false)}>Mis clases</button>
            <button className={`filter-pill ${verTodas ? 'is-active' : ''}`} onClick={() => setVerTodas(true)}>Todas</button>
          </span>
        )}
      </div>
      {clases === null ? <p style={suave}>Cargando…</p> : !visibles.length ? <p style={suave}>Ese día no hay clases.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {visibles.map(c => (
            <button key={c.id} type="button" onClick={() => setClase(c)}
              style={{ ...caja, gap: 4, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', padding: '12px 14px' }}>
              <b style={{ fontSize: 14 }}>{c.name}</b>
              <span style={suave}>{c.activityName} · {c.horario}</span>
              {c.instructor && <span style={{ ...suave, fontSize: 11 }}>{c.instructor}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sesion({ clase, fecha, onVolver, showToast }) {
  const [datos, setDatos] = useState(null);
  const [alumnos, setAlumnos] = useState([]);
  const [notasTxt, setNotasTxt] = useState('');
  const [acts, setActs] = useState([]);
  const [notas, setNotas] = useState({}); // `${alumno}|${cat}` → estrellas
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [fichero, setFichero] = useState(null);   // la lista, al abrir «Del fichero»
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([
        api(`/api/admin/evaluacion/sesion?grupo=${clase.id}&fecha=${fecha}`),
        api(`/api/admin/tul/groups/${clase.id}/attendance/${fecha}`).catch(() => ({ alumnos: [] })),
      ]);
      setDatos(d); setAlumnos(a.alumnos || []);
      setNotasTxt(d.sesion?.notas || ''); setActs(d.sesion?.actividades || []);
      setNotas(Object.fromEntries((d.notas || []).map(n => [`${n.studentId}|${n.categoriaId}`, n.estrellas])));
      setSucio(false); setError(null);
    } catch (e) { setError(e.message); }
  }, [clase.id, fecha]);
  useEffect(() => { cargar(); }, [cargar]);

  if (error) return <div style={{ display: 'grid', gap: 10 }}><button className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={onVolver}>← Clases</button><p style={{ color: 'var(--orange)' }}>{error}</p></div>;
  if (!datos) return <p style={suave}>Cargando…</p>;
  const cats = datos.categorias;
  const nombreCat = (id) => cats.find(k => k.id === id)?.nombre || '—';
  const nombreCont = (id) => cats.flatMap(k => k.contenidos).find(c => c.id === id)?.nombre || null;
  const cambiarAct = (i, c) => { setActs(xs => xs.map((x, j) => (j === i ? { ...x, ...c } : x))); setSucio(true); };
  const evaluadas = [...new Set(acts.map(a => a.evaluaEn).filter(Boolean))];

  async function guardar() {
    setGuardando(true);
    try {
      // Las nuevas marcadas para el fichero se guardan antes allí.
      const lista = [];
      for (const a of acts) {
        if (a.alFichero && !a.actividadId && a.nombre.trim()) {
          const r = await api('/api/admin/evaluacion/fichero', { method: 'POST', body: { actividadId: datos.clase.actividadId, nombre: a.nombre, descripcion: a.descripcion, categoriaIds: a.categoriaIds, contenidoIds: a.contenidoIds } });
          lista.push({ ...a, actividadId: r.id, alFichero: false });
        } else lista.push(a);
      }
      const r = await api('/api/admin/evaluacion/sesion', { method: 'PUT', body: { grupo: clase.id, fecha, notas: notasTxt, actividades: lista } });
      showToast?.('Sesión guardada.');
      setDatos(d => ({ ...d, sesion: { ...(d.sesion || {}), id: r.id } }));
      setActs(r.actividades); setSucio(false);
    } catch (e) { alert(e.message); } finally { setGuardando(false); }
  }
  async function poner(alumno, cat, estrellas) {
    if (!datos.sesion?.id || sucio) { alert('Guarda antes la sesión.'); return; }
    const k = `${alumno}|${cat}`, antes = notas[k];
    setNotas(n => ({ ...n, [k]: estrellas }));
    try { await api('/api/admin/evaluacion/nota', { method: 'PUT', body: { sesionId: datos.sesion.id, studentId: alumno, categoriaId: cat, estrellas } }); }
    catch (e) { setNotas(n => ({ ...n, [k]: antes })); alert(e.message); }
  }
  async function abrirFichero() {
    try { setFichero((await api(`/api/admin/evaluacion/fichero?actividad=${datos.clase.actividadId}`)).actividades || []); } catch (e) { alert(e.message); }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-outline" onClick={() => { if (!sucio || window.confirm('Hay cambios sin guardar. ¿Salir igualmente?')) onVolver(); }}>← Clases</button>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{datos.clase.nombre}</h3>
        <span style={suave}>{datos.clase.actividad} · <span style={{ textTransform: 'capitalize' }}>{fmtFechaLarga(fecha + 'T12:00:00')}</span></span>
        <div style={{ flex: 1 }} />
        {sucio && <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>Sin guardar</span>}
        <button className="btn btn-sm btn-primary" onClick={guardar} disabled={guardando || !sucio}>{guardando ? 'Guardando…' : 'Guardar sesión'}</button>
      </div>
      {!cats.length && (
        <p style={{ margin: 0, fontSize: 13, color: '#b45309' }}>Esta actividad aún no tiene currículo (categorías y contenidos). Pídelo a la dirección o al Equipo IT, en la pestaña «Currículo».</p>
      )}

      <div style={caja}>
        <b style={{ fontSize: 14 }}>Qué se ha hecho</b>
        <textarea value={notasTxt} onChange={e => { setNotasTxt(e.target.value); setSucio(true); }} rows={2} placeholder="Notas de la sesión (opcional)"
          style={{ ...campo, width: '100%', resize: 'vertical' }} />
        <div style={{ display: 'grid', gap: 10 }}>
          {acts.map((a, i) => (
            <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'grid', gap: 8, background: 'var(--bg-3)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={a.nombre} onChange={e => cambiarAct(i, { nombre: e.target.value })} placeholder="Nombre de la actividad"
                  style={{ ...campo, flex: '1 1 220px', fontWeight: 700, background: 'var(--bg-2)' }} />
                {a.actividadId ? <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--purple)' }}>DEL FICHERO</span> : (
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!a.alFichero} onChange={e => cambiarAct(i, { alFichero: e.target.checked })} /> Guardar en el fichero
                  </label>
                )}
                <button type="button" className="icon-btn danger" onClick={() => { setActs(xs => xs.filter((_, j) => j !== i)); setSucio(true); }} aria-label="Quitar la actividad"><I.X /></button>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Categorías</span>
              <SelectorCategorias categorias={cats} valor={a.categoriaIds || []} onCambio={v => cambiarAct(i, { categoriaIds: v, evaluaEn: v.includes(a.evaluaEn) ? a.evaluaEn : null })} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Contenidos que trabaja</span>
              <SelectorContenidos categorias={cats} valor={a.contenidoIds || []} onCambio={v => cambiarAct(i, { contenidoIds: v })} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
                <b>Hoy se evalúa en</b>
                <select value={a.evaluaEn || ''} onChange={e => cambiarAct(i, { evaluaEn: e.target.value ? Number(e.target.value) : null })} style={{ ...campo, padding: '6px 9px', background: 'var(--bg-2)' }}>
                  <option value="">No se evalúa</option>
                  {cats.filter(k => (a.categoriaIds || []).includes(k.id) || !(a.categoriaIds || []).length).map(k => <option key={k.id} value={k.id}>{k.nombre}</option>)}
                </select>
              </label>
            </div>
          ))}
          {!acts.length && <p style={{ margin: 0, ...suave }}>Añade las actividades de la sesión: del fichero o nuevas.</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={abrirFichero}><I.Search width={14} height={14} /> Del fichero</button>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => { setActs(xs => [...xs, { actividadId: null, nombre: '', descripcion: '', categoriaIds: [], contenidoIds: [], evaluaEn: null, alFichero: true }]); setSucio(true); }}>
              <I.Plus width={14} height={14} /> Nueva actividad
            </button>
          </div>
          {fichero && (
            <ElegirDelFichero fichero={fichero} cats={cats} onCerrar={() => setFichero(null)} onElegir={x => {
              setActs(xs => [...xs, { actividadId: x.id, nombre: x.nombre, descripcion: x.descripcion, categoriaIds: x.categoriaIds, contenidoIds: x.contenidoIds, evaluaEn: x.categoriaIds.length === 1 ? x.categoriaIds[0] : null }]);
              setSucio(true); setFichero(null);
            }} />
          )}
        </div>
      </div>

      <div style={caja}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 14 }}>Evaluación del día</b>
          <span style={suave}>{evaluadas.length ? `De 1 a 3 estrellas en ${evaluadas.map(nombreCat).join(', ')}. Pulsa la misma estrella para quitarla.` : 'Marca en qué categoría se evalúa alguna actividad y guarda la sesión.'}</span>
        </div>
        {evaluadas.length > 0 && (sucio || !datos.sesion?.id) && <p style={{ margin: 0, fontSize: 12, color: '#b45309' }}>Guarda la sesión para poder poner las notas.</p>}
        {evaluadas.length > 0 && (
          alumnos.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 12, color: 'var(--ink-3)' }}>Alumno</th>
                    {evaluadas.map(c => <th key={c} style={{ padding: '6px 8px', fontSize: 12, color: 'var(--purple)', whiteSpace: 'nowrap' }}>{nombreCat(c)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {alumnos.map(al => {
                    const falta = al.status === 'absent';
                    return (
                      <tr key={al.id} style={{ borderTop: '1px solid var(--line)', opacity: falta ? 0.5 : 1 }}>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{al.nombre}{falta && <span style={{ ...suave, marginLeft: 6 }}>(faltó)</span>}</td>
                        {evaluadas.map(c => (
                          <td key={c} style={{ padding: '4px 8px', textAlign: 'center' }}>
                            <Estrellas valor={notas[`${al.id}|${c}`] ?? null} onCambio={v => poner(al.id, c, v)} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p style={{ margin: 0, ...suave }}>Esta clase no tiene alumnos ese día.</p>
        )}
        {acts.some(a => a.contenidoIds?.length) && (
          <span style={suave}>Contenidos de hoy: {[...new Set(acts.flatMap(a => a.contenidoIds || []))].map(nombreCont).filter(Boolean).join(' · ')}</span>
        )}
      </div>
    </div>
  );
}

function ElegirDelFichero({ fichero, cats, onElegir, onCerrar }) {
  const [q, setQ] = useState('');
  const n = q.trim().toLowerCase();
  const lista = fichero.filter(x => !n || x.nombre.toLowerCase().includes(n) || (x.descripcion || '').toLowerCase().includes(n));
  const nombreCat = (id) => cats.find(k => k.id === id)?.nombre;
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'grid', gap: 8, background: 'var(--bg-2)' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en el fichero…" style={{ ...campo, flex: 1 }} />
        <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>Cerrar</button>
      </div>
      {!lista.length && <span style={suave}>{fichero.length ? 'Nada coincide.' : 'El fichero de esta actividad está vacío: crea una actividad nueva y márcala para guardarla en el fichero.'}</span>}
      {lista.slice(0, 40).map(x => (
        <button key={x.id} type="button" onClick={() => onElegir(x)}
          style={{ textAlign: 'left', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', display: 'grid', gap: 2 }}>
          <b style={{ fontSize: 13 }}>{x.nombre}</b>
          <span style={suave}>{x.categoriaIds.map(nombreCat).filter(Boolean).join(', ') || 'sin categoría'}{x.usada ? ` · usada ${x.usada} ${x.usada === 1 ? 'vez' : 'veces'}` : ''}</span>
        </button>
      ))}
    </div>
  );
}

// ── Notas del trimestre ─────────────────────────────────────────────────────
function Trimestre() {
  const [grupos, setGrupos] = useState(null);
  const [grupo, setGrupo] = useState('');
  const hoy = hoyISO();
  const [m, y] = [Number(hoy.slice(5, 7)), Number(hoy.slice(0, 4))];
  const [curso, setCurso] = useState(m >= 9 ? y : y - 1);
  const [t, setT] = useState(m >= 9 ? 1 : m <= 3 ? 2 : 3);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api('/api/admin/tul/groups').then(d => setGrupos(d.groups || [])).catch(() => setGrupos([])); }, []);
  useEffect(() => {
    if (!grupo) return;
    setDatos(null); setError(null);
    api(`/api/admin/evaluacion/trimestre?grupo=${grupo}&curso=${curso}&t=${t}`).then(setDatos).catch(e => setError(e.message));
  }, [grupo, curso, t]);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={grupo} onChange={e => setGrupo(e.target.value)} style={{ ...campo, minWidth: 240 }} aria-label="Clase">
          <option value="">{grupos === null ? 'Cargando clases…' : 'Elige la clase…'}</option>
          {(grupos || []).filter(g => !g.individual).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select value={curso} onChange={e => setCurso(Number(e.target.value))} style={campo} aria-label="Curso">
          {[curso - 1, curso, curso + 1].filter((v, i, a) => a.indexOf(v) === i).sort().map(c => <option key={c} value={c}>Curso {c}-{String(c + 1).slice(2)}</option>)}
        </select>
        <span style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3].map(n => <button key={n} className={`filter-pill ${t === n ? 'is-active' : ''}`} onClick={() => setT(n)}>{n}.º trimestre</button>)}
        </span>
      </div>
      {error && <p style={{ color: 'var(--orange)', fontSize: 14 }}>{error}</p>}
      {!grupo ? <p style={suave}>Elige una clase para ver sus notas.</p> : !datos && !error ? <p style={suave}>Cargando…</p> : datos && (
        <div style={caja}>
          <span style={suave}>{datos.sesiones} sesi{datos.sesiones === 1 ? 'ón' : 'ones'} del {datos.desde.split('-').reverse().join('/')} al {datos.hasta.split('-').reverse().join('/')}. Nota sobre 5: la media de estrellas ÷ 3 × 5, a media estrella.</span>
          {!datos.alumnos.length ? <p style={{ margin: 0, ...suave }}>Aún no hay notas en este trimestre.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 12, color: 'var(--ink-3)' }}>Alumno</th>
                    {datos.categorias.map(k => <th key={k.id} style={{ padding: '6px 8px', fontSize: 12, color: 'var(--purple)', whiteSpace: 'nowrap' }}>{k.nombre}</th>)}
                    <th style={{ padding: '6px 8px', fontSize: 12, color: 'var(--ink)' }}>Global</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.alumnos.map(a => (
                    <tr key={a.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{a.nombre}</td>
                      {datos.categorias.map(k => {
                        const c = a.categorias[k.id];
                        return (
                          <td key={k.id} style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {c ? <span title={`Media ${String(c.media).replace('.', ',')} de 3 en ${c.veces} sesi${c.veces === 1 ? 'ón' : 'ones'}`}>
                              <Estrellas valor={c.nota} max={5} soloVer tam={15} /> <b style={{ fontSize: 12 }}>{String(c.nota).replace('.', ',')}</b>
                            </span> : <span style={suave}>—</span>}
                          </td>
                        );
                      })}
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 800 }}>{a.global != null ? String(a.global).replace('.', ',') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Fichero de actividades ──────────────────────────────────────────────────
function Fichero({ actividades, showToast }) {
  const [act, setAct] = useActividadInicial(actividades);
  const [cats, setCats] = useState([]);
  const [lista, setLista] = useState(null);
  const [archivadas, setArchivadas] = useState(false);
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState(null);
  const cargar = useCallback(async () => {
    if (!act) return;
    const [c, f] = await Promise.all([
      api(`/api/admin/evaluacion/curriculo?actividad=${act}`),
      api(`/api/admin/evaluacion/fichero?actividad=${act}${archivadas ? '&archivadas=1' : ''}`),
    ]);
    setCats(c.categorias || []); setLista(f.actividades || []);
  }, [act, archivadas]);
  useEffect(() => { cargar().catch(() => setLista([])); }, [cargar]);
  const nombreCat = (id) => cats.find(k => k.id === id)?.nombre;
  const nombreCont = (id) => cats.flatMap(k => k.contenidos).find(c => c.id === id)?.nombre;
  const n = q.trim().toLowerCase();
  const visibles = (lista || []).filter(x => !n || x.nombre.toLowerCase().includes(n) || (x.descripcion || '').toLowerCase().includes(n));

  async function guardar(e) {
    e.preventDefault();
    try {
      const body = { actividadId: act, nombre: editando.nombre, descripcion: editando.descripcion, categoriaIds: editando.categoriaIds, contenidoIds: editando.contenidoIds };
      if (editando.id) await api(`/api/admin/evaluacion/fichero/${editando.id}`, { method: 'PUT', body });
      else await api('/api/admin/evaluacion/fichero', { method: 'POST', body });
      showToast?.('Actividad guardada en el fichero.'); setEditando(null); cargar();
    } catch (err) { alert(err.message); }
  }
  async function archivar(x) {
    try { await api(`/api/admin/evaluacion/fichero/${x.id}`, { method: 'PUT', body: { archivada: !x.archivada } }); cargar(); } catch (err) { alert(err.message); }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <ElegirActividad actividades={actividades} valor={act} onCambio={setAct} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" style={{ ...campo, flex: '1 1 200px', maxWidth: 320 }} />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--ink-2)' }}>
          <input type="checkbox" checked={archivadas} onChange={e => setArchivadas(e.target.checked)} /> Ver archivadas
        </label>
        <div style={{ flex: 1 }} />
        {!editando && <button className="btn btn-sm btn-primary" disabled={!act} onClick={() => setEditando({ nombre: '', descripcion: '', categoriaIds: [], contenidoIds: [] })}><I.Plus width={14} height={14} /> Nueva actividad</button>}
      </div>
      {editando && (
        <form onSubmit={guardar} style={caja}>
          <b style={{ fontSize: 14 }}>{editando.id ? 'Cambiar la actividad' : 'Nueva actividad del fichero'}</b>
          <input autoFocus required value={editando.nombre} onChange={e => setEditando(x => ({ ...x, nombre: e.target.value }))} placeholder="Nombre" style={campo} />
          <textarea value={editando.descripcion} onChange={e => setEditando(x => ({ ...x, descripcion: e.target.value }))} rows={3} placeholder="Cómo se hace, materiales… (opcional)" style={{ ...campo, resize: 'vertical' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Categorías (puede tener varias)</span>
          <SelectorCategorias categorias={cats} valor={editando.categoriaIds} onCambio={v => setEditando(x => ({ ...x, categoriaIds: v }))} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Contenidos que trabaja</span>
          <SelectorContenidos categorias={cats} valor={editando.contenidoIds} onCambio={v => setEditando(x => ({ ...x, contenidoIds: v }))} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditando(null)}>Cancelar</button>
            <button type="submit" className="btn btn-sm btn-primary">Guardar</button>
          </div>
        </form>
      )}
      {lista === null ? <p style={suave}>Cargando…</p> : !visibles.length ? <p style={suave}>{lista.length ? 'Nada coincide.' : 'El fichero está vacío. Las actividades se guardan aquí desde una sesión o con «Nueva actividad».'}</p> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {visibles.map(x => (
            <div key={x.id} style={{ ...caja, gap: 6, padding: '12px 14px', opacity: x.archivada ? 0.6 : 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 14 }}>{x.nombre}</b>
                {x.archivada && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3)' }}>ARCHIVADA</span>}
                <div style={{ flex: 1 }} />
                {x.puedeEditar && <button className="btn btn-sm btn-outline" onClick={() => setEditando({ ...x })}><I.Edit width={13} height={13} /> Cambiar</button>}
                {x.puedeEditar && <button className="btn btn-sm btn-outline" onClick={() => archivar(x)}>{x.archivada ? 'Recuperar' : 'Archivar'}</button>}
              </div>
              {x.descripcion && <span style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{x.descripcion}</span>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {x.categoriaIds.map(id => <span key={id} style={{ ...chip(true), cursor: 'default' }}>{nombreCat(id)}</span>)}
                {x.contenidoIds.map(id => <span key={id} style={{ ...chip(true, 'var(--teal)'), cursor: 'default', fontWeight: 600 }}>{nombreCont(id)}</span>)}
              </div>
              <span style={suave}>{x.autor ? `De ${x.autor}` : ''}{x.usada ? ` · usada en ${x.usada} sesi${x.usada === 1 ? 'ón' : 'ones'}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Currículo ───────────────────────────────────────────────────────────────
function Curriculo({ actividades, puede, showToast }) {
  const [act, setAct] = useActividadInicial(actividades);
  const [cats, setCats] = useState(null);
  const cargar = useCallback(async () => {
    if (!act) return;
    setCats((await api(`/api/admin/evaluacion/curriculo?actividad=${act}`)).categorias || []);
  }, [act]);
  useEffect(() => { cargar().catch(() => setCats([])); }, [cargar]);
  // Hace el cambio y recarga; devuelve si ha ido bien.
  const hacer = async (fn, ok) => { try { await fn(); if (ok) showToast?.(ok); await cargar(); return true; } catch (e) { alert(e.message); return false; } };
  const pedir = (msg, inicial = '') => { const v = window.prompt(msg, inicial); return v && v.trim() ? v.trim() : null; };

  const nuevaCategoria = () => { const nombre = pedir('Nombre de la categoría (p. ej. Speaking):'); if (nombre) hacer(() => api('/api/admin/evaluacion/categorias', { method: 'POST', body: { actividadId: act, nombre } }), 'Categoría añadida.'); };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <ElegirActividad actividades={actividades} valor={act} onCambio={setAct} />
        <span style={suave}>{puede ? 'Lo que cambies aquí lo usan todos los profes de la actividad.' : 'Lo cambian la dirección y el Equipo IT.'}</span>
        <div style={{ flex: 1 }} />
        {puede && act && <button className="btn btn-sm btn-primary" onClick={nuevaCategoria}><I.Plus width={14} height={14} /> Categoría</button>}
      </div>
      {cats === null ? <p style={suave}>Cargando…</p> : !cats.length ? <p style={suave}>Esta actividad aún no tiene categorías.{puede ? ' Empieza añadiendo una.' : ''}</p> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {cats.map(k => <TarjetaCategoria key={k.id} k={k} puede={puede} hacer={hacer} pedir={pedir} />)}
        </div>
      )}
    </div>
  );
}

function TarjetaCategoria({ k, puede, hacer, pedir }) {
  const [objetivo, setObjetivo] = useState(null); // { id?, texto, contenidoIds }
  const nombreCont = (id) => k.contenidos.find(c => c.id === id)?.nombre;
  return (
    <div style={caja}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--purple)' }}>{k.nombre}</h3>
        <span style={suave}>{k.contenidos.length} contenido{k.contenidos.length !== 1 ? 's' : ''} · {k.objetivos.length} objetivo{k.objetivos.length !== 1 ? 's' : ''}</span>
        <div style={{ flex: 1 }} />
        {puede && (
          <>
            <button className="btn btn-sm btn-ghost" onClick={() => { const nombre = pedir('Nuevo nombre de la categoría:', k.nombre); if (nombre) hacer(() => api(`/api/admin/evaluacion/categorias/${k.id}`, { method: 'PUT', body: { nombre } })); }} aria-label="Cambiar el nombre"><I.Edit width={14} height={14} /></button>
            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--orange)' }} onClick={() => { if (window.confirm(`¿Borrar la categoría «${k.nombre}» con sus contenidos y objetivos?`)) hacer(() => api(`/api/admin/evaluacion/categorias/${k.id}`, { method: 'DELETE' }), 'Categoría borrada.'); }} aria-label="Borrar la categoría"><I.Trash width={14} height={14} /></button>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <b style={{ fontSize: 12, color: 'var(--ink-2)' }}>Contenidos</b>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {k.contenidos.map(c => (
            <span key={c.id} style={{ ...chip(true, 'var(--teal)'), cursor: 'default', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {c.nombre}
              {puede && (
                <>
                  <button type="button" onClick={() => { const nombre = pedir('Cambiar el contenido:', c.nombre); if (nombre) hacer(() => api(`/api/admin/evaluacion/contenidos/${c.id}`, { method: 'PUT', body: { nombre } })); }}
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', lineHeight: 0 }} aria-label={`Cambiar «${c.nombre}»`}><I.Edit width={11} height={11} /></button>
                  <button type="button" onClick={() => { if (window.confirm(`¿Quitar «${c.nombre}»?`)) hacer(() => api(`/api/admin/evaluacion/contenidos/${c.id}`, { method: 'DELETE' })); }}
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', lineHeight: 0 }} aria-label={`Quitar «${c.nombre}»`}><I.X width={11} height={11} /></button>
                </>
              )}
            </span>
          ))}
          {!k.contenidos.length && <span style={suave}>Sin contenidos.</span>}
          {puede && <button type="button" className="btn btn-sm btn-outline" style={{ fontSize: 11 }} onClick={() => { const nombre = pedir(`Nuevo contenido de ${k.nombre}:`); if (nombre) hacer(() => api('/api/admin/evaluacion/contenidos', { method: 'POST', body: { categoriaId: k.id, nombre } })); }}>+ Contenido</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <b style={{ fontSize: 12, color: 'var(--ink-2)' }}>Objetivos</b>
        {k.objetivos.map(o => (
          <div key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}>
            <span style={{ color: 'var(--purple)', fontWeight: 800 }}>•</span>
            <span style={{ flex: 1 }}>
              {o.texto}
              {o.contenidoIds.length > 0 && <span style={{ ...suave, display: 'block' }}>Contenidos: {o.contenidoIds.map(nombreCont).filter(Boolean).join(', ')}</span>}
            </span>
            {puede && (
              <>
                <button className="btn btn-sm btn-ghost" onClick={() => setObjetivo({ ...o })} aria-label="Cambiar el objetivo"><I.Edit width={13} height={13} /></button>
                <button className="btn btn-sm btn-ghost" style={{ color: 'var(--orange)' }} onClick={() => { if (window.confirm('¿Borrar este objetivo?')) hacer(() => api(`/api/admin/evaluacion/objetivos/${o.id}`, { method: 'DELETE' })); }} aria-label="Borrar el objetivo"><I.Trash width={13} height={13} /></button>
              </>
            )}
          </div>
        ))}
        {!k.objetivos.length && !objetivo && <span style={suave}>Sin objetivos.</span>}
        {objetivo && (
          <form onSubmit={e => { e.preventDefault(); hacer(() => api(objetivo.id ? `/api/admin/evaluacion/objetivos/${objetivo.id}` : '/api/admin/evaluacion/objetivos', { method: objetivo.id ? 'PUT' : 'POST', body: { categoriaId: k.id, texto: objetivo.texto, contenidoIds: objetivo.contenidoIds } }), 'Objetivo guardado.').then(bien => { if (bien) setObjetivo(null); }); }}
            style={{ display: 'grid', gap: 8, background: 'var(--bg-3)', borderRadius: 10, padding: 10 }}>
            <textarea autoFocus required rows={2} value={objetivo.texto} onChange={e => setObjetivo(x => ({ ...x, texto: e.target.value }))} placeholder="El alumno es capaz de…" style={{ ...campo, background: 'var(--bg-2)', resize: 'vertical' }} />
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Contenidos con los que se relaciona</span>
            <SelectorContenidos categorias={[k]} valor={objetivo.contenidoIds} onCambio={v => setObjetivo(x => ({ ...x, contenidoIds: v }))} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setObjetivo(null)}>Cancelar</button>
              <button type="submit" className="btn btn-sm btn-primary">Guardar</button>
            </div>
          </form>
        )}
        {puede && !objetivo && <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start', fontSize: 11 }} onClick={() => setObjetivo({ texto: '', contenidoIds: [] })}>+ Objetivo</button>}
      </div>
    </div>
  );
}
