import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimLogo } from './Shared.jsx';
import { useRouter } from '../App.jsx';
import { useClasesPublicas, fichasWeb } from './clasesPublicas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Entrar, crear cuenta, olvidé mi contraseña y poner una nueva. Todo lo que se
// ve aquí funciona: antes varios botones eran de adorno (Facebook, «Mantenerme
// conectado», «¿Olvidaste tu contraseña?», los hijos del registro…).
// ─────────────────────────────────────────────────────────────────────────────

const params = () => new URLSearchParams(window.location.search);

// Lo que puede salir mal al volver de Google.
const ERRORES_GOOGLE = {
  'google-dominio': 'Con Google solo puede entrar el personal del club, con su cuenta de @aimeducation.es o @allegro.in-mae.es.',
  'google-sin-cuenta': 'No hay ninguna cuenta con ese correo de Google. Pide en secretaría que te den de alta o entra con tu correo y contraseña.',
  'google-cancelado': 'Has cancelado el inicio de sesión con Google.',
  'google-caducado': 'El inicio de sesión con Google ha caducado. Vuelve a intentarlo.',
  'google-fallo': 'No se ha podido entrar con Google. Vuelve a intentarlo o entra con tu correo y contraseña.',
  'google-apagado': 'El inicio de sesión con Google no está disponible ahora mismo.',
};

