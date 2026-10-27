import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import AdminCampanas, { Rebotes } from './AdminCampanas.jsx';
import AdminAutomatismos from './AdminAutomatismos.jsx';
import AdminPublicaciones from './AdminPublicaciones.jsx';
import { TIPOS_CORREO, describirSegmento } from './crmTextos.js';
import { Paso, Opcion } from './CrmPiezas.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Comunicaciones (CRM). Los segmentos (ticket #313) son grupos de alumnos a los
// que escribir, sacados de los datos del club; se guardan con nombre y los usan
// las campañas (#314). Se crean en tres pasos (qué alumnos, afinar, a quién se
// escribe) con un resumen al lado que dice en una frase quién entra y cuántos
// correos saldrían con cada tipo de correo. El tipo lo pone la campaña, no el
// segmento: aquí solo se enseña cómo cambia la cuenta.
// ─────────────────────────────────────────────────────────────────────────────

const VACIO = { actividades: [], clases: [], estado: 'activos', edadMin: '', edadMax: '', pendientes: false, faltasMin: '', campamento: false, destino: 'familia', tipo: 'servicio' };
const pastilla = (activo) => ({
  padding: '6px 12px', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', border: 0,
  background: activo ? 'var(--purple)' : 'transparent', color: activo ? '#fff' : 'var(--ink-2)',
});
const grupoPastillas = { display: 'inline-flex', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden', background: 'var(--bg-3)' };
const inp = { fontFamily: 'inherit', fontSize: 13, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' };
const mismo = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Comunicaciones: pestañas de segmentos, campañas, automatismos y diseño de
// correos. La pestaña la
// lleva el panel (se elige también desde el menú del CRM); si no se la pasan,
// la guarda ella misma.
export default function AdminComunicaciones({ showToast, onAbrirFicha, pestana: pestanaFuera, onPestana }) {
  const [pestanaDentro, setPestanaDentro] = useState('segmentos');
  const pestana = pestanaFuera || pestanaDentro;
  const setPestana = onPestana || setPestanaDentro;
  // «Usar en una campaña» desde un segmento: abre una campaña nueva con él.
  const [campanaCon, setCampanaCon] = useState(null);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...grupoPastillas, justifySelf: 'start' }}>
        <button type="button" style={{ ...pastilla(pestana === 'publicaciones'), padding: '8px 16px', fontSize: 13 }} onClick={() => setPestana('publicaciones')}>Publicaciones</button>
        <button type="button" style={{ ...pastilla(pestana === 'segmentos'), padding: '8px 16px', fontSize: 13 }} onClick={() => setPestana('segmentos')}>Segmentos</button>
        <button type="button" style={{ ...pastilla(pestana === 'campanas'), padding: '8px 16px', fontSize: 13 }} onClick={() => setPestana('campanas')}>Campañas</button>
        <button type="button" style={{ ...pastilla(pestana === 'automatismos'), padding: '8px 16px', fontSize: 13 }} onClick={() => setPestana('automatismos')}>Automatismos</button>
        <button type="button" style={{ ...pastilla(pestana === 'rebotes'), padding: '8px 16px', fontSize: 13 }} onClick={() => setPestana('rebotes')}>Rebotes</button>
      </div>
      {pestana === 'segmentos' && <Segmentos showToast={showToast} onAbrirFicha={onAbrirFicha}
        onUsarEnCampana={(nombre) => { setCampanaCon(nombre); setPestana('campanas'); }} />}
      {pestana === 'campanas' && <AdminCampanas showToast={showToast} onAbrirFicha={onAbrirFicha} onIrARebotes={() => setPestana('rebotes')}
        nuevaConSegmento={campanaCon} onEmpezada={() => setCampanaCon(null)} onIrASegmentos={() => setPestana('segmentos')} />}
      {pestana === 'automatismos' && <AdminAutomatismos showToast={showToast} onAbrirFicha={onAbrirFicha} />}
      {pestana === 'publicaciones' && <AdminPublicaciones showToast={showToast} />}
      {pestana === 'rebotes' && <Rebotes onAbrirFicha={onAbrirFicha} showToast={showToast} siempreAbierto />}
    </div>
  );
}

