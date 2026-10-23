// ─────────────────────────────────────────────────────────────────────────────
// Diseños: el «Canva» del club (carteles, posts, historias, diplomas…). Aquí
// solo se guardan: el diseño entero es un JSON (lienzo, fondo y elementos) y se
// pinta en el navegador (src/disenos/render.js), igual al diseñar que al
// exportar a PNG, JPG o PDF. Las imágenes que se suben van a las de los correos
// (aim_correo_imagenes, /ci/…), que ya son públicas y para siempre.
//
// Los de tipo «diploma» llevan huecos ({alumno}, {curso}…) y son los diplomas
// del aula virtual: uno por defecto (aim_ajustes «diploma_diseno») y, si un
// curso quiere otro, el suyo (aim_aula_cursos.diploma_diseno_id).
// Lo llevan secretaría y la dirección (sección «grafico», «Aim Design»).
// (No confundir con los diseños de correo de Comunicación.)
//
// Lo que el editor trae del resto de la web (todo con el permiso de Aim Design):
//  · la marca: los colores y el logo de «Marca de los correos»;
//  · las fotos del club: solo las de la galería en las que todos los que salen
//    tienen permiso de fotos. Se sirven desde aquí y se vuelve a mirar el
//    permiso cada vez: si alguien lo retira, su foto deja de salir en los diseños;
//  · los datos para los diplomas en lote: los alumnos de una clase o los de una
//    convocatoria de examen;
//  · y guarda un diseño terminado en las imágenes de los correos y las noticias.
//
// El trabajo en equipo:
//  · versiones (aim_disenos_versiones): al guardar, lo que había se guarda como
//    versión si la última tiene más de 20 minutos (como mucho 50 por diseño);
//  · revisión (aim_disenos_comentarios): comentarios (de todo el diseño o de un
//    elemento) y los pasos de la aprobación: «pedir», «aprobado», «cambios». Lo
//    aprueba la dirección (dueño del club o superadmin). El aprobado guarda la
//    huella del diseño: si después se cambia, vuelve a necesitar aprobación;
//  · carpetas (datos.carpeta) y letras propias (los archivos van a
//    aim_web_documentos, /doc/…; la lista, a aim_ajustes «disenos_fuentes»);
//  · la papelera (datos.papelera, con la fecha): lo borrado se recupera durante
//    30 días y luego se borra de verdad. Carpeta, papelera y el enlace para ver
//    los lleva el servidor: al guardar desde el editor no se pierden.
//
// Editar a varias manos (en vivo): quien abre un diseño se conecta a su «sala»
// (/api/admin/disenos/:id/vivo, eventos del servidor) y manda aquí sus cambios,
// su cursor y lo que tiene elegido; el servidor se lo pasa a los demás. Cada
// navegador lleva el diseño entero y aplica lo de los otros elemento a
// elemento. Las salas viven en la memoria de este proceso: vale con un solo
// dyno web (el plan Basic no admite más); con varios haría falta Redis.
//
// Fotos de banco: las de Openverse (api.openverse.org, gratis y sin cuenta),
// solo las de dominio público (CC0 y «public domain»: no hay que citar a
// nadie). Al usar una, se trae a las imágenes de la web (/ci/…): así el
// diseño no depende de un servidor de fuera y se puede exportar.
//
// El kit de la marca (aim_ajustes «disenos_kit»): las paletas del club y la
// pareja de letras (títulos y texto) para los «Estilos» del editor.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';
import { limpiarMarca, MARCA_POR_DEFECTO } from './correo-diseno.js';
import sharp from 'sharp';

export async function crearTablasDisenos(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_disenos (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(150) NOT NULL,
            tipo VARCHAR(10) NOT NULL DEFAULT 'libre',
            ancho INTEGER NOT NULL,
            alto INTEGER NOT NULL,
            datos JSONB NOT NULL,
            miniatura TEXT,
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    // El diploma propio de un curso (si no, el de por defecto).
    await client.query(`ALTER TABLE aim_aula_cursos ADD COLUMN IF NOT EXISTS diploma_diseno_id INTEGER REFERENCES aim_disenos(id) ON DELETE SET NULL`).catch(() => {});
    // Versiones de cada diseño (para volver a como estaba).
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_disenos_versiones (
            id SERIAL PRIMARY KEY,
            diseno_id INTEGER NOT NULL REFERENCES aim_disenos(id) ON DELETE CASCADE,
            nombre VARCHAR(150),
            datos JSONB NOT NULL,
            miniatura TEXT,
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_disenos_versiones ON aim_disenos_versiones (diseno_id, created_at DESC)`);
    // Comentarios y pasos de la aprobación.
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_disenos_comentarios (
            id SERIAL PRIMARY KEY,
            diseno_id INTEGER NOT NULL REFERENCES aim_disenos(id) ON DELETE CASCADE,
            tipo VARCHAR(12) NOT NULL DEFAULT 'comentario',
            texto TEXT,
            elemento_id VARCHAR(40),
            pagina SMALLINT,
            huella VARCHAR(32),
            resuelto BOOLEAN NOT NULL DEFAULT false,
            autor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_disenos_comentarios ON aim_disenos_comentarios (diseno_id, created_at)`);
}

// La huella de un diseño para la aprobación (sin la carpeta ni la marca de plantilla).
const SQL_HUELLA = (d) => `md5((${d}.datos - 'carpeta' - 'esPlantilla' - 'papelera' - 'enlace')::text)`;
// Lo que guarda el servidor dentro del diseño y el editor no toca.
const SQL_CONSERVAR = `jsonb_strip_nulls(jsonb_build_object('carpeta', datos->'carpeta', 'papelera', datos->'papelera', 'enlace', datos->'enlace'))`;
const DIAS_PAPELERA = 30;
// El último paso de la aprobación de un diseño (pedir, aprobado o cambios).
const SQL_DECISION = (d) => `(SELECT row_to_json(x) FROM (SELECT c.tipo, c.huella, c.created_at FROM aim_disenos_comentarios c
    WHERE c.diseno_id = ${d}.id AND c.tipo IN ('pedir', 'aprobado', 'cambios') ORDER BY c.created_at DESC, c.id DESC LIMIT 1) x)`;
// sin_pedir · pendiente · aprobado · cambios (pide cambios) · cambiado (aprobado, pero se ha tocado después)
function estadoRevision(decision, huella) {
    if (!decision) return 'sin_pedir';
    if (decision.tipo === 'pedir') return 'pendiente';
    if (decision.tipo === 'cambios') return 'cambios';
    return decision.huella === huella ? 'aprobado' : 'cambiado';
}
// La dirección: la que aprueba.
const esDireccion = (req) => ['club_owner', 'superadmin'].includes(req.userSession?.rol);

// ── Los candados de las plantillas (lo que la dirección deja fijo) ──
// Quien no es de la dirección no puede cambiar lo fijo, tampoco por la API: se compara
// con lo guardado. Lo fijo del todo, igual; lo de «solo contenido», igual salvo lo que
// el editor deja cambiar (y el alto que se ajusta solo; un texto curvo, también x y w).
// Los candados no se ponen ni se quitan, lo fijo no se borra y, con la marca fija, el
// tamaño y los fondos no cambian.
const CONTENIDO_LIBRE = { texto: ['texto', 'trozos', 'h'], imagen: ['url', 'encuadre', 'ajuste'], tabla: ['celdas', 'anchos', 'h'], grafico: ['datos'] };
const ordenado = (v) => (Array.isArray(v) ? v.map(ordenado)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).filter(k => v[k] !== undefined && v[k] !== null).sort().map(k => [k, ordenado(v[k])])) : v);
const igual = (a, b) => JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));
const elementosDe = (d) => [...(d?.elementos || []), ...(Array.isArray(d?.paginas) ? d.paginas.flatMap(p => p?.elementos || []) : [])].filter(e => e && typeof e === 'object');
const fondosDe = (d) => [d?.fondo, ...(Array.isArray(d?.paginas) ? d.paginas.map(p => p?.fondo) : [])];
function saltaCandados(antes, despues) {
    const viejos = new Map(elementosDe(antes).filter(e => e.candado).map(e => [e.id, e]));
    for (const e of elementosDe(despues)) if (e.candado && !viejos.has(e.id)) return 'Solo la dirección puede dejar partes fijas.';
    const nuevos = new Map(elementosDe(despues).map(e => [e.id, e]));
    for (const [id, v] of viejos) {
        const n = nuevos.get(id);
        if (!n) return 'Lo que ha dejado fijo la dirección no se puede borrar.';
        if (n.candado !== v.candado) return 'Solo la dirección puede quitar los candados.';
        const libres = v.candado === 'contenido' ? [...(CONTENIDO_LIBRE[v.tipo] || []), ...(v.tipo === 'texto' && (v.curva || n.curva) ? ['x', 'w'] : [])] : [];
        const sin = (e) => Object.fromEntries(Object.entries(e).filter(([k]) => !libres.includes(k)));
        if (!igual(sin(v), sin(n))) return 'Eso cambia partes que ha dejado fijas la dirección.';
    }
    if (antes?.marcaFija) {
        if (!despues.marcaFija) return 'Solo la dirección puede quitar los candados.';
        if (antes.ancho !== despues.ancho || antes.alto !== despues.alto) return 'La dirección ha dejado fijo el tamaño de esta plantilla.';
        const fondos = fondosDe(antes);
        if (fondosDe(despues).some(f => !fondos.some(x => igual(x, f)))) return 'La dirección ha dejado fijo el fondo de esta plantilla.';
    }
    return null;
}
const MAX_VERSIONES = 50;
const MINUTOS_ENTRE_VERSIONES = 20;

