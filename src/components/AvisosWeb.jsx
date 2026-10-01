import React, { useState, useEffect } from 'react';
import { registrarVisita } from './Cookies.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Avisos y llamadas a la acción de la web (ticket #341). Se crean en el panel
// (Web pública → Avisos y CTA) y salen en las páginas que se elijan:
//   · barra: una franja arriba del todo, con su botón.
//   · ventana: aparece a los segundos que se diga, una vez por visita.
//   · botón: flotante, abajo a la derecha.
// Cuenta las veces que se ven, se pinchan y se cierran. Si alguien cierra una,
// no vuelve a verla en una semana (se recuerda en este navegador).
// ─────────────────────────────────────────────────────────────────────────────

const CERRADAS = 'aim_ctas_cerradas';
const SEMANA = 7 * 864e5;
const leerCerradas = () => { try { return JSON.parse(localStorage.getItem(CERRADAS) || '{}') || {}; } catch { return {}; } };
const cerradaHace = (id) => Date.now() - (leerCerradas()[id] || 0) < SEMANA;
const evento = (id, tipo) => fetch(`/api/ctas/${id}/${tipo}`, { method: 'POST', keepalive: true }).catch(() => {});

// ¿Sale en esta página? Sin páginas, en todas; «/actividades*» vale para todas
// las que empiezan así.
export const salePara = (c, ruta) => !c.paginas?.length || c.paginas.some(p => (p.endsWith('*') ? ruta.startsWith(p.slice(0, -1)) : ruta === p));

let cache = null;
function useCtas() {
  const [lista, setLista] = useState(cache || []);
  useEffect(() => {
    if (cache) return;
    fetch('/api/ctas').then(r => (r.ok ? r.json() : { ctas: [] })).then(d => { cache = d.ctas || []; setLista(cache); }).catch(() => {});
  }, []);
  return lista;
}

// Una vez por visita y aviso.
function contarVista(id) {
  try {
    const k = `aim_cta_vista_${id}`;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, '1');
  } catch { /* sin almacenamiento: se cuenta igual */ }
  evento(id, 'vista');
}

// El botón de un aviso: cuenta el clic y lleva a su sitio (dentro de la web,
// sin recargar).
export function BotonCta({ c, go, style, previa = false }) {
  if (!c.botonTexto) return null;
  const ir = (e) => {
    if (previa) { e.preventDefault(); return; }
    evento(c.id, 'clic');
    registrarVisita(`cta:${c.id}`);
    if (c.botonUrl.startsWith('/') && go) { e.preventDefault(); go(c.botonUrl); }
  };
  const externo = /^https?:/i.test(c.botonUrl);
  return (
    <a href={c.botonUrl || '#'} onClick={ir} target={externo ? '_blank' : undefined} rel={externo ? 'noopener noreferrer' : undefined}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 999, background: '#fff', color: c.color, fontWeight: 800, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap', ...style }}>
      {c.botonTexto} →
    </a>
  );
}

export function BarraCta({ c, go, onCerrar, previa }) {
  return (
    <div role="region" aria-label={c.titulo || 'Aviso'} style={{ background: c.color, color: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap', fontSize: 14, position: 'relative' }}>
      <span style={{ textAlign: 'center' }}>{c.titulo && <b>{c.titulo}</b>}{c.titulo && c.texto ? ' · ' : ''}{c.texto}</span>
      <BotonCta c={c} go={go} previa={previa} style={{ padding: '6px 14px', fontSize: 13 }} />
      <button type="button" aria-label="Cerrar el aviso" onClick={onCerrar} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, color: '#fff', fontSize: 20, cursor: 'pointer', lineHeight: 1, opacity: 0.85 }}>×</button>
    </div>
  );
}

