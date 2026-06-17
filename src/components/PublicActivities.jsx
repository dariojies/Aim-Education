import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, ACTIVITIES, ACT_BY_ID } from './Shared.jsx';
import { useRouter } from '../App.jsx';

const CAT_COLOR = { taekwondo: '#21B668', ballet: '#FF99D3', ingles: '#00BBF4', robotica: '#FFD526', baile: '#AF99FF', pintura: '#5233A8', funcional: '#FF4F15', pilates: '#BFD300', camaleon: '#25D8BA', competicion: '#21B668', club: '#5233A8', general: '#5233A8', shelfie: '#FF99D3' };
const catColor = c => CAT_COLOR[c] || '#5233A8';
const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

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

function NewsCard({ cat, color = '#5233A8', img, ph, title, date, body, href }) {
  const inner = (
    <div className="news-card" style={{ height: "100%" }}>
      <div className="img" style={{ background: img ? `center/cover no-repeat url(${img})` : `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 55%, #000))` }}>
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
  return href
    ? <a href={href} style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>{inner}</a>
    : inner;
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
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch('/api/posts?limit=50')
      .then(r => r.ok ? r.json() : [])
      .then(d => { setPosts(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const cats = ["all", ...Array.from(new Set(posts.map(p => p.category).filter(Boolean)))];
  const visible = filter === "all" ? posts : posts.filter(p => p.category === filter);

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
                el equipo.
              </p>
            </div>

            {cats.length > 1 && (
              <div style={{display: "flex", gap: 8, flexWrap: "wrap", marginTop: 32}}>
                {cats.map(c => (
                  <button key={c} className={`filter-pill ${filter === c ? "is-active" : ""}`} onClick={() => setFilter(c)}>
                    {c === "all" ? "Todas" : c}
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <p style={{marginTop: 40, color: "var(--ink-3)"}}>Cargando noticias…</p>
            )}

            {!loading && visible.length === 0 && (
              <div style={{marginTop: 48, textAlign: "center", color: "var(--ink-3)"}}>
                <p style={{fontSize: 18, fontWeight: 600}}>Aún no hay noticias publicadas.</p>
                <p style={{fontSize: 14, marginTop: 8}}>Vuelve pronto — el equipo publicará novedades aquí.</p>
              </div>
            )}

            {!loading && visible.length > 0 && (
              <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginTop: 40}}>
                {visible.map(p => {
                  const d = new Date(p.published_at || p.created_at);
                  const color = catColor(p.category);
                  return (
                    <NewsCard
                      key={p.id}
                      cat={p.category || "Aim"}
                      color={color}
                      img={p.cover_image_url || null}
                      ph={p.category || "aim"}
                      title={p.title}
                      date={{ d: String(d.getDate()).padStart(2, "0"), m: MONTH_ABBR[d.getMonth()] }}
                      body={p.excerpt || ""}
                      href={`/noticias/${p.slug}`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <AimFooter />
      </main>
    </>
  );
}

export default PublicActivities;
