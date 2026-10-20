// ─────────────────────────────────────────────────────────────────────────────
// Lo que leen Google y las redes de cada página (tickets #438 y #425).
//
// La web es una sola página que monta el navegador: sin esto, todas las páginas
// llegaban con el mismo título y una caja vacía, y Google tenía que esperar a
// ejecutar el JavaScript para saber de qué iban (lo hace, pero más tarde). Aquí,
// antes de mandar el index.html, a cada página pública se le pone:
//  · su título, su descripción, su imagen, su dirección canónica y Open Graph
//    (también para WhatsApp y las redes);
//  · sus datos estructurados (JSON-LD): el club como negocio local de Algeciras,
//    cada noticia como artículo, cada actividad, curso y producto, y las migas;
//  · su contenido en HTML sencillo dentro de #root (títulos, textos y enlaces),
//    que el navegador sustituye al arrancar la web: Google lo lee a la primera.
// Lo que no existe responde 404 (no una página vacía que diga 200), y las zonas
// privadas llevan noindex. Más el sitemap.xml, el de noticias recientes y el
// robots.txt.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import fs from 'fs';
import { textoDeHtml, cuerpoHtml } from './noticias-html.js';
import { ACTIVITIES } from './src/actividadesWeb.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const corto = (s, n = 160) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t; };
const fechaLarga = (d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });

export const NEGOCIO = {
    nombre: 'Aim Education', razon: 'AIM Deporte y Educación S.L.',
    calle: 'Urb. Terrazas de Doña Lola, Local 1', cp: '11203', ciudad: 'Algeciras', provincia: 'Cádiz',
    telefono: '+34 956 742 216', email: 'info@aimeducation.es', logo: '/src/brand/Aim_Horizontal.png',
    redes: ['https://www.instagram.com/aimeducationesp', 'https://www.facebook.com/aimeducationesp', 'https://www.youtube.com/@aimeducationesp',
        'https://www.linkedin.com/company/aimeducationesp/'],
};
// Las secciones de la web, para los enlaces del contenido previo.
const SECCIONES = [['/', 'Inicio'], ['/actividades', 'Actividades'], ['/campamento', 'Campamento de verano'], ['/calendario', 'Calendario'],
    ['/noticias', 'Noticias'], ['/blog', 'Blog'], ['/aula', 'Aula virtual'], ['/tienda', 'Tienda'], ['/brickslab', 'Brickslab y Biblioteca'],
    ['/conocenos', 'Conócenos'], ['/contacto', 'Contacto']];
