import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Registro de jornada / fichaje (tickets #233 y #251). Cada trabajador ficha su
// jornada (entrada, pausas y salida) y ve su registro; secretaría/dirección ve el
// de todos y exporta para la Inspección. La hora la pone siempre el servidor.
//
// Correcciones (#251): nada cambia sin que lo apruebe la otra parte. Si la
// propone la empresa, la aprueba el trabajador; si la pide el trabajador, la
// valida secretaría/dirección. Mientras está pendiente vale el fichaje original,
// y todo (también lo anulado) queda visible y en las descargas.
// ─────────────────────────────────────────────────────────────────────────────

const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
const fmtHora = (ts) => ts ? new Date(ts).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) : '';
const fmtFechaHora = (ts) => ts ? new Date(ts).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const isoDeTs = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
const fmtDia = (d) => new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const hms = (seg) => {
  seg = Math.max(0, Math.round(seg));
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
};
const ETQ = { entrada: 'Entrada', salida: 'Salida', pausa_inicio: 'Inicio de pausa', pausa_fin: 'Fin de pausa' };
// Un botón para cada cosa (ticket #252).
const BOTON = { entrada: 'Iniciar jornada', pausa_inicio: 'Iniciar pausa', pausa_fin: 'Finalizar pausa', salida: 'Finalizar jornada' };
const COLOR_TIPO = { entrada: 'var(--teal)', salida: 'var(--orange)', pausa_inicio: '#b45309', pausa_fin: 'var(--teal)' };
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']; // 0 = lunes
const hm2min = (s) => { const [h, m] = String(s || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const ORIGEN = { correccion: 'Corrección', incidencia: 'Incidencia' };
const ESTADO_SOL = {
  pendiente: { t: 'Pendiente', c: '#b45309' },
  aprobada: { t: 'Aprobada', c: 'var(--teal)' },
  rechazada: { t: 'Rechazada', c: 'var(--orange)' },
  cancelada: { t: 'Cancelada', c: 'var(--ink-3)' },
};
const textoTramos = (tramos) => (tramos || []).map(t => `${t.entrada}–${t.salida}`).join(' y ');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (mes) => { const [y, m] = String(mes).split('-').map(Number); return `${MESES[m - 1]} de ${y}`; };
const moverMes = (mes, delta) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const horas = (n) => n == null ? '—' : `${Number(n).toFixed(2).replace('.', ',')} h`;
const textoJornada = (jornada, horasSemana) => jornada
  ? `${jornada === 'parcial' ? 'Tiempo parcial' : 'Jornada completa'}${horasSemana != null ? ` · ${String(horasSemana).replace('.', ',')} h/sem` : ''}`
  : null;

async function enviar(url, body, method = 'POST') {
  const r = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se pudo completar.');
  return d;
}

export default function Fichaje({ showToast, permisos }) {
  const puedeGestionar = !!permisos?.fichajesGestion;
  const [tab, setTab] = useState('mi');

  const tabs = [['mi', 'Mi fichaje'], ['calendario', 'Vacaciones y festivos'], ...(puedeGestionar ? [['gestion', 'Registro del personal']] : [])];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tabs.map(([id, l]) => (
          <button key={id} className={`filter-pill ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)} style={{ borderRadius: 8, padding: '8px 16px' }}>{l}</button>
        ))}
      </div>
      {tab === 'mi' && <MiFichaje showToast={showToast} />}
      {tab === 'calendario' && <VacacionesYFestivos showToast={showToast} puedeGestionar={puedeGestionar} />}
      {tab === 'gestion' && puedeGestionar && <GestionFichajes showToast={showToast} />}
    </div>
  );
}

// ── Piezas comunes ───────────────────────────────────────────────────────────

// Un apunte del registro. Los anulados salen tachados; los corregidos, marcados.
// Si se puede pedir una corrección sobre él, es pulsable.
function Apunte({ a, onCorregir }) {
  const clicable = !!onCorregir && !a.anulado && !a.solicitudPendiente;
  const titulo = [
    a.corregido ? `${ORIGEN[a.origen] || 'Corrección'}${a.creadoPor ? ` de ${a.creadoPor}` : ''}${a.motivo ? `: ${a.motivo}` : ''}` : null,
    a.anulado ? `Anulado el ${fmtFechaHora(a.anulacion?.at)}${a.anulacion?.por ? ` por ${a.anulacion.por}` : ''}${a.anulacion?.motivo ? `: ${a.anulacion.motivo}` : ''}` : null,
    a.solicitudPendiente ? 'Tiene una corrección pendiente de aprobar' : null,
    clicable ? 'Pulsa para pedir una corrección' : null,
  ].filter(Boolean).join('\n');
  return (
    <button type="button" disabled={!clicable} onClick={() => clicable && onCorregir(a)} title={titulo}
      style={{ fontSize: 11, display: 'inline-flex', gap: 4, alignItems: 'center', padding: '2px 9px', borderRadius: 999, fontFamily: 'inherit',
        border: `1px solid ${a.solicitudPendiente ? '#b45309' : 'var(--line)'}`, background: 'var(--bg-2)',
        cursor: clicable ? 'pointer' : 'default', opacity: a.anulado ? 0.6 : 1, color: 'var(--ink-2)' }}>
      <span style={{ color: COLOR_TIPO[a.tipo], fontWeight: 700, textDecoration: a.anulado ? 'line-through' : 'none' }}>{ETQ[a.tipo]}</span>
      <span style={{ textDecoration: a.anulado ? 'line-through' : 'none' }}>{fmtHora(a.ts)}</span>
      {a.corregido && <span title="Corrección">✎</span>}
      {a.solicitudPendiente && <span>⏳</span>}
    </button>
  );
}

// Un día del registro, con sus apuntes y, debajo y a la vista, el detalle de lo
// anulado y lo corregido (quién, cuándo y por qué): no se esconde nada.
function DiaRegistro({ d, onCorregir, fondo = 'var(--bg-2)' }) {
  const anulados = d.apuntes.filter(a => a.anulado);
  const corregidos = d.apuntes.filter(a => a.corregido && !a.anulado);
  return (
    <div style={{ background: fondo, border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13, textTransform: 'capitalize' }}>{fmtDia(d.dia)}</b>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal)' }}>{hms(d.segundos)}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        {d.apuntes.map(a => <Apunte key={a.id} a={a} onCorregir={onCorregir} />)}
      </div>
      {(anulados.length > 0 || corregidos.length > 0) && (
        <div style={{ display: 'grid', gap: 2, marginTop: 6, fontSize: 11, color: 'var(--ink-3)' }}>
          {corregidos.map(a => (
            <div key={'c' + a.id}>✎ {ETQ[a.tipo]} {fmtHora(a.ts)}: {ORIGEN[a.origen] || 'corrección'}{a.creadoPor ? ` propuesta por ${a.creadoPor}` : ''}{a.motivo ? ` — ${a.motivo}` : ''}</div>
          ))}
          {anulados.map(a => (
            <div key={'a' + a.id}>✕ {ETQ[a.tipo]} {fmtHora(a.ts)} anulado el {fmtFechaHora(a.anulacion?.at)}{a.anulacion?.por ? ` (propuesto por ${a.anulacion.por})` : ''}{a.anulacion?.motivo ? ` — ${a.anulacion.motivo}` : ''}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// Pedir (trabajador) o proponer (empresa) una corrección. 'apunte' viene si se
// corrige un fichaje concreto (cambiar su hora o anularlo); si no, es añadir uno.
function ModalSolicitud({ destino, apunte, esEmpresa, onClose, onDone }) {
  const [f, setF] = useState(() => apunte
    ? { accion: 'modificar', tipo: apunte.tipo, fecha: isoDeTs(apunte.ts), hora: fmtHora(apunte.ts), motivo: '', incidencia: false }
    : { accion: 'alta', tipo: 'entrada', fecha: hoyISO(), hora: '', motivo: '', incidencia: false });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      await enviar('/api/fichaje/solicitudes', {
        userId: esEmpresa ? destino.userId : undefined,
        accion: f.accion, fichajeId: apunte?.id, tipo: f.tipo, fecha: f.fecha, hora: f.hora, motivo: f.motivo,
        origen: f.incidencia && f.accion !== 'anular' ? 'incidencia' : 'correccion',
      });
      onDone?.(esEmpresa ? 'Corrección propuesta. El trabajador tiene que aprobarla.' : 'Solicitud enviada. Secretaría o dirección tiene que validarla.');
    } catch (err) { alert(err.message); } finally { setGuardando(false); }
  }

  const pideHora = f.accion !== 'anular';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={guardar}
        style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 12, width: 'min(460px, 100%)' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{esEmpresa ? `Proponer corrección · ${destino.nombre}` : 'Pedir una corrección'}</h3>
        {apunte ? (
          <>
            <div style={{ fontSize: 13, background: 'var(--bg-3)', borderRadius: 10, padding: '8px 12px' }}>
              Fichaje actual: <b>{ETQ[apunte.tipo]}</b> el {fmtFechaHora(apunte.ts)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['modificar', 'Cambiar la hora'], ['anular', 'Anularlo']].map(([v, l]) => (
                <button key={v} type="button" className={`filter-pill ${f.accion === v ? 'is-active' : ''}`} onClick={() => set('accion', v)}>{l}</button>
              ))}
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Añadir un fichaje que no se registró (p. ej. se olvidó fichar la salida).</p>
        )}
        {pideHora && (
          <>
            <select value={f.tipo} onChange={e => set('tipo', e.target.value)} style={inp}>
              {Object.entries(ETQ).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={f.fecha} max={hoyISO()} onChange={e => set('fecha', e.target.value)} required style={{ ...inp, flex: 1 }} />
              <input type="time" value={f.hora} onChange={e => set('hora', e.target.value)} required style={{ ...inp, flex: 1 }} />
            </div>
            {/* Procedimiento alternativo (#252): si no se pudo fichar a la hora por
                una caída de internet o un fallo, se incorpora después como incidencia. */}
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={f.incidencia} onChange={e => set('incidencia', e.target.checked)} style={{ marginTop: 2 }} />
              <span>No se pudo fichar a su hora por un fallo técnico (sin conexión, la web no cargaba...)
                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>Queda registrado como incidencia, con la hora real indicada y la hora en que se anota.</span>
              </span>
            </label>
          </>
        )}
        <textarea placeholder="Motivo (obligatorio)" value={f.motivo} onChange={e => set('motivo', e.target.value)} required rows={2} style={{ ...inp, resize: 'vertical' }} />
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
          {esEmpresa
            ? 'El trabajador recibirá un aviso para aprobarla. Mientras no la apruebe, vale el fichaje original.'
            : 'Secretaría o dirección tendrá que validarla. Mientras tanto, vale el fichaje original.'}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={guardando || !f.motivo.trim() || (pideHora && !f.hora)}>
            {guardando ? 'Enviando...' : esEmpresa ? 'Proponer' : 'Enviar solicitud'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Lista de solicitudes con sus acciones (aprobar/rechazar o retirar).
function ListaSolicitudes({ solicitudes, mostrarTrabajador, onCambio, showToast }) {
  async function resolver(s, aprobar) {
    let respuesta = null;
    if (!aprobar) {
      respuesta = window.prompt('¿Por qué la rechazas? (queda registrado)');
      if (!respuesta || !respuesta.trim()) return;
    } else if (!window.confirm(`¿Aprobar «${s.descripcion}»? Se aplicará al registro.`)) return;
    try {
      await enviar(`/api/fichaje/solicitudes/${s.id}/resolver`, { aprobar, respuesta });
      showToast?.(aprobar ? 'Corrección aprobada y aplicada.' : 'Corrección rechazada.');
      onCambio?.();
    } catch (err) { alert(err.message); }
  }
  async function cancelar(s) {
    if (!window.confirm('¿Retirar esta solicitud?')) return;
    try { await enviar(`/api/fichaje/solicitudes/${s.id}/cancelar`); showToast?.('Solicitud retirada.'); onCambio?.(); }
    catch (err) { alert(err.message); }
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {solicitudes.map(s => {
        const e = ESTADO_SOL[s.estado] || ESTADO_SOL.pendiente;
        return (
          <div key={s.id} style={{ background: 'var(--bg-2)', border: `1px solid ${s.puedoResolver ? '#b45309' : 'var(--line)'}`, borderRadius: 12, padding: '10px 14px', display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: e.c }}>● {e.t}</span>
              {mostrarTrabajador && <b style={{ fontSize: 13 }}>{s.trabajador}</b>}
              <span style={{ fontSize: 13 }}>{s.descripcion}</span>
              {s.origen === 'incidencia' && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--purple)' }}>INCIDENCIA</span>}
              <div style={{ flex: 1 }} />
              {s.puedoResolver && (
                <>
                  <button className="btn btn-sm btn-primary" onClick={() => resolver(s, true)}>Aprobar</button>
                  <button className="btn btn-sm btn-outline" onClick={() => resolver(s, false)}>Rechazar</button>
                </>
              )}
              {s.puedoCancelar && <button className="btn btn-sm btn-outline" onClick={() => cancelar(s)}>Retirar</button>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Motivo: {s.motivo} · {s.iniciadoPor === 'empresa' ? 'propuesta' : 'pedida'} por {s.solicitadoPor || '—'} el {fmtFechaHora(s.creadaAt)}
              {s.estado === 'pendiente' && !s.puedoResolver && (s.iniciadoPor === 'empresa' ? ' · esperando al trabajador' : ' · esperando a secretaría/dirección')}
              {s.resueltoAt && ` · ${e.t.toLowerCase()} por ${s.resueltoPor || '—'} el ${fmtFechaHora(s.resueltoAt)}`}
              {s.respuesta && ` · «${s.respuesta}»`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Cómputo de un mes (ticket #252): trabajadas frente a contratadas, semana a
// semana, y el informe en PDF de ese mes. Sin 'persona', el del propio trabajador.
function ComputoMes({ persona, fondo = 'var(--bg-2)' }) {
  const [mes, setMes] = useState(hoyISO().slice(0, 7));
  const [c, setC] = useState(null);
  const [verSemanas, setVerSemanas] = useState(false);
  useEffect(() => {
    let vivo = true;
    setC(null);
    fetch(`/api/fichaje/mes?mes=${mes}${persona ? `&persona=${persona}` : ''}`, { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(d => { if (vivo) setC(d); }).catch(() => {});
    return () => { vivo = false; };
  }, [mes, persona]);

  const parcial = c?.jornada === 'parcial';
  const pdf = c ? (persona
    ? `/api/admin/fichajes/informe.pdf?persona=${persona}&desde=${c.desde}&hasta=${c.hasta}`
    : `/api/fichaje/informe.pdf?desde=${c.desde}&hasta=${c.hasta}`) : null;
  const caja = (t, v, color) => (
    <div style={{ flex: '1 1 120px', background: 'var(--bg-3)', borderRadius: 10, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)' }}>{t}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: color || 'var(--ink)' }}>{v}</div>
    </div>
  );

  return (
    <div style={{ background: fondo, border: '1px solid var(--line)', borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 14 }}>Cómputo mensual</b>
        <button className="btn btn-sm btn-outline" onClick={() => setMes(m => moverMes(m, -1))} aria-label="Mes anterior">‹</button>
        <span style={{ fontSize: 13, fontWeight: 700, minWidth: 130, textAlign: 'center', textTransform: 'capitalize' }}>{nombreMes(mes)}</span>
        <button className="btn btn-sm btn-outline" onClick={() => setMes(m => moverMes(m, 1))} disabled={mes >= hoyISO().slice(0, 7)} aria-label="Mes siguiente">›</button>
        <div style={{ flex: 1 }} />
        {pdf && <a className="btn btn-sm btn-outline" href={pdf} target="_blank" rel="noopener noreferrer"><I.Download /> Informe PDF</a>}
      </div>
      {!c && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cargando...</span>}
      {c && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {caja('Trabajadas', horas(c.trabajadas), 'var(--teal)')}
            {caja(c.estado === 'en_curso' ? 'Contratadas hasta hoy' : 'Contratadas', horas(c.contratadas))}
            {c.contratadas != null && c.justificadas > 0 && caja('Festivos y ausencias', horas(c.justificadas))}
            {c.contratadas != null && caja('Ordinarias', horas(c.ordinarias))}
            {c.contratadas != null && caja(parcial ? 'Complementarias' : 'Por encima de jornada', horas(c.complementarias), c.complementarias > 0 ? 'var(--orange)' : null)}
          </div>
          {c.noLaborables?.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              🌴 {c.noLaborables.map(x => `${x.dia.slice(8)}/${x.dia.slice(5, 7)} ${x.motivo}`).join(' · ')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
            <span>{c.horasSemana == null ? 'Sin horas contratadas indicadas: solo se cuentan las trabajadas.' : textoJornada(c.jornada, c.horasSemana)}</span>
            {c.semanas?.length > 0 && <button className="btn btn-sm btn-outline" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setVerSemanas(v => !v)}>{verSemanas ? 'Ocultar semanas' : 'Ver por semanas'}</button>}
          </div>
          {verSemanas && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: 'var(--ink-3)', textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Semana</th>
                    <th style={{ padding: '4px 6px' }}>Contratadas</th>
                    <th style={{ padding: '4px 6px' }}>Festivos/aus.</th>
                    <th style={{ padding: '4px 6px' }}>Trabajadas</th>
                    <th style={{ padding: '4px 6px' }}>{parcial ? 'Complementarias' : 'Exceso'}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.semanas.map(s => (
                    <tr key={s.desde} style={{ borderTop: '1px solid var(--line)', textAlign: 'right' }}>
                      <td style={{ textAlign: 'left', padding: '4px 6px' }}>{s.desde.slice(8)}/{s.desde.slice(5, 7)} – {s.hasta.slice(8)}/{s.hasta.slice(5, 7)}</td>
                      <td style={{ padding: '4px 6px' }}>{c.contratadas == null ? '—' : horas(s.contratadas)}</td>
                      <td style={{ padding: '4px 6px' }}>{c.contratadas == null ? '—' : horas(s.justificadas || 0)}</td>
                      <td style={{ padding: '4px 6px', fontWeight: 700 }}>{horas(s.trabajadas)}</td>
                      <td style={{ padding: '4px 6px', color: s.exceso > 0 ? 'var(--orange)' : undefined }}>{c.contratadas == null ? '—' : horas(s.exceso)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Resúmenes mensuales del propio trabajador, para confirmar que los ha recibido.
function MisResumenes({ resumenes, onCambio, showToast }) {
  async function confirmar(r) {
    if (!window.confirm(`¿Confirmas que has recibido el resumen de horas de ${nombreMes(r.mes)}? Queda registrado.`)) return;
    try { await enviar(`/api/fichaje/resumenes/${r.id}/confirmar`); showToast?.('Recepción confirmada.'); onCambio?.(); }
    catch (err) { alert(err.message); }
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {resumenes.map(r => (
        <div key={r.id} style={{ background: 'var(--bg-2)', border: `1px solid ${r.ultima && !r.confirmadoAt ? '#b45309' : 'var(--line)'}`, borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', opacity: r.ultima ? 1 : 0.65 }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <b style={{ fontSize: 13, textTransform: 'capitalize' }}>{nombreMes(r.mes)}</b>
            {r.version > 1 && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}> · versión {r.version}</span>}
            {!r.ultima && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}> · sustituida</span>}
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {horas(r.ordinarias)} ordinarias · {horas(r.complementarias)} {r.jornada === 'parcial' ? 'complementarias' : 'por encima de jornada'} · {horas(r.trabajadas)} en total
            </div>
          </div>
          <a className="btn btn-sm btn-outline" href={`/api/fichaje/resumenes/${r.id}/pdf`} target="_blank" rel="noopener noreferrer"><I.Download /> PDF</a>
          {r.confirmadoAt
            ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>✓ Recibido el {fmtFechaHora(r.confirmadoAt)}</span>
            : r.ultima && <button className="btn btn-sm btn-primary" onClick={() => confirmar(r)}>Confirmar que lo he recibido</button>}
        </div>
      ))}
    </div>
  );
}

// ── Mi fichaje ───────────────────────────────────────────────────────────────
function MiFichaje({ showToast }) {
  const [est, setEst] = useState(null);
  const [hist, setHist] = useState(null);
  const [sols, setSols] = useState([]);
  const [resumenes, setResumenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [fichando, setFichando] = useState(false);
  const [modal, setModal] = useState(null); // { apunte? }
  const [now, setNow] = useState(Date.now());
  const timer = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const [e, h, s, rs] = await Promise.all([
        fetch('/api/fichaje/estado', { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : null),
        fetch('/api/fichaje/mios', { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : null),
        fetch('/api/fichaje/solicitudes', { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : { solicitudes: [] }),
        fetch('/api/fichaje/resumenes', { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : { resumenes: [] }),
      ]);
      setEst(e); setHist(h); setSols(s.solicitudes || []); setResumenes(rs.resumenes || []);
    } catch { /* noop */ } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Reloj en vivo: cada segundo si está trabajando (para el cronómetro), y cada
  // 30 s en otro caso (para que el aviso de "toca fichar" aparezca solo).
  useEffect(() => {
    clearInterval(timer.current);
    const ms = est?.estado === 'dentro' ? 1000 : 30000;
    timer.current = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer.current);
  }, [est?.estado]);

  async function fichar(tipo) {
    setFichando(true);
    try {
      const d = await enviar('/api/fichaje', { tipo });
      showToast?.(`${BOTON[tipo]}: registrado a las ${fmtHora(d.ts)}.`); await cargar();
    } catch (err) { alert(err.message); } finally { setFichando(false); }
  }

  if (cargando) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>;

  const estado = est?.estado || 'fuera';
  const extra = estado === 'dentro' && est?.trabajandoDesde ? Math.max(0, (now - new Date(est.trabajandoDesde).getTime()) / 1000) : 0;
  const totalHoy = (est?.trabajadoHoySeg || 0) + extra;
  const badge = estado === 'dentro' ? { t: 'Trabajando', c: 'var(--teal)' }
    : estado === 'pausa' ? { t: 'En pausa', c: '#b45309' }
      : { t: 'Fuera', c: 'var(--ink-3)' };

  // Aviso "toca fichar" según los turnos de hoy (mañana y, si hay, tarde): se
  // mira el último turno que ya ha empezado.
  const tramos = Array.isArray(est?.horarioHoy) ? est.horarioHoy : [];
  const nowD = new Date(now);
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
  const actual = [...tramos].reverse().find(t => nowMin >= hm2min(t.entrada));
  let aviso = null;
  // Festivo o ausencia aprobada hoy (#233): no hay que fichar y no se avisa.
  const noLab = est?.noLaborableHoy || null;
  if (actual && !noLab) {
    const turno = tramos.length > 1 ? ` de ${actual.tramo === 2 ? 'tarde' : 'mañana'}` : '';
    if (estado === 'fuera' && nowMin < hm2min(actual.salida)) aviso = `Tu turno${turno} empezó a las ${actual.entrada}. No olvides fichar la entrada.`;
    else if (estado !== 'fuera' && nowMin >= hm2min(actual.salida)) aviso = `Tu turno${turno} terminaba a las ${actual.salida}. No olvides fichar la salida.`;
  }

  const porAprobar = sols.filter(s => s.puedoResolver);
  const otras = sols.filter(s => !s.puedoResolver);
  const sinConfirmar = resumenes.filter(r => r.ultima && !r.confirmadoAt);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {sinConfirmar.length > 0 && (
        <div style={{ display: 'grid', gap: 8, padding: 14, borderRadius: 14, background: 'color-mix(in oklab, #b45309 8%, var(--bg-2))', border: '1px solid color-mix(in oklab, #b45309 35%, var(--line))' }}>
          <b style={{ fontSize: 14 }}>Tienes {sinConfirmar.length === 1 ? 'un resumen de horas' : `${sinConfirmar.length} resúmenes de horas`} por confirmar</b>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Revísalo y confirma que lo has recibido.</span>
          <MisResumenes resumenes={sinConfirmar} onCambio={cargar} showToast={showToast} />
        </div>
      )}

      {/* Correcciones que ha propuesto la empresa: no se aplican sin su aprobación. */}
      {porAprobar.length > 0 && (
        <div style={{ display: 'grid', gap: 8, padding: 14, borderRadius: 14, background: 'color-mix(in oklab, #b45309 8%, var(--bg-2))', border: '1px solid color-mix(in oklab, #b45309 35%, var(--line))' }}>
          <b style={{ fontSize: 14 }}>Tienes {porAprobar.length} corrección{porAprobar.length !== 1 ? 'es' : ''} de tu registro por aprobar</b>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>No se aplican hasta que las apruebes. Si no estás de acuerdo, recházala indicando el motivo.</span>
          <ListaSolicitudes solicitudes={porAprobar} onCambio={cargar} showToast={showToast} />
        </div>
      )}

      {aviso && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', borderRadius: 12, fontSize: 14, fontWeight: 700,
          color: 'var(--orange)', background: 'color-mix(in oklab, var(--orange) 10%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--orange) 35%, var(--line))' }}>
          ⏰ {aviso}
        </div>
      )}
      {noLab && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', borderRadius: 12, fontSize: 14, fontWeight: 700,
          color: 'var(--teal)', background: 'color-mix(in oklab, var(--teal) 10%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--teal) 35%, var(--line))' }}>
          🌴 {noLab.ausencia ? `Hoy tienes ${noLab.ausencia.nombre.toLowerCase()}` : `Hoy es festivo: ${noLab.festivo.nombre}`}. Si aun así trabajas, ficha con normalidad.
        </div>
      )}

      {/* Panel de fichar */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 14, justifyItems: 'center', textAlign: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 14px', borderRadius: 999, color: badge.c, background: `color-mix(in oklab, ${badge.c} 12%, var(--bg-2))` }}>
          ● {badge.t}
        </span>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>{hms(totalHoy)}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: -8 }}>
          trabajado hoy{tramos.length ? ` · horario ${textoTramos(tramos)}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {estado === 'fuera' && (
            <button className="btn btn-primary" onClick={() => fichar('entrada')} disabled={fichando} style={{ fontSize: 15, padding: '12px 24px' }}>{BOTON.entrada}</button>
          )}
          {estado === 'dentro' && (
            <>
              <button className="btn btn-outline" onClick={() => fichar('pausa_inicio')} disabled={fichando}>{BOTON.pausa_inicio}</button>
              <button className="btn btn-primary" onClick={() => fichar('salida')} disabled={fichando} style={{ background: 'var(--orange)' }}>{BOTON.salida}</button>
            </>
          )}
          {estado === 'pausa' && (
            <>
              <button className="btn btn-primary" onClick={() => fichar('pausa_fin')} disabled={fichando}>{BOTON.pausa_fin}</button>
              <button className="btn btn-outline" onClick={() => fichar('salida')} disabled={fichando}>{BOTON.salida}</button>
            </>
          )}
        </div>
      </div>

      <ComputoMes />

      {/* Mi historial */}
      <div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800 }}>Mi registro (últimos 30 días)</h3>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sm btn-outline" onClick={() => setModal({})}><I.Plus /> Añadir un fichaje olvidado</button>
        </div>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--ink-3)' }}>Si un fichaje está mal, púlsalo para pedir que se cambie o se anule.</p>
        {(!hist?.dias || hist.dias.length === 0) && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Todavía no tienes fichajes.</p>}
        <div style={{ display: 'grid', gap: 8 }}>
          {(hist?.dias || []).map(d => <DiaRegistro key={d.dia} d={d} onCorregir={a => setModal({ apunte: a })} />)}
        </div>
      </div>

      {otras.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800 }}>Mis solicitudes de corrección</h3>
          <ListaSolicitudes solicitudes={otras} onCambio={cargar} showToast={showToast} />
        </div>
      )}

      {resumenes.length > sinConfirmar.length && (
        <div>
          <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800 }}>Mis resúmenes mensuales</h3>
          <MisResumenes resumenes={resumenes.filter(r => !(r.ultima && !r.confirmadoAt))} onCambio={cargar} showToast={showToast} />
        </div>
      )}

      {modal && (
        <ModalSolicitud apunte={modal.apunte} esEmpresa={false} onClose={() => setModal(null)}
          onDone={msg => { setModal(null); showToast?.(msg); cargar(); }} />
      )}
    </div>
  );
}

