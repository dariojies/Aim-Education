import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { I } from './Icons.jsx';
import { ElegirHueco, duracionTexto } from './ColegioPublico.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Colegios (#652): la oferta educativa para colegios en el panel.
//   · Citas: lo que piden los colegios (aceptar, no podemos, otro día), lo que
//     les hemos propuesto y lo confirmado.
//   · Colegios: alta de cada colegio y su enlace (copiar o mandar por correo).
//   · Mi horario: cuándo puede ir cada uno; a los colegios solo les salen los
//     huecos en los que pueden TODOS los que tienen que ir.
//   · Oferta: las actividades que se ofrecen.
// ─────────────────────────────────────────────────────────────────────────────

const api = async (url, { method = 'GET', body } = {}) => {
  const r = await fetch(url, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'No se ha podido hacer.'), { datos: d, status: r.status });
  return d;
};
const conMayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const fechaLarga = (f) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const hoyMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const COLOR = { solicitada: 'var(--purple)', propuesta: 'var(--orange)', confirmada: 'var(--teal)', rechazada: 'var(--ink-3)', cancelada: 'var(--ink-3)' };
const fondo = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 3000, display: 'grid', placeItems: 'center', padding: 16 };
const aviso = (color) => ({ padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.45, background: `color-mix(in oklab, var(${color}) 10%, var(--bg-2))`, border: `1px solid color-mix(in oklab, var(${color}) 30%, transparent)` });