export function VentanaCta({ c, go, onCerrar, previa }) {
  return (
    <div role="dialog" aria-modal={!previa} aria-label={c.titulo || 'Aviso'} onClick={previa ? undefined : onCerrar}
      style={{ position: previa ? 'relative' : 'fixed', inset: previa ? undefined : 0, zIndex: 1900, background: previa ? 'transparent' : 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(440px, 100%)', borderRadius: 22, overflow: 'hidden', background: 'var(--bg-2)', color: 'var(--ink)', boxShadow: '0 20px 60px rgba(0,0,0,.3)', position: 'relative' }}>
        <div style={{ background: c.color, color: '#fff', padding: '22px 24px', display: 'grid', gap: 8 }}>
          {c.titulo && <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>{c.titulo}</div>}
          {c.texto && <div style={{ fontSize: 15, lineHeight: 1.5, opacity: 0.95, whiteSpace: 'pre-wrap' }}>{c.texto}</div>}
          <div style={{ marginTop: 6 }}><BotonCta c={c} go={go} previa={previa} /></div>
        </div>
        <button type="button" aria-label="Cerrar" onClick={onCerrar} style={{ position: 'absolute', right: 10, top: 8, background: 'none', border: 0, color: '#fff', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
    </div>
  );
}

export function FlotanteCta({ c, go, onCerrar, previa }) {
  return (
    <div style={{ position: previa ? 'relative' : 'fixed', right: previa ? undefined : 18, bottom: previa ? undefined : 18, zIndex: 1500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <BotonCta c={c} go={go} previa={previa} style={{ background: c.color, color: '#fff', padding: '12px 20px', fontSize: 15, boxShadow: '0 10px 28px rgba(0,0,0,.25)' }} />
      <button type="button" aria-label="Quitar el botón" onClick={onCerrar} style={{ width: 26, height: 26, borderRadius: 99, border: 0, background: 'var(--bg-2)', color: 'var(--ink-2)', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>×</button>
    </div>
  );
}

// Los avisos de la página que se está viendo. `arriba` pinta solo la barra (va
// encima de la página); sin él, la ventana y el botón flotante.
export default function AvisosWeb({ ruta, go, arriba = false }) {
  const lista = useCtas();
  const [cerradas, setCerradas] = useState({});
  const [ventanaLista, setVentanaLista] = useState(null);
  const visibles = lista.filter(c => salePara(c, ruta) && !cerradas[c.id] && !cerradaHace(c.id));
  const barra = visibles.find(c => c.formato === 'barra');
  const ventana = visibles.find(c => c.formato === 'ventana' && !(() => { try { return sessionStorage.getItem(`aim_cta_vista_${c.id}`); } catch { return false; } })());
  const flotante = visibles.find(c => c.formato === 'boton');

  // La ventana, a sus segundos y una vez por visita.
  useEffect(() => {
    if (arriba || !ventana) return undefined;
    const t = setTimeout(() => { setVentanaLista(ventana); contarVista(ventana.id); }, (ventana.retraso || 0) * 1000);
    return () => clearTimeout(t);
  }, [arriba, ventana?.id, ruta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (arriba && barra) contarVista(barra.id); }, [arriba, barra?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!arriba && flotante) contarVista(flotante.id); }, [arriba, flotante?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cerrar = (c) => {
    evento(c.id, 'cierre');
    try { localStorage.setItem(CERRADAS, JSON.stringify({ ...leerCerradas(), [c.id]: Date.now() })); } catch { /* nada */ }
    setCerradas(x => ({ ...x, [c.id]: true }));
    if (ventanaLista?.id === c.id) setVentanaLista(null);
  };

  if (arriba) return barra ? <BarraCta c={barra} go={go} onCerrar={() => cerrar(barra)} /> : null;
  return (
    <>
      {ventanaLista && !cerradas[ventanaLista.id] && <VentanaCta c={ventanaLista} go={(u) => { setVentanaLista(null); go(u); }} onCerrar={() => cerrar(ventanaLista)} />}
      {flotante && <FlotanteCta c={flotante} go={go} onCerrar={() => cerrar(flotante)} />}
    </>
  );
}