function Aviso({ tipo = 'error', children }) {
  const color = tipo === 'ok' ? 'var(--teal)' : 'var(--orange)';
  return (
    <div role={tipo === 'ok' ? 'status' : 'alert'} style={{
      background: `color-mix(in oklab, ${color} 12%, var(--bg-2))`, border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`,
      borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color, fontWeight: 600, lineHeight: 1.5,
    }}>{children}</div>
  );
}

function CampoPassword({ id, value, onChange, placeholder, autoComplete, minLength }) {
  const [ver, setVer] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input id={id} name={id} type={ver ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={onChange}
        required minLength={minLength} autoComplete={autoComplete} style={{ width: '100%', paddingRight: 44 }} />
      <button type="button" onClick={() => setVer(v => !v)} tabIndex={-1}
        style={{ position: 'absolute', right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4, display: 'flex', alignItems: 'center', lineHeight: 1 }}
        aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
        {ver ? <I.EyeOff /> : <I.Eye />}
      </button>
    </div>
  );
}

// ── Entrar ──────────────────────────────────────────────────────────────────
function LoginForm({ onLoginSuccess, onOlvido, onRegistro, recordar, setRecordar, errorInicial }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(errorInicial || '');

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ email, password: pw, recordar }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setError(data.error || 'Error al iniciar sesión.'); setLoading(false); return; }
      onLoginSuccess(data.user);
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>¡Hola de nuevo!</h1>
      <p className="hint">Bienvenido/a a Aim Education. Entra a tu panel.</p>
      {error && <Aviso>{error}</Aviso>}
      <div className="field">
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" name="email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      </div>
      <div className="field">
        <label htmlFor="pw">Contraseña</label>
        <CampoPassword id="pw" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
      </div>
      <div className="field-meta">
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', color: 'var(--ink-2)' }}
          title="Si lo marcas, la sesión dura 30 días en este dispositivo. Si no, se cierra al cerrar el navegador.">
          <input type="checkbox" checked={recordar} onChange={e => setRecordar(e.target.checked)} style={{ accentColor: 'var(--purple)' }} /> Mantenerme conectado
        </label>
        <a href="/auth?mode=olvido" onClick={(e) => { e.preventDefault(); onOlvido(email); }}>¿Olvidaste tu contraseña?</a>
      </div>
      <button type="submit" className="btn btn-gradient btn-block btn-lg" disabled={loading}>
        {loading ? <span className="dot-loader" /> : <>Entrar a mi cuenta <I.Arrow /></>}
      </button>
      <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--ink-2)' }}>
        ¿Aún no tienes cuenta? <a href="/auth?mode=register" onClick={(e) => { e.preventDefault(); onRegistro(); }} style={{ color: 'var(--purple)', fontWeight: 700 }}>Regístrate</a>
      </p>
    </form>
  );
}

// ── Olvidé mi contraseña: se pide el enlace ─────────────────────────────────
function OlvidoForm({ emailInicial, onVolver }) {
  const [email, setEmail] = useState(emailInicial || '');
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      const r = await fetch('/api/password/olvido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido enviar.');
      setHecho(d.mensaje);
    } catch (err) { setError(err.message); } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={submit}>
      <h1>¿Olvidaste tu contraseña?</h1>
      <p className="hint">Escribe el correo de tu cuenta y te mandamos un enlace para poner una nueva.</p>
      {error && <Aviso>{error}</Aviso>}
      {hecho ? (
        <>
          <Aviso tipo="ok">{hecho}</Aviso>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>El enlace caduca en 1 hora. Si no te llega en unos minutos, vuelve a pedirlo o escríbenos a info@aimeducation.es.</p>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="email-olvido">Correo electrónico</label>
            <input id="email-olvido" name="email" type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" autoFocus />
          </div>
          <button type="submit" className="btn btn-gradient btn-block btn-lg" disabled={enviando}>
            {enviando ? <span className="dot-loader" /> : <>Enviarme el enlace <I.Arrow /></>}
          </button>
        </>
      )}
      <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
        <a href="/auth" onClick={(e) => { e.preventDefault(); onVolver(); }} style={{ color: 'var(--purple)', fontWeight: 700 }}>← Volver a iniciar sesión</a>
      </p>
    </form>
  );
}

// ── Poner la contraseña nueva, desde el enlace del correo ───────────────────
function RestablecerForm({ token, onHecho, onPedirOtro }) {
  const [estado, setEstado] = useState(null); // null cargando · { valido, email }
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setEstado({ valido: false }); return; }
    fetch(`/api/password/restablecer/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(r => r.json()).then(setEstado).catch(() => setEstado({ valido: false }));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (pw !== pw2) { setError('Las dos contraseñas no coinciden.'); return; }
    setGuardando(true);
    try {
      const r = await fetch('/api/password/restablecer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: pw }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido cambiar.');
      onHecho();
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  }

  if (!estado) return <p className="hint">Comprobando el enlace…</p>;
  if (!estado.valido) {
    return (
      <div>
        <h1>Este enlace ya no sirve</h1>
        <p className="hint">Ha caducado (duran 1 hora) o ya se usó. Pide otro y te lo mandamos al momento.</p>
        <button type="button" className="btn btn-gradient btn-block btn-lg" onClick={onPedirOtro}>Pedir otro enlace <I.Arrow /></button>
      </div>
    );
  }
  return (
    <form onSubmit={submit}>
      <h1>Pon tu contraseña nueva</h1>
      <p className="hint">Para la cuenta {estado.email}. Es la misma cuenta de las apps de AIM: la nueva vale también en ellas.</p>
      {error && <Aviso>{error}</Aviso>}
      {/* Para que el gestor de contraseñas la guarde con la cuenta correcta. */}
      <input type="text" name="username" autoComplete="username" value={estado.email} readOnly hidden />
      <div className="field">
        <label htmlFor="pw-nueva">Contraseña nueva</label>
        <CampoPassword id="pw-nueva" value={pw} onChange={e => setPw(e.target.value)} placeholder="Mín. 8 caracteres" autoComplete="new-password" minLength={8} />
      </div>
      <div className="field">
        <label htmlFor="pw-nueva2">Repítela</label>
        <CampoPassword id="pw-nueva2" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="La misma otra vez" autoComplete="new-password" minLength={8} />
      </div>
      <button type="submit" className="btn btn-gradient btn-block btn-lg" disabled={guardando}>
        {guardando ? <span className="dot-loader" /> : <>Guardar la contraseña <I.Arrow /></>}
      </button>
    </form>
  );
}

// ── Crear cuenta ────────────────────────────────────────────────────────────
const HIJO_VACIO = { nombre: '', apellidos: '', nacimiento: '', actividad: '' };

function RegisterForm({ onLoginSuccess }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', dni: '', password: '' });
  // Lo que acepta al registrarse (ticket #255): se manda y queda anotado.
  const [acepta, setAcepta] = useState(false);
  const [comunicaciones, setComunicaciones] = useState(false);
  // Los hijos que quiere apuntar: le llegan a secretaría, que los da de alta.
  const [hijos, setHijos] = useState([]);
  const { actividades } = useClasesPublicas();
  const opcionesActividad = fichasWeb(actividades).filter(a => !a.enlace).map(a => a.name);

  const upd = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));
  const updHijo = (i, key) => (e) => setHijos(h => h.map((x, j) => (j === i ? { ...x, [key]: e.target.value } : x)));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (step < 3) { setStep(step + 1); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, dni: form.dni,
          password: form.password, aceptaCondiciones: acepta, comunicaciones,
          hijos: hijos.filter(h => h.nombre.trim()),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || 'Error al crear la cuenta.');
        // Si el fallo es de los datos del paso 1 (correo repetido, DNI…), se vuelve allí.
        if (/correo|email|DNI|contraseña|Nombre/i.test(data.error || '')) setStep(1);
        setLoading(false);
        return;
      }
      onLoginSuccess(data.user);
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>Crea tu cuenta</h1>
      <p className="hint">Un perfil familiar. Paso {step} de 3.</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
        {[1, 2, 3].map(n => (
          <div key={n} style={{ flex: 1, height: 4, borderRadius: 99, background: n <= step ? 'var(--grad-aim)' : 'var(--line)' }} />
        ))}
      </div>
      {error && <Aviso>{error}</Aviso>}

      {step === 1 && (
        <>
          <div className="field-row">
            <div className="field"><label htmlFor="r-nombre">Nombre</label><input id="r-nombre" name="given-name" autoComplete="given-name" placeholder="Ana" value={form.firstName} onChange={upd('firstName')} required /></div>
            <div className="field"><label htmlFor="r-apellidos">Apellidos</label><input id="r-apellidos" name="family-name" autoComplete="family-name" placeholder="García López" value={form.lastName} onChange={upd('lastName')} /></div>
          </div>
          <div className="field"><label htmlFor="r-email">Correo</label><input id="r-email" name="email" type="email" autoComplete="email" placeholder="ana@email.com" value={form.email} onChange={upd('email')} required /></div>
          <div className="field-row">
            <div className="field"><label htmlFor="r-tel">Teléfono</label><input id="r-tel" name="tel" type="tel" autoComplete="tel" placeholder="+34 600 000 000" value={form.phone} onChange={upd('phone')} /></div>
            {/* El DNI no lo rellena el navegador: antes le metía el correo. */}
            <div className="field"><label htmlFor="r-dni">DNI / NIE <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(para las facturas)</span></label>
              <input id="r-dni" name="dni" autoComplete="off" placeholder="00000000A" value={form.dni} onChange={upd('dni')} maxLength={12} style={{ textTransform: 'uppercase' }} /></div>
          </div>
          <div className="field">
            <label htmlFor="r-pw">Contraseña</label>
            <CampoPassword id="r-pw" value={form.password} onChange={upd('password')} placeholder="Mín. 8 caracteres" autoComplete="new-password" minLength={8} />
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ padding: 14, background: 'color-mix(in oklab, var(--purple) 8%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--purple) 30%, transparent)', borderRadius: 12, marginBottom: 16, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            ¿A quién quieres apuntar? Dinos quiénes van a venir a clase y secretaría los da de alta y los pone en su grupo; te llamaremos para confirmarlo. Si vienes tú, o prefieres hacerlo en persona, sigue sin añadir a nadie.
          </div>
          {hijos.map((h, i) => (
            <div key={i} style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Alumno/a #{i + 1}</span>
                <button type="button" onClick={() => setHijos(x => x.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 0, color: 'var(--orange)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Quitar</button>
              </div>
              <div className="field-row">
                <div className="field"><label>Nombre</label><input autoComplete="off" value={h.nombre} onChange={updHijo(i, 'nombre')} required /></div>
                <div className="field"><label>Apellidos</label><input autoComplete="off" value={h.apellidos} onChange={updHijo(i, 'apellidos')} /></div>
              </div>
              <div className="field-row">
                <div className="field"><label>Fecha de nacimiento</label><input type="date" autoComplete="off" value={h.nacimiento} onChange={updHijo(i, 'nacimiento')} max={new Date().toISOString().slice(0, 10)} /></div>
                <div className="field">
                  <label>Actividad</label>
                  <select value={h.actividad} onChange={updHijo(i, 'actividad')}>
                    <option value="">Aún no lo sabemos</option>
                    {opcionesActividad.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
          {hijos.length < 8 && (
            <button type="button" className="btn btn-outline btn-block" style={{ marginTop: 4 }} onClick={() => setHijos(x => [...x, { ...HIJO_VACIO }])}>
              <I.Plus /> {hijos.length ? 'Añadir otro' : 'Añadir un hijo o hija'}
            </button>
          )}
        </>
      )}

      {step === 3 && (
        <>
          {hijos.some(h => h.nombre.trim()) && (
            <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '0 0 12px', lineHeight: 1.55 }}>
              Al crear la cuenta, secretaría recibe los datos de {hijos.filter(h => h.nombre.trim()).map(h => h.nombre.trim()).join(', ')} para darles de alta.
            </p>
          )}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.5 }}>
            <input type="checkbox" required checked={acepta} onChange={e => setAcepta(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--purple)' }} />
            <span>
              He leído y acepto los <a href="/legal/terminos" target="_blank" rel="noopener">términos y condiciones</a>,
              el <a href="/legal/reglamento" target="_blank" rel="noopener">reglamento interno</a> y
              la <a href="/legal/privacidad" target="_blank" rel="noopener">política de privacidad</a>.
            </span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-2)', marginTop: 10, lineHeight: 1.5 }}>
            <input type="checkbox" checked={comunicaciones} onChange={e => setComunicaciones(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--purple)' }} />
            <span>Quiero recibir comunicaciones del club (noticias, eventos, descuentos). Es opcional y lo puedes retirar cuando quieras.</span>
          </label>
          {/* Información básica de protección de datos (art. 13 RGPD), junto al
              formulario; la completa, en la política de privacidad. */}
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-3)', fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>
            <b>Protección de datos.</b> Responsable: AIM Deporte y Educación S.L. Finalidad: gestionar tu cuenta,
            las inscripciones y los pagos y, si lo marcas, enviarte comunicaciones del club. Legitimación: el contrato
            y, para las comunicaciones, tu consentimiento. No se ceden datos salvo obligación legal. Puedes ejercer tus
            derechos de acceso, rectificación, supresión y demás en info@aimeducation.es.
            Más información en la <a href="/legal/privacidad" target="_blank" rel="noopener">política de privacidad</a>.
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
        {step > 1 && <button type="button" className="btn btn-outline" onClick={() => setStep(step - 1)}>Anterior</button>}
        <button type="submit" className="btn btn-gradient" style={{ flex: 1 }} disabled={loading}>
          {loading ? <span className="dot-loader" /> : <>{step < 3 ? 'Continuar' : 'Crear mi cuenta'} <I.Arrow /></>}
        </button>
      </div>
    </form>
  );
}

export default function AuthScreen({ mode = 'login', onLoginSuccess }) {
  const { go } = useRouter();
  const inicial = ['register', 'olvido', 'restablecer'].includes(mode) ? mode : 'login';
  const [vista, setVista] = useState(inicial);
  const [emailOlvido, setEmailOlvido] = useState('');
  const [recordar, setRecordar] = useState(true);
  const [google, setGoogle] = useState(false);
  const [avisoOk, setAvisoOk] = useState('');
  const errorGoogle = ERRORES_GOOGLE[params().get('error')] || '';
  const token = params().get('token') || '';

  useEffect(() => {
    fetch('/api/auth/config', { cache: 'no-store' }).then(r => r.json()).then(d => setGoogle(!!d.google)).catch(() => {});
  }, []);

  const irA = (v, url) => { setVista(v); setAvisoOk(''); window.history.replaceState(null, '', url); };
  const alLogin = () => irA('login', '/auth');

  return (
    <main style={{ paddingTop: 0 }}>
      <div className="auth-shell">
        <aside className="auth-side">
          <div>
            <AimLogo sub />
            <h2 style={{ marginTop: 48 }}>Innovación,<br />excelencia y<br />pasión.</h2>
            <p>
              Desde un perfil único accedes a tus clases, horarios, pagos, asistencia,
              torneos y novedades. Un solo lugar para tu familia entera.
            </p>
            <div className="auth-features">
              <div className="auth-feature"><span className="ico"><I.Calendar /></span><span>Tu horario completo siempre actualizado</span></div>
              <div className="auth-feature"><span className="ico"><I.CreditCard /></span><span>Pagos online y recibos descargables</span></div>
              <div className="auth-feature"><span className="ico"><I.Bell /></span><span>Avisos del club y de tu actividad</span></div>
              <div className="auth-feature"><span className="ico"><I.Users /></span><span>Una cuenta, todos tus hijos</span></div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', color: 'rgba(255,255,255,.78)', fontSize: 13 }}>
            <I.Shield />
            <span>Tus datos están protegidos. Cookies seguras y RGPD.</span>
          </div>
        </aside>

        <section className="auth-form">
          {(vista === 'login' || vista === 'register') && (
            <div className="auth-tabs">
              <button className={vista === 'login' ? 'is-active' : ''} onClick={() => irA('login', '/auth')}>Iniciar sesión</button>
              <button className={vista === 'register' ? 'is-active' : ''} onClick={() => irA('register', '/auth?mode=register')}>Crear cuenta</button>
            </div>
          )}

          {avisoOk && <Aviso tipo="ok">{avisoOk}</Aviso>}

          {vista === 'login' && (
            <LoginForm onLoginSuccess={onLoginSuccess} recordar={recordar} setRecordar={setRecordar} errorInicial={errorGoogle}
              onOlvido={(email) => { setEmailOlvido(email); irA('olvido', '/auth?mode=olvido'); }}
              onRegistro={() => irA('register', '/auth?mode=register')} />
          )}
          {vista === 'register' && <RegisterForm onLoginSuccess={onLoginSuccess} />}
          {vista === 'olvido' && <OlvidoForm emailInicial={emailOlvido} onVolver={alLogin} />}
          {vista === 'restablecer' && (
            <RestablecerForm token={token}
              onHecho={() => { alLogin(); setAvisoOk('Contraseña cambiada. Ya puedes entrar con la nueva.'); }}
              onPedirOtro={() => irA('olvido', '/auth?mode=olvido')} />
          )}

          {/* Google, solo para el personal (cuentas @aimeducation.es y
              @allegro.in-mae.es). Facebook no: no se usa. */}
          {vista === 'login' && google && (
            <>
              <div className="divider">personal del club</div>
              <a className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', display: 'flex', gap: 8 }}
                href={`/api/auth/google?recordar=${recordar ? 1 : 0}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                Entrar con Google
              </a>
              <p style={{ fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'center', margin: '8px 0 0' }}>
                Solo con la cuenta de @aimeducation.es o @allegro.in-mae.es.
              </p>
            </>
          )}

          <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', marginTop: 26, lineHeight: 1.6 }}>
            Al continuar aceptas nuestros <a href="/legal/terminos" target="_blank" rel="noopener" style={{ color: 'var(--purple)', fontWeight: 600 }}>Términos</a> y la{' '}
            <a href="/legal/privacidad" target="_blank" rel="noopener" style={{ color: 'var(--purple)', fontWeight: 600 }}>Política de privacidad</a>.
          </p>
          <p style={{ textAlign: 'center', margin: '4px 0 0', fontSize: 12 }}>
            <a href="/" onClick={(e) => { e.preventDefault(); go('/'); }} style={{ color: 'var(--ink-3)' }}>← Volver a la web</a>
          </p>
        </section>
      </div>
    </main>
  );
}
