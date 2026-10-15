import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, MagicText } from './Shared.jsx';
import { useRouter } from '../App.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Tienda online (ticket #432), la parte de quien compra:
//   /tienda            el catálogo
//   /tienda/<id>       un producto: fotos, tallas y añadir al carrito
//   /tienda/carrito    el carrito: entrega (recoger o a casa) y pagar
// y «Mis pedidos» en el área de familias (MisPedidos). El carrito se guarda en
// este navegador; el pedido de verdad se hace al pagar.
// ─────────────────────────────────────────────────────────────────────────────

const euros = (n) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fmtFecha = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');
const tarjeta = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 18 };
const inp = { fontFamily: 'inherit', fontSize: 15, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box' };

// ── El carrito, en este navegador ──
const CLAVE = 'aim_tienda_carrito';
function leerCarrito() {
  try { const c = JSON.parse(localStorage.getItem(CLAVE) || '[]'); return Array.isArray(c) ? c.filter(x => x && x.varianteId && x.cantidad > 0) : []; } catch { return []; }
}
function guardarCarrito(c) {
  try { localStorage.setItem(CLAVE, JSON.stringify(c)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event('aim-carrito'));
}
function useCarrito() {
  const [c, setC] = useState(leerCarrito);
  useEffect(() => {
    const f = () => setC(leerCarrito());
    window.addEventListener('aim-carrito', f); window.addEventListener('storage', f);
    return () => { window.removeEventListener('aim-carrito', f); window.removeEventListener('storage', f); };
  }, []);
  return c;
}

// Pagar unos cargos con tarjeta o Bizum: el mismo pago que el resto.
async function pagarCargos(cargoIds) {
  const r = await fetch('/api/me/pagos/iniciar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ cargoIds }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido iniciar el pago.');
  const form = document.createElement('form');
  form.method = 'POST'; form.action = d.url;
  for (const [k, v] of Object.entries(d.campos)) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; form.appendChild(i); }
  document.body.appendChild(form);
  form.submit();
}

function useCatalogo() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/tienda/productos', { credentials: 'include', cache: 'no-store' })
      .then(async r => { const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'No se ha podido cargar la tienda.'); setD(x); })
      .catch(e => setError(e.message));
  }, []);
  return { d, error };
}

const pastilla = (color) => ({ fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 999, color, background: `color-mix(in oklab, ${color} 13%, var(--bg-2))` });
const Foto = ({ src, alto = '100%', alt = '' }) => (src
  ? <img src={src} alt={alt} loading="lazy" style={{ width: '100%', height: alto, objectFit: 'cover', display: 'block', background: 'var(--bg-3)' }} />
  : <div style={{ width: '100%', height: alto, display: 'grid', placeItems: 'center', background: 'var(--bg-3)', color: 'var(--ink-3)', fontSize: 40 }}>🛍️</div>);

function BotonCarrito() {
  const { go } = useRouter();
  const c = useCarrito();
  const n = c.reduce((s, x) => s + x.cantidad, 0);
  if (!n) return null;
  return (
    <button type="button" className="btn btn-primary" onClick={() => go('/tienda/carrito')}
      style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 40, boxShadow: 'var(--shadow)', borderRadius: 999 }}>
      🛒 Carrito · {n}
    </button>
  );
}

export default function TiendaPublica({ seg }) {
  const id = seg[1] && /^\d+$/.test(seg[1]) ? Number(seg[1]) : null;
  return (
    <>
      <AimHeader route="tienda" />
      <main style={{ paddingTop: 0 }}>
        {seg[1] === 'carrito' ? <Carrito /> : id ? <Producto id={id} /> : <Catalogo />}
        <AimFooter />
      </main>
      {seg[1] !== 'carrito' && <BotonCarrito />}
    </>
  );
}

