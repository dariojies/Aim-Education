// ─────────────────────────────────────────────────────────────────────────────
// Correos con diseño (ticket #326): el «Canva» de los correos del club.
//
// Un diseño es una lista de bloques (título, texto, imagen, botón…) más unos
// ajustes generales. Este archivo lo convierte en el HTML que se envía, y lo usan
// A LA VEZ el servidor (al enviar) y el editor (la vista previa): así lo que se
// ve al diseñar es exactamente lo que llega.
//
// El HTML es de correo, no de web: tablas, estilos en línea y nada de scripts,
// para que se vea bien en Gmail, Outlook y el móvil.
//
// También está aquí el catálogo de los correos automáticos de la app (Speaking,
// contraseñas, fichaje…), cada uno con su diseño de fábrica y los datos que se
// rellenan solos. Si el club personaliza uno, se guarda en aim_ajustes.
// ─────────────────────────────────────────────────────────────────────────────

export const MARCA_POR_DEFECTO = {
    nombre: 'AIM Education',
    logo: '',              // /ci/<id> o una dirección https
    fondoImagen: '',       // imagen que ocupa todo el fondo de fuera (#334)
    logoAncho: 160,
    cabecera: 'logo',      // 'logo' (sobre el lienzo) | 'banda' (franja de color)
    colorPrincipal: '#5233A8',
    colorTexto: '#1a1a1a',
    fondo: '#f4f2ee',
    lienzo: '#ffffff',
    fuente: 'system',
    radio: 14,
    pieTexto: 'AIM Education · Algeciras · 956 742 216',
    web: 'https://www.aimeducation.es',
    redes: { instagram: '', facebook: '', whatsapp: '', tiktok: '', youtube: '' },
};

export const FUENTES = {
    system: { nombre: 'Moderna', css: "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" },
    arial: { nombre: 'Arial', css: 'Arial,Helvetica,sans-serif' },
    verdana: { nombre: 'Verdana', css: 'Verdana,Geneva,sans-serif' },
    trebuchet: { nombre: 'Trebuchet', css: "'Trebuchet MS',Tahoma,sans-serif" },
    georgia: { nombre: 'Georgia (clásica)', css: "Georgia,'Times New Roman',serif" },
    courier: { nombre: 'Máquina de escribir', css: "'Courier New',Courier,monospace" },
};

export const REDES = {
    instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', tiktok: 'TikTok', youtube: 'YouTube',
};

// Ancho del lienzo y margen interior de los bloques: de ahí sale el ancho útil.
const ANCHO = 600;
const MARGEN = 28;

const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const color = (c, def) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : def);
const num = (v, min, max, def) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
};
const alinear = (a) => (['left', 'center', 'right'].includes(a) ? a : 'left');
// El texto admite además «justificado» (#336); imágenes y botones no.
const alinearTexto = (a) => (a === 'justify' ? 'justify' : alinear(a));

let _n = 0;
export const idBloque = () => `b${Date.now().toString(36)}${(_n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// ── Los bloques ─────────────────────────────────────────────────────────────
// Cada tipo con su nombre, qué es y cómo nace. Los colores vacíos ('') toman
// los de la marca, así que un cambio de marca se nota en todos los diseños.
export const TIPOS_BLOQUE = {
    titulo: { nombre: 'Título', que: 'Un titular grande.', nuevo: () => ({ texto: 'Escribe aquí el título', nivel: 1, alinear: 'left', color: '' }) },
    texto: { nombre: 'Texto', que: 'Un párrafo. Admite **negrita**, *cursiva* y enlaces.', nuevo: () => ({ texto: 'Escribe aquí tu mensaje.', alinear: 'left', tamano: 15, color: '' }) },
    imagen: { nombre: 'Imagen', que: 'Una foto, un cartel o un logo.', nuevo: () => ({ src: '', alt: '', ancho: 100, alinear: 'center', enlace: '', radio: 10 }) },
    boton: { nombre: 'Botón', que: 'Uno o dos botones que llevan a una página.', nuevo: () => ({ alinear: 'center', botones: [{ texto: 'Ver más', url: 'https://www.aimeducation.es', fondo: '', color: '#ffffff' }], radio: 10, lleno: false }) },
    caja: { nombre: 'Caja destacada', que: 'Un aviso con fondo de color para que no pase desapercibido.', nuevo: () => ({ texto: '**Importante:** escribe aquí el aviso.', fondo: '#fff4e5', borde: '#b45309', color: '' }) },
    columnas: { nombre: 'Dos columnas', que: 'Dos piezas lado a lado (en el móvil van una debajo de otra).', nuevo: () => ({ cols: [nuevaColumna(), nuevaColumna()] }) },
    separador: { nombre: 'Línea', que: 'Una línea para separar partes.', nuevo: () => ({ color: '#e5e2dc', grosor: 1 }) },
    espacio: { nombre: 'Espacio', que: 'Aire entre dos bloques.', nuevo: () => ({ alto: 24 }) },
    redes: { nombre: 'Redes sociales', que: 'Enlaces a las redes del club (se configuran en la marca).', nuevo: () => ({ alinear: 'center' }) },
    auto: { nombre: 'Contenido automático', que: 'Lo rellena la app al enviar (una tabla, un plazo…).', nuevo: () => ({ clave: '' }) },
};
function nuevaColumna() {
    return { src: '', titulo: 'Título', texto: 'Un texto corto.', boton: '', url: '' };
}
export function nuevoBloque(tipo) {
    const t = TIPOS_BLOQUE[tipo];
    return { id: idBloque(), tipo, fondo: '', pad: 10, ...(t ? t.nuevo() : {}) };
}

export const DISENO_VACIO = () => ({ v: 1, fondo: '', lienzo: '', fuente: '', cabecera: true, pie: true, bloques: [] });

// ── Texto con formato ───────────────────────────────────────────────────────
// Los datos {así} se cambian por su valor; **negrita**, *cursiva* y
// [texto](enlace); las direcciones sueltas se vuelven enlaces.
const SENT = /\u0001(\w+)\u0002/g;
function conMarcas(texto) {
    return String(texto ?? '').replace(/\{(\w+)\}/g, '\u0001$1\u0002');
}
function valorDe(ctx, k) {
    const v = ctx.vars?.[k];
    return v === undefined || v === null ? `{${k}}` : String(v);
}
// Una dirección con sus datos ya puestos (sin escapar).
function destino(ctx, url) {
    return conMarcas(url).replace(SENT, (m, k) => valorDe(ctx, k)).trim();
}
function enlace(ctx, visible, url, estilo = '') {
    let d = destino(ctx, url);
    if (/^www\./i.test(d)) d = `https://${d}`;
    if (!/^(https?:|mailto:|tel:)/i.test(d)) d = '#';
    const href = ctx.rastrear && /^https?:/i.test(d) ? ctx.rastrear(d) : d;
    return `<a href="${esc(href)}" target="_blank" style="color:${ctx.colorEnlace};${estilo}">${visible}</a>`;
}
export function formato(texto, ctx) {
    const guardados = [];
    const guardar = (html) => `\u0003${guardados.push(html) - 1}\u0004`;
    let s = conMarcas(texto);
    // [texto](enlace) antes de escapar nada, para no romper la dirección.
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, vis, url) => guardar(enlace(ctx, fmtEnLinea(vis, ctx), url)));
    s = esc(s);
    s = s.replace(SENT, (m, k) => esc(valorDe(ctx, k)));
    s = s.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)])/g, (m, a, u) => a + guardar(enlace(ctx, u, u.replace(/&amp;/g, '&'))));
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\n/g, '<br>');
    return s.replace(/\u0003(\d+)\u0004/g, (m, i) => guardados[Number(i)]);
}
function fmtEnLinea(t, ctx) {
    return esc(conMarcas(t)).replace(SENT, (m, k) => esc(valorDe(ctx, k)))
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}
// El mismo texto sin formato (para la versión de texto plano del correo).
export function formatoPlano(texto, vars = {}) {
    return String(texto ?? '')
        .replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])))
        .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2');
}

// ¿Se enseña este bloque? «Solo si hay…»: si ese dato viene vacío, se quita.
const seVe = (b, ctx) => !b.siHay || String(ctx.vars?.[b.siHay] ?? '').trim() !== '';

