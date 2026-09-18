import React, { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Ajustes de facturación: formato de la numeración y vaciado de las pruebas.
//
// El club emitirá con una numeración propia (del tipo 2026000946 y
// R-202600001) que aún está por confirmar. Aquí se configura el formato y el
// número por el que arranca cada serie, para que ese día no haya que tocar
// código. Y, por una vez, se pueden borrar las facturas de prueba para empezar
// de cero con la numeración buena.
// ─────────────────────────────────────────────────────────────────────────────

const SERIES = [['A', 'Facturas'], ['R', 'Rectificativas']];

export default function BillingAjustes({ showToast }) {
  const [datos, setDatos] = useState(null);
  const [formato, setFormato] = useState(null);
  const [siguiente, setSiguiente] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [confirmacion, setConfirmacion] = useState('');
  const [vaciando, setVaciando] = useState(false);
  const [corte, setCorte] = useState(null);       // día de corte del alta (#289)
  const [guardandoCorte, setGuardandoCorte] = useState(false);
  const [vf, setVf] = useState(null);            // VERI*FACTU (#232)
  const [guardandoVf, setGuardandoVf] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/billing/numeracion', { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      setDatos(d);
      setFormato(d.formato);
      setSiguiente(d.siguiente);
      const c = await fetch('/api/admin/billing/config', { credentials: 'include', cache: 'no-store' });
      if (c.ok) setCorte(await c.json());
      const v = await fetch('/api/admin/billing/verifactu', { credentials: 'include', cache: 'no-store' });
      if (v.ok) setVf(await v.json());
    } catch { /* noop */ }
  }, []);

  // Día de corte del alta (ticket #289): hasta ese día, mes en curso; a partir
  // de él, mes siguiente.
  async function guardarCorte(dia) {
    setGuardandoCorte(true);
    try {
      const r = await fetch('/api/admin/billing/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ diaCorteAlta: dia }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
      setCorte(d);
      showToast?.('Día de corte guardado.');
    } catch (e) { alert(e.message); } finally { setGuardandoCorte(false); }
  }

  // VERI*FACTU (ticket #232): modo, entorno y datos del sistema de facturación.
  async function guardarVf(cambios) {
    setGuardandoVf(true);
    try {
      const r = await fetch('/api/admin/billing/verifactu', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...vf, ...cambios }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
      setVf(x => ({ ...x, ...d }));
      showToast?.('Ajustes de VERI*FACTU guardados.');
      cargar();
    } catch (e) { alert(e.message); } finally { setGuardandoVf(false); }
  }

  async function enviarAhora() {
    setEnviando(true);
    try {
      const r = await fetch('/api/admin/billing/verifactu/enviar', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      showToast?.(d.enviados ? `${d.enviados} registro(s) enviados a la AEAT.` : `No se ha enviado nada: ${d.motivo || d.error || 'sin detalle'}.`);
      cargar();
    } catch (e) { alert(e.message); } finally { setEnviando(false); }
  }
  useEffect(() => { cargar(); }, [cargar]);

  // Cómo se vería el próximo número con lo que hay escrito ahora mismo.
  function ejemplo(serie) {
    const f = formato?.[serie] || {};
    const n = Number(siguiente?.[serie]) || 1;
    const anio = f.anio ? new Date().getFullYear() : '';
    const sec = f.digitos > 0 ? String(n).padStart(f.digitos, '0') : String(n);
    return `${f.prefijo || ''}${anio}${sec}`;
  }

  async function guardar() {
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/billing/numeracion', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ formato, siguiente }),
      });
      const d = await r.json();
      if (r.ok) { showToast?.('Numeración guardada.'); await cargar(); }
      else alert(d.error || 'No se pudo guardar.');
    } catch { alert('Error de conexión.'); }
    finally { setGuardando(false); }
  }

  async function vaciar() {
    if (!window.confirm(
      'Se van a BORRAR todas las facturas, rectificativas, su registro y los arqueos de caja.\n\n' +
      'Los conceptos cobrados vuelven a quedar pendientes, así que no se pierde lo que cada cliente debe.\n' +
      'No se tocan alumnos, clases, matrículas ni gastos.\n\n' +
      'Esto no tiene vuelta atrás. ¿Continuar?')) return;
    setVaciando(true);
    try {
      const r = await fetch('/api/admin/billing/vaciar-pruebas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ confirmacion }),
      });
      const d = await r.json();
      if (r.ok) {
        showToast?.(`Facturación vaciada: ${d.borrados.recibos} factura(s) y ${d.borrados.registro} asiento(s).`);
        setConfirmacion('');
        await cargar();
      } else alert(d.error || 'No se pudo vaciar.');
    } catch { alert('Error de conexión.'); }
    finally { setVaciando(false); }
  }

  if (!datos || !formato) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>;
  const totalEmitidas = Object.values(datos.emitidas || {}).reduce((s, n) => s + n, 0);

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 720 }}>
      {/* Día de corte del alta (ticket #289) */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Alta a mitad de mes</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
            Cuando se apunta a alguien a una clase, hasta este día se le cobra la mensualidad del mes en curso.
            A partir de él, la del mes siguiente. La inscripción no lleva mes: se cobra al entrar.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 700 }}>Día de corte</label>
          <input type="number" min="1" max="28" value={corte?.diaCorteAlta ?? 20} disabled={guardandoCorte}
            onChange={e => setCorte(c => ({ ...c, diaCorteAlta: Number(e.target.value) }))}
            style={{ width: 80, fontFamily: 'inherit', fontSize: 14, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }} />
          <button className="btn btn-sm btn-primary" disabled={guardandoCorte || !corte?.diaCorteAlta} onClick={() => guardarCorte(Number(corte.diaCorteAlta))}>Guardar</button>
          {corte?.mesDeAltaHoy && (
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Hoy, a quien se apunte se le cobraría <b>{new Date(corte.mesDeAltaHoy + 'T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</b>.
            </span>
          )}
        </div>
      </div>

      {/* VERI*FACTU (ticket #232) */}
      {vf && (
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>VERI*FACTU (AEAT)</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
              Con esto encendido, cada factura genera su registro oficial encadenado, sale con el QR tributario
              y se remite a la AEAT. Los registros se generan siempre; el envío necesita el certificado digital.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {[['apagado', 'Apagado'], ['verifactu', 'VERI*FACTU encendido']].map(([v, l]) => (
              <button key={v} className={`filter-pill ${vf.modo === v ? 'is-active' : ''}`} disabled={guardandoVf}
                onClick={() => guardarVf({ modo: v })}>{l}</button>
            ))}
            <span style={{ width: 12 }} />
            {[['pruebas', 'Entorno de pruebas'], ['produccion', 'Producción']].map(([v, l]) => (
              <button key={v} className={`filter-pill ${vf.entorno === v ? 'is-active' : ''}`} disabled={guardandoVf}
                onClick={() => guardarVf({ entorno: v })}>{l}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[['Registros', vf.registros], ['Pendientes de enviar', vf.pendientes], ['Enviados', vf.enviados], ['Con error', vf.errores]].map(([t, v]) => (
              <div key={t} style={{ flex: '1 1 120px', background: 'var(--bg-3)', borderRadius: 10, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)' }}>{t}</div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{v ?? 0}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
            <span style={{ fontWeight: 700, color: vf.certificado ? 'var(--teal)' : 'var(--orange)' }}>
              {vf.certificado ? '✓ Certificado configurado' : '⚠ Sin certificado: los registros se quedan en cola'}
            </span>
            <span style={{ color: 'var(--ink-3)' }}>
              El certificado se pone en Heroku (VERIFACTU_CERT_P12 y VERIFACTU_CERT_PASS), nunca aquí.
            </span>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm btn-outline" disabled={enviando || !vf.pendientes} onClick={enviarAhora}>
              {enviando ? 'Enviando...' : 'Enviar pendientes'}
            </button>
          </div>

          {vf.ultimas?.length > 0 && (
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-2)' }}>Últimos registros</div>
              {vf.ultimas.map(u => (
                <div key={u.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, padding: '4px 8px', background: 'var(--bg-3)', borderRadius: 8 }}>
                  <b style={{ minWidth: 90 }}>{u.numero}</b>
                  <span style={{ color: 'var(--ink-3)' }}>{u.fecha}</span>
                  <span>{Number(u.total).toFixed(2)} €</span>
                  <span style={{ fontWeight: 700, color: u.estado === 'enviado' ? 'var(--teal)' : u.estado === 'error' ? 'var(--orange)' : 'var(--ink-3)' }}>
                    {{ enviado: 'enviado', error: 'error', pendiente: 'en cola', no_aplica: 'solo guardado' }[u.estado] || u.estado}
                  </span>
                  <div style={{ flex: 1 }} />
                  <span title={u.huella} style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--ink-3)' }}>{String(u.huella || '').slice(0, 12)}…</span>
                  <a className="btn btn-sm btn-outline" style={{ fontSize: 10, padding: '2px 6px' }}
                    href={`/api/admin/billing/verifactu/${u.id}/xml`} target="_blank" rel="noopener noreferrer">XML</a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Numeración de facturas</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
            Cómo se numeran las facturas que se emiten. Cuando tengáis los números definitivos, se ponen aquí:
            no hace falta tocar nada más.
          </p>
        </div>

        {SERIES.map(([serie, etiqueta]) => (
          <div key={serie} style={{ display: 'grid', gap: 8, padding: 12, background: 'var(--bg-3)', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>{etiqueta}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {datos.emitidas?.[serie] ? `${datos.emitidas[serie]} emitida(s)` : 'ninguna emitida'}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>La siguiente sería</span>
              <code style={{ fontWeight: 800, fontSize: 14, color: 'var(--purple)', background: 'var(--bg-2)', padding: '2px 10px', borderRadius: 6 }}>{ejemplo(serie)}</code>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              <label style={{ fontSize: 12, display: 'grid', gap: 4 }}>
                <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>Prefijo</span>
                <input value={formato[serie].prefijo} placeholder="(ninguno)"
                  onChange={e => setFormato(f => ({ ...f, [serie]: { ...f[serie], prefijo: e.target.value } }))}
                  style={inp} />
              </label>
              <label style={{ fontSize: 12, display: 'grid', gap: 4 }}>
                <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>Dígitos</span>
                <input type="number" min="0" max="12" value={formato[serie].digitos}
                  onChange={e => setFormato(f => ({ ...f, [serie]: { ...f[serie], digitos: Number(e.target.value) || 0 } }))}
                  style={inp} />
              </label>
              <label style={{ fontSize: 12, display: 'grid', gap: 4 }}>
                <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>Empieza en</span>
                <input type="number" min="1" value={siguiente[serie] ?? 1}
                  onChange={e => setSiguiente(s => ({ ...s, [serie]: Number(e.target.value) || 1 }))}
                  style={inp} />
              </label>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'flex-end', gap: 6, paddingBottom: 8 }}>
                <input type="checkbox" checked={!!formato[serie].anio}
                  onChange={e => setFormato(f => ({ ...f, [serie]: { ...f[serie], anio: e.target.checked } }))} />
                <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>Lleva el año</span>
              </label>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            El número de inicio solo se puede cambiar si no hay ya una factura con ese número o mayor.
          </span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sm btn-primary" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando...' : 'Guardar numeración'}
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--bg-2)', border: '1px solid color-mix(in oklab, var(--orange) 40%, var(--line))', borderRadius: 16, padding: 16, display: 'grid', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--orange)' }}>Vaciar la facturación de pruebas</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            Para empezar de cero con la numeración real. Borra <b>las {totalEmitidas} factura(s) emitidas</b>, sus
            rectificativas, el registro encadenado y los arqueos de caja, y reinicia la numeración.
            Los conceptos que estuvieran cobrados <b>vuelven a quedar pendientes</b>, así que no se pierde lo que
            cada cliente debe. No se tocan alumnos, clases, matrículas ni gastos.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>
            Solo debe hacerse una vez, antes de emitir facturas de verdad. No tiene vuelta atrás.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={confirmacion} onChange={e => setConfirmacion(e.target.value)}
            placeholder="Escribe: VACIAR FACTURACION"
            style={{ ...inp, flex: 1, minWidth: 220 }} />
          <button className="btn btn-sm" style={{ background: 'var(--orange)', color: 'white' }}
            disabled={vaciando || confirmacion !== 'VACIAR FACTURACION'} onClick={vaciar}>
            {vaciando ? 'Vaciando...' : 'Vaciar'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = {
  fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', minWidth: 0,
};
