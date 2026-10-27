// ─────────────────────────────────────────────────────────────────────────────
// Vídeos de Aim Design en el navegador (la tele de recepción). render.js pinta el
// fotograma que tenga cada <video>; aquí se suben, se cargan y se ponen en su
// sitio de la línea de tiempo (ver tramoVideo en render.js). Siempre sin sonido:
// la tele está en un escaparate y así los navegadores dejan reproducirlos solos.
// ─────────────────────────────────────────────────────────────────────────────
import { tramoVideo, TRANSICION } from './render.js';

const api = async (url, opciones = {}) => {
  const r = await fetch(url, { credentials: 'include', ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `No se ha podido (${r.status}).`);
  return d;
};

// Mira el vídeo antes de subirlo: si el navegador lo lee, cuánto dura, qué mide y
// una portada (un fotograma del principio, en JPEG).
function mirarVideo(file) {
  return new Promise((ok, mal) => {
    const v = document.createElement('video'), url = URL.createObjectURL(file);
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    const fuera = setTimeout(() => { URL.revokeObjectURL(url); mal(new Error('Este vídeo no se puede leer en el navegador.')); }, 30000);
    v.onerror = () => { clearTimeout(fuera); URL.revokeObjectURL(url); mal(new Error('Este navegador no puede leer ese vídeo. Si es de un iPhone (HEVC), pásalo antes a MP4 (H.264): en el iPhone, Ajustes → Cámara → Formatos → «Más compatible».')); };
    v.onloadedmetadata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 3); };
    v.onseeked = () => {
      clearTimeout(fuera);
      if (!v.videoWidth) { URL.revokeObjectURL(url); mal(new Error('Este vídeo no tiene imagen (¿es solo sonido?).')); return; }
      const k = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      c.toBlob(b => { URL.revokeObjectURL(url); ok({ duracion: v.duration, ancho: v.videoWidth, alto: v.videoHeight, portada: b }); }, 'image/jpeg', 0.82);
    };
  });
}