// Para la campanita: los diseños esperando a la dirección…
export async function disenosPorAprobar(pool) {
    const r = await pool.query(
        `SELECT COUNT(*)::int n, MAX((x->>'created_at')::timestamptz) AS ultima, MIN(d.id) AS id
         FROM aim_disenos d CROSS JOIN LATERAL (SELECT ${SQL_DECISION('d')} AS x) y WHERE y.x->>'tipo' = 'pedir' AND NOT d.datos ? 'papelera'`);
    return r.rows[0];
}
// …a quien mencionan en un comentario (@[Nombre](id), último mes)…
export async function mencionesDe(pool, userId) {
    const r = await pool.query(
        `SELECT COUNT(*)::int n, MAX(c.created_at) AS ultima, MAX(c.diseno_id) AS id
         FROM aim_disenos_comentarios c JOIN aim_disenos d ON d.id = c.diseno_id AND NOT d.datos ? 'papelera'
         WHERE c.tipo = 'comentario' AND c.texto LIKE '%](' || $1::text || ')%' AND c.autor_id::text IS DISTINCT FROM $1::text
           AND c.created_at > NOW() - INTERVAL '30 days'`, [userId]);
    return r.rows[0];
}
// …y a quien los hizo: comentarios o respuestas de otros en los suyos (último mes).
export async function revisionDeMisDisenos(pool, userId) {
    const r = await pool.query(
        `SELECT COUNT(DISTINCT d.id)::int n, MAX(c.created_at) AS ultima, MIN(d.id) AS id
         FROM aim_disenos d JOIN aim_disenos_comentarios c ON c.diseno_id = d.id
         WHERE d.creado_por = $1 AND NOT d.datos ? 'papelera' AND c.autor_id IS DISTINCT FROM $1 AND c.tipo IN ('comentario', 'aprobado', 'cambios')
           AND c.created_at > NOW() - INTERVAL '30 days'`, [userId]);
    return r.rows[0];
}

const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
const fallo = (res, err) => {
    if (!err.status) console.error('[diseños]', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'No se ha podido hacer. Inténtalo otra vez.' });
};
const MAX_DATOS = 600_000;       // el JSON de un diseño (sin imágenes dentro: van por URL)
const MAX_MINIATURA = 250_000;
export const CLAVE_DIPLOMA = 'diploma_diseno';

// Los colores del club (los del arcoíris del logo y los neutros).
const PALETA_CLUB = ['#5233A8', '#FF5FA2', '#F99B35', '#FFD526', '#21B668', '#00BBF4', '#1A1A1A', '#FFFFFF', '#F6F4EF'];
// Una foto de la galería vale para un diseño si sale alguien etiquetado y todos
// los que salen tienen permiso de fotos (una sin etiquetar no se sabe quién sale).
const SQL_FOTO_CON_PERMISO = (f) => `EXISTS (SELECT 1 FROM aim_galeria_etiquetas e WHERE e.foto_id = ${f}.id)
    AND NOT EXISTS (SELECT 1 FROM aim_galeria_etiquetas e JOIN users u ON u.user_id = e.user_id
                    WHERE e.foto_id = ${f}.id AND COALESCE(u.media_consent, false) = false)`;
const nombreDe = (u) => `TRIM(CONCAT(${u}.name, ' ', COALESCE(${u}.surname, '')))`;
// Quien da la clase, sacado de sus sesiones (como en el horario).
function profesoresDe(sesiones) {
    const nombres = [];
    for (const s of Array.isArray(sesiones) ? sesiones : []) {
        const lista = (Array.isArray(s?.instructors) ? s.instructors : []).map(d => d?.name).filter(Boolean);
        for (const n of lista.length ? lista : s?.instructorName ? [s.instructorName] : []) if (!nombres.includes(n)) nombres.push(n);
    }
    return nombres.join(' y ');
}