// ── Contexto de pintado ─────────────────────────────────────────────────────
function contexto(diseno = {}, opts = {}) {
    const marca = { ...MARCA_POR_DEFECTO, ...(opts.marca || {}), redes: { ...MARCA_POR_DEFECTO.redes, ...(opts.marca?.redes || {}) } };
    const principal = color(marca.colorPrincipal, MARCA_POR_DEFECTO.colorPrincipal);
    const texto = color(marca.colorTexto, MARCA_POR_DEFECTO.colorTexto);
    return {
        marca, principal, texto,
        colorEnlace: principal,
        fondo: color(diseno.fondo, color(marca.fondo, MARCA_POR_DEFECTO.fondo)),
        lienzo: color(diseno.lienzo, color(marca.lienzo, MARCA_POR_DEFECTO.lienzo)),
        // Imágenes de fondo (#334). «-» en el diseño quita la de la marca.
        fondoImagen: diseno.fondoImagen === '-' ? '' : (diseno.fondoImagen || marca.fondoImagen || ''),
        lienzoImagen: diseno.lienzoImagen || '',
        fuente: (FUENTES[diseno.fuente] || FUENTES[marca.fuente] || FUENTES.system).css,
        radio: num(marca.radio, 0, 30, 14),
        vars: opts.vars || {},
        automaticos: opts.automaticos || {},
        rastrear: opts.rastrear || null,
        // Las imágenes subidas se guardan como /ci/<id>: en el correo necesitan la
        // dirección entera de la web; en el editor valen tal cual.
        base: String(opts.base || '').replace(/\/+$/, ''),
    };
}
const src = (ctx, s) => {
    const v = destino(ctx, s);
    return v.startsWith('/') ? `${ctx.base}${v}` : v;
};

// Una fila (tabla de una celda) con el fondo y el aire del bloque.
function fila(b, ctx, dentro, { sinMargen = false } = {}) {
    const pad = num(b.pad, 0, 60, 10);
    const fondo = color(b.fondo, '');
    const lados = sinMargen ? 0 : MARGEN;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"${fondo ? ` bgcolor="${fondo}"` : ''}>`
        + `<tr><td style="padding:${pad}px ${lados}px;${fondo ? `background:${fondo};` : ''}">${dentro}</td></tr></table>`;
}

function botonHtml(bt, ctx, radio, lleno) {
    const fondo = color(bt.fondo, ctx.principal);
    const col = color(bt.color, '#ffffff');
    let d = destino(ctx, bt.url);
    if (/^www\./i.test(d)) d = `https://${d}`;
    if (!/^(https?:|mailto:|tel:)/i.test(d)) d = '#';
    const href = ctx.rastrear && /^https?:/i.test(d) ? ctx.rastrear(d) : d;
    return `<a href="${esc(href)}" target="_blank" style="display:${lleno ? 'block' : 'inline-block'};background:${fondo};color:${col};`
        + `text-decoration:none;font-weight:700;font-size:15px;line-height:1.2;padding:13px 24px;border-radius:${radio}px;`
        + `text-align:center;mso-padding-alt:0;font-family:${ctx.fuente}">${fmtEnLinea(bt.texto || 'Botón', ctx)}</a>`;
}

// ── Cada bloque, en HTML ────────────────────────────────────────────────────
export function pintarBloque(b, ctx) {
    if (!b || !seVe(b, ctx)) return '';
    const al = alinear(b.alinear);
    const util = ANCHO - MARGEN * 2;
    switch (b.tipo) {
        case 'titulo': {
            const n = Number(b.nivel) === 2 ? 2 : 1;
            const size = num(b.tamano, 14, 48, n === 1 ? 26 : 20);
            return fila(b, ctx, `<h${n} style="margin:0;font-family:${ctx.fuente};font-size:${size}px;line-height:1.25;font-weight:800;`
                + `color:${color(b.color, ctx.texto)};text-align:${al};letter-spacing:-.01em">${fmtEnLinea(b.texto, ctx)}</h${n}>`);
        }
        case 'texto':
            return fila(b, ctx, `<div style="font-family:${ctx.fuente};font-size:${num(b.tamano, 11, 24, 15)}px;line-height:1.6;`
                + `color:${color(b.color, ctx.texto)};text-align:${alinearTexto(b.alinear)}">${formato(b.texto, ctx)}</div>`);
        case 'caja': {
            const borde = color(b.borde, ctx.principal);
            return fila({ ...b, fondo: '' }, ctx,
                `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>`
                + `<td style="background:${color(b.fondo, '#f4f4f4')};border-left:4px solid ${borde};border-radius:8px;padding:12px 16px;`
                + `font-family:${ctx.fuente};font-size:15px;line-height:1.55;color:${color(b.color, ctx.texto)};text-align:${alinearTexto(b.alinear)}">${formato(b.texto, ctx)}</td></tr></table>`);
        }
        case 'imagen': {
            if (!b.src) {
                return fila(b, ctx, `<div style="border:2px dashed #cfcac2;border-radius:10px;padding:34px 10px;text-align:${al};`
                    + `font-family:${ctx.fuente};font-size:13px;color:#8a857d;text-align:center">Aquí va una imagen</div>`);
            }
            const ancho = Math.round(util * num(b.ancho, 10, 100, 100) / 100);
            const img = `<img src="${esc(src(ctx, b.src))}" alt="${esc(formatoPlano(b.alt, ctx.vars))}" width="${ancho}" `
                + `style="display:inline-block;width:100%;max-width:${ancho}px;height:auto;border:0;outline:none;border-radius:${num(b.radio, 0, 40, 10)}px">`;
            const conEnlace = b.enlace ? enlace(ctx, img, b.enlace, 'text-decoration:none') : img;
            return fila(b, ctx, `<div style="text-align:${al};line-height:0">${conEnlace}</div>`, { sinMargen: b.completa && num(b.ancho, 10, 100, 100) === 100 });
        }
        case 'boton': {
            const lista = (Array.isArray(b.botones) ? b.botones : []).filter(x => x && (x.texto || x.url)).slice(0, 3);
            if (!lista.length) return '';
            const radio = num(b.radio, 0, 40, 10);
            const lleno = !!b.lleno && lista.length === 1;
            const html = lista.map(x => botonHtml(x, ctx, radio, lleno)).join('<span style="display:inline-block;width:10px"></span>');
            return fila(b, ctx, `<div style="text-align:${al};line-height:3">${html}</div>`);
        }
        case 'separador':
            return fila(b, ctx, `<div style="height:0;border-top:${num(b.grosor, 1, 8, 1)}px solid ${color(b.color, '#e5e2dc')};font-size:0;line-height:0">&nbsp;</div>`);
        case 'espacio':
            return fila({ ...b, pad: 0 }, ctx, `<div style="height:${num(b.alto, 4, 120, 24)}px;font-size:0;line-height:0">&nbsp;</div>`);
        case 'columnas': {
            const cols = (Array.isArray(b.cols) ? b.cols : []).slice(0, 2);
            const anchoCol = Math.floor((util - 16) / 2);
            const col = (c) => {
                const partes = [];
                if (c.src) {
                    const img = `<img src="${esc(src(ctx, c.src))}" alt="" width="${anchoCol}" style="display:block;width:100%;max-width:${anchoCol}px;height:auto;border:0;border-radius:10px">`;
                    partes.push(`<div style="margin-bottom:10px">${c.url ? enlace(ctx, img, c.url, 'text-decoration:none') : img}</div>`);
                }
                if (c.titulo) partes.push(`<div style="font-family:${ctx.fuente};font-size:17px;font-weight:800;line-height:1.3;color:${ctx.texto};margin-bottom:4px">${fmtEnLinea(c.titulo, ctx)}</div>`);
                if (c.texto) partes.push(`<div style="font-family:${ctx.fuente};font-size:14px;line-height:1.55;color:${ctx.texto}">${formato(c.texto, ctx)}</div>`);
                if (c.boton && c.url) partes.push(`<div style="margin-top:10px">${botonHtml({ texto: c.boton, url: c.url }, ctx, 8, false)}</div>`);
                return `<div class="aim-col" style="display:inline-block;width:100%;max-width:${anchoCol}px;vertical-align:top;text-align:left;margin:0 4px 12px">${partes.join('')}</div>`;
            };
            return fila(b, ctx, `<div style="font-size:0;text-align:center">${cols.map(col).join('')}</div>`);
        }
        case 'redes': {
            const r = ctx.marca.redes || {};
            const lista = Object.keys(REDES).filter(k => String(r[k] || '').trim());
            if (!lista.length) {
                return ctx.editor ? fila(b, ctx, `<div style="font-family:${ctx.fuente};font-size:13px;color:#8a857d;text-align:center">Pon las direcciones de vuestras redes en «Marca» y saldrán aquí.</div>`) : '';
            }
            const pildora = (k) => enlace(ctx, REDES[k], r[k],
                `display:inline-block;margin:0 4px 6px;padding:7px 14px;border-radius:999px;background:${ctx.principal};color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;font-family:${ctx.fuente}`);
            return fila(b, ctx, `<div style="text-align:${al}">${lista.map(pildora).join('')}</div>`);
        }
        case 'auto': {
            const html = ctx.automaticos?.[b.clave];
            if (html == null || html === '') return ctx.editor ? fila(b, ctx, `<div style="border:2px dashed #cfcac2;border-radius:10px;padding:14px;font-family:${ctx.fuente};font-size:13px;color:#8a857d;text-align:center">Contenido automático</div>`) : '';
            return fila(b, ctx, `<div style="font-family:${ctx.fuente};font-size:15px;line-height:1.55;color:${ctx.texto}">${html}</div>`);
        }
        default:
            return '';
    }
}

