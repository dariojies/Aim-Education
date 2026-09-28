import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from './Icons.jsx';
import { fmtFechaHora } from '../fechas.js';
import { useEnVivo } from '../envivo.js';
import { TIPOS_CORREO, describirSegmento } from './crmTextos.js';
import { Paso, Opcion, Variables, meterEnCursor } from './CrmPiezas.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Campañas (CRM 5, ticket #314): un correo a todo un segmento guardado. Sale por
// el buzón del club, uno por destinatario y poco a poco (uno cada 4 s), con los
// datos de su alumno, su enlace de baja y los clics contados. Se puede enviar
// una prueba a uno mismo, pausar y reanudar, y ver el detalle de cada envío.
// ─────────────────────────────────────────────────────────────────────────────

// Mismos nombres que en Segmentos; primero la publicidad, que es lo habitual.
const TIPOS = ['comercial', 'actividades', 'servicio'].map(id => TIPOS_CORREO.find(t => t.id === id));
const NOMBRE_TIPO = Object.fromEntries(TIPOS.map(t => [t.id, t.nombre]));
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

// El editor de una campaña, en cuatro pasos (nombre, a quién, qué tipo de
// correo, el texto) con un resumen al lado que dice a cuántos llegaría, cuánto
// tarda y qué falta antes de poder lanzarla.
function Editor({ inicial, segmentos, plantillas, onGuardada, onCerrar, onIrASegmentos, showToast }) {
  const [c, setC] = useState(inicial);
  const [vista, setVista] = useState(null);   // resumen del segmento (con la cuenta por tipo)
  const [clases, setClases] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [guardadaComo, setGuardadaComo] = useState(inicial.id ? JSON.stringify(inicial) : null);
  const cuerpoRef = useRef(null);
  const asuntoRef = useRef(null);
  const [ultimoCampo, setUltimoCampo] = useState('cuerpo');
  const cambia = (k, v) => setC(x => ({ ...x, [k]: v }));
  const seg = segmentos.find(s => s.nombre === c.segmentoNombre);

  useEffect(() => { api('/api/admin/segmentos/opciones').then(d => setClases(d.clases || [])).catch(() => {}); }, []);
  // Cuántos recibirían la campaña con cada tipo de correo (el tipo filtra por permisos).
  useEffect(() => {
    if (!seg) { setVista(null); return; }
    let vivo = true;
    api('/api/admin/segmentos/vista', { method: 'POST', body: { filtros: { ...seg.filtros, tipo: 'servicio' } } })
      .then(d => vivo && setVista(d.resumen)).catch(() => {});
    return () => { vivo = false; };
  }, [seg]);
  const llega = vista?.porTipo?.[c.tipo];
  const minutos = llega ? Math.max(1, Math.ceil(llega.correos * 4 / 60)) : 0;
  const falta = [
    !c.nombre.trim() && 'ponerle un nombre',
    !seg && 'elegir a quién va',
    seg && llega && !llega.correos && 'que llegue al menos a alguien',
    !c.asunto.trim() && 'escribir el asunto',
    !c.cuerpo.trim() && 'escribir el texto',
  ].filter(Boolean);
  const sinGuardar = guardadaComo !== JSON.stringify(c);

  function meter(v) {
    if (ultimoCampo === 'asunto') cambia('asunto', meterEnCursor(asuntoRef.current, c.asunto, v));
    else cambia('cuerpo', meterEnCursor(cuerpoRef.current, c.cuerpo, v));
  }
  async function guardar() {
    if (!c.nombre.trim()) { alert('Ponle un nombre a la campaña (solo lo veis vosotros).'); return null; }
    if (!seg) { alert('Elige a quién va (un segmento).'); return null; }
    setOcupado(true);
    try {
      const d = await api('/api/admin/campanas', { method: 'POST', body: { ...c, filtros: seg.filtros } });
      const nueva = { ...c, id: d.id };
      setC(nueva); setGuardadaComo(JSON.stringify(nueva));
      return d.id;
    } catch (e) { alert(e.message); return null; } finally { setOcupado(false); }
  }
  async function prueba() {
    const id = await guardar(); if (!id) return;
    try { const d = await api(`/api/admin/campanas/${id}/prueba`, { method: 'POST' }); showToast?.(`Prueba enviada a ${d.enviadaA}${d.ejemplo ? ` (con los datos de ${d.ejemplo})` : ''}.`); }
    catch (e) { alert(e.message); }
  }
  async function lanzar() {
    if (falta.length) return;
    const id = await guardar(); if (!id) return;
    if (!window.confirm(`¿Enviar «${c.nombre}» ahora?\n\nSaldrán ${llega.correos} correos, uno cada pocos segundos (unos ${minutos} min). Se puede pausar mientras se envía.`)) return;
    try { const d = await api(`/api/admin/campanas/${id}/lanzar`, { method: 'POST' }); showToast?.(`Campaña en marcha: ${d.envios} correos en cola (~${d.minutos} min).`); onGuardada(id); }
    catch (e) { alert(e.message); }
  }
  function volver() {
    if (sinGuardar && (c.nombre || c.asunto || c.cuerpo) && !window.confirm('Hay cambios sin guardar. ¿Salir igualmente?')) return;
    onCerrar();
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={volver}>← Tus campañas</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>{c.id ? 'Borrador de campaña' : 'Nueva campaña'}</h2>
      </div>

      <div className="seg-editor">
        <div className="panel" style={{ display: 'grid', gap: 26, margin: 0 }}>
          <Paso n={1} titulo="¿Cómo la llamamos?" ayuda="Solo para vosotros; las familias no lo ven.">
            <input style={campo} placeholder="P. ej. «Jornada de puertas abiertas»" value={c.nombre} onChange={e => cambia('nombre', e.target.value)} aria-label="Nombre de la campaña" />
          </Paso>

          <Paso n={2} titulo="¿A quién va?" ayuda="Elige uno de tus segmentos.">
            {segmentos.length ? (
              <select style={campo} value={c.segmentoNombre || ''} onChange={e => cambia('segmentoNombre', e.target.value)} aria-label="Segmento">
                <option value="">— Elige un segmento —</option>
                {segmentos.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--orange)' }}>Todavía no hay segmentos: primero hay que crear uno.</span>
            )}
            {seg && <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{describirSegmento(seg.filtros, clases)}</span>}
            {onIrASegmentos && <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={onIrASegmentos}><I.Plus /> Crear un segmento nuevo</button>}
          </Paso>

          <Paso n={3} titulo="¿Qué tipo de correo es?" ayuda="Según el tipo, llega a más o menos gente: se respeta lo que ha dicho cada familia.">
            <div role="radiogroup" aria-label="Tipo de correo" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {TIPOS.map(t => {
                const n = vista?.porTipo?.[t.id];
                return <Opcion key={t.id} activa={c.tipo === t.id} onClick={() => cambia('tipo', t.id)} titulo={t.nombre}
                  texto={`${t.ejemplo} ${t.quien}`} extra={n ? `→ ${n.correos} correo${n.correos !== 1 ? 's' : ''}` : null} />;
              })}
            </div>
          </Paso>

          <Paso n={4} titulo="Escribe el correo">
            {plantillas.length > 0 && (
              <select style={campo} value="" onChange={e => { const p = plantillas.find(x => x.id === e.target.value); if (p && (!(c.asunto || c.cuerpo) || window.confirm('¿Cambiar lo escrito por la plantilla?'))) setC(x => ({ ...x, asunto: p.asunto, cuerpo: p.cuerpo })); }} aria-label="Plantilla">
                <option value="">— Empezar desde una plantilla (opcional) —</option>
                {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            )}
            <input ref={asuntoRef} style={campo} placeholder="Asunto: lo primero que verán en su bandeja" value={c.asunto}
              onFocus={() => setUltimoCampo('asunto')} onChange={e => cambia('asunto', e.target.value)} aria-label="Asunto" />
            <textarea ref={cuerpoRef} style={{ ...campo, minHeight: 220, resize: 'vertical' }} placeholder={'Hola {nombre}:\n\nEscribe aquí el mensaje…'} value={c.cuerpo}
              onFocus={() => setUltimoCampo('cuerpo')} onChange={e => cambia('cuerpo', e.target.value)} aria-label="Texto de la campaña" />
            <Variables vars={VARIABLES} onMeter={meter} />
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Si pones enlaces (https://… o www.…) se cuenta quién los pincha.
              {c.tipo !== 'servicio' && ' Al pie de cada correo va su enlace para darse de baja.'}
            </span>
          </Paso>
        </div>

        <aside className="panel seg-resumen" style={{ margin: 0, display: 'grid', gap: 14 }} aria-live="polite">
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Resumen</span>
          {llega ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{llega.correos}</span>
                <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>correo{llega.correos !== 1 ? 's' : ''}</span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>
                {seg?.filtros?.destino === 'alumno' ? 'A' : 'A las familias de'} {llega.alumnos} alumno{llega.alumnos !== 1 ? 's' : ''} de «{c.segmentoNombre}», como {NOMBRE_TIPO[c.tipo].toLowerCase()}.
                {llega.correos > 0 && ` Tarda unos ${minutos} min en salir todo.`}
              </p>
            </div>
          ) : <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Elige a quién va para ver a cuántos llega.</p>}
          <div style={{ display: 'grid', gap: 4 }}>
            {[['Nombre', !!c.nombre.trim()], ['A quién va', !!seg], ['Asunto', !!c.asunto.trim()], ['Texto', !!c.cuerpo.trim()]].map(([t, hecho]) => (
              <span key={t} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: hecho ? 'var(--ink)' : 'var(--ink-3)' }}>
                <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800,
                  background: hecho ? 'var(--teal)' : 'var(--bg-3)', color: hecho ? '#fff' : 'var(--ink-3)', border: hecho ? 0 : '1px solid var(--line)' }}>{hecho ? '✓' : ''}</span>
                {t}
              </span>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={ocupado || falta.length > 0} onClick={lanzar}>Enviar campaña →</button>
            {falta.length > 0 && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Para poder enviarla falta {falta.join(', ')}.</span>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm btn-outline" style={{ flex: 1 }} disabled={ocupado} onClick={prueba} title="Te llega a ti, con los datos de un alumno del segmento">Enviarme una prueba</button>
              <button type="button" className="btn btn-sm btn-outline" style={{ flex: 1 }} disabled={ocupado || !sinGuardar} onClick={async () => { if (await guardar()) showToast?.('Borrador guardado.'); }}>{sinGuardar ? 'Guardar borrador' : 'Guardado ✓'}</button>
            </div>
          </div>
        </aside>
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
          {[[k.enviados, `enviados de ${k.total}`], [k.pendientes, 'esperando a salir'], [k.conClic, 'han pinchado algún enlace'], [k.bajas, 'se han dado de baja'], [k.errores + k.omitidos, 'no se pudieron enviar']].map(([v, t]) => (
            <div key={t} style={{ background: 'var(--bg-3)', borderRadius: 12, padding: '8px 12px', minWidth: 120 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{t}</div>
            </div>
          ))}
        </div>
        {k.total > 0 && c.estado !== 'borrador' && (
          <div role="progressbar" aria-valuemin={0} aria-valuemax={k.total} aria-valuenow={k.enviados} aria-label="Enviados"
            style={{ height: 8, borderRadius: 999, background: 'var(--bg-3)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(100 * (k.total - k.pendientes) / k.total)}%`, height: '100%', background: 'var(--purple)', transition: 'width .4s ease' }} />
          </div>
        )}
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Ver el correo que se envió</summary>
          <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', background: 'var(--bg-3)', borderRadius: 10, padding: 12, fontSize: 13 }}><b>{c.asunto}</b>{'\n\n'}{c.cuerpo}</div>
        </details>
      </div>
      <div className="data-table">
        <div className="data-table-head" style={{ gridTemplateColumns: '1.3fr 1.6fr 110px 90px 1fr' }}>
          <span>Alumno</span><span>A quién</span><span>Estado</span><span>Clics</span><span>Baja o motivo</span>
        </div>
        {d.envios.map(e => (
          <div key={e.id} className="data-table-row" style={{ gridTemplateColumns: '1.3fr 1.6fr 110px 90px 1fr', alignItems: 'center' }}>
            <button type="button" onClick={() => onAbrirFicha?.({ id: e.alumnoId })} style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>{e.alumno || '—'}</button>
            <span style={{ fontSize: 12 }}>{e.destinatario || '—'} <span style={{ color: 'var(--ink-3)' }}>· {e.email}</span></span>
            <span style={{ fontSize: 12, fontWeight: 700, color: e.estado === 'enviado' ? 'var(--teal)' : e.estado === 'pendiente' ? 'var(--ink-3)' : 'var(--orange)' }}>
              {{ enviado: '✓ enviado', pendiente: 'esperando', error: '✗ no salió', omitido: 'no se envió' }[e.estado] || e.estado}
            </span>
            <span style={{ fontSize: 13, fontWeight: e.clics ? 800 : 400 }}>{e.clics || '—'}</span>
            <span style={{ fontSize: 12, color: 'var(--orange)' }}>{e.bajaAt ? `se dio de baja ${fmtFechaHora(e.bajaAt)}` : e.error || ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminCampanas({ showToast, onAbrirFicha, nuevaConSegmento, onEmpezada, onIrASegmentos }) {
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
  // Desde un segmento, «Usar en una campaña»: se abre una nueva con él puesto.
  useEffect(() => {
    if (!nuevaConSegmento) return;
    api('/api/admin/segmentos').then(d => setSegmentos(d.segmentos || [])).catch(() => {});
    setViendo(null);
    setEditando({ nombre: '', asunto: '', cuerpo: '', tipo: 'comercial', segmentoNombre: nuevaConSegmento });
    onEmpezada?.();
  }, [nuevaConSegmento, onEmpezada]);

  if (editando) return <Editor inicial={editando} segmentos={segmentos} plantillas={plantillas} showToast={showToast} onIrASegmentos={onIrASegmentos}
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
        <p className="sub" style={{ marginBottom: 0 }}>
          Una campaña es un correo que se envía de una vez a todo un segmento. Sale desde el correo del club, a cada familia por
          separado y con su nombre, y aquí ves a quién le ha llegado y quién ha pinchado sus enlaces.
        </p>
      </div>
      {lista && !lista.length && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>Todavía no hay campañas. Pulsa <b>Nueva campaña</b> para preparar la primera.</div>
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
