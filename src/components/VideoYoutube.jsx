import React from 'react';
import { ContenidoExterno } from './Cookies.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Vídeos de YouTube dentro de las noticias, el blog y el aula virtual (#502).
//
// En el texto de una noticia el vídeo se guarda como
//   <figure class="video-youtube" data-youtube="ID"><a href="…watch?v=ID">…</a></figure>
// (el enlace es lo que ven el correo, el RSS y Google). Al enseñarlo se cambia
// por el reproductor, que solo se carga si se han aceptado los contenidos
// externos (YouTube pone sus cookies), como el vídeo de la portada.
// ─────────────────────────────────────────────────────────────────────────────

// El identificador del vídeo de un enlace de YouTube (watch, youtu.be, shorts,
// embed, live) o null.
export function idYoutube(url) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/) || [])[1];
  return id && /^[\w-]{6,20}$/.test(id) ? id : null;
}

export const htmlVideoYoutube = (id) =>
  `<figure class="video-youtube" data-youtube="${id}"><a href="https://www.youtube.com/watch?v=${id}">▶ Ver el vídeo en YouTube</a></figure>`;

export function VideoYoutube({ id, titulo = 'Vídeo de YouTube' }) {
  return (
    <div className="video-youtube-marco">
      <ContenidoExterno servicio="YouTube" que="el vídeo" style={{ position: 'absolute', inset: 0, borderRadius: 0, border: 0 }}>
        <iframe src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`} title={titulo} loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
      </ContenidoExterno>
    </div>
  );
}

// El HTML de una noticia, con sus vídeos ya como reproductores.
const FIGURA = /<figure class="video-youtube" data-youtube="([\w-]{6,20})">[\s\S]*?<\/figure>/g;
export function HtmlConVideos({ html, className }) {
  const partes = String(html || '').split(FIGURA);
  if (partes.length === 1) return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <div className={className}>
      {partes.map((p, i) => (i % 2
        ? <figure key={i} className="video-youtube"><VideoYoutube id={p} /></figure>
        : p.trim() ? <div key={i} dangerouslySetInnerHTML={{ __html: p }} /> : null))}
    </div>
  );
}
