import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Los errores del navegador, al servidor (errores.js los convierte en tickets).
//  · Si se rompe la pantalla, en vez de quedarse en blanco sale «Algo ha
//    fallado» con un botón para recargar, y se avisa.
//  · Los demás errores del código de la web también se avisan (el servidor
//    solo abre ticket si se repiten).
//  · Tras un deploy, una pestaña abierta de antes pide trozos de la web que ya
//    no existen: se recarga sola una vez, sin avisar (no es un fallo).
// ─────────────────────────────────────────────────────────────────────────────

const RUIDO = /^Script error\.?$|ResizeObserver loop|Failed to fetch|Load failed|NetworkError|AbortError|The operation was aborted/i;
const TROZO_VIEJO = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading chunk/i;
const avisados = new Set();

// Una sola recarga por minuto, para no quedarse recargando en bucle.
function recargarPorDeploy() {
  try {
    const antes = Number(sessionStorage.getItem('aim-recarga-deploy') || 0);
    if (Date.now() - antes < 60_000) return false;
    sessionStorage.setItem('aim-recarga-deploy', String(Date.now()));
  } catch { return false; }
  window.location.reload();
  return true;
}

export function avisarError(tipo, error, componentes = '') {
  const mensaje = String(error?.message || error || '').trim().slice(0, 500);
  if (!mensaje || RUIDO.test(mensaje) || TROZO_VIEJO.test(mensaje)) return;
  if (avisados.has(mensaje) || avisados.size >= 5) return;
  avisados.add(mensaje);
  try {
    fetch('/api/errores-navegador', {
      method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo, mensaje, pila: String(error?.stack || '').slice(0, 2000), componentes: String(componentes || '').slice(0, 1500),
        ruta: window.location.pathname, navegador: navigator.userAgent,
      }),
    }).catch(() => {});
  } catch { /* nada */ }
}

export function vigilarErrores() {
  window.addEventListener('error', (e) => {
    // Solo los del código de la web (no los de extensiones ni de otras páginas).
    if (e.filename && !e.filename.startsWith(window.location.origin)) return;
    avisarError('error', e.error || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (!(r instanceof Error)) return;
    avisarError('error', r);
  });
  window.addEventListener('vite:preloadError', (e) => { if (recargarPorDeploy()) e.preventDefault(); });
}

export class ProteccionErrores extends React.Component {
  constructor(props) { super(props); this.state = { roto: false }; }
  static getDerivedStateFromError() { return { roto: true }; }
  componentDidCatch(error, info) {
    if (TROZO_VIEJO.test(String(error?.message || '')) && recargarPorDeploy()) return;
    avisarError('pantalla', error, info?.componentStack);
  }
  render() {
    if (!this.state.roto) return this.props.children;
    return (
      <div role="alert" data-pantalla-rota style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, background: 'var(--bg, #fff)', color: 'var(--ink, #1a1a1a)', fontFamily: 'inherit' }}>
        <div style={{ maxWidth: 420, textAlign: 'center', display: 'grid', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontFamily: 'var(--font-display, inherit)' }}>Algo ha fallado al enseñar esta página</h1>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--ink-2, #555)', lineHeight: 1.5 }}>
            Ya nos ha llegado el aviso y lo vamos a revisar. Mientras tanto, prueba a recargar la página.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Recargar</button>
            <button type="button" className="btn btn-outline" onClick={() => { window.location.href = '/'; }}>Ir al inicio</button>
          </div>
        </div>
      </div>
    );
  }
}
