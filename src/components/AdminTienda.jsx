import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { textoPlano } from './Shared.jsx';
import { ESTADO_PEDIDO } from './Tienda.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Tienda online, la gestión (ticket #432): los pedidos (prepararlos, avisar de
// que están listos o enviados, entregarlos), los productos con sus fotos y sus
// variantes (artículos del catálogo: el precio y el stock salen de ahí) y el
// envío a casa.
// ─────────────────────────────────────────────────────────────────────────────

const inp = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' };
const etiqueta = { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', display: 'grid', gap: 4 };
const tarjeta = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 };
const euros = (n) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fmt = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const pastilla = (color) => ({ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, color, background: `color-mix(in oklab, ${color} 13%, var(--bg-2))`, whiteSpace: 'nowrap' });

async function api(url, { method = 'GET', body, raw, tipo } = {}) {
  const r = await fetch(url, {
    method, credentials: 'include', cache: 'no-store',
    headers: raw ? { 'Content-Type': tipo || 'image/jpeg' } : body ? { 'Content-Type': 'application/json' } : undefined,
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido hacer.');
  return d;
}
// Las fotos, a JPG de 1200 px como mucho.
async function fotoJpg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error(`No se puede leer «${file.name}».`)); i.src = url; });
    const k = Math.min(1, 1200 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    if (!b) throw new Error(`No se ha podido preparar «${file.name}».`);
    return b;
  } finally { URL.revokeObjectURL(url); }
}

