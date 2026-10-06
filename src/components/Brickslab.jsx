import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Book, Package, Puzzle, Gamepad2, Music, Palette, Rocket, Star, Trophy, Search, X, Home, Sparkles, CalendarCheck, Medal } from 'lucide-react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter } from './Shared.jsx';
import { useRouter } from '../App.jsx';
import { fmtFecha } from '../fechas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Brickslab y Biblioteca (#291): el préstamo de sets de LEGO y de libros.
//  · CatalogoBK: el catálogo (buscador, categorías, orden y la ficha de cada
//    artículo). Lo usan la página pública, el área de familias y el panel.
//  · BrickslabFamilia: en el área de la familia, para cada hijo: reservar, lo
//    que tiene, lo que ha montado o leído, el ranking, las votaciones y el Pro.
//  · BrickslabPublico: la página de la web (/brickslab), sin entrar.
// ─────────────────────────────────────────────────────────────────────────────

export const ICONOS_BRICKS = { Box, Book, Package, Puzzle, Gamepad2, Music, Palette, Rocket, Star, Trophy };
export const IconoCategoria = ({ nombre, size = 16 }) => { const C = ICONOS_BRICKS[nombre] || Package; return <C size={size} strokeWidth={2.2} />; };
const eur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`;
const fechaLarga = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : '');
const colorCat = (cat) => (cat?.modo === 'library' ? '#00BBF4' : '#FFD526');
const iniciales = (n, a) => `${(n || '?')[0] || ''}${(a || '')[0] || ''}`.toUpperCase();
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VENTAJAS_PRO = ['Llévate los sets a casa', 'Sets exclusivos Pro', 'Prioridad en las novedades'];

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

// Los datos de cada artículo que se enseñan: autor, referencia, piezas…
function datosDe(a, cat) {
  return (cat?.campos || []).filter(f => a.datos?.[f.name]).map(f => ({ label: f.label, valor: a.datos[f.name] }));
}
const disponibilidad = (a) => (a.activo === false ? 'Retirado' : a.disponible ? (a.stock > 1 ? `${a.libres} de ${a.stock} libres` : 'Disponible') : 'Prestado');

function Portada({ a, cat, onClick, grande = false }) {
  const [rota, setRota] = useState(false);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`bk-portada${cat?.modo === 'library' ? ' libro' : ''}`} style={{ '--bk-c': colorCat(cat) }}
      onClick={onClick} aria-label={onClick ? `Ver «${a.titulo}»` : undefined}>
      {a.imagen && !rota
        ? <img src={a.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setRota(true)} />
        : <IconoCategoria nombre={cat?.icono} size={grande ? 64 : 44} />}
      <span className="bk-sellos">
        <span>{a.soloPro && <span className="bk-sello pro"><Sparkles size={11} /> PRO</span>}</span>
        <span className={`bk-sello ${a.disponible ? 'libre' : 'fuera'}`}><span className="punto" />{disponibilidad(a)}</span>
      </span>
    </Tag>
  );
}

// Una tarjeta del catálogo. `accion` es el botón (reservar, editar…) o lo que lo impide.
export function TarjetaArticulo({ a, cat, accion = null, onAbrir = null }) {
  const datos = datosDe(a, cat);
  return (
    <article className={`bk-card${a.activo === false ? ' apagado' : ''}`}>
      <Portada a={a} cat={cat} onClick={onAbrir} />
      <div className="bk-cuerpo">
        <span className="bk-tipo"><IconoCategoria nombre={cat?.icono} size={12} /> {cat?.nombre}</span>
        <h3 className="bk-titulo">{a.titulo}</h3>
        {datos.length > 0 && <div className="bk-meta">{datos.map(d => d.valor).join(' · ')}</div>}
        {a.descripcion && <p className="bk-desc">{a.descripcion}</p>}
      </div>
      {accion && <div className="bk-pie">{accion}</div>}
    </article>
  );
}

// La ficha completa de un artículo.
export function FichaArticulo({ a, cat, accion = null, onCerrar }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', k);
    const antes = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = antes; };
  }, [onCerrar]);
  const datos = datosDe(a, cat);
  // Llevárselo a casa es lo del Pro en LEGO (los libros se leen en casa igualmente).
  const aCasa = cat?.modo === 'brickslab' && cat?.enCasa && a.datos?.allowHomeBuild !== false;
  return (
    <div className="bk-fondo" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="bk-ficha bk" role="dialog" aria-modal="true" aria-label={a.titulo}>
        <button type="button" className="bk-cerrar" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        <Portada a={a} cat={cat} grande />
        <div className="bk-ficha-datos">
          <span className="bk-tipo"><IconoCategoria nombre={cat?.icono} size={13} /> {cat?.nombre}</span>
          <h2>{a.titulo}</h2>
          {datos.length > 0 && <dl>{datos.map(d => <React.Fragment key={d.label}><dt>{d.label}</dt><dd>{d.valor}</dd></React.Fragment>)}</dl>}
          {a.descripcion && <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{a.descripcion}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className={`bk-sello ${a.disponible ? 'libre' : 'fuera'}`} style={{ boxShadow: 'none', border: '1px solid var(--line)' }}><span className="punto" />{disponibilidad(a)}</span>
            {a.soloPro && <span className="bk-sello pro" style={{ boxShadow: 'none' }}><Sparkles size={11} /> Solo para Pro</span>}
            {aCasa && <span className="bk-sello" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}><Home size={12} /> Con Pro, a casa</span>}
          </div>
          {accion && <div style={{ marginTop: 6 }}>{accion}</div>}
        </div>
      </div>
    </div>
  );
}

// El catálogo entero: buscador, categorías, solo lo disponible y el orden.
export function CatalogoBK({ categorias, articulos, accionDe = null, onAbrir = null, extra = null, conTodo = true }) {
  const [cat, setCat] = useState(conTodo ? 'todo' : null);
  const [q, setQ] = useState('');
  const [libres, setLibres] = useState(false);
  const [orden, setOrden] = useState('nuevo');
  const [abierto, setAbierto] = useState(null);
  const porId = useMemo(() => Object.fromEntries(categorias.map(c => [c.id, c])), [categorias]);
  const actual = cat || categorias[0]?.id || 'todo';
  const lista = useMemo(() => {
    const n = sinTildes(q.trim());
    const l = articulos.filter(a => (actual === 'todo' || a.categoriaId === actual) && (!libres || a.disponible)
      && (!n || n.split(/\s+/).every(p => sinTildes([a.titulo, a.descripcion, ...Object.values(a.datos || {})].join(' ')).includes(p))));
    if (orden === 'az') return [...l].sort((x, y) => x.titulo.localeCompare(y.titulo, 'es'));
    if (orden === 'popular') return [...l].sort((x, y) => (y.veces || 0) - (x.veces || 0));
    return l;
  }, [articulos, actual, q, libres, orden]);
  const abiertoA = articulos.find(a => a.id === abierto);
  const abrir = (a) => (onAbrir ? onAbrir(a) : setAbierto(a.id));
  return (
    <div className="bk" style={{ display: 'grid', gap: 16 }}>
      <div className="bk-barra">
        <div className="bk-barra-fila">
          <label className="bk-buscar">
            <Search size={17} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Busca un set, un libro, un autor o una referencia…" aria-label="Buscar en el catálogo" />
          </label>
          <select className="bk-orden" value={orden} onChange={e => setOrden(e.target.value)} aria-label="Ordenar">
            <option value="nuevo">Lo más nuevo</option>
            <option value="popular">Lo más prestado</option>
            <option value="az">De la A a la Z</option>
          </select>
          {extra}
        </div>
        <div className="bk-barra-fila">
          <div className="bk-cats" role="tablist" aria-label="Categorías">
            {conTodo && <button type="button" role="tab" aria-selected={actual === 'todo'} className={`bk-cat ${actual === 'todo' ? 'on' : ''}`} onClick={() => setCat('todo')}>Todo <span className="n">{articulos.length}</span></button>}
            {categorias.map(c => (
              <button key={c.id} type="button" role="tab" aria-selected={actual === c.id} className={`bk-cat ${actual === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>
                <IconoCategoria nombre={c.icono} size={15} /> {c.nombre} <span className="n">{articulos.filter(a => a.categoriaId === c.id).length}</span>
              </button>
            ))}
          </div>
          <label className="bk-check"><input type="checkbox" checked={libres} onChange={e => setLibres(e.target.checked)} /> Solo lo disponible</label>
          <span className="bk-cuenta">{lista.length} {lista.length === 1 ? 'artículo' : 'artículos'}</span>
        </div>
      </div>
      {!lista.length ? (
        <div className="bk-vacio"><Search size={28} /><b>No hay nada con esa búsqueda.</b><span style={{ fontSize: 13 }}>Prueba con otra palabra o quita «Solo lo disponible».</span></div>
      ) : (
        <div className="bk-grid">
          {lista.map(a => <TarjetaArticulo key={a.id} a={a} cat={porId[a.categoriaId]} onAbrir={() => abrir(a)} accion={accionDe ? accionDe(a, false) : null} />)}
        </div>
      )}
      {abiertoA && <FichaArticulo a={abiertoA} cat={porId[abiertoA.categoriaId]} accion={accionDe ? accionDe(abiertoA, true) : null} onCerrar={() => setAbierto(null)} />}
    </div>
  );
}

