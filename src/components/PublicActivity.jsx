import React, { useEffect } from 'react';
import { ACT_BY_ID, ACTIVITIES, Link } from './Shared';
import { useRouter } from '../App';

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

export default function PublicActivity({ id }) {
  const { go } = useRouter();
  const act = ACT_BY_ID[id];

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.10 });
    document.querySelectorAll('.fade-up:not(.visible)').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [id]);

  if (!act) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 24px' }}>
        <h2 style={{ marginBottom: 12 }}>Actividad no encontrada</h2>
        <p style={{ color: 'var(--ink-3)', marginBottom: 24 }}>Esta actividad no existe o ha sido eliminada.</p>
        <Link href="/actividades" className="btn btn-gradient">Ver todas las actividades</Link>
      </div>
    );
  }

  const related = ACTIVITIES.filter(a => a.id !== act.id).slice(0, 3);

  return (
    <div className="act-detail">
      {/* Hero */}
      <div className="act-detail-hero" style={{ '--act-color': act.color, background: `linear-gradient(135deg, color-mix(in oklab, ${act.color} 30%, #1a1a2e) 0%, color-mix(in oklab, ${act.color} 60%, #0f0f1a) 100%)` }}>
        <div className="container">
          <div className="act-detail-hero-inner">
            <div className="act-detail-hero-content fade-up">
              <Link href="/actividades" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,.65)', fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Todas las actividades
              </Link>
              <span className="act-detail-sub">{act.sub}</span>
              <h1>{act.name}</h1>
              <p>{act.long}</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
                <Link href="/auth" className="btn btn-lg" style={{ background: 'white', color: act.color, fontWeight: 700 }}>
                  Reservar plaza <ArrowRight />
                </Link>
                <a href="https://wa.me/34956742216" target="_blank" rel="noopener" className="btn btn-lg" style={{ background: 'rgba(255,255,255,.12)', color: 'white', border: '1.5px solid rgba(255,255,255,.3)' }}>
                  Consultar
                </a>
              </div>
            </div>
            <div className="act-detail-hero-img fade-up d2">
              <img src={act.icon} alt={act.name} />
            </div>
          </div>
        </div>
      </div>

      {/* Quick info strip */}
      <div style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' }}>
        <div className="container">
          <div className="act-info-strip">
            <div className="act-info-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={act.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <div><span>Edades</span><strong>{act.ages}</strong></div>
            </div>
            <div className="act-info-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={act.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              <div><span>Precio</span><strong>{act.price}</strong></div>
            </div>
            <div className="act-info-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={act.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <div><span>Sesiones</span><strong>{act.schedule.length} grupos</strong></div>
            </div>
            <div className="act-info-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={act.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <div><span>Duración</span><strong>50–60 min</strong></div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container">
        <div className="act-detail-layout">
          {/* Left: content */}
          <div className="act-detail-main">
            {/* What you'll learn */}
            <div className="act-detail-section fade-up">
              <h2>¿Qué aprenderás?</h2>
              <div className="act-learn-grid">
                {act.learn.map((item, i) => (
                  <div key={i} className="act-learn-item" style={{ '--act-color': act.color }}>
                    <span className="act-learn-check" style={{ background: `color-mix(in oklab, ${act.color} 15%, white)`, color: act.color }}>
                      <CheckIcon />
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Schedule */}
            <div className="act-detail-section fade-up">
              <h2>Horarios</h2>
              <div className="act-schedule-table">
                <div className="act-sched-head">
                  <span>Días</span>
                  <span>Horario</span>
                  <span>Grupo</span>
                </div>
                {act.schedule.map((s, i) => (
                  <div key={i} className="act-sched-row">
                    <span>{s.day}</span>
                    <span style={{ fontWeight: 700, color: act.color }}>{s.time}</span>
                    <span style={{ color: 'var(--ink-3)' }}>{s.group}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 12 }}>
                * Los horarios pueden variar. Consulta disponibilidad actual.
              </p>
            </div>
          </div>

          {/* Right: sidebar */}
          <div className="act-detail-sidebar">
            <div className="act-sidebar-card" style={{ '--act-color': act.color, borderTop: `3px solid ${act.color}` }}>
              <div className="act-sidebar-header">
                <img src={act.icon} alt={act.name} style={{ width: 48, height: 48, objectFit: 'contain' }} />
                <div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{act.sub}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>{act.name}</div>
                </div>
              </div>

              <div className="act-sidebar-price">
                <span className="act-price-from">desde</span>
                <span className="act-price-amount" style={{ color: act.color }}>{act.price.replace('Desde ', '')}</span>
                <span className="act-price-period">/mes</span>
              </div>

              <ul className="act-sidebar-includes">
                <li><CheckIcon /> Material incluido</li>
                <li><CheckIcon /> Grupos reducidos</li>
                <li><CheckIcon /> Profesor cualificado</li>
                <li><CheckIcon /> 1ª clase de prueba gratis</li>
              </ul>

              <Link href="/auth" className="btn btn-lg" style={{ width: '100%', justifyContent: 'center', background: act.color, color: 'white', fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>
                Reservar plaza
              </Link>
              <a href="https://wa.me/34956742216" target="_blank" rel="noopener" className="btn btn-outline btn-lg" style={{ width: '100%', justifyContent: 'center', textAlign: 'center' }}>
                Consultar por WhatsApp
              </a>

              <p style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', marginTop: 14 }}>
                Sin permanencia · Matrícula única anual
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Related activities */}
      <div style={{ background: 'var(--bg-3)', borderTop: '1px solid var(--line)', padding: '60px 0 80px' }}>
        <div className="container">
          <h2 className="fade-up" style={{ fontFamily: 'var(--font-display)', marginBottom: 32, fontSize: 'clamp(22px,3vw,32px)' }}>
            Otras actividades
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {related.map((a, i) => (
              <Link key={a.id} href={`/actividades/${a.id}`} className={`act-card ${a.cls} fade-up d${i + 1}`} style={{ textDecoration: 'none' }}>
                <div className="icon-tile"><img src={a.icon} alt={a.name} /></div>
                <h3>{a.name}</h3>
                <p>{a.desc}</p>
                <span className="more">Saber más <ArrowRight /></span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
