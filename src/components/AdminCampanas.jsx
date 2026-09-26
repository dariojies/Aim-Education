import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';
import { fmtFechaHora } from '../fechas.js';
import { useEnVivo } from '../envivo.js';

// ─────────────────────────────────────────────────────────────────────────────
// Campañas (CRM 5, ticket #314): un correo a todo un segmento guardado. Sale por
// el buzón del club, uno por destinatario y poco a poco (uno cada 4 s), con los
// datos de su alumno, su enlace de baja y los clics contados. Se puede enviar
// una prueba a uno mismo, pausar y reanudar, y ver el detalle de cada envío.
// ─────────────────────────────────────────────────────────────────────────────

const TIPOS = [['comercial', 'Comercial'], ['actividades', 'De sus actividades'], ['servicio', 'De servicio']];
const NOMBRE_TIPO = Object.fromEntries(TIPOS);
const ESTADO = { borrador: ['Borrador', 'var(--ink-3)'], enviando: ['Enviándose', 'var(--purple)'], pausada: ['En pausa', 'var(--orange)'], enviada: ['Enviada', 'var(--teal)'] };
const VARIABLES = ['{nombre}', '{alumno}', '{clases}', '{pendiente}', '{mes}'];
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%' };
const pastilla = (activo) => ({
  padding: '6px 12px', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', border: 0,
  background: activo ? 'var(--purple)' : 'transparent', color: activo ? '#fff' : 'var(--ink-2)',
});
const api = async (url, opts = {}) => {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
};

