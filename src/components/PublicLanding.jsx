import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from '../App';
import { ACTIVITIES, Link } from './Shared';

const CAT_BG = {
  general: 'bg-general', club: 'bg-club', taekwondo: 'bg-taekwondo',
  ballet: 'bg-ballet', ingles: 'bg-ingles', robotica: 'bg-robotica',
  funcional: 'bg-funcional', pintura: 'bg-pintura', camaleon: 'bg-camaleon',
};
const CAT_LABEL = {
  general: 'General', club: 'Club', taekwondo: 'Taekwondo', ballet: 'Ballet',
  ingles: 'Inglés', robotica: 'Robótica', funcional: 'Funcional',
  pintura: 'Pintura', camaleon: 'Camaleón',
};

function fmtDate(iso) {
  const d = new Date(iso);
  return {
    d: String(d.getDate()).padStart(2, '0'),
    m: d.toLocaleDateString('es-ES', { month: 'short' }).slice(0, 3).toUpperCase(),
  };
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}

export default function PublicLanding() {
  const { go } = useRouter();
  const [posts, setPosts] = useState([]);
  const mainRef = useRef(null);

  useEffect(() => {
    fetch('/api/posts?limit=3')
      .then(r => r.ok ? r.json() : [])
      .then(setPosts)
      .catch(() => {});
  }, []);

  // IntersectionObserver for fade-up
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.fade-up:not(.visible)').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [posts]);

  const featuredActivities = ACTIVITIES.slice(0, 6);

  return (
    <div ref={mainRef}>
      {/* ── HERO ── */}
      <section className="hero" id="inicio">
        <div className="container">
          <div className="hero-grid">
            <div className="fade-up">
              <span className="pill-badge purple">Algeciras · Desde 2018</span>
              <h1>Innovación educativa,<br /><span className="grad">pasión por el aprendizaje.</span></h1>
              <p className="lede">Taekwondo, Ballet, Inglés, Robótica y mucho más. Una formación integral en valores, en un entorno de respeto y tolerancia.</p>
              <div className="hero-ctas">
                <Link href="/campamento" className="btn btn-gradient btn-lg">
                  Campamento de verano <ArrowRight />
                </Link>
                <a href="#actividades" className="btn btn-outline btn-lg" onClick={(e) => { e.preventDefault(); document.getElementById('actividades')?.scrollIntoView({ behavior: 'smooth' }); }}>
                  Ver actividades
                </a>
              </div>
              <div className="hero-stats">
                <div><div className="stat-v">10+</div><div className="stat-l">Actividades</div></div>
                <div><div className="stat-v">3–60</div><div className="stat-l">Años cubiertos</div></div>
                <div><div className="stat-v">4★</div><div className="stat-l">Certificaciones</div></div>
              </div>
            </div>

            <div className="hero-vis fade-up d2">
              <div className="tile tile-1" style={{ padding: 0, overflow: 'hidden' }}>
                <img src="/src/brand/Aim_PatternV.png" alt="Actividades Aim" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(255,255,255,0) 50%,rgba(0,0,0,.45) 100%)' }} />
                <span className="t-label">10+ actividades</span>
              </div>
              <div className="tile tile-2 colored tile-bg-taekwondo">
                <img src="/src/submarcas/ArtesMarciales.png" alt="Taekwondo" className="tile-icon" />
                <span className="t-label">Taekwondo</span>
              </div>
              <div className="tile tile-3 colored tile-bg-ballet">
                <img src="/src/submarcas/Ballet.png" alt="Ballet" className="tile-icon" />
                <span className="t-label">Ballet</span>
              </div>
              <div className="tile tile-4 colored tile-bg-robotica">
                <img src="/src/submarcas/Robotica.png" alt="Robótica" className="tile-icon" />
              </div>
              <div className="tile tile-5 colored tile-bg-funcional">
                <img src="/src/submarcas/Entrenamiento.png" alt="Entrenamiento" className="tile-icon" />
                <span className="t-label">Funcional</span>
              </div>
              <div className="tile tile-6 colored tile-bg-camaleon">
                <img src="/src/submarcas/Camaleon.png" alt="Camaleón" className="tile-icon" />
                <span className="t-label">Camaleón</span>
              </div>
              <div className="tile tile-7 colored tile-bg-pintura">
                <img src="/src/submarcas/Pintura.png" alt="Pintura" className="tile-icon" />
                <span className="t-label">Pintura</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BADGES STRIP ── */}
      <div className="container" style={{ position: 'relative', zIndex: 5 }}>
        <div className="badges-strip fade-up">
          <div className="b">
            <span className="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg></span>
            <span>Perseguimos la <b>innovación</b> en cada clase</span>
          </div>
          <div className="b">
            <span className="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.11"/><path d="M15.46 9.46l2.12-2.12a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-2.12 2.12"/><circle cx="12" cy="8" r="6"/></svg></span>
            <span>Apostamos por la <b>excelencia</b> en nuestros servicios</span>
          </div>
          <div className="b">
            <span className="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></span>
            <span>Sentimos <b>pasión</b> por nuestro trabajo</span>
          </div>
          <div className="b">
            <span className="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
            <span>Grupos reducidos y <b>atención personalizada</b></span>
          </div>
        </div>
      </div>

      {/* ── ACTIVITIES ── */}
      <section className="block" id="actividades">
        <div className="container">
          <div className="section-head" style={{ alignItems: 'stretch', gap: 40 }}>
            <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span className="eyebrow">Nuestras actividades</span>
              <h2 className="section-title fade-up">Una academia, <span className="grad">mil maneras</span> de aprender.</h2>
              <p className="section-lede">Cada actividad la dirigen profesionales cualificados con su propia metodología. Grupos reducidos por edades — desde los 3 años hasta la edad adulta.</p>
            </div>
            <div style={{ flex: '1 1 400px', maxWidth: 520 }} className="fade-up d2">
              <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow)', border: '1px solid var(--line)', background: 'var(--ink)' }}>
                <iframe
                  src="https://www.youtube.com/embed/M7lc1UVf-VE?rel=0&modestbranding=1"
                  title="Aim Education — vídeo de presentación"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: 'var(--ink-3)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                <span>Conoce el club por dentro · 1 min</span>
              </div>
            </div>
          </div>

          <div className="act-grid">
            {featuredActivities.map((act, i) => (
              <Link key={act.id} href={`/actividades/${act.id}`} className={`act-card ${act.cls} fade-up d${(i % 3) + 1}`}>
                <div className="icon-tile"><img src={act.icon} alt={act.name} /></div>
                <h3>{act.name}</h3>
                <p>{act.desc}</p>
                <span className="more">Saber más <ArrowRight /></span>
              </Link>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 36 }} className="fade-up">
            <Link href="/actividades" className="btn btn-outline btn-lg">
              Ver todas las actividades <ArrowRight />
            </Link>
          </div>
        </div>
      </section>

      {/* ── NEWS + CALENDAR ── */}
      <section className="block tight" id="noticias" style={{ background: 'var(--bg-3)' }}>
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow purple">Últimas noticias</span>
              <h2 className="section-title fade-up">Lo que está pasando en <span className="grad">Aim</span></h2>
            </div>
            <a href="/noticias" className="btn btn-outline fade-up d2">
              Más noticias <ArrowRight />
            </a>
          </div>

          <div className="news-layout">
            <div className="news-cards-grid" id="newsDynamic">
              {posts.length === 0 ? (
                <>
                  {[1, 2, 3].map(i => (
                    <div key={i} className="news-card news-skeleton">
                      <div className="img bg-general" style={{ height: 160 }} />
                      <div className="body"><span className="cat">Cargando</span><h4>...</h4></div>
                    </div>
                  ))}
                </>
              ) : posts.map((post, i) => {
                const cat = post.category || 'general';
                const bgCls = CAT_BG[cat] || 'bg-general';
                const label = CAT_LABEL[cat] || cat;
                const { d, m } = fmtDate(post.published_at || post.created_at);
                return (
                  <a key={post.id} href={`/noticias/${post.slug}`} className={`news-card fade-up d${(i % 3) + 1}`}>
                    <div className={`img ${bgCls}`}>
                      {post.cover_image_url && <img src={post.cover_image_url} alt={post.title} loading="lazy" />}
                      <div className="badge-date"><div className="d">{d}</div><div className="m">{m}</div></div>
                    </div>
                    <div className="body">
                      <span className="cat">{label}</span>
                      <h4>{post.title}</h4>
                      {post.excerpt && <p>{post.excerpt}</p>}
                    </div>
                  </a>
                );
              })}
            </div>

            <div className="calendar-card fade-up d3">
              <h3>Próximos eventos</h3>
              <div className="cal-event">
                <div className="date"><div className="d">24</div><div className="m">Abr</div></div>
                <div className="info"><h5>Seminario Taekwondo Avanzado</h5><p>24–26 abril · maestros invitados</p></div>
              </div>
              <div className="cal-event">
                <div className="date"><div className="d">30</div><div className="m">Abr</div></div>
                <div className="info"><h5>Gala de Primavera</h5><p>Ballet y Baile Moderno · escenario Aim</p></div>
              </div>
              <div className="cal-event">
                <div className="date"><div className="d">14</div><div className="m">Jun</div></div>
                <div className="info"><h5>Festival Anual de Ballet</h5><p>Cierre de curso · entradas abiertas</p></div>
              </div>
              <Link href="/actividades" className="btn-cal">Ver calendario completo</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── SOBRE NOSOTROS ── */}
      <section className="block" id="nosotros">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow pink">Sobre nosotros</span>
              <h2 className="section-title fade-up">Una formación <span className="grad">integral</span> y con valores.</h2>
            </div>
          </div>
          <div className="values-grid">
            <div className="about-block fade-up">
              <p><b>Nuestra misión</b> es proporcionar una formación integral, fomentando los valores fundamentales entre nuestros alumnos en un entorno de respeto y tolerancia. Utilizamos una amplia variedad de actividades como herramienta principal en nuestro programa educativo, diseñadas y organizadas para adaptarse específicamente a las características de cada grupo.</p>
              <p>Nuestras actividades se clasifican por <b>grupos de edad</b>, cubriendo desde los 3 años hasta la edad adulta. Limitamos el número de plazas para garantizar ambientes de trabajo reducidos y la atención más personalizada posible.</p>
            </div>
            <div className="value-cards fade-up d2">
              <div className="value-card v-innov">
                <div className="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg></div>
                <h4>Innovación</h4>
                <p>Perseguimos la innovación para ofrecer <b>nuevas oportunidades</b> a nuestros alumnos.</p>
              </div>
              <div className="value-card v-excel">
                <div className="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.11"/><circle cx="12" cy="8" r="6"/></svg></div>
                <h4>Excelencia</h4>
                <p>Nos exigimos lo mejor para ofrecer <b>excelencia</b> en nuestros servicios.</p>
              </div>
              <div className="value-card v-passion">
                <div className="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div>
                <h4>Pasión</h4>
                <p>Sentimos <b>pasión</b> por nuestro trabajo. Disfrutamos de cada clase.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="block tight">
        <div className="container">
          <div className="cta-banner fade-up">
            <h2>¿Listo para empezar este curso?</h2>
            <p>Reserva tu plaza online. Tu primera clase es de prueba y sin compromiso.</p>
            <div className="btns">
              <Link href="/auth" className="btn btn-lg" style={{ background: 'var(--ink)', color: 'white' }}>
                Reservar plaza <ArrowRight />
              </Link>
              <Link href="/actividades" className="btn btn-lg" style={{ background: 'transparent', border: '1.5px solid rgba(255,255,255,.5)', color: 'white' }}>
                Ver actividades
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
