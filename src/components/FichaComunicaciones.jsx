import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';
import { fmtFechaHora } from '../fechas.js';

// ─────────────────────────────────────────────────────────────────────────────
// CRM en la ficha (tickets #310 y #311): escribir un correo al alumno o a su
// familia con plantillas que se rellenan solas, y el historial de todo lo que se
// les ha enviado. Sale desde el buzón del club (queda en sus «Enviados» de Gmail
// y las respuestas llegan allí). Respeta los permisos de la ficha: «de servicio»
// siempre; «de sus actividades» si no lo ha rechazado; «comercial» solo a quien
// lo acepta.
// ─────────────────────────────────────────────────────────────────────────────

const TIPOS = [
  ['servicio', 'De servicio', 'Pagos, avisos necesarios… Se puede enviar siempre.'],
  ['actividades', 'De sus actividades', 'Información de sus clases. No si lo ha rechazado.'],
  ['comercial', 'Comercial', 'Novedades y ofertas. Solo a quien lo acepta.'],
];
const NOMBRE_TIPO = Object.fromEntries(TIPOS.map(([k, n]) => [k, n]));
const VARIABLES = ['{nombre}', '{alumno}', '{clases}', '{pendiente}', '{mes}'];
const rellenar = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => (v?.[k] !== undefined ? v[k] : m));
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%' };

function Seccion({ titulo, extra, children }) {
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)' }}>{titulo}</span>
        <div style={{ flex: 1 }} />
        {extra}
      </div>
      {children}
    </div>
  );
}

