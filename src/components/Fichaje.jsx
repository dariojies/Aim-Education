import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Registro de jornada / fichaje (ticket #233). Cada trabajador ficha su jornada
// (entrada, pausas y salida) y ve su registro; secretaría/dirección ve el de
// todos, corrige olvidos y exporta para la Inspección. La hora la pone siempre
// el servidor; aquí solo se pintan botones y el cronómetro en vivo.
// ─────────────────────────────────────────────────────────────────────────────

const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
const fmtHora = (ts) => ts ? new Date(ts).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) : '';
const fmtDia = (d) => new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const hms = (seg) => {
  seg = Math.max(0, Math.round(seg));
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
};
const ETQ = { entrada: 'Entrada', salida: 'Salida', pausa_inicio: 'Inicio de pausa', pausa_fin: 'Fin de pausa' };
const COLOR_TIPO = { entrada: 'var(--teal)', salida: 'var(--orange)', pausa_inicio: '#FFD526', pausa_fin: 'var(--teal)' };
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']; // 0 = lunes
const hm2min = (s) => { const [h, m] = String(s || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

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

// ── Mi fichaje ───────────────────────────────────────────────────────────────
function MiFichaje({ showToast }) {
  const [est, setEst] = useState(null);
  const [hist, setHist] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [fichando, setFichando] = useState(false);
  const [now, setNow] = useState(Date.now());
  const timer = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const [e, h] = await Promise.all([
        fetch('/api/fichaje/estado', { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : null),
        fetch('/api/fichaje/mios', { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : null),
      ]);
      setEst(e); setHist(h);
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
      const r = await fetch('/api/fichaje', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ tipo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d.error || 'No se pudo fichar.'); }
      else { showToast?.(`${ETQ[tipo]} fichada a las ${fmtHora(d.ts)}.`); await cargar(); }
    } catch { alert('Error de conexión.'); } finally { setFichando(false); }
  }

  if (cargando) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>;

  const estado = est?.estado || 'fuera';
  const extra = estado === 'dentro' && est?.trabajandoDesde ? Math.max(0, (now - new Date(est.trabajandoDesde).getTime()) / 1000) : 0;
  const totalHoy = (est?.trabajadoHoySeg || 0) + extra;
  const badge = estado === 'dentro' ? { t: 'Trabajando', c: 'var(--teal)' }
    : estado === 'pausa' ? { t: 'En pausa', c: '#b45309' }
      : { t: 'Fuera', c: 'var(--ink-3)' };

  // Aviso "toca fichar" según su horario laboral de hoy.
  const hh = est?.horarioHoy;
  const nowD = new Date(now);
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
  let aviso = null;
  if (hh) {
    if (estado === 'fuera' && nowMin >= hm2min(hh.entrada)) aviso = `Tu jornada de hoy empieza a las ${hh.entrada}. No olvides fichar tu entrada.`;
    else if ((estado === 'dentro' || estado === 'pausa') && nowMin >= hm2min(hh.salida)) aviso = `Tu jornada de hoy terminaba a las ${hh.salida}. No olvides fichar tu salida.`;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
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
          trabajado hoy{hh ? ` · horario ${hh.entrada}–${hh.salida}` : ''}
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

      {/* Apuntes de hoy */}
      {est?.apuntesHoy?.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>Hoy:</span>
          {est.apuntesHoy.map(a => (
            <span key={a.id} style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--bg-3)' }}>
              <span style={{ color: COLOR_TIPO[a.tipo] }}>{ETQ[a.tipo]}</span> {fmtHora(a.ts)}{a.corregido ? ' ✎' : ''}
            </span>
          ))}
        </div>
      )}

      {/* Mi historial */}
      <div>
        <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800 }}>Mi registro (últimos 30 días)</h3>
        {(!hist?.dias || hist.dias.length === 0) && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Todavía no tienes fichajes.</p>}
        <div style={{ display: 'grid', gap: 8 }}>
          {(hist?.dias || []).map(d => (
            <div key={d.dia} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13, textTransform: 'capitalize' }}>{fmtDia(d.dia)}</b>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal)' }}>{hms(d.segundos)}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {d.apuntes.map(a => (
                  <span key={a.id} title={a.motivo || ''} style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                    <span style={{ color: COLOR_TIPO[a.tipo], fontWeight: 700 }}>{ETQ[a.tipo]}</span> {fmtHora(a.ts)}{a.corregido ? ' ✎' : ''}
                  </span>
                )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={'s' + i} style={{ color: 'var(--line)' }}>·</span>, el], [])}
              </div>
            </div>
          ))}
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
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);
  const [corr, setCorr] = useState(null); // { userId, nombre, tipo, fecha, hora, motivo }
  const [horario, setHorario] = useState(null); // { userId, nombre, dias:[{dia,trabaja,entrada,salida}] }

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const p = new URLSearchParams();
      if (desde) p.set('desde', desde);
      if (hasta) p.set('hasta', hasta);
      const r = await fetch(`/api/admin/fichajes?${p}`, { credentials: 'include', cache: 'no-store' });
      if (r.ok) setData(await r.json());
    } catch { /* noop */ } finally { setCargando(false); }
  }, [desde, hasta]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardarCorreccion(e) {
    e.preventDefault();
    const r = await fetch('/api/admin/fichajes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(corr),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { showToast?.('Corrección registrada.'); setCorr(null); cargar(); }
    else alert(d.error || 'No se pudo guardar.');
  }

  async function anular(a) {
    const motivo = window.prompt('Motivo de la anulación de este apunte:');
    if (!motivo || !motivo.trim()) return;
    const r = await fetch(`/api/admin/fichajes/${a.id}/anular`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ motivo: motivo.trim() }),
    });
    if (r.ok) { showToast?.('Apunte anulado.'); cargar(); }
    else alert((await r.json().catch(() => ({}))).error || 'No se pudo.');
  }

  const exportUrl = () => {
    const p = new URLSearchParams();
    if (desde) p.set('desde', desde); if (hasta) p.set('hasta', hasta);
    return `/api/admin/fichajes/export.csv?${p}`;
  };

  async function abrirHorario(t) {
    const r = await fetch(`/api/admin/fichajes/horario/${t.userId}`, { credentials: 'include', cache: 'no-store' });
    const d = await r.json().catch(() => ({ dias: [] }));
    const byDia = {};
    (d.dias || []).forEach(x => { byDia[x.dia] = { entrada: x.entrada, salida: x.salida }; });
    const dias = [0, 1, 2, 3, 4, 5, 6].map(dia => ({ dia, trabaja: !!byDia[dia], entrada: byDia[dia]?.entrada || '', salida: byDia[dia]?.salida || '' }));
    setHorario({ userId: t.userId, nombre: t.nombre, dias });
  }
  async function guardarHorario(e) {
    e.preventDefault();
    const dias = horario.dias.filter(d => d.trabaja && d.entrada && d.salida).map(d => ({ dia: d.dia, entrada: d.entrada, salida: d.salida }));
    const r = await fetch(`/api/admin/fichajes/horario/${horario.userId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ dias }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { showToast?.('Horario guardado.'); setHorario(null); cargar(); }
    else alert(d.error || 'No se pudo guardar.');
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
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
            <button className="btn btn-sm btn-outline" onClick={e => { e.stopPropagation(); setCorr({ userId: t.userId, nombre: t.nombre, tipo: 'entrada', fecha: hoyISO(), hora: '', motivo: '' }); }}>Corregir</button>
            <I.Chevron style={{ transform: abierto === t.userId ? 'rotate(180deg)' : 'none', transition: 'transform .15s', color: 'var(--ink-3)' }} />
          </div>
          {abierto === t.userId && (
            <div style={{ borderTop: '1px solid var(--line)', padding: 14, display: 'grid', gap: 8 }}>
              {t.dias.length === 0 && <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13 }}>Sin fichajes en este periodo.</p>}
              {t.dias.map(d => (
                <div key={d.dia} style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 13, textTransform: 'capitalize' }}>{fmtDia(d.dia)}</b>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal)' }}>{hms(d.segundos)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                    {d.apuntes.map(a => (
                      <span key={a.id} title={a.motivo || ''} style={{ fontSize: 11, display: 'inline-flex', gap: 4, alignItems: 'center', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
                        <span style={{ color: COLOR_TIPO[a.tipo], fontWeight: 700 }}>{ETQ[a.tipo]}</span> {fmtHora(a.ts)}{a.corregido ? ' ✎' : ''}
                        <button onClick={() => anular(a)} title="Anular este apunte" style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--orange)', padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Corrección manual */}
      {corr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={() => setCorr(null)}>
          <form onClick={e => e.stopPropagation()} onSubmit={guardarCorreccion}
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 12, width: 'min(440px, 100%)' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Corregir fichaje · {corr.nombre}</h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Se añade un apunte a mano (p. ej. un olvido). Queda registrado como corrección con su motivo.</p>
            <select value={corr.tipo} onChange={e => setCorr(c => ({ ...c, tipo: e.target.value }))} style={inp}>
              {Object.entries(ETQ).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={corr.fecha} onChange={e => setCorr(c => ({ ...c, fecha: e.target.value }))} required style={{ ...inp, flex: 1 }} />
              <input type="time" value={corr.hora} onChange={e => setCorr(c => ({ ...c, hora: e.target.value }))} required style={{ ...inp, flex: 1 }} />
            </div>
            <input placeholder="Motivo de la corrección" value={corr.motivo} onChange={e => setCorr(c => ({ ...c, motivo: e.target.value }))} required style={inp} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" onClick={() => setCorr(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={!corr.hora || !corr.motivo.trim()}>Guardar</button>
            </div>
          </form>
        </div>
      )}

      {/* Horario laboral del trabajador: base de los recordatorios de fichaje. */}
      {horario && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={() => setHorario(null)}>
          <form onClick={e => e.stopPropagation()} onSubmit={guardarHorario}
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 10, width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Horario laboral · {horario.nombre}</h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Marca los días que trabaja y su hora de entrada y salida. Con esto se le recuerda por correo y en la app que fiche. Un día sin marcar = no trabaja.</p>
            {horario.dias.map((d, i) => (
              <div key={d.dia} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', width: 120, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  <input type="checkbox" checked={d.trabaja} onChange={e => setHorario(h => ({ ...h, dias: h.dias.map((x, j) => j === i ? { ...x, trabaja: e.target.checked } : x) }))} />
                  {DIAS_SEMANA[d.dia]}
                </label>
                <input type="time" value={d.entrada} disabled={!d.trabaja} required={d.trabaja}
                  onChange={e => setHorario(h => ({ ...h, dias: h.dias.map((x, j) => j === i ? { ...x, entrada: e.target.value } : x) }))}
                  style={{ ...inp, flex: 1, opacity: d.trabaja ? 1 : 0.5, padding: '7px 9px' }} />
                <span style={{ color: 'var(--ink-3)' }}>–</span>
                <input type="time" value={d.salida} disabled={!d.trabaja} required={d.trabaja}
                  onChange={e => setHorario(h => ({ ...h, dias: h.dias.map((x, j) => j === i ? { ...x, salida: e.target.value } : x) }))}
                  style={{ ...inp, flex: 1, opacity: d.trabaja ? 1 : 0.5, padding: '7px 9px' }} />
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
