import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { I } from './Icons.jsx';
import { fmtFechaHora } from '../fechas.js';
import { useEnVivo } from '../envivo.js';
import { TIPOS_CORREO, describirSegmento } from './crmTextos.js';
import { Paso, Opcion, Variables, meterEnCursor } from './CrmPiezas.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Campañas (CRM 5, ticket #314). Una campaña («Navidad 2026») va a uno o varios
// segmentos y tiene uno o varios correos (antes de empezar, al empezar, al
// terminar…). Cada correo tiene su tipo y su texto, y sale cuando se pulsa
// «Enviar ahora» o a la hora programada. De cada uno se ve a quién le llegó,
// quién lo abrió y cuándo, quién pinchó sus enlaces, las bajas y los rebotes.
// Abajo, los correos que rebotan: apartados de los envíos hasta que se cambien
// en la ficha o se marquen como arreglados.
// ─────────────────────────────────────────────────────────────────────────────

// Mismos nombres que en Segmentos; primero la publicidad, que es lo habitual.
const TIPOS = ['comercial', 'actividades', 'servicio'].map(id => TIPOS_CORREO.find(t => t.id === id));
const NOMBRE_TIPO = Object.fromEntries(TIPOS.map(t => [t.id, t.nombre]));
const ESTADO_CAMPANA = {
  borrador: ['Borrador', 'var(--ink-3)'], programada: ['Programada', 'var(--purple)'], en_curso: ['En marcha', 'var(--purple)'],
  enviando: ['Enviándose', 'var(--purple)'], pausada: ['En pausa', 'var(--orange)'], enviada: ['Enviada', 'var(--teal)'],
};
const VARIABLES = ['{nombre}', '{alumno}', '{clases}', '{pendiente}', '{mes}'];
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%' };
const titulito = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const api = async (url, opts = {}) => {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
};
// Para un <input type="datetime-local">: la hora local, sin zona.
const aLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const nombreCorreo = (k, i) => k.titulo?.trim() || `Correo ${i + 1}`;

