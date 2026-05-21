import React, { useState } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, ACTIVITIES, ACT_BY_ID } from './Shared.jsx';
import { useRouter } from '../App.jsx';

function ActivityCard({ act, go, delay = 0 }) {
  return (
    <div className={`act-card ${act.className} fade-up d${delay}`} onClick={() => go(`/actividades/${act.id}`)}>
      <div className="icon-tile">
        <img src={act.iconAsset} alt={act.name} />
      </div>
      <h3>{act.name}</h3>
      <p>{act.lede}</p>
      <a className="more" href="#" onClick={(e) => e.preventDefault()}>
        Saber más <I.Arrow />
      </a>
    </div>
  );
}

function NewsCard({ cat, className, imgClass, ph, title, date, body }) {
  return (
    <div className={`news-card ${className}`}>
      <div className={`img ${imgClass}`}>
        <div className="badge-date">
          <div className="d">{date.d}</div>
          <div className="m">{date.m}</div>
        </div>
        <div className="ph-watermark">{ph}</div>
      </div>
      <div className="body">
        <span className="cat">{cat}</span>
        <h4>{title}</h4>
        <p>{body}</p>
      </div>
    </div>
  );
}

export function PublicActivities() {
  const { go } = useRouter();
  const [filter, setFilter] = useState("all");
  const tags = ["all", ...Array.from(new Set(ACTIVITIES.map(a => a.tag)))];
  const visible = filter === "all" ? ACTIVITIES : ACTIVITIES.filter(a => a.tag === filter);

  return (
    <>
      <AimHeader route="activities" />
      <main style={{paddingTop: 0}}>
        <section className="block tight">
          <div className="container">
            <div style={{textAlign: "center", maxWidth: 720, margin: "0 auto"}}>
              <span className="eyebrow purple">Catálogo completo</span>
              <h1 className="title-display">
                Descubre nuestra amplia<br/>
                variedad de <span className="grad">actividades.</span>
              </h1>
              <p className="section-lede" style={{margin: "20px auto 0"}}>
                Únete a nosotros y descubre un mundo de diversión y aprendizaje en clases
                dinámicas, emocionantes campamentos de verano y una variedad de actividades
                que ofrecemos durante todo el año.
              </p>
            </div>

            <div style={{display: "flex", gap: 8, justifyContent: "center", marginTop: 40, flexWrap: "wrap"}}>
              {tags.map(t => (
                <button key={t}
                  className={`filter-pill ${filter === t ? "is-active" : ""}`}
                  onClick={() => setFilter(t)}>
                  {t === "all" ? "Todas" : t}
                </button>
              ))}
            </div>

            <div className="act-grid" style={{marginTop: 32}}>
              {visible.map((a, i) => (
                <ActivityCard key={a.id} act={a} go={go} delay={(i % 4) + 1} />
              ))}
            </div>
          </div>
        </section>

        <AimFooter />
      </main>
    </>
  );
}

export function PublicNews() {
  const { go } = useRouter();
  const NEWS = [
    { cat: "Ballet", className: "act-ballet", imgClass: "bg-ballet", ph: "festival ballet", title: "¡Se acerca nuestro Festival de Ballet Clásico y Baile Moderno!", date: {d: "14", m: "Jun"}, body: "Nos vemos en el escenario. Inscripciones de público abiertas a partir del 1 de junio." },
    { cat: "Taekwondo", className: "act-taekwondo", imgClass: "bg-taekwondo", ph: "torneo navideño", title: "XVII Torneo Navideño Iván Navarrete", date: {d: "07", m: "Dic"}, body: "Inscripciones abiertas para nuestros cinturones de competición. ¡Animaros a participar!" },
    { cat: "Robótica", className: "act-robotica", imgClass: "bg-robotica", ph: "campeonato", title: "Campeonato Promoción Robótica Camaleón", date: {d: "22", m: "Mar"}, body: "Nuestros equipos junior compiten en Málaga." },
    { cat: "Inglés", className: "act-ingles", imgClass: "bg-taekwondo", ph: "cambridge 2026", title: "Convocatoria Cambridge English curso 2025-2026", date: {d: "15", m: "May"}, body: "Plazas abiertas para A2, B1, B2 y C1. Plazas limitadas." },
    { cat: "Aim", className: "act-funcional", imgClass: "bg-robotica", ph: "campamento verano", title: "Abrimos inscripciones del campamento de verano 2026", date: {d: "01", m: "Abr"}, body: "Cuatro semanas, edades de 4 a 14 años. Hasta el 30% de descuento para hermanos." },
    { cat: "Pintura", className: "act-pintura", imgClass: "bg-ballet", ph: "exposición", title: "Exposición de fin de curso del Taller de Pintura", date: {d: "05", m: "Jun"}, body: "Más de 60 obras de nuestros alumnos en la sala municipal de Algeciras." },
  ];

  return (
    <>
      <AimHeader route="news" />
      <main style={{paddingTop: 0}}>
        <section className="block tight">
          <div className="container">
            <div style={{maxWidth: 720}}>
              <span className="eyebrow purple">Foro y noticias</span>
              <h1 className="title-display">Todo lo que pasa en <span className="grad">Aim Education.</span></h1>
              <p className="section-lede" style={{marginTop: 18}}>
                Noticias, eventos, convocatorias y novedades del club — directamente desde
                el equipo. También disponible vía RSS.
              </p>
            </div>

            <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 40}}>
              {NEWS.map((n, i) => <NewsCard key={i} {...n} />)}
            </div>
          </div>
        </section>

        <AimFooter />
      </main>
    </>
  );
}

export default PublicActivities;
