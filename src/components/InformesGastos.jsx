import React, { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Los informes de gastos y beneficio: salen en Gastos (para el día a día) y en
// Reportes (#416, para ver cómo va todo). Desde Reportes llevan el periodo
// elegido arriba, y no enseñan el suyo.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => `${Number(n || 0).toFixed(2)} €`;

// Periodos naturales de calendario, no ventanas móviles: en julio el mes es
// julio entero (aunque no haya acabado), el trimestre es mayo-junio-julio y el
// año es enero-diciembre. Contar "del 12 de junio al 12 de julio" no le cuadra
// a nadie que lleve la caja del club.
const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const PERIODOS = {
  mes: () => { const n = new Date(); return { desde: iso(new Date(n.getFullYear(), n.getMonth(), 1)), hasta: iso(new Date(n.getFullYear(), n.getMonth() + 1, 0)) }; },
  trimestre: () => { const n = new Date(); return { desde: iso(new Date(n.getFullYear(), n.getMonth() - 2, 1)), hasta: iso(new Date(n.getFullYear(), n.getMonth() + 1, 0)) }; },
  ano: () => { const n = new Date(); return { desde: `${n.getFullYear()}-01-01`, hasta: `${n.getFullYear()}-12-31` }; },
  todo: () => ({ desde: '', hasta: '' }),
};
const NOMBRE_PERIODO = [['mes', 'Este mes'], ['trimestre', 'Último trimestre'], ['ano', 'Este año'], ['todo', 'Todo']];
// Qué atajo corresponde a un rango, para que el botón siga marcado al volver.
const periodoDe = (desde, hasta) =>
  NOMBRE_PERIODO.map(([k]) => k).find(k => { const r = PERIODOS[k](); return r.desde === desde && r.hasta === hasta; }) || null;

// Los botones de periodo. Salen en gastos y en el informe, con el mismo criterio.
export function FiltroPeriodo({ desde, hasta, onChange }) {
  const activo = periodoDe(desde, hasta);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {NOMBRE_PERIODO.map(([k, l]) => (
        <button key={k} className={`filter-pill ${activo === k ? 'is-active' : ''}`}
          onClick={() => { const r = PERIODOS[k](); onChange(r.desde, r.hasta); }}>{l}</button>
      ))}
    </div>
  );
}

