import React, { useState, useEffect } from 'react';
import { ACTIVITIES, ACT_BY_ID } from './Shared';

// ── Icons ──────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const Icons = {
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  check: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  credit: 'M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9zM3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2',
  wallet: 'M20 12V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5h-4a2 2 0 0 0 0 4h4',
  news: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zm20 0h-6a4 4 0 0 0-4 4v14a3 3 0 0 0 3-3h7z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 12h18M3 6h18M3 18h18',
  x: 'M18 6L6 18M6 6l12 12',
  gift: 'M20 12v10H4V12M22 7H2v5h20V7zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
};
function NavIcon({ d }) {
  return <Icon d={d} size={18} />;
}

// ── Mock data ──────────────────────────────────────────────────────────────
const MOCK_CLASSES = [
  { id: 1, activity: 'taekwondo', day: 'Lunes', time: '17:00', duration: 60, group: 'Junior A' },
  { id: 2, activity: 'ingles', day: 'Martes', time: '16:00', duration: 60, group: 'Flyers B' },
  { id: 3, activity: 'taekwondo', day: 'Miércoles', time: '17:00', duration: 60, group: 'Junior A' },
  { id: 4, activity: 'ingles', day: 'Jueves', time: '16:00', duration: 60, group: 'Flyers B' },
];
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MOCK_PAYMENTS = [
  { id: 1, date: '2025-05-01', concept: 'Taekwondo – Mayo 2025', amount: 42, status: 'paid' },
  { id: 2, date: '2025-05-01', concept: 'Inglés – Mayo 2025', amount: 48, status: 'paid' },
  { id: 3, date: '2025-04-01', concept: 'Taekwondo – Abril 2025', amount: 42, status: 'paid' },
  { id: 4, date: '2025-04-01', concept: 'Inglés – Abril 2025', amount: 48, status: 'paid' },
  { id: 5, date: '2025-06-01', concept: 'Taekwondo – Junio 2025', amount: 42, status: 'pending' },
  { id: 6, date: '2025-06-01', concept: 'Inglés – Junio 2025', amount: 48, status: 'pending' },
];
const MOCK_ATTENDANCE = {
  month: 4,
  year: 2025,
  records: [
    { date: 1, status: 'present' }, { date: 3, status: 'present' }, { date: 7, status: 'present' },
    { date: 8, status: 'present' }, { date: 10, status: 'absent' }, { date: 14, status: 'present' },
    { date: 15, status: 'present' }, { date: 17, status: 'justified' }, { date: 21, status: 'present' },
    { date: 22, status: 'present' }, { date: 24, status: 'present' }, { date: 28, status: 'present' },
    { date: 29, status: 'present' },
  ],
};

