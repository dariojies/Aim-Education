import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import PublicLanding from './components/PublicLanding';
import { PublicActivities, PublicNews, PublicNewsDetail } from './components/PublicActivities';
import PublicActivity from './components/PublicActivity';
import PublicCamp from './components/PublicCamp';
import AuthScreen from './components/AuthScreen';
import StudentDashboard from './components/StudentDashboard';
import AdminApp from './components/AdminApp';
import PublicCalendar from './components/PublicCalendar';

export const RouterContext = createContext({ path: '/', go: () => {}, user: null });
export const useRouter = () => useContext(RouterContext);

export default function App() {
  const [path, setPath] = useState(window.location.pathname + window.location.search);
  const [user, setUser] = useState(null);
  const [userChecked, setUserChecked] = useState(false);

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

  const go = useCallback((to) => {
    window.history.pushState(null, '', to);
    setPath(to);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const handleLoginSuccess = (u) => {
    setUser(u);
    if (u?.canAccessAdmin) {
      go('/admin');
    } else {
      go('/dashboard');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    go('/');
  };

  const pathname = path.split('?')[0];
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
  } else if (pathname === '/noticias') {
    screen = <PublicNews />;
  } else if (seg[0] === 'noticias' && seg[1]) {
    screen = <PublicNewsDetail slug={seg[1]} />;
  } else if (pathname === '/auth') {
    const mode = params.get('mode') || 'login';
    screen = <AuthScreen mode={mode} onLoginSuccess={handleLoginSuccess} />;
  } else if (pathname.startsWith('/dashboard')) {
    if (!userChecked) return null;
    if (!user) { go('/auth'); return null; }
    screen = <StudentDashboard user={user} onLogout={handleLogout} />;
  } else if (pathname.startsWith('/admin')) {
    if (!userChecked) return null;
    if (!user || !user.canAccessAdmin) { go('/auth'); return null; }
    screen = <AdminApp user={user} onLogout={handleLogout} />;
  } else {
    screen = <PublicLanding />;
  }

  return (
    <RouterContext.Provider value={{ path, go, user }}>
      {screen}
    </RouterContext.Provider>
  );
}