// ── Vacaciones y festivos (ticket #233, chat con el equipo) ──────────────────
const ESTADO_AUS = {
  pendiente: { t: 'Pendiente', c: '#b45309' },
  aprobada: { t: 'Aprobada', c: 'var(--teal)' },
  rechazada: { t: 'Rechazada', c: 'var(--orange)' },
  cancelada: { t: 'Cancelada', c: 'var(--ink-3)' },
};
const fmtDiaCorto = (iso) => new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const textoFechas = (a) => a.desde === a.hasta ? fmtDiaCorto(a.desde) : `${fmtDiaCorto(a.desde)} – ${fmtDiaCorto(a.hasta)} (${a.dias} días)`;

function ListaAusencias({ ausencias, mostrarTrabajador, onCambio, showToast }) {
  async function resolver(a, aprobar) {
    let respuesta = null;
    if (!aprobar) {
      respuesta = window.prompt('¿Por qué la rechazas? (se le envía al trabajador)');
      if (!respuesta || !respuesta.trim()) return;
    } else if (!window.confirm(`¿Aprobar ${a.tipoNombre.toLowerCase()} de ${a.trabajador}: ${textoFechas(a)}?`)) return;
    try { await enviar(`/api/fichaje/ausencias/${a.id}/resolver`, { aprobar, respuesta }); showToast?.(aprobar ? 'Aprobada.' : 'Rechazada.'); onCambio?.(); }
    catch (err) { alert(err.message); }
  }
  async function cancelar(a) {
    let motivo = null;
    if (a.estado === 'aprobada') {
      motivo = window.prompt('¿Por qué se cancela esta ausencia ya aprobada? (queda registrado)');
      if (!motivo || !motivo.trim()) return;
    } else if (!window.confirm('¿Retirar esta petición?')) return;
    try { await enviar(`/api/fichaje/ausencias/${a.id}/cancelar`, { motivo }); showToast?.('Cancelada.'); onCambio?.(); }
    catch (err) { alert(err.message); }
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {ausencias.map(a => {
        const e = ESTADO_AUS[a.estado] || ESTADO_AUS.pendiente;
        return (
          <div key={a.id} style={{ background: 'var(--bg-2)', border: `1px solid ${a.puedoResolver ? '#b45309' : 'var(--line)'}`, borderRadius: 12, padding: '10px 14px', display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: e.c }}>● {e.t}</span>
              {mostrarTrabajador && <b style={{ fontSize: 13 }}>{a.trabajador}</b>}
              <span style={{ fontSize: 13, fontWeight: 700 }}>{a.tipoNombre}</span>
              <span style={{ fontSize: 13, textTransform: 'capitalize' }}>{textoFechas(a)}</span>
              <div style={{ flex: 1 }} />
              {a.puedoResolver && (
                <>
                  <button className="btn btn-sm btn-primary" onClick={() => resolver(a, true)}>Aprobar</button>
                  <button className="btn btn-sm btn-outline" onClick={() => resolver(a, false)}>Rechazar</button>
                </>
              )}
              {a.puedoCancelar && <button className="btn btn-sm btn-outline" onClick={() => cancelar(a)}>{a.estado === 'pendiente' ? 'Retirar' : 'Cancelar'}</button>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {a.notas ? `${a.notas} · ` : ''}{a.iniciadoPor === 'empresa' ? 'registrada' : 'pedida'} por {a.solicitadoPor || '—'} el {fmtFechaHora(a.creadaAt)}
              {a.resueltoAt && a.iniciadoPor !== 'empresa' && ` · ${e.t.toLowerCase()} por ${a.resueltoPor || '—'} el ${fmtFechaHora(a.resueltoAt)}`}
              {a.resueltoAt && a.iniciadoPor === 'empresa' && a.estado === 'cancelada' && ` · cancelada por ${a.resueltoPor || '—'} el ${fmtFechaHora(a.resueltoAt)}`}
              {a.respuesta && ` · «${a.respuesta}»`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Pedir (para uno mismo) o registrar (secretaría, para otra persona) una ausencia.
function ModalAusencia({ tipos, trabajadores, onClose, onDone }) {
  const esEmpresa = !!trabajadores;
  const [f, setF] = useState({ userId: '', tipo: 'vacaciones', desde: hoyISO(), hasta: hoyISO(), notas: '' });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v, ...(k === 'desde' && x.hasta < v ? { hasta: v } : {}) }));
  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      const d = await enviar('/api/fichaje/ausencias', { ...f, userId: esEmpresa ? f.userId : undefined });
      onDone?.(d.estado === 'aprobada' ? 'Ausencia registrada.' : 'Petición enviada. Secretaría o dirección tiene que aprobarla.');
    } catch (err) { alert(err.message); } finally { setGuardando(false); }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={guardar}
        style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 12, width: 'min(460px, 100%)' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{esEmpresa ? 'Registrar una ausencia' : 'Pedir vacaciones o una ausencia'}</h3>
        {esEmpresa && (
          <select value={f.userId} onChange={e => set('userId', e.target.value)} required style={inp}>
            <option value="">¿Quién?...</option>
            {trabajadores.map(t => <option key={t.userId} value={t.userId}>{t.nombre}</option>)}
          </select>
        )}
        <select value={f.tipo} onChange={e => set('tipo', e.target.value)} style={inp}>
          {Object.entries(tipos || {}).map(([v, t]) => <option key={v} value={v}>{t.nombre}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={f.desde} onChange={e => set('desde', e.target.value)} required style={{ ...inp, flex: 1 }} />
          <span style={{ color: 'var(--ink-3)' }}>–</span>
          <input type="date" value={f.hasta} min={f.desde} onChange={e => set('hasta', e.target.value)} required style={{ ...inp, flex: 1 }} />
        </div>
        <textarea placeholder="Notas (opcional)" value={f.notas} onChange={e => set('notas', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
          {esEmpresa ? 'Queda aprobada directamente y se le avisa en su Fichaje.' : 'Secretaría o dirección tendrá que aprobarla. Te llegará la respuesta por correo.'}
          {' '}Esos días no se recuerda fichar{tipos?.[f.tipo]?.justifica ? ' y sus horas previstas cuentan como justificadas' : ''}.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={guardando || (esEmpresa && !f.userId)}>{guardando ? 'Enviando...' : esEmpresa ? 'Registrar' : 'Pedir'}</button>
        </div>
      </form>
    </div>
  );
}

// Saldo de vacaciones de un trabajador en un año (días naturales).
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
function SaldoVacaciones({ s }) {
  const caja = (t, v, color) => (
    <div style={{ flex: '1 1 120px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)' }}>{t}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--ink)' }}>{v}</div>
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {caja(`Te tocan en ${s.anio}`, plural(s.derecho, 'día', 'días'))}
        {caja('Cierres del centro', plural(s.centro, 'día', 'días'))}
        {caja('Tus vacaciones', plural(s.propias, 'día', 'días'))}
        {caja('Te quedan', plural(s.quedan, 'día', 'días'), s.quedan < 0 ? 'var(--orange)' : 'var(--teal)')}
      </div>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        Días naturales.{s.proporcional ? ` Proporcional a los días de alta este año (${s.diasContrato} al año completo).` : ''}
        {s.pendientes > 0 ? ` Además tienes ${plural(s.pendientes, 'día pedido', 'días pedidos')} sin aprobar todavía.` : ''}
        {s.quedan < 0 ? ' Has pasado de los días que te tocan: habla con secretaría.' : ''}
      </span>
    </div>
  );
}

function TablaSaldos({ datos }) {
  const th = { textAlign: 'right', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', padding: '6px 8px' };
  const td = { textAlign: 'right', fontSize: 13, padding: '6px 8px', borderTop: '1px solid var(--line-2)' };
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
      <b style={{ fontSize: 13 }}>Vacaciones de la plantilla en {datos.anio}</b>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>Trabajador</th><th style={th}>Le tocan</th><th style={th}>Cierres</th>
            <th style={th}>Suyas</th><th style={th}>Pedidas</th><th style={th}>Quedan</th>
          </tr></thead>
          <tbody>
            {datos.trabajadores.map(t => (
              <tr key={t.userId}>
                <td style={{ ...td, textAlign: 'left' }}>
                  {t.nombre}
                  {!t.deAlta && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}> · no está de alta este año</span>}
                  {t.deAlta && t.proporcional && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}> · proporcional</span>}
                </td>
                <td style={td}>{t.derecho}</td><td style={td}>{t.centro}</td><td style={td}>{t.propias}</td>
                <td style={{ ...td, color: t.pendientes ? '#b45309' : 'var(--ink-3)' }}>{t.pendientes}</td>
                <td style={{ ...td, fontWeight: 800, color: t.quedan < 0 ? 'var(--orange)' : 'var(--teal)' }}>{t.quedan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        Días naturales. Los días al año, y las fechas de alta y baja para la parte proporcional, se ponen en el
        «Horario» de cada trabajador (Registro del personal).
      </span>
    </div>
  );
}

function VacacionesYFestivos({ showToast, puedeGestionar }) {
  const [anio, setAnio] = useState(Number(hoyISO().slice(0, 4)));
  const [cal, setCal] = useState(null);
  const [mias, setMias] = useState(null);
  const [todas, setTodas] = useState([]);
  const [verTodas, setVerTodas] = useState(false);
  const [trabajadores, setTrabajadores] = useState([]);
  const [modal, setModal] = useState(null); // 'pedir' | 'registrar'
  // Un día suelto o un periodo entero (#256): si "hasta" va vacío, es un solo día.
  const [nuevoFestivo, setNuevoFestivo] = useState({ desde: '', hasta: '', nombre: '', tipo: 'local', restaVacaciones: false });
  // Saldo de vacaciones: el mío y, para quien gestiona, el de toda la plantilla.
  const [miSaldo, setMiSaldo] = useState(null);
  const [saldos, setSaldos] = useState(null);

  const cargar = useCallback(async () => {
    const get = (u) => fetch(u, { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
    const [c, m, t, w, ms, ss] = await Promise.all([
      get(`/api/fichaje/calendario?anio=${anio}`),
      get('/api/fichaje/ausencias'),
      puedeGestionar ? get(`/api/admin/fichajes/ausencias?estado=${verTodas ? 'todas' : 'pendientes'}`) : null,
      puedeGestionar ? get(`/api/admin/fichajes?desde=${hoyISO()}&hasta=${hoyISO()}`) : null,
      get(`/api/fichaje/vacaciones?anio=${anio}`),
      puedeGestionar ? get(`/api/admin/fichajes/vacaciones?anio=${anio}`) : null,
    ]);
    setCal(c); setMias(m); setMiSaldo(ms); setSaldos(ss);
    if (t) setTodas(t.ausencias || []);
    if (w) setTrabajadores((w.trabajadores || []).filter(x => x.enPlantilla));
  }, [anio, verTodas, puedeGestionar]);
  useEffect(() => { cargar(); }, [cargar]);

  async function añadirFestivo(e) {
    e.preventDefault();
    const { desde, nombre, tipo, restaVacaciones } = nuevoFestivo;
    const hasta = nuevoFestivo.hasta || desde;
    try {
      const d = await enviar('/api/admin/fichajes/festivos', { desde, hasta, nombre, tipo, restaVacaciones });
      // Si el periodo pisa festivos que ya estaban (p. ej. Navidad sobre el 25 de
      // diciembre), se dice: pasan a contar como lo que se acaba de marcar.
      if (d.sustituidos?.length) {
        alert(`Guardado. Dentro del periodo había ${d.sustituidos.length} día${d.sustituidos.length === 1 ? '' : 's'} ya marcado${d.sustituidos.length === 1 ? '' : 's'}, que ahora cuenta${d.sustituidos.length === 1 ? '' : 'n'} como «${nombre}»:\n\n`
          + d.sustituidos.map(x => `· ${fmtDiaCorto(x.fecha)}: ${x.nombre} (${x.tipoNombre})`).join('\n'));
      }
      showToast?.(d.dias > 1 ? `Periodo guardado (${d.dias} días).` : 'Día guardado.');
      setNuevoFestivo({ desde: '', hasta: '', nombre: '', tipo, restaVacaciones });
      cargar();
    } catch (err) { alert(err.message); }
  }
  async function quitarPeriodo(p) {
    const cuando = p.desde === p.hasta ? `el ${fmtDiaCorto(p.desde)}` : `del ${fmtDiaCorto(p.desde)} al ${fmtDiaCorto(p.hasta)} (${p.dias} días)`;
    if (!window.confirm(`¿Quitar «${p.nombre}» ${cuando}?`)) return;
    try {
      await enviar(`/api/admin/fichajes/festivos?desde=${p.desde}&hasta=${p.hasta}`, null, 'DELETE');
      showToast?.('Quitado del calendario.'); cargar();
    } catch (err) { alert(err.message); }
  }

  const titulo = (t) => <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800 }}>{t}</h3>;
  const pendientesOtros = todas.filter(a => a.puedoResolver);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {puedeGestionar && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {titulo(<>Vacaciones y ausencias del personal {pendientesOtros.length > 0 && <span style={{ color: '#b45309' }}>· {pendientesOtros.length} por aprobar</span>}</>)}
            <div style={{ flex: 1 }} />
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={verTodas} onChange={e => setVerTodas(e.target.checked)} /> Ver también las pasadas y resueltas
            </label>
            <button className="btn btn-sm btn-primary" onClick={() => setModal('registrar')}><I.Plus /> Registrar ausencia</button>
          </div>
          {todas.length === 0
            ? <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>No hay peticiones pendientes ni ausencias próximas.</p>
            : <ListaAusencias ausencias={todas} mostrarTrabajador onCambio={cargar} showToast={showToast} />}
          {saldos?.trabajadores?.length > 0 && <TablaSaldos datos={saldos} />}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {titulo('Mis vacaciones y ausencias')}
          <div style={{ flex: 1 }} />
          <button className="btn btn-sm btn-outline" onClick={() => setModal('pedir')}><I.Plus /> Pedir vacaciones o ausencia</button>
        </div>
        {miSaldo?.deAlta && <SaldoVacaciones s={miSaldo} />}
        {!(mias?.ausencias || []).length
          ? <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>No tienes vacaciones ni ausencias registradas.</p>
          : <ListaAusencias ausencias={mias.ausencias} onCambio={cargar} showToast={showToast} />}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {titulo('Calendario laboral')}
          <button className="btn btn-sm btn-outline" onClick={() => setAnio(a => a - 1)} aria-label="Año anterior">‹</button>
          <b style={{ fontSize: 14 }}>{anio}</b>
          <button className="btn btn-sm btn-outline" onClick={() => setAnio(a => a + 1)} aria-label="Año siguiente">›</button>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
          Los días que cierra el centro. Esos días no se recuerda fichar a nadie, y <b>las familias los ven en su panel</b> como
          días de cierre. Un <b>festivo</b> (nacional, de Andalucía o local) no son vacaciones del personal; las <b>vacaciones del
          centro</b> (Navidad, Semana Santa…) sí, aunque caiga algún festivo por medio.
        </p>
        {puedeGestionar && (
          <form onSubmit={añadirFestivo} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 10 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--ink-2)' }}>
              Desde
              <input type="date" value={nuevoFestivo.desde} required style={{ ...inp, padding: '6px 8px' }}
                onChange={e => setNuevoFestivo(x => ({ ...x, desde: e.target.value, hasta: x.hasta && x.hasta < e.target.value ? '' : x.hasta }))} />
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--ink-2)' }}>
              Hasta
              <input type="date" value={nuevoFestivo.hasta} min={nuevoFestivo.desde || undefined} style={{ ...inp, padding: '6px 8px' }}
                title="Déjalo vacío si es un solo día"
                onChange={e => setNuevoFestivo(x => ({ ...x, hasta: e.target.value }))} />
            </label>
            <input placeholder="Nombre (p. ej. Vacaciones de Navidad)" value={nuevoFestivo.nombre} onChange={e => setNuevoFestivo(x => ({ ...x, nombre: e.target.value }))} required style={{ ...inp, padding: '6px 8px', flex: '1 1 180px' }} />
            <select value={nuevoFestivo.tipo} style={{ ...inp, padding: '6px 8px' }}
              onChange={e => { const tipo = e.target.value; setNuevoFestivo(x => ({ ...x, tipo, restaVacaciones: (cal?.restanPorDefecto || ['vacaciones']).includes(tipo) })); }}>
              {Object.entries(cal?.tipos || {}).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="submit" className="btn btn-sm btn-primary">Añadir</button>
            {/* Si esos días se restan de las vacaciones de toda la plantilla o no.
                Por defecto, sí en las vacaciones del centro y no en los festivos. */}
            <label style={{ flexBasis: '100%', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              padding: '6px 10px', borderRadius: 10, background: nuevoFestivo.restaVacaciones ? 'color-mix(in oklab, var(--teal) 10%, transparent)' : 'transparent' }}>
              <input type="checkbox" checked={!!nuevoFestivo.restaVacaciones}
                onChange={e => setNuevoFestivo(x => ({ ...x, restaVacaciones: e.target.checked }))} />
              Restar estos días de las vacaciones de todos los trabajadores
            </label>
            <span style={{ flexBasis: '100%', fontSize: 11, color: 'var(--ink-3)' }}>
              «Hasta» vacío = un solo día. Con fecha de fin se marca el periodo entero de una vez. Si se restan, a cada
              trabajador se le descuentan los días naturales del periodo que caigan mientras está de alta.
            </span>
          </form>
        )}
        {!(cal?.periodos || []).length
          ? <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>No hay días de cierre marcados en {anio}.</p>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
              {cal.periodos.map(p => (
                <div key={p.desde} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-2)', border: '1px solid var(--line)', borderLeft: `4px solid ${p.vacacionesPersonal ? 'var(--teal)' : 'var(--orange)'}`, borderRadius: 10, padding: '8px 12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'capitalize' }}>
                      {p.desde === p.hasta ? fmtDiaCorto(p.desde) : `${fmtDiaCorto(p.desde)} – ${fmtDiaCorto(p.hasta)}`}
                      {p.dias > 1 && <span style={{ fontWeight: 600, color: 'var(--ink-3)', textTransform: 'none' }}> · {p.dias} días</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      {p.nombre} · {p.tipoNombre} · <b style={{ color: p.vacacionesPersonal ? 'var(--teal)' : 'var(--ink-3)' }}>{p.vacacionesPersonal ? 'resta vacaciones a la plantilla' : 'no resta vacaciones'}</b>
                    </div>
                  </div>
                  {puedeGestionar && <button className="icon-btn danger" onClick={() => quitarPeriodo(p)} aria-label="Quitar del calendario"><I.X /></button>}
                </div>
              ))}
            </div>
          )}
      </div>

      {modal && (
        <ModalAusencia tipos={mias?.tipos} trabajadores={modal === 'registrar' ? trabajadores : null}
          onClose={() => setModal(null)} onDone={msg => { setModal(null); showToast?.(msg); cargar(); }} />
      )}
    </div>
  );
}

// Importar los horarios de las clases: para cada profe, sus clases asignadas
// se convierten en la plantilla de su horario laboral (se puede editar después).
function ModalImportarHorarios({ onClose, onDone }) {
  const [profes, setProfes] = useState(null);
  const [error, setError] = useState(null);
  const [importando, setImportando] = useState(false);
  useEffect(() => {
    fetch('/api/admin/fichajes/horarios/desde-clases', { credentials: 'include', cache: 'no-store' })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setProfes(d.profes || []); })
      .catch(e => setError(e.message || 'No se pudo cargar.'));
  }, []);
  async function importar() {
    setImportando(true);
    try {
      const d = await enviar('/api/admin/fichajes/horarios/desde-clases', {});
      onDone?.(`Horarios importados: ${d.cambiados} profe${d.cambiados !== 1 ? 's' : ''} actualizado${d.cambiados !== 1 ? 's' : ''}.`);
    } catch (err) { alert(err.message); } finally { setImportando(false); }
  }
  const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const resumen = (dias) => [0, 1, 2, 3, 4, 5, 6].map(d => {
    const t = dias.filter(x => x.dia === d);
    return t.length ? `${DIAS_CORTOS[d]} ${t.map(x => `${x.entrada}–${x.salida}`).join(' y ')}` : null;
  }).filter(Boolean).join(' · ');
  const cambian = (profes || []).filter(p => !p.igual);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 12, width: 'min(640px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Importar horarios de las clases</h3>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
          A cada profe se le pone como horario laboral el de las clases que tiene asignadas (si entre dos clases hay 30 min o menos, cuentan como un mismo bloque).
          Sustituye el horario que tuviera; después se puede editar en «Horario». Es solo el horario previsto: el registro de jornada sigue siendo lo que cada uno ficha.
        </p>
        {!profes && !error && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Calculando...</p>}
        {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--orange)' }}>{error}</p>}
        {profes && profes.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Ningún trabajador tiene clases asignadas en el horario.</p>}
        {(profes || []).map(p => (
          <div key={p.userId} style={{ background: 'var(--bg-3)', borderRadius: 10, padding: '8px 12px', display: 'grid', gap: 3, opacity: p.igual ? 0.6 : 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 13 }}>{p.nombre}</b>
              <span style={{ fontSize: 11, fontWeight: 700, color: p.igual ? 'var(--ink-3)' : p.teniaHorario ? 'var(--orange)' : 'var(--teal)' }}>
                {p.igual ? 'ya lo tiene así' : p.teniaHorario ? 'se sustituye su horario' : 'horario nuevo'}
              </span>
            </div>
            <div style={{ fontSize: 12 }}>{resumen(p.dias)}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{p.clases.join(', ')}</div>
            {p.avisos.map((a, i) => <div key={i} style={{ fontSize: 11, color: '#b45309' }}>⚠ {a}</div>)}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={importar} disabled={importando || !cambian.length}>
            {importando ? 'Importando...' : cambian.length ? `Importar (${cambian.length})` : 'Nada que cambiar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Resúmenes mensuales de horas del personal a tiempo parcial (ticket #252): se
// generan solos el día 1; aquí se ve si se enviaron y si cada uno lo confirmó.
function ResumenesGestion({ showToast }) {
  const [mes, setMes] = useState(moverMes(hoyISO().slice(0, 7), -1));
  const [d, setD] = useState(null);
  const [generando, setGenerando] = useState(false);
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/admin/fichajes/resumenes?mes=${mes}`, { credentials: 'include', cache: 'no-store' });
    setD(r.ok ? await r.json() : { resumenes: [], sinResumen: [] });
  }, [mes]);
  useEffect(() => { cargar(); }, [cargar]);

  async function generar() {
    if (!window.confirm(`¿Generar los resúmenes de ${nombreMes(mes)} del personal a tiempo parcial? Si alguno ya existe y el mes no ha cambiado, no se duplica; si ha cambiado, se crea una versión nueva y se le envía.`)) return;
    setGenerando(true);
    try {
      const r = await enviar('/api/admin/fichajes/resumenes/generar', { mes });
      const nuevos = r.resultado.filter(x => x.nuevo).length;
      const errores = r.resultado.filter(x => x.error);
      showToast?.(`${nuevos} resumen${nuevos !== 1 ? 'es' : ''} nuevo${nuevos !== 1 ? 's' : ''}.${errores.length ? ` ${errores.length} con problemas: ${errores[0].error}` : ''}`);
      cargar();
    } catch (err) { alert(err.message); } finally { setGenerando(false); }
  }
  async function reenviar(r) {
    try { await enviar(`/api/admin/fichajes/resumenes/${r.id}/enviar`); showToast?.('Resumen enviado.'); cargar(); }
    catch (err) { alert(err.message); }
  }

  const futuro = mes >= hoyISO().slice(0, 7);
  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 14 }}>Resúmenes mensuales (tiempo parcial)</b>
        <button className="btn btn-sm btn-outline" onClick={() => setMes(m => moverMes(m, -1))} aria-label="Mes anterior">‹</button>
        <span style={{ fontSize: 13, fontWeight: 700, minWidth: 130, textAlign: 'center', textTransform: 'capitalize' }}>{nombreMes(mes)}</span>
        <button className="btn btn-sm btn-outline" onClick={() => setMes(m => moverMes(m, 1))} disabled={futuro} aria-label="Mes siguiente">›</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-primary" onClick={generar} disabled={generando || futuro}>{generando ? 'Generando...' : 'Generar y enviar'}</button>
      </div>
      {futuro && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>El resumen se genera cuando el mes ha terminado.</span>}
      {d && d.resumenes.length === 0 && d.sinResumen.length === 0 && (
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Nadie tiene jornada a tiempo parcial con horas indicadas. Se indica en el «Horario» de cada trabajador.</span>
      )}
      {d?.resumenes.map(r => (
        <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', background: 'var(--bg-3)', borderRadius: 10, opacity: r.ultima ? 1 : 0.6 }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <b style={{ fontSize: 13 }}>{r.trabajador}</b>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}> · v{r.version}{!r.ultima ? ' (sustituida)' : ''}</span>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{horas(r.ordinarias)} ordinarias · {horas(r.complementarias)} complementarias · {horas(r.trabajadas)} total</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: r.enviadoAt ? 'var(--ink-2)' : 'var(--orange)' }}>
            {r.enviadoAt ? `Enviado ${fmtFechaHora(r.enviadoAt)}` : 'Sin enviar'}
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, color: r.confirmadoAt ? 'var(--teal)' : '#b45309' }}>
            {r.confirmadoAt ? `✓ Confirmado ${fmtFechaHora(r.confirmadoAt)}` : 'Sin confirmar'}
          </span>
          {r.ultima && !r.confirmadoAt && <button className="btn btn-sm btn-outline" onClick={() => reenviar(r)}>{r.enviadoAt ? 'Reenviar' : 'Enviar'}</button>}
          <a className="btn btn-sm btn-outline" href={`/api/fichaje/resumenes/${r.id}/pdf`} target="_blank" rel="noopener noreferrer"><I.Download /> PDF</a>
        </div>
      ))}
      {d?.sinResumen.length > 0 && !futuro && (
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Sin resumen de este mes: {d.sinResumen.map(x => x.nombre).join(', ')}.</span>
      )}
    </div>
  );
}

// Resultado de la comprobación de integridad del registro.
function ModalIntegridad({ onClose }) {
  const [v, setV] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    fetch('/api/admin/fichajes/integridad', { credentials: 'include', cache: 'no-store' })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setV(d); })
      .catch(e => setError(e.message || 'No se pudo comprobar.'));
  }, []);
  const lista = (titulo, items, fmt) => items?.length > 0 && (
    <div style={{ fontSize: 12 }}>
      <b>{titulo}</b>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{items.map((x, i) => <li key={i}>{fmt(x)}</li>)}</ul>
    </div>
  );
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 12, width: 'min(520px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Integridad del registro de jornada</h3>
        {!v && !error && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Comprobando toda la cadena...</p>}
        {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--orange)' }}>{error}</p>}
        {v && (
          <>
            <div style={{ padding: '10px 14px', borderRadius: 12, fontWeight: 800, fontSize: 14,
              color: v.ok ? 'var(--teal)' : 'var(--orange)', background: `color-mix(in oklab, ${v.ok ? 'var(--teal)' : 'var(--orange)'} 10%, var(--bg-2))` }}>
              {v.ok ? '✓ Íntegro: nada se ha modificado ni borrado.' : '⚠ Se han encontrado diferencias.'}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
              {v.eventos} apuntes en la cadena de auditoría · {v.fichajes} fichajes · {v.anulaciones} anulaciones. Cada apunte lleva una huella SHA-256 que incluye la del anterior: si alguien cambiara o borrara algo directamente en la base de datos, se detectaría aquí.
            </p>
            {lista('Apuntes de la cadena alterados', v.roturas, x => `Nº ${x.id} (${x.evento}): ${x.motivo}`)}
            {lista('Fichajes cambiados respecto a su apunte original', v.alterados, x => `Fichaje nº ${x.id}: ${x.campos.join(', ')}`)}
            {lista('Registros sin apunte en la auditoría', v.sinTraza, x => `${x.tipo} nº ${x.id}`)}
            {lista('Registros que han desaparecido', v.desaparecidos, x => `${x.tipo} nº ${x.id}`)}
            {lista('Protecciones de la base de datos desactivadas', v.faltanProtecciones, x => x)}
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Huella actual: <code style={{ wordBreak: 'break-all' }}>{v.cabeza || '—'}</code></div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ── Gestión del personal (secretaría / dirección) ────────────────────────────
function GestionFichajes({ showToast }) {
  const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA'); };
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoyISO());
  const [data, setData] = useState(null);
  const [sols, setSols] = useState([]);
  const [verTodas, setVerTodas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);
  const [modal, setModal] = useState(null);     // { destino, apunte? }
  const [horario, setHorario] = useState(null); // { userId, nombre, contrato:{jornada,horasSemana}, dias:[{dia,trabaja,m:{},tarde,t:{}}] }
  const [integridad, setIntegridad] = useState(false);
  const [importar, setImportar] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const p = new URLSearchParams();
      if (desde) p.set('desde', desde);
      if (hasta) p.set('hasta', hasta);
      const [r, s] = await Promise.all([
        fetch(`/api/admin/fichajes?${p}`, { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/admin/fichajes/solicitudes?estado=${verTodas ? 'todas' : 'pendientes'}`, { credentials: 'include', cache: 'no-store' }),
      ]);
      if (r.ok) setData(await r.json());
      if (s.ok) setSols((await s.json()).solicitudes || []);
    } catch { /* noop */ } finally { setCargando(false); }
  }, [desde, hasta, verTodas]);
  useEffect(() => { cargar(); }, [cargar]);

  const exportUrl = () => {
    const p = new URLSearchParams();
    if (desde) p.set('desde', desde); if (hasta) p.set('hasta', hasta);
    return `/api/admin/fichajes/export.csv?${p}`;
  };

  async function abrirHorario(t) {
    const r = await fetch(`/api/admin/fichajes/horario/${t.userId}`, { credentials: 'include', cache: 'no-store' });
    const d = await r.json().catch(() => ({ dias: [] }));
    const dias = [0, 1, 2, 3, 4, 5, 6].map(dia => {
      const m = (d.dias || []).find(x => x.dia === dia && Number(x.tramo || 1) === 1);
      const t2 = (d.dias || []).find(x => x.dia === dia && Number(x.tramo) === 2);
      return { dia, trabaja: !!m, m: { entrada: m?.entrada || '', salida: m?.salida || '' }, tarde: !!t2, t: { entrada: t2?.entrada || '', salida: t2?.salida || '' } };
    });
    setHorario({
      userId: t.userId, nombre: t.nombre, dias,
      contrato: {
        jornada: d.contrato?.jornada || 'completa', horasSemana: d.contrato?.horasSemana == null ? '' : String(d.contrato.horasSemana),
        vacacionesDias: d.contrato?.vacacionesDias == null ? '30' : String(d.contrato.vacacionesDias),
        fechaAlta: d.contrato?.fechaAlta || '', fechaBaja: d.contrato?.fechaBaja || '',
      },
    });
  }
  const setDia = (i, cambio) => setHorario(h => ({ ...h, dias: h.dias.map((x, j) => j === i ? { ...x, ...cambio } : x) }));
  async function guardarHorario(e) {
    e.preventDefault();
    const dias = [];
    for (const d of horario.dias) {
      if (!d.trabaja || !d.m.entrada || !d.m.salida) continue;
      dias.push({ dia: d.dia, tramo: 1, entrada: d.m.entrada, salida: d.m.salida });
      if (d.tarde && d.t.entrada && d.t.salida) dias.push({ dia: d.dia, tramo: 2, entrada: d.t.entrada, salida: d.t.salida });
    }
    try {
      await enviar(`/api/admin/fichajes/horario/${horario.userId}`, { dias, contrato: horario.contrato }, 'PUT');
      showToast?.('Horario y jornada guardados.'); setHorario(null); cargar();
    } catch (err) { alert(err.message); }
  }

  const pendientes = sols.filter(s => s.estado === 'pendiente');

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Solicitudes de corrección */}
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800 }}>
            Correcciones {pendientes.length > 0 && <span style={{ color: '#b45309' }}>· {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''}</span>}
          </h3>
          <div style={{ flex: 1 }} />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={verTodas} onChange={e => setVerTodas(e.target.checked)} /> Ver también las resueltas
          </label>
        </div>
        {sols.length === 0
          ? <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>{verTodas ? 'No hay solicitudes de corrección.' : 'No hay correcciones pendientes.'}</p>
          : <ListaSolicitudes solicitudes={sols} mostrarTrabajador onCambio={cargar} showToast={showToast} />}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 16px' }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>Desde</label>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', fontFamily: 'inherit' }} />
        <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>Hasta</label>
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', fontFamily: 'inherit' }} />
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-outline" onClick={() => setImportar(true)} title="Pone a cada profe el horario de sus clases como plantilla">Importar horarios de las clases</button>
        <button className="btn btn-sm btn-outline" onClick={() => setIntegridad(true)}>Comprobar integridad</button>
        <a className="btn btn-sm btn-outline" href={exportUrl()} target="_blank" rel="noopener noreferrer"><I.Download /> Exportar CSV (Excel)</a>
      </div>

      <ResumenesGestion showToast={showToast} />

      {cargando && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
      {!cargando && (data?.trabajadores || []).length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>No hay personal para mostrar.</div>
      )}

      {(data?.trabajadores || []).map(t => (
        <div key={t.userId} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', cursor: 'pointer', flexWrap: 'wrap' }}
            onClick={() => setAbierto(abierto === t.userId ? null : t.userId)}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{t.nombre}
                {t.estado === 'dentro' && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: 'var(--teal)' }}>● trabajando</span>}
                {t.estado === 'pausa' && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: '#b45309' }}>● en pausa</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {t.enPlantilla ? (t.rol || 'Personal') : <span style={{ color: 'var(--orange)', fontWeight: 700 }}>Ya no está en el club (se conserva su registro)</span>}
                {t.jornada && ` · ${textoJornada(t.jornada, t.horasSemana)}`}
              </div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--teal)' }}>{hms(t.totalSeg)}</span>
            <a className="btn btn-sm btn-outline" onClick={e => e.stopPropagation()} target="_blank" rel="noopener noreferrer"
              href={`/api/admin/fichajes/informe.pdf?persona=${t.userId}&desde=${desde || ''}&hasta=${hasta || ''}`}><I.Download /> PDF</a>
            {t.enPlantilla && <button className="btn btn-sm btn-outline" onClick={e => { e.stopPropagation(); abrirHorario(t); }}>Horario</button>}
            <button className="btn btn-sm btn-outline" onClick={e => { e.stopPropagation(); setModal({ destino: t }); }}>Añadir fichaje</button>
            <I.Chevron style={{ transform: abierto === t.userId ? 'rotate(180deg)' : 'none', transition: 'transform .15s', color: 'var(--ink-3)' }} />
          </div>
          {abierto === t.userId && (
            <div style={{ borderTop: '1px solid var(--line)', padding: 14, display: 'grid', gap: 8 }}>
              <ComputoMes persona={t.userId} fondo="var(--bg-3)" />
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Pulsa un fichaje para proponer que se cambie o se anule. El trabajador tendrá que aprobarlo.</p>
              {t.dias.length === 0 && <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13 }}>Sin fichajes en este periodo.</p>}
              {t.dias.map(d => <DiaRegistro key={d.dia} d={d} fondo="var(--bg-3)" onCorregir={a => setModal({ destino: t, apunte: a })} />)}
            </div>
          )}
        </div>
      ))}

      {modal && (
        <ModalSolicitud destino={modal.destino} apunte={modal.apunte} esEmpresa onClose={() => setModal(null)}
          onDone={msg => { setModal(null); showToast?.(msg); cargar(); }} />
      )}

      {integridad && <ModalIntegridad onClose={() => setIntegridad(false)} />}
      {importar && <ModalImportarHorarios onClose={() => setImportar(false)} onDone={msg => { setImportar(false); showToast?.(msg); cargar(); }} />}

      {/* Horario laboral: mañana y, si hace falta, tarde. Base de los recordatorios. */}
      {horario && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={() => setHorario(null)}>
          <form onClick={e => e.stopPropagation()} onSubmit={guardarHorario}
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 10, width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Horario laboral · {horario.nombre}</h3>
            <div style={{ display: 'grid', gap: 8, padding: '10px 12px', background: 'var(--bg-3)', borderRadius: 12 }}>
              <b style={{ fontSize: 13 }}>Jornada contratada</b>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {[['completa', 'Completa'], ['parcial', 'Tiempo parcial']].map(([v, l]) => (
                  <button key={v} type="button" className={`filter-pill ${horario.contrato.jornada === v ? 'is-active' : ''}`}
                    onClick={() => setHorario(h => ({ ...h, contrato: { ...h.contrato, jornada: v } }))}>{l}</button>
                ))}
                <input type="number" min="0.5" max="60" step="0.25" placeholder="h/semana" value={horario.contrato.horasSemana}
                  required={horario.contrato.jornada === 'parcial'}
                  onChange={e => { const v = e.target.value; setHorario(h => ({ ...h, contrato: { ...h.contrato, horasSemana: v } })); }}
                  style={{ ...inp, padding: '6px 8px', width: 100 }} />
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>horas a la semana</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                Con las horas contratadas se calculan cada mes las horas ordinarias y las complementarias. A tiempo parcial, el día 1 se le genera y envía su resumen del mes anterior para que confirme que lo ha recibido.
              </span>
            </div>
            {/* Vacaciones: días naturales al año y fechas de alta y baja. */}
            <div style={{ display: 'grid', gap: 8, padding: '10px 12px', background: 'var(--bg-3)', borderRadius: 12 }}>
              <b style={{ fontSize: 13 }}>Vacaciones</b>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-2)' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="number" min="0" max="60" step="1" value={horario.contrato.vacacionesDias}
                    onChange={e => { const v = e.target.value; setHorario(h => ({ ...h, contrato: { ...h.contrato, vacacionesDias: v } })); }}
                    style={{ ...inp, padding: '6px 8px', width: 70 }} />
                  días naturales al año
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  Alta
                  <input type="date" value={horario.contrato.fechaAlta}
                    onChange={e => { const v = e.target.value; setHorario(h => ({ ...h, contrato: { ...h.contrato, fechaAlta: v } })); }}
                    style={{ ...inp, padding: '6px 8px' }} />
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  Baja
                  <input type="date" value={horario.contrato.fechaBaja} min={horario.contrato.fechaAlta || undefined}
                    onChange={e => { const v = e.target.value; setHorario(h => ({ ...h, contrato: { ...h.contrato, fechaBaja: v } })); }}
                    style={{ ...inp, padding: '6px 8px' }} />
                </label>
              </div>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                30 es el mínimo legal. Si entra o sale a mitad de año, le toca la parte proporcional a los días de alta
                (redondeando a su favor). Sin fecha de alta se entiende que está todo el año.
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Marca los días que trabaja con su turno de mañana y, si también trabaja por la tarde, añade el turno de tarde. Con esto se le recuerda por correo y en la app que fiche.</p>
            {horario.dias.map((d, i) => (
              <div key={d.dia} style={{ display: 'grid', gap: 6, paddingBottom: 8, borderBottom: '1px solid var(--line-2)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', width: 110, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    <input type="checkbox" checked={d.trabaja} onChange={e => setDia(i, { trabaja: e.target.checked })} />
                    {DIAS_SEMANA[d.dia]}
                  </label>
                  {d.trabaja && (
                    <>
                      <span style={{ fontSize: 12, color: 'var(--ink-3)', width: 52 }}>Mañana</span>
                      <input type="time" value={d.m.entrada} required onChange={e => setDia(i, { m: { ...d.m, entrada: e.target.value } })} style={{ ...inp, padding: '6px 8px' }} />
                      <span style={{ color: 'var(--ink-3)' }}>–</span>
                      <input type="time" value={d.m.salida} required onChange={e => setDia(i, { m: { ...d.m, salida: e.target.value } })} style={{ ...inp, padding: '6px 8px' }} />
                      {!d.tarde && <button type="button" className="btn btn-sm btn-outline" style={{ fontSize: 11 }} onClick={() => setDia(i, { tarde: true })}>+ Tarde</button>}
                    </>
                  )}
                </div>
                {d.trabaja && d.tarde && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingLeft: 118 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)', width: 52 }}>Tarde</span>
                    <input type="time" value={d.t.entrada} required onChange={e => setDia(i, { t: { ...d.t, entrada: e.target.value } })} style={{ ...inp, padding: '6px 8px' }} />
                    <span style={{ color: 'var(--ink-3)' }}>–</span>
                    <input type="time" value={d.t.salida} required onChange={e => setDia(i, { t: { ...d.t, salida: e.target.value } })} style={{ ...inp, padding: '6px 8px' }} />
                    <button type="button" className="icon-btn danger" onClick={() => setDia(i, { tarde: false, t: { entrada: '', salida: '' } })} aria-label="Quitar tarde"><I.X /></button>
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-outline" onClick={() => setHorario(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const inp = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' };