function Pildora({ texto, color }) {
  return <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, color, background: `color-mix(in oklab, ${color} 14%, transparent)`, whiteSpace: 'nowrap' }}>{texto}</span>;
}
function Cifra({ v, t }) {
  return (
    <div style={{ background: 'var(--bg-3)', borderRadius: 12, padding: '8px 12px', minWidth: 110 }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{t}</div>
    </div>
  );
}
function Barra({ hecho, total }) {
  if (!total) return null;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hecho} aria-label="Enviados"
      style={{ height: 8, borderRadius: 999, background: 'var(--bg-3)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(100 * hecho / total)}%`, height: '100%', background: 'var(--purple)', transition: 'width .4s ease' }} />
    </div>
  );
}

// Cuándo sale / cómo va un correo, en una frase.
function estadoCorreo(k) {
  const c = k.cuentas;
  switch (k.estado) {
    case 'programado': return [`Programado: ${fmtFechaHora(k.programadoAt)}`, 'var(--purple)'];
    case 'enviando': return [`Enviándose: ${c.total - c.pendientes} de ${c.total}`, 'var(--purple)'];
    case 'pausado': return [`En pausa: ${c.total - c.pendientes} de ${c.total}`, 'var(--orange)'];
    case 'enviado': return [`Enviado el ${fmtFechaHora(k.lanzadoAt)}`, 'var(--teal)'];
    default: return ['Borrador: se envía a mano', 'var(--ink-3)'];
  }
}

// ── Una campaña: a quién va y sus correos ────────────────────────────────────
function Campana({ inicial, segmentosGuardados, onVolver, onIrASegmentos, onEditarCorreo, onVerCorreo, showToast }) {
  const [c, setC] = useState(inicial);
  const [guardadaComo, setGuardadaComo] = useState(inicial.id ? JSON.stringify({ n: inicial.nombre, s: inicial.segmentos }) : null);
  const [alcance, setAlcance] = useState(null);
  const [clases, setClases] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const recargar = useCallback(async () => {
    if (!c.id) return;
    try { const d = await api(`/api/admin/campanas/${c.id}`); setC(x => ({ ...x, correos: d.campana.correos, estado: d.campana.estado })); } catch { /* noop */ }
  }, [c.id]);
  useEffect(() => { api('/api/admin/segmentos/opciones').then(d => setClases(d.clases || [])).catch(() => {}); recargar(); }, [recargar]);
  useEnVivo(recargar, { cada: 5000, activo: (c.correos || []).some(k => k.estado === 'enviando') });

  const nombres = c.segmentos.map(s => s.nombre);
  const clavesSeg = JSON.stringify(c.segmentos);
  useEffect(() => {
    const segs = JSON.parse(clavesSeg);
    if (!segs.length) { setAlcance(null); return; }
    let vivo = true;
    api('/api/admin/campanas/alcance', { method: 'POST', body: { segmentos: segs } }).then(d => vivo && setAlcance(d)).catch(() => {});
    return () => { vivo = false; };
  }, [clavesSeg]);

  const sinGuardar = guardadaComo !== JSON.stringify({ n: c.nombre, s: c.segmentos });
  function alternarSegmento(s) {
    setC(x => ({ ...x, segmentos: nombres.includes(s.nombre) ? x.segmentos.filter(y => y.nombre !== s.nombre) : [...x.segmentos, { nombre: s.nombre, filtros: s.filtros }] }));
  }
  async function guardar(aviso = true) {
    if (!c.nombre.trim()) { alert('Ponle un nombre a la campaña (solo lo veis vosotros).'); return null; }
    setOcupado(true);
    try {
      const d = await api('/api/admin/campanas', { method: 'POST', body: { id: c.id, nombre: c.nombre, segmentos: c.segmentos } });
      setC(x => ({ ...x, id: d.id })); setGuardadaComo(JSON.stringify({ n: c.nombre, s: c.segmentos }));
      if (aviso) showToast?.('Campaña guardada.');
      return d.id;
    } catch (e) { alert(e.message); return null; } finally { setOcupado(false); }
  }
  async function nuevoCorreo() {
    const id = sinGuardar || !c.id ? await guardar(false) : c.id;
    if (id) onEditarCorreo({ campanaId: id, segmentos: c.segmentos, correo: { titulo: '', asunto: '', cuerpo: '', tipo: 'comercial', programadoAt: null }, numero: (c.correos || []).length });
  }
  async function editar(k, i) {
    const id = sinGuardar ? await guardar(false) : c.id;
    if (id) onEditarCorreo({ campanaId: id, segmentos: c.segmentos, correo: k, numero: i });
  }
  async function accion(k, que, i) {
    try {
      if (que === 'lanzar') {
        if (sinGuardar && !(await guardar(false))) return;
        const n = alcance?.porTipo?.[k.tipo]?.correos;
        if (!window.confirm(`¿Enviar «${nombreCorreo(k, i)}» ahora?${n != null ? `\n\nSaldrán unos ${n} correos, uno cada pocos segundos. Se puede pausar.` : ''}`)) return;
        const d = await api(`/api/admin/campanas/correos/${k.id}/lanzar`, { method: 'POST' });
        showToast?.(`En marcha: ${d.envios} correos en cola (~${d.minutos} min).`);
      } else if (que === 'borrar') {
        if (!window.confirm('¿Borrar este correo de la campaña?')) return;
        await api(`/api/admin/campanas/correos/${k.id}`, { method: 'DELETE' });
      } else {
        await api(`/api/admin/campanas/correos/${k.id}/${que}`, { method: 'POST' });
        showToast?.(que === 'pausar' ? 'Correo en pausa.' : 'Correo reanudado.');
      }
      recargar();
    } catch (e) { alert(e.message); }
  }
  async function borrarCampana() {
    if (!window.confirm(`¿Borrar la campaña «${c.nombre}» y sus correos?`)) return;
    try { await api(`/api/admin/campanas/${c.id}`, { method: 'DELETE' }); showToast?.('Campaña borrada.'); onVolver(); } catch (e) { alert(e.message); }
  }
  function volver() {
    if (sinGuardar && (c.id || c.nombre || c.segmentos.length) && !window.confirm('Hay cambios sin guardar. ¿Salir igualmente?')) return;
    onVolver();
  }
  const [est, col] = ESTADO_CAMPANA[c.estado || 'borrador'] || ESTADO_CAMPANA.borrador;
  const yaSalio = (c.correos || []).some(k => !['borrador', 'programado'].includes(k.estado));
  const perdidos = c.segmentos.filter(s => !segmentosGuardados.some(g => g.nombre === s.nombre));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={volver}>← Tus campañas</button>
        <input style={{ ...campo, fontSize: 15, fontWeight: 700, flex: '1 1 260px', width: 'auto' }} value={c.nombre} onChange={e => setC(x => ({ ...x, nombre: e.target.value }))}
          placeholder="Nombre de la campaña, p. ej. «Navidad 2026»" aria-label="Nombre de la campaña" />
        {c.id && <Pildora texto={est} color={col} />}
        {c.id && !yaSalio && <button type="button" className="btn btn-sm btn-outline" onClick={borrarCampana}><I.Trash /> Borrar</button>}
        <button type="button" className="btn btn-sm btn-primary" onClick={() => guardar()} disabled={ocupado || !sinGuardar}>{sinGuardar ? 'Guardar' : 'Guardado ✓'}</button>
      </div>

      <div className="seg-editor">
        <div className="panel" style={{ display: 'grid', gap: 26, margin: 0 }}>
          <Paso n={1} titulo="¿A quién va?" ayuda="Marca uno o varios segmentos. Si alguien está en dos, le llega una sola vez.">
            {segmentosGuardados.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {segmentosGuardados.map(s => {
                  const on = nombres.includes(s.nombre);
                  return (
                    <label key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                      border: `2px solid ${on ? 'var(--purple)' : 'var(--line)'}`, background: on ? 'color-mix(in oklab, var(--purple) 8%, var(--bg-2))' : 'var(--bg-2)' }}>
                      <input type="checkbox" checked={on} onChange={() => alternarSegmento(s)} style={{ marginTop: 3, accentColor: 'var(--purple)' }} />
                      <span>
                        <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>{s.nombre}</span>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)' }}>{describirSegmento(s.filtros, clases)}</span>
                      </span>
                    </label>
                  );
                })}
                {perdidos.map(s => (
                  <label key={s.nombre} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: 'var(--ink-3)' }}>
                    <input type="checkbox" checked onChange={() => alternarSegmento(s)} /> «{s.nombre}» (ya no existe: se usa como estaba)
                  </label>
                ))}
              </div>
            ) : <span style={{ fontSize: 13, color: 'var(--orange)' }}>Todavía no hay segmentos: primero hay que crear uno.</span>}
            {onIrASegmentos && <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={onIrASegmentos}><I.Plus /> Crear un segmento nuevo</button>}
          </Paso>

          <Paso n={2} titulo="Los correos de la campaña" ayuda="Uno o varios: por ejemplo, uno para anunciarla, otro al empezar y otro al terminar. Cada uno sale cuando pulses «Enviar ahora» o a la hora que le programes.">
            {(c.correos || []).map((k, i) => {
              const [txt, color] = estadoCorreo(k);
              const kc = k.cuentas;
              const editable = ['borrador', 'programado'].includes(k.estado);
              return (
                <div key={k.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'grid', gap: 8, background: 'var(--bg-2)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ width: 24, height: 24, borderRadius: 999, background: 'var(--bg-3)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{i + 1}</span>
                    <b style={{ fontSize: 14 }}>{nombreCorreo(k, i)}</b>
                    <Pildora texto={NOMBRE_TIPO[k.tipo]} color="var(--ink-2)" />
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{txt}</span>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{k.asunto || <i style={{ color: 'var(--ink-3)' }}>(sin asunto todavía)</i>}</span>
                  {['enviando', 'pausado'].includes(k.estado) && <Barra hecho={kc.total - kc.pendientes} total={kc.total} />}
                  {k.estado === 'enviado' && (
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      {kc.enviados} enviados · {kc.abiertos} lo abrieron · {kc.conClic} pincharon un enlace{kc.rebotados ? ` · ${kc.rebotados} rebotaron` : ''}{kc.bajas ? ` · ${kc.bajas} bajas` : ''}
                    </span>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {editable && <button type="button" className="btn btn-sm btn-outline" onClick={() => editar(k, i)}><I.Edit /> Editar</button>}
                    {editable && <button type="button" className="btn btn-sm btn-primary" disabled={!k.asunto || !k.cuerpo || !c.segmentos.length} onClick={() => accion(k, 'lanzar', i)}>Enviar ahora</button>}
                    {editable && <button type="button" className="btn btn-sm btn-outline" aria-label="Borrar este correo" onClick={() => accion(k, 'borrar', i)}><I.Trash /></button>}
                    {k.estado === 'enviando' && <button type="button" className="btn btn-sm btn-outline" onClick={() => accion(k, 'pausar', i)}>Pausar</button>}
                    {k.estado === 'pausado' && <button type="button" className="btn btn-sm btn-primary" onClick={() => accion(k, 'reanudar', i)}>Reanudar</button>}
                    {!editable && <button type="button" className="btn btn-sm btn-outline" onClick={() => onVerCorreo({ campana: c, correo: k, numero: i })}>Ver quién lo abrió</button>}
                  </div>
                </div>
              );
            })}
            {!(c.correos || []).length && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Todavía no tiene correos.</span>}
            <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={nuevoCorreo} disabled={ocupado}><I.Plus /> Añadir un correo</button>
          </Paso>
        </div>

        <aside className="panel seg-resumen" style={{ margin: 0, display: 'grid', gap: 14 }} aria-live="polite">
          <span style={titulito}>A quién llega</span>
          {alcance ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{alcance.alumnos}</span>
                <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>persona{alcance.alumnos !== 1 ? 's' : ''} en {c.segmentos.length === 1 ? 'el segmento' : `los ${c.segmentos.length} segmentos`}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Correos que saldrían en cada envío, según su tipo:</span>
              {TIPOS.map(t => (
                <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: 'var(--bg-3)' }}>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{t.nombre}</span>
                  <span style={{ fontWeight: 800, fontSize: 18 }}>{alcance.porTipo[t.id]?.correos ?? '—'}</span>
                </div>
              ))}
            </>
          ) : <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Marca a quién va para ver a cuántos llega.</p>}
          <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
            Se cuenta en el momento de enviar cada correo: si entra alguien nuevo en un segmento, le llegan los siguientes.
          </p>
        </aside>
      </div>
    </div>
  );
}