// Editor de plantillas: nombre, tipo, asunto y texto de cada una.
function EditorPlantillas({ plantillas, onGuardar, onCerrar }) {
  const [lista, setLista] = useState(plantillas.map(p => ({ ...p })));
  const cambia = (i, k, v) => setLista(l => l.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  return (
    <div style={{ display: 'grid', gap: 10, background: 'var(--bg-3)', borderRadius: 12, padding: 12 }}>
      <b style={{ fontSize: 13 }}>Plantillas</b>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Se rellenan solas: {VARIABLES.join(' ')}</span>
      {lista.map((p, i) => (
        <div key={p.id || i} style={{ display: 'grid', gap: 6, border: '1px solid var(--line)', borderRadius: 10, padding: 10, background: 'var(--bg-2)' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input style={{ ...campo, flex: '1 1 200px', width: 'auto' }} value={p.nombre} placeholder="Nombre de la plantilla" onChange={e => cambia(i, 'nombre', e.target.value)} />
            <select style={{ ...campo, width: 'auto' }} value={p.tipo} onChange={e => cambia(i, 'tipo', e.target.value)}>
              {TIPOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
            <button type="button" className="icon-btn danger" aria-label="Borrar plantilla" onClick={() => setLista(l => l.filter((_, j) => j !== i))}><I.Trash /></button>
          </div>
          <input style={campo} value={p.asunto} placeholder="Asunto" onChange={e => cambia(i, 'asunto', e.target.value)} />
          <textarea style={{ ...campo, minHeight: 110, resize: 'vertical' }} value={p.cuerpo} placeholder="Texto" onChange={e => cambia(i, 'cuerpo', e.target.value)} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setLista(l => [...l, { id: '', nombre: 'Nueva plantilla', tipo: 'servicio', asunto: '', cuerpo: 'Hola,\n\n\n\nUn saludo,\nAIM Education' }])}>
          <I.Plus /> Añadir plantilla
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => onGuardar(lista)}>Guardar plantillas</button>
      </div>
    </div>
  );
}

export default function FichaComunicaciones({ personaId, showToast }) {
  const [ctx, setCtx] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [tipo, setTipo] = useState('servicio');
  const [para, setPara] = useState({});
  const [plantilla, setPlantilla] = useState('');
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [vista, setVista] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [abiertoId, setAbiertoId] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const [c, h, p] = await Promise.all([
        fetch(`/api/admin/comunicaciones/${personaId}/contexto`, { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : null)),
        fetch(`/api/admin/comunicaciones/${personaId}`, { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : { comunicaciones: [] })),
        fetch('/api/admin/comunicaciones/plantillas', { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : { plantillas: [] })),
      ]);
      setCtx(c); setHistorial(h.comunicaciones || []); setPlantillas(p.plantillas || []);
      // Por defecto, a los tutores con correo; si no tiene, al propio alumno.
      if (c) {
        const tutores = c.destinatarios.filter(d => d.email && d.relacion !== 'Alumno/a');
        const elegidos = tutores.length ? tutores : c.destinatarios.filter(d => d.email);
        setPara(Object.fromEntries(elegidos.map(d => [d.email, true])));
      }
    } catch { /* noop */ }
  }, [personaId]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!ctx) return null;

  const puede = (d) => !!d.email && !(tipo === 'comercial' && d.comerciales !== true);
  const elegidos = ctx.destinatarios.filter(d => para[d.email] && puede(d));
  const bloqueoActividades = tipo === 'actividades' && ctx.actividadesRechazadas;
  const sinCorreo = ctx.destinatarios.every(d => !d.email);

  function usarPlantilla(id) {
    setPlantilla(id);
    const p = plantillas.find(x => x.id === id);
    if (!p) return;
    setAsunto(p.asunto); setCuerpo(p.cuerpo); setTipo(p.tipo || 'servicio');
  }

  async function enviar() {
    if (!elegidos.length) return alert('Elige al menos un destinatario.');
    if (!asunto.trim() || !cuerpo.trim()) return alert('Falta el asunto o el texto.');
    if (!window.confirm(`¿Enviar «${rellenar(asunto, ctx.variables)}» a ${elegidos.map(d => d.nombre).join(', ')}?`)) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/admin/comunicaciones/${personaId}/enviar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ destinatarios: elegidos.map(d => d.email), asunto, cuerpo, plantilla: plantillas.find(p => p.id === plantilla)?.nombre || null, tipo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d.error || 'No se ha podido enviar.'); await cargar(); return; }
      showToast?.(`Correo enviado a ${d.enviadoA.join(', ')}${d.omitidos?.length ? ` (sin enviar a ${d.omitidos.join(', ')}: no acepta comerciales)` : ''}.`);
      setAbierto(false); setAsunto(''); setCuerpo(''); setPlantilla(''); setVista(false);
      await cargar();
    } catch { alert('No hay conexión con el servidor.'); }
    finally { setEnviando(false); }
  }

  async function guardarPlantillas(lista) {
    const r = await fetch('/api/admin/comunicaciones/plantillas', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ plantillas: lista }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return alert(d.error || 'No se han podido guardar.');
    setPlantillas(d.plantillas); setEditando(false); showToast?.('Plantillas guardadas.');
  }

  const pill = (activo) => ({
    padding: '6px 12px', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', border: 0,
    background: activo ? 'var(--purple)' : 'transparent', color: activo ? '#fff' : 'var(--ink-2)',
  });
  const permiso = (v) => (v === true ? ['acepta', 'var(--teal)'] : v === false ? ['no acepta', 'var(--orange)'] : ['no consta', 'var(--ink-3)']);

  return (
    <Seccion titulo={`Comunicaciones${historial.length ? ` (${historial.length})` : ''}`}
      extra={!abierto && (
        <button type="button" className="btn btn-sm btn-primary" disabled={sinCorreo || !ctx.correoActivo}
          title={sinCorreo ? 'Ni el alumno ni sus tutores tienen correo' : !ctx.correoActivo ? 'El correo no está configurado en el servidor' : ''}
          onClick={() => setAbierto(true)}>
          <I.Mail /> Escribir correo
        </button>
      )}>
      {sinCorreo && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--ink-3)' }}>Ni el alumno ni sus tutores tienen correo: habrá que llamar.</p>}

      {abierto && (
        <div style={{ display: 'grid', gap: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14 }}>Nuevo correo</b>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Sale desde {ctx.remitente || 'el correo del club'}; las respuestas llegan allí.</span>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Tipo de correo</span>
            <div style={{ display: 'inline-flex', justifySelf: 'start', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden', background: 'var(--bg-3)' }}>
              {TIPOS.map(([k, n]) => <button key={k} type="button" style={pill(tipo === k)} onClick={() => setTipo(k)}>{n}</button>)}
            </div>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{TIPOS.find(t => t[0] === tipo)[2]}</span>
            {bloqueoActividades && (
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>
                Ha pedido no recibir comunicaciones de sus actividades. Si es algo necesario (un pago, un cambio importante), envíalo como «De servicio».
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Para</span>
            {ctx.destinatarios.map(d => {
              const [txt, col] = permiso(d.comerciales);
              const ok = puede(d);
              return (
                <label key={d.personaId} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, opacity: ok ? 1 : 0.55, flexWrap: 'wrap' }}>
                  <input type="checkbox" disabled={!ok} checked={!!para[d.email] && ok} onChange={e => setPara(p => ({ ...p, [d.email]: e.target.checked }))} />
                  <b>{d.nombre}</b>
                  <span style={{ color: 'var(--ink-3)' }}>· {d.relacion} · {d.email || 'sin correo'}</span>
                  {tipo === 'comercial' && d.email && <span style={{ fontSize: 11, fontWeight: 700, color: col }}>comerciales: {txt}</span>}
                </label>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select style={{ ...campo, width: 'auto', flex: '1 1 220px' }} value={plantilla} onChange={e => usarPlantilla(e.target.value)}>
              <option value="">— Empezar desde una plantilla —</option>
              {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre} ({NOMBRE_TIPO[p.tipo] || 'De servicio'})</option>)}
            </select>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditando(e => !e)}>{editando ? 'Cerrar plantillas' : 'Gestionar plantillas'}</button>
          </div>
          {editando && <EditorPlantillas plantillas={plantillas} onGuardar={guardarPlantillas} onCerrar={() => setEditando(false)} />}

          <input style={campo} value={asunto} onChange={e => setAsunto(e.target.value)} placeholder="Asunto" aria-label="Asunto" />
          <textarea style={{ ...campo, minHeight: 170, resize: 'vertical' }} value={cuerpo} onChange={e => setCuerpo(e.target.value)} placeholder="Escribe el correo…" aria-label="Texto del correo" />
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            Se rellenan solas: {VARIABLES.map(v => <code key={v} style={{ marginRight: 6 }}>{v}</code>)}
            (ahora: {ctx.variables.nombre} · {ctx.variables.clases} · pendiente {ctx.variables.pendiente})
          </span>

          {vista && (
            <div style={{ border: '1px dashed var(--line)', borderRadius: 10, padding: 12, background: 'var(--bg-3)', fontSize: 14, whiteSpace: 'pre-wrap' }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{rellenar(asunto, ctx.variables) || '(sin asunto)'}</div>
              {rellenar(cuerpo, ctx.variables)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setVista(v => !v)}>{vista ? 'Ocultar vista previa' : 'Vista previa'}</button>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm btn-outline" onClick={() => { setAbierto(false); setVista(false); }}>Cancelar</button>
            <button type="button" className="btn btn-sm btn-primary" disabled={enviando || !elegidos.length || bloqueoActividades} onClick={enviar}>
              {enviando ? 'Enviando…' : `Enviar${elegidos.length ? ` a ${elegidos.length}` : ''}`}
            </button>
          </div>
        </div>
      )}

      {!historial.length && !abierto && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Todavía no se le ha escrito desde aquí.</p>}
      <div style={{ display: 'grid', gap: 6 }}>
        {historial.map(c => (
          <div key={c.id} style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg-2)', overflow: 'hidden' }}>
            <button type="button" onClick={() => setAbiertoId(a => (a === c.id ? null : c.id))}
              style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', minWidth: 110 }}>{fmtFechaHora(c.fecha)}</span>
              <span style={{ fontWeight: 700, fontSize: 13, flex: '1 1 200px', minWidth: 0 }}>{c.asunto}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)' }}>{NOMBRE_TIPO[c.tipo] || c.tipo}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: c.estado === 'enviado' ? 'var(--teal)' : c.estado === 'omitido' ? 'var(--ink-3)' : 'var(--orange)' }}>
                {{ enviado: '✓ enviado', omitido: 'no enviado', error: '✗ error' }[c.estado] || c.estado}
              </span>
            </button>
            {abiertoId === c.id && (
              <div style={{ padding: '0 12px 12px', display: 'grid', gap: 6, fontSize: 12, color: 'var(--ink-2)' }}>
                <span>Para: {c.destinatarios.join(', ')}{c.quien ? ` · lo envió ${c.quien}` : ''}{c.plantilla && !c.plantilla.startsWith('auto:') ? ` · plantilla «${c.plantilla}»` : ''}</span>
                {c.desdeOtraFicha && <span>Enviado desde la ficha de {c.desdeOtraFicha}.</span>}
                {c.plantilla?.startsWith('auto:') && <span>Automático.</span>}
                {c.error && <span style={{ color: 'var(--orange)' }}>{c.estado === 'omitido' ? 'No se envió: ' : 'Error: '}{c.error}</span>}
                <div style={{ whiteSpace: 'pre-wrap', background: 'var(--bg-3)', borderRadius: 8, padding: 10, fontSize: 13, color: 'var(--ink)' }}>{c.cuerpo}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Seccion>
  );
}