function Catalogo() {
  const { go } = useRouter();
  const { d, error } = useCatalogo();
  const [cat, setCat] = useState('todas');
  const cats = useMemo(() => ['todas', ...new Set((d?.productos || []).map(p => p.categoria).filter(Boolean))], [d]);
  const lista = (d?.productos || []).filter(p => cat === 'todas' || p.categoria === cat);
  return (
    <section className="block tight">
      <div className="container">
        <div style={{ maxWidth: 720 }}>
          <span className="eyebrow purple">Tienda</span>
          <h1 className="title-display">El material del club, <MagicText>a un clic.</MagicText></h1>
          <p className="section-lede" style={{ marginTop: 18 }}>
            Doboks, protecciones, guantes y más. Recógelo en el club{d?.envio?.activo ? ' o recíbelo en casa' : ''}.
          </p>
        </div>
        {d && !d.pagoOnline && <p style={{ marginTop: 24, padding: 14, borderRadius: 14, background: 'color-mix(in oklab, var(--orange) 12%, var(--bg-2))', fontSize: 14 }}>
          La compra por internet estará disponible muy pronto. Mientras tanto puedes ver el material y comprarlo en secretaría.</p>}
        {cats.length > 2 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 28 }}>
            {cats.map(c => <button key={c} className={`filter-pill ${cat === c ? 'is-active' : ''}`} onClick={() => setCat(c)}>{c === 'todas' ? 'Todo' : c}</button>)}
          </div>
        )}
        {error && <p style={{ marginTop: 40, color: 'var(--ink-3)' }}>{error}</p>}
        {!d && !error && <p style={{ marginTop: 40, color: 'var(--ink-3)' }}>Cargando la tienda…</p>}
        {d && !lista.length && <div style={{ marginTop: 48, textAlign: 'center', color: 'var(--ink-3)' }}><p style={{ fontSize: 18, fontWeight: 600 }}>Aún no hay productos en la tienda.</p></div>}
        {lista.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16, marginTop: 32 }}>
            {lista.map(p => (
              <a key={p.id} href={`/tienda/${p.id}`} onClick={e => { e.preventDefault(); go(`/tienda/${p.id}`); }}
                style={{ ...tarjeta, overflow: 'hidden', display: 'grid', textDecoration: 'none', color: 'inherit', opacity: p.agotado ? 0.6 : 1 }}>
                <div style={{ aspectRatio: '1 / 1' }}><Foto src={p.fotos[0]} alt={p.nombre} /></div>
                <div style={{ padding: 14, display: 'grid', gap: 6, alignContent: 'start' }}>
                  {p.categoria && <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--purple)' }}>{p.categoria}</span>}
                  <b style={{ fontSize: 16, lineHeight: 1.25 }}>{p.nombre}</b>
                  <span style={{ fontWeight: 800 }}>{p.distintos ? 'Desde ' : ''}{euros(p.desde)}</span>
                  {p.agotado && <span style={pastilla('var(--ink-3)')}>Agotado</span>}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Producto({ id }) {
  const { go } = useRouter();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const [foto, setFoto] = useState(0);
  const [vid, setVid] = useState(null);
  const [n, setN] = useState(1);
  const [hecho, setHecho] = useState(false);
  useEffect(() => {
    fetch(`/api/tienda/productos/${id}`, { credentials: 'include', cache: 'no-store' })
      .then(async r => { const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'Ese producto no está en la tienda.'); setP(x); if (x.variantes.length === 1) setVid(x.variantes[0].id); })
      .catch(e => setError(e.message));
  }, [id]);
  const volver = <a href="/tienda" onClick={e => { e.preventDefault(); go('/tienda'); }} style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-3)' }}>← Toda la tienda</a>;
  if (error) return <section className="block tight"><div className="container" style={{ display: 'grid', gap: 12 }}>{volver}<p style={{ fontSize: 18 }}>{error}</p></div></section>;
  if (!p) return <section className="block tight"><div className="container"><p style={{ color: 'var(--ink-3)' }}>Cargando…</p></div></section>;
  const v = p.variantes.find(x => x.id === vid);
  const max = v ? Math.min(10, v.disponibles ?? 10) : 10;

  function anadir() {
    if (!v) return;
    const c = leerCarrito();
    const ya = c.find(x => x.varianteId === v.id);
    if (ya) ya.cantidad = Math.min(max, ya.cantidad + n);
    else c.push({ varianteId: v.id, cantidad: Math.min(max, n), productoId: p.id, nombre: p.nombre, etiqueta: v.etiqueta, precio: v.precio, foto: p.fotos[0] || null });
    guardarCarrito(c);
    setHecho(true);
  }

  return (
    <section className="block tight">
      <div className="container" style={{ display: 'grid', gap: 20 }}>
        {volver}
        <div style={{ display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ ...tarjeta, overflow: 'hidden', aspectRatio: '1 / 1' }}><Foto src={p.fotos[foto]} alt={p.nombre} /></div>
            {p.fotos.length > 1 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {p.fotos.map((f, i) => (
                  <button key={f} type="button" onClick={() => setFoto(i)} aria-label={`Foto ${i + 1}`}
                    style={{ width: 64, height: 64, padding: 0, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: `2px solid ${i === foto ? 'var(--purple)' : 'var(--line)'}` }}>
                    <Foto src={f} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            {p.categoria && <span className="eyebrow purple">{p.categoria}</span>}
            <h1 className="title-display" style={{ fontSize: 'clamp(28px, 4.5vw, 44px)', margin: 0 }}>{p.nombre}</h1>
            <b style={{ fontSize: 26 }}>{v ? euros(v.precio) : `${p.distintos ? 'Desde ' : ''}${euros(p.desde)}`}</b>
            <span style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: -10 }}>IVA incluido</span>
            {p.descripcion && <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{p.descripcion}</p>}
            {p.variantes.length > 1 && (
              <div style={{ display: 'grid', gap: 8 }}>
                <b style={{ fontSize: 14 }}>Elige</b>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {p.variantes.map(x => (
                    <button key={x.id} type="button" disabled={x.agotado} onClick={() => { setVid(x.id); setN(1); setHecho(false); }}
                      title={x.agotado ? 'Agotado' : undefined}
                      style={{ font: 'inherit', fontSize: 14, fontWeight: 700, padding: '8px 14px', borderRadius: 12, cursor: x.agotado ? 'not-allowed' : 'pointer',
                        border: `2px solid ${vid === x.id ? 'var(--purple)' : 'var(--line)'}`, background: vid === x.id ? 'color-mix(in oklab, var(--purple) 10%, var(--bg-2))' : 'var(--bg-2)',
                        color: 'var(--ink)', textDecoration: x.agotado ? 'line-through' : 'none', opacity: x.agotado ? 0.5 : 1 }}>
                      {x.etiqueta}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {v?.pocas && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)' }}>¡Quedan solo {v.disponibles}!</span>}
            {v?.agotado && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-3)' }}>Agotado</span>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 12 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setN(x => Math.max(1, x - 1))} aria-label="Uno menos">−</button>
                <b style={{ minWidth: 28, textAlign: 'center' }}>{n}</b>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setN(x => Math.min(max, x + 1))} aria-label="Uno más">+</button>
              </div>
              <button type="button" className="btn btn-primary" disabled={!v || v.agotado} onClick={anadir}>
                {!v ? 'Elige una opción' : 'Añadir al carrito'}
              </button>
            </div>
            {hecho && (
              <div style={{ padding: 12, borderRadius: 12, background: 'color-mix(in oklab, var(--teal) 12%, var(--bg-2))', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: 1, fontWeight: 700 }}>Añadido al carrito.</span>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => go('/tienda/carrito')}>Ver el carrito</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => go('/tienda')}>Seguir comprando</button>
              </div>
            )}
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Recogida en el club{p.envio?.activo ? ` o envío a casa (${euros(p.envio.precio)})` : ''}.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Carrito() {
  const { go, user } = useRouter();
  const c = useCarrito();
  const { d } = useCatalogo();
  const [entrega, setEntrega] = useState('recogida');
  const [dir, setDir] = useState({ nombre: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '', telefono: '', direccion: '', cp: '', ciudad: '', provincia: '' });
  const [notas, setNotas] = useState('');
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(null);

  // Lo del carrito con los datos de ahora (precio, si queda).
  const variantes = useMemo(() => new Map((d?.productos || []).flatMap(p => p.variantes.map(v => [v.id, { ...v, producto: p }]))), [d]);
  const lineas = c.map(x => ({ ...x, v: variantes.get(x.varianteId) }));
  const validas = lineas.filter(l => l.v && !l.v.agotado);
  const subtotal = validas.reduce((s, l) => s + l.v.precio * l.cantidad, 0);
  const envio = entrega === 'envio' && d?.envio?.activo ? d.envio.precio : 0;
  const cambiar = (vid, cantidad) => guardarCarrito(leerCarrito().map(x => (x.varianteId === vid ? { ...x, cantidad } : x)).filter(x => x.cantidad > 0));

  async function comprar() {
    if (!user) { go(`/auth?volver=${encodeURIComponent('/tienda/carrito')}`); return; }
    setYendo(true); setError('');
    try {
      const r = await fetch('/api/tienda/pedidos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ lineas: validas.map(l => ({ varianteId: l.varianteId, cantidad: l.cantidad })), entrega, direccion: entrega === 'envio' ? dir : null, notas }),
      });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'No se ha podido hacer el pedido.');
      guardarCarrito([]);
      setGuardado(x.id);
      await pagarCargos(x.cargoIds);
    } catch (e) { setError(e.message); setYendo(false); }
  }

  if (guardado && error) {
    return (
      <section className="block tight"><div className="container" style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
        <h1 style={{ margin: 0 }}>Tu pedido nº {guardado} está guardado</h1>
        <p style={{ margin: 0 }}>No hemos podido llevarte al banco: {error} Puedes pagarlo desde «Mis pedidos» en las próximas {d?.reservaHoras || 24} horas; hasta entonces te lo guardamos.</p>
        <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} onClick={() => go('/dashboard/pedidos')}>Ir a mis pedidos</button>
      </div></section>
    );
  }

  return (
    <section className="block tight">
      <div className="container" style={{ display: 'grid', gap: 20, maxWidth: 900 }}>
        <a href="/tienda" onClick={e => { e.preventDefault(); go('/tienda'); }} style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-3)' }}>← Seguir comprando</a>
        <h1 className="title-display" style={{ fontSize: 'clamp(28px, 4.5vw, 44px)', margin: 0 }}>Tu carrito</h1>
        {!c.length && <p style={{ color: 'var(--ink-3)', fontSize: 16 }}>El carrito está vacío.</p>}
        {c.length > 0 && !d && <p style={{ color: 'var(--ink-3)' }}>Comprobando precios y existencias…</p>}
        {c.length > 0 && d && (
          <>
            <div style={{ ...tarjeta, padding: 6 }}>
              {lineas.map(l => (
                <div key={l.varianteId} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', flex: 'none' }}><Foto src={l.v?.producto.fotos[0] || l.foto} /></div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <b>{l.v?.producto.nombre || l.nombre}</b>
                    <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{l.v?.etiqueta || l.etiqueta}</div>
                    {!l.v && <div style={{ fontSize: 13, color: 'var(--pink)', fontWeight: 700 }}>Ya no está a la venta</div>}
                    {l.v?.agotado && <div style={{ fontSize: 13, color: 'var(--pink)', fontWeight: 700 }}>Agotado</div>}
                    {l.v && !l.v.agotado && l.v.disponibles != null && l.cantidad > l.v.disponibles && <div style={{ fontSize: 13, color: 'var(--orange)', fontWeight: 700 }}>Solo quedan {l.v.disponibles}</div>}
                  </div>
                  {l.v && !l.v.agotado && (
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 12 }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar(l.varianteId, l.cantidad - 1)} aria-label="Uno menos">−</button>
                      <b style={{ minWidth: 24, textAlign: 'center' }}>{l.cantidad}</b>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar(l.varianteId, Math.min(10, l.v.disponibles ?? 10, l.cantidad + 1))} aria-label="Uno más">+</button>
                    </div>
                  )}
                  <b style={{ minWidth: 80, textAlign: 'right' }}>{l.v && !l.v.agotado ? euros(l.v.precio * l.cantidad) : '—'}</b>
                  <button type="button" className="icon-btn" onClick={() => cambiar(l.varianteId, 0)} aria-label="Quitar"><I.Trash /></button>
                </div>
              ))}
            </div>

            <div style={{ ...tarjeta, padding: 18, display: 'grid', gap: 12 }}>
              <b style={{ fontSize: 16 }}>Entrega</b>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="radio" name="entrega" checked={entrega === 'recogida'} onChange={() => setEntrega('recogida')} style={{ marginTop: 4 }} />
                <span><b>Recoger en el club</b> · gratis<br /><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{d.recogida || 'Te avisamos cuando esté listo para recoger en secretaría.'}</span></span>
              </label>
              {d.envio?.activo && (
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="radio" name="entrega" checked={entrega === 'envio'} onChange={() => setEntrega('envio')} style={{ marginTop: 4 }} />
                  <span><b>Envío a casa</b> · {euros(d.envio.precio)}{d.envio.texto ? <><br /><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{d.envio.texto}</span></> : null}</span>
                </label>
              )}
              {entrega === 'envio' && (
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  {[['nombre', 'Nombre de quien lo recibe'], ['telefono', 'Teléfono'], ['direccion', 'Dirección (calle, número, piso)'], ['cp', 'Código postal'], ['ciudad', 'Población'], ['provincia', 'Provincia']].map(([k, t]) => (
                    <label key={k} style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', gridColumn: k === 'direccion' ? '1 / -1' : undefined }}>{t}
                      <input value={dir[k]} onChange={e => setDir(x => ({ ...x, [k]: e.target.value }))} style={inp}
                        inputMode={k === 'cp' || k === 'telefono' ? 'numeric' : undefined} autoComplete={{ nombre: 'name', telefono: 'tel', direccion: 'street-address', cp: 'postal-code', ciudad: 'address-level2', provincia: 'address-level1' }[k]} />
                    </label>
                  ))}
                </div>
              )}
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Notas (opcional)
                <textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)} style={{ ...inp, resize: 'vertical' }} placeholder="Para quién es, a qué clase va…" />
              </label>
            </div>

            <div style={{ ...tarjeta, padding: 18, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Productos</span><span>{euros(subtotal)}</span></div>
              {entrega === 'envio' && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Envío</span><span>{euros(envio)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, borderTop: '1px solid var(--line)', paddingTop: 8 }}><span>Total</span><span>{euros(subtotal + envio)}</span></div>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>IVA incluido. Se paga ahora con tarjeta o Bizum y te llega la factura.</span>
              {error && <span style={{ fontSize: 14, color: 'var(--pink)', fontWeight: 700 }}>{error}</span>}
              {d.pagoOnline ? (
                <button type="button" className="btn btn-primary" disabled={yendo || !validas.length} onClick={comprar}>
                  {yendo ? 'Yendo al banco…' : user ? `Pagar ${euros(subtotal + envio)}` : 'Entra para pagar'}
                </button>
              ) : <span style={{ fontWeight: 700, color: 'var(--orange)' }}>La compra por internet estará disponible muy pronto.</span>}
              {!user && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Para comprar necesitas una cuenta en la web (es gratis). Tu carrito se queda guardado.</span>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ═══════════════════════ «Mis pedidos» en el área de familias ═══════════════════════
export const ESTADO_PEDIDO = {
  pendiente_pago: ['Sin pagar', 'var(--orange)'], pagado: ['Pagado · lo estamos preparando', 'var(--purple)'],
  listo: ['Listo para recoger', 'var(--teal)'], enviado: ['Enviado', 'var(--teal)'], entregado: ['Entregado', 'var(--ink-3)'], cancelado: ['Cancelado', 'var(--ink-3)'],
};

export function MisPedidos() {
  const { go } = useRouter();
  const [d, setD] = useState(null);
  const [haciendo, setHaciendo] = useState(null);
  const cargar = useCallback(() => {
    fetch('/api/me/tienda/pedidos', { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : { pedidos: [] })).then(setD).catch(() => setD({ pedidos: [] }));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  async function cancelar(p) {
    if (!window.confirm(`¿Cancelar el pedido nº ${p.id}?`)) return;
    setHaciendo(p.id);
    const r = await fetch(`/api/me/tienda/pedidos/${p.id}/cancelar`, { method: 'POST', credentials: 'include' });
    if (!r.ok) alert((await r.json().catch(() => ({}))).error || 'No se ha podido cancelar.');
    setHaciendo(null); cargar();
  }
  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {!d.pedidos.length && (
        <div className="panel" style={{ textAlign: 'center', padding: 28, display: 'grid', gap: 10, justifyItems: 'center' }}>
          <b style={{ fontSize: 17 }}>Aún no has hecho ningún pedido</b>
          <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>En la tienda tienes el material del club para comprarlo por internet.</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => go('/tienda')}>Ir a la tienda</button>
        </div>
      )}
      {d.pedidos.map(p => {
        const [txt, color] = p.caducado ? ['Sin pagar · caducado', 'var(--ink-3)'] : (ESTADO_PEDIDO[p.estado] || [p.estado, 'var(--ink-3)']);
        return (
          <div key={p.id} className="panel" style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 16 }}>Pedido nº {p.id}</b>
              <span style={pastilla(color)}>{p.estado === 'listo' ? '📦 ' : ''}{txt}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{fmtFecha(p.creado)}</span>
            </div>
            <div style={{ display: 'grid', gap: 4, fontSize: 14 }}>
              {p.lineas.map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span>{l.envio ? 'Envío a casa' : `${l.cantidad} × ${l.descripcion}`}</span><span>{euros(l.total)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '1px solid var(--line)', paddingTop: 4 }}><span>Total</span><span>{euros(p.total)}</span></div>
            </div>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              {p.entrega === 'envio' && p.envio ? `A: ${p.envio.nombre}, ${p.envio.direccion}, ${p.envio.cp} ${p.envio.ciudad}` : 'Recogida en el club'}
              {p.estado === 'listo' ? ' · pásate por secretaría' : ''}
              {p.estado === 'cancelado' && p.motivoCancelacion ? ` · ${p.motivoCancelacion}` : ''}
            </span>
            {p.cargosPendientes.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {d.pagoOnline && <button type="button" className="btn btn-primary btn-sm" disabled={haciendo === p.id}
                  onClick={async () => { setHaciendo(p.id); try { await pagarCargos(p.cargosPendientes); } catch (e) { alert(e.message); setHaciendo(null); } }}>Pagar {euros(p.total)}</button>}
                <button type="button" className="btn btn-ghost btn-sm" disabled={haciendo === p.id} onClick={() => cancelar(p)}>Cancelar pedido</button>
              </div>
            )}
          </div>
        );
      })}
      {d.pedidos.length > 0 && <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => go('/tienda')}>Ir a la tienda →</button>}
    </div>
  );
}
