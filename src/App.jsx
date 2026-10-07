import React, { useState, useEffect, useCallback, createContext, useContext, lazy, Suspense } from 'react';
import PublicLanding from './components/PublicLanding';
import { PublicActivities, PublicNews, PublicNewsDetail } from './components/PublicActivities';
import PublicActivity from './components/PublicActivity';
import PublicCamp from './components/PublicCamp';
import AuthScreen from './components/AuthScreen';
// El panel de administración y el área de familias son lo más pesado de la web
// y la mayoría de visitas no los abre: se descargan aparte, al entrar en ellos
// (ticket #298). La web pública carga así bastante menos.
const StudentDashboard = lazy(() => import('./components/StudentDashboard'));
const AdminApp = lazy(() => import('./components/AdminApp'));
import PublicCalendar from './components/PublicCalendar';
import PublicLegal from './components/PublicLegal';
import PublicContacto from './components/PublicContacto';
import BrickslabPublico from './components/Brickslab.jsx';
import PublicConocenos from './components/PublicConocenos';
import { CookieBanner, registrarVisita } from './components/Cookies';
import AvisosWeb from './components/AvisosWeb';

export const RouterContext = createContext({ path: '/', go: () => {}, user: null });
export const useRouter = () => useContext(RouterContext);

export default function App() {
  const [path, setPath] = useState(window.location.pathname + window.location.search);
  const [user, setUser] = useState(null);
  const [userChecked, setUserChecked] = useState(false);
  // La sesión caducó estando dentro (#366): se avisa y se lleva a entrar.
  const [caducada, setCaducada] = useState(false);

  useEffect(() => {
    const onPop = () => {
      setPath(window.location.pathname + window.location.search);
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(u => { setUser(u); setUserChecked(true); })
      .catch(() => setUserChecked(true));
  }, []);

  // { replace: true } cambia la dirección sin dejar un paso más en el historial
  // (p. ej. quitar el número del ticket de /admin/soporte/180 una vez abierto).
  const go = useCallback((to, { replace = false } = {}) => {
    if (replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
    setPath(to);
    if (!replace) window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const handleLoginSuccess = (u) => {
    setUser(u);
    setUserChecked(true); // mark checked so dashboard/admin don't block on the /api/me race
    setCaducada(false);
    // Si venía de una sesión caducada, de vuelta a donde estaba.
    const volver = new URLSearchParams(window.location.search).get('volver') || '';
    const vale = volver.startsWith('/') && !volver.startsWith('//')
      && (volver.startsWith('/dashboard') || (u?.canAccessAdmin && volver.startsWith('/admin')));
    if (vale) go(volver);
    else if (u?.canAccessAdmin) go('/admin');
    else go('/dashboard');
  };

  useEffect(() => {
    const f = () => { if (user) setCaducada(true); };
    window.addEventListener('aim-sesion-caducada', f);
    return () => window.removeEventListener('aim-sesion-caducada', f);
  }, [user]);
  const volverAEntrar = () => {
    const aqui = window.location.pathname + window.location.search;
    setCaducada(false);
    setUser(null);
    go(`/auth?volver=${encodeURIComponent(aqui)}`);
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    go('/');
  };

  const pathname = path.split('?')[0];
  // Las páginas vistas, si se ha aceptado el análisis (#341). También la que
  // se está viendo justo al aceptarlo.
  useEffect(() => { registrarVisita(pathname); }, [pathname]);
  useEffect(() => {
    const f = (e) => { if (e.detail?.analitica) registrarVisita(window.location.pathname); };
    window.addEventListener('aim-cookies-cambio', f);
    return () => window.removeEventListener('aim-cookies-cambio', f);
  }, []);
  const webPublica = !pathname.startsWith('/admin') && !pathname.startsWith('/dashboard');
  const search = path.includes('?') ? path.slice(path.indexOf('?')) : '';
  const params = new URLSearchParams(search);
  const seg = pathname.split('/').filter(Boolean);

  let screen;

  if (pathname === '/' || pathname === '') {
    screen = <PublicLanding />;
  } else if (pathname === '/actividades') {
    screen = <PublicActivities />;
  } else if (seg[0] === 'actividades' && seg[1]) {
    screen = <PublicActivity id={seg[1]} />;
  } else if (pathname === '/campamento') {
    screen = <PublicCamp />;
  } else if (pathname === '/calendario') {
    screen = <PublicCalendar />;
  } else if (seg[0] === 'legal') {
    // Textos legales (ticket #295): /legal/aviso-legal, /legal/privacidad…
    screen = <PublicLegal id={seg[1] || 'aviso-legal'} />;
  } else if (pathname === '/contacto') {
    screen = <PublicContacto />;
  } else if (pathname === '/brickslab' || pathname === '/biblioteca') {
    // El catálogo de Brickslab y la Biblioteca (#291), sin entrar.
    screen = <BrickslabPublico />;
  } else if (pathname === '/conocenos') {
    screen = <PublicConocenos />;
  } else if (pathname === '/noticias') {
    screen = <PublicNews />;
  } else if (seg[0] === 'noticias' && seg[1]) {
    screen = <PublicNewsDetail slug={seg[1]} />;
  } else if (pathname === '/auth') {
    const mode = params.get('mode') || 'login';
    screen = <AuthScreen key={mode} mode={mode} onLoginSuccess={handleLoginSuccess} />;
  } else if (pathname.startsWith('/dashboard')) {
    if (!userChecked) return null;
    if (!user) { go('/auth'); return null; }
    const dashSub = { campamento: 'camp', pagos: 'payments', clases: 'classes', asistencia: 'attendance', soporte: 'support', fotos: 'fotos', brickslab: 'brickslab', biblioteca: 'brickslab' }[seg[1]] || 'overview';
    screen = <StudentDashboard user={user} onLogout={handleLogout} subroute={dashSub} />;
  } else if (pathname.startsWith('/admin')) {
    if (!userChecked) return null;
    if (!user || !user.canAccessAdmin) { go('/auth'); return null; }
    // 'recibos' se mantiene como alias antiguo: esa sección ahora son los gastos del club.
    const adminSub = { campamento: 'camp', alumnos: 'students', familias: 'familias', clases: 'classes', 'pasar-lista': 'pasarlista', eventos: 'events', noticias: 'news', gastos: 'payments', recibos: 'payments', facturacion: 'billing', soporte: 'support', reportes: 'reportes', fichaje: 'fichaje', speaking: 'speaking', faltas: 'faltas', comunicaciones: 'comunicaciones', crm: 'comunicaciones', almacen: 'almacen', consultas: 'contactos', candidatos: 'candidatos', incidencias: 'incidencias', brickslab: 'brickslab', galeria: 'galeria', fotos: 'galeria', rangos: 'rangos', correo: 'bandeja', avisos: 'ctas', redes: 'redes' }[seg[1]] || 'overview';
    // /admin/soporte/180 abre ese ticket directamente, para poder pasar el enlace.
    const ticketId = seg[1] === 'soporte' && /^\d+$/.test(seg[2] || '') ? Number(seg[2]) : null;
    // La ruta entera va al panel (#360) para abrir lo concreto: una clase en
    // «Pasar lista» (/admin/clases/lista/<grupo>), un filtro de Soporte
    // (?filtro=mios), una pestaña (?pestana=pendientes)…
    screen = <AdminApp user={user} onLogout={handleLogout} subroute={adminSub} ticketId={ticketId} enlace={{ ruta: path, seg, params: Object.fromEntries(params) }} />;
  } else {
    screen = <PublicLanding />;
  }

  return (
    <RouterContext.Provider value={{ path, go, user }}>
      <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</div>}>
        {/* Los avisos de la web (#341): en las páginas públicas, no en el panel ni en el área de familias. */}
        {webPublica && <AvisosWeb ruta={pathname} go={go} arriba />}
        {screen}
        {webPublica && <AvisosWeb ruta={pathname} go={go} />}
      </Suspense>
      {/* El aviso de cookies, en toda la web salvo el panel de administración
          (allí solo está la cookie de la sesión, que no pide consentimiento). */}
      {!pathname.startsWith('/admin') && <CookieBanner />}
      {caducada && (
        <div role="dialog" aria-modal="true" aria-labelledby="sesion-caducada"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 5000, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div className="panel" style={{ maxWidth: 400, width: '100%', margin: 0, textAlign: 'center' }}>
            <h2 id="sesion-caducada" style={{ margin: '0 0 6px', justifyContent: 'center' }}>Tu sesión ha caducado</h2>
            <p className="sub" style={{ margin: '0 0 18px' }}>Por seguridad hay que volver a entrar. Te traeremos de vuelta a esta misma página.</p>
            <button type="button" className="btn btn-primary" autoFocus onClick={volverAEntrar}>Volver a entrar</button>
          </div>
        </div>
      )}
    </RouterContext.Provider>
  );
}
