import React, { useState } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, MagicText, MAPA_URL } from './Shared.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Contacto (ticket #295): nombre, correo, teléfono y mensaje. La consulta queda
// en el panel («Consultas web») y a secretaría le llega un aviso por correo.
// Antes de enviar hay que aceptar la política de privacidad (ticket #255).
// ─────────────────────────────────────────────────────────────────────────────

const inp = { width: '100%', fontFamily: 'inherit', fontSize: 15, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' };

export default function PublicContacto() {
  const [f, setF] = useState({ nombre: '', email: '', telefono: '', mensaje: '', web: '' });
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState('');
  const upd = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const r = await fetch('/api/contacto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, aceptaPrivacidad: acepta }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido enviar.');
      setHecho(true);
    } catch (err) { setError(err.message); } finally { setEnviando(false); }
  }

  return (
    <>
      <AimHeader route="contact" />
      <main style={{ paddingTop: 0 }}>
        <section className="block tight">
          <div className="container contacto-grid">
            <div>
              <span className="eyebrow purple">Contacto</span>
              <h1 className="title-display">Cuéntanos, te <MagicText>respondemos.</MagicText></h1>
              <p className="section-lede" style={{ marginTop: 14 }}>
                ¿Dudas sobre una actividad, los horarios o el campamento? Escríbenos y te contestamos lo antes posible.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '26px 0 0', display: 'grid', gap: 14, fontSize: 15 }}>
                <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <I.MapPin style={{ flexShrink: 0, marginTop: 2, color: 'var(--purple)' }} />
                  <a href={MAPA_URL} target="_blank" rel="noopener">Urb. Terrazas de Doña Lola, Local 1<br />11203 Algeciras (Cádiz)</a>
                </li>
                <li style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <I.Phone style={{ flexShrink: 0, color: 'var(--purple)' }} /><a href="tel:+34956742216">956 742 216</a>
                </li>
                <li style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <I.Mail style={{ flexShrink: 0, color: 'var(--purple)' }} /><a href="mailto:info@aimeducation.es">info@aimeducation.es</a>
                </li>
              </ul>
            </div>

            <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 22, padding: 24, boxShadow: 'var(--shadow)' }}>
              {hecho ? (
                <div style={{ display: 'grid', gap: 10, textAlign: 'center', padding: '30px 10px' }}>
                  <div style={{ fontSize: 42 }}>✉️</div>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800 }}>¡Recibido!</h2>
                  <p style={{ margin: 0, color: 'var(--ink-2)' }}>Te contestaremos en {f.email} lo antes posible.</p>
                </div>
              ) : (
                <form onSubmit={enviar} style={{ display: 'grid', gap: 14 }}>
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 }}>
                    Nombre
                    <input value={f.nombre} onChange={upd('nombre')} required maxLength={120} autoComplete="name" style={inp} />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                    <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 }}>
                      Correo electrónico
                      <input type="email" value={f.email} onChange={upd('email')} required maxLength={255} autoComplete="email" style={inp} />
                    </label>
                    <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 }}>
                      Teléfono
                      <input type="tel" value={f.telefono} onChange={upd('telefono')} maxLength={40} autoComplete="tel" style={inp} />
                    </label>
                  </div>
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 }}>
                    Mensaje
                    <textarea value={f.mensaje} onChange={upd('mensaje')} required maxLength={3000} rows={6} style={{ ...inp, resize: 'vertical' }} />
                  </label>
                  {/* Campo trampa: las personas no lo ven; los robots lo rellenan. */}
                  <input value={f.web} onChange={upd('web')} tabIndex={-1} autoComplete="off" aria-hidden="true"
                    style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    <input type="checkbox" required checked={acepta} onChange={e => setAcepta(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--purple)' }} />
                    <span>He leído y acepto la <a href="/legal/privacidad" target="_blank" rel="noopener">política de privacidad</a>.</span>
                  </label>
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-3)', fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>
                    <b>Protección de datos.</b> Responsable: AIM Deporte y Educación S.L. Finalidad: atender tu consulta.
                    Legitimación: tu consentimiento. No se ceden datos salvo obligación legal. Puedes ejercer tus derechos en
                    info@aimeducation.es. Más información en la <a href="/legal/privacidad" target="_blank" rel="noopener">política de privacidad</a>.
                  </div>
                  {error && <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--orange)' }}>{error}</p>}
                  <button type="submit" className="btn btn-gradient btn-lg" disabled={enviando}>
                    {enviando ? 'Enviando…' : <>Enviar consulta <I.Arrow /></>}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
        <AimFooter />
      </main>
    </>
  );
}