function pintarCabecera(ctx) {
    const m = ctx.marca;
    const banda = m.cabecera === 'banda';
    const fondo = banda ? ctx.principal : '';
    const logo = String(m.logo || '').trim();
    const ancho = num(m.logoAncho, 40, 400, 160);
    const dentro = logo
        ? `<img src="${esc(src(ctx, logo))}" alt="${esc(m.nombre || '')}" width="${ancho}" style="display:inline-block;width:100%;max-width:${ancho}px;height:auto;border:0">`
        : `<span style="font-family:${ctx.fuente};font-size:22px;font-weight:800;letter-spacing:-.01em;color:${banda ? '#ffffff' : ctx.principal}">${esc(m.nombre || '')}</span>`;
    const link = m.web ? `<a href="${esc(m.web)}" target="_blank" style="text-decoration:none">${dentro}</a>` : dentro;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"${fondo ? ` bgcolor="${fondo}"` : ''}><tr>`
        + `<td align="center" style="padding:${banda ? '26px' : '28px'} ${MARGEN}px ${banda ? '26px' : '8px'};${fondo ? `background:${fondo};` : ''}text-align:center;line-height:0">${link}</td></tr></table>`;
}

function pintarPie(ctx, extra = '') {
    const m = ctx.marca;
    const r = m.redes || {};
    const redes = Object.keys(REDES).filter(k => String(r[k] || '').trim())
        .map(k => `<a href="${esc(r[k])}" target="_blank" style="color:#8a857d;text-decoration:underline">${REDES[k]}</a>`).join(' · ');
    const web = m.web ? `<a href="${esc(m.web)}" target="_blank" style="color:#8a857d">${esc(m.web.replace(/^https?:\/\//, ''))}</a>` : '';
    const lineas = [esc(m.pieTexto || ''), web, redes].filter(Boolean);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
        + `<td style="padding:18px ${MARGEN}px 24px;font-family:${ctx.fuente};font-size:12px;line-height:1.6;color:#8a857d;text-align:center;border-top:1px solid #eeebe6">`
        + `${lineas.join('<br>')}${extra ? `<div style="margin-top:10px;font-size:11px;color:#9a958d">${extra}</div>` : ''}</td></tr></table>`;
}

// Una imagen de fondo, con la dirección entera y sin nada que rompa el CSS.
function urlFondo(ctx, v) {
    const u = src(ctx, v || '');
    return u && /^(https?:\/\/|\/)[^\s"'()<>\\]+$/.test(u) ? u : '';
}
// Los estilos de un fondo: el color siempre (es lo que se ve si el programa de
// correo no carga imágenes de fondo, como Outlook de escritorio) y la imagen
// cubriéndolo todo.
export function estiloFondo(color, imagen) {
    return imagen
        ? `background-color:${color};background-image:url('${imagen}');background-size:cover;background-position:center top;background-repeat:no-repeat`
        : `background:${color}`;
}

// Las piezas por separado: el editor las pinta una a una para poder
// seleccionarlas; el correo las junta.
export function piezasCorreo(diseno, opts = {}) {
    const d = diseno || DISENO_VACIO();
    const ctx = { ...contexto(d, opts), editor: !!opts.editor };
    return {
        ctx,
        fondo: ctx.fondo, lienzo: ctx.lienzo, fuente: ctx.fuente, radio: ctx.radio, ancho: ANCHO,
        fondoImagen: urlFondo(ctx, ctx.fondoImagen), lienzoImagen: urlFondo(ctx, ctx.lienzoImagen),
        cabecera: d.cabecera === false ? '' : pintarCabecera(ctx),
        bloques: (Array.isArray(d.bloques) ? d.bloques : []).map(b => ({ id: b.id, tipo: b.tipo, html: pintarBloque(b, ctx) })),
        pie: d.pie === false ? (opts.pieExtra ? pintarPie({ ...ctx, marca: { ...ctx.marca, pieTexto: '', web: '', redes: {} } }, opts.pieExtra) : '') : pintarPie(ctx, opts.pieExtra || ''),
    };
}

// El correo entero, listo para enviar.
//  opts: marca, vars, automaticos {clave: html}, base (dirección de la web),
//        rastrear(url) (clics), apertura (píxel), pieExtra (html bajo el pie),
//        titulo, resumen (texto que se ve junto al asunto en la bandeja).
export function htmlCorreo(diseno, opts = {}) {
    const p = piezasCorreo(diseno, opts);
    const cuerpo = p.bloques.map(b => b.html).join('');
    const resumen = opts.resumen ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(opts.resumen)}</div>` : '';
    const pixel = opts.apertura ? `<img src="${esc(opts.apertura)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">` : '';
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
        + `<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(opts.titulo || '')}</title>`
        + `<style>body{margin:0;padding:0}img{-ms-interpolation-mode:bicubic}`
        + `@media (max-width:620px){.aim-col{max-width:100%!important;display:block!important;margin:0 0 14px!important}.aim-lienzo{border-radius:0!important}}</style></head>`
        + `<body style="margin:0;padding:0;${estiloFondo(p.fondo, p.fondoImagen)}">${resumen}`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.fondo}"${p.fondoImagen ? ` background="${esc(p.fondoImagen)}"` : ''} style="${estiloFondo(p.fondo, p.fondoImagen)}"><tr><td align="center" style="padding:${p.fondoImagen ? '40px 10px' : '24px 10px'}">`
        + `<table role="presentation" class="aim-lienzo" width="${p.ancho}" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.lienzo}"${p.lienzoImagen ? ` background="${esc(p.lienzoImagen)}"` : ''} `
        + `style="width:100%;max-width:${p.ancho}px;${estiloFondo(p.lienzo, p.lienzoImagen)};border-radius:${p.radio}px;border-collapse:separate;overflow:hidden">`
        + `<tr><td style="padding:0">${p.cabecera}${p.cabecera ? '<div style="height:10px;line-height:10px;font-size:0">&nbsp;</div>' : '<div style="height:18px;line-height:18px;font-size:0">&nbsp;</div>'}${cuerpo}`
        + `<div style="height:18px;line-height:18px;font-size:0">&nbsp;</div>${p.pie}${pixel}</td></tr></table>`
        + `</td></tr></table></body></html>`;
}

// La versión de texto plano (la que ven los programas que no muestran HTML y
// ayuda a no caer en spam).
export function textoCorreo(diseno, opts = {}) {
    const vars = opts.vars || {};
    const ctxVe = { vars };
    const partes = [];
    for (const b of (diseno?.bloques || [])) {
        if (!seVe(b, ctxVe)) continue;
        if (b.tipo === 'titulo' || b.tipo === 'texto' || b.tipo === 'caja') partes.push(formatoPlano(b.texto, vars));
        else if (b.tipo === 'boton') (b.botones || []).forEach(x => x?.url && partes.push(`${formatoPlano(x.texto, vars)}: ${formatoPlano(x.url, vars)}`));
        else if (b.tipo === 'imagen' && b.enlace) partes.push(formatoPlano(b.enlace, vars));
        else if (b.tipo === 'columnas') (b.cols || []).forEach(c => partes.push([c.titulo, c.texto, c.url].filter(Boolean).map(t => formatoPlano(t, vars)).join('\n')));
        else if (b.tipo === 'auto' && opts.automaticosTexto?.[b.clave]) partes.push(opts.automaticosTexto[b.clave]);
        else if (b.tipo === 'separador') partes.push('———');
    }
    const m = { ...MARCA_POR_DEFECTO, ...(opts.marca || {}) };
    if (diseno?.pie !== false) partes.push(`--\n${[m.pieTexto, m.web].filter(Boolean).join('\n')}`);
    if (opts.pieExtraTexto) partes.push(opts.pieExtraTexto);
    return partes.filter(s => String(s).trim()).join('\n\n');
}

// Un texto de los de siempre (párrafos separados por una línea en blanco),
// convertido en bloques. Lo usan los correos escritos a mano y el botón
// «Pasar a diseño».
export function disenoDesdeTexto(texto) {
    const d = DISENO_VACIO();
    d.bloques = [{ ...nuevoBloque('texto'), texto: String(texto || '').trim(), pad: 8 }];
    return d;
}

// Qué datos {así} usa un diseño (y su asunto).
export function datosUsados(diseno, asunto = '') {
    const set = new Set();
    const mirar = (s) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => { set.add(k); return m; });
    mirar(asunto);
    for (const b of (diseno?.bloques || [])) {
        mirar(b.texto); mirar(b.src); mirar(b.enlace); mirar(b.alt);
        (b.botones || []).forEach(x => { mirar(x?.texto); mirar(x?.url); });
        (b.cols || []).forEach(c => { mirar(c?.titulo); mirar(c?.texto); mirar(c?.url); mirar(c?.boton); });
        if (b.siHay) set.add(b.siHay);
    }
    return set;
}
export const automaticosUsados = (diseno) => new Set((diseno?.bloques || []).filter(b => b.tipo === 'auto').map(b => b.clave));

