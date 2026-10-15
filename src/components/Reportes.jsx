import React, { useState, useEffect } from 'react';
import { useRouter } from '../App.jsx';
import { AdminReportes } from './AdminTulClases.jsx';
import { InformeBeneficios, InformeDesglosePersonas } from './InformesGastos.jsx';
import BillingHacienda from './BillingHacienda.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Reportes (ticket #416): cómo va el negocio, todo en un sitio y ordenado, para
// la dirección. Un solo mes arriba que vale para todas las pestañas, comparado
// con el anterior (si el mes está a medias, con el anterior hasta el mismo día).
// Los ingresos van sin IVA (lo que es del club) y el cobrado con IVA al lado;
// cada cifra dice cuál es. Las cuentas están en reportes.js.
// Un instructor solo ve «Alumnos y clases» (sin dinero) y de sus clases.
// ─────────────────────────────────────────────────────────────────────────────

const PESTANAS = [
  ['resumen', 'Resumen'], ['ingresos', 'Ingresos'], ['cobros', 'Cobros y deudas'], ['gastos', 'Gastos y beneficio'],
  ['prevision', 'Previsión'], ['alumnos', 'Alumnos y clases'], ['caja', 'Caja'], ['hacienda', 'Libro registro y prorrata'],
];
// Las que no van por el mes de arriba: traen sus datos y su periodo ellas mismas.
const PROPIAS = ['alumnos', 'hacienda'];
const eur = (n) => Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur0 = (n) => Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num = (n) => Number(n || 0).toLocaleString('es-ES');
const mesActual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).slice(0, 7);
const mover = (mes, n) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const nombreMes = (mes, corto = false) => {
  const t = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1).toLocaleDateString('es-ES', corto ? { month: 'short' } : { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1).replace('.', '');
};
const cambio = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null);
const MEDIO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', bizum: 'Bizum', transferencia: 'Transferencia', tpv_online: 'Por la web', compensacion: 'Pase Explorador descontado', mixto: 'Varios' };
// Las tres series (#423): venta de material y productos, actividades deportivas (con IVA) y educativas (sin IVA).
const SERIE = { MAT: 'Venta de material y productos', IVA: 'Actividades deportivas (con IVA)', SIVA: 'Actividades educativas (sin IVA)', MATR: 'Rectificativas de ventas', IVAR: 'Rectificativas de deportivas', SIVAR: 'Rectificativas de educativas' };
const leer = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export default function Reportes({ user, permisos = {}, showToast }) {
  // Sin las cifras generales (instructores): solo sus clases, sin dinero.
  if (permisos.reportesGenerales === false) return <AdminReportes user={user} permisos={permisos} />;
  return <ReportesDireccion user={user} permisos={permisos} showToast={showToast} />;
}

