import React, { useState, useEffect } from 'react';
import { useRouter } from '../App';

export const ACTIVITIES = [
  {
    id: 'taekwondo', name: 'Taekwondo', sub: 'Artes Marciales',
    color: '#21B668', icon: '/src/submarcas/ArtesMarciales.png',
    desc: 'Despierta tu fuerza interior y supera tus límites. Disciplina, valores y trabajo físico en cada clase.',
    long: 'Nuestro programa de Taekwondo sigue la metodología oficial de la Federación de Taekwondo ITF España. Clases estructuradas por niveles y rangos, con posibilidad de competición y exámenes de cinturón.',
    ages: '4 – Adultos', price: 'Desde 40€/mes',
    schedule: [{ day: 'Lunes y Miércoles', time: '17:00–18:00', group: 'Infantil (4–8)' }, { day: 'Martes y Jueves', time: '18:00–19:00', group: 'Junior (9–14)' }, { day: 'Lunes, Mié y Vie', time: '19:30–20:30', group: 'Adultos' }],
    learn: ['Técnica oficial ITF', 'Valores y disciplina', 'Competición opcional', 'Cinturones oficiales'],
    cls: 'act-taekwondo',
  },
  {
    id: 'ballet', name: 'Ballet Clásico', sub: 'Danza Clásica',
    color: '#FF99D3', icon: '/src/submarcas/Ballet.png',
    desc: 'Programa oficial Royal Academy of Dance. Formación técnica, musical y artística con exámenes oficiales.',
    long: 'Academia preparadora oficial de la Royal Academy of Dance (RAD). Formamos a nuestros alumnos en técnica de ballet, expresión artística y musicalidad, con opción a exámenes oficiales de nivel internacional.',
    ages: '3 – Adultos', price: 'Desde 40€/mes',
    schedule: [{ day: 'Martes', time: '16:30–17:30', group: 'Pre-Ballet (3–5)' }, { day: 'Martes y Jueves', time: '17:30–18:30', group: 'Ballet I–II' }, { day: 'Martes y Jueves', time: '18:30–19:30', group: 'Ballet III–IV' }],
    learn: ['Técnica RAD oficial', 'Expresión artística', 'Exámenes internacionales', 'Festival anual de Ballet'],
    cls: 'act-ballet',
  },
  {
    id: 'ingles', name: 'Inglés', sub: 'Academia Cambridge',
    color: '#00BBF4', icon: '/src/submarcas/English.png',
    desc: 'Academia preparadora oficial de Cambridge English Qualifications. Grupos reducidos y exámenes oficiales.',
    long: 'Centro preparador oficial de Cambridge English. Trabajamos con los programas Cambridge Young Learners y Cambridge Main Suite para preparar a nuestros alumnos en los exámenes internacionales de inglés.',
    ages: '3 – Adultos', price: 'Desde 45€/mes',
    schedule: [{ day: 'Lunes y Miércoles', time: '16:00–17:00', group: 'Starters (3–6)' }, { day: 'Martes y Jueves', time: '17:00–18:00', group: 'Movers / Flyers' }, { day: 'Martes y Jueves', time: '18:00–19:00', group: 'KET / PET' }],
    learn: ['Cambridge Qualifications', 'Speaking natural', 'Grupos pequeños', 'Exámenes oficiales'],
    cls: 'act-ingles',
  },
  {
    id: 'robotica', name: 'Robótica', sub: 'Programa Camaleón',
    color: '#FFD526', icon: '/src/submarcas/Robotica.png',
    desc: 'Construcción, programación y pensamiento computacional con LEGO Education y mBot.',
    long: 'A través del Programa Camaleón trabajamos la robótica educativa con LEGO Education, mBot y Scratch. Los alumnos aprenden a construir, programar y resolver retos tecnológicos de forma colaborativa.',
    ages: '5 – 14 años', price: 'Desde 45€/mes',
    schedule: [{ day: 'Lunes', time: '17:00–18:00', group: 'Iniciación (5–8)' }, { day: 'Miércoles', time: '17:00–18:00', group: 'Avanzado (9–14)' }],
    learn: ['LEGO Education', 'Scratch y mBot', 'Pensamiento computacional', 'Proyectos y competiciones'],
    cls: 'act-robotica',
  },
  {
    id: 'baile', name: 'Baile Urbano', sub: 'Danza Moderna',
    color: '#AF99FF', icon: '/src/submarcas/BaileModerno.png',
    desc: 'Estilos urbanos y modernos — commercial dance, hip-hop. Coreografías que brillan en el festival anual.',
    long: 'Aprende los estilos más populares del momento: commercial dance, hip-hop, street jazz. Nuestros profesores te guían en el desarrollo de la técnica, la expresión corporal y la interpretación.',
    ages: '6 – Adultos', price: 'Desde 40€/mes',
    schedule: [{ day: 'Lunes', time: '17:30–18:30', group: 'Infantil (6–10)' }, { day: 'Miércoles', time: '18:00–19:00', group: 'Junior (11–16)' }, { day: 'Viernes', time: '19:00–20:00', group: 'Adultos' }],
    learn: ['Hip-hop y Urban', 'Commercial dance', 'Coreografías', 'Festival anual'],
    cls: 'act-baile',
  },
  {
    id: 'funcional', name: 'Entrenamiento Funcional', sub: 'Fitness Adultos',
    color: '#FF4F15', icon: '/src/submarcas/Entrenamiento.png',
    desc: 'Fuerza, movilidad, cardio y trabajo de core en sesiones dinámicas de 50 minutos para adultos.',
    long: 'Sesiones de entrenamiento funcional diseñadas para adultos de todos los niveles. Trabajo de fuerza, resistencia, movilidad y cardiovascular en un formato dinámico que se adapta a tu estado físico.',
    ages: '16 – Adultos', price: 'Desde 40€/mes',
    schedule: [{ day: 'Lunes, Mié y Vie', time: '08:00–09:00', group: 'Mañana' }, { day: 'Martes y Jueves', time: '20:00–21:00', group: 'Tarde' }],
    learn: ['Entrenamiento de fuerza', 'Cardio HIIT', 'Movilidad y core', 'Plan personalizado'],
    cls: 'act-funcional',
  },
  {
    id: 'camaleon', name: 'Camaleón', sub: 'Innovación Educativa',
    color: '#25D8BA', icon: '/src/submarcas/Camaleon.png',
    desc: 'Programa multidisciplinar que combina robótica, arte y ciencia para mentes inquietas.',
    long: 'El Programa Camaleón es nuestra propuesta más innovadora. Combina robótica, artes plásticas, ciencias y pensamiento creativo en un programa multidisciplinar único que desarrolla el potencial de cada alumno.',
    ages: '4 – 12 años', price: 'Desde 50€/mes',
    schedule: [{ day: 'Miércoles', time: '16:00–17:30', group: 'Camaleón Junior (4–7)' }, { day: 'Viernes', time: '16:00–17:30', group: 'Camaleón Senior (8–12)' }],
    learn: ['Pensamiento creativo', 'Arte y robótica', 'Ciencias aplicadas', 'Proyectos únicos'],
    cls: 'act-camaleon',
  },
  {
    id: 'pilates', name: 'Pilates', sub: 'Bienestar Adultos',
    color: '#BFD300', icon: '/src/submarcas/Pilates.png',
    desc: 'Método Pilates para adultos: fortalece el core, mejora la postura y gana flexibilidad.',
    long: 'Clases de Pilates para adultos siguiendo el método original. Trabajamos la conciencia corporal, el control del movimiento, la respiración y el fortalecimiento profundo del cuerpo.',
    ages: '16 – Adultos', price: 'Desde 40€/mes',
    schedule: [{ day: 'Martes y Jueves', time: '09:00–10:00', group: 'Mañana' }, { day: 'Lunes y Miércoles', time: '20:30–21:30', group: 'Tarde-Noche' }],
    learn: ['Método Pilates', 'Control postural', 'Core y respiración', 'Flexibilidad y tono'],
    cls: 'act-pilates',
  },
  {
    id: 'pintura', name: 'Pintura y Creatividad', sub: 'Artes Plásticas',
    color: '#5233A8', icon: '/src/submarcas/Pintura.png',
    desc: 'Taller de artes plásticas para todas las edades. Técnicas de pintura, dibujo y manualidades.',
    long: 'Nuestro taller de artes plásticas es un espacio de expresión libre y aprendizaje técnico. Trabajamos diferentes técnicas pictóricas, dibujo artístico y manualidades creativas adaptadas a cada grupo de edad.',
    ages: '4 – Adultos', price: 'Desde 35€/mes',
    schedule: [{ day: 'Martes', time: '17:00–18:00', group: 'Infantil (4–10)' }, { day: 'Jueves', time: '18:30–20:00', group: 'Adultos' }],
    learn: ['Técnicas pictóricas', 'Dibujo artístico', 'Manualidades', 'Exposiciones anuales'],
    cls: 'act-pintura',
  },
];

