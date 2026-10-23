// ─────────────────────────────────────────────────────────────────────────────
// Quitar el fondo de una foto, en el propio navegador: sin servicios de fuera
// ni pagar por uso. Usa U²-Net en pequeño (u2netp, licencia Apache 2.0, 4,5 MB)
// con onnxruntime-web (MIT): saca una máscara de lo que destaca en la foto
// (una persona, un objeto) y se la pone como transparencia. El modelo se
// descarga la primera vez y el navegador lo guarda.
// ─────────────────────────────────────────────────────────────────────────────
// Los dos archivos del motor (Vite no los ve solo: se enlazan aquí para que los copie).
import ortMjs from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import ortWasm from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';

const LADO = 320;   // lo que pide el modelo
let sesion = null;
function laSesion() {
  if (!sesion) {
    sesion = (async () => {
      const ort = await import('onnxruntime-web/wasm');
      ort.env.wasm.numThreads = 1;   // sin aislamiento entre orígenes, un solo hilo
      ort.env.wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm };
      const modelo = new URL('./modelos/u2netp.onnx', import.meta.url).href;
      return { ort, s: await ort.InferenceSession.create(modelo, { executionProviders: ['wasm'] }) };
    })().catch(e => { sesion = null; throw e; });
  }
  return sesion;
}

// Devuelve un canvas con la foto sin fondo (a 1200 px como mucho).
export async function quitarFondo(img) {
  const { ort, s } = await laSesion();
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  // La foto, a 320 × 320 y normalizada como la entrenaron (media y desviación de ImageNet).
  const c = document.createElement('canvas'); c.width = LADO; c.height = LADO;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, LADO, LADO);
  const px = g.getImageData(0, 0, LADO, LADO).data;
  let max = 1;
  for (let i = 0; i < px.length; i += 4) max = Math.max(max, px[i], px[i + 1], px[i + 2]);
  const media = [0.485, 0.456, 0.406], desv = [0.229, 0.224, 0.225], n = LADO * LADO, entrada = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) entrada[k * n + i] = (px[i * 4 + k] / max - media[k]) / desv[k];
  const salida = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', entrada, [1, 3, LADO, LADO]) });
  const m = salida[s.outputNames[0]].data;
  let mi = Infinity, ma = -Infinity;
  for (const v of m) { if (v < mi) mi = v; if (v > ma) ma = v; }
  // La máscara, en un canvas pequeño que luego se estira (suaviza el borde).
  const mc = document.createElement('canvas'); mc.width = LADO; mc.height = LADO;
  const mg = mc.getContext('2d'), md = mg.createImageData(LADO, LADO);
  for (let i = 0; i < n; i++) {
    const v = (m[i] - mi) / (ma - mi || 1), a = Math.max(0, Math.min(1, (v - 0.08) / 0.84));
    md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = 0; md.data[i * 4 + 3] = Math.round(a * 255);
  }
  mg.putImageData(md, 0, 0);
  const k = Math.min(1, 1200 / Math.max(iw, ih)), W = Math.round(iw * k), H = Math.round(ih * k);
  const r = document.createElement('canvas'); r.width = W; r.height = H;
  const rg = r.getContext('2d');
  rg.drawImage(mc, 0, 0, W, H);
  rg.globalCompositeOperation = 'source-in';
  rg.drawImage(img, 0, 0, W, H);
  return r;
}