// Las páginas fijas: título y descripción para Google. El título, de 50 a 60
// letras, y la descripción, de 120 a 160: más largos, Google los corta.
const FIJAS = {
    '/': { tituloCompleto: 'Aim Education Algeciras: taekwondo, ballet, inglés, robótica',
        descripcion: 'Academia en Algeciras con Taekwon-Do ITF, ballet RAD, inglés Cambridge, robótica y STEM, baile y pilates. Formación integral con valores para niños y adultos.' },
    '/actividades': { titulo: 'Actividades en Algeciras: taekwondo, ballet, inglés y más',
        descripcion: 'Todas las actividades de Aim Education en Algeciras: artes marciales, danza, idiomas, robótica, arte y deporte, con grupos por edades y horarios.' },
    '/campamento': { titulo: 'Campamento de verano en Algeciras',
        descripcion: 'Campamento de verano de Aim Education en Algeciras para niños de 4 a 14 años: deporte, inglés y talleres creativos cada semana, por la mañana.' },
    '/calendario': { titulo: 'Calendario', descripcion: 'Los eventos, exámenes, competiciones y fechas importantes de Aim Education en Algeciras.' },
    '/conocenos': { titulo: 'Conócenos', descripcion: 'Quiénes somos: el equipo y la forma de trabajar de Aim Education, academia de deporte, idiomas y educación en Algeciras.' },
    '/contacto': { titulo: 'Contacto', descripcion: `Escríbenos o llámanos: ${NEGOCIO.telefono}. Estamos en ${NEGOCIO.calle}, ${NEGOCIO.cp} ${NEGOCIO.ciudad} (${NEGOCIO.provincia}).` },
    '/brickslab': { titulo: 'Brickslab y Biblioteca', descripcion: 'Sets de LEGO y libros para reservar y llevarse a casa en Aim Education, Algeciras.' },
    '/biblioteca': { titulo: 'Brickslab y Biblioteca', descripcion: 'Sets de LEGO y libros para reservar y llevarse a casa en Aim Education, Algeciras.', canonica: '/brickslab' },
    '/noticias': { titulo: 'Noticias', descripcion: 'Noticias, eventos, convocatorias y novedades de Aim Education en Algeciras.' },
    '/blog': { titulo: 'Blog', descripcion: 'Ideas y consejos del equipo de Aim Education: entrenamiento, lectura, idiomas y mucho más.' },
    '/aula': { titulo: 'Aula virtual', descripcion: 'Cursos online de Aim Education, gratis y de pago, con vídeos, materiales y tareas que corrige el profesor.' },
    '/tienda': { titulo: 'Tienda', descripcion: 'El material del club: doboks, protecciones, guantes y más. Recógelo en Aim Education (Algeciras) o recíbelo en casa.' },
};

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
    const negocioLd = () => ({
        '@context': 'https://schema.org', '@type': ['EducationalOrganization', 'SportsActivityLocation'], '@id': `${base()}/#organizacion`,
        name: NEGOCIO.nombre, legalName: NEGOCIO.razon, url: `${base()}/`, logo: absoluta(NEGOCIO.logo), image: absoluta(NEGOCIO.logo),
        telephone: NEGOCIO.telefono, email: NEGOCIO.email,
        address: { '@type': 'PostalAddress', streetAddress: NEGOCIO.calle, postalCode: NEGOCIO.cp, addressLocality: NEGOCIO.ciudad, addressRegion: NEGOCIO.provincia, addressCountry: 'ES' },
        areaServed: { '@type': 'City', name: NEGOCIO.ciudad }, sameAs: NEGOCIO.redes,
    });
    const migas = (lista) => ({
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: lista.map(([ruta, nombre], i) => ({ '@type': 'ListItem', position: i + 1, name: nombre, item: `${base()}${ruta}` })),
    });

    // ── El contenido previo: HTML sencillo con lo que dice la página ──
    const previo = ({ h1, intro, cuerpo = '', enlaces = [], tituloEnlaces }) => `<div class="seo-previo">
<nav aria-label="Secciones">${SECCIONES.map(([r, t]) => `<a href="${r}">${esc(t)}</a>`).join(' ')}</nav>
<main><h1>${esc(h1)}</h1>${intro ? `<p>${esc(intro)}</p>` : ''}${cuerpo}${enlaces.length ? `${tituloEnlaces ? `<h2>${esc(tituloEnlaces)}</h2>` : ''}<ul>${enlaces.map(e => `<li><a href="${esc(e.ruta)}">${esc(e.texto)}</a>${e.detalle ? ` — ${esc(e.detalle)}` : ''}</li>`).join('')}</ul>` : ''}</main>
<footer><p>${esc(NEGOCIO.nombre)} · ${esc(NEGOCIO.calle)}, ${esc(NEGOCIO.cp)} ${esc(NEGOCIO.ciudad)} (${esc(NEGOCIO.provincia)}) · <a href="tel:${NEGOCIO.telefono.replace(/\s/g, '')}">${esc(NEGOCIO.telefono)}</a> · <a href="mailto:${NEGOCIO.email}">${esc(NEGOCIO.email)}</a></p></footer>
</div>`;

    // El index.html con lo de esta página.
    function enviar(res, m) {
        const titulo = m.tituloCompleto || (m.titulo ? `${m.titulo} | ${NEGOCIO.nombre}` : null);
        let html = leerIndex();
        if (titulo) html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(titulo)}</title>`);
        if (m.descripcion) html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(m.descripcion)}">`);
        const url = `${base()}${m.canonica || m.ruta}`;
        const ld = [].concat(m.jsonld || []).filter(Boolean);
        const cabeza = [
            m.noindex ? `<meta name="robots" content="noindex">` : `<link rel="canonical" href="${esc(url)}">`,
            process.env.GOOGLE_SITE_VERIFICATION && `<meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}">`,
            `<meta property="og:site_name" content="${NEGOCIO.nombre}">`,
            `<meta property="og:locale" content="es_ES">`,
            `<meta property="og:type" content="${m.tipo || 'website'}">`,
            `<meta property="og:url" content="${esc(url)}">`,
            titulo && `<meta property="og:title" content="${esc(m.titulo || titulo)}">`,
            m.descripcion && `<meta property="og:description" content="${esc(m.descripcion)}">`,
            `<meta property="og:image" content="${esc(absoluta(m.imagen || NEGOCIO.logo))}">`,
            `<meta name="twitter:card" content="${m.imagen ? 'summary_large_image' : 'summary'}">`,
            m.publicado && `<meta property="article:published_time" content="${new Date(m.publicado).toISOString()}">`,
            m.modificado && `<meta property="article:modified_time" content="${new Date(m.modificado).toISOString()}">`,
            ...ld.map(x => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`),
        ].filter(Boolean).join('\n  ');
        html = html.replace('</head>', `  ${cabeza}\n</head>`);
        if (m.contenido) html = html.replace('<div id="root"></div>', `<div id="root">${m.contenido}</div>`);
        res.status(m.estado || 200).set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'no-cache').send(html);
    }
    // Si algo falla, la página de siempre: nunca se queda nadie sin web.
    const pagina = (fn) => async (req, res) => {
        try { const m = await fn(req); enviar(res, { ruta: req.path, ...m }); }
        catch (e) { console.error('[seo]', req.path, e.message); try { enviar(res, { ruta: req.path }); } catch { res.sendFile(archivoIndex()); } }
    };
    const noExiste = (que) => ({ estado: 404, noindex: true, titulo: 'No encontrado', contenido: previo({ h1: `${que} no existe o ya no está publicado`, enlaces: [] }) });

    // ── Datos ──
    const ultimas = async (tipo, n = 30) => (await pool.query(
        `SELECT title, slug, excerpt, content, formato, tipo, published_at FROM aim_education_posts
         WHERE status = 'published' ${tipo ? 'AND tipo = $1' : ''} ORDER BY published_at DESC NULLS LAST LIMIT ${n}`, tipo ? [tipo] : [])).rows;
    const rutaPost = (p) => `/${p.tipo === 'blog' ? 'blog' : 'noticias'}/${p.slug}`;
    const resumenPost = (p) => corto(p.excerpt || textoDeHtml(cuerpoHtml(p)), 200);
    const enlacesPosts = (ps) => ps.map(p => ({ ruta: rutaPost(p), texto: p.title, detalle: `${p.published_at ? `${fechaLarga(p.published_at)}. ` : ''}${resumenPost(p)}` }));
    const actividadesWeb = () => ACTIVITIES.filter(a => !a.enlace).map(a => ({ ruta: `/actividades/${a.id}`, texto: a.name, detalle: [a.tag, a.lede, a.ages].filter(Boolean).join(' · ') }));

    // Las zonas privadas no se indexan.
    router.use((req, res, next) => {
        if (/^\/(admin|dashboard|auth)(\/|$)/.test(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow');
        next();
    });

    // ── Inicio y páginas fijas ──
    router.get('/', pagina(async () => {
        const noticias = await ultimas(null, 6);
        return {
            ...FIJAS['/'], jsonld: [negocioLd(), { '@context': 'https://schema.org', '@type': 'WebSite', name: NEGOCIO.nombre, url: `${base()}/`, inLanguage: 'es-ES' }],
            contenido: previo({
                h1: 'Aim Education: innovación educativa y pasión en Algeciras', intro: FIJAS['/'].descripcion,
                // Lo mismo que dice la portada, para quien no ejecuta JavaScript
                // (y los asistentes de IA, que leen esto).
                cuerpo: `<p>Taekwondo, ballet, inglés, robótica y mucho más. Una formación integral en valores, en un entorno de respeto y tolerancia. Cada actividad está diseñada para sacar lo mejor de cada alumno.</p>
<h2>Actividades</h2><ul>${actividadesWeb().map(e => `<li><a href="${e.ruta}">${esc(e.texto)}</a> — ${esc(e.detalle)}</li>`).join('')}</ul>
<h2>Una formación integral y con valores</h2>
<p>Nuestra misión es proporcionar una formación integral, fomentando los valores fundamentales entre nuestros alumnos en un entorno de respeto y tolerancia. Utilizamos una amplia variedad de actividades como herramienta principal en nuestro programa educativo, diseñadas y organizadas para adaptarse específicamente a las características de cada grupo.</p>
<p>Nuestras actividades se clasifican por grupos de edad, desde los 3 años hasta la edad adulta. Así la enseñanza se ajusta a la edad y las necesidades de cada estudiante. Además, limitamos las plazas de todas las actividades para trabajar en grupos reducidos, con la atención más personalizada posible.</p>
<h3>Innovación</h3><p>Perseguimos la innovación para ofrecer nuevas oportunidades a nuestros alumnos.</p>
<h3>Excelencia</h3><p>Nos exigimos lo mejor para ofrecer excelencia en nuestros servicios.</p>
<h3>Pasión</h3><p>Sentimos pasión por nuestro trabajo. Disfrutamos de cada clase.</p>
<h2>¿Listo para empezar este curso?</h2>
<p>Reserva tu plaza online. ¿Quieres probar antes? Con el Pase Explorador tienes un bono de 3 sesiones para probar las actividades que quieras y ver en cuál te apuntas. <a href="/actividades">Ver horarios</a>.</p>`,
                tituloEnlaces: 'Últimas noticias', enlaces: enlacesPosts(noticias),
            }),
        };
    }));
    // Las direcciones de la web antigua (contactar.php…) aún tienen enlaces de
    // fuera: a su página de ahora, con una redirección permanente.
    const ANTIGUAS = { 'contactar.php': '/contacto', 'contacto.php': '/contacto', 'index.php': '/', 'actividades.php': '/actividades', 'noticias.php': '/noticias' };
    router.get(/^\/[\w-]+\.php$/i, (req, res) => res.redirect(301, ANTIGUAS[req.path.slice(1).toLowerCase()] || '/'));

    router.get('/actividades', pagina(async () => ({
        ...FIJAS['/actividades'], jsonld: migas([['/', 'Inicio'], ['/actividades', 'Actividades']]),
        contenido: previo({ h1: 'Actividades en Aim Education (Algeciras)', intro: FIJAS['/actividades'].descripcion, enlaces: actividadesWeb() }),
    })));
    router.get('/actividades/:id', pagina(async (req) => {
        const a = ACTIVITIES.find(x => x.id === req.params.id);
        // Las actividades nuevas del panel no están en el catálogo: la página de siempre.
        if (!a) return { titulo: 'Actividades', descripcion: FIJAS['/actividades'].descripcion };
        // Con el nombre con que la busca la gente (Taekwon-Do → «taekwondo»).
        const descripcion = corto(`${a.name}${a.tambien?.length ? ` (${a.tambien[0].toLowerCase()})` : ''} en Algeciras. ${a.long || a.lede || ''}`);
        return {
            titulo: `${a.name} en Algeciras`, descripcion, imagen: a.fullAsset || a.iconAsset,
            jsonld: [migas([['/', 'Inicio'], ['/actividades', 'Actividades'], [`/actividades/${a.id}`, a.name]]),
                { '@context': 'https://schema.org', '@type': 'Service', name: a.name, ...(a.tambien?.length ? { alternateName: a.tambien } : {}), serviceType: a.tag, description: a.long || a.lede,
                  provider: { '@id': `${base()}/#organizacion`, '@type': 'EducationalOrganization', name: NEGOCIO.nombre }, areaServed: { '@type': 'City', name: NEGOCIO.ciudad } }],
            contenido: previo({
                h1: `${a.name} en Algeciras`, intro: a.lede,
                cuerpo: `${a.long ? `<p>${esc(a.long)}</p>` : ''}${a.nota ? `<p>${esc(a.nota)}</p>` : ''}${a.ages ? `<p>${esc(a.ages)}</p>` : ''}${a.aprender?.length ? `<h2>Qué se aprende</h2><ul>${a.aprender.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`,
                tituloEnlaces: 'Otras actividades', enlaces: actividadesWeb().filter(e => e.ruta !== `/actividades/${a.id}`),
            }),
        };
    }));
    for (const ruta of ['/campamento', '/calendario', '/conocenos', '/contacto', '/brickslab', '/biblioteca']) {
        router.get(ruta, pagina(async () => {
            const f = FIJAS[ruta];
            const camp = ruta === '/campamento' ? ACTIVITIES.find(a => a.id === 'campamento') : null;
            return {
                ...f, imagen: camp?.fullAsset, jsonld: ruta === '/contacto' || ruta === '/conocenos' ? negocioLd() : migas([['/', 'Inicio'], [ruta, f.titulo]]),
                contenido: previo({ h1: f.titulo, intro: f.descripcion, cuerpo: camp?.long ? `<p>${esc(camp.long)}</p>` : '', tituloEnlaces: 'Actividades', enlaces: actividadesWeb() }),
            };
        }));
    }

    // ── Noticias y blog ──
    for (const [ruta, tipo, nombre] of [['/noticias', 'noticia', 'Noticias'], ['/blog', 'blog', 'Blog']]) {
        router.get(ruta, pagina(async () => ({
            ...FIJAS[ruta], jsonld: migas([['/', 'Inicio'], [ruta, nombre]]),
            contenido: previo({ h1: tipo === 'blog' ? 'Blog de Aim Education' : 'Noticias de Aim Education', intro: FIJAS[ruta].descripcion, enlaces: enlacesPosts(await ultimas(tipo, 50)) }),
        })));
    }
    const entrada = pagina(async (req) => {
        const p = (await pool.query(
            `SELECT title, slug, excerpt, content, formato, cover_image_url, author_name, published_at, updated_at, tipo, category
             FROM aim_education_posts WHERE slug = $1 AND status = 'published'`, [req.params.slug])).rows[0];
        if (!p) return noExiste('Esta noticia');
        const cuerpo = cuerpoHtml(p);
        const descripcion = corto(p.excerpt || textoDeHtml(cuerpo));
        const ruta = rutaPost(p);
        const seccion = p.tipo === 'blog' ? ['/blog', 'Blog'] : ['/noticias', 'Noticias'];
        const mas = (await ultimas(p.tipo, 7)).filter(x => x.slug !== p.slug).slice(0, 6);
        return {
            ruta, titulo: p.title, descripcion, imagen: p.cover_image_url, tipo: 'article', publicado: p.published_at, modificado: p.updated_at,
            jsonld: [{
                '@context': 'https://schema.org', '@type': p.tipo === 'blog' ? 'BlogPosting' : 'NewsArticle',
                headline: corto(p.title, 110), description: descripcion, mainEntityOfPage: `${base()}${ruta}`,
                image: [absoluta(p.cover_image_url || NEGOCIO.logo)],
                datePublished: p.published_at ? new Date(p.published_at).toISOString() : undefined,
                dateModified: new Date(p.updated_at || p.published_at || Date.now()).toISOString(),
                author: { '@type': 'Organization', name: p.author_name && p.author_name !== 'Admin' ? p.author_name : NEGOCIO.nombre },
                publisher: { '@type': 'Organization', name: NEGOCIO.nombre, url: `${base()}/`, logo: { '@type': 'ImageObject', url: absoluta(NEGOCIO.logo) } },
                articleSection: p.category || undefined, inLanguage: 'es-ES',
            }, migas([['/', 'Inicio'], seccion, [ruta, p.title]])],
            contenido: previo({
                h1: p.title, intro: p.excerpt,
                cuerpo: `${p.published_at ? `<p><time datetime="${new Date(p.published_at).toISOString()}">${fechaLarga(p.published_at)}</time></p>` : ''}${p.cover_image_url ? `<p><img src="${esc(p.cover_image_url)}" alt="${esc(p.title)}"></p>` : ''}<div class="post-content">${cuerpo}</div>`,
                tituloEnlaces: p.tipo === 'blog' ? 'Más del blog' : 'Más noticias', enlaces: enlacesPosts(mas),
            }),
        };
    });
    router.get('/noticias/:slug', entrada);
    router.get('/blog/:slug', entrada);

    // ── Aula y tienda ──
    router.get('/aula', pagina(async () => {
        const cs = (await pool.query(`SELECT id, titulo, resumen FROM aim_aula_cursos WHERE publicado ORDER BY orden, created_at DESC`).catch(() => ({ rows: [] }))).rows;
        return { ...FIJAS['/aula'], contenido: previo({ h1: 'Aula virtual de Aim Education', intro: FIJAS['/aula'].descripcion, enlaces: cs.map(c => ({ ruta: `/aula/${c.id}`, texto: c.titulo, detalle: c.resumen })) }) };
    }));
    router.get('/aula/:id', pagina(async (req) => {
        if (!/^\d+$/.test(req.params.id)) return noExiste('Este curso');
        const c = (await pool.query(`SELECT id, titulo, resumen, descripcion, (portada IS NOT NULL) AS con_portada, updated_at FROM aim_aula_cursos WHERE id = $1 AND publicado`, [req.params.id])).rows[0];
        if (!c) return noExiste('Este curso');
        const descripcion = corto(c.resumen || c.descripcion);
        return {
            titulo: c.titulo, descripcion, imagen: c.con_portada ? `/api/aula/cursos/${c.id}/portada?v=${new Date(c.updated_at).getTime()}` : null,
            jsonld: [{ '@context': 'https://schema.org', '@type': 'Course', name: c.titulo, description: descripcion || c.titulo, provider: { '@type': 'Organization', name: NEGOCIO.nombre, sameAs: `${base()}/` }, inLanguage: 'es-ES' },
                migas([['/', 'Inicio'], ['/aula', 'Aula virtual'], [`/aula/${c.id}`, c.titulo]])],
            contenido: previo({ h1: c.titulo, intro: c.resumen, cuerpo: c.descripcion ? `<p>${esc(c.descripcion).replace(/\n/g, '<br>')}</p>` : '' }),
        };
    }));
    router.get('/tienda', pagina(async () => {
        const ps = (await pool.query(`SELECT id, nombre, categoria FROM aim_tienda_productos WHERE publicado ORDER BY orden, nombre`).catch(() => ({ rows: [] }))).rows;
        return { ...FIJAS['/tienda'], contenido: previo({ h1: 'Tienda de Aim Education', intro: FIJAS['/tienda'].descripcion, enlaces: ps.map(p => ({ ruta: `/tienda/${p.id}`, texto: p.nombre, detalle: p.categoria })) }) };
    }));
    router.get('/tienda/:id', pagina(async (req) => {
        if (req.params.id === 'carrito') return { titulo: 'Tu carrito', noindex: true };
        if (!/^\d+$/.test(req.params.id)) return noExiste('Este producto');
        const p = (await pool.query(
            `SELECT p.id, p.nombre, p.descripcion, (SELECT f.id FROM aim_tienda_fotos f WHERE f.producto_id = p.id ORDER BY f.orden, f.id LIMIT 1) AS foto
             FROM aim_tienda_productos p WHERE p.id = $1 AND p.publicado`, [req.params.id])).rows[0];
        if (!p) return noExiste('Este producto');
        const descripcion = corto(p.descripcion || `${p.nombre}, en la tienda de Aim Education.`);
        return {
            titulo: p.nombre, descripcion, imagen: p.foto ? `/api/tienda/fotos/${p.foto}` : null,
            jsonld: [{ '@context': 'https://schema.org', '@type': 'Product', name: p.nombre, description: descripcion, ...(p.foto ? { image: [absoluta(`/api/tienda/fotos/${p.foto}`)] } : {}), brand: { '@type': 'Organization', name: NEGOCIO.nombre } },
                migas([['/', 'Inicio'], ['/tienda', 'Tienda'], [`/tienda/${p.id}`, p.nombre]])],
            contenido: previo({ h1: p.nombre, cuerpo: p.descripcion ? `<p>${esc(p.descripcion).replace(/\n/g, '<br>')}</p>` : '' }),
        };
    }));

    // ── Para los buscadores ──
    router.get('/robots.txt', (req, res) => {
        res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(
            `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /dashboard\nDisallow: /api/\nDisallow: /auth\nDisallow: /tienda/carrito\n\n`
            + `Sitemap: ${base()}/sitemap.xml\nSitemap: ${base()}/sitemap-noticias.xml\n`);
    });
    router.get('/sitemap.xml', async (req, res) => {
        try {
            const fijas = ['/', '/actividades', '/campamento', '/calendario', '/noticias', '/blog', '/aula', '/tienda', '/brickslab', '/conocenos', '/contacto'];
            const [posts, cursos, productos] = await Promise.all([
                pool.query(`SELECT slug, tipo, COALESCE(updated_at, published_at) AS mod FROM aim_education_posts WHERE status = 'published' ORDER BY published_at DESC`),
                pool.query(`SELECT id, updated_at AS mod FROM aim_aula_cursos WHERE publicado`).catch(() => ({ rows: [] })),
                pool.query(`SELECT id, updated_at AS mod FROM aim_tienda_productos WHERE publicado`).catch(() => ({ rows: [] })),
            ]);
            const ultimaNoticia = posts.rows[0]?.mod;
            const url = (ruta, mod) => `  <url><loc>${esc(`${base()}${ruta}`)}</loc>${mod ? `<lastmod>${new Date(mod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
            const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                ...fijas.map(r => url(r, ['/', '/noticias', '/blog'].includes(r) ? ultimaNoticia : null)),
                ...ACTIVITIES.filter(a => !a.enlace).map(a => url(`/actividades/${a.id}`)),
                ...posts.rows.map(p => url(rutaPost(p).replace(p.slug, encodeURIComponent(p.slug)), p.mod)),
                ...cursos.rows.map(c => url(`/aula/${c.id}`, c.mod)),
                ...productos.rows.map(p => url(`/tienda/${p.id}`, p.mod)),
                '</urlset>'].join('\n');
            res.type('application/xml').set('Cache-Control', 'public, max-age=900').send(xml);
        } catch (e) { console.error('[seo] sitemap:', e.message); res.status(500).type('text/plain').send('No disponible.'); }
    });
    // Las noticias de los dos últimos días, con el formato de Google Noticias: es
    // lo que Google mira para encontrar enseguida lo recién publicado.
    router.get('/sitemap-noticias.xml', async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT title, slug, tipo, published_at FROM aim_education_posts
                 WHERE status = 'published' AND published_at > NOW() - INTERVAL '2 days' ORDER BY published_at DESC LIMIT 1000`);
            const xml = ['<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
                ...r.rows.map(p => `  <url><loc>${esc(`${base()}${rutaPost(p).replace(p.slug, encodeURIComponent(p.slug))}`)}</loc><news:news><news:publication><news:name>${NEGOCIO.nombre}</news:name><news:language>es</news:language></news:publication><news:publication_date>${new Date(p.published_at).toISOString()}</news:publication_date><news:title>${esc(p.title)}</news:title></news:news></url>`),
                '</urlset>'].join('\n');
            res.type('application/xml').set('Cache-Control', 'public, max-age=300').send(xml);
        } catch (e) { console.error('[seo] sitemap noticias:', e.message); res.status(500).type('text/plain').send('No disponible.'); }
    });

    return { router };
}
