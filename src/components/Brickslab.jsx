import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Book, Package, Puzzle, Gamepad2, Music, Palette, Rocket, Star, Trophy } from 'lucide-react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter } from './Shared.jsx';
import { useRouter } from '../App.jsx';
import { fmtFecha } from '../fechas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Brickslab y Biblioteca (#291): el préstamo de sets de LEGO y de libros.
//  · BrickslabFamilia: en el área de la familia, para cada hijo: reservar, sus
//    reservas, lo que ha montado o leído, el ranking, las votaciones y el Pro.
//  · BrickslabPublico: el catálogo en la web, sin entrar.
// ─────────────────────────────────────────────────────────────────────────────

export const ICONOS_BRICKS = { Box, Book, Package, Puzzle, Gamepad2, Music, Palette, Rocket, Star, Trophy };
export const IconoCategoria = ({ nombre, size = 16 }) => { const C = ICONOS_BRICKS[nombre] || Package; return <C size={size} strokeWidth={2.2} />; };
const eur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`;
const chip = (color, extra = {}) => ({ fontSize: 11, fontWeight: 800, color, background: `color-mix(in oklab, ${color} 14%, var(--bg-2))`, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', ...extra });
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box' };
const fechaLarga = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : '');

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

// Lo que se enseña de cada artículo además del título: autor, referencia, piezas…
function datosVisibles(a, cat) {
  return (cat?.campos || []).map(f => (a.datos?.[f.name] ? `${f.label}: ${a.datos[f.name]}` : null)).filter(Boolean);
}

// Una tarjeta del catálogo. `accion` es el botón (reservar) o lo que lo impide.
export function TarjetaArticulo({ a, cat, accion = null }) {
  const [verMas, setVerMas] = useState(false);
  const datos = datosVisibles(a, cat);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ aspectRatio: '4 / 3', background: 'var(--bg-3)', position: 'relative', display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}>
        {a.imagen ? <img src={a.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: cat?.modo === 'library' ? 'contain' : 'cover', background: '#fff' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
          : <IconoCategoria nombre={cat?.icono} size={40} />}
        <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {a.soloPro && <span style={chip('#B45309', { background: '#FFD526', color: '#3b2a00' })}>PRO</span>}
          <span style={chip(a.disponible ? 'var(--teal)' : 'var(--orange)', { background: 'var(--bg-2)' })}>{a.disponible ? (a.stock > 1 ? `${a.libres} de ${a.stock} libres` : 'Disponible') : 'Prestado'}</span>
        </div>
      </div>
      <div style={{ padding: 14, display: 'grid', gap: 6, flex: 1, alignContent: 'start' }}>
        <b style={{ fontSize: 15, lineHeight: 1.3 }}>{a.titulo}</b>
        {datos.length > 0 && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{datos.join(' · ')}</div>}
        {a.descripcion && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45, ...(verMas ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>{a.descripcion}</p>
        )}
        {a.descripcion?.length > 140 && <button type="button" onClick={() => setVerMas(v => !v)} style={{ justifySelf: 'start', border: 0, background: 'none', padding: 0, color: 'var(--purple)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{verMas ? 'Ver menos' : 'Ver más'}</button>}
      </div>
      {accion && <div style={{ padding: '0 14px 14px' }}>{accion}</div>}
    </div>
  );
}

// Pestañas por categoría y buscador, comunes al área y a la página pública.
function useFiltroCatalogo(categorias, articulos) {
  const [cat, setCat] = useState(null);
  const [q, setQ] = useState('');
  const [libres, setLibres] = useState(false);
  const actual = cat || categorias[0]?.id || null;
  const lista = useMemo(() => {
    const n = q.trim().toLowerCase();
    return articulos.filter(a => a.categoriaId === actual && (!libres || a.disponible)
      && (!n || [a.titulo, a.descripcion, ...Object.values(a.datos || {})].some(v => String(v || '').toLowerCase().includes(n))));
  }, [articulos, actual, q, libres]);
  const barra = (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {categorias.map(c => (
          <button key={c.id} type="button" className={`filter-pill ${actual === c.id ? 'is-active' : ''}`} onClick={() => setCat(c.id)} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <IconoCategoria nombre={c.icono} size={15} /> {c.nombre} · {articulos.filter(a => a.categoriaId === c.id).length}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por título, autor, referencia…" style={{ ...campo, flex: '1 1 220px', width: 'auto', borderRadius: 999 }} />
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <input type="checkbox" checked={libres} onChange={e => setLibres(e.target.checked)} /> Solo lo disponible
        </label>
      </div>
    </div>
  );
  return { actual, lista, barra, catActual: categorias.find(c => c.id === actual) };
}
const rejilla = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 };

// ═══ En el área de la familia ═══
export function BrickslabFamilia() {
  const { go } = useRouter();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [quien, setQuien] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [piezas, setPiezas] = useState(null); // { reserva, texto }
  const [rkCat, setRkCat] = useState(null);
  const [rkPeriodo, setRkPeriodo] = useState('mes');

  const cargar = useCallback(() => api('/api/me/brickslab').then(x => { setD(x); setError(null); }).catch(e => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);

  const conPermiso = (m) => Object.entries(m.permisos || {}).some(([k, p]) => k !== '_pro' && p?.normal);
  const miembros = useMemo(() => [...(d?.miembros || [])].sort((a, b) => conPermiso(b) - conPermiso(a)), [d]);
  const yo = miembros.find(m => m.id === quien) || miembros[0] || null;
  const { actual, lista, barra, catActual } = useFiltroCatalogo(d?.categorias || [], d?.articulos || []);

  async function hacer(clave, fn, ok) {
    setOcupado(clave); setAviso(null);
    try { await fn(); if (ok) setAviso({ ok: true, texto: ok }); await cargar(); }
    catch (e) { setAviso({ ok: false, texto: e.message }); }
    finally { setOcupado(null); }
  }

  if (error) return <div className="panel"><h2>Brickslab y Biblioteca</h2><p className="sub">{error}</p></div>;
  if (!d) return <div className="panel"><p className="sub">Cargando…</p></div>;
  if (!yo) return <div className="panel"><h2>Brickslab y Biblioteca</h2><p className="sub">No hay nadie en tu familia todavía.</p></div>;

  const perms = yo.permisos || {};
  const lego = d.categorias.filter(c => c.modo === 'brickslab');
  const legoNormal = lego.some(c => perms[c.id]?.normalManual || perms[c.id]?.normalAuto);
  const legoPro = lego.some(c => perms[c.id]?.pro);
  // El Pro dado a mano por el club no se compra.
  const proManual = lego.some(c => perms[c.id]?.proManual);
  const pro = perms._pro || {};
  // Se ha dado de baja pero sigue con el mes pagado.
  const sigue = !!pro.baja && !!pro.pagadoHasta;
  const misReservas = d.reservas.filter(r => r.userId === yo.id);
  const miHistorial = d.historial.filter(h => h.userId === yo.id);
  const reservaEn = (catId) => misReservas.find(r => r.categoriaId === catId);
  const nombre = yo.nombre;

  // Por qué no se puede reservar algo (o el botón de reservar).
  function accionDe(a) {
    const p = perms[a.categoriaId];
    let motivo = null;
    if (!p?.normal) motivo = `${nombre} no tiene permiso en esta categoría`;
    else if (a.soloPro && !p.pro) motivo = 'Solo para miembros Pro';
    else if (reservaEn(a.categoriaId)) motivo = `Ya tiene «${reservaEn(a.categoriaId).titulo}»`;
    else if (!a.disponible) motivo = 'Ahora mismo está prestado';
    if (motivo) return <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 700, textAlign: 'center', padding: '8px 0' }}>{motivo}</div>;
    return (
      <button type="button" className="btn btn-primary btn-block" disabled={!!ocupado} onClick={() => hacer(`r${a.id}`, () => api('/api/me/brickslab/reservas', { method: 'POST', body: { alumnoId: yo.id, articuloId: a.id } }), `Reservado para ${nombre}. Recógelo en el club.`)}>
        {ocupado === `r${a.id}` ? 'Reservando…' : `Reservar para ${nombre}`}
      </button>
    );
  }

  const rkCatId = rkCat || d.ranking[0]?.categoriaId;
  const rk = (d.ranking.find(r => r.categoriaId === rkCatId)?.filas || []).filter(f => f[rkPeriodo] > 0).sort((a, b) => b[rkPeriodo] - a[rkPeriodo]);

  return (
    <div className="panel" style={{ display: 'grid', gap: 18 }}>
      <div>
        <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Box size={22} /> Brickslab y Biblioteca</h2>
        <p className="sub">Sets de LEGO para montar y libros para leer. Se reservan aquí y se recogen en el club.</p>
      </div>

      {miembros.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="tablist" aria-label="Para quién">
          {miembros.map(m => (
            <button key={m.id} type="button" role="tab" aria-selected={m.id === yo.id} className={`filter-pill ${m.id === yo.id ? 'is-active' : ''}`} onClick={() => { setQuien(m.id); setAviso(null); }}>
              {m.nombre}{!conPermiso(m) ? ' · sin permiso' : ''}
            </button>
          ))}
        </div>
      )}

      {/* Lo que puede hacer en cada categoría */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {d.categorias.map(c => {
          const p = perms[c.id] || {};
          return (
            <span key={c.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, padding: '6px 11px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
              <IconoCategoria nombre={c.icono} size={14} /> {c.nombre}:
              <b style={{ color: p.pro ? '#B45309' : p.normal ? 'var(--teal)' : 'var(--ink-3)' }}>{p.pro ? 'Pro' : p.normal ? 'Normal' : 'sin permiso'}</b>
            </span>
          );
        })}
      </div>

      {aviso && <div role="status" style={{ padding: '10px 14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: aviso.ok ? 'color-mix(in oklab, var(--teal) 12%, var(--bg-2))' : 'color-mix(in oklab, var(--orange) 12%, var(--bg-2))', color: aviso.ok ? 'var(--teal)' : 'var(--orange)' }}>{aviso.texto}</div>}

      {/* El Pro, de pago por la web */}
      {d.pro && lego.length > 0 && (
        <div style={{ borderRadius: 16, padding: 16, display: 'grid', gap: 8, background: 'linear-gradient(135deg, color-mix(in oklab, #FFD526 30%, var(--bg-2)), var(--bg-2))', border: '1px solid color-mix(in oklab, #FFD526 55%, var(--line))' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 16, display: 'inline-flex', gap: 6, alignItems: 'center' }}><Trophy size={18} /> Brickslab Pro</b>
            <span style={{ fontSize: 13, fontWeight: 800 }}>{eur(d.pro.precio)} al mes</span>
            <div style={{ flex: 1 }} />
            {pro.suscrito && pro.debe && <span style={chip('var(--orange)')}>Pendiente de pago</span>}
            {pro.suscrito && !pro.debe && pro.pagadoHasta && <span style={chip('var(--teal)')}>Activo</span>}
            {sigue && <span style={chip('var(--ink-2)')}>Pro hasta el {fechaLarga(pro.baja)}</span>}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{d.pro.texto || 'Llévate los sets a casa para montarlos, accede a los sets exclusivos y ten prioridad en las novedades.'}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {!pro.suscrito && !proManual && !legoNormal && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>El Pro es para quien ya está en Brickslab: apúntate primero a la clase.</span>}
            {!pro.suscrito && !proManual && legoNormal && (
              <button type="button" className="btn btn-primary" disabled={!!ocupado}
                onClick={() => {
                  const pregunta = sigue ? `¿Seguir con el Pro de ${nombre}? Se le volverá a cobrar cada mes.` : `¿Activar Brickslab Pro para ${nombre}? Son ${eur(d.pro.precio)} al mes, que se pagan con las demás mensualidades. Te puedes dar de baja cuando quieras.`;
                  if (window.confirm(pregunta)) hacer('pro', () => api('/api/me/brickslab/pro', { method: 'POST', body: { alumnoId: yo.id } }), sigue ? 'Hecho: sigue con el Pro.' : 'Pro activado. Págalo en «Pagos y recibos» y lo tendrá en cuanto se pague.');
                }}>
                {ocupado === 'pro' ? 'Un momento…' : sigue ? 'Seguir con el Pro' : `Activar Pro para ${nombre}`}
              </button>
            )}
            {pro.suscrito && pro.debe && <button type="button" className="btn btn-primary" onClick={() => go('/dashboard/pagos')}>Pagarlo ahora</button>}
            {pro.suscrito && (
              <button type="button" className="btn btn-sm btn-outline" disabled={!!ocupado}
                onClick={() => { if (window.confirm(`¿Dar de baja el Pro de ${nombre}? Lo mantiene hasta que acabe el mes que ya está pagado.`)) hacer('baja', () => api(`/api/me/brickslab/pro/${yo.id}`, { method: 'DELETE' }), 'Baja hecha: ya no se le cobrará más.'); }}>
                Darse de baja
              </button>
            )}
            {!pro.suscrito && proManual && <span style={{ fontSize: 13, fontWeight: 700, color: '#B45309' }}>{nombre} tiene el Pro que le ha dado el club.</span>}
          </div>
        </div>
      )}

      {/* Sus reservas */}
      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Lo que tiene {nombre}</h3>
        {!misReservas.length ? <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Nada ahora mismo. Elige algo del catálogo de abajo.</p> : misReservas.map(r => (
          <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg-2)', flexWrap: 'wrap' }}>
            {r.imagen ? <img src={r.imagen} alt="" referrerPolicy="no-referrer" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8, background: '#fff' }} /> : null}
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <b style={{ fontSize: 14 }}>{r.titulo}</b>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.categoria} · reservado el {fmtFecha(r.fecha)}</div>
            </div>
            <span style={chip(r.estado === 'Delivered' ? 'var(--teal)' : 'var(--purple)')}>{r.estado === 'Delivered' ? 'Lo tiene' : 'Por recoger en el club'}</span>
            {r.estado !== 'Delivered' && <button type="button" className="btn btn-sm btn-outline" disabled={!!ocupado} onClick={() => { if (window.confirm(`¿Anular la reserva de «${r.titulo}»?`)) hacer(`c${r.id}`, () => api(`/api/me/brickslab/reservas/${r.id}`, { method: 'DELETE' }), 'Reserva anulada.'); }}>Anular</button>}
            {r.estado === 'Delivered' && lego.some(c => c.id === r.categoriaId) && <button type="button" className="btn btn-sm btn-outline" onClick={() => setPiezas({ reserva: r, texto: '' })}>Faltan piezas</button>}
          </div>
        ))}
        {piezas && (
          <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, background: 'var(--bg-3)' }}>
            <b style={{ fontSize: 14 }}>¿Qué piezas faltan en «{piezas.reserva.titulo}»?</b>
            <textarea value={piezas.texto} onChange={e => setPiezas(p => ({ ...p, texto: e.target.value }))} rows={3} maxLength={2000} placeholder="Por ejemplo: una rueda negra pequeña y dos ladrillos rojos 2x4." style={{ ...campo, background: 'var(--bg-2)', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setPiezas(null)}>Cancelar</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={piezas.texto.trim().length < 3 || !!ocupado}
                onClick={() => hacer('piezas', () => api('/api/me/brickslab/piezas', { method: 'POST', body: { alumnoId: yo.id, articuloId: piezas.reserva.articuloId, descripcion: piezas.texto } }).then(() => setPiezas(null)), 'Gracias: el club lo revisará.')}>Avisar</button>
            </div>
          </div>
        )}
      </section>

      {/* La votación de compras */}
      {d.votacion && lego.length > 0 && (
        <section style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>🗳️ {d.votacion.titulo}</h3>
            {d.votacion.descripcion && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>{d.votacion.descripcion}</p>}
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
              {d.votacion.hasta ? `Se puede votar hasta el ${fechaLarga(d.votacion.hasta)}. ` : ''}{legoNormal || legoPro ? (yo.voto ? `${nombre} ya ha votado.` : `Vota por ${nombre}: un voto por persona.`) : `Votan quienes están en Brickslab.`}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
            {d.votacion.opciones.map(o => {
              const total = d.votacion.opciones.reduce((s, x) => s + x.votos, 0) || 1;
              const mia = yo.voto === o.id;
              return (
                <div key={o.id} style={{ borderRadius: 12, border: `2px solid ${mia ? 'var(--purple)' : 'var(--line)'}`, overflow: 'hidden', display: 'grid' }}>
                  {o.imagen && <img src={o.imagen} alt="" referrerPolicy="no-referrer" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', background: '#fff' }} />}
                  <div style={{ padding: 10, display: 'grid', gap: 6 }}>
                    <b style={{ fontSize: 13 }}>{o.titulo}</b>
                    <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-3)' }}><div style={{ height: '100%', width: `${Math.round(o.votos / total * 100)}%`, borderRadius: 99, background: 'var(--purple)' }} /></div>
                    <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{o.votos} voto{o.votos !== 1 ? 's' : ''}{mia ? ' · su voto' : ''}</span>
                    {(legoNormal || legoPro) && !yo.voto && (
                      <button type="button" className="btn btn-sm btn-outline" disabled={!!ocupado} onClick={() => hacer(`v${o.id}`, () => api('/api/me/brickslab/votar', { method: 'POST', body: { alumnoId: yo.id, opcionId: o.id } }), `Voto de ${nombre} guardado.`)}>Votar</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* El catálogo */}
      <section style={{ display: 'grid', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Catálogo</h3>
        {barra}
        {catActual?.descripcion && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>{catActual.descripcion}</p>}
        {!lista.length ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No hay nada con estos filtros.</p>
          : <div style={rejilla}>{lista.map(a => <TarjetaArticulo key={a.id} a={a} cat={catActual} accion={accionDe(a)} />)}</div>}
      </section>

      {/* Lo que ha montado o leído y el ranking */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <section style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Lo que ha montado y leído</h3>
          {!miHistorial.length ? <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Todavía nada. ¡A por el primero!</p> : (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {d.categorias.map(c => { const n = miHistorial.filter(h => h.categoriaId === c.id).length; return n ? <span key={c.id} style={chip('var(--purple)')}>{c.nombre}: {n}</span> : null; })}
              </div>
              <div style={{ display: 'grid', gap: 4, maxHeight: 320, overflow: 'auto' }}>
                {miHistorial.map(h => (
                  <div key={h.id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '6px 2px', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{h.titulo}</span><span style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{fmtFecha(h.fecha)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
        {d.ranking.length > 0 && (
          <section style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>🏆 Ranking</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {d.ranking.length > 1 && d.ranking.map(r => <button key={r.categoriaId} type="button" className={`filter-pill ${rkCatId === r.categoriaId ? 'is-active' : ''}`} onClick={() => setRkCat(r.categoriaId)}>{d.categorias.find(c => c.id === r.categoriaId)?.nombre}</button>)}
              {[['mes', 'Este mes'], ['anio', 'Este año'], ['total', 'Siempre']].map(([k, l]) => <button key={k} type="button" className={`filter-pill ${rkPeriodo === k ? 'is-active' : ''}`} onClick={() => setRkPeriodo(k)}>{l}</button>)}
            </div>
            {!rk.length ? <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Nadie todavía en este periodo.</p> : (
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                {rk.slice(0, 10).map((f, i) => (
                  <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, padding: '6px 10px', borderRadius: 10, background: f.mio ? 'color-mix(in oklab, var(--purple) 12%, var(--bg-2))' : 'transparent', fontWeight: f.mio ? 800 : 500 }}>
                    <span style={{ width: 22, textAlign: 'right', color: 'var(--ink-3)' }}>{['🥇', '🥈', '🥉'][i] || `${i + 1}.`}</span>
                    <span style={{ flex: 1 }}>{f.nombre}</span><b>{f[rkPeriodo]}</b>
                  </li>
                ))}
                {rk.slice(10).filter(f => f.mio).map(f => (
                  <li key={f.userId} style={{ display: 'flex', gap: 10, fontSize: 14, padding: '6px 10px', fontWeight: 800 }}>
                    <span style={{ width: 22, textAlign: 'right' }}>{rk.indexOf(f) + 1}.</span><span style={{ flex: 1 }}>{f.nombre}</span><b>{f[rkPeriodo]}</b>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// ═══ En la web, sin entrar ═══
export default function BrickslabPublico() {
  const { go, user } = useRouter();
  const [d, setD] = useState(null);
  useEffect(() => {
    fetch('/api/brickslab/catalogo').then(r => (r.ok ? r.json() : null)).then(x => setD(x || { categorias: [], articulos: [] })).catch(() => setD({ categorias: [], articulos: [] }));
  }, []);
  const { lista, barra, catActual } = useFiltroCatalogo(d?.categorias || [], d?.articulos || []);
  return (
    <>
      <AimHeader route="brickslab" />
      <main style={{ paddingTop: 0 }}>
        <section className="block tight">
          <div className="container" style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 420px' }}>
                <span className="eyebrow purple">Brickslab y Biblioteca</span>
                <h1 className="section-title" style={{ marginTop: 6 }}>Sets de LEGO y libros para llevarte</h1>
                <p className="section-lede" style={{ marginTop: 8 }}>Todo lo que se puede montar y leer en el club. Los alumnos lo reservan desde su área y lo recogen en el club.</p>
              </div>
              <button type="button" className="btn btn-gradient btn-lg" onClick={() => go(user ? '/dashboard/brickslab' : '/auth?volver=/dashboard/brickslab')}>
                {user ? 'Reservar desde mi área' : 'Entrar para reservar'} <I.Arrow />
              </button>
            </div>
            {d?.pro && (
              <div style={{ borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: 'linear-gradient(135deg, color-mix(in oklab, #FFD526 30%, var(--bg-2)), var(--bg-2))', border: '1px solid color-mix(in oklab, #FFD526 55%, var(--line))' }}>
                <Trophy size={22} />
                <div style={{ flex: '1 1 300px', fontSize: 14 }}>
                  <b>Brickslab Pro · {eur(d.pro.precio)} al mes.</b> {d.pro.texto || 'Llévate los sets a casa para montarlos, accede a los sets exclusivos y ten prioridad en las novedades.'}
                </div>
              </div>
            )}
            {!d ? <p style={{ color: 'var(--ink-3)' }}>Cargando…</p> : (
              <>
                {barra}
                {catActual?.descripcion && <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)' }}>{catActual.descripcion}</p>}
                {!lista.length ? <p style={{ color: 'var(--ink-3)' }}>No hay nada con estos filtros.</p>
                  : <div style={rejilla}>{lista.map(a => <TarjetaArticulo key={a.id} a={a} cat={catActual} />)}</div>}
              </>
            )}
          </div>
        </section>
      </main>
      <AimFooter />
    </>
  );
}
