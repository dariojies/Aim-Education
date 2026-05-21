import React, { useState } from 'react';
import { I } from './Icons.jsx';
import { AimLogo } from './Shared.jsx';
import { useRouter } from '../App.jsx';

function FamilyMember({ n, defaultName, defaultAge, defaultAct }) {
  return (
    <div style={{background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 14, padding: 16, marginBottom: 12}}>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10}}>
        <span style={{fontWeight: 700, fontSize: 13}}>Alumno/a #{n}</span>
        <button type="button" style={{background: "transparent", border: 0, color: "var(--orange)", cursor: "pointer", fontSize: 12}}>Eliminar</button>
      </div>
      <div className="field-row">
        <div className="field"><label>Nombre</label><input defaultValue={defaultName} /></div>
        <div className="field"><label>Edad</label><input defaultValue={defaultAge} /></div>
      </div>
      <div className="field">
        <label>Actividad principal</label>
        <select defaultValue={defaultAct}>
          <option>Taekwondo</option><option>Ballet Clásico</option><option>Inglés</option>
          <option>Robótica</option><option>Pintura</option><option>Funcional</option>
          <option>Baile Moderno</option><option>Gimnasia Rítmica</option>
        </select>
      </div>
    </div>
  );
}

function LoginForm({ go }) {
  const [email, setEmail] = useState("ana.garcia@example.com");
  const [pw, setPw] = useState("•••••••••");
  const [loading, setLoading] = useState(false);

  function submit(e) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); go("/dashboard"); }, 700);
  }

  return (
    <form onSubmit={submit}>
      <h1>¡Hola de nuevo!</h1>
      <p className="hint">Bienvenido/a a Aim Education. Entra a tu panel.</p>

      <div className="field">
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pw">Contraseña</label>
        <input id="pw" type="password" placeholder="••••••••" value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      <div className="field-meta">
        <label style={{display: "inline-flex", gap: 8, alignItems: "center", color: "var(--ink-2)"}}>
          <input type="checkbox" defaultChecked style={{accentColor: "var(--purple)"}} /> Mantenerme conectado
        </label>
        <a href="#">¿Olvidaste tu contraseña?</a>
      </div>
      <button type="submit" className="btn btn-gradient btn-block btn-lg" disabled={loading}>
        {loading ? <span className="dot-loader" /> : <>Entrar a mi cuenta <I.Arrow /></>}
      </button>

      <p style={{textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--ink-2)"}}>
        ¿Aún no tienes cuenta? <a href="#" onClick={(e) => { e.preventDefault(); go("/auth?mode=register"); }} style={{color: "var(--purple)", fontWeight: 700}}>Regístrate</a>
      </p>
    </form>
  );
}

function RegisterForm({ go }) {
  const [step, setStep] = useState(1);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (step < 3) setStep(step + 1); else go("/dashboard"); }}>
      <h1>Crea tu cuenta</h1>
      <p className="hint">Un perfil familiar. Paso {step} de 3.</p>

      <div style={{display: "flex", gap: 6, marginBottom: 22}}>
        {[1, 2, 3].map(n => (
          <div key={n} style={{
            flex: 1,
            height: 4,
            borderRadius: 99,
            background: n <= step ? "var(--grad-aim)" : "var(--line)"
          }}/>
        ))}
      </div>

      {step === 1 && (
        <>
          <div className="field-row">
            <div className="field"><label>Nombre</label><input placeholder="Ana" /></div>
            <div className="field"><label>Apellidos</label><input placeholder="García López" /></div>
          </div>
          <div className="field"><label>Correo</label><input type="email" placeholder="ana@email.com" /></div>
          <div className="field-row">
            <div className="field"><label>Teléfono</label><input placeholder="+34 600 000 000" /></div>
            <div className="field"><label>DNI / NIE</label><input placeholder="00000000A" /></div>
          </div>
          <div className="field"><label>Contraseña</label><input type="password" placeholder="Mín. 8 caracteres" /></div>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{padding: 14, background: "color-mix(in oklab, var(--purple) 8%, var(--bg-2))", border: "1px solid color-mix(in oklab, var(--purple) 30%, transparent)", borderRadius: 12, marginBottom: 16, fontSize: 13, color: "var(--ink-2)"}}>
            Añade los miembros de la familia que van a clase. Puedes añadir más después.
          </div>
          <FamilyMember n={1} defaultName="Lucía" defaultAge="9" defaultAct="Ballet Clásico" />
          <FamilyMember n={2} defaultName="Mateo" defaultAge="6" defaultAct="Taekwondo" />
          <button type="button" className="btn btn-outline btn-block" style={{marginTop: 8}}>
            <I.Plus /> Añadir otro miembro
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <div className="field">
            <label>¿Cómo nos conociste?</label>
            <select>
              <option>Recomendación</option>
              <option>Instagram</option>
              <option>Google</option>
              <option>Cartel / flyer</option>
              <option>Otro</option>
            </select>
          </div>
          <div className="field">
            <label>Código de referido (opcional)</label>
            <input placeholder="AIM-XXXXX" />
          </div>
          <label style={{display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.5}}>
            <input type="checkbox" defaultChecked style={{marginTop: 3, accentColor: "var(--purple)"}} />
            <span>Acepto los términos y condiciones, el reglamento interno y la política de privacidad.</span>
          </label>
          <label style={{display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--ink-2)", marginTop: 10, lineHeight: 1.5}}>
            <input type="checkbox" style={{marginTop: 3, accentColor: "var(--purple)"}} />
            <span>Quiero recibir comunicaciones del club (noticias, eventos, descuentos).</span>
          </label>
        </>
      )}

      <div style={{display: "flex", gap: 8, marginTop: 22}}>
        {step > 1 && (
          <button type="button" className="btn btn-outline" onClick={() => setStep(step - 1)}>
            Anterior
          </button>
        )}
        <button type="submit" className="btn btn-gradient" style={{flex: 1}}>
          {step < 3 ? "Continuar" : "Crear mi cuenta"} <I.Arrow />
        </button>
      </div>
    </form>
  );
}

