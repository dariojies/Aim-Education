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

// Un plugin nativo de la app, o null fuera de ella (o si esa versión no lo tiene).
// La web no lleva @capacitor/core: el puente nativo de la app ya pone cada plugin
// en window.Capacitor.Plugins, con sus métodos (que devuelven promesas) y addListener.
export function plugin(nombre) {
  if (!esApp) return null;
  return window.Capacitor?.Plugins?.[nombre] || null;
}
// addListener devuelve { remove } (o una promesa de él, según la versión).
export const quitarOyente = (h) => Promise.resolve(h).then(x => x?.remove?.()).catch(() => {});

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
  if (m) {
    let n = m[1];
    try { n = decodeURIComponent(n); } catch { /* p. ej. «50%.pdf»: tal cual */ }
    return n.replace(/[\\/:*?"<>|]/g, '_');
  }
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
  // webcal: la suscripción al calendario de «Mi día» (#390), para el calendario del móvil.
  if (/^(tel|mailto|sms|whatsapp|intent|webcal):/.test(u.protocol)) {
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
  iniciarAvisosIphone();

  // Cuántos pasos de historial hay en esta página: lo de antes (la pasarela del
  // banco, otra carga) no es para volver con el botón atrás.
  let pasos = 0;
  const empujar = window.history.pushState.bind(window.history);
  window.history.pushState = (...a) => { pasos += 1; return empujar(...a); };
  window.addEventListener('popstate', () => { pasos = Math.max(0, pasos - 1); });

  const App = plugin('App');
  if (App) {
    App.addListener('backButton', () => {
      const cerrar = cerrables.pop();
      if (cerrar) { cerrar(); return; }
      const p = window.location.pathname;
      if (p === '/dashboard' || p === '/auth' || p === '/admin') App.minimizeApp();
      else if (pasos > 0) window.history.back();
      else window.location.replace(p.startsWith('/admin') ? '/admin' : '/dashboard');
    });
    App.addListener('resume', async () => {
      window.dispatchEvent(new CustomEvent('aim-app-vuelve'));
      const id = await marcaDeploy();
      if (id && deployVisto && id !== deployVisto) window.location.reload();
      else if (id) deployVisto = id;
    });
  }
}

// ── Avisos al móvil (#218, ver movil/AVISOS.md) ──
// Android: el plugin propio AimAvisos mantiene la conexión con el servidor.
// iPhone: el de Capacitor (PushNotifications) da el token de Apple.
const CLAVE_DISPOSITIVO = 'aim_push_dispositivo';
const VERSION_APP = (/AimEducationApp\/([\w.]+)/.exec(navigator.userAgent || '') || [])[1] || null;
export const leerDispositivo = () => { try { return localStorage.getItem(CLAVE_DISPOSITIVO) || null; } catch { return null; } };
const guardarDispositivo = (id) => { try { if (id) localStorage.setItem(CLAVE_DISPOSITIVO, id); else localStorage.removeItem(CLAVE_DISPOSITIVO); } catch { /* sin almacenamiento */ } };
const json = async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.error || 'No se ha podido.'), { status: r.status }); return d; };
const altaDispositivo = (cuerpo) => fetch('/api/me/push/dispositivo', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: VERSION_APP, ...cuerpo }) }).then(json);

// El token del iPhone llega por un evento: se espera a él (o al error).
function tokenIphone(Push) {
  return new Promise((resolve, reject) => {
    const hs = [];
    const fin = (f) => (v) => { hs.forEach(quitarOyente); f(v); };
    hs.push(Push.addListener('registration', fin(t => resolve(t.value))));
    hs.push(Push.addListener('registrationError', fin(e => reject(new Error(e?.error || 'Apple no ha dado el permiso.')))));
    Push.register().catch(fin(reject));
    setTimeout(fin(() => reject(new Error('Apple no contesta. Prueba más tarde.'))), 20000);
  });
}