// ── Sub-views ──────────────────────────────────────────────────────────────
function OverviewView({ user }) {
  const totalPay = MOCK_PAYMENTS.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const presentCount = MOCK_ATTENDANCE.records.filter(r => r.status === 'present').length;
  const totalCount = MOCK_ATTENDANCE.records.length;
  const attendPct = Math.round(presentCount / totalCount * 100);

  return (
    <div>
      <div className="dash-welcome">
        <h2>Hola, {user.firstName || user.name || 'Alumno'} 👋</h2>
        <p>Aquí tienes un resumen de tu actividad en Aim.</p>
      </div>

      <div className="dash-stats-grid">
        <div className="dash-stat-card" style={{ '--sc': '#5233A8' }}>
          <div className="dash-stat-icon"><NavIcon d={Icons.check} /></div>
          <div className="dash-stat-val">{attendPct}%</div>
          <div className="dash-stat-lbl">Asistencia este mes</div>
        </div>
        <div className="dash-stat-card" style={{ '--sc': '#21B668' }}>
          <div className="dash-stat-icon"><NavIcon d={Icons.calendar} /></div>
          <div className="dash-stat-val">{MOCK_CLASSES.length}</div>
          <div className="dash-stat-lbl">Clases por semana</div>
        </div>
        <div className="dash-stat-card" style={{ '--sc': '#FF4F15' }}>
          <div className="dash-stat-icon"><NavIcon d={Icons.credit} /></div>
          <div className="dash-stat-val">{totalPay}€</div>
          <div className="dash-stat-lbl">Pagado este curso</div>
        </div>
        <div className="dash-stat-card" style={{ '--sc': '#FFD526' }}>
          <div className="dash-stat-icon"><NavIcon d={Icons.gift} /></div>
          <div className="dash-stat-val">0€</div>
          <div className="dash-stat-lbl">Saldo referidos</div>
        </div>
      </div>

      <h3 className="dash-section-title">Esta semana</h3>
      <div className="dash-week-list">
        {MOCK_CLASSES.map(cls => {
          const act = ACT_BY_ID[cls.activity];
          return (
            <div key={cls.id} className="dash-class-row" style={{ borderLeft: `3px solid ${act?.color || '#5233A8'}` }}>
              <div className="dash-class-icon" style={{ background: act ? `color-mix(in oklab, ${act.color} 12%, white)` : '#f3f0ff' }}>
                {act && <img src={act.icon} alt={act.name} style={{ width: 28, height: 28, objectFit: 'contain' }} />}
              </div>
              <div className="dash-class-info">
                <strong>{act?.name || cls.activity}</strong>
                <span>{cls.day} · {cls.time} · {cls.group}</span>
              </div>
              <span className="dash-class-dur">{cls.duration} min</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClassesView() {
  const slots = ['09:00', '10:00', '11:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
  const getClass = (day, time) => MOCK_CLASSES.find(c => c.day === day && c.time === time);

  return (
    <div>
      <h3 className="dash-section-title">Horario semanal</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="dash-week-table">
          <thead>
            <tr>
              <th></th>
              {DAYS.map(d => <th key={d}>{d.slice(0, 3)}</th>)}
            </tr>
          </thead>
          <tbody>
            {slots.map(slot => (
              <tr key={slot}>
                <td className="dash-week-time">{slot}</td>
                {DAYS.map(day => {
                  const cls = getClass(day, slot);
                  const act = cls ? ACT_BY_ID[cls.activity] : null;
                  return (
                    <td key={day}>
                      {cls && act && (
                        <div className="dash-week-class" style={{ background: `color-mix(in oklab, ${act.color} 15%, white)`, borderColor: act.color, color: act.color }}>
                          <img src={act.icon} alt={act.name} style={{ width: 18, height: 18, objectFit: 'contain' }} />
                          <span>{act.name}</span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 16 }}>
        Horario de {new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
      </p>
    </div>
  );
}

function AttendanceView() {
  const { month, year, records } = MOCK_ATTENDANCE;
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;

  const recMap = Object.fromEntries(records.map(r => [r.date, r.status]));
  const present = records.filter(r => r.status === 'present').length;
  const absent = records.filter(r => r.status === 'absent').length;
  const justified = records.filter(r => r.status === 'justified').length;
  const pct = Math.round(present / records.length * 100);

  return (
    <div>
      <div className="dash-attend-stats">
        <div className="dash-attend-stat ok"><span className="val">{present}</span><span className="lbl">Presencias</span></div>
        <div className="dash-attend-stat warn"><span className="val">{absent}</span><span className="lbl">Ausencias</span></div>
        <div className="dash-attend-stat info"><span className="val">{justified}</span><span className="lbl">Justificadas</span></div>
        <div className="dash-attend-stat pct">
          <span className="val" style={{ color: '#5233A8' }}>{pct}%</span>
          <span className="lbl">Asistencia</span>
        </div>
      </div>

      <h3 className="dash-section-title">{MONTHS[month - 1]} {year}</h3>
      <div className="dash-cal">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
          <div key={d} className="dash-cal-dow">{d}</div>
        ))}
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
          const status = recMap[d];
          return (
            <div key={d} className={`dash-cal-day${status ? ` ${status}` : ''}`}>
              {d}
              {status && <span className="dash-cal-dot" />}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap', fontSize: 13 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: '#21B668', display: 'inline-block' }} /> Presente</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: '#FF4F15', display: 'inline-block' }} /> Ausente</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: '#00BBF4', display: 'inline-block' }} /> Justificada</span>
      </div>
    </div>
  );
}

function PaymentsView() {
  const pending = MOCK_PAYMENTS.filter(p => p.status === 'pending');
  const paid = MOCK_PAYMENTS.filter(p => p.status === 'paid');

  return (
    <div>
      {pending.length > 0 && (
        <>
          <h3 className="dash-section-title" style={{ color: '#FF4F15' }}>Pendiente de pago</h3>
          <div className="dash-payments-list">
            {pending.map(p => (
              <div key={p.id} className="dash-payment-row pending">
                <div className="dash-pay-date">{new Date(p.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</div>
                <div className="dash-pay-concept">{p.concept}</div>
                <div className="dash-pay-amount">{p.amount}€</div>
                <div className="dash-pay-status pending">Pendiente</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 32 }}>
            <a href="https://wa.me/34956742216" target="_blank" rel="noopener" className="btn btn-gradient">
              Pagar por WhatsApp →
            </a>
          </div>
        </>
      )}

      <h3 className="dash-section-title">Historial de pagos</h3>
      <div className="dash-payments-list">
        {paid.map(p => (
          <div key={p.id} className="dash-payment-row">
            <div className="dash-pay-date">{new Date(p.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            <div className="dash-pay-concept">{p.concept}</div>
            <div className="dash-pay-amount">{p.amount}€</div>
            <div className="dash-pay-status paid">Pagado</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WalletView({ user }) {
  const referralCode = (user.firstName || 'aim').toUpperCase().slice(0, 4) + Math.abs((user.id || 0) % 9999).toString().padStart(4, '0');
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(referralCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <div className="dash-wallet-hero">
        <div className="dash-wallet-badge">
          <NavIcon d={Icons.gift} />
        </div>
        <h3>Programa de referidos</h3>
        <p>Comparte tu código y consigue <b>10€ de descuento</b> por cada amigo que se matricule.</p>
      </div>

      <div className="dash-wallet-code">
        <span className="dash-wallet-label">Tu código de referido</span>
        <div className="dash-wallet-code-box">
          <span className="dash-wallet-code-text">{referralCode}</span>
          <button className="dash-wallet-copy" onClick={copy}>
            {copied ? '¡Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      <div className="dash-wallet-steps">
        <h3>¿Cómo funciona?</h3>
        <div className="dash-wallet-step">
          <span className="dash-wallet-step-num">1</span>
          <div><strong>Comparte tu código</strong><p>Envía tu código a amigos y familiares que quieran matricularse en Aim.</p></div>
        </div>
        <div className="dash-wallet-step">
          <span className="dash-wallet-step-num">2</span>
          <div><strong>Se matriculan</strong><p>Cuando un amigo se matricule usando tu código, ambos recibiréis el beneficio.</p></div>
        </div>
        <div className="dash-wallet-step">
          <span className="dash-wallet-step-num">3</span>
          <div><strong>Recibes tu descuento</strong><p>10€ de descuento en tu próxima cuota mensual por cada referido exitoso.</p></div>
        </div>
      </div>

      <div className="dash-wallet-balance">
        <span>Saldo actual</span>
        <span className="dash-wallet-balance-amount">0€</span>
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Se aplicará en tu próxima factura</span>
      </div>
    </div>
  );
}

function NewsView() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/posts?limit=10')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setPosts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>Cargando noticias...</div>;

  return (
    <div>
      <h3 className="dash-section-title">Noticias y avisos</h3>
      {posts.length === 0 ? (
        <p style={{ color: 'var(--ink-3)' }}>No hay noticias publicadas aún.</p>
      ) : (
        <div className="dash-news-list">
          {posts.map(post => (
            <a key={post.id} href={`/noticias/${post.slug}`} className="dash-news-item" target="_blank" rel="noopener">
              {post.cover_image_url && (
                <div className="dash-news-img">
                  <img src={post.cover_image_url} alt={post.title} />
                </div>
              )}
              <div className="dash-news-body">
                <span className="dash-news-cat">{post.category || 'General'}</span>
                <h4>{post.title}</h4>
                {post.excerpt && <p>{post.excerpt}</p>}
                <span className="dash-news-date">
                  {new Date(post.published_at || post.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileView({ user }) {
  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    phone: user.phone || '',
  });
  const [saved, setSaved] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await fetch('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
  };

  return (
    <div>
      <h3 className="dash-section-title">Mi perfil</h3>
      <form className="dash-profile-form" onSubmit={handleSave}>
        <div className="dash-profile-avatar">
          <div className="dash-avatar-circle" style={{ background: 'var(--grad-aim)' }}>
            <span>{(user.firstName || 'A').charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{user.firstName} {user.lastName}</div>
            <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>{user.email}</div>
          </div>
        </div>

        <div className="dash-form-row">
          <div className="dash-form-field">
            <label>Nombre</label>
            <input type="text" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
          </div>
          <div className="dash-form-field">
            <label>Apellidos</label>
            <input type="text" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
          </div>
        </div>
        <div className="dash-form-field">
          <label>Email</label>
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="dash-form-field">
          <label>Teléfono</label>
          <input type="tel" placeholder="+34 600 000 000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" className="btn btn-gradient">Guardar cambios</button>
          {saved && <span style={{ color: '#21B668', fontWeight: 600, fontSize: 14 }}>✓ Guardado</span>}
        </div>
      </form>
    </div>
  );
}

function SettingsView({ onLogout }) {
  const [notif, setNotif] = useState({ email: true, news: true, payments: true });

  return (
    <div>
      <h3 className="dash-section-title">Notificaciones</h3>
      <div className="dash-settings-list">
        {[
          { key: 'email', label: 'Emails de la academia', desc: 'Recibe comunicados importantes por email' },
          { key: 'news', label: 'Noticias y eventos', desc: 'Entérate de las novedades del club' },
          { key: 'payments', label: 'Recordatorios de pago', desc: 'Aviso cuando vence tu cuota mensual' },
        ].map(item => (
          <div key={item.key} className="dash-settings-row">
            <div>
              <div style={{ fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{item.desc}</div>
            </div>
            <button
              className={`dash-toggle${notif[item.key] ? ' on' : ''}`}
              onClick={() => setNotif(n => ({ ...n, [item.key]: !n[item.key] }))}
              aria-label={item.label}
            >
              <span className="dash-toggle-knob" />
            </button>
          </div>
        ))}
      </div>

      <h3 className="dash-section-title" style={{ marginTop: 36 }}>Cuenta</h3>
      <div className="dash-settings-list">
        <div className="dash-settings-row">
          <div>
            <div style={{ fontWeight: 600 }}>Cambiar contraseña</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Actualiza tu contraseña de acceso</div>
          </div>
          <button className="btn btn-outline" style={{ fontSize: 13 }}>Cambiar</button>
        </div>
      </div>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
        <button className="btn" style={{ background: 'transparent', color: '#FF4F15', border: '1.5px solid #FF4F15', display: 'flex', alignItems: 'center', gap: 8 }} onClick={onLogout}>
          <NavIcon d={Icons.logout} /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'overview', label: 'Inicio', icon: Icons.home },
  { id: 'classes', label: 'Mis clases', icon: Icons.calendar },
  { id: 'attendance', label: 'Asistencia', icon: Icons.check },
  { id: 'payments', label: 'Pagos', icon: Icons.credit },
  { id: 'wallet', label: 'Referidos', icon: Icons.gift },
  { id: 'news', label: 'Noticias', icon: Icons.news },
  { id: 'profile', label: 'Mi perfil', icon: Icons.user },
  { id: 'settings', label: 'Ajustes', icon: Icons.settings },
];

const VIEW_LABELS = {
  overview: 'Inicio',
  classes: 'Mis clases',
  attendance: 'Asistencia',
  payments: 'Pagos',
  wallet: 'Referidos',
  news: 'Noticias',
  profile: 'Mi perfil',
  settings: 'Ajustes',
};

export default function StudentDashboard({ user, onLogout }) {
  const [view, setView] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);

  const renderView = () => {
    switch (view) {
      case 'overview': return <OverviewView user={user} />;
      case 'classes': return <ClassesView />;
      case 'attendance': return <AttendanceView />;
      case 'payments': return <PaymentsView />;
      case 'wallet': return <WalletView user={user} />;
      case 'news': return <NewsView />;
      case 'profile': return <ProfileView user={user} />;
      case 'settings': return <SettingsView onLogout={onLogout} />;
      default: return <OverviewView user={user} />;
    }
  };

  return (
    <div className="dash-app">
      {/* Sidebar */}
      <aside className={`dash-sidebar${menuOpen ? ' open' : ''}`}>
        <div className="dash-sidebar-top">
          <a href="/" onClick={(e) => { e.preventDefault(); window.history.pushState(null,'','/'); window.dispatchEvent(new PopStateEvent('popstate')); }}>
            <img src="/src/brand/Aim_Horizontal.png" alt="Aim Education" style={{ height: 28, width: 'auto' }} />
          </a>
          <button className="dash-close-btn" onClick={() => setMenuOpen(false)}>
            <NavIcon d={Icons.x} />
          </button>
        </div>

        <div className="dash-user-chip">
          <div className="dash-user-avatar">{(user.firstName || 'A').charAt(0).toUpperCase()}</div>
          <div>
            <div className="dash-user-name">{user.firstName} {user.lastName || ''}</div>
            <div className="dash-user-role">Alumno</div>
          </div>
        </div>

        <nav className="dash-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`dash-nav-item${view === item.id ? ' active' : ''}`}
              onClick={() => { setView(item.id); setMenuOpen(false); }}
            >
              <NavIcon d={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', padding: '16px 12px' }}>
          <button className="dash-nav-item" onClick={onLogout} style={{ color: '#FF4F15' }}>
            <NavIcon d={Icons.logout} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="dash-mobile-header">
        <button className="dash-menu-btn" onClick={() => setMenuOpen(true)}>
          <NavIcon d={Icons.menu} />
        </button>
        <img src="/src/brand/Aim_Horizontal.png" alt="Aim Education" style={{ height: 24 }} />
        <div className="dash-user-avatar sm">{(user.firstName || 'A').charAt(0).toUpperCase()}</div>
      </div>

      {/* Main content */}
      <main className="dash-main">
        <div className="dash-main-inner">
          <div className="dash-header">
            <div>
              <div className="dash-header-eyebrow">Mi panel · Aim Education</div>
              <h1 className="dash-header-title">{VIEW_LABELS[view]}</h1>
            </div>
          </div>
          <div className="dash-content">
            {renderView()}
          </div>
        </div>
      </main>

      {/* Mobile overlay */}
      {menuOpen && <div className="dash-overlay" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}
