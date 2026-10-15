// ─────────────────────────────────────────────────────────────────────────────
// Lo que leen Google y las redes de cada página (ticket #438).
//
// La web es una sola página que monta el navegador, así que sin esto todas las
// noticias salían con el título y la descripción genéricos de la web (y al
// compartirlas en WhatsApp, igual). Aquí, antes de mandar el index.html, se le
// ponen los de cada noticia, artículo del blog, curso del aula y producto de la
// tienda: título, descripción, imagen, dirección canónica, Open Graph y los
// datos de «artículo» (JSON-LD). Y el sitemap.xml y el robots.txt.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import fs from 'fs';
import { textoDeHtml, cuerpoHtml } from './noticias-html.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const corto = (s, n = 160) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t; };
const NOMBRE = 'Aim Education';

export function crearSeo({ pool, urlBase, archivoIndex }) {
    const router = express.Router();
    const base = () => urlBase().replace(/\/+$/, '');
    const absoluta = (u) => (!u ? null : /^https?:\/\//i.test(u) ? u : `${base()}${u.startsWith('/') ? '' : '/'}${u}`);
    let cache = null;
    const leerIndex = () => {
        if (process.env.NODE_ENV === 'production' && cache) return cache;
        const html = fs.readFileSync(archivoIndex(), 'utf8');
        if (process.env.NODE_ENV === 'production') cache = html;
        return html;
    };

    // El index.html con lo de esta página en la cabecera.
    function enviar(res, m) {
        const titulo = m.titulo ? `${m.titulo} | ${NOMBRE}` : null;
        let html = leerIndex();
        if (titulo) html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(titulo)}</title>`);
        if (m.descripcion) html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(m.descripcion)}">`);
        const url = `${base()}${m.ruta}`;
        const og = [
            `<link rel="canonical" href="${esc(url)}">`,
            `<meta property="og:site_name" content="${NOMBRE}">`,
            `<meta property="og:locale" content="es_ES">`,
            `<meta property="og:type" content="${m.tipo || 'website'}">`,
            `<meta property="og:url" content="${esc(url)}">`,
            titulo && `<meta property="og:title" content="${esc(m.titulo)}">`,
            m.descripcion && `<meta property="og:description" content="${esc(m.descripcion)}">`,
            m.imagen && `<meta property="og:image" content="${esc(absoluta(m.imagen))}">`,
            `<meta name="twitter:card" content="${m.imagen ? 'summary_large_image' : 'summary'}">`,
            m.publicado && `<meta property="article:published_time" content="${new Date(m.publicado).toISOString()}">`,
            m.modificado && `<meta property="article:modified_time" content="${new Date(m.modificado).toISOString()}">`,
            m.jsonld && `<script type="application/ld+json">${JSON.stringify(m.jsonld).replace(/</g, '\\u003c')}</script>`,
        ].filter(Boolean).join('\n  ');
        html = html.replace('</head>', `  ${og}\n</head>`);
        res.set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'no-cache').send(html);
    }
    // Si algo falla, la página de siempre: nunca se queda nadie sin web.
    const pagina = (fn) => async (req, res) => {
        try { const m = await fn(req); enviar(res, { ruta: req.path, ...m }); }
        catch (e) { console.error('[seo]', e.message); try { enviar(res, { ruta: req.path }); } catch { res.sendFile(archivoIndex()); } }
    };

    // ── Noticias y blog ──
    router.get('/noticias', pagina(async () => ({ titulo: 'Noticias', descripcion: 'Noticias, eventos, convocatorias y novedades de Aim Education en Algeciras.' })));
    router.get('/blog', pagina(async () => ({ titulo: 'Blog', descripcion: 'Ideas y consejos del equipo de Aim Education: entrenamiento, lectura, idiomas y mucho más.' })));
    const entrada = pagina(async (req) => {
        const p = (await pool.query(
            `SELECT title, slug, excerpt, content, formato, cover_image_url, author_name, published_at, updated_at, tipo, category
             FROM aim_education_posts WHERE slug = $1 AND status = 'published'`, [req.params.slug])).rows[0];
        if (!p) return {};
        const cuerpo = cuerpoHtml(p);
        const descripcion = corto(p.excerpt || textoDeHtml(cuerpo));
        const ruta = `/${p.tipo === 'blog' ? 'blog' : 'noticias'}/${p.slug}`;
        return {
            ruta, titulo: p.title, descripcion, imagen: p.cover_image_url, tipo: 'article', publicado: p.published_at, modificado: p.updated_at,
            jsonld: {
                '@context': 'https://schema.org', '@type': p.tipo === 'blog' ? 'BlogPosting' : 'NewsArticle',
                headline: corto(p.title, 110), description: descripcion, mainEntityOfPage: `${base()}${ruta}`,
                ...(p.cover_image_url ? { image: [absoluta(p.cover_image_url)] } : {}),
                datePublished: p.published_at ? new Date(p.published_at).toISOString() : undefined,
                dateModified: new Date(p.updated_at || p.published_at || Date.now()).toISOString(),
                author: { '@type': 'Organization', name: p.author_name && p.author_name !== 'Admin' ? p.author_name : NOMBRE },
                publisher: { '@type': 'Organization', name: NOMBRE, url: base() },
                articleSection: p.category || undefined, inLanguage: 'es-ES',
            },
        };
    });
    router.get('/noticias/:slug', entrada);
    router.get('/blog/:slug', entrada);

    // ── Aula y tienda ──
    router.get('/aula', pagina(async () => ({ titulo: 'Aula virtual', descripcion: 'Cursos online de Aim Education, gratis y de pago, con vídeos, materiales y tareas que corrige el profesor.' })));
    router.get('/aula/:id', pagina(async (req) => {
        if (!/^\d+$/.test(req.params.id)) return {};
        const c = (await pool.query(`SELECT id, titulo, resumen, descripcion, (portada IS NOT NULL) AS con_portada, updated_at FROM aim_aula_cursos WHERE id = $1 AND publicado`, [req.params.id])).rows[0];
        if (!c) return {};
        const descripcion = corto(c.resumen || c.descripcion);
        return {
            titulo: c.titulo, descripcion, imagen: c.con_portada ? `/api/aula/cursos/${c.id}/portada?v=${new Date(c.updated_at).getTime()}` : null,
            jsonld: { '@context': 'https://schema.org', '@type': 'Course', name: c.titulo, description: descripcion || c.titulo, provider: { '@type': 'Organization', name: NOMBRE, sameAs: base() }, inLanguage: 'es-ES' },
        };
    }));
    router.get('/tienda', pagina(async () => ({ titulo: 'Tienda', descripcion: 'El material del club: doboks, protecciones, guantes y más. Recógelo en Aim Education o recíbelo en casa.' })));
    router.get('/tienda/:id', pagina(async (req) => {
        if (!/^\d+$/.test(req.params.id)) return {};
        const p = (await pool.query(
            `SELECT p.id, p.nombre, p.descripcion, (SELECT f.id FROM aim_tienda_fotos f WHERE f.producto_id = p.id ORDER BY f.orden, f.id LIMIT 1) AS foto
             FROM aim_tienda_productos p WHERE p.id = $1 AND p.publicado`, [req.params.id])).rows[0];
        if (!p) return {};
        return {
            titulo: p.nombre, descripcion: corto(p.descripcion || `${p.nombre}, en la tienda de Aim Education.`), imagen: p.foto ? `/api/tienda/fotos/${p.foto}` : null,
            jsonld: { '@context': 'https://schema.org', '@type': 'Product', name: p.nombre, description: corto(p.descripcion || p.nombre), ...(p.foto ? { image: [absoluta(`/api/tienda/fotos/${p.foto}`)] } : {}), brand: { '@type': 'Organization', name: NOMBRE } },
        };
    }));

    // ── Para los buscadores ──
    router.get('/robots.txt', (req, res) => {
        res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(
            `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /dashboard\nDisallow: /api/\nDisallow: /auth\nDisallow: /tienda/carrito\n\nSitemap: ${base()}/sitemap.xml\n`);
    });
    router.get('/sitemap.xml', async (req, res) => {
        try {
            const fijas = ['/', '/actividades', '/campamento', '/calendario', '/noticias', '/blog', '/aula', '/tienda', '/brickslab', '/conocenos', '/contacto'];
            const [posts, cursos, productos] = await Promise.all([
                pool.query(`SELECT slug, tipo, COALESCE(updated_at, published_at) AS mod FROM aim_education_posts WHERE status = 'published' ORDER BY published_at DESC`),
                pool.query(`SELECT id, updated_at AS mod FROM aim_aula_cursos WHERE publicado`).catch(() => ({ rows: [] })),
                pool.query(`SELECT id, updated_at AS mod FROM aim_tienda_productos WHERE publicado`).catch(() => ({ rows: [] })),
            ]);
            const url = (ruta, mod) => `  <url><loc>${esc(`${base()}${ruta}`)}</loc>${mod ? `<lastmod>${new Date(mod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
            const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                ...fijas.map(r => url(r)),
                ...posts.rows.map(p => url(`/${p.tipo === 'blog' ? 'blog' : 'noticias'}/${encodeURIComponent(p.slug)}`, p.mod)),
                ...cursos.rows.map(c => url(`/aula/${c.id}`, c.mod)),
                ...productos.rows.map(p => url(`/tienda/${p.id}`, p.mod)),
                '</urlset>'].join('\n');
            res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(xml);
        } catch (e) { console.error('[seo] sitemap:', e.message); res.status(500).type('text/plain').send('No disponible.'); }
    });

    return { router };
}