// Lo que le falta a un diseño de un correo automático para funcionar (el
// enlace de la contraseña, la tabla de horas…). Vacío: está bien.
export function faltanObligatorios(def, diseno, asunto = '') {
    if (!def) return [];
    const usados = datosUsados(diseno, asunto);
    const autos = automaticosUsados(diseno);
    const faltan = [];
    for (const k of def.obligatorio || []) {
        if (def.automaticos?.[k]) { if (!autos.has(k)) faltan.push(def.automaticos[k].nombre); }
        else if (!usados.has(k)) faltan.push(def.variables?.[k]?.que || k);
    }
    return faltan;
}

// Una imagen de fondo aceptable: subida (/ci/…) o https, sin comillas ni paréntesis.
const imagenSegura = (v) => {
    const u = String(v ?? '').trim().slice(0, 500);
    return /^(https:\/\/|\/ci\/)[^\s"'()<>\\]+$/.test(u) ? u : '';
};

// Deja un diseño recibido de fuera en algo seguro y con forma conocida.
export function limpiarDiseno(d) {
    if (!d || typeof d !== 'object') return null;
    const txt = (s, n = 4000) => String(s ?? '').slice(0, n);
    const col = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '');
    const bloques = (Array.isArray(d.bloques) ? d.bloques : []).slice(0, 80).map(b => {
        if (!b || !TIPOS_BLOQUE[b.tipo]) return null;
        const base = { id: txt(b.id, 40) || idBloque(), tipo: b.tipo, fondo: col(b.fondo), pad: num(b.pad, 0, 60, 10) };
        if (b.siHay) base.siHay = txt(b.siHay, 40).replace(/\W/g, '');
        if (b.alinear) base.alinear = ['texto', 'caja'].includes(b.tipo) ? alinearTexto(b.alinear) : alinear(b.alinear);
        switch (b.tipo) {
            case 'titulo': return { ...base, texto: txt(b.texto, 300), nivel: Number(b.nivel) === 2 ? 2 : 1, color: col(b.color), ...(b.tamano ? { tamano: num(b.tamano, 14, 48, 26) } : {}) };
            case 'texto': return { ...base, texto: txt(b.texto, 8000), tamano: num(b.tamano, 11, 24, 15), color: col(b.color) };
            case 'caja': return { ...base, texto: txt(b.texto, 4000), fondo: col(b.fondo) || '#fff4e5', borde: col(b.borde), color: col(b.color) };
            case 'imagen': return { ...base, src: txt(b.src, 1000), alt: txt(b.alt, 200), ancho: num(b.ancho, 10, 100, 100), enlace: txt(b.enlace, 1000), radio: num(b.radio, 0, 40, 10), completa: !!b.completa };
            case 'boton': return {
                ...base, radio: num(b.radio, 0, 40, 10), lleno: !!b.lleno,
                botones: (Array.isArray(b.botones) ? b.botones : []).slice(0, 3).map(x => ({ texto: txt(x?.texto, 80), url: txt(x?.url, 1000), fondo: col(x?.fondo), color: col(x?.color) || '#ffffff' })),
            };
            case 'separador': return { ...base, color: col(b.color), grosor: num(b.grosor, 1, 8, 1) };
            case 'espacio': return { ...base, alto: num(b.alto, 4, 120, 24) };
            case 'columnas': return { ...base, cols: (Array.isArray(b.cols) ? b.cols : []).slice(0, 2).map(c => ({ src: txt(c?.src, 1000), titulo: txt(c?.titulo, 200), texto: txt(c?.texto, 2000), boton: txt(c?.boton, 60), url: txt(c?.url, 1000) })) };
            case 'redes': return base;
            case 'auto': return { ...base, clave: txt(b.clave, 40).replace(/\W/g, '') };
            default: return null;
        }
    }).filter(Boolean);
    return {
        v: 1, fondo: col(d.fondo), lienzo: col(d.lienzo), fuente: FUENTES[d.fuente] ? d.fuente : '',
        fondoImagen: d.fondoImagen === '-' ? '-' : imagenSegura(d.fondoImagen), lienzoImagen: imagenSegura(d.lienzoImagen),
        cabecera: d.cabecera !== false, pie: d.pie !== false, bloques,
    };
}

export function limpiarMarca(m = {}) {
    const col = (c, def) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : def);
    const txt = (s, n) => String(s ?? '').trim().slice(0, n);
    const url = (s) => { const v = txt(s, 300); return !v ? '' : /^https?:\/\//i.test(v) ? v : `https://${v}`; };
    const d = MARCA_POR_DEFECTO;
    return {
        nombre: txt(m.nombre, 80) || d.nombre,
        logo: txt(m.logo, 500),
        fondoImagen: imagenSegura(m.fondoImagen),
        logoAncho: num(m.logoAncho, 40, 400, d.logoAncho),
        cabecera: m.cabecera === 'banda' ? 'banda' : 'logo',
        colorPrincipal: col(m.colorPrincipal, d.colorPrincipal),
        colorTexto: col(m.colorTexto, d.colorTexto),
        fondo: col(m.fondo, d.fondo),
        lienzo: col(m.lienzo, d.lienzo),
        fuente: FUENTES[m.fuente] ? m.fuente : d.fuente,
        radio: num(m.radio, 0, 30, d.radio),
        pieTexto: txt(m.pieTexto, 300),
        web: url(m.web),
        redes: Object.fromEntries(Object.keys(REDES).map(k => [k, url(m.redes?.[k])])),
    };
}

// ── Plantillas de partida ───────────────────────────────────────────────────
// Diseños listos para empezar (luego se guardan como plantillas del club).
const B = (tipo, extra = {}) => ({ ...nuevoBloque(tipo), ...extra });
export const PLANTILLAS_BASE = [
    {
        id: 'base-blanco', nombre: 'En blanco', que: 'Solo la cabecera y el pie de la marca.',
        asunto: '', diseno: () => ({ ...DISENO_VACIO(), bloques: [B('texto', { texto: 'Hola,\n\nEscribe aquí tu mensaje.\n\nUn saludo,\nAIM Education' })] }),
    },
    {
        id: 'base-anuncio', nombre: 'Anuncio con imagen', que: 'Un cartel grande, un titular, el texto y un botón.',
        asunto: 'Novedades en AIM Education', diseno: () => ({
            ...DISENO_VACIO(), bloques: [
                B('imagen', { ancho: 100 }),
                B('titulo', { texto: '¡Tenemos novedades!', alinear: 'center' }),
                B('texto', { texto: 'Hola,\n\nCuéntales aquí la novedad en dos o tres frases.', alinear: 'center' }),
                B('boton', { botones: [{ texto: 'Quiero apuntarme', url: 'https://www.aimeducation.es', fondo: '', color: '#ffffff' }] }),
                B('espacio', { alto: 12 }),
                B('redes'),
            ],
        }),
    },
    {
        id: 'base-evento', nombre: 'Evento o campamento', que: 'Titular, fecha destacada, dos columnas y botón de inscripción.',
        asunto: '{nombre}, ¡no te pierdas el campamento!', diseno: () => ({
            ...DISENO_VACIO(), bloques: [
                B('imagen', { ancho: 100 }),
                B('titulo', { texto: 'Campamento de Navidad 2026', alinear: 'center' }),
                B('caja', { texto: '**Del 22 de diciembre al 5 de enero** · de 9:00 a 14:00 · plazas limitadas', fondo: '#efeaff', borde: '' }),
                B('columnas', { cols: [{ src: '', titulo: 'Actividades', texto: 'Deporte, arte, inglés y mucho más.', boton: '', url: '' }, { src: '', titulo: 'Para quién', texto: 'Niños y niñas de 4 a 12 años.', boton: '', url: '' }] }),
                B('boton', { botones: [{ texto: 'Reservar plaza', url: 'https://www.aimeducation.es', fondo: '', color: '#ffffff' }] }),
            ],
        }),
    },
    {
        id: 'base-boletin', nombre: 'Boletín del mes', que: 'Varias noticias cortas, cada una con su foto.',
        asunto: 'Lo que ha pasado este mes en AIM Education', diseno: () => ({
            ...DISENO_VACIO(), bloques: [
                B('titulo', { texto: 'El mes en AIM Education' }),
                B('texto', { texto: 'Hola {nombre}, esto es lo que ha pasado este mes en el club:' }),
                B('columnas', { cols: [{ src: '', titulo: 'Noticia 1', texto: 'Un par de frases.', boton: 'Leer más', url: 'https://www.aimeducation.es' }, { src: '', titulo: 'Noticia 2', texto: 'Un par de frases.', boton: 'Leer más', url: 'https://www.aimeducation.es' }] }),
                B('separador'),
                B('titulo', { texto: 'Próximas fechas', nivel: 2 }),
                B('texto', { texto: '• **12 de octubre:** festivo, el club cierra.\n• **25 de octubre:** exhibición de Taekwondo.' }),
                B('redes'),
            ],
        }),
    },
];

