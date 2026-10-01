import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';
import { BarraCta, VentanaCta, FlotanteCta } from './AvisosWeb.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Avisos y llamadas a la acción de la web (ticket #341): una barra arriba, una
// ventana que aparece o un botón flotante, con su texto, su botón y a dónde
// lleva, en las páginas y fechas que se elijan. De cada uno se ve cuántas veces
// se ha visto, pinchado y cerrado.
// ─────────────────────────────────────────────────────────────────────────────

const FORMATOS = [
  ['barra', 'Barra arriba', 'Una franja de color encima de la página. Para avisos cortos: «Abiertas las inscripciones».'],
  ['ventana', 'Ventana', 'Aparece a los pocos segundos, una vez por visita. Para lo importante: campamento, jornada de puertas abiertas…'],
  ['boton', 'Botón flotante', 'Un botón fijo abajo a la derecha. Para una acción que siempre está: «Prueba una clase gratis».'],
];
const COLORES = ['#5233A8', '#1E6FD9', '#0E9F6E', '#E85D2F', '#D63384', '#1A1A1A'];
const VACIO = { nombre: '', formato: 'barra', titulo: '', texto: '', botonTexto: '', botonUrl: '', color: '#5233A8', paginas: [], retraso: 5, desde: '', hasta: '', activa: true };
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%' };
const etiqueta = { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' };
const aLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const fecha = (iso) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '—');

