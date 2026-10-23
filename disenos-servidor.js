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
