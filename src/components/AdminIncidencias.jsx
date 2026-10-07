import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { fmtFechaHora } from '../fechas.js';
import { NOMBRE_RANGO } from '../../permisos.js';

// ─────────────────────────────────────────────────────────────────────────────
// Incidencias (#383): lo que pasa en clase, en secretaría, con un pago… y hay que
// dejar registrado. Se escribe qué ha pasado y quién está implicado; el día y
// quién lo registra van solos, y la clase si se anota desde la lista. Secretaría
// y dirección las ven todas; la dirección les pone responsable y fecha límite y
// las da por resueltas (también quien la tiene encargada). El resto ve las suyas:
// las que ha escrito, las que tiene encargadas y en las que le han implicado
// (#401). El personal implicado recibe un aviso al registrarla y al resolverla.
// ─────────────────────────────────────────────────────────────────────────────

const ESTADOS = {
  abierta: { label: 'Abierta', color: 'var(--orange)' },
  resuelta: { label: 'Resuelta', color: 'var(--teal)' },
};
const chip = (color, extra = {}) => ({ fontSize: 11, fontWeight: 800, color, background: `color-mix(in oklab, ${color} 13%, var(--bg-2))`, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', ...extra });
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box' };
const hoyISO = () => new Date().toLocaleDateString('sv-SE');
const fmtDia = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const quienEs = (rango) => (rango === 'student' ? 'alumno/a' : (NOMBRE_RANGO[rango] || '').toLowerCase());

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

// Registrar una incidencia. Desde la lista de clase llega la clase fijada y sus
// alumnos, para marcarlos con un toque (y se sugieren también sus profes, #401);
// a cualquiera se le busca por el nombre.
export function FormIncidencia({ grupo = null, sugeridos: alumnosSugeridos = [], onCerrar, onGuardada, showToast }) {
  const [texto, setTexto] = useState('');
  const [implicados, setImplicados] = useState([]); // { id, nombre, rango? }
  const [grupoId, setGrupoId] = useState(grupo?.id || '');
  const [grupos, setGrupos] = useState([]);
  const [docentes, setDocentes] = useState([]); // los profes de la clase, sin contarme a mí
  const [q, setQ] = useState('');
  const [encontrados, setEncontrados] = useState([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api(`/api/admin/incidencias/opciones${grupo?.id ? `?grupo=${encodeURIComponent(grupo.id)}` : ''}`)
      .then(d => { setGrupos(d.grupos || []); setDocentes(d.docentes || []); }).catch(() => {});
  }, [grupo?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sugeridos = useMemo(() => [...docentes, ...alumnosSugeridos.filter(a => !docentes.some(p => p.id === a.id))], [docentes, alumnosSugeridos]);
  useEffect(() => {
    if (q.trim().length < 2) { setEncontrados([]); return; }
    const t = setTimeout(() => api(`/api/admin/incidencias/personas?q=${encodeURIComponent(q.trim())}`).then(d => setEncontrados(d.personas || [])).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCerrar]);

  const marcado = (id) => implicados.some(x => x.id === id);
  const alternar = (p) => setImplicados(l => (l.some(x => x.id === p.id) ? l.filter(x => x.id !== p.id) : [...l, p]));
  async function guardar() {
    setGuardando(true);
    try {
      const d = await api('/api/admin/incidencias', { method: 'POST', body: { texto, implicados: implicados.map(x => x.id), groupId: grupoId || null } });
      showToast?.('Incidencia registrada.');
      onGuardada?.(d.incidencia);
    } catch (e) { alert(e.message); }
    finally { setGuardando(false); }
  }
  const sinSugerir = encontrados.filter(p => !sugeridos.some(s => s.id === p.id));

  return (
    <div role="dialog" aria-modal="true" aria-label="Registrar una incidencia" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2)', borderRadius: 16, width: 'min(640px, 100%)', maxHeight: '92vh', overflow: 'auto', padding: 20, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>Registrar una incidencia</h2>
          <button type="button" className="icon-btn" onClick={onCerrar} aria-label="Cerrar"><I.X /></button>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)' }}>
          Se guarda con la fecha de hoy y tu nombre{grupo ? <> y la clase <b>{grupo.nombre}</b></> : ''}. La ve la dirección, que puede encargársela a alguien, y también el personal que marques como implicado: le llega un aviso ahora y otro cuando se resuelva.
        </p>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 700 }}>
          ¿Qué ha pasado?
          <textarea autoFocus value={texto} onChange={e => setTexto(e.target.value)} rows={5} maxLength={4000} style={{ ...campo, resize: 'vertical', lineHeight: 1.5 }}
            placeholder="Cuéntalo con detalle: qué pasó, cuándo y qué se hizo en el momento." />
        </label>
        {!grupo && (
          <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 700 }}>
            ¿En qué clase? <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 12 }}>(si fue en una)</span>
            <select value={grupoId} onChange={e => setGrupoId(e.target.value)} style={campo}>
              <option value="">Ninguna (secretaría, un pago, otra cosa…)</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </label>
        )}
        <div style={{ display: 'grid', gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>¿Quién está implicado? <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 12 }}>(alumnos, familias, trabajadores…)</span></span>
          {sugeridos.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {sugeridos.map(p => (
                <button key={p.id} type="button" aria-pressed={marcado(p.id)} onClick={() => alternar(p)}
                  title={p.rango ? 'Profe de esta clase' : undefined}
                  className={`filter-pill ${marcado(p.id) ? 'is-active' : ''}`} style={{ fontSize: 12.5 }}>
                  {p.nombre}{p.rango ? <span style={{ opacity: 0.7, fontWeight: 600 }}> · {quienEs(p.rango)}</span> : null}
                </button>
              ))}
            </div>
          )}
          <input value={q} onChange={e => setQ(e.target.value)} style={campo} placeholder={sugeridos.length ? 'Buscar a alguien más por su nombre…' : 'Buscar por nombre…'} />
          {sinSugerir.length > 0 && (
            <div style={{ display: 'grid', gap: 2, border: '1px solid var(--line)', borderRadius: 10, padding: 4, maxHeight: 180, overflow: 'auto' }}>
              {sinSugerir.map(p => (
                <button key={p.id} type="button" onClick={() => { if (!marcado(p.id)) alternar(p); setQ(''); }}
                  style={{ textAlign: 'left', border: 0, background: 'none', padding: '7px 9px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)' }}>
                  {p.nombre} <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>· {quienEs(p.rango)}</span>
                </button>
              ))}
            </div>
          )}
          {implicados.filter(p => !sugeridos.some(s => s.id === p.id)).length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {implicados.filter(p => !sugeridos.some(s => s.id === p.id)).map(p => (
                <span key={p.id} style={chip('var(--purple)', { display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 })}>
                  {p.nombre}
                  <button type="button" onClick={() => alternar(p)} aria-label={`Quitar a ${p.nombre}`} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={guardando || texto.trim().length < 3} onClick={guardar}>{guardando ? 'Guardando…' : 'Registrar'}</button>
        </div>
      </div>
    </div>
  );
}

// La dirección cambia los implicados después de registrarla (#401). Al personal
// que se añade le llega el aviso, como si estuviera desde el principio.
function EditarImplicados({ inc, onGuardar, onCancelar }) {
  const [lista, setLista] = useState(inc.implicados);
  const [q, setQ] = useState('');
  const [encontrados, setEncontrados] = useState([]);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setEncontrados([]); return; }
    const t = setTimeout(() => api(`/api/admin/incidencias/personas?q=${encodeURIComponent(q.trim())}`).then(d => setEncontrados(d.personas || [])).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const nuevos = encontrados.filter(p => !lista.some(x => x.id === p.id));
  return (
    <div style={{ display: 'grid', gap: 8, background: 'var(--bg-3)', borderRadius: 10, padding: 12 }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>Implicados <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 12 }}>(al personal que añadas le llega un aviso)</span></span>
      {lista.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {lista.map(p => (
            <span key={p.id} style={chip('var(--purple)', { display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 })}>
              {p.nombre}{quienEs(p.rango) ? ` · ${quienEs(p.rango)}` : ''}
              <button type="button" onClick={() => setLista(l => l.filter(x => x.id !== p.id))} aria-label={`Quitar a ${p.nombre}`} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>✕</button>
            </span>
          ))}
        </div>
      )}
      <input value={q} onChange={e => setQ(e.target.value)} style={{ ...campo, background: 'var(--bg-2)' }} placeholder="Añadir a alguien por su nombre…" aria-label="Buscar a quién añadir" />
      {nuevos.length > 0 && (
        <div style={{ display: 'grid', gap: 2, border: '1px solid var(--line)', borderRadius: 10, padding: 4, maxHeight: 180, overflow: 'auto', background: 'var(--bg-2)' }}>
          {nuevos.map(p => (
            <button key={p.id} type="button" onClick={() => { setLista(l => [...l, p]); setQ(''); }}
              style={{ textAlign: 'left', border: 0, background: 'none', padding: '7px 9px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)' }}>
              {p.nombre} <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>· {quienEs(p.rango)}</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={guardando}
          onClick={async () => { setGuardando(true); const ok = await onGuardar(lista.map(x => x.id)); setGuardando(false); if (ok) onCancelar(); }}>
          {guardando ? 'Guardando…' : 'Guardar implicados'}
        </button>
      </div>
    </div>
  );
}

// Filtros que pueden llegar en el enlace (de la campanita o de un correo).
const FILTROS = ['todas', 'mias', 'escritas', 'implicado'];
const ESTADOS_FILTRO = ['abiertas', 'resueltas', 'todas'];
const filtroDe = (params) => (FILTROS.includes(params?.filtro) ? params.filtro : 'todas');
// «Me implican» y «Escritas por mí» llegan también cuando se ha resuelto: ahí se
// abre con todas, para que se vea. «Encargadas a mí», con las abiertas.
const estadoDe = (params) => (ESTADOS_FILTRO.includes(params?.estado) ? params.estado
  : ['implicado', 'escritas'].includes(params?.filtro) ? 'todas' : 'abiertas');

export default function AdminIncidencias({ showToast, enlace }) {
  const [datos, setDatos] = useState(null);
  const [personal, setPersonal] = useState([]);
  const [estado, setEstado] = useState(() => estadoDe(enlace?.params));
  const [filtro, setFiltro] = useState(() => filtroDe(enlace?.params)); // todas | mias | escritas | implicado
  const [q, setQ] = useState('');
  const [nueva, setNueva] = useState(false);
  const [resolviendo, setResolviendo] = useState(null); // { id, texto }
  const [editando, setEditando] = useState(null); // id de la incidencia a la que se cambian los implicados
  // Si se pincha un aviso estando ya aquí, que cambie el filtro igual.
  const pFiltro = enlace?.params?.filtro, pEstado = enlace?.params?.estado;
  useEffect(() => {
    if (!pFiltro && !pEstado) return;
    setFiltro(filtroDe({ filtro: pFiltro })); setEstado(estadoDe({ filtro: pFiltro, estado: pEstado }));
  }, [pFiltro, pEstado]);

  const cargar = useCallback(() => {
    api('/api/admin/incidencias').then(setDatos).catch(e => { showToast?.(e.message); setDatos({ incidencias: [] }); });
  }, [showToast]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (datos?.gestionar && !personal.length) api('/api/admin/incidencias/opciones').then(d => setPersonal(d.personal || [])).catch(() => {});
  }, [datos?.gestionar]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cambiar(inc, cambios, aviso) {
    try {
      const d = await api(`/api/admin/incidencias/${inc.id}`, { method: 'PUT', body: cambios });
      setDatos(x => ({ ...x, incidencias: x.incidencias.map(y => (y.id === inc.id ? d.incidencia : y)) }));
      if (aviso) showToast?.(aviso);
      return true;
    } catch (e) { showToast?.(e.message); return false; }
  }

  const lista = useMemo(() => {
    if (!datos) return [];
    const n = q.trim().toLowerCase();
    return datos.incidencias.filter(i =>
      (estado === 'todas' || (estado === 'abiertas' ? i.estado === 'abierta' : i.estado === 'resuelta'))
      && (filtro === 'todas' || (filtro === 'mias' ? i.responsable?.id === datos.yo
        : filtro === 'implicado' ? i.implicados.some(p => p.id === datos.yo) : i.autor?.id === datos.yo))
      && (!n || [i.texto, i.autor?.nombre, i.clase?.nombre, i.responsable?.nombre, i.resolucion, ...i.implicados.map(p => p.nombre)].some(v => (v || '').toLowerCase().includes(n))));
  }, [datos, estado, filtro, q]);
  const cuantas = (e) => (datos?.incidencias || []).filter(i => (e === 'todas' ? true : e === 'abiertas' ? i.estado === 'abierta' : i.estado === 'resuelta')).length;

  if (!datos) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</p>;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', maxWidth: 720, flex: '1 1 320px' }}>
          Lo que pasa en clase, en secretaría, con un pago… y hay que dejar registrado.
          {datos.verTodas ? ' Aquí están todas las del club.' : ' Aquí ves las que has registrado tú, las que tienes encargadas y aquellas en las que te han implicado.'}
          {datos.gestionar ? ' Ponle un responsable y una fecha límite, cambia quién está implicado o dala por resuelta.' : ''}
          {' '}Al personal implicado le llega un aviso cuando se registra y cuando se resuelve.
          {' '}También se registran desde «Pasar lista», con la clase ya puesta.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setNueva(true)}><I.Plus width={15} height={15} /> Registrar incidencia</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['abiertas', 'Abiertas'], ['resueltas', 'Resueltas'], ['todas', 'Todas']].map(([k, l]) => (
          <button key={k} className={`filter-pill ${estado === k ? 'is-active' : ''}`} onClick={() => setEstado(k)}>{l} · {cuantas(k)}</button>
        ))}
        <span style={{ width: 1, height: 22, background: 'var(--line)', margin: '0 4px' }} />
        {[['todas', datos.verTodas ? 'De todos' : 'Todas las mías'], ['mias', 'Encargadas a mí'], ['escritas', 'Escritas por mí'], ['implicado', 'Me implican']].map(([k, l]) => (
          <button key={k} className={`filter-pill ${filtro === k ? 'is-active' : ''}`} onClick={() => setFiltro(k)}>{l}</button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por texto, persona o clase…" style={{ ...campo, width: 'auto', flex: '1 1 220px', borderRadius: 999, padding: '7px 14px', fontSize: 13 }} />
      </div>

      {lista.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          {datos.incidencias.length ? 'No hay ninguna con estos filtros.' : 'Todavía no hay incidencias registradas.'}
        </div>
      ) : lista.map(i => {
        const est = ESTADOS[i.estado] || ESTADOS.abierta;
        const vencida = i.estado === 'abierta' && i.fechaLimite && i.fechaLimite < hoyISO();
        const puedeResolver = i.estado === 'abierta' && (datos.gestionar || i.responsable?.id === datos.yo);
        const meImplica = i.implicados.some(p => p.id === datos.yo);
        return (
          <div key={i.id} className="card" style={{ padding: 16, display: 'grid', gap: 10, borderLeft: `4px solid ${est.color}` }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={chip(est.color, { textTransform: 'uppercase' })}>{est.label}</span>
              {i.clase && <span style={chip('var(--purple)')}>{i.clase.nombre}</span>}
              {vencida && <span style={chip('#E5484D')}>Fecha límite pasada</span>}
              {meImplica && <span style={chip('var(--ink-2)')}>Te implica</span>}
              <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 'auto' }}>
                #{i.id} · {fmtFechaHora(i.fecha)} · la registró <b style={{ color: 'var(--ink-2)' }}>{i.autor?.nombre || '—'}</b>
              </span>
            </div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 14 }}>{i.texto}</p>
            {editando === i.id ? (
              <EditarImplicados inc={i} onCancelar={() => setEditando(null)}
                onGuardar={ids => cambiar(i, { implicados: ids }, 'Implicados guardados.')} />
            ) : (i.implicados.length > 0 || datos.gestionar) && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
                {i.implicados.length > 0 ? 'Implicados:' : 'Sin implicados'}
                {i.implicados.map(p => <span key={p.id} style={chip('var(--ink-2)', { fontWeight: 700 })}>{p.nombre}{quienEs(p.rango) ? ` · ${quienEs(p.rango)}` : ''}</span>)}
                {datos.gestionar && (
                  <button type="button" className="btn btn-sm btn-outline" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => setEditando(i.id)}>
                    {i.implicados.length ? 'Cambiar' : 'Añadir implicados'}
                  </button>
                )}
              </div>
            )}

            {/* Quién la resuelve y para cuándo */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
              {datos.gestionar && i.estado === 'abierta' ? (
                <>
                  <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 700 }}>
                    Responsable
                    <select value={i.responsable?.id || ''} onChange={e => cambiar(i, { responsableId: e.target.value || null }, e.target.value ? 'Responsable puesto.' : 'Sin responsable.')}
                      style={{ ...campo, width: 'auto', padding: '6px 8px', fontSize: 13 }}>
                      <option value="">Sin responsable</option>
                      {personal.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 700 }}>
                    Fecha límite
                    <input type="date" value={i.fechaLimite || ''} onChange={e => cambiar(i, { fechaLimite: e.target.value || null }, 'Fecha límite guardada.')}
                      style={{ ...campo, width: 'auto', padding: '5px 8px', fontSize: 13 }} />
                  </label>
                </>
              ) : (
                <span style={{ color: 'var(--ink-2)' }}>
                  {i.responsable ? <>Responsable: <b>{i.responsable.nombre}</b></> : i.estado === 'abierta' ? 'Sin responsable todavía' : null}
                  {i.fechaLimite ? <>{i.responsable || i.estado === 'abierta' ? ' · ' : ''}{i.estado === 'abierta' ? 'para el' : 'Fecha límite:'} <b style={{ color: vencida ? '#E5484D' : undefined }}>{fmtDia(i.fechaLimite)}</b></> : null}
                </span>
              )}
              <div style={{ flex: 1 }} />
              {puedeResolver && resolviendo?.id !== i.id && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setResolviendo({ id: i.id, texto: '' })}><I.Check width={14} height={14} /> Dar por resuelta</button>
              )}
              {i.estado === 'resuelta' && datos.gestionar && (
                <button type="button" className="btn btn-sm btn-outline" onClick={() => cambiar(i, { estado: 'abierta' }, 'Vuelve a estar abierta.')}>Reabrir</button>
              )}
            </div>
            {resolviendo?.id === i.id && (
              <div style={{ display: 'grid', gap: 8, background: 'var(--bg-3)', borderRadius: 10, padding: 12 }}>
                <textarea autoFocus value={resolviendo.texto} onChange={e => setResolviendo(r => ({ ...r, texto: e.target.value }))} rows={2} maxLength={3000}
                  placeholder="¿Cómo se ha resuelto? (opcional)" style={{ ...campo, background: 'var(--bg-2)', resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setResolviendo(null)}>Cancelar</button>
                  <button type="button" className="btn btn-sm btn-primary" onClick={async () => { if (await cambiar(i, { estado: 'resuelta', resolucion: resolviendo.texto }, 'Incidencia resuelta.')) setResolviendo(null); }}>Resuelta</button>
                </div>
              </div>
            )}
            {i.estado === 'resuelta' && (
              <div style={{ fontSize: 13, color: 'var(--ink-2)', background: 'color-mix(in oklab, var(--teal) 8%, var(--bg-2))', borderRadius: 10, padding: '9px 12px' }}>
                <b style={{ color: 'var(--teal)' }}>Resuelta</b>{i.resueltaPor ? ` por ${i.resueltaPor}` : ''}{i.resueltaAt ? ` · ${fmtFechaHora(i.resueltaAt)}` : ''}
                {i.resolucion && <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{i.resolucion}</div>}
              </div>
            )}
          </div>
        );
      })}

      {nueva && <FormIncidencia showToast={showToast} onCerrar={() => setNueva(false)} onGuardada={inc => { setNueva(false); setDatos(x => ({ ...x, incidencias: [inc, ...x.incidencias] })); setEstado('abiertas'); }} />}
    </div>
  );
}