function ReportesDireccion({ user, permisos, showToast }) {
  const [mes, setMes] = useState(mesActual);
  const [pestana, setPestanaE] = useState(() => { const p = leer('reportes.pestana', 'resumen'); return PESTANAS.some(([k]) => k === p) ? p : 'resumen'; });
  const setPestana = (p) => { setPestanaE(p); guardar('reportes.pestana', p); };
  const [datos, setDatos] = useState({});   // «pestaña|mes» → respuesta
  const [error, setError] = useState(null);
  const enCurso = mes === mesActual();
  const clave = `${pestana}|${mes}`;
  const d = datos[clave];

  useEffect(() => {
    if (PROPIAS.includes(pestana) || datos[clave]) return;
    let vivo = true;
    setError(null);
    fetch(`/api/admin/reportes/${pestana}?mes=${mes}`, { credentials: 'include', cache: 'no-store' })
      .then(async r => { const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'No se ha podido cargar.'); return x; })
      .then(x => { if (vivo) setDatos(prev => ({ ...prev, [clave]: x })); })
      .catch(e => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  const recargar = () => setDatos(prev => { const n = { ...prev }; delete n[clave]; return n; });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* El mes, para todas las pestañas (el libro registro lleva su propio periodo) */}
      {pestana !== 'hacienda' && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: '10px 14px' }}>
        <button className="btn btn-icon" onClick={() => setMes(m => mover(m, -1))} aria-label="Mes anterior">‹</button>
        <span style={{ fontWeight: 800, fontSize: 16, minWidth: 150, textAlign: 'center', fontFamily: 'var(--font-display)' }}>{nombreMes(mes)}</span>
        <button className="btn btn-icon" onClick={() => setMes(m => mover(m, 1))} disabled={enCurso} aria-label="Mes siguiente">›</button>
        {!enCurso && <button className="btn btn-sm btn-outline" onClick={() => setMes(mesActual())}>Este mes</button>}
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {enCurso ? `Hasta hoy · se compara con ${nombreMes(mover(mes, -1)).split(' ')[0].toLowerCase()} hasta el mismo día` : `Se compara con ${nombreMes(mover(mes, -1)).toLowerCase()}`}
        </span>
        <div style={{ flex: 1 }} />
        {pestana !== 'alumnos' && <button className="btn btn-sm btn-outline" onClick={recargar} title="Volver a calcular">Actualizar</button>}
        <DescargarPdf mes={mes} />
      </div>}

      <div role="tablist" className="scroll-oculto" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {PESTANAS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={pestana === k} className={`filter-pill ${pestana === k ? 'is-active' : ''}`}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setPestana(k)}>{l}</button>
        ))}
      </div>

      {pestana === 'alumnos' ? <AdminReportes user={user} permisos={permisos} mes={mes} />
        : pestana === 'hacienda' ? <BillingHacienda showToast={showToast} />
        : error ? <Aviso tipo="mal">{error} <button className="btn btn-sm btn-outline" onClick={recargar} style={{ marginLeft: 8 }}>Reintentar</button></Aviso>
          : !d ? <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Calculando…</p>
            : pestana === 'resumen' ? <Resumen d={d} irA={setPestana} />
              : pestana === 'ingresos' ? <Ingresos d={d} />
                : pestana === 'cobros' ? <Cobros d={d} />
                  : pestana === 'gastos' ? <Gastos d={d} />
                    : pestana === 'prevision' ? <Prevision d={d} />
                      : <Caja d={d} />}
    </div>
  );
}

// Los reportes del mes en PDF (#434): completos, o sin dinero para el equipo.
function DescargarPdf({ mes }) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => { if (!e.target.closest?.('[data-descargar-pdf]')) setAbierto(false); };
    document.addEventListener('click', cerrar);
    return () => document.removeEventListener('click', cerrar);
  }, [abierto]);
  const opcion = (modo, titulo, detalle) => (
    <a href={`/api/admin/reportes/pdf?mes=${mes}${modo ? `&modo=${modo}` : ''}`} onClick={() => setAbierto(false)}
      style={{ display: 'grid', gap: 2, padding: '10px 12px', borderRadius: 10, textDecoration: 'none', color: 'var(--ink)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-3)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
      <b style={{ fontSize: 14 }}>{titulo}</b><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{detalle}</span>
    </a>
  );
  return (
    <div data-descargar-pdf style={{ position: 'relative' }}>
      <button className="btn btn-sm btn-primary" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}>Descargar PDF ▾</button>
      {abierto && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20, width: 'min(300px, 86vw)', padding: 6,
          background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--shadow)' }}>
          {opcion('', 'Completo', 'Todo lo del mes: dinero, cobros, gastos, previsión, alumnos y clases.')}
          {opcion('equipo', 'Para el equipo', 'Solo alumnos y clases, sin ninguna cifra económica.')}
        </div>
      )}
    </div>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────
function Cifra({ etiqueta, valor, detalle, antes, mejorSiBaja = false, tono, onClick, nota }) {
  const c = antes === undefined ? null : cambio(Number(valor) || 0, Number(antes) || 0);
  const bien = c === null ? null : (c >= 0) !== mejorSiBaja;
  const color = tono === 'mal' ? 'var(--danger, #dc2626)' : tono === 'aviso' ? 'var(--orange)' : tono === 'bien' ? 'var(--teal)' : 'var(--ink)';
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      style={{ flex: '1 1 170px', minWidth: 0, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 16px', cursor: onClick ? 'pointer' : 'default', display: 'grid', gap: 4, alignContent: 'start' }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-3)' }}>{etiqueta}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color, lineHeight: 1.1, overflowWrap: 'anywhere' }}>
        {typeof valor === 'number' ? eur(valor) : valor}
      </div>
      {c !== null && (
        <div style={{ fontSize: 12, fontWeight: 700, color: c === 0 ? 'var(--ink-3)' : bien ? 'var(--teal)' : 'var(--orange)' }}>
          {c === 0 ? '= ' : c > 0 ? '▲ ' : '▼ '}{Math.abs(c)} % <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>({typeof antes === 'number' ? eur(antes) : antes} antes)</span>
        </div>
      )}
      {detalle && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{detalle}</div>}
      {nota && <div style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic' }}>{nota}</div>}
    </div>
  );
}
const Cifras = ({ children }) => <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{children}</div>;

