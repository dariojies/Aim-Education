import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { fmtFecha, fmtFechaHora, fmtHora } from '../fechas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Arqueo de caja: cierre de cada día.
//
// Enfrenta lo que debería haber según los cobros con lo que hay de verdad al
// contar, medio a medio, y deja por escrito el descuadre y un comentario del
// día. El esperado se congela al cerrar: si más tarde se emite un rectificativo
// de ese día, el arqueo firmado no cambia.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => `${Number(n ?? 0).toFixed(2)} €`;
const ETIQUETA = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', bizum: 'Bizum', transferencia: 'Transferencia' };
const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function BillingArqueo({ showToast }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [datos, setDatos] = useState(null);
  const [contado, setContado] = useState({});
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [verDetalle, setVerDetalle] = useState(false);
  // Caja de efectivo (#323): con qué se abrió el día y cuánto se lleva al banco.
  const [fondo, setFondo] = useState('');
  const [banco, setBanco] = useState('');
  const [verHistCaja, setVerHistCaja] = useState(false);

  const cargar = useCallback(async (f) => {
    try {
      const r = await fetch(`/api/admin/billing/arqueo?fecha=${f}`, { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      setDatos(d);
      // Si el día ya se cerró se recupera el recuento; si no, se parte de lo
      // esperado, que suele ser lo que hay salvo en efectivo.
      const base = {};
      for (const m of d.medios) base[m] = d.cerrado ? Number(d.cerrado.contado?.[m] ?? 0) : d.esperado[m].neto;
      setContado(base);
      setComentario(d.cerrado?.comentario || '');
      const cg = d.caja?.guardada;
      setFondo(String(cg ? cg.fondo : (d.caja?.fondoAnterior ?? 0)));
      setBanco(String(cg ? cg.banco : 0));
    } catch { /* noop */ }
  }, []);

  const cargarHistorico = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/billing/arqueos', { credentials: 'include' });
      if (r.ok) setHistorico(await r.json());
    } catch { /* noop */ }
  }, []);

  useEffect(() => { cargar(fecha); }, [fecha, cargar]);
  useEffect(() => { cargarHistorico(); }, [cargarHistorico]);

  const medios = datos?.medios || [];
  const descuadres = useMemo(() => {
    if (!datos) return {};
    const d = {};
    for (const m of medios) d[m] = Number((Number(contado[m] || 0) - datos.esperado[m].neto).toFixed(2));
    return d;
  }, [datos, contado, medios]);
  const totalContado = medios.reduce((s, m) => s + Number(contado[m] || 0), 0);
  const descuadreTotal = Number((totalContado - (datos?.totalEsperado ?? 0)).toFixed(2));

  // Un día que aún no ha llegado no tiene caja que contar, así que no se puede
  // ni mirar ni cerrar: si se cerrara, taparía los cobros que se hagan ese día.
  const esFuturo = fecha > hoyISO();

  // La caja de efectivo: lo que hay = con lo que se abrió + lo contado en efectivo.
  const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
  const cajaTotal = r2(Number(fondo || 0) + Number(contado.efectivo || 0));
  const cajaQueda = r2(cajaTotal - Number(banco || 0));
  const cajaMal = Number(banco || 0) < 0 || Number(fondo || 0) < 0 || cajaQueda < 0;
  // Historial de caja hasta el día que se mira (de más antiguo a más reciente).
  const histCaja = useMemo(() => historico
    .filter(h => h.caja && String(h.fecha).slice(0, 10) <= fecha)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))), [historico, fecha]);
  const mesSel = fecha.slice(0, 7);
  const bancoMes = r2(histCaja.filter(h => String(h.fecha).slice(0, 7) === mesSel).reduce((s, h) => s + Number(h.caja.banco || 0), 0));

  function moverDia(delta) {
    const d = new Date(fecha + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    const nueva = d.toISOString().slice(0, 10);
    if (nueva > hoyISO()) return;
    setFecha(nueva);
  }

  async function cerrar() {
    if (fecha > hoyISO()) return alert('Ese día todavía no ha llegado: no se puede cerrar la caja de una fecha futura.');
    if (Math.abs(descuadreTotal) > 0 && !comentario.trim()) {
      if (!window.confirm(`Hay un descuadre de ${eur(descuadreTotal)} y no has escrito ningún comentario.\n¿Cerrar el día igualmente?`)) return;
    }
    if (cajaMal) return alert('Revisa la caja de efectivo: no se puede llevar al banco más de lo que hay.');
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/billing/arqueo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ fecha, contado, comentario, caja: { fondo: Number(fondo || 0), banco: Number(banco || 0) } }),
      });
      const d = await r.json();
      if (r.ok) {
        showToast?.(`Caja del ${fmtFecha(fecha)} cerrada${d.descuadre ? ` · descuadre ${eur(d.descuadre)}` : ' sin descuadre'}. Quedan ${eur(cajaQueda)} en caja.`);
        await cargar(fecha); await cargarHistorico();
        // Al cerrar, el historial de caja hasta ese día (#323).
        setVerHistCaja(true);
      } else alert(d.error || 'No se pudo guardar el arqueo.');
    } catch { alert('Error de conexión.'); }
    finally { setGuardando(false); }
  }

  // Documento del cierre, para imprimir o guardar en PDF.
  function imprimir() {
    if (!datos) return;
    const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const filas = medios.map(m => `
      <tr>
        <td>${ETIQUETA[m] || m}</td>
        <td class="n">${eur(datos.esperado[m].cobrado)}</td>
        <td class="n">${datos.esperado[m].devuelto ? '−' + eur(datos.esperado[m].devuelto) : '—'}</td>
        <td class="n"><b>${eur(datos.esperado[m].neto)}</b></td>
        <td class="n">${eur(contado[m] || 0)}</td>
        <td class="n ${descuadres[m] ? (descuadres[m] < 0 ? 'mal' : 'sobra') : ''}">${descuadres[m] ? (descuadres[m] > 0 ? '+' : '') + eur(descuadres[m]) : '—'}</td>
      </tr>`).join('');
    const html = `
      <style>
        #print-arqueo { font-family: sans-serif; color: #222; padding: 24px; max-width: 780px; }
        #print-arqueo h1 { color: #5233A8; border-bottom: 2px solid #5233A8; padding-bottom: 8px; margin: 0 0 4px; font-size: 22px; }
        #print-arqueo .meta { color: #666; font-size: 12px; margin: 0 0 18px; }
        #print-arqueo table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px; }
        #print-arqueo th { text-align: left; background: #f3f0fa; color: #5233A8; padding: 7px 8px; border-bottom: 2px solid #5233A8; }
        #print-arqueo td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; }
        #print-arqueo .n { text-align: right; white-space: nowrap; }
        #print-arqueo .mal { color: #c0392b; font-weight: bold; }
        #print-arqueo .sobra { color: #7d3c98; font-weight: bold; }
        #print-arqueo tfoot td { border-top: 2px solid #5233A8; font-weight: bold; background: #faf9ff; }
        #print-arqueo .coment { border: 1px solid #ddd; border-radius: 6px; padding: 10px; font-size: 13px; min-height: 40px; white-space: pre-wrap; }
        #print-arqueo .firma { margin-top: 34px; display: flex; justify-content: space-between; font-size: 12px; color: #666; }
      </style>
      <h1>Cierre de caja — ${fmtFecha(fecha)}</h1>
      <p class="meta">Aim Education · ${datos.detalle.length} movimiento${datos.detalle.length !== 1 ? 's' : ''} · impreso el ${fmtFechaHora(new Date())}</p>
      <table>
        <thead><tr><th>Medio de pago</th><th class="n">Cobrado</th><th class="n">Devuelto</th><th class="n">Debe haber</th><th class="n">Hay</th><th class="n">Descuadre</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr>
          <td>TOTAL</td><td class="n"></td><td class="n"></td>
          <td class="n">${eur(datos.totalEsperado)}</td>
          <td class="n">${eur(totalContado)}</td>
          <td class="n ${descuadreTotal ? (descuadreTotal < 0 ? 'mal' : 'sobra') : ''}">${descuadreTotal ? (descuadreTotal > 0 ? '+' : '') + eur(descuadreTotal) : '—'}</td>
        </tr></tfoot>
      </table>
      <table>
        <thead><tr><th colspan="2">Caja de efectivo</th></tr></thead>
        <tbody>
          <tr><td>Se abrió con</td><td class="n">${eur(fondo)}</td></tr>
          <tr><td>+ Efectivo del día</td><td class="n">${eur(contado.efectivo || 0)}</td></tr>
          <tr><td><b>= Hay en caja</b></td><td class="n"><b>${eur(cajaTotal)}</b></td></tr>
          <tr><td>Se lleva al banco</td><td class="n">${eur(banco)}</td></tr>
          <tr><td><b>Se queda en caja para cambio</b></td><td class="n"><b>${eur(cajaQueda)}</b></td></tr>
        </tbody>
      </table>
      ${histCaja.length ? `<p style="font-size:12px;font-weight:bold;margin:0 0 6px">Historial de caja hasta el ${fmtFecha(fecha)}</p>
      <table>
        <thead><tr><th>Día</th><th class="n">Se abrió con</th><th class="n">Efectivo del día</th><th class="n">Al banco</th><th class="n">Quedó en caja</th></tr></thead>
        <tbody>${histCaja.slice(-31).map(h => `<tr><td>${fmtFecha(h.fecha)}</td><td class="n">${eur(h.caja.fondo)}</td><td class="n">${eur(h.caja.efectivoDia)}</td><td class="n">${eur(h.caja.banco)}</td><td class="n"><b>${eur(h.caja.queda)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">Llevado al banco en el mes</td><td class="n">${eur(bancoMes)}</td><td></td></tr></tfoot>
      </table>` : ''}
      <p style="font-size:12px;font-weight:bold;margin:0 0 6px">Observaciones del día</p>
      <div class="coment">${esc(comentario) || '—'}</div>
      <div class="firma"><span>Cerrado por: ______________________</span><span>Firma: ______________________</span></div>`;

    const style = document.createElement('style');
    style.id = 'print-arqueo-style';
    style.innerHTML = `@media print { body > *:not(#print-arqueo) { display: none !important; } #print-arqueo { display: block !important; } }`;
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.id = 'print-arqueo';
    el.style.display = 'none';
    el.innerHTML = html;
    document.body.appendChild(el);
    window.print();
    setTimeout(() => {
      document.getElementById('print-arqueo-style')?.remove();
      document.getElementById('print-arqueo')?.remove();
    }, 1000);
  }

  if (!datos) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-icon" onClick={() => moverDia(-1)} aria-label="Día anterior">‹</button>
        <input type="date" value={fecha} max={hoyISO()}
          onChange={e => e.target.value && e.target.value <= hoyISO() && setFecha(e.target.value)}
          style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' }} />
        <button className="btn btn-icon" onClick={() => moverDia(1)} aria-label="Día siguiente"
          disabled={fecha >= hoyISO()} title={fecha >= hoyISO() ? 'No hay días posteriores a hoy' : 'Día siguiente'}>›</button>
        {fecha !== hoyISO() && <button className="btn btn-sm btn-outline" onClick={() => setFecha(hoyISO())}>Hoy</button>}
        {datos.cerrado && (
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--teal)', background: 'color-mix(in oklab, var(--teal) 12%, var(--bg-2))', padding: '4px 12px', borderRadius: 999 }}>
            ✓ Cerrado el {fmtFechaHora(datos.cerrado.cerradoAt)}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-outline" onClick={imprimir}><I.Print /> Imprimir cierre</button>
      </div>

      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 10, overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr repeat(5, minmax(0,1fr))', minWidth: 520, gap: 8, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)' }}>
          <span>Medio de pago</span>
          <span style={{ textAlign: 'right' }}>Cobrado</span>
          <span style={{ textAlign: 'right' }}>Devuelto</span>
          <span style={{ textAlign: 'right' }}>Debe haber</span>
          <span style={{ textAlign: 'right' }}>Hay</span>
          <span style={{ textAlign: 'right' }}>Descuadre</span>
        </div>
        {medios.map(m => {
          const e = datos.esperado[m];
          const d = descuadres[m];
          return (
            <div key={m} style={{ display: 'grid', gridTemplateColumns: '1.2fr repeat(5, minmax(0,1fr))', minWidth: 520, gap: 8, alignItems: 'center', fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>{ETIQUETA[m] || m}{e.n ? <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> · {e.n}</span> : ''}</span>
              <span style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{eur(e.cobrado)}</span>
              <span style={{ textAlign: 'right', color: e.devuelto ? 'var(--orange)' : 'var(--ink-3)' }}>{e.devuelto ? `−${eur(e.devuelto)}` : '—'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700 }}>{eur(e.neto)}</span>
              <input type="number" step="0.01" value={contado[m] ?? 0}
                onChange={ev => setContado(c => ({ ...c, [m]: ev.target.value }))}
                style={{ textAlign: 'right', fontFamily: 'inherit', fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', minWidth: 0 }} />
              <span style={{ textAlign: 'right', fontWeight: 800, color: d === 0 ? 'var(--ink-3)' : d < 0 ? 'var(--orange)' : 'var(--purple)' }}>
                {d === 0 ? '—' : `${d > 0 ? '+' : ''}${eur(d)}`}
              </span>
            </div>
          );
        })}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr repeat(5, minmax(0,1fr))', minWidth: 520, gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, borderTop: '2px solid var(--line)', paddingTop: 10 }}>
          <span>TOTAL</span><span /><span />
          <span style={{ textAlign: 'right' }}>{eur(datos.totalEsperado)}</span>
          <span style={{ textAlign: 'right' }}>{eur(totalContado)}</span>
          <span style={{ textAlign: 'right', color: descuadreTotal === 0 ? 'var(--teal)' : descuadreTotal < 0 ? 'var(--orange)' : 'var(--purple)' }}>
            {descuadreTotal === 0 ? 'Cuadra' : `${descuadreTotal > 0 ? '+' : ''}${eur(descuadreTotal)}`}
          </span>
        </div>
      </div>

      {/* Caja de efectivo (#323): con qué se abrió, cuánto va al banco y cuánto
          se queda para cambio (con eso se abre el día siguiente). */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 14 }}>Caja de efectivo</b>
          {datos.caja?.fondoAnteriorFecha && !datos.caja?.guardada && (
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>se abre con lo que quedó el {fmtFecha(datos.caja.fondoAnteriorFecha)}</span>
          )}
        </div>
        {[
          ['Se abrió con', <input key="f" type="number" step="0.01" min="0" value={fondo} onChange={e => setFondo(e.target.value)} aria-label="Se abrió con" />],
          ['+ Efectivo del día (lo contado arriba)', <b key="e">{eur(contado.efectivo || 0)}</b>],
          ['= Hay en caja', <b key="t" style={{ fontSize: 15 }}>{eur(cajaTotal)}</b>],
          ['Se lleva al banco', <input key="b" type="number" step="0.01" min="0" value={banco} onChange={e => setBanco(e.target.value)} aria-label="Se lleva al banco" />],
          ['Se queda en caja para cambio', <b key="q" style={{ fontSize: 15, color: cajaQueda < 0 ? 'var(--orange)' : 'var(--teal)' }}>{eur(cajaQueda)}</b>],
        ].map(([t, v]) => (
          <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', fontSize: 13, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--ink-2)' }}>{t}</span>
            {React.isValidElement(v) && v.type === 'input'
              ? React.cloneElement(v, { style: { width: 120, textAlign: 'right', fontFamily: 'inherit', fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' } })
              : v}
          </div>
        ))}
        {cajaQueda < 0 && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>No se puede llevar al banco más de lo que hay en caja.</div>}
      </div>

      <div className="field">
        <label>Observaciones del día</label>
        <textarea rows={2} value={comentario} onChange={e => setComentario(e.target.value)}
          placeholder="Ej. faltan 5 € del cambio de la mañana, se repuso el fondo de caja..."
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 14, padding: 12, background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)' }} />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-outline" onClick={() => setVerDetalle(v => !v)} disabled={!datos.detalle.length}>
          {verDetalle ? 'Ocultar' : 'Ver'} los {datos.detalle.length} movimiento{datos.detalle.length !== 1 ? 's' : ''} del día
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" disabled={guardando || esFuturo} onClick={cerrar}
          title={esFuturo ? 'Ese día todavía no ha llegado' : ''}>
          {guardando ? 'Guardando...' : esFuturo ? 'Ese día aún no ha llegado' : datos.cerrado ? 'Actualizar el cierre' : 'Cerrar caja del día'}
        </button>
      </div>

      {verDetalle && datos.detalle.length > 0 && (
        <div style={{ display: 'grid', gap: 4, fontSize: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
          {datos.detalle.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, minWidth: 70 }}>{d.numero}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.pagador || '—'}</span>
              <span style={{ color: 'var(--ink-3)' }}>{d.medioPago}</span>
              <span style={{ color: 'var(--ink-3)' }}>{fmtHora(d.hora)}</span>
              <span style={{ fontWeight: 700, color: d.tipo === 'rectificativo' ? 'var(--orange)' : 'var(--ink)', minWidth: 70, textAlign: 'right' }}>{eur(d.importe)}</span>
            </div>
          ))}
        </div>
      )}

      {histCaja.length > 0 && (
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14 }}>Historial de caja hasta el {fmtFecha(fecha)}</b>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Llevado al banco este mes: <b>{eur(bancoMes)}</b></span>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm btn-outline" onClick={() => setVerHistCaja(v => !v)}>{verHistCaja ? 'Ocultar' : 'Ver'}</button>
          </div>
          {verHistCaja && (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 520, display: 'grid', gap: 4, fontSize: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr repeat(4, minmax(0,1fr))', gap: 8, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)' }}>
                  <span>Día</span><span style={{ textAlign: 'right' }}>Se abrió con</span><span style={{ textAlign: 'right' }}>Efectivo del día</span><span style={{ textAlign: 'right' }}>Al banco</span><span style={{ textAlign: 'right' }}>Quedó en caja</span>
                </div>
                {histCaja.slice().reverse().map(h => (
                  <div key={h.fecha} style={{ display: 'grid', gridTemplateColumns: '1.1fr repeat(4, minmax(0,1fr))', gap: 8, padding: '5px 0', borderTop: '1px solid var(--line-2)' }}>
                    <span style={{ fontWeight: 700 }}>{fmtFecha(h.fecha)}</span>
                    <span style={{ textAlign: 'right' }}>{eur(h.caja.fondo)}</span>
                    <span style={{ textAlign: 'right' }}>{eur(h.caja.efectivoDia)}</span>
                    <span style={{ textAlign: 'right', color: 'var(--purple)' }}>{eur(h.caja.banco)}</span>
                    <span style={{ textAlign: 'right', fontWeight: 800 }}>{eur(h.caja.queda)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {historico.length > 0 && (
        <div>
          <h3 style={{ margin: '8px 0', fontSize: 14, fontWeight: 800 }}>Cierres anteriores</h3>
          <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            {historico.map(h => (
              <div key={h.fecha} onClick={() => setFecha(String(h.fecha).slice(0, 10))}
                style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 10px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer' }}>
                <span style={{ fontWeight: 700, minWidth: 90 }}>{fmtFecha(h.fecha)}</span>
                <span style={{ color: 'var(--ink-3)' }}>debe {eur(h.esperado)} · hay {eur(h.contado)}</span>
                <span style={{ fontWeight: 800, color: h.descuadre === 0 ? 'var(--teal)' : h.descuadre < 0 ? 'var(--orange)' : 'var(--purple)' }}>
                  {h.descuadre === 0 ? 'cuadra' : `${h.descuadre > 0 ? '+' : ''}${eur(h.descuadre)}`}
                </span>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.comentario || ''}</span>
                <span style={{ color: 'var(--ink-3)' }}>{h.quien}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
