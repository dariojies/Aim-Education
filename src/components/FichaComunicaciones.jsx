import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { fmtFechaHora } from '../fechas.js';
import EditorDiseno, { ElegirPlantilla, Miniatura, VistaPrevia, useMarca } from './EditorDiseno.jsx';
import { VARIABLES_CRM } from '../../correo-diseno.js';

// ─────────────────────────────────────────────────────────────────────────────
// CRM en la ficha (tickets #310 y #311): escribir un correo al alumno o a su
// familia con plantillas que se rellenan solas, y el historial de todo lo que ha
// pasado con ellos (#341): lo enviado desde aquí, las campañas (si las abrieron),
// lo que escribieron en la web o al correo del club y los permisos que dieron. Sale desde el buzón del club (queda en sus «Enviados» de Gmail
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

// ── El historial, todo junto ─────────────────────────────────────────────────
const FILTROS_HISTORIA = [['todo', 'Todo'], ['correo', 'Correos'], ['campana', 'Campañas'], ['web', 'Web'], ['permiso', 'Permisos']];
const ETIQUETA = {
  correo: ['Correo', 'var(--purple)'], buzon: ['Correo', 'var(--purple)'], campana: ['Campaña', 'var(--blue, #1e6fd9)'],
  web: ['Web', 'var(--teal)'], visita: ['Visita', 'var(--teal)'], red: ['Redes', '#1FA855'], permiso: ['Permiso', 'var(--ink-2)'], rebote: ['Rebote', 'var(--orange)'],
};
const enFiltro = (f, t) => f === 'todo' || f === t || (f === 'correo' && (t === 'buzon' || t === 'rebote' || t === 'red')) || (f === 'web' && t === 'visita');
function estadoDe(x) {
  if (x.tipo === 'correo') return [{ enviado: '✓ enviado', omitido: 'no enviado', error: '✗ error' }[x.estado] || x.estado, x.estado === 'enviado' ? 'var(--teal)' : x.estado === 'omitido' ? 'var(--ink-3)' : 'var(--orange)'];
  if (x.tipo === 'campana') {
    if (x.estado === 'rebotado') return ['↩ rebotó', 'var(--orange)'];
    if (x.estado !== 'enviado') return [x.estado === 'omitido' ? 'no enviado' : '✗ no salió', 'var(--ink-3)'];
    if (x.baja) return ['se dio de baja', 'var(--orange)'];
    if (x.clics) return ['✓ pinchó', 'var(--teal)'];
    if (x.abierto) return ['✓ lo abrió', 'var(--teal)'];
    return ['no lo abrió', 'var(--ink-3)'];
  }
  if (x.tipo === 'web') return [x.estado === 'atendido' ? '✓ atendida' : 'sin atender', x.estado === 'atendido' ? 'var(--teal)' : 'var(--orange)'];
  if (x.tipo === 'permiso') return [x.otorgado ? '✓ sí' : '✗ no', x.otorgado ? 'var(--teal)' : 'var(--orange)'];
  if (x.tipo === 'rebote') return [x.resuelto ? '✓ arreglado' : 'sin arreglar', x.resuelto ? 'var(--teal)' : 'var(--orange)'];
  if (x.tipo === 'visita' || x.tipo === 'red') return ['', 'var(--ink-3)'];
  if (x.tipo === 'buzon') return [x.entrante ? '↙ nos escribió' : '↗ le escribimos', x.entrante ? 'var(--teal)' : 'var(--ink-2)'];
  return ['', 'var(--ink-3)'];
}

