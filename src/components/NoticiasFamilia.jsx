import React, { useState, useEffect } from 'react';
import { useRouter } from '../App.jsx';
import { aMedida } from '../imagenes.js';
import { HtmlConVideos } from './VideoYoutube.jsx';
import { NewsCard, catColor, MONTH_ABBR, renderMd } from './PublicActivities.jsx';
import { marcarAvisosVistos } from './Campanita.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Noticias en el área de familias (#511): todas las publicadas y, al tocar una,
// entera aquí mismo (/dashboard/noticias/<slug>), sin salir a la web. Al leerla,
// su aviso de la campanita se da por visto.
// ─────────────────────────────────────────────────────────────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const POR_TANDA = 12;

export default function NoticiasFamilia({ slug = null }) {
  return slug ? <Noticia slug={slug} /> : <ListaNoticias />;
}

function ListaNoticias() {
  const { go } = useRouter();
  const [posts, setPosts] = useState(null);
  const [cuantas, setCuantas] = useState(POR_TANDA);
  useEffect(() => {
    fetch('/api/posts?limit=100').then(r => (r.ok ? r.json() : [])).then(d => setPosts(Array.isArray(d) ? d : [])).catch(() => setPosts([]));
  }, []);
  if (!posts) return <div className="panel"><p style={{ margin: 0, color: 'var(--ink-3)' }}>Cargando noticias…</p></div>;
  if (!posts.length) return <div className="panel"><p style={{ margin: 0, color: 'var(--ink-3)' }}>Aún no hay noticias publicadas.</p></div>;
  return (
    <div style={{ display: 'grid', gap: 16 }} data-noticias-familia>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 16 }}>
        {posts.slice(0, cuantas).map(p => {
          const d = new Date(p.published_at || p.created_at);
          return (
            <button key={p.id} type="button" data-noticia={p.slug} onClick={() => go(`/dashboard/noticias/${p.slug}`)}
              style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
              <NewsCard cat={p.category || 'Aim'} color={catColor(p.category)} img={p.cover_image_url || null} ph={p.category || 'aim'} title={p.title}
                date={{ d: String(d.getDate()).padStart(2, '0'), m: MONTH_ABBR[d.getMonth()] }} body={p.excerpt || ''} />
            </button>
          );
        })}
      </div>
      {posts.length > cuantas && <button type="button" className="btn btn-outline" style={{ justifySelf: 'center' }} onClick={() => setCuantas(n => n + POR_TANDA)}>Ver más noticias</button>}
    </div>
  );
}

function Noticia({ slug }) {
  const { go } = useRouter();
  const [post, setPost] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    setPost(null); setError(false);
    fetch(`/api/posts/${encodeURIComponent(slug)}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { setPost(d); marcarAvisosVistos([{ clave: `noticia:${d.id}`, n: 1 }]); window.scrollTo({ top: 0 }); })
      .catch(() => setError(true));
  }, [slug]);
  const volver = <button type="button" className="btn btn-ghost" style={{ padding: '6px 0', fontWeight: 600, justifySelf: 'start' }} onClick={() => go('/dashboard/noticias')}>← Todas las noticias</button>;
  if (error) return <div className="panel" style={{ display: 'grid', gap: 12 }}>{volver}<p style={{ margin: 0, color: 'var(--ink-3)' }}>Esta noticia ya no está publicada.</p></div>;
  if (!post) return <div className="panel"><p style={{ margin: 0, color: 'var(--ink-3)' }}>Cargando…</p></div>;
  const d = new Date(post.published_at || post.created_at), color = catColor(post.category);
  return (
    <article className="panel" style={{ display: 'grid', gap: 18, maxWidth: 820 }} data-noticia-abierta={post.slug}>
      {volver}
      {post.cover_image_url && <img src={aMedida(post.cover_image_url, 1600)} alt={post.title} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 14 }} />}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="filter-pill is-active" style={{ background: color, borderColor: color, color: 'white', pointerEvents: 'none' }}>{post.category || 'Aim'}</span>
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{`${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`}</span>
      </div>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(24px, 3.4vw, 36px)', letterSpacing: '-.03em', lineHeight: 1.15 }}>{post.title}</h2>
      <HtmlConVideos className="post-content" html={post.formato === 'html' ? post.content : renderMd(post.content)} />
      {volver}
    </article>
  );
}
