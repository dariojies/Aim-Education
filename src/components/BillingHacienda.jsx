import React, { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Libro registro de facturas emitidas y prorrata del IVA (ticket #292).
//
// El libro se descarga en la plantilla de la gestoría (la de AON), con una fila
// por factura y tipo de IVA. La prorrata dice qué parte del IVA de las compras os
// podéis deducir, porque parte de la actividad (la enseñanza) va exenta.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const pct = (n) => (n == null ? '—' : `${n} %`);
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
const fechaCorta = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split('-'); return `${Number(d)}/${Number(m)}/${a}`; };

// Periodos del libro: los trimestres (que es como se declara el IVA), el año
// entero o un mes suelto.
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function rangoDe(anio, periodo) {
  const fin = (m) => new Date(Date.UTC(anio, m, 0)).toISOString().slice(0, 10);   // último día del mes m (1-12)
  if (periodo === 'anual') return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
  if (/^[1-4]T$/.test(periodo)) {
    const t = Number(periodo[0]);
    return { desde: `${anio}-${String(t * 3 - 2).padStart(2, '0')}-01`, hasta: fin(t * 3) };
  }
  const m = Number(periodo);
  return { desde: `${anio}-${String(m).padStart(2, '0')}-01`, hasta: fin(m) };
}

const tarjeta = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 12 };
const inp = { fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', minWidth: 0 };
const th = { textAlign: 'left', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', padding: '6px 8px', whiteSpace: 'nowrap' };
const td = { fontSize: 12, padding: '6px 8px', borderTop: '1px solid var(--line-2)', whiteSpace: 'nowrap' };
const num = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

export default function BillingHacienda({ showToast }) {
  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 980 }}>
      <LibroRegistro showToast={showToast} />
      <Prorrata showToast={showToast} />
    </div>
  );
}

