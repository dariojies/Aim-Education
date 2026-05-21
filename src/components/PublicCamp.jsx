import React, { useState, useEffect } from 'react';
import { Link } from './Shared';

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}

function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}

const WEEKS = [
  { id: 1, label: 'Semana 1', dates: '23–27 Jun', spots: 8 },
  { id: 2, label: 'Semana 2', dates: '30 Jun–4 Jul', spots: 12 },
  { id: 3, label: 'Semana 3', dates: '7–11 Jul', spots: 5 },
  { id: 4, label: 'Semana 4', dates: '14–18 Jul', spots: 0 },
  { id: 5, label: 'Semana 5', dates: '21–25 Jul', spots: 14 },
  { id: 6, label: 'Semana 6', dates: '28 Jul–1 Ago', spots: 10 },
];

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const SCHEDULE = [
  { time: '09:00–10:00', activities: ['Taekwondo', 'Ballet', 'Inglés', 'Robótica', 'Baile Urbano'], colors: ['#21B668', '#FF99D3', '#00BBF4', '#FFD526', '#AF99FF'] },
  { time: '10:00–11:00', activities: ['Inglés', 'Robótica', 'Taekwondo', 'Ballet', 'Pilates'], colors: ['#00BBF4', '#FFD526', '#21B668', '#FF99D3', '#BFD300'] },
  { time: '11:00–12:00', activities: ['Piscina / Libre', 'Piscina / Libre', 'Piscina / Libre', 'Piscina / Libre', 'Piscina / Libre'], colors: ['#5233A8', '#5233A8', '#5233A8', '#5233A8', '#5233A8'] },
  { time: '12:00–13:00', activities: ['Pintura', 'Camaleón', 'Pintura', 'Camaleón', 'Taller Libre'], colors: ['#5233A8', '#25D8BA', '#5233A8', '#25D8BA', '#FF4F15'] },
  { time: '13:00–14:00', activities: ['Comida', 'Comida', 'Comida', 'Comida', 'Comida'], colors: ['#76777E', '#76777E', '#76777E', '#76777E', '#76777E'] },
  { time: '15:00–16:00', activities: ['Funcional', 'Baile Urbano', 'Funcional', 'Baile Urbano', 'Gymkhana'], colors: ['#FF4F15', '#AF99FF', '#FF4F15', '#AF99FF', '#FFD526'] },
  { time: '16:00–17:00', activities: ['Juegos y cierre', 'Juegos y cierre', 'Juegos y cierre', 'Juegos y cierre', 'Ceremonia'], colors: ['#F99B35', '#F99B35', '#F99B35', '#F99B35', '#F99B35'] },
];

const PLANS = [
  {
    id: 'semanal', label: 'Semanal', price: '180', period: '/ semana',
    features: ['Actividades incluidas', 'Monitor por grupo', 'Snack de media mañana', 'Material escolar'],
    highlight: false,
  },
  {
    id: 'mensual', label: 'Mensual', price: '650', period: '/ mes',
    features: ['Actividades incluidas', 'Monitor dedicado', 'Snack + comida incluida', 'Material escolar', 'Camiseta Aim Camp'],
    highlight: true,
    badge: 'Más popular',
  },
  {
    id: 'verano', label: 'Verano completo', price: '1.200', period: '/ todo el verano',
    features: ['Actividades incluidas', 'Monitor dedicado', 'Snack + comida incluida', 'Material escolar', 'Camiseta + sudadera', 'Foto y vídeo fin de camp'],
    highlight: false,
  },
];

const INCLUDED = [
  'Actividades deportivas y artísticas',
  'Monitores titulados',
  'Snack de media mañana',
  'Seguro de accidentes',
  'Grupos reducidos (máx. 12)',
  'Actividades en piscina',
  'Talleres creativos',
  'Gymkhanas y juegos',
];

