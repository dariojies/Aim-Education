// ─────────────────────────────────────────────────────────────────────────────
// Paquetes SCORM en el aula virtual (#475): actividades hechas con Articulate,
// iSpring, Captivate, H5P… que llevan su propia nota. SCORM 1.2 y 2004.
//
// - El profesor sube el ZIP como cualquier archivo de una lección (por trozos).
//   Luego se «prepara» en segundo plano (puede pasar de los 30 s de Heroku): se
//   lee del propio archivo troceado, sin tenerlo entero en memoria; se busca el
//   imsmanifest.xml (aunque venga dentro de una carpeta), se guarda cada archivo
//   del paquete aparte (aim_aula_scorm_archivos) y se borran los trozos del ZIP.
// - El alumno lo abre dentro de la lección (/api/aula/scorm/<lección>/…, solo
//   quien puede ver el curso) y la página le da la «API» de SCORM que el paquete
//   busca (window.API para 1.2, window.API_1484_11 para 2004; ver
//   src/aula/scormApi.js). Lo que guarda (cmi: estado, nota, por dónde va…) se
//   apunta por alumno y actividad en aim_aula_scorm_datos.
// - Cuenta como un cuestionario (#475): la lección queda hecha cuando el paquete
//   dice aprobado o completado (y no suspendido), en todas sus actividades. Un
//   intento peor no quita lo ya aprobado. La nota (sobre 10) sale en Resultados.
// ─────────────────────────────────────────────────────────────────────────────
import yauzl from 'yauzl';
import { Readable } from 'stream';

