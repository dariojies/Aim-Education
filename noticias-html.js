// ─────────────────────────────────────────────────────────────────────────────
// El texto enriquecido de las noticias y el blog (ticket #438).
//
// El editor de la pantalla escribe HTML; aquí se limpia antes de guardarlo,
// porque luego se publica en la web: solo pasan las etiquetas del editor
// (párrafos, títulos H2-H4, negrita, cursiva, subrayado, listas, citas,
// enlaces, botones, imágenes con pie, vídeos de YouTube y separadores), la alineación del texto y
// las direcciones http(s), mailto, tel o de la propia web. Nada de scripts,
// estilos sueltos ni atributos raros.
//
// El H1 de la página es el título de la noticia: un H1 dentro del texto pasa a H2.
// ─────────────────────────────────────────────────────────────────────────────
import sanitizeHtml from 'sanitize-html';

const ALINEAR = [/^(left|center|right|justify)$/];
const CON_ALINEAR = ['p', 'h2', 'h3', 'h4', 'li', 'blockquote', 'figure'];
const BASE = {
    allowedTags: ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'a', 'figure', 'figcaption', 'img', 'hr'],
    allowedAttributes: {
        a: ['href', 'class', 'target', 'rel'],
        img: ['src', 'alt', 'loading'],
        figure: ['class', 'style', 'data-youtube'],
        ...Object.fromEntries(CON_ALINEAR.filter(t => t !== 'figure').map(t => [t, ['style']])),
    },
    allowedClasses: { a: ['boton', 'boton-borde'], figure: ['img-pequena', 'img-mediana', 'img-grande', 'video-youtube'] },
    allowedStyles: Object.fromEntries(CON_ALINEAR.map(t => [t, { 'text-align': ALINEAR }])),
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
};
// Un enlace de fuera se abre aparte y sin dar pistas a la otra web.
const esExterno = (href) => /^https?:\/\//i.test(href || '');
// Las direcciones que valen; con otra (javascript:…), el enlace se queda sin dirección (no se pulsa).
const hrefValido = (href) => /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(String(href || '').trim());

export function limpiarHtml(html) {
    return sanitizeHtml(String(html || ''), {
        ...BASE,
        transformTags: {
            b: 'strong', i: 'em', strike: 's', del: 's', h1: 'h2', h5: 'h4', h6: 'h4', div: 'p',
            a: (tag, at) => {
                if (!hrefValido(at.href)) return { tagName: 'a', attribs: {} };
                const a = { href: String(at.href).trim() };
                if (at.class) a.class = at.class;
                if (esExterno(a.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
                return { tagName: 'a', attribs: a };
            },
            img: (tag, at) => ({ tagName: 'img', attribs: { src: at.src || '', alt: at.alt || '', loading: 'lazy' } }),
            // Un vídeo de YouTube (#502): solo con un identificador de vídeo que valga.
            figure: (tag, at) => (/\bvideo-youtube\b/.test(at.class || '')
                ? { tagName: 'figure', attribs: /^[\w-]{6,20}$/.test(at['data-youtube'] || '') ? { class: 'video-youtube', 'data-youtube': at['data-youtube'] } : {} }
                : { tagName: 'figure', attribs: { ...(at.class ? { class: at.class } : {}), ...(at.style ? { style: at.style } : {}) } }),
        },
        // Una imagen sin dirección no sirve; un enlace vacío, tampoco.
        exclusiveFilter: (f) => (f.tag === 'img' && !f.attribs.src) || (f.tag === 'a' && !f.text.trim() && !f.mediaChildren?.length),
    }).trim();
}

// El texto, sin etiquetas (para la descripción de Google y la versión en texto de un correo).
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ', apos: "'" };
export function textoDeHtml(html) {
    const conSaltos = String(html || '').replace(/<\/(p|h[1-6]|li|blockquote|figcaption)>|<br\s*\/?>/gi, '\n');
    return sanitizeHtml(conSaltos, { allowedTags: [], allowedAttributes: {} })
        .replace(/&(#?\w+);/g, (m, e) => ENTIDADES[e] ?? (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) : m))
        .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}

// Para un correo (medios de comunicación) o el RSS: las direcciones de la web,
// completas, y el aspecto de botones e imágenes en línea, que los programas de
// correo no leen las hojas de estilo.
export function htmlParaFuera(html, base) {
    const abs = (u) => (String(u || '').startsWith('/') ? `${base}${u}` : u);
    return sanitizeHtml(String(html || ''), {
        ...BASE,
        allowedAttributes: { ...BASE.allowedAttributes, a: ['href', 'target', 'rel', 'style'], img: ['src', 'alt', 'style', 'width'], figcaption: ['style'] },
        allowedStyles: undefined,
        transformTags: {
            a: (tag, at) => {
                if (!hrefValido(at.href)) return { tagName: 'a', attribs: {} };
                const boton = /\bboton\b/.test(at.class || '');
                const borde = /\bboton-borde\b/.test(at.class || '');
                return { tagName: 'a', attribs: { href: abs(at.href), target: '_blank', rel: 'noopener noreferrer',
                    ...(boton ? { style: `display:inline-block;padding:12px 22px;border-radius:999px;font-weight:700;text-decoration:none;${borde ? 'border:2px solid #5233A8;color:#5233A8' : 'background:#5233A8;color:#ffffff'}` } : {}) } };
            },
            img: (tag, at) => ({ tagName: 'img', attribs: { src: abs(at.src), alt: at.alt || '', style: 'max-width:100%;height:auto;border-radius:8px', width: '560' } }),
            figcaption: () => ({ tagName: 'figcaption', attribs: { style: 'font-size:13px;color:#6B7280;margin-top:4px' } }),
        },
    });
}

// Lo de antes (#438): el «markdown» sencillo con el que se escribían las
// noticias, a HTML. Es lo mismo que pintaba la web.
export function mdAHtml(text) {
    if (!text) return '';
    const html = String(text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>');
    return html.split(/\n\n+/).map(b => (/^<h[2-4]/.test(b.trim()) ? b : `<p>${b.replace(/\n/g, '<br>')}</p>`)).join('\n');
}
// El cuerpo de una entrada en HTML, sea del formato que sea.
export const cuerpoHtml = (post) => (post?.formato === 'html' ? post.content || '' : mdAHtml(post?.content || ''));