export default function PublicCamp() {
  const [selectedWeek, setSelectedWeek] = useState(1);

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
  }, []);

  return (
    <div className="camp-page">
      {/* Hero */}
      <div className="camp-hero">
        <div className="container">
          <div className="camp-hero-inner fade-up">
            <span className="pill-badge yellow">Verano 2025</span>
            <h1>Campamento de<br /><span className="grad">verano Aim</span></h1>
            <p>Una semana llena de deporte, arte, inglés y aventura. Monitores cualificados, grupos reducidos y actividades pensadas para que cada día sea único.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
              <Link href="/auth" className="btn btn-gradient btn-lg">
                Reservar plaza <ArrowRight />
              </Link>
              <a href="https://wa.me/34956742216" target="_blank" rel="noopener" className="btn btn-outline btn-lg">
                Pedir información
              </a>
            </div>
            <div className="camp-hero-stats">
              <div><strong>23 Jun</strong><span>Inicio</span></div>
              <div><strong>1 Ago</strong><span>Fin</span></div>
              <div><strong>6</strong><span>Semanas</span></div>
              <div><strong>4–14</strong><span>Años</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* What's included */}
      <div className="container" style={{ paddingTop: 60, paddingBottom: 60 }}>
        <span className="eyebrow">Incluido en el precio</span>
        <h2 className="section-title fade-up" style={{ marginBottom: 32 }}>Todo lo que necesitas,<br /><span className="grad">ya viene incluido.</span></h2>
        <div className="camp-included-grid fade-up d2">
          {INCLUDED.map((item, i) => (
            <div key={i} className="camp-included-item">
              <span className="camp-check"><CheckIcon /></span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Week selector + Schedule */}
      <div style={{ background: 'var(--bg-3)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: '60px 0' }}>
        <div className="container">
          <span className="eyebrow">Horario semanal</span>
          <h2 className="section-title fade-up" style={{ marginBottom: 24 }}>Elige tu <span className="grad">semana</span></h2>

          <div className="camp-weeks-selector fade-up d2">
            {WEEKS.map(w => (
              <button
                key={w.id}
                className={`camp-week-btn${selectedWeek === w.id ? ' active' : ''}${w.spots === 0 ? ' full' : ''}`}
                onClick={() => w.spots > 0 && setSelectedWeek(w.id)}
                disabled={w.spots === 0}
              >
                <span className="camp-week-label">{w.label}</span>
                <span className="camp-week-dates">{w.dates}</span>
                <span className={`camp-week-spots${w.spots === 0 ? ' zero' : w.spots <= 5 ? ' low' : ''}`}>
                  {w.spots === 0 ? 'Completa' : `${w.spots} plazas`}
                </span>
              </button>
            ))}
          </div>

          <div className="camp-schedule fade-up" style={{ marginTop: 32, overflowX: 'auto' }}>
            <table className="camp-sched-table">
              <thead>
                <tr>
                  <th>Horario</th>
                  {DAYS.map(d => <th key={d}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {SCHEDULE.map((row, ri) => (
                  <tr key={ri}>
                    <td className="camp-sched-time">{row.time}</td>
                    {row.activities.map((act, ai) => (
                      <td key={ai}>
                        <span className="camp-sched-act" style={{ background: `color-mix(in oklab, ${row.colors[ai]} 18%, white)`, color: row.colors[ai], border: `1px solid color-mix(in oklab, ${row.colors[ai]} 30%, white)` }}>
                          {act}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="container" style={{ paddingTop: 60, paddingBottom: 80 }}>
        <span className="eyebrow purple">Precios</span>
        <h2 className="section-title fade-up" style={{ marginBottom: 40 }}>Elige tu <span className="grad">plan</span></h2>
        <div className="camp-plans">
          {PLANS.map((plan, i) => (
            <div key={plan.id} className={`camp-plan-card fade-up d${i + 1}${plan.highlight ? ' highlight' : ''}`}>
              {plan.badge && <span className="camp-plan-badge">{plan.badge}</span>}
              <div className="camp-plan-name">{plan.label}</div>
              <div className="camp-plan-price">
                <span className="camp-plan-amount">{plan.price}€</span>
                <span className="camp-plan-period">{plan.period}</span>
              </div>
              <ul className="camp-plan-features">
                {plan.features.map((f, j) => (
                  <li key={j}><CheckIcon /> {f}</li>
                ))}
              </ul>
              <Link href="/auth" className={`btn btn-lg${plan.highlight ? ' btn-gradient' : ' btn-outline'}`} style={{ width: '100%', justifyContent: 'center', textAlign: 'center' }}>
                Reservar <ArrowRight />
              </Link>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, marginTop: 24 }}>
          * Precios para el verano 2025. IVA no incluido. Descuentos para hermanos disponibles.
        </p>
      </div>
    </div>
  );
}
