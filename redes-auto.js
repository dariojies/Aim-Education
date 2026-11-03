// ─────────────────────────────────────────────────────────────────────────────
// Publicaciones automáticas en redes (#491), con lo que ya hay en la web:
//
// 1. Las noticias: al publicar una con «Publicar también en redes sociales», se
//    deja programada en Publicaciones (Instagram y Facebook) para 10 minutos
//    después (o para su hora, si la noticia está programada), para poder verla
//    o retocarla antes. La imagen sale de la plantilla «Publicación de las
//    noticias» de Aim Design con la foto de portada en su marco vacío (sin
//    plantilla, la foto tal cual); el texto, con reglas: el título, un resumen,
//    el enlace y los hashtags (los fijos del club y los del tema). Sin foto, solo
//    a Facebook (Instagram la pide).
// 2. Las historias diarias, a las horas que se elijan, de una CLASE cada una.
//    Van por vueltas (#599): en cada vuelta salen todas las clases antes de que
//    se repita ninguna, y el tercio con más plazas libres sale dos veces (no
//    más). Primero la actividad que lleva más tiempo sin salir. La foto es de la
//    galería y con permiso: solo fotos con alguien
//    etiquetado y con TODOS sus etiquetados con permiso de fotos en redes, de un
//    álbum de esa clase o actividad (o con ella en el título); sin repetir las de
//    los últimos 60 días (si ya se han usado todas, se repite alguna). Una clase
//    sin ninguna foto así no puede salir: se dice en Publicaciones.
// Todo queda en Publicaciones (calendario, resultado y errores) y se puede quitar.
// La configuración va en aim_ajustes («redes_automaticas»).
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import sharp from 'sharp';
import { pintarEnServidor, grabarEnServidor, seMueve } from './disenos-servidor.js';
import { configAutomaticos } from './disenos-automaticos.js';
import { textoDeHtml } from './noticias-html.js';

export const CLAVE_REDES_AUTO = 'redes_automaticas';
const DE_FABRICA = { hashtags: '#AIMEducation #Algeciras', historias: { activo: false, horas: ['10:00', '18:00'], excluir: [] }, hechas: [], registro: [] };
const REDES = ['instagram', 'facebook'];