export const ACT_BY_ID = Object.fromEntries(ACTIVITIES.map(a => [a.id, a]));

// ─── Link (SPA navigation) ──────────────────────────────────────────────────
export function Link({ href, children, className, style, onClick }) {
  const { go } = useRouter();
  const handleClick = (e) => {
    if (href.startsWith('/') && !href.startsWith('//')) {
      e.preventDefault();
      go(href);
    }
    onClick && onClick(e);
  };
  return <a href={href} className={className} style={style} onClick={handleClick}>{children}</a>;
}

// ─── AimHeader ──────────────────────────────────────────────────────────────
export function AimHeader() {
  const { path, go, user } = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { href: '/', label: 'Inicio' },
    { href: '/actividades', label: 'Actividades' },
    { href: '/#nosotros', label: 'Nosotros' },
    { href: '/noticias', label: 'Noticias' },
    { href: '/#contacto', label: 'Contacto' },
  ];

  const isActive = (href) => {
    if (href === '/') return path === '/';
    return path.startsWith(href);
  };

  const handleNavClick = (e, href) => {
    if (href.startsWith('/#')) {
      if (path === '/') {
        e.preventDefault();
        const id = href.slice(2);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
        setMenuOpen(false);
      }
      return;
    }
    if (href.startsWith('/') && !href.startsWith('//')) {
      e.preventDefault();
      go(href);
      setMenuOpen(false);
    }
  };

  return (
    <header className={`aim-header${scrolled ? ' scrolled' : ''}`} id="navbar">
      <div className="row">
        <a href="/" onClick={(e) => { e.preventDefault(); go('/'); }}>
          <img src="/src/brand/Aim_Horizontal.png" alt="Aim Education" className="aim-logo" />
        </a>

        <nav id="mainNav">
          {navLinks.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className={isActive(href) ? 'is-active' : ''}
              onClick={(e) => handleNavClick(e, href)}
            >
              {label}
            </a>
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
            <a href="/dashboard" onClick={(e) => { e.preventDefault(); go('/dashboard'); }} className="btn btn-gradient">
              Hola, {user.firstName || 'Usuario'}
            </a>
          ) : (
            <a href="/auth" onClick={(e) => { e.preventDefault(); go('/auth'); }} className="btn btn-gradient" id="loginBtn">
              Mi cuenta
            </a>
          )}
        </div>
      </div>

      <nav className={`mobile-nav${menuOpen ? ' open' : ''}`} id="mobileNav">
        {navLinks.map(({ href, label }) => (
          <a key={href} href={href} onClick={(e) => handleNavClick(e, href)}>{label}</a>
        ))}
      </nav>
    </header>
  );
}