// → { activo: true } o { activo: false, motivo: 'permiso' | 'arranque' | texto }
export async function activarAvisos() {
  const plat = plataformaApp();
  // Si este móvil ya tenía un alta (apagada desde la notificación, por ejemplo),
  // se quita antes, para no dejarla olvidada en el servidor.
  const anterior = leerDispositivo();
  if (anterior) {
    await fetch(`/api/me/push/dispositivo/${anterior}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
    guardarDispositivo(null);
  }
  if (plat === 'android') {
    const A = plugin('AimAvisos');
    if (!A) return { activo: false, motivo: 'Actualiza la app para recibir avisos.' };
    const est = await A.estado().catch(() => ({}));
    const d = await altaDispositivo({ plataforma: 'android', fabricante: est.fabricante || null });
    const r = await A.activar({ token: d.token, id: d.id });
    if (!r?.activo) {
      // Sin permiso no sirve de nada: fuera del servidor.
      await fetch(`/api/me/push/dispositivo/${d.id}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
      return { activo: false, motivo: r?.motivo || 'arranque' };
    }
    guardarDispositivo(d.id);
    return { activo: true };
  }
  if (plat === 'ios') {
    const Push = plugin('PushNotifications');
    if (!Push) return { activo: false, motivo: 'Actualiza la app para recibir avisos.' };
    const p = await Push.requestPermissions();
    if (p.receive !== 'granted') return { activo: false, motivo: 'permiso' };
    const token = await tokenIphone(Push);
    const d = await altaDispositivo({ plataforma: 'ios', apnsToken: token, fabricante: 'Apple' });
    guardarDispositivo(d.id);
    return { activo: true };
  }
  return { activo: false, motivo: 'Solo en la app del móvil.' };
}

// Al apagarlos o al cerrar sesión. Nunca hace esperar más de un par de segundos.
export async function desactivarAvisos() {
  const id = leerDispositivo();
  guardarDispositivo(null);
  const tareas = [];
  if (plataformaApp() === 'android') tareas.push(plugin('AimAvisos')?.desactivar().catch(() => {}));
  if (id) tareas.push(fetch(`/api/me/push/dispositivo/${id}`, { method: 'DELETE', credentials: 'include' }).catch(() => {}));
  await Promise.race([Promise.all(tareas), new Promise(r => setTimeout(r, 2000))]);
}

// Cómo están los avisos en este móvil y para esta cuenta.
export async function estadoAvisos() {
  const plat = plataformaApp();
  const id = leerDispositivo();
  let servidor = null;
  if (id) {
    const r = await fetch(`/api/me/push/dispositivo/${id}`, { credentials: 'include', cache: 'no-store' }).catch(() => null);
    if (r?.status === 404) guardarDispositivo(null);   // de otra cuenta o ya quitado
    else if (r?.ok) servidor = await r.json();
  }
  const out = { plataforma: plat, activo: !!servidor, preferencias: servidor?.preferencias || {}, dispositivo: servidor?.id || null };
  if (plat === 'android') {
    const e = await plugin('AimAvisos')?.estado().catch(() => null);
    if (e) Object.assign(out, { nativo: e, activo: !!servidor && !!e.activo && e.id === servidor.id });
  } else if (plat === 'ios') {
    const p = await plugin('PushNotifications')?.checkPermissions().catch(() => null);
    out.permiso = p?.receive || null;
    if (p && p.receive !== 'granted') out.activo = false;
  }
  return out;
}

// Al entrar en la app con una cuenta: si el móvil seguía recibiendo los avisos
// de otra (sesión caducada y entra otra persona), se apagan.
export async function revisarAvisosTrasEntrar() {
  if (plataformaApp() === 'ios') {
    const id = leerDispositivo();
    if (!id) return;
    const r = await fetch(`/api/me/push/dispositivo/${id}`, { credentials: 'include', cache: 'no-store' }).catch(() => null);
    if (r?.status === 404) {
      guardarDispositivo(null);
      await plugin('PushNotifications')?.unregister().catch(() => {});
    }
    return;
  }
  const A = plugin('AimAvisos');
  const e = await A?.estado().catch(() => null);
  if (!e?.activo || !e.id) return;
  const r = await fetch(`/api/me/push/dispositivo/${e.id}`, { credentials: 'include', cache: 'no-store' }).catch(() => null);
  if (r?.status === 404) { await A.desactivar().catch(() => {}); guardarDispositivo(null); }
  else if (r?.ok) guardarDispositivo(e.id);
}

export async function guardarPreferenciasAvisos(prefs) {
  const id = leerDispositivo();
  if (!id) throw new Error('Activa antes los avisos.');
  return json(await fetch(`/api/me/push/dispositivo/${id}/preferencias`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prefs) }));
}

// iPhone: al tocar un aviso, a su sitio; y el token de Apple puede cambiar, así
// que al abrir la app se vuelve a dar si ya estaban activados.
export function iniciarAvisosIphone() {
  if (plataformaApp() !== 'ios') return;
  const Push = plugin('PushNotifications');
  if (!Push) return;
  Push.addListener('pushNotificationActionPerformed', (a) => {
    const url = a?.notification?.data?.url;
    if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
      window.history.pushState(null, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  });
  if (!leerDispositivo()) return;
  Push.checkPermissions().then(async (p) => {
    if (p.receive !== 'granted') return;
    const token = await tokenIphone(Push);
    const d = await altaDispositivo({ plataforma: 'ios', apnsToken: token, fabricante: 'Apple' });
    guardarDispositivo(d.id);
  }).catch(() => {});
}
