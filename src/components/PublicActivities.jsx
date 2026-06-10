import React, { useState, useEffect } from 'react';
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

const CAT_ACT = {
  taekwondo: 'act-taekwondo', ballet: 'act-ballet', ingles: 'act-ingles',
  robotica: 'act-robotica', funcional: 'act-funcional', pintura: 'act-pintura',
  camaleon: 'act-camaleon',
};
const CAT_BG = {
  general: 'bg-general', club: 'bg-club', taekwondo: 'bg-taekwondo', ballet: 'bg-ballet',
  ingles: 'bg-ingles', robotica: 'bg-robotica', funcional: 'bg-funcional',
  pintura: 'bg-pintura', camaleon: 'bg-camaleon',
};
const CAT_LABEL = {
  general: 'General', club: 'Noticias del Club', taekwondo: 'Taekwondo',
  ballet: 'Ballet', ingles: 'Inglés', robotica: 'Robótica',
  funcional: 'Funcional', pintura: 'Pintura', camaleon: 'Camaleón',
  competicion: 'Competición',
};

function fmtDate(iso) {
  const d = new Date(iso);
  return {
    d: String(d.getDate()).padStart(2, '0'),
    m: d.toLocaleDateString('es-ES', { month: 'short' }).slice(0, 3).toUpperCase(),
  };
}

function ApiNewsCard({ post, onClick }) {
  const cat = post.category || 'general';
  const actCls = CAT_ACT[cat] || '';
  const bgCls = CAT_BG[cat] || 'bg-general';
  const label = CAT_LABEL[cat] || cat;
  const { d, m } = fmtDate(post.published_at || post.created_at);

  return (
    <div
      className={`news-card ${actCls}`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <div className={`img ${bgCls}`}>
        {post.cover_image_url && (
          <img src={post.cover_image_url} alt={post.title} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div className="badge-date"><div className="d">{d}</div><div className="m">{m}</div></div>
      </div>
      <div className="body">
        <span className="cat">{label}</span>
        <h4>{post.title}</h4>
        {post.excerpt && <p>{post.excerpt}</p>}
      </div>
    </div>
  );
}

export function PublicNews() {
  const { go } = useRouter();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/posts?limit=20')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setPosts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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

            {loading ? (
              <div style={{padding: '48px 0', color: 'var(--ink-3)', textAlign: 'center'}}>Cargando noticias...</div>
            ) : posts.length === 0 ? (
              <div style={{padding: '48px 0', color: 'var(--ink-3)', textAlign: 'center'}}>No hay noticias publicadas aún.</div>
            ) : (
              <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginTop: 40}}>
                {posts.map(post => (
                  <ApiNewsCard key={post.id} post={post} onClick={() => go(`/noticias/${post.slug}`)} />
                ))}
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
