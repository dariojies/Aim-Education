import React, { useState, useEffect, useMemo } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Ficha 360º del alumno (ticket #222): dentro de la ficha de Alumnos, todo lo
// económico y de asistencia de esa persona, más la descarga del resumen anual
// por pagador. Va debajo del bloque de clases/rangos/familia, y solo lo ve el
// personal del club (el endpoint se cierra con editarAlumnos).
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => `${Number(n ?? 0).toFixed(2)} €`;
const fmtFecha = (f) => f ? new Date(String(f).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const ESTADO_RECIBO = { cobrado: ['Cobrado', 'var(--green, #16a34a)'], pendiente: ['Pendiente', 'var(--orange)'], anulado: ['Anulado', 'var(--ink-3)'] };
const ASIS_LABEL = { present: ['Asistencias', 'var(--green, #16a34a)'], late: ['Retrasos', 'var(--orange)'], absent: ['Faltas', 'var(--red, #dc2626)'] };

// Una temporada es el curso académico: del 1 de septiembre al 31 de agosto.
// Devuelve [inicio, fin) de la temporada a la que pertenece una fecha, corriendo
// `atras` temporadas hacia el pasado (0 = la de esa fecha).
function temporadaDe(ref, atras = 0) {
  const d = new Date(ref);
  const inicioAnio = (d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1) - atras;
  return [new Date(inicioAnio, 8, 1), new Date(inicioAnio + 1, 8, 1)];
}

// El rango [desde, hasta) de cada periodo de asistencia. null = sin límite.
function rangoPeriodo(periodo) {
  const hoy = new Date();
  if (periodo === 'mes') return [new Date(hoy.getFullYear(), hoy.getMonth(), 1), new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)];
  if (periodo === 'trimestre') { const d = new Date(hoy); d.setMonth(d.getMonth() - 3); return [d, null]; }
  if (periodo === 'temporada') return temporadaDe(hoy, 0);
  if (periodo === 'temporada_pasada') return temporadaDe(hoy, 1);
  return [null, null]; // todo
}
const PERIODOS_ASIS = [['todo', 'Todo'], ['mes', 'Este mes'], ['trimestre', 'Últimos 3 meses'], ['temporada', 'Esta temporada'], ['temporada_pasada', 'Temporada pasada']];

function Seccion({ titulo, extra, children }) {
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)' }}>{titulo}</span>
        <div style={{ flex: 1 }} />
        {extra}
      </div>
      {children}
    </div>
  );
}

function Factura({ f }) {
  const [abierta, setAbierta] = useState(false);
  const [est, col] = ESTADO_RECIBO[f.estado] || [f.estado, 'var(--ink-3)'];
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg-2)', overflow: 'hidden' }}>
      <button type="button" onClick={() => setAbierta(a => !a)}
        style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
        <span style={{ fontWeight: 800, fontSize: 13, color: f.rectificativa ? 'var(--red, #dc2626)' : 'var(--purple)' }}>
          {f.rectificativa ? 'Rect. ' : ''}Nº {f.numero}
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtFecha(f.fecha)}</span>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>· {f.pagador}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{est}</span>
        <span style={{ fontWeight: 800, fontSize: 13, color: f.importe < 0 ? 'var(--red, #dc2626)' : 'var(--ink)' }}>{eur(f.importe)}</span>
        <I.Chevron style={{ transform: abierta ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {abierta && (
        <div style={{ padding: '4px 12px 10px', display: 'grid', gap: 4 }}>
          {(f.conceptos || []).map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--ink-2)' }}>
              <span style={{ flex: 1 }}>{c.descripcion}{c.alumno ? <span style={{ color: 'var(--ink-3)' }}> · {c.alumno}</span> : ''}</span>
              <span style={{ color: c.importe < 0 ? 'var(--red, #dc2626)' : 'var(--ink)' }}>{eur(c.importe)}</span>
            </div>
          ))}
          {!(f.conceptos || []).length && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Sin líneas.</span>}
        </div>
      )}
    </div>
  );
}

