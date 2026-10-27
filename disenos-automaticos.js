// ─────────────────────────────────────────────────────────────────────────────
// Diseños que salen solos (#471). La dirección elige en Aim Design qué diseño
// es la plantilla de cada uso (así la confirma) y la web hace el resto:
// - festivo: la historia de Instagram y Facebook del día de cada festivo (los de Fichaje →
//   Vacaciones y festivos de tipo nacional, autonómico o local; las vacaciones
//   y los cierres del centro, no). Se deja programada en Publicaciones para las
//   00:00 de ese día, así dura las 24 horas, con {dia}, {festivo} y {vuelta}.
//   Se ve (y se puede quitar) en el calendario de Publicaciones desde una semana
//   antes; si se cambia la plantilla o el festivo, se vuelve a pintar. Si la
//   plantilla tiene animaciones, va en vídeo con ellas (#494).
// - cumple: la felicitación de cumpleaños, con {nombre} y {edad}, que va como
//   imagen dentro del correo del automatismo «Felicitación de cumpleaños».
// Lo elegido va en aim_ajustes («disenos_automaticos»); no hay tablas nuevas.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import sharp from 'sharp';
import { pintarEnServidor, grabarEnServidor, seMueve } from './disenos-servidor.js';

// Dónde sale la historia del festivo (#494: también en Facebook, que antes no
// tenía historias). Si cambia cómo se hace, GENERACION sube y las programadas
// se vuelven a hacer.
const REDES_HISTORIA = ['instagram', 'facebook'];
const GENERACION = 2;

export const CLAVE_AUTOMATICOS = 'disenos_automaticos';
export const USOS_AUTOMATICOS = {
    festivo: { nombre: 'Historia de los festivos' },
    cumple: { nombre: 'Felicitación de cumpleaños' },
    // #491 (redes-auto.js): la imagen de las noticias en redes y las historias diarias.
    noticia: { nombre: 'Publicación de las noticias' },
    actividad: { nombre: 'Historias diarias de las actividades' },
};
const TIPOS_FESTIVO = ['nacional', 'autonomico', 'local'];
const DIAS_ANTES = 7;

// PRUEBA_HOY_AUTOMATISMOS (como en los automatismos): solo para probarlo en local.
const hoyMadrid = () => (/^\d{4}-\d{2}-\d{2}$/.test(process.env.PRUEBA_HOY_AUTOMATISMOS || '') ? process.env.PRUEBA_HOY_AUTOMATISMOS
    : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }));
