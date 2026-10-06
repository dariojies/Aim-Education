import React, { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Aviso y consentimiento de cookies (tickets #295 y #255).
//
// La web solo usa una cookie propia, la de la sesión, que es técnica y no pide
// consentimiento. Lo que sí lo pide son los contenidos de otros servicios que
// ponen sus propias cookies: el vídeo de YouTube de la portada. No se carga
// hasta que se acepta. («Trabaja con nosotros» ya es un formulario propio, #368.)
//
// Y el análisis propio (#341): con permiso, un identificador al azar en este
// navegador para saber qué páginas ve; si es de una familia del club o nos
// escribe, se relaciona con su ficha. Sin permiso no se manda nada, y al
// retirarlo se borra lo guardado.
//
// La elección se guarda en este navegador (almacenamiento local) 12 meses. Se
// puede cambiar cuando se quiera desde «Configurar cookies», en el pie.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE = 'aim_cookies';
// Versión 2: se añade el análisis propio, así que se vuelve a preguntar a todos.
const VERSION = 2;
const CLAVE_VISITANTE = 'aim_visitante';
const DURACION_MS = 365 * 24 * 60 * 60 * 1000;
const EVENTO_CAMBIO = 'aim-cookies-cambio';
const EVENTO_ABRIR = 'aim-cookies-abrir';

export function leerConsentimiento() {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (!v || v.v !== VERSION || !v.fecha || Date.now() - v.fecha > DURACION_MS) return null;
    return v;
  } catch { return null; }
}

export function guardarConsentimiento(externos, analitica = !!leerConsentimiento()?.analitica) {
  const v = { v: VERSION, externos: !!externos, analitica: !!analitica, fecha: Date.now() };
  try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch { /* sin almacenamiento: vale para esta visita */ }
  if (!v.analitica) olvidarVisitante();
  window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO, { detail: v }));
}

// ── Análisis propio ──
// El identificador de este navegador, solo con permiso (si no, null).
export function visitanteId() {
  if (!leerConsentimiento()?.analitica) return null;
  try {
    let id = localStorage.getItem(CLAVE_VISITANTE);
    if (!/^[0-9a-f]{32}$/.test(id || '')) {
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      id = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(CLAVE_VISITANTE, id);
    }
    return id;
  } catch { return null; }
}
function olvidarVisitante() {
  try {
    const id = localStorage.getItem(CLAVE_VISITANTE);
    if (!id) return;
    localStorage.removeItem(CLAVE_VISITANTE);
    fetch('/api/v/olvidar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: id }), keepalive: true }).catch(() => {});
  } catch { /* nada */ }
}
// Apunta una página vista (o un aviso pinchado: «cta:3»). Las del panel no:
// los números largos de la dirección (enlaces con clave) se quitan.
export function registrarVisita(ruta) {
  const v = visitanteId();
  if (!v || !ruta || ruta.startsWith('/admin')) return;
  const limpia = ruta.split('?')[0].split('/').map(x => (/[0-9a-f-]{20,}/i.test(x) ? ':id' : x)).join('/');
  const o = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : '';
  fetch('/api/v', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v, r: limpia, o }), keepalive: true }).catch(() => {});
}

// Para el enlace del pie: vuelve a abrir el aviso.
export const abrirConfiguracionCookies = () => window.dispatchEvent(new Event(EVENTO_ABRIR));

// ¿Se pueden cargar contenidos de terceros? Se actualiza en cuanto cambia.
export function useCookiesExternas() {
  const [ok, setOk] = useState(() => !!leerConsentimiento()?.externos);
  useEffect(() => {
    const f = (e) => setOk(!!e.detail?.externos);
    window.addEventListener(EVENTO_CAMBIO, f);
    return () => window.removeEventListener(EVENTO_CAMBIO, f);
  }, []);
  return ok;
}