function Ventana({ titulo, onCerrar, children, ancho = 560 }) {
  return createPortal(
    <div style={fondo} role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="panel" style={{ margin: 0, maxWidth: ancho, width: '100%', maxHeight: 'calc(100vh - 32px)', overflow: 'auto', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, flex: 1 }}>{titulo}</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onCerrar}><I.X width={16} height={16} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default function AdminColegios({ showToast }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [pestana, setPestana] = useState('citas');
  const [proponer, setProponer] = useState(null); // { colegioId?, cambia?, actividadId? }
  const cargar = () => api('/api/admin/colegios').then(x => { setD(x); setError(''); }).catch(e => setError(e.message));
  useEffect(() => { cargar(); }, []);

  if (error && !d) return <p role="alert" style={aviso('--orange')}>{error}</p>;
  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  const porContestar = d.citas.filter(c => c.estado === 'solicitada').length;
  const pestanas = [
    ['citas', `Citas${porContestar ? ` (${porContestar})` : ''}`],
    ['colegios', `Colegios (${d.colegios.filter(c => c.activo).length})`],
    ['horario', 'Mi horario'],
    ['oferta', `Oferta (${d.oferta.filter(o => o.activa).length})`],
  ];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p className="sub" style={{ margin: 0 }}>
        Las actividades que ofrecéis a los colegios. Cada colegio tiene su enlace: ve la oferta y los huecos en los que podéis ir
        {d.ajustes.personas.length > 1 ? ` (${d.ajustes.personas.map(p => p.nombre.split(' ')[0]).join(' y ')} a la vez)` : ''}, y pide día y hora.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {pestanas.map(([id, txt]) => (
          <button key={id} type="button" className={`btn btn-sm ${pestana === id ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPestana(id)}>{txt}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm btn-primary" disabled={!d.colegios.some(c => c.activo) || !d.oferta.some(o => o.activa)}
          title={!d.colegios.some(c => c.activo) ? 'Primero da de alta un colegio' : !d.oferta.some(o => o.activa) ? 'Primero pon alguna actividad en la oferta' : ''}
          onClick={() => setProponer({})}><I.Plus /> Proponer una cita</button>
      </div>
      {!d.ajustes.personas.length && (
        <div style={aviso('--orange')}>
          <b>Aún no hay nadie puesto para ir a los colegios</b>, así que a los colegios no les sale ningún hueco. En «Mi horario» elegid quién tiene que ir y cada uno pone su horario.
        </div>
      )}
      {pestana === 'citas' && <Citas d={d} recargar={cargar} showToast={showToast} onProponer={setProponer} />}
      {pestana === 'colegios' && <Colegios d={d} recargar={cargar} showToast={showToast} onProponer={setProponer} />}
      {pestana === 'horario' && <MiHorario d={d} recargar={cargar} showToast={showToast} />}
      {pestana === 'oferta' && <Oferta d={d} recargar={cargar} showToast={showToast} />}
      {proponer && <Proponer d={d} inicial={proponer} onCerrar={() => setProponer(null)} onHecho={(msg) => { setProponer(null); cargar(); showToast?.(msg); }} />}
    </div>
  );
}

// ── Citas ──
function Citas({ d, recargar, showToast, onProponer }) {
  const [historial, setHistorial] = useState(null);
  const hoy = hoyMadrid();
  const grupos = [
    ['Por contestar', 'Las han pedido los colegios: aceptad, decid que no podéis o proponed otro día.', d.citas.filter(c => c.estado === 'solicitada')],
    ['Esperando al colegio', 'Se las habéis propuesto: les ha llegado un correo para aceptarlas o pedir otro día.', d.citas.filter(c => c.estado === 'propuesta')],
    ['Confirmadas', null, d.citas.filter(c => c.estado === 'confirmada' && c.fecha >= hoy)],
  ];
  const pasadas = d.citas.filter(c => !(['solicitada', 'propuesta'].includes(c.estado) || (c.estado === 'confirmada' && c.fecha >= hoy))).sort((a, b) => (b.fecha + b.desde).localeCompare(a.fecha + a.desde));

  async function hacer(c, que) {
    let mensaje = '';
    if (que === 'rechazar') {
      const m = window.prompt(`No podéis ir a ${c.colegio} el ${fechaLarga(c.fecha)}. ¿Queréis decirles por qué? (opcional; les llega en el correo, con un enlace para elegir otro día)`, '');
      if (m === null) return; mensaje = m;
    }
    if (que === 'anular') {
      const m = window.prompt(`¿Anular ${c.actividad} en ${c.colegio} el ${fechaLarga(c.fecha)}? Les llega un correo. Si queréis, decid el motivo:`, '');
      if (m === null) return; mensaje = m;
    }
    if (que === 'aceptar' && !window.confirm(`¿Confirmar ${c.actividad} en ${c.colegio} el ${fechaLarga(c.fecha)} de ${c.desde} a ${c.hasta}? Les llega un correo de confirmación.`)) return;
    try {
      const r = await api(`/api/admin/colegios/citas/${c.id}/${que}`, { method: 'POST', body: { mensaje } });
      showToast?.(`${{ aceptar: 'Cita confirmada', rechazar: 'Contestado', anular: 'Cita anulada' }[que]}.${r.correo ? ` Correo a ${r.correo}.` : ' (El colegio no tiene correo: avisadle vosotros.)'}`);
      recargar();
    } catch (e) { alert(e.message); recargar(); }
  }

  const tarjeta = (c) => (
    <div key={c.id} className="panel" style={{ margin: 0, padding: 14, display: 'grid', gap: 6, borderLeft: `4px solid ${COLOR[c.estado] || 'var(--line)'}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 15 }}>{c.colegio}</b>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.nombreEstado}{c.anteriorId ? ' · en lugar de otra' : ''}</span>
      </div>
      <span>{c.actividad}</span>
      <span style={{ fontWeight: 700 }}>{conMayuscula(fechaLarga(c.fecha))} · {c.desde} a {c.hasta}</span>
      {c.mensaje && <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.origen === 'colegio' ? 'El colegio: ' : 'Les dijisteis: '}«{c.mensaje}»</span>}
      {c.respuesta && <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Nota: «{c.respuesta}»</span>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        {c.estado === 'solicitada' && <>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => hacer(c, 'aceptar')}>Aceptar</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onProponer({ cambia: c.id, colegioId: c.colegioId, actividadId: c.actividadId })}>Proponer otro día</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => hacer(c, 'rechazar')}>No podemos</button>
        </>}
        {['propuesta', 'confirmada'].includes(c.estado) && <>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onProponer({ cambia: c.id, colegioId: c.colegioId, actividadId: c.actividadId })}>Cambiar el día</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => hacer(c, 'anular')}>Anular</button>
        </>}
        {c.anteriorId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => api(`/api/admin/colegios/citas/${c.id}/historial`).then(setHistorial).catch(e => alert(e.message))}>Ver los cambios</button>}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {grupos.map(([titulo, ayuda, lista]) => (
        <section key={titulo} style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{titulo} <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>({lista.length})</span></h3>
          {ayuda && lista.length > 0 && <span style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: -6 }}>{ayuda}</span>}
          {lista.length
            ? <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>{lista.map(tarjeta)}</div>
            : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Nada por aquí.</span>}
        </section>
      ))}
      {pasadas.length > 0 && (
        <section style={{ display: 'grid', gap: 6 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: 'var(--ink-2)' }}>Anteriores y anuladas</h3>
          {pasadas.map(c => (
            <div key={c.id} style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              <b>{c.colegio}</b> · {c.actividad} · <span>{fechaLarga(c.fecha)}</span> · {c.desde}–{c.hasta} · {c.nombreEstado}
            </div>
          ))}
        </section>
      )}
      {historial && (
        <Ventana titulo="Los cambios de esta cita" onCerrar={() => setHistorial(null)}>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
            {historial.map(h => (
              <li key={h.id} style={{ fontSize: 13.5 }}>
                <b>{h.origen === 'colegio' ? 'El colegio pide' : `${h.quien || 'El club'} propone`}</b> {h.actividad}, <span>{fechaLarga(h.fecha)}</span> de {h.desde} a {h.hasta}
                <div style={{ color: 'var(--ink-3)' }}>{h.nombreEstado}{h.mensaje ? ` · «${h.mensaje}»` : ''}{h.respuesta ? ` · nota: «${h.respuesta}»` : ''}</div>
              </li>
            ))}
          </ol>
        </Ventana>
      )}
    </div>
  );
}