const sumarDia = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (iso, o) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { ...o, timeZone: 'UTC' });
const semana = (iso) => fmt(iso, { weekday: 'long' });
// «lunes 8 de diciembre» (sin la coma que pone Node tras el día de la semana).
const largo = (iso) => `${semana(iso)} ${fmt(iso, { day: 'numeric' })} de ${fmt(iso, { month: 'long' })}`;
const mismo = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort());
const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Las 00:00 de ese día en España, como instante.
function medianocheMadrid(iso) {
    const guess = new Date(`${iso}T00:00:00Z`);
    const enMadrid = new Date(guess.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
    const enUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
    return new Date(guess.getTime() - (enMadrid - enUtc));
}

export async function configAutomaticos(pool) {
    const v = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = $1`, [CLAVE_AUTOMATICOS])).rows[0]?.valor;
    return v && typeof v === 'object' ? v : {};
}
async function guardarConfig(pool, cfg, userId = null) {
    await pool.query(
        `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ($1, $2::jsonb, NOW(), $3)
         ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = COALESCE(EXCLUDED.actualizado_por, aim_ajustes.actualizado_por)`,
        [CLAVE_AUTOMATICOS, JSON.stringify(cfg), userId]);
}
// Elige (o quita, con id null) la plantilla de un uso.
export async function elegirAutomatico(pool, uso, id, userId) {
    const cfg = await configAutomaticos(pool);
    if (id) cfg[uso] = { ...(cfg[uso] || {}), id, por: userId, at: new Date().toISOString() };
    else delete cfg[uso];
    await guardarConfig(pool, cfg, userId);
}
// Cada uso → el id de su diseño (para la lista de Aim Design).
export async function automaticosElegidos(pool) {
    const cfg = await configAutomaticos(pool);
    return Object.fromEntries(Object.keys(USOS_AUTOMATICOS).map(u => [u, Number(cfg[u]?.id) || null]));
}
// El diseño de un uso, si sigue existiendo y no está en la papelera.
async function disenoDe(pool, uso, cfg) {
    const id = Number(cfg[uso]?.id);
    if (!id) return null;
    return (await pool.query(`SELECT id, datos, updated_at FROM aim_disenos WHERE id = $1 AND NOT datos ? 'papelera'`, [id])).rows[0] || null;
}

// ── Festivos ──
// Los huecos de un festivo: { dia: «Lunes 8 de diciembre», festivo, vuelta: «el martes 9 de diciembre» }
// (la vuelta, con el día y el mes igual que el cierre, #492).
// Se vuelve el siguiente día que no esté cerrado (por lo que sea) ni sea domingo.
export function variablesFestivo(f, cerrados) {
    let vuelta = sumarDia(f.fecha, 1);
    while (cerrados.has(vuelta) || new Date(vuelta + 'T12:00:00Z').getUTCDay() === 0) vuelta = sumarDia(vuelta, 1);
    return { dia: mayuscula(largo(f.fecha)), festivo: f.nombre || 'Festivo', vuelta: `el ${largo(vuelta)}` };
}
async function festivosProximos(pool, desde, hasta) {
    const r = await pool.query(
        `SELECT fecha::text AS fecha, nombre, tipo FROM aim_calendario_laboral WHERE fecha BETWEEN $1::date AND $2::date + 120 ORDER BY fecha`, [desde, hasta]);
    const cerrados = new Set(r.rows.map(x => x.fecha));
    return r.rows.filter(x => x.fecha <= hasta && TIPOS_FESTIVO.includes(x.tipo)).map(f => ({ ...f, variables: variablesFestivo(f, cerrados) }));
}
// Para enseñar cómo saldrá: el próximo festivo (o uno de ejemplo si no hay).
export async function ejemploFestivo(pool) {
    const hoy = hoyMadrid();
    return (await festivosProximos(pool, hoy, sumarDia(hoy, 366)))[0]?.variables
        || { dia: 'Lunes 8 de diciembre', festivo: 'Día de la Inmaculada Concepción', vuelta: 'el martes 9 de diciembre' };
}

// Lo que se publica: con animaciones, el vídeo (y su último fotograma de
// miniatura); si no, o si no se puede grabar, la imagen.
async function medioHistoria(d, variables) {
    const img = await pintarEnServidor(d.datos, { variables });
    if (await seMueve(d.datos)) {
        try {
            const v = await grabarEnServidor(d.datos, { variables });
            if (v) return { ...v, portada: img.buf };
            console.warn(`[diseños] la plantilla #${d.id} lleva vídeos dentro: la historia sale en imagen`);
        } catch (e) { console.error(`[diseños] no se ha podido grabar la historia en vídeo (#${d.id}):`, e.message); }
    }
    return img;
}