// ── Segmentos: la lista y el editor ──────────────────────────────────────────
function Segmentos({ showToast, onAbrirFicha, onUsarEnCampana }) {
  const [opciones, setOpciones] = useState({ actividades: [], clases: [] });
  const [guardados, setGuardados] = useState(null);
  const [editando, setEditando] = useState(null); // { id, nombre, filtros }
  const [analizando, setAnalizando] = useState(null); // id del segmento

  const cargar = useCallback(() => fetch('/api/admin/segmentos', { credentials: 'include', cache: 'no-store' })
    .then(r => (r.ok ? r.json() : { segmentos: [] })).then(d => setGuardados(d.segmentos || [])).catch(() => setGuardados([])), []);
  useEffect(() => {
    fetch('/api/admin/segmentos/opciones', { credentials: 'include' }).then(r => (r.ok ? r.json() : null)).then(d => d && setOpciones(d)).catch(() => {});
    cargar();
  }, [cargar]);

  async function guardarLista(lista, aviso) {
    const r = await fetch('/api/admin/segmentos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ segmentos: lista }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { alert(d.error || 'No se ha podido guardar.'); return null; }
    setGuardados(d.segmentos); showToast?.(aviso);
    return d.segmentos;
  }

  if (analizando) return <AnalisisSegmento id={analizando} onVolver={() => setAnalizando(null)} />;
  // Una lista hecha a mano (#499): sus personas, no filtros.
  if (editando?.manual) {
    return <EditorLista listaId={editando.filtros.lista} showToast={showToast} onVolver={() => { setEditando(null); cargar(); }}
      onUsarEnCampana={onUsarEnCampana ? () => onUsarEnCampana(editando.nombre) : null} />;
  }
  if (editando) {
    return <EditorSegmento inicial={editando} opciones={opciones} guardados={guardados || []} guardarLista={guardarLista}
      onAbrirFicha={onAbrirFicha} onUsarEnCampana={onUsarEnCampana} onVolver={() => setEditando(null)} />;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}><I.Users /> Segmentos</h2>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm btn-outline" title="Una lista de personas que no son alumnos (AMPAs, colegios, asociaciones…)"
            onClick={async () => {
              const nombre = window.prompt('Nombre del segmento a mano (por ejemplo «AMPAs de colegios»):');
              if (!nombre?.trim()) return;
              const r = await fetch('/api/admin/listas', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: nombre.trim() }) });
              const d = await r.json().catch(() => ({}));
              if (!r.ok) { alert(d.error || 'No se ha podido crear.'); return; }
              setEditando({ id: `lista-${d.id}`, nombre: nombre.trim(), manual: true, filtros: { estado: 'lista', lista: d.id } });
            }}><I.Plus /> Nuevo segmento a mano</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditando({ id: '', nombre: '', filtros: VACIO })}><I.Plus /> Crear segmento</button>
        </div>
        <p className="sub" style={{ marginBottom: 0 }}>
          Un segmento es un grupo de alumnos al que escribir, por ejemplo «Padres de Ballet de 6 a 10 años».
          Lo creas aquí una vez y luego lo eliges al preparar una campaña. Los «a mano» son listas de personas que no son alumnos
          (AMPAs, colegios, asociaciones…): se apuntan una a una o pegando una lista, y salen en Personas → Contactos.
        </p>
      </div>

      {guardados === null && <p style={{ color: 'var(--ink-3)', margin: 0 }}>Cargando…</p>}
      {guardados?.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          Todavía no hay ningún segmento. Pulsa <b>Crear segmento</b> para hacer el primero.
        </div>
      )}
      {guardados?.length > 0 && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {guardados.map(s => (
            <div key={s.id} className="panel" style={{ margin: 0, display: 'grid', gap: 6, alignContent: 'start' }}>
              <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>{s.nombre}{s.manual && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: 'var(--purple)', background: 'color-mix(in oklab, var(--purple) 12%, transparent)', padding: '2px 8px', borderRadius: 999, verticalAlign: 'middle' }}>a mano · {s.personas}</span>}</span>
              <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>{describirSegmento({ ...VACIO, ...s.filtros }, opciones.clases)}</span>
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditando(s.manual ? s : { id: s.id, nombre: s.nombre, filtros: { ...VACIO, ...s.filtros } })}>Abrir</button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setAnalizando(s.id)}><I.Chart width={14} height={14} /> Análisis</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Un segmento a mano: la lista y sus personas (#499) ───────────────────────
const campoL = { fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', minWidth: 0, width: '100%', boxSizing: 'border-box' };
async function apiL(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido.');
  return d;
}
function EditorLista({ listaId, onVolver, onUsarEnCampana, showToast }) {
  const [lista, setLista] = useState(null);
  const [personas, setPersonas] = useState(null);
  const [nueva, setNueva] = useState({ nombre: '', entidad: '', cargo: '', email: '', telefono: '' });
  const [pegar, setPegar] = useState(null);
  const cargar = useCallback(async () => {
    const [l, p] = await Promise.all([apiL('/api/admin/listas'), apiL(`/api/admin/listas/personas?lista=${listaId}`)]);
    setLista(l.listas.find(x => x.id === listaId) || null); setPersonas(p.personas);
  }, [listaId]);
  useEffect(() => { cargar().catch(e => alert(e.message)); }, [cargar]);
  async function anadir(e) {
    e.preventDefault();
    try { await apiL('/api/admin/listas/personas', { method: 'POST', body: { ...nueva, listas: [listaId] } }); setNueva({ nombre: '', entidad: '', cargo: '', email: '', telefono: '' }); await cargar(); }
    catch (err) { alert(err.message); }
  }
  async function quitar(p) {
    try { await apiL(`/api/admin/listas/personas/${p.id}`, { method: 'PATCH', body: { ...p, listas: p.listas.filter(x => x !== listaId) } }); await cargar(); }
    catch (err) { alert(err.message); }
  }
  async function pegarTodo() {
    try {
      const d = await apiL(`/api/admin/listas/${listaId}/pegar`, { method: 'POST', body: { texto: pegar } });
      showToast?.(`${d.nuevas} nuevas${d.ya ? ` y ${d.ya} que ya estaban` : ''} en la lista.`);
      if (d.malas.length) alert(`Estas no se han podido apuntar:\n${d.malas.join('\n')}`);
      setPegar(null); await cargar();
    } catch (err) { alert(err.message); }
  }
  if (!lista) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  return (
    <div style={{ display: 'grid', gap: 14 }} data-editor-lista>
      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={onVolver}>← Tus segmentos</button>
          <input defaultValue={lista.nombre} aria-label="Nombre de la lista" style={{ ...campoL, fontWeight: 800, fontSize: 16, flex: '1 1 220px', width: 'auto' }}
            onBlur={e => e.target.value.trim() && e.target.value.trim() !== lista.nombre && apiL(`/api/admin/listas/${listaId}`, { method: 'PATCH', body: { nombre: e.target.value } }).then(cargar).catch(err => alert(err.message))} />
          {onUsarEnCampana && <button type="button" className="btn btn-sm btn-primary" disabled={!personas?.length} onClick={onUsarEnCampana}>Usar en una campaña</button>}
          <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--pink)' }}
            onClick={() => window.confirm(`¿Borrar la lista «${lista.nombre}»? Sus personas siguen en Personas → Contactos.`) && apiL(`/api/admin/listas/${listaId}`, { method: 'DELETE' }).then(onVolver).catch(err => alert(err.message))}>Borrar la lista</button>
        </div>
        <p className="sub" style={{ margin: 0 }}>Segmento hecho a mano: escribe a estas personas desde una campaña. No son alumnos: no reciben nada si su correo rebota y, la publicidad, si se dieron de baja.</p>
      </div>
      <form className="panel" onSubmit={anadir} style={{ display: 'grid', gap: 8 }}>
        <b style={{ fontSize: 14 }}>Añadir una persona</b>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {[['nombre', 'Nombre'], ['entidad', 'Entidad (colegio, AMPA…)'], ['cargo', 'Cargo'], ['email', 'Correo'], ['telefono', 'Teléfono']].map(([k, t]) => (
            <input key={k} placeholder={t} aria-label={t} value={nueva[k]} onChange={e => setNueva(n => ({ ...n, [k]: e.target.value }))} style={campoL} type={k === 'email' ? 'email' : 'text'} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-sm btn-primary">Añadir</button>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setPegar('')}>Pegar muchas de golpe</button>
        </div>
        {pegar !== null && (
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Una por línea: «Nombre; Entidad; Cargo; Correo; Teléfono» (también separadas por comas o copiadas de Excel). Con el correo basta. Si alguien ya está, no se repite.</span>
            <textarea rows={6} value={pegar} onChange={e => setPegar(e.target.value)} style={{ ...campoL, resize: 'vertical' }} placeholder={'Ana López; AMPA CEIP San Isidro; Presidenta; ampa.sanisidro@gmail.com; 600 000 000'} />
            <div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn btn-sm btn-primary" disabled={!pegar.trim()} onClick={pegarTodo}>Apuntarlas</button><button type="button" className="btn btn-sm btn-outline" onClick={() => setPegar(null)}>Cancelar</button></div>
          </div>
        )}
      </form>
      <div className="panel" style={{ display: 'grid', gap: 6 }}>
        <b style={{ fontSize: 14 }}>En la lista ({personas?.length || 0})</b>
        {!personas?.length && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Aún no hay nadie.</span>}
        {personas?.map(p => (
          <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: 13, flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 200px', minWidth: 0 }}><b>{p.nombre || p.entidad || p.email}</b>{p.nombre && p.entidad ? ` · ${p.entidad}` : ''}{p.cargo ? ` · ${p.cargo}` : ''}</span>
            <span style={{ color: 'var(--ink-3)' }}>{p.email || 'sin correo'}{p.telefono ? ` · ${p.telefono}` : ''}</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => quitar(p)}>Quitar de la lista</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Análisis de un segmento (#341) ──────────────────────────────────────────
// Cómo cambia de tamaño (una foto al día) y cómo responden sus familias: a las
// campañas, por la web (consultas) y visitándola (quien aceptó el análisis).
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '—');
const fechaCorta = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
function Dato({ v, t, d }) {
  return (
    <div style={{ background: 'var(--bg-3)', borderRadius: 12, padding: '10px 14px', minWidth: 120 }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 700 }}>{t}</div>
      {d && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{d}</div>}
    </div>
  );
}
function LineaTamano({ puntos }) {
  const W = 640, H = 150, P = 24;
  const max = Math.max(...puntos.map(p => p.total), 1), min = Math.min(...puntos.map(p => p.total), 0);
  const t0 = new Date(puntos[0].fecha).getTime(), t1 = new Date(puntos[puntos.length - 1].fecha).getTime() || t0 + 1;
  const x = (f) => P + ((new Date(f).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (v) => H - P - ((v - min) / Math.max(1, max - min)) * (H - 2 * P);
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(p.fecha).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Tamaño del segmento a lo largo del tiempo">
      <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--line)" />
      <path d={d} fill="none" stroke="var(--purple)" strokeWidth="2.5" strokeLinejoin="round" />
      {puntos.map((p, i) => <circle key={p.fecha} cx={x(p.fecha)} cy={y(p.total)} r={i === puntos.length - 1 ? 4 : 2.5} fill="var(--purple)"><title>{`${fechaCorta(p.fecha)}: ${p.total}`}</title></circle>)}
      <text x={P} y={H - 6} fontSize="11" fill="var(--ink-3)">{fechaCorta(puntos[0].fecha)}</text>
      <text x={W - P} y={H - 6} fontSize="11" fill="var(--ink-3)" textAnchor="end">{fechaCorta(puntos[puntos.length - 1].fecha)}</text>
      <text x={P} y={14} fontSize="11" fill="var(--ink-3)">{max}</text>
    </svg>
  );
}
function AnalisisSegmento({ id, onVolver }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(`/api/admin/segmentos/${encodeURIComponent(id)}/analisis`, { credentials: 'include', cache: 'no-store' })
      .then(async r => { const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'No se ha podido cargar.'); return x; })
      .then(setD).catch(e => setError(e.message));
  }, [id]);
  if (error) return <div className="panel"><button type="button" className="btn btn-sm btn-outline" onClick={onVolver}>← Segmentos</button><p>{error}</p></div>;
  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Calculando el análisis…</p>;
  const h = d.historial;
  // Hace 30 días (o el primer día medido, si es más reciente).
  const hace = h.find(p => new Date(p.fecha) >= new Date(Date.now() - 30 * 864e5)) || h[0];
  const cambio = hace && h.length > 1 ? d.total - hace.total : null;
  const k = d.campanas, v = d.visitas;
  const maxSem = Math.max(1, ...v.porSemana.map(x => x.n));
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="panel" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={onVolver}>← Segmentos</button>
          <h2 style={{ margin: 0 }}>{d.segmento.nombre}</h2>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Dato v={d.total} t="alumnos ahora" d={cambio === null ? 'se mide desde hoy' : `${cambio > 0 ? '+' : ''}${cambio} desde el ${fechaCorta(hace.fecha)}`} />
        </div>
        {h.length > 1
          ? <LineaTamano puntos={h} />
          : <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>El tamaño se apunta una vez al día: a partir de mañana se verá aquí cómo cambia.</p>}
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <div className="panel" style={{ margin: 0, display: 'grid', gap: 10 }}>
          <b>Campañas · últimos 90 días</b>
          {k.enviados ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Dato v={k.enviados} t="correos recibidos" />
              <Dato v={pct(k.abiertos, k.enviados)} t="apertura" d={`${k.abiertos} los abrieron`} />
              <Dato v={pct(k.conClic, k.enviados)} t="clics" d={`${k.conClic} pincharon`} />
              <Dato v={pct(k.bajas, k.enviados)} t="bajas" d={`${k.bajas} se dieron de baja`} />
            </div>
          ) : <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>No les ha llegado ninguna campaña en estos 90 días.</p>}
        </div>

        <div className="panel" style={{ margin: 0, display: 'grid', gap: 10 }}>
          <b>La web</b>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Dato v={d.web.consultas} t="consultas · 90 días" d={`de ${d.web.personas} ${d.web.personas === 1 ? 'persona' : 'personas'}`} />
            <Dato v={v.personas} t="la visitaron · 30 días" d={`${v.paginas} páginas vistas`} />
          </div>
          {v.porSemana.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }}>Páginas vistas por semana</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 70 }}>
                {v.porSemana.map(x => <div key={x.semana} title={`Semana del ${fechaCorta(x.semana)}: ${x.n}`} style={{ flex: 1, height: `${Math.max(4, (x.n / maxSem) * 100)}%`, background: 'var(--purple)', borderRadius: '4px 4px 0 0' }} />)}
              </div>
            </div>
          )}
          {v.paginasMas.length > 0 && (
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Lo que más miran</div>
              {v.paginasMas.map(x => <div key={x.ruta} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{x.ruta}</span><b>{x.n}</b></div>)}
            </div>
          )}
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Las visitas solo cuentan a quien aceptó las cookies de análisis y está relacionado con su ficha (entró a su cuenta o nos escribió).</span>
        </div>
      </div>
    </div>
  );
}