function Ventana({ titulo, onCerrar, children, ancho = 640 }) {
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 16 }} onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={titulo}
        style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 14, width: `min(${ancho}px, 100%)`, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, flex: 1 }}>{titulo}</h3>
          <button type="button" className="icon-btn" onClick={onCerrar} aria-label="Cerrar"><I.X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AdminTienda({ showToast }) {
  const [datos, setDatos] = useState(null);
  const [pestana, setPestana] = useState('pedidos');
  const cargar = useCallback(() => { api('/api/admin/tienda').then(setDatos).catch(e => alert(e.message)); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const porPreparar = datos?.pedidos?.por_preparar || 0;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-3)', padding: 4, borderRadius: 999, flexWrap: 'wrap' }}>
          {[['pedidos', `Pedidos${porPreparar ? ` · ${porPreparar}` : ''}`], ['productos', 'Productos'], ['ajustes', 'Envío y recogida']].map(([k, t]) => (
            <button key={k} type="button" onClick={() => setPestana(k)} className={`btn btn-sm ${pestana === k ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 999 }}>{t}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <a className="btn btn-sm btn-outline" href="/tienda" target="_blank" rel="noreferrer"><I.Eye /> Ver la tienda</a>
      </div>
      {datos && !datos.pagoOnline && (
        <p style={{ margin: 0, padding: 12, borderRadius: 12, background: 'color-mix(in oklab, var(--orange) 12%, var(--bg-2))', fontSize: 13 }}>
          El pago online no está activo en el servidor: la tienda se ve, pero no deja comprar hasta que se active (PAGOS_ONLINE en Heroku).
        </p>
      )}
      {!datos && <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>}
      {datos && pestana === 'pedidos' && <Pedidos showToast={showToast} onCambio={cargar} />}
      {datos && pestana === 'productos' && <Productos datos={datos} recargar={cargar} showToast={showToast} />}
      {datos && pestana === 'ajustes' && <Ajustes a={datos.ajustes} recargar={cargar} showToast={showToast} />}
    </div>
  );
}

// ── Pedidos ──
const FILTROS = [['pagado', 'Por preparar'], ['abiertos', 'Pendientes de entregar'], ['pendiente_pago', 'Sin pagar'], ['entregado', 'Entregados'], ['cancelado', 'Cancelados'], ['', 'Todos']];
// La nota que va dentro del paquete de un regalo (#446): lo que lleva, sin
// precios, y el mensaje de quien lo regala.
function imprimirNotaRegalo(p) {
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const w = window.open('', '_blank', 'width=520,height=640');
  if (!w) { alert('El navegador ha bloqueado la ventana. Permite las ventanas emergentes de esta web.'); return; }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Nota de regalo · pedido ${p.id}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:32px}h1{font-size:22px;margin:0 0 4px}.m{font-size:18px;line-height:1.5;margin:24px 0;padding:18px 20px;border:2px dashed #FF5FA2;border-radius:14px;white-space:pre-wrap}ul{padding-left:18px;font-size:14px;line-height:1.7}.p{font-size:12px;color:#777;margin-top:28px}</style>
</head><body><h1>🎁 Un regalo para ti</h1>
${p.regalo?.mensaje ? `<div class="m">${esc(p.regalo.mensaje)}</div>` : ''}
<p style="font-size:13px;color:#555;margin:18px 0 4px">Lleva:</p>
<ul>${p.lineas.filter(l => !l.envio).map(l => `<li>${l.cantidad} × ${esc(l.descripcion)}</li>`).join('')}</ul>
<p class="p">AIM Education · pedido nº ${p.id}</p>
<script>window.onload=()=>{window.print();}</script></body></html>`);
  w.document.close();
}

function Pedidos({ showToast, onCambio }) {
  const [filtro, setFiltro] = useState('pagado');
  const [lista, setLista] = useState(null);
  const cargar = useCallback(() => {
    setLista(null);
    api(`/api/admin/tienda/pedidos${filtro ? `?estado=${filtro}` : ''}`).then(d => setLista(d.pedidos)).catch(e => alert(e.message));
  }, [filtro]);
  useEffect(() => { cargar(); }, [cargar]);
  async function mover(p, estado) {
    let motivo;
    if (estado === 'cancelado') { motivo = window.prompt(`¿Por qué se cancela el pedido nº ${p.id}? (lo verá quien lo hizo)`, 'Cancelado por el club'); if (motivo == null) return; }
    try {
      await api(`/api/admin/tienda/pedidos/${p.id}`, { method: 'PUT', body: { estado, motivo } });
      showToast?.({ listo: 'Avisado: listo para recoger.', enviado: 'Marcado como enviado. Le llega el aviso.', entregado: 'Pedido entregado.', cancelado: 'Pedido cancelado.' }[estado]);
      cargar(); onCambio?.();
    } catch (err) { alert(err.message); }
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTROS.map(([k, t]) => <button key={k} type="button" className={`filter-pill ${filtro === k ? 'is-active' : ''}`} onClick={() => setFiltro(k)}>{t}</button>)}
      </div>
      {!lista && <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>}
      {lista && !lista.length && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>No hay pedidos aquí.</p>}
      {lista?.map(p => {
        const [txt, color] = p.caducado ? ['Sin pagar · caducado', 'var(--ink-3)'] : (ESTADO_PEDIDO[p.estado] || [p.estado, 'var(--ink-3)']);
        return (
          <div key={p.id} style={{ ...tarjeta, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 15 }}>Nº {p.id}</b>
              <span style={pastilla(color)}>{p.estado === 'pagado' ? 'Pagado · por preparar' : txt}</span>
              <span style={pastilla(p.entrega === 'envio' ? 'var(--orange)' : 'var(--purple)')}>{p.entrega === 'envio' ? '🚚 Envío a casa' : '🏠 Recoge en el club'}</span>
              {p.regalo && <span style={pastilla('#E0428A')}>🎁 Para regalo</span>}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmt(p.creado)}{p.pagado ? ` · pagado ${fmt(p.pagado)}` : ''}</span>
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <div style={{ display: 'grid', gap: 3, fontSize: 14 }}>
                {p.lineas.map((l, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span>{l.envio ? 'Gastos de envío' : <><b>{l.cantidad} ×</b> {l.descripcion}</>}</span><span style={{ whiteSpace: 'nowrap' }}>{euros(l.total)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '1px solid var(--line)', paddingTop: 3 }}><span>Total</span><span>{euros(p.total)}</span></div>
              </div>
              <div style={{ display: 'grid', gap: 3, fontSize: 13, alignContent: 'start' }}>
                <b>{p.cliente.nombre}</b>
                <span style={{ color: 'var(--ink-3)' }}>{[p.cliente.email, p.cliente.telefono].filter(Boolean).join(' · ')}</span>
                {p.envio && <span><b>Enviar a:</b> {p.envio.nombre} · {p.envio.direccion}, {p.envio.cp} {p.envio.ciudad}{p.envio.provincia ? ` (${p.envio.provincia})` : ''} · {p.envio.telefono}</span>}
                {p.regalo && <span style={{ color: '#C2306F' }}><b>🎁 Envolver para regalo.</b>{p.regalo.mensaje ? <> Tarjeta: «{p.regalo.mensaje}»</> : ' Sin mensaje.'}</span>}
                {p.notas && <span><b>Notas:</b> {p.notas}</span>}
                {p.estado === 'cancelado' && p.motivoCancelacion && <span style={{ color: 'var(--ink-3)' }}>Cancelado: {p.motivoCancelacion}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {p.estado === 'pagado' && p.entrega === 'recogida' && <button type="button" className="btn btn-sm btn-primary" onClick={() => mover(p, 'listo')}>📦 Listo para recoger (avisar)</button>}
              {p.estado === 'pagado' && p.entrega === 'envio' && <button type="button" className="btn btn-sm btn-primary" onClick={() => mover(p, 'enviado')}>🚚 Marcar como enviado (avisar)</button>}
              {['pagado', 'listo', 'enviado'].includes(p.estado) && <button type="button" className="btn btn-sm btn-outline" onClick={() => mover(p, 'entregado')}>✓ Entregado</button>}
              {p.regalo && p.estado !== 'cancelado' && <button type="button" className="btn btn-sm btn-outline" onClick={() => imprimirNotaRegalo(p)}>🎁 Imprimir nota de regalo</button>}
              {p.estado === 'pendiente_pago' && <button type="button" className="btn btn-sm btn-ghost" onClick={() => mover(p, 'cancelado')}>Cancelar pedido</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Productos ──
function Productos({ datos, recargar, showToast }) {
  const [editando, setEditando] = useState(null);
  const productos = datos.productos;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-3)', flex: 1 }}>Cada producto agrupa artículos del catálogo como tallas o colores: el precio y el stock son los de Facturación y Almacén.</span>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditando({ nuevo: true })}><I.Plus /> Nuevo producto</button>
      </div>
      {!productos.length && <div style={{ ...tarjeta, borderStyle: 'dashed', textAlign: 'center', color: 'var(--ink-3)' }}>Todavía no hay productos. Crea el primero y ponle sus tallas y fotos.</div>}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
        {productos.map(p => {
          const stock = p.variantes.filter(v => v.conStock).reduce((s, v) => s + v.disponibles, 0);
          const sinPrecio = p.variantes.filter(v => !v.activo || !(v.precio > 0)).length;
          return (
            <button key={p.id} type="button" onClick={() => setEditando(p)}
              style={{ ...tarjeta, padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'grid' }}>
              <div style={{ aspectRatio: '16 / 10', background: p.fotos[0] ? `center / cover no-repeat url(${p.fotos[0].url})` : 'var(--bg-3)', display: 'grid', placeItems: 'center', fontSize: 32 }}>{p.fotos[0] ? null : '🛍️'}</div>
              <div style={{ padding: 12, display: 'grid', gap: 5 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={pastilla(p.publicado ? 'var(--teal)' : 'var(--ink-3)')}>{p.publicado ? 'Publicado' : 'Oculto'}</span>
                  {p.categoria && <span style={pastilla('var(--purple)')}>{p.categoria}</span>}
                </div>
                <b>{p.nombre}</b>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {p.variantes.length} {p.variantes.length === 1 ? 'opción' : 'opciones'}{p.variantes.some(v => v.conStock) ? ` · ${stock} disponibles` : ''}{!p.fotos.length ? ' · sin fotos' : ''}
                </span>
                {sinPrecio > 0 && <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>{sinPrecio} sin precio o desactivada{sinPrecio > 1 ? 's' : ''}: no salen</span>}
              </div>
            </button>
          );
        })}
      </div>
      {editando && <EditorProducto p={editando.nuevo ? null : editando} onCerrar={() => { setEditando(null); recargar(); }} showToast={showToast}
        onCreado={(id) => { recargar(); setEditando({ id, nombre: '', variantes: [], fotos: [], recienCreado: true }); }} datos={datos} />}
    </div>
  );
}

function EditorProducto({ p: inicial, onCerrar, onCreado, showToast, datos }) {
  // Al crear uno, se sigue editando el mismo (para ponerle fotos): se busca en los datos al día.
  const p = inicial?.recienCreado ? (datos.productos.find(x => x.id === inicial.id) || inicial) : inicial;
  const [f, setF] = useState(() => ({
    nombre: p?.nombre || '', categoria: p?.categoria || '', descripcion: p?.descripcion || '', publicado: p?.publicado ?? false,
    variantes: (p?.variantes || []).map(v => ({ concepto: v.concepto, etiqueta: v.etiqueta, desc: v.conceptoDesc, precio: v.precio, stock: v.stock, disponibles: v.disponibles, activo: v.activo })),
  }));
  const [catalogo, setCatalogo] = useState([]);
  const [q, setQ] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [fotos, setFotos] = useState(p?.fotos || []);
  const [subiendo, setSubiendo] = useState(false);
  useEffect(() => { api('/api/admin/tienda/catalogo').then(setCatalogo).catch(() => {}); }, []);
  useEffect(() => { if (p?.id) setFotos(p.fotos || []); }, [p?.id, p?.fotos?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const cambiar = (k, v) => setF(x => ({ ...x, [k]: v }));
  const ya = new Set(f.variantes.map(v => v.concepto));
  const busca = textoPlano(q.trim());
  const coinciden = busca.length >= 2 ? catalogo.filter(c => !ya.has(c.concepto) && textoPlano(`${c.descripcion} ${c.concepto} ${c.categoria || ''}`).includes(busca)) : [];
  // La talla o el color: lo que el artículo dice además del nombre del producto.
  const etiquetaDe = (desc) => {
    const n = textoPlano(f.nombre.trim());
    const d = String(desc || '');
    if (n && textoPlano(d).startsWith(n)) return d.slice(f.nombre.trim().length).replace(/^[\s·,\-–]+/, '').trim() || d;
    return d;
  };
  const anadir = (lista) => setF(x => ({ ...x, variantes: [...x.variantes, ...lista.map(c => ({ concepto: c.concepto, etiqueta: etiquetaDe(c.descripcion).slice(0, 80), desc: c.descripcion, precio: c.precio, stock: c.stock, disponibles: c.stock, activo: true }))] }));
  const mover = (i, d) => setF(x => { const v = [...x.variantes]; const j = i + d; if (j < 0 || j >= v.length) return x; [v[i], v[j]] = [v[j], v[i]]; return { ...x, variantes: v }; });

  async function guardar(e) {
    e?.preventDefault();
    setGuardando(true);
    try {
      const body = { nombre: f.nombre, categoria: f.categoria, descripcion: f.descripcion, publicado: f.publicado, variantes: f.variantes.map(v => ({ concepto: v.concepto, etiqueta: v.etiqueta })) };
      if (p?.id) { await api(`/api/admin/tienda/productos/${p.id}`, { method: 'PUT', body }); showToast?.('Producto guardado.'); onCerrar(); }
      else { const r = await api('/api/admin/tienda/productos', { method: 'POST', body }); showToast?.('Producto creado. Ahora ponle fotos.'); onCreado(r.id); }
    } catch (err) { alert(err.message); } finally { setGuardando(false); }
  }
  async function subirFotos(files) {
    if (!p?.id || !files?.length) return;
    setSubiendo(true);
    try {
      for (const file of files) await api(`/api/admin/tienda/productos/${p.id}/fotos`, { method: 'POST', raw: await fotoJpg(file) });
      const d = await api('/api/admin/tienda');
      setFotos(d.productos.find(x => x.id === p.id)?.fotos || []);
    } catch (err) { alert(err.message); } finally { setSubiendo(false); }
  }
  async function accionFoto(foto, accion) {
    try {
      if (accion === 'borrar') { if (!window.confirm('¿Quitar esta foto?')) return; await api(`/api/admin/tienda/fotos/${foto.id}`, { method: 'DELETE' }); }
      else await api(`/api/admin/tienda/fotos/${foto.id}/principal`, { method: 'POST' });
      const d = await api('/api/admin/tienda');
      setFotos(d.productos.find(x => x.id === p.id)?.fotos || []);
    } catch (err) { alert(err.message); }
  }
  async function borrar() {
    if (!window.confirm(`¿Quitar «${f.nombre}» de la tienda? Los pedidos que ya lo llevan se quedan como están.`)) return;
    try { await api(`/api/admin/tienda/productos/${p.id}`, { method: 'DELETE' }); showToast?.('Producto quitado.'); onCerrar(); } catch (err) { alert(err.message); }
  }

  return (
    <Ventana titulo={p?.id ? `Producto: ${f.nombre || '…'}` : 'Nuevo producto'} onCerrar={onCerrar} ancho={760}>
      <form onSubmit={guardar} style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 800, fontSize: 14, padding: 10, borderRadius: 12, background: f.publicado ? 'color-mix(in oklab, var(--teal) 12%, var(--bg-2))' : 'var(--bg-3)' }}>
          <input type="checkbox" checked={f.publicado} onChange={e => cambiar('publicado', e.target.checked)} style={{ width: 18, height: 18 }} />
          {f.publicado ? 'Publicado: sale en la tienda' : 'Oculto: no sale en la tienda'}
        </label>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '2fr 1fr' }}>
          <label style={etiqueta}>Nombre<input required autoFocus={!p} value={f.nombre} onChange={e => cambiar('nombre', e.target.value)} style={inp} placeholder="p. ej. Casco Fuji Mae Hyperfoam" /></label>
          <label style={etiqueta}>Categoría<input value={f.categoria} onChange={e => cambiar('categoria', e.target.value)} style={inp} placeholder="Protecciones" list="tienda-categorias" /></label>
          <datalist id="tienda-categorias">{[...new Set(datos.productos.map(x => x.categoria).filter(Boolean))].map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <label style={etiqueta}>Descripción<textarea rows={4} value={f.descripcion} onChange={e => cambiar('descripcion', e.target.value)} style={{ ...inp, resize: 'vertical' }} placeholder="Material, para qué sirve, cómo elegir la talla…" /></label>

        <div style={{ display: 'grid', gap: 8 }}>
          <b style={{ fontSize: 14 }}>Opciones (tallas, colores…)</b>
          {!f.variantes.length && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Busca abajo los artículos del catálogo que se venden con este producto.</span>}
          {f.variantes.map((v, i) => (
            <div key={v.concepto} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 8px', borderRadius: 10, background: 'var(--bg-3)' }}>
              <input value={v.etiqueta} onChange={e => setF(x => ({ ...x, variantes: x.variantes.map((y, k) => (k === i ? { ...y, etiqueta: e.target.value } : y)) }))}
                aria-label="Nombre de la opción" style={{ ...inp, padding: '6px 8px', width: 150, fontWeight: 700 }} />
              <span style={{ flex: 1, minWidth: 140, fontSize: 12, color: 'var(--ink-3)' }}>{v.desc} · {v.concepto}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{v.precio > 0 ? euros(v.precio) : <span style={{ color: 'var(--orange)' }}>sin precio</span>}</span>
              <span style={{ fontSize: 12, color: v.stock == null ? 'var(--ink-3)' : v.disponibles > 0 ? 'var(--teal)' : 'var(--pink)', minWidth: 70 }}>{v.stock == null ? 'sin stock' : `${v.disponibles} disp.`}</span>
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
              <button type="button" className="icon-btn" disabled={i === f.variantes.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar">↓</button>
              <button type="button" className="icon-btn danger" onClick={() => setF(x => ({ ...x, variantes: x.variantes.filter((_, k) => k !== i) }))} aria-label="Quitar"><I.Trash /></button>
            </div>
          ))}
          <div style={{ display: 'grid', gap: 6, padding: 10, borderRadius: 12, border: '1px dashed var(--line)' }}>
            <input value={q} onChange={e => setQ(e.target.value)} style={inp} placeholder="Buscar en el catálogo: casco, dobok, guantes, 10918…" />
            {coinciden.length > 1 && <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={() => { anadir(coinciden); setQ(''); }}>Añadir las {coinciden.length} que coinciden</button>}
            <div style={{ display: 'grid', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {coinciden.slice(0, 40).map(c => (
                <div key={c.concepto} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ flex: 1 }}><b>{c.descripcion}</b> <span style={{ color: 'var(--ink-3)' }}>· {c.concepto}{c.stock != null ? ` · ${c.stock} en almacén` : ''}</span></span>
                  <span>{euros(c.precio)}</span>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => anadir([c])}>Añadir</button>
                </div>
              ))}
              {busca.length >= 2 && !coinciden.length && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Nada en el catálogo con eso (los artículos se dan de alta en Facturación → Catálogo).</span>}
            </div>
          </div>
        </div>

        {p?.id ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <b style={{ fontSize: 14 }}>Fotos</b>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {fotos.map((x, i) => (
                <div key={x.id} style={{ position: 'relative', width: 96, height: 96, borderRadius: 10, overflow: 'hidden', border: `2px solid ${i === 0 ? 'var(--purple)' : 'var(--line)'}` }}>
                  <img src={x.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', inset: 'auto 0 0 0', display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,.45)' }}>
                    {i > 0 ? <button type="button" onClick={() => accionFoto(x, 'principal')} title="Que salga la primera" style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer', fontSize: 14 }}>★</button> : <span style={{ color: '#fff', fontSize: 10, padding: '2px 4px' }}>principal</span>}
                    <button type="button" onClick={() => accionFoto(x, 'borrar')} aria-label="Quitar foto" style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer', fontSize: 14 }}>✕</button>
                  </div>
                </div>
              ))}
              {fotos.length < 8 && (
                <label style={{ position: 'relative', overflow: 'hidden', width: 96, height: 96, borderRadius: 10, border: '2px dashed var(--line)', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 12, color: 'var(--ink-3)', textAlign: 'center' }}>
                  {subiendo ? 'Subiendo…' : '+ Fotos'}
                  <input type="file" accept="image/*" multiple disabled={subiendo} onChange={e => { subirFotos([...e.target.files]); e.target.value = ''; }}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="Añadir fotos" />
                </label>
              )}
            </div>
          </div>
        ) : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Las fotos se ponen después de crearlo.</span>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-sm btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : p?.id ? 'Guardar' : 'Crear producto'}</button>
          <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>{p?.id ? 'Cerrar' : 'Cancelar'}</button>
          <div style={{ flex: 1 }} />
          {p?.id && <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--pink)' }} onClick={borrar}><I.Trash /> Quitar de la tienda</button>}
        </div>
      </form>
    </Ventana>
  );
}

// ── Envío y recogida ──
function Ajustes({ a, recargar, showToast }) {
  const [f, setF] = useState({ activo: a.envio.activo, precio: a.envio.precio ? String(a.envio.precio).replace('.', ',') : '', texto: a.envio.texto || '', recogida: a.recogida || '' });
  const [guardando, setGuardando] = useState(false);
  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      await api('/api/admin/tienda/ajustes', { method: 'PUT', body: { envio: { activo: f.activo, precio: f.precio, texto: f.texto }, recogida: f.recogida } });
      showToast?.('Guardado.'); recargar();
    } catch (err) { alert(err.message); } finally { setGuardando(false); }
  }
  return (
    <form onSubmit={guardar} style={{ ...tarjeta, display: 'grid', gap: 12, maxWidth: 640 }}>
      <label style={etiqueta}>Recogida en el club: qué se le dice a quien compra
        <input value={f.recogida} onChange={e => setF(x => ({ ...x, recogida: e.target.value }))} style={inp} placeholder="Te avisamos cuando esté listo para recoger en secretaría." />
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 800, fontSize: 14 }}>
        <input type="checkbox" checked={f.activo} onChange={e => setF(x => ({ ...x, activo: e.target.checked }))} style={{ width: 18, height: 18 }} /> Hacer envíos a casa
      </label>
      {f.activo && (
        <>
          <label style={{ ...etiqueta, maxWidth: 220 }}>Precio del envío (con IVA)<input required inputMode="decimal" value={f.precio} onChange={e => setF(x => ({ ...x, precio: e.target.value }))} style={inp} placeholder="5,95" /></label>
          <label style={etiqueta}>Qué se le dice (plazo, empresa de transporte…)<input value={f.texto} onChange={e => setF(x => ({ ...x, texto: e.target.value }))} style={inp} placeholder="Por mensajería, en 2-4 días laborables. Solo península." /></label>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Se cobra junto al pedido, con su factura en la serie de material (concepto TIENDA-ENVIO, 21 % de IVA).</span>
        </>
      )}
      <button type="submit" className="btn btn-sm btn-primary" style={{ justifySelf: 'start' }} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
    </form>
  );
}
