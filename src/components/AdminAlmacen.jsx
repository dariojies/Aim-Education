import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';
import { textoPlano, coincideBusqueda } from './Shared.jsx';

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

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch('/api/admin/almacen', { credentials: 'include', cache: 'no-store' });
      if (r.ok) setItems(await r.json());
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
          <div className="data-table-head" style={{ gridTemplateColumns: '1.6fr 90px 1.2fr 150px' }}>
            <span>Artículo</span><span>Stock</span><span>Se vende como</span><span></span>
          </div>
          {filtrados.map(it => (
            <div key={it.id} className="data-table-row" style={{ gridTemplateColumns: '1.6fr 90px 1.2fr 150px', alignItems: 'center' }}>
              <div>
                <div className="pri">{it.nombre}</div>
                {it.categoria && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{it.categoria}</div>}
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, color: it.bajo ? 'var(--orange)' : 'var(--ink)' }}>
                {it.stock}{it.bajo && <span title={`Mínimo ${it.stockMinimo}`} style={{ fontSize: 11 }}> ⚠️</span>}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{it.conceptoDesc || (it.concepto ? it.concepto : '— (no se vende)')}</span>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm btn-outline" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => ajustar(it)}>± Stock</button>
                <button className="icon-btn" onClick={() => verMovs(it)} title="Movimientos"><I.Clock /></button>
                <button className="icon-btn" onClick={() => setEdit({ ...it })} aria-label="Editar"><I.Edit /></button>
                <button className="icon-btn danger" onClick={() => borrar(it)} aria-label="Quitar"><I.Trash /></button>
              </div>
            </div>
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
                  ? libres.filter(c => textoPlano(`${c.descripcion} ${c.concepto}`).includes(busca)).slice(0, 8)
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
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 6, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, marginTop: 2, overflow: 'hidden', maxHeight: 240, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
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
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', flex: 1 }}>Aviso bajo mínimo
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