function Editor({ inicial, segmentos, plantillas, onGuardada, onCerrar, showToast }) {
  const [c, setC] = useState(inicial);
  const [cuantos, setCuantos] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const cambia = (k, v) => setC(x => ({ ...x, [k]: v }));
  const seg = segmentos.find(s => s.nombre === c.segmentoNombre);

  // Cuántos recibirían la campaña, con su tipo (el tipo filtra por permisos).
  useEffect(() => {
    if (!seg) { setCuantos(null); return; }
    let vivo = true;
    api('/api/admin/segmentos/vista', { method: 'POST', body: { filtros: { ...seg.filtros, tipo: c.tipo } } })
      .then(d => vivo && setCuantos(d.resumen)).catch(() => {});
    return () => { vivo = false; };
  }, [seg, c.tipo]);

  async function guardar() {
    if (!c.nombre.trim()) { alert('Ponle un nombre a la campaña.'); return null; }
    if (!seg) { alert('Elige un segmento guardado.'); return null; }
    setOcupado(true);
    try {
      const d = await api('/api/admin/campanas', { method: 'POST', body: { ...c, filtros: seg.filtros } });
      setC(x => ({ ...x, id: d.id }));
      return d.id;
    } catch (e) { alert(e.message); return null; } finally { setOcupado(false); }
  }
  async function prueba() {
    const id = await guardar(); if (!id) return;
    try { const d = await api(`/api/admin/campanas/${id}/prueba`, { method: 'POST' }); showToast?.(`Prueba enviada a ${d.enviadaA}${d.ejemplo ? ` (con los datos de ${d.ejemplo})` : ''}.`); }
    catch (e) { alert(e.message); }
  }
  async function lanzar() {
    if (!c.asunto.trim() || !c.cuerpo.trim()) return alert('Falta el asunto o el texto.');
    const id = await guardar(); if (!id) return;
    const n = cuantos?.direcciones ?? '?';
    if (!window.confirm(`¿Lanzar «${c.nombre}»?\n\nSe enviará a ${n} direcciones, una cada pocos segundos (unos ${Math.ceil((Number(n) || 0) * 4 / 60)} minutos). Se puede pausar.`)) return;
    try { const d = await api(`/api/admin/campanas/${id}/lanzar`, { method: 'POST' }); showToast?.(`Campaña lanzada: ${d.envios} correos en cola (~${d.minutos} min).`); onGuardada(id); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}><I.Mail /> {c.id ? 'Campaña' : 'Nueva campaña'}</h2>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>Volver</button>
      </div>
      <input style={campo} placeholder="Nombre (solo para vosotros), p. ej. «Jornada de puertas abiertas»" value={c.nombre} onChange={e => cambia('nombre', e.target.value)} aria-label="Nombre de la campaña" />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...campo, width: 'auto', flex: '1 1 220px' }} value={c.segmentoNombre || ''} onChange={e => cambia('segmentoNombre', e.target.value)} aria-label="Segmento">
          <option value="">— Elige un segmento guardado —</option>
          {segmentos.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
        </select>
        <div style={{ display: 'inline-flex', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden', background: 'var(--bg-3)' }}>
          {TIPOS.map(([k, t]) => <button key={k} type="button" style={pastilla(c.tipo === k)} onClick={() => cambia('tipo', k)}>{t}</button>)}
        </div>
      </div>
      {!segmentos.length && <span style={{ fontSize: 12, color: 'var(--orange)' }}>Primero guarda un segmento en la pestaña «Segmentos».</span>}
      {cuantos && (
        <span style={{ fontSize: 13 }}>
          Llegaría a <b>{cuantos.direcciones}</b> {cuantos.direcciones === 1 ? 'dirección' : 'direcciones'} ({cuantos.conDestinatario} alumno{cuantos.conDestinatario !== 1 ? 's' : ''}).
          {cuantos.porPermisos ? <span style={{ color: 'var(--ink-3)' }}> {cuantos.porPermisos} fuera por sus permisos.</span> : null}
          {cuantos.sinCorreo ? <span style={{ color: 'var(--ink-3)' }}> {cuantos.sinCorreo} sin correo.</span> : null}
        </span>
      )}
      <select style={{ ...campo, width: 'auto' }} value="" onChange={e => { const p = plantillas.find(x => x.id === e.target.value); if (p) setC(x => ({ ...x, asunto: p.asunto, cuerpo: p.cuerpo })); }} aria-label="Plantilla">
        <option value="">— Empezar desde una plantilla —</option>
        {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      <input style={campo} placeholder="Asunto" value={c.asunto} onChange={e => cambia('asunto', e.target.value)} aria-label="Asunto" />
      <textarea style={{ ...campo, minHeight: 200, resize: 'vertical' }} placeholder="Texto del correo. Los enlaces (https://… o www.…) cuentan los clics." value={c.cuerpo} onChange={e => cambia('cuerpo', e.target.value)} aria-label="Texto de la campaña" />
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        Se rellenan con los datos de cada alumno: {VARIABLES.map(v => <code key={v} style={{ marginRight: 6 }}>{v}</code>)}.
        {c.tipo !== 'servicio' && ' Cada correo lleva al pie su enlace para darse de baja.'}
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" disabled={ocupado} onClick={async () => { if (await guardar()) showToast?.('Borrador guardado.'); }}>Guardar borrador</button>
        <button type="button" className="btn btn-sm btn-outline" disabled={ocupado} onClick={prueba}>Enviarme una prueba</button>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm btn-primary" disabled={ocupado || !cuantos?.direcciones} onClick={lanzar}>Lanzar campaña</button>
      </div>
    </div>
  );
}

function Detalle({ id, onVolver, onAbrirFicha, showToast }) {
  const [d, setD] = useState(null);
  const cargar = useCallback(() => api(`/api/admin/campanas/${id}`).then(setD).catch(() => {}), [id]);
  useEffect(() => { cargar(); }, [cargar]);
  useEnVivo(cargar, { cada: 5000, activo: d?.campana?.estado === 'enviando' });
  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  const c = d.campana, k = c.cuentas;
  const [est, col] = ESTADO[c.estado] || [c.estado, 'var(--ink-3)'];
  async function accion(a) {
    try { await api(`/api/admin/campanas/${id}/${a}`, { method: 'POST' }); showToast?.(a === 'pausar' ? 'Campaña en pausa.' : 'Campaña reanudada.'); cargar(); }
    catch (e) { alert(e.message); }
  }
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>{c.nombre}</h2>
          <span style={{ fontSize: 12, fontWeight: 800, color: col }}>{est}</span>
          <div style={{ flex: 1 }} />
          {c.estado === 'enviando' && <button type="button" className="btn btn-sm btn-outline" onClick={() => accion('pausar')}>Pausar</button>}
          {c.estado === 'pausada' && <button type="button" className="btn btn-sm btn-primary" onClick={() => accion('reanudar')}>Reanudar</button>}
          <button type="button" className="btn btn-sm btn-outline" onClick={onVolver}>Volver</button>
        </div>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {NOMBRE_TIPO[c.tipo]} · segmento «{c.segmentoNombre || '—'}» · {c.lanzadaAt ? `lanzada el ${fmtFechaHora(c.lanzadaAt)}` : 'sin lanzar'}{c.quien ? ` · por ${c.quien}` : ''}
        </span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[[k.enviados, `enviados de ${k.total}`], [k.pendientes, 'en cola'], [k.conClic, 'han pinchado algún enlace'], [k.bajas, 'bajas'], [k.errores + k.omitidos, 'errores u omitidos']].map(([v, t]) => (
            <div key={t} style={{ background: 'var(--bg-3)', borderRadius: 12, padding: '8px 12px', minWidth: 120 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{t}</div>
            </div>
          ))}
        </div>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Ver el texto</summary>
          <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', background: 'var(--bg-3)', borderRadius: 10, padding: 12, fontSize: 13 }}><b>{c.asunto}</b>{'\n\n'}{c.cuerpo}</div>
        </details>
      </div>
      <div className="data-table">
        <div className="data-table-head" style={{ gridTemplateColumns: '1.3fr 1.6fr 110px 90px 1fr' }}>
          <span>Alumno</span><span>Destinatario</span><span>Estado</span><span>Clics</span><span>Baja / error</span>
        </div>
        {d.envios.map(e => (
          <div key={e.id} className="data-table-row" style={{ gridTemplateColumns: '1.3fr 1.6fr 110px 90px 1fr', alignItems: 'center' }}>
            <button type="button" onClick={() => onAbrirFicha?.({ id: e.alumnoId })} style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>{e.alumno || '—'}</button>
            <span style={{ fontSize: 12 }}>{e.destinatario || '—'} <span style={{ color: 'var(--ink-3)' }}>· {e.email}</span></span>
            <span style={{ fontSize: 12, fontWeight: 700, color: e.estado === 'enviado' ? 'var(--teal)' : e.estado === 'pendiente' ? 'var(--ink-3)' : 'var(--orange)' }}>
              {{ enviado: '✓ enviado', pendiente: 'en cola', error: '✗ error', omitido: 'omitido' }[e.estado] || e.estado}
            </span>
            <span style={{ fontSize: 13, fontWeight: e.clics ? 800 : 400 }}>{e.clics || '—'}</span>
            <span style={{ fontSize: 12, color: 'var(--orange)' }}>{e.bajaAt ? `se dio de baja ${fmtFechaHora(e.bajaAt)}` : e.error || ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminCampanas({ showToast, onAbrirFicha }) {
  const [lista, setLista] = useState(null);
  const [segmentos, setSegmentos] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [editando, setEditando] = useState(null); // campaña (borrador) en edición
  const [viendo, setViendo] = useState(null);     // id de campaña lanzada
  const cargar = useCallback(() => api('/api/admin/campanas').then(d => setLista(d.campanas)).catch(() => setLista([])), []);
  useEffect(() => {
    cargar();
    api('/api/admin/segmentos').then(d => setSegmentos(d.segmentos || [])).catch(() => {});
    api('/api/admin/comunicaciones/plantillas').then(d => setPlantillas(d.plantillas || [])).catch(() => {});
  }, [cargar]);
  useEnVivo(cargar, { cada: 8000, activo: !editando && !viendo && (lista || []).some(c => c.estado === 'enviando') });

  if (editando) return <Editor inicial={editando} segmentos={segmentos} plantillas={plantillas} showToast={showToast}
    onCerrar={() => { setEditando(null); cargar(); }} onGuardada={(id) => { setEditando(null); setViendo(id); cargar(); }} />;
  if (viendo) return <Detalle id={viendo} onAbrirFicha={onAbrirFicha} showToast={showToast} onVolver={() => { setViendo(null); cargar(); }} />;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="panel">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}><I.Mail /> Campañas</h2>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditando({ nombre: '', asunto: '', cuerpo: '', tipo: 'comercial', segmentoNombre: '' })}><I.Plus /> Nueva campaña</button>
        </div>
        <p className="sub">Un correo a todo un segmento guardado. Sale desde el buzón del club, uno a uno y poco a poco, con su enlace de baja y los clics contados.</p>
      </div>
      {lista && !lista.length && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>Todavía no hay campañas.</div>
      )}
      {(lista || []).map(c => {
        const [est, col] = ESTADO[c.estado] || [c.estado, 'var(--ink-3)'];
        const k = c.cuentas;
        return (
          <button key={c.id} type="button" onClick={() => (c.estado === 'borrador' ? setEditando({ ...c }) : setViendo(c.id))}
            style={{ textAlign: 'left', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--bg-2)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ fontWeight: 800 }}>{c.nombre}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.asunto || '(sin asunto)'} · {NOMBRE_TIPO[c.tipo]} · «{c.segmentoNombre || '—'}»</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: col }}>{est}</span>
            {c.estado !== 'borrador' && <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{k.enviados}/{k.total} enviados · {k.conClic} con clic · {k.bajas} bajas</span>}
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtFechaHora(c.lanzadaAt || c.creadaAt)}</span>
          </button>
        );
      })}
    </div>
  );
}
