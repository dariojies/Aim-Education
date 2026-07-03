import React, { useState, useEffect, createContext, useContext } from 'react';
import { I } from './Icons.jsx';
import { useRouter } from '../App.jsx';

// ---------- Activity catalog (the source of truth) ----------
const ACTIVITIES = [
  { id: "taekwondo", name: "Taekwondo", color: "#21B668", className: "act-taekwondo", icon: "Glove",
    iconAsset: "/src/submarcas/simple/ArtesMarciales.png",
    fullAsset: "/src/submarcas/ArtesMarciales.png",
    tag: "Artes marciales", lede: "Despierta tu fuerza interior y supera tus límites.",
    long: "Disciplina coreana que combina técnica, valores y trabajo físico. Trabajamos respeto, tolerancia y superación en cada clase.",
    ages: "Desde 4 años · ITF España",
    levels: [
      { day: "Lunes y Miércoles", time: "17:00 – 18:00", group: "Cinturones blancos · 4 a 7 años", level: "Iniciación" },
      { day: "Lunes y Miércoles", time: "18:00 – 19:00", group: "Cinturones de color · 8 a 12 años", level: "Intermedio" },
      { day: "Martes y Jueves", time: "19:00 – 20:30", group: "Cinturones avanzados y adultos", level: "Avanzado" },
      { day: "Sábado", time: "10:00 – 12:00", group: "Equipo de competición", level: "Competición" },
    ] },
  { id: "ballet", name: "Ballet Clásico", color: "#FF99D3", className: "act-ballet", icon: "Slipper",
    iconAsset: "/src/submarcas/simple/Ballet.png",
    fullAsset: "/src/submarcas/Ballet.png",
    tag: "Danza", lede: "Déjate llevar por la magia de la danza y la precisión.",
    long: "Programa oficial de la Royal Academy of Dance — formación técnica, musical y artística con exámenes oficiales anuales.",
    ages: "Desde 3 años · Royal Academy of Dance",
    levels: [
      { day: "Lunes y Miércoles", time: "17:00 – 18:00", group: "Pre-primary · 3 a 5 años", level: "Iniciación" },
      { day: "Martes y Jueves", time: "17:00 – 18:00", group: "Primary · 6 a 8 años", level: "Inicial" },
      { day: "Martes y Jueves", time: "18:00 – 19:30", group: "Grades 1-3 · 9 a 12 años", level: "Intermedio" },
      { day: "Viernes", time: "18:00 – 20:00", group: "Vocational · 13+", level: "Avanzado" },
    ] },
  { id: "baile", name: "Baile Urbano", color: "#AF99FF", className: "act-baile", icon: "Spark",
    iconAsset: "/src/submarcas/simple/BaileModerno.png",
    fullAsset: "/src/submarcas/BaileModerno.png",
    tag: "Danza", lede: "Exprésate con cada movimiento.",
    long: "Estilos urbanos y modernos — desde commercial dance hasta hip-hop. Coreografías que se presentan en el festival anual.",
    ages: "Desde 7 años",
    levels: [
      { day: "Miércoles", time: "18:00 – 19:30", group: "Junior crew · 7 a 11 años", level: "Iniciación" },
      { day: "Viernes", time: "18:30 – 20:00", group: "Teens crew · 12 a 17 años", level: "Intermedio" },
    ] },
  { id: "ingles", name: "Inglés", color: "#00BBF4", className: "act-ingles", icon: "Globe",
    iconAsset: "/src/submarcas/simple/English.png",
    fullAsset: "/src/submarcas/English.png",
    tag: "Idiomas", lede: "Amplía tus horizontes y comunica tus sueños al mundo.",
    long: "Academia preparadora oficial de Cambridge English Qualifications. Grupos reducidos, exámenes oficiales y materiales originales.",
    ages: "Desde 5 años · Cambridge Qualifications 2025-2026",
    levels: [
      { day: "Lunes y Miércoles", time: "16:30 – 17:30", group: "Starters · 5 a 7 años", level: "A1" },
      { day: "Martes y Jueves", time: "16:30 – 17:30", group: "Movers / Flyers · 8 a 11 años", level: "A2" },
      { day: "Martes y Jueves", time: "18:30 – 20:00", group: "B1 Preliminary · 12 a 16 años", level: "B1" },
      { day: "Viernes", time: "19:00 – 21:00", group: "B2 First / C1 Advanced", level: "B2 / C1" },
    ] },
  { id: "robotica", name: "Robótica", color: "#FFD526", className: "act-robotica", icon: "Robot",
    iconAsset: "/src/submarcas/simple/Robotica.png",
    fullAsset: "/src/submarcas/Robotica.png",
    tag: "STEAM", lede: "Construye el futuro hoy con nuestras clases de tecnología.",
    long: "Construcción, programación y pensamiento computacional con LEGO Education y mBot. Forma parte del Programa Camaleón.",
    ages: "Desde 6 años · Programa Camaleón",
    levels: [
      { day: "Lunes", time: "17:30 – 19:00", group: "Junior · 6 a 8 años", level: "Iniciación" },
      { day: "Miércoles", time: "17:30 – 19:00", group: "Builders · 9 a 11 años", level: "Intermedio" },
      { day: "Viernes", time: "17:00 – 19:00", group: "Coders · 12 a 16 años", level: "Avanzado" },
    ] },
  { id: "camaleon", name: "Programa Camaleón", color: "#25D8BA", className: "act-camaleon", icon: "Star",
    iconAsset: "/src/submarcas/simple/Camaleon.png",
    fullAsset: "/src/submarcas/Camaleon.png",
    tag: "Artes marciales", lede: "Aprende a aprender. Nuestra metodología educativa.",
    long: "Programa transversal que combina pensamiento computacional, creatividad y trabajo cooperativo. Es el hilo conductor de las actividades STEAM del club.",
    ages: "Integrado en robótica e inglés",
    levels: [
      { day: "Integrado", time: "—", group: "Aplicado en clases de robótica", level: "Metodología" },
      { day: "Talleres trimestrales", time: "Sábados puntuales", group: "Familias + alumnos", level: "Abierto" },
    ] },
  { id: "funcional", name: "Entrenamiento Funcional", color: "#FF4F15", className: "act-funcional", icon: "Dumbbell",
    iconAsset: "/src/submarcas/simple/Entrenamiento.png",
    fullAsset: "/src/submarcas/Entrenamiento.png",
    tag: "Deporte", lede: "Activa tu cuerpo y supera tus metas con nuestro funcional.",
    long: "Entrenamiento integral para adultos: fuerza, movilidad, cardio y trabajo de core en sesiones dinámicas de 50 minutos.",
    ages: "Adultos (18+)",
    levels: [
      { day: "L-M-V", time: "07:30 – 08:30", group: "Funcional matinal", level: "Todos los niveles" },
      { day: "L-M-V", time: "19:00 – 20:00", group: "Funcional tarde", level: "Todos los niveles" },
      { day: "Sábado", time: "10:00 – 11:30", group: "Bootcamp", level: "Avanzado" },
    ] },
  { id: "pilates", name: "Pilates", color: "#BFD300", className: "act-pilates", icon: "Sun2",
    iconAsset: "/src/submarcas/simple/Pilates.png",
    fullAsset: "/src/submarcas/Pilates.png",
    tag: "Salud", lede: "Fortalece cuerpo y mente desde la base.",
    long: "Sesiones de pilates suelo enfocadas en postura, flexibilidad y core. Grupos reducidos de máximo 8 personas.",
    ages: "Adultos (18+)",
    levels: [
      { day: "Lunes y Miércoles", time: "09:00 – 10:00", group: "Pilates suelo", level: "Todos los niveles" },
      { day: "Martes y Jueves", time: "10:30 – 11:30", group: "Pilates terapéutico", level: "Lesiones / mayores" },
    ] },
  { id: "pintura", name: "Pintura", color: "#5233A8", className: "act-pintura", icon: "Brush",
    iconAsset: "/src/submarcas/simple/Pintura.png",
    fullAsset: "/src/submarcas/Pintura.png",
    tag: "Arte", lede: "Da vida a tus ideas en cada trazo. Descubre tu talento.",
    long: "Taller de expresión artística — acuarela, óleo, técnicas mixtas y dibujo. Adaptado a la edad y nivel del alumno.",
    ages: "Desde 6 años",
    levels: [
      { day: "Martes", time: "17:00 – 18:30", group: "Pequeños creadores · 6 a 9 años", level: "Iniciación" },
      { day: "Jueves", time: "18:00 – 19:30", group: "Estudio joven · 10 a 16 años", level: "Intermedio" },
      { day: "Viernes", time: "19:00 – 21:00", group: "Atelier adultos", level: "Libre" },
    ] },
];

