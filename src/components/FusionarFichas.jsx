import React, { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Fusionar dos fichas de la misma persona (ticket #347). Se elige cuál se queda,
// qué dato vale de cada una y todo lo de la otra (clases, cobros, facturas,
// familia, asistencia…) pasa a la que queda. La otra se borra. No se deshace.
// ─────────────────────────────────────────────────────────────────────────────

const ETIQUETAS = {
  name: 'Nombre', surname: 'Apellidos', email: 'Correo', phone: 'Teléfono', dni: 'DNI', birthday: 'Nacimiento',
  domicilio: 'Dirección', cp: 'C. postal', poblacion: 'Población', belt: 'Cinturón', profile_picture: 'Foto',
};
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%' };
const verValor = (k, v) => {
  if (v == null || String(v).trim() === '') return <span style={{ color: 'var(--ink-3)' }}>—</span>;
  if (k === 'birthday') return new Date(String(v).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES');
  if (k === 'profile_picture') return 'sí';
  if (k === 'email' && /@sin-correo\.invalid$/.test(v)) return <span style={{ color: 'var(--ink-3)' }}>sin correo</span>;
  return String(v);
};
const nombreDe = (u) => `${u.name || ''} ${u.surname || ''}`.trim();

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: opts.body ? { 'Content-Type': 'application/json' } : undefined, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido.');
  return d;
}

// Aviso en la ficha: hay otra que parece de la misma persona.
export function AvisoRepetida({ personaId, onFusionar }) {
  const [p, setP] = useState([]);
  useEffect(() => {
    if (!personaId) return;
    api(`/api/admin/fusion/parecidas/${personaId}`).then(d => setP(d.parecidas || [])).catch(() => setP([]));
  }, [personaId]);
  if (!p.length) return null;
  return (
    <div style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 12, background: 'color-mix(in oklab, var(--orange) 10%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--orange) 35%, transparent)', fontSize: 13 }}>
      {p.map(x => (
        <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 240px' }}>⚠ Parece repetida: hay otra ficha con {x.por}, <b>{x.nombre}</b> <span style={{ color: 'var(--ink-3)' }}>({x.email})</span>.</span>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => onFusionar(x)}>Revisar y fusionar</button>
        </div>
      ))}
    </div>
  );
}