function Historial({ comunicaciones, eventos, buzon }) {
  const [filtro, setFiltro] = useState('todo');
  const [abiertoId, setAbiertoId] = useState(null);
  const [todos, setTodos] = useState(false);
  const items = useMemo(() => {
    const enviados = [
      ...comunicaciones.map(c => ({ ...c, id: `m${c.id}`, tipo: 'correo', tipoCorreo: c.tipo, titulo: c.asunto, de: `Para ${c.destinatarios.join(', ')}` })),
      ...eventos,
    ];
    // Lo que salió desde la ficha o en una campaña también está en «Enviados»
    // de Gmail: ese no se repite.
    const yaSalio = (f) => enviados.some(x => (x.tipo === 'correo' || x.tipo === 'campana') && Math.abs(new Date(x.fecha) - new Date(f)) < 5 * 60_000);
    const correos = (buzon?.correos || []).filter(m => m.entrante || !yaSalio(m.fecha)).map(m => ({
      id: `b${m.uid}`, tipo: 'buzon', fecha: m.fecha, titulo: m.asunto, entrante: m.entrante,
      de: m.entrante ? `De ${m.de?.nombre || m.de?.email}` : `Para ${m.para.map(x => x.nombre || x.email).join(', ')}`,
    }));
    return [...enviados, ...correos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [comunicaciones, eventos, buzon]);
  const lista = items.filter(x => enFiltro(filtro, x.tipo));
  const vistos = todos ? lista : lista.slice(0, 12);
  const pill = (activo) => ({ padding: '4px 11px', fontSize: 12, fontWeight: 700, border: 0, borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', background: activo ? 'var(--purple)' : 'transparent', color: activo ? '#fff' : 'var(--ink-2)' });
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--bg-3)', padding: 2 }}>
          {FILTROS_HISTORIA.map(([k, n]) => {
            const cuantos = items.filter(x => enFiltro(k, x.tipo)).length;
            return <button key={k} type="button" style={pill(filtro === k)} onClick={() => { setFiltro(k); setTodos(false); }}>{n}{k !== 'todo' && cuantos ? ` · ${cuantos}` : ''}</button>;
          })}
        </div>
        {buzon === null && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Mirando el correo del club…</span>}
        {buzon && !buzon.disponible && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{buzon.error || 'El correo del club no está conectado: no salen los correos que nos escribieron.'}</span>}
      </div>
      {!lista.length && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>{filtro === 'todo' ? 'Todavía no hay nada con esta familia.' : 'Nada de este tipo.'}</p>}
      {vistos.map(x => {
        const [etq, colEtq] = ETIQUETA[x.tipo] || ['', 'var(--ink-3)'];
        const [est, colEst] = estadoDe(x);
        const abre = x.tipo === 'correo' || x.tipo === 'campana' || x.tipo === 'web';
        return (
          <div key={x.id} style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg-2)', overflow: 'hidden' }}>
            <button type="button" disabled={!abre} onClick={() => setAbiertoId(a => (a === x.id ? null : x.id))}
              style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', cursor: abre ? 'pointer' : 'default', fontFamily: 'inherit', color: 'var(--ink)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', minWidth: 110 }}>{fmtFechaHora(x.fecha)}</span>
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: colEtq, minWidth: 62 }}>{etq}</span>
              <span style={{ flex: '1 1 200px', minWidth: 0, display: 'grid' }}>
                <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.titulo}</span>
                {x.de && <span style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.de}</span>}
              </span>
              {x.tipo === 'correo' && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)' }}>{NOMBRE_TIPO[x.tipoCorreo] || ''}</span>}
              <span style={{ fontSize: 11, fontWeight: 800, color: colEst }}>{est}</span>
            </button>
            {abiertoId === x.id && x.tipo === 'correo' && (
              <div style={{ padding: '0 12px 12px', display: 'grid', gap: 6, fontSize: 12, color: 'var(--ink-2)' }}>
                <span>Para: {x.destinatarios.join(', ')}{x.quien ? ` · lo envió ${x.quien}` : ''}{x.plantilla && !x.plantilla.startsWith('auto:') ? ` · plantilla «${x.plantilla}»` : ''}</span>
                {x.desdeOtraFicha && <span>Enviado desde la ficha de {x.desdeOtraFicha}.</span>}
                {x.plantilla?.startsWith('auto:') && <span>Automático.</span>}
                {x.error && <span style={{ color: 'var(--orange)' }}>{x.estado === 'omitido' ? 'No se envió: ' : 'Error: '}{x.error}</span>}
                <div style={{ whiteSpace: 'pre-wrap', background: 'var(--bg-3)', borderRadius: 8, padding: 10, fontSize: 13, color: 'var(--ink)' }}>{x.cuerpo}</div>
              </div>
            )}
            {abiertoId === x.id && x.tipo === 'campana' && (
              <div style={{ padding: '0 12px 12px', display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
                <span>A {x.email}</span>
                <span>{x.abierto ? `Lo abrió el ${fmtFechaHora(x.abierto)}${x.aperturas > 1 ? ` (${x.aperturas} veces)` : ''}.` : 'No consta que lo abriera (algunos programas no lo avisan).'}</span>
                {x.clics > 0 && <span>Pinchó un enlace el {fmtFechaHora(x.clic)}{x.clics > 1 ? ` (${x.clics} clics)` : ''}.</span>}
                {x.baja && <span style={{ color: 'var(--orange)' }}>Se dio de baja de la publicidad el {fmtFechaHora(x.baja)}.</span>}
                {x.error && <span style={{ color: 'var(--orange)' }}>{x.error}</span>}
              </div>
            )}
            {abiertoId === x.id && x.tipo === 'web' && (
              <div style={{ padding: '0 12px 12px', display: 'grid', gap: 6, fontSize: 12, color: 'var(--ink-2)' }}>
                <div style={{ whiteSpace: 'pre-wrap', background: 'var(--bg-3)', borderRadius: 8, padding: 10, fontSize: 13, color: 'var(--ink)' }}>{x.mensaje}</div>
                {x.notas && <span>Notas: {x.notas}</span>}
              </div>
            )}
          </div>
        );
      })}
      {lista.length > 12 && <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={() => setTodos(t => !t)}>{todos ? 'Ver menos' : `Ver los ${lista.length - 12} anteriores`}</button>}
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
  const [rebotes, setRebotes] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [buzon, setBuzon] = useState(null);
  // Con diseño (#326): el correo lleva imágenes, botones y colores.
  const [diseno, setDiseno] = useState(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [disenando, setDisenando] = useState(false);
  const marca = useMarca();

  const cargar = useCallback(async () => {
    try {
      const [c, h, p] = await Promise.all([
        fetch(`/api/admin/comunicaciones/${personaId}/contexto`, { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : null)),
        fetch(`/api/admin/comunicaciones/${personaId}`, { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : { comunicaciones: [] })),
        fetch('/api/admin/comunicaciones/plantillas', { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : { plantillas: [] })),
      ]);
      setCtx(c); setHistorial(h.comunicaciones || []); setPlantillas(p.plantillas || []);
      fetch(`/api/admin/rebotes/persona/${personaId}`, { credentials: 'include', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { rebotes: [] })).then(d => setRebotes(d.rebotes || [])).catch(() => {});
      fetch(`/api/admin/comunicaciones/${personaId}/historia`, { credentials: 'include', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { eventos: [] })).then(d => setEventos(d.eventos || [])).catch(() => {});
      fetch(`/api/admin/comunicaciones/${personaId}/buzon`, { credentials: 'include', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { disponible: false, correos: [] })).then(setBuzon).catch(() => setBuzon({ disponible: false, correos: [] }));
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
  // En el diseñador, los datos de ejemplo son los de esta persona.
  const varsDiseno = Object.fromEntries(Object.entries(VARIABLES_CRM).map(([k, v]) => [k, { ...v, ejemplo: ctx.variables[k] ?? v.ejemplo }]));

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
    if (!asunto.trim() || (!diseno && !cuerpo.trim())) return alert('Falta el asunto o el texto.');
    if (!window.confirm(`¿Enviar «${rellenar(asunto, ctx.variables)}» a ${elegidos.map(d => d.nombre).join(', ')}?`)) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/admin/comunicaciones/${personaId}/enviar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ destinatarios: elegidos.map(d => d.email), asunto, cuerpo, diseno, plantilla: plantillas.find(p => p.id === plantilla)?.nombre || null, tipo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d.error || 'No se ha podido enviar.'); await cargar(); return; }
      showToast?.(`Correo enviado a ${d.enviadoA.join(', ')}${d.omitidos?.length ? ` (sin enviar a ${d.omitidos.join(', ')}: no acepta comerciales)` : ''}.`);
      setAbierto(false); setAsunto(''); setCuerpo(''); setPlantilla(''); setVista(false); setDiseno(null);
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
    <Seccion titulo="Comunicaciones e historial"
      extra={!abierto && (
        <button type="button" className="btn btn-sm btn-primary" disabled={sinCorreo || !ctx.correoActivo}
          title={sinCorreo ? 'Ni el alumno ni sus tutores tienen correo' : !ctx.correoActivo ? 'El correo no está configurado en el servidor' : ''}
          onClick={() => setAbierto(true)}>
          <I.Mail /> Escribir correo
        </button>
      )}>
      {sinCorreo && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--ink-3)' }}>Ni el alumno ni sus tutores tienen correo: habrá que llamar.</p>}
      {/* Correos que rebotan: no reciben campañas ni automatismos hasta que se
          cambie el correo en la ficha o se marque aquí como arreglado. */}
      {rebotes.map(b => (
        <div key={b.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', marginBottom: 8, borderRadius: 12,
          background: 'color-mix(in oklab, var(--orange) 10%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--orange) 35%, transparent)', fontSize: 12 }}>
          <span style={{ flex: '1 1 260px' }}>
            <b>↩ El correo de {b.de} rebota</b> ({b.email}): {b.motivo}{b.tipo === 'duro' ? '' : ' (temporal)'}. No se le envían campañas ni automatismos hasta que se cambie el correo en la ficha o se marque como arreglado.
          </span>
          <button type="button" className="btn btn-sm btn-outline" onClick={async () => {
            if (!window.confirm(`¿Marcar ${b.email} como arreglado? Volverá a recibir los correos.`)) return;
            const r = await fetch(`/api/admin/rebotes/${b.id}/resolver`, { method: 'POST', credentials: 'include' });
            if (r.ok) { setRebotes(x => x.filter(y => y.id !== b.id)); showToast?.('Marcado como arreglado.'); }
          }}>Ya está arreglado</button>
        </div>
      ))}

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
          {diseno ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 180px) minmax(0, 1fr)', gap: 12, alignItems: 'center' }}>
              <button type="button" onClick={() => setDisenando(true)} title="Abrir el diseñador" style={{ padding: 0, border: '1px solid var(--line)', borderRadius: 10, background: 'none', cursor: 'pointer', overflow: 'hidden' }}>
                <Miniatura diseno={diseno} marca={marca} alto={200} vars={ctx.variables} />
              </button>
              <div style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>Correo con diseño</span>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setDisenando(true)}>Abrir el diseñador</button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => { if (window.confirm('¿Quitar el diseño y escribirlo solo con texto?')) setDiseno(null); }}>Quitar el diseño</button>
              </div>
            </div>
          ) : (
            <>
            <textarea style={{ ...campo, minHeight: 170, resize: 'vertical' }} value={cuerpo} onChange={e => setCuerpo(e.target.value)} placeholder="Escribe el correo…" aria-label="Texto del correo" />
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              Se rellenan solas: {VARIABLES.map(v => <code key={v} style={{ marginRight: 6 }}>{v}</code>)}
              (ahora: {ctx.variables.nombre} · {ctx.variables.clases} · pendiente {ctx.variables.pendiente})
            </span>
              <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={() => setEligiendo(true)}>Darle diseño (imágenes, botones, colores)</button>
            </>
          )}
          {eligiendo && (
            <ElegirPlantilla textoActual={cuerpo} onCerrar={() => setEligiendo(false)}
              onElegir={({ diseno: d, asunto: as }) => { setEligiendo(false); setDiseno(d); if (!asunto && as) setAsunto(as); setDisenando(true); }} />
          )}
          {disenando && (
            <EditorDiseno titulo={`Correo a ${ctx.alumno.completo}`} valor={{ asunto, diseno }} variables={varsDiseno} showToast={showToast}
              textoGuardar="Usar este diseño" onCerrar={() => setDisenando(false)}
              onGuardar={({ asunto: as, diseno: d }) => { setAsunto(as); setDiseno(d); setDisenando(false); }} />
          )}
          {vista && diseno && <VistaPrevia diseno={diseno} marca={marca} vars={ctx.variables} asunto={asunto} onCerrar={() => setVista(false)} />}

          {vista && !diseno && (
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

      <Historial comunicaciones={historial} eventos={eventos} buzon={buzon} />
    </Seccion>
  );
}
