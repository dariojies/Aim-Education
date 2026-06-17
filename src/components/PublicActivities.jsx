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
                    <div key={p.id} style={{cursor: "pointer"}} onClick={() => go(`/noticias/${p.slug}`)}>
                      <NewsCard
                        cat={p.category || "Aim"}
                        color={color}
                        img={p.cover_image_url || null}
                        ph={p.category || "aim"}
                        title={p.title}
                        date={{ d: String(d.getDate()).padStart(2, "0"), m: MONTH_ABBR[d.getMonth()] }}
                        body={p.excerpt || ""}
                      />
                    </div>
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

function renderMd(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>');
  return html.split(/\n\n+/).map(block => {
    if (/^<h[2-4]/.test(block.trim())) return block;
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}

const MONTH_LONG = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

export function PublicNewsDetail({ slug }) {
  const { go } = useRouter();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true); setNotFound(false); setPost(null);
    fetch(`/api/posts/${slug}`)
      .then(r => { if (r.status === 404) { setNotFound(true); setLoading(false); return null; } return r.json(); })
      .then(d => { if (d) { setPost(d); } setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <>
      <AimHeader route="news" />
      <main style={{paddingTop: 0}}>
        <section className="block tight"><div className="container"><p style={{color: "var(--ink-3)"}}>Cargando…</p></div></section>
        <AimFooter />
      </main>
    </>
  );

  if (notFound || !post) return (
    <>
      <AimHeader route="news" />
      <main style={{paddingTop: 0}}>
        <section className="block tight">
          <div className="container" style={{textAlign: "center", padding: "80px 0"}}>
            <div style={{fontSize: 64, marginBottom: 16}}>📰</div>
            <h1 className="title-display">Noticia no encontrada</h1>
            <p style={{color: "var(--ink-3)", marginTop: 12}}>Esta entrada no existe o ha sido eliminada.</p>
            <button className="btn btn-outline" style={{marginTop: 28}} onClick={() => go("/noticias")}>← Volver a noticias</button>
          </div>
        </section>
        <AimFooter />
      </main>
    </>
  );

  const d = new Date(post.published_at || post.created_at);
  const dateStr = `${d.getDate()} de ${MONTH_LONG[d.getMonth()]} de ${d.getFullYear()}`;
  const color = catColor(post.category);

  return (
    <>
      <AimHeader route="news" />
      <main style={{paddingTop: 0}}>
        <section className="block tight">
          <div className="container">
            <div style={{maxWidth: 760, margin: "0 auto"}}>
              <button className="btn btn-ghost" style={{marginBottom: 28, padding: "6px 0", fontSize: 14, fontWeight: 600}} onClick={() => go("/noticias")}>
                ← Volver a noticias
              </button>

              {post.cover_image_url && (
                <img
                  src={post.cover_image_url}
                  alt={post.title}
                  style={{width: "100%", height: 320, objectFit: "cover", borderRadius: 18, marginBottom: 32, display: "block", boxShadow: "var(--shadow)"}}
                />
              )}

              <div style={{display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 20}}>
                <span className="filter-pill is-active" style={{background: color, borderColor: color, color: "white", pointerEvents: "none"}}>
                  {post.category || "Aim"}
                </span>
                <span style={{fontSize: 14, color: "var(--ink-3)"}}>{dateStr}</span>
                {post.author_name && (
                  <span style={{fontSize: 14, color: "var(--ink-3)"}}>por <strong style={{color: "var(--ink-2)"}}>{post.author_name}</strong></span>
                )}
              </div>

              <h1 style={{fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-.035em", lineHeight: 1.1, marginBottom: 32, color: "var(--ink)"}}>
                {post.title}
              </h1>

              <div
                className="post-content"
                dangerouslySetInnerHTML={{ __html: renderMd(post.content) }}
              />

              <div style={{marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12}}>
                <span style={{fontSize: 13, color: "var(--ink-3)"}}>{(post.view_count || 0) + 1} visita{(post.view_count || 0) + 1 !== 1 ? 's' : ''}</span>
                <button className="btn btn-outline" onClick={() => go("/noticias")}>← Más noticias</button>
              </div>
            </div>
          </div>
        </section>
        <AimFooter />
      </main>
    </>
  );
}

export default PublicActivities;