async function guardarImagen(pool, publicacionId, img) {
    const mini = await sharp(img.portada || img.buf).resize({ width: 360, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    await pool.query(`DELETE FROM aim_social_medios WHERE publicacion_id = $1`, [publicacionId]);
    await pool.query(
        `INSERT INTO aim_social_medios (publicacion_id, orden, mime, datos, miniatura, bytes, ancho, alto, token)
         VALUES ($1, 0, $2, $3, $4, $5, $6, $7, $8)`,
        [publicacionId, img.mime, img.buf, mini, img.buf.length, img.ancho, img.alto, crypto.randomBytes(24).toString('hex')]);
}

async function crearHistoria(pool, d, cfg, f) {
    const version = new Date(d.updated_at).toISOString();
    const img = await medioHistoria(d, f.variables);
    const marca = { uso: 'festivo', fecha: f.fecha, diseno: d.id, version, variables: f.variables, gen: GENERACION, formato: img.mime.startsWith('video/') ? 'video' : 'imagen' };
    const p = await pool.query(
        `INSERT INTO aim_social_publicaciones (texto, redes, tipo, estado, programada_at, resultado, creado_por)
         VALUES ('', $4::text[], 'story', 'programada', $1, jsonb_build_object('auto', $2::jsonb), $3) RETURNING id`,
        [medianocheMadrid(f.fecha), JSON.stringify(marca), cfg.festivo?.por || null, REDES_HISTORIA]);
    await guardarImagen(pool, p.rows[0].id, img);
    // Apuntada: si alguien la quita en Publicaciones, no se vuelve a crear.
    const actual = await configAutomaticos(pool);
    if (actual.festivo) {
        actual.festivo.hechas = [...new Set([...(actual.festivo.hechas || []), f.fecha])].sort();
        await guardarConfig(pool, actual);
    }
    console.log(`[diseños] historia del festivo ${f.fecha} (${f.nombre}) programada (#${p.rows[0].id})`);
    return p.rows[0].id;
}

// Las historias que se programarán solas entre dos días y aún no lo están (para
// el calendario de Publicaciones, #479): [{ fecha, nombre, variables, disenoId, programadaAt }].
export async function historiasPrevistas(pool, desde, hasta) {
    const cfg = await configAutomaticos(pool);
    const d = await disenoDe(pool, 'festivo', cfg);
    if (!d) return [];
    const hoy = hoyMadrid();
    const ya = new Set((await pool.query(`SELECT resultado->'auto'->>'fecha' AS f FROM aim_social_publicaciones WHERE resultado->'auto'->>'uso' = 'festivo'`)).rows.map(x => x.f));
    const hechas = new Set(cfg.festivo?.hechas || []);
    return (await festivosProximos(pool, desde > hoy ? desde : hoy, hasta))
        .filter(f => !ya.has(f.fecha) && !hechas.has(f.fecha))
        .map(f => ({ fecha: f.fecha, nombre: f.nombre, variables: f.variables, disenoId: d.id, programadaAt: medianocheMadrid(f.fecha).toISOString() }));
}
// «Programarla ya» (#479): la historia de ese festivo, creada ahora para poder
// verla y cambiarla. Devuelve el id de la publicación.
export async function programarHistoriaYa(pool, fecha) {
    const cfg = await configAutomaticos(pool);
    const d = await disenoDe(pool, 'festivo', cfg);
    if (!d) throw Object.assign(new Error('No hay plantilla para las historias de los festivos.'), { status: 409 });
    const ya = (await pool.query(`SELECT id FROM aim_social_publicaciones WHERE resultado->'auto'->>'uso' = 'festivo' AND resultado->'auto'->>'fecha' = $1`, [fecha])).rows[0];
    if (ya) return ya.id;
    const f = (await festivosProximos(pool, fecha, fecha))[0];
    if (!f) throw Object.assign(new Error('Ese día ya no es festivo.'), { status: 404 });
    return crearHistoria(pool, d, cfg, f);
}

// Deja programadas las historias de los festivos de la semana que viene (y la de
// hoy, si aún no estaba). Si la plantilla o el festivo cambian, se vuelve a pintar
// mientras siga programada. Si alguien la borra en Publicaciones, no se repite.
let programando = false;
export async function programarHistoriasFestivos(pool) {
    if (programando) return;
    programando = true;
    try {
        const cfg = await configAutomaticos(pool);
        const d = await disenoDe(pool, 'festivo', cfg);
        const hoy = hoyMadrid();
        const auto = (await pool.query(
            `SELECT id, estado, resultado->'auto' AS auto FROM aim_social_publicaciones WHERE resultado->'auto'->>'uso' = 'festivo'`)).rows;
        const pendientes = auto.filter(p => p.estado === 'programada');
        // Sin plantilla: lo que quedaba programado se quita.
        if (!d) {
            if (pendientes.length) await pool.query(`DELETE FROM aim_social_publicaciones WHERE id = ANY($1::int[])`, [pendientes.map(p => p.id)]);
            return;
        }
        const festivos = await festivosProximos(pool, hoy, sumarDia(hoy, DIAS_ANTES));
        const hechas = new Set(cfg.festivo?.hechas || []);
        // Lo programado de un festivo que ya no está en el calendario (o ya pasó), fuera.
        // Las que se programaron antes de tiempo (#479, «Programarla ya») se quedan.
        const siguen = new Set((await festivosProximos(pool, hoy, sumarDia(hoy, 366))).map(f => f.fecha));
        const sobran = pendientes.filter(p => !siguen.has(p.auto?.fecha));
        if (sobran.length) await pool.query(`DELETE FROM aim_social_publicaciones WHERE id = ANY($1::int[])`, [sobran.map(p => p.id)]);
        const version = new Date(d.updated_at).toISOString();
        for (const f of festivos) {
            const ya = auto.find(p => p.auto?.fecha === f.fecha);
            if (ya) {
                // Programada y con otra plantilla, otra versión, otro nombre o hecha
                // de otra forma (antes de #494): se vuelve a hacer.
                const igual = ya.auto.diseno === d.id && ya.auto.version === version && mismo(ya.auto.variables, f.variables) && ya.auto.gen === GENERACION;
                if (ya.estado !== 'programada' || igual) continue;
                const img = await medioHistoria(d, f.variables);
                const marca = { uso: 'festivo', fecha: f.fecha, diseno: d.id, version, variables: f.variables, gen: GENERACION, formato: img.mime.startsWith('video/') ? 'video' : 'imagen' };
                await guardarImagen(pool, ya.id, img);
                await pool.query(`UPDATE aim_social_publicaciones SET resultado = jsonb_build_object('auto', $2::jsonb), redes = $3::text[], updated_at = NOW() WHERE id = $1`, [ya.id, JSON.stringify(marca), REDES_HISTORIA]);
                console.log(`[diseños] historia del festivo ${f.fecha} vuelta a pintar (#${ya.id})`);
                continue;
            }
            if (hechas.has(f.fecha)) continue;   // se hizo y alguien la quitó en Publicaciones
            await crearHistoria(pool, d, cfg, f);
        }
        // Se recuerdan las de los últimos 60 días (para no repetir las que se quitaron).
        const actual = await configAutomaticos(pool);
        const limite = sumarDia(hoy, -60), lista = (actual.festivo?.hechas || []).filter(x => x >= limite).sort();
        if (actual.festivo && lista.join() !== (actual.festivo.hechas || []).join()) { actual.festivo.hechas = lista; await guardarConfig(pool, actual); }
    } catch (e) {
        console.error('[diseños] historias de los festivos:', e.message);
    } finally { programando = false; }
}

// ── Cumpleaños ──
// La felicitación de esa persona ({nombre}, {edad}), o null si no hay plantilla.
export async function felicitacionCumple(pool, variables) {
    const d = await disenoDe(pool, 'cumple', await configAutomaticos(pool));
    if (!d) return null;
    return pintarEnServidor(d.datos, { variables });
}

// Cómo saldrá (para «Ver cómo sale» en Aim Design), con un diseño cualquiera.
export async function pruebaAutomatico(pool, uso, datos, fecha = null) {
    const delDia = uso === 'festivo' && fecha ? (await festivosProximos(pool, fecha, fecha))[0]?.variables : null;
    const { EJEMPLO_AUTO } = await import('./src/disenos/render.js');
    const variables = delDia || (uso === 'festivo' ? await ejemploFestivo(pool) : EJEMPLO_AUTO[uso] || { nombre: 'Lucía', edad: '9' });
    return pintarEnServidor(datos, { variables });
}
// Para la tele de recepción (#493): la plantilla del festivo y los festivos
// entre dos días, con sus huecos rellenos, y lo que se pone en la tele de cada
// uno (vídeo si se mueve, si no imagen).
export async function festivosParaTele(pool, desde, hasta) {
    const d = await disenoDe(pool, 'festivo', await configAutomaticos(pool));
    if (!d) return { d: null, festivos: [] };
    return { d, festivos: await festivosProximos(pool, desde, hasta) };
}
export const medioFestivo = (d, variables) => medioHistoria(d, variables);

// La imagen de la historia prevista de un festivo (para el calendario, #479).
export async function imagenPrevista(pool, fecha) {
    const d = await disenoDe(pool, 'festivo', await configAutomaticos(pool));
    if (!d) return null;
    const img = await pruebaAutomatico(pool, 'festivo', d.datos, fecha);
    return { ...img, buf: await sharp(img.buf).resize({ width: 360, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer(), mime: 'image/jpeg' };
}
