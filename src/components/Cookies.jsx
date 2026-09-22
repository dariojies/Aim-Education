import React, { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Aviso y consentimiento de cookies (tickets #295 y #255).
//
// La web solo usa una cookie propia, la de la sesión, que es técnica y no pide
// consentimiento. Lo que sí lo pide son los contenidos de otros servicios que
// ponen sus propias cookies: el vídeo de YouTube de la portada y el formulario de
// HubSpot de «Trabaja con nosotros». Esos no se cargan hasta que se aceptan.
//
// La elección se guarda en este navegador (almacenamiento local) 12 meses. Se
// puede cambiar cuando se quiera desde «Configurar cookies», en el pie.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE = 'aim_cookies';
const VERSION = 1;
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

export function guardarConsentimiento(externos) {
  const v = { v: VERSION, externos: !!externos, fecha: Date.now() };
  try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch { /* sin almacenamiento: vale para esta visita */ }
  window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO, { detail: v }));
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

  useEffect(() => {
    const abrir = () => { setExternos(!!leerConsentimiento()?.externos); setConfig(true); setVisible(true); };
    window.addEventListener(EVENTO_ABRIR, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR, abrir);
  }, []);

  if (!visible) return null;
  const decidir = (x) => { guardarConsentimiento(x); setVisible(false); setConfig(false); };

  return (
    <div role="dialog" aria-live="polite" aria-label="Aviso de cookies" style={{
      position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 2000, margin: '0 auto', maxWidth: 720,
      background: 'var(--bg-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 18,
      boxShadow: '0 12px 40px rgba(0,0,0,.25)', padding: '18px 20px', display: 'grid', gap: 12,
    }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>Cookies</div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
        Usamos solo una cookie propia, la necesaria para iniciar sesión. Algunos contenidos, como el vídeo de
        presentación, son de otros servicios (YouTube) que ponen sus propias cookies: no se cargan hasta que los aceptes.
        No usamos cookies de análisis ni de publicidad: las visitas se cuentan de forma anónima y sin cookies. <a href="/legal/cookies">Política de cookies</a>.
      </p>
      {config && (
        <div style={{ display: 'grid', gap: 8, padding: 12, background: 'var(--bg-3)', borderRadius: 12 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
            <input type="checkbox" checked disabled style={{ marginTop: 3 }} />
            <span><b>Necesarias</b> — la de la sesión. Sin ella no se puede entrar a la cuenta. Siempre activas.</span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={externos} onChange={e => setExternos(e.target.checked)} style={{ marginTop: 3 }} />
            <span><b>Contenidos externos</b> — el vídeo de YouTube y el formulario de «Trabaja con nosotros» (HubSpot).</span>
          </label>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {config
          ? <button type="button" className="btn btn-sm btn-gradient" onClick={() => decidir(externos)}>Guardar mi elección</button>
          : <button type="button" className="btn btn-sm btn-outline" onClick={() => setConfig(true)}>Configurar</button>}
        {/* Rechazar es tan fácil como aceptar: los dos botones iguales. */}
        <button type="button" className="btn btn-sm btn-outline" onClick={() => decidir(false)}>Solo las necesarias</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => decidir(true)}>Aceptar todas</button>
      </div>
    </div>
  );
}
