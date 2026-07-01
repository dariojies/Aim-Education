import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, ACTIVITIES, ACT_BY_ID, MagicText } from './Shared.jsx';
import { useRouter } from '../App.jsx';

const CAT_COLOR = { taekwondo: '#21B668', ballet: '#FF99D3', ingles: '#00BBF4', robotica: '#FFD526', baile: '#AF99FF', pintura: '#5233A8', funcional: '#FF4F15', pilates: '#BFD300', camaleon: '#25D8BA', competicion: '#21B668', club: '#5233A8', general: '#5233A8', shelfie: '#FF99D3' };
const catColor = c => CAT_COLOR[c] || '#5233A8';
const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function BrandTile({ actId, cls, label, textColor }) {
  const a = ACT_BY_ID[actId];
  if (!a) return null;
  return (
    <div className={`tile colored ${cls} ${a.className}`}>
      <img className="tile-icon" src={a.iconAsset} alt={a.name} />
      {label && <span className="label" style={textColor ? {color: textColor, textShadow: "none"} : null}>{label}</span>}
    </div>
  );
}

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

function NewsCard({ cat, color, img, ph, title, date, body }) {
  return (
    <div className="news-card">
      <div className="img" style={img ? { aspectRatio: 'auto', background: 'var(--bg-3)' } : { background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 55%, #000))` }}>
        {img && <img src={img} alt="" style={{ width: "100%", height: "auto", display: "block" }} />}
        <div className="badge-date">
          <div className="d">{date.d}</div>
          <div className="m">{date.m}</div>
        </div>
        {!img && <div className="ph-watermark">{ph}</div>}
      </div>
      <div className="body">
        <span className="cat" style={{ color }}>{cat}</span>
        <h4>{title}</h4>
        <p>{body}</p>
      </div>
    </div>
  );
}

export default function PublicLanding() {
  const { go } = useRouter();
  const [posts, setPosts] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    fetch('/api/posts?limit=3').then(r => r.ok ? r.json() : []).then(d => setPosts(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/events').then(r => r.ok ? r.json() : []).then(d => setEvents(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  return (
    <>
      <AimHeader route="home" />
      <main style={{paddingTop: 0}}>
        {/* ===== HERO ===== */}
        <section className="hero">
          <div className="container">
            <div className="hero-grid">
              <div className="fade-up">
                <span className="pill-badge purple">Algeciras · Desde 2018</span>
                <h1>
                  Innovación educativa,<br/>
                  <MagicText>pasión por el aprendizaje.</MagicText>
                </h1>
                <p className="lede">
                  Taekwondo, Ballet, Inglés, Robótica y mucho más.
                  Una formación integral en valores, en un entorno de respeto
                  y tolerancia. Cada actividad está diseñada para sacar lo mejor
                  de cada alumno.
                </p>
                <div className="hero-ctas">
                  <button className="btn btn-gradient btn-lg" onClick={() => go("/campamento")}>
                    Campamento de verano <I.Arrow />
                  </button>
                  <button className="btn btn-outline btn-lg" onClick={() => go("/actividades")}>
                    Ver actividades
                  </button>
                </div>

                <div style={{display: "flex", gap: 28, marginTop: 38, flexWrap: "wrap"}}>
                  {[
                    { v: "10+", l: "Actividades" },
                    { v: "3–60", l: "Años cubiertos" },
                    { v: "4★", l: "Certificaciones" },
                  ].map((s, i) => (
                    <div key={i}>
                      <div style={{fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 32, letterSpacing: "-.025em", lineHeight: 1, color: "var(--ink)"}}>{s.v}</div>
                      <div style={{fontSize: 12, color: "var(--ink-3)", marginTop: 4, fontWeight: 600}}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Visual mosaic — brand submarcas */}
              <div className="hero-vis fade-up d2">
                <div className="tile tile-1" style={{padding: 0, overflow: "hidden"}}>
                  <img
                    src="/src/brand/Aim_PatternV.png"
                    alt="Actividades Aim"
                    style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover"}}
                  />
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(180deg, rgba(255,255,255,0) 50%, rgba(0,0,0,.45) 100%)",
                  }}/>
                  <span className="label" style={{color: "white"}}>10+ actividades</span>
                </div>
                <BrandTile actId="taekwondo" cls="tile-2" label="Taekwondo" />
                <BrandTile actId="ballet" cls="tile-3" label="Ballet" />
                <BrandTile actId="robotica" cls="tile-4" label="Robótica" textColor="#6A4A0F" />
                <BrandTile actId="funcional" cls="tile-5" label="Funcional" />
                <BrandTile actId="camaleon" cls="tile-6" label="Camaleón" />
                <BrandTile actId="pintura" cls="tile-7" label="Pintura" />
              </div>
            </div>
          </div>
        </section>

        {/* ===== Badges strip ===== */}
        <div className="container">
          <div className="badges-strip">
            <div className="b">
              <span className="ico"><I.Bulb /></span>
              <span>Perseguimos la <b>innovación</b> en cada clase</span>
            </div>
            <div className="b">
              <span className="ico"><I.Trophy /></span>
              <span>Apostamos por la <b>excelencia</b> en nuestros servicios</span>
            </div>
            <div className="b">
              <span className="ico"><I.Heart /></span>
              <span>Sentimos <b>pasión</b> por nuestro trabajo</span>
            </div>
            <div className="b">
              <span className="ico"><I.Shield /></span>
              <span>Grupos reducidos y <b>atención personalizada</b></span>
            </div>
          </div>
        </div>

        {/* ===== Activities ===== */}
        <section className="block">
          <div className="container">
            <div className="section-head" style={{alignItems: "stretch", gap: 40}}>
              <div style={{flex: "1 1 460px", display: "flex", flexDirection: "column", justifyContent: "center"}}>
                <span className="eyebrow">Nuestras actividades</span>
                <h2 className="section-title">Una academia, <MagicText>mil maneras</MagicText> de aprender.</h2>
                <p className="section-lede" style={{marginTop: 12}}>
                  Cada actividad la dirigen profesionales cualificados con su propia metodología.
                  Grupos reducidos por edades — desde los 3 años hasta la edad adulta.
                </p>
              </div>
              <div style={{flex: "1 1 460px", maxWidth: 560}}>
                <div style={{
                  position: "relative",
                  aspectRatio: "16/9",
                  borderRadius: 18,
                  overflow: "hidden",
                  boxShadow: "var(--shadow)",
                  border: "1px solid var(--line)",
                  background: "var(--ink)",
                }}>
                  <iframe
                    src="https://www.youtube.com/embed/_roTJYMv1R4?rel=0&modestbranding=1"
                    title="Aim Education — vídeo de presentación"
                    style={{position: "absolute", inset: 0, width: "100%", height: "100%", border: 0}}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
                <div style={{display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: "var(--ink-3)"}}>
                  <I.Sparkle style={{color: "var(--teal)"}}/>
                  <span>Conoce el club por dentro · 1 min</span>
                </div>
              </div>
            </div>

            <div className="act-grid">
              {ACTIVITIES.slice(0, 6).map((a, i) => (
                <ActivityCard key={a.id} act={a} go={go} delay={i % 4 + 1} />
              ))}
            </div>

            <div style={{textAlign: "center", marginTop: 32}}>
              <button className="btn btn-outline btn-lg" onClick={() => go("/actividades")}>
                Ver todas las actividades <I.Arrow />
              </button>
            </div>
          </div>
        </section>

        {/* ===== News + Calendar ===== */}
        <section className="block tight" style={{background: "var(--bg-3)"}}>
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow purple">Últimas noticias</span>
                <h2 className="section-title">Lo que está pasando en <MagicText>Aim</MagicText></h2>
              </div>
              <button className="btn btn-outline" onClick={() => go("/noticias")}>Más noticias <I.Arrow /></button>
            </div>

            <div className="news-grid">
              <div className="news-list">
                {posts.length === 0 && (
                  <p style={{color: "var(--ink-3)", fontSize: 14}}>Aún no hay noticias publicadas.</p>
                )}
                {posts.map(p => {
                  const d = new Date(p.published_at || p.created_at);
                  const color = catColor(p.category);
                  return (
                    <div key={p.id} onClick={() => go("/noticias")} style={{cursor: "pointer"}}>
                      <NewsCard
                        cat={`${p.category || "Aim"} · ${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`}
                        color={color}
                        img={p.cover_image_url || null}
                        ph={p.category || "aim"}
                        title={p.title}
                        date={{ d: String(d.getDate()).padStart(2, "0"), m: MONTH_ABBR[d.getMonth()] }}
                        body={p.excerpt || ""} />
                    </div>
                  );
                })}
              </div>

              <div className="calendar-card">
                <h3>Próximos eventos</h3>
                {events.length === 0 && (
                  <p style={{fontSize: 13, opacity: .85, marginBottom: 12}}>No hay eventos próximos publicados.</p>
                )}
                {events.slice(0, 3).map(ev => {
                  const d = new Date(ev.date);
                  const sub = [ev.time, ev.venue].filter(Boolean).join(" · ");
                  return (
                    <div key={ev.id} className="cal-event" onClick={() => go("/calendario")}>
                      <div className="date"><div className="d">{d.getDate()}</div><div className="m">{MONTH_ABBR[d.getMonth()]}</div></div>
                      <div className="info">
                        <h5>{ev.title}</h5>
                        <p>{sub || "Evento del club"}</p>
                      </div>
                    </div>
                  );
                })}
                <button className="btn btn-primary btn-block" onClick={() => go("/calendario")} style={{background: "white", color: "var(--ink)"}}>
                  Ver calendario completo
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ===== Sobre nosotros ===== */}
        <section className="block">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow pink">Sobre nosotros</span>
                <h2 className="section-title">Una formación <MagicText>integral</MagicText> y con valores.</h2>
              </div>
            </div>

            <div className="values-grid">
              <div className="about-block">
                <p>
                  <b>Nuestra misión</b> es proporcionar una formación integral, fomentando los valores
                  fundamentales entre nuestros alumnos en un entorno de respeto y tolerancia.
                  Utilizamos una amplia variedad de actividades como herramienta principal en nuestro
                  programa educativo, diseñadas y organizadas para adaptarse específicamente a las
                  características de cada grupo.
                </p>
                <p>
                  Nuestras actividades se clasifican por <b>grupos de edad</b>, cubriendo desde los 3 años
                  hasta la edad adulta. Este enfoque nos permite ofrecer una enseñanza que se ajusta
                  perfectamente a la edad y las necesidades individuales de cada estudiante. Además,
                  limitamos el número de plazas en todas nuestras actividades para garantizar
                  ambientes de trabajo reducidos y la atención más personalizada posible.
                </p>
              </div>

              <div style={{display: "grid", gap: 14}}>
                <div className="value-card v-innov">
                  <div className="icon"><I.Bulb /></div>
                  <h4>Innovación</h4>
                  <p>Perseguimos la innovación para ofrecer <b>nuevas oportunidades</b> a nuestros alumnos.</p>
                </div>
                <div className="value-card v-excel">
                  <div className="icon"><I.Trophy /></div>
                  <h4>Excelencia</h4>
                  <p>Nos exigimos lo mejor para ofrecer <b>excelencia</b> en nuestros servicios.</p>
                </div>
                <div className="value-card v-passion">
                  <div className="icon"><I.Heart /></div>
                  <h4>Pasión</h4>
                  <p>Sentimos <b>pasión</b> por nuestro trabajo. Disfrutamos de cada clase.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== CTA ===== */}
        <section className="block tight">
          <div className="container">
            <div style={{
              background: "var(--grad-aim)",
              borderRadius: 36,
              padding: "64px 56px",
              color: "white",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
              boxShadow: "var(--shadow-lg)",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.2))",
                pointerEvents: "none",
              }}/>
              <div style={{position: "relative"}}>
                <h2 style={{fontFamily: "var(--font-display)", fontSize: "clamp(34px, 4.4vw, 56px)", fontWeight: 800, letterSpacing: "-.035em", margin: 0, lineHeight: 1.05}}>
                  ¿Listo para empezar este curso?
                </h2>
                <p style={{fontSize: 18, maxWidth: 540, margin: "18px auto 0", color: "rgba(255,255,255,.92)"}}>
                  Reserva tu plaza online. Tu primera clase es de prueba y sin compromiso.
                </p>
                <div style={{display: "flex", gap: 12, justifyContent: "center", marginTop: 28, flexWrap: "wrap"}}>
                  <button className="btn btn-lg" style={{background: "var(--ink)", color: "white"}} onClick={() => go("/auth?mode=register")}>
                    Reservar plaza <I.Arrow />
                  </button>
                  <button className="btn btn-lg btn-outline" style={{background: "transparent", borderColor: "rgba(255,255,255,.5)", color: "white"}} onClick={() => go("/actividades")}>
                    Ver horarios
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <AimFooter />
      </main>
    </>
  );
}