export default function FusionarFichas({ personaId, otra: otraInicial = null, onCerrar, onHecho }) {
  const [otra, setOtra] = useState(otraInicial);
  const [q, setQ] = useState('');
  const [sug, setSug] = useState([]);
  const [quedaEsta, setQuedaEsta] = useState(true);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [elige, setElige] = useState({});
  const [seguro, setSeguro] = useState(false);
  const [fusionando, setFusionando] = useState(false);

  useEffect(() => {
    if (otra || q.trim().length < 2) { setSug([]); return undefined; }
    const t = setTimeout(() => api(`/api/admin/personas?q=${encodeURIComponent(q.trim())}`).then(x => setSug((x || []).filter(y => y.id !== personaId).slice(0, 8))).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q, otra, personaId]);

  const queda = quedaEsta ? personaId : otra?.id;
  const sobra = quedaEsta ? otra?.id : personaId;
  useEffect(() => {
    if (!otra) return;
    setD(null); setError(''); setSeguro(false);
    api(`/api/admin/fusion/previa?queda=${queda}&sobra=${sobra}`).then(x => {
      setD(x);
      // Por defecto: lo de la que queda y, si lo tiene vacío, lo de la otra.
      const e = {};
      for (const k of x.campos) {
        const a = x.queda[k], b = x.sobra[k];
        const vacio = (v) => v == null || String(v).trim() === '' || /@sin-correo\.invalid$/.test(String(v));
        e[k] = vacio(a) && !vacio(b) ? 'sobra' : 'queda';
      }
      setElige(e);
    }).catch(err => setError(err.message));
  }, [otra, queda, sobra]);

  async function fusionar() {
    setFusionando(true);
    try {
      const r = await api('/api/admin/fusion', { method: 'POST', body: { queda, sobra, campos: elige } });
      const n = Object.values(r.movidas || {}).reduce((s, x) => s + x, 0);
      onHecho?.({ queda, mensaje: `Fichas fusionadas: ${n} dato${n !== 1 ? 's' : ''} pasado${n !== 1 ? 's' : ''} a la que queda.` });
    } catch (err) { alert(err.message); } finally { setFusionando(false); }
  }

  const distintos = d ? d.campos.filter(k => String(d.queda[k] ?? '') !== String(d.sobra[k] ?? '')) : [];
  return (
    <div role="dialog" aria-modal="true" aria-label="Fusionar fichas" onClick={onCerrar}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,.6)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-2)', borderRadius: 20, padding: 24, display: 'grid', gap: 14, boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20 }}>Fusionar fichas repetidas</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          Para cuando una misma persona tiene dos fichas. Todo lo de la que sobra (clases, cobros, facturas, familia, asistencia, permisos…) pasa a la que queda, y la que sobra se borra. <b>No se puede deshacer.</b>
        </p>

        {!otra && (
          <div style={{ display: 'grid', gap: 6 }}>
            <input autoFocus style={campo} value={q} onChange={e => setQ(e.target.value)} placeholder="Busca la otra ficha por nombre o correo…" />
            {sug.map(x => (
              <button key={x.id} type="button" className="payment-row" onClick={() => setOtra(x)}
                style={{ gridTemplateColumns: 'minmax(0,1fr) auto', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--ink)' }}>
                <span><b>{x.nombre}</b><span style={{ fontSize: 12, color: 'var(--ink-3)' }}> · {x.email}</span></span>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--purple)' }}>Es esta →</span>
              </button>
            ))}
          </div>
        )}

        {otra && !d && !error && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Comparando las dos fichas…</p>}
        {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--orange)' }}>{error}</p>}

        {d && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              Se queda <b>{nombreDe(d.queda)}</b> <span style={{ color: 'var(--ink-3)' }}>({d.queda.email})</span> y se borra <b>{nombreDe(d.sobra)}</b> <span style={{ color: 'var(--ink-3)' }}>({d.sobra.email})</span>.
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setQuedaEsta(v => !v)}>⇄ Al revés</button>
              {!otraInicial && <button type="button" className="btn btn-sm btn-outline" onClick={() => { setOtra(null); setD(null); }}>Elegir otra</button>}
            </div>

            {distintos.length > 0 && (
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-2)' }}>Qué dato vale (donde no coinciden)</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) minmax(0,1fr)', gap: '4px 12px', alignItems: 'center', fontSize: 13 }}>
                  <span /><b style={{ fontSize: 11, color: 'var(--ink-3)' }}>LA QUE QUEDA</b><b style={{ fontSize: 11, color: 'var(--ink-3)' }}>LA QUE SE BORRA</b>
                  {distintos.map(k => (
                    <React.Fragment key={k}>
                      <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}>{ETIQUETAS[k]}</span>
                      {['queda', 'sobra'].map(lado => (
                        <label key={lado} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', minWidth: 0, padding: '4px 8px', borderRadius: 8, background: elige[k] === lado ? 'color-mix(in oklab, var(--purple) 10%, var(--bg-3))' : 'transparent' }}>
                          <input type="radio" name={`f-${k}`} checked={elige[k] === lado} onChange={() => setElige(e => ({ ...e, [k]: lado }))} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{verValor(k, d[lado][k])}</span>
                        </label>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              {d.mueve.length
                ? <>Pasa a la que queda: {d.mueve.map(m => `${m.nombre} (${m.n})`).join(', ')}.</>
                : <>La que se borra no tiene nada más asociado.</>}
            </div>

            {d.bloqueo
              ? <p style={{ margin: 0, fontSize: 13, color: 'var(--orange)', fontWeight: 700 }}>{d.bloqueo}</p>
              : (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
                  <input type="checkbox" checked={seguro} onChange={e => setSeguro(e.target.checked)} /> Son la misma persona. Entiendo que no se puede deshacer.
                </label>
              )}
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={!d || !!d.bloqueo || !seguro || fusionando} onClick={fusionar}>{fusionando ? 'Fusionando…' : 'Fusionar'}</button>
        </div>
      </div>
    </div>
  );
}