// ── Un correo de la campaña ──────────────────────────────────────────────────
function EditorCorreo({ campanaId, segmentos, correo, numero, plantillas, onVolver, showToast }) {
  const [k, setK] = useState({ ...correo });
  const [cuando, setCuando] = useState(correo.programadoAt ? 'programado' : 'mano');
  const [fecha, setFecha] = useState(aLocal(correo.programadoAt));
  const [alcance, setAlcance] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const cuerpoRef = useRef(null), asuntoRef = useRef(null);
  const [ultimo, setUltimo] = useState('cuerpo');
  const cambia = (c, v) => setK(x => ({ ...x, [c]: v }));
  useEffect(() => {
    if (!segmentos.length) return;
    api('/api/admin/campanas/alcance', { method: 'POST', body: { segmentos } }).then(setAlcance).catch(() => {});
  }, [segmentos]);
  const llega = alcance?.porTipo?.[k.tipo];
  const minutos = llega ? Math.max(1, Math.ceil(llega.correos * 4 / 60)) : 0;
  const falta = [
    !segmentos.length && 'elegir a quién va la campaña',
    llega && !llega.correos && 'que llegue al menos a alguien',
    !k.asunto.trim() && 'escribir el asunto',
    !k.cuerpo.trim() && 'escribir el texto',
    cuando === 'programado' && !fecha && 'poner la fecha y hora',
  ].filter(Boolean);

  function meter(v) {
    if (ultimo === 'asunto') cambia('asunto', meterEnCursor(asuntoRef.current, k.asunto, v));
    else cambia('cuerpo', meterEnCursor(cuerpoRef.current, k.cuerpo, v));
  }
  async function guardar(aviso) {
    setOcupado(true);
    try {
      const d = await api(`/api/admin/campanas/${campanaId}/correos`, { method: 'POST', body: {
        correoId: k.id, titulo: k.titulo, asunto: k.asunto, cuerpo: k.cuerpo, tipo: k.tipo,
        programadoAt: cuando === 'programado' && fecha ? new Date(fecha).toISOString() : null,
      } });
      setK(x => ({ ...x, id: d.id }));
      if (aviso) showToast?.(aviso);
      return d.id;
    } catch (e) { alert(e.message); return null; } finally { setOcupado(false); }
  }
  async function prueba() {
    const id = await guardar(); if (!id) return;
    try { const d = await api(`/api/admin/campanas/correos/${id}/prueba`, { method: 'POST' }); showToast?.(`Prueba enviada a ${d.enviadaA}${d.ejemplo ? ` (con los datos de ${d.ejemplo})` : ''}.`); }
    catch (e) { alert(e.message); }
  }
  async function listo() {
    if (falta.length) return;
    if (cuando === 'programado') {
      if (await guardar(`Programado para el ${fmtFechaHora(new Date(fecha).toISOString())}.`)) onVolver();
      return;
    }
    const id = await guardar(); if (!id) return;
    if (!window.confirm(`¿Enviar este correo ahora?\n\nSaldrán ${llega?.correos ?? '?'} correos, uno cada pocos segundos (unos ${minutos} min). Se puede pausar mientras se envía.`)) return;
    try { const d = await api(`/api/admin/campanas/correos/${id}/lanzar`, { method: 'POST' }); showToast?.(`En marcha: ${d.envios} correos en cola (~${d.minutos} min).`); onVolver(); }
    catch (e) { alert(e.message); }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={onVolver}>← Volver a la campaña</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>{k.id ? nombreCorreo(k, numero) : `Correo ${numero + 1}`}</h2>
      </div>
      <div className="seg-editor">
        <div className="panel" style={{ display: 'grid', gap: 26, margin: 0 }}>
          <Paso n={1} titulo="¿Qué correo es este?" ayuda="Un nombre para vosotros; las familias no lo ven.">
            <input style={campo} placeholder="P. ej. «Anuncio», «Empieza hoy», «Último día»" value={k.titulo} onChange={e => cambia('titulo', e.target.value)} aria-label="Nombre del correo" />
          </Paso>
          <Paso n={2} titulo="¿Qué tipo de correo es?" ayuda="Según el tipo, llega a más o menos gente: se respeta lo que ha dicho cada familia.">
            <div role="radiogroup" aria-label="Tipo de correo" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {TIPOS.map(t => {
                const n = alcance?.porTipo?.[t.id];
                return <Opcion key={t.id} activa={k.tipo === t.id} onClick={() => cambia('tipo', t.id)} titulo={t.nombre}
                  texto={`${t.ejemplo} ${t.quien}`} extra={n ? `→ ${n.correos} correo${n.correos !== 1 ? 's' : ''}` : null} />;
              })}
            </div>
          </Paso>
          <Paso n={3} titulo="Escribe el correo">
            {plantillas.length > 0 && (
              <select style={campo} value="" onChange={e => { const p = plantillas.find(x => x.id === e.target.value); if (p && (!(k.asunto || k.cuerpo) || window.confirm('¿Cambiar lo escrito por la plantilla?'))) setK(x => ({ ...x, asunto: p.asunto, cuerpo: p.cuerpo })); }} aria-label="Plantilla">
                <option value="">— Empezar desde una plantilla (opcional) —</option>
                {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            )}
            <input ref={asuntoRef} style={campo} placeholder="Asunto: lo primero que verán en su bandeja" value={k.asunto}
              onFocus={() => setUltimo('asunto')} onChange={e => cambia('asunto', e.target.value)} aria-label="Asunto" />
            <textarea ref={cuerpoRef} style={{ ...campo, minHeight: 220, resize: 'vertical' }} placeholder={'Hola:\n\nEscribe aquí el mensaje…'} value={k.cuerpo}
              onFocus={() => setUltimo('cuerpo')} onChange={e => cambia('cuerpo', e.target.value)} aria-label="Texto del correo" />
            <Variables vars={VARIABLES} onMeter={meter} />
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Se cuenta quién lo abre y quién pincha sus enlaces (https://… o www.…).
              {k.tipo !== 'servicio' && ' Al pie de cada correo va su enlace para darse de baja.'}
            </span>
          </Paso>
          <Paso n={4} titulo="¿Cuándo sale?">
            <div role="radiogroup" aria-label="Cuándo sale" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Opcion activa={cuando === 'mano'} onClick={() => setCuando('mano')} titulo="Lo envío yo" texto="Sale cuando pulses «Enviar ahora»." />
              <Opcion activa={cuando === 'programado'} onClick={() => setCuando('programado')} titulo="Programarlo" texto="Sale solo el día y a la hora que elijas." />
            </div>
            {cuando === 'programado' && (
              <input type="datetime-local" style={{ ...campo, width: 'auto', justifySelf: 'start' }} value={fecha} min={aLocal(new Date().toISOString())}
                onChange={e => setFecha(e.target.value)} aria-label="Fecha y hora de envío" />
            )}
          </Paso>
        </div>

        <aside className="panel seg-resumen" style={{ margin: 0, display: 'grid', gap: 14 }} aria-live="polite">
          <span style={titulito}>Resumen</span>
          {llega ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{llega.correos}</span>
                <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>correo{llega.correos !== 1 ? 's' : ''}</span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>
                Como {NOMBRE_TIPO[k.tipo].toLowerCase()}, a {segmentos.map(s => `«${s.nombre}»`).join(' y ')}.
                {llega.correos > 0 && ` Tarda unos ${minutos} min en salir todo.`}
                {cuando === 'programado' && fecha && ` Saldrá el ${fmtFechaHora(new Date(fecha).toISOString())}.`}
              </p>
            </div>
          ) : <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>{segmentos.length ? 'Contando…' : 'La campaña aún no tiene a quién ir.'}</p>}
          <div style={{ display: 'grid', gap: 4 }}>
            {[['Tipo', !!k.tipo], ['Asunto', !!k.asunto.trim()], ['Texto', !!k.cuerpo.trim()], ['Cuándo sale', cuando === 'mano' || !!fecha]].map(([t, hecho]) => (
              <span key={t} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: hecho ? 'var(--ink)' : 'var(--ink-3)' }}>
                <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800,
                  background: hecho ? 'var(--teal)' : 'var(--bg-3)', color: hecho ? '#fff' : 'var(--ink-3)', border: hecho ? 0 : '1px solid var(--line)' }}>{hecho ? '✓' : ''}</span>
                {t}
              </span>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={ocupado || falta.length > 0} onClick={listo}>
              {cuando === 'programado' ? 'Programar el envío' : 'Enviar ahora →'}
            </button>
            {falta.length > 0 && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Falta {falta.join(', ')}.</span>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm btn-outline" style={{ flex: 1 }} disabled={ocupado} onClick={prueba} title="Te llega a ti, con los datos de un alumno del segmento">Enviarme una prueba</button>
              <button type="button" className="btn btn-sm btn-outline" style={{ flex: 1 }} disabled={ocupado} onClick={async () => { if (await guardar('Guardado.')) onVolver(); }}>Guardar y volver</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Quién lo recibió, lo abrió y pinchó ──────────────────────────────────────
const FILTROS = [['todos', 'Todos'], ['abrieron', 'Lo abrieron'], ['noAbrieron', 'No lo abrieron'], ['clic', 'Pincharon'], ['rebote', 'Rebotaron'], ['baja', 'Se dieron de baja']];
function Resultados({ campana, correo, numero, onVolver, onAbrirFicha, showToast }) {
  const [k, setK] = useState(correo);
  const [envios, setEnvios] = useState(null);
  const [filtro, setFiltro] = useState('todos');
  const cargar = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([api(`/api/admin/campanas/${campana.id}`), api(`/api/admin/campanas/correos/${correo.id}/envios`)]);
      const nuevo = d.campana.correos.find(x => x.id === correo.id); if (nuevo) setK(nuevo);
      setEnvios(e.envios);
    } catch { /* noop */ }
  }, [campana.id, correo.id]);
  useEffect(() => { cargar(); }, [cargar]);
  useEnVivo(cargar, { cada: 5000, activo: k.estado === 'enviando' });
  const kc = k.cuentas;
  const lista = useMemo(() => (envios || []).filter(e => ({
    todos: true, abrieron: e.aperturas > 0, noAbrieron: e.estado === 'enviado' && !e.aperturas, clic: e.clics > 0,
    rebote: e.estado === 'rebotado', baja: !!e.bajaAt,
  })[filtro]), [envios, filtro]);
  async function accion(a) {
    try { await api(`/api/admin/campanas/correos/${k.id}/${a}`, { method: 'POST' }); showToast?.(a === 'pausar' ? 'Correo en pausa.' : 'Correo reanudado.'); cargar(); }
    catch (e) { alert(e.message); }
  }
  const [txt, color] = estadoCorreo(k);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={onVolver}>← {campana.nombre}</button>
          <h2 style={{ margin: 0, fontSize: 18 }}>{nombreCorreo(k, numero)}</h2>
          <span style={{ fontSize: 12, fontWeight: 800, color }}>{txt}</span>
          <div style={{ flex: 1 }} />
          {k.estado === 'enviando' && <button type="button" className="btn btn-sm btn-outline" onClick={() => accion('pausar')}>Pausar</button>}
          {k.estado === 'pausado' && <button type="button" className="btn btn-sm btn-primary" onClick={() => accion('reanudar')}>Reanudar</button>}
        </div>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{NOMBRE_TIPO[k.tipo]} · «{k.asunto}»</span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Cifra v={`${kc.enviados}/${kc.total}`} t="enviados" />
          <Cifra v={kc.abiertos} t={`lo abrieron${kc.enviados ? ` (${Math.round(100 * kc.abiertos / kc.enviados)} %)` : ''}`} />
          <Cifra v={kc.conClic} t="pincharon un enlace" />
          <Cifra v={kc.rebotados} t="rebotaron" />
          <Cifra v={kc.bajas} t="se dieron de baja" />
          {kc.errores + kc.omitidos > 0 && <Cifra v={kc.errores + kc.omitidos} t="no se enviaron" />}
        </div>
        {kc.total > 0 && k.estado !== 'enviado' && <Barra hecho={kc.total - kc.pendientes} total={kc.total} />}
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Ver el correo</summary>
          <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', background: 'var(--bg-3)', borderRadius: 10, padding: 12, fontSize: 13 }}><b>{k.asunto}</b>{'\n\n'}{k.cuerpo}</div>
        </details>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Las aperturas son aproximadas: algunos programas de correo no cargan las imágenes y otros las cargan solos.</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTROS.map(([id, t]) => <button key={id} type="button" className={`filter-pill ${filtro === id ? 'is-active' : ''}`} onClick={() => setFiltro(id)}>{t}</button>)}
      </div>
      <div className="data-table">
        <div className="data-table-head" style={{ gridTemplateColumns: '1.2fr 1.6fr 110px 1.1fr 70px 1.2fr' }}>
          <span>Alumno</span><span>A quién</span><span>Estado</span><span>Lo abrió</span><span>Clics</span><span>Baja o motivo</span>
        </div>
        {lista.map(e => (
          <div key={e.id} className="data-table-row" style={{ gridTemplateColumns: '1.2fr 1.6fr 110px 1.1fr 70px 1.2fr', alignItems: 'center' }}>
            {e.alumnoId
              ? <button type="button" onClick={() => onAbrirFicha?.({ id: e.alumnoId })} style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>{e.alumno}</button>
              : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Contacto web</span>}
            <span style={{ fontSize: 12 }}>{e.destinatario || '—'} <span style={{ color: 'var(--ink-3)' }}>· {e.email}</span></span>
            <span style={{ fontSize: 12, fontWeight: 700, color: e.estado === 'enviado' ? 'var(--teal)' : e.estado === 'pendiente' ? 'var(--ink-3)' : 'var(--orange)' }}>
              {{ enviado: '✓ enviado', pendiente: 'esperando', error: '✗ no salió', omitido: 'no se envió', rebotado: '↩ rebotó' }[e.estado] || e.estado}
            </span>
            <span style={{ fontSize: 12 }}>{e.abiertoAt ? <>{fmtFechaHora(e.abiertoAt)}{e.aperturas > 1 && <span style={{ color: 'var(--ink-3)' }}> · {e.aperturas} veces</span>}</> : <span style={{ color: 'var(--ink-3)' }}>—</span>}</span>
            <span style={{ fontSize: 13, fontWeight: e.clics ? 800 : 400 }}>{e.clics || '—'}</span>
            <span style={{ fontSize: 12, color: 'var(--orange)' }}>{e.bajaAt ? `se dio de baja ${fmtFechaHora(e.bajaAt)}` : e.error || ''}</span>
          </div>
        ))}
        {envios && !lista.length && <div className="data-table-row" style={{ gridTemplateColumns: '1fr' }}><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Nadie con ese filtro.</span></div>}
      </div>
    </div>
  );
}

