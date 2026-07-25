import React, { useState, useEffect, useCallback, useMemo } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Cobro de los días de campamento.
//
// El sistema propone el reparto más barato para cada niño (mes, quincena,
// semana y días sueltos), pero la última palabra la tiene secretaría: puede
// cambiar las cantidades antes de generar los cargos. Lo ya cobrado no se toca.
// Matinal y custodia van por su cuenta, en su propio panel.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVES = ['completo', 'mes', 'quincena', 'semana', 'dia'];
const eur = (n) => `${Number(n ?? 0).toFixed(2)} €`;

export default function CampTarifas({ showToast, onCambio }) {
  const [datos, setDatos] = useState(null);
  const [eleccion, setEleccion] = useState({}); // childId -> { completo, mes, ... }
  const [generando, setGenerando] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/camp/tarifas', { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      setDatos(d);
      // Se parte de la propuesta; secretaría la ajusta si quiere.
      const ini = {};
      for (const f of d.filas) ini[f.childId] = { ...f.sugerencia };
      setEleccion(ini);
    } catch { /* noop */ }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const precio = useCallback((clave) => Number(datos?.tarifas?.[clave]?.precio ?? 0), [datos]);
  const importeDe = useCallback((sel) => CLAVES.reduce((s, k) => s + (Number(sel?.[k]) || 0) * precio(k), 0), [precio]);

  // Cuántos de sus días quedan cubiertos con lo elegido, para avisar de si se
  // queda corto o se pasa.
  // Cuenta lo elegido MÁS lo que ya pagó: si tiene dos semanas pagadas y ahora
  // se le cobra un día suelto, está cubierto del todo.
  const cobertura = useCallback((f, sel) => {
    const ya = f.yaCobrado?.unidades || {};
    const n = (k) => (Number(sel?.[k]) || 0) + (Number(ya[k]) || 0);
    if (n('completo') > 0) return f.totalDias;
    const semanasCubiertas = n('mes') * 4 + n('quincena') * 2 + n('semana');
    const ordenadas = [...f.semanas].sort((a, b) => b.dias - a.dias);
    const dias = ordenadas.slice(0, semanasCubiertas).reduce((s, w) => s + w.dias, 0);
    return Math.min(f.totalDias + n('dia'), dias + n('dia'));
  }, []);

  const pendientes = useMemo(
    () => (datos?.filas || []).filter(f => f.alumnoId && !f.yaCobrado?.cubreTodo),
    [datos]
  );
  const totalPendiente = useMemo(
    () => pendientes.reduce((s, f) => s + importeDe(eleccion[f.childId]), 0),
    [pendientes, eleccion, importeDe]
  );

  async function generar() {
    const cuantos = pendientes.filter(f => importeDe(eleccion[f.childId]) > 0).length;
    if (!cuantos) { alert('No hay nada que generar: revisa las cantidades.'); return; }
    if (!window.confirm(`Se van a generar los cargos de los días de campamento de ${cuantos} niño(s), por ${eur(totalPendiente)}.\nLo ya cobrado no se toca. ¿Continuar?`)) return;
    setGenerando(true);
    try {
      const r = await fetch('/api/admin/camp/tarifas/facturar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ eleccion }),
      });
      const d = await r.json();
      if (r.ok) {
        showToast?.(`${d.creados} cargo${d.creados !== 1 ? 's' : ''} generado${d.creados !== 1 ? 's' : ''} · ${eur(d.total)}`);
        const avisos = [];
        if (d.sinFicha?.length) avisos.push(`Sin ficha de alumno, no se les puede cobrar:\n${d.sinFicha.join('\n')}`);
        if (d.omitidos?.length) avisos.push(`Ya tenían cobrados sus días, no se han vuelto a generar:\n${d.omitidos.join('\n')}`);
        if (avisos.length) alert(avisos.join('\n\n'));
        await cargar();
        onCambio?.();
      } else alert(d.error || 'No se pudieron generar los cargos.');
    } catch { alert('Error de conexión.'); }
    finally { setGenerando(false); }
  }

  if (!datos || !datos.filas.length) return null;
  const sinFicha = datos.filas.filter(f => !f.alumnoId).length;

  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', marginBottom: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Días de campamento · {eur(totalPendiente)} por cobrar</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            Propuesta automática con la tarifa más barata. Puedes cambiar las cantidades antes de generar.
            {sinFicha > 0 && <> · <b style={{ color: 'var(--orange)' }}>{sinFicha} sin ficha de alumno</b>, no se les puede cobrar.</>}
          </div>
        </div>
        <button className="btn btn-sm btn-outline" onClick={() => setAbierto(a => !a)}>
          {abierto ? 'Ocultar detalle' : 'Ver y ajustar'}
        </button>
        <button className="btn btn-sm btn-primary" disabled={generando} onClick={generar}>
          {generando ? 'Generando...' : 'Generar cargos'}
        </button>
      </div>

      {abierto && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--ink-3)' }}>
            {CLAVES.map(k => <span key={k}>{datos.tarifas[k].etiqueta}: <b>{eur(datos.tarifas[k].precio)}</b></span>)}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 720, display: 'grid', gap: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 84px repeat(5, 58px) 84px 1fr', gap: 6, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)', padding: '0 4px' }}>
                <span>Niño</span><span>Asiste</span>
                {CLAVES.map(k => <span key={k} style={{ textAlign: 'center' }}>{datos.tarifas[k].etiqueta.split(' ')[0]}</span>)}
                <span style={{ textAlign: 'right' }}>Importe</span><span />
              </div>
              {datos.filas.map(f => {
                const sel = eleccion[f.childId] || {};
                const imp = importeDe(sel);
                const cub = cobertura(f, sel);
                // Solo se bloquea si ya está todo pagado; si pagó parte, se puede
                // cobrar lo que falta.
                const bloqueado = f.yaCobrado?.cubreTodo || !f.alumnoId;
                return (
                  <div key={f.childId} style={{
                    display: 'grid', gridTemplateColumns: '1.6fr 84px repeat(5, 58px) 84px 1fr', gap: 6, alignItems: 'center',
                    fontSize: 12, padding: '4px', borderRadius: 8, background: bloqueado ? 'var(--bg-3)' : 'transparent', opacity: bloqueado ? .65 : 1,
                  }}>
                    <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</span>
                    <span style={{ color: 'var(--ink-3)' }}>{f.totalDias}d · {f.totalSemanas}sem</span>
                    {CLAVES.map(k => (
                      <input key={k} type="number" min="0" max="99" disabled={bloqueado}
                        value={sel[k] ?? 0}
                        onChange={e => setEleccion(prev => ({ ...prev, [f.childId]: { ...prev[f.childId], [k]: Math.max(0, Number(e.target.value) || 0) } }))}
                        style={{ width: '100%', textAlign: 'center', fontFamily: 'inherit', fontSize: 12, padding: '4px 2px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' }} />
                    ))}
                    <span style={{ textAlign: 'right', fontWeight: 700 }}>{eur(imp)}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-3)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {!f.alumnoId && <b style={{ color: 'var(--orange)' }}>sin ficha</b>}
                      {f.yaCobrado && (
                        <b style={{ color: 'var(--teal)' }}>
                          ✓ pagado {eur(f.yaCobrado.importe)}: {f.yaCobrado.detalle.join(', ')}
                        </b>
                      )}
                      {!bloqueado && cub !== f.totalDias && (
                        <b style={{ color: cub < f.totalDias ? 'var(--orange)' : 'var(--purple)' }}>
                          {cub < f.totalDias ? `quedan ${f.totalDias - cub} días sin cubrir` : `cubre ${cub - f.totalDias} días de más`}
                        </b>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