const ACT_BY_ID = Object.fromEntries(ACTIVITIES.map(a => [a.id, a]));

// ---------- Aim logo (real brand asset) ----------
function AimLogo({ size = "md", variant = "black", sub = false, onClick }) {
  const cls = size === "sm" ? "sm" : size === "lg" ? "lg" : size === "xl" ? "xl" : "";
  const src = (variant === "white" || sub)
    ? "/src/brand/Aim_White.png"
    : "/src/brand/Aim_Horizontal.png";
  return (
    <img
      src={src}
      alt="Aim Education"
      className={`aim-logo ${cls}`}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    />
  );
}

// ---------- Top header ----------
function AimHeader({ route } = {}) {
  const { path, go, user } = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on resize above breakpoint or route change
  useEffect(() => { setMenuOpen(false); }, [path]);
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 1024) setMenuOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Determine active route from path if route prop not provided
  const activeRoute = route || (() => {
    if (path === '/' || path === '') return 'home';
    if (path.startsWith('/actividades')) return 'activities';
    if (path === '/campamento') return 'camp';
    if (path === '/calendario') return 'calendar';
    if (path === '/noticias') return 'news';
    return '';
  })();

  const links = [
    { id: "home", label: "Inicio", href: "/" },
    { id: "activities", label: "Actividades", href: "/actividades" },
    { id: "camp", label: "Campamento", href: "/campamento" },
    { id: "calendar", label: "Calendario", href: "/calendario" },
    { id: "news", label: "Noticias", href: "/noticias" },
  ];

  return (
    <header className={`aim-header${scrolled ? ' scrolled' : ''}`}>
      <div className="row">
        <AimLogo onClick={() => go('/')} />
        <nav>
          {links.map(l => (
            <a key={l.id}
               className={activeRoute === l.id ? "is-active" : ""}
               onClick={(e) => { e.preventDefault(); go(l.href); setMenuOpen(false); }}
               href={l.href}>{l.label}</a>
          ))}
        </nav>
        <div className="actions">
          <button
            className="mobile-menu-btn"
            aria-label="Menú"
            onClick={() => setMenuOpen(o => !o)}
          >
            {menuOpen
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            }
          </button>
          {user ? (
            <button className="btn btn-gradient" onClick={() => go(user.canAccessAdmin ? '/admin' : '/dashboard')}>
              {user.canAccessAdmin ? 'Panel Admin' : 'Mi cuenta'}
            </button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => go('/auth')}>Iniciar sesión</button>
              <button className="btn btn-gradient" onClick={() => go('/auth?mode=register')}>Registrarme</button>
            </>
          )}
        </div>
      </div>
      <nav className={`mobile-nav${menuOpen ? ' open' : ''}`}>
        {links.map(l => (
          <a key={l.id} href={l.href} onClick={(e) => { e.preventDefault(); go(l.href); setMenuOpen(false); }}>{l.label}</a>
        ))}
      </nav>
    </header>
  );
}