// ── Correos que rebotan ──────────────────────────────────────────────────────
function Rebotes({ onAbrirFicha, showToast }) {
  const [d, setD] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const cargar = useCallback(() => api('/api/admin/rebotes').then(setD).catch(() => {}), []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!d) return null;
  async function arreglado(b) {
    if (!window.confirm(`¿Marcar ${b.email} como arreglado? Volverá a recibir los correos.`)) return;
    try { await api(`/api/admin/rebotes/${b.id}/resolver`, { method: 'POST' }); showToast?.('Marcado como arreglado.'); cargar(); } catch (e) { alert(e.message); }
  }
  return (
    <div className="panel" style={{ display: 'grid', gap: 10 }}>
      <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
        style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--ink)' }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>↩ Correos que rebotan</h2>
        <Pildora texto={d.rebotes.length} color={d.rebotes.length ? 'var(--orange)' : 'var(--teal)'} />
        <div style={{ flex: 1 }} />
        <I.Chevron style={{ transform: abierto ? 'none' : 'rotate(-90deg)' }} />
      </button>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        Correos que no llegan (dirección que no existe, buzón lleno…). No se les envía nada hasta que se cambie el correo en su ficha o se marque aquí como arreglado.
        {d.revisadoAt && ` Buzón revisado: ${fmtFechaHora(d.revisadoAt)}.`}
      </span>
      {d.error && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>No se ha podido leer el buzón para detectar rebotes: {d.error}. Revisa que IMAP esté activado en info@.</span>}
      {abierto && (d.rebotes.length ? (
        <div className="data-table">
          <div className="data-table-head" style={{ gridTemplateColumns: '1.5fr 1.3fr 80px 1.6fr 120px 130px' }}>
            <span>Correo</span><span>De quién</span><span>Tipo</span><span>Motivo</span><span>Desde</span><span />
          </div>
          {d.rebotes.map(b => (
            <div key={b.id} className="data-table-row" style={{ gridTemplateColumns: '1.5fr 1.3fr 80px 1.6fr 120px 130px', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, wordBreak: 'break-all' }}>{b.email}</span>
              <span style={{ fontSize: 12 }}>
                {b.personas.length ? b.personas.map(p => (
                  <button key={p.id} type="button" onClick={() => onAbrirFicha?.({ id: p.id })} style={{ display: 'block', background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>{p.nombre}</button>
                )) : <span style={{ color: 'var(--ink-3)' }}>Nadie lo tiene ya en su ficha</span>}
              </span>
              <Pildora texto={b.tipo === 'duro' ? 'Duro' : 'Suave'} color={b.tipo === 'duro' ? 'var(--orange)' : 'var(--ink-2)'} />
              <span style={{ fontSize: 12 }} title={b.detalle || ''}>{b.motivo}{b.codigo ? <span style={{ color: 'var(--ink-3)' }}> · {b.codigo}</span> : null}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtFechaHora(b.detectadoAt)}</span>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => arreglado(b)}>Ya está arreglado</button>
            </div>
          ))}
        </div>
      ) : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Ningún correo rebota ahora mismo.</span>)}
    </div>
  );
}

