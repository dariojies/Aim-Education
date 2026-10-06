import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { fmtFecha, fmtFechaHora } from '../fechas.js';
import { IconoCategoria, ICONOS_BRICKS, TarjetaArticulo } from './Brickslab.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Brickslab y Biblioteca en el panel (#291), para secretaría y dirección:
// entregar y recoger, el catálogo, las categorías, quién puede reservar (y el
// Pro), las piezas que faltan, las votaciones y los ajustes del Pro de pago.
// Trabaja sobre las mismas tablas que la app de Brickslab.
// ─────────────────────────────────────────────────────────────────────────────

const PESTANAS = [['reservas', 'Reservas'], ['catalogo', 'Catálogo'], ['permisos', 'Quién puede reservar'], ['piezas', 'Piezas que faltan'], ['votaciones', 'Votaciones'], ['categorias', 'Categorías'], ['ajustes', 'Ajustes y Pro']];
const chip = (color, extra = {}) => ({ fontSize: 11, fontWeight: 800, color, background: `color-mix(in oklab, ${color} 13%, var(--bg-2))`, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', ...extra });
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '8px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box' };
const eur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`;
const etiqueta = { display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 700 };

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

function Modal({ titulo, onCerrar, children, ancho = 640 }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCerrar]);
  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2)', borderRadius: 16, width: `min(${ancho}px, 100%)`, maxHeight: '92vh', overflow: 'auto', padding: 20, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>{titulo}</h2>
          <button type="button" className="icon-btn" onClick={onCerrar} aria-label="Cerrar"><I.X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Buscar a alguien del club (para reservar a mano o darle permiso).
function BuscarPersona({ onElegir, placeholder = 'Buscar alumno por nombre…' }) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setLista([]); return; }
    const t = setTimeout(() => api(`/api/admin/brickslab/personas?q=${encodeURIComponent(q.trim())}`).then(d => setLista(d.personas || [])).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} style={campo} />
      {lista.length > 0 && (
        <div style={{ display: 'grid', gap: 2, border: '1px solid var(--line)', borderRadius: 10, padding: 4, maxHeight: 220, overflow: 'auto' }}>
          {lista.map(p => (
            <button key={p.id} type="button" onClick={() => { onElegir(p); setQ(''); setLista([]); }}
              style={{ textAlign: 'left', border: 0, background: 'none', padding: '7px 9px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)' }}>{p.nombre}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminBrickslab({ showToast, enlace }) {
  const [tab, setTab] = useState(PESTANAS.some(([k]) => k === enlace?.params?.pestana) ? enlace.params.pestana : 'reservas');
  const [d, setD] = useState(null);
  const cargar = useCallback(() => api('/api/admin/brickslab').then(setD).catch(e => { showToast?.(e.message); setD(x => x || { categorias: [], articulos: [], reservas: [], devueltas: [] }); }), [showToast]);
  useEffect(() => { cargar(); }, [cargar]);
  async function hacer(fn, ok) {
    try { const r = await fn(); if (ok) showToast?.(typeof ok === 'function' ? ok(r) : ok); await cargar(); return r || true; }
    catch (e) { showToast?.(e.message); return false; }
  }
  if (!d) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</p>;
  const porEntregar = d.reservas.filter(r => r.estado !== 'Delivered').length;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PESTANAS.map(([k, l]) => (
          <button key={k} className={`filter-pill ${tab === k ? 'is-active' : ''}`} onClick={() => setTab(k)}>
            {l}{k === 'reservas' && porEntregar ? ` · ${porEntregar} por entregar` : ''}
          </button>
        ))}
      </div>
      {tab === 'reservas' && <Reservas d={d} hacer={hacer} />}
      {tab === 'catalogo' && <Catalogo d={d} hacer={hacer} />}
      {tab === 'permisos' && <Permisos d={d} showToast={showToast} />}
      {tab === 'piezas' && <Piezas showToast={showToast} />}
      {tab === 'votaciones' && <Votaciones showToast={showToast} />}
      {tab === 'categorias' && <Categorias d={d} hacer={hacer} />}
      {tab === 'ajustes' && <Ajustes showToast={showToast} onGuardado={cargar} />}
    </div>
  );
}

// ── Reservas: por entregar, entregadas (fuera) y lo último devuelto ──
function Reservas({ d, hacer }) {
  const [nueva, setNueva] = useState(null); // { persona, articuloId }
  const [q, setQ] = useState('');
  const n = q.trim().toLowerCase();
  const filtra = (l) => l.filter(r => !n || `${r.nombre} ${r.titulo}`.toLowerCase().includes(n));
  const porEntregar = filtra(d.reservas.filter(r => r.estado !== 'Delivered'));
  const fuera = filtra(d.reservas.filter(r => r.estado === 'Delivered'));
  const fila = (r, botones) => (
    <div key={r.id} className="card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      {r.imagen ? <img src={r.imagen} alt="" referrerPolicy="no-referrer" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, background: '#fff' }} /> : null}
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <b style={{ fontSize: 14 }}>{r.titulo}</b>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{r.nombre} · {r.categoria} · {r.estado === 'Returned' ? `devuelto el ${fmtFecha(r.devuelta)}` : `reservado el ${fmtFecha(r.fecha)}`}</div>
      </div>
      {r.pro && <span style={chip('#B45309')} title="Es Pro: se lo puede llevar a casa">PRO{r.enCasaCategoria && r.enCasaArticulo ? ' · a casa' : ''}</span>}
      {botones}
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por alumno o artículo…" style={{ ...campo, flex: '1 1 240px', width: 'auto', borderRadius: 999 }} />
        <button type="button" className="btn btn-primary" onClick={() => setNueva({ persona: null, articuloId: '' })}><I.Plus width={15} height={15} /> Reservar para un alumno</button>
      </div>
      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Por entregar · {porEntregar.length}</h3>
        {!porEntregar.length ? <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Nada pendiente.</p> : porEntregar.map(r => fila(r, <>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => hacer(() => api(`/api/admin/brickslab/reservas/${r.id}/entregar`, { method: 'POST' }), `Entregado a ${r.nombre}.`)}>Entregar</button>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => { if (window.confirm(`¿Anular la reserva de «${r.titulo}» de ${r.nombre}?`)) hacer(() => api(`/api/admin/brickslab/reservas/${r.id}`, { method: 'DELETE' }), 'Reserva anulada.'); }}>Anular</button>
        </>))}
      </section>
      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Prestados ahora · {fuera.length}</h3>
        {!fuera.length ? <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Nada fuera.</p> : fuera.map(r => fila(r,
          <button type="button" className="btn btn-sm btn-primary" onClick={() => hacer(() => api(`/api/admin/brickslab/reservas/${r.id}/devolver`, { method: 'POST' }), `Devuelto: cuenta en el historial de ${r.nombre}.`)}>Devuelto</button>))}
      </section>
      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Lo último devuelto</h3>
        {!d.devueltas.length ? <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Nada todavía.</p> : filtra(d.devueltas).slice(0, 30).map(r => fila(r, null))}
      </section>
      {nueva && (
        <Modal titulo="Reservar para un alumno" onCerrar={() => setNueva(null)}>
          {!nueva.persona ? <BuscarPersona onElegir={p => setNueva(x => ({ ...x, persona: p }))} /> : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <b style={{ flex: 1 }}>{nueva.persona.nombre}</b>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setNueva(x => ({ ...x, persona: null }))}>Cambiar</button>
            </div>
          )}
          {nueva.persona && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12.5 }}>
                {d.categorias.map(c => { const p = nueva.persona.permisos?.[c.id] || {}; return <span key={c.id} style={chip(p.pro ? '#B45309' : p.normal ? 'var(--teal)' : 'var(--ink-3)')}>{c.nombre}: {p.pro ? 'Pro' : p.normal ? 'Normal' : 'sin permiso'}</span>; })}
              </div>
              <label style={etiqueta}>Qué se lleva
                <select value={nueva.articuloId} onChange={e => setNueva(x => ({ ...x, articuloId: e.target.value }))} style={campo}>
                  <option value="">Elige…</option>
                  {d.categorias.map(c => (
                    <optgroup key={c.id} label={c.nombre}>
                      {d.articulos.filter(a => a.categoriaId === c.id && a.activo && a.disponible).map(a => <option key={a.id} value={a.id}>{a.titulo}{a.soloPro ? ' (Pro)' : ''}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Se aplican las mismas reglas que a las familias: una reserva por categoría, permiso y unidades libres.</p>
            </>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline" onClick={() => setNueva(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={!nueva.persona || !nueva.articuloId}
              onClick={async () => { if (await hacer(() => api('/api/admin/brickslab/reservas', { method: 'POST', body: { userId: nueva.persona.id, articuloId: nueva.articuloId } }), 'Reservado.')) setNueva(null); }}>Reservar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Catálogo: alta, edición, retirar y revisar sets ──
function Catalogo({ d, hacer }) {
  const [cat, setCat] = useState(d.categorias[0]?.id || null);
  const [q, setQ] = useState('');
  const [ed, setEd] = useState(null);
  const [revisar, setRevisar] = useState(null); // { articulo, piezas: [{pieza, cantidad}] }
  const [verRetirados, setVerRetirados] = useState(false);
  const categoria = d.categorias.find(c => c.id === cat);
  const n = q.trim().toLowerCase();
  const lista = d.articulos.filter(a => a.categoriaId === cat && (verRetirados || a.activo)
    && (!n || [a.titulo, a.descripcion, ...Object.values(a.datos || {})].some(v => String(v || '').toLowerCase().includes(n))));
  const guardar = async () => {
    const body = { ...ed, stock: Number(ed.stock) || 1 };
    const ok = await hacer(() => api(ed.id ? `/api/admin/brickslab/articulos/${ed.id}` : '/api/admin/brickslab/articulos', { method: ed.id ? 'PUT' : 'POST', body }), ed.id ? 'Guardado.' : 'Añadido al catálogo.');
    if (ok) setEd(null);
  };
  const catEd = d.categorias.find(c => c.id === ed?.categoriaId);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {d.categorias.map(c => <button key={c.id} type="button" className={`filter-pill ${cat === c.id ? 'is-active' : ''}`} onClick={() => setCat(c.id)} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><IconoCategoria nombre={c.icono} size={15} /> {c.nombre} · {d.articulos.filter(a => a.categoriaId === c.id && a.activo).length}</button>)}
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary" disabled={!cat} onClick={() => setEd({ categoriaId: cat, titulo: '', descripcion: '', imagen: '', stock: 1, soloPro: false, activo: true, datos: { allowHomeBuild: true } })}><I.Plus width={15} height={15} /> Añadir</button>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" style={{ ...campo, flex: '1 1 240px', width: 'auto', borderRadius: 999 }} />
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700 }}><input type="checkbox" checked={verRetirados} onChange={e => setVerRetirados(e.target.checked)} /> Ver también los retirados</label>
      </div>
      {!lista.length ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No hay nada aquí todavía.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
          {lista.map(a => (
            <div key={a.id} style={{ opacity: a.activo ? 1 : .55 }}>
              <TarjetaArticulo a={a} cat={categoria} accion={(
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                    {!a.activo ? 'Retirado · ' : ''}Prestado {a.veces} {a.veces === 1 ? 'vez' : 'veces'}{categoria?.modo === 'brickslab' ? ` · ${a.revisado ? `revisado el ${fmtFecha(a.revisado)}` : 'sin revisar'}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setEd({ ...a })}>Editar</button>
                    {categoria?.modo === 'brickslab' && <button type="button" className="btn btn-sm btn-outline" onClick={() => setRevisar({ articulo: a, piezas: [{ pieza: '', cantidad: 1 }] })}>Revisar</button>}
                  </div>
                </div>
              )} />
            </div>
          ))}
        </div>
      )}

      {ed && (
        <Modal titulo={ed.id ? 'Editar' : 'Añadir al catálogo'} onCerrar={() => setEd(null)}>
          <label style={etiqueta}>Título<input value={ed.titulo} onChange={e => setEd(x => ({ ...x, titulo: e.target.value }))} style={campo} autoFocus /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
            <label style={etiqueta}>Categoría
              <select value={ed.categoriaId} onChange={e => setEd(x => ({ ...x, categoriaId: e.target.value }))} style={campo}>{d.categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
            </label>
            <label style={etiqueta}>Unidades<input type="number" min="1" max="99" value={ed.stock} onChange={e => setEd(x => ({ ...x, stock: e.target.value }))} style={campo} /></label>
          </div>
          {(catEd?.campos || []).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              {catEd.campos.map(f => <label key={f.name} style={etiqueta}>{f.label}<input type={f.type === 'number' ? 'number' : 'text'} value={ed.datos?.[f.name] ?? ''} onChange={e => setEd(x => ({ ...x, datos: { ...x.datos, [f.name]: e.target.value } }))} style={campo} /></label>)}
            </div>
          )}
          <label style={etiqueta}>Descripción<textarea rows={3} value={ed.descripcion} onChange={e => setEd(x => ({ ...x, descripcion: e.target.value }))} style={{ ...campo, resize: 'vertical' }} /></label>
          <label style={etiqueta}>Imagen (enlace https://)
            <input value={ed.imagen} onChange={e => setEd(x => ({ ...x, imagen: e.target.value }))} placeholder="https://…" style={campo} />
          </label>
          {ed.imagen && /^https:\/\//.test(ed.imagen) && <img src={ed.imagen} alt="" referrerPolicy="no-referrer" style={{ maxHeight: 140, maxWidth: '100%', objectFit: 'contain', justifySelf: 'start', borderRadius: 8, background: '#fff' }} />}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, fontWeight: 700 }}>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!ed.soloPro} onChange={e => setEd(x => ({ ...x, soloPro: e.target.checked }))} /> Solo para Pro</label>
            {catEd?.enCasa && <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={ed.datos?.allowHomeBuild !== false} onChange={e => setEd(x => ({ ...x, datos: { ...x.datos, allowHomeBuild: e.target.checked } }))} /> Se puede llevar a casa (Pro)</label>}
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={ed.activo !== false} onChange={e => setEd(x => ({ ...x, activo: e.target.checked }))} /> Se presta (si no, queda retirado)</label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {ed.id && <button type="button" className="btn btn-outline" style={{ marginRight: 'auto', color: 'var(--orange)' }} onClick={async () => { if (window.confirm(`¿Quitar «${ed.titulo}» del catálogo? Si ya se ha prestado alguna vez, se retira (no se borra su historial).`) && await hacer(() => api(`/api/admin/brickslab/articulos/${ed.id}`, { method: 'DELETE' }), r => (r.retirado ? 'Retirado (tenía historial).' : 'Borrado.'))) setEd(null); }}>Quitar</button>}
            <button type="button" className="btn btn-outline" onClick={() => setEd(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={!ed.titulo?.trim()} onClick={guardar}>Guardar</button>
          </div>
        </Modal>
      )}

      {revisar && (
        <Modal titulo={`Revisar «${revisar.articulo.titulo}»`} onCerrar={() => setRevisar(null)} ancho={520}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Queda la fecha de la revisión. Si falta algo, apunta el número de pieza de LEGO y cuántas: sale en «Piezas que faltan» y en la lista para pedirlas.</p>
          {revisar.piezas.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px auto', gap: 8 }}>
              <input value={p.pieza} onChange={e => setRevisar(r => ({ ...r, piezas: r.piezas.map((x, j) => (j === i ? { ...x, pieza: e.target.value } : x)) }))} placeholder="Nº de pieza (p. ej. 300121)" style={campo} />
              <input type="number" min="1" value={p.cantidad} onChange={e => setRevisar(r => ({ ...r, piezas: r.piezas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)) }))} style={campo} />
              <button type="button" className="icon-btn" aria-label="Quitar" onClick={() => setRevisar(r => ({ ...r, piezas: r.piezas.filter((_, j) => j !== i) }))}><I.Trash width={14} height={14} /></button>
            </div>
          ))}
          <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={() => setRevisar(r => ({ ...r, piezas: [...r.piezas, { pieza: '', cantidad: 1 }] }))}><I.Plus width={13} height={13} /> Otra pieza</button>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline" onClick={() => setRevisar(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={async () => { if (await hacer(() => api(`/api/admin/brickslab/articulos/${revisar.articulo.id}/revisar`, { method: 'POST', body: { piezas: revisar.piezas } }), r => (r.piezas ? `Revisado: ${r.piezas} pieza${r.piezas !== 1 ? 's' : ''} por reponer.` : 'Revisado: está completo.'))) setRevisar(null); }}>Guardar revisión</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Quién puede reservar: Normal y Pro por categoría ──
function Permisos({ d, showToast }) {
  const [lista, setLista] = useState(null);
  const [q, setQ] = useState('');
  const cargar = useCallback(() => api('/api/admin/brickslab/permisos').then(x => setLista(x.personas)).catch(e => { showToast?.(e.message); setLista([]); }), [showToast]);
  useEffect(() => { cargar(); }, [cargar]);
  async function cambiar(p, c, cambio) {
    const actual = p.permisos?.[c.id] || {};
    const body = { userId: p.id, categoriaId: c.id, normal: actual.normalManual, pro: actual.proManual, ...cambio };
    try {
      const r = await api('/api/admin/brickslab/permisos', { method: 'PUT', body });
      setLista(l => { const ya = l.some(x => x.id === p.id); const n = { ...p, permisos: r.permisos }; return ya ? l.map(x => (x.id === p.id ? n : x)) : [n, ...l]; });
    } catch (e) { showToast?.(e.message); }
  }
  if (!lista) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</p>;
  const n = q.trim().toLowerCase();
  const vistos = lista.filter(p => !n || p.nombre.toLowerCase().includes(n));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', maxWidth: 820 }}>
        <b>Normal</b>: puede reservar en esa categoría. En LEGO lo tienen solos los matriculados en Brickslab (<i>por la clase</i>). <b>Pro</b>: además, los sets exclusivos y llevárselos a casa; sale solo al pagarlo por la web (<i>pagado</i>) o se da a mano.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar la lista…" style={{ ...campo, flex: '1 1 200px', width: 'auto', borderRadius: 999 }} />
        <div style={{ flex: '1 1 260px' }}><BuscarPersona placeholder="Dar permiso a otro alumno…" onElegir={p => setLista(l => (l.some(x => x.id === p.id) ? l : [p, ...l]))} /></div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 12 }}>
              <th style={{ padding: '6px 8px' }}>Alumno</th>
              {d.categorias.map(c => <th key={c.id} style={{ padding: '6px 8px' }}>{c.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {vistos.map(p => (
              <tr key={p.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '7px 8px', fontWeight: 700 }}>{p.nombre}{p.permisos?._pro?.suscrito ? <span style={chip('#B45309', { marginLeft: 6 })}>Pro de pago{p.permisos._pro.debe ? ' · sin pagar' : ''}</span> : null}</td>
                {d.categorias.map(c => {
                  const x = p.permisos?.[c.id] || {};
                  return (
                    <td key={c.id} style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>
                      <label style={{ marginRight: 12, display: 'inline-flex', gap: 4, alignItems: 'center' }} title={x.normalAuto ? 'Lo tiene por estar matriculado' : ''}>
                        <input type="checkbox" checked={!!x.normalManual} onChange={e => cambiar(p, c, { normal: e.target.checked })} /> Normal
                        {x.normalAuto && <span style={chip('var(--teal)')}>por la clase</span>}
                      </label>
                      <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        <input type="checkbox" checked={!!x.proManual} onChange={e => cambiar(p, c, { pro: e.target.checked })} /> Pro
                        {x.proPagado && <span style={chip('#B45309')}>pagado</span>}
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Piezas que faltan, con la lista para pedirlas a LEGO ──
function Piezas({ showToast }) {
  const [lista, setLista] = useState(null);
  const [vista, setVista] = useState('pendientes');
  const cargar = useCallback(() => api('/api/admin/brickslab/piezas').then(x => setLista(x.piezas)).catch(e => { showToast?.(e.message); setLista([]); }), [showToast]);
  useEffect(() => { cargar(); }, [cargar]);
  const pendientes = (lista || []).filter(p => p.pendiente);
  // Las líneas «pieza: cantidad» de las revisiones, sumadas.
  const totales = useMemo(() => {
    const m = new Map();
    for (const p of pendientes) for (const l of p.texto.split('\n')) { const x = l.match(/^\s*([\w-]+)\s*:\s*(\d+)\s*$/); if (x) m.set(x[1], (m.get(x[1]) || 0) + Number(x[2])); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [pendientes]);
  function csv() {
    const blob = new Blob([`elementId,quantity\n${totales.map(([k, v]) => `${k},${v}`).join('\n')}\n`], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'piezas-lego.csv'; a.click(); URL.revokeObjectURL(a.href);
  }
  async function marcar(p, pendiente) {
    try { await api(`/api/admin/brickslab/piezas/${p.id}/repuesta`, { method: 'POST', body: { pendiente } }); showToast?.(pendiente ? 'Vuelve a estar pendiente.' : 'Marcado como repuesto.'); cargar(); }
    catch (e) { showToast?.(e.message); }
  }
  if (!lista) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</p>;
  const vistos = vista === 'pendientes' ? pendientes : lista;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className={`filter-pill ${vista === 'pendientes' ? 'is-active' : ''}`} onClick={() => setVista('pendientes')}>Por reponer · {pendientes.length}</button>
        <button type="button" className={`filter-pill ${vista === 'todos' ? 'is-active' : ''}`} onClick={() => setVista('todos')}>Todos · {lista.length}</button>
        <div style={{ flex: 1 }} />
        {totales.length > 0 && <button type="button" className="btn btn-sm btn-outline" onClick={csv}><I.Download width={14} height={14} /> Lista para LEGO (CSV) · {totales.length} piezas</button>}
      </div>
      {!vistos.length ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No hay avisos.</p> : vistos.map(p => (
        <div key={p.id} className="card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', borderLeft: `4px solid ${p.pendiente ? 'var(--orange)' : 'var(--teal)'}` }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <b>{p.articulo}</b>{p.referencia ? <span style={{ color: 'var(--ink-3)', fontSize: 12 }}> · ref. {p.referencia}</span> : null}
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: '4px 0' }}>{p.texto}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{p.quien} · {fmtFechaHora(p.fecha)}</div>
          </div>
          {p.pendiente ? <button type="button" className="btn btn-sm btn-primary" onClick={() => marcar(p, false)}>Repuesto</button>
            : <button type="button" className="btn btn-sm btn-outline" onClick={() => marcar(p, true)}>Volver a pendiente</button>}
        </div>
      ))}
    </div>
  );
}

// ── Votaciones de compras ──
function Votaciones({ showToast }) {
  const [lista, setLista] = useState(null);
  const [ed, setEd] = useState(null);
  const cargar = useCallback(() => api('/api/admin/brickslab/votaciones').then(x => setLista(x.votaciones)).catch(e => { showToast?.(e.message); setLista([]); }), [showToast]);
  useEffect(() => { cargar(); }, [cargar]);
  const local = (d) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  async function guardar() {
    try {
      const body = { titulo: ed.titulo, descripcion: ed.descripcion, hasta: ed.hasta ? new Date(ed.hasta).toISOString() : null, opciones: ed.opciones };
      await api(ed.id ? `/api/admin/brickslab/votaciones/${ed.id}` : '/api/admin/brickslab/votaciones', { method: ed.id ? 'PUT' : 'POST', body });
      showToast?.(ed.id ? 'Votación guardada.' : 'Votación abierta: las familias ya pueden votar.');
      setEd(null); cargar();
    } catch (e) { showToast?.(e.message); }
  }
  async function activar(v, activa) {
    try { await api(`/api/admin/brickslab/votaciones/${v.id}`, { method: 'PATCH', body: { activa } }); showToast?.(activa ? 'Abierta (las demás se cierran).' : 'Cerrada.'); cargar(); }
    catch (e) { showToast?.(e.message); }
  }
  if (!lista) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</p>;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', flex: '1 1 300px' }}>Los alumnos de Brickslab votan qué set se compra. Solo hay una abierta a la vez; sin fecha, se cierra el día 1 del mes que viene.</p>
        <button type="button" className="btn btn-primary" onClick={() => setEd({ titulo: '', descripcion: '', hasta: '', opciones: [{ titulo: '', imagen: '' }, { titulo: '', imagen: '' }] })}><I.Plus width={15} height={15} /> Nueva votación</button>
      </div>
      {!lista.length ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Todavía no hay votaciones.</p> : lista.map(v => {
        const total = v.opciones.reduce((s, o) => s + o.votantes.length, 0);
        return (
          <div key={v.id} className="card" style={{ padding: 14, display: 'grid', gap: 10, borderLeft: `4px solid ${v.abierta ? 'var(--purple)' : 'var(--line)'}` }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 15 }}>{v.titulo}</b>
              <span style={chip(v.abierta ? 'var(--purple)' : 'var(--ink-3)')}>{v.abierta ? 'Abierta' : 'Cerrada'}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{total} voto{total !== 1 ? 's' : ''}{v.hasta ? ` · hasta el ${fmtFechaHora(v.hasta)}` : ''}</span>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setEd({ id: v.id, titulo: v.titulo, descripcion: v.descripcion, hasta: local(v.hasta), opciones: v.opciones.map(o => ({ id: o.id, titulo: o.titulo, imagen: o.imagen })) })}>Editar</button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => activar(v, !v.activa)}>{v.activa ? 'Cerrar' : 'Abrir'}</button>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {[...v.opciones].sort((a, b) => b.votantes.length - a.votantes.length).map(o => (
                <details key={o.id}>
                  <summary style={{ cursor: 'pointer', fontSize: 13 }}><b>{o.titulo}</b> · {o.votantes.length} voto{o.votantes.length !== 1 ? 's' : ''}</summary>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', padding: '4px 0 0 14px' }}>{o.votantes.join(', ') || 'Nadie todavía.'}</div>
                </details>
              ))}
            </div>
          </div>
        );
      })}
      {ed && (
        <Modal titulo={ed.id ? 'Editar votación' : 'Nueva votación'} onCerrar={() => setEd(null)}>
          <label style={etiqueta}>Título<input value={ed.titulo} onChange={e => setEd(x => ({ ...x, titulo: e.target.value }))} placeholder="¿Qué set compramos en noviembre?" style={campo} autoFocus /></label>
          <label style={etiqueta}>Explicación (opcional)<textarea rows={2} value={ed.descripcion} onChange={e => setEd(x => ({ ...x, descripcion: e.target.value }))} style={{ ...campo, resize: 'vertical' }} /></label>
          <label style={etiqueta}>Se cierra (opcional)<input type="datetime-local" value={ed.hasta} onChange={e => setEd(x => ({ ...x, hasta: e.target.value }))} style={{ ...campo, width: 'auto' }} /></label>
          <b style={{ fontSize: 13 }}>Opciones</b>
          {ed.opciones.map((o, i) => (
            <div key={o.id || i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
              <input value={o.titulo} onChange={e => setEd(x => ({ ...x, opciones: x.opciones.map((y, j) => (j === i ? { ...y, titulo: e.target.value } : y)) }))} placeholder="Nombre del set" style={campo} />
              <input value={o.imagen} onChange={e => setEd(x => ({ ...x, opciones: x.opciones.map((y, j) => (j === i ? { ...y, imagen: e.target.value } : y)) }))} placeholder="Imagen (https://…)" style={campo} />
              <button type="button" className="icon-btn" aria-label="Quitar opción" disabled={ed.opciones.length <= 2} onClick={() => setEd(x => ({ ...x, opciones: x.opciones.filter((_, j) => j !== i) }))}><I.Trash width={14} height={14} /></button>
            </div>
          ))}
          <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={() => setEd(x => ({ ...x, opciones: [...x.opciones, { titulo: '', imagen: '' }] }))}><I.Plus width={13} height={13} /> Otra opción</button>
          {ed.id && <p style={{ margin: 0, fontSize: 12, color: 'var(--orange)' }}>Si quitas una opción, se borran también sus votos.</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline" onClick={() => setEd(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={guardar}>{ed.id ? 'Guardar' : 'Abrir votación'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Categorías ──
function Categorias({ d, hacer }) {
  const [ed, setEd] = useState(null);
  const guardar = async () => {
    if (await hacer(() => api(ed.id ? `/api/admin/brickslab/categorias/${ed.id}` : '/api/admin/brickslab/categorias', { method: ed.id ? 'PUT' : 'POST', body: ed }), 'Categoría guardada.')) setEd(null);
  };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', flex: '1 1 300px' }}>Cada categoría tiene su catálogo, sus permisos y su ranking. Los campos son los datos de cada artículo (autor, referencia, piezas…).</p>
        <button type="button" className="btn btn-primary" onClick={() => setEd({ nombre: '', icono: 'Package', descripcion: '', enCasa: false, ranking: true, modo: 'library', campos: [] })}><I.Plus width={15} height={15} /> Nueva categoría</button>
      </div>
      {d.categorias.map(c => (
        <div key={c.id} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <IconoCategoria nombre={c.icono} size={22} />
          <div style={{ flex: '1 1 240px' }}>
            <b>{c.nombre}</b> <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>· {c.modo === 'brickslab' ? 'sets de LEGO' : 'préstamo'} · {d.articulos.filter(a => a.categoriaId === c.id && a.activo).length} artículos{c.ranking ? ' · con ranking' : ''}{c.enCasa ? ' · a casa con Pro' : ''}</span>
            {c.descripcion && <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.descripcion}</div>}
          </div>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setEd({ ...c, campos: c.campos.map(f => ({ ...f })) })}>Editar</button>
        </div>
      ))}
      {ed && (
        <Modal titulo={ed.id ? 'Editar categoría' : 'Nueva categoría'} onCerrar={() => setEd(null)}>
          <label style={etiqueta}>Nombre<input value={ed.nombre} onChange={e => setEd(x => ({ ...x, nombre: e.target.value }))} style={campo} autoFocus /></label>
          {ed.id && (ed.nombre !== d.categorias.find(c => c.id === ed.id)?.nombre) && /^(Aim Brickslab|Biblioteca)$/.test(d.categorias.find(c => c.id === ed.id)?.nombre || '') && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--orange)' }}>Ojo: la app de Brickslab reconoce esta categoría por su nombre. Si se lo cambias, allí puede dejar de funcionar el voto o el perfil.</p>
          )}
          <label style={etiqueta}>Descripción<input value={ed.descripcion} onChange={e => setEd(x => ({ ...x, descripcion: e.target.value }))} style={campo} /></label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.keys(ICONOS_BRICKS).map(k => (
              <button key={k} type="button" aria-label={k} aria-pressed={ed.icono === k} onClick={() => setEd(x => ({ ...x, icono: k }))}
                style={{ width: 38, height: 38, borderRadius: 10, border: `2px solid ${ed.icono === k ? 'var(--purple)' : 'var(--line)'}`, background: 'var(--bg-3)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--ink)' }}><IconoCategoria nombre={k} size={18} /></button>
            ))}
          </div>
          <label style={etiqueta}>Tipo
            <select value={ed.modo} onChange={e => setEd(x => ({ ...x, modo: e.target.value }))} style={campo}>
              <option value="brickslab">Sets de LEGO (Normal automático por la clase, Pro de pago, revisión de piezas)</option>
              <option value="library">Préstamo (libros, juegos…)</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, fontWeight: 700 }}>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!ed.ranking} onChange={e => setEd(x => ({ ...x, ranking: e.target.checked }))} /> Con ranking</label>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!ed.enCasa} onChange={e => setEd(x => ({ ...x, enCasa: e.target.checked }))} /> Los Pro se lo pueden llevar a casa</label>
          </div>
          <b style={{ fontSize: 13 }}>Datos de cada artículo</b>
          {ed.campos.map((f, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 8 }}>
              <input value={f.label} onChange={e => setEd(x => ({ ...x, campos: x.campos.map((y, j) => (j === i ? { ...y, label: e.target.value, name: y.name || e.target.value.normalize('NFD').replace(/[^\w]/g, '') } : y)) }))} placeholder="Por ejemplo: Autor" style={campo} />
              <select value={f.type} onChange={e => setEd(x => ({ ...x, campos: x.campos.map((y, j) => (j === i ? { ...y, type: e.target.value } : y)) }))} style={campo}><option value="text">Texto</option><option value="number">Número</option></select>
              <button type="button" className="icon-btn" aria-label="Quitar campo" onClick={() => setEd(x => ({ ...x, campos: x.campos.filter((_, j) => j !== i) }))}><I.Trash width={14} height={14} /></button>
            </div>
          ))}
          <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={() => setEd(x => ({ ...x, campos: [...x.campos, { name: '', label: '', type: 'text' }] }))}><I.Plus width={13} height={13} /> Otro dato</button>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {ed.id && <button type="button" className="btn btn-outline" style={{ marginRight: 'auto', color: 'var(--orange)' }} onClick={async () => { if (window.confirm(`¿Borrar la categoría «${ed.nombre}»? Solo se puede si no tiene artículos.`) && await hacer(() => api(`/api/admin/brickslab/categorias/${ed.id}`, { method: 'DELETE' }), 'Categoría borrada.')) setEd(null); }}>Borrar</button>}
            <button type="button" className="btn btn-outline" onClick={() => setEd(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={!ed.nombre.trim()} onClick={guardar}>Guardar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Ajustes: el Pro de pago y qué clases dan el Normal ──
function Ajustes({ showToast, onGuardado }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const cargar = useCallback(() => api('/api/admin/brickslab/ajustes').then(x => { setD(x); setF({ conceptoPro: x.ajustes.conceptoPro || '', clasesNormal: x.ajustes.clasesNormal || [], textoPro: x.ajustes.textoPro || '' }); }).catch(e => showToast?.(e.message)), [showToast]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!d || !f) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</p>;
  async function guardar() {
    try { await api('/api/admin/brickslab/ajustes', { method: 'PUT', body: f }); showToast?.('Ajustes guardados.'); cargar(); onGuardado?.(); }
    catch (e) { showToast?.(e.message); }
  }
  const elegido = d.conceptos.find(c => c.concepto === f.conceptoPro);
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
      <section className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Brickslab Pro de pago</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
          Las familias lo activan desde su área y se cobra cada mes con las demás mensualidades. Tienen Pro mientras el mes esté pagado y se pueden dar de baja cuando quieran.
          Primero da de alta el concepto en <b>Facturación → Catálogo</b> (con su precio) y elígelo aquí. Hasta entonces, el botón de pagar no sale.
        </p>
        <label style={etiqueta}>Concepto del Pro
          <select value={f.conceptoPro} onChange={e => setF(x => ({ ...x, conceptoPro: e.target.value }))} style={campo}>
            <option value="">Sin elegir (el Pro no se vende por la web)</option>
            {d.conceptos.map(c => <option key={c.concepto} value={c.concepto}>{c.concepto} · {c.nombre} · {eur(c.precio)}</option>)}
          </select>
        </label>
        {elegido && <p style={{ margin: 0, fontSize: 13 }}>Las familias verán: <b>Brickslab Pro · {eur(elegido.precio)} al mes</b>.</p>}
        {d.ajustes.claseProId && <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Quien lo activa queda en la clase «Brickslab Pro» de Facturación → Fichas (se da de baja igual que en cualquier clase).</p>}
        <label style={etiqueta}>Qué incluye (lo leen las familias)
          <textarea rows={3} value={f.textoPro} onChange={e => setF(x => ({ ...x, textoPro: e.target.value }))} maxLength={600} placeholder="Llévate los sets a casa para montarlos, accede a los sets exclusivos y ten prioridad en las novedades." style={{ ...campo, resize: 'vertical' }} />
        </label>
      </section>
      <section className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Quién tiene el Normal de LEGO sin darlo a mano</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>Los matriculados en estas clases pueden reservar sets de LEGO y votar. Si no eliges ninguna, valen las que se llaman «Brickslab».</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {d.grupos.map(g => {
            const on = f.clasesNormal.includes(g.id);
            return <button key={g.id} type="button" aria-pressed={on} className={`filter-pill ${on ? 'is-active' : ''}`} onClick={() => setF(x => ({ ...x, clasesNormal: on ? x.clasesNormal.filter(y => y !== g.id) : [...x.clasesNormal, g.id] }))}>{g.nombre}</button>;
          })}
        </div>
      </section>
      <div><button type="button" className="btn btn-primary" onClick={guardar}>Guardar ajustes</button></div>
    </div>
  );
}