// ── Los correos automáticos de la app ───────────────────────────────────────
// Cada uno: para quién, cuándo sale, los datos que se rellenan solos (con un
// ejemplo para la vista previa), las piezas automáticas y lo que NO puede
// faltar (sin el enlace, el de la contraseña no sirve). Si un diseño guardado no
// lo tiene, se usa el de fábrica.
const T = (texto, extra = {}) => ({ id: idBloque(), tipo: 'texto', fondo: '', pad: 6, texto, alinear: 'left', tamano: 15, color: '', ...extra });
const BTN = (botones, extra = {}) => ({ id: idBloque(), tipo: 'boton', fondo: '', pad: 12, alinear: 'left', radio: 8, lleno: false, botones, ...extra });
const CAJA = (texto, extra = {}) => ({ id: idBloque(), tipo: 'caja', fondo: '#fff4e5', borde: '#b45309', color: '', pad: 8, texto, ...extra });
const AUTO = (clave, extra = {}) => ({ id: idBloque(), tipo: 'auto', fondo: '', pad: 6, clave, ...extra });
const PEQ = (texto, extra = {}) => T(texto, { tamano: 13, color: '#666666', ...extra });
const VERDE = '#0a7d3c';
const d = (bloques) => ({ v: 1, fondo: '', lienzo: '', fuente: '', cabecera: true, pie: true, bloques });

const ejTabla = (filas) => `<table style="border-collapse:collapse;font-size:14px">${filas.map(([k, v]) => `<tr><td style="padding:5px 14px 5px 0;color:#666">${k}</td><td style="padding:5px 0;font-weight:600">${v}</td></tr>`).join('')}</table>`;

export const GRUPOS_SISTEMA = {
    familias: 'A las familias y alumnos',
    personal: 'Al personal del club',
    club: 'Avisos al propio club',
};