export async function crearTablasScorm(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_scorm (
            archivo_id INTEGER PRIMARY KEY REFERENCES aim_aula_archivos(id) ON DELETE CASCADE,
            estado VARCHAR(12) NOT NULL DEFAULT 'preparando',
            error TEXT,
            version VARCHAR(8),
            titulo TEXT,
            scos JSONB,
            archivos INTEGER,
            bytes BIGINT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_scorm_archivos (
            archivo_id INTEGER NOT NULL REFERENCES aim_aula_scorm(archivo_id) ON DELETE CASCADE,
            ruta VARCHAR(500) NOT NULL,
            mime VARCHAR(120) NOT NULL,
            datos BYTEA NOT NULL,
            PRIMARY KEY (archivo_id, ruta)
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_scorm_datos (
            leccion_id INTEGER NOT NULL REFERENCES aim_aula_lecciones(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            sco VARCHAR(200) NOT NULL DEFAULT '',
            cmi JSONB NOT NULL DEFAULT '{}',
            estado VARCHAR(20),
            nota NUMERIC(5,2),
            ultima NUMERIC(5,2),
            hecho BOOLEAN NOT NULL DEFAULT false,
            sesiones INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (leccion_id, user_id, sco)
        )`);
    await client.query(`ALTER TABLE aim_aula_scorm_datos ADD COLUMN IF NOT EXISTS ultima NUMERIC(5,2)`);
}

// ── Un XML pequeño (el manifiesto): elementos, atributos y texto ──
export function parsearXml(xml) {
    const raiz = { nombre: '#raiz', attrs: {}, hijos: [], texto: '' };
    const pila = [raiz];
    const s = String(xml || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');
    const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    const entidades = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
    let m;
    while ((m = re.exec(s))) {
        const arriba = pila[pila.length - 1];
        if (m[1] != null) arriba.texto += m[1];
        else if (m[2]) { if (pila.length > 1) pila.pop(); }
        else if (m[3]) {
            const attrs = {};
            for (const a of (m[4] || '').matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = entidades(a[2] ?? a[3] ?? '');
            const el = { nombre: m[3], attrs, hijos: [], texto: '' };
            arriba.hijos.push(el);
            if (!m[5]) pila.push(el);
        } else if (m[6]) arriba.texto += entidades(m[6]);
    }
    return raiz;
}
const local = (n) => String(n).split(':').pop().toLowerCase();
const hijos = (el, n) => (el?.hijos || []).filter(h => local(h.nombre) === n);
const hijo = (el, n) => hijos(el, n)[0] || null;
const todos = (el, n, r = []) => { for (const h of el?.hijos || []) { if (local(h.nombre) === n) r.push(h); todos(h, n, r); } return r; };
const atr = (el, n) => { if (!el) return null; for (const [k, v] of Object.entries(el.attrs)) if (local(k) === n.toLowerCase()) return v; return null; };

// { version: '1.2' | '2004', titulo, scos: [{ id, titulo, href, masteryScore, launchData }] }
export function leerManifiesto(xml) {
    const raiz = parsearXml(xml), man = todos(raiz, 'manifest')[0];
    if (!man) throw new Error('El imsmanifest.xml no es un manifiesto SCORM.');
    const esquema = String(todos(man, 'schemaversion')[0]?.texto || '').trim();
    const espacios = Object.values(man.attrs).join(' ');
    const version = /2004|cam\s*1\.3|1\.3/i.test(esquema) || /adlcp_v1p3|adlcp_v1p3|imsss|adlseq/i.test(espacios) ? '2004' : '1.2';
    const recursos = new Map(todos(man, 'resource').map(r => [atr(r, 'identifier'), r]));
    const baseRecursos = atr(hijo(man, 'resources'), 'base') || '';
    const orgs = hijo(man, 'organizations');
    const org = hijos(orgs, 'organization').find(o => atr(o, 'identifier') === atr(orgs, 'default')) || hijos(orgs, 'organization')[0];
    const scos = [];
    for (const it of todos(org, 'item')) {
        const ref = atr(it, 'identifierref');
        const r = ref && recursos.get(ref);
        const href = r && atr(r, 'href');
        if (!href) continue;
        const parametros = atr(it, 'parameters') || '';
        const ruta = `${baseRecursos}${atr(r, 'base') || ''}${href}`.replace(/\\/g, '/').replace(/^\.?\//, '');
        scos.push({
            id: String(atr(it, 'identifier') || ref).slice(0, 200),
            titulo: String(hijo(it, 'title')?.texto || '').trim().slice(0, 200) || `Actividad ${scos.length + 1}`,
            href: ruta + (parametros && !ruta.includes('?') ? (parametros.startsWith('?') ? parametros : `?${parametros}`) : ''),
            masteryScore: (() => { const v = Number(String(todos(it, 'masteryscore')[0]?.texto || '').trim()); return Number.isFinite(v) && String(todos(it, 'masteryscore')[0]?.texto || '').trim() ? v : null; })(),
            launchData: String(todos(it, 'datafromlms')[0]?.texto || '').trim().slice(0, 4000) || null,
        });
    }
    // Sin organización: el primer recurso que se pueda abrir.
    if (!scos.length) {
        const r = [...recursos.values()].find(x => atr(x, 'href') && /sco/i.test(atr(x, 'scormtype') || atr(x, 'scormType') || 'sco'));
        if (r) scos.push({ id: String(atr(r, 'identifier') || 'sco').slice(0, 200), titulo: 'Actividad', href: `${baseRecursos}${atr(r, 'base') || ''}${atr(r, 'href')}`.replace(/^\.?\//, ''), masteryScore: null, launchData: null });
    }
    if (!scos.length) throw new Error('El paquete no dice por dónde se empieza (el manifiesto no tiene ninguna actividad).');
    const titulo = String(hijo(org, 'title')?.texto || '').trim().slice(0, 200) || scos[0].titulo;
    return { version, titulo, scos: scos.slice(0, 50) };
}

const MIMES = {
    html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', xhtml: 'application/xhtml+xml', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8', json: 'application/json', xml: 'application/xml', xsd: 'application/xml', txt: 'text/plain; charset=utf-8',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', m4v: 'video/mp4', vtt: 'text/vtt',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject', pdf: 'application/pdf', swf: 'application/x-shockwave-flash',
};
const mimeDe = (ruta) => MIMES[String(ruta).split('.').pop().toLowerCase()] || 'application/octet-stream';
// Una ruta del paquete, limpia: sin «..», sin barras de más, en minúscula no (se respeta).
export const rutaLimpia = (r) => String(r || '').replace(/\\/g, '/').split('/').filter(x => x && x !== '.' && x !== '..').join('/').slice(0, 500);
const MAX_ARCHIVO_PAQUETE = 100 * 1024 * 1024;

// El ZIP, leído de sus trozos en la base (yauzl pide trozos sueltos).
function lectorDeTrozos(pool, archivoId, trozo) {
    const r = new yauzl.RandomAccessReader();
    r._readStreamForRange = (inicio, fin) => Readable.from((async function* () {
        for (let n = Math.floor(inicio / trozo); n * trozo < fin; n++) {
            const desde = Math.max(inicio, n * trozo) - n * trozo, hasta = Math.min(fin, (n + 1) * trozo) - n * trozo;
            const t = (await pool.query(`SELECT substring(datos FROM $3::int FOR $4::int) AS d FROM aim_aula_archivos WHERE parte_de = $1 AND n = $2`, [archivoId, n, desde + 1, hasta - desde])).rows[0];
            if (!t) throw new Error('Falta un trozo del ZIP: vuelve a subirlo.');
            yield t.d;
        }
    })());
    return r;
}
const abrirZip = (lector, bytes) => new Promise((ok, mal) => yauzl.fromRandomAccessReader(lector, bytes, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (e, z) => (e ? mal(e) : ok(z))));
const leerEntrada = (zip, entrada) => new Promise((ok, mal) => zip.openReadStream(entrada, (e, s) => {
    if (e) return mal(e);
    const partes = []; s.on('data', d => partes.push(d)); s.on('end', () => ok(Buffer.concat(partes))); s.on('error', mal);
}));
async function entradasDe(zip) {
    const lista = [];
    await new Promise((ok, mal) => { zip.on('entry', (e) => { lista.push(e); zip.readEntry(); }); zip.on('end', ok); zip.on('error', mal); zip.readEntry(); });
    return lista;
}

// Prepara un paquete (en segundo plano). Deja aim_aula_scorm en 'listo' o 'error'.
const preparando = new Set();
export async function prepararPaquete(pool, archivoId, trozo) {
    if (preparando.has(archivoId)) return;
    preparando.add(archivoId);
    let zip = null;
    try {
        await pool.query(`INSERT INTO aim_aula_scorm (archivo_id, estado) VALUES ($1, 'preparando')
                          ON CONFLICT (archivo_id) DO UPDATE SET estado = 'preparando', error = NULL`, [archivoId]);
        const a = (await pool.query(`SELECT bytes, completo FROM aim_aula_archivos WHERE id = $1 AND parte_de IS NULL`, [archivoId])).rows[0];
        if (!a?.completo) throw new Error('El ZIP no ha terminado de subirse.');
        zip = await abrirZip(lectorDeTrozos(pool, archivoId, trozo), Number(a.bytes));
        const entradas = (await entradasDe(zip)).filter(e => !/\/$/.test(e.fileName) && !/(^|\/)__MACOSX\//.test(e.fileName) && !/(^|\/)\.DS_Store$/.test(e.fileName));
        // El manifiesto marca la raíz del paquete (a veces viene dentro de una carpeta).
        const man = entradas.filter(e => /(^|\/)imsmanifest\.xml$/i.test(e.fileName)).sort((x, y) => x.fileName.length - y.fileName.length)[0];
        if (!man) throw new Error('No es un paquete SCORM: le falta el imsmanifest.xml. Exporta la actividad «para SCORM» (1.2 o 2004) y sube ese ZIP.');
        const raiz = man.fileName.slice(0, man.fileName.length - 'imsmanifest.xml'.length);
        const info = leerManifiesto((await leerEntrada(zip, man)).toString('utf8'));
        await pool.query(`DELETE FROM aim_aula_scorm_archivos WHERE archivo_id = $1`, [archivoId]);
        let n = 0, total = 0;
        for (const e of entradas) {
            if (!e.fileName.startsWith(raiz) || e.uncompressedSize > MAX_ARCHIVO_PAQUETE) continue;
            const ruta = rutaLimpia(e.fileName.slice(raiz.length));
            if (!ruta) continue;
            const datos = await leerEntrada(zip, e);
            await pool.query(`INSERT INTO aim_aula_scorm_archivos (archivo_id, ruta, mime, datos) VALUES ($1, $2, $3, $4)
                              ON CONFLICT (archivo_id, ruta) DO UPDATE SET mime = EXCLUDED.mime, datos = EXCLUDED.datos`, [archivoId, ruta, mimeDe(ruta), datos]);
            n++; total += datos.length;
        }
        const falta = info.scos.find(s => !entradas.some(e => rutaLimpia(e.fileName.slice(raiz.length)) === rutaLimpia(s.href.split('?')[0])));
        if (falta) throw new Error(`El paquete dice que empieza en «${falta.href}», pero ese archivo no está en el ZIP.`);
        await pool.query(`UPDATE aim_aula_scorm SET estado = 'listo', version = $2, titulo = $3, scos = $4::jsonb, archivos = $5, bytes = $6 WHERE archivo_id = $1`,
            [archivoId, info.version, info.titulo, JSON.stringify(info.scos), n, total]);
        // El ZIP ya no hace falta (ocupa la base compartida): queda lo descomprimido,
        // y su tamaño cuenta para el espacio del aula.
        await pool.query(`DELETE FROM aim_aula_archivos WHERE parte_de = $1`, [archivoId]);
        await pool.query(`UPDATE aim_aula_archivos SET bytes = $2 WHERE id = $1`, [archivoId, total]);
    } catch (e) {
        await pool.query(`UPDATE aim_aula_scorm SET estado = 'error', error = $2 WHERE archivo_id = $1`, [archivoId, String(e?.message || e).slice(0, 500)]).catch(() => {});
        await pool.query(`DELETE FROM aim_aula_scorm_archivos WHERE archivo_id = $1`, [archivoId]).catch(() => {});
    } finally {
        try { zip?.close(); } catch { /* ya cerrado */ }
        preparando.delete(archivoId);
    }
}

// Sirve un archivo del paquete (con partes, para los vídeos y audios de dentro).
export async function servirArchivoScorm(pool, req, res, archivoId, ruta) {
    const meta = (await pool.query(`SELECT mime, octet_length(datos) AS bytes FROM aim_aula_scorm_archivos WHERE archivo_id = $1 AND ruta = $2`, [archivoId, ruta])).rows[0];
    if (!meta) return res.status(404).type('text/plain').send('Este archivo no está en el paquete.');
    const total = Number(meta.bytes);
    let desde = 0, hasta = total - 1;
    const rango = String(req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/);
    res.set({ 'Content-Type': meta.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'X-Robots-Tag': 'noindex' });
    if (rango && (rango[1] || rango[2])) {
        if (rango[1]) { desde = Number(rango[1]); hasta = rango[2] ? Math.min(Number(rango[2]), total - 1) : total - 1; }
        else desde = Math.max(0, total - Number(rango[2]));
        if (desde > hasta || desde >= total) return res.status(416).set('Content-Range', `bytes */${total}`).end();
        hasta = Math.min(hasta, desde + 8 * 1024 * 1024 - 1);
        res.status(206).set('Content-Range', `bytes ${desde}-${hasta}/${total}`);
    }
    res.set('Content-Length', String(hasta - desde + 1));
    if (req.method === 'HEAD') return res.end();
    const t = (await pool.query(`SELECT substring(datos FROM $3::int FOR $4::int) AS d FROM aim_aula_scorm_archivos WHERE archivo_id = $1 AND ruta = $2`,
        [archivoId, ruta, desde + 1, hasta - desde + 1])).rows[0];
    res.end(t?.d || Buffer.alloc(0));
}

// ── Lo que guarda el paquete: estado, nota y tiempo ──
// Tiempos: 1.2 «HHHH:MM:SS.SS», 2004 «PT1H2M3.5S». Se suman en segundos.
export function segundosDe(t) {
    const s = String(t || '').trim();
    let m = /^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(s);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    m = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s);
    if (m) return (Number(m[1] || 0) * 365 + Number(m[2] || 0) * 30 + Number(m[3] || 0)) * 86400 + Number(m[4] || 0) * 3600 + Number(m[5] || 0) * 60 + Number(m[6] || 0);
    return 0;
}
export function tiempoEn(version, seg) {
    const s = Math.max(0, seg), h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = Math.round((s % 60) * 100) / 100;
    if (version === '2004') return `PT${h}H${mi}M${se}S`;
    return `${String(h).padStart(4, '0')}:${String(mi).padStart(2, '0')}:${se < 10 ? '0' : ''}${se.toFixed(2)}`;
}
// La nota sobre 10 que da el paquete (o null).
export function notaDe(version, cmi) {
    const num = (k) => (cmi[k] === undefined || cmi[k] === '' ? null : Number(cmi[k]));
    if (version === '2004') {
        const sc = num('cmi.score.scaled');
        if (Number.isFinite(sc)) return Math.round(Math.max(0, Math.min(1, sc)) * 1000) / 100;
    }
    const p = version === '2004' ? 'cmi.score.' : 'cmi.core.score.';
    const raw = num(`${p}raw`), max = num(`${p}max`), min = num(`${p}min`) || 0;
    if (!Number.isFinite(raw)) return null;
    const tope = Number.isFinite(max) && max > min ? max : 100;
    return Math.round(Math.max(0, Math.min(1, (raw - min) / (tope - min))) * 1000) / 100;
}
// { estado, hecho }: hecho si aprobado, o completado y no suspendido.
export function estadoDe(version, cmi) {
    if (version === '2004') {
        const exito = cmi['cmi.success_status'] || 'unknown', fin = cmi['cmi.completion_status'] || 'unknown';
        const estado = exito !== 'unknown' ? exito : fin;
        return { estado, hecho: exito === 'passed' || (fin === 'completed' && exito !== 'failed') };
    }
    const estado = cmi['cmi.core.lesson_status'] || 'not attempted';
    return { estado, hecho: estado === 'passed' || estado === 'completed' };
}