// ── Libro registro ──────────────────────────────────────────────────────────
function LibroRegistro({ showToast }) {
  const actual = new Date();
  const [anio, setAnio] = useState(actual.getFullYear());
  const [periodo, setPeriodo] = useState(`${Math.floor(actual.getMonth() / 3) + 1}T`);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [verTipos, setVerTipos] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const rango = rangoDe(anio, periodo);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/admin/billing/libro-registro?desde=${rango.desde}&hasta=${rango.hasta}`, { credentials: 'include', cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setDatos(d);
    } catch (e) { setError(e.message); setDatos(null); }
  }, [rango.desde, rango.hasta]);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    fetch('/api/admin/billing/libro-registro/config', { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(setCfg).catch(() => { });
  }, []);

  async function guardarTipos() {
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/billing/libro-registro/config', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipos: cfg.tipos }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
      setCfg(c => ({ ...c, tipos: d.tipos }));
      showToast?.('Tipos de operación guardados.');
      cargar();
    } catch (e) { alert(e.message); } finally { setGuardando(false); }
  }

  const anios = [];
  for (let a = actual.getFullYear(); a >= 2025; a--) anios.push(a);
  const nombrePeriodo = periodo === 'anual' ? `todo ${anio}` : /T$/.test(periodo) ? `${periodo} de ${anio}` : `${MESES[Number(periodo) - 1].toLowerCase()} de ${anio}`;

  return (
    <div style={tarjeta}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Libro registro de facturas emitidas</h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
          Sale en la plantilla de la gestoría, con sus mismas columnas. Una fila por factura y tipo de IVA, con los datos
          tal y como se registraron al emitirla. Las rectificativas van en negativo.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={inp}>
          {anios.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {['1T', '2T', '3T', '4T', 'anual'].map(p => (
          <button key={p} className={`filter-pill ${periodo === p ? 'is-active' : ''}`} onClick={() => setPeriodo(p)}>
            {p === 'anual' ? 'Año entero' : p}
          </button>
        ))}
        <select value={/^\d+$/.test(periodo) ? periodo : ''} onChange={e => e.target.value && setPeriodo(e.target.value)} style={inp}>
          <option value="">Un mes…</option>
          {MESES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <a className="btn btn-sm btn-primary" href={`/api/admin/billing/libro-registro.xlsx?desde=${rango.desde}&hasta=${rango.hasta}`}
          download style={{ pointerEvents: datos?.facturas ? 'auto' : 'none', opacity: datos?.facturas ? 1 : .5 }}>
          Descargar Excel
        </a>
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--orange)' }}>{error}</p>}

      {datos && (
        <>
          <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            Del {fechaCorta(datos.desde)} al {fechaCorta(datos.hasta)}: <b>{datos.facturas} factura{datos.facturas === 1 ? '' : 's'}</b>
            {datos.totalFilas !== datos.facturas && <> en {datos.totalFilas} filas</>}
            {datos.simplificadas > 0 && <> · {datos.simplificadas} simplificada{datos.simplificadas === 1 ? '' : 's'} (sin NIF, como debe ser)</>}
          </div>

          {datos.facturas === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>No hay facturas emitidas en {nombrePeriodo}.</p>
          )}

          {datos.completasSinNif?.length > 0 && (
            <div style={{ padding: 10, borderRadius: 10, fontSize: 12, background: 'color-mix(in oklab, var(--orange) 10%, var(--bg-3))', color: 'var(--ink-2)' }}>
              <b style={{ color: 'var(--orange)' }}>{datos.completasSinNif.length} factura{datos.completasSinNif.length === 1 ? '' : 's'} completa{datos.completasSinNif.length === 1 ? '' : 's'} sin NIF del cliente</b>
              {' '}(de antes de que se pidiera): {datos.completasSinNif.slice(0, 8).join(', ')}{datos.completasSinNif.length > 8 ? '…' : ''}.
              Contádselo a la gestoría al pasarle el libro.
            </div>
          )}

          {datos.porTipo?.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Tipo de operación</th><th style={{ ...th, textAlign: 'right' }}>Filas</th><th style={{ ...th, textAlign: 'right' }}>Base</th><th style={{ ...th, textAlign: 'right' }}>Cuota IVA</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
                <tbody>
                  {datos.porTipo.map(g => (
                    <tr key={g.tipo}><td style={td}>{g.tipo}</td><td style={num}>{g.filas}</td><td style={num}>{eur(g.base)}</td><td style={num}>{eur(g.cuota)}</td><td style={num}>{eur(g.total)}</td></tr>
                  ))}
                  <tr style={{ fontWeight: 800 }}><td style={td}>Total</td><td style={num}>{datos.totalFilas}</td><td style={num}>{eur(datos.totales.base)}</td><td style={num}>{eur(datos.totales.cuota)}</td><td style={num}>{eur(datos.totales.total)}</td></tr>
                </tbody>
              </table>
            </div>
          )}

          {datos.filas?.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                Ver las filas tal y como salen en el Excel{datos.totalFilas > datos.filas.length ? ` (las primeras ${datos.filas.length})` : ''}
              </summary>
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Tipo operación', 'Fecha', 'Nº factura', 'NIF', 'Nombre', 'Base', '% IVA', 'Cuota', 'Total'].map((h, i) => <th key={h} style={{ ...th, textAlign: i >= 5 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {datos.filas.map((f, i) => (
                      <tr key={i}>
                        <td style={td}>{f.tipo}</td><td style={td}>{fechaCorta(f.fecha)}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{f.numero}</td><td style={td}>{f.nif}</td>
                        <td style={{ ...td, whiteSpace: 'normal', minWidth: 140 }}>{f.nombre}</td>
                        <td style={num}>{eur(f.base)}</td><td style={num}>{f.pct}</td><td style={num}>{eur(f.cuota)}</td><td style={num}>{eur(f.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}

      {cfg && (
        <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 10 }}>
          <button className="btn btn-sm btn-outline" onClick={() => setVerTipos(v => !v)}>
            {verTipos ? 'Ocultar' : 'Cambiar'} lo que sale en «Tipo operación»
          </button>
          {verTipos && (
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
                Lo que se escribe en la primera columna según la serie de la factura. Si la gestoría usa códigos para
                importar, poned aquí sus códigos (un número entra en el Excel como número).
              </p>
              {cfg.series.map(s => (
                <label key={s.codigo} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 2fr', gap: 10, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{s.nombre}</span>
                  <input value={cfg.tipos[s.codigo] ?? ''} placeholder={cfg.defecto[s.codigo]} maxLength={60}
                    onChange={e => setCfg(c => ({ ...c, tipos: { ...c.tipos, [s.codigo]: e.target.value } }))} style={inp} />
                </label>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-sm btn-primary" disabled={guardando} onClick={guardarTipos}>{guardando ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Prorrata ────────────────────────────────────────────────────────────────
function Prorrata({ showToast }) {
  const actual = new Date().getFullYear();
  const [ejercicio, setEjercicio] = useState(actual);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [manual, setManual] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [soportado, setSoportado] = useState('');

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/admin/billing/prorrata?ejercicio=${ejercicio}`, { credentials: 'include', cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setDatos(d);
      setManual(d.provisional.origen === 'manual' ? String(d.provisional.pct) : '');
    } catch (e) { setError(e.message); }
  }, [ejercicio]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardarManual(valor) {
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/billing/prorrata/provisional', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ejercicio, pct: valor === '' ? null : Number(valor) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
      showToast?.(valor === '' ? 'Se usa otra vez la del año anterior.' : 'Prorrata provisional guardada.');
      cargar();
    } catch (e) { alert(e.message); } finally { setGuardando(false); }
  }

  const anios = [];
  for (let a = actual; a >= 2025; a--) anios.push(a);
  const prov = datos?.provisional?.pct;
  const def = datos?.definitiva?.pct;
  const iva = Number(String(soportado).replace(',', '.')) || 0;
  const conProv = prov != null ? Math.round(iva * prov) / 100 : null;
  const conDef = def != null ? Math.round(iva * def) / 100 : null;

  return (
    <div style={tarjeta}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Prorrata del IVA</h3>
        <select value={ejercicio} onChange={e => setEjercicio(Number(e.target.value))} style={inp}>
          {anios.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
        Como la enseñanza va exenta, del IVA que pagáis en las compras solo os podéis deducir el porcentaje que
        corresponde a lo que facturáis con IVA (material y servicios sujetos) sobre el total. Se redondea siempre
        al entero de arriba. Durante el año se aplica la <b>provisional</b>, que es la definitiva del año anterior; al
        cerrar el año sale la <b>definitiva</b> y la diferencia se regulariza en la declaración del 4T.
      </p>

      {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--orange)' }}>{error}</p>}

      {datos && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Cifra titulo={`Provisional ${datos.ejercicio}`} valor={pct(prov)}
              nota={datos.provisional.origen === 'anterior' ? `definitiva de ${datos.anterior.ejercicio}`
                : datos.provisional.origen === 'manual' ? 'fijada a mano' : 'sin fijar'} />
            <Cifra titulo={datos.cerrado ? `Definitiva ${datos.ejercicio}` : `Definitiva ${datos.ejercicio} (hasta hoy)`} valor={pct(def)}
              nota={datos.cerrado ? 'año cerrado' : 'va cambiando hasta el 31 de diciembre'} />
            <Cifra titulo="Con derecho a deducir" valor={eur(datos.definitiva.sujeta)} nota="material y servicios con IVA" />
            <Cifra titulo="Exento" valor={eur(datos.definitiva.exenta)} nota="enseñanza (art. 20.Uno.9º)" />
          </div>

          {prov == null && (
            <div style={{ padding: 10, borderRadius: 10, fontSize: 12, background: 'color-mix(in oklab, var(--orange) 10%, var(--bg-3))', color: 'var(--ink-2)' }}>
              <b style={{ color: 'var(--orange)' }}>Falta la provisional de {datos.ejercicio}.</b> En {datos.anterior.ejercicio} no se facturó con este
              sistema, así que no se puede sacar sola: pedid a la gestoría la prorrata definitiva de {datos.anterior.ejercicio} y ponedla aquí debajo.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
            <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>Fijar la provisional de {datos.ejercicio} a mano:</span>
            <input type="number" min="0" max="100" step="1" value={manual} placeholder="%"
              onChange={e => setManual(e.target.value)} style={{ ...inp, width: 80 }} />
            <span style={{ color: 'var(--ink-3)' }}>%</span>
            <button className="btn btn-sm btn-primary" disabled={guardando || manual === ''} onClick={() => guardarManual(manual)}>Guardar</button>
            {datos.provisional.origen === 'manual' && (
              <button className="btn btn-sm btn-outline" disabled={guardando} onClick={() => guardarManual('')}>
                {datos.anterior.pct != null ? `Usar la de ${datos.anterior.ejercicio} (${datos.anterior.pct} %)` : 'Quitarla'}
              </button>
            )}
          </div>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            Solo si no hay datos del año anterior o si la AEAT ha autorizado otra (art. 105 de la Ley del IVA).
          </span>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Trimestre</th><th style={{ ...th, textAlign: 'right' }}>Con derecho</th><th style={{ ...th, textAlign: 'right' }}>Exento</th>
                <th style={{ ...th, textAlign: 'right' }}>% del trimestre</th><th style={{ ...th, textAlign: 'right' }}>% acumulado</th>
              </tr></thead>
              <tbody>
                {datos.definitiva.trimestres.map(t => (
                  <tr key={t.trimestre}>
                    <td style={td}>{t.trimestre}T</td><td style={num}>{eur(t.sujeta)}</td><td style={num}>{eur(t.exenta)}</td>
                    <td style={num}>{pct(t.pctTrimestre)}</td><td style={{ ...num, fontWeight: 800 }}>{pct(t.acumulado.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gap: 8, padding: 12, background: 'var(--bg-3)', borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>¿Cuánto IVA de las compras os podéis deducir?</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
              <span>IVA soportado del periodo</span>
              <input value={soportado} onChange={e => setSoportado(e.target.value)} placeholder="0,00" inputMode="decimal"
                style={{ ...inp, width: 110, background: 'var(--bg-2)' }} />
              <span>€</span>
            </div>
            {iva > 0 && (
              <div style={{ display: 'grid', gap: 3, fontSize: 12, color: 'var(--ink-2)' }}>
                <span>Con la provisional ({pct(prov)}): <b>{conProv == null ? '—' : eur(conProv)}</b> — lo que se deduce en cada trimestre.</span>
                <span>Con la definitiva ({pct(def)}): <b>{conDef == null ? '—' : eur(conDef)}</b></span>
                {conProv != null && conDef != null && conProv !== conDef && (
                  <span>
                    Diferencia: <b style={{ color: conDef > conProv ? 'var(--teal)' : 'var(--orange)' }}>{eur(conDef - conProv)}</b>
                    {conDef > conProv ? ' a vuestro favor' : ' que habrá que ingresar'} al regularizar en el 4T (si lo que has puesto es el IVA soportado de todo el año).
                  </span>
                )}
              </div>
            )}
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              Es una calculadora: no se guarda. Los gastos todavía no llevan el IVA desglosado, así que el soportado lo pone la gestoría.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Cifra({ titulo, valor, nota }) {
  return (
    <div style={{ flex: '1 1 150px', background: 'var(--bg-3)', borderRadius: 10, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)' }}>{titulo}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{valor}</div>
      {nota && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{nota}</div>}
    </div>
  );
}