// El bloque del Pro (en la web y en el área de familias). Si en los ajustes se
// escribe lo que incluye en varias líneas, salen como lista.
function BloquePro({ pro, children }) {
  const lineas = String(pro.texto || '').split('\n').map(x => x.replace(/^[-·•*]\s*/, '').trim()).filter(Boolean);
  const ventajas = lineas.length > 1 ? lineas : VENTAJAS_PRO;
  return (
    <div className="bk-pro">
      <div className="icono"><Trophy size={26} /></div>
      <div>
        <h3>Brickslab Pro</h3>
        {lineas.length === 1 && <p>{lineas[0]}</p>}
        <ul>{ventajas.map(v => <li key={v}>✓ {v}</li>)}</ul>
        {children}
      </div>
      <div className="precio">{eur(pro.precio)}<small>al mes</small></div>
    </div>
  );
}

// ═══ En el área de la familia ═══
export function BrickslabFamilia() {
  const { go } = useRouter();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [quien, setQuien] = useState(null);
  const [tab, setTab] = useState('catalogo');
  const [ocupado, setOcupado] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [piezas, setPiezas] = useState(null); // { reserva, texto }
  const [rkCat, setRkCat] = useState(null);
  const [rkPeriodo, setRkPeriodo] = useState('mes');

  const cargar = useCallback(() => api('/api/me/brickslab').then(x => { setD(x); setError(null); }).catch(e => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);

  const conPermiso = (m) => Object.entries(m.permisos || {}).some(([k, p]) => k !== '_pro' && p?.normal);
  // Si dos de la familia se llaman igual (un padre y su hijo), con el primer apellido.
  const miembros = useMemo(() => {
    const l = d?.miembros || [];
    const repetido = (n) => l.filter(x => x.nombre.trim().toLowerCase() === n.trim().toLowerCase()).length > 1;
    return l.map(m => ({ ...m, nombre: repetido(m.nombre) && m.apellidos ? `${m.nombre} ${m.apellidos.split(/\s+/)[0]}` : m.nombre }))
      .sort((a, b) => conPermiso(b) - conPermiso(a));
  }, [d]);
  const yo = miembros.find(m => m.id === quien) || miembros[0] || null;

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
  const legoIds = lego.map(c => c.id);
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
  const puedeVotar = (legoNormal || legoPro) && !!d.votacion;
  const montados = miHistorial.filter(h => legoIds.includes(h.categoriaId)).length;
  const leidos = miHistorial.length - montados;
  const rkLego = d.ranking.find(r => legoIds.includes(r.categoriaId));
  const puesto = (() => {
    const filas = (rkLego?.filas || []).filter(f => f.mes > 0).sort((a, b) => b.mes - a.mes);
    const i = filas.findIndex(f => f.userId === yo.id);
    return i >= 0 ? i + 1 : null;
  })();

  // El botón de reservar (o por qué no se puede).
  function accionDe(a, grande) {
    const p = perms[a.categoriaId];
    let motivo = null;
    if (!p?.normal) motivo = `${nombre} no tiene permiso en ${d.categorias.find(c => c.id === a.categoriaId)?.nombre || 'esta categoría'}`;
    else if (a.soloPro && !p.pro) motivo = 'Solo para miembros Pro';
    else if (reservaEn(a.categoriaId)) motivo = `Ya tiene «${reservaEn(a.categoriaId).titulo}»`;
    else if (!a.disponible) motivo = 'Ahora mismo está prestado';
    if (motivo) return <div className="bk-motivo">{motivo}</div>;
    return (
      <button type="button" className={`btn btn-primary btn-block${grande ? ' btn-lg' : ''}`} disabled={!!ocupado}
        onClick={() => hacer(`r${a.id}`, () => api('/api/me/brickslab/reservas', { method: 'POST', body: { alumnoId: yo.id, articuloId: a.id } }), `Reservado para ${nombre}: recógelo en el club.`)}>
        {ocupado === `r${a.id}` ? 'Reservando…' : `Reservar para ${nombre}`}
      </button>
    );
  }

  const rkCatId = rkCat || d.ranking[0]?.categoriaId;
  const rk = (d.ranking.find(r => r.categoriaId === rkCatId)?.filas || []).filter(f => f[rkPeriodo] > 0).sort((a, b) => b[rkPeriodo] - a[rkPeriodo]);
  const PESTANAS = [
    ['catalogo', 'Catálogo'],
    ['tiene', `Lo que tiene${misReservas.length ? ` · ${misReservas.length}` : ''}`],
    ['historial', `Historial${miHistorial.length ? ` · ${miHistorial.length}` : ''}`],
    ...(d.ranking.length ? [['ranking', 'Ranking']] : []),
    ...(d.votacion && lego.length ? [['votacion', 'Votación']] : []),
  ];

  return (
    <div className="panel bk" style={{ display: 'grid', gap: 18 }}>
      <div>
        <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Box size={22} /> Brickslab y Biblioteca</h2>
        <p className="sub">Sets de LEGO para montar y libros para leer. Se reservan aquí y se recogen en el club.</p>
      </div>

      {miembros.length > 1 && (
        <div className="bk-ninos" role="tablist" aria-label="Para quién">
          {miembros.map(m => {
            const p = m.permisos || {};
            const etiqueta = d.categorias.filter(c => p[c.id]?.normal).map(c => `${c.modo === 'brickslab' ? 'LEGO' : c.nombre}${p[c.id]?.pro ? ' Pro' : ''}`).join(' · ') || 'Sin permiso';
            return (
              <button key={m.id} type="button" role="tab" aria-selected={m.id === yo.id} className={`bk-nino ${m.id === yo.id ? 'on' : ''}`} onClick={() => { setQuien(m.id); setAviso(null); }}>
                <span className="bk-avatar">{iniciales(m.nombre, m.apellidos)}</span>
                <span><b>{m.nombre}</b><small>{etiqueta}</small></span>
              </button>
            );
          })}
        </div>
      )}

      <div className="bk-resumen">
        <div className="bk-dato"><b>{montados}</b><span>sets montados</span></div>
        <div className="bk-dato"><b>{leidos}</b><span>libros leídos</span></div>
        <div className="bk-dato"><b>{misReservas.length}</b><span>{misReservas.length === 1 ? 'reserva ahora' : 'reservas ahora'}</span></div>
        <div className="bk-dato"><b>{puesto ? `${puesto}º` : '—'}</b><span>en el ranking del mes</span></div>
        {d.categorias.map(c => {
          const p = perms[c.id] || {};
          return <div key={c.id} className="bk-dato"><b style={{ fontSize: 17, color: p.pro ? '#B45309' : p.normal ? 'var(--teal)' : 'var(--ink-3)', display: 'flex', gap: 6, alignItems: 'center' }}><IconoCategoria nombre={c.icono} size={16} /> {p.pro ? 'Pro' : p.normal ? 'Normal' : 'Sin permiso'}</b><span>{c.nombre}</span></div>;
        })}
      </div>

      {aviso && <div role="status" className={`bk-aviso ${aviso.ok ? 'ok' : 'mal'}`}>{aviso.texto}</div>}

      {d.pro && lego.length > 0 && (
        <BloquePro pro={d.pro}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
            {pro.suscrito && pro.debe && <span className="bk-sello fuera" style={{ boxShadow: 'none' }}>Pendiente de pago</span>}
            {pro.suscrito && !pro.debe && pro.pagadoHasta && <span className="bk-sello libre" style={{ boxShadow: 'none' }}><span className="punto" />Activo</span>}
            {sigue && <span className="bk-sello" style={{ boxShadow: 'none' }}>Pro hasta el {fechaLarga(pro.baja)}</span>}
            {!pro.suscrito && !proManual && !legoNormal && <span style={{ fontSize: 13 }}>El Pro es para quien ya está en Brickslab: apúntate primero a la clase.</span>}
            {!pro.suscrito && !proManual && legoNormal && (
              <button type="button" className="btn btn-pro" disabled={!!ocupado}
                onClick={() => {
                  const pregunta = sigue ? `¿Seguir con el Pro de ${nombre}? Se le volverá a cobrar cada mes.` : `¿Activar Brickslab Pro para ${nombre}? Son ${eur(d.pro.precio)} al mes, que se pagan con las demás mensualidades. Te puedes dar de baja cuando quieras.`;
                  if (window.confirm(pregunta)) hacer('pro', () => api('/api/me/brickslab/pro', { method: 'POST', body: { alumnoId: yo.id } }), sigue ? 'Hecho: sigue con el Pro.' : 'Pro activado. Págalo en «Pagos y recibos» y lo tendrá en cuanto se pague.');
                }}>
                {ocupado === 'pro' ? 'Un momento…' : sigue ? 'Seguir con el Pro' : `Activar Pro para ${nombre}`}
              </button>
            )}
            {pro.suscrito && pro.debe && <button type="button" className="btn btn-pro" onClick={() => go('/dashboard/pagos')}>Pagarlo ahora</button>}
            {pro.suscrito && (
              <button type="button" className="btn btn-sm btn-outline" disabled={!!ocupado} style={{ background: 'rgba(255,255,255,.6)', color: '#3b2a00' }}
                onClick={() => { if (window.confirm(`¿Dar de baja el Pro de ${nombre}? Lo mantiene hasta que acabe el mes que ya está pagado.`)) hacer('baja', () => api(`/api/me/brickslab/pro/${yo.id}`, { method: 'DELETE' }), 'Baja hecha: ya no se le cobrará más.'); }}>
                Darse de baja
              </button>
            )}
            {!pro.suscrito && proManual && <span style={{ fontSize: 13, fontWeight: 800 }}>{nombre} tiene el Pro que le ha dado el club.</span>}
          </div>
        </BloquePro>
      )}

      <div className="bk-pestanas" role="tablist">
        {PESTANAS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`bk-pestana ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            {l}{k === 'votacion' && puedeVotar && !yo.voto ? <span className="bola" aria-label="sin votar" /> : null}
          </button>
        ))}
      </div>

      {tab === 'catalogo' && <CatalogoBK categorias={d.categorias} articulos={d.articulos} accionDe={accionDe} />}

      {tab === 'tiene' && (
        <section style={{ display: 'grid', gap: 10 }}>
          {!misReservas.length ? <div className="bk-vacio"><Box size={28} /><b>{nombre} no tiene nada ahora mismo.</b><button type="button" className="btn btn-sm btn-outline" onClick={() => setTab('catalogo')}>Ver el catálogo</button></div> : misReservas.map(r => (
            <div key={r.id} className="bk-fila">
              {r.imagen ? <img className="mini" src={r.imagen} alt="" referrerPolicy="no-referrer" /> : <span className="mini"><Box size={22} /></span>}
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <b style={{ fontSize: 15 }}>{r.titulo}</b>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{r.categoria} · reservado el {fmtFecha(r.fecha)}</div>
              </div>
              <span className={`bk-sello ${r.estado === 'Delivered' ? 'libre' : ''}`} style={{ boxShadow: 'none', border: '1px solid var(--line)', color: r.estado === 'Delivered' ? undefined : 'var(--purple)' }}>
                {r.estado === 'Delivered' ? <><span className="punto" />Lo tiene</> : <><CalendarCheck size={12} /> Por recoger en el club</>}
              </span>
              {r.estado !== 'Delivered' && <button type="button" className="btn btn-sm btn-outline" disabled={!!ocupado} onClick={() => { if (window.confirm(`¿Anular la reserva de «${r.titulo}»?`)) hacer(`c${r.id}`, () => api(`/api/me/brickslab/reservas/${r.id}`, { method: 'DELETE' }), 'Reserva anulada.'); }}>Anular</button>}
              {r.estado === 'Delivered' && legoIds.includes(r.categoriaId) && <button type="button" className="btn btn-sm btn-outline" onClick={() => setPiezas({ reserva: r, texto: '' })}>Faltan piezas</button>}
            </div>
          ))}
          {piezas && (
            <div style={{ display: 'grid', gap: 8, padding: 14, borderRadius: 16, background: 'var(--bg-3)', border: '1px solid var(--line)' }}>
              <b style={{ fontSize: 14 }}>¿Qué piezas faltan en «{piezas.reserva.titulo}»?</b>
              <textarea value={piezas.texto} onChange={e => setPiezas(p => ({ ...p, texto: e.target.value }))} rows={3} maxLength={2000} placeholder="Por ejemplo: una rueda negra pequeña y dos ladrillos rojos 2x4."
                style={{ fontFamily: 'inherit', fontSize: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setPiezas(null)}>Cancelar</button>
                <button type="button" className="btn btn-sm btn-primary" disabled={piezas.texto.trim().length < 3 || !!ocupado}
                  onClick={() => hacer('piezas', () => api('/api/me/brickslab/piezas', { method: 'POST', body: { alumnoId: yo.id, articuloId: piezas.reserva.articuloId, descripcion: piezas.texto } }).then(() => setPiezas(null)), 'Gracias: el club lo revisará.')}>Avisar</button>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'historial' && (
        !miHistorial.length ? <div className="bk-vacio"><Medal size={28} /><b>Todavía nada. ¡A por el primero!</b></div> : (
          <div className="bk-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {miHistorial.map(h => {
              const c = d.categorias.find(x => x.id === h.categoriaId);
              return (
                <div key={h.id} className="bk-card" style={{ boxShadow: 'none' }}>
                  <div className={`bk-portada${c?.modo === 'library' ? ' libro' : ''}`} style={{ '--bk-c': colorCat(c), cursor: 'default' }}>
                    {h.imagen ? <img src={h.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <IconoCategoria nombre={c?.icono} size={32} />}
                  </div>
                  <div style={{ padding: '10px 12px', display: 'grid', gap: 2 }}>
                    <b style={{ fontSize: 13, lineHeight: 1.25 }}>{h.titulo}</b>
                    <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{c?.modo === 'library' ? 'Leído' : 'Montado'} el {fmtFecha(h.fecha)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'ranking' && (
        <section style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {d.ranking.length > 1 && d.ranking.map(r => { const c = d.categorias.find(x => x.id === r.categoriaId); return <button key={r.categoriaId} type="button" className={`bk-cat ${rkCatId === r.categoriaId ? 'on' : ''}`} onClick={() => setRkCat(r.categoriaId)}><IconoCategoria nombre={c?.icono} size={14} /> {c?.nombre}</button>; })}
            <span style={{ width: 8 }} />
            {[['mes', 'Este mes'], ['anio', 'Este año'], ['total', 'Siempre']].map(([k, l]) => <button key={k} type="button" className={`bk-cat ${rkPeriodo === k ? 'on' : ''}`} onClick={() => setRkPeriodo(k)}>{l}</button>)}
          </div>
          {!rk.length ? <div className="bk-vacio"><Trophy size={28} /><b>Nadie todavía en este periodo.</b></div> : (
            <ol className="bk-podio">
              {rk.slice(0, 10).map((f, i) => (
                <li key={i} className={f.mio ? 'mio' : ''}>
                  <span className="pos">{['🥇', '🥈', '🥉'][i] || i + 1}</span>
                  <span style={{ flex: 1 }}>{f.nombre}</span><b>{f[rkPeriodo]}</b>
                </li>
              ))}
              {rk.slice(10).filter(f => f.mio).map(f => (
                <li key={f.userId} className="mio"><span className="pos">{rk.indexOf(f) + 1}</span><span style={{ flex: 1 }}>{f.nombre}</span><b>{f[rkPeriodo]}</b></li>
              ))}
            </ol>
          )}
          <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Cuenta lo que se ha devuelto en el club. Las familias ven el nombre y la inicial del apellido.</p>
        </section>
      )}

      {tab === 'votacion' && d.votacion && (
        <section style={{ display: 'grid', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>{d.votacion.titulo}</h3>
            {d.votacion.descripcion && <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--ink-2)' }}>{d.votacion.descripcion}</p>}
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>
              {d.votacion.hasta ? `Se puede votar hasta el ${fechaLarga(d.votacion.hasta)}. ` : ''}{puedeVotar ? (yo.voto ? `${nombre} ya ha votado.` : `Vota por ${nombre}: un voto por persona.`) : 'Votan quienes están en Brickslab.'}
            </p>
          </div>
          <div className="bk-opciones">
            {d.votacion.opciones.map(o => {
              const total = d.votacion.opciones.reduce((s, x) => s + x.votos, 0) || 1;
              const mia = yo.voto === o.id;
              return (
                <div key={o.id} className={`bk-opcion ${mia ? 'mia' : ''}`}>
                  {o.imagen && <img src={o.imagen} alt="" referrerPolicy="no-referrer" />}
                  <div style={{ padding: 12, display: 'grid', gap: 8 }}>
                    <b style={{ fontSize: 14 }}>{o.titulo}</b>
                    <div className="bk-barrita"><i style={{ width: `${Math.round(o.votos / total * 100)}%` }} /></div>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{o.votos} voto{o.votos !== 1 ? 's' : ''}{mia ? ' · su voto' : ''}</span>
                    {puedeVotar && !yo.voto && <button type="button" className="btn btn-sm btn-primary" disabled={!!ocupado} onClick={() => hacer(`v${o.id}`, () => api('/api/me/brickslab/votar', { method: 'POST', body: { alumnoId: yo.id, opcionId: o.id } }), `Voto de ${nombre} guardado.`)}>Votar</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
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
  const entrar = () => go(user ? '/dashboard/brickslab' : '/auth?volver=/dashboard/brickslab');
  const lego = (d?.categorias || []).filter(c => c.modo === 'brickslab').map(c => c.id);
  const arts = d?.articulos || [];
  const accion = (a, grande) => (
    <button type="button" className={`btn ${grande ? 'btn-primary btn-lg' : 'btn-outline'} btn-block`} onClick={entrar}>
      {user ? 'Reservar desde mi área' : 'Entra para reservarlo'}
    </button>
  );
  return (
    <>
      <AimHeader route="brickslab" />
      <main style={{ paddingTop: 0 }} className="bk">
        <section className="block tight">
          <div className="container" style={{ display: 'grid', gap: 26 }}>
            <div className="bk-hero">
              <div>
                <span className="eyebrow">Brickslab · Biblioteca</span>
                <h1>Monta, lee y llévatelo.</h1>
                <p>Sets de LEGO y libros del club para nuestros alumnos. Se reservan desde el área de la familia y se recogen en el club.</p>
                <div className="bk-hero-botones">
                  <button type="button" className="btn btn-lg btn-blanco" onClick={entrar}>{user ? 'Reservar desde mi área' : 'Entrar para reservar'} <I.Arrow /></button>
                  <button type="button" className="btn btn-lg btn-borde" onClick={() => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })}>Ver el catálogo</button>
                </div>
              </div>
              <div className="bk-cifras">
                <div className="bk-cifra"><b>{arts.filter(a => lego.includes(a.categoriaId)).length}</b><span>sets de LEGO</span></div>
                <div className="bk-cifra"><b>{arts.filter(a => !lego.includes(a.categoriaId)).length}</b><span>libros y más</span></div>
                <div className="bk-cifra"><b>{arts.filter(a => a.disponible).length}</b><span>libres ahora</span></div>
              </div>
            </div>

            <div className="bk-pasos">
              <div className="bk-paso"><span className="num">1</span><b>Reserva desde tu área</b><span>Elige el set o el libro y para quién de la familia es.</span></div>
              <div className="bk-paso"><span className="num">2</span><b>Recógelo en el club</b><span>Te lo damos en secretaría. Los Pro se pueden llevar los sets a casa.</span></div>
              <div className="bk-paso"><span className="num">3</span><b>Devuélvelo y suma</b><span>Cada set montado y cada libro leído cuenta en el ranking del club.</span></div>
            </div>

            {d?.pro && (
              <BloquePro pro={d.pro}>
                <button type="button" className="btn btn-pro" style={{ marginTop: 12 }} onClick={entrar}>{user ? 'Activarlo desde mi área' : 'Entra para activarlo'}</button>
              </BloquePro>
            )}

            <div id="catalogo" style={{ display: 'grid', gap: 14, scrollMarginTop: 90 }}>
              <div>
                <span className="eyebrow purple">Catálogo</span>
                <h2 className="section-title" style={{ marginTop: 6 }}>Todo lo que hay en el club</h2>
              </div>
              {!d ? <p style={{ color: 'var(--ink-3)' }}>Cargando…</p> : <CatalogoBK categorias={d.categorias} articulos={arts} accionDe={accion} />}
            </div>
          </div>
        </section>
      </main>
      <AimFooter />
    </>
  );
}