async function api(url, { method = 'GET', body } = {}) {
  const r = await fetch(url, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido.');
  return d;
}

function estadoDe(c) {
  const ahora = Date.now();
  if (!c.activa) return ['Pausado', 'var(--ink-3)'];
  if (c.hasta && new Date(c.hasta) <= ahora) return ['Terminado', 'var(--ink-3)'];
  if (c.desde && new Date(c.desde) > ahora) return [`Sale el ${fecha(c.desde)}`, 'var(--blue, #1e6fd9)'];
  return ['En la web', 'var(--teal)'];
}

function Previa({ c }) {
  const v = { ...c, id: 0 };
  return (
    <div style={{ border: '1px dashed var(--line)', borderRadius: 14, overflow: 'hidden', background: 'var(--bg)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)', padding: '8px 12px' }}>Así se verá</div>
      {c.formato === 'barra' && <BarraCta c={v} previa onCerrar={() => {}} />}
      {c.formato === 'ventana' && <div style={{ padding: 10, background: 'rgba(0,0,0,.35)' }}><VentanaCta c={v} previa onCerrar={() => {}} /></div>}
      {c.formato === 'boton' && <div style={{ padding: 20, display: 'flex', justifyContent: 'flex-end' }}><FlotanteCta c={v} previa onCerrar={() => {}} /></div>}
      <div style={{ height: 40, margin: 12, borderRadius: 8, background: 'var(--bg-3)' }} />
    </div>
  );
}

function Editor({ inicial, onGuardado, onCerrar, showToast }) {
  const [c, setC] = useState({ ...VACIO, ...inicial, desde: aLocal(inicial.desde), hasta: aLocal(inicial.hasta), paginasTexto: (inicial.paginas || []).join('\n') });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setC(x => ({ ...x, [k]: v }));
  async function guardar() {
    setGuardando(true);
    try {
      const body = {
        ...c, paginas: c.paginasTexto.split('\n').map(x => x.trim()).filter(Boolean),
        desde: c.desde ? new Date(c.desde).toISOString() : null, hasta: c.hasta ? new Date(c.hasta).toISOString() : null,
      };
      const d = await api(c.id ? `/api/admin/ctas/${c.id}` : '/api/admin/ctas', { method: c.id ? 'PUT' : 'POST', body });
      showToast?.(c.id ? 'Guardado.' : 'Creado. Ya sale en la web (en un minuto como mucho).');
      onGuardado(d.cta);
    } catch (e) { alert(e.message); } finally { setGuardando(false); }
  }
  return (
    <div className="panel" style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>← Avisos</button>
        <h2 style={{ margin: 0 }}>{c.id ? c.nombre || 'Aviso' : 'Nuevo aviso'}</h2>
      </div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 4 }}><span style={etiqueta}>Nombre (solo para vosotros)</span>
            <input style={campo} value={c.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Campamento de Navidad" /></label>
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={etiqueta}>Cómo sale</span>
            {FORMATOS.map(([k, n, d]) => (
              <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer', padding: '8px 10px', borderRadius: 10, border: `1px solid ${c.formato === k ? 'var(--purple)' : 'var(--line)'}`, background: c.formato === k ? 'color-mix(in oklab, var(--purple) 8%, var(--bg-2))' : 'var(--bg-2)' }}>
                <input type="radio" name="formato" checked={c.formato === k} onChange={() => set('formato', k)} style={{ marginTop: 3 }} />
                <span><b>{n}</b><br /><span style={{ color: 'var(--ink-3)' }}>{d}</span></span>
              </label>
            ))}
          </div>
          {c.formato !== 'boton' && <>
            <label style={{ display: 'grid', gap: 4 }}><span style={etiqueta}>Título</span>
              <input style={campo} value={c.titulo} maxLength={160} onChange={e => set('titulo', e.target.value)} placeholder="¡Campamento de Navidad!" /></label>
            <label style={{ display: 'grid', gap: 4 }}><span style={etiqueta}>Texto</span>
              <textarea style={{ ...campo, minHeight: 70, resize: 'vertical' }} maxLength={600} value={c.texto} onChange={e => set('texto', e.target.value)} placeholder="Del 22 de diciembre al 5 de enero. Plazas limitadas." /></label>
          </>}
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
            <label style={{ display: 'grid', gap: 4 }}><span style={etiqueta}>Texto del botón</span>
              <input style={campo} value={c.botonTexto} maxLength={60} onChange={e => set('botonTexto', e.target.value)} placeholder="Apúntate" /></label>
            <label style={{ display: 'grid', gap: 4 }}><span style={etiqueta}>Lleva a</span>
              <input style={campo} value={c.botonUrl} onChange={e => set('botonUrl', e.target.value)} placeholder="/campamento" /></label>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={etiqueta}>Color</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {COLORES.map(x => <button key={x} type="button" aria-label={`Color ${x}`} onClick={() => set('color', x)} style={{ width: 28, height: 28, borderRadius: 99, background: x, border: c.color === x ? '3px solid var(--ink)' : '2px solid var(--line)', cursor: 'pointer' }} />)}
              <input type="color" value={c.color} onChange={e => set('color', e.target.value)} aria-label="Otro color" style={{ width: 36, height: 30, border: 0, background: 'none', cursor: 'pointer' }} />
            </div>
          </div>
          <label style={{ display: 'grid', gap: 4 }}><span style={etiqueta}>En qué páginas (vacío: en todas)</span>
            <textarea style={{ ...campo, minHeight: 60, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} value={c.paginasTexto} onChange={e => set('paginasTexto', e.target.value)} placeholder={'/\n/actividades*'} />
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Una por línea. «/» es la portada; con * al final vale para todas las que empiezan así (/actividades* = todas las actividades).</span></label>
          {c.formato === 'ventana' && (
            <label style={{ display: 'grid', gap: 4 }}><span style={etiqueta}>Aparece a los… segundos</span>
              <input type="number" min={0} max={120} style={{ ...campo, width: 120 }} value={c.retraso} onChange={e => set('retraso', e.target.value)} /></label>
          )}
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
            <label style={{ display: 'grid', gap: 4 }}><span style={etiqueta}>Desde (opcional)</span>
              <input type="datetime-local" style={campo} value={c.desde} onChange={e => set('desde', e.target.value)} /></label>
            <label style={{ display: 'grid', gap: 4 }}><span style={etiqueta}>Hasta (opcional)</span>
              <input type="datetime-local" style={campo} value={c.hasta} onChange={e => set('hasta', e.target.value)} /></label>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
            <input type="checkbox" checked={c.activa} onChange={e => set('activa', e.target.checked)} /> Activo (si lo quitas, deja de salir sin borrarlo)
          </label>
        </div>
        <div style={{ display: 'grid', gap: 10, position: 'sticky', top: 12 }}>
          <Previa c={c} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  );
}

export default function AdminCtas({ showToast }) {
  const [lista, setLista] = useState(null);
  const [editando, setEditando] = useState(null);
  const cargar = useCallback(() => api('/api/admin/ctas').then(d => setLista(d.ctas)).catch(e => { alert(e.message); setLista([]); }), []);
  useEffect(() => { cargar(); }, [cargar]);

  async function borrar(c) {
    if (!window.confirm(`¿Borrar «${c.nombre}»? Se pierden también sus números.`)) return;
    try { await api(`/api/admin/ctas/${c.id}`, { method: 'DELETE' }); showToast?.('Borrado.'); cargar(); } catch (e) { alert(e.message); }
  }
  async function alternar(c) {
    try { await api(`/api/admin/ctas/${c.id}`, { method: 'PUT', body: { ...c, activa: !c.activa } }); showToast?.(c.activa ? 'Pausado: ya no sale.' : 'Activado.'); cargar(); } catch (e) { alert(e.message); }
  }

  if (editando) return <Editor inicial={editando} showToast={showToast} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar(); }} />;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="panel">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}><I.Bell /> Avisos y llamadas a la acción</h2>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditando(VACIO)}><I.Plus /> Nuevo aviso</button>
        </div>
        <p className="sub" style={{ marginBottom: 0 }}>
          Una barra arriba, una ventana o un botón flotante en las páginas de la web que elijas, con su botón a donde quieras
          (por ejemplo «Apúntate al campamento» → /campamento). Aquí ves cuántas personas lo vieron y cuántas lo pincharon.
        </p>
      </div>
      {lista === null && <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>}
      {lista?.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          Todavía no hay ninguno. Pulsa <b>Nuevo aviso</b> para crear el primero.
        </div>
      )}
      {lista?.map(c => {
        const [est, col] = estadoDe(c);
        return (
          <div key={c.id} className="panel" style={{ margin: 0, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ width: 14, height: 14, borderRadius: 99, background: c.color }} />
              <b style={{ fontSize: 16 }}>{c.nombre}</b>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{FORMATOS.find(f => f[0] === c.formato)?.[1]}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: col }}>{est}</span>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn-sm btn-outline" onClick={() => alternar(c)}>{c.activa ? 'Pausar' : 'Activar'}</button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditando(c)}><I.Edit /> Editar</button>
              <button type="button" className="btn btn-sm btn-outline" aria-label="Borrar" onClick={() => borrar(c)}><I.Trash /></button>
            </div>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{[c.titulo, c.texto].filter(Boolean).join(' · ') || c.botonTexto}{c.botonUrl ? ` → ${c.botonUrl}` : ''}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {c.paginas.length ? `En ${c.paginas.join(', ')}` : 'En todas las páginas'}
              {c.desde ? ` · desde el ${fecha(c.desde)}` : ''}{c.hasta ? ` · hasta el ${fecha(c.hasta)}` : ''}
            </span>
            <span style={{ fontSize: 13 }}>
              <b>{c.vistas}</b> lo vieron · <b>{c.clics}</b> lo pincharon ({pct(c.clics, c.vistas)}) · <b>{c.cierres}</b> lo cerraron
            </span>
          </div>
        );
      })}
    </div>
  );
}
