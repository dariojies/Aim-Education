import React, { useState, useEffect } from 'react';
import { ACTIVITIES, Link } from './Shared';

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'ninos', label: 'Niños' },
  { id: 'jovenes', label: 'Jóvenes' },
  { id: 'adultos', label: 'Adultos' },
];

const AGE_MAP = {
  taekwondo: ['ninos', 'jovenes', 'adultos'],
  ballet: ['ninos', 'jovenes', 'adultos'],
  ingles: ['ninos', 'jovenes', 'adultos'],
  robotica: ['ninos', 'jovenes'],
  baile: ['ninos', 'jovenes', 'adultos'],
  funcional: ['adultos'],
  camaleon: ['ninos'],
  pilates: ['adultos'],
  pintura: ['ninos', 'jovenes', 'adultos'],
};

export default function PublicActivities() {
  const [filter, setFilter] = useState('all');

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
  }, [filter]);

  const filtered = filter === 'all'
    ? ACTIVITIES
    : ACTIVITIES.filter(a => (AGE_MAP[a.id] || []).includes(filter));

  return (
    <div className="acts-page">
      {/* Hero */}
      <div className="acts-hero">
        <div className="container">
          <span className="eyebrow">Nuestras actividades</span>
          <h1 className="fade-up">Una academia, <span className="grad">mil maneras</span> de aprender.</h1>
          <p className="fade-up d2">Profesores cualificados, grupos reducidos y metodologías propias para cada disciplina. Desde 3 años hasta la edad adulta.</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="container" style={{ paddingTop: 32, paddingBottom: 0 }}>
        <div className="filter-tabs">
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`filter-tab${filter === f.id ? ' active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="container" style={{ paddingTop: 32, paddingBottom: 80 }}>
        <div className="acts-catalog-grid">
          {filtered.map((act, i) => (
            <Link key={act.id} href={`/actividades/${act.id}`} className={`acts-catalog-card fade-up d${(i % 3) + 1}`} style={{ '--act-color': act.color }}>
              <div className="acts-catalog-icon" style={{ background: `color-mix(in oklab, ${act.color} 18%, white)` }}>
                <img src={act.icon} alt={act.name} />
              </div>
              <div className="acts-catalog-body">
                <span className="acts-catalog-sub">{act.sub}</span>
                <h3>{act.name}</h3>
                <p>{act.desc}</p>
                <div className="acts-catalog-meta">
                  <span className="acts-meta-pill">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    {act.ages}
                  </span>
                  <span className="acts-meta-pill">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    {act.price}
                  </span>
                </div>
                <span className="acts-catalog-more" style={{ color: act.color }}>
                  Ver actividad <ArrowRight />
                </span>
              </div>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink-3)' }}>
            <p>No hay actividades para este filtro.</p>
          </div>
        )}
      </div>

      {/* CTA strip */}
      <div style={{ background: 'var(--bg-3)', borderTop: '1px solid var(--line)', padding: '48px 0' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(20px,3vw,28px)', marginBottom: 12 }}>
            ¿No encuentras lo que buscas?
          </h3>
          <p style={{ color: 'var(--ink-3)', marginBottom: 24 }}>Contáctanos y te ayudamos a encontrar la actividad perfecta para tu hijo o para ti.</p>
          <a href="https://wa.me/34956742216" target="_blank" rel="noopener" className="btn btn-gradient btn-lg">
            Consultar por WhatsApp <ArrowRight />
          </a>
        </div>
      </div>
    </div>
  );
}