function limpiar(body) {
    const nombre = String(body?.nombre || '').trim().slice(0, 150) || 'Diseño sin nombre';
    const tipo = body?.tipo === 'diploma' ? 'diploma' : 'libre';
    const d = body?.datos;
    if (!d || typeof d !== 'object') corta(400, 'Falta el diseño.');
    const ancho = Math.round(Number(d.ancho)), alto = Math.round(Number(d.alto));
    if (!(ancho >= 50 && ancho <= 6000 && alto >= 50 && alto <= 6000)) corta(400, 'El tamaño tiene que estar entre 50 y 6000 píxeles.');
    if (!Array.isArray(d.elementos) || d.elementos.length > 400) corta(400, 'Como mucho 400 elementos por página.');
    // Varias páginas (carruseles, folletos): la primera es el propio diseño y el resto van en «paginas».
    if (d.paginas !== undefined) {
        if (!Array.isArray(d.paginas) || d.paginas.length > 19) corta(400, 'Como mucho 20 páginas por diseño.');
        if (d.paginas.some(p => !p || !Array.isArray(p.elementos) || p.elementos.length > 400)) corta(400, 'Como mucho 400 elementos por página.');
    }
    if (d.carpeta !== undefined && d.carpeta !== null) d.carpeta = String(d.carpeta).trim().slice(0, 60) || undefined;
    const json = JSON.stringify(d);
    if (json.length > MAX_DATOS) corta(400, 'El diseño es demasiado grande. ¿Hay alguna imagen pegada dentro? Súbela.');
    if (/"url"\s*:\s*"data:/.test(json)) corta(400, 'Las imágenes se suben, no se pegan dentro del diseño.');
    const mini = typeof body?.miniatura === 'string' && body.miniatura.startsWith('data:image/') && body.miniatura.length <= MAX_MINIATURA ? body.miniatura : null;
    return { nombre, tipo, ancho, alto, json, mini };
}

export function crearDisenos({ pool, clubId, authenticateSession, requireSeccion }) {
    const router = express.Router();
    const gestion = [authenticateSession, requireSeccion('grafico')];
    const resumen = (x) => ({ id: x.id, nombre: x.nombre, tipo: x.tipo, ancho: x.ancho, alto: x.alto, miniatura: x.miniatura, autor: x.autor || null, actualizado: x.updated_at,
        plantilla: x.plantilla ?? x.datos?.esPlantilla === true, carpeta: x.carpeta ?? x.datos?.carpeta ?? null,
        paginas: x.paginas ?? 1 + (Array.isArray(x.datos?.paginas) ? x.datos.paginas.length : 0),
        revision: x.huella ? estadoRevision(x.decision, x.huella) : undefined, comentarios: x.comentarios ?? undefined });

    async function diplomaPorDefecto() {
        const v = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = $1`, [CLAVE_DIPLOMA])).rows[0]?.valor;
        return Number(v?.id) || null;
    }

    router.get('/api/admin/disenos', ...gestion, async (req, res) => {
        try {
            await pool.query(`DELETE FROM aim_disenos WHERE datos ? 'papelera' AND (datos->>'papelera')::timestamptz < NOW() - INTERVAL '${DIAS_PAPELERA} days'`).catch(() => {});
            const r = await pool.query(
                `SELECT d.id, d.nombre, d.tipo, d.ancho, d.alto, d.miniatura, d.updated_at, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS autor,
                        COALESCE((d.datos->>'esPlantilla')::boolean, false) AS plantilla, d.datos->>'carpeta' AS carpeta,
                        1 + COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(d.datos->'paginas') = 'array' THEN d.datos->'paginas' END), 0) AS paginas,
                        ${SQL_HUELLA('d')} AS huella, ${SQL_DECISION('d')} AS decision,
                        (SELECT COUNT(*) FROM aim_disenos_comentarios c WHERE c.diseno_id = d.id AND c.tipo = 'comentario' AND NOT c.resuelto)::int AS comentarios
                 FROM aim_disenos d LEFT JOIN users u ON u.user_id = d.creado_por
                 WHERE (d.datos ? 'papelera') = $1 ORDER BY d.updated_at DESC LIMIT 500`, [req.query.papelera === '1']);
            res.set('Cache-Control', 'no-store');
            const papelera = (await pool.query(`SELECT COUNT(*)::int n FROM aim_disenos WHERE datos ? 'papelera'`)).rows[0].n;
            res.json({ disenos: r.rows.map(resumen), diplomaPorDefecto: await diplomaPorDefecto(), puedoAprobar: esDireccion(req), papelera });
        } catch (err) { fallo(res, err); }
    });
    // ── En vivo: varias personas en el mismo diseño ──
    const salas = new Map();   // id → { clientes: Map(cliente → { res, userId, nombre, color, desde }) }
    const COLORES_VIVO = ['#E8590C', '#1C7ED6', '#2B8A3E', '#C2255C', '#7048E8', '#0B7285', '#E67700', '#5F3DC4'];
    const enviar = (res, datos) => { try { res.write(`data: ${JSON.stringify(datos)}\n\n`); } catch { /* cerrada */ } };
    const quienes = (sala) => [...sala.clientes].map(([cliente, c]) => ({ cliente, userId: c.userId, nombre: c.nombre, color: c.color }));
    const aLosDemas = (sala, de, datos) => { for (const [cliente, c] of sala.clientes) if (cliente !== de) enviar(c.res, datos); };
    router.get('/api/admin/disenos/:id/vivo', ...gestion, async (req, res) => {
        const id = Number(req.params.id) || 0, cliente = String(req.query.cliente || '').slice(0, 40);
        if (!id || !/^[\w-]{8,40}$/.test(cliente)) return res.status(400).end();
        let nombre = 'Alguien';
        try {
            const u = (await pool.query(`SELECT TRIM(CONCAT(name, ' ', COALESCE(surname, ''))) AS n FROM users WHERE user_id = $1`, [req.userSession.userId])).rows[0];
            if (u?.n) nombre = u.n;
        } catch { /* sin nombre */ }
        res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.flushHeaders?.();
        if (!salas.has(id)) salas.set(id, { clientes: new Map() });
        const sala = salas.get(id);
        const usados = new Set([...sala.clientes.values()].map(c => c.color));
        const color = COLORES_VIVO.find(c => !usados.has(c)) || COLORES_VIVO[sala.clientes.size % COLORES_VIVO.length];
        // Quien lleva más rato le pasa el diseño como está ahora al que llega.
        const veterano = [...sala.clientes.entries()].sort((a, b) => a[1].desde - b[1].desde)[0]?.[0] || null;
        sala.clientes.set(cliente, { res, userId: req.userSession.userId, nombre, color, desde: Date.now() });
        enviar(res, { tipo: 'hola', yo: cliente, color, participantes: quienes(sala) });
        aLosDemas(sala, cliente, { tipo: 'entra', cliente, nombre, color, userId: req.userSession.userId, responde: veterano });
        // Latido: el router de Heroku corta a los 55 s sin nada.
        let fuera = false;
        const irse = () => {
            if (fuera) return;
            fuera = true;
            clearInterval(latido);
            sala.clientes.delete(cliente);
            aLosDemas(sala, cliente, { tipo: 'sale', cliente });
            if (!sala.clientes.size) salas.delete(id);
        };
        const latido = setInterval(() => { if (res.destroyed || res.writableEnded) irse(); else { try { res.write(': latido\n\n'); } catch { irse(); } } }, 20_000);
        res.on('close', irse);
    });
    router.post('/api/admin/disenos/:id/vivo', ...gestion, (req, res) => {
        const sala = salas.get(Number(req.params.id) || 0), de = String(req.body?.cliente || '');
        const c = sala?.clientes.get(de);
        if (!c || c.userId !== req.userSession.userId) return res.status(409).json({ error: 'No estás conectado a este diseño.' });
        const t = req.body?.tipo;
        if (t === 'cambios' && Array.isArray(req.body.ops)) aLosDemas(sala, de, { tipo: 'cambios', de, ops: req.body.ops });
        else if (t === 'cursor') aLosDemas(sala, de, { tipo: 'cursor', de, x: Number(req.body.x) || 0, y: Number(req.body.y) || 0, pagina: Number(req.body.pagina) || 0, sel: Array.isArray(req.body.sel) ? req.body.sel.slice(0, 50) : [] });
        else if (t === 'estado' && req.body.doc) {
            // El diseño entero, para quien acaba de llegar.
            const para = sala.clientes.get(String(req.body.para || ''));
            if (para) enviar(para.res, { tipo: 'estado', de, doc: req.body.doc, nombre: req.body.nombre, tipoDiseno: req.body.tipoDiseno, sucio: !!req.body.sucio });
        } else if (t === 'guardado') aLosDemas(sala, de, { tipo: 'guardado', de, nombre: c.nombre });
        res.json({ success: true });
    });

    // ── Enlace para ver (sin entrar y sin cambiar nada): /d/<clave> ──
    router.post('/api/admin/disenos/:id/enlace', ...gestion, async (req, res) => {
        try {
            const clave = crypto.randomBytes(12).toString('hex');
            const r = await pool.query(
                `UPDATE aim_disenos SET datos = CASE WHEN datos ? 'enlace' THEN datos ELSE jsonb_set(datos, '{enlace}', to_jsonb($2::text)) END
                 WHERE id = $1 RETURNING datos->>'enlace' AS enlace`, [Number(req.params.id) || 0, clave]);
            if (!r.rowCount) corta(404, 'Ese diseño ya no existe.');
            res.json({ success: true, enlace: r.rows[0].enlace });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/disenos/:id/enlace', ...gestion, async (req, res) => {
        try {
            await pool.query(`UPDATE aim_disenos SET datos = datos - 'enlace' WHERE id = $1`, [Number(req.params.id) || 0]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    const disenoDeEnlace = async (clave) => {
        if (!/^[0-9a-f]{24}$/.test(String(clave || ''))) return null;
        return (await pool.query(`SELECT id, nombre, tipo, datos FROM aim_disenos WHERE datos->>'enlace' = $1 AND NOT datos ? 'papelera'`, [clave])).rows[0] || null;
    };
    router.get('/api/publico/disenos/:clave', async (req, res) => {
        try {
            res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
            const d = await disenoDeEnlace(req.params.clave);
            if (!d) return res.status(404).json({ error: 'Este enlace ya no funciona.' });
            const { carpeta, enlace, papelera, esPlantilla, ...datos } = d.datos; // eslint-disable-line no-unused-vars
            // Las fotos de la galería, por su propia dirección (con el permiso mirado otra vez).
            const json = JSON.stringify(datos).replace(/\/api\/admin\/disenos\/foto-club\/(\d+)\/grande/g, `/api/publico/disenos/${req.params.clave}/foto/$1`);
            res.json({ nombre: d.nombre, tipo: d.tipo, datos: JSON.parse(json) });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/publico/disenos/:clave/foto/:fid', async (req, res) => {
        try {
            const d = await disenoDeEnlace(req.params.clave), fid = Number(req.params.fid) || 0;
            if (!d || !JSON.stringify(d.datos).includes(`/foto-club/${fid}/`)) return res.status(404).end();
            const f = (await pool.query(`SELECT f.datos AS img, f.mime FROM aim_galeria_fotos f WHERE f.id = $1 AND ${SQL_FOTO_CON_PERMISO('f')}`, [fid])).rows[0];
            if (!f?.img) return res.status(404).end();
            res.set({ 'Content-Type': f.mime || 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=600', 'X-Robots-Tag': 'noindex' }).send(f.img);
        } catch (err) { fallo(res, err); }
    });

    // ── Una imagen hecha en el editor (una foto sin fondo, por ejemplo) ──
    const guardarImagenDiseno = async (datos, mime, nombre, ancho, alto, userId) => {
        const id = crypto.randomBytes(12).toString('hex');
        await pool.query(
            `INSERT INTO aim_correo_imagenes (id, mime, datos, nombre, ancho, alto, bytes, subido_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [id, mime, datos, String(nombre || '').slice(0, 200) || null, ancho || null, alto || null, datos.length, userId]);
        return `/ci/${id}`;
    };
    router.post('/api/admin/disenos/imagen', ...gestion, async (req, res) => {
        try {
            const m = String(req.body?.datos || '').match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
            if (!m) corta(400, 'La imagen no ha llegado bien.');
            const datos = Buffer.from(m[2], 'base64');
            if (datos.length > 5.5 * 1024 * 1024) corta(413, 'La imagen pesa demasiado (máximo 5 MB).');
            const meta = await sharp(datos).metadata().catch(() => null);
            if (!meta?.width) corta(400, 'Ese archivo no es una imagen válida.');
            res.status(201).json({ success: true, url: await guardarImagenDiseno(datos, m[1], req.body?.nombre, meta.width, meta.height, req.userSession.userId), ancho: meta.width, alto: meta.height });
        } catch (err) { fallo(res, err); }
    });

    // ── Fotos de banco (Openverse, solo dominio público) ──
    const OPENVERSE = 'https://api.openverse.org/v1/images/';
    const cacheBanco = new Map();
    // Lo que trae la búsqueda de cada foto (su dirección y licencia): pedir su ficha a Openverse tarda mucho.
    const fotosVistas = new Map();
    const pedirOpenverse = async (url) => {
        const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 25_000);
        try {
            const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'AimEducation-AimDesign/1.0 (https://www.aimeducation.es)' } });
            if (!r.ok) corta(502, r.status === 429 ? 'El banco de fotos está saturado: prueba en un rato.' : 'El banco de fotos no contesta ahora.');
            return r.json();
        } finally { clearTimeout(t); }
    };
    router.get('/api/admin/disenos/banco', ...gestion, async (req, res) => {
        try {
            const q = String(req.query.q || '').trim().slice(0, 80), pagina = Math.max(1, Math.min(10, Number(req.query.pagina) || 1));
            if (q.length < 2) corta(400, 'Escribe qué buscas.');
            const clave = `${q.toLowerCase()}|${pagina}`;
            let r = cacheBanco.get(clave);
            if (!r || r.t < Date.now() - 15 * 60_000) {
                const d = await pedirOpenverse(`${OPENVERSE}?q=${encodeURIComponent(q)}&license=cc0,pdm&page_size=20&page=${pagina}&mature=false`);
                if (fotosVistas.size > 3000) fotosVistas.clear();
                for (const x of d.results || []) fotosVistas.set(x.id, { url: x.url, license: x.license, title: x.title, source: x.source || x.provider });
                r = { t: Date.now(), total: d.result_count || 0, paginas: d.page_count || 1, fotos: (d.results || []).map(x => ({
                    id: x.id, titulo: x.title || '', autor: x.creator || '', fuente: x.source || x.provider || '', licencia: x.license,
                    ancho: x.width || null, alto: x.height || null, mini: `${OPENVERSE}${x.id}/thumb/`,
                })) };
                if (cacheBanco.size > 200) cacheBanco.clear();
                cacheBanco.set(clave, r);
            }
            res.set('Cache-Control', 'no-store');
            res.json(r);
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/admin/disenos/banco/:id', ...gestion, async (req, res) => {
        try {
            if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) corta(400, 'Esa foto no vale.');
            const f = fotosVistas.get(req.params.id) || await pedirOpenverse(`${OPENVERSE}${req.params.id}/`);
            if (!['cc0', 'pdm'].includes(f.license)) corta(400, 'Esa foto no es de dominio público.');
            if (!/^https:\/\//.test(f.url || '')) corta(400, 'Esa foto no se puede traer.');
            const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 25_000);
            let datos;
            try {
                const r = await fetch(f.url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'AimEducation-AimDesign/1.0' } });
                if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) corta(502, 'No se ha podido traer esa foto (prueba con otra).');
                if (Number(r.headers.get('content-length')) > 25 * 1024 * 1024) corta(413, 'Esa foto es demasiado grande.');
                datos = Buffer.from(await r.arrayBuffer());
            } finally { clearTimeout(t); }
            // A 2000 px como mucho; con transparencia, PNG; si no, JPG.
            const img = sharp(datos, { failOn: 'none' }).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true });
            const meta = await img.metadata();
            const png = meta.hasAlpha;
            const { data: salida, info } = await (png ? img.png({ compressionLevel: 9 }) : img.flatten({ background: '#ffffff' }).jpeg({ quality: 86, mozjpeg: true })).toBuffer({ resolveWithObject: true });
            const url = await guardarImagenDiseno(salida, png ? 'image/png' : 'image/jpeg', `Banco · ${String(f.title || 'foto').slice(0, 120)} (${f.license === 'cc0' ? 'CC0' : 'dominio público'}, ${f.source || ''})`, info.width, info.height, req.userSession.userId);
            res.status(201).json({ success: true, url, ancho: info.width, alto: info.height });
        } catch (err) { fallo(res, err.name === 'AbortError' ? Object.assign(new Error('El banco de fotos tarda demasiado: prueba con otra.'), { status: 504 }) : err); }
    });

    // ── El kit de la marca: paletas y letras para los «Estilos» ──
    const limpiarKit = (k = {}) => {
        const col = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toUpperCase() : null);
        const txt = (v, n) => String(v || '').trim().slice(0, n);
        const paletas = (Array.isArray(k.paletas) ? k.paletas : []).slice(0, 12)
            .map(p => ({ nombre: txt(p?.nombre, 40) || 'Paleta', colores: (Array.isArray(p?.colores) ? p.colores : []).map(col).filter(Boolean).slice(0, 8) }))
            .filter(p => p.colores.length >= 2);
        const letra = (f) => (f && txt(f.fuente, 60) ? { fuente: txt(f.fuente, 60), ...(f.url && /^\/doc\/\d+\//.test(f.url) ? { url: txt(f.url, 200) } : {}) } : null);
        return { paletas, titulos: letra(k.titulos), texto: letra(k.texto) };
    };
    const leerKit = async () => limpiarKit((await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = 'disenos_kit'`)).rows[0]?.valor || {});
    router.get('/api/admin/disenos/kit', ...gestion, async (req, res) => {
        try { res.set('Cache-Control', 'no-store'); res.json(await leerKit()); } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/disenos/kit', ...gestion, async (req, res) => {
        try {
            const kit = limpiarKit(req.body || {});
            await pool.query(
                `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ('disenos_kit', $1::jsonb, NOW(), $2)
                 ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = EXCLUDED.actualizado_por`,
                [JSON.stringify(kit), req.userSession.userId]);
            res.json(kit);
        } catch (err) { fallo(res, err); }
    });

    // ── Traducir (MyMemory: gratis y sin cuenta; si el navegador trae su propio
    // traductor, el editor usa ese y no llega aquí). Frases sueltas, con caché. ──
    const IDIOMAS = ['en', 'fr', 'de', 'it', 'pt'];
    const cacheTraducir = new Map();
    async function traducirUna(texto, a) {
        const clave = `${a}|${texto}`;
        if (cacheTraducir.has(clave)) return cacheTraducir.get(clave);
        const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 15_000);
        try {
            const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=es|${a}`, { signal: ctrl.signal });
            const d = await r.json();
            if (d.quotaFinished) corta(429, 'Por hoy se ha llegado al límite del traductor gratuito: prueba mañana (o desde Chrome, que trae el suyo).');
            const sale = String(d.responseData?.translatedText || '').trim();
            if (!sale || d.responseStatus !== 200) return texto;
            if (cacheTraducir.size > 3000) cacheTraducir.clear();
            cacheTraducir.set(clave, sale);
            return sale;
        } finally { clearTimeout(t); }
    }
    router.post('/api/admin/disenos/traducir', ...gestion, async (req, res) => {
        try {
            const a = String(req.body?.a || '');
            if (!IDIOMAS.includes(a)) corta(400, 'Ese idioma no está.');
            const textos = (Array.isArray(req.body?.textos) ? req.body.textos : []).map(x => String(x ?? '').slice(0, 480)).slice(0, 300);
            const salida = [];
            // De tres en tres (sin agobiar al servicio).
            for (let i = 0; i < textos.length; i += 3) salida.push(...await Promise.all(textos.slice(i, i + 3).map(x => (x.trim() ? traducirUna(x, a) : x))));
            res.json({ traducciones: salida });
        } catch (err) { fallo(res, err.name === 'AbortError' ? Object.assign(new Error('El traductor tarda demasiado: prueba otra vez.'), { status: 504 }) : err); }
    });

    // ── Música para los vídeos (va con el diseño; el archivo, a aim_web_documentos) ──
    const FORMATO_AUDIO = (b) => {
        const cab = b.subarray(0, 4).toString('latin1');
        if (cab.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return ['audio/mpeg', 'mp3'];
        if (b.subarray(4, 8).toString('latin1') === 'ftyp') return ['audio/mp4', 'm4a'];
        if (cab === 'OggS') return ['audio/ogg', 'ogg'];
        if (cab === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE') return ['audio/wav', 'wav'];
        return null;
    };
    router.post('/api/admin/disenos/musica', ...gestion, express.raw({ type: () => true, limit: '16mb' }), async (req, res) => {
        try {
            const datos = Buffer.isBuffer(req.body) ? req.body : null;
            if (!datos || datos.length < 16) corta(400, 'No ha llegado la música.');
            const f = FORMATO_AUDIO(datos);
            if (!f) corta(400, 'Tiene que ser MP3, M4A, OGG o WAV.');
            if (datos.length > 15 * 1024 * 1024) corta(413, 'La música pesa demasiado (máximo 15 MB).');
            const nombre = String(req.query.nombre || '').replace(/[^\p{L}\p{N} ._()-]/gu, '').trim().slice(0, 80) || `musica.${f[1]}`;
            const archivo = `${nombre.replace(/\.[a-z0-9]+$/i, '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '-') || 'musica'}.${f[1]}`;
            const r = await pool.query(`INSERT INTO aim_web_documentos (nombre, mime, bytes, datos, subido_por) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
                [archivo, f[0], datos.length, datos, req.userSession.userId]);
            res.status(201).json({ success: true, url: `/doc/${r.rows[0].id}/${archivo}`, nombre });
        } catch (err) { fallo(res, err); }
    });

    // ── Letras propias: se suben aquí y salen en todos los diseños ──
    const leerFuentes = async () => (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = 'disenos_fuentes'`)).rows[0]?.valor?.fuentes || [];
    const guardarFuentes = (lista, userId) => pool.query(
        `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ('disenos_fuentes', $1::jsonb, NOW(), $2)
         ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = EXCLUDED.actualizado_por`,
        [JSON.stringify({ fuentes: lista }), userId]);
    router.get('/api/admin/disenos/fuentes', ...gestion, async (req, res) => {
        try { res.set('Cache-Control', 'no-store'); res.json({ fuentes: await leerFuentes() }); } catch (err) { fallo(res, err); }
    });
    // El archivo llega tal cual (TTF, OTF, WOFF o WOFF2): se mira por dentro qué es.
    const FORMATO_FUENTE = (b) => {
        const cab = b.subarray(0, 4).toString('latin1');
        if (cab === 'wOF2') return ['font/woff2', 'woff2'];
        if (cab === 'wOFF') return ['font/woff', 'woff'];
        if (cab === 'OTTO') return ['font/otf', 'otf'];
        if (cab === 'true' || b.readUInt32BE(0) === 0x00010000) return ['font/ttf', 'ttf'];
        return null;
    };
    router.post('/api/admin/disenos/fuentes', ...gestion, express.raw({ type: () => true, limit: '6mb' }), async (req, res) => {
        try {
            const datos = Buffer.isBuffer(req.body) ? req.body : null;
            if (!datos || datos.length < 12) corta(400, 'No ha llegado el archivo de la letra.');
            const f = FORMATO_FUENTE(datos);
            if (!f) corta(400, 'Tiene que ser una letra en TTF, OTF, WOFF o WOFF2.');
            if (datos.length > 5 * 1024 * 1024) corta(413, 'La letra pesa demasiado (máximo 5 MB).');
            const nombre = String(req.query.nombre || '').replace(/[^\p{L}\p{N} \-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
            if (!nombre) corta(400, 'Ponle un nombre a la letra.');
            const lista = await leerFuentes();
            if (lista.some(x => x.nombre.toLowerCase() === nombre.toLowerCase())) corta(409, 'Ya hay una letra con ese nombre.');
            const archivo = `${nombre.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '-')}.${f[1]}`;
            const r = await pool.query(`INSERT INTO aim_web_documentos (nombre, mime, bytes, datos, subido_por) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
                [archivo, f[0], datos.length, datos, req.userSession.userId]);
            const fuente = { id: r.rows[0].id, nombre, url: `/doc/${r.rows[0].id}/${archivo}` };
            await guardarFuentes([...lista, fuente], req.userSession.userId);
            res.status(201).json({ success: true, fuente });
        } catch (err) { fallo(res, err); }
    });
    // Quitarla de la lista (el archivo se queda: algún diseño puede usarla todavía).
    router.delete('/api/admin/disenos/fuentes/:id', ...gestion, async (req, res) => {
        try {
            const lista = await leerFuentes();
            await guardarFuentes(lista.filter(x => String(x.id) !== String(req.params.id)), req.userSession.userId);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // ── La marca: los colores y el logo de «Marca de los correos» y los del club ──
    router.get('/api/admin/disenos/marca', ...gestion, async (req, res) => {
        try {
            const v = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = 'marca_correo'`)).rows[0]?.valor;
            const m = v ? limpiarMarca(v) : { ...MARCA_POR_DEFECTO };
            const colores = [...new Set([m.colorPrincipal, m.colorTexto, ...PALETA_CLUB].map(c => String(c).toUpperCase()))];
            res.set('Cache-Control', 'no-store');
            res.json({ nombre: m.nombre, colores, logo: m.logo || null, web: m.web || '', pie: m.pieTexto || '', redes: m.redes || {} });
        } catch (err) { fallo(res, err); }
    });

    // ── Las fotos del club (solo las que se pueden usar) ──
    router.get('/api/admin/disenos/fotos-club', ...gestion, async (req, res) => {
        try {
            const albumId = Number(req.query.album) || null;
            const albumes = (await pool.query(
                `SELECT al.id, al.titulo, al.fecha, COUNT(f.id)::int AS fotos,
                        COUNT(f.id) FILTER (WHERE ${SQL_FOTO_CON_PERMISO('f')})::int AS validas
                 FROM aim_galeria_albumes al JOIN aim_galeria_fotos f ON f.album_id = al.id
                 GROUP BY al.id ORDER BY al.fecha DESC, al.id DESC LIMIT 60`)).rows;
            const elegido = albumId || albumes.find(a => a.validas)?.id || null;
            const fotos = elegido ? (await pool.query(
                `SELECT f.id, f.ancho, f.alto FROM aim_galeria_fotos f WHERE f.album_id = $1 AND ${SQL_FOTO_CON_PERMISO('f')}
                 ORDER BY f.orden, f.id LIMIT 120`, [elegido])).rows : [];
            res.set('Cache-Control', 'no-store');
            res.json({ albumes: albumes.map(a => ({ id: a.id, titulo: a.titulo, fecha: a.fecha, fotos: a.fotos, validas: a.validas })), album: elegido, fotos });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/admin/disenos/foto-club/:id/:tamano(grande|mini)', ...gestion, async (req, res) => {
        try {
            const col = req.params.tamano === 'mini' ? 'miniatura' : 'datos';
            const f = (await pool.query(`SELECT f.${col} AS img, f.mime FROM aim_galeria_fotos f WHERE f.id = $1 AND ${SQL_FOTO_CON_PERMISO('f')}`,
                [Number(req.params.id) || 0])).rows[0];
            if (!f?.img) return res.status(404).type('text/plain').send('Esa foto ya no se puede usar.');
            res.set({ 'Content-Type': f.mime || 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' }).send(f.img);
        } catch (err) { fallo(res, err); }
    });

    // ── Diplomas en lote: de una clase o de una convocatoria de examen ──
    router.get('/api/admin/disenos/lote', ...gestion, async (req, res) => {
        try {
            const [grupos, convocatorias] = await Promise.all([
                pool.query(
                    `SELECT g.group_id AS id, g.name AS nombre, a.name AS actividad,
                            (SELECT COUNT(*) FROM tul_group_students gs WHERE gs.group_id = g.group_id)::int AS alumnos
                     FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                     WHERE a.club_id = $1 ORDER BY a.name, g.name`, [clubId]),
                pool.query(
                    `SELECT c.id, COALESCE(c.nombre, 'Examen') AS nombre, c.actividad, c.fecha,
                            COUNT(e.id)::int AS participantes, COUNT(e.id) FILTER (WHERE e.apto)::int AS aptos
                     FROM aim_convocatorias c LEFT JOIN aim_examenes e ON e.convocatoria_id = c.id
                     GROUP BY c.id ORDER BY c.fecha DESC, c.id DESC LIMIT 60`),
            ]);
            res.set('Cache-Control', 'no-store');
            res.json({ grupos: grupos.rows, convocatorias: convocatorias.rows });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/admin/disenos/lote/:origen(grupo|convocatoria)/:id', ...gestion, async (req, res) => {
        try {
            if (req.params.origen === 'grupo') {
                if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) corta(400, 'Elige la clase.');
                const g = (await pool.query(
                    `SELECT g.group_id, g.name, g.sessions, a.activity_id, a.name AS actividad FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
                     WHERE g.group_id = $1 AND a.club_id = $2`, [req.params.id, clubId])).rows[0];
                if (!g) corta(404, 'Esa clase ya no existe.');
                const r = await pool.query(
                    `SELECT DISTINCT u.user_id AS id, ${nombreDe('u')} AS alumno, up.level_name AS nivel
                     FROM tul_group_students gs JOIN users u ON u.user_id = gs.student_id
                     LEFT JOIN tul_user_progression up ON up.user_id = u.user_id AND up.activity_id = $2
                     WHERE gs.group_id = $1 ORDER BY alumno`, [g.group_id, g.activity_id]);
                const profesor = profesoresDe(g.sessions);
                res.set('Cache-Control', 'no-store');
                return res.json({
                    titulo: `${g.actividad} · ${g.name}`, fecha: null,
                    personas: r.rows.map(p => ({ id: p.id, marcado: true, nota: p.nivel || '', variables: { alumno: p.alumno, curso: g.actividad, grupo: g.name, profesor, nivel: p.nivel || '' } })),
                });
            }
            const c = (await pool.query(`SELECT * FROM aim_convocatorias WHERE id = $1`, [Number(req.params.id) || 0])).rows[0];
            if (!c) corta(404, 'Esa convocatoria ya no existe.');
            const r = await pool.query(
                `SELECT e.id, ${nombreDe('u')} AS alumno, e.nivel, e.resultado, e.apto FROM aim_examenes e JOIN users u ON u.user_id = e.alumno_id
                 WHERE e.convocatoria_id = $1 ORDER BY alumno`, [c.id]);
            res.set('Cache-Control', 'no-store');
            res.json({
                titulo: `${c.nombre || 'Examen'} · ${c.actividad || ''}`.replace(/ · $/, ''), fecha: c.fecha,
                personas: r.rows.map(p => ({
                    id: String(p.id), marcado: p.apto === true, nota: p.apto === true ? `Apto${p.nivel ? ` · ${p.nivel}` : ''}` : p.apto === false ? 'No apto' : 'Sin evaluar',
                    variables: { alumno: p.alumno, curso: c.actividad || '', grupo: c.nombre || '', profesor: '', nivel: p.nivel || '', resultado: p.resultado || '' },
                })),
            });
        } catch (err) { fallo(res, err); }
    });

    // ── Un diseño terminado, a las imágenes de los correos y las noticias ──
    router.post('/api/admin/disenos/biblioteca', ...gestion, async (req, res) => {
        try {
            const m = String(req.body?.datos || '').match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
            if (!m) corta(400, 'La imagen no ha llegado bien.');
            const datos = Buffer.from(m[2], 'base64');
            if (datos.length > 4 * 1024 * 1024) corta(413, 'La imagen pesa demasiado (máximo 4 MB).');
            const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
            const id = crypto.randomBytes(12).toString('hex');
            await pool.query(
                `INSERT INTO aim_correo_imagenes (id, mime, datos, nombre, ancho, alto, bytes, subido_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [id, m[1], datos, `Aim Design · ${String(req.body?.nombre || 'Diseño').slice(0, 180)}`, num(req.body?.ancho), num(req.body?.alto), datos.length, req.userSession.userId]);
            res.status(201).json({ success: true, url: `/ci/${id}` });
        } catch (err) { fallo(res, err); }
    });

    router.get('/api/admin/disenos/:id', ...gestion, async (req, res) => {
        try {
            const x = (await pool.query(`SELECT * FROM aim_disenos WHERE id = $1`, [Number(req.params.id) || 0])).rows[0];
            if (!x) corta(404, 'Ese diseño ya no existe.');
            res.set('Cache-Control', 'no-store');
            res.json({ ...resumen(x), datos: x.datos });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/admin/disenos', ...gestion, async (req, res) => {
        try {
            const d = limpiar(req.body);
            const r = await pool.query(
                `INSERT INTO aim_disenos (nombre, tipo, ancho, alto, datos, miniatura, creado_por) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING id`,
                [d.nombre, d.tipo, d.ancho, d.alto, d.json, d.mini, req.userSession.userId]);
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/disenos/:id', ...gestion, async (req, res) => {
        try {
            const d = limpiar(req.body);
            if (!esDireccion(req)) {
                const antes = (await pool.query(`SELECT datos FROM aim_disenos WHERE id = $1`, [Number(req.params.id) || 0])).rows[0]?.datos;
                const mal = antes && saltaCandados(antes, JSON.parse(d.json));
                if (mal) corta(403, mal);
            }
            // Lo que había, como versión, si ha cambiado y la última es de hace rato.
            await pool.query(
                `INSERT INTO aim_disenos_versiones (diseno_id, nombre, datos, miniatura, creado_por, created_at)
                 SELECT d.id, d.nombre, d.datos, d.miniatura, $3, d.updated_at FROM aim_disenos d
                 WHERE d.id = $1 AND md5((d.datos - 'carpeta' - 'papelera' - 'enlace')::text) <> md5(($2::jsonb - 'carpeta' - 'papelera' - 'enlace')::text)
                   AND NOT EXISTS (SELECT 1 FROM aim_disenos_versiones v WHERE v.diseno_id = d.id
                                   AND v.created_at > NOW() - INTERVAL '${MINUTOS_ENTRE_VERSIONES} minutes')`,
                [Number(req.params.id) || 0, d.json, req.userSession.userId]);
            await podarVersiones(Number(req.params.id) || 0);
            const r = await pool.query(
                `UPDATE aim_disenos SET nombre = $2, tipo = $3, ancho = $4, alto = $5,
                        datos = ($6::jsonb - 'carpeta' - 'papelera' - 'enlace') || ${SQL_CONSERVAR},
                        miniatura = COALESCE($7, miniatura), updated_at = NOW()
                 WHERE id = $1 RETURNING id`, [Number(req.params.id) || 0, d.nombre, d.tipo, d.ancho, d.alto, d.json, d.mini]);
            if (!r.rowCount) corta(404, 'Ese diseño ya no existe.');
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // ── Carpeta (sin tocar la fecha ni la aprobación) ──
    router.patch('/api/admin/disenos/:id/carpeta', ...gestion, async (req, res) => {
        try {
            const carpeta = String(req.body?.carpeta || '').trim().slice(0, 60);
            const r = await pool.query(
                `UPDATE aim_disenos SET datos = CASE WHEN $2 = '' THEN datos - 'carpeta' ELSE jsonb_set(datos, '{carpeta}', to_jsonb($2::text)) END
                 WHERE id = $1 RETURNING id`, [Number(req.params.id) || 0, carpeta]);
            if (!r.rowCount) corta(404, 'Ese diseño ya no existe.');
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // ── Versiones ──
    async function podarVersiones(id) {
        await pool.query(
            `DELETE FROM aim_disenos_versiones WHERE diseno_id = $1 AND id NOT IN
               (SELECT id FROM aim_disenos_versiones WHERE diseno_id = $1 ORDER BY created_at DESC, id DESC LIMIT ${MAX_VERSIONES})`, [id]);
    }
    router.get('/api/admin/disenos/:id/versiones', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT v.id, v.nombre, v.miniatura, v.created_at, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS autor
                 FROM aim_disenos_versiones v LEFT JOIN users u ON u.user_id = v.creado_por
                 WHERE v.diseno_id = $1 ORDER BY v.created_at DESC, v.id DESC`, [Number(req.params.id) || 0]);
            res.set('Cache-Control', 'no-store');
            res.json({ versiones: r.rows.map(v => ({ id: v.id, nombre: v.nombre, miniatura: v.miniatura, fecha: v.created_at, autor: v.autor || null })) });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/admin/disenos/:id/versiones/:vid', ...gestion, async (req, res) => {
        try {
            const v = (await pool.query(`SELECT nombre, datos, created_at FROM aim_disenos_versiones WHERE id = $2 AND diseno_id = $1`,
                [Number(req.params.id) || 0, Number(req.params.vid) || 0])).rows[0];
            if (!v) corta(404, 'Esa versión ya no está.');
            res.set('Cache-Control', 'no-store');
            res.json({ nombre: v.nombre, datos: v.datos, fecha: v.created_at });
        } catch (err) { fallo(res, err); }
    });
    // Guardar ya cómo está (antes de volver a una versión anterior, para no perderlo).
    router.post('/api/admin/disenos/:id/versiones', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(
                `INSERT INTO aim_disenos_versiones (diseno_id, nombre, datos, miniatura, creado_por, created_at)
                 SELECT d.id, d.nombre, d.datos, d.miniatura, $2, d.updated_at FROM aim_disenos d WHERE d.id = $1
                   AND NOT EXISTS (SELECT 1 FROM aim_disenos_versiones v WHERE v.diseno_id = d.id AND md5(v.datos::text) = md5(d.datos::text))
                 RETURNING id`, [Number(req.params.id) || 0, req.userSession.userId]);
            await podarVersiones(Number(req.params.id) || 0);
            res.status(201).json({ success: true, nueva: !!r.rowCount });
        } catch (err) { fallo(res, err); }
    });

    // ── Revisión: comentarios y aprobación ──
    async function revisionDe(req, id) {
        const d = (await pool.query(`SELECT d.id, d.creado_por, ${SQL_HUELLA('d')} AS huella, ${SQL_DECISION('d')} AS decision FROM aim_disenos d WHERE d.id = $1`, [id])).rows[0];
        if (!d) corta(404, 'Ese diseño ya no existe.');
        const c = await pool.query(
            `SELECT c.id, c.tipo, c.texto, c.elemento_id, c.pagina, c.resuelto, c.created_at, c.autor_id, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS autor
             FROM aim_disenos_comentarios c LEFT JOIN users u ON u.user_id = c.autor_id WHERE c.diseno_id = $1 ORDER BY c.created_at, c.id`, [id]);
        const yo = req.userSession.userId;
        return {
            estado: estadoRevision(d.decision, d.huella), puedoAprobar: esDireccion(req),
            comentarios: c.rows.map(x => ({
                id: x.id, tipo: x.tipo, texto: x.texto || '', elementoId: x.elemento_id, pagina: x.pagina, resuelto: x.resuelto, fecha: x.created_at,
                autor: x.autor || 'Alguien que ya no está', mio: x.autor_id === yo,
            })),
        };
    }
    router.get('/api/admin/disenos/:id/revision', ...gestion, async (req, res) => {
        try { res.set('Cache-Control', 'no-store'); res.json(await revisionDe(req, Number(req.params.id) || 0)); } catch (err) { fallo(res, err); }
    });
    router.post('/api/admin/disenos/:id/comentarios', ...gestion, async (req, res) => {
        try {
            const id = Number(req.params.id) || 0;
            const texto = String(req.body?.texto || '').trim().slice(0, 2000);
            if (!texto) corta(400, 'Escribe el comentario.');
            const elemento = req.body?.elementoId ? String(req.body.elementoId).slice(0, 40) : null;
            const pagina = Number.isInteger(req.body?.pagina) && req.body.pagina >= 0 && req.body.pagina < 20 ? req.body.pagina : null;
            const r = await pool.query(`INSERT INTO aim_disenos_comentarios (diseno_id, tipo, texto, elemento_id, pagina, autor_id)
                SELECT id, 'comentario', $2, $3, $4, $5 FROM aim_disenos WHERE id = $1 RETURNING id`, [id, texto, elemento, pagina, req.userSession.userId]);
            if (!r.rowCount) corta(404, 'Ese diseño ya no existe.');
            res.status(201).json(await revisionDe(req, id));
        } catch (err) { fallo(res, err); }
    });
    router.patch('/api/admin/disenos/:id/comentarios/:cid', ...gestion, async (req, res) => {
        try {
            const id = Number(req.params.id) || 0;
            await pool.query(`UPDATE aim_disenos_comentarios SET resuelto = $3 WHERE id = $2 AND diseno_id = $1 AND tipo = 'comentario'`,
                [id, Number(req.params.cid) || 0, !!req.body?.resuelto]);
            res.json(await revisionDe(req, id));
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/disenos/:id/comentarios/:cid', ...gestion, async (req, res) => {
        try {
            const id = Number(req.params.id) || 0;
            const r = await pool.query(`DELETE FROM aim_disenos_comentarios WHERE id = $2 AND diseno_id = $1 AND tipo = 'comentario' AND (autor_id = $3 OR $4) RETURNING id`,
                [id, Number(req.params.cid) || 0, req.userSession.userId, esDireccion(req)]);
            if (!r.rowCount) corta(403, 'Solo se borran los comentarios propios.');
            res.json(await revisionDe(req, id));
        } catch (err) { fallo(res, err); }
    });
    // Pedir la aprobación (cualquiera) o decidir (la dirección): con un comentario opcional.
    router.post('/api/admin/disenos/:id/revision', ...gestion, async (req, res) => {
        try {
            const id = Number(req.params.id) || 0;
            const accion = req.body?.accion;
            if (!['pedir', 'aprobado', 'cambios'].includes(accion)) corta(400, 'No se sabe qué hacer.');
            if (accion !== 'pedir' && !esDireccion(req)) corta(403, 'Lo aprueba la dirección.');
            const texto = String(req.body?.texto || '').trim().slice(0, 2000) || null;
            if (accion === 'cambios' && !texto) corta(400, 'Di qué hay que cambiar.');
            const r = await pool.query(`INSERT INTO aim_disenos_comentarios (diseno_id, tipo, texto, huella, autor_id)
                SELECT d.id, $2, $3, ${SQL_HUELLA('d')}, $4 FROM aim_disenos d WHERE d.id = $1 RETURNING id`, [id, accion, texto, req.userSession.userId]);
            if (!r.rowCount) corta(404, 'Ese diseño ya no existe.');
            res.status(201).json(await revisionDe(req, id));
        } catch (err) { fallo(res, err); }
    });

    router.post('/api/admin/disenos/:id/duplicar', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(
                `INSERT INTO aim_disenos (nombre, tipo, ancho, alto, datos, miniatura, creado_por)
                 SELECT LEFT(nombre || ' (copia)', 150), tipo, ancho, alto, datos, miniatura, $2 FROM aim_disenos WHERE id = $1 RETURNING id`,
                [Number(req.params.id) || 0, req.userSession.userId]);
            if (!r.rowCount) corta(404, 'Ese diseño ya no existe.');
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/disenos/:id', ...gestion, async (req, res) => {
        try {
            const id = Number(req.params.id) || 0;
            if (req.query.definitivo === '1') {
                const r = await pool.query(`DELETE FROM aim_disenos WHERE id = $1 AND datos ? 'papelera' RETURNING id`, [id]);
                if (!r.rowCount) corta(409, 'Solo se borra para siempre lo que está en la papelera.');
                if (await diplomaPorDefecto() === id) await pool.query(`DELETE FROM aim_ajustes WHERE clave = $1`, [CLAVE_DIPLOMA]);
                return res.json({ success: true });
            }
            const r = await pool.query(`UPDATE aim_disenos SET datos = jsonb_set(datos, '{papelera}', to_jsonb(NOW()::text)) WHERE id = $1 RETURNING id`, [id]);
            if (!r.rowCount) corta(404, 'Ese diseño ya no existe.');
            res.json({ success: true, papelera: true });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/admin/disenos/:id/restaurar', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(`UPDATE aim_disenos SET datos = datos - 'papelera' WHERE id = $1 RETURNING id`, [Number(req.params.id) || 0]);
            if (!r.rowCount) corta(404, 'Ese diseño ya no existe.');
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // El diploma por defecto del aula (null: el de siempre, sin diseñar).
    router.put('/api/admin/disenos-diploma', ...gestion, async (req, res) => {
        try {
            const id = req.body?.id ? Number(req.body.id) : null;
            if (id) {
                const x = (await pool.query(`SELECT tipo FROM aim_disenos WHERE id = $1`, [id])).rows[0];
                if (!x) corta(404, 'Ese diseño ya no existe.');
                if (x.tipo !== 'diploma') corta(400, 'Ese diseño no es un diploma.');
                await pool.query(
                    `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ($1, $2::jsonb, NOW(), $3)
                     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = EXCLUDED.actualizado_por`,
                    [CLAVE_DIPLOMA, JSON.stringify({ id }), req.userSession.userId]);
            } else await pool.query(`DELETE FROM aim_ajustes WHERE clave = $1`, [CLAVE_DIPLOMA]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Para elegir el diploma de un curso (lo usa el aula, con su propio permiso).
    router.get('/api/admin/disenos-diplomas', authenticateSession, requireSeccion('aula'), async (req, res) => {
        try {
            const r = await pool.query(`SELECT id, nombre, miniatura FROM aim_disenos WHERE tipo = 'diploma' AND NOT datos ? 'papelera' ORDER BY nombre`);
            res.set('Cache-Control', 'no-store');
            res.json({ diplomas: r.rows, porDefecto: await diplomaPorDefecto() });
        } catch (err) { fallo(res, err); }
    });

    return { router, diplomaPorDefecto };
}

// El diseño del diploma de un curso: el suyo o el de por defecto (null si no hay).
export async function disenoDiploma(pool, cursoId) {
    const r = (await pool.query(
        `SELECT d.datos FROM aim_disenos d WHERE d.tipo = 'diploma' AND NOT d.datos ? 'papelera' AND d.id = COALESCE(
            (SELECT c.diploma_diseno_id FROM aim_aula_cursos c JOIN aim_disenos x ON x.id = c.diploma_diseno_id AND NOT x.datos ? 'papelera' WHERE c.id = $1),
            (SELECT (valor->>'id')::int FROM aim_ajustes WHERE clave = '${CLAVE_DIPLOMA}'))`, [cursoId])).rows[0];
    return r?.datos || null;
}
