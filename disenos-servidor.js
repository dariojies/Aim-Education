// ─────────────────────────────────────────────────────────────────────────────
// Pintar diseños de Aim Design en el servidor (#471): la historia de un festivo
// o la felicitación de un cumpleaños salen solas, sin nadie con la web abierta.
// Se pinta con el mismo código que el editor (src/disenos/render.js), sobre el
// canvas de @napi-rs/canvas: las letras se bajan de Google (en TTF) la primera
// vez que hacen falta y las imágenes se piden a la propia web.
// ─────────────────────────────────────────────────────────────────────────────
// La librería del lienzo se carga la primera vez que hace falta: si fallara, solo
// falla esto (no el arranque de la web).
let lib = null;
const canvas = () => (lib = lib || import('@napi-rs/canvas'));

let base = 'http://127.0.0.1:3000';
// La dirección de la propia web, para las imágenes con ruta (/ci/…, /src/brand/…).
export function configurarDisenosServidor({ urlBase }) { if (urlBase) base = String(urlBase).replace(/\/+$/, ''); }

const bajar = async (url) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`${r.status} al pedir ${url.slice(0, 120)}`);
    return Buffer.from(await r.arrayBuffer());
};

// ── Imágenes ──
const imagenes = new Map();
function cargarImagen(url) {
    if (!imagenes.has(url)) {
        if (imagenes.size > 60) imagenes.clear();
        imagenes.set(url, (async () => {
            try {
                const u = String(url);
                const datos = u.startsWith('data:') ? Buffer.from(u.slice(u.indexOf(',') + 1), /;base64,/.test(u.slice(0, u.indexOf(',') + 1)) ? 'base64' : 'utf8')
                    : await bajar(/^https?:\/\//i.test(u) ? u : `${base}${u.startsWith('/') ? '' : '/'}${u}`);
                return await (await canvas()).loadImage(datos);
            } catch (e) {
                console.warn('[diseños] no se ha podido cargar una imagen:', String(url).slice(0, 120), e.message);
                imagenes.delete(url);
                return null;
            }
        })());
    }
    return imagenes.get(url);
}

// ── Letras ──
// Las de Google, con su normal, negrita y cursivas (las que las tengan); las que
// sube el club, de su dirección. Las del sistema (Arial, Georgia…) no están en el
// servidor: salen en Montserrat.
const familias = new Map();
async function familiaGoogle(f) {
    const q = f.trim().replace(/ /g, '+');
    for (const v of [`${q}:ital,wght@0,400;0,700;1,400;1,700`, `${q}:wght@400;700`, q]) {
        const r = await fetch(`https://fonts.googleapis.com/css2?family=${v}&display=swap`, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
        if (!r?.ok) continue;
        const urls = [...(await r.text()).matchAll(/url\((https:[^)]+?\.ttf)\)/g)].map(m => m[1]);
        const { GlobalFonts } = await canvas();
        for (const u of urls) GlobalFonts.register(await bajar(u), f);
        return urls.length;
    }
    return 0;
}
function familia(nombre, url = null) {
    const clave = url ? `${nombre}|${url}` : nombre;
    if (!familias.has(clave)) {
        familias.set(clave, (url ? bajar(/^https?:\/\//i.test(url) ? url : `${base}${url}`).then(async b => (await canvas()).GlobalFonts.register(b, nombre)) : familiaGoogle(nombre))
            .catch(e => { console.warn('[diseños] no se ha podido cargar la letra', nombre, e.message); familias.delete(clave); }));
    }
    return familias.get(clave);
}

// ── El render del editor, con lo de aquí ──
let renderListo = null;
function render() {
    if (!renderListo) {
        renderListo = (async () => {
            const { createCanvas, Path2D } = await canvas();
            if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = Path2D;   // los iconos (formas.js)
            const r = await import('./src/disenos/render.js');
            const deGoogle = new Set(['Montserrat', 'Plus Jakarta Sans', ...r.FUENTES_DISENO.filter(x => x.google).map(x => x.id)]);
            r.usarEntorno({
                lienzo: (w, h) => createCanvas(w, h),
                cargarImagen,
                cargarFuentes: async (elementos) => {
                    const piden = [familia('Montserrat')];
                    for (const e of elementos) {
                        const f = e.fuente || 'Montserrat';
                        if (e.fuenteUrl) piden.push(familia(f, e.fuenteUrl));
                        else if (deGoogle.has(f)) piden.push(familia(f));
                    }
                    await Promise.all(piden);
                },
            });
            return r;
        })().catch(e => { renderListo = null; throw e; });
    }
    return renderListo;
}

// Pinta la primera página de un diseño (datos de aim_disenos) con sus huecos
// rellenos. Devuelve { buf, mime, ancho, alto }: un JPEG (o PNG si se pide).
export async function pintarEnServidor(datos, { variables = null, formato = 'jpeg', calidad = 92 } = {}) {
    const r = await render();
    const d = r.paginaDe(datos, 0);
    const c = await r.lienzoDe(d, { variables });
    const buf = formato === 'png' ? await c.encode('png') : await c.encode('jpeg', calidad);
    return { buf, mime: formato === 'png' ? 'image/png' : 'image/jpeg', ancho: c.width, alto: c.height };
}

// ¿La primera página se mueve (animaciones)? Entonces la historia va en vídeo.
export async function seMueve(datos) {
    const r = await render();
    return r.tieneAnimacion(r.paginaDe(datos, 0));
}

// Graba en MP4 la animación de la primera página (#494): fotograma a fotograma,
// con el mismo pintado del editor, y ffmpeg los junta (H.264 con una pista de
// sonido en silencio, que Instagram la pide a veces). Los vídeos que lleve
// el diseño dentro no se pueden pintar aquí: con alguno, devuelve null.
// Devuelve { buf, mime, ancho, alto, duracion }.
export async function grabarEnServidor(datos, { variables = null, fps = 30 } = {}) {
    const r = await render();
    const d = r.paginaDe(datos, 0);
    if ((d.elementos || []).some(e => e?.tipo === 'video' && !e.oculto)) return null;
    const { createCanvas } = await canvas();
    const { default: ffmpeg } = await import('@ffmpeg-installer/ffmpeg');
    const { spawn } = await import('child_process');
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    await r.cargarFuentes(d);
    const imagenes = await r.cargarImagenes(d);
    // H.264 en 4:2:0 pide medidas pares.
    const W = Math.round(d.ancho / 2) * 2, H = Math.round(d.alto / 2) * 2;
    const c = createCanvas(W, H), ctx = c.getContext('2d');
    // Una historia de Instagram dura al menos 3 segundos: se queda quieta al final.
    const dur = Math.max(3, r.duracionAnimacion(d)), n = Math.round(dur * fps);
    const salida = path.join(os.tmpdir(), `historia-${process.pid}-${Date.now()}.mp4`);
    const p = spawn(ffmpeg.path, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-',
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-shortest',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', salida], { stdio: ['pipe', 'ignore', 'pipe'] });
    let error = '';
    p.stderr.on('data', x => { error += x; });
    const fin = new Promise((ok, mal) => { p.on('error', mal); p.on('close', code => (code === 0 ? ok() : mal(new Error(`ffmpeg: ${error.trim().slice(0, 300) || `salió con ${code}`}`)))); });
    fin.catch(() => {});
    try {
        for (let i = 0; i < n; i++) {
            ctx.setTransform(W / d.ancho, 0, 0, H / d.alto, 0, 0);
            r.pintarDiseno(ctx, d, { imagenes, variables, tiempo: i / fps });
            const px = ctx.getImageData(0, 0, W, H).data;
            if (!p.stdin.write(Buffer.from(px.buffer, px.byteOffset, px.byteLength))) await new Promise(ok => p.stdin.once('drain', ok));
            // Que la web siga atendiendo mientras tanto.
            if (i % 3 === 2) await new Promise(ok => setImmediate(ok));
        }
        p.stdin.end();
        await fin;
        const buf = await fs.readFile(salida);
        return { buf, mime: 'video/mp4', ancho: W, alto: H, duracion: dur };
    } finally {
        if (p.exitCode === null) p.kill('SIGKILL');
        await fs.unlink(salida).catch(() => {});
    }
}