function EditorSegmento({ inicial, opciones, guardados, guardarLista, onAbrirFicha, onUsarEnCampana, onVolver }) {
  const [id, setId] = useState(inicial.id);
  const [nombre, setNombre] = useState(inicial.nombre);
  const [f, setF] = useState(inicial.filtros);
  const [guardado, setGuardado] = useState({ nombre: inicial.nombre, filtros: inicial.filtros });
  const [res, setRes] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [verClases, setVerClases] = useState(inicial.filtros.clases?.length > 0);
  const [qClase, setQClase] = useState('');
  const [verLista, setVerLista] = useState(false);

  // La cuenta se rehace sola al tocar algo (con una pequeña espera). La lista
  // se pide como «aviso del club», que es la que llega a todos los que tienen
  // correo; cada fila dice además qué otros tipos recibiría.
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      setCargando(true);
      try {
        const r = await fetch('/api/admin/segmentos/vista', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ filtros: { ...f, tipo: 'servicio' } }),
        });
        if (r.ok && vivo) setRes(await r.json());
      } catch { /* noop */ } finally { if (vivo) setCargando(false); }
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [f]);

  const cambia = (k, v) => setF(x => ({ ...x, [k]: v }));
  const alterna = (k, v) => setF(x => ({ ...x, [k]: x[k].includes(v) ? x[k].filter(y => y !== v) : [...x[k], v] }));
  const clasesVisibles = useMemo(() => {
    const t = qClase.trim().toLowerCase();
    return opciones.clases.filter(c => (!f.actividades.length || f.actividades.includes(c.actividad))
      && (!t || `${c.nombre} ${c.actividad}`.toLowerCase().includes(t)));
  }, [opciones.clases, f.actividades, qClase]);
  const sinGuardar = !id || nombre.trim() !== guardado.nombre || !mismo(f, guardado.filtros);

  async function guardar() {
    const n = nombre.trim();
    if (!n) { alert('Ponle un nombre al segmento para poder guardarlo.'); return null; }
    if (guardados.some(s => s.id !== id && s.nombre.toLowerCase() === n.toLowerCase())) { alert(`Ya hay otro segmento que se llama «${n}». Ponle otro nombre.`); return null; }
    const lista = id ? guardados.map(s => (s.id === id ? { ...s, nombre: n, filtros: f } : s)) : [...guardados, { id: '', nombre: n, filtros: f }];
    const nuevos = await guardarLista(lista, `Segmento «${n}» guardado.`);
    if (!nuevos) return null;
    const este = nuevos.find(s => s.nombre.toLowerCase() === n.toLowerCase());
    setId(este?.id || ''); setNombre(n); setGuardado({ nombre: n, filtros: f });
    return n;
  }
  async function borrar() {
    if (!id || !window.confirm(`¿Borrar el segmento «${guardado.nombre}»? Las campañas ya enviadas no cambian.`)) return;
    if (await guardarLista(guardados.filter(s => s.id !== id), 'Segmento borrado.')) onVolver();
  }
  async function usarEnCampana() {
    const n = sinGuardar ? await guardar() : nombre.trim();
    if (n) onUsarEnCampana?.(n);
  }
  function volver() {
    if (sinGuardar && (id || nombre.trim() || !mismo(f, VACIO)) && !window.confirm('Hay cambios sin guardar. ¿Salir igualmente?')) return;
    onVolver();
  }
  function exportar() {
    if (!res) return;
    const si = (b) => (b ? 'Sí' : 'No');
    const filas = [['Alumno', 'Edad', 'Clases', 'Se escribe a', 'Relación', 'Correo', 'Aviso del club', 'Novedades de sus clases', 'Publicidad y ofertas']];
    for (const a of res.alumnos) {
      const r = a.recibe || {};
      if (!a.destinatarios.length) filas.push([a.nombre, a.edad ?? '', a.clases, '', '', 'Sin correo', 'No', 'No', 'No']);
      else for (const d of a.destinatarios) filas.push([a.nombre, a.edad ?? '', a.clases, d.nombre, d.relacion, d.email, si(r.servicio), si(r.actividades), si(r.comercial)]);
    }
    const csv = filas.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `segmento-${(nombre.trim() || 'sin-nombre').replace(/[^\w-]+/g, '_')}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const r = res?.resumen;
  const esContactos = f.estado === 'contactos';
  // La edad cuenta como una sola condición aunque tenga «desde» y «hasta».
  const afinados = [f.edadMin || f.edadMax, Number(f.faltasMin) > 0, f.pendientes, f.campamento].filter(Boolean).length;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={volver}>← Tus segmentos</button>
        <input style={{ ...inp, fontSize: 15, fontWeight: 700, flex: '1 1 260px', padding: '9px 12px' }} value={nombre} onChange={e => setNombre(e.target.value)}
          placeholder="Ponle un nombre, p. ej. «Padres de Ballet»" aria-label="Nombre del segmento" />
        {id && <button type="button" className="btn btn-sm btn-outline" onClick={borrar}><I.Trash /> Borrar</button>}
        <button type="button" className="btn btn-sm btn-primary" onClick={guardar} disabled={!sinGuardar}>{sinGuardar ? 'Guardar' : 'Guardado ✓'}</button>
      </div>

      <div className="seg-editor">
        <div className="panel" style={{ display: 'grid', gap: 26, margin: 0 }}>
          <Paso n={1} titulo="¿A quién?">
            <div role="radiogroup" aria-label="A quién" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Opcion activa={f.estado === 'activos'} onClick={() => cambia('estado', 'activos')} titulo="Alumnos actuales" texto="Apuntados ahora a alguna clase." />
              <Opcion activa={f.estado === 'baja'} onClick={() => cambia('estado', 'baja')} titulo="Antiguos alumnos" texto="Estuvieron apuntados y ya no vienen." />
              <Opcion activa={f.estado === 'todos'} onClick={() => cambia('estado', 'todos')} titulo="Actuales y antiguos" texto="Todos los que han pasado por el club." />
              <Opcion activa={esContactos} onClick={() => cambia('estado', 'contactos')} titulo="Personas que escribieron por la web" texto="Nos enviaron una consulta. No son alumnos: solo reciben publicidad, si la aceptaron." />
            </div>
            {!esContactos && <div style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>De qué actividades</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className={`filter-pill ${!f.actividades.length ? 'is-active' : ''}`} onClick={() => cambia('actividades', [])}>Todas</button>
                {opciones.actividades.map(a => (
                  <button key={a} type="button" aria-pressed={f.actividades.includes(a)} className={`filter-pill ${f.actividades.includes(a) ? 'is-active' : ''}`} onClick={() => alterna('actividades', a)}>{a}</button>
                ))}
              </div>
            </div>}
            {!esContactos && <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={verClases || f.clases.length > 0} onChange={e => { setVerClases(e.target.checked); if (!e.target.checked) cambia('clases', []); }} />
                Solo algunas clases{f.clases.length ? ` (${f.clases.length} elegida${f.clases.length !== 1 ? 's' : ''})` : ''}
              </label>
              {(verClases || f.clases.length > 0) && (
                <div style={{ display: 'grid', gap: 6, border: '1px solid var(--line)', borderRadius: 10, padding: 10, maxHeight: 240, overflowY: 'auto' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Marca las clases. Si marcas alguna, cuentan solo esas.</span>
                  <input style={inp} placeholder="Buscar clase…" value={qClase} onChange={e => setQClase(e.target.value)} />
                  {clasesVisibles.map(c => (
                    <label key={c.id} style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'center' }}>
                      <input type="checkbox" checked={f.clases.includes(c.id)} onChange={() => alterna('clases', c.id)} />
                      {c.nombre} <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>· {c.actividad}</span>
                    </label>
                  ))}
                  {!clasesVisibles.length && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Ninguna clase con esa búsqueda.</span>}
                </div>
              )}
            </div>}
          </Paso>

          {!esContactos && <Paso n={2} titulo="¿Quieres afinar más?" ayuda={`Opcional. Déjalo en blanco si no hace falta.${afinados ? ` Ahora mismo: ${afinados} ${afinados === 1 ? 'condición' : 'condiciones'}.` : ''}`}>
            <div style={{ display: 'grid', gap: 10 }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
                Que tengan entre
                <input type="number" min="0" max="99" style={{ ...inp, width: 64 }} value={f.edadMin} onChange={e => cambia('edadMin', e.target.value)} aria-label="Edad desde" />
                y
                <input type="number" min="0" max="99" style={{ ...inp, width: 64 }} value={f.edadMax} onChange={e => cambia('edadMax', e.target.value)} aria-label="Edad hasta" />
                años
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
                Que hayan faltado
                <input type="number" min="0" style={{ ...inp, width: 64 }} value={f.faltasMin} onChange={e => cambia('faltasMin', e.target.value)} aria-label="Faltas mínimas este mes" />
                veces o más este mes
              </span>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={f.pendientes} onChange={e => cambia('pendientes', e.target.checked)} /> Que tengan recibos sin pagar</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={f.campamento} onChange={e => cambia('campamento', e.target.checked)} /> Que estén apuntados al campamento</label>
            </div>
          </Paso>}

          {!esContactos && <Paso n={3} titulo="¿A quién le escribimos?">
            <div role="radiogroup" aria-label="A quién se escribe" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Opcion activa={f.destino !== 'alumno'} onClick={() => cambia('destino', 'familia')} titulo="A sus padres o tutores"
                texto="Lo habitual. Si un alumno no tiene padres o tutores con correo, se le escribe a él." />
              <Opcion activa={f.destino === 'alumno'} onClick={() => cambia('destino', 'alumno')} titulo="Al propio alumno"
                texto="A su propio correo, también si es menor: sus padres lo autorizan al firmar la matrícula." />
            </div>
          </Paso>}
        </div>

        <aside className="panel seg-resumen" style={{ margin: 0, display: 'grid', gap: 14 }} aria-live="polite">
          <div>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Resumen</span>
            <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--ink)' }}>{describirSegmento(f, opciones.clases)}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{r ? r.alumnos : '…'}</span>
            <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{esContactos ? 'persona' : 'alumno'}{r?.alumnos === 1 ? '' : 's'} en el segmento{cargando ? ' · contando…' : ''}</span>
          </div>
          {r && (
            <div style={{ display: 'grid', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Cuántos correos saldrían según lo que mandes:</span>
              {TIPOS_CORREO.map(t => {
                const c = r.porTipo?.[t.id];
                return (
                  <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: 'var(--bg-3)' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{t.nombre}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>{t.quien}</span>
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', fontWeight: 800, fontSize: 18 }}>{c ? c.correos : '—'}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>correo{c?.correos === 1 ? '' : 's'}</span>
                    </span>
                  </div>
                );
              })}
              {r.sinCorreo > 0 && <span style={{ fontSize: 12, color: 'var(--orange)' }}>{r.sinCorreo} alumno{r.sinCorreo !== 1 ? 's' : ''} no {r.sinCorreo !== 1 ? 'tienen' : 'tiene'} ningún correo al que escribir.</span>}
              {r.rebotan > 0 && <span style={{ fontSize: 12, color: 'var(--orange)' }}>{r.rebotan} {r.rebotan !== 1 ? 'se quedan' : 'se queda'} fuera porque su correo rebota (se ve en Comunicación → «Rebotes»).</span>}
              {r.limite && <span style={{ fontSize: 12, color: 'var(--orange)' }}>Se cuentan los 2.000 primeros: afina un poco más.</span>}
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={usarEnCampana} disabled={!r?.alumnos}>Usar en una campaña →</button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm btn-outline" style={{ flex: 1 }} onClick={() => setVerLista(v => !v)} disabled={!r?.alumnos}>{verLista ? 'Ocultar la lista' : 'Ver quiénes son'}</button>
              <button type="button" className="btn btn-sm btn-outline" style={{ flex: 1 }} onClick={exportar} disabled={!r?.alumnos}><I.Download /> Descargar</button>
            </div>
          </div>
        </aside>
      </div>

      {verLista && res && res.alumnos.length > 0 && (
        <div className="data-table">
          <div className="data-table-head" style={{ gridTemplateColumns: '1.2fr 60px 1.3fr 1.8fr 1.3fr' }}>
            <span>Alumno</span><span>Edad</span><span>Clases</span><span>Se escribe a</span><span>Qué recibe</span>
          </div>
          {res.alumnos.slice(0, 300).map(a => (
            <div key={a.id} className="data-table-row" style={{ gridTemplateColumns: '1.2fr 60px 1.3fr 1.8fr 1.3fr', alignItems: 'center' }}>
              <button type="button" onClick={() => !a.esContacto && onAbrirFicha?.({ id: a.id })}
                style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontWeight: 800, fontSize: 14, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>{a.nombre}</button>
              <span style={{ fontSize: 13 }}>{a.edad ?? '—'}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{a.clases || '—'}</span>
              <span style={{ fontSize: 12 }}>
                {a.destinatarios.length
                  ? a.destinatarios.map(d => <span key={d.email} style={{ display: 'block' }}>{d.nombre} <span style={{ color: 'var(--ink-3)' }}>· {d.relacion} · {d.email}</span></span>)
                  : <span style={{ color: 'var(--orange)', fontWeight: 700 }}>Sin correo</span>}
              </span>
              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {TIPOS_CORREO.map(t => {
                  const si = !!a.recibe?.[t.id];
                  return (
                    <span key={t.id} title={`${t.nombre}: ${si ? 'sí' : 'no'}`} style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                      background: si ? 'color-mix(in oklab, var(--teal) 16%, transparent)' : 'var(--bg-3)',
                      color: si ? 'var(--teal)' : 'var(--ink-3)', textDecoration: si ? 'none' : 'line-through',
                    }}>{{ servicio: 'Avisos', actividades: 'Novedades', comercial: 'Publicidad' }[t.id]}</span>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      )}
      {verLista && res && res.alumnos.length > 300 && <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>Se enseñan los 300 primeros; en «Descargar» van todos.</p>}
      {res && !res.alumnos.length && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          Ningún alumno cumple todo eso. Prueba a quitar alguna condición.
        </div>
      )}
    </div>
  );
}