// ── Proponer (o cambiar) una cita ──
function Proponer({ d, inicial, onCerrar, onHecho }) {
  const cita = inicial.cambia ? d.citas.find(c => c.id === inicial.cambia) : null;
  const [f, setF] = useState({ colegioId: inicial.colegioId || '', actividadId: inicial.actividadId || d.oferta.find(o => o.activa)?.id || '', fecha: '', desde: '', hasta: '', mensaje: '' });
  const [huecos, setHuecos] = useState(null);
  const [libre, setLibre] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    api(`/api/admin/colegios/huecos${inicial.cambia ? `?sinCita=${inicial.cambia}` : ''}`).then(x => setHuecos(x.huecos)).catch(e => setError(e.message));
  }, [inicial.cambia]);
  const act = d.oferta.find(o => o.id === Number(f.actividadId));

  async function enviar(forzar = false) {
    setError('');
    if (!f.colegioId) return setError('Elige el colegio.');
    if (!f.fecha || !f.desde || !f.hasta) return setError('Elige el día y las horas.');
    setEnviando(true);
    try {
      const r = await api('/api/admin/colegios/citas', { method: 'POST', body: { ...f, colegioId: Number(f.colegioId), actividadId: Number(f.actividadId), cambia: inicial.cambia || undefined, forzar } });
      onHecho(`Cita propuesta.${r.correo ? ` Correo a ${r.correo}.` : ' (El colegio no tiene correo: avisadle vosotros.)'}`);
    } catch (e) {
      if (e.datos?.fueraDeHueco && window.confirm(e.message)) { setEnviando(false); return enviar(true); }
      setError(e.message);
    } finally { setEnviando(false); }
  }

  return (
    <Ventana titulo={cita ? `Otro día para ${cita.colegio}` : 'Proponer una cita'} onCerrar={onCerrar} ancho={640}>
      {cita && <div style={aviso('--purple')}>Ahora: {cita.actividad}, <span>{fechaLarga(cita.fecha)}</span> de {cita.desde} a {cita.hasta}. Al proponer el día nuevo, esta deja de valer y al colegio le llega un correo para aceptar el nuevo.</div>}
      {!cita && (
        <label className="field" style={{ margin: 0 }}><span>Colegio</span>
          <select value={f.colegioId} onChange={e => setF({ ...f, colegioId: e.target.value })}>
            <option value="">Elige…</option>
            {d.colegios.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
      )}
      <label className="field" style={{ margin: 0 }}><span>Actividad</span>
        <select value={f.actividadId} onChange={e => setF({ ...f, actividadId: e.target.value })}>
          {d.oferta.filter(o => o.activa || o.id === Number(f.actividadId)).map(o => <option key={o.id} value={o.id}>{o.titulo} · unas {duracionTexto(o.duracion)}</option>)}
        </select>
      </label>
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 14 }}>Día y horas</b>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>En verde, los días en los que estáis libres todos.</span>
          <label style={{ marginLeft: 'auto', fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={libre} onChange={e => setLibre(e.target.checked)} /> Poner otra hora a mano
          </label>
        </div>
        {huecos === null ? <span style={{ color: 'var(--ink-3)' }}>Cargando huecos…</span> : libre ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label className="field" style={{ margin: 0 }}><span>Día</span><input type="date" min={hoyMadrid()} value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></label>
            <label className="field" style={{ margin: 0 }}><span>Empieza</span><input type="time" step="900" value={f.desde} onChange={e => setF({ ...f, desde: e.target.value })} /></label>
            <label className="field" style={{ margin: 0 }}><span>Termina</span><input type="time" step="900" value={f.hasta} onChange={e => setF({ ...f, hasta: e.target.value })} /></label>
          </div>
        ) : (
          <ElegirHueco huecos={huecos} valor={f} duracion={act?.duracion || 60} onCambio={v => setF(x => ({ ...x, ...v }))} />
        )}
      </div>
      <label className="field" style={{ margin: 0 }}><span>Mensaje para el colegio (opcional)</span>
        <textarea rows={2} maxLength={2000} value={f.mensaje} onChange={e => setF({ ...f, mensaje: e.target.value })} placeholder="Va en el correo. Por ejemplo: «Llevamos todo el material.»" />
      </label>
      {error && <p role="alert" style={{ margin: 0, color: 'var(--orange)', fontWeight: 700 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={enviando} onClick={() => enviar(false)}>{enviando ? 'Enviando…' : 'Proponer y mandar el correo'}</button>
      </div>
    </Ventana>
  );
}

// ── Colegios ──
const COLEGIO_VACIO = { nombre: '', contacto: '', email: '', telefono: '', direccion: '', notas: '', activo: true };
function Colegios({ d, recargar, showToast, onProponer }) {
  const [editar, setEditar] = useState(null);
  const [buscar, setBuscar] = useState('');
  const lista = d.colegios.filter(c => !buscar || `${c.nombre} ${c.contacto} ${c.email}`.toLowerCase().includes(buscar.toLowerCase()));

  async function guardar() {
    try {
      if (editar.id) await api(`/api/admin/colegios/${editar.id}`, { method: 'PUT', body: editar });
      else await api('/api/admin/colegios', { method: 'POST', body: editar });
      setEditar(null); recargar(); showToast?.('Colegio guardado.');
    } catch (e) { alert(e.message); }
  }
  async function enviarEnlace(c) {
    if (!c.email) return alert('Ponle un correo al colegio antes.');
    if (!window.confirm(`¿Mandar a ${c.email} el enlace de ${c.nombre} para pedir actividades?`)) return;
    try { const r = await api(`/api/admin/colegios/${c.id}/enviar-enlace`, { method: 'POST' }); showToast?.(`Enlace mandado a ${r.enviadoA}.`); } catch (e) { alert(e.message); }
  }
  async function copiar(c) {
    try { await navigator.clipboard.writeText(c.enlace); showToast?.('Enlace copiado.'); } catch { window.prompt('Copia el enlace:', c.enlace); }
  }
  async function enlaceNuevo(c) {
    if (!window.confirm(`¿Hacer un enlace nuevo para ${c.nombre}? El que tienen ahora deja de funcionar.`)) return;
    try { await api(`/api/admin/colegios/${c.id}/enlace-nuevo`, { method: 'POST' }); recargar(); showToast?.('Enlace nuevo hecho. Mándaselo al colegio.'); } catch (e) { alert(e.message); }
  }
  async function borrar(c) {
    if (!window.confirm(`¿Borrar ${c.nombre}? Si ya tiene citas, se queda guardado pero desactivado (su enlace deja de funcionar).`)) return;
    try { const r = await api(`/api/admin/colegios/${c.id}`, { method: 'DELETE' }); recargar(); showToast?.(r.desactivado ? 'Desactivado (tenía citas).' : 'Borrado.'); } catch (e) { alert(e.message); }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-input" style={{ flex: '1 1 220px', maxWidth: 340 }}>
          <I.Search /><input placeholder="Buscar colegio…" value={buscar} onChange={e => setBuscar(e.target.value)} />
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditar({ ...COLEGIO_VACIO })}><I.Plus /> Nuevo colegio</button>
      </div>
      {!lista.length && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{d.colegios.length ? 'Ninguno con esa búsqueda.' : 'Aún no hay colegios. Da de alta el primero y mándale su enlace.'}</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {lista.map(c => (
          <div key={c.id} className="panel" style={{ margin: 0, padding: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', opacity: c.activo ? 1 : 0.6 }}>
            <div style={{ flex: '1 1 260px', minWidth: 0, display: 'grid', gap: 2 }}>
              <b>{c.nombre}{!c.activo && <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}> · desactivado</span>}</b>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{[c.contacto, c.email, c.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</span>
              {c.proximas > 0 && <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 700 }}>{c.proximas} {c.proximas === 1 ? 'cita confirmada' : 'citas confirmadas'} por venir</span>}
            </div>
            {c.activo && <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => copiar(c)}>Copiar el enlace</button>
              <button type="button" className="btn btn-outline btn-sm" disabled={!c.email} title={c.email ? '' : 'Sin correo'} onClick={() => enviarEnlace(c)}><I.Mail width={14} height={14} /> Enviar el enlace</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onProponer({ colegioId: c.id })}>Proponer cita</button>
            </>}
            <button type="button" className="icon-btn" aria-label={`Editar ${c.nombre}`} onClick={() => setEditar({ ...c })}><I.Edit /></button>
            <button type="button" className="icon-btn danger" aria-label={`Borrar ${c.nombre}`} onClick={() => borrar(c)}><I.Trash /></button>
          </div>
        ))}
      </div>
      {editar && (
        <Ventana titulo={editar.id ? editar.nombre || 'Colegio' : 'Nuevo colegio'} onCerrar={() => setEditar(null)}>
          {[['nombre', 'Nombre del colegio', 'CEIP Andalucía'], ['contacto', 'Persona de contacto', 'Ana Pérez (jefa de estudios)'], ['email', 'Correo', 'secretaria@colegio.es'], ['telefono', 'Teléfono', '956 00 00 00'], ['direccion', 'Dirección', 'Calle…, Algeciras']].map(([k, t, ph]) => (
            <label key={k} className="field" style={{ margin: 0 }}><span>{t}</span>
              <input type={k === 'email' ? 'email' : 'text'} value={editar[k] || ''} placeholder={ph} onChange={e => setEditar({ ...editar, [k]: e.target.value })} />
            </label>
          ))}
          <label className="field" style={{ margin: 0 }}><span>Notas (solo las veis vosotros)</span>
            <textarea rows={2} value={editar.notas || ''} onChange={e => setEditar({ ...editar, notas: e.target.value })} />
          </label>
          {editar.id && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={editar.activo !== false} onChange={e => setEditar({ ...editar, activo: e.target.checked })} /> Activo (su enlace funciona)
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => enlaceNuevo(editar)}>Hacer un enlace nuevo</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditar(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={guardar}>Guardar</button>
          </div>
        </Ventana>
      )}
    </div>
  );
}

// ── Mi horario (y quién tiene que ir) ──
function MiHorario({ d, recargar, showToast }) {
  const [h, setH] = useState(null);
  const [cambiado, setCambiado] = useState(false);
  const [bloqueo, setBloqueo] = useState({ fecha: '', fechaHasta: '', desde: '', hasta: '', motivo: '', horas: false });
  const [huecos, setHuecos] = useState(null);
  const [aj, setAj] = useState(null);
  const [personal, setPersonal] = useState([]);
  const cargar = () => {
    api('/api/admin/colegios/mi-horario').then(x => { setH(x); setCambiado(false); }).catch(e => alert(e.message));
    api('/api/admin/colegios/huecos').then(x => setHuecos(x.huecos)).catch(() => {});
  };
  useEffect(() => { cargar(); }, []);

  const porDia = useMemo(() => DIAS_SEMANA.map((_, i) => (h?.horario || []).filter(t => t.dia === i)), [h]);
  const cambiar = (horario) => { setH({ ...h, horario }); setCambiado(true); };
  async function guardar() {
    try { await api('/api/admin/colegios/mi-horario', { method: 'PUT', body: { horario: h.horario } }); showToast?.('Horario guardado.'); cargar(); }
    catch (e) { alert(e.message); }
  }
  async function ponerBloqueo() {
    try {
      const r = await api('/api/admin/colegios/mi-horario/bloqueos', { method: 'POST', body: { fecha: bloqueo.fecha, fechaHasta: bloqueo.fechaHasta || undefined, desde: bloqueo.horas ? bloqueo.desde : undefined, hasta: bloqueo.horas ? bloqueo.hasta : undefined, motivo: bloqueo.motivo } });
      setBloqueo({ fecha: '', fechaHasta: '', desde: '', hasta: '', motivo: '', horas: false });
      showToast?.(r.dias > 1 ? `${r.dias} días apuntados.` : 'Apuntado.'); cargar();
    } catch (e) { alert(e.message); }
  }
  async function guardarAjustes() {
    try { await api('/api/admin/colegios/ajustes', { method: 'PUT', body: { ...aj, personas: aj.personas.map(p => p.id) } }); setAj(null); recargar(); showToast?.('Guardado.'); cargar(); }
    catch (e) { alert(e.message); }
  }
  const abrirAjustes = () => { setAj({ ...d.ajustes }); api('/api/admin/colegios/personal').then(setPersonal).catch(() => {}); };
  if (!h) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;

  const proximos = Object.entries(huecos || {}).slice(0, 10);
  const input = { fontFamily: 'inherit', fontSize: 14, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)' };
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="panel" style={{ margin: 0, padding: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px', display: 'grid', gap: 3 }}>
          <b>Tienen que ir: {d.ajustes.personas.length ? d.ajustes.personas.map(p => p.nombre).join(', ') : 'nadie todavía'}</b>
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
            A los colegios solo les salen los huecos en los que estáis libres todos, desde dentro de {d.ajustes.antelacion} {d.ajustes.antelacion === 1 ? 'día' : 'días'} y hasta {d.ajustes.semanas} semanas, con {d.ajustes.margen} min entre una cita y otra.
          </span>
          {!d.voy && <span style={{ fontSize: 12.5, color: 'var(--orange)', fontWeight: 700 }}>Tú no estás en la lista: tu horario no cuenta hasta que te añadan.</span>}
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={abrirAjustes}>Cambiar</button>
      </div>

      <section style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 16, flex: 1 }}>Cuándo puedo ir (cada semana)</h3>
          <button type="button" className="btn btn-primary btn-sm" disabled={!cambiado} onClick={guardar}>{cambiado ? 'Guardar mi horario' : 'Guardado'}</button>
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: -6 }}>Solo lo tuyo. Los demás ponen el suyo cuando entran.</span>
        <div style={{ display: 'grid', gap: 8 }}>
          {DIAS_SEMANA.map((dia, i) => (
            <div key={dia} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid var(--line-2)' }}>
              <b style={{ width: 92, fontSize: 14 }}>{dia}</b>
              {porDia[i].length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>No puedo</span>}
              {porDia[i].map((t) => {
                const idx = h.horario.indexOf(t);
                const poner = (k, v) => cambiar(h.horario.map((x, j) => (j === idx ? { ...x, [k]: v } : x)));
                return (
                  <span key={idx} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', background: 'var(--bg-3)', borderRadius: 10, padding: '4px 6px' }}>
                    <input type="time" step="900" value={t.desde} aria-label={`${dia}, desde`} onChange={e => poner('desde', e.target.value)} style={input} />
                    <span>a</span>
                    <input type="time" step="900" value={t.hasta} aria-label={`${dia}, hasta`} onChange={e => poner('hasta', e.target.value)} style={input} />
                    <button type="button" className="icon-btn danger" style={{ width: 24, height: 24 }} aria-label={`Quitar ${dia} ${t.desde}`} onClick={() => cambiar(h.horario.filter((_, j) => j !== idx))}><I.X width={12} height={12} /></button>
                  </span>
                );
              })}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar([...h.horario, { dia: i, desde: '09:00', hasta: '14:00' }])}>+ Añadir horas</button>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Días que no puedo</h3>
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: -6 }}>Vacaciones, un examen, un médico… Esos días (o esas horas) no salen a los colegios.</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'grid', gap: 3, fontSize: 12, fontWeight: 700 }}>Desde el día<input type="date" min={hoyMadrid()} value={bloqueo.fecha} onChange={e => setBloqueo({ ...bloqueo, fecha: e.target.value })} style={input} /></label>
          <label style={{ display: 'grid', gap: 3, fontSize: 12, fontWeight: 700 }}>Hasta el día (opcional)<input type="date" min={bloqueo.fecha || hoyMadrid()} value={bloqueo.fechaHasta} onChange={e => setBloqueo({ ...bloqueo, fechaHasta: e.target.value })} style={input} /></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer', paddingBottom: 6 }}>
            <input type="checkbox" checked={bloqueo.horas} onChange={e => setBloqueo({ ...bloqueo, horas: e.target.checked })} /> Solo unas horas
          </label>
          {bloqueo.horas && <>
            <input type="time" step="900" aria-label="Desde la hora" value={bloqueo.desde} onChange={e => setBloqueo({ ...bloqueo, desde: e.target.value })} style={input} />
            <input type="time" step="900" aria-label="Hasta la hora" value={bloqueo.hasta} onChange={e => setBloqueo({ ...bloqueo, hasta: e.target.value })} style={input} />
          </>}
          <input placeholder="Motivo (solo lo veis vosotros)" value={bloqueo.motivo} onChange={e => setBloqueo({ ...bloqueo, motivo: e.target.value })} style={{ ...input, flex: '1 1 180px' }} />
          <button type="button" className="btn btn-outline btn-sm" disabled={!bloqueo.fecha} onClick={ponerBloqueo}>Apuntar</button>
        </div>
        {h.bloqueos.length > 0 && (
          <div style={{ display: 'grid', gap: 4 }}>
            {h.bloqueos.map(b => (
              <div key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
                <span>{conMayuscula(fechaLarga(b.fecha))}</span>
                <span style={{ color: 'var(--ink-3)' }}>{b.desde ? `${b.desde} a ${b.hasta}` : 'todo el día'}{b.motivo ? ` · ${b.motivo}` : ''}</span>
                <button type="button" className="icon-btn danger" style={{ width: 24, height: 24 }} aria-label="Quitar" onClick={() => api(`/api/admin/colegios/mi-horario/bloqueos/${b.id}`, { method: 'DELETE' }).then(cargar).catch(e => alert(e.message))}><I.X width={12} height={12} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Lo que ven los colegios</h3>
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: -4 }}>Los próximos huecos en los que estáis libres todos (sin decir de quién es cada uno).</span>
        {huecos === null ? <span style={{ color: 'var(--ink-3)' }}>Cargando…</span> : proximos.length ? (
          <div style={{ display: 'grid', gap: 4 }}>
            {proximos.map(([f, xs]) => (
              <div key={f} style={{ fontSize: 13.5 }}><b>{conMayuscula(fechaLarga(f))}</b> · {xs.map(x => `${x.desde} a ${x.hasta}`).join(', ')}</div>
            ))}
          </div>
        ) : <span style={{ fontSize: 13.5, color: 'var(--orange)' }}>Ningún hueco: o falta el horario de alguien, o no coincidís ningún día.</span>}
      </section>

      {aj && (
        <Ventana titulo="Quién va a los colegios" onCerrar={() => setAj(null)}>
          <div style={{ display: 'grid', gap: 6 }}>
            <b style={{ fontSize: 14 }}>Tienen que estar todos estos (los huecos son los que tienen libres todos a la vez):</b>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {aj.personas.map(p => (
                <span key={p.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '4px 6px 4px 12px', borderRadius: 999, background: 'var(--bg-3)', fontWeight: 700, fontSize: 13 }}>
                  {p.nombre}
                  <button type="button" className="icon-btn danger" style={{ width: 22, height: 22, borderRadius: 999 }} aria-label={`Quitar a ${p.nombre}`} onClick={() => setAj({ ...aj, personas: aj.personas.filter(x => x.id !== p.id) })}><I.X width={11} height={11} /></button>
                </span>
              ))}
            </div>
            <select value="" onChange={e => { const p = personal.find(x => x.id === e.target.value); if (p) setAj({ ...aj, personas: [...aj.personas, p] }); }}
              style={{ fontFamily: 'inherit', fontSize: 14, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
              <option value="">+ Añadir a alguien del personal…</option>
              {personal.filter(p => !aj.personas.some(x => x.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[['antelacion', 'Antelación (días)', 0, 30], ['semanas', 'Semanas que se ven', 1, 26], ['margen', 'Minutos entre citas', 0, 180]].map(([k, t, min, max]) => (
              <label key={k} className="field" style={{ margin: 0, flex: '1 1 140px' }}><span>{t}</span>
                <input type="number" min={min} max={max} value={aj[k]} onChange={e => setAj({ ...aj, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setAj(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={guardarAjustes}>Guardar</button>
          </div>
        </Ventana>
      )}
    </div>
  );
}

// ── La oferta ──
const OFERTA_VACIA = { titulo: '', descripcion: '', duracion: 60, activa: true, orden: 0 };
function Oferta({ d, recargar, showToast }) {
  const [editar, setEditar] = useState(null);
  async function guardar() {
    try {
      if (editar.id) await api(`/api/admin/colegios/oferta/${editar.id}`, { method: 'PUT', body: editar });
      else await api('/api/admin/colegios/oferta', { method: 'POST', body: editar });
      setEditar(null); recargar(); showToast?.('Actividad guardada.');
    } catch (e) { alert(e.message); }
  }
  async function borrar(o) {
    if (!window.confirm(`¿Quitar «${o.titulo}» de la oferta?`)) return;
    try { const r = await api(`/api/admin/colegios/oferta/${o.id}`, { method: 'DELETE' }); recargar(); showToast?.(r.oculta ? 'Ocultada (ya se había pedido).' : 'Quitada.'); } catch (e) { alert(e.message); }
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-3)' }}>Lo que pueden pedir los colegios. La duración es orientativa: ellos eligen las horas.</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditar({ ...OFERTA_VACIA })}><I.Plus /> Nueva actividad</button>
      </div>
      {!d.oferta.length && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Aún no hay nada en la oferta.</p>}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {d.oferta.map(o => (
          <div key={o.id} className="panel" style={{ margin: 0, padding: 14, display: 'grid', gap: 6, alignContent: 'start', opacity: o.activa ? 1 : 0.55 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <b style={{ flex: 1 }}>{o.titulo}{!o.activa && <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}> · oculta</span>}</b>
              <button type="button" className="icon-btn" aria-label={`Editar ${o.titulo}`} onClick={() => setEditar({ ...o })}><I.Edit /></button>
              <button type="button" className="icon-btn danger" aria-label={`Quitar ${o.titulo}`} onClick={() => borrar(o)}><I.Trash /></button>
            </div>
            {o.descripcion && <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{o.descripcion}</span>}
            <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}>Unas {duracionTexto(o.duracion)}</span>
          </div>
        ))}
      </div>
      {editar && (
        <Ventana titulo={editar.id ? 'Editar la actividad' : 'Nueva actividad'} onCerrar={() => setEditar(null)}>
          <label className="field" style={{ margin: 0 }}><span>Nombre</span>
            <input value={editar.titulo} placeholder="Taller de robótica" onChange={e => setEditar({ ...editar, titulo: e.target.value })} />
          </label>
          <label className="field" style={{ margin: 0 }}><span>Qué es (lo ve el colegio)</span>
            <textarea rows={3} value={editar.descripcion} placeholder="Para qué edades, qué hacen, qué hace falta en el aula…" onChange={e => setEditar({ ...editar, descripcion: e.target.value })} />
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label className="field" style={{ margin: 0, flex: '1 1 140px' }}><span>Duración aproximada (minutos)</span>
              <input type="number" min={15} max={600} step={15} value={editar.duracion} onChange={e => setEditar({ ...editar, duracion: e.target.value })} />
            </label>
            <label className="field" style={{ margin: 0, flex: '1 1 100px' }}><span>Orden</span>
              <input type="number" value={editar.orden} onChange={e => setEditar({ ...editar, orden: e.target.value })} />
            </label>
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={editar.activa !== false} onChange={e => setEditar({ ...editar, activa: e.target.checked })} /> Se ofrece (sale a los colegios)
          </label>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditar(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={guardar}>Guardar</button>
          </div>
        </Ventana>
      )}
    </div>
  );
}
