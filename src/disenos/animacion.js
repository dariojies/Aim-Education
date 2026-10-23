// ─────────────────────────────────────────────────────────────────────────────
// Historias animadas: el diseño (una página) con las animaciones de sus
// elementos, en GIF o en vídeo. Todo en el navegador:
//  · GIF con gifenc (fotograma a fotograma, a 12 por segundo y más pequeño:
//    un GIF grande pesa muchísimo);
//  · vídeo grabando el lienzo mientras se reproduce (MediaRecorder): MP4 si el
//    navegador sabe (Chrome, Safari, Edge al día), si no WebM. Tarda lo que dura.
//    Con música (animacion.musica: { url, desde, volumen }), se mezcla con un
//    fundido al final.
// ─────────────────────────────────────────────────────────────────────────────
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { cargarFuentes, cargarImagenes, pintarDiseno, duracionAnimacion, nombreArchivo, descargar } from './render.js';

async function preparar(diseno, ancho) {
  await cargarFuentes(diseno);
  const imagenes = await cargarImagenes(diseno);
  const k = ancho / diseno.ancho;
  const c = document.createElement('canvas');
  c.width = Math.round(diseno.ancho * k); c.height = Math.round(diseno.alto * k);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const pintar = (t) => { ctx.setTransform(k, 0, 0, k, 0, 0); pintarDiseno(ctx, diseno, { imagenes, tiempo: t }); };
  return { c, ctx, pintar };
}

export async function exportarGif(diseno, nombre, { ancho = 540, fps = 12, onProgreso } = {}) {
  const dur = duracionAnimacion(diseno), n = Math.round(dur * fps);
  const { c, ctx, pintar } = await preparar(diseno, Math.min(ancho, diseno.ancho));
  const gif = GIFEncoder();
  for (let i = 0; i < n; i++) {
    pintar(i / fps);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const paleta = quantize(data, 256);
    gif.writeFrame(applyPalette(data, paleta), c.width, c.height, { palette: paleta, delay: Math.round(1000 / fps) });
    onProgreso?.(i + 1, n);
    if (i % 6 === 5) await new Promise(r => setTimeout(r, 0));   // que la pantalla respire
  }
  gif.finish();
  descargar(new Blob([gif.bytes()], { type: 'image/gif' }), `${nombreArchivo(nombre)}.gif`);
}

// El formato de vídeo que sabe grabar este navegador (MP4 antes que WebM).
export function formatoVideo(conAudio = false) {
  if (typeof MediaRecorder === 'undefined') return null;
  const tipos = conAudio
    ? ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const t = tipos.find(x => MediaRecorder.isTypeSupported(x));
  return t ? { tipo: t, mime: t.split(';')[0], ext: t.startsWith('video/mp4') ? 'mp4' : 'webm' } : null;
}

// Graba el vídeo y devuelve { blob, mime, ext, ancho, alto }.
export async function grabarVideo(diseno, { ancho = 1080, fps = 30, onProgreso } = {}) {
  const musica = diseno.animacion?.musica;
  const f = formatoVideo(!!musica?.url);
  if (!f) throw new Error('Este navegador no sabe hacer vídeos. Prueba con Chrome o con el GIF.');
  const dur = duracionAnimacion(diseno);
  // Los vídeos, con medidas pares (lo piden los códecs).
  const { c, pintar } = await preparar(diseno, Math.min(ancho, diseno.ancho) - (Math.min(ancho, diseno.ancho) % 2));
  if (c.height % 2) c.height -= 1;
  pintar(0);
  const flujo = c.captureStream(fps);
  // La música: se descodifica y se mete en el vídeo como pista de sonido.
  let sonido = null;
  if (musica?.url) {
    const ac = new AudioContext();
    await ac.resume().catch(() => {});
    const buf = await ac.decodeAudioData(await (await fetch(musica.url)).arrayBuffer());
    const fuente = ac.createBufferSource(), vol = ac.createGain(), destino = ac.createMediaStreamDestination();
    fuente.buffer = buf; vol.gain.value = musica.volumen ?? 0.8;
    fuente.connect(vol).connect(destino);
    destino.stream.getAudioTracks().forEach(t => flujo.addTrack(t));
    sonido = { ac, fuente, vol };
  }
  const rec = new MediaRecorder(flujo, { mimeType: f.tipo, videoBitsPerSecond: 8_000_000 });
  const trozos = [];
  rec.ondataavailable = (ev) => { if (ev.data?.size) trozos.push(ev.data); };
  const fin = new Promise(ok => { rec.onstop = ok; });
  rec.start(250);
  if (sonido) {
    const { ac, fuente, vol } = sonido, ahora = ac.currentTime, v = musica.volumen ?? 0.8;
    fuente.start(0, Math.max(0, musica.desde || 0));
    // Fundido en el último segundo.
    vol.gain.setValueAtTime(v, ahora + Math.max(0, dur - 1)); vol.gain.linearRampToValueAtTime(0, ahora + dur + 0.2);
  }
  const t0 = performance.now();
  await new Promise(ok => {
    const paso = () => {
      const t = (performance.now() - t0) / 1000;
      pintar(Math.min(t, dur));
      onProgreso?.(Math.min(t, dur), dur);
      if (t < dur + 0.25) requestAnimationFrame(paso); else ok();
    };
    requestAnimationFrame(paso);
  });
  rec.stop(); flujo.getTracks().forEach(t => t.stop());
  if (sonido) { try { sonido.fuente.stop(); } catch { /* ya parada */ } sonido.ac.close().catch(() => {}); }
  await fin;
  return { blob: new Blob(trozos, { type: f.mime }), mime: f.mime, ext: f.ext, ancho: c.width, alto: c.height };
}

export async function exportarVideo(diseno, nombre, opciones) {
  const v = await grabarVideo(diseno, opciones);
  descargar(v.blob, `${nombreArchivo(nombre)}.${v.ext}`);
  return v;
}
