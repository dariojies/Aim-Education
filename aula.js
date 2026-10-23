// ─────────────────────────────────────────────────────────────────────────────
// Aula virtual (ticket #433): cursos online, gratis o de pago, con su temario
// (temas y lecciones), vídeos, archivos y tareas que corrige el profesor.
//
//  · Cualquiera con cuenta puede apuntarse a un curso publicado (/aula).
//  · Los de pago: al apuntarse se le crea un cargo (concepto AULA-<id> del
//    catálogo, actividad «Aula virtual») y entra en cuanto ese cargo está
//    cobrado, por internet o en secretaría: no hace falta tocar el cobro. La
//    secretaría también puede darle acceso a mano (una beca, un pago aparte…).
//  · Los vídeos van por enlace (YouTube o Vimeo) o subidos aquí. Lo subido se
//    guarda en la base en trozos de 2 MB: así se sirve por partes (el vídeo
//    avanza sin cargarlo entero) y nunca hay un archivo entero en memoria. La
//    base es compartida y pequeña: hay un tope para todo el aula (TOPE_TOTAL).
//  · Gestiona el aula quien tiene el apartado; un instructor, solo los cursos
//    de los que es profesor, y sin tocar precios ni accesos (aulaCompleta).
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';
import { generarDiplomaPdf } from './diploma-pdf.js';
import { disenoDiploma } from './disenos.js';

export const TROZO = 2 * 1024 * 1024;
export const MAX_VIDEO = 100 * 1024 * 1024;
export const MAX_ARCHIVO = 10 * 1024 * 1024;
export const TOPE_TOTAL = 400 * 1024 * 1024;
export const ACTIVIDAD_AULA = 'Aula virtual';
// La formación online lleva siempre IVA (#440): no se elige.
export const IVA_AULA = 21;
const MAX_PORTADA = 2 * 1024 * 1024;
const TIPOS = ['texto', 'video', 'archivo', 'tarea', 'cuestionario', 'directo'];
const MAX_PREGUNTAS = 200;
const MIME_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];
const MIME_ARCHIVO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'application/zip', 'audio/mpeg', 'audio/mp4'];
export const conceptoDe = (cursoId) => `AULA-${cursoId}`;

export async function crearTablasAula(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_cursos (
            id SERIAL PRIMARY KEY,
            titulo VARCHAR(200) NOT NULL,
            resumen VARCHAR(400),
            descripcion TEXT,
            portada BYTEA,
            portada_mime VARCHAR(40),
            profesor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            publicado BOOLEAN NOT NULL DEFAULT FALSE,
            -- De pago: su concepto del catálogo (aim_precios), con precio e IVA.
            concepto VARCHAR(100),
            orden INTEGER NOT NULL DEFAULT 0,
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_temas (
            id SERIAL PRIMARY KEY,
            curso_id INTEGER NOT NULL REFERENCES aim_aula_cursos(id) ON DELETE CASCADE,
            titulo VARCHAR(200) NOT NULL,
            orden INTEGER NOT NULL DEFAULT 0
        )`);
    // Lo subido: una fila con los datos del archivo (parte_de NULL) y una por
    // cada trozo (parte_de = esa fila, n = 0, 1, 2…). 'completo' cuando han
    // llegado todos.
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_archivos (
            id SERIAL PRIMARY KEY,
            curso_id INTEGER REFERENCES aim_aula_cursos(id) ON DELETE CASCADE,
            parte_de INTEGER REFERENCES aim_aula_archivos(id) ON DELETE CASCADE,
            n INTEGER,
            nombre VARCHAR(200),
            mime VARCHAR(120),
            bytes BIGINT,
            datos BYTEA,
            completo BOOLEAN NOT NULL DEFAULT FALSE,
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_aula_archivos_trozo ON aim_aula_archivos (parte_de, n) WHERE parte_de IS NOT NULL`);
    // Los trozos ya van comprimidos (vídeo, PDF): sin volver a comprimir, y así
    // Postgres puede leer solo un trozo sin descomprimir nada.
    await client.query(`ALTER TABLE aim_aula_archivos ALTER COLUMN datos SET STORAGE EXTERNAL`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_lecciones (
            id SERIAL PRIMARY KEY,
            curso_id INTEGER NOT NULL REFERENCES aim_aula_cursos(id) ON DELETE CASCADE,
            tema_id INTEGER NOT NULL REFERENCES aim_aula_temas(id) ON DELETE CASCADE,
            tipo VARCHAR(15) NOT NULL CHECK (tipo IN ('texto','video','archivo','tarea','cuestionario')),
            titulo VARCHAR(200) NOT NULL,
            texto TEXT,
            video_url TEXT,
            archivo_id INTEGER REFERENCES aim_aula_archivos(id) ON DELETE SET NULL,
            -- Tareas: 'nota' (de 0 a 10) o 'apto' (apto / no apto).
            calificacion VARCHAR(5) NOT NULL DEFAULT 'apto' CHECK (calificacion IN ('nota','apto')),
            orden INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    // La parte gratis de un curso de pago: las lecciones marcadas las ve
    // cualquiera con cuenta, sin apuntarse ni pagar.
    await client.query(`ALTER TABLE aim_aula_lecciones ADD COLUMN IF NOT EXISTS gratis BOOLEAN NOT NULL DEFAULT false`);
    // Los cursos online se facturan en su serie (AIMON, #451): también los que ya
    // tenían precio. Lo ya facturado se queda como está.
    await client.query(`UPDATE aim_precios SET serie_fiscal = 'ON' WHERE concepto LIKE 'AULA-%' AND serie_fiscal IS NULL`).catch(() => {});
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_inscripciones (
            id SERIAL PRIMARY KEY,
            curso_id INTEGER NOT NULL REFERENCES aim_aula_cursos(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            -- 'activa', 'pendiente_pago' (entra al cobrarse su cargo) o 'baja'.
            estado VARCHAR(15) NOT NULL DEFAULT 'activa',
            cargo_id INTEGER REFERENCES aim_cargos(id) ON DELETE SET NULL,
            origen VARCHAR(12) NOT NULL DEFAULT 'web',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            activada_at TIMESTAMPTZ,
            UNIQUE (curso_id, user_id)
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_progreso (
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            leccion_id INTEGER NOT NULL REFERENCES aim_aula_lecciones(id) ON DELETE CASCADE,
            completada_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, leccion_id)
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_entregas (
            id SERIAL PRIMARY KEY,
            leccion_id INTEGER NOT NULL REFERENCES aim_aula_lecciones(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            texto TEXT,
            archivo BYTEA,
            archivo_nombre VARCHAR(200),
            archivo_mime VARCHAR(120),
            entregada_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            nota NUMERIC(4,2),
            apto BOOLEAN,
            comentario TEXT,
            corregida_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            corregida_at TIMESTAMPTZ,
            UNIQUE (leccion_id, user_id)
        )`);
    // Cuestionarios (#439): tipo test de opción múltiple, de práctica (como
    // Learning Dungeon: una a una, se corrige al momento y se repite) o
    // evaluables (se entrega entero, nota sobre 10, intentos limitados).
    await client.query(`ALTER TABLE aim_aula_lecciones ALTER COLUMN tipo TYPE VARCHAR(15)`);
    const ck = (await client.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'aim_aula_lecciones_tipo_check'`)).rows[0];
    if (!ck || !ck.d.includes('directo')) {
        await client.query(`ALTER TABLE aim_aula_lecciones DROP CONSTRAINT IF EXISTS aim_aula_lecciones_tipo_check`);
        await client.query(`ALTER TABLE aim_aula_lecciones ADD CONSTRAINT aim_aula_lecciones_tipo_check CHECK (tipo IN ('texto','video','archivo','tarea','cuestionario','directo'))`);
    }
    await client.query(`ALTER TABLE aim_aula_lecciones ADD COLUMN IF NOT EXISTS modo VARCHAR(10) NOT NULL DEFAULT 'practica'`);
    await client.query(`ALTER TABLE aim_aula_lecciones ADD COLUMN IF NOT EXISTS intentos INTEGER`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_preguntas (
            id SERIAL PRIMARY KEY,
            leccion_id INTEGER NOT NULL REFERENCES aim_aula_lecciones(id) ON DELETE CASCADE,
            orden INTEGER NOT NULL DEFAULT 0,
            enunciado TEXT NOT NULL,
            opciones JSONB NOT NULL,
            correcta SMALLINT NOT NULL,
            explicacion TEXT,
            imagen TEXT
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_aula_preguntas ON aim_aula_preguntas (leccion_id, orden)`);
    // Cada intento guarda lo que se contestó con las preguntas tal cual eran:
    // si luego se cambian, las correcciones de antes siguen teniendo sentido.
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_intentos (
            id SERIAL PRIMARY KEY,
            leccion_id INTEGER NOT NULL REFERENCES aim_aula_lecciones(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            modo VARCHAR(10) NOT NULL,
            respuestas JSONB NOT NULL,
            aciertos INTEGER NOT NULL,
            total INTEGER NOT NULL,
            nota NUMERIC(4,2) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_aula_intentos ON aim_aula_intentos (leccion_id, user_id)`);
    // Dudas al profesor (#461): la pregunta (duda_id NULL) y sus respuestas, en
    // la misma tabla. Privada (el alumno y quien lleva el curso) o compartida
    // con todo el curso, donde también pueden contestar los compañeros.
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_dudas (
            id SERIAL PRIMARY KEY,
            curso_id INTEGER NOT NULL REFERENCES aim_aula_cursos(id) ON DELETE CASCADE,
            duda_id INTEGER REFERENCES aim_aula_dudas(id) ON DELETE CASCADE,
            leccion_id INTEGER REFERENCES aim_aula_lecciones(id) ON DELETE SET NULL,
            user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
            es_profesor BOOLEAN NOT NULL DEFAULT false,
            titulo VARCHAR(200),
            cuerpo TEXT NOT NULL,
            imagen BYTEA,
            imagen_mime VARCHAR(60),
            publica BOOLEAN NOT NULL DEFAULT false,
            estado VARCHAR(10) NOT NULL DEFAULT 'abierta',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_aula_dudas ON aim_aula_dudas (curso_id) WHERE duda_id IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_aula_dudas_hilo ON aim_aula_dudas (duda_id)`);
    // Cursos por semanas y en directo:
    //  · abre_at: la lección se abre ese día; tras_anterior: al terminar la de antes.
    //  · plazo_at: hasta cuándo se entrega una tarea (después, «fuera de plazo»).
    //  · Clases en directo (tipo 'directo'): cuándo, cuánto dura y su enlace de Meet
    //    (o el de siempre del curso, aim_aula_cursos.meet_url); la grabación, en
    //    video_url o subida.
    //  · Cuestionarios: la nota para aprobarlos (sin ella, un 5) y el tiempo límite
    //    de los evaluables (en minutos).
    for (const col of ['abre_at TIMESTAMPTZ', 'tras_anterior BOOLEAN NOT NULL DEFAULT false', 'plazo_at TIMESTAMPTZ', 'directo_at TIMESTAMPTZ',
        'directo_min INTEGER', 'enlace TEXT', 'nota_minima NUMERIC(4,2)', 'tiempo_min INTEGER']) {
        await client.query(`ALTER TABLE aim_aula_lecciones ADD COLUMN IF NOT EXISTS ${col}`);
    }
    await client.query(`ALTER TABLE aim_aula_cursos ADD COLUMN IF NOT EXISTS meet_url TEXT`);
    // El último día que entró al curso (para avisarle si lo deja y para el profesor).
    await client.query(`ALTER TABLE aim_aula_inscripciones ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMPTZ`);
    // Por dónde va en cada vídeo, para seguir donde lo dejó.
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_vistas (
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            leccion_id INTEGER NOT NULL REFERENCES aim_aula_lecciones(id) ON DELETE CASCADE,
            segundos INTEGER NOT NULL,
            duracion INTEGER,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, leccion_id)
        )`);
    // Los apuntes del alumno, uno por lección.
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_apuntes (
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            leccion_id INTEGER NOT NULL REFERENCES aim_aula_lecciones(id) ON DELETE CASCADE,
            texto TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, leccion_id)
        )`);
    // Los avisos ya enviados (lección nueva, plazo, clase en directo, sin entrar…):
    // para no mandar dos veces el mismo.
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_avisos (
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            clave VARCHAR(80) NOT NULL,
            enviado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, clave)
        )`);
    // La valoración del curso (#463): la rellena el alumno al terminarlo, antes
    // de su diploma. Seis notas del 1 al 5, si lo recomendaría y qué mejoraría.
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_aula_valoraciones (
            id SERIAL PRIMARY KEY,
            curso_id INTEGER NOT NULL REFERENCES aim_aula_cursos(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            calidad SMALLINT NOT NULL CHECK (calidad BETWEEN 1 AND 5),
            claridad SMALLINT NOT NULL CHECK (claridad BETWEEN 1 AND 5),
            dominio SMALLINT NOT NULL CHECK (dominio BETWEEN 1 AND 5),
            seguir SMALLINT NOT NULL CHECK (seguir BETWEEN 1 AND 5),
            utilidad SMALLINT NOT NULL CHECK (utilidad BETWEEN 1 AND 5),
            materiales SMALLINT NOT NULL CHECK (materiales BETWEEN 1 AND 5),
            recomendaria VARCHAR(12) NOT NULL CHECK (recomendaria IN ('si','probable_si','probable_no','no')),
            mejoras TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (curso_id, user_id)
        )`);
}

// Las preguntas de la valoración (#463); los textos, en src/components/AulaValoracion.jsx.
export const NOTAS_VALORACION = ['calidad', 'claridad', 'dominio', 'seguir', 'utilidad', 'materiales'];
const RECOMIENDA = ['si', 'probable_si', 'probable_no', 'no'];

// Las preguntas que llegan de la pantalla, limpias: enunciado, de 2 a 4
// opciones, cuál es la buena, explicación e imagen (de fuera o subida al aula).
export function limpiarPreguntas(lista) {
    const ps = (Array.isArray(lista) ? lista : []).slice(0, MAX_PREGUNTAS + 1);
    if (ps.length > MAX_PREGUNTAS) corta(400, `Como mucho ${MAX_PREGUNTAS} preguntas por cuestionario.`);
    return ps.map((p, i) => {
        const enunciado = txt(p?.enunciado, 2000);
        // Las vacías del final (la D sin poner) se quitan; una vacía en medio, no:
        // movería cuál es la buena.
        const opciones = (Array.isArray(p?.opciones) ? p.opciones : []).map(o => txt(o, 500));
        while (opciones.length && !opciones[opciones.length - 1]) opciones.pop();
        if (!enunciado) corta(400, `La pregunta ${i + 1} no tiene enunciado.`);
        if (opciones.some(o => !o)) corta(400, `La pregunta ${i + 1} tiene una respuesta vacía en medio.`);
        if (opciones.length < 2 || opciones.length > 4) corta(400, `La pregunta ${i + 1} tiene que tener de 2 a 4 respuestas.`);
        const correcta = Number(p?.correcta);
        if (!Number.isInteger(correcta) || correcta < 0 || correcta >= opciones.length) corta(400, `Marca cuál es la respuesta buena de la pregunta ${i + 1}.`);
        const img = String(p?.imagen || '').trim();
        return { enunciado, opciones, correcta, explicacion: txt(p?.explicacion, 2000), imagen: /^https:\/\/\S{4,1000}$/.test(img) || /^\/api\/aula\/archivos\/\d+$/.test(img) ? img : null };
    });
}
// Corrige unas respuestas ({ idPregunta: opción elegida }) y devuelve el
// intento completo, con las preguntas tal cual (para guardarlo y enseñarlo).
export function corregir(preguntas, respuestas) {
    const r = respuestas && typeof respuestas === 'object' ? respuestas : {};
    const detalle = preguntas.map(p => {
        const e = r[p.id] ?? r[String(p.id)];
        const elegida = Number.isInteger(Number(e)) && e !== null && e !== '' ? Number(e) : null;
        return { id: p.id, enunciado: p.enunciado, opciones: p.opciones, imagen: p.imagen || null, elegida, correcta: p.correcta, bien: elegida === p.correcta, explicacion: p.explicacion || null };
    });
    const aciertos = detalle.filter(d => d.bien).length;
    const total = detalle.length;
    return { detalle, aciertos, total, nota: total ? Math.round((aciertos / total) * 1000) / 100 : 0 };
}

// El reproductor de un enlace de YouTube o Vimeo (null si no es de ninguno).
export function incrustar(url) {
    let u;
    try { u = new URL(String(url || '').trim()); } catch { return null; }
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/) || [])[1];
    }
    if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        const m = u.pathname.match(/(?:\/video)?\/(\d{5,})(?:\/([0-9a-f]{6,}))?/);
        if (m) return `https://player.vimeo.com/video/${m[1]}${m[2] || u.searchParams.get('h') ? `?h=${m[2] || u.searchParams.get('h')}` : ''}`;
    }
    return null;
}

const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
// Los evaluables con tiempo límite: al empezar, una marca firmada de cuándo (no se
// guarda nada); al entregar, si ha pasado el tiempo (con un minuto y medio de
// margen por la conexión), no cuenta.
const LLAVE_TIEMPO = crypto.createHash('sha256').update(`aim-aula-tiempo:${process.env.DATABASE_URL || ''}`).digest();
const firmaTiempo = (txt) => crypto.createHmac('sha256', LLAVE_TIEMPO).update(txt).digest('base64url');
const marcaTiempo = (leccionId, userId, t = Date.now()) => `${t}.${firmaTiempo(`${leccionId}:${userId}:${t}`)}`;
function segundosDesde(marca, leccionId, userId) {
    const [t, f] = String(marca || '').split('.');
    if (!t || !f || firmaTiempo(`${leccionId}:${userId}:${t}`) !== f) return null;
    return (Date.now() - Number(t)) / 1000;
}
const MARGEN_TIEMPO = 90;
const fallo = (res, err) => {
    if (!err.status) console.error('[aula]', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'No se ha podido hacer. Inténtalo otra vez.' });
};
const idDe = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) corta(404, 'No existe.'); return n; };
const txt = (v, max) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const r2 = (n) => Math.round(Number(n) * 100) / 100;