export default function AdminCampanas({ showToast, onAbrirFicha, nuevaConSegmento, onEmpezada, onIrASegmentos }) {
  const [lista, setLista] = useState(null);
  const [segmentos, setSegmentos] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [vista, setVista] = useState(null); // { que: 'campana' | 'correo' | 'resultados', ... }
  const cargar = useCallback(() => api('/api/admin/campanas').then(d => setLista(d.campanas)).catch(() => setLista([])), []);
  useEffect(() => {
    cargar();
    api('/api/admin/segmentos').then(d => setSegmentos(d.segmentos || [])).catch(() => {});
    api('/api/admin/comunicaciones/plantillas').then(d => setPlantillas(d.plantillas || [])).catch(() => {});
  }, [cargar]);
  useEnVivo(cargar, { cada: 8000, activo: !vista && (lista || []).some(c => c.estado === 'enviando') });
  // Desde un segmento, «Usar en una campaña»: se abre una nueva con él puesto.
  useEffect(() => {
    if (!nuevaConSegmento) return;
    api('/api/admin/segmentos').then(d => {
      const todos = d.segmentos || []; setSegmentos(todos);
      const s = todos.find(x => x.nombre === nuevaConSegmento);
      setVista({ que: 'campana', clave: Date.now(), campana: { id: null, nombre: '', segmentos: s ? [{ nombre: s.nombre, filtros: s.filtros }] : [], correos: [] } });
    }).catch(() => {});
    onEmpezada?.();
  }, [nuevaConSegmento, onEmpezada]);

  const abrirCampana = (c) => setVista({ que: 'campana', campana: c, clave: Date.now() });
  const volverALista = () => { setVista(null); cargar(); };
  const volverACampana = async (id) => {
    try { const d = await api(`/api/admin/campanas/${id}`); abrirCampana(d.campana); } catch { volverALista(); }
  };
  if (vista?.que === 'campana') {
    return <Campana key={vista.clave} inicial={vista.campana} segmentosGuardados={segmentos} showToast={showToast} onIrASegmentos={onIrASegmentos}
      onVolver={volverALista}
      onEditarCorreo={(x) => setVista({ que: 'correo', ...x })}
      onVerCorreo={(x) => setVista({ que: 'resultados', ...x })} />;
  }
  if (vista?.que === 'correo') {
    return <EditorCorreo campanaId={vista.campanaId} segmentos={vista.segmentos} correo={vista.correo} numero={vista.numero} plantillas={plantillas}
      showToast={showToast} onVolver={() => volverACampana(vista.campanaId)} />;
  }
  if (vista?.que === 'resultados') {
    return <Resultados campana={vista.campana} correo={vista.correo} numero={vista.numero} onAbrirFicha={onAbrirFicha} showToast={showToast}
      onVolver={() => volverACampana(vista.campana.id)} />;
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="panel">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}><I.Mail /> Campañas</h2>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm btn-primary" onClick={() => abrirCampana({ id: null, nombre: '', segmentos: [], correos: [] })}><I.Plus /> Nueva campaña</button>
        </div>
        <p className="sub" style={{ marginBottom: 0 }}>
          Una campaña, como «Navidad 2026», va a uno o varios segmentos y puede tener varios correos: para anunciarla, cuando
          empieza, cuando termina… Cada uno sale cuando lo envías o a la hora que le programes, y aquí ves quién lo abrió y quién pinchó sus enlaces.
        </p>
      </div>
      {lista && !lista.length && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>Todavía no hay campañas. Pulsa <b>Nueva campaña</b> para preparar la primera.</div>
      )}
      {(lista || []).map(c => {
        const [est, col] = ESTADO_CAMPANA[c.estado] || ESTADO_CAMPANA.borrador;
        const k = c.cuentas;
        return (
          <button key={c.id} type="button" onClick={() => abrirCampana(c)}
            style={{ textAlign: 'left', display: 'grid', gap: 6, padding: '12px 14px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--bg-2)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 15 }}>{c.nombre}</b>
              <Pildora texto={est} color={col} />
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtFechaHora(c.creadaAt)}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              A {c.segmentos.length ? c.segmentos.map(s => `«${s.nombre}»`).join(', ') : '(sin elegir)'} · {c.correos.length} correo{c.correos.length !== 1 ? 's' : ''}
              {c.proximo ? ` · próximo envío: ${fmtFechaHora(c.proximo)}` : ''}
            </span>
            {k.enviados > 0 && <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{k.enviados} enviados · {k.abiertos} abiertos · {k.conClic} con clic{k.rebotados ? ` · ${k.rebotados} rebotaron` : ''}{k.bajas ? ` · ${k.bajas} bajas` : ''}</span>}
          </button>
        );
      })}
      <Rebotes onAbrirFicha={onAbrirFicha} showToast={showToast} />
    </div>
  );
}