// ─── AimFooter ──────────────────────────────────────────────────────────────
export function AimFooter() {
  const { go } = useRouter();
  const L = ({ href, children }) => (
    <a href={href} onClick={href.startsWith('/') && !href.startsWith('//') ? (e) => { e.preventDefault(); go(href); } : undefined}>{children}</a>
  );

  return (
    <footer className="aim-footer" id="contacto">
      <div className="container">
        <div className="foot-grid">
          <div className="brand">
            <img src="/src/brand/Aim_White.png" alt="Aim Education" style={{ height: 36, width: 'auto' }} />
            <p>Formación integral en valores: innovación, excelencia y pasión. Una academia, mil maneras de aprender.</p>
            <div className="social-row">
              <a href="https://www.instagram.com/aimeducation.es" target="_blank" rel="noopener" aria-label="Instagram">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37a4 4 0 1 1-4.74-4.66 4 4 0 0 1 4.74 4.66z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
              </a>
              <a href="https://www.facebook.com/aimeducation.es" target="_blank" rel="noopener" aria-label="Facebook">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
              </a>
              <a href="https://www.youtube.com/@aimeducation" target="_blank" rel="noopener" aria-label="YouTube">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>
              </a>
              <a href="https://wa.me/34956742216" target="_blank" rel="noopener" aria-label="WhatsApp">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/></svg>
              </a>
            </div>
          </div>

          <div>
            <h5>Plataforma</h5>
            <ul>
              <li><L href="/">Inicio</L></li>
              <li><L href="/actividades">Actividades</L></li>
              <li><a href="/noticias">Noticias</a></li>
              <li><L href="/campamento">Campamento</L></li>
            </ul>
          </div>

          <div>
            <h5>Mi cuenta</h5>
            <ul>
              <li><L href="/auth">Iniciar sesión</L></li>
              <li><L href="/dashboard">Mi panel</L></li>
              <li><a href="/feed.xml">RSS Feed</a></li>
            </ul>
          </div>

          <div>
            <h5>Contacto</h5>
            <ul>
              <li>Urb. Terrazas de Doña Lola, Local 1</li>
              <li>11203 Algeciras, Cádiz</li>
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
          <span>© 2026 Aim Education · Algeciras</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <a href="/feed.xml" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/></svg>
              RSS
            </a>
            <span>Innovación · Excelencia · Pasión</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
