// ─────────────────────────────────────────────────────────────────────────────
// La web dentro de la app de AIM Education (#218).
//
// La app de Android e iOS (carpeta movil/, Capacitor) no lleva una copia de la
// web: abre www.aimeducation.es en su propio navegador interno y añade
// «AimEducationApp/x» a la identificación del navegador. Con eso, aquí se sabe
// que se está dentro de la app y se ajusta lo que no tiene sentido en un móvil:
//  · solo el área de familias (sin la web pública, ni cookies, ni Metricool);
//  · el botón «atrás» de Android cierra lo abierto o vuelve a la pantalla anterior;
//  · los enlaces a otras webs se abren en el navegador del móvil;
//  · las facturas, fotos y adjuntos se descargan y se comparten con el móvil
//    (el navegador interno no sabe abrir un PDF ni guardar un archivo);
//  · al volver a la app tras un deploy, se recarga para tener la web nueva.
// Las funciones del móvil (compartir, navegador, avisos…) son los plugins de
// Capacitor, que la app pone a disposición de la página en window.Capacitor.
// ─────────────────────────────────────────────────────────────────────────────

export const esApp = typeof navigator !== 'undefined'
  && (/AimEducationApp\//.test(navigator.userAgent) || !!window.Capacitor?.isNativePlatform?.());

export const plataformaApp = () => (esApp ? (window.Capacitor?.getPlatform?.() || (/iPhone|iPad/.test(navigator.userAgent) ? 'ios' : 'android')) : null);

const plugins = {};
// Un plugin nativo de la app, o null fuera de ella (o si esa versión no lo tiene).
export function plugin(nombre) {
  const cap = window.Capacitor;
  if (!esApp || !cap?.registerPlugin) return null;
  if (cap.isPluginAvailable && !cap.isPluginAvailable(nombre) && !cap.PluginHeaders?.some(h => h.name === nombre)) return null;
  return (plugins[nombre] ||= cap.registerPlugin(nombre));
}

// ── Atrás (Android) ──
// Lo abierto encima (una ficha, una foto, un menú) se registra aquí mientras
// está abierto, y el botón atrás lo cierra antes de cambiar de pantalla.
const cerrables = [];
export function alAtras(cerrar) {
  cerrables.push(cerrar);
  return () => { const i = cerrables.lastIndexOf(cerrar); if (i >= 0) cerrables.splice(i, 1); };
}

// ── Descargar y compartir ──
const aBase64 = (blob) => new Promise((ok, ko) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] || '');
  r.onerror = () => ko(r.error);
  r.readAsDataURL(blob);
});
function nombreDe(res, url) {
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  if (m) return decodeURIComponent(m[1]).replace(/[\\/:*?"<>|]/g, '_');
  const tipo = res.headers.get('Content-Type') || '';
  const ext = tipo.includes('pdf') ? 'pdf' : tipo.includes('png') ? 'png' : tipo.includes('jpeg') || tipo.includes('jpg') ? 'jpg' : 'bin';
  return `aim-${url.split('/').filter(Boolean).slice(-2).join('-').replace(/[^\w-]/g, '')}.${ext}`;
}
// Baja el archivo (con la sesión de la app) y abre «compartir» del móvil, desde
// donde se ve, se guarda en Archivos/Drive o se manda por WhatsApp.
export async function compartirArchivo(url, titulo = 'AIM Education') {
  const Filesystem = plugin('Filesystem'), Share = plugin('Share');
  if (!Filesystem || !Share) { window.location.href = url; return; }
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'No tienes acceso a este archivo.' : 'No se ha podido descargar.');
  const nombre = nombreDe(res, url);
  const data = await aBase64(await res.blob());
  const f = await Filesystem.writeFile({ path: nombre, data, directory: 'CACHE' });
  await Share.share({ title: titulo, files: [f.uri], dialogTitle: titulo }).catch(e => {
    if (!/cancel/i.test(String(e?.message || e))) throw e;
  });
}

export async function abrirFuera(url) {
  const Browser = plugin('Browser');
  if (Browser) await Browser.open({ url, presentationStyle: 'popover' });
  else window.open(url, '_blank', 'noopener');
}

let aviso = null;
function avisar(texto) {
  aviso?.remove();
  aviso = document.createElement('div');
  aviso.className = 'app-aviso';
  aviso.textContent = texto;
  document.body.appendChild(aviso);
  setTimeout(() => aviso?.remove(), 3500);
}

// Lo que se abre al tocar un enlace dentro de la app.
function alTocar(e) {
  if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey) return;
  const a = e.target.closest?.('a[href]');
  if (!a || a.hasAttribute('data-app-normal')) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
  let u;
  try { u = new URL(href, window.location.href); } catch { return; }
  if (/^(tel|mailto|sms|whatsapp|intent):/.test(u.protocol)) {
    e.preventDefault(); window.location.href = u.href; return;
  }
  const propia = u.origin === window.location.origin;
  const archivo = propia && u.pathname.startsWith('/api/') && (a.target === '_blank' || a.hasAttribute('download') || u.searchParams.get('descargar') === '1');
  if (archivo) {
    e.preventDefault();
    compartirArchivo(u.href, a.textContent.trim() || 'AIM Education').catch(err => avisar(err.message || 'No se ha podido descargar.'));
    return;
  }
  // Otras webs, o páginas públicas en otra pestaña (textos legales…): fuera.
  if (!propia || a.target === '_blank') {
    e.preventDefault();
    abrirFuera(u.href).catch(() => {});
  }
}

// La web cambia con cada deploy: al volver a la app se mira si hay una nueva.
let deployVisto = null;
async function marcaDeploy() {
  try { return (await (await fetch('/deploy.json', { cache: 'no-store' })).json()).id || null; } catch { return null; }
}

export function iniciarApp() {
  if (!esApp) return;
  document.documentElement.classList.add('es-app', `es-app-${plataformaApp()}`);
  // Que la web ocupe toda la pantalla (bajo la barra de estado) y se respeten
  // los huecos de la cámara y la barra de gestos.
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp && !/viewport-fit/.test(vp.content)) vp.content += ', viewport-fit=cover';

  document.addEventListener('click', alTocar, true);
  marcaDeploy().then(id => { deployVisto = id; });

  const App = plugin('App');
  if (App) {
    App.addListener('backButton', ({ canGoBack }) => {
      const cerrar = cerrables.pop();
      if (cerrar) { cerrar(); return; }
      const p = window.location.pathname;
      if (p === '/dashboard' || p === '/auth' || p === '/admin') App.minimizeApp();
      else if (canGoBack) window.history.back();
      else window.location.replace('/dashboard');
    });
    App.addListener('resume', async () => {
      window.dispatchEvent(new CustomEvent('aim-app-vuelve'));
      const id = await marcaDeploy();
      if (id && deployVisto && id !== deployVisto) window.location.reload();
      else if (id) deployVisto = id;
    });
  }
}
