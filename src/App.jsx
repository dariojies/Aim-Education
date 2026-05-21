import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { AimHeader, AimFooter } from './components/Shared';
import PublicLanding from './components/PublicLanding';
import PublicActivities from './components/PublicActivities';
import PublicActivity from './components/PublicActivity';
import PublicCamp from './components/PublicCamp';
import AuthScreen from './components/AuthScreen';
import StudentDashboard from './components/StudentDashboard';

export const RouterContext = createContext({ path: '/', go: () => {}, user: null });
export const useRouter = () => useContext(RouterContext);

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [user, setUser] = useState(null);
  const [userChecked, setUserChecked] = useState(false);

  useEffect(() => {
    const onPop = () => {
      setPath(window.location.pathname);
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
      window.location.href = '/admin';
    } else {
      go('/dashboard');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    go('/');
  };

  const isDashboard = path.startsWith('/dashboard');
  const isAuth = path === '/auth';
  const isFullPage = isDashboard || isAuth;

  let screen;
  const seg = path.split('/').filter(Boolean);

  if (path === '/' || path === '') {
    screen = <PublicLanding />;
  } else if (path === '/actividades') {
    screen = <PublicActivities />;
  } else if (seg[0] === 'actividades' && seg[1]) {
    screen = <PublicActivity id={seg[1]} />;
  } else if (path === '/campamento') {
    screen = <PublicCamp />;
  } else if (isAuth) {
    screen = <AuthScreen onLogin={handleLoginSuccess} />;
  } else if (isDashboard) {
    if (!userChecked) return null;
    if (!user) { go('/auth'); return null; }
    screen = <StudentDashboard user={user} onLogout={handleLogout} />;
  } else {
    screen = <PublicLanding />;
  }

  return (
    <RouterContext.Provider value={{ path, go, user }}>
      {isFullPage ? screen : (
        <>
          <AimHeader />
          <main style={{ minHeight: '60vh' }}>{screen}</main>
          <AimFooter />
        </>
      )}
    </RouterContext.Provider>
  );
}
