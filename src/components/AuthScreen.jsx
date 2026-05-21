import React, { useState } from 'react';
import { ACTIVITIES } from './Shared';

function EyeIcon({ off }) {
  return off
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
}

function ArrowRight() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>;
}

export default function AuthScreen({ onLogin }) {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [step, setStep] = useState(1); // for register: 1, 2, 3
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [reg, setReg] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    password: '', password2: '',
    activities: [],
  });

  const regUpdate = (k, v) => setReg(r => ({ ...r, [k]: v }));
  const toggleAct = (id) => regUpdate('activities', reg.activities.includes(id) ? reg.activities.filter(a => a !== id) : [...reg.activities, id]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Credenciales incorrectas'); return; }
      onLogin(data.user || data);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (step < 3) { setStep(s => s + 1); return; }
    if (reg.password !== reg.password2) { setError('Las contraseñas no coinciden'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: reg.firstName,
          lastName: reg.lastName,
          email: reg.email,
          phone: reg.phone,
          password: reg.password,
          activities: reg.activities,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al registrarse'); return; }
      onLogin(data.user || data);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const decorActivities = ACTIVITIES.slice(0, 6);

  return (
    <div className="auth-page">
      {/* Left panel */}
      <div className="auth-left">
        <div className="auth-left-inner">
          <a href="/" onClick={(e) => { e.preventDefault(); window.history.pushState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); }}>
            <img src="/src/brand/Aim_White.png" alt="Aim Education" className="auth-logo" />
          </a>
          <div className="auth-left-tagline">
            <h2>Una academia,<br /><span>mil maneras</span> de aprender.</h2>
            <p>Taekwondo · Ballet · Inglés · Robótica · y más</p>
          </div>
          <div className="auth-left-tiles">
            {decorActivities.map(act => (
              <div key={act.id} className="auth-tile" style={{ background: `color-mix(in oklab, ${act.color} 25%, rgba(255,255,255,.05))`, borderColor: `color-mix(in oklab, ${act.color} 40%, transparent)` }}>
                <img src={act.icon} alt={act.name} style={{ width: 32, height: 32, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: .85 }} />
                <span>{act.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="auth-right">
        <div className="auth-form-wrap">
          {/* Tabs */}
          <div className="auth-tabs">
            <button className={`auth-tab${tab === 'login' ? ' active' : ''}`} onClick={() => { setTab('login'); setStep(1); setError(''); }}>
              Iniciar sesión
            </button>
            <button className={`auth-tab${tab === 'register' ? ' active' : ''}`} onClick={() => { setTab('register'); setStep(1); setError(''); }}>
              Registrarse
            </button>
          </div>

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="auth-form">
              <h1>Bienvenido de nuevo</h1>
              <p className="auth-sub">Accede a tu cuenta para ver tus clases y pagos.</p>

              <div className="auth-field">
                <label>Email</label>
                <input type="email" placeholder="tu@email.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required autoComplete="email" />
              </div>

              <div className="auth-field">
                <label>Contraseña</label>
                <div className="auth-pass-wrap">
                  <input type={showPass ? 'text' : 'password'} placeholder="Tu contraseña" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required autoComplete="current-password" />
                  <button type="button" className="auth-eye" onClick={() => setShowPass(s => !s)}>
                    <EyeIcon off={showPass} />
                  </button>
                </div>
              </div>

              {error && <div className="auth-error">{error}</div>}

              <button type="submit" className="btn btn-gradient btn-lg auth-submit" disabled={loading}>
                {loading ? 'Cargando...' : <><span>Entrar</span><ArrowRight /></>}
              </button>

              <p className="auth-switch">
                ¿No tienes cuenta?{' '}
                <button type="button" onClick={() => { setTab('register'); setError(''); }}>
                  Regístrate gratis
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="auth-form">
              <h1>{step === 1 ? 'Crea tu cuenta' : step === 2 ? 'Elige contraseña' : 'Tus actividades'}</h1>
              <p className="auth-sub">
                {step === 1 && 'Tu primera clase es de prueba y sin compromiso.'}
                {step === 2 && 'Usa al menos 8 caracteres con números y letras.'}
                {step === 3 && 'Selecciona las actividades que te interesan (opcional).'}
              </p>

              {/* Step indicators */}
              <div className="auth-steps">
                {[1, 2, 3].map(s => (
                  <React.Fragment key={s}>
                    <div className={`auth-step${step >= s ? ' done' : ''}${step === s ? ' current' : ''}`}>{s}</div>
                    {s < 3 && <div className={`auth-step-line${step > s ? ' done' : ''}`} />}
                  </React.Fragment>
                ))}
              </div>

              {step === 1 && (
                <>
                  <div className="auth-row">
                    <div className="auth-field">
                      <label>Nombre</label>
                      <input type="text" placeholder="María" value={reg.firstName} onChange={e => regUpdate('firstName', e.target.value)} required />
                    </div>
                    <div className="auth-field">
                      <label>Apellido</label>
                      <input type="text" placeholder="García" value={reg.lastName} onChange={e => regUpdate('lastName', e.target.value)} required />
                    </div>
                  </div>
                  <div className="auth-field">
                    <label>Email</label>
                    <input type="email" placeholder="tu@email.com" value={reg.email} onChange={e => regUpdate('email', e.target.value)} required />
                  </div>
                  <div className="auth-field">
                    <label>Teléfono <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>(opcional)</span></label>
                    <input type="tel" placeholder="+34 600 000 000" value={reg.phone} onChange={e => regUpdate('phone', e.target.value)} />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="auth-field">
                    <label>Contraseña</label>
                    <div className="auth-pass-wrap">
                      <input type={showPass ? 'text' : 'password'} placeholder="Mínimo 8 caracteres" value={reg.password} onChange={e => regUpdate('password', e.target.value)} required minLength={8} />
                      <button type="button" className="auth-eye" onClick={() => setShowPass(s => !s)}>
                        <EyeIcon off={showPass} />
                      </button>
                    </div>
                  </div>
                  <div className="auth-field">
                    <label>Repite la contraseña</label>
                    <input type={showPass ? 'text' : 'password'} placeholder="Repite la contraseña" value={reg.password2} onChange={e => regUpdate('password2', e.target.value)} required />
                  </div>
                </>
              )}

              {step === 3 && (
                <div className="auth-activities-grid">
                  {ACTIVITIES.map(act => (
                    <button
                      key={act.id}
                      type="button"
                      className={`auth-act-chip${reg.activities.includes(act.id) ? ' selected' : ''}`}
                      style={{ '--act-color': act.color }}
                      onClick={() => toggleAct(act.id)}
                    >
                      <img src={act.icon} alt={act.name} style={{ width: 24, height: 24, objectFit: 'contain' }} />
                      <span>{act.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {error && <div className="auth-error">{error}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                {step > 1 && (
                  <button type="button" className="btn btn-outline btn-lg" style={{ flex: '0 0 auto' }} onClick={() => setStep(s => s - 1)}>
                    Atrás
                  </button>
                )}
                <button type="submit" className="btn btn-gradient btn-lg auth-submit" disabled={loading} style={{ flex: 1 }}>
                  {loading ? 'Cargando...' : step < 3 ? <><span>Siguiente</span><ArrowRight /></> : <><span>Crear cuenta</span><ArrowRight /></>}
                </button>
              </div>

              <p className="auth-switch">
                ¿Ya tienes cuenta?{' '}
                <button type="button" onClick={() => { setTab('login'); setError(''); }}>
                  Inicia sesión
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