// ---------- Footer ----------
function AimFooter() {
  const { go } = useRouter();
  return (
    <footer className="aim-footer">
      <div className="container">
        <div className="foot-grid">
          <div className="brand">
            <AimLogo variant="white" />
            <p>Formación integral en valores: innovación, excelencia y pasión. Una academia, mil maneras de aprender.</p>
            <div className="social-row">
              <a href="https://www.instagram.com/aimeducation.es" target="_blank" rel="noopener" aria-label="Instagram">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37a4 4 0 1 1-4.74-4.66 4 4 0 0 1 4.74 4.66z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
              </a>
              <a href="https://www.facebook.com/aimeducation.es" target="_blank" rel="noopener" aria-label="Facebook">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
              </a>
              <a href="https://www.youtube.com/@aimeducationesp" target="_blank" rel="noopener" aria-label="YouTube">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>
              </a>
              <a href="https://wa.me/34956742216" target="_blank" rel="noopener" aria-label="WhatsApp">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1m1 0a5 5 0 0 0 5 5m0-1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1h1"/></svg>
              </a>
            </div>
          </div>
          <div>
            <h5>Plataforma</h5>
            <ul>
              <li><a onClick={(e)=>{e.preventDefault(); go("/");}} href="/">Inicio</a></li>
              <li><a onClick={(e)=>{e.preventDefault(); go("/actividades");}} href="/actividades">Actividades</a></li>
              <li><a onClick={(e)=>{e.preventDefault(); go("/calendario");}} href="/calendario">Calendario</a></li>
              <li><a onClick={(e)=>{e.preventDefault(); go("/campamento");}} href="/campamento">Campamento</a></li>
              <li><a onClick={(e)=>{e.preventDefault(); go("/noticias");}} href="/noticias">Noticias</a></li>
            </ul>
          </div>
          <div>
            <h5>Mi cuenta</h5>
            <ul>
              <li><a onClick={(e)=>{e.preventDefault(); go("/auth");}} href="/auth">Iniciar sesión</a></li>
              <li><a onClick={(e)=>{e.preventDefault(); go("/auth?mode=register");}} href="/auth?mode=register">Registrarme</a></li>
              <li><a onClick={(e)=>{e.preventDefault(); go("/dashboard");}} href="/dashboard">Dashboard</a></li>
              <li><a onClick={(e)=>{e.preventDefault(); go("/dashboard/pagos");}} href="/dashboard/pagos">Pagos</a></li>
            </ul>
          </div>
          <div>
            <h5>Contacto</h5>
            <ul>
              <li>Urb. Terrazas de Doña Lola, Local 1</li>
              <li>11203 Algeciras (Cádiz)</li>
              <li><a href="mailto:info@aimeducation.es">info@aimeducation.es</a></li>
              <li><a href="tel:+34956742216">+34 956 742 216</a></li>
            </ul>
          </div>
        </div>

        <div className="certs">
          <span className="cert-chip">Programa Camaleón</span>
          <span className="cert-chip">Taekwon-Do ITF España</span>
          <span className="cert-chip">Royal Academy of Dance</span>
          <span className="cert-chip">Cambridge English 2025-2026</span>
          <span className="cert-chip">Play &amp; Kick</span>
        </div>

        <div className="foot-bottom">
          <span>© 2026 Aim Education · Darío Francisco Jiménez España</span>
          <span>Algeciras · Innovación, Excelencia y Pasión</span>
        </div>
      </div>
    </footer>
  );
}