function Bloque({ titulo, sub, children, extra }) {
  return (
    <section style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{titulo}</h3>
        {sub && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</span>}
        <div style={{ flex: 1 }} />
        {extra}
      </div>
      {children}
    </section>
  );
}
const Rejilla = ({ children, min = 320 }) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap: 16 }}>{children}</div>;

function Aviso({ tipo = 'info', children }) {
  const c = tipo === 'mal' ? 'var(--danger, #dc2626)' : tipo === 'aviso' ? 'var(--orange)' : 'var(--purple)';
  return (
    <div style={{ fontSize: 13, padding: '10px 12px', borderRadius: 12, borderLeft: `3px solid ${c}`, background: `color-mix(in oklab, ${c} 8%, var(--bg-2))`, color: 'var(--ink)' }}>{children}</div>
  );
}

// Barras horizontales: una fila por cosa, con su parte del total.
function Barras({ filas, color = 'var(--teal)', vacio = 'Nada en este mes.' }) {
  const max = Math.max(1, ...filas.map(f => Math.abs(f.valor)));
  const total = filas.reduce((s, f) => s + f.valor, 0);
  if (!filas.length) return <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>{vacio}</p>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {filas.map(f => (
        <div key={f.nombre} style={{ display: 'grid', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
            <span style={{ fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</span>
            <span style={{ whiteSpace: 'nowrap' }}><b>{eur(f.valor)}</b>{total > 0 && <span style={{ color: 'var(--ink-3)', fontSize: 12 }}> · {Math.round((f.valor / total) * 100)} %</span>}{f.extra && <span style={{ color: 'var(--ink-3)', fontSize: 12 }}> · {f.extra}</span>}</span>
          </div>
          <div style={{ height: 7, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(0, (f.valor / max) * 100)}%`, background: f.color || color, borderRadius: 99 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Doce meses en columnas: dos series (p. ej. ingresos y gastos).
function Meses({ meses, series, actual }) {
  const max = Math.max(1, ...meses.flatMap(m => series.map(s => Math.abs(m[s.k] || 0))));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', minWidth: 560 }}>
          {meses.map(m => (
            <div key={m.mes} style={{ flex: 1, textAlign: 'center', display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: m[series[0].k] ? series[0].color : 'var(--ink-3)' }}>{m[series[0].k] ? eur0(m[series[0].k]) : '—'}</div>
              <div style={{ height: 110, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2 }}>
                {series.map(s => (
                  <div key={s.k} title={`${s.nombre}: ${s.euros === false ? num(m[s.k]) : eur(m[s.k])}`}
                    style={{ width: s.ancho || 14, borderRadius: '4px 4px 0 0', background: s.color, opacity: s.opacidad || 1, height: `${Math.max(((m[s.k] || 0) / max) * 100, m[s.k] ? 3 : 1)}%` }} />
                ))}
              </div>
              <div style={{ fontSize: 10, color: m.mes === actual ? 'var(--ink)' : 'var(--ink-3)', fontWeight: m.mes === actual ? 800 : 500 }}>{nombreMes(m.mes, true)}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, fontWeight: 700, color: 'var(--ink-2)' }}>
        {series.map(s => <span key={s.k}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: s.color, opacity: s.opacidad || 1, marginRight: 4 }} />{s.nombre}</span>)}
      </div>
    </div>
  );
}

function Tabla({ columnas, filas, vacio = 'Nada en este mes.', pie }) {
  if (!filas.length) return <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>{vacio}</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 420 }}>
        <thead>
          <tr>{columnas.map((c, i) => <th key={i} style={{ textAlign: i ? 'right' : 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)', fontWeight: 800, padding: '6px 8px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} style={f.estilo}>{f.celdas.map((c, j) => <td key={j} style={{ textAlign: j ? 'right' : 'left', padding: '7px 8px', borderBottom: '1px solid var(--line)', whiteSpace: j ? 'nowrap' : 'normal' }}>{c}</td>)}</tr>
          ))}
        </tbody>
        {pie && <tfoot><tr>{pie.map((c, j) => <td key={j} style={{ textAlign: j ? 'right' : 'left', padding: '8px', fontWeight: 800, whiteSpace: 'nowrap' }}>{c}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}
const Delta = ({ a, b }) => {
  const c = cambio(a, b);
  if (c === null) return <span style={{ color: 'var(--ink-3)' }}>nuevo</span>;
  return <span style={{ color: c === 0 ? 'var(--ink-3)' : c > 0 ? 'var(--teal)' : 'var(--orange)', fontWeight: 700 }}>{c > 0 ? '▲' : c < 0 ? '▼' : '='} {Math.abs(c)} %</span>;
};

// ── Resumen ─────────────────────────────────────────────────────────────────
function Resumen({ d, irA }) {
  const a = d.anterior, al = d.alumnos;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Cifras>
        <Cifra etiqueta="Ingresos (sin IVA)" valor={d.ingresos} antes={a.ingresos} detalle={`${num(d.pagos)} cobros`} onClick={() => irA('ingresos')} />
        <Cifra etiqueta="Cobrado (con IVA)" valor={d.cobrado} detalle={`de ello, ${eur(d.iva)} de IVA para Hacienda`} />
        <Cifra etiqueta="Gastos" valor={d.gastos.total} antes={a.gastos.total} mejorSiBaja detalle={d.gastos.n ? `${d.gastos.n} apuntados` : 'ninguno apuntado'} tono={d.gastos.n ? null : 'aviso'} onClick={() => irA('gastos')} />
        <Cifra etiqueta="Resultado" valor={d.resultado} antes={a.resultado} detalle="ingresos menos gastos" tono={d.resultado >= 0 ? 'bien' : 'mal'} nota={d.gastos.n ? null : 'sin gastos apuntados'} />
      </Cifras>
      <Cifras>
        <Cifra etiqueta="Por cobrar ahora" valor={d.porCobrar.total} tono={d.porCobrar.total > 0 ? 'aviso' : 'bien'} onClick={() => irA('cobros')}
          detalle={`${num(d.porCobrar.cargos)} cargos de ${num(d.porCobrar.alumnos)} alumnos · con IVA${d.porCobrar.atrasado > 0 ? ` · ${eur(d.porCobrar.atrasado)} de meses anteriores` : ''}`} />
        <Cifra etiqueta="Alumnos activos" valor={num(al.activos)} detalle={`+${al.altas} altas · −${al.bajas} bajas en el mes`} onClick={() => irA('alumnos')} />
        <Cifra etiqueta="Ocupación" valor={al.ocupacion == null ? '—' : `${al.ocupacion} %`} detalle={`${num(al.ocupadas)} de ${num(al.plazas)} plazas · ${al.llenas} clases llenas · ${al.esperando} en espera`} />
      </Cifras>
      {d.avisos.length > 0 && <div style={{ display: 'grid', gap: 8 }}>{d.avisos.map((x, i) => <Aviso key={i} tipo={x.tipo}>{x.texto}</Aviso>)}</div>}
      <Bloque titulo="Los últimos doce meses" sub="ingresos sin IVA y gastos, por mes">
        <Meses meses={d.meses} actual={d.periodo.mes} series={[{ k: 'ingresos', nombre: 'Ingresos (sin IVA)', color: 'var(--teal)' }, { k: 'gastos', nombre: 'Gastos', color: 'var(--orange)' }]} />
        <Tabla columnas={['Mes', 'Ingresos', 'Gastos', 'Resultado', 'Alumnos que pagaron']}
          filas={[...d.meses].reverse().filter(m => m.ingresos || m.gastos).map(m => ({ celdas: [nombreMes(m.mes), eur(m.ingresos), eur(m.gastos), <b style={{ color: m.resultado >= 0 ? 'var(--teal)' : 'var(--orange)' }}>{eur(m.resultado)}</b>, num(m.alumnos)] }))}
          vacio="Aún no hay movimientos." />
      </Bloque>
    </div>
  );
}

// ── Ingresos ────────────────────────────────────────────────────────────────
function Ingresos({ d }) {
  const a = d.anterior;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Cifras>
        <Cifra etiqueta="Ingresos (sin IVA)" valor={d.ingresos} antes={a.ingresos} />
        <Cifra etiqueta="Cobrado (con IVA)" valor={d.cobrado} antes={a.cobrado} />
        <Cifra etiqueta="IVA" valor={d.iva} detalle="se ingresa a Hacienda" />
        <Cifra etiqueta="Cobros" valor={num(d.pagos)} detalle={d.pagos ? `de media, ${eur(d.cobrado / d.pagos)} cada uno` : null} />
        <Cifra etiqueta="Alumnos que pagaron" valor={num(d.alumnos)} detalle={d.alumnos ? `${eur(d.porAlumno)} por alumno (sin IVA)` : null} />
        {d.devuelto !== 0 && <Cifra etiqueta="Devuelto" valor={d.devuelto} tono="aviso" detalle="rectificativas del mes" />}
      </Cifras>
      <Bloque titulo="Mes a mes" sub="ingresos sin IVA y alumnos distintos que pagaron">
        <Meses meses={d.meses} actual={d.periodo.mes} series={[{ k: 'ingresos', nombre: 'Ingresos (sin IVA)', color: 'var(--teal)' }, { k: 'alumnos', nombre: 'Alumnos que pagaron', color: 'var(--purple)', ancho: 8, opacidad: 0.75, euros: false }]} />
      </Bloque>
      <Bloque titulo="Por actividad" sub="sin IVA, comparado con el mes anterior">
        <Tabla columnas={['Actividad', 'Ingresos', 'Con IVA', 'Alumnos', 'Mes anterior', 'Cambio']}
          filas={d.porActividad.map(x => ({ celdas: [<b>{x.actividad === 'Ventas' ? 'Ventas (material y productos)' : x.actividad}</b>, <b>{eur(x.ingresos)}</b>, eur(x.cobrado), num(x.alumnos), eur(x.anterior), <Delta a={x.ingresos} b={x.anterior} />], estilo: ['General', 'Ventas', 'Bonos'].includes(x.actividad) ? { background: 'var(--bg-3)' } : undefined }))}
          pie={['Total', eur(d.ingresos), eur(d.cobrado), '', eur(a.ingresos), <Delta a={d.ingresos} b={a.ingresos} />]} />
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>«Ventas» es todo lo facturado en la serie de material y productos (AIMMT); «Bonos», los bonos y pases (Bono Flexi, Aim Pass, Pase Explorador); «General», lo que no es de ninguna actividad (la matrícula, por ejemplo).</p>
      </Bloque>
      <Rejilla>
        <Bloque titulo="Por tipo" sub="sin IVA">
          <Barras filas={d.porTipo.map(x => ({ nombre: x.tipo, valor: x.ingresos, extra: `${x.cargos} cargos` }))} />
        </Bloque>
        <Bloque titulo="Cómo se pagó" sub="con IVA">
          <Barras color="var(--purple)" filas={d.porMedio.map(x => ({ nombre: MEDIO[x.medio] || x.medio, valor: x.total, extra: `${x.pagos} cobros` }))} />
        </Bloque>
      </Rejilla>
      <Bloque titulo="Por serie de factura" sub="para cuadrar con el libro registro">
        <Tabla columnas={['Serie', 'Base', 'IVA', 'Total', 'Facturas']}
          filas={d.porSerie.map(x => ({ celdas: [<span><b>{x.prefijo || x.serie}</b> <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{SERIE[x.serie] || ''}</span></span>, eur(x.ingresos), eur(x.iva), eur(x.cobrado), num(x.facturas)] }))}
          pie={['Total', eur(d.ingresos), eur(d.iva), eur(d.cobrado), num(d.porSerie.reduce((s, x) => s + x.facturas, 0))]} />
      </Bloque>
    </div>
  );
}

// ── Cobros y deudas ─────────────────────────────────────────────────────────
function Cobros({ d }) {
  const { go } = useRouter() || {};
  const ms = d.mesServicio, ah = d.ahora, o = d.online;
  const TRAMOS = [['este', 'Este mes', 'var(--teal)'], ['uno', 'Del mes pasado', '#E3A008'], ['tres', 'De hace 2 o 3 meses', 'var(--orange)'], ['mas', 'De hace más de 3 meses', 'var(--danger, #dc2626)']];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Cifras>
        <Cifra etiqueta="Por cobrar ahora" valor={ah.total} tono={ah.total > 0 ? 'aviso' : 'bien'} detalle={`${num(ah.cargos)} cargos de ${num(ah.alumnos)} alumnos · con IVA`} onClick={() => go?.('/admin/facturacion?pestana=pendientes')} />
        <Cifra etiqueta="De meses anteriores" valor={ah.atrasado} tono={ah.atrasado > 0 ? 'mal' : 'bien'} detalle="cuotas de meses ya pasados" />
        <Cifra etiqueta={`Cobrado de ${nombreMes(d.periodo.mes).split(' ')[0].toLowerCase()}`} valor={ms.tasa == null ? '—' : `${ms.tasa} %`}
          detalle={ms.debido ? `${eur(ms.cobrado)} de ${eur(ms.debido)} de sus cuotas (sin IVA)` : 'no hay cuotas de ese mes'} tono={ms.tasa == null ? null : ms.tasa >= 90 ? 'bien' : 'aviso'} />
        {ah.futuro.cargos > 0 && <Cifra etiqueta="Ya preparado, de meses que vienen" valor={ah.futuro.total} detalle={`${num(ah.futuro.cargos)} cargos · no cuentan aún como deuda`} />}
      </Cifras>
      <Rejilla>
        <Bloque titulo="¿De cuándo es lo pendiente?" sub="por el mes de la cuota, con IVA">
          <Barras filas={TRAMOS.map(([k, l, c]) => ({ nombre: l, valor: d.antiguedad[k], color: c })).filter(x => x.valor)} vacio="Nada pendiente." />
        </Bloque>
        <Bloque titulo={`Cuotas de ${nombreMes(d.periodo.mes).toLowerCase()}`} sub="qué ha pasado con cada una">
          <Tabla columnas={['', 'Cargos']} filas={[
            { celdas: ['Cobradas', num(ms.cobrados)] },
            { celdas: ['Pendientes', num(ms.cargos - ms.cobrados - ms.impagados)] },
            { celdas: ['Impagadas tras la baja', ms.impagados ? `${num(ms.impagados)} · ${eur(ms.impagado)}` : '0'] },
            { celdas: ['Exentas', num(ms.exentos)] },
            { celdas: ['Quitadas a mano', num(ms.quitados)] },
          ]} />
        </Bloque>
      </Rejilla>
      <Bloque titulo="Quién debe más" sub="lo de hasta este mes, con IVA" extra={<button className="btn btn-sm btn-outline" onClick={() => go?.('/admin/facturacion?pestana=pendientes')}>Ir a cobrar</button>}>
        <Tabla columnas={['Alumno', 'Cargos', 'Desde', 'Debe']} vacio="Nadie debe nada."
          filas={d.deudores.map(x => ({ celdas: [<b>{x.alumno}</b>, num(x.cargos), x.desde ? nombreMes(x.desde) : '—', <b style={{ color: 'var(--orange)' }}>{eur(x.total)}</b>] }))} />
      </Bloque>
      <Rejilla>
        <Bloque titulo="Pendiente por mes de la cuota" sub="con IVA">
          <Tabla columnas={['Mes', 'Cargos', 'Alumnos', 'Importe']} vacio="Nada pendiente."
            filas={d.porMes.map(x => ({ celdas: [x.mes === 'sin mes' ? 'Sin mes' : nombreMes(x.mes), num(x.cargos), num(x.alumnos), <b>{eur(x.total)}</b>], estilo: x.tramo === 'mas' ? { color: 'var(--danger, #dc2626)' } : x.tramo === 'futuro' ? { color: 'var(--ink-3)' } : undefined }))} />
        </Bloque>
        <Bloque titulo="Pagos por la web" sub={nombreMes(d.periodo.mes).toLowerCase()}>
          <Tabla columnas={['', 'Pagos', 'Importe']} filas={[
            { celdas: ['Pagados', num(o.pagados), eur(o.pagado)] },
            { celdas: ['Rechazados por el banco', num(o.rechazados), eur(o.rechazado)] },
            { celdas: ['Empezados y sin terminar', num(o.sinTerminar), eur(o.sinTerminarTotal)] },
          ]} />
        </Bloque>
      </Rejilla>
    </div>
  );
}

// ── Gastos y beneficio ──────────────────────────────────────────────────────
function Gastos({ d }) {
  const { go } = useRouter() || {};
  const periodo = { desde: d.periodo.desde, hasta: d.periodo.hasta };
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {!d.n && (
        <Aviso tipo="aviso">
          No hay ningún gasto apuntado en {nombreMes(d.periodo.mes).toLowerCase()}: el beneficio sale igual que los ingresos. Apúntalos en Gastos (con su actividad, si son de una) para ver lo que deja de verdad cada cosa.
          <button className="btn btn-sm btn-outline" onClick={() => go?.('/admin/gastos')} style={{ marginLeft: 8 }}>Ir a Gastos</button>
        </Aviso>
      )}
      <Cifras>
        <Cifra etiqueta="Gastos" valor={d.total} antes={d.anterior.total} mejorSiBaja detalle={`${d.n} apuntados · tal como se apuntaron`} />
        <Cifra etiqueta="Resultado" valor={d.resultado} detalle={`ingresos sin IVA (${eur(d.ingresos)}) menos gastos`} tono={d.resultado >= 0 ? 'bien' : 'mal'} />
        <Cifra etiqueta="Sin pagar" valor={d.sinPagar.total} detalle={`${d.sinPagar.n} facturas`} tono={d.sinPagar.n ? 'aviso' : null} />
        <Cifra etiqueta="Sin comprobar en el banco" valor={num(d.sinComprobar)} detalle="gastos del mes" />
        {d.recurrentes.n > 0 && <Cifra etiqueta="Gastos fijos" valor={d.recurrentes.total} detalle={`${d.recurrentes.n} recurrentes, al mes`} />}
      </Cifras>
      {d.n > 0 && (
        <Rejilla>
          <Bloque titulo="Por categoría"><Barras color="var(--orange)" filas={d.porCategoria.map(x => ({ nombre: x.categoria, valor: x.total, extra: `${x.n}` }))} /></Bloque>
          <Bloque titulo="De quién son" sub="comunes o de una actividad"><Barras color="var(--orange)" filas={d.porDestino.map(x => ({ nombre: x.de, valor: x.total, extra: `${x.n}` }))} /></Bloque>
        </Rejilla>
      )}
      <Bloque titulo="Mes a mes" sub="ingresos sin IVA y gastos">
        <Meses meses={d.meses} actual={d.periodo.mes} series={[{ k: 'ingresos', nombre: 'Ingresos (sin IVA)', color: 'var(--teal)' }, { k: 'gastos', nombre: 'Gastos', color: 'var(--orange)' }]} />
      </Bloque>
      <Bloque titulo="Beneficio por actividad" sub={nombreMes(d.periodo.mes).toLowerCase()}><InformeBeneficios periodo={periodo} /></Bloque>
      <Bloque titulo="Desglose por persona" sub={nombreMes(d.periodo.mes).toLowerCase()}><InformeDesglosePersonas periodo={periodo} /></Bloque>
    </div>
  );
}

// ── Previsión ───────────────────────────────────────────────────────────────
function Prevision({ d }) {
  if (!d.meses.length) return <Aviso>No hay una temporada activa: la previsión sale de la temporada y sus matrículas.</Aviso>;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Cifras>
        <Cifra etiqueta={`Temporada ${d.temporada}`} valor={d.estimacion} tono="bien" detalle="cobrado + pendiente + lo que falta por generar (sin IVA)" />
        <Cifra etiqueta="Cobrado hasta hoy" valor={d.cobrado} detalle={`desde ${nombreMes(d.desde).toLowerCase()}`} />
        <Cifra etiqueta="Pendiente de cobrar" valor={d.pendiente} detalle="cuotas ya generadas de la temporada" tono={d.pendiente ? 'aviso' : null} />
        <Cifra etiqueta="Por generar" valor={d.previsto} detalle="si siguen los alumnos de hoy" />
      </Cifras>
      <Aviso>
        Es una estimación con las matrículas de hoy: cada mes que falta, lo que se cobraría si nadie se diera de alta ni de baja. Las altas y bajas la irán moviendo.
        {d.pendienteAnterior > 0 && <> Además hay {eur(d.pendienteAnterior)} pendientes de antes de la temporada (no están en la suma).</>}
      </Aviso>
      <Bloque titulo="Mes a mes" sub="sin IVA">
        <Meses meses={d.meses.map(m => ({ ...m, total: m.cobrado + m.pendiente + m.previsto }))} actual={d.periodo.hoy.slice(0, 7)}
          series={[{ k: 'cobrado', nombre: 'Cobrado', color: 'var(--teal)', ancho: 10 }, { k: 'pendiente', nombre: 'Pendiente', color: 'var(--orange)', ancho: 10 }, { k: 'previsto', nombre: 'Previsto', color: 'var(--purple)', ancho: 10, opacidad: 0.6 }]} />
        <Tabla columnas={['Mes', 'Cobrado', 'Pendiente', 'Previsto', 'Total']}
          filas={d.meses.map(m => ({ celdas: [<span style={{ fontWeight: m.actual ? 800 : 500 }}>{nombreMes(m.mes)}{m.actual ? ' · ahora' : ''}</span>, eur(m.cobrado), eur(m.pendiente), m.previsto ? `${eur(m.previsto)}` : '—', <b>{eur(m.cobrado + m.pendiente + m.previsto)}</b>], estilo: m.pasado ? { color: 'var(--ink-2)' } : undefined }))}
          pie={['Temporada', eur(d.cobrado), eur(d.pendiente), eur(d.previsto), eur(d.estimacion)]} />
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>«Cobrado» va por el mes en que se cobró; «Pendiente» y «Previsto», por el mes de la cuota.</p>
      </Bloque>
      {d.iva.length > 0 && (
        <Bloque titulo="IVA de las facturas" sub="el que se cobra y luego se ingresa a Hacienda, por trimestre">
          <Tabla columnas={['Trimestre', 'Base facturada', 'IVA']} filas={d.iva.map(x => ({ celdas: [x.trimestre, eur(x.base), <b>{eur(x.iva)}</b>] }))} />
          <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>La prorrata y el libro registro están en la pestaña «Libro registro y prorrata».</p>
        </Bloque>
      )}
    </div>
  );
}

// ── Caja ────────────────────────────────────────────────────────────────────
function Caja({ d }) {
  const { go } = useRouter() || {};
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Cifras>
        <Cifra etiqueta="Días cerrados" valor={num(d.cerrados)} detalle={d.conDescuadre ? `${d.conDescuadre} con descuadre` : 'todos cuadrados'} tono={d.conDescuadre ? 'aviso' : 'bien'} />
        <Cifra etiqueta="Días sin cerrar" valor={num(d.sinCerrar.length)} tono={d.sinCerrar.length ? 'mal' : 'bien'} detalle={d.sinCerrar.length ? 'con cobros en el mostrador' : 'ninguno'} onClick={d.sinCerrar.length ? () => go?.('/admin/facturacion?pestana=arqueo') : undefined} />
        <Cifra etiqueta="Descuadre del mes" valor={d.descuadre} tono={d.descuadre === 0 ? 'bien' : 'aviso'} detalle="contado menos lo que tenía que haber" />
        <Cifra etiqueta="Efectivo cobrado" valor={d.efectivo} detalle="en el mes" />
      </Cifras>
      {d.sinCerrar.length > 0 && (
        <Aviso tipo="mal">Sin cerrar: {d.sinCerrar.map(f => new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })).join(', ')}.
          <button className="btn btn-sm btn-outline" onClick={() => go?.('/admin/facturacion?pestana=arqueo')} style={{ marginLeft: 8 }}>Ir al arqueo</button></Aviso>
      )}
      <Bloque titulo="Cierres de caja" sub="lo contado frente a lo que tenía que haber (sin los pagos por la web)">
        <Tabla columnas={['Día', 'Tenía que haber', 'Contado', 'Descuadre', 'Cerró']} vacio="No hay ningún cierre este mes."
          filas={d.dias.map(x => ({
            celdas: [
              <span>{new Date(x.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                {x.descuadre !== 0 && <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>{x.medios.filter(m => m.descuadre !== 0).map(m => `${MEDIO[m.medio] || m.medio}: ${m.descuadre > 0 ? '+' : ''}${eur(m.descuadre)}`).join(' · ')}</span>}
                {x.comentario && <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic' }}>{x.comentario}</span>}</span>,
              eur(x.esperado), eur(x.contado),
              <b style={{ color: x.descuadre === 0 ? 'var(--teal)' : 'var(--orange)' }}>{x.descuadre === 0 ? 'Cuadra' : `${x.descuadre > 0 ? '+' : ''}${eur(x.descuadre)}`}</b>,
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{x.quien || '—'}</span>,
            ],
          }))} />
      </Bloque>
    </div>
  );
}
