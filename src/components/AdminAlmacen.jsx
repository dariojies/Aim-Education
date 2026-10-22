import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';
import { textoPlano, coincideBusqueda } from './Shared.jsx';
import { imprimirHtml } from '../imprimir.js';

// ─────────────────────────────────────────────────────────────────────────────
// Almacén / inventario (ticket #250). El club ve lo que tiene en stock. Cada
// artículo se enlaza a su concepto del catálogo (cada talla es su propio concepto,
// p. ej. "Dobok talla S"): al venderlo en el TPV se descuenta solo de su stock.
// Cada cambio queda anotado.
// ─────────────────────────────────────────────────────────────────────────────

const inp = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' };
const fmt = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const vacio = () => ({ nombre: '', categoria: '', concepto: '', stock: 0, stockMinimo: 0, notas: '' });

export default function AdminAlmacen({ showToast }) {
  const [items, setItems] = useState([]);
  const [conceptos, setConceptos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [edit, setEdit] = useState(null);   // artículo en edición/alta
  const [movs, setMovs] = useState(null);   // { item, lista }
  const [q, setQ] = useState('');
  const [entradas, setEntradas] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch('/api/admin/almacen', { credentials: 'include', cache: 'no-store' });
      if (r.ok) {
        setItems(await r.json());
        // Material del catálogo que acaba de entrar solo (con stock 0).
        const traidos = Number(r.headers.get('X-Almacen-Traidos')) || 0;
        if (traidos) showToast?.(`${traidos} artículo${traidos !== 1 ? 's' : ''} de material del catálogo añadido${traidos !== 1 ? 's' : ''} al almacén. Pon cuántos hay de cada.`);
      }
    } catch { /* noop */ } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    fetch('/api/admin/almacen/conceptos', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(d => setConceptos(Array.isArray(d) ? d : [])).catch(() => { });
  }, []);

  async function guardar(e) {
    e.preventDefault();
    const r = await fetch('/api/admin/almacen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(edit),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { showToast?.(edit.id ? 'Artículo actualizado.' : 'Artículo añadido.'); setEdit(null); cargar(); }
    else alert(d.error || 'No se pudo guardar.');
  }
  async function ajustar(it) {
    const txt = window.prompt(`Ajuste de stock de ${it.nombre}.\nEscribe cuántas unidades sumar (p. ej. 10) o restar (p. ej. -2):`, '');
    if (txt == null) return;
    const delta = parseInt(txt, 10);
    if (!Number.isInteger(delta) || delta === 0) return alert('Pon un número distinto de 0.');
    const motivo = window.prompt('Motivo del ajuste (entrada de mercancía, rotura, recuento…):', delta > 0 ? 'Entrada de mercancía' : 'Ajuste');
    if (!motivo || !motivo.trim()) return;
    const r = await fetch(`/api/admin/almacen/${it.id}/ajuste`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ delta, motivo: motivo.trim() }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { showToast?.('Stock ajustado.'); cargar(); }
    else alert(d.error || 'No se pudo ajustar.');
  }
  // Recuento: se escribe cuántos hay y se anota la diferencia como ajuste.
  async function recuento(it, valor) {
    const n = parseInt(valor, 10);
    if (!Number.isInteger(n) || n < 0 || n === it.stock) return;
    const r = await fetch(`/api/admin/almacen/${it.id}/ajuste`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ delta: n - it.stock, motivo: 'Recuento' }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setItems(prev => prev.map(x => (x.id === it.id ? { ...x, stock: n, bajo: x.stockMinimo > 0 && n < x.stockMinimo } : x))); }
    else { alert(d.error || 'No se pudo guardar.'); cargar(); }
  }
  async function cambiarMinimo(it, valor) {
    const n = Math.max(0, parseInt(valor, 10) || 0);
    if (n === it.stockMinimo) return;
    const r = await fetch('/api/admin/almacen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ ...it, stockMinimo: n }),
    });
    if (r.ok) setItems(prev => prev.map(x => (x.id === it.id ? { ...x, stockMinimo: n, bajo: n > 0 && x.stock < n } : x)));
    else { const d = await r.json().catch(() => ({})); alert(d.error || 'No se pudo guardar.'); cargar(); }
  }
  async function verMovs(it) {
    const r = await fetch(`/api/admin/almacen/${it.id}/movimientos`, { credentials: 'include', cache: 'no-store' });
    if (r.ok) setMovs({ item: it, lista: await r.json() });
  }
  async function borrar(it) {
    if (!window.confirm(`¿Quitar ${it.nombre} del almacén? Se borra también su histórico de movimientos.`)) return;
    const r = await fetch(`/api/admin/almacen/${it.id}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) { showToast?.('Artículo quitado.'); cargar(); }
  }

  const filtrados = items.filter(x => coincideBusqueda(q, x.nombre, x.categoria, x.conceptoDesc));
  const bajos = items.filter(x => x.bajo).length;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-input" style={{ maxWidth: 320 }}><I.Search /><input placeholder="Buscar artículo..." value={q} onChange={e => setQ(e.target.value)} /></div>
        {bajos > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--orange)', background: 'color-mix(in oklab, var(--orange) 12%, var(--bg-2))', padding: '4px 12px', borderRadius: 999 }}>⚠️ {bajos} bajo mínimo</span>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-outline" onClick={() => setEntradas(true)} title="Toda la mercancía que entró un día, junta">Entradas del día</button>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit(vacio())}><I.Plus /> Nuevo artículo</button>
      </div>

      {cargando && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
      {!cargando && filtrados.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          {q.trim() ? 'Ningún artículo con ese nombre.' : 'El almacén está vacío. Añade tu primer artículo.'}
        </div>
      )}

      {filtrados.length > 0 && (
        <div className="data-table">
          <div className="data-table-head" style={{ gridTemplateColumns: '1.6fr 100px 100px 1.2fr 150px' }}>
            <span>Artículo</span><span>Hay</span><span title="Lo que quieres tener como poco: avisa si hay menos. 0 = sin aviso">Mínimo</span><span>Se vende como</span><span></span>
          </div>
          {filtrados.map((it, i) => (
            <React.Fragment key={it.id}>
            {/* Un título por categoría, que con decenas de tallas se pierde uno. */}
            {(i === 0 || filtrados[i - 1].categoria !== it.categoria) && (
              <div style={{ padding: '10px 16px 4px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--purple)', background: 'var(--bg-3)' }}>
                {it.categoria || 'Sin categoría'}
              </div>
            )}
            <div className="data-table-row" style={{ gridTemplateColumns: '1.6fr 100px 100px 1.2fr 150px', alignItems: 'center' }}>
              <div>
                <div className="pri">{it.nombre}</div>
              </div>
              {/* Recuento directo: se escribe cuántos hay y al salir se guarda. */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="solo-movil" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', minWidth: 84 }}>Hay</span>
                <input key={`s${it.id}:${it.stock}`} type="number" min="0" defaultValue={it.stock} aria-label={`Unidades de ${it.nombre}`}
                  onBlur={e => recuento(it, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  style={{ ...inp, width: 64, padding: '6px 8px', fontWeight: 800, color: it.bajo ? 'var(--orange)' : 'var(--ink)' }} />
                {it.bajo && <span title={`Hay menos de ${it.stockMinimo}`} style={{ fontSize: 12 }}>⚠️</span>}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="solo-movil" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', minWidth: 84 }}>Mínimo</span>
                <input key={`m${it.id}:${it.stockMinimo}`} type="number" min="0" defaultValue={it.stockMinimo} aria-label={`Mínimo de ${it.nombre} (avisa si hay menos)`} title="Avisa si hay menos. 0 = sin aviso"
                  onBlur={e => cambiarMinimo(it, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  style={{ ...inp, width: 64, padding: '6px 8px' }} />
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{it.conceptoDesc || (it.concepto ? it.concepto : '— (no se vende)')}</span>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm btn-outline" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => ajustar(it)}>± Stock</button>
                <button className="icon-btn" onClick={() => verMovs(it)} title="Movimientos"><I.Clock /></button>
                <button className="icon-btn" onClick={() => setEdit({ ...it })} aria-label="Editar"><I.Edit /></button>
                <button className="icon-btn danger" onClick={() => borrar(it)} aria-label="Quitar"><I.Trash /></button>
              </div>
            </div>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Alta / edición */}
      {edit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={() => setEdit(null)}>
          <form onClick={e => e.stopPropagation()} onSubmit={guardar} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 12, width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{edit.id ? 'Editar artículo' : 'Nuevo artículo'}</h3>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Nombre
              <input required value={edit.nombre} onChange={e => setEdit(x => ({ ...x, nombre: e.target.value }))} style={{ ...inp, width: '100%', marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Categoría
              <input placeholder="p. ej. Taekwondo" value={edit.categoria || ''} onChange={e => setEdit(x => ({ ...x, categoria: e.target.value }))} style={{ ...inp, width: '100%', marginTop: 4 }} />
            </label>
            {/* Buscador de conceptos, no un desplegable: se escribe y va ofreciendo
                las opciones, igual que en el TPV (ticket #229). */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Se vende como (artículo del catálogo)
              {(() => {
                const libres = conceptos.filter(c => c.concepto === edit.concepto || !items.some(it => it.concepto === c.concepto && it.id !== edit.id));
                const elegido = libres.find(c => c.concepto === edit.concepto) || null;
                const escrito = (edit.qConcepto ?? (elegido ? `${elegido.descripcion} (${elegido.concepto})` : '')).trim();
                const busca = textoPlano(escrito);
                const opciones = (!edit.concepto && busca)
                  ? libres.filter(c => textoPlano(`${c.descripcion} ${c.concepto}`).includes(busca))
                  : [];
                return (
                  <div style={{ position: 'relative', marginTop: 4 }}>
                    <input
                      placeholder="Buscar artículo del catálogo (nombre o código)..."
                      value={edit.qConcepto ?? (elegido ? `${elegido.descripcion} (${elegido.concepto})` : '')}
                      onChange={e => setEdit(x => ({ ...x, qConcepto: e.target.value, concepto: '' }))}
                      style={{ ...inp, width: '100%', fontWeight: 500, borderColor: edit.concepto ? 'var(--teal)' : 'var(--line)' }} />
                    {edit.concepto && (
                      <button type="button" onClick={() => setEdit(x => ({ ...x, concepto: '', qConcepto: '' }))}
                        title="Quitar el enlace con el catálogo"
                        style={{ position: 'absolute', right: 6, top: 6, background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)', fontFamily: 'inherit', fontSize: 12 }}>✕</button>
                    )}
                    {opciones.length > 0 && (
                      <div onMouseDown={ev => ev.preventDefault()}
                        style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 6, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, marginTop: 2, maxHeight: 300, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
                        {opciones.map(c => (
                          <button key={c.concepto} type="button"
                            onMouseDown={ev => {
                              ev.preventDefault();
                              // Si aún no tiene nombre, se propone el del catálogo.
                              setEdit(x => ({ ...x, concepto: c.concepto, qConcepto: `${c.descripcion} (${c.concepto})`, nombre: x.nombre || c.descripcion }));
                            }}
                            style={{ display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--line-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)' }}>
                            <span>{c.descripcion}</span>
                            <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>{c.concepto}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', marginTop: 4 }}>
                Déjalo vacío si es solo inventario y no se vende. Cada talla es su propio artículo en el catálogo
                (p. ej. "Dobok talla S"): enlaza cada una con su artículo del almacén.
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!edit.id && (
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', flex: 1 }}>Stock inicial
                  <input type="number" min="0" value={edit.stock} onChange={e => setEdit(x => ({ ...x, stock: e.target.value }))} style={{ ...inp, width: '100%', marginTop: 4 }} />
                </label>
              )}
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', flex: 1 }}>Mínimo (avisa si hay menos; 0, sin aviso)
                <input type="number" min="0" value={edit.stockMinimo} onChange={e => setEdit(x => ({ ...x, stockMinimo: e.target.value }))} style={{ ...inp, width: '100%', marginTop: 4 }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" onClick={() => setEdit(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {entradas && <EntradasDelDia onCerrar={() => setEntradas(false)} />}

      {/* Movimientos */}
      {movs && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={() => setMovs(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 10, width: 'min(500px, 100%)', maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Movimientos · {movs.item.nombre}</h3>
            {movs.lista.length === 0 && <p style={{ color: 'var(--ink-3)', fontSize: 13, margin: 0 }}>Sin movimientos.</p>}
            {movs.lista.map(m => (
              <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13, borderBottom: '1px solid var(--line-2)', paddingBottom: 6 }}>
                <b style={{ color: m.delta > 0 ? 'var(--teal)' : 'var(--orange)', minWidth: 40 }}>{m.delta > 0 ? '+' : ''}{m.delta}</b>
                <span style={{ flex: 1 }}>{m.motivo}{m.reciboId ? ` · recibo #${m.reciboId}` : ''}</span>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{fmt(m.fecha)}{m.usuario ? ` · ${m.usuario}` : ''}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-sm btn-outline" onClick={() => setMovs(null)}>Cerrar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════ Entradas del día (#466) ═══════════════════════
// Lo que se dio de entrada un día (uno a uno, desde cada artículo), en una
// lista: cada artículo con sus unidades, y el total. Se puede imprimir.
const hoyLocal = () => new Date().toLocaleDateString('sv-SE');
const otroDia = (f, n) => { const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const diaLargo = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function EntradasDelDia({ onCerrar }) {
  const [fecha, setFecha] = useState(hoyLocal());
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setD(null); setError('');
    fetch(`/api/admin/almacen/entradas?fecha=${fecha}`, { credentials: 'include', cache: 'no-store' })
      .then(async r => { const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'No se ha podido cargar.'); setD(x); })
      .catch(e => setError(e.message));
  }, [fecha]);
  const motivoTxt = (m) => m.filter(x => !/^recuento$/i.test(x)).join(' · ');
  function imprimir() {
    const filas = d.articulos.map(a => `<tr><td>${escHtml(a.nombre)}${a.categoria ? `<div style="color:#777;font-size:11px">${escHtml(a.categoria)}</div>` : ''}</td><td style="text-align:right;font-weight:700">+${a.unidades}</td><td style="text-align:right">${a.stock}</td></tr>`).join('');
    imprimirHtml('entradas-almacen', `<div style="font-family:Arial,sans-serif;padding:24px;color:#111">
      <h2 style="margin:0 0 4px">Entrada de mercancía</h2><div style="color:#555;margin-bottom:16px">${escHtml(diaLargo(fecha))}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;border-bottom:2px solid #111"><th style="padding:6px 4px">Artículo</th><th style="text-align:right;padding:6px 4px">Entraron</th><th style="text-align:right;padding:6px 4px">Hay ahora</th></tr></thead>
      <tbody>${filas}</tbody><tfoot><tr style="border-top:2px solid #111"><td style="padding:8px 4px;font-weight:700">Total (${d.articulos.length} artículos)</td><td style="text-align:right;padding:8px 4px;font-weight:700">+${d.total}</td><td></td></tr></tfoot></table>
      <style>#entradas-almacen td{padding:6px 4px;border-bottom:1px solid #ddd}</style></div>`);
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 12, width: 'min(620px, 100%)', maxHeight: '88vh', overflowY: 'auto' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Entradas del día</h3>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setFecha(f => otroDia(f, -1))} aria-label="Día anterior">‹</button>
          <input type="date" value={fecha} max={hoyLocal()} onChange={e => e.target.value && setFecha(e.target.value)} style={{ ...inp, padding: '6px 9px' }} />
          <button type="button" className="btn btn-sm btn-outline" disabled={fecha >= hoyLocal()} onClick={() => setFecha(f => otroDia(f, 1))} aria-label="Día siguiente">›</button>
          {fecha !== hoyLocal() && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFecha(hoyLocal())}>Hoy</button>}
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{diaLargo(fecha).replace(/^./, c => c.toUpperCase())}</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Todo lo que se sumó a mano ese día (entradas de mercancía y recuentos al alza), junto por artículo. Las ventas no cuentan.</p>
        {error && <p style={{ margin: 0, color: 'var(--orange)', fontSize: 13 }}>{error}</p>}
        {!d && !error && <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13 }}>Cargando...</p>}
        {d && !d.articulos.length && <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13 }}>Ese día no entró nada.</p>}
        {d && d.articulos.length > 0 && (
          <>
            <div style={{ display: 'grid', gap: 0, border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, padding: '8px 12px', background: 'var(--bg-3)', fontSize: 11, fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                <span>Artículo</span><span style={{ textAlign: 'right' }}>Entraron</span><span style={{ textAlign: 'right' }}>Hay ahora</span>
              </div>
              {d.articulos.map(a => (
                <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--line-2)', alignItems: 'baseline', fontSize: 14 }}>
                  <span style={{ minWidth: 0 }}>
                    <b>{a.nombre}</b>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>
                      {[a.categoria, motivoTxt(a.motivos), a.veces > 1 ? `en ${a.veces} veces` : null, a.quienes.join(', ')].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <b style={{ textAlign: 'right', color: 'var(--teal)' }}>+{a.unidades}</b>
                  <span style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{a.stock}</span>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, padding: '10px 12px', borderTop: '2px solid var(--line)', fontSize: 14, fontWeight: 800 }}>
                <span>Total · {d.articulos.length} {d.articulos.length === 1 ? 'artículo' : 'artículos'}</span>
                <span style={{ textAlign: 'right', color: 'var(--teal)' }}>+{d.total}</span><span />
              </div>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {d && d.articulos.length > 0 && <button type="button" className="btn btn-sm btn-outline" onClick={imprimir}>Imprimir</button>}
          <button type="button" className="btn btn-sm btn-primary" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