// ---------- Activity icon — uses brand submarca asset ----------
function ActIcon({ act, name, size, ...rest }) {
  const a = act ? (typeof act === "string" ? ACT_BY_ID[act] : act) : null;
  if (a && a.iconAsset) {
    return (
      <img
        src={a.iconAsset}
        alt={a.name}
        style={{ width: size || 56, height: size || 56, display: "block", objectFit: "contain", borderRadius: 12, ...(rest.style || {}) }}
      />
    );
  }
  const Cmp = I[name] || I.Star;
  return <Cmp {...rest} />;
}

// ---------- Decorative placeholder ----------
function Placeholder({ aspect = "4/3", label = "imagen", tone = "var(--ink-3)" }) {
  return (
    <div style={{
      aspectRatio: aspect,
      borderRadius: 14,
      background:
        `repeating-linear-gradient(45deg, color-mix(in oklab, ${tone} 8%, var(--bg-2)) 0 8px, color-mix(in oklab, ${tone} 18%, var(--bg-2)) 8px 16px)`,
      border: `1px dashed color-mix(in oklab, ${tone} 40%, transparent)`,
      display: "grid",
      placeItems: "center",
      color: tone,
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: ".05em",
    }}>
      <span style={{
        background: "var(--bg-2)", padding: "4px 10px", borderRadius: 6,
        border: `1px solid color-mix(in oklab, ${tone} 25%, transparent)`,
      }}>
        {label}
      </span>
    </div>
  );
}

const STAR_SVG = (
  <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <path d="M512 255.1c0 11.34-7.406 20.86-18.44 23.64l-171.3 42.78l-42.78 171.1C276.7 504.6 267.2 512 255.9 512s-20.84-7.406-23.62-18.44l-42.66-171.2L18.47 279.6C7.406 276.8 0 267.3 0 255.1c0-11.34 7.406-20.86 18.44-23.64l171.2-42.78l42.78-171.1C235.2 7.406 244.7 0 256 0s20.84 7.406 23.62 18.44l42.78 171.2l171.2 42.78C504.6 235.2 512 244.6 512 255.1z"/>
  </svg>
);

