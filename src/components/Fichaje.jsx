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

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {puedeGestionar && (
        <div style={{ display: 'flex', gap: 8 }}>
          {[['mi', 'Mi fichaje'], ['gestion', 'Registro del personal']].map(([id, l]) => (
            <button key={id} className={`filter-pill ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)} style={{ borderRadius: 8, padding: '8px 16px' }}>{l}</button>
          ))}
        </div>
      )}
      {tab === 'mi' && <MiFichaje showToast={showToast} />}
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
    ? { accion: 'modificar', tipo: apunte.tipo, fecha: isoDeTs(apunte.ts), hora: fmtHora(apunte.ts), motivo: '' }
    : { accion: 'alta', tipo: 'entrada', fecha: hoyISO(), hora: '', motivo: '' });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      await enviar('/api/fichaje/solicitudes', {
        userId: esEmpresa ? destino.userId : undefined,
        accion: f.accion, fichajeId: apunte?.id, tipo: f.tipo, fecha: f.fecha, hora: f.hora, motivo: f.motivo,
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

// ── Mi fichaje ───────────────────────────────────────────────────────────────
function MiFichaje({ showToast }) {
  const [est, setEst] = useState(null);
  const [hist, setHist] = useState(null);
  const [sols, setSols] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [fichando, setFichando] = useState(false);
  const [modal, setModal] = useState(null); // { apunte? }
  const [now, setNow] = useState(Date.now());
  const timer = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const [e, h, s] = await Promise.all([
        fetch('/api/fichaje/estado', { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : null),
        fetch('/api/fichaje/mios', { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : null),
        fetch('/api/fichaje/solicitudes', { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : { solicitudes: [] }),
      ]);
      setEst(e); setHist(h); setSols(s.solicitudes || []);
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
      showToast?.(`${ETQ[tipo]} fichada a las ${fmtHora(d.ts)}.`); await cargar();
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
  if (actual) {
    const turno = tramos.length > 1 ? ` de ${actual.tramo === 2 ? 'tarde' : 'mañana'}` : '';
    if (estado === 'fuera' && nowMin < hm2min(actual.salida)) aviso = `Tu turno${turno} empezó a las ${actual.entrada}. No olvides fichar la entrada.`;
    else if (estado !== 'fuera' && nowMin >= hm2min(actual.salida)) aviso = `Tu turno${turno} terminaba a las ${actual.salida}. No olvides fichar la salida.`;
  }

  const porAprobar = sols.filter(s => s.puedoResolver);
  const otras = sols.filter(s => !s.puedoResolver);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
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
            <button className="btn btn-primary" onClick={() => fichar('entrada')} disabled={fichando} style={{ fontSize: 15, padding: '12px 24px' }}>Fichar entrada</button>
          )}
          {estado === 'dentro' && (
            <>
              <button className="btn btn-outline" onClick={() => fichar('pausa_inicio')} disabled={fichando}>Iniciar pausa</button>
              <button className="btn btn-primary" onClick={() => fichar('salida')} disabled={fichando} style={{ background: 'var(--orange)' }}>Fichar salida</button>
            </>
          )}
          {estado === 'pausa' && (
            <>
              <button className="btn btn-primary" onClick={() => fichar('pausa_fin')} disabled={fichando}>Reanudar</button>
              <button className="btn btn-outline" onClick={() => fichar('salida')} disabled={fichando}>Fichar salida</button>
            </>
          )}
        </div>
      </div>

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

      {modal && (
        <ModalSolicitud apunte={modal.apunte} esEmpresa={false} onClose={() => setModal(null)}
          onDone={msg => { setModal(null); showToast?.(msg); cargar(); }} />
      )}
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
  const [horario, setHorario] = useState(null); // { userId, nombre, dias:[{dia,trabaja,m:{},tarde,t:{}}] }

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
    setHorario({ userId: t.userId, nombre: t.nombre, dias });
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
      await enviar(`/api/admin/fichajes/horario/${horario.userId}`, { dias }, 'PUT');
      showToast?.('Horario guardado.'); setHorario(null);
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
        <a className="btn btn-sm btn-outline" href={exportUrl()} target="_blank" rel="noopener noreferrer"><I.Download /> Exportar CSV</a>
      </div>

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
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.rol || 'Personal'}</div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--teal)' }}>{hms(t.totalSeg)}</span>
            <button className="btn btn-sm btn-outline" onClick={e => { e.stopPropagation(); abrirHorario(t); }}>Horario</button>
            <button className="btn btn-sm btn-outline" onClick={e => { e.stopPropagation(); setModal({ destino: t }); }}>Añadir fichaje</button>
            <I.Chevron style={{ transform: abierto === t.userId ? 'rotate(180deg)' : 'none', transition: 'transform .15s', color: 'var(--ink-3)' }} />
          </div>
          {abierto === t.userId && (
            <div style={{ borderTop: '1px solid var(--line)', padding: 14, display: 'grid', gap: 8 }}>
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

      {/* Horario laboral: mañana y, si hace falta, tarde. Base de los recordatorios. */}
      {horario && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={() => setHorario(null)}>
          <form onClick={e => e.stopPropagation()} onSubmit={guardarHorario}
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 10, width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Horario laboral · {horario.nombre}</h3>
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
              <button type="submit" className="btn btn-primary">Guardar horario</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const inp = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' };