export default function AuthScreen({ mode = "login" }) {
  const { go } = useRouter();
  const [tab, setTab] = useState(mode === "register" ? "register" : "login");

  return (
    <main style={{paddingTop: 0}}>
      <div className="auth-shell">
        <aside className="auth-side">
          <div>
            <AimLogo sub />
            <h2 style={{marginTop: 48}}>
              Innovación,<br/>excelencia y<br/>pasión.
            </h2>
            <p>
              Desde un perfil único accedes a tus clases, horarios, pagos, asistencia,
              torneos y novedades. Un solo lugar para tu familia entera.
            </p>

            <div className="auth-features">
              <div className="auth-feature">
                <span className="ico"><I.Calendar /></span>
                <span>Tu horario completo siempre actualizado</span>
              </div>
              <div className="auth-feature">
                <span className="ico"><I.CreditCard /></span>
                <span>Pagos online y recibos descargables</span>
              </div>
              <div className="auth-feature">
                <span className="ico"><I.Bell /></span>
                <span>Avisos del club y de tu actividad</span>
              </div>
              <div className="auth-feature">
                <span className="ico"><I.Users /></span>
                <span>Una cuenta, todos tus hijos</span>
              </div>
            </div>
          </div>

          <div style={{display: "flex", gap: 14, alignItems: "center", color: "rgba(255,255,255,.78)", fontSize: 13}}>
            <I.Shield />
            <span>Tus datos están protegidos. Cookies seguras y RGPD.</span>
          </div>
        </aside>

        <section className="auth-form">
          <div className="auth-tabs">
            <button className={tab === "login" ? "is-active" : ""} onClick={() => setTab("login")}>Iniciar sesión</button>
            <button className={tab === "register" ? "is-active" : ""} onClick={() => setTab("register")}>Crear cuenta</button>
          </div>

          {tab === "login" ? <LoginForm go={go} /> : <RegisterForm go={go} />}

          <div className="divider">o continúa con</div>
          <div className="oauth-row">
            <button className="btn btn-outline" style={{width: "100%"}}>
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Google
            </button>
            <button className="btn btn-outline" style={{width: "100%"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12.07C22 6.5 17.52 2 12 2S2 6.5 2 12.07C2 17.1 5.66 21.27 10.44 22v-7.03H7.9v-2.9h2.54V9.84c0-2.51 1.5-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.34V22C18.34 21.27 22 17.1 22 12.07z"/></svg>
              Facebook
            </button>
          </div>

          <p style={{fontSize: 12, color: "var(--ink-3)", textAlign: "center", marginTop: 26, lineHeight: 1.6}}>
            Al continuar aceptas nuestros <a href="#" style={{color: "var(--purple)", fontWeight: 600}}>Términos</a> y la{" "}
            <a href="#" style={{color: "var(--purple)", fontWeight: 600}}>Política de privacidad</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