// ---------- Campamento: helpers de fechas + selector de días ----------
const CAMP_DOW = ["D", "L", "M", "X", "J", "V", "S"];
const CAMP_MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function campDayParts(iso) {
  const d = new Date(iso + "T12:00:00");
  return { dow: CAMP_DOW[d.getDay()], num: d.getDate(), month: CAMP_MONTHS[d.getMonth()] };
}

function campFmtLong(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// Selector de días del campamento agrupado por semanas.
// weeks: [{id,label,startDate,endDate,capacity,days:[{day,count}]}]
// selected: array de fechas ISO seleccionadas; onChange(nextArray)
function CampDayPicker({ weeks, selected, onChange, disabled = false }) {
  const sel = new Set(selected);
  const toggle = (day) => {
    if (disabled) return;
    const next = new Set(sel);
    next.has(day) ? next.delete(day) : next.add(day);
    onChange([...next].sort());
  };
  const toggleWeek = (w) => {
    if (disabled) return;
    const wDays = w.days.map(d => d.day);
    const freeDays = w.days.filter(d => sel.has(d.day) || w.capacity == null || d.count < w.capacity).map(d => d.day);
    const allSelected = freeDays.length > 0 && freeDays.every(d => sel.has(d));
    const next = new Set(sel);
    if (allSelected) wDays.forEach(d => next.delete(d));
    else freeDays.forEach(d => next.add(d));
    onChange([...next].sort());
  };
  if (!weeks.length) {
    return <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>El campamento aún no tiene fechas publicadas.</p>;
  }
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {weeks.map(w => {
        const startP = campDayParts(w.startDate);
        const endP = campDayParts(w.endDate);
        return (
          <div key={w.id} style={{ background: "var(--bg-3)", border: "1px solid var(--line-2)", borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>
                {w.label}
                <span style={{ fontWeight: 600, color: "var(--ink-3)", marginLeft: 8, fontSize: 12 }}>
                  {startP.num} {startP.month} – {endP.num} {endP.month}
                </span>
              </div>
              {!disabled && (
                <button type="button" onClick={() => toggleWeek(w)}
                  style={{ fontSize: 11, fontWeight: 700, color: "var(--purple)", background: "none", border: "1px solid var(--line)", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>
                  Semana completa
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {w.days.map(({ day, count }) => {
                const p = campDayParts(day);
                const isSel = sel.has(day);
                const isFull = !isSel && w.capacity != null && count >= w.capacity;
                return (
                  <button key={day} type="button"
                    onClick={() => !isFull && toggle(day)}
                    disabled={disabled || isFull}
                    title={isFull ? "Sin plazas libres" : `${count}${w.capacity ? `/${w.capacity}` : ""} apuntados`}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      minWidth: 52, padding: "8px 10px", borderRadius: 12,
                      border: `1.5px solid ${isSel ? "var(--teal)" : "var(--line)"}`,
                      background: isSel ? "var(--teal)" : "var(--bg-2)",
                      color: isSel ? "white" : isFull ? "var(--ink-3)" : "var(--ink)",
                      opacity: isFull ? .5 : 1,
                      cursor: disabled || isFull ? "default" : "pointer",
                      fontFamily: "inherit",
                      transition: "background .15s ease, border-color .15s ease",
                    }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", opacity: .8 }}>{p.dow}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--font-display)", lineHeight: 1 }}>{p.num}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, opacity: .75 }}>{isFull ? "Completo" : `${count}${w.capacity ? `/${w.capacity}` : ""}`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MagicText({ children }) {
  return (
    <span className="magic">
      <span className="magic-star" style={{ "--star-left": "8%",  "--star-top": "-40%", "--delay": "0ms" }}>{STAR_SVG}</span>
      <span className="magic-star" style={{ "--star-left": "82%", "--star-top": "-28%", "--delay": "800ms" }}>{STAR_SVG}</span>
      <span className="magic-star" style={{ "--star-left": "48%", "--star-top": "82%",  "--delay": "1600ms" }}>{STAR_SVG}</span>
      <span className="magic-text">{children}</span>
    </span>
  );
}

export { AimLogo, AimHeader, AimFooter, ACTIVITIES, ACT_BY_ID, ActIcon, Placeholder, MagicText, CampDayPicker, campDayParts, campFmtLong };