// Los hashtags del tema: si la noticia habla de eso.
const TEMAS = [
    [/taekwon-?do|\bitf\b|cintur[oó]n|artes marciales/i, ['#TaekwonDo', '#ITF']],
    [/ballet|danza|\brad\b/i, ['#Ballet', '#Danza']],
    [/ingl[eé]s|english|cambridge/i, ['#Inglés', '#Cambridge']],
    [/rob[oó]tica|lego|micro:?bit|programaci[oó]n|\bstem\b|brickslab/i, ['#Robótica', '#STEM']],
    [/campamento|verano/i, ['#Campamento']],
    [/pintura|arte|dibujo/i, ['#Pintura', '#Arte']],
    [/pilates/i, ['#Pilates']],
    [/ajedrez/i, ['#Ajedrez']],
    [/baile|moderno|urbano/i, ['#Baile']],
    [/funcional|entrenamiento/i, ['#EntrenamientoFuncional']],
    [/kick ?boxing/i, ['#Kickboxing']],
    [/gimnasia/i, ['#Gimnasia']],
    [/examen|campeonato|competici[oó]n|medalla|torneo/i, ['#Orgullo', '#Deporte']],
];
const hoyMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const horaMadrid = () => new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function instanteMadrid(fecha, hora) {
    const guess = new Date(`${fecha}T${hora}:00Z`);
    const enMadrid = new Date(guess.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
    const enUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
    return new Date(guess.getTime() - (enMadrid - enUtc));
}

export async function configRedesAuto(pool) {
    const v = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = $1`, [CLAVE_REDES_AUTO])).rows[0]?.valor || {};
    return { ...DE_FABRICA, ...v, historias: { ...DE_FABRICA.historias, ...(v.historias || {}) }, hechas: v.hechas || [], registro: v.registro || [] };
}
export async function guardarRedesAuto(pool, cfg, userId = null) {
    await pool.query(
        `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ($1, $2::jsonb, NOW(), $3)
         ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = COALESCE(EXCLUDED.actualizado_por, aim_ajustes.actualizado_por)`,
        [CLAVE_REDES_AUTO, JSON.stringify(cfg), userId]);
}
// Lo último que ha pasado (para enseñarlo en Publicaciones): como mucho 30.
async function apuntar(pool, texto) {
    const cfg = await configRedesAuto(pool);
    cfg.registro = [{ at: new Date().toISOString(), texto }, ...cfg.registro].slice(0, 30);
    await guardarRedesAuto(pool, cfg);
    console.log(`[redes auto] ${texto}`);
}

// ── La plantilla con su foto ──
async function plantilla(pool, uso) {
    const id = Number((await configAutomaticos(pool))[uso]?.id);
    if (!id) return null;
    return (await pool.query(`SELECT id, datos, updated_at FROM aim_disenos WHERE id = $1 AND NOT datos ? 'papelera'`, [id])).rows[0] || null;
}
// La foto va en el primer marco vacío de la primera página; si no hay, de fondo.
function conFoto(datos, url) {
    if (!url) return datos;
    const d = JSON.parse(JSON.stringify(datos));
    const marco = (d.elementos || []).find(e => e.tipo === 'imagen' && !e.url && !e.oculto);
    if (marco) { marco.url = url; marco.ajuste = 'cubrir'; marco.encuadre = null; }
    else d.fondo = { ...(d.fondo || {}), tipo: 'imagen', url };
    return d;
}
// Lo que se publica: la plantilla con su foto (vídeo si se mueve) o, sin
// plantilla, la foto tal cual. null si no hay nada que enseñar.
async function medioDe(d, foto, variables) {
    if (!d) {
        if (!foto?.buf) return null;
        const buf = await sharp(foto.buf).rotate().resize({ width: 1440, height: 1800, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
        const m = await sharp(buf).metadata();
        return { buf, mime: 'image/jpeg', ancho: m.width, alto: m.height };
    }
    const datos = conFoto(d.datos, foto?.url);
    const img = await pintarEnServidor(datos, { variables });
    if (await seMueve(datos)) {
        try { const v = await grabarEnServidor(datos, { variables }); if (v) return { ...v, portada: img.buf }; }
        catch (e) { console.error('[redes auto] no se ha podido grabar en vídeo:', e.message); }
    }
    return img;
}
async function guardarMedio(pool, publicacionId, m) {
    const mini = await sharp(m.portada || m.buf).resize({ width: 360, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    await pool.query(`DELETE FROM aim_social_medios WHERE publicacion_id = $1`, [publicacionId]);
    await pool.query(
        `INSERT INTO aim_social_medios (publicacion_id, orden, mime, datos, miniatura, bytes, ancho, alto, token) VALUES ($1, 0, $2, $3, $4, $5, $6, $7, $8)`,
        [publicacionId, m.mime, m.buf, mini, m.buf.length, m.ancho, m.alto, crypto.randomBytes(24).toString('hex')]);
}

// ── 1. Las noticias ──
// El texto para redes, con reglas (sin IA): título, resumen, enlace y hashtags.
export function textoNoticia(post, { urlPublica, hashtags }) {
    const plano = textoDeHtml(post.formato === 'html' ? post.content : String(post.content || '').replace(/[#*_>]/g, ''));
    let resumen = String(post.excerpt || '').trim();
    if (!resumen) {
        const frases = plano.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || [plano];
        resumen = '';
        for (const f of frases) { if ((resumen + f).length > 300) break; resumen += f; }
        resumen = resumen.trim() || plano.slice(0, 280).trim();
    }
    if (resumen.length > 320) resumen = `${resumen.slice(0, 317).replace(/\s+\S*$/, '')}…`;
    const ruta = post.tipo === 'blog' ? 'blog' : 'noticias';
    const enlace = `${String(urlPublica || '').replace(/^https?:\/\//, '')}/${ruta}/${post.slug}`;
    const delTema = [...new Set(TEMAS.filter(([re]) => re.test(`${post.title} ${plano}`)).flatMap(([, h]) => h))].slice(0, 5);
    const todos = [...new Set([...String(hashtags || '').split(/\s+/).filter(h => /^#[\p{L}\p{N}_]+$/u.test(h)), ...delTema])].slice(0, 12);
    return [post.title, '', resumen, '', `👉 Toda la información en ${enlace}`, '', todos.join(' ')].join('\n').trim();
}
// Deja programada (o la rehace, o la quita) la publicación de una noticia.
// publicar: lo que dice la casilla. Devuelve { id, programada_at } o null.
export async function redesDeNoticia(pool, post, publicar, { urlPublica, userId }) {
    const ya = (await pool.query(`SELECT id, estado FROM aim_social_publicaciones WHERE noticia = $1 ORDER BY id DESC LIMIT 1`, [post.id])).rows[0];
    const visible = ['published', 'scheduled'].includes(post.status);
    if (!publicar || !visible) {
        if (ya && ['programada', 'borrador'].includes(ya.estado)) await pool.query(`DELETE FROM aim_social_publicaciones WHERE id = $1`, [ya.id]);
        return null;
    }
    if (ya && !['programada', 'borrador'].includes(ya.estado)) return null;   // ya salió: no se repite
    const cfg = await configRedesAuto(pool);
    const d = await plantilla(pool, 'noticia');
    let foto = null;
    if (post.cover_image_url) {
        const url = String(post.cover_image_url);
        const abs = /^https?:\/\//.test(url) ? url : `${String(urlPublica).replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
        let buf = null;
        // Sin plantilla hace falta la foto en sí: la de la web se lee de la base.
        const ci = url.match(/^\/ci\/([0-9a-f]{8,40})/);
        if (!d && ci) buf = (await pool.query(`SELECT datos FROM aim_correo_imagenes WHERE id = $1`, [ci[1]])).rows[0]?.datos || null;
        else if (!d) buf = await fetch(abs, { signal: AbortSignal.timeout(20_000) }).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? Buffer.from(b) : null)).catch(() => null);
        foto = { url, buf };
    }
    const resumenCorto = String(post.excerpt || textoDeHtml(post.content || '')).replace(/\s+/g, ' ').trim().slice(0, 140);
    const medio = await medioDe(d, foto, { titulo: post.title, resumen: resumenCorto, categoria: post.category || '' });
    const texto = textoNoticia(post, { urlPublica, hashtags: cfg.hashtags });
    const cuando = post.status === 'scheduled' && new Date(post.published_at) > new Date() ? new Date(new Date(post.published_at).getTime() + 60_000) : new Date(Date.now() + 10 * 60_000);
    const redes = medio ? REDES : ['facebook'];
    const auto = { uso: 'noticia', noticia: post.id };
    let id = ya?.id;
    if (id) {
        await pool.query(`UPDATE aim_social_publicaciones SET texto = $2, redes = $3::text[], tipo = 'post', estado = 'programada', programada_at = $4, resultado = jsonb_build_object('auto', $5::jsonb), updated_at = NOW() WHERE id = $1`,
            [id, texto, redes, cuando, JSON.stringify(auto)]);
    } else {
        id = (await pool.query(
            `INSERT INTO aim_social_publicaciones (texto, redes, tipo, estado, programada_at, resultado, creado_por, noticia)
             VALUES ($1, $2::text[], 'post', 'programada', $3, jsonb_build_object('auto', $4::jsonb), $5, $6) RETURNING id`,
            [texto, redes, cuando, JSON.stringify(auto), userId || null, post.id])).rows[0].id;
    }
    if (medio) await guardarMedio(pool, id, medio);
    else await pool.query(`DELETE FROM aim_social_medios WHERE publicacion_id = $1`, [id]);
    return { id, programadaAt: cuando.toISOString(), redes };
}

// ── 2. Las historias diarias de las actividades ──
const DIAS = { L: 'lunes', M: 'martes', X: 'miércoles', J: 'jueves', V: 'viernes', S: 'sábados', D: 'domingos' };
// «L 16:30-17:30, X 16:30-17:30» → «Lunes y miércoles de 16:30 a 17:30».
export function horarioLegible(t) {
    const tramos = String(t || '').split(',').map(x => x.trim().match(/^([LMXJVSD])\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/)).filter(Boolean);
    if (!tramos.length) return String(t || '').trim();
    const porHora = new Map();
    for (const [, d, a, b] of tramos) { const k = `${a}-${b}`; porHora.set(k, [...(porHora.get(k) || []), DIAS[d]]); }
    const lista = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}` : l[0]);
    const s = [...porHora.entries()].map(([h, d]) => `${lista(d)} de ${h.replace('-', ' a ')}`).join('; ');
    return s.charAt(0).toUpperCase() + s.slice(1);
}
const edades = (a, b) => (a && b ? `De ${a} a ${b} años` : a ? `Desde ${a} años` : b ? `Hasta ${b} años` : 'Para todas las edades');
// Las plazas, como en la web (#527): con más de «pocas» libres no se dice
// cuántas; con «pocas» o menos, sí. «pocas» se elige en Publicaciones →
// Publicaciones automáticas (aim_ajustes «plazas_pocas»; 5 si no se toca) y vale
// también para la web y las reservas con bono.
export const CLAVE_PLAZAS_POCAS = 'plazas_pocas';
export const PLAZAS_POCAS_DEF = 5;
let cachePocas = null;
export async function plazasPocas(pool) {
    if (cachePocas && cachePocas.hasta > Date.now()) return cachePocas.n;
    const v = Number((await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = $1`, [CLAVE_PLAZAS_POCAS])).rows[0]?.valor);
    const n = Number.isInteger(v) && v >= 1 && v <= 50 ? v : PLAZAS_POCAS_DEF;
    cachePocas = { n, hasta: Date.now() + 60_000 };
    return n;
}
export async function guardarPlazasPocas(pool, n, userId = null) {
    await pool.query(
        `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ($1, $2::jsonb, NOW(), $3)
         ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = EXCLUDED.actualizado_por`,
        [CLAVE_PLAZAS_POCAS, JSON.stringify(n), userId]);
    cachePocas = null;
}
export const textoPlazas = (libres, pocas = PLAZAS_POCAS_DEF) => (libres == null || libres > pocas ? 'Hay plazas disponibles'
    : libres <= 0 ? 'Apúntate a la lista de espera' : libres === 1 ? '¡Queda 1 plaza!' : `¡Quedan ${libres} plazas!`);

// Las clases de cada actividad con sus plazas libres.
async function clasesConPlazas(pool, clubId) {
    return (await pool.query(
        `SELECT g.group_id, g.name, g.time, g.min_age, g.max_age, g.max_students, a.name AS actividad,
                (SELECT COUNT(*)::int FROM tul_group_students s WHERE s.group_id = g.group_id) AS ocupadas
         FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id WHERE a.club_id = $1`, [clubId])).rows
        .map(g => ({ ...g, libres: g.max_students ? g.max_students - g.ocupadas : null }));
}
// ── Qué clase sale (#599) ──
// Cuántas veces sale cada clase en una vuelta: el tercio de las que tienen sitio
// con más plazas libres (con los empates), 2; las demás, 1.
export function vecesPorVuelta(clases) {
    const conSitio = clases.filter(c => c.libres != null && c.libres > 0).sort((a, b) => b.libres - a.libres);
    const corte = conSitio.length ? conSitio[Math.max(1, Math.ceil(conSitio.length / 3)) - 1].libres : Infinity;
    return new Map(clases.map(c => [String(c.group_id), c.libres != null && c.libres > 0 && c.libres >= corte ? 2 : 1]));
}
// Las clases que aún tienen que salir en esta vuelta, en orden: primero las que
// no han salido ninguna vez; luego, la actividad que lleva más tiempo sin salir;
// dentro de ella, la clase con más plazas libres (y si no, al azar).
export function clasesPendientes(clases, { veces, salidas, ultimaDeActividad }, azar = Math.random) {
    const n = (c) => salidas.get(String(c.group_id)) || 0;
    const r = new Map(clases.map(c => [String(c.group_id), azar()]));
    return clases.filter(c => n(c) < (veces.get(String(c.group_id)) || 1)).sort((a, b) =>
        n(a) - n(b)
        || (ultimaDeActividad.get(a.actividad) || 0) - (ultimaDeActividad.get(b.actividad) || 0)
        || (b.libres ?? -1) - (a.libres ?? -1)
        || r.get(String(a.group_id)) - r.get(String(b.group_id)));
}
// Una foto con permiso: alguien etiquetado y todos sus etiquetados con permiso
// de fotos en redes. De qué actividad es lo dice el álbum (no los etiquetados:
// un alumno puede ir a varias): primero un álbum de esa clase, luego uno de la
// actividad y, si no, uno cuyo título la nombra («Clase Taekwondo 1»). Sin
// repetir las usadas hace poco.
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const claveActividad = (a) => sinTildes(a).replace(/-/g, '').split(/\s+/)[0] || '';
const PERMISO_FOTO = `EXISTS (SELECT 1 FROM aim_galeria_etiquetas e WHERE e.foto_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM aim_galeria_etiquetas e JOIN users u ON u.user_id = e.user_id WHERE e.foto_id = f.id AND NOT COALESCE(u.media_consent, false))`;
// ¿Tiene la clase alguna foto con permiso (por las mismas reglas que fotoAutorizada)?
async function albumesConPermiso(pool) {
    return (await pool.query(
        `SELECT al.group_id, al.actividad, al.titulo FROM aim_galeria_albumes al
         WHERE EXISTS (SELECT 1 FROM aim_galeria_fotos f WHERE f.album_id = al.id AND ${PERMISO_FOTO})`)).rows;
}
function tieneFotos(c, albumes, actividadDeGrupo) {
    const clave = claveActividad(c.actividad);
    return albumes.some(al => (al.group_id && String(al.group_id) === String(c.group_id))
        || al.actividad === c.actividad
        || (al.group_id && actividadDeGrupo.get(String(al.group_id)) === c.actividad)
        || (clave.length >= 4 && !al.group_id && !al.actividad && sinTildes(al.titulo).replace(/-/g, '').includes(clave)));
}
async function fotoAutorizada(pool, { clase, actividad, clubId, usadas }) {
    const conUsadas = await fotoAutorizadaSin(pool, { clase, actividad, clubId, usadas });
    // Si ya se han usado todas las suyas en los últimos 60 días, se repite una.
    return conUsadas || (usadas.length ? fotoAutorizadaSin(pool, { clase, actividad, clubId, usadas: [] }) : null);
}
async function fotoAutorizadaSin(pool, { clase, actividad, clubId, usadas }) {
    const permiso = `${PERMISO_FOTO}
        AND NOT (f.id = ANY($1::int[]))`;
    const clave = claveActividad(actividad);
    const intentos = [
        [`al.group_id = $2`, [clase.group_id]],
        [`(al.actividad = $2 OR al.group_id IN (SELECT g.group_id FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id WHERE a.club_id = $3 AND a.name = $2))`, [actividad, clubId]],
        ...(clave.length >= 4 ? [[`al.group_id IS NULL AND al.actividad IS NULL AND replace(translate(lower(al.titulo), 'áéíóúüñ', 'aeiouun'), '-', '') LIKE '%' || $2 || '%'`, [clave]]] : []),
    ];
    for (const [donde, vals] of intentos) {
        const r = await pool.query(
            `SELECT f.id, f.mime FROM aim_galeria_fotos f JOIN aim_galeria_albumes al ON al.id = f.album_id
             WHERE ${permiso} AND ${donde} ORDER BY f.created_at DESC LIMIT 60`, [usadas, ...vals]);
        if (r.rows.length) return r.rows[Math.floor(Math.random() * r.rows.length)];
    }
    return null;
}
// La historia de un momento: qué actividad, qué clase, qué foto y cómo sale.
// Sin guardar nada (lo usa también «Ver cómo saldría hoy»).
// solo: para probar una actividad concreta (#516), sin mirar las que no salen ni las de ayer.
// Cómo va la vuelta (#599): las clases que pueden salir (no excluidas y con
// fotos), cuántas veces le toca a cada una, cuántas ha salido desde que empezó la
// vuelta y cuándo salió por última vez cada actividad. Si ya han salido todas lo
// que les tocaba, empieza otra (nueva: la fecha, para guardarla al programar).
export async function estadoVuelta(pool, { clubId, cfg = null, solo = null }) {
    cfg = cfg || await configRedesAuto(pool);
    const todas = await clasesConPlazas(pool, clubId);
    const actividadDeGrupo = new Map(todas.map(c => [String(c.group_id), c.actividad]));
    const albumes = await albumesConPermiso(pool);
    const excluir = solo ? [] : (cfg.historias.excluir || []);
    const deVerdad = todas.filter(c => !excluir.includes(c.actividad));
    const conFotos = deVerdad.filter(c => tieneFotos(c, albumes, actividadDeGrupo));
    const sinFotos = deVerdad.filter(c => !conFotos.includes(c));
    const hist = (await pool.query(
        `SELECT resultado->'auto' AS a, created_at, programada_at FROM aim_social_publicaciones
         WHERE resultado->'auto'->>'uso' = 'actividad' AND estado <> 'error' ORDER BY programada_at`)).rows;
    const ultimaDeActividad = new Map();
    for (const h of hist) if (h.a?.actividad) ultimaDeActividad.set(h.a.actividad, new Date(h.programada_at).getTime());
    const veces = vecesPorVuelta(conFotos);   // el tercio, entre las que pueden salir
    let desde = cfg.historias.vuelta?.desde || null, nueva = null;
    const contar = (d) => {
        const m = new Map();
        for (const h of hist) if (h.a?.grupo && (!d || new Date(h.created_at) >= new Date(d))) m.set(String(h.a.grupo), (m.get(String(h.a.grupo)) || 0) + 1);
        return m;
    };
    let salidas = contar(desde);
    if (!solo && conFotos.length && !clasesPendientes(conFotos, { veces, salidas, ultimaDeActividad }).length) {
        nueva = new Date().toISOString(); desde = nueva; salidas = new Map();
    }
    return { conFotos, sinFotos, veces, salidas, ultimaDeActividad, desde, nueva, hist };
}
// Para Publicaciones: cómo va la vuelta y qué clases no pueden salir.
export async function resumenVuelta(pool, { clubId }) {
    const v = await estadoVuelta(pool, { clubId });
    const toca = (c) => v.veces.get(String(c.group_id)) || 1;
    const sinFotosPorAct = new Map();
    for (const c of v.sinFotos) sinFotosPorAct.set(c.actividad, (sinFotosPorAct.get(c.actividad) || 0) + 1);
    return {
        desde: v.desde, clases: v.conFotos.length, dobles: v.conFotos.filter(c => toca(c) === 2).length,
        historias: v.conFotos.reduce((s, c) => s + toca(c), 0),
        hechas: v.nueva ? 0 : v.conFotos.reduce((s, c) => s + Math.min(toca(c), v.salidas.get(String(c.group_id)) || 0), 0),
        sinFotos: [...sinFotosPorAct.entries()].map(([actividad, clases]) => ({ actividad, clases })).sort((a, b) => a.actividad.localeCompare(b.actividad, 'es')),
    };
}
export async function prepararHistoriaActividad(pool, { clubId, solo = null }) {
    const cfg = await configRedesAuto(pool);
    const { paginaParaActividad } = await import('./src/disenos/render.js');
    const d = await plantilla(pool, 'actividad');
    if (!d) return { error: 'No hay plantilla: en Aim Design, en el diseño, «Que salga solo… → Historias diarias de las actividades».' };
    const v = await estadoVuelta(pool, { clubId, cfg, solo });
    const usadas = v.hist.filter(x => new Date(x.programada_at) > new Date(Date.now() - 60 * 86400e3)).map(x => Number(x.a?.foto)).filter(Boolean);
    const clases = v.conFotos.filter(c => !solo || c.actividad === solo);
    if (!clases.length) {
        return { error: solo ? `${solo} no tiene ninguna foto autorizada para publicar (de un álbum suyo, con todos los etiquetados con permiso de fotos en redes).` : 'No hay ninguna clase con fotos autorizadas para publicar.' };
    }
    // Probando una actividad, cualquiera de sus clases (la que tocaría antes).
    const orden = solo ? clasesPendientes(clases, { veces: new Map(), salidas: new Map(), ultimaDeActividad: new Map() }) : clasesPendientes(clases, v);
    for (const clase of orden.slice(0, 20)) {
        const e = { actividad: clase.actividad, clase };
        const foto = await fotoAutorizada(pool, { clase: e.clase, actividad: e.actividad, clubId, usadas });
        if (!foto) continue;
        const datosFoto = (await pool.query(`SELECT datos, mime FROM aim_galeria_fotos WHERE id = $1`, [foto.id])).rows[0];
        const url = `data:${datosFoto.mime || 'image/jpeg'};base64,${datosFoto.datos.toString('base64')}`;
        const variables = { actividad: e.actividad, clase: e.clase.name, plazas: textoPlazas(e.clase.libres, await plazasPocas(pool)), horario: horarioLegible(e.clase.time), edades: edades(e.clase.min_age, e.clase.max_age) };
        // Con la página de su actividad, si la plantilla tiene una (#516).
        const medio = await medioDe({ ...d, datos: paginaParaActividad(d.datos, e.actividad) }, { url }, variables);
        return { actividad: e.actividad, clase: e.clase.name, grupo: e.clase.group_id, foto: foto.id, variables, medio, disenoId: d.id, vueltaNueva: v.nueva };
    }
    return { error: 'No se ha encontrado ninguna foto autorizada para las clases que tocan.' };
}
// Deja programadas las de hoy (las horas que aún no han pasado). Si se quita
// una en Publicaciones, no vuelve.
let programando = false;
export async function programarHistoriasActividades(pool, { clubId }) {
    if (programando) return;
    programando = true;
    try {
        const cfg = await configRedesAuto(pool);
        if (!cfg.historias.activo) return;
        const hoy = hoyMadrid(), ahora = horaMadrid();
        const horas = (cfg.historias.horas || []).filter(h => /^\d{2}:\d{2}$/.test(h)).sort();
        const hechas = new Set(cfg.hechas || []);
        const deHoy = (await pool.query(
            `SELECT resultado->'auto' AS a FROM aim_social_publicaciones WHERE resultado->'auto'->>'uso' = 'actividad' AND resultado->'auto'->>'fecha' = $1`, [hoy])).rows.map(x => x.a);
        for (const h of horas) {
            const clave = `${hoy}|${h}`;
            if (h <= ahora || hechas.has(clave) || deHoy.some(a => a?.hora === h)) continue;
            const p = await prepararHistoriaActividad(pool, { clubId });
            const actual = await configRedesAuto(pool);
            actual.hechas = [...new Set([...(actual.hechas || []).filter(x => x >= sumarDias(hoy, -7)), clave])];
            // Empieza otra vuelta: desde ahora se cuentan de cero (#599).
            if (!p.error && p.vueltaNueva) actual.historias = { ...actual.historias, vuelta: { desde: p.vueltaNueva } };
            await guardarRedesAuto(pool, actual);
            if (p.error) { await apuntar(pool, `${hoy} a las ${h}: no sale la historia. ${p.error}`); continue; }
            const auto = { uso: 'actividad', fecha: hoy, hora: h, actividad: p.actividad, clase: p.clase, grupo: p.grupo, foto: p.foto, diseno: p.disenoId };
            const id = (await pool.query(
                `INSERT INTO aim_social_publicaciones (texto, redes, tipo, estado, programada_at, resultado) VALUES ('', $1::text[], 'story', 'programada', $2, jsonb_build_object('auto', $3::jsonb)) RETURNING id`,
                [REDES, instanteMadrid(hoy, h), JSON.stringify(auto)])).rows[0].id;
            await guardarMedio(pool, id, p.medio);
            deHoy.push(auto);
            await apuntar(pool, `${hoy} a las ${h}: historia de ${p.actividad} (${p.clase}) programada (#${id}).${p.vueltaNueva ? ' Empieza otra vuelta: ya habían salido todas las clases.' : ''}`);
        }
    } catch (e) { console.error('[redes auto] historias:', e.message); }
    finally { programando = false; }
}
const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
