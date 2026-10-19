import React, { useState, useEffect, createContext, useContext } from 'react';
import { I } from './Icons.jsx';
import { useRouter } from '../App.jsx';
import { fmtFechaLarga } from '../fechas.js';
import { abrirConfiguracionCookies } from './Cookies.jsx';
import { DOCS_LEGALES } from '../legal/textos.js';
import { IconoActividad } from './IconoActividad.jsx';
import { ACTIVITIES } from '../actividadesWeb.js';

// La dirección del club, y el enlace para abrirla en el mapa. En un móvil, ese
// enlace lo recoge la aplicación de mapas que tenga puesta cada uno.
export const DIRECCION = 'Urb. Terrazas de Doña Lola, Local 1, 11203 Algeciras (Cádiz)';
export const MAPA_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('AIM Education, ' + DIRECCION)}`;

// ---------- Catálogo de actividades de la web ----------
// Los textos de cada actividad. Qué actividades hay, sus grupos, edades y
// horarios NO van aquí: salen del panel (Clases y horarios → Lista de clases),
// por /api/publico/clases (#295). Una actividad nueva creada en el panel sale
// en la web sola, con su icono; si además tiene ficha aquí, con sus textos.
//
// - icon: el icono de la actividad en el panel (IconoActividad), o logo si es
//   un programa con logo propio.
// - iconAsset: el logo de color, para el mosaico de la portada.
// - programa: páginas propias que reúnen grupos de otras actividades por su
//   nombre (grupos). El Programa Camaleón, p. ej., es un grupo de Taekwon-Do.
// - enlace: la ficha lleva a otra página (el campamento tiene la suya).
// No cambiar las id: con ellas se guardan colores, eventos y la portada.
// El catálogo vive en actividadesWeb.js (también lo lee el servidor, #425).

const ACT_BY_ID = Object.fromEntries(ACTIVITIES.map(a => [a.id, a]));

// El icono de una actividad en su tarjeta: el mismo que en el panel o, si es un
// programa con logo propio, su logo.
function ActIcono({ act, icon, size = 40 }) {
  if (act?.logo) return <img src={act.logo} alt="" style={{ height: size, width: 'auto', maxWidth: size * 2.4, objectFit: 'contain', display: 'block' }} />;
  return <IconoActividad icon={icon || act?.icon} size={size} style={{ color: '#3c3c3b' }} />;
}

// ---------- Aim logo (real brand asset) ----------
function AimLogo({ size = "md", variant = "black", sub = false, auto = false, onClick }) {
  const cls = size === "sm" ? "sm" : size === "lg" ? "lg" : size === "xl" ? "xl" : "";
  const estilo = { cursor: onClick ? "pointer" : "default" };
  // 'auto' pinta las dos versiones y deja que el CSS elija según el tema: sobre
  // fondo claro la normal y sobre oscuro la blanca.
  if (auto) {
    return (
      <span className="aim-logo-auto" onClick={onClick} style={estilo}>
        <img src="/src/brand/Aim_Horizontal.png" alt="Aim Education" className={`aim-logo ${cls} solo-claro`} />
        <img src="/src/brand/Aim_White.png" alt="" aria-hidden="true" className={`aim-logo ${cls} solo-oscuro`} />
      </span>
    );
  }
  const src = (variant === "white" || sub)
    ? "/src/brand/Aim_White.png"
    : "/src/brand/Aim_Horizontal.png";
  return (
    <img
      src={src}
      alt="Aim Education"
      className={`aim-logo ${cls}`}
      onClick={onClick}
      style={estilo}
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
    if (path === '/noticias' || path.startsWith('/noticias/')) return 'news';
    if (path === '/blog' || path.startsWith('/blog/')) return 'blog';
    if (path === '/aula' || path.startsWith('/aula/')) return 'aula';
    if (path === '/tienda' || path.startsWith('/tienda/')) return 'tienda';
    if (path === '/contacto') return 'contact';
    if (path === '/conocenos') return 'about';
    if (path === '/brickslab' || path === '/biblioteca') return 'brickslab';
    return '';
  })();

  // El menú, agrupado (con el Aula y la Tienda ya no cabía todo suelto): lo de
  // cada día a la vista y lo demás en tres desplegables.
  const grupos = [
    { id: "home", label: "Inicio", href: "/" },
    { id: "actividades", label: "Actividades", activos: ["activities", "camp", "calendar"], hijos: [
      { id: "activities", label: "Todas las actividades", href: "/actividades", detalle: "Taekwondo, ballet, inglés, robótica…", icono: <I.Sparkle />, color: "#5233A8" },
      { id: "camp", label: "Campamento de verano", href: "/campamento", detalle: "De 4 a 14 años, por la mañana", icono: <I.Sun />, color: "#F5A400" },
      { id: "calendar", label: "Calendario", href: "/calendario", detalle: "Eventos, exámenes y fechas", icono: <I.Calendar />, color: "#00A6DA" },
    ] },
    // Los cursos online (#433) y el material del club (#432).
    { id: "aula", label: "Aula virtual", href: "/aula" },
    { id: "tienda", label: "Tienda", href: "/tienda" },
    { id: "novedades", label: "Novedades", activos: ["news", "blog"], hijos: [
      { id: "news", label: "Noticias", href: "/noticias", detalle: "Lo que pasa en el club", icono: <I.Newspaper />, color: "#E8559F" },
      { id: "blog", label: "Blog", href: "/blog", detalle: "Ideas y consejos del equipo", icono: <I.Bulb />, color: "#F5A400" },
    ] },
    { id: "club", label: "El club", activos: ["about", "brickslab", "contact"], hijos: [
      { id: "about", label: "Conócenos", href: "/conocenos", detalle: "Quiénes somos", icono: <I.Heart />, color: "#E8559F" },
      // Los sets de LEGO y la biblioteca del club (#291).
      { id: "brickslab", label: "Brickslab y Biblioteca", href: "/brickslab", detalle: "LEGO y libros para llevar a casa", icono: <I.Robot />, color: "#21B668" },
      { id: "contact", label: "Contacto", href: "/contacto", detalle: "Escríbenos o ven a vernos", icono: <I.Mail />, color: "#00A6DA" },
    ] },
  ];
  // El desplegable abierto con un toque (en el ordenador se abre también al pasar por encima).
  const [abierto, setAbierto] = useState(null);
  useEffect(() => { setAbierto(null); }, [path]);
  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = (e) => { if (!e.target.closest?.('.menu-grupo')) setAbierto(null); };
    const esc = (e) => { if (e.key === 'Escape') { setAbierto(null); document.activeElement?.blur?.(); } };
    document.addEventListener('click', cerrar); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', cerrar); document.removeEventListener('keydown', esc); };
  }, [abierto]);
  const ir = (href) => (e) => { e.preventDefault(); setAbierto(null); setMenuOpen(false); e.currentTarget.blur?.(); go(href); };
  const Flecha = () => <svg className="menu-flecha" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
  const Desplegable = ({ g, alDerecha, claseBoton = '' }) => (
    <div className={`menu-grupo${abierto === g.id ? ' abierto' : ''}`}>
      <button type="button" className={`menu-boton${(g.activos || []).includes(activeRoute) ? ' is-active' : ''}${claseBoton}`} aria-haspopup="true" aria-expanded={abierto === g.id}
        onClick={() => setAbierto(a => (a === g.id ? null : g.id))}>{g.label} <Flecha /></button>
      <div className={`menu-panel${alDerecha ? ' derecha' : ''}`} role="menu">
        {g.hijos.map(h => (
          <a key={h.id} role="menuitem" href={h.href} className={activeRoute === h.id ? 'is-active' : ''} onClick={h.accion || ir(h.href)} style={h.color ? { '--c': h.color } : undefined}>
            {h.icono && <i className="menu-icono" aria-hidden="true">{h.icono}</i>}
            <span className="menu-texto"><b>{h.label}</b>{h.detalle && <span>{h.detalle}</span>}</span>
          </a>
        ))}
      </div>
    </div>
  );

  return (
    <header className={`aim-header${scrolled ? ' scrolled' : ''}`}>
      <div className="row">
        <AimLogo onClick={() => go('/')} />
        <nav aria-label="Secciones">
          {grupos.map(g => (g.hijos ? <Desplegable key={g.id} g={g} /> : (
            <a key={g.id} className={activeRoute === g.id ? "is-active" : ""} onClick={ir(g.href)} href={g.href}>{g.label}</a>
          )))}
        </nav>
        <div className="actions">
          <button
            className="mobile-menu-btn"
            aria-label="Menú"
            onClick={() => setMenuOpen(o => !o)}
          >
            {menuOpen
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            }
          </button>
          {user ? (
            // Un solo botón: quien trabaja en el club (que también puede ser
            // familia) elige ahí entre el panel y su área.
            user.canAccessAdmin ? (
              <div className="menu-cuenta">
                <Desplegable alDerecha claseBoton=" btn btn-gradient" g={{ id: 'cuenta', label: 'Mi cuenta', hijos: [
                  { id: 'admin', label: 'Panel de admin', href: '/admin', detalle: 'La gestión del club', icono: <I.Dashboard />, color: "#5233A8" },
                  { id: 'familia', label: 'Mi área de familia', href: '/dashboard', detalle: 'Clases, pagos y fotos', icono: <I.Users />, color: "#21B668" },
                ] }} />
              </div>
            ) : (
              <button className="btn btn-gradient" onClick={() => go('/dashboard')}>Mi cuenta</button>
            )
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => go('/auth')}>Entrar</button>
              <button className="btn btn-gradient" onClick={() => go('/auth?mode=register')}>Registrarme</button>
            </>
          )}
        </div>
      </div>
      <nav className={`mobile-nav${menuOpen ? ' open' : ''}`} aria-label="Secciones">
        {grupos.map(g => (g.hijos ? (
          <div key={g.id} className="mobile-grupo">
            <span>{g.label}</span>
            {g.hijos.map(h => <a key={h.id} href={h.href} onClick={ir(h.href)}>{h.label}</a>)}
          </div>
        ) : <a key={g.id} href={g.href} onClick={ir(g.href)}>{g.label}</a>))}
        {user && (
          <div className="mobile-grupo">
            <span>Mi cuenta</span>
            {user.canAccessAdmin && <a href="/admin" onClick={ir('/admin')}>Panel de admin</a>}
            <a href="/dashboard" onClick={ir('/dashboard')}>{user.canAccessAdmin ? 'Mi área de familia' : 'Mi área'}</a>
          </div>
        )}
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
              <a href="https://www.instagram.com/aimeducationesp" target="_blank" rel="noopener" aria-label="Instagram">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37a4 4 0 1 1-4.74-4.66 4 4 0 0 1 4.74 4.66z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
              </a>
              <a href="https://www.facebook.com/aimeducationesp" target="_blank" rel="noopener" aria-label="Facebook">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>
              </a>
              <a href="https://www.youtube.com/@aimeducationesp" target="_blank" rel="noopener" aria-label="YouTube">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" /><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" /></svg>
              </a>
              <a href="https://wa.me/34956742216" target="_blank" rel="noopener" aria-label="WhatsApp">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1m1 0a5 5 0 0 0 5 5m0-1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1h1" /></svg>
              </a>
              <a href="https://www.linkedin.com/company/aimeducationesp/" target="_blank" rel="noopener" aria-label="LinkedIn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" /></svg>
              </a>
            </div>
          </div>
          <div>
            <h2>Plataforma</h2>
            <ul>
              <li><a onClick={(e) => { e.preventDefault(); go("/"); }} href="/">Inicio</a></li>
              <li><a onClick={(e) => { e.preventDefault(); go("/actividades"); }} href="/actividades">Actividades</a></li>
              <li><a onClick={(e) => { e.preventDefault(); go("/calendario"); }} href="/calendario">Calendario</a></li>
              <li><a onClick={(e) => { e.preventDefault(); go("/campamento"); }} href="/campamento">Campamento</a></li>
              <li><a onClick={(e) => { e.preventDefault(); go("/noticias"); }} href="/noticias">Noticias</a></li>
              <li><a onClick={(e) => { e.preventDefault(); go("/blog"); }} href="/blog">Blog</a></li>
              <li><a onClick={(e) => { e.preventDefault(); go("/conocenos"); }} href="/conocenos">Conócenos</a></li>
            </ul>
          </div>
          <div>
            <h2>Mi cuenta</h2>
            <ul>
              <li><a onClick={(e) => { e.preventDefault(); go("/auth"); }} href="/auth">Iniciar sesión</a></li>
              <li><a onClick={(e) => { e.preventDefault(); go("/auth?mode=register"); }} href="/auth?mode=register">Registrarme</a></li>
              <li><a onClick={(e) => { e.preventDefault(); go("/dashboard"); }} href="/dashboard">Dashboard</a></li>
              <li><a onClick={(e) => { e.preventDefault(); go("/dashboard/pagos"); }} href="/dashboard/pagos">Pagos</a></li>
            </ul>
          </div>
          <div>
            <h2>Contacto</h2>
            <ul>
              {/* Un enlace de maps.google sin app concreta: en el móvil lo coge
                  la aplicación de mapas que tenga puesta cada uno. */}
              <li>
                <a href={MAPA_URL} target="_blank" rel="noopener"
                   style={{ display: 'inline-flex', gap: 6, alignItems: 'flex-start' }}>
                  <I.MapPin width={14} height={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>Urb. Terrazas de Doña Lola, Local 1<br />11203 Algeciras (Cádiz)</span>
                </a>
              </li>
              <li><a href="mailto:info@aimeducation.es">info@aimeducation.es</a></li>
              <li><a href="tel:+34956742216">+34 956 742 216</a></li>
              <li><a onClick={(e) => { e.preventDefault(); go("/contacto"); }} href="/contacto">Escríbenos</a></li>
            </ul>
          </div>
          {/* Textos legales (ticket #295). */}
          <div>
            <h2>Legal</h2>
            <ul>
              {DOCS_LEGALES.map(d => (
                <li key={d.id}><a onClick={(e) => { e.preventDefault(); go(`/legal/${d.id}`); }} href={`/legal/${d.id}`}>{d.titulo}</a></li>
              ))}
              <li><button type="button" className="enlace-pie" onClick={abrirConfiguracionCookies}>Configurar cookies</button></li>
            </ul>
          </div>
        </div>

        <div className="certs" style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "center" }}>
          <a href="/actividades/camaleon" className="cert-chip" style={{ display: "inline-block", transition: "transform 0.2s", textDecoration: "none" }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
            <img src="/src/logos/camaleon.png" width={425} height={160} loading="lazy" alt="Programa Camaleón" style={{ height: "48px", width: "auto", objectFit: "contain", display: "block" }} />
          </a>
          <a href="https://www.taekwondoitf.es" target="_blank" rel="noopener noreferrer" className="cert-chip" style={{ display: "inline-block", transition: "transform 0.2s", textDecoration: "none" }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
            <img src="/src/logos/itfespana.png" width={191} height={160} loading="lazy" alt="Taekwon-Do ITF España" style={{ height: "48px", width: "auto", objectFit: "contain", display: "block" }} />
          </a>
          <a href="https://www.rad.org.es" target="_blank" rel="noopener noreferrer" className="cert-chip" style={{ display: "inline-block", transition: "transform 0.2s", textDecoration: "none" }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
            <img src="/src/logos/RADRT.png" width={160} height={160} loading="lazy" alt="Royal Academy of Dance" style={{ height: "48px", width: "auto", objectFit: "contain", display: "block" }} />
          </a>
          <a href="https://www.cambridgeenglish.org/es/" target="_blank" rel="noopener noreferrer" className="cert-chip" style={{ display: "inline-block", transition: "transform 0.2s", textDecoration: "none" }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
            <img src="/src/logos/Cambridge.png" width={288} height={160} loading="lazy" alt="Cambridge English 2025-2026" style={{ height: "48px", width: "auto", objectFit: "contain", display: "block" }} />
          </a>
          <span className="cert-chip" style={{ display: "inline-block", transition: "transform 0.2s" }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
            <img src="/src/logos/palyandkick.png" width={255} height={160} loading="lazy" alt="Play &amp; Kick" style={{ height: "48px", width: "auto", objectFit: "contain", display: "block" }} />
          </span>
          <a href="https://www.colefandalucia.com" target="_blank" rel="noopener noreferrer" className="cert-chip" style={{ display: "inline-block", transition: "transform 0.2s", textDecoration: "none" }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
            <img src="/src/logos/COLEF-Andalucia.png" width={160} height={160} loading="lazy" alt="COLEF Andalucía" style={{ height: "48px", width: "auto", objectFit: "contain", display: "block" }} />
          </a>
        </div>

        <div className="foot-bottom">
          <span>© 2026 Aim Education · AIM Deporte y Educación S.L.</span>
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
    <path d="M512 255.1c0 11.34-7.406 20.86-18.44 23.64l-171.3 42.78l-42.78 171.1C276.7 504.6 267.2 512 255.9 512s-20.84-7.406-23.62-18.44l-42.66-171.2L18.47 279.6C7.406 276.8 0 267.3 0 255.1c0-11.34 7.406-20.86 18.44-23.64l171.2-42.78l42.78-171.1C235.2 7.406 244.7 0 256 0s20.84 7.406 23.62 18.44l42.78 171.2l171.2 42.78C504.6 235.2 512 244.6 512 255.1z" />
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
  return fmtFechaLarga(iso + "T12:00:00");
}

// Selector de días del campamento agrupado por semanas.
// weeks: [{id,label,startDate,endDate,capacity,days:[{day,count}]}]
// selected: array de fechas ISO seleccionadas; onChange(nextArray)
function CampDayPicker({ weeks, selected, onChange, disabled = false, servicios = null, onServicios = null, bloquearPasados = false }) {
  const sel = new Set(selected);
  // Lo ya vivido no se toca: ni se quita ni se añade a toro pasado.
  const hoy = new Date().toISOString().slice(0, 10);
  const pasado = (day) => bloquearPasados && day < hoy;
  // servicios: { 'YYYY-MM-DD': { matinal, custodia } }. Si no se pasa onServicios,
  // el selector funciona como siempre y no enseña matinal ni custodia.
  const srv = servicios || {};
  const tiene = (day, cual) => !!srv[day]?.[cual];
  const marcarDia = (day, cual) => {
    if (disabled || !onServicios) return;
    const actual = srv[day] || {};
    onServicios({ ...srv, [day]: { ...actual, [cual]: !actual[cual] } });
  };
  // Marca o desmarca el servicio en todos los días elegidos de esa semana.
  const marcarSemana = (w, cual) => {
    if (disabled || !onServicios) return;
    const dias = w.days.map(d => d.day).filter(d => sel.has(d));
    if (!dias.length) return;
    const todos = dias.every(d => tiene(d, cual));
    const next = { ...srv };
    dias.forEach(d => { next[d] = { ...(next[d] || {}), [cual]: !todos }; });
    onServicios(next);
  };
  const toggle = (day) => {
    if (disabled || pasado(day)) return;
    const next = new Set(sel);
    next.has(day) ? next.delete(day) : next.add(day);
    onChange([...next].sort());
  };
  const toggleWeek = (w) => {
    if (disabled) return;
    const wDays = w.days.map(d => d.day).filter(d => !pasado(d));
    const freeDays = w.days.filter(d => !d.holiday && !pasado(d.day)
      && (sel.has(d.day) || w.capacity == null || d.count < w.capacity)).map(d => d.day);
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
              {w.days.map(({ day, count, holiday }) => {
                const p = campDayParts(day);
                const isSel = sel.has(day);
                const isHoliday = !!holiday && !isSel; // si quedó seleccionado antes de marcarse festivo, se permite quitarlo
                const isFull = !isSel && !isHoliday && w.capacity != null && count >= w.capacity;
                const yaPaso = pasado(day);
                const isBlocked = isHoliday || isFull || yaPaso;
                return (
                  <button key={day} type="button"
                    onClick={() => !isBlocked && toggle(day)}
                    disabled={disabled || isBlocked}
                    title={yaPaso ? (isSel ? "Ya asistió: no se puede quitar" : "Este día ya ha pasado")
                      : isHoliday ? "Festivo — campamento cerrado"
                      : isFull ? "Sin plazas libres" : `${count}${w.capacity ? `/${w.capacity}` : ""} apuntados`}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      minWidth: 52, padding: "8px 10px", borderRadius: 12,
                      border: `1.5px ${isHoliday ? "dashed" : "solid"} ${isSel ? "var(--teal)" : isHoliday ? "color-mix(in oklab, var(--orange) 45%, var(--line))" : "var(--line)"}`,
                      background: isSel ? "var(--teal)" : isHoliday ? "color-mix(in oklab, var(--orange) 7%, var(--bg-2))" : "var(--bg-2)",
                      color: isSel ? "white" : isBlocked ? "var(--ink-3)" : "var(--ink)",
                      opacity: yaPaso ? (isSel ? .6 : .35) : isBlocked ? .55 : 1,
                      cursor: disabled || isBlocked ? "default" : "pointer",
                      fontFamily: "inherit",
                      transition: "background .15s ease, border-color .15s ease",
                    }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", opacity: .8 }}>{p.dow}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--font-display)", lineHeight: 1, textDecoration: isHoliday ? "line-through" : "none" }}>{p.num}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, opacity: .75, color: isHoliday ? "var(--orange)" : undefined }}>
                      {yaPaso ? "Pasado" : isHoliday ? "Fiesta" : isFull ? "Completo" : `${count}${w.capacity ? `/${w.capacity}` : ""}`}
                    </span>
                  </button>
                );
              })}
            </div>
            {onServicios && !disabled && (() => {
              const diasSem = w.days.map(d => d.day).filter(d => sel.has(d));
              if (!diasSem.length) return null;
              return (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--line)" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>Servicios:</span>
                  {[["matinal", "Matinal"], ["custodia", "Custodia"]].map(([k, l]) => {
                    const n = diasSem.filter(d => tiene(d, k)).length;
                    return (
                      <button key={k} type="button" onClick={() => marcarSemana(w, k)}
                        title={`Marcar o quitar ${l.toLowerCase()} en todos los días elegidos de esta semana`}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                          border: `1px solid ${n ? "var(--purple)" : "var(--line)"}`,
                          background: n === diasSem.length ? "var(--purple)" : n ? "color-mix(in oklab, var(--purple) 14%, var(--bg-2))" : "var(--bg-2)",
                          color: n === diasSem.length ? "white" : n ? "var(--purple)" : "var(--ink-3)",
                        }}>
                        {l}{n ? ` · ${n}/${diasSem.length}` : ""}
                      </button>
                    );
                  })}
                  <div style={{ width: "100%", display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {diasSem.map(d => {
                      const p = campDayParts(d);
                      return (
                        <div key={d} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                          <span style={{ color: "var(--ink-3)", fontWeight: 700, width: 20 }}>{p.num}</span>
                          {[["matinal", "M"], ["custodia", "C"]].map(([k, letra]) => (
                            <button key={k} type="button" onClick={() => marcarDia(d, k)}
                              title={`${k === "matinal" ? "Matinal" : "Custodia"} el ${p.num} ${p.month}`}
                              style={{
                                width: 20, height: 20, borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                                fontSize: 10, fontWeight: 800, lineHeight: 1, padding: 0,
                                border: `1px solid ${tiene(d, k) ? "var(--purple)" : "var(--line)"}`,
                                background: tiene(d, k) ? "var(--purple)" : "var(--bg-2)",
                                color: tiene(d, k) ? "white" : "var(--ink-3)",
                              }}>{letra}</button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

function MagicText({ children }) {
  return (
    <span className="magic">
      <span className="magic-star" style={{ "--star-left": "8%", "--star-top": "-40%", "--delay": "0ms" }}>{STAR_SVG}</span>
      <span className="magic-star" style={{ "--star-left": "82%", "--star-top": "-28%", "--delay": "800ms" }}>{STAR_SVG}</span>
      <span className="magic-star" style={{ "--star-left": "48%", "--star-top": "82%", "--delay": "1600ms" }}>{STAR_SVG}</span>
      <span className="magic-text">{children}</span>
    </span>
  );
}

export { AimLogo, AimHeader, AimFooter, ACTIVITIES, ACT_BY_ID, ActIcono, ActIcon, Placeholder, MagicText, CampDayPicker, campDayParts, campFmtLong };

// Como se llama cada medio de pago para las personas. 'tpv_online' es el TPV
// virtual del banco: la familia paga por la web, no por el datafono.
const MEDIOS = {
  tpv_online: 'Tarjeta (web)', tarjeta: 'Tarjeta', bizum: 'Bizum',
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  // El Pase Explorador descontado de la mensualidad (#352): no es dinero.
  compensacion: 'Pase Explorador descontado',
};
export const nombreMedioPago = (m) => MEDIOS[m] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : '');

// ── Cumpleaños ──────────────────────────────────────────────────────────────
// Idea del club: el día que alguien cumple años, en los listados con foto/perfil
// (usuarios, pasar lista...) le sale una coronita en la cabeza y su nombre en
// dorado, para felicitarle de un vistazo.
export const COLOR_CUMPLE = '#E7B10A'; // dorado

// ¿Hoy es el cumpleaños de esta persona? Compara día y mes (da igual el año).
// La fecha se guarda como 'YYYY-MM-DD' sin hora, así que se lee en UTC para que
// no se corra un día según la zona horaria del navegador.
export function esCumpleHoy(birthday) {
  if (!birthday) return false;
  const d = new Date(birthday);
  if (isNaN(d.getTime())) return false;
  const hoy = new Date();
  return d.getUTCMonth() === hoy.getMonth() && d.getUTCDate() === hoy.getDate();
}

// Coronita para poner sobre un avatar. Su contenedor debe ser position:relative.
export function CoronaCumple({ size = 16, title = '¡Hoy es su cumpleaños!' }) {
  return (
    <span title={title} aria-label={title} style={{
      position: 'absolute', top: -Math.round(size * 0.6), left: '50%',
      transform: 'translateX(-50%) rotate(14deg)', fontSize: size, lineHeight: 1,
      pointerEvents: 'none', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.25))', zIndex: 2,
    }}>👑</span>
  );
}

// Buscar por el nombre a medias (ticket #254): "Juan Manuel Borrego" encuentra a
// "Juan Manuel Marín Borrego". Cada palabra tecleada tiene que aparecer en algún
// sitio del texto, en cualquier orden y sin que estorben las tildes.
export const textoPlano = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function coincideBusqueda(busqueda, ...textos) {
  const palabras = textoPlano(busqueda).trim().split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const donde = textoPlano(textos.filter(Boolean).join(' '));
  return palabras.every(p => donde.includes(p));
}