// Sube un vídeo (por trozos) y devuelve { url, poster, duracion, ancho, alto }.
export async function subirVideo(file, onProgreso) {
  if (!file || !/^video\//.test(file.type)) throw new Error('Eso no es un vídeo.');
  if (file.size > 100 * 1024 * 1024) throw new Error('El vídeo pasa de 100 MB. Recórtalo o bájale la calidad antes de subirlo.');
  const info = await mirarVideo(file);
  const mime = file.type === 'video/quicktime' ? 'video/quicktime' : file.type;
  const { id, trozo } = await api('/api/admin/disenos/videos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: file.name, mime, bytes: file.size, duracion: info.duracion, ancho: info.ancho, alto: info.alto }),
  });
  const n = Math.ceil(file.size / trozo);
  for (let i = 0; i < n; i++) {
    const parte = file.slice(i * trozo, Math.min(file.size, (i + 1) * trozo));
    // Si un trozo falla (la red), se reintenta un par de veces.
    for (let intento = 0; ; intento++) {
      try { await api(`/api/admin/disenos/videos/${id}/trozos/${i}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: parte }); break; }
      catch (e) { if (intento >= 2) throw e; await new Promise(r => setTimeout(r, 1500)); }
    }
    onProgreso?.((i + 1) / n);
  }
  if (info.portada) await api(`/api/admin/disenos/videos/${id}/portada`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: info.portada });
  const fin = await api(`/api/admin/disenos/videos/${id}/fin`, { method: 'POST' });
  return { url: fin.url, poster: fin.poster, duracion: info.duracion, ancho: info.ancho, alto: info.alto };
}

// Los <video> de un diseño (una página o todas), listos para pintar: url → elemento.
const cache = new Map();
function cargarUno(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise(ok => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = url;
      const listo = () => { clearTimeout(fuera); ok(v); };
      const fuera = setTimeout(() => ok(v), 15000);
      v.addEventListener('loadeddata', listo, { once: true });
      v.addEventListener('error', () => { clearTimeout(fuera); cache.delete(url); ok(null); }, { once: true });
    }));
  }
  return cache.get(url);
}
export async function cargarVideos(diseno) {
  const urls = [...new Set([...(diseno?.elementos || []), ...(diseno?.paginas || []).flatMap(p => p.elementos || [])].filter(e => e?.tipo === 'video' && e.url).map(e => e.url))];
  const pares = await Promise.all(urls.map(async u => [u, await cargarUno(u)]));
  return new Map(pares.filter(([, v]) => v));
}

// Pone cada vídeo de la página en su segundo t. Reproduciendo: los que tocan van
// solos (y se corrigen si se desvían); los demás, parados. Quieto (t null, o
// mirando un segundo concreto): cada uno en su fotograma. avisar() se llama cuando
// un vídeo quieto ya tiene su fotograma, para volver a pintar.
export function sincronizarVideos(videos, pagina, t, reproduciendo, avisar = null) {
  if (!videos?.size) return;
  const usados = new Set();
  for (const e of pagina?.elementos || []) {
    if (e?.tipo !== 'video') continue;
    const v = videos.get(e.url); if (!v || usados.has(v)) continue;
    usados.add(v);
    const tv = tramoVideo(e), local = t == null ? 0 : t - tv.empieza;
    // En bucle (#495): vuelve a empezar cada vez que acaba su tramo.
    const enTramo = e.bucle ? ((local % tv.dura) + tv.dura) % tv.dura : local;
    const objetivo = tv.desde + Math.max(0, Math.min(tv.dura - 0.05, enTramo));
    v.loop = !!e.bucle && tv.desde < 0.05 && Math.abs(tv.hasta - (Number(e.duracionVideo) || tv.hasta)) < 0.05;
    if (reproduciendo && t != null && local >= 0 && (local < tv.dura || e.bucle)) {
      if (Math.abs(v.currentTime - objetivo) > 0.35) v.currentTime = objetivo;
      if (v.paused) v.play().catch(() => {});
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - objetivo) > 0.04) {
        if (avisar) v.addEventListener('seeked', avisar, { once: true });
        v.currentTime = objetivo;
      }
    }
  }
}
export function pararVideos(videos) { for (const v of videos?.values?.() || []) if (!v.paused) v.pause(); }

// ── Clips: los vídeos de una página, uno detrás de otro ──
// El que entra con fundido o deslizando empieza TRANSICION segundos antes de que
// acabe el anterior (pasa por encima de él).
const finDe = (e) => { const t = tramoVideo(e); return t.empieza + t.dura; };
const entraDe = (e) => (e.transicion && e.transicion !== 'corte' ? TRANSICION : 0);
export const clipsDe = (pagina) => (pagina?.elementos || []).filter(e => e?.tipo === 'video' && !e.oculto && !e.bucle).sort((a, b) => tramoVideo(a).empieza - tramoVideo(b).empieza);
// ¿Van seguidos (cada uno donde acaba el anterior)?
export function enCadena(clips) {
  return clips.length > 1 && clips.every((e, k) => !k || Math.abs(tramoVideo(e).empieza - Math.max(0, finDe(clips[k - 1]) - entraDe(e))) < 0.15);
}
// Los elementos con los clips de ids (en ese orden) puestos uno detrás de otro.
export function encadenar(elementos, ids) {
  const nuevos = new Map();
  let t = 0;
  ids.forEach((id, k) => {
    const e = elementos.find(x => x.id === id); if (!e) return;
    const empieza = k ? Math.max(0, Math.round((t - entraDe(e)) * 100) / 100) : 0;
    nuevos.set(id, empieza);
    t = empieza + tramoVideo(e).dura;
  });
  return elementos.map(e => (nuevos.has(e.id) ? { ...e, empieza: nuevos.get(e.id) } : e));
}
