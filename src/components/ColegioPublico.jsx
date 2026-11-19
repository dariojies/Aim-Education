import React, { useEffect, useMemo, useState } from 'react';
import { AimLogo } from './Shared.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// La página de un colegio (#652), con su enlace (/colegio/<clave>): ve la oferta
// de actividades del club y los huecos libres, pide una actividad un día de tal
// a tal hora, y contesta a lo que le propone el club (aceptar u otro día). No
// hace falta cuenta. No sale en los buscadores.
// ─────────────────────────────────────────────────────────────────────────────

const aMin = (h) => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
const aHora = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const conMayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const fechaLarga = (f) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const duracionTexto = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);

// ── Elegir día y horas dentro de los huecos libres ──
// huecos: { 'AAAA-MM-DD': [{ desde, hasta }] }. valor: { fecha, desde, hasta }.
export function ElegirHueco({ huecos, valor, onCambio, duracion = 60, libre = false }) {
  const fechas = Object.keys(huecos || {}).sort();
  const primerMes = (valor?.fecha || fechas[0] || new Date().toISOString().slice(0, 10)).slice(0, 7);
  const [mes, setMes] = useState(primerMes);
  const [anio, m] = mes.split('-').map(Number);
  const diasMes = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  const hueco1 = (new Date(Date.UTC(anio, m - 1, 1)).getUTCDay() + 6) % 7;
  const mover = (n) => { const d = new Date(Date.UTC(anio, m - 1 + n, 1)); setMes(d.toISOString().slice(0, 7)); };
  const hayAntes = fechas.some(f => f.slice(0, 7) < mes), hayDespues = fechas.some(f => f.slice(0, 7) > mes);
  const tramos = valor?.fecha ? (huecos?.[valor.fecha] || []) : [];

  function elegirDia(f) {
    const t = huecos[f]?.[0];
    if (!t) return;
    const ini = aMin(t.desde), fin = Math.min(aMin(t.hasta), ini + duracion);
    onCambio({ fecha: f, desde: aHora(ini), hasta: aHora(fin) });
  }
  // Las horas posibles: en el tramo donde cae la hora de empezar, de 15 en 15 minutos.
  const tramo = tramos.find(t => valor?.desde && aMin(valor.desde) >= aMin(t.desde) && aMin(valor.desde) < aMin(t.hasta)) || tramos[0];
  const empiezos = [], finales = [];
  for (const t of tramos) for (let x = aMin(t.desde); x <= aMin(t.hasta) - 15; x += 15) empiezos.push(aHora(x));
  if (tramo && valor?.desde) for (let x = aMin(valor.desde) + 15; x <= aMin(tramo.hasta); x += 15) finales.push(aHora(x));
  const cambiarEmpieza = (d) => {
    const t = tramos.find(x => aMin(d) >= aMin(x.desde) && aMin(d) < aMin(x.hasta));
    const dur = valor?.hasta && valor?.desde ? aMin(valor.hasta) - aMin(valor.desde) : duracion;
    onCambio({ ...valor, desde: d, hasta: aHora(Math.min(aMin(t.hasta), aMin(d) + Math.max(15, dur))) });
  };

  const celda = { aspectRatio: '1', borderRadius: 10, border: 0, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, display: 'grid', placeItems: 'center' };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 8, maxWidth: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" className="btn btn-outline btn-sm" disabled={!hayAntes} onClick={() => mover(-1)} aria-label="Mes anterior">‹</button>
          <b style={{ textTransform: 'capitalize' }}>{MESES[m - 1]} {anio}</b>
          <button type="button" className="btn btn-outline btn-sm" disabled={!hayDespues} onClick={() => mover(1)} aria-label="Mes siguiente">›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {DIAS.map(d => <span key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, color: 'var(--ink-3)' }}>{d}</span>)}
          {Array.from({ length: hueco1 }, (_, i) => <span key={`v${i}`} />)}
          {Array.from({ length: diasMes }, (_, i) => {
            const f = `${mes}-${String(i + 1).padStart(2, '0')}`;
            const hay = !!huecos?.[f], elegido = valor?.fecha === f;
            return (
              <button key={f} type="button" disabled={!hay} onClick={() => elegirDia(f)} aria-pressed={elegido}
                aria-label={`${fechaLarga(f)}${hay ? '' : ' (no hay hueco)'}`}
                style={{ ...celda, cursor: hay ? 'pointer' : 'default',
                  background: elegido ? 'var(--ink)' : hay ? 'color-mix(in oklab, var(--teal) 16%, var(--bg-2))' : 'transparent',
                  color: elegido ? 'var(--bg)' : hay ? 'var(--ink)' : 'var(--ink-3)', opacity: hay || elegido ? 1 : 0.45 }}>
                {i + 1}
              </button>
            );
          })}
        </div>
        {!fechas.length && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Ahora mismo no hay días libres. Escribidnos y lo vemos.</span>}
      </div>
      {valor?.fecha && (
        <div style={{ display: 'grid', gap: 10 }}>
          <b>{conMayuscula(fechaLarga(valor.fecha))}</b>
          {tramos.length > 0 && (
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              Libre: {tramos.map(t => `de ${t.desde} a ${t.hasta}`).join(' y ')}
            </span>
          )}
          {libre ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label className="field" style={{ margin: 0 }}><span style={{ fontSize: 12, fontWeight: 700 }}>Empieza</span>
                <input type="time" step="900" value={valor.desde || ''} onChange={e => onCambio({ ...valor, desde: e.target.value })} /></label>
              <label className="field" style={{ margin: 0 }}><span style={{ fontSize: 12, fontWeight: 700 }}>Termina</span>
                <input type="time" step="900" value={valor.hasta || ''} onChange={e => onCambio({ ...valor, hasta: e.target.value })} /></label>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, fontWeight: 700 }}>Empieza</span>
                <select value={valor.desde || ''} onChange={e => cambiarEmpieza(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 15, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
                  {empiezos.map(h => <option key={h} value={h}>{h}</option>)}
                </select></label>
              <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, fontWeight: 700 }}>Termina</span>
                <select value={valor.hasta || ''} onChange={e => onCambio({ ...valor, hasta: e.target.value })} style={{ fontFamily: 'inherit', fontSize: 15, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
                  {finales.map(h => <option key={h} value={h}>{h}</option>)}
                </select></label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const COLOR_ESTADO = { solicitada: 'var(--purple)', propuesta: 'var(--orange)', confirmada: 'var(--teal)', rechazada: 'var(--ink-3)', cancelada: 'var(--ink-3)' };
const TEXTO_ESTADO = {
  solicitada: 'Pedida: esperando nuestra respuesta',
  propuesta: 'Os la proponemos: ¿os viene bien?',
  confirmada: 'Confirmada',
  rechazada: 'Ese día no podemos',
  cancelada: 'Anulada',
};

export default function ColegioPublico({ token }) {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null); // { actividadId, fecha, desde, hasta, mensaje, cambia, titulo }
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState('');

  const cargar = () => fetch(`/api/colegio/${encodeURIComponent(token)}`, { cache: 'no-store' })
    .then(async r => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error || 'Este enlace no funciona.'))))
    .then(x => { setD(x); document.title = `${x.colegio.nombre} · Actividades de AIM Education`; })
    .catch(e => setD({ error: e.message }));
  useEffect(() => {
    document.title = 'Actividades para colegios · AIM Education';
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m);
    cargar();
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const actividad = useMemo(() => d?.oferta?.find(o => o.id === form?.actividadId) || null, [d, form?.actividadId]);
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const activas = (d?.citas || []).filter(c => ['propuesta', 'solicitada', 'confirmada'].includes(c.estado) && c.fecha >= hoy);
  const anteriores = (d?.citas || []).filter(c => !activas.includes(c));

  async function post(url, cuerpo) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo || {}) });
    const x = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(x.error || 'No se ha podido hacer.');
    return x;
  }
  async function pedir() {
    setError('');
    if (!form?.actividadId) return setError('Elegid la actividad.');
    if (!form.fecha || !form.desde || !form.hasta) return setError('Elegid el día y las horas.');
    setEnviando(true);
    try {
      await post(`/api/colegio/${encodeURIComponent(token)}/pedir`, { actividadId: form.actividadId, fecha: form.fecha, desde: form.desde, hasta: form.hasta, mensaje: form.mensaje, cambia: form.cambia || undefined });
      setHecho(form.cambia ? 'Os hemos pasado vuestra propuesta. Os contestamos enseguida por correo.' : '¡Pedido! Os contestamos enseguida por correo.');
      setForm(null);
      await cargar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setError(e.message); await cargar(); }
    finally { setEnviando(false); }
  }
  async function accion(c, que) {
    setError(''); setHecho('');
    if (que === 'anular' && !window.confirm(`¿Anular ${c.actividad} del ${fechaLarga(c.fecha)}?`)) return;
    try {
      await post(`/api/colegio/${encodeURIComponent(token)}/citas/${c.id}/${que}`);
      setHecho(que === 'aceptar' ? '¡Cita confirmada! Os llega también por correo.' : 'Cita anulada.');
      await cargar();
    } catch (e) { setError(e.message); }
  }
  const otroDia = (c) => {
    setHecho(''); setError('');
    setForm({ actividadId: c.actividadId || d.oferta[0]?.id, fecha: '', desde: '', hasta: '', mensaje: '', cambia: c.id, titulo: `Otro día para ${c.actividad}` });
    setTimeout(() => document.getElementById('pedir')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const cabecera = (
    <header style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-2)' }}>
      <a href="/" aria-label="AIM Education"><AimLogo size="sm" /></a>
      <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>Actividades para colegios</span>
    </header>
  );
  if (!d) return <>{cabecera}<div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-3)' }}>Cargando…</div></>;
  if (d.error) return (
    <>{cabecera}
      <div style={{ padding: '80px 20px', textAlign: 'center', display: 'grid', gap: 10 }}>
        <b style={{ fontSize: 20 }}>{d.error}</b>
        <span style={{ color: 'var(--ink-3)' }}>Escribidnos a info@aimeducation.es o llamad al 956 742 216.</span>
      </div>
    </>
  );

  const tarjetaCita = (c, conAcciones) => (
    <div key={c.id} className="panel" style={{ margin: 0, padding: 16, display: 'grid', gap: 8, borderLeft: `4px solid ${COLOR_ESTADO[c.estado] || 'var(--line)'}` }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: COLOR_ESTADO[c.estado] || 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{TEXTO_ESTADO[c.estado] || c.nombreEstado}</span>
      <b style={{ fontSize: 17 }}>{c.actividad}</b>
      <span>{conMayuscula(fechaLarga(c.fecha))} · {c.desde} a {c.hasta}</span>
      {c.origen === 'club' && c.mensaje && <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>«{c.mensaje}»</span>}
      {c.respuesta && <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>Nota: «{c.respuesta}»</span>}
      {conAcciones && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {c.estado === 'propuesta' && <button type="button" className="btn btn-primary btn-sm" onClick={() => accion(c, 'aceptar')}>Nos viene bien, aceptar</button>}
          {['propuesta', 'solicitada', 'confirmada'].includes(c.estado) && <button type="button" className="btn btn-outline btn-sm" onClick={() => otroDia(c)}>Proponer otro día</button>}
          {c.estado === 'rechazada' && <button type="button" className="btn btn-primary btn-sm" onClick={() => otroDia(c)}>Elegir otro día</button>}
          {['solicitada', 'confirmada', 'propuesta'].includes(c.estado) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => accion(c, 'anular')}>Anular</button>}
        </div>
      )}
    </div>
  );
  const rechazadasSinCambiar = anteriores.filter(c => c.estado === 'rechazada' && c.fecha >= hoy);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {cabecera}
      <main style={{ maxWidth: 880, margin: '0 auto', padding: '28px 18px 60px', display: 'grid', gap: 28 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', color: 'var(--purple)', textTransform: 'uppercase' }}>{d.colegio.nombre}</span>
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 5vw, 36px)', lineHeight: 1.1 }}>Actividades de AIM Education en vuestro colegio</h1>
          <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 16 }}>
            {d.colegio.contacto ? `Hola, ${d.colegio.contacto}. ` : ''}Elegid una actividad, el día y las horas que os vengan bien, y os contestamos enseguida.
            Solo salen los días en los que podemos ir.
          </p>
        </div>

        {hecho && <div role="status" style={{ padding: '12px 14px', borderRadius: 12, background: 'color-mix(in oklab, var(--teal) 14%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--teal) 35%, transparent)', fontWeight: 700 }}>{hecho}</div>}
        {error && !form && <div role="alert" style={{ padding: '12px 14px', borderRadius: 12, background: 'color-mix(in oklab, var(--orange) 12%, var(--bg-2))', fontWeight: 700 }}>{error}</div>}

        {(activas.length > 0 || rechazadasSinCambiar.length > 0) && (
          <section style={{ display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Vuestras citas</h2>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {[...rechazadasSinCambiar, ...activas].map(c => tarjetaCita(c, true))}
            </div>
          </section>
        )}

        <section id="pedir" style={{ display: 'grid', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{form?.titulo || 'Pedir una actividad'}</h2>
          {!d.oferta.length ? (
            <p style={{ color: 'var(--ink-3)' }}>Estamos preparando la oferta. Escribidnos a info@aimeducation.es y os contamos.</p>
          ) : (
            <>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {d.oferta.map(o => {
                  const el = form?.actividadId === o.id;
                  return (
                    <button key={o.id} type="button" aria-pressed={el}
                      onClick={() => setForm(f => ({ fecha: '', desde: '', hasta: '', mensaje: '', ...(f || {}), actividadId: o.id }))}
                      style={{ textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', padding: 16, borderRadius: 14, display: 'grid', gap: 6, alignContent: 'start',
                        background: el ? 'color-mix(in oklab, var(--purple) 10%, var(--bg-2))' : 'var(--bg-2)',
                        border: el ? '2px solid var(--purple)' : '1px solid var(--line)', color: 'var(--ink)' }}>
                      <b style={{ fontSize: 16 }}>{o.titulo}</b>
                      {o.descripcion && <span style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>{o.descripcion}</span>}
                      <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}>Unas {duracionTexto(o.duracion)}</span>
                    </button>
                  );
                })}
              </div>
              {form?.actividadId && (
                <div className="panel" style={{ margin: 0, padding: 18, display: 'grid', gap: 16 }}>
                  <b>¿Qué día y a qué hora?</b>
                  <ElegirHueco huecos={d.huecos} valor={form} duracion={actividad?.duracion || 60} onCambio={v => setForm(f => ({ ...f, ...v }))} />
                  <label className="field" style={{ margin: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>¿Algo que debamos saber? (opcional)</span>
                    <textarea rows={3} maxLength={2000} value={form.mensaje || ''} onChange={e => setForm(f => ({ ...f, mensaje: e.target.value }))}
                      placeholder="Cuántos alumnos sois, de qué curso, dónde se hará…" />
                  </label>
                  {error && <p role="alert" style={{ margin: 0, color: 'var(--orange)', fontWeight: 700 }}>{error}</p>}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary" disabled={enviando || !form.fecha} onClick={pedir}>
                      {enviando ? 'Enviando…' : form.cambia ? 'Proponer este día' : 'Pedir esta actividad'}
                    </button>
                    {form.cambia && <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancelar</button>}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {anteriores.filter(c => !rechazadasSinCambiar.includes(c)).length > 0 && (
          <section style={{ display: 'grid', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 17, color: 'var(--ink-2)' }}>Anteriores</h2>
            <div style={{ display: 'grid', gap: 6 }}>
              {anteriores.filter(c => !rechazadasSinCambiar.includes(c)).map(c => (
                <div key={c.id} style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                  <b>{c.actividad}</b> · <span>{fechaLarga(c.fecha)}</span> · {c.desde} a {c.hasta} · {TEXTO_ESTADO[c.estado] || c.nombreEstado}
                </div>
              ))}
            </div>
          </section>
        )}

        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>¿Dudas? Escribidnos a <a href="mailto:info@aimeducation.es">info@aimeducation.es</a> o llamad al 956 742 216.</p>
      </main>
    </div>
  );
}
