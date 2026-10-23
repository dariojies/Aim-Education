import React, { useState, useEffect, useRef } from 'react';
import { numPaginas, paginaDe, lienzoDe, exportarDiseno, EJEMPLO_DIPLOMA } from '../disenos/render.js';
import Presentacion from '../disenos/Presentacion.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Un diseño de Aim Design para ver con un enlace (/d/<clave>): sin entrar y sin
// poder cambiarlo. Se ven sus páginas, se descargan (PDF o PNG) y se presentan.
// El enlace lo crea y lo quita el equipo desde el editor («Usar → Enlace para
// ver»). No sale en los buscadores.
// ─────────────────────────────────────────────────────────────────────────────
function Pagina({ v, variables }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let vivo = true;
    lienzoDe(v, { variables, ancho: Math.min(1600, v.ancho) }).then(c => { if (vivo) setSrc(c.toDataURL('image/jpeg', 0.9)); }).catch(() => {});
    return () => { vivo = false; };
  }, [v, variables]);
  return src
    ? <img src={src} alt="" style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 6, boxShadow: '0 10px 40px -12px rgba(0,0,0,.35)', background: '#fff' }} />
    : <div style={{ aspectRatio: `${v.ancho} / ${v.alto}`, background: 'var(--bg-3)', borderRadius: 6 }} />;
}

export default function VerDiseno({ token }) {
  const [d, setD] = useState(null);
  const [presentar, setPresentar] = useState(null);
  const [bajando, setBajando] = useState(false);
  const ancho = useRef(null);
  useEffect(() => {
    document.title = 'Diseño · Aim Education';
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m);
    fetch(`/api/publico/disenos/${encodeURIComponent(token)}`).then(async r => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error || 'Este enlace ya no funciona.'))))
      .then(x => { setD(x); document.title = `${x.nombre} · Aim Education`; }).catch(e => setD({ error: e.message }));
    return () => m.remove();
  }, [token]);
  if (!d) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-3)' }}>Cargando…</div>;
  if (d.error) return (
    <div style={{ padding: '80px 20px', textAlign: 'center', display: 'grid', gap: 10 }}>
      <b style={{ fontSize: 20 }}>{d.error}</b>
      <span style={{ color: 'var(--ink-3)' }}>Pide a quien te lo mandó un enlace nuevo.</span>
    </div>
  );
  const n = numPaginas(d.datos), variables = d.tipo === 'diploma' ? EJEMPLO_DIPLOMA : null;
  const bajar = async (formato) => { setBajando(true); try { await exportarDiseno(d.datos, formato, d.nombre, { variables }); } finally { setBajando(false); } };
  const vertical = d.datos.alto > d.datos.ancho * 1.1;
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '24px 16px 60px', boxSizing: 'border-box' }}>
      <div ref={ancho} style={{ maxWidth: vertical ? 640 : 1000, margin: '0 auto', display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <img src="/src/brand/Aim_Horizontal.png" alt="Aim Education" style={{ height: 34 }} />
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <b style={{ fontSize: 18, display: 'block' }}>{d.nombre}</b>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{n > 1 ? `${n} páginas · ` : ''}Diseño de Aim Education</span>
          </div>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setPresentar(0)}>▶ Presentar</button>
          <button type="button" className="btn btn-sm btn-outline" disabled={bajando} onClick={() => bajar('pdf')}>⬇ PDF</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={bajando} onClick={() => bajar('png')}>⬇ {n > 1 ? 'Imágenes' : 'Imagen'}</button>
        </div>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} style={{ display: 'grid', gap: 6 }}>
            {n > 1 && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>Página {i + 1}</span>}
            <button type="button" onClick={() => setPresentar(i)} aria-label={`Presentar desde la página ${i + 1}`} style={{ border: 0, padding: 0, background: 'none', cursor: 'zoom-in' }}>
              <Pagina v={paginaDe(d.datos, i)} variables={variables} />
            </button>
          </div>
        ))}
      </div>
      {presentar != null && <Presentacion doc={d.datos} inicio={presentar} variables={variables} onCerrar={() => setPresentar(null)} />}
    </div>
  );
}
