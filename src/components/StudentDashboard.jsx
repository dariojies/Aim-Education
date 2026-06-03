import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimLogo, ACT_BY_ID } from './Shared.jsx';
import { useRouter } from '../App.jsx';
import { UserSupport } from './AdminSupport.jsx';

function ClassRow({ act, who, day, dnum, time, room }) {
  const a = ACT_BY_ID[act];
  return (
    <div className={`class-row ${a?.className || ""}`}>
      <div className="day"><div className="d">{dnum}</div><div className="w">{day}</div></div>
      <div className="info">
        <h4>{who}</h4>
        <p>{time} · {room}</p>
      </div>
      <span className="badge">{a?.name || act}</span>
    </div>
  );
}

function SummaryRow({ label, value, tone }) {
  return (
    <div style={{display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px dashed var(--line)", fontSize: 13}}>
      <span style={{color: "var(--ink-3)", fontWeight: 600}}>{label}</span>
      <span style={{color: tone || "var(--ink)", fontWeight: 800, fontFamily: "var(--font-display)"}}>{value}</span>
    </div>
  );
}

function DashOverview({ go, setView }) {
  return (
    <>
      <div className="dash-cards">
        <div className="stat-card act-ballet">
          <div className="corner"><I.Calendar /></div>
          <div className="l">Próxima clase</div>
          <div className="v">Hoy <small>18:00</small></div>
          <div style={{marginTop: 8, fontSize: 13, color: "var(--ink-2)"}}>Lucía · Ballet Primary</div>
        </div>
        <div className="stat-card warn act-funcional">
          <div className="corner"><I.Wallet /></div>
          <div className="l">Próximo pago</div>
          <div className="v">112€</div>
          <div className="trend">vence en 4 días</div>
        </div>
        <div className="stat-card act-taekwondo">
          <div className="corner"><I.Check /></div>
          <div className="l">Asistencia mes</div>
          <div className="v">92%</div>
          <div className="trend"><I.Arrow width={10} height={10}/> +6% vs mes pasado</div>
        </div>
        <div className="stat-card act-pintura">
          <div className="corner"><I.Star /></div>
          <div className="l">Próximo evento</div>
          <div className="v">14 Jun</div>
          <div style={{marginTop: 8, fontSize: 13, color: "var(--ink-2)"}}>Festival Anual de Ballet</div>
        </div>
      </div>

      <div className="panel">
        <h2><I.Calendar /> Esta semana</h2>
        <p className="sub">Las clases programadas para tu familia.</p>
        <div className="classes-grid">
          <ClassRow act="ballet" name="Lucía" who="Lucía · Ballet Primary" day="Hoy" dnum="22" time="18:00 – 19:00" room="Sala 1" />
          <ClassRow act="taekwondo" name="Mateo" who="Mateo · Cinturones blancos" day="Hoy" dnum="22" time="17:00 – 18:00" room="Tatami" />
          <ClassRow act="ballet" name="Lucía" who="Lucía · Ballet Primary" day="Mañana" dnum="23" time="18:00 – 19:00" room="Sala 1" />
          <ClassRow act="ingles" name="Ana" who="Ana · B2 First" day="Jue" dnum="24" time="19:00 – 20:30" room="Aula 3" />
          <ClassRow act="funcional" name="Carlos" who="Carlos · Funcional tarde" day="Vie" dnum="25" time="19:00 – 20:00" room="Sala fit" />
          <ClassRow act="taekwondo" name="Mateo" who="Mateo · Cinturones blancos" day="Vie" dnum="25" time="17:00 – 18:00" room="Tatami" />
        </div>
      </div>

      <div style={{display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22}}>
        <div className="panel">
          <h2><I.Bell /> Avisos recientes</h2>
          <p className="sub">Comunicaciones del club y de tus actividades.</p>
          {[
            { tag: "Ballet", color: "var(--pink)", t: "Recordatorio uniforme festival", d: "Hace 2 horas", body: "El sábado 14 de junio, todos los grupos con leotardo rosa y zapatillas blancas." },
            { tag: "Aim", color: "var(--purple)", t: "Inscripciones campamento de verano abiertas", d: "Ayer", body: "Hasta el 30% de descuento para familias actuales del club hasta el 30 de abril." },
            { tag: "Taekwondo", color: "var(--teal)", t: "Examen de cambio de cinturón confirmado", d: "Hace 3 días", body: "Sábado 28 de junio a las 10:00 — confirma la asistencia de Mateo en pagos." },
          ].map((n, i) => (
            <div key={i} style={{display: "flex", gap: 14, padding: "14px 0", borderBottom: i < 2 ? "1px solid var(--line-2)" : "0"}}>
              <div style={{width: 8, height: 8, borderRadius: "50%", background: n.color, marginTop: 8, flexShrink: 0}} />
              <div style={{flex: 1}}>
                <div style={{display: "flex", justifyContent: "space-between", marginBottom: 4}}>
                  <span style={{fontSize: 10, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: n.color}}>{n.tag}</span>
                  <span style={{fontSize: 11, color: "var(--ink-3)"}}>{n.d}</span>
                </div>
                <h4 style={{margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "var(--ink)"}}>{n.t}</h4>
                <p style={{margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45}}>{n.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <h2><I.Wallet /> Resumen económico</h2>
          <p className="sub">Estado de pagos del mes en curso.</p>
          <div style={{
            background: "var(--grad-aim)",
            borderRadius: 14,
            padding: 22,
            color: "white",
            marginBottom: 18,
            position: "relative",
            overflow: "hidden",
          }}>
            <div style={{fontSize: 12, opacity: .8, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700}}>Pendiente</div>
            <div style={{fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 800, letterSpacing: "-.025em", marginTop: 6}}>112,00€</div>
            <div style={{fontSize: 12, marginTop: 8, opacity: .9}}>Cuotas mayo · 3 alumnos</div>
            <button className="btn" style={{background: "var(--ink)", color: "white", marginTop: 14}} onClick={() => setView("payments")}>
              Pagar ahora <I.Arrow />
            </button>
          </div>
          <div style={{display: "grid", gap: 8}}>
            <SummaryRow label="Total este mes" value="112€" />
            <SummaryRow label="Pagado en el año" value="970€" />
            <SummaryRow label="Cartera comisiones" value="42€" tone="var(--teal)" />
          </div>
        </div>
      </div>
    </>
  );
}

function DashClasses() {
  const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const slots = [
    { d: 0, s: 16, h: 2, act: "ballet", title: "Lucía · Primary", room: "Sala 1" },
    { d: 0, s: 17, h: 1, act: "taekwondo", title: "Mateo · Blancos", room: "Tatami" },
    { d: 1, s: 16, h: 1, act: "ingles", title: "Lucía · Movers", room: "Aula 3" },
    { d: 1, s: 18, h: 1.5, act: "ingles", title: "Ana · B2 First", room: "Aula 1" },
    { d: 2, s: 16, h: 2, act: "ballet", title: "Lucía · Primary", room: "Sala 1" },
    { d: 2, s: 18, h: 1, act: "robotica", title: "Mateo · Junior", room: "Lab" },
    { d: 3, s: 18, h: 1.5, act: "ingles", title: "Ana · B2 First", room: "Aula 1" },
    { d: 4, s: 17, h: 1, act: "taekwondo", title: "Mateo · Blancos", room: "Tatami" },
    { d: 4, s: 18, h: 1, act: "funcional", title: "Carlos · Funcional", room: "Sala fit" },
    { d: 5, s: 10, h: 2, act: "taekwondo", title: "Mateo · Competición", room: "Tatami" },
  ];

  const HOURS = Array.from({length: 13}, (_, i) => 9 + i);

  return (
    <div className="panel">
      <h2><I.Calendar /> Horario semanal</h2>
      <p className="sub">Todas las clases de tu familia en una sola vista.</p>
      <div className="week-grid" style={{gridTemplateColumns: "80px repeat(6, 1fr)"}}>
        <div className="hdr"></div>
        {days.map(d => <div key={d} className="hdr">{d}</div>)}
        {HOURS.map(h => (
          <React.Fragment key={h}>
            <div className="time">{h}:00</div>
            {days.map((_, dIdx) => {
              const slot = slots.find(s => s.d === dIdx && s.s === h);
              return (
                <div key={dIdx} style={{minHeight: 48, position: "relative"}}>
                  {slot && (
                    <button className={`slot ${ACT_BY_ID[slot.act].className}`}
                      style={{
                        background: ACT_BY_ID[slot.act].color,
                        height: `calc(${slot.h} * 48px - 8px)`
                      }}>
                      <span className="t">{slot.title}</span>
                      <span className="meta">{h}:00 · {slot.room}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function DashAttendance() {
  const students = [
    { name: "Lucía García", act: "ballet", percent: 95, sessions: 24, attended: 23, missed: 1 },
    { name: "Mateo García", act: "taekwondo", percent: 88, sessions: 32, attended: 28, missed: 4 },
    { name: "Ana García", act: "ingles", percent: 75, sessions: 16, attended: 12, missed: 4 },
    { name: "Carlos García", act: "funcional", percent: 100, sessions: 12, attended: 12, missed: 0 },
  ];

  return (
    <div className="panel">
      <h2><I.Check /> Asistencia del trimestre</h2>
      <p className="sub">Histórico por miembro de la familia. Verde: asistió. Naranja: ausencia. Gris: clases futuras.</p>

      <div style={{display: "grid", gap: 20, marginTop: 16}}>
        {students.map((s, i) => {
          const a = ACT_BY_ID[s.act];
          return (
            <div key={i} className={a.className}>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10}}>
                <div style={{display: "flex", alignItems: "center", gap: 10}}>
                  <div className="avatar" style={{background: a.color}}>{s.name[0]}</div>
                  <div>
                    <div style={{fontWeight: 700, fontSize: 15}}>{s.name}</div>
                    <div style={{fontSize: 12, color: "var(--ink-3)"}}>{a.name} · {s.attended}/{s.sessions} sesiones</div>
                  </div>
                </div>
                <div style={{textAlign: "right"}}>
                  <div style={{fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, letterSpacing: "-.02em", lineHeight: 1, color: s.percent >= 90 ? "var(--teal)" : s.percent >= 75 ? "var(--orange-soft)" : "var(--orange)"}}>{s.percent}%</div>
                  <div style={{fontSize: 11, color: "var(--ink-3)", fontWeight: 600, marginTop: 2}}>asistencia</div>
                </div>
              </div>
              <div className="attendance-bar">
                {Array.from({length: 32}).map((_, idx) => {
                  if (idx < s.attended) return <div key={idx} className="ok" style={{flex: 1}} />;
                  if (idx < s.attended + s.missed) return <div key={idx} className="miss" style={{flex: 1}} />;
                  return <div key={idx} className="future" style={{flex: 1}} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashPayments() {
  const [receipts, setReceipts] = useState([]);

  useEffect(() => {
    fetch('/api/receipts', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setReceipts)
      .catch(() => {});
  }, []);

  const totalPaid = receipts.reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <>
      <div className="dash-cards" style={{gridTemplateColumns: "repeat(3, 1fr)"}}>
        <div className="stat-card">
          <div className="l">Pagado este año</div>
          <div className="v">{totalPaid > 0 ? `${totalPaid.toLocaleString("es-ES", {minimumFractionDigits: 0})}€` : "—"}</div>
          <div style={{marginTop: 8, fontSize: 13, color: "var(--ink-2)"}}>{receipts.length} recibo{receipts.length !== 1 ? "s" : ""} · IVA inc.</div>
        </div>
        <div className="stat-card warn">
          <div className="l">Pendiente</div>
          <div className="v">—</div>
          <div className="trend">Contacta con el club</div>
        </div>
        <div className="stat-card">
          <div className="l">Próximo cargo</div>
          <div className="v">1 Jun</div>
          <div style={{marginTop: 8, fontSize: 13, color: "var(--ink-2)"}}>Domiciliación SEPA</div>
        </div>
      </div>

      <div className="panel">
        <h2><I.Wallet /> Histórico de recibos</h2>
        <p className="sub">Descarga tus recibos para deducciones fiscales.</p>
        {receipts.length === 0 && <p style={{color: "var(--ink-3)", fontSize: 14}}>No hay recibos disponibles.</p>}
        {receipts.map((r, i) => {
          const d = r.date ? new Date(r.date).toLocaleDateString("es-ES") : "—";
          const amount = r.amount != null ? `${parseFloat(r.amount).toLocaleString("es-ES", {minimumFractionDigits: 2})}€` : "—";
          return (
            <div key={r.id || i} className="payment-row">
              <div>
                <div className="name">{r.company || "Recibo"}</div>
                <div className="date">{r.paymentMethod || "—"}</div>
              </div>
              <span className="status-pill ok">Pagado</span>
              <span className="date">{d}</span>
              <span className="amount">{amount}</span>
              {r.invoiceLink
                ? <a href={r.invoiceLink} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">PDF</a>
                : <button className="btn btn-sm btn-outline" disabled>PDF</button>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function DashWallet() {
  return (
    <div className="panel">
      <h2><I.CreditCard /> Tu cartera de comisiones</h2>
      <p className="sub">Gana 10€ por cada familia que se inscriba con tu código. Sin límite.</p>

      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 18}}>
        <div style={{background: "var(--grad-aim)", borderRadius: 18, padding: 28, color: "white"}}>
          <div style={{fontSize: 11, letterSpacing: ".15em", fontWeight: 800, textTransform: "uppercase", opacity: .9}}>Tu código</div>
          <div style={{fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 800, letterSpacing: "-.025em", marginTop: 10}}>AIM-A4G7K</div>
          <button className="btn btn-sm" style={{marginTop: 14, background: "rgba(255,255,255,.22)", color: "white", border: "1px solid rgba(255,255,255,.4)"}}>Copiar enlace</button>
        </div>
        <div style={{background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 18, padding: 28}}>
          <div style={{fontSize: 11, letterSpacing: ".15em", fontWeight: 800, textTransform: "uppercase", color: "var(--ink-3)"}}>Saldo disponible</div>
          <div style={{fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 800, letterSpacing: "-.025em", marginTop: 10, color: "var(--teal)"}}>42,00€</div>
          <div style={{fontSize: 12, color: "var(--ink-3)", marginTop: 6}}>Se aplicará en tu próxima cuota.</div>
        </div>
      </div>

      <h3 style={{marginTop: 32, fontSize: 16, fontWeight: 700}}>Movimientos</h3>
      <div style={{marginTop: 12}}>
        <div className="payment-row">
          <div><div className="name">Referido: Familia Pérez</div><div className="date">Hace 2 semanas</div></div>
          <span className="status-pill ok">Confirmado</span>
          <span className="date">15/04/2026</span>
          <span className="amount" style={{color: "var(--teal)"}}>+10,00€</span>
          <span></span>
        </div>
        <div className="payment-row">
          <div><div className="name">Aplicado a cuota mensual</div><div className="date">Marzo</div></div>
          <span className="status-pill ok">Aplicado</span>
          <span className="date">01/03/2026</span>
          <span className="amount" style={{color: "var(--orange)"}}>-15,00€</span>
          <span></span>
        </div>
        <div className="payment-row">
          <div><div className="name">Referido: Familia Romero</div><div className="date">Hace 2 meses</div></div>
          <span className="status-pill ok">Confirmado</span>
          <span className="date">10/02/2026</span>
          <span className="amount" style={{color: "var(--teal)"}}>+10,00€</span>
          <span></span>
        </div>
      </div>
    </div>
  );
}

const CAT_COLOR = { ballet: "var(--pink)", taekwondo: "var(--teal)", ingles: "var(--blue)", robotica: "var(--yellow)", pintura: "var(--purple)", funcional: "var(--orange)", general: "var(--purple)", club: "var(--purple)", competicion: "var(--teal)" };

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "Hace menos de 1h";
  if (h < 24) return `Hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Ayer";
  if (d < 7) return `Hace ${d} días`;
  return `Hace ${Math.floor(d / 7)} semana${Math.floor(d / 7) > 1 ? "s" : ""}`;
}

function DashNews() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/posts?limit=10')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setPosts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="panel">
      <h2><I.Bell /> Avisos del club</h2>
      <p className="sub">Últimas noticias y comunicaciones del club.</p>
      {loading && <p style={{color: "var(--ink-3)", fontSize: 14}}>Cargando...</p>}
      {!loading && posts.length === 0 && <p style={{color: "var(--ink-3)", fontSize: 14}}>No hay noticias publicadas.</p>}
      {posts.map((n, i) => {
        const color = CAT_COLOR[n.category] || "var(--purple)";
        return (
          <div key={n.id} style={{display: "flex", gap: 14, padding: "18px 0", borderBottom: i < posts.length - 1 ? "1px solid var(--line-2)" : "0"}}>
            <div style={{width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 8, flexShrink: 0}} />
            <div style={{flex: 1}}>
              <div style={{display: "flex", justifyContent: "space-between", marginBottom: 6}}>
                <span style={{fontSize: 10, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color}}>{n.category || "Aim"}</span>
                <span style={{fontSize: 11, color: "var(--ink-3)"}}>{timeAgo(n.published_at || n.created_at)}</span>
              </div>
              <h4 style={{margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "var(--ink)"}}>{n.title}</h4>
              {n.excerpt && <p style={{margin: 0, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5}}>{n.excerpt}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DashProfile({ user }) {
  return (
    <div className="panel">
      <h2><I.User /> Perfil de la familia</h2>
      <p className="sub">Tus datos personales y los de tus alumnos.</p>

      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16}}>
        <div className="field"><label>Nombre tutor/a</label><input defaultValue={user?.firstName || ""} /></div>
        <div className="field"><label>Apellidos</label><input defaultValue={user?.lastName || ""} /></div>
        <div className="field"><label>Email</label><input type="email" defaultValue={user?.email || ""} readOnly /></div>
        <div className="field"><label>Teléfono</label><input defaultValue="" placeholder="+34 600 000 000" /></div>
        <div className="field"><label>DNI</label><input defaultValue="" placeholder="00000000A" /></div>
        <div className="field"><label>Dirección</label><input defaultValue="" placeholder="Calle, nº · Ciudad" /></div>
      </div>

      <p style={{marginTop: 24, fontSize: 13, color: "var(--ink-3)"}}>
        Para actualizar los datos de alumnos, contacta con el club en recepción o por email.
      </p>
    </div>
  );
}

function DashSettings() {
  return (
    <div className="panel">
      <h2><I.Settings /> Ajustes</h2>
      <p className="sub">Notificaciones, idioma, seguridad y datos.</p>

      <div style={{display: "grid", gap: 12, marginTop: 18}}>
        {[
          { t: "Avisos del club por email", desc: "Eventos, convocatorias y noticias." },
          { t: "Avisos de mi actividad por email", desc: "Solo las clases que sigo." },
          { t: "Recordatorios SMS", desc: "Avisos 24h antes de cada clase." },
          { t: "Newsletter mensual", desc: "Lo más destacado del mes." },
        ].map((s, i) => (
          <label key={i} style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 14, cursor: "pointer"}}>
            <div>
              <div style={{fontWeight: 700}}>{s.t}</div>
              <div style={{fontSize: 12, color: "var(--ink-3)", marginTop: 2}}>{s.desc}</div>
            </div>
            <input type="checkbox" defaultChecked={i < 2} style={{width: 36, height: 20, accentColor: "var(--teal)"}} />
          </label>
        ))}
      </div>
    </div>
  );
}

export default function StudentDashboard({ user, onLogout, subroute = "overview" }) {
  const { go } = useRouter();
  const [view, setView] = useState(subroute);
  useEffect(() => { setView(subroute); }, [subroute]);

  const initials = `${user?.firstName?.[0] || ""}${user?.lastName?.[0] || ""}`.toUpperCase() || "?";
  const familyLabel = user?.lastName ? `Familia ${user.lastName}` : (user?.firstName || "Mi familia");

  const navItems = [
    { id: "overview", label: "Resumen", icon: <I.Dashboard /> },
    { id: "classes", label: "Mis clases", icon: <I.Calendar /> },
    { id: "attendance", label: "Asistencia", icon: <I.Check /> },
    { id: "payments", label: "Pagos y recibos", icon: <I.Wallet /> },
    { id: "wallet", label: "Mi cartera", icon: <I.CreditCard /> },
    { id: "news", label: "Avisos del club", icon: <I.Bell /> },
  ];
  const settingsItems = [
    { id: "profile", label: "Perfil", icon: <I.User /> },
    { id: "settings", label: "Ajustes", icon: <I.Settings /> },
    { id: "support", label: "Soporte", icon: <I.Shield /> },
  ];

  async function handleLogout() {
    if (onLogout) await onLogout();
    else go("/");
  }

  return (
    <main style={{paddingTop: 0}}>
      <div className="dash-layout">
        <aside className="dash-side">
          <div className="brand"><AimLogo size="sm" sub /></div>

          <nav className="dash-nav">
            <div className="heading">{familyLabel}</div>
            {navItems.map(it => (
              <button key={it.id} className={view === it.id ? "is-active" : ""} onClick={() => setView(it.id)}>
                <span className="ico">{it.icon}</span>
                <span>{it.label}</span>
                {it.id === "news" && <span className="dot" style={{background: "var(--teal)"}}/>}
              </button>
            ))}
            <div className="heading">Cuenta</div>
            {settingsItems.map(it => (
              <button key={it.id} className={view === it.id ? "is-active" : ""} onClick={() => setView(it.id)}>
                <span className="ico">{it.icon}</span>
                <span>{it.label}</span>
              </button>
            ))}
            <button onClick={handleLogout} style={{marginTop: 8}}>
              <span className="ico"><I.LogOut /></span>
              <span>Cerrar sesión</span>
            </button>
          </nav>
        </aside>

        <div className="dash-main">
          <div className="dash-topbar">
            <div>
              <p style={{margin: 0, fontSize: 13, color: "var(--ink-3)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase"}}>
                {navItems.concat(settingsItems).find(i => i.id === view)?.label || "Resumen"}
              </p>
              <h1>{view === "overview" ? `¡Hola ${user?.firstName || ""}!` : navItems.concat(settingsItems).find(i => i.id === view)?.label}</h1>
              {view === "overview" && <p style={{margin: "6px 0 0", color: "var(--ink-3)"}}>Este es el resumen de tu familia esta semana.</p>}
            </div>
            <div style={{display: "flex", gap: 12, alignItems: "center"}}>
              <button className="btn btn-icon" aria-label="Notificaciones"><I.Bell /></button>
              <div className="avatar">{initials}</div>
            </div>
          </div>

          {view === "overview" && <DashOverview go={go} setView={setView} />}
          {view === "classes" && <DashClasses />}
          {view === "attendance" && <DashAttendance />}
          {view === "payments" && <DashPayments />}
          {view === "wallet" && <DashWallet />}
          {view === "news" && <DashNews />}
          {view === "profile" && <DashProfile user={user} />}
          {view === "settings" && <DashSettings />}
          {view === "support" && <UserSupport user={user} />}
        </div>
      </div>
    </main>
  );
}
