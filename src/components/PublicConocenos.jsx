import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, MagicText } from './Shared.jsx';
import { useRouter } from '../App.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Conócenos (#295): una historia muy breve y el equipo. La historia se cambia en
// el panel (Portada de la web); el equipo sale solo del panel: quien tenga su
// perfil publicado en Personas → Instructores, con lo que da según el horario.
// ─────────────────────────────────────────────────────────────────────────────

const historiaBase = (ano) =>
  `Desde ${ano} acompañamos a niños, jóvenes y adultos de Algeciras en su formación. ` +
  'Hoy en AIM conviven el deporte, la danza, los idiomas, el arte y la tecnología, siempre en grupos reducidos ' +
  'y organizados por edades, para que cada alumno avance a su ritmo.';

const VALORES = [
  { t: 'Innovación', d: 'Buscamos siempre maneras nuevas de enseñar y de aprender.', c: 'var(--c-ingles)' },
  { t: 'Excelencia', d: 'Profesores preparados, programas oficiales y grupos reducidos.', c: 'var(--c-taekwondo)' },
  { t: 'Pasión', d: 'Nos encanta lo que hacemos, y se nota en cada clase.', c: 'var(--c-ballet)' },
];

const iniciales = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

function Miembro({ m }) {
  return (
    <div className="miembro-web">
      <div className="foto">
        {m.foto ? <img src={m.foto} alt={m.nombre} loading="lazy" /> : <span>{iniciales(m.nombre)}</span>}
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 800, letterSpacing: '-.01em' }}>{m.nombre}</h3>
        {m.cargo && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--purple)' }}>{m.cargo}</div>}
        {m.actividades.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {m.actividades.map(a => <span key={a} className="level-tag">{a}</span>)}
          </div>
        )}
        {m.bio && <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{m.bio}</p>}
      </div>
    </div>
  );
}

export default function PublicConocenos() {
  const { go } = useRouter();
  const [portada, setPortada] = useState(null);
  const [equipo, setEquipo] = useState(null);

  useEffect(() => {
    fetch('/api/landing').then(r => (r.ok ? r.json() : null)).then(setPortada).catch(() => setPortada(null));
    fetch('/api/publico/equipo').then(r => (r.ok ? r.json() : { equipo: [] })).then(d => setEquipo(d.equipo || [])).catch(() => setEquipo([]));
  }, []);

  const ano = portada?.anoFundacion || 2008;
  const historia = portada?.historia?.trim() || historiaBase(ano);

  return (
    <>
      <AimHeader route="about" />
      <main style={{ paddingTop: 0 }}>
        <section className="block tight">
          <div className="container conocenos-grid">
            <div>
              <span className="eyebrow purple">Conócenos</span>
              <h1 className="title-display">Una academia, mil maneras de <MagicText>aprender.</MagicText></h1>
              {historia.split(/\n\s*\n/).map((p, i) => (
                <p key={i} className="section-lede" style={{ marginTop: i ? 12 : 18 }}>{p}</p>
              ))}
              <blockquote className="mision-web">
                «Nuestra misión es proporcionar una formación integral, fomentando valores fundamentales entre nuestros
                alumnos en un entorno de respeto y tolerancia.»
              </blockquote>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {VALORES.map(v => (
                <div key={v.t} className="valor-web" style={{ '--c': v.c }}>
                  <b>{v.t}</b>
                  <span>{v.d}</span>
                </div>
              ))}
              {portada?.datos && (
                <div className="datos-web">
                  {portada.datos.map(d => (
                    <div key={d.l}><div className="v">{d.v}</div><div className="l">{d.l}</div></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="block tight" style={{ background: 'var(--bg-3)' }}>
          <div className="container">
            <span className="eyebrow purple">El equipo</span>
            <h2 className="section-title">Las personas detrás de cada clase</h2>
            {equipo === null ? (
              <p style={{ color: 'var(--ink-3)', marginTop: 24 }}>Cargando…</p>
            ) : equipo.length === 0 ? (
              <p style={{ color: 'var(--ink-3)', marginTop: 24 }}>Muy pronto te presentaremos aquí a nuestro equipo.</p>
            ) : (
              <div className="equipo-web">
                {equipo.map(m => <Miembro key={m.id} m={m} />)}
              </div>
            )}
          </div>
        </section>

        <section className="block tight">
          <div className="container" style={{ textAlign: 'center', maxWidth: 640 }}>
            <h2 className="section-title">¿Quieres conocernos en persona?</h2>
            <p className="section-lede" style={{ margin: '12px auto 24px' }}>
              Ven a vernos a la Urb. Terrazas de Doña Lola, en Algeciras, o escríbenos y te contamos todo lo que necesites.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-gradient btn-lg" onClick={() => go('/contacto')}>Escríbenos <I.Arrow /></button>
              <button className="btn btn-outline btn-lg" onClick={() => go('/actividades')}>Ver actividades</button>
            </div>
          </div>
        </section>

        <AimFooter />
      </main>
    </>
  );
}