// Informe de beneficio por actividad: ingresos − gastos, repartiendo los comunes.
export function InformeBeneficios({ periodo = null }) {
  const [datos, setDatos] = useState(null);

  const [desdeP, setDesde] = useState('');
  const [hastaP, setHasta] = useState('');
  const desde = periodo ? periodo.desde : desdeP, hasta = periodo ? periodo.hasta : hastaP;
  const [loading, setLoading] = useState(false);

  async function cargar() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (desde) p.set('desde', desde);
      if (hasta) p.set('hasta', hasta);
      const r = await fetch(`/api/admin/informes/beneficios?${p}`, { credentials: 'include' });
      if (r.ok) setDatos(await r.json());
    } catch { /* noop */ }
    finally { setLoading(false); }
  }
  useEffect(() => { cargar(); }, [desde, hasta]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
        Cruza los <b>ingresos cobrados</b> (sin IVA) con los <b>gastos</b> de cada actividad.
        Cada gasto común se reparte con el criterio que le pusiste al darlo de alta.
      </p>
      {!periodo && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 16px' }}>
        <FiltroPeriodo desde={desde} hasta={hasta} onChange={(a, b) => { setDesde(a); setHasta(b); }} />
        <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>Desde</label>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', fontFamily: 'inherit' }} />
        <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>Hasta</label>
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', fontFamily: 'inherit' }} />
      </div>}

      {loading && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Calculando...</p>}
      {datos && datos.filas.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          Todavía no hay datos: hacen falta cobros e imputar gastos a actividades.
        </div>
      )}
      {datos && datos.filas.length > 0 && (
        <>
          <div className="data-table">
            <div className="data-table-head" style={{ gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr' }}>
              <span>Actividad</span><span>Ingresos</span><span>Gastos propios</span><span>Parte comunes</span><span>Beneficio</span>
            </div>
            {datos.filas.map(f => (
              <div key={f.actividad} className="data-table-row" style={{ gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr', ...(f.general ? { background: 'var(--bg-3)' } : {}) }}>
                <div>
                  <div className="pri">{f.actividad}</div>
                  {datos.pesos?.[f.actividad] && (
                    <div className="sec">
                      {datos.pesos[f.actividad].alumnos} alumno{datos.pesos[f.actividad].alumnos === 1 ? '' : 's'}
                      {' · '}{datos.pesos[f.actividad].horas} h/semana
                    </div>
                  )}
                </div>
                <span style={{ color: 'var(--teal)', fontWeight: 700 }}>{eur(f.ingresos)}</span>
                <span className="sec">{eur(f.gastosDirectos)}</span>
                <span className="sec">{eur(f.gastosComunes)}</span>
                <span style={{ fontWeight: 800, fontFamily: 'var(--font-display)', color: f.beneficio >= 0 ? 'var(--teal)' : 'var(--orange)' }}>{eur(f.beneficio)}</span>
              </div>
            ))}
            <div className="data-table-row" style={{ gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr', background: 'var(--bg-3)', fontWeight: 800 }}>
              <span>TOTAL</span>
              <span style={{ color: 'var(--teal)' }}>{eur(datos.totales.ingresos)}</span>
              <span style={{ gridColumn: 'span 2' }}>{eur(datos.totales.gastos)}</span>
              <span style={{ fontFamily: 'var(--font-display)', color: datos.totales.beneficio >= 0 ? 'var(--teal)' : 'var(--orange)' }}>{eur(datos.totales.beneficio)}</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', display: 'grid', gap: 4 }}>
            <div>
              Gastos comunes repartidos: <b>{eur(datos.totalGastosComunes)}</b>
              {datos.bolsas && (
                <> — {[
                  datos.bolsas.iguales > 0 && `${eur(datos.bolsas.iguales)} a partes iguales`,
                  datos.bolsas.alumnos > 0 && `${eur(datos.bolsas.alumnos)} según los alumnos`,
                  datos.bolsas.horas > 0 && `${eur(datos.bolsas.horas)} según las horas`,
                ].filter(Boolean).join(', ') || 'nada que repartir'}</>
              )}
            </div>
            <div>
              Los alumnos y las horas de cada actividad salen del horario. El <b>campamento</b> cuenta los
              niños apuntados y sus 5 h diarias, y <b>Taller/Evento</b> los inscritos y la duración de cada evento.
            </div>
            {(datos.ventas > 0 || datos.bonos > 0 || datos.online > 0 || datos.sinActividad > 0) && <div>Las filas <b>Ventas</b> (todo lo facturado en la serie de material y productos, AIMMT), <b>Cursos online</b> (el aula virtual, AIMON), <b>Bonos</b> y <b>General</b> (lo que no es de ninguna actividad, como la matrícula) cuentan en el total, pero no se les reparten los gastos comunes.</div>}
            {datos.gastosVenta > 0 && <div>Los <b>{eur(datos.gastosVenta)}</b> de gastos de la categoría «Venta» (lo que se compra para venderlo) van en la fila <b>Ventas</b>, contra lo que se cobra por ello: no se le restan a ninguna actividad.</div>}
          </div>
        </>
      )}
    </div>
  );
}

// Desglose por persona (ticket #242): cuánto le corresponde a cada instructor de
// los ingresos y gastos. Los ingresos y gastos "sueltos" de cada actividad se
// reparten entre sus instructores según las horas que trabaja cada uno; los
// gastos asignados a una persona van enteros a esa persona.
export function InformeDesglosePersonas({ periodo = null }) {
  const [datos, setDatos] = useState(null);
  const [desdeP, setDesde] = useState('');
  const [hastaP, setHasta] = useState('');
  const desde = periodo ? periodo.desde : desdeP, hasta = periodo ? periodo.hasta : hastaP;
  const [loading, setLoading] = useState(false);
  const [abierta, setAbierta] = useState(null);

  async function cargar() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (desde) p.set('desde', desde);
      if (hasta) p.set('hasta', hasta);
      const r = await fetch(`/api/admin/informes/desglose-personas?${p}`, { credentials: 'include' });
      if (r.ok) setDatos(await r.json());
    } catch { /* noop */ }
    finally { setLoading(false); }
  }
  useEffect(() => { cargar(); }, [desde, hasta]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
        Reparte los <b>ingresos</b> y los <b>gastos</b> de cada actividad entre sus instructores según las <b>horas</b> que trabaja cada uno en ella. Los gastos asignados a una persona concreta van enteros a esa persona.
      </p>
      {!periodo && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 16px' }}>
        <FiltroPeriodo desde={desde} hasta={hasta} onChange={(a, b) => { setDesde(a); setHasta(b); }} />
        <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>Desde</label>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', fontFamily: 'inherit' }} />
        <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>Hasta</label>
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', fontFamily: 'inherit' }} />
      </div>}

      {loading && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Calculando...</p>}
      {datos && datos.filas.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          Todavía no hay datos: hacen falta instructores asignados en el horario, cobros y gastos.
        </div>
      )}
      {datos && datos.filas.length > 0 && (
        <>
          <div className="data-table">
            <div className="data-table-head" style={{ gridTemplateColumns: '1.8fr 1fr 1fr 1fr' }}>
              <span>Instructor</span><span>Ingresos</span><span>Gastos</span><span>Beneficio</span>
            </div>
            {datos.filas.map(f => (
              <React.Fragment key={f.personaId}>
                <div className="data-table-row" style={{ gridTemplateColumns: '1.8fr 1fr 1fr 1fr', cursor: f.detalle.length ? 'pointer' : 'default', alignItems: 'center' }}
                  onClick={() => f.detalle.length && setAbierta(abierta === f.personaId ? null : f.personaId)}>
                  <div className="pri">
                    {f.detalle.length > 0 && <span style={{ color: 'var(--ink-3)', marginRight: 6 }}>{abierta === f.personaId ? '▾' : '▸'}</span>}
                    {f.nombre}
                  </div>
                  <span style={{ color: 'var(--teal)', fontWeight: 700 }}>{eur(f.ingresos)}</span>
                  <span className="sec">{eur(f.gastos)}</span>
                  <span style={{ fontWeight: 800, fontFamily: 'var(--font-display)', color: f.beneficio >= 0 ? 'var(--teal)' : 'var(--orange)' }}>{eur(f.beneficio)}</span>
                </div>
                {abierta === f.personaId && f.detalle.map(dt => (
                  <div key={dt.actividad} className="data-table-row" style={{ gridTemplateColumns: '1.8fr 1fr 1fr 1fr', background: 'var(--bg-3)', fontSize: 12 }}>
                    <div className="sec" style={{ paddingLeft: 22 }}>{dt.actividad} <span style={{ color: 'var(--ink-3)' }}>· {dt.horas} h/sem</span></div>
                    <span className="sec">{eur(dt.ingresos)}</span>
                    <span className="sec">{eur(dt.gastos)}</span>
                    <span className="sec">{eur(dt.ingresos - dt.gastos)}</span>
                  </div>
                ))}
              </React.Fragment>
            ))}
            <div className="data-table-row" style={{ gridTemplateColumns: '1.8fr 1fr 1fr 1fr', background: 'var(--bg-3)', fontWeight: 800 }}>
              <span>TOTAL</span>
              <span style={{ color: 'var(--teal)' }}>{eur(datos.totales.ingresos)}</span>
              <span>{eur(datos.totales.gastos)}</span>
              <span style={{ fontFamily: 'var(--font-display)' }}>{eur(datos.totales.ingresos - datos.totales.gastos)}</span>
            </div>
          </div>
          {datos.sinActividad > 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              No incluye <b>{eur(datos.sinActividad)}</b> de ingresos de ventas, bonos y otros que no son de ninguna actividad: no son de ningún instructor.
            </div>
          )}
          {(datos.sinInstructor.ingresos > 0 || datos.sinInstructor.gastos > 0) && (
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Hay actividades sin instructor asignado en el horario: <b>{eur(datos.sinInstructor.ingresos)}</b> de ingresos y <b>{eur(datos.sinInstructor.gastos)}</b> de gastos quedan sin repartir. Asígnales monitor en el horario para incluirlos.
            </div>
          )}
        </>
      )}
    </div>
  );
}