export default function FichaAlumno360({ studentId }) {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [pagador, setPagador] = useState('');
  const [periodoAsis, setPeriodoAsis] = useState('todo');

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError('');
    fetch(`/api/admin/alumnos/${studentId}/ficha360`, { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.error || 'Error'))))
      .then(d => { if (vivo) { setData(d); setPagador(d.pagadores?.[0]?.id || ''); } })
      .catch(e => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [studentId]);

  const anios = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => now - i);
  }, []);

  function descargarResumen() {
    if (!pagador) return;
    window.open(`/api/admin/alumnos/${studentId}/resumen-economico.pdf?anio=${anio}&pagador=${pagador}&descargar=1`, '_blank');
  }

  if (cargando) return <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 16 }}>Cargando ficha completa...</p>;
  if (error) return <p style={{ color: 'var(--orange)', fontSize: 13, marginTop: 16 }}>No se pudo cargar la parte económica: {error}</p>;
  if (!data) return null;

  const { economico, asistencia, pagadores, reservas } = data;
  // La asistencia se filtra por periodo en la propia pantalla, sobre el histórico
  // completo, y el resumen (asistencias/retrasos/faltas) se recalcula al vuelo.
  const [desde, hasta] = rangoPeriodo(periodoAsis);
  const asisFiltrada = (asistencia.historico || []).filter(h => {
    const f = new Date(String(h.date).slice(0, 10) + 'T12:00:00');
    return (!desde || f >= desde) && (!hasta || f < hasta);
  });
  const resumenAsis = { present: 0, late: 0, absent: 0 };
  for (const h of asisFiltrada) if (resumenAsis[h.status] != null) resumenAsis[h.status]++;
  const totalAsis = asisFiltrada.length;

  return (
    <div>
      {/* ── Económico ── */}
      <Seccion titulo="Económico"
        extra={<span style={{ fontSize: 13, fontWeight: 800, color: economico.totalPendiente > 0 ? 'var(--orange)' : 'var(--green, #16a34a)' }}>
          Pendiente: {eur(economico.totalPendiente)}
        </span>}>
        {economico.pendientes.length > 0 && (
          <div style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
            {economico.pendientes.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '6px 10px', background: 'color-mix(in oklab, var(--orange) 8%, var(--bg-2))', borderRadius: 8 }}>
                <span style={{ flex: 1 }}>{p.descripcion}{p.actividad ? <span style={{ color: 'var(--ink-3)' }}> · {p.actividad}</span> : ''}</span>
                <span style={{ fontWeight: 700, color: 'var(--orange)' }}>{eur(p.total)}</span>
              </div>
            ))}
          </div>
        )}
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)' }}>Facturas</span>
        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          {economico.facturas.length
            ? economico.facturas.map(f => <Factura key={f.id} f={f} />)
            : <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Todavía no hay facturas de este alumno.</span>}
        </div>
      </Seccion>

      {/* ── Asistencia (con filtro por periodo) ── */}
      <Seccion titulo="Asistencia"
        extra={<select value={periodoAsis} onChange={e => setPeriodoAsis(e.target.value)} style={{ ...selCss, padding: '6px 10px', fontSize: 13 }}>
          {PERIODOS_ASIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {['present', 'late', 'absent'].map(k => {
            const [lbl, col] = ASIS_LABEL[k];
            return (
              <div key={k} style={{ flex: 1, minWidth: 90, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg-2)' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: col }}>{resumenAsis[k]}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{lbl}</div>
              </div>
            );
          })}
        </div>
        {asisFiltrada.length > 0
          ? (
            <div style={{ display: 'grid', gap: 3, maxHeight: 220, overflowY: 'auto' }}>
              {asisFiltrada.map((h, i) => {
                const [lbl, col] = ASIS_LABEL[h.status] || [h.status, 'var(--ink-3)'];
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '4px 8px', borderRadius: 6, background: i % 2 ? 'transparent' : 'var(--bg-2)' }}>
                    <span style={{ color: 'var(--ink-3)', minWidth: 90 }}>{fmtFecha(h.date)}</span>
                    <span style={{ flex: 1 }}>{h.actividad} · {h.grupo}</span>
                    <span style={{ fontWeight: 700, color: col }}>{lbl.replace(/s$/, '')}</span>
                  </div>
                );
              })}
            </div>
          )
          : <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
              {asistencia.historico.length ? 'Sin registros en este periodo.' : 'Sin asistencia registrada todavía.'}
            </span>}
      </Seccion>

      {/* ── Reservas activas (lista de espera) ── */}
      {reservas.length > 0 && (
        <Seccion titulo="Reservas activas">
          <div style={{ display: 'grid', gap: 4 }}>
            {reservas.map((r, i) => (
              <div key={i} style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                En espera de <b>{r.actividad}</b> · {r.grupo} <span style={{ color: 'var(--ink-3)' }}>(desde {fmtFecha(r.desde)})</span>
              </div>
            ))}
          </div>
        </Seccion>
      )}

      {/* ── Resumen económico anual por pagador ── */}
      <Seccion titulo="Resumen económico anual">
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--ink-3)' }}>
          Justificante de lo abonado en un año por un pagador. Cada documento contiene solo las facturas de ese pagador.
        </p>
        {pagadores.length === 0
          ? <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>No consta ningún pagador asociado a este alumno.</span>
          : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-3)' }}>
                Año
                <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={selCss}>
                  {anios.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-3)', flex: 1, minWidth: 200 }}>
                Pagador
                <select value={pagador} onChange={e => setPagador(e.target.value)} style={{ ...selCss, width: '100%' }}>
                  {pagadores.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.relacion}</option>)}
                </select>
              </label>
              <button type="button" className="btn btn-primary btn-sm" onClick={descargarResumen} disabled={!pagador}>
                <I.Download /> Descargar resumen {anio}
              </button>
            </div>
          )}
      </Seccion>
    </div>
  );
}

const selCss = {
  fontFamily: 'inherit', fontSize: 14, padding: '8px 10px', borderRadius: 10,
  border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)',
};
