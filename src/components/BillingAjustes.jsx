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

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/billing/numeracion', { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      setDatos(d);
      setFormato(d.formato);
      setSiguiente(d.siguiente);
    } catch { /* noop */ }
  }, []);
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