export const CORREOS_SISTEMA = {
    password_olvido: {
        grupo: 'familias', nombre: 'Restablecer la contraseña', cuando: 'Cuando alguien pulsa «¿Olvidaste tu contraseña?».',
        asunto: 'Restablecer tu contraseña de AIM Education',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Lucía' }, enlace: { que: 'Enlace para poner la contraseña nueva', ejemplo: 'https://www.aimeducation.es/auth' } },
        obligatorio: ['enlace'],
        diseno: () => d([
            T('Hola {nombre},'),
            T('Nos han pedido poner una contraseña nueva en tu cuenta de AIM Education. Si has sido tú, entra aquí:'),
            BTN([{ texto: 'Poner una contraseña nueva', url: '{enlace}', fondo: '', color: '#ffffff' }]),
            PEQ('El enlace sirve una sola vez y caduca en 1 hora. Si no lo has pedido tú, ignora este correo: tu contraseña sigue siendo la misma.'),
        ]),
    },
    acceso_familia: {
        grupo: 'familias', nombre: 'Enlace para la contraseña (desde el club)', cuando: 'Al pulsar «Enviar enlace de contraseña» en la ficha de una persona: para que ponga o cambie su contraseña.',
        asunto: 'Tu contraseña de AIM Education',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Lucía' }, correo: { que: 'El correo con el que entra', ejemplo: 'lucia@ejemplo.com' }, enlace: { que: 'Enlace para poner la contraseña', ejemplo: 'https://www.aimeducation.es/auth' }, dias: { que: 'Días que vale el enlace', ejemplo: '7' } },
        obligatorio: ['enlace'],
        diseno: () => d([
            T('Hola {nombre},'),
            T('Desde el club te mandamos un enlace para poner la contraseña de tu cuenta de AIM Education. Con ella ves las clases, los recibos y los avisos de tu familia.'),
            BTN([{ texto: 'Poner mi contraseña', url: '{enlace}', fondo: '', color: '#ffffff' }]),
            T('Después entra en **www.aimeducation.es** con tu correo (**{correo}**) y esa contraseña.'),
            PEQ('El enlace vale {dias} días y sirve una sola vez. Si no lo has pedido tú, no pasa nada: ignóralo y tu contraseña sigue siendo la misma.'),
        ]),
    },
    acceso_invitacion: {
        grupo: 'personal', nombre: 'Tu acceso a la web', cuando: 'Al pulsar «Enviar acceso» en la lista del personal: para que pongan su contraseña y puedan fichar y pasar lista.',
        asunto: 'Tu acceso a la web de AIM Education',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Marta' }, correo: { que: 'El correo con el que entra', ejemplo: 'marta@ejemplo.com' }, enlace: { que: 'Enlace para poner su contraseña', ejemplo: 'https://www.aimeducation.es/auth' }, dias: { que: 'Días que vale el enlace', ejemplo: '7' } },
        obligatorio: ['enlace'],
        diseno: () => d([
            T('Hola {nombre},'),
            T('Ya tienes tu cuenta en la web de AIM Education. Con ella puedes **fichar tu jornada**, ver tu día y, si das clase, **pasar lista**.'),
            T('Para entrar, pon tu contraseña aquí:'),
            BTN([{ texto: 'Poner mi contraseña', url: '{enlace}', fondo: '', color: '#ffffff' }]),
            T('Después entra siempre en **www.aimeducation.es** con tu correo (**{correo}**) y esa contraseña. Desde el móvil también se puede: guárdala en la pantalla de inicio y tendrás la web como una app.'),
            PEQ('El enlace vale {dias} días y sirve una sola vez. Si caduca, pide otro en el club o usa «¿Olvidaste tu contraseña?».'),
        ]),
    },
    password_cambiada: {
        grupo: 'familias', nombre: 'Contraseña cambiada', cuando: 'Justo después de cambiar la contraseña, como aviso de seguridad.',
        asunto: 'Tu contraseña de AIM Education ha cambiado',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Lucía' } },
        obligatorio: [],
        diseno: () => d([
            T('Hola {nombre},'),
            T('La contraseña de tu cuenta de AIM Education se acaba de cambiar. Es la misma cuenta de las apps de AIM, así que la nueva vale también en ellas.'),
            T('Si no has sido tú, escríbenos cuanto antes a info@aimeducation.es o llámanos al 956 742 216.'),
        ]),
    },
    examen_resultado: {
        grupo: 'familias', nombre: 'Resultado de un examen', cuando: 'Al pulsar «Enviar a la familia» en un examen.',
        asunto: '[AIM Education] Resultado de examen · {actividad} · {alumno}',
        variables: {
            alumno: { que: 'Nombre y apellidos del alumno', ejemplo: 'Lucía García' },
            actividad: { que: 'La actividad', ejemplo: 'Taekwondo' },
            nivel: { que: 'El nivel o cinturón', ejemplo: 'Cinturón amarillo' },
            resultado: { que: 'El resultado', ejemplo: 'Apto' },
            enhorabuena: { que: 'La felicitación (solo si aprueba)', ejemplo: '¡Enhorabuena! Ha superado el examen y promociona a Cinturón amarillo.' },
            observaciones: { que: 'Las observaciones del examinador', ejemplo: 'Muy buena técnica de patada.' },
        },
        automaticos: { datos_examen: { nombre: 'Tabla con los datos del examen', ejemplo: ejTabla([['Alumno/a', 'Lucía García'], ['Actividad', 'Taekwondo'], ['Convocatoria', 'Diciembre 2026'], ['Nivel', 'Cinturón amarillo'], ['Resultado', 'Apto']]) } },
        obligatorio: ['datos_examen'],
        diseno: () => d([
            T('Hola,'),
            CAJA('**{enhorabuena}**', { siHay: 'enhorabuena', fondo: '#e9f7ef', borde: VERDE }),
            T('Ya está disponible el resultado del examen de **{alumno}**. Estos son los datos:'),
            AUTO('datos_examen'),
            T('**Observaciones:**\n{observaciones}', { siHay: 'observaciones' }),
            T('Un saludo,\n**AIM Education** · Algeciras'),
        ]),
    },
    speaking_inicial: {
        grupo: 'familias', nombre: 'Speaking: confirmar asistencia', cuando: 'Al apuntar a un alumno a una clase de Speaking.',
        asunto: 'Clase de Speaking de {alumno} · {fecha}',
        variables: {
            alumno: { que: 'Nombre y apellidos del alumno', ejemplo: 'Lucía García' },
            fecha: { que: 'El día de la clase', ejemplo: 'martes, 6 de octubre' },
            cuando: { que: 'El día y la hora', ejemplo: 'martes, 6 de octubre (17:00 a 17:30)' },
            limite: { que: 'Hasta cuándo puede confirmar', ejemplo: 'el domingo, 4 de octubre' },
            enlace_si: { que: 'Enlace «Sí, asistirá»', ejemplo: 'https://www.aimeducation.es/speaking/x/si' },
            enlace_no: { que: 'Enlace «No podrá»', ejemplo: 'https://www.aimeducation.es/speaking/x/no' },
        },
        obligatorio: ['enlace_si', 'enlace_no'],
        diseno: () => d([
            T('Hola,'),
            T('**{alumno}** está apuntado/a a la clase de **Speaking** del **{cuando}**.\n\nPor favor, confirma si podrá asistir:'),
            CAJA('**Importante:** tienes hasta {limite} (incluido) para confirmar. Si para entonces no has confirmado, **se pierde la plaza** de ese día.'),
            BTN([{ texto: 'Sí, asistirá', url: '{enlace_si}', fondo: VERDE, color: '#ffffff' }, { texto: 'No podrá', url: '{enlace_no}', fondo: '#eeeeee', color: '#333333' }]),
        ]),
    },
    speaking_ultimo_dia: {
        grupo: 'familias', nombre: 'Speaking: último día para confirmar', cuando: 'El último día del plazo, a quien aún no ha contestado.',
        asunto: 'Último día para confirmar · Clase de Speaking de {alumno} · {fecha}',
        variables: {
            alumno: { que: 'Nombre y apellidos del alumno', ejemplo: 'Lucía García' },
            fecha: { que: 'El día de la clase', ejemplo: 'martes, 6 de octubre' },
            cuando: { que: 'El día y la hora', ejemplo: 'martes, 6 de octubre (17:00 a 17:30)' },
            enlace_si: { que: 'Enlace «Sí, asistirá»', ejemplo: 'https://www.aimeducation.es/speaking/x/si' },
            enlace_no: { que: 'Enlace «No podrá»', ejemplo: 'https://www.aimeducation.es/speaking/x/no' },
        },
        obligatorio: ['enlace_si', 'enlace_no'],
        diseno: () => d([
            T('Hola,'),
            T('**{alumno}** está apuntado/a a la clase de **Speaking** del **{cuando}** y todavía no nos has confirmado si podrá asistir.'),
            CAJA('**Hoy es el último día para confirmar.** Si no lo haces hoy, se pierde la plaza de ese día.'),
            BTN([{ texto: 'Sí, asistirá', url: '{enlace_si}', fondo: VERDE, color: '#ffffff' }, { texto: 'No podrá', url: '{enlace_no}', fondo: '#eeeeee', color: '#333333' }]),
        ]),
    },
    speaking_manana: {
        grupo: 'familias', nombre: 'Speaking: la clase es mañana', cuando: 'El día antes de la clase, a quien ya ha confirmado.',
        asunto: 'Recordatorio · Clase de Speaking de {alumno} · {fecha}',
        variables: {
            alumno: { que: 'Nombre y apellidos del alumno', ejemplo: 'Lucía García' },
            fecha: { que: 'El día de la clase', ejemplo: 'martes, 6 de octubre' },
            cuando: { que: 'El día y la hora', ejemplo: 'martes, 6 de octubre · 17:00 a 17:30' },
            enlace_no: { que: 'Enlace «No podrá»', ejemplo: 'https://www.aimeducation.es/speaking/x/no' },
        },
        obligatorio: ['enlace_no'],
        diseno: () => d([
            T('Hola,'),
            T('Te recordamos que **mañana** es la clase de **Speaking** de **{alumno}** (**{cuando}**). ¡Os esperamos!\n\nSi al final no puede venir, avísanos:'),
            BTN([{ texto: 'No podrá', url: '{enlace_no}', fondo: '#eeeeee', color: '#333333' }]),
        ]),
    },
    fichaje_entrada: {
        grupo: 'personal', nombre: 'Recordatorio: fichar la entrada', cuando: 'Si empieza su turno y aún no ha fichado.',
        asunto: 'Recuerda fichar tu entrada',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Marta' }, hora: { que: 'Hora de entrada', ejemplo: '16:00' }, turno: { que: 'El turno (si tiene dos)', ejemplo: ' de tarde' }, enlace: { que: 'Enlace para fichar', ejemplo: 'https://www.aimeducation.es/admin/fichaje' } },
        obligatorio: [],
        diseno: () => d([
            T('Hola {nombre},'),
            T('Tu turno{turno} de hoy empieza a las **{hora}** y aún no has fichado la **entrada**.'),
            BTN([{ texto: 'Ir a fichar', url: '{enlace}', fondo: VERDE, color: '#ffffff' }]),
        ]),
    },
    fichaje_salida: {
        grupo: 'personal', nombre: 'Recordatorio: fichar la salida', cuando: 'Si su turno ya terminó y sigue con la jornada abierta.',
        asunto: 'Recuerda fichar tu salida',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Marta' }, hora: { que: 'Hora de salida', ejemplo: '21:00' }, turno: { que: 'El turno (si tiene dos)', ejemplo: ' de tarde' }, enlace: { que: 'Enlace para fichar', ejemplo: 'https://www.aimeducation.es/admin/fichaje' } },
        obligatorio: [],
        diseno: () => d([
            T('Hola {nombre},'),
            T('Tu turno{turno} de hoy terminaba a las **{hora}** y sigues con la jornada **abierta**. No olvides fichar la **salida**.'),
            BTN([{ texto: 'Ir a fichar', url: '{enlace}', fondo: VERDE, color: '#ffffff' }]),
        ]),
    },
    fichaje_propuesta: {
        grupo: 'personal', nombre: 'Fichaje: corrección para aprobar', cuando: 'Cuando secretaría propone corregir un fichaje suyo.',
        asunto: 'Corrección de tu registro de jornada pendiente de aprobar',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Marta' }, quien: { que: 'Quién la propone', ejemplo: 'Secretaría' }, correccion: { que: 'Qué se corrige', ejemplo: 'Entrada del 3 de octubre a las 16:00' }, motivo: { que: 'El motivo', ejemplo: 'Olvidó fichar' }, enlace: { que: 'Enlace a Fichaje', ejemplo: 'https://www.aimeducation.es/admin' } },
        obligatorio: ['correccion'],
        diseno: () => d([
            T('Hola {nombre},'),
            T('{quien} ha propuesto una corrección de tu registro de jornada:'),
            CAJA('**{correccion}**\nMotivo: {motivo}', { fondo: '#f4f4f4', borde: '#999999' }),
            T('No se aplicará hasta que la apruebes. Entra en **Fichaje** para aprobarla o rechazarla.'),
            BTN([{ texto: 'Ir a Fichaje', url: '{enlace}', fondo: VERDE, color: '#ffffff' }]),
        ]),
    },
    fichaje_resuelta: {
        grupo: 'personal', nombre: 'Fichaje: corrección resuelta', cuando: 'Cuando aprueban o rechazan una corrección que pidió.',
        asunto: 'Tu solicitud de corrección ha sido {estado}',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Marta' }, correccion: { que: 'Qué pidió corregir', ejemplo: 'Entrada del 3 de octubre a las 16:00' }, estado: { que: 'aprobada o rechazada', ejemplo: 'aprobada' }, resuelto_por: { que: 'Quién la resolvió', ejemplo: 'Ana (Secretaría)' }, comentario: { que: 'El comentario, si hay', ejemplo: 'Corregido, gracias por avisar.' }, enlace: { que: 'Enlace a Fichaje', ejemplo: 'https://www.aimeducation.es/admin' } },
        obligatorio: ['estado'],
        diseno: () => d([
            T('Hola {nombre},'),
            T('Tu solicitud **«{correccion}»** ha sido **{estado}**.'),
            T('La ha resuelto {resuelto_por}.', { siHay: 'resuelto_por' }),
            T('Comentario: {comentario}', { siHay: 'comentario' }),
            BTN([{ texto: 'Ir a Fichaje', url: '{enlace}', fondo: VERDE, color: '#ffffff' }]),
        ]),
    },
    fichaje_resumen: {
        grupo: 'personal', nombre: 'Resumen mensual de horas', cuando: 'Cada mes, con el PDF de sus horas (obligatorio por ley).',
        asunto: 'Tu resumen de horas de {mes}',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Marta' }, mes: { que: 'El mes', ejemplo: 'septiembre de 2026' }, version: { que: 'Aviso de versión nueva, si la hay', ejemplo: ' (versión 2, sustituye a la anterior)' }, enlace: { que: 'Enlace para confirmar', ejemplo: 'https://www.aimeducation.es/admin/fichaje' } },
        automaticos: { tabla_horas: { nombre: 'Tabla de horas del mes', ejemplo: ejTabla([['Horas ordinarias', '<b>62,50 h</b>'], ['Horas complementarias', '<b>4,00 h</b>'], ['Total trabajado', '<b>66,50 h</b>']]) } },
        obligatorio: ['tabla_horas', 'enlace'],
        diseno: () => d([
            T('Hola {nombre},'),
            T('Te enviamos el resumen de tus horas de **{mes}**{version}:'),
            AUTO('tabla_horas'),
            T('Tienes el detalle en el PDF adjunto. Entra en **Fichaje** y pulsa **«Confirmar que lo he recibido»**.'),
            BTN([{ texto: 'Ver y confirmar', url: '{enlace}', fondo: VERDE, color: '#ffffff' }]),
        ]),
    },
    ausencia_resuelta: {
        grupo: 'personal', nombre: 'Vacaciones o ausencia resuelta', cuando: 'Cuando aprueban o rechazan su petición de vacaciones o ausencia.',
        asunto: 'Tu petición de {tipo} ha sido {estado}',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Marta' }, tipo: { que: 'Qué pidió', ejemplo: 'vacaciones' }, peticion: { que: 'La petición con sus fechas', ejemplo: 'vacaciones del 1 al 15 de agosto de 2026' }, estado: { que: 'aprobada o rechazada', ejemplo: 'aprobada' }, resuelto_por: { que: 'Quién la resolvió', ejemplo: 'Ana (Secretaría)' }, comentario: { que: 'El comentario, si hay', ejemplo: '¡Que las disfrutes!' }, enlace: { que: 'Enlace a Fichaje', ejemplo: 'https://www.aimeducation.es/admin/fichaje' } },
        obligatorio: ['estado'],
        diseno: () => d([
            T('Hola {nombre},'),
            T('Tu petición de **{peticion}** ha sido **{estado}**.'),
            T('La ha resuelto {resuelto_por}.', { siHay: 'resuelto_por' }),
            T('Comentario: {comentario}', { siHay: 'comentario' }),
            BTN([{ texto: 'Ver en Fichaje', url: '{enlace}', fondo: VERDE, color: '#ffffff' }]),
        ]),
    },
    aviso_alta_web: {
        grupo: 'club', nombre: 'Alta nueva en la web', cuando: 'Cuando una familia se registra en la web y quiere apuntar a sus hijos. Llega a info@.',
        asunto: 'Alta en la web: {tutor} quiere apuntar a {cuantos}',
        variables: { tutor: { que: 'Quién se ha registrado', ejemplo: 'Laura Pérez' }, email: { que: 'Su correo', ejemplo: 'laura@example.com' }, telefono: { que: 'Su teléfono', ejemplo: '600 000 000' }, cuantos: { que: '«un hijo/a» o «N hijos»', ejemplo: '2 hijos' } },
        automaticos: { lista_hijos: { nombre: 'Lista de hijos que quiere apuntar', ejemplo: '<ul style="margin:0;padding-left:20px"><li>Hugo Pérez · 12/03/2017 · Taekwondo</li><li>Sara Pérez · 02/09/2019 · Ballet</li></ul>' } },
        obligatorio: ['lista_hijos'],
        diseno: () => d([
            T('**{tutor}** ({email} · {telefono}) se ha registrado en la web y quiere apuntar a:'),
            AUTO('lista_hijos'),
            T('Está también en el panel, en «Consultas web». Hay que darles de alta, ponerlos en su grupo y enlazarlos con su familia.'),
        ]),
    },
    aviso_consulta_web: {
        grupo: 'club', nombre: 'Consulta nueva en la web', cuando: 'Cuando alguien escribe desde el formulario de contacto. Llega a info@ y se puede contestar directamente.',
        asunto: 'Nueva consulta en la web: {nombre}',
        variables: { nombre: { que: 'Quién escribe', ejemplo: 'Laura Pérez' }, email: { que: 'Su correo', ejemplo: 'laura@example.com' }, telefono: { que: 'Su teléfono', ejemplo: '600 000 000' } },
        automaticos: { mensaje: { nombre: 'El mensaje que ha escrito', ejemplo: '<blockquote style="border-left:3px solid #5233A8;margin:0;padding:6px 12px">Hola, ¿quedan plazas en Ballet para niñas de 6 años?</blockquote>' } },
        obligatorio: ['mensaje'],
        diseno: () => d([
            T('Han escrito desde el formulario de contacto de la web:'),
            T('**{nombre}** · {email} · {telefono}'),
            AUTO('mensaje'),
            PEQ('Puedes contestar directamente a este correo. La consulta está también en el panel, en «Consultas web».'),
        ]),
    },
    gestoria_libro: {
        grupo: 'club', nombre: 'Libro de facturas para la gestoría', cuando: 'Al pulsar «Enviar a la gestoría» en Facturación → Hacienda, cuando ha terminado el periodo. Lleva el Excel adjunto.',
        asunto: 'Libro registro de facturas emitidas · {periodo} · {empresa}',
        variables: { periodo: { que: 'El periodo', ejemplo: '3T de 2026' }, empresa: { que: 'La empresa', ejemplo: 'AIM Deporte y Educación S.L.' } },
        automaticos: {
            datos_empresa: { nombre: 'Los datos de la empresa', ejemplo: 'AIM Deporte y Educación S.L. · CIF B93870103 · Urb. Terrazas de Doña Lola, Local 1, 11203 Algeciras (Cádiz)' },
            resumen: { nombre: 'Lo que lleva el libro', ejemplo: '74 facturas del 1/7/2026 al 30/9/2026 · base 7.000,00 € · IVA 300,00 € · total 7.300,00 €' },
        },
        obligatorio: ['datos_empresa', 'resumen'],
        diseno: () => d([
            T('Hola,'),
            T('Os mandamos el libro registro de facturas emitidas de **{periodo}**, en vuestra plantilla (va adjunto).'),
            AUTO('datos_empresa'),
            AUTO('resumen'),
            PEQ('Cualquier duda, contestad a este correo.'),
        ]),
    },
    aviso_ticket: {
        grupo: 'club', nombre: 'Ticket de soporte nuevo', cuando: 'Cuando alguien abre un ticket de soporte. Le llega a sus encargados o, si no tiene, al Equipo IT; nunca a quien lo abre ni a info@.',
        asunto: '[Soporte Aim Education] Ticket #{numero}: {asunto}',
        variables: { numero: { que: 'Número del ticket', ejemplo: '330' }, asunto: { que: 'Asunto del ticket', ejemplo: 'No me deja pasar lista' }, autor: { que: 'Quién lo abre', ejemplo: 'Marta López' }, email: { que: 'Su correo', ejemplo: 'marta@example.com' } },
        automaticos: { descripcion: { nombre: 'La descripción del ticket', ejemplo: 'Al pulsar «Pasar lista» se queda cargando.' } },
        obligatorio: ['descripcion'],
        diseno: () => d([
            T('Nuevo ticket de **{autor}** ({email})'),
            T('**Asunto:** {asunto}'),
            AUTO('descripcion'),
        ]),
    },
    aviso_candidato: {
        grupo: 'club', nombre: 'Candidatura nueva («Trabaja con nosotros»)', cuando: 'Cuando alguien manda su currículum desde la web. Llega a info@ con el PDF adjunto; se puede contestar directamente.',
        asunto: 'Candidatura nueva: {nombre} ({clases})',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Laura Gómez' }, email: { que: 'Su correo', ejemplo: 'laura@example.com' }, telefono: { que: 'Su teléfono', ejemplo: '600 000 000' }, clases: { que: 'Qué clases puede dar', ejemplo: 'Inglés, Ballet' }, enlace: { que: 'Enlace a Candidatos', ejemplo: 'https://www.aimeducation.es/admin/candidatos' } },
        automaticos: { mensaje: { nombre: 'Lo que nos cuenta', ejemplo: 'Soy profesora de inglés con 5 años de experiencia.' } },
        obligatorio: [],
        diseno: () => d([
            T('Nueva candidatura de **{nombre}** · {email} · {telefono}'),
            T('**Puede dar:** {clases}'),
            AUTO('mensaje'),
            BTN([{ texto: 'Ver en Candidatos', url: '{enlace}', fondo: '', color: '#ffffff' }]),
            PEQ('El currículum va adjunto. Puedes contestar directamente a este correo.'),
        ]),
    },
    // Soporte: avisos de los tickets (se apagan y se ajustan en Automatismos).
    ticket_asignado: {
        grupo: 'personal', nombre: 'Soporte: te han asignado un ticket', cuando: 'Cuando alguien te pone de encargado de un ticket.',
        asunto: 'Te han asignado el ticket #{numero}: {asunto}',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Juan Manuel' }, numero: { que: 'Número del ticket', ejemplo: '366' }, asunto: { que: 'Asunto', ejemplo: 'No me deja pasar lista' }, quien: { que: 'Quién te lo asigna', ejemplo: 'Darío' }, enlace: { que: 'Enlace al ticket', ejemplo: 'https://www.aimeducation.es/admin/soporte/366' } },
        automaticos: { descripcion: { nombre: 'La descripción del ticket', ejemplo: 'Al pulsar «Pasar lista» se queda cargando.' } },
        obligatorio: [],
        diseno: () => d([
            T('Hola {nombre},'),
            T('**{quien}** te ha puesto de encargado del ticket **#{numero} · {asunto}**.'),
            AUTO('descripcion'),
            BTN([{ texto: 'Abrir el ticket', url: '{enlace}', fondo: '', color: '#ffffff' }]),
        ]),
    },
    ticket_mensaje: {
        grupo: 'personal', nombre: 'Soporte: mensaje nuevo en un ticket', cuando: 'Cuando alguien escribe en un ticket que llevas (o que abriste tú). Como mucho uno cada 15 minutos por ticket.',
        asunto: 'Mensaje nuevo en el ticket #{numero}: {asunto}',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Juan Manuel' }, numero: { que: 'Número del ticket', ejemplo: '366' }, asunto: { que: 'Asunto', ejemplo: 'No me deja pasar lista' }, quien: { que: 'Quién escribe', ejemplo: 'Patricia' }, enlace: { que: 'Enlace al ticket', ejemplo: 'https://www.aimeducation.es/admin/soporte/366' } },
        automaticos: { mensaje: { nombre: 'El mensaje', ejemplo: 'Ya me deja, gracias.' } },
        obligatorio: [],
        diseno: () => d([
            T('Hola {nombre},'),
            T('**{quien}** ha escrito en el ticket **#{numero} · {asunto}**:'),
            AUTO('mensaje'),
            BTN([{ texto: 'Contestar', url: '{enlace}', fondo: '', color: '#ffffff' }]),
        ]),
    },
    ticket_respuesta: {
        grupo: 'familias', nombre: 'Soporte: te hemos contestado', cuando: 'Cuando el club contesta a una consulta de soporte de una familia. Como mucho uno cada 15 minutos por consulta.',
        asunto: 'Te hemos contestado: {asunto}',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Lucía' }, numero: { que: 'Número de la consulta', ejemplo: '366' }, asunto: { que: 'Asunto', ejemplo: 'No puedo ver los recibos' }, enlace: { que: 'Enlace a su área', ejemplo: 'https://www.aimeducation.es/dashboard/soporte' } },
        automaticos: { mensaje: { nombre: 'La respuesta', ejemplo: 'Ya está arreglado: vuelve a entrar y lo verás.' } },
        obligatorio: [],
        diseno: () => d([
            T('Hola {nombre},'),
            T('Te hemos contestado a tu consulta **«{asunto}»**:'),
            AUTO('mensaje'),
            BTN([{ texto: 'Ver la conversación', url: '{enlace}', fondo: '', color: '#ffffff' }]),
            PEQ('Puedes contestarnos desde tu área, en Soporte.'),
        ]),
    },
    brickslab_valorar: {
        grupo: 'familias', nombre: 'Brickslab: ¿qué te ha parecido?', cuando: 'Al día siguiente de devolver un set de LEGO o un libro, a la familia, para que lo valore (uno por artículo).',
        asunto: '¿Qué le ha parecido {articulo} a {alumno}?',
        variables: {
            alumno: { que: 'Nombre del alumno', ejemplo: 'Lucía' },
            articulo: { que: 'El set o el libro', ejemplo: 'LEGO Star Wars Caminante' },
            que: { que: '«el set» o «el libro»', ejemplo: 'el set' },
            verbo: { que: '«montar» o «leer»', ejemplo: 'montar' },
            enlace: { que: 'Enlace para valorarlo', ejemplo: 'https://www.aimeducation.es/dashboard/brickslab' },
        },
        obligatorio: ['enlace'],
        diseno: () => d([
            T('Hola,'),
            T('**{alumno}** acaba de devolver {que} **«{articulo}»**. ¿Qué le ha parecido? Con un par de estrellas nos ayuda a elegir lo próximo que compramos y a recomendar a cada uno lo que más le puede gustar.'),
            BTN([{ texto: 'Valorarlo', url: '{enlace}', fondo: '', color: '#ffffff' }]),
            PEQ('Solo es un momento. Si no os apetece, no pasa nada.'),
        ]),
    },
    ticket_resuelto: {
        grupo: 'familias', nombre: 'Soporte: tu consulta está resuelta', cuando: 'Cuando se resuelve o se cierra un ticket, a quien lo abrió (familia o personal), si no es quien lo cierra.',
        asunto: 'Resuelto: {asunto}',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Lucía' }, numero: { que: 'Número', ejemplo: '366' }, asunto: { que: 'Asunto', ejemplo: 'No puedo ver los recibos' }, estado: { que: 'Resuelto o cerrado', ejemplo: 'resuelto' }, quien: { que: 'Quién lo resuelve', ejemplo: 'Juan Manuel' }, enlace: { que: 'Enlace', ejemplo: 'https://www.aimeducation.es/dashboard/soporte' } },
        automaticos: {},
        obligatorio: [],
        diseno: () => d([
            T('Hola {nombre},'),
            T('Tu consulta **«{asunto}»** (#{numero}) se ha **{estado}**.'),
            T('Si necesitas algo más, escríbenos en ella y la volvemos a mirar.'),
            BTN([{ texto: 'Ver la consulta', url: '{enlace}', fondo: '', color: '#ffffff' }]),
        ]),
    },
    tickets_vencidos: {
        grupo: 'personal', nombre: 'Soporte: tus tickets vencidos o parados', cuando: 'Una vez al día, a cada encargado que tenga tickets abiertos vencidos o sin moverse varios días.',
        asunto: 'Tienes {cuantos} tickets que necesitan atención',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Juan Manuel' }, cuantos: { que: 'Cuántos', ejemplo: '3' }, enlace: { que: 'Enlace a Soporte', ejemplo: 'https://www.aimeducation.es/admin/soporte' } },
        automaticos: { lista: { nombre: 'La lista de tickets', ejemplo: '<ul><li>#350 No carga el calendario · venció el 3/10/2026</li><li>#341 Redes sociales · 12 días sin moverse</li></ul>' } },
        obligatorio: ['lista'],
        diseno: () => d([
            T('Hola {nombre},'),
            T('Estos tickets tuyos necesitan atención:'),
            AUTO('lista'),
            BTN([{ texto: 'Ir a Soporte', url: '{enlace}', fondo: '', color: '#ffffff' }]),
        ]),
    },
    tickets_resumen_semanal: {
        grupo: 'club', nombre: 'Soporte: resumen semanal', cuando: 'Una vez por semana, al Equipo IT: cuántos tickets han entrado y salido, cuánto se tarda y qué se ha quedado atascado.',
        asunto: 'Resumen semanal de soporte',
        variables: { nombre: { que: 'Su nombre', ejemplo: 'Juan Manuel' }, enlace: { que: 'Enlace a Soporte', ejemplo: 'https://www.aimeducation.es/admin/soporte' } },
        automaticos: { resumen: { nombre: 'Los números de la semana', ejemplo: '<p>Entraron: 35 · Resueltos: 31 · Abiertos: 44</p>' } },
        obligatorio: ['resumen'],
        diseno: () => d([
            T('Hola {nombre},'),
            T('Así ha ido el soporte en los últimos 7 días:'),
            AUTO('resumen'),
            BTN([{ texto: 'Ver el resumen completo', url: '{enlace}', fondo: '', color: '#ffffff' }]),
        ]),
    },
    sello_semanal: {
        grupo: 'club', nombre: 'Sello semanal del fichaje', cuando: 'Los lunes. Sirve para demostrar ante una inspección que el registro no se ha tocado.',
        asunto: 'Sello semanal del registro de jornada · {fecha}',
        variables: { fecha: { que: 'La fecha', ejemplo: '2026-10-05' } },
        automaticos: { sello: { nombre: 'La huella y la comprobación', ejemplo: '<p style="margin:0 0 8px">Huella del registro de jornada a 05/10/2026 09:00:</p><p style="font-family:monospace;background:#f4f4f4;padding:10px 14px;border-radius:8px;word-break:break-all;margin:0 0 8px">3f9a…c21e</p><p style="margin:0">Apuntes en la cadena: <b>1234</b> · Comprobación: <b style="color:#0a7d3c">íntegro</b></p>' } },
        obligatorio: ['sello'],
        diseno: () => d([
            AUTO('sello'),
            PEQ('No hace falta hacer nada. Conserva este correo: sirve para demostrar que el registro no se ha reescrito después de esta fecha.'),
        ]),
    },
};

// Datos de ejemplo de un correo automático (para la vista previa y las pruebas).
export function ejemplosDe(def) {
    const vars = Object.fromEntries(Object.entries(def?.variables || {}).map(([k, v]) => [k, v.ejemplo ?? '']));
    const automaticos = Object.fromEntries(Object.entries(def?.automaticos || {}).map(([k, v]) => [k, v.ejemplo ?? '']));
    return { vars, automaticos };
}

// Los datos que se pueden usar en los correos del CRM (campañas, ficha,
// automatismos), con su ejemplo.
export const VARIABLES_CRM = {
    nombre: { que: 'Nombre del alumno', ejemplo: 'Lucía' },
    alumno: { que: 'Nombre y apellidos del alumno', ejemplo: 'Lucía García' },
    clases: { que: 'Sus clases', ejemplo: 'Ballet (L-X 17:00)' },
    pendiente: { que: 'Lo que tiene sin pagar', ejemplo: '35,00 €' },
    mes: { que: 'El mes', ejemplo: 'octubre de 2026' },
};