// Un contenido de un tercero (vídeo, formulario…): sin consentimiento se enseña
// un aviso en su lugar, con un botón para aceptarlo y verlo.
export function ContenidoExterno({ servicio, que = 'este contenido', children, style }) {
  const ok = useCookiesExternas();
  if (ok) return children;
  return (
    <div style={{
      display: 'grid', placeItems: 'center', textAlign: 'center', gap: 10, padding: 20,
      background: 'var(--bg-3)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-2)', ...style,
    }}>
      <div style={{ fontSize: 14, maxWidth: 380, lineHeight: 1.5 }}>
        Para ver {que} se carga <b>{servicio}</b>, que usa sus propias cookies.
      </div>
      <button type="button" className="btn btn-sm btn-gradient" onClick={() => guardarConsentimiento(true)}>
        Aceptar y ver
      </button>
      <a href="/legal/cookies" style={{ fontSize: 12, color: 'var(--ink-3)' }}>Más información</a>
    </div>
  );
}

export function CookieBanner() {
  const [visible, setVisible] = useState(() => !leerConsentimiento());
  const [config, setConfig] = useState(false);
  const [externos, setExternos] = useState(() => !!leerConsentimiento()?.externos);
  const [analitica, setAnalitica] = useState(() => !!leerConsentimiento()?.analitica);

  useEffect(() => {
    const abrir = () => { setExternos(!!leerConsentimiento()?.externos); setAnalitica(!!leerConsentimiento()?.analitica); setConfig(true); setVisible(true); };
    window.addEventListener(EVENTO_ABRIR, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR, abrir);
  }, []);

  if (!visible) return null;
  const decidir = (x, a) => { guardarConsentimiento(x, a); setVisible(false); setConfig(false); };

  return (
    <div role="dialog" aria-live="polite" aria-label="Aviso de cookies" style={{
      position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 2000, margin: '0 auto', maxWidth: 720,
      background: 'var(--bg-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 18,
      boxShadow: '0 12px 40px rgba(0,0,0,.25)', padding: '18px 20px', display: 'grid', gap: 12,
    }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>Cookies</div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
        Usamos una cookie propia necesaria para iniciar sesión. Si nos dejas, también guardamos un identificador
        para saber qué páginas visitas y así atenderte mejor (si eres de una familia del club o nos escribes, lo
        relacionamos con tu ficha). Algunos contenidos, como el vídeo de presentación, son de otros servicios (YouTube)
        que ponen sus propias cookies: no se cargan hasta que los aceptes. No usamos cookies de publicidad. <a href="/legal/cookies">Política de cookies</a>.
      </p>
      {config && (
        <div style={{ display: 'grid', gap: 8, padding: 12, background: 'var(--bg-3)', borderRadius: 12 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
            <input type="checkbox" checked disabled style={{ marginTop: 3 }} />
            <span><b>Necesarias</b> — la de la sesión. Sin ella no se puede entrar a la cuenta. Siempre activas.</span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={analitica} onChange={e => setAnalitica(e.target.checked)} style={{ marginTop: 3 }} />
            <span><b>Análisis</b> — qué páginas de esta web visitas, para conocerte mejor y atenderte. Solo lo vemos nosotros; se borra a los 13 meses o al quitar este permiso.</span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={externos} onChange={e => setExternos(e.target.checked)} style={{ marginTop: 3 }} />
            <span><b>Contenidos externos</b> — el vídeo de presentación de YouTube.</span>
          </label>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {config
          ? <button type="button" className="btn btn-sm btn-gradient" onClick={() => decidir(externos, analitica)}>Guardar mi elección</button>
          : <button type="button" className="btn btn-sm btn-outline" onClick={() => setConfig(true)}>Configurar</button>}
        {/* Rechazar es tan fácil como aceptar: los dos botones iguales. */}
        <button type="button" className="btn btn-sm btn-outline" onClick={() => decidir(false, false)}>Solo las necesarias</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => decidir(true, true)}>Aceptar todas</button>
      </div>
    </div>
  );
}
