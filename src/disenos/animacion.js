// ─────────────────────────────────────────────────────────────────────────────
// Historias animadas: el diseño (una página) con las animaciones de sus
// elementos, en GIF o en vídeo. Todo en el navegador:
//  · GIF con gifenc (fotograma a fotograma, a 12 por segundo y más pequeño:
//    un GIF grande pesa muchísimo);
//  · vídeo grabando el lienzo mientras se reproduce (MediaRecorder): MP4 si el
//    navegador sabe (Chrome, Safari, Edge al día), si no WebM. Tarda lo que dura.
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
export function formatoVideo() {
  if (typeof MediaRecorder === 'undefined') return null;
  const tipos = ['video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const t = tipos.find(x => MediaRecorder.isTypeSupported(x));
  return t ? { tipo: t, mime: t.split(';')[0], ext: t.startsWith('video/mp4') ? 'mp4' : 'webm' } : null;
}

// Graba el vídeo y devuelve { blob, mime, ext, ancho, alto }.
export async function grabarVideo(diseno, { ancho = 1080, fps = 30, onProgreso } = {}) {
  const f = formatoVideo();
  if (!f) throw new Error('Este navegador no sabe hacer vídeos. Prueba con Chrome o con el GIF.');
  const dur = duracionAnimacion(diseno);
  // Los vídeos, con medidas pares (lo piden los códecs).
  const { c, pintar } = await preparar(diseno, Math.min(ancho, diseno.ancho) - (Math.min(ancho, diseno.ancho) % 2));
  if (c.height % 2) c.height -= 1;
  pintar(0);
  const flujo = c.captureStream(fps);
  const rec = new MediaRecorder(flujo, { mimeType: f.tipo, videoBitsPerSecond: 8_000_000 });
  const trozos = [];
  rec.ondataavailable = (ev) => { if (ev.data?.size) trozos.push(ev.data); };
  const fin = new Promise(ok => { rec.onstop = ok; });
  rec.start(250);
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
  await fin;
  return { blob: new Blob(trozos, { type: f.mime }), mime: f.mime, ext: f.ext, ancho: c.width, alto: c.height };
}

export async function exportarVideo(diseno, nombre, opciones) {
  const v = await grabarVideo(diseno, opciones);
  descargar(v.blob, `${nombreArchivo(nombre)}.${v.ext}`);
  return v;
}