// Con acceso: activa, o pendiente de pago con su cargo ya cobrado (o exento).
const SQL_ACCESO = (i = 'i', c = 'c') => `(${i}.estado = 'activa' OR (${i}.estado = 'pendiente_pago' AND ${c}.estado IN ('cobrado','exento')))`;

export function crearAula({ pool, authenticateSession, requireSeccion, permisos, sesionOpcional, pagosOnlineAbiertos, avisar = null }) {
    const router = express.Router();
    const gestion = [authenticateSession, requireSeccion('aula')];
    const crudo = (limit) => express.raw({ type: () => true, limit });

    // ── Quién puede qué ──
    const completa = (req) => !!permisos(req).aulaCompleta;
    const esGestor = (req) => !!req.userSession?.canAccessAdmin && !!permisos(req).secciones?.aula;
    async function curso(id) {
        const c = (await pool.query(
            `SELECT c.id, c.titulo, c.resumen, c.descripcion, c.profesor_id, c.publicado, c.concepto, c.updated_at, c.diploma_diseno_id, c.meet_url,
                    (c.portada IS NOT NULL) AS con_portada, p.precio, p.iva_pct, p.activo AS precio_activo,
                    TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS profesor
             FROM aim_aula_cursos c
             LEFT JOIN aim_precios p ON p.concepto = c.concepto
             LEFT JOIN users u ON u.user_id = c.profesor_id
             WHERE c.id = $1`, [id])).rows[0];
        if (!c) corta(404, 'Ese curso no existe.');
        return c;
    }
    // Puede tocar este curso: con el aula completa, cualquiera; si no, el suyo.
    async function editable(req, cursoId) {
        const c = await curso(cursoId);
        if (!completa(req) && String(c.profesor_id) !== String(req.userSession.userId)) corta(403, 'Solo puedes cambiar los cursos de los que eres profesor.');
        return c;
    }
    const precioDe = (c) => (c.concepto && c.precio_activo !== false && Number(c.precio) > 0 ? r2(c.precio) : 0);
    // Lo que paga, con IVA.
    const totalDe = (c) => { const p = precioDe(c); return p ? r2(p * (1 + Number(c.iva_pct || 0) / 100)) : 0; };
    async function inscripcion(cursoId, userId) {
        return (await pool.query(
            `SELECT i.*, c.estado AS cargo_estado, ${SQL_ACCESO()} AS acceso
             FROM aim_aula_inscripciones i LEFT JOIN aim_cargos c ON c.id = i.cargo_id
             WHERE i.curso_id = $1 AND i.user_id = $2`, [cursoId, userId])).rows[0] || null;
    }
    // Para ver el contenido: apuntado con acceso, o quien gestiona ese curso.
    async function puedeVer(req, cursoId) {
        const c = await curso(cursoId);
        if (esGestor(req) && (completa(req) || String(c.profesor_id) === String(req.userSession.userId))) return { c, gestor: true, ins: null };
        const ins = await inscripcion(cursoId, req.userSession.userId);
        if (!ins || !ins.acceso) corta(403, ins?.estado === 'pendiente_pago' ? 'Falta pagar el curso para entrar.' : 'No estás apuntado a este curso.');
        if (ins.estado !== 'activa') {
            await pool.query(`UPDATE aim_aula_inscripciones SET estado = 'activa', activada_at = COALESCE(activada_at, NOW()) WHERE id = $1`, [ins.id]);
        }
        return { c, gestor: false, ins };
    }
    // Una lección de la parte gratis la ve cualquiera con cuenta (si el curso
    // está publicado); las demás, como siempre.
    async function puedeVerLeccion(req, l) {
        try { return await puedeVer(req, l.curso_id); } catch (e) {
            if (e.status !== 403 || !l.gratis) throw e;
            const c = await curso(l.curso_id);
            if (!c.publicado) throw e;
            return { c, gestor: false, ins: null, previa: true };
        }
    }
    async function leccion(id) {
        const l = (await pool.query(`SELECT * FROM aim_aula_lecciones WHERE id = $1`, [id])).rows[0];
        if (!l) corta(404, 'Esa lección ya no existe.');
        return l;
    }
    // ── Lecciones que se abren poco a poco ──
    // Cerrada: por fecha (abre_at aún no ha llegado) o porque se abre al terminar la
    // anterior (en el orden del temario) y esa aún no está hecha. Al personal, nunca.
    const fechaLarga = (d) => `${new Date(d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }).replace(',', '')} a las ${new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}`;
    function cerradaEn(l, anterior, hechas) {
        if (l.abre_at && new Date(l.abre_at) > new Date()) return { hasta: l.abre_at };
        if (l.tras_anterior && anterior && !hechas.has(anterior.id)) return { tras: anterior.titulo };
        return null;
    }
    // Las lecciones del curso en el orden del temario.
    const enOrden = async (cursoId) => (await pool.query(
        `SELECT l.id, l.titulo, l.abre_at, l.tras_anterior FROM aim_aula_lecciones l JOIN aim_aula_temas t ON t.id = l.tema_id
         WHERE l.curso_id = $1 ORDER BY t.orden, t.id, l.orden, l.id`, [cursoId])).rows;
    async function exigirAbierta(req, l, gestor) {
        if (gestor || (!l.abre_at && !l.tras_anterior)) return;
        const lista = await enOrden(l.curso_id), i = lista.findIndex(x => x.id === l.id);
        const hechas = new Set((await pool.query(`SELECT leccion_id FROM aim_aula_progreso WHERE user_id = $1`, [req.userSession.userId])).rows.map(x => x.leccion_id));
        const ce = cerradaEn(l, i > 0 ? lista[i - 1] : null, hechas);
        if (ce?.hasta) corta(403, `Esta lección se abre el ${fechaLarga(ce.hasta)}.`);
        if (ce?.tras) corta(403, `Esta lección se abre al terminar «${ce.tras}».`);
    }
    const httpsOk = (u) => { try { const x = new URL(String(u || '').trim()); return x.protocol === 'https:' ? x.toString() : null; } catch { return null; } };
    const fechaDe = (v, que) => {
        if (v === undefined || v === null || v === '') return null;
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) corta(400, `${que}: la fecha no es válida.`);
        return d;
    };

    // El progreso de cada inscrito: lecciones hechas de las que tiene el curso.
    const SQL_PROGRESO = `
        (SELECT COUNT(*)::int FROM aim_aula_progreso pr JOIN aim_aula_lecciones l ON l.id = pr.leccion_id
          WHERE l.curso_id = i.curso_id AND pr.user_id = i.user_id)`;

    // ── Lo subido: se sirve por partes ──
    async function servirArchivo(req, res, a, { descarga = false } = {}) {
        const total = Number(a.bytes);
        res.set({ 'Accept-Ranges': 'bytes', 'Content-Type': a.mime || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600', 'X-Robots-Tag': 'noindex' });
        res.set('Content-Disposition', `${descarga ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(a.nombre || 'archivo')}`);
        const rango = String(req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/);
        let desde = 0, hasta = total - 1;
        if (rango && (rango[1] || rango[2])) {
            if (rango[1]) { desde = Number(rango[1]); hasta = rango[2] ? Math.min(Number(rango[2]), total - 1) : total - 1; }
            else { desde = Math.max(0, total - Number(rango[2])); }
            if (desde > hasta || desde >= total) { res.status(416).set('Content-Range', `bytes */${total}`).end(); return; }
            // Como mucho dos trozos por petición: el navegador pide el resto después.
            hasta = Math.min(hasta, desde + 2 * TROZO - 1);
            res.status(206).set('Content-Range', `bytes ${desde}-${hasta}/${total}`);
        }
        res.set('Content-Length', String(hasta - desde + 1));
        if (req.method === 'HEAD') { res.end(); return; }
        for (let n = Math.floor(desde / TROZO); n <= Math.floor(hasta / TROZO); n++) {
            const t = (await pool.query(`SELECT datos FROM aim_aula_archivos WHERE parte_de = $1 AND n = $2`, [a.id, n])).rows[0];
            if (!t) { res.destroy(); return; }
            const ini = n * TROZO;
            const trozo = t.datos.subarray(Math.max(0, desde - ini), Math.min(t.datos.length, hasta - ini + 1));
            if (!res.write(trozo)) await new Promise(ok => res.once('drain', ok));
            if (res.destroyed) return;
        }
        res.end();
    }
    async function archivoMeta(id) {
        const a = (await pool.query(`SELECT id, curso_id, nombre, mime, bytes, completo FROM aim_aula_archivos WHERE id = $1 AND parte_de IS NULL`, [id])).rows[0];
        if (!a || !a.completo) corta(404, 'Ese archivo no está.');
        return a;
    }
    const espacioUsado = async () => Number((await pool.query(
        `SELECT COALESCE(SUM(bytes), 0)::bigint AS b FROM aim_aula_archivos WHERE parte_de IS NULL`)).rows[0].b);

    // ════════════════════════ Para todos ════════════════════════

    // El catálogo: los cursos publicados (y, si ha entrado, cómo va en cada uno).
    router.get('/api/aula/cursos', async (req, res) => {
        try {
            const s = await sesionOpcional(req);
            const r = await pool.query(
                `SELECT c.id, c.titulo, c.resumen, c.concepto, (c.portada IS NOT NULL) AS con_portada, c.updated_at,
                        p.precio, p.iva_pct, p.activo AS precio_activo,
                        TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS profesor,
                        (SELECT COUNT(*)::int FROM aim_aula_lecciones l WHERE l.curso_id = c.id) AS lecciones,
                        (SELECT COUNT(*)::int FROM aim_aula_temas t WHERE t.curso_id = c.id) AS temas
                 FROM aim_aula_cursos c
                 LEFT JOIN aim_precios p ON p.concepto = c.concepto
                 LEFT JOIN users u ON u.user_id = c.profesor_id
                 WHERE c.publicado ORDER BY c.orden, c.created_at DESC`);
            const mios = new Map();
            if (s?.userId) {
                const m = await pool.query(
                    `SELECT i.curso_id, i.estado, ${SQL_ACCESO()} AS acceso, ${SQL_PROGRESO} AS hechas
                     FROM aim_aula_inscripciones i LEFT JOIN aim_cargos c ON c.id = i.cargo_id
                     WHERE i.user_id = $1 AND i.estado <> 'baja'`, [s.userId]);
                for (const x of m.rows) mios.set(x.curso_id, x);
            }
            res.set('Cache-Control', 'no-store');
            res.json({ cursos: r.rows.map(c => {
                const m = mios.get(c.id);
                return {
                    id: c.id, titulo: c.titulo, resumen: c.resumen, profesor: c.profesor || null, portada: c.con_portada ? `/api/aula/cursos/${c.id}/portada?v=${new Date(c.updated_at).getTime()}` : null,
                    temas: c.temas, lecciones: c.lecciones, precio: totalDe(c), gratis: !totalDe(c),
                    mio: m ? { acceso: m.acceso, pendientePago: !m.acceso && m.estado === 'pendiente_pago', progreso: c.lecciones ? Math.round(100 * m.hechas / c.lecciones) : 0 } : null,
                };
            }) });
        } catch (err) { fallo(res, err); }
    });

    // Un curso: lo que es, su temario (solo los títulos) y si está dentro.
    router.get('/api/aula/cursos/:id', async (req, res) => {
        try {
            const id = idDe(req.params.id);
            const s = await sesionOpcional(req);
            const c = await curso(id);
            const gestor = s?.canAccessAdmin && permisos({ userSession: s }).secciones?.aula;
            if (!c.publicado && !gestor) corta(404, 'Ese curso no existe.');
            const temas = (await pool.query(`SELECT id, titulo FROM aim_aula_temas WHERE curso_id = $1 ORDER BY orden, id`, [id])).rows;
            const lecs = (await pool.query(`SELECT id, tema_id, tipo, titulo, gratis, abre_at, directo_at FROM aim_aula_lecciones WHERE curso_id = $1 ORDER BY orden, id`, [id])).rows;
            let mio = null, hechas = new Set();
            if (s?.userId) {
                const ins = await inscripcion(id, s.userId);
                if (ins && ins.estado !== 'baja') {
                    const pagable = ins.cargo_id && ins.cargo_estado === 'pendiente';
                    // Su avance (#455): lo terminado, el porcentaje y, al 100 %, el diploma.
                    hechas = new Set((await pool.query(
                        `SELECT pr.leccion_id FROM aim_aula_progreso pr JOIN aim_aula_lecciones l ON l.id = pr.leccion_id WHERE l.curso_id = $1 AND pr.user_id = $2`, [id, s.userId])).rows.map(x => x.leccion_id));
                    const n = lecs.filter(l => hechas.has(l.id)).length;
                    mio = { acceso: ins.acceso, pendientePago: !ins.acceso && ins.estado === 'pendiente_pago', cargoId: pagable ? ins.cargo_id : null,
                        hechas: n, lecciones: lecs.length, progreso: lecs.length ? Math.round(100 * n / lecs.length) : 0, valorado: await valorado(id, s.userId),
                        diploma: ins.acceso && lecs.length > 0 && n === lecs.length ? `/api/aula/cursos/${id}/diploma` : null };
                }
            }
            res.set('Cache-Control', 'no-store');
            res.json({
                id: c.id, titulo: c.titulo, resumen: c.resumen, descripcion: c.descripcion, profesor: c.profesor || null, publicado: c.publicado,
                portada: c.con_portada ? `/api/aula/cursos/${c.id}/portada?v=${new Date(c.updated_at).getTime()}` : null,
                precio: totalDe(c), gratis: !totalDe(c), conIva: Number(c.iva_pct) > 0,
                temas: temas.map(t => ({ ...t, lecciones: lecs.filter(l => l.tema_id === t.id).map(({ id: lid, tipo, titulo, gratis, abre_at: abreAt, directo_at: directoAt }) => ({ id: lid, tipo, titulo, gratis: !!totalDe(c) && gratis, hecha: hechas.has(lid), abreAt: abreAt && new Date(abreAt) > new Date() ? abreAt : null, directoAt })) })),
                // Curso de pago con parte gratis: se puede ver eso sin pagar.
                parteGratis: !!totalDe(c) && lecs.some(l => l.gratis),
                sesion: !!s?.userId, mio, gestor: !!gestor, pagoOnline: pagosOnlineAbiertos(),
            });
        } catch (err) { fallo(res, err); }
    });

    // ── La valoración del curso (#463): al terminarlo, para tener el diploma ──
    async function valorado(cursoId, userId) {
        return (await pool.query(`SELECT 1 FROM aim_aula_valoraciones WHERE curso_id = $1 AND user_id = $2`, [cursoId, userId])).rowCount > 0;
    }
    router.post('/api/aula/cursos/:id/valoracion', authenticateSession, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            const me = req.userSession.userId;
            const ins = await inscripcion(id, me);
            if (!ins?.acceso) corta(403, 'No estás apuntado a este curso.');
            const x = (await pool.query(
                `SELECT (SELECT COUNT(*)::int FROM aim_aula_lecciones WHERE curso_id = $1) AS lecciones, COUNT(*)::int AS hechas
                 FROM aim_aula_progreso pr JOIN aim_aula_lecciones l ON l.id = pr.leccion_id WHERE l.curso_id = $1 AND pr.user_id = $2`, [id, me])).rows[0];
            if (!x.lecciones || x.hechas < x.lecciones) corta(400, 'La valoración se hace al terminar el curso.');
            const b = req.body || {};
            const notas = NOTAS_VALORACION.map(k => Number(b[k]));
            if (notas.some(n => !Number.isInteger(n) || n < 1 || n > 5)) corta(400, 'Contesta todas las preguntas del 1 al 5.');
            if (!RECOMIENDA.includes(b.recomendaria)) corta(400, 'Dinos si recomendarías el curso.');
            // Si la vuelve a mandar, se queda la última.
            await pool.query(
                `INSERT INTO aim_aula_valoraciones (curso_id, user_id, ${NOTAS_VALORACION.join(', ')}, recomendaria, mejoras)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 ON CONFLICT (curso_id, user_id) DO UPDATE SET ${NOTAS_VALORACION.map(k => `${k} = EXCLUDED.${k}`).join(', ')},
                     recomendaria = EXCLUDED.recomendaria, mejoras = EXCLUDED.mejoras, created_at = NOW()`,
                [id, me, ...notas, b.recomendaria, txt(b.mejoras, 3000)]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // El diploma de aprovechamiento (#455): para quien ha terminado todas las
    // lecciones del curso. La fecha, la del día en que terminó la última.
    router.get('/api/aula/cursos/:id/diploma', authenticateSession, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            const c = await curso(id);
            const me = req.userSession.userId;
            const ins = await inscripcion(id, me);
            if (!ins?.acceso) corta(403, 'No estás apuntado a este curso.');
            const x = (await pool.query(
                `SELECT (SELECT COUNT(*)::int FROM aim_aula_lecciones WHERE curso_id = $1) AS lecciones,
                        COUNT(*)::int AS hechas, MAX(pr.completada_at) AS terminado
                 FROM aim_aula_progreso pr JOIN aim_aula_lecciones l ON l.id = pr.leccion_id WHERE l.curso_id = $1 AND pr.user_id = $2`, [id, me])).rows[0];
            if (!x.lecciones || x.hechas < x.lecciones) corta(403, 'El diploma sale al terminar todas las lecciones del curso.');
            // Antes del diploma, la valoración del curso (#463).
            if (!(await valorado(id, me))) return res.status(409).json({ error: 'Antes de tu diploma, valora el curso: son dos minutos.', valorar: true });
            const u = (await pool.query(`SELECT TRIM(CONCAT(name, ' ', COALESCE(surname, ''))) AS nombre FROM users WHERE user_id = $1`, [me])).rows[0];
            const codigo = crypto.createHash('sha256').update(`aim-diploma:${id}:${me}`).digest('hex').slice(0, 10).toUpperCase();
            // Con un diploma diseñado en «Diseños», el navegador lo pinta con estos datos.
            if (req.query.formato === 'datos') {
                res.set('Cache-Control', 'private, no-store');
                return res.json({
                    diseno: await disenoDiploma(pool, id), nombre: `Diploma ${c.titulo}`,
                    variables: { alumno: u?.nombre || 'Alumno', curso: c.titulo, profesor: c.profesor || '', lecciones: String(x.lecciones), codigo, nivel: '', grupo: '', resultado: '',
                        fecha: new Date(x.terminado).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }) },
                });
            }
            res.setHeader('Content-Type', 'application/pdf');
            const nombre = String(c.titulo).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || id;
            res.setHeader('Content-Disposition', `${req.query.descargar ? 'attachment' : 'inline'}; filename="diploma-${nombre}.pdf"`);
            res.setHeader('Cache-Control', 'private, no-store');
            generarDiplomaPdf({ alumno: u?.nombre || 'Alumno', curso: c.titulo, profesor: c.profesor || null, lecciones: x.lecciones, terminado: x.terminado, codigo }, res);
        } catch (err) { fallo(res, err); }
    });

    router.get('/api/aula/cursos/:id/portada', async (req, res) => {
        try {
            const c = (await pool.query(`SELECT portada, portada_mime, publicado FROM aim_aula_cursos WHERE id = $1`, [idDe(req.params.id)])).rows[0];
            if (!c?.portada) return res.status(404).end();
            res.set('Content-Type', c.portada_mime || 'image/jpeg').set('Cache-Control', 'public, max-age=86400').send(c.portada);
        } catch { res.status(404).end(); }
    });

    // Apuntarse. Gratis: dentro. De pago: su cargo, para pagarlo por internet o
    // en secretaría; entra en cuanto esté cobrado.
    router.post('/api/aula/cursos/:id/apuntarme', authenticateSession, async (req, res) => {
        const client = await pool.connect();
        try {
            const id = idDe(req.params.id);
            const me = req.userSession.userId;
            const c = await curso(id);
            if (!c.publicado) corta(404, 'Ese curso no existe.');
            await client.query('BEGIN');
            await client.query(`SELECT pg_advisory_xact_lock(433, $1)`, [id]);
            const antes = (await client.query(
                `SELECT i.*, c.estado AS cargo_estado, ${SQL_ACCESO()} AS acceso FROM aim_aula_inscripciones i
                 LEFT JOIN aim_cargos c ON c.id = i.cargo_id WHERE i.curso_id = $1 AND i.user_id = $2 FOR UPDATE OF i`, [id, me])).rows[0];
            if (antes && antes.estado !== 'baja' && (antes.acceso || (antes.cargo_id && antes.cargo_estado === 'pendiente'))) {
                await client.query('COMMIT');
                return res.json({ acceso: antes.acceso, cargoId: antes.acceso ? null : antes.cargo_id });
            }
            let estado = 'activa', cargoId = null;
            if (precioDe(c) > 0) {
                const yo = (await client.query(`SELECT TRIM(CONCAT(name, ' ', COALESCE(surname, ''))) AS nombre FROM users WHERE user_id = $1`, [me])).rows[0];
                cargoId = (await client.query(
                    `INSERT INTO aim_cargos (cliente_id, concepto, mes, descripcion, tipo, precio, iva_pct, descuento_pct, target_nombre, estado, origen, actividad)
                     VALUES ($1, $2, date_trunc('month', now() AT TIME ZONE 'Europe/Madrid')::date, $3, 'Otros', $4, $5, 0, $6, 'pendiente', 'aula', $7)
                     RETURNING id`,
                    [me, c.concepto, `Curso online: ${c.titulo}`.slice(0, 255), precioDe(c), Number(c.iva_pct || 0), (yo?.nombre || '').slice(0, 255), ACTIVIDAD_AULA])).rows[0].id;
                estado = 'pendiente_pago';
            }
            await client.query(
                `INSERT INTO aim_aula_inscripciones (curso_id, user_id, estado, cargo_id, origen, activada_at)
                 VALUES ($1, $2, $3::varchar, $4, 'web', CASE WHEN $3::varchar = 'activa' THEN NOW() END)
                 ON CONFLICT (curso_id, user_id) DO UPDATE SET estado = EXCLUDED.estado, cargo_id = EXCLUDED.cargo_id,
                     activada_at = EXCLUDED.activada_at, created_at = NOW()`, [id, me, estado, cargoId]);
            await client.query('COMMIT');
            res.json({ acceso: estado === 'activa', cargoId });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });

    // Darse de baja de un curso gratis (los de pago se quedan: ya están pagados,
    // o su cargo pendiente lo anula secretaría).
    router.post('/api/aula/cursos/:id/baja', authenticateSession, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            const c = await curso(id);
            if (precioDe(c) > 0) corta(409, 'Para dejar un curso de pago, habla con secretaría.');
            await pool.query(`UPDATE aim_aula_inscripciones SET estado = 'baja' WHERE curso_id = $1 AND user_id = $2`, [id, req.userSession.userId]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // Sus cursos (para «Mis cursos» del panel).
    router.get('/api/me/aula', authenticateSession, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT cu.id, cu.titulo, cu.resumen, (cu.portada IS NOT NULL) AS con_portada, cu.updated_at, i.estado, ${SQL_ACCESO()} AS acceso,
                        CASE WHEN i.cargo_id IS NOT NULL AND c.estado = 'pendiente' THEN i.cargo_id END AS cargo_id,
                        (SELECT COUNT(*)::int FROM aim_aula_lecciones l WHERE l.curso_id = cu.id) AS lecciones, ${SQL_PROGRESO} AS hechas,
                        EXISTS (SELECT 1 FROM aim_aula_valoraciones v WHERE v.curso_id = cu.id AND v.user_id = i.user_id) AS valorado
                 FROM aim_aula_inscripciones i JOIN aim_aula_cursos cu ON cu.id = i.curso_id
                 LEFT JOIN aim_cargos c ON c.id = i.cargo_id
                 WHERE i.user_id = $1 AND i.estado <> 'baja' ORDER BY i.created_at DESC`, [req.userSession.userId]);
            const hay = (await pool.query(`SELECT COUNT(*)::int n FROM aim_aula_cursos WHERE publicado`)).rows[0].n;
            // Los cursos de sus hijos: cómo van, cuándo entraron, la próxima clase en
            // directo y las tareas que les quedan.
            const familia = (await pool.query(
                `SELECT u.name AS nombre, cu.id, cu.titulo, (cu.portada IS NOT NULL) AS con_portada, cu.updated_at, i.ultimo_acceso,
                        (SELECT COUNT(*)::int FROM aim_aula_lecciones l WHERE l.curso_id = cu.id) AS lecciones, ${SQL_PROGRESO} AS hechas,
                        (SELECT MIN(l.directo_at) FROM aim_aula_lecciones l WHERE l.curso_id = cu.id AND l.tipo = 'directo' AND l.directo_at > NOW()) AS proxima_clase,
                        (SELECT COUNT(*)::int FROM aim_aula_lecciones l WHERE l.curso_id = cu.id AND l.tipo = 'tarea' AND (l.abre_at IS NULL OR l.abre_at <= NOW())
                           AND NOT EXISTS (SELECT 1 FROM aim_aula_entregas e WHERE e.leccion_id = l.id AND e.user_id = i.user_id)) AS tareas
                 FROM aim_familias f JOIN aim_aula_inscripciones i ON i.user_id = f.persona_id JOIN aim_aula_cursos cu ON cu.id = i.curso_id
                 LEFT JOIN aim_cargos c ON c.id = i.cargo_id JOIN users u ON u.user_id = i.user_id
                 WHERE f.familiar_id = $1 AND LOWER(f.tipo) IN ('madre','padre','tutor','tutora','tutor/a') AND i.estado <> 'baja' AND ${SQL_ACCESO()}
                 ORDER BY u.name, i.created_at DESC`, [req.userSession.userId])).rows;
            res.set('Cache-Control', 'no-store');
            res.json({ cursosPublicados: hay, pagoOnline: pagosOnlineAbiertos(),
                familia: familia.map(x => ({ nombre: x.nombre, id: x.id, titulo: x.titulo, ultimoAcceso: x.ultimo_acceso, proximaClase: x.proxima_clase, tareas: x.tareas,
                    portada: x.con_portada ? `/api/aula/cursos/${x.id}/portada?v=${new Date(x.updated_at).getTime()}` : null,
                    progreso: x.lecciones ? Math.round(100 * x.hechas / x.lecciones) : 0 })),
                cursos: r.rows.map(x => ({
                id: x.id, titulo: x.titulo, resumen: x.resumen, acceso: x.acceso, pendientePago: !x.acceso && x.estado === 'pendiente_pago', cargoId: x.cargo_id,
                portada: x.con_portada ? `/api/aula/cursos/${x.id}/portada?v=${new Date(x.updated_at).getTime()}` : null,
                lecciones: x.lecciones, hechas: x.hechas, progreso: x.lecciones ? Math.round(100 * x.hechas / x.lecciones) : 0, valorado: x.valorado,
            })) });
        } catch (err) { fallo(res, err); }
    });

    // El curso por dentro: todo el temario con su contenido, lo hecho y sus entregas.
    router.get('/api/aula/cursos/:id/contenido', authenticateSession, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            // Sin acceso, pero con parte gratis: se ve eso y lo demás va con candado.
            let acceso;
            try { acceso = await puedeVer(req, id); } catch (e) {
                if (e.status !== 403) throw e;
                const c0 = await curso(id);
                const hay = c0.publicado && (await pool.query(`SELECT 1 FROM aim_aula_lecciones WHERE curso_id = $1 AND gratis LIMIT 1`, [id])).rowCount;
                if (!hay) throw e;
                acceso = { c: c0, gestor: false, previa: true };
            }
            const { c, gestor, previa } = acceso;
            const me = req.userSession.userId;
            const temas = (await pool.query(`SELECT id, titulo FROM aim_aula_temas WHERE curso_id = $1 ORDER BY orden, id`, [id])).rows;
            const lecs = (await pool.query(
                `SELECT l.id, l.tema_id, l.tipo, l.titulo, l.texto, l.video_url, l.calificacion, l.archivo_id, l.gratis,
                        l.abre_at, l.tras_anterior, l.plazo_at, l.directo_at, l.directo_min, l.enlace, l.nota_minima, l.tiempo_min,
                        a.nombre AS archivo_nombre, a.mime AS archivo_mime, a.bytes AS archivo_bytes
                 FROM aim_aula_lecciones l LEFT JOIN aim_aula_archivos a ON a.id = l.archivo_id AND a.completo
                 WHERE l.curso_id = $1 ORDER BY l.orden, l.id`, [id])).rows;
            // El último día que entró (para el profesor y para avisarle si lo deja).
            if (!gestor && !previa) await pool.query(`UPDATE aim_aula_inscripciones SET ultimo_acceso = NOW() WHERE curso_id = $1 AND user_id = $2`, [id, me]);
            const hechas = new Set((await pool.query(
                `SELECT pr.leccion_id FROM aim_aula_progreso pr JOIN aim_aula_lecciones l ON l.id = pr.leccion_id WHERE l.curso_id = $1 AND pr.user_id = $2`, [id, me])).rows.map(x => x.leccion_id));
            const entregas = new Map((await pool.query(
                `SELECT e.leccion_id, e.id, e.texto, e.archivo_nombre, (e.archivo IS NOT NULL) AS con_archivo, e.entregada_at, e.nota, e.apto, e.comentario, e.corregida_at
                 FROM aim_aula_entregas e JOIN aim_aula_lecciones l ON l.id = e.leccion_id WHERE l.curso_id = $1 AND e.user_id = $2`, [id, me])).rows.map(e => [e.leccion_id, e]));
            // Los cuestionarios: cuántas preguntas y cómo le ha ido (#439).
            const vistas = new Map(gestor ? [] : (await pool.query(
                `SELECT v.leccion_id, v.segundos FROM aim_aula_vistas v JOIN aim_aula_lecciones l ON l.id = v.leccion_id WHERE l.curso_id = $1 AND v.user_id = $2`, [id, me])).rows.map(x => [x.leccion_id, x.segundos]));
            const apuntes = new Map((await pool.query(
                `SELECT a.leccion_id, a.texto FROM aim_aula_apuntes a JOIN aim_aula_lecciones l ON l.id = a.leccion_id WHERE l.curso_id = $1 AND a.user_id = $2`, [id, me])).rows.map(x => [x.leccion_id, x.texto]));
            const cuest = new Map((await pool.query(
                `SELECT l.id, l.modo, l.intentos, l.nota_minima, l.tiempo_min,
                        (SELECT COUNT(*)::int FROM aim_aula_preguntas p WHERE p.leccion_id = l.id) AS preguntas,
                        (SELECT COUNT(*)::int FROM aim_aula_intentos i WHERE i.leccion_id = l.id AND i.user_id = $2 AND i.modo = 'evaluable') AS usados,
                        (SELECT MAX(i.nota) FROM aim_aula_intentos i WHERE i.leccion_id = l.id AND i.user_id = $2 AND i.modo = l.modo) AS mejor
                 FROM aim_aula_lecciones l WHERE l.curso_id = $1 AND l.tipo = 'cuestionario'`, [id, me])).rows.map(x => [x.id, x]));
            // En el orden del temario, para saber cuál va antes de cada una.
            const orden = temas.flatMap(t => lecs.filter(l => l.tema_id === t.id));
            const cerradas = new Map(gestor ? [] : orden.map((l, n) => [l.id, cerradaEn(l, n > 0 ? orden[n - 1] : null, hechas)]).filter(([, x]) => x));
            const directo = (l) => (l.tipo !== 'directo' ? undefined : {
                at: l.directo_at, min: l.directo_min || 60, enlace: httpsOk(l.enlace) || httpsOk(c.meet_url),
                grabacion: l.video_url ? { embed: incrustar(l.video_url), url: l.video_url } : l.archivo_nombre ? { src: `/api/aula/archivos/${l.archivo_id}`, mime: l.archivo_mime } : null,
            });
            res.set('Cache-Control', 'no-store');
            res.json({
                id: c.id, titulo: c.titulo, profesor: c.profesor || null, gestor,
                previa: !!previa, precio: totalDe(c), valorado: !gestor && !previa ? await valorado(c.id, me) : true,
                temas: temas.map(t => ({ ...t, lecciones: lecs.filter(l => l.tema_id === t.id).map(l => (previa && !l.gratis ? { id: l.id, tipo: l.tipo, titulo: l.titulo, bloqueada: true }
                  : cerradas.has(l.id) ? { id: l.id, tipo: l.tipo, titulo: l.titulo, cerrada: cerradas.get(l.id), hecha: hechas.has(l.id), directo: l.tipo === 'directo' ? { at: l.directo_at, min: l.directo_min || 60 } : undefined } : {
                    gratis: !!l.gratis, abreAt: l.abre_at, plazoAt: l.tipo === 'tarea' ? l.plazo_at : undefined, directo: directo(l),
                    id: l.id, tipo: l.tipo, titulo: l.titulo, texto: l.texto, calificacion: l.tipo === 'tarea' ? l.calificacion : undefined,
                    video: l.tipo === 'video' ? (l.video_url ? { embed: incrustar(l.video_url), url: l.video_url } : l.archivo_nombre ? { src: `/api/aula/archivos/${l.archivo_id}`, mime: l.archivo_mime } : null) : undefined,
                    archivo: l.archivo_nombre && l.tipo !== 'video' && l.tipo !== 'directo' ? { url: `/api/aula/archivos/${l.archivo_id}`, nombre: l.archivo_nombre, mime: l.archivo_mime, bytes: Number(l.archivo_bytes) } : null,
                    hecha: hechas.has(l.id),
                    entrega: l.tipo === 'tarea' && entregas.get(l.id) ? (({ leccion_id, con_archivo, ...e }) => ({ ...e, archivo: con_archivo ? `/api/aula/entregas/${e.id}/archivo` : null }))(entregas.get(l.id)) : null,
                    cuestionario: l.tipo === 'cuestionario' && cuest.get(l.id) ? (({ id: x, mejor, nota_minima: nm, tiempo_min: tm, ...q }) => ({ ...q, mejor: mejor == null ? null : Number(mejor), notaMinima: nm == null ? 5 : Number(nm), tiempoMin: tm || null }))(cuest.get(l.id)) : undefined,
                    vista: vistas.get(l.id) || 0, apuntes: apuntes.get(l.id) || '',
                })) })),
            });
        } catch (err) { fallo(res, err); }
    });

    router.post('/api/aula/lecciones/:id/hecha', authenticateSession, async (req, res) => {
        try {
            const l = await leccion(idDe(req.params.id));
            const { gestor } = await puedeVerLeccion(req, l);
            await exigirAbierta(req, l, gestor);
            // Las tareas cuentan al aprobarlas el profesor y los cuestionarios al
            // sacar un 5 (#455): esas no se marcan a mano.
            if (l.tipo === 'tarea' || l.tipo === 'cuestionario') corta(400, 'Esta lección se termina al aprobarla.');
            if (req.body?.hecha === false) await pool.query(`DELETE FROM aim_aula_progreso WHERE user_id = $1 AND leccion_id = $2`, [req.userSession.userId, l.id]);
            else await pool.query(`INSERT INTO aim_aula_progreso (user_id, leccion_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.userSession.userId, l.id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // Por dónde va en un vídeo (para seguir donde lo dejó). Al terminarlo, vuelve a 0.
    router.post('/api/aula/lecciones/:id/vista', authenticateSession, async (req, res) => {
        try {
            const l = await leccion(idDe(req.params.id));
            const { gestor } = await puedeVerLeccion(req, l);
            if (gestor) return res.json({ success: true });
            const seg = Math.max(0, Math.min(86400, Math.round(Number(req.body?.segundos) || 0)));
            const dur = Number(req.body?.duracion) > 0 ? Math.min(86400, Math.round(Number(req.body.duracion))) : null;
            await pool.query(
                `INSERT INTO aim_aula_vistas (user_id, leccion_id, segundos, duracion) VALUES ($1, $2, $3, $4)
                 ON CONFLICT (user_id, leccion_id) DO UPDATE SET segundos = EXCLUDED.segundos, duracion = COALESCE(EXCLUDED.duracion, aim_aula_vistas.duracion), updated_at = NOW()`,
                [req.userSession.userId, l.id, seg, dur]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Los apuntes del alumno en una lección (vacíos: se borran).
    router.put('/api/aula/lecciones/:id/apuntes', authenticateSession, async (req, res) => {
        try {
            const l = await leccion(idDe(req.params.id));
            await puedeVerLeccion(req, l);
            const texto = String(req.body?.texto ?? '').slice(0, 20000);
            if (!texto.trim()) await pool.query(`DELETE FROM aim_aula_apuntes WHERE user_id = $1 AND leccion_id = $2`, [req.userSession.userId, l.id]);
            else await pool.query(
                `INSERT INTO aim_aula_apuntes (user_id, leccion_id, texto) VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, leccion_id) DO UPDATE SET texto = EXCLUDED.texto, updated_at = NOW()`, [req.userSession.userId, l.id, texto]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Todos sus apuntes del curso, en el orden del temario (para leerlos, bajarlos o imprimirlos).
    router.get('/api/aula/cursos/:id/apuntes', authenticateSession, async (req, res) => {
        try {
            const { c } = await puedeVer(req, idDe(req.params.id));
            const r = await pool.query(
                `SELECT l.id, t.titulo AS tema, l.titulo AS leccion, a.texto, a.updated_at
                 FROM aim_aula_apuntes a JOIN aim_aula_lecciones l ON l.id = a.leccion_id JOIN aim_aula_temas t ON t.id = l.tema_id
                 WHERE l.curso_id = $1 AND a.user_id = $2 ORDER BY t.orden, t.id, l.orden, l.id`, [c.id, req.userSession.userId]);
            res.set('Cache-Control', 'no-store');
            res.json({ curso: c.titulo, apuntes: r.rows });
        } catch (err) { fallo(res, err); }
    });
    // Comprobar un diploma por su código (el que lleva impreso): para cualquiera,
    // con un límite de comprobaciones por minuto. Vale si terminó el curso (o lo
    // valoró, que se hace al terminarlo: así sigue valiendo si luego se añaden lecciones).
    const comprobaciones = new Map();
    router.get('/api/aula/diplomas/:codigo', async (req, res) => {
        try {
            const ip = String(req.ip || ''), ahora = Date.now();
            const lista = (comprobaciones.get(ip) || []).filter(t => t > ahora - 60_000);
            lista.push(ahora); comprobaciones.set(ip, lista);
            if (comprobaciones.size > 5000) comprobaciones.clear();
            if (lista.length > 20) corta(429, 'Demasiadas comprobaciones seguidas: espera un minuto.');
            res.set('Cache-Control', 'no-store');
            const codigo = String(req.params.codigo || '').trim().toUpperCase();
            if (!/^[0-9A-F]{10}$/.test(codigo)) return res.json({ valido: false });
            const r = await pool.query(`SELECT curso_id, user_id FROM aim_aula_inscripciones WHERE estado <> 'baja'`);
            const x = r.rows.find(i => crypto.createHash('sha256').update(`aim-diploma:${i.curso_id}:${i.user_id}`).digest('hex').slice(0, 10).toUpperCase() === codigo);
            if (!x) return res.json({ valido: false });
            const d = (await pool.query(
                `SELECT c.titulo, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS alumno, TRIM(CONCAT(p.name, ' ', COALESCE(p.surname, ''))) AS profesor,
                        (SELECT COUNT(*)::int FROM aim_aula_lecciones l WHERE l.curso_id = c.id) AS lecciones,
                        (SELECT COUNT(*)::int FROM aim_aula_progreso pr JOIN aim_aula_lecciones l ON l.id = pr.leccion_id WHERE l.curso_id = c.id AND pr.user_id = $2) AS hechas,
                        (SELECT MAX(pr.completada_at) FROM aim_aula_progreso pr JOIN aim_aula_lecciones l ON l.id = pr.leccion_id WHERE l.curso_id = c.id AND pr.user_id = $2) AS terminado,
                        EXISTS (SELECT 1 FROM aim_aula_valoraciones v WHERE v.curso_id = c.id AND v.user_id = $2) AS valorado
                 FROM aim_aula_cursos c JOIN users u ON u.user_id = $2 LEFT JOIN users p ON p.user_id = c.profesor_id WHERE c.id = $1`, [x.curso_id, x.user_id])).rows[0];
            if (!d || !(d.valorado || (d.lecciones > 0 && d.hechas >= d.lecciones))) return res.json({ valido: false });
            res.json({ valido: true, codigo, alumno: d.alumno, curso: d.titulo, profesor: d.profesor || null, fecha: d.terminado });
        } catch (err) { fallo(res, err); }
    });

    // Lo subido (vídeo o archivo de una lección): solo para quien puede ver el curso.
    const verArchivo = async (req, res) => {
        try {
            const a = await archivoMeta(idDe(req.params.id));
            await puedeVer(req, a.curso_id).catch(async (e) => {
                // El de una lección de la parte gratis, también sin pagar.
                if (e.status !== 403) throw e;
                const g = (await pool.query(
                    `SELECT 1 FROM aim_aula_lecciones l JOIN aim_aula_cursos c ON c.id = l.curso_id WHERE l.archivo_id = $1 AND l.gratis AND c.publicado LIMIT 1`, [a.id])).rowCount;
                if (!g) throw e;
            });
            await servirArchivo(req, res, a, { descarga: req.query.descargar === '1' });
        } catch (err) { if (!res.headersSent) fallo(res, err); else res.destroy(); }
    };
    router.get('/api/aula/archivos/:id', authenticateSession, verArchivo);
    router.head('/api/aula/archivos/:id', authenticateSession, verArchivo);

    // Entregar una tarea: el texto (JSON) y, si hay, el archivo (aparte, tal cual).
    // Volver a entregar quita la corrección: el profesor la vuelve a ver.
    async function tareaPropia(req) {
        const l = await leccion(idDe(req.params.id));
        if (l.tipo !== 'tarea') corta(400, 'Esa lección no es una tarea.');
        const { gestor } = await puedeVer(req, l.curso_id);
        if (gestor) corta(400, 'Las tareas las entregan los alumnos.');
        await exigirAbierta(req, l, gestor);
        return l;
    }
    const SIN_CORREGIR = `nota = NULL, apto = NULL, comentario = NULL, corregida_por = NULL, corregida_at = NULL, entregada_at = NOW()`;
    router.post('/api/aula/lecciones/:id/entrega', authenticateSession, async (req, res) => {
        try {
            const l = await tareaPropia(req);
            const texto = txt(req.body?.texto, 20000);
            const r = await pool.query(
                `INSERT INTO aim_aula_entregas (leccion_id, user_id, texto) VALUES ($1, $2, $3)
                 ON CONFLICT (leccion_id, user_id) DO UPDATE SET texto = EXCLUDED.texto,
                     archivo = CASE WHEN $4 THEN NULL ELSE aim_aula_entregas.archivo END,
                     archivo_nombre = CASE WHEN $4 THEN NULL ELSE aim_aula_entregas.archivo_nombre END,
                     archivo_mime = CASE WHEN $4 THEN NULL ELSE aim_aula_entregas.archivo_mime END, ${SIN_CORREGIR}
                 RETURNING id, (archivo IS NOT NULL) AS con_archivo`, [l.id, req.userSession.userId, texto, req.body?.quitarArchivo === true]);
            if (!texto && !r.rows[0].con_archivo && !req.body?.conArchivo) {
                await pool.query(`DELETE FROM aim_aula_entregas WHERE id = $1`, [r.rows[0].id]);
                corta(400, 'Escribe algo o adjunta un archivo.');
            }
            // Entregada (o vuelta a entregar) no es terminada: lo es al aprobarla (#455).
            await pool.query(`DELETE FROM aim_aula_progreso WHERE user_id = $1 AND leccion_id = $2`, [req.userSession.userId, l.id]);
            res.json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/aula/lecciones/:id/entrega/archivo', authenticateSession, crudo('11mb'), async (req, res) => {
        try {
            const l = await tareaPropia(req);
            const datos = Buffer.isBuffer(req.body) ? req.body : null;
            const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
            if (!datos?.length) corta(400, 'No ha llegado el archivo.');
            if (datos.length > MAX_ARCHIVO) corta(400, 'El archivo pasa de 10 MB.');
            const nombre = txt(req.query.nombre, 200) || 'entrega';
            await pool.query(
                `INSERT INTO aim_aula_entregas (leccion_id, user_id, archivo, archivo_nombre, archivo_mime) VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (leccion_id, user_id) DO UPDATE SET archivo = EXCLUDED.archivo, archivo_nombre = EXCLUDED.archivo_nombre,
                     archivo_mime = EXCLUDED.archivo_mime, ${SIN_CORREGIR}`, [l.id, req.userSession.userId, datos, nombre, mime]);
            await pool.query(`DELETE FROM aim_aula_progreso WHERE user_id = $1 AND leccion_id = $2`, [req.userSession.userId, l.id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // El archivo de una entrega: su alumno o quien gestiona el curso.
    router.get('/api/aula/entregas/:id/archivo', authenticateSession, async (req, res) => {
        try {
            const e = (await pool.query(
                `SELECT e.user_id, e.archivo, e.archivo_nombre, e.archivo_mime, l.curso_id FROM aim_aula_entregas e
                 JOIN aim_aula_lecciones l ON l.id = e.leccion_id WHERE e.id = $1`, [idDe(req.params.id)])).rows[0];
            if (!e?.archivo) corta(404, 'No hay archivo.');
            if (String(e.user_id) !== String(req.userSession.userId)) {
                if (!esGestor(req)) corta(403, 'No es tuya.');
                await editable(req, e.curso_id);
            }
            res.set({ 'Content-Type': e.archivo_mime || 'application/octet-stream', 'Cache-Control': 'private, no-store',
                'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(e.archivo_nombre || 'entrega')}` }).send(e.archivo);
        } catch (err) { fallo(res, err); }
    });

    // ── Dudas al profesor (#461) ──
    // Las ve su alumno y quien lleva el curso; las compartidas, todo el curso.
    // Las contesta el profesor del curso (o, si no tiene, secretaría); en las
    // compartidas, también los compañeros.
    const nombreCorto = (x) => `${x.name || ''}${x.surname ? ` ${x.surname.trim()[0]}.` : ''}`.trim() || 'Alumno';
    const nombreEntero = (x) => `${x.name || ''} ${x.surname || ''}`.trim() || 'Alumno';
    const resumenDuda = (d, { gestor, yo }) => ({
        id: d.id, cursoId: d.curso_id, curso: d.curso, titulo: d.titulo, leccionId: d.leccion_id, leccion: d.leccion || null,
        publica: d.publica, estado: d.estado, mia: String(d.user_id) === String(yo),
        autor: gestor ? nombreEntero(d) : nombreCorto(d), respuestas: d.respuestas, creada: d.created_at, ultima: d.ultima,
        pendiente: d.estado === 'abierta' && !d.ultima_profesor,
    });
    async function dudaDe(req, id) {
        const d = (await pool.query(`${SQL_DUDAS} d.id = $1`, [id])).rows[0];
        if (!d) corta(404, 'Esa duda ya no está.');
        const { gestor } = await puedeVer(req, d.curso_id);
        const mia = String(d.user_id) === String(req.userSession.userId);
        if (!gestor && !mia && !d.publica) corta(403, 'Esa duda es privada.');
        return { d, gestor, mia };
    }
    const MIME_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    router.get('/api/aula/cursos/:id/dudas', authenticateSession, async (req, res) => {
        try {
            const { c, gestor } = await puedeVer(req, idDe(req.params.id));
            const yo = req.userSession.userId;
            const r = await pool.query(`${SQL_DUDAS} d.curso_id = $1 ${gestor ? '' : 'AND (d.publica OR d.user_id = $2)'} ORDER BY ul.created_at DESC LIMIT 300`,
                gestor ? [c.id] : [c.id, yo]);
            res.set('Cache-Control', 'no-store');
            res.json({ gestor, dudas: r.rows.map(d => resumenDuda(d, { gestor, yo })) });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/aula/cursos/:id/dudas', authenticateSession, async (req, res) => {
        try {
            const { c, gestor } = await puedeVer(req, idDe(req.params.id));
            if (gestor) corta(400, 'Las dudas las preguntan los alumnos: tú las contestas.');
            const titulo = txt(req.body?.titulo, 200), cuerpo = txt(req.body?.cuerpo, 10000);
            if (!titulo) corta(400, 'Ponle un título a tu duda.');
            if (!cuerpo) corta(400, 'Cuenta tu duda.');
            let leccionId = null;
            if (req.body?.leccionId) {
                const l = (await pool.query(`SELECT id FROM aim_aula_lecciones WHERE id = $1 AND curso_id = $2`, [Number(req.body.leccionId) || 0, c.id])).rows[0];
                leccionId = l?.id || null;
            }
            const r = await pool.query(
                `INSERT INTO aim_aula_dudas (curso_id, leccion_id, user_id, titulo, cuerpo, publica) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [c.id, leccionId, req.userSession.userId, titulo, cuerpo, req.body?.publica === true]);
            res.status(201).json({ success: true, id: r.rows[0].id, mensajeId: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/aula/dudas/:id', authenticateSession, async (req, res) => {
        try {
            const { d, gestor } = await dudaDe(req, idDe(req.params.id));
            const yo = req.userSession.userId;
            const m = await pool.query(
                `SELECT m.id, m.user_id, m.es_profesor, m.cuerpo, m.created_at, (m.imagen IS NOT NULL) AS con_imagen, u.name, u.surname
                 FROM aim_aula_dudas m LEFT JOIN users u ON u.user_id = m.user_id
                 WHERE m.id = $1 OR m.duda_id = $1 ORDER BY m.created_at, m.id`, [d.id]);
            res.set('Cache-Control', 'no-store');
            res.json({
                ...resumenDuda(d, { gestor, yo }), gestor,
                mensajes: m.rows.map(x => ({
                    id: x.id, mio: String(x.user_id) === String(yo), esProfesor: x.es_profesor, cuerpo: x.cuerpo, fecha: x.created_at,
                    autor: x.es_profesor || gestor ? nombreEntero(x) : nombreCorto(x),
                    imagen: x.con_imagen ? `/api/aula/dudas/mensajes/${x.id}/imagen` : null,
                    puedeBorrar: gestor || String(x.user_id) === String(yo),
                })),
            });
        } catch (err) { fallo(res, err); }
    });
    // Contestar: quien lleva el curso, su alumno y, si es compartida, los compañeros.
    // Si el alumno vuelve a escribir en una resuelta, se abre otra vez.
    router.post('/api/aula/dudas/:id/mensajes', authenticateSession, async (req, res) => {
        try {
            const { d, gestor, mia } = await dudaDe(req, idDe(req.params.id));
            const cuerpo = txt(req.body?.cuerpo, 10000);
            if (!cuerpo) corta(400, 'Escribe algo.');
            const r = await pool.query(
                `INSERT INTO aim_aula_dudas (curso_id, duda_id, user_id, es_profesor, cuerpo) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [d.curso_id, d.id, req.userSession.userId, gestor, cuerpo]);
            if (mia && d.estado === 'resuelta') await pool.query(`UPDATE aim_aula_dudas SET estado = 'abierta' WHERE id = $1`, [d.id]);
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    // Resuelta o abierta (su alumno o quien lleva el curso) y compartirla: la
    // comparte su alumno; quien lleva el curso solo puede dejarla privada.
    router.put('/api/aula/dudas/:id', authenticateSession, async (req, res) => {
        try {
            const { d, gestor, mia } = await dudaDe(req, idDe(req.params.id));
            if (!gestor && !mia) corta(403, 'Esa duda no es tuya.');
            const estado = ['abierta', 'resuelta'].includes(req.body?.estado) ? req.body.estado : d.estado;
            let publica = d.publica;
            if (typeof req.body?.publica === 'boolean') {
                if (req.body.publica && !mia) corta(403, 'Solo quien la pregunta puede compartirla con el curso.');
                publica = req.body.publica;
            }
            await pool.query(`UPDATE aim_aula_dudas SET estado = $2, publica = $3 WHERE id = $1`, [d.id, estado, publica]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Borrar un mensaje: el suyo, o cualquiera quien lleva el curso. El primero
    // se lleva la duda entera.
    async function mensajeDe(req) {
        const m = (await pool.query(`SELECT id, duda_id, user_id, created_at, imagen_mime FROM aim_aula_dudas WHERE id = $1`, [idDe(req.params.id)])).rows[0];
        if (!m) corta(404, 'Ese mensaje ya no está.');
        return { m, ...(await dudaDe(req, m.duda_id || m.id)) };
    }
    router.delete('/api/aula/dudas/mensajes/:id', authenticateSession, async (req, res) => {
        try {
            const { m, gestor } = await mensajeDe(req);
            if (!gestor && String(m.user_id) !== String(req.userSession.userId)) corta(403, 'Solo puedes borrar lo tuyo.');
            await pool.query(`DELETE FROM aim_aula_dudas WHERE id = $1`, [m.id]);
            res.json({ success: true, duda: !m.duda_id });
        } catch (err) { fallo(res, err); }
    });
    // Una foto con el mensaje (una captura del ejercicio…), tal cual, justo después de escribirlo.
    router.put('/api/aula/dudas/mensajes/:id/imagen', authenticateSession, crudo('6mb'), async (req, res) => {
        try {
            const { m } = await mensajeDe(req);
            if (String(m.user_id) !== String(req.userSession.userId)) corta(403, 'Solo puedes poner la foto en tu mensaje.');
            if (Date.now() - new Date(m.created_at).getTime() > 30 * 60 * 1000) corta(400, 'Ese mensaje ya no se puede cambiar.');
            const datos = Buffer.isBuffer(req.body) ? req.body : null;
            const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
            if (!datos?.length) corta(400, 'No ha llegado la imagen.');
            if (!MIME_IMAGEN.includes(mime)) corta(400, 'Solo imágenes (JPG, PNG, WebP o GIF).');
            if (datos.length > 5 * 1048576) corta(400, 'La imagen pasa de 5 MB.');
            await pool.query(`UPDATE aim_aula_dudas SET imagen = $2, imagen_mime = $3 WHERE id = $1`, [m.id, datos, mime]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/aula/dudas/mensajes/:id/imagen', authenticateSession, async (req, res) => {
        try {
            const { m } = await mensajeDe(req);
            const x = (await pool.query(`SELECT imagen, imagen_mime FROM aim_aula_dudas WHERE id = $1`, [m.id])).rows[0];
            if (!x?.imagen) corta(404, 'No hay imagen.');
            res.set({ 'Content-Type': x.imagen_mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' }).send(x.imagen);
        } catch (err) { fallo(res, err); }
    });

    // ════════════════════════ Gestión ════════════════════════

    router.get('/api/admin/aula', ...gestion, async (req, res) => {
        try {
            const todos = completa(req);
            const r = await pool.query(
                `SELECT c.id, c.titulo, c.publicado, c.profesor_id, c.updated_at, (c.portada IS NOT NULL) AS con_portada,
                        p.precio, p.iva_pct, p.activo AS precio_activo, c.concepto,
                        TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS profesor,
                        (SELECT COUNT(*)::int FROM aim_aula_lecciones l WHERE l.curso_id = c.id) AS lecciones,
                        (SELECT COUNT(*)::int FROM aim_aula_inscripciones i LEFT JOIN aim_cargos cg ON cg.id = i.cargo_id
                          WHERE i.curso_id = c.id AND ${SQL_ACCESO('i', 'cg')}) AS alumnos,
                        (SELECT COUNT(*)::int FROM aim_aula_inscripciones i LEFT JOIN aim_cargos cg ON cg.id = i.cargo_id
                          WHERE i.curso_id = c.id AND i.estado = 'pendiente_pago' AND NOT ${SQL_ACCESO('i', 'cg')}) AS por_pagar,
                        (SELECT COUNT(*)::int FROM aim_aula_entregas e JOIN aim_aula_lecciones l ON l.id = e.leccion_id
                          WHERE l.curso_id = c.id AND e.corregida_at IS NULL) AS por_corregir,
                        (SELECT COUNT(*)::int FROM aim_aula_dudas d WHERE d.curso_id = c.id AND d.duda_id IS NULL AND ${SQL_DUDA_PENDIENTE}) AS dudas
                 FROM aim_aula_cursos c LEFT JOIN aim_precios p ON p.concepto = c.concepto LEFT JOIN users u ON u.user_id = c.profesor_id
                 ${todos ? '' : 'WHERE c.profesor_id = $1'} ORDER BY c.orden, c.created_at DESC`, todos ? [] : [req.userSession.userId]);
            res.set('Cache-Control', 'no-store');
            res.json({
                completa: todos, espacio: { usado: await espacioUsado(), tope: TOPE_TOTAL, maxVideo: MAX_VIDEO, maxArchivo: MAX_ARCHIVO },
                cursos: r.rows.map(c => ({ id: c.id, titulo: c.titulo, publicado: c.publicado, profesor: c.profesor || null, lecciones: c.lecciones,
                    alumnos: c.alumnos, porPagar: c.por_pagar, porCorregir: c.por_corregir, dudas: c.dudas, precio: totalDe(c), gratis: !totalDe(c),
                    portada: c.con_portada ? `/api/aula/cursos/${c.id}/portada?v=${new Date(c.updated_at).getTime()}` : null })),
            });
        } catch (err) { fallo(res, err); }
    });

    // Los profesores que se pueden elegir: el personal que da clase o más.
    router.get('/api/admin/aula/profesores', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT u.user_id AS id, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS nombre
                 FROM users u LEFT JOIN aim_rangos ar ON ar.user_id = u.user_id
                 WHERE LOWER(COALESCE(ar.rango, u.role)) IN ('instructor','secretaria','club_owner','equipo_it')
                 ORDER BY u.name, u.surname LIMIT 300`);
            res.json(r.rows);
        } catch (err) { fallo(res, err); }
    });

    // El curso entero para editarlo.
    router.get('/api/admin/aula/cursos/:id', ...gestion, async (req, res) => {
        try {
            const c = await editable(req, idDe(req.params.id));
            const temas = (await pool.query(`SELECT id, titulo FROM aim_aula_temas WHERE curso_id = $1 ORDER BY orden, id`, [c.id])).rows;
            const lecs = (await pool.query(
                `SELECT l.id, l.tema_id, l.tipo, l.titulo, l.texto, l.video_url, l.calificacion, l.archivo_id, a.nombre AS archivo_nombre, a.mime AS archivo_mime, a.bytes AS archivo_bytes,
                        (SELECT COUNT(*)::int FROM aim_aula_entregas e WHERE e.leccion_id = l.id AND e.corregida_at IS NULL) AS por_corregir,
                        l.modo, l.intentos, l.gratis, (SELECT COUNT(*)::int FROM aim_aula_preguntas p WHERE p.leccion_id = l.id) AS n_preguntas,
                        l.abre_at, l.tras_anterior, l.plazo_at, l.directo_at, l.directo_min, l.enlace, l.nota_minima, l.tiempo_min
                 FROM aim_aula_lecciones l LEFT JOIN aim_aula_archivos a ON a.id = l.archivo_id AND a.completo
                 WHERE l.curso_id = $1 ORDER BY l.orden, l.id`, [c.id])).rows;
            res.set('Cache-Control', 'no-store');
            res.json({
                id: c.id, titulo: c.titulo, resumen: c.resumen, descripcion: c.descripcion, publicado: c.publicado, profesorId: c.profesor_id, profesor: c.profesor || null, diplomaDisenoId: c.diploma_diseno_id || null, meetUrl: c.meet_url || '',
                precio: c.concepto && c.precio_activo !== false ? Number(c.precio) : 0, ivaPct: c.concepto ? Number(c.iva_pct) : 21, total: totalDe(c), concepto: c.concepto,
                portada: c.con_portada ? `/api/aula/cursos/${c.id}/portada?v=${new Date(c.updated_at).getTime()}` : null, completa: completa(req),
                temas: temas.map(t => ({ ...t, lecciones: lecs.filter(l => l.tema_id === t.id).map(l => ({
                    id: l.id, tipo: l.tipo, titulo: l.titulo, texto: l.texto, videoUrl: l.video_url, calificacion: l.calificacion, porCorregir: l.por_corregir, modo: l.modo, intentos: l.intentos, preguntas: l.n_preguntas, gratis: l.gratis,
                    abreAt: l.abre_at, trasAnterior: l.tras_anterior, plazoAt: l.plazo_at, directoAt: l.directo_at, directoMin: l.directo_min, enlace: l.enlace || '',
                    notaMinima: l.nota_minima == null ? null : Number(l.nota_minima), tiempoMin: l.tiempo_min,
                    archivo: l.archivo_nombre ? { id: l.archivo_id, nombre: l.archivo_nombre, mime: l.archivo_mime, bytes: Number(l.archivo_bytes) } : null,
                })) })),
            });
        } catch (err) { fallo(res, err); }
    });

    // Guardar los datos del curso. El precio, solo con el aula completa: se
    // guarda en su concepto del catálogo (AULA-<id>), que es lo que se cobra.
    async function guardarPrecio(client, c, precio, ivaPct, titulo) {
        const concepto = conceptoDe(c.id);
        if (precio > 0) {
            await client.query(
                // Se factura en la serie de los cursos online (AIMON, #451).
                `INSERT INTO aim_precios (concepto, descripcion, precio, tipo, iva_pct, activo, serie_fiscal) VALUES ($1, $2, $3, 'Otros', $4, true, 'ON')
                 ON CONFLICT (concepto) DO UPDATE SET descripcion = EXCLUDED.descripcion, precio = EXCLUDED.precio, iva_pct = EXCLUDED.iva_pct,
                     activo = true, serie_fiscal = 'ON', updated_at = NOW()`, [concepto, `Curso online: ${titulo}`.slice(0, 255), precio, ivaPct]);
            await client.query(`UPDATE aim_aula_cursos SET concepto = $2 WHERE id = $1`, [c.id, concepto]);
        } else if (c.concepto) {
            // Pasa a gratis: el concepto se queda (lo usan los cargos de antes), apagado.
            await client.query(`UPDATE aim_precios SET activo = false, updated_at = NOW() WHERE concepto = $1`, [c.concepto]);
        }
    }
    function datosCurso(body, { nuevo }) {
        const titulo = txt(body?.titulo, 200);
        if (!titulo) corta(400, 'Ponle un título al curso.');
        const d = { titulo, resumen: txt(body?.resumen, 400), descripcion: txt(body?.descripcion, 20000) };
        if (!nuevo) d.publicado = !!body?.publicado;
        return d;
    }
    function precioDeBody(body) {
        const precio = body?.precio == null || body.precio === '' ? 0 : r2(String(body.precio).replace(',', '.'));
        if (!Number.isFinite(precio) || precio < 0 || precio > 10000) corta(400, 'El precio no es válido.');
        const iva = IVA_AULA;
        return { precio, iva };
    }
    router.post('/api/admin/aula/cursos', ...gestion, async (req, res) => {
        const client = await pool.connect();
        try {
            const d = datosCurso(req.body, { nuevo: true });
            // Quien no tiene el aula completa crea cursos suyos.
            const profesor = completa(req) && req.body?.profesorId ? String(req.body.profesorId) : req.userSession.userId;
            await client.query('BEGIN');
            const c = (await client.query(
                `INSERT INTO aim_aula_cursos (titulo, resumen, descripcion, profesor_id, creado_por) VALUES ($1, $2, $3, $4, $5) RETURNING id, concepto`,
                [d.titulo, d.resumen, d.descripcion, profesor, req.userSession.userId])).rows[0];
            if (completa(req)) { const p = precioDeBody(req.body); await guardarPrecio(client, c, p.precio, p.iva, d.titulo); }
            await client.query(`INSERT INTO aim_aula_temas (curso_id, titulo) VALUES ($1, 'Tema 1')`, [c.id]);
            await client.query('COMMIT');
            res.status(201).json({ success: true, id: c.id });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });
    router.put('/api/admin/aula/cursos/:id', ...gestion, async (req, res) => {
        const client = await pool.connect();
        try {
            const c = await editable(req, idDe(req.params.id));
            const d = datosCurso(req.body, { nuevo: false });
            await client.query('BEGIN');
            await client.query(
                `UPDATE aim_aula_cursos SET titulo = $2, resumen = $3, descripcion = $4, publicado = $5, updated_at = NOW()${completa(req) && req.body?.profesorId !== undefined ? ', profesor_id = $6' : ''} WHERE id = $1`,
                [c.id, d.titulo, d.resumen, d.descripcion, d.publicado, ...(completa(req) && req.body?.profesorId !== undefined ? [req.body.profesorId || null] : [])]);
            // El enlace de Meet de siempre del curso (para sus clases en directo).
            if (req.body?.meetUrl !== undefined) {
                const m = String(req.body.meetUrl || '').trim();
                if (m && !httpsOk(m)) corta(400, 'El enlace de Meet tiene que empezar por https://');
                await client.query(`UPDATE aim_aula_cursos SET meet_url = $2 WHERE id = $1`, [c.id, m ? httpsOk(m) : null]);
            }
            // Su diploma (un diseño de tipo diploma) o el de por defecto (null).
            if (req.body?.diplomaDisenoId !== undefined) {
                const did = req.body.diplomaDisenoId ? Number(req.body.diplomaDisenoId) : null;
                if (did && !(await client.query(`SELECT 1 FROM aim_disenos WHERE id = $1 AND tipo = 'diploma'`, [did])).rowCount) corta(400, 'Ese diseño no es un diploma.');
                await client.query(`UPDATE aim_aula_cursos SET diploma_diseno_id = $2 WHERE id = $1`, [c.id, did]);
            }
            if (completa(req)) { const p = precioDeBody(req.body); await guardarPrecio(client, c, p.precio, p.iva, d.titulo); }
            await client.query('COMMIT');
            res.json({ success: true });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });
    // Borrar un curso: solo si nadie está apuntado (si no, se despublica).
    router.delete('/api/admin/aula/cursos/:id', ...gestion, async (req, res) => {
        try {
            const c = await editable(req, idDe(req.params.id));
            const n = (await pool.query(`SELECT COUNT(*)::int n FROM aim_aula_inscripciones WHERE curso_id = $1`, [c.id])).rows[0].n;
            if (n) corta(409, `Hay ${n} ${n === 1 ? 'persona apuntada' : 'personas apuntadas'}: en vez de borrarlo, quítalo de publicado.`);
            await pool.query(`DELETE FROM aim_aula_cursos WHERE id = $1`, [c.id]);
            if (c.concepto) await pool.query(`UPDATE aim_precios SET activo = false, updated_at = NOW() WHERE concepto = $1`, [c.concepto]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/aula/cursos/:id/portada', ...gestion, crudo('3mb'), async (req, res) => {
        try {
            const c = await editable(req, idDe(req.params.id));
            const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
            const datos = Buffer.isBuffer(req.body) && req.body.length ? req.body : null;
            if (datos && !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) corta(400, 'La portada tiene que ser JPG, PNG o WebP.');
            if (datos && datos.length > MAX_PORTADA) corta(400, 'La portada pasa de 2 MB.');
            await pool.query(`UPDATE aim_aula_cursos SET portada = $2, portada_mime = $3, updated_at = NOW() WHERE id = $1`, [c.id, datos, datos ? mime : null]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // ── Temario ──
    router.post('/api/admin/aula/cursos/:id/temas', ...gestion, async (req, res) => {
        try {
            const c = await editable(req, idDe(req.params.id));
            const titulo = txt(req.body?.titulo, 200) || 'Tema nuevo';
            const r = await pool.query(
                `INSERT INTO aim_aula_temas (curso_id, titulo, orden) VALUES ($1, $2, (SELECT COALESCE(MAX(orden), 0) + 1 FROM aim_aula_temas WHERE curso_id = $1)) RETURNING id`, [c.id, titulo]);
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    async function temaEditable(req) {
        const t = (await pool.query(`SELECT * FROM aim_aula_temas WHERE id = $1`, [idDe(req.params.id)])).rows[0];
        if (!t) corta(404, 'Ese tema ya no existe.');
        await editable(req, t.curso_id);
        return t;
    }
    router.put('/api/admin/aula/temas/:id', ...gestion, async (req, res) => {
        try {
            const t = await temaEditable(req);
            const titulo = txt(req.body?.titulo, 200);
            if (!titulo) corta(400, 'Ponle un título al tema.');
            await pool.query(`UPDATE aim_aula_temas SET titulo = $2 WHERE id = $1`, [t.id, titulo]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/aula/temas/:id', ...gestion, async (req, res) => {
        try {
            const t = await temaEditable(req);
            const n = (await pool.query(`SELECT COUNT(*)::int n FROM aim_aula_lecciones WHERE tema_id = $1`, [t.id])).rows[0].n;
            if (n) corta(409, 'Quita antes sus lecciones (o muévelas a otro tema).');
            await pool.query(`DELETE FROM aim_aula_temas WHERE id = $1`, [t.id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // El orden de todo el temario: [{ id: tema, lecciones: [ids] }]. También
    // sirve para pasar una lección de un tema a otro.
    router.put('/api/admin/aula/cursos/:id/orden', ...gestion, async (req, res) => {
        const client = await pool.connect();
        try {
            const c = await editable(req, idDe(req.params.id));
            const temas = Array.isArray(req.body?.temas) ? req.body.temas : [];
            const deCurso = new Set((await client.query(`SELECT id FROM aim_aula_temas WHERE curso_id = $1`, [c.id])).rows.map(x => x.id));
            await client.query('BEGIN');
            for (let i = 0; i < temas.length; i++) {
                const tid = Number(temas[i]?.id);
                if (!deCurso.has(tid)) continue;
                await client.query(`UPDATE aim_aula_temas SET orden = $2 WHERE id = $1`, [tid, i]);
                const ls = (Array.isArray(temas[i].lecciones) ? temas[i].lecciones : []).map(Number);
                for (let j = 0; j < ls.length; j++) {
                    await client.query(`UPDATE aim_aula_lecciones SET tema_id = $2, orden = $3 WHERE id = $1 AND curso_id = $4`, [ls[j], tid, j, c.id]);
                }
            }
            await client.query('COMMIT');
            res.json({ success: true });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });

    // ── Lecciones ──
    async function datosLeccion(body, cursoId) {
        const tipo = TIPOS.includes(body?.tipo) ? body.tipo : corta(400, 'Tipo de lección no válido.');
        const titulo = txt(body?.titulo, 200);
        if (!titulo) corta(400, 'Ponle un título a la lección.');
        const d = { tipo, titulo, texto: txt(body?.texto, 50000), video_url: null, archivo_id: null, calificacion: body?.calificacion === 'nota' ? 'nota' : 'apto', modo: 'practica', intentos: null, preguntas: null, gratis: body?.gratis === true,
            abre_at: fechaDe(body?.abreAt, 'Cuándo se abre'), tras_anterior: body?.trasAnterior === true, plazo_at: null, directo_at: null, directo_min: null, enlace: null, nota_minima: null, tiempo_min: null };
        if (d.abre_at && d.tras_anterior) corta(400, 'Elige una: que se abra en una fecha o al terminar la anterior.');
        if (tipo === 'tarea') d.plazo_at = fechaDe(body?.plazoAt, 'El plazo');
        if (tipo === 'directo') {
            d.directo_at = fechaDe(body?.directoAt, 'La clase');
            if (!d.directo_at) corta(400, 'Pon el día y la hora de la clase.');
            const m = Number(body?.directoMin);
            d.directo_min = Number.isInteger(m) && m >= 15 && m <= 480 ? m : 60;
            const e = String(body?.enlace || '').trim();
            if (e && !httpsOk(e)) corta(400, 'El enlace de la clase tiene que empezar por https:// (el de Google Meet).');
            d.enlace = e ? httpsOk(e) : null;
            if (!d.enlace && !httpsOk((await pool.query(`SELECT meet_url FROM aim_aula_cursos WHERE id = $1`, [cursoId])).rows[0]?.meet_url)) {
                corta(400, 'Pon el enlace de Meet de la clase (o el de siempre del curso, en «Datos y precio»).');
            }
        }
        if (tipo === 'cuestionario') {
            d.modo = body?.modo === 'evaluable' ? 'evaluable' : 'practica';
            const n = Number(body?.intentos);
            d.intentos = d.modo === 'evaluable' && Number.isInteger(n) && n > 0 ? Math.min(n, 20) : null;
            d.preguntas = limpiarPreguntas(body?.preguntas);
            if (!d.preguntas.length) corta(400, 'El cuestionario necesita al menos una pregunta.');
            if (body?.notaMinima !== undefined && body?.notaMinima !== null && body?.notaMinima !== '') {
                const nm = Number(String(body.notaMinima).replace(',', '.'));
                if (!Number.isFinite(nm) || nm < 0 || nm > 10) corta(400, 'La nota para aprobar va de 0 a 10.');
                d.nota_minima = Math.round(nm * 100) / 100;
            }
            const tm = Number(body?.tiempoMin);
            d.tiempo_min = d.modo === 'evaluable' && Number.isInteger(tm) && tm > 0 ? Math.min(tm, 240) : null;
        }
        if ((tipo === 'video' || tipo === 'directo') && body?.videoUrl) {
            if (!incrustar(body.videoUrl)) corta(400, 'El enlace tiene que ser de un vídeo de YouTube o de Vimeo.');
            d.video_url = String(body.videoUrl).trim().slice(0, 500);
        }
        if (body?.archivoId) {
            const a = (await pool.query(`SELECT id, mime FROM aim_aula_archivos WHERE id = $1 AND curso_id = $2 AND parte_de IS NULL AND completo`, [Number(body.archivoId), cursoId])).rows[0];
            if (!a) corta(400, 'El archivo no ha terminado de subirse.');
            if ((tipo === 'video' || tipo === 'directo') && !MIME_VIDEO.includes(a.mime)) corta(400, 'Ese archivo no es un vídeo.');
            d.archivo_id = a.id;
        }
        if (tipo === 'video' && !d.video_url && !d.archivo_id) corta(400, 'Pega el enlace del vídeo o súbelo.');
        if (tipo === 'archivo' && !d.archivo_id) corta(400, 'Sube el archivo de la lección.');
        if ((tipo === 'video' || tipo === 'directo') && d.video_url) d.archivo_id = null;
        return d;
    }
    router.post('/api/admin/aula/temas/:id/lecciones', ...gestion, async (req, res) => {
        try {
            const t = await temaEditable(req);
            const d = await datosLeccion(req.body, t.curso_id);
            const r = await pool.query(
                `INSERT INTO aim_aula_lecciones (curso_id, tema_id, tipo, titulo, texto, video_url, archivo_id, calificacion, modo, intentos, gratis,
                        abre_at, tras_anterior, plazo_at, directo_at, directo_min, enlace, nota_minima, tiempo_min, orden)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
                         (SELECT COALESCE(MAX(orden), 0) + 1 FROM aim_aula_lecciones WHERE tema_id = $2)) RETURNING id`,
                [t.curso_id, t.id, d.tipo, d.titulo, d.texto, d.video_url, d.archivo_id, d.calificacion, d.modo, d.intentos, d.gratis,
                    d.abre_at, d.tras_anterior, d.plazo_at, d.directo_at, d.directo_min, d.enlace, d.nota_minima, d.tiempo_min]);
            if (d.preguntas) await guardarPreguntas(r.rows[0].id, d.preguntas);
            res.status(201).json({ success: true, id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    async function leccionEditable(req) {
        const l = await leccion(idDe(req.params.id));
        await editable(req, l.curso_id);
        return l;
    }
    // Lo subido que deja de usarse se borra (ocupa la base compartida).
    const soltarArchivo = (id) => (id ? pool.query(
        `DELETE FROM aim_aula_archivos WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM aim_aula_lecciones WHERE archivo_id = $1)`, [id]) : null);
    router.put('/api/admin/aula/lecciones/:id', ...gestion, async (req, res) => {
        try {
            const l = await leccionEditable(req);
            const d = await datosLeccion({ ...req.body, tipo: l.tipo }, l.curso_id);
            await pool.query(`UPDATE aim_aula_lecciones SET titulo = $2, texto = $3, video_url = $4, archivo_id = $5, calificacion = $6, modo = $7, intentos = $8, gratis = $9,
                                  abre_at = $10, tras_anterior = $11, plazo_at = $12, directo_at = $13, directo_min = $14, enlace = $15, nota_minima = $16, tiempo_min = $17 WHERE id = $1`,
                [l.id, d.titulo, d.texto, d.video_url, d.archivo_id, d.calificacion, d.modo, d.intentos, d.gratis,
                    d.abre_at, d.tras_anterior, d.plazo_at, d.directo_at, d.directo_min, d.enlace, d.nota_minima, d.tiempo_min]);
            if (d.preguntas) await guardarPreguntas(l.id, d.preguntas);
            if (l.archivo_id && l.archivo_id !== d.archivo_id) await soltarArchivo(l.archivo_id);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/aula/lecciones/:id', ...gestion, async (req, res) => {
        try {
            const l = await leccionEditable(req);
            const n = (await pool.query(`SELECT COUNT(*)::int n FROM aim_aula_entregas WHERE leccion_id = $1`, [l.id])).rows[0].n;
            if (n && req.query.confirmar !== '1') corta(409, `Esta tarea tiene ${n} ${n === 1 ? 'entrega' : 'entregas'}: si la borras, se pierden.`);
            const ni = (await pool.query(`SELECT COUNT(*)::int n FROM aim_aula_intentos WHERE leccion_id = $1 AND modo = 'evaluable'`, [l.id])).rows[0].n;
            if (ni && req.query.confirmar !== '1') corta(409, `Este cuestionario tiene ${ni} ${ni === 1 ? 'intento con nota' : 'intentos con nota'}: si lo borras, se pierden.`);
            await pool.query(`DELETE FROM aim_aula_lecciones WHERE id = $1`, [l.id]);
            await soltarArchivo(l.archivo_id);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // ── Cuestionarios (#439) ──
    async function guardarPreguntas(leccionId, preguntas) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`DELETE FROM aim_aula_preguntas WHERE leccion_id = $1`, [leccionId]);
            for (let i = 0; i < preguntas.length; i++) {
                const p = preguntas[i];
                await client.query(`INSERT INTO aim_aula_preguntas (leccion_id, orden, enunciado, opciones, correcta, explicacion, imagen) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)`,
                    [leccionId, i, p.enunciado, JSON.stringify(p.opciones), p.correcta, p.explicacion, p.imagen]);
            }
            await client.query('COMMIT');
        } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
    }
    const preguntasDe = async (leccionId) => (await pool.query(
        `SELECT id, enunciado, opciones, correcta, explicacion, imagen FROM aim_aula_preguntas WHERE leccion_id = $1 ORDER BY orden, id`, [leccionId])).rows;
    router.get('/api/admin/aula/lecciones/:id/preguntas', ...gestion, async (req, res) => {
        try {
            const l = await leccionEditable(req);
            res.set('Cache-Control', 'no-store');
            res.json({ preguntas: await preguntasDe(l.id) });
        } catch (err) { fallo(res, err); }
    });
    // Preguntas hechas con el vocabulario de Learning Dungeon (la misma base):
    // «¿Qué significa…?» o al revés, con tres respuestas falsas de otras palabras.
    router.get('/api/admin/aula/learning-dungeon', ...gestion, async (req, res) => {
        try {
            const nivel = Number.isInteger(Number(req.query.nivel)) ? Number(req.query.nivel) : 99;
            const tipo = req.query.tipo === 'imagen' ? 'image' : 'text';
            const sentido = ['significado', 'termino', 'mixto'].includes(req.query.sentido) ? req.query.sentido : 'significado';
            const cuantas = Math.min(Math.max(Number(req.query.n) || 10, 1), 50);
            const r = await pool.query(
                `SELECT v.term, v.meaning, v.image_url, v.belt_level FROM tul_vocabulary v JOIN tul_clubs c ON c.club_id = v.club_id
                 WHERE c.name ILIKE 'aim education%' AND COALESCE(v.content_type, 'text') = $1 AND COALESCE(v.belt_level, 0) <= $2
                   AND COALESCE(v.term, '') <> '' AND COALESCE(v.meaning, '') <> ''
                   -- Con imagen, solo las que se pueden enseñar (https): sin ella, la pregunta no tiene sentido.
                   AND ($1 <> 'image' OR v.image_url ~ '^https://')`, [tipo, nivel]);
            const todas = r.rows;
            const baraja = (l) => { const x = [...l]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
            const preguntas = [];
            for (const v of baraja(todas).slice(0, cuantas)) {
                const alReves = tipo === 'image' || sentido === 'termino' || (sentido === 'mixto' && Math.random() < 0.5);
                const buena = alReves ? v.term : v.meaning;
                const falsas = baraja([...new Set(todas.map(x => (alReves ? x.term : x.meaning)).filter(x => x && x !== buena))]).slice(0, 3);
                if (falsas.length < 1) continue;
                const opciones = baraja([buena, ...falsas]);
                preguntas.push({
                    enunciado: tipo === 'image' ? '¿Qué es lo que se ve en la imagen?' : alReves ? `¿Cómo se dice «${v.meaning}»?` : `¿Qué significa «${v.term}»?`,
                    opciones, correcta: opciones.indexOf(buena), explicacion: `${v.term}: ${v.meaning}`, imagen: tipo === 'image' && /^https:\/\//.test(v.image_url || '') ? v.image_url : null,
                });
            }
            res.json({ preguntas, disponibles: todas.length });
        } catch (err) { fallo(res, err); }
    });
    // El cuestionario para hacerlo. De práctica: con las respuestas buenas (se
    // corrige al momento). Evaluable: sin ellas, y con sus intentos.
    router.get('/api/aula/lecciones/:id/cuestionario', authenticateSession, async (req, res) => {
        try {
            const l = await leccion(idDe(req.params.id));
            if (l.tipo !== 'cuestionario') corta(400, 'Esa lección no es un cuestionario.');
            const { gestor } = await puedeVerLeccion(req, l);
            await exigirAbierta(req, l, gestor);
            const ps = await preguntasDe(l.id);
            const conSolucion = l.modo === 'practica' || gestor;
            const intentos = (await pool.query(
                `SELECT id, respuestas, aciertos, total, nota, created_at FROM aim_aula_intentos WHERE leccion_id = $1 AND user_id = $2 AND modo = $3 ORDER BY created_at`,
                [l.id, req.userSession.userId, l.modo])).rows;
            const usados = l.modo === 'evaluable' ? intentos.length : 0;
            // Al empezar un evaluable con tiempo: la marca de cuándo.
            const conTiempo = l.modo === 'evaluable' && l.tiempo_min && !gestor;
            res.set('Cache-Control', 'no-store');
            res.json({
                modo: l.modo, intentos: l.intentos, usados, gestor, notaMinima: l.nota_minima == null ? 5 : Number(l.nota_minima), tiempoMin: l.tiempo_min || null,
                empezado: conTiempo && req.query.empezar === '1' ? marcaTiempo(l.id, req.userSession.userId) : undefined,
                quedan: l.modo === 'evaluable' && l.intentos ? Math.max(0, l.intentos - usados) : null,
                mejor: intentos.length ? Math.max(...intentos.map(i => Number(i.nota))) : null,
                ultimo: l.modo === 'evaluable' && intentos.length ? (({ respuestas, ...i }) => ({ ...i, nota: Number(i.nota), detalle: respuestas }))(intentos[intentos.length - 1]) : null,
                preguntas: ps.map(p => (conSolucion ? p : { id: p.id, enunciado: p.enunciado, opciones: p.opciones, imagen: p.imagen })),
            });
        } catch (err) { fallo(res, err); }
    });
    // Entregar un intento: se corrige aquí (aunque la práctica ya se corrija en
    // pantalla) y la lección cuenta como hecha.
    router.post('/api/aula/lecciones/:id/intentos', authenticateSession, async (req, res) => {
        const client = await pool.connect();
        try {
            const l = await leccion(idDe(req.params.id));
            if (l.tipo !== 'cuestionario') corta(400, 'Esa lección no es un cuestionario.');
            const { gestor } = await puedeVerLeccion(req, l);
            await exigirAbierta(req, l, gestor);
            const me = req.userSession.userId;
            const ps = await preguntasDe(l.id);
            if (!ps.length) corta(400, 'Este cuestionario aún no tiene preguntas.');
            const res1 = corregir(ps, req.body?.respuestas);
            if (gestor) return res.json({ ...res1, guardado: false });
            if (l.modo === 'evaluable' && l.tiempo_min) {
                const seg = segundosDesde(req.body?.empezado, l.id, me);
                if (seg == null) corta(400, 'Empieza el cuestionario desde su botón «Empezar».');
                if (seg > l.tiempo_min * 60 + MARGEN_TIEMPO) corta(409, 'Se acabó el tiempo de este intento: no cuenta. Puedes volver a empezarlo.');
            }
            await client.query('BEGIN');
            // Uno detrás de otro: con dos pestañas no se cuela un intento de más.
            await client.query(`SELECT pg_advisory_xact_lock(439, $1)`, [l.id]);
            if (l.modo === 'evaluable' && l.intentos) {
                const usados = (await client.query(`SELECT COUNT(*)::int n FROM aim_aula_intentos WHERE leccion_id = $1 AND user_id = $2 AND modo = 'evaluable'`, [l.id, me])).rows[0].n;
                if (usados >= l.intentos) corta(409, 'Ya has usado todos los intentos de este cuestionario.');
            }
            await client.query(`INSERT INTO aim_aula_intentos (leccion_id, user_id, modo, respuestas, aciertos, total, nota) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)`,
                [l.id, me, l.modo, JSON.stringify(res1.detalle), res1.aciertos, res1.total, res1.nota]);
            // Terminado con la nota para aprobar (un 5 si no se ha puesto otra, #455); un
            // intento peor no quita lo ya aprobado.
            const minima = l.nota_minima == null ? 5 : Number(l.nota_minima);
            if (Number(res1.nota) >= minima) await client.query(`INSERT INTO aim_aula_progreso (user_id, leccion_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [me, l.id]);
            await client.query('COMMIT');
            res.json({ ...res1, guardado: true, notaMinima: minima, aprobado: Number(res1.nota) >= minima });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });
    // Los resultados de los cuestionarios de un curso, por alumno.
    router.get('/api/admin/aula/cursos/:id/resultados', ...gestion, async (req, res) => {
        try {
            const c = await editable(req, idDe(req.params.id));
            const r = await pool.query(
                `SELECT l.id AS leccion_id, l.titulo, l.modo, l.intentos AS max_intentos, i.user_id,
                        TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS alumno,
                        COUNT(*)::int AS intentos, MAX(i.nota) AS mejor, MAX(i.created_at) AS ultimo,
                        (ARRAY_AGG(i.nota ORDER BY i.created_at DESC))[1] AS ultima_nota
                 FROM aim_aula_intentos i JOIN aim_aula_lecciones l ON l.id = i.leccion_id JOIN users u ON u.user_id = i.user_id
                 WHERE l.curso_id = $1 AND i.modo = l.modo
                 GROUP BY l.id, l.titulo, l.modo, l.intentos, i.user_id, u.name, u.surname
                 ORDER BY l.titulo, alumno`, [c.id]);
            res.set('Cache-Control', 'no-store');
            res.json(r.rows.map(x => ({ ...x, mejor: Number(x.mejor), ultima_nota: Number(x.ultima_nota) })));
        } catch (err) { fallo(res, err); }
    });

    // ── Subir un vídeo o un archivo, por trozos ──
    router.post('/api/admin/aula/cursos/:id/archivos', ...gestion, async (req, res) => {
        try {
            const c = await editable(req, idDe(req.params.id));
            const nombre = txt(req.body?.nombre, 200) || 'archivo';
            const mime = String(req.body?.mime || '').toLowerCase().slice(0, 120);
            const bytes = Number(req.body?.bytes);
            if (!Number.isInteger(bytes) || bytes <= 0) corta(400, 'El archivo está vacío.');
            const video = MIME_VIDEO.includes(mime);
            if (!video && !MIME_ARCHIVO.includes(mime)) corta(400, 'Ese tipo de archivo no se puede subir (vídeos MP4, MOV o WebM; documentos PDF, Word, PowerPoint, Excel, imágenes o audio).');
            if (video && bytes > MAX_VIDEO) corta(400, 'El vídeo pasa de 100 MB. Súbelo a YouTube (oculto) o a Vimeo y pega el enlace.');
            if (!video && bytes > MAX_ARCHIVO) corta(400, 'El archivo pasa de 10 MB.');
            // Lo que se quedó a medias hace más de un día ya no va a terminar.
            await pool.query(`DELETE FROM aim_aula_archivos WHERE parte_de IS NULL AND NOT completo AND created_at < NOW() - INTERVAL '1 day'`);
            const usado = await espacioUsado();
            if (usado + bytes > TOPE_TOTAL) {
                corta(400, `No queda sitio en el aula (${Math.round(usado / 1048576)} de ${Math.round(TOPE_TOTAL / 1048576)} MB). Pon este vídeo por enlace de YouTube o Vimeo, o borra alguno que ya no se use.`);
            }
            const r = await pool.query(
                `INSERT INTO aim_aula_archivos (curso_id, nombre, mime, bytes, creado_por) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [c.id, nombre, mime, bytes, req.userSession.userId]);
            res.status(201).json({ success: true, id: r.rows[0].id, trozo: TROZO, trozos: Math.ceil(bytes / TROZO) });
        } catch (err) { fallo(res, err); }
    });
    async function archivoEditable(req) {
        const a = (await pool.query(`SELECT id, curso_id, bytes, completo FROM aim_aula_archivos WHERE id = $1 AND parte_de IS NULL`, [idDe(req.params.id)])).rows[0];
        if (!a) corta(404, 'Ese archivo ya no está.');
        await editable(req, a.curso_id);
        return a;
    }
    router.put('/api/admin/aula/archivos/:id/trozos/:n', ...gestion, crudo('3mb'), async (req, res) => {
        try {
            const a = await archivoEditable(req);
            if (a.completo) corta(409, 'Ese archivo ya está subido.');
            const n = Number(req.params.n), total = Math.ceil(Number(a.bytes) / TROZO);
            const datos = Buffer.isBuffer(req.body) ? req.body : null;
            if (!Number.isInteger(n) || n < 0 || n >= total) corta(400, 'Trozo fuera del archivo.');
            const esperado = n === total - 1 ? Number(a.bytes) - n * TROZO : TROZO;
            if (!datos || datos.length !== esperado) corta(400, 'El trozo no ha llegado entero. Vuelve a intentarlo.');
            await pool.query(
                `INSERT INTO aim_aula_archivos (parte_de, n, datos) VALUES ($1, $2, $3)
                 ON CONFLICT (parte_de, n) WHERE parte_de IS NOT NULL DO UPDATE SET datos = EXCLUDED.datos`, [a.id, n, datos]);
            if (n === total - 1 || req.query.fin === '1') {
                const k = (await pool.query(`SELECT COUNT(*)::int k FROM aim_aula_archivos WHERE parte_de = $1`, [a.id])).rows[0].k;
                if (k === total) await pool.query(`UPDATE aim_aula_archivos SET completo = TRUE WHERE id = $1`, [a.id]);
                return res.json({ success: true, completo: k === total });
            }
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/aula/archivos/:id', ...gestion, async (req, res) => {
        try {
            const a = await archivoEditable(req);
            await soltarArchivo(a.id);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Para que quien gestiona pueda ver lo subido sin estar apuntado.
    router.get('/api/admin/aula/archivos/:id', ...gestion, async (req, res) => {
        try {
            const a = await archivoMeta(idDe(req.params.id));
            await editable(req, a.curso_id);
            await servirArchivo(req, res, a);
        } catch (err) { if (!res.headersSent) fallo(res, err); else res.destroy(); }
    });

    // ── Alumnos ──
    router.get('/api/admin/aula/cursos/:id/alumnos', ...gestion, async (req, res) => {
        try {
            const c = await editable(req, idDe(req.params.id));
            const r = await pool.query(
                `SELECT i.id, i.user_id, i.estado, i.origen, i.created_at, i.activada_at, i.cargo_id, cg.estado AS cargo_estado, ${SQL_ACCESO('i', 'cg')} AS acceso,
                        TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS nombre, u.email, ${SQL_PROGRESO} AS hechas,
                        (SELECT MAX(pr.completada_at) FROM aim_aula_progreso pr JOIN aim_aula_lecciones l ON l.id = pr.leccion_id
                          WHERE l.curso_id = i.curso_id AND pr.user_id = i.user_id) AS ultima, i.ultimo_acceso,
                        (SELECT COUNT(*)::int FROM aim_aula_lecciones l WHERE l.curso_id = i.curso_id AND l.tipo = 'tarea' AND l.plazo_at < NOW()
                           AND NOT EXISTS (SELECT 1 FROM aim_aula_entregas e WHERE e.leccion_id = l.id AND e.user_id = i.user_id)) AS vencidas,
                        (SELECT ROUND(AVG(m), 2) FROM (SELECT MAX(it.nota) AS m FROM aim_aula_intentos it JOIN aim_aula_lecciones l ON l.id = it.leccion_id
                           WHERE l.curso_id = i.curso_id AND it.user_id = i.user_id AND it.modo = 'evaluable' GROUP BY it.leccion_id) z) AS media
                 FROM aim_aula_inscripciones i JOIN users u ON u.user_id = i.user_id LEFT JOIN aim_cargos cg ON cg.id = i.cargo_id
                 WHERE i.curso_id = $1 ORDER BY (i.estado = 'baja'), u.name, u.surname`, [c.id]);
            const lecciones = (await pool.query(`SELECT COUNT(*)::int n FROM aim_aula_lecciones WHERE curso_id = $1`, [c.id])).rows[0].n;
            res.set('Cache-Control', 'no-store');
            res.json({ lecciones, completa: completa(req), alumnos: r.rows.map(x => ({
                id: x.id, userId: x.user_id, nombre: x.nombre, email: completa(req) ? x.email : null, estado: x.estado === 'baja' ? 'baja' : x.acceso ? 'dentro' : 'por_pagar',
                origen: x.origen, desde: x.activada_at || x.created_at, cargoEstado: x.cargo_estado || null, ultima: x.ultima,
                progreso: lecciones ? Math.round(100 * x.hechas / lecciones) : 0,
                ultimoAcceso: x.ultimo_acceso, vencidas: x.vencidas, media: x.media == null ? null : Number(x.media),
                // Se queda atrás: con el curso a medias, una semana sin entrar o tareas vencidas sin entregar.
                atras: x.acceso && x.estado !== 'baja' && x.hechas < lecciones
                    && (x.vencidas > 0 || Date.now() - new Date(x.ultimo_acceso || x.activada_at || x.created_at).getTime() > 7 * 86400000),
            })) });
        } catch (err) { fallo(res, err); }
    });
    // Dar acceso a mano (ha pagado en el club, una beca…) o quitarlo. Solo con
    // el aula completa: es dinero.
    router.post('/api/admin/aula/cursos/:id/alumnos', ...gestion, async (req, res) => {
        try {
            if (!completa(req)) corta(403, 'Dar acceso a un curso lo hace secretaría o la dirección.');
            const c = await curso(idDe(req.params.id));
            const userId = String(req.body?.userId || '');
            const u = (await pool.query(`SELECT user_id FROM users WHERE user_id::text = $1`, [userId])).rows[0];
            if (!u) corta(404, 'Esa persona no existe.');
            await pool.query(
                `INSERT INTO aim_aula_inscripciones (curso_id, user_id, estado, origen, activada_at) VALUES ($1, $2, 'activa', 'secretaria', NOW())
                 ON CONFLICT (curso_id, user_id) DO UPDATE SET estado = 'activa', origen = 'secretaria', activada_at = NOW()`, [c.id, u.user_id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/aula/inscripciones/:id', ...gestion, async (req, res) => {
        try {
            if (!completa(req)) corta(403, 'Dar o quitar el acceso lo hace secretaría o la dirección.');
            const i = (await pool.query(`SELECT * FROM aim_aula_inscripciones WHERE id = $1`, [idDe(req.params.id)])).rows[0];
            if (!i) corta(404, 'Esa inscripción ya no está.');
            const estado = req.body?.estado === 'baja' ? 'baja' : 'activa';
            await pool.query(`UPDATE aim_aula_inscripciones SET estado = $2::varchar, origen = CASE WHEN $2::varchar = 'activa' AND estado <> 'activa' THEN 'secretaria' ELSE origen END,
                              activada_at = CASE WHEN $2::varchar = 'activa' THEN COALESCE(activada_at, NOW()) ELSE activada_at END WHERE id = $1`, [i.id, estado]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // Mandarle un recordatorio a mano (el mismo correo de «¿Seguimos con el curso?»):
    // como mucho uno al día por alumno y curso.
    router.post('/api/admin/aula/inscripciones/:id/recordatorio', ...gestion, async (req, res) => {
        try {
            const i = (await pool.query(`SELECT * FROM aim_aula_inscripciones WHERE id = $1`, [idDe(req.params.id)])).rows[0];
            if (!i) corta(404, 'Esa inscripción ya no está.');
            const c = await editable(req, i.curso_id);
            if (!avisar) corta(503, 'El correo no está configurado.');
            const x = (await pool.query(
                `SELECT TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS alumno,
                        (SELECT COUNT(*)::int FROM aim_aula_lecciones l WHERE l.curso_id = $2) AS lecciones,
                        (SELECT COUNT(*)::int FROM aim_aula_progreso pr JOIN aim_aula_lecciones l ON l.id = pr.leccion_id WHERE l.curso_id = $2 AND pr.user_id = u.user_id) AS hechas
                 FROM users u WHERE u.user_id = $1`, [i.user_id, c.id])).rows[0];
            if (x.hechas >= x.lecciones) corta(400, 'Ya ha terminado el curso.');
            const clave = `manual:${c.id}:${new Date().toISOString().slice(0, 10)}`;
            if (!(await marcarAvisoAula(pool, i.user_id, clave))) corta(409, 'Hoy ya se le ha mandado un recordatorio.');
            const desde = i.ultimo_acceso || i.activada_at || i.created_at;
            try {
                const ok = await avisar({ aviso: 'inactivo', user_id: i.user_id, alumno: x.alumno, curso_id: c.id, curso: c.titulo, nunca: !i.ultimo_acceso,
                    dias: Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 86400000)), quedan: x.lecciones - x.hechas });
                if (!ok) corta(400, 'No tiene correo (ni su familia, si es menor).');
            } catch (e) { await soltarAvisoAula(pool, i.user_id, clave).catch(() => {}); throw e; }
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Las preguntas que más se fallan a la primera (el primer intento de cada alumno).
    router.get('/api/admin/aula/cursos/:id/preguntas-dificiles', ...gestion, async (req, res) => {
        try {
            const c = await editable(req, idDe(req.params.id));
            const r = await pool.query(
                `SELECT DISTINCT ON (it.leccion_id, it.user_id) it.respuestas, l.titulo
                 FROM aim_aula_intentos it JOIN aim_aula_lecciones l ON l.id = it.leccion_id
                 WHERE l.curso_id = $1 ORDER BY it.leccion_id, it.user_id, it.created_at`, [c.id]);
            const cuenta = new Map();
            for (const x of r.rows) {
                for (const p of Array.isArray(x.respuestas) ? x.respuestas : []) {
                    const k = `${x.titulo}\u0000${p.enunciado}`;
                    const v = cuenta.get(k) || { leccion: x.titulo, enunciado: p.enunciado, veces: 0, fallos: 0 };
                    v.veces++; if (!p.bien) v.fallos++;
                    cuenta.set(k, v);
                }
            }
            res.set('Cache-Control', 'no-store');
            res.json([...cuenta.values()].filter(v => v.veces >= 2 && v.fallos > 0)
                .map(v => ({ ...v, pct: Math.round(100 * v.fallos / v.veces) })).sort((a, b) => b.pct - a.pct || b.fallos - a.fallos).slice(0, 8));
        } catch (err) { fallo(res, err); }
    });

    // ── Las valoraciones de un curso (#463): las medias, si lo recomendarían y
    // qué mejorarían. Secretaría y la dirección, con el nombre de cada alumno;
    // el profesor, las de su curso sin nombres (y los comentarios, barajados).
    router.get('/api/admin/aula/cursos/:id/valoraciones', ...gestion, async (req, res) => {
        try {
            const c = await editable(req, idDe(req.params.id));
            const conNombre = completa(req);
            const r = await pool.query(
                `SELECT v.*, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS alumno
                 FROM aim_aula_valoraciones v LEFT JOIN users u ON u.user_id = v.user_id
                 WHERE v.curso_id = $1 ORDER BY v.created_at DESC`, [c.id]);
            const v = r.rows;
            const media = (k) => (v.length ? Math.round(10 * v.reduce((s, x) => s + x[k], 0) / v.length) / 10 : null);
            const reparto = (k) => [1, 2, 3, 4, 5].map(n => v.filter(x => x[k] === n).length);
            const comentarios = v.filter(x => x.mejoras).map(x => (conNombre ? { texto: x.mejoras, alumno: x.alumno, fecha: x.created_at } : { texto: x.mejoras }));
            if (!conNombre) comentarios.sort((a, b) => a.texto.localeCompare(b.texto));
            res.set('Cache-Control', 'no-store');
            res.json({
                total: v.length, conNombre,
                notas: Object.fromEntries(NOTAS_VALORACION.map(k => [k, { media: media(k), reparto: reparto(k) }])),
                recomendaria: Object.fromEntries(RECOMIENDA.map(k => [k, v.filter(x => x.recomendaria === k).length])),
                comentarios,
                respuestas: conNombre ? v.map(x => ({ alumno: x.alumno, fecha: x.created_at, recomendaria: x.recomendaria, mejoras: x.mejoras,
                    ...Object.fromEntries(NOTAS_VALORACION.map(k => [k, x[k]])) })) : undefined,
            });
        } catch (err) { fallo(res, err); }
    });

    // ── Dudas de todos sus cursos (o de todos, con el aula completa) ──
    router.get('/api/admin/aula/dudas', ...gestion, async (req, res) => {
        try {
            const vals = [];
            let filtro = 'TRUE';
            if (req.query.curso) { const c = await editable(req, idDe(req.query.curso)); vals.push(c.id); filtro = `d.curso_id = $${vals.length}`; }
            else if (!completa(req)) { vals.push(req.userSession.userId); filtro = `cu.profesor_id = $${vals.length}`; }
            if (req.query.pendientes === '1') filtro += ` AND ${SQL_DUDA_PENDIENTE}`;
            const r = await pool.query(`${SQL_DUDAS} ${filtro} ORDER BY (${SQL_DUDA_PENDIENTE}) DESC, ul.created_at DESC LIMIT 300`, vals);
            res.set('Cache-Control', 'no-store');
            res.json(r.rows.map(d => resumenDuda(d, { gestor: true, yo: req.userSession.userId })));
        } catch (err) { fallo(res, err); }
    });

    // ── Corregir ──
    router.get('/api/admin/aula/entregas', ...gestion, async (req, res) => {
        try {
            const vals = [];
            let filtro = 'TRUE';
            if (req.query.curso) { const c = await editable(req, idDe(req.query.curso)); vals.push(c.id); filtro = `l.curso_id = $${vals.length}`; }
            else if (!completa(req)) { vals.push(req.userSession.userId); filtro = `cu.profesor_id = $${vals.length}`; }
            if (req.query.pendientes === '1') filtro += ' AND e.corregida_at IS NULL';
            const r = await pool.query(
                `SELECT e.id, e.texto, e.archivo_nombre, (e.archivo IS NOT NULL) AS con_archivo, e.entregada_at, e.nota, e.apto, e.comentario, e.corregida_at,
                        l.id AS leccion_id, l.titulo AS leccion, l.calificacion, l.plazo_at, (l.plazo_at IS NOT NULL AND e.entregada_at > l.plazo_at) AS fuera_de_plazo, cu.id AS curso_id, cu.titulo AS curso,
                        TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS alumno
                 FROM aim_aula_entregas e JOIN aim_aula_lecciones l ON l.id = e.leccion_id JOIN aim_aula_cursos cu ON cu.id = l.curso_id
                 JOIN users u ON u.user_id = e.user_id
                 WHERE ${filtro} ORDER BY (e.corregida_at IS NULL) DESC, e.entregada_at DESC LIMIT 300`, vals);
            res.set('Cache-Control', 'no-store');
            res.json(r.rows.map(({ con_archivo, ...e }) => ({ ...e, archivo: con_archivo ? `/api/aula/entregas/${e.id}/archivo` : null })));
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/aula/entregas/:id', ...gestion, async (req, res) => {
        try {
            const e = (await pool.query(
                `SELECT e.id, e.user_id, e.leccion_id, l.curso_id, l.calificacion FROM aim_aula_entregas e JOIN aim_aula_lecciones l ON l.id = e.leccion_id WHERE e.id = $1`, [idDe(req.params.id)])).rows[0];
            if (!e) corta(404, 'Esa entrega ya no está.');
            await editable(req, e.curso_id);
            let nota = null, apto = null;
            if (e.calificacion === 'nota') {
                nota = Number(String(req.body?.nota ?? '').replace(',', '.'));
                if (req.body?.nota === '' || req.body?.nota == null || !Number.isFinite(nota) || nota < 0 || nota > 10) corta(400, 'La nota va de 0 a 10.');
                nota = Math.round(nota * 100) / 100;
                apto = nota >= 5;
            } else {
                if (typeof req.body?.apto !== 'boolean') corta(400, 'Elige apto o no apto.');
                apto = req.body.apto;
            }
            await pool.query(`UPDATE aim_aula_entregas SET nota = $2, apto = $3, comentario = $4, corregida_por = $5, corregida_at = NOW() WHERE id = $1`,
                [e.id, nota, apto, txt(req.body?.comentario, 5000), req.userSession.userId]);
            // La tarea está terminada si se aprueba (#455).
            if (apto) await pool.query(`INSERT INTO aim_aula_progreso (user_id, leccion_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [e.user_id, e.leccion_id]);
            else await pool.query(`DELETE FROM aim_aula_progreso WHERE user_id = $1 AND leccion_id = $2`, [e.user_id, e.leccion_id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    return { router };
}

// Las dudas (#461) con su último mensaje: por contestar si es del alumno (o de
// un compañero) y no está resuelta. Se completa con el WHERE.
const SQL_ULTIMO = `LEFT JOIN LATERAL (SELECT m.created_at, m.es_profesor, m.user_id FROM aim_aula_dudas m
    WHERE m.id = d.id OR m.duda_id = d.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) ul ON true`;
const SQL_DUDA_PENDIENTE = `(d.estado = 'abierta' AND NOT COALESCE((SELECT m.es_profesor FROM aim_aula_dudas m
    WHERE m.id = d.id OR m.duda_id = d.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1), false))`;
const SQL_DUDAS = `
    SELECT d.id, d.curso_id, d.titulo, d.leccion_id, d.publica, d.estado, d.user_id, d.created_at, cu.titulo AS curso, l.titulo AS leccion,
           u.name, u.surname, (SELECT COUNT(*)::int FROM aim_aula_dudas m WHERE m.duda_id = d.id) AS respuestas,
           ul.created_at AS ultima, ul.es_profesor AS ultima_profesor
    FROM aim_aula_dudas d JOIN aim_aula_cursos cu ON cu.id = d.curso_id
    LEFT JOIN aim_aula_lecciones l ON l.id = d.leccion_id LEFT JOIN users u ON u.user_id = d.user_id
    ${SQL_ULTIMO}
    WHERE d.duda_id IS NULL AND`;

// ── Para la campanita ──
// Del personal: las entregas sin corregir de los cursos que lleva (o de todos).
export async function entregasPorCorregir(pool, { userId, todos }) {
    return (await pool.query(
        `SELECT COUNT(*)::int n, MAX(e.entregada_at) AS ultima FROM aim_aula_entregas e
         JOIN aim_aula_lecciones l ON l.id = e.leccion_id JOIN aim_aula_cursos cu ON cu.id = l.curso_id
         WHERE e.corregida_at IS NULL ${todos ? '' : 'AND cu.profesor_id = $1'}`, todos ? [] : [userId])).rows[0];
}
// Del personal: las dudas por contestar del profesor del curso; con el aula
// completa, también las de los cursos sin profesor.
export async function dudasPorResponder(pool, { userId, todos }) {
    return (await pool.query(
        `SELECT COUNT(*)::int n, MAX(ul.created_at) AS ultima FROM aim_aula_dudas d JOIN aim_aula_cursos cu ON cu.id = d.curso_id ${SQL_ULTIMO}
         WHERE d.duda_id IS NULL AND d.estado = 'abierta' AND NOT ul.es_profesor
           AND (cu.profesor_id = $1 ${todos ? 'OR cu.profesor_id IS NULL' : ''})`, [userId])).rows[0];
}
// De quien pregunta: sus dudas con respuesta nueva (de otro) en las dos últimas semanas.
export async function dudasContestadas(pool, userId) {
    return (await pool.query(
        `SELECT d.id, d.titulo, d.curso_id, cu.titulo AS curso, d.leccion_id, ul.created_at AS ultima, ul.es_profesor
         FROM aim_aula_dudas d JOIN aim_aula_cursos cu ON cu.id = d.curso_id ${SQL_ULTIMO}
         WHERE d.duda_id IS NULL AND d.user_id = $1 AND ul.user_id IS DISTINCT FROM $1 AND ul.created_at > NOW() - INTERVAL '14 days'
         ORDER BY ul.created_at DESC LIMIT 5`, [userId])).rows;
}
// De quien hace el curso: sus tareas corregidas en las dos últimas semanas.
export async function tareasCorregidas(pool, userId) {
    return (await pool.query(
        `SELECT e.id, e.nota, e.apto, e.corregida_at, l.id AS leccion_id, l.titulo, cu.id AS curso_id, cu.titulo AS curso
         FROM aim_aula_entregas e JOIN aim_aula_lecciones l ON l.id = e.leccion_id JOIN aim_aula_cursos cu ON cu.id = l.curso_id
         WHERE e.user_id = $1 AND e.corregida_at > NOW() - INTERVAL '14 days' ORDER BY e.corregida_at DESC LIMIT 5`, [userId])).rows;
}

// ── Avisos del aula: lecciones que se abren, plazos de las tareas, clases en
// directo y quien deja el curso a medias ──
// Para la campanita: lo de estas personas (el alumno y, a sus padres, lo de sus
// hijos). Lecciones abiertas esta semana, tareas que vencen en dos días y clases
// en directo en las próximas 24 horas (o ahora mismo), sin hacer.
export async function avisosAulaDe(pool, userIds) {
    if (!userIds?.length) return [];
    return (await pool.query(
        `SELECT l.id, l.tipo, l.titulo, l.abre_at, l.plazo_at, l.directo_at, l.directo_min, cu.id AS curso_id, cu.titulo AS curso, i.user_id, u.name AS nombre
         FROM aim_aula_inscripciones i JOIN aim_aula_cursos cu ON cu.id = i.curso_id LEFT JOIN aim_cargos c ON c.id = i.cargo_id
         JOIN aim_aula_lecciones l ON l.curso_id = i.curso_id JOIN users u ON u.user_id = i.user_id
         WHERE i.user_id = ANY($1::uuid[]) AND i.estado <> 'baja' AND ${SQL_ACCESO()}
           AND NOT EXISTS (SELECT 1 FROM aim_aula_progreso pr WHERE pr.user_id = i.user_id AND pr.leccion_id = l.id)
           AND ((l.abre_at <= NOW() AND l.abre_at > NOW() - INTERVAL '7 days')
             OR (l.tipo = 'tarea' AND l.plazo_at > NOW() AND l.plazo_at < NOW() + INTERVAL '48 hours'
                 AND NOT EXISTS (SELECT 1 FROM aim_aula_entregas e WHERE e.leccion_id = l.id AND e.user_id = i.user_id))
             OR (l.tipo = 'directo' AND l.directo_at + make_interval(mins => COALESCE(l.directo_min, 60)) > NOW() AND l.directo_at < NOW() + INTERVAL '24 hours'))
         ORDER BY COALESCE(l.directo_at, l.plazo_at, l.abre_at)`, [userIds])).rows;
}
// Para el correo: lo que toca avisar ahora y aún no se ha avisado (aim_aula_avisos).
//  · abre: una lección que se ha abierto en los dos últimos días (después de apuntarse).
//  · plazo: una tarea sin entregar que vence en menos de 26 horas.
//  · directo1d / directo1h: una clase en directo dentro de 2 a 26 horas / de una hora.
//  · inactivo: lleva `diasSinEntrar` días sin entrar y le queda curso (una vez por racha).
// cursoId: solo los de ese curso.
export async function avisosAulaPendientes(pool, { diasSinEntrar = 10, cursoId = null } = {}) {
    const deCurso = cursoId ? 'AND i.curso_id = $2' : '';
    const vals = cursoId ? [diasSinEntrar, cursoId] : [diasSinEntrar];
    const lecciones = (await pool.query(
        `SELECT * FROM (
           SELECT i.user_id, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS alumno, cu.id AS curso_id, cu.titulo AS curso, cu.meet_url,
                  l.id AS leccion_id, l.tipo, l.titulo, l.plazo_at, l.directo_at, l.directo_min, l.enlace,
                  CASE
                    WHEN l.abre_at <= NOW() AND l.abre_at > NOW() - INTERVAL '2 days' AND l.abre_at > COALESCE(i.activada_at, i.created_at) THEN 'abre'
                    WHEN l.tipo = 'tarea' AND l.plazo_at > NOW() AND l.plazo_at < NOW() + INTERVAL '26 hours'
                         AND NOT EXISTS (SELECT 1 FROM aim_aula_entregas e WHERE e.leccion_id = l.id AND e.user_id = i.user_id) THEN 'plazo'
                    WHEN l.tipo = 'directo' AND l.directo_at > NOW() AND l.directo_at <= NOW() + INTERVAL '75 minutes' THEN 'directo1h'
                    WHEN l.tipo = 'directo' AND l.directo_at > NOW() + INTERVAL '2 hours' AND l.directo_at <= NOW() + INTERVAL '26 hours' THEN 'directo1d'
                  END AS aviso
           FROM aim_aula_inscripciones i JOIN aim_aula_cursos cu ON cu.id = i.curso_id LEFT JOIN aim_cargos c ON c.id = i.cargo_id
           JOIN users u ON u.user_id = i.user_id JOIN aim_aula_lecciones l ON l.curso_id = i.curso_id
           WHERE i.estado <> 'baja' AND ${SQL_ACCESO()} AND $1::int > 0 ${deCurso}
             AND NOT EXISTS (SELECT 1 FROM aim_aula_progreso pr WHERE pr.user_id = i.user_id AND pr.leccion_id = l.id)
         ) x
         WHERE aviso IS NOT NULL AND NOT EXISTS (SELECT 1 FROM aim_aula_avisos a WHERE a.user_id = x.user_id AND a.clave = x.aviso || ':' || x.leccion_id)`, vals)).rows;
    const inactivos = (await pool.query(
        `SELECT * FROM (
           SELECT i.user_id, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS alumno, cu.id AS curso_id, cu.titulo AS curso,
                  COALESCE(i.ultimo_acceso, i.activada_at, i.created_at) AS desde, (i.ultimo_acceso IS NULL) AS nunca,
                  (SELECT COUNT(*)::int FROM aim_aula_lecciones l WHERE l.curso_id = i.curso_id) AS lecciones,
                  (SELECT COUNT(*)::int FROM aim_aula_progreso pr JOIN aim_aula_lecciones l ON l.id = pr.leccion_id WHERE l.curso_id = i.curso_id AND pr.user_id = i.user_id) AS hechas
           FROM aim_aula_inscripciones i JOIN aim_aula_cursos cu ON cu.id = i.curso_id LEFT JOIN aim_cargos c ON c.id = i.cargo_id
           JOIN users u ON u.user_id = i.user_id
           WHERE i.estado <> 'baja' AND ${SQL_ACCESO()} ${deCurso}
         ) x
         WHERE desde < NOW() - make_interval(days => $1::int) AND hechas < lecciones
           AND NOT EXISTS (SELECT 1 FROM aim_aula_avisos a WHERE a.user_id = x.user_id AND a.clave = 'inactivo:' || x.curso_id || ':' || to_char(x.desde, 'YYYY-MM-DD'))`, vals)).rows;
    return [
        ...lecciones.map(x => ({ ...x, clave: `${x.aviso}:${x.leccion_id}` })),
        ...inactivos.map(x => ({ ...x, aviso: 'inactivo', clave: `inactivo:${x.curso_id}:${new Date(x.desde).toISOString().slice(0, 10)}`,
            dias: Math.floor((Date.now() - new Date(x.desde).getTime()) / 86400000), quedan: x.lecciones - x.hechas })),
    ];
}
// Apuntarlo como avisado antes de mandarlo (dos procesos no lo mandan dos veces);
// si no se ha podido mandar, se suelta para el próximo intento.
export async function marcarAvisoAula(pool, userId, clave) {
    return (await pool.query(`INSERT INTO aim_aula_avisos (user_id, clave) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1`, [userId, String(clave).slice(0, 80)])).rowCount > 0;
}
export async function soltarAvisoAula(pool, userId, clave) {
    await pool.query(`DELETE FROM aim_aula_avisos WHERE user_id = $1 AND clave = $2`, [userId, String(clave).slice(0, 80)]);
}
