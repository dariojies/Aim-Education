import React, { useState, useEffect } from 'react';
import { AimHeader, AimFooter } from './Shared.jsx';
import { useRouter } from '../App.jsx';

const CAT_LABEL = {
  general: 'General', club: 'Noticias del Club', taekwondo: 'Taekwondo',
  ballet: 'Ballet', ingles: 'Inglés', robotica: 'Robótica',
  funcional: 'Funcional', pintura: 'Pintura', camaleon: 'Camaleón',
  shelfie: 'Shelfie', competicion: 'Competición',
};

const CAT_CLS = {
  taekwondo: 'act-taekwondo', ballet: 'act-ballet', ingles: 'act-ingles',
  robotica: 'act-robotica', funcional: 'act-funcional', pintura: 'act-pintura',
  camaleon: 'act-camaleon',
};

function renderContent(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const blocks = [];
  let paragraphLines = [];

  function flushParagraph() {
    if (paragraphLines.length) {
      blocks.push({ type: 'p', text: paragraphLines.join('\n') });
      paragraphLines = [];
    }
  }

  for (const line of lines) {
    if (line.startsWith('# ')) { flushParagraph(); blocks.push({ type: 'h1', text: line.slice(2) }); }
    else if (line.startsWith('## ')) { flushParagraph(); blocks.push({ type: 'h2', text: line.slice(3) }); }
    else if (line.startsWith('### ')) { flushParagraph(); blocks.push({ type: 'h3', text: line.slice(4) }); }
    else if (line === '') { flushParagraph(); }
    else { paragraphLines.push(line); }
  }
  flushParagraph();
  return blocks;
}

function inlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

export default function PublicNewsArticle({ slug }) {
  const { go } = useRouter();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    fetch(`/api/posts/slug/${encodeURIComponent(slug)}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        if (!r.ok) throw new Error('error');
        return r.json();
      })
      .then(data => { if (data) { setPost(data); setLoading(false); } })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [slug]);

  const catCls = post ? (CAT_CLS[post.category] || '') : '';
  const catLabel = post ? (CAT_LABEL[post.category] || post.category) : '';
  const publishDate = post ? new Date(post.published_at || post.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <>
      <AimHeader route="news" />
      <main style={{ paddingTop: 0 }}>
        {loading && (
          <section className="block tight">
            <div className="container" style={{ maxWidth: 780 }}>
              <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--ink-3)' }}>
                Cargando noticia...
              </div>
            </div>
          </section>
        )}

        {!loading && notFound && (
          <section className="block tight">
            <div className="container" style={{ maxWidth: 780 }}>
              <div style={{ padding: '80px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>📰</div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800 }}>Noticia no encontrada</h1>
                <p style={{ color: 'var(--ink-3)', marginTop: 10 }}>Esta entrada no existe o ha sido eliminada.</p>
                <button className="btn btn-outline" style={{ marginTop: 24 }} onClick={() => go('/noticias')}>
                  ← Volver a noticias
                </button>
              </div>
            </div>
          </section>
        )}

        {!loading && post && (
          <>
            <section className={`block tight ${catCls}`} style={{ paddingBottom: 0 }}>
              <div className="container" style={{ maxWidth: 780 }}>
                <button
                  onClick={() => go('/noticias')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, padding: 0, marginBottom: 24 }}
                >
                  ← Volver a noticias
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--act, var(--teal))' }}>{catLabel}</span>
                  <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>·</span>
                  <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>{publishDate}</span>
                </div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.1, margin: 0 }}>
                  {post.title}
                </h1>
                {post.excerpt && (
                  <p style={{ fontSize: 18, color: 'var(--ink-2)', marginTop: 16, lineHeight: 1.6 }}>{post.excerpt}</p>
                )}
                {post.author_name && (
                  <div style={{ marginTop: 20, fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>
                    Por {post.author_name}
                  </div>
                )}
              </div>
            </section>

            {post.cover_image_url && (
              <div className="container" style={{ maxWidth: 780, paddingTop: 32 }}>
                <img
                  src={post.cover_image_url}
                  alt={post.title}
                  style={{ width: '100%', borderRadius: 20, objectFit: 'cover', maxHeight: 420, border: '1px solid var(--line)' }}
                />
              </div>
            )}

            <section className="block tight">
              <div className="container" style={{ maxWidth: 780 }}>
                <div style={{ fontSize: 17, lineHeight: 1.75, color: 'var(--ink-2)' }}>
                  {renderContent(post.content).map((block, i) => {
                    if (block.type === 'h1') return <h2 key={i} style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, margin: '36px 0 12px', color: 'var(--ink)' }} dangerouslySetInnerHTML={{ __html: inlineMarkdown(block.text) }} />;
                    if (block.type === 'h2') return <h3 key={i} style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, margin: '28px 0 10px', color: 'var(--ink)' }} dangerouslySetInnerHTML={{ __html: inlineMarkdown(block.text) }} />;
                    if (block.type === 'h3') return <h4 key={i} style={{ fontSize: 17, fontWeight: 700, margin: '22px 0 8px', color: 'var(--ink)' }} dangerouslySetInnerHTML={{ __html: inlineMarkdown(block.text) }} />;
                    return <p key={i} style={{ marginBottom: 18 }} dangerouslySetInnerHTML={{ __html: inlineMarkdown(block.text.replace(/\n/g, '<br>')) }} />;
                  })}
                </div>

                <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <button className="btn btn-outline" onClick={() => go('/noticias')}>← Más noticias</button>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Aim Education · Algeciras</span>
                </div>
              </div>
            </section>
          </>
        )}

        <AimFooter />
      </main>
    </>
  );
}
