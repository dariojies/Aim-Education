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

export const TROZO = 2 * 1024 * 1024;
export const MAX_VIDEO = 100 * 1024 * 1024;
export const MAX_ARCHIVO = 10 * 1024 * 1024;
export const TOPE_TOTAL = 400 * 1024 * 1024;
export const ACTIVIDAD_AULA = 'Aula virtual';
const MAX_PORTADA = 2 * 1024 * 1024;
const TIPOS = ['texto', 'video', 'archivo', 'tarea'];
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
            tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('texto','video','archivo','tarea')),
            titulo VARCHAR(200) NOT NULL,
            texto TEXT,
            video_url TEXT,
            archivo_id INTEGER REFERENCES aim_aula_archivos(id) ON DELETE SET NULL,
            -- Tareas: 'nota' (de 0 a 10) o 'apto' (apto / no apto).
            calificacion VARCHAR(5) NOT NULL DEFAULT 'apto' CHECK (calificacion IN ('nota','apto')),
            orden INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
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
const fallo = (res, err) => {
    if (!err.status) console.error('[aula]', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'No se ha podido hacer. Inténtalo otra vez.' });
};
const idDe = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) corta(404, 'No existe.'); return n; };
const txt = (v, max) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const r2 = (n) => Math.round(Number(n) * 100) / 100;

// Con acceso: activa, o pendiente de pago con su cargo ya cobrado (o exento).
const SQL_ACCESO = (i = 'i', c = 'c') => `(${i}.estado = 'activa' OR (${i}.estado = 'pendiente_pago' AND ${c}.estado IN ('cobrado','exento')))`;

export function crearAula({ pool, authenticateSession, requireSeccion, permisos, sesionOpcional, pagosOnlineAbiertos }) {
    const router = express.Router();
    const gestion = [authenticateSession, requireSeccion('aula')];
    const crudo = (limit) => express.raw({ type: () => true, limit });

    // ── Quién puede qué ──
    const completa = (req) => !!permisos(req).aulaCompleta;
    const esGestor = (req) => !!req.userSession?.canAccessAdmin && !!permisos(req).secciones?.aula;
    async function curso(id) {
        const c = (await pool.query(
            `SELECT c.id, c.titulo, c.resumen, c.descripcion, c.profesor_id, c.publicado, c.concepto, c.updated_at,
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
    async function leccion(id) {
        const l = (await pool.query(`SELECT * FROM aim_aula_lecciones WHERE id = $1`, [id])).rows[0];
        if (!l) corta(404, 'Esa lección ya no existe.');
        return l;
    }
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
            const lecs = (await pool.query(`SELECT id, tema_id, tipo, titulo FROM aim_aula_lecciones WHERE curso_id = $1 ORDER BY orden, id`, [id])).rows;
            let mio = null;
            if (s?.userId) {
                const ins = await inscripcion(id, s.userId);
                if (ins && ins.estado !== 'baja') {
                    const pagable = ins.cargo_id && ins.cargo_estado === 'pendiente';
                    mio = { acceso: ins.acceso, pendientePago: !ins.acceso && ins.estado === 'pendiente_pago', cargoId: pagable ? ins.cargo_id : null };
                }
            }
            res.set('Cache-Control', 'no-store');
            res.json({
                id: c.id, titulo: c.titulo, resumen: c.resumen, descripcion: c.descripcion, profesor: c.profesor || null, publicado: c.publicado,
                portada: c.con_portada ? `/api/aula/cursos/${c.id}/portada?v=${new Date(c.updated_at).getTime()}` : null,
                precio: totalDe(c), gratis: !totalDe(c), conIva: Number(c.iva_pct) > 0,
                temas: temas.map(t => ({ ...t, lecciones: lecs.filter(l => l.tema_id === t.id).map(({ id: lid, tipo, titulo }) => ({ id: lid, tipo, titulo })) })),
                sesion: !!s?.userId, mio, gestor: !!gestor, pagoOnline: pagosOnlineAbiertos(),
            });
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
                        (SELECT COUNT(*)::int FROM aim_aula_lecciones l WHERE l.curso_id = cu.id) AS lecciones, ${SQL_PROGRESO} AS hechas
                 FROM aim_aula_inscripciones i JOIN aim_aula_cursos cu ON cu.id = i.curso_id
                 LEFT JOIN aim_cargos c ON c.id = i.cargo_id
                 WHERE i.user_id = $1 AND i.estado <> 'baja' ORDER BY i.created_at DESC`, [req.userSession.userId]);
            const hay = (await pool.query(`SELECT COUNT(*)::int n FROM aim_aula_cursos WHERE publicado`)).rows[0].n;
            res.set('Cache-Control', 'no-store');
            res.json({ cursosPublicados: hay, pagoOnline: pagosOnlineAbiertos(), cursos: r.rows.map(x => ({
                id: x.id, titulo: x.titulo, resumen: x.resumen, acceso: x.acceso, pendientePago: !x.acceso && x.estado === 'pendiente_pago', cargoId: x.cargo_id,
                portada: x.con_portada ? `/api/aula/cursos/${x.id}/portada?v=${new Date(x.updated_at).getTime()}` : null,
                lecciones: x.lecciones, hechas: x.hechas, progreso: x.lecciones ? Math.round(100 * x.hechas / x.lecciones) : 0,
            })) });
        } catch (err) { fallo(res, err); }
    });

    // El curso por dentro: todo el temario con su contenido, lo hecho y sus entregas.
    router.get('/api/aula/cursos/:id/contenido', authenticateSession, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            const { c, gestor } = await puedeVer(req, id);
            const me = req.userSession.userId;
            const temas = (await pool.query(`SELECT id, titulo FROM aim_aula_temas WHERE curso_id = $1 ORDER BY orden, id`, [id])).rows;
            const lecs = (await pool.query(
                `SELECT l.id, l.tema_id, l.tipo, l.titulo, l.texto, l.video_url, l.calificacion, l.archivo_id,
                        a.nombre AS archivo_nombre, a.mime AS archivo_mime, a.bytes AS archivo_bytes
                 FROM aim_aula_lecciones l LEFT JOIN aim_aula_archivos a ON a.id = l.archivo_id AND a.completo
                 WHERE l.curso_id = $1 ORDER BY l.orden, l.id`, [id])).rows;
            const hechas = new Set((await pool.query(
                `SELECT pr.leccion_id FROM aim_aula_progreso pr JOIN aim_aula_lecciones l ON l.id = pr.leccion_id WHERE l.curso_id = $1 AND pr.user_id = $2`, [id, me])).rows.map(x => x.leccion_id));
            const entregas = new Map((await pool.query(
                `SELECT e.leccion_id, e.id, e.texto, e.archivo_nombre, (e.archivo IS NOT NULL) AS con_archivo, e.entregada_at, e.nota, e.apto, e.comentario, e.corregida_at
                 FROM aim_aula_entregas e JOIN aim_aula_lecciones l ON l.id = e.leccion_id WHERE l.curso_id = $1 AND e.user_id = $2`, [id, me])).rows.map(e => [e.leccion_id, e]));
            res.set('Cache-Control', 'no-store');
            res.json({
                id: c.id, titulo: c.titulo, profesor: c.profesor || null, gestor,
                temas: temas.map(t => ({ ...t, lecciones: lecs.filter(l => l.tema_id === t.id).map(l => ({
                    id: l.id, tipo: l.tipo, titulo: l.titulo, texto: l.texto, calificacion: l.tipo === 'tarea' ? l.calificacion : undefined,
                    video: l.tipo === 'video' ? (l.video_url ? { embed: incrustar(l.video_url), url: l.video_url } : l.archivo_nombre ? { src: `/api/aula/archivos/${l.archivo_id}`, mime: l.archivo_mime } : null) : undefined,
                    archivo: l.archivo_nombre && l.tipo !== 'video' ? { url: `/api/aula/archivos/${l.archivo_id}`, nombre: l.archivo_nombre, mime: l.archivo_mime, bytes: Number(l.archivo_bytes) } : null,
                    hecha: hechas.has(l.id),
                    entrega: l.tipo === 'tarea' && entregas.get(l.id) ? (({ leccion_id, con_archivo, ...e }) => ({ ...e, archivo: con_archivo ? `/api/aula/entregas/${e.id}/archivo` : null }))(entregas.get(l.id)) : null,
                })) })),
            });
        } catch (err) { fallo(res, err); }
    });

    router.post('/api/aula/lecciones/:id/hecha', authenticateSession, async (req, res) => {
        try {
            const l = await leccion(idDe(req.params.id));
            await puedeVer(req, l.curso_id);
            if (req.body?.hecha === false) await pool.query(`DELETE FROM aim_aula_progreso WHERE user_id = $1 AND leccion_id = $2`, [req.userSession.userId, l.id]);
            else await pool.query(`INSERT INTO aim_aula_progreso (user_id, leccion_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.userSession.userId, l.id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // Lo subido (vídeo o archivo de una lección): solo para quien puede ver el curso.
    const verArchivo = async (req, res) => {
        try {
            const a = await archivoMeta(idDe(req.params.id));
            await puedeVer(req, a.curso_id);
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
            await pool.query(`INSERT INTO aim_aula_progreso (user_id, leccion_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.userSession.userId, l.id]);
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
            await pool.query(`INSERT INTO aim_aula_progreso (user_id, leccion_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.userSession.userId, l.id]);
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
                          WHERE l.curso_id = c.id AND e.corregida_at IS NULL) AS por_corregir
                 FROM aim_aula_cursos c LEFT JOIN aim_precios p ON p.concepto = c.concepto LEFT JOIN users u ON u.user_id = c.profesor_id
                 ${todos ? '' : 'WHERE c.profesor_id = $1'} ORDER BY c.orden, c.created_at DESC`, todos ? [] : [req.userSession.userId]);
            res.set('Cache-Control', 'no-store');
            res.json({
                completa: todos, espacio: { usado: await espacioUsado(), tope: TOPE_TOTAL, maxVideo: MAX_VIDEO, maxArchivo: MAX_ARCHIVO },
                cursos: r.rows.map(c => ({ id: c.id, titulo: c.titulo, publicado: c.publicado, profesor: c.profesor || null, lecciones: c.lecciones,
                    alumnos: c.alumnos, porPagar: c.por_pagar, porCorregir: c.por_corregir, precio: totalDe(c), gratis: !totalDe(c),
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
                        (SELECT COUNT(*)::int FROM aim_aula_entregas e WHERE e.leccion_id = l.id AND e.corregida_at IS NULL) AS por_corregir
                 FROM aim_aula_lecciones l LEFT JOIN aim_aula_archivos a ON a.id = l.archivo_id AND a.completo
                 WHERE l.curso_id = $1 ORDER BY l.orden, l.id`, [c.id])).rows;
            res.set('Cache-Control', 'no-store');
            res.json({
                id: c.id, titulo: c.titulo, resumen: c.resumen, descripcion: c.descripcion, publicado: c.publicado, profesorId: c.profesor_id, profesor: c.profesor || null,
                precio: c.concepto && c.precio_activo !== false ? Number(c.precio) : 0, ivaPct: c.concepto ? Number(c.iva_pct) : 21, total: totalDe(c), concepto: c.concepto,
                portada: c.con_portada ? `/api/aula/cursos/${c.id}/portada?v=${new Date(c.updated_at).getTime()}` : null, completa: completa(req),
                temas: temas.map(t => ({ ...t, lecciones: lecs.filter(l => l.tema_id === t.id).map(l => ({
                    id: l.id, tipo: l.tipo, titulo: l.titulo, texto: l.texto, videoUrl: l.video_url, calificacion: l.calificacion, porCorregir: l.por_corregir,
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
                `INSERT INTO aim_precios (concepto, descripcion, precio, tipo, iva_pct, activo) VALUES ($1, $2, $3, 'Otros', $4, true)
                 ON CONFLICT (concepto) DO UPDATE SET descripcion = EXCLUDED.descripcion, precio = EXCLUDED.precio, iva_pct = EXCLUDED.iva_pct,
                     activo = true, updated_at = NOW()`, [concepto, `Curso online: ${titulo}`.slice(0, 255), precio, ivaPct]);
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
        const iva = Number(body?.ivaPct ?? 21);
        if (![0, 4, 10, 21].includes(iva)) corta(400, 'El IVA tiene que ser 0, 4, 10 o 21 %.');
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
        const d = { tipo, titulo, texto: txt(body?.texto, 50000), video_url: null, archivo_id: null, calificacion: body?.calificacion === 'nota' ? 'nota' : 'apto' };
        if (tipo === 'video' && body?.videoUrl) {
            if (!incrustar(body.videoUrl)) corta(400, 'El enlace tiene que ser de un vídeo de YouTube o de Vimeo.');
            d.video_url = String(body.videoUrl).trim().slice(0, 500);
        }
        if (body?.archivoId) {
            const a = (await pool.query(`SELECT id, mime FROM aim_aula_archivos WHERE id = $1 AND curso_id = $2 AND parte_de IS NULL AND completo`, [Number(body.archivoId), cursoId])).rows[0];
            if (!a) corta(400, 'El archivo no ha terminado de subirse.');
            if (tipo === 'video' && !MIME_VIDEO.includes(a.mime)) corta(400, 'Ese archivo no es un vídeo.');
            d.archivo_id = a.id;
        }
        if (tipo === 'video' && !d.video_url && !d.archivo_id) corta(400, 'Pega el enlace del vídeo o súbelo.');
        if (tipo === 'archivo' && !d.archivo_id) corta(400, 'Sube el archivo de la lección.');
        if (tipo === 'video' && d.video_url) d.archivo_id = null;
        return d;
    }
    router.post('/api/admin/aula/temas/:id/lecciones', ...gestion, async (req, res) => {
        try {
            const t = await temaEditable(req);
            const d = await datosLeccion(req.body, t.curso_id);
            const r = await pool.query(
                `INSERT INTO aim_aula_lecciones (curso_id, tema_id, tipo, titulo, texto, video_url, archivo_id, calificacion, orden)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT COALESCE(MAX(orden), 0) + 1 FROM aim_aula_lecciones WHERE tema_id = $2)) RETURNING id`,
                [t.curso_id, t.id, d.tipo, d.titulo, d.texto, d.video_url, d.archivo_id, d.calificacion]);
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
            await pool.query(`UPDATE aim_aula_lecciones SET titulo = $2, texto = $3, video_url = $4, archivo_id = $5, calificacion = $6 WHERE id = $1`,
                [l.id, d.titulo, d.texto, d.video_url, d.archivo_id, d.calificacion]);
            if (l.archivo_id && l.archivo_id !== d.archivo_id) await soltarArchivo(l.archivo_id);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/aula/lecciones/:id', ...gestion, async (req, res) => {
        try {
            const l = await leccionEditable(req);
            const n = (await pool.query(`SELECT COUNT(*)::int n FROM aim_aula_entregas WHERE leccion_id = $1`, [l.id])).rows[0].n;
            if (n && req.query.confirmar !== '1') corta(409, `Esta tarea tiene ${n} ${n === 1 ? 'entrega' : 'entregas'}: si la borras, se pierden.`);
            await pool.query(`DELETE FROM aim_aula_lecciones WHERE id = $1`, [l.id]);
            await soltarArchivo(l.archivo_id);
            res.json({ success: true });
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
                          WHERE l.curso_id = i.curso_id AND pr.user_id = i.user_id) AS ultima
                 FROM aim_aula_inscripciones i JOIN users u ON u.user_id = i.user_id LEFT JOIN aim_cargos cg ON cg.id = i.cargo_id
                 WHERE i.curso_id = $1 ORDER BY (i.estado = 'baja'), u.name, u.surname`, [c.id]);
            const lecciones = (await pool.query(`SELECT COUNT(*)::int n FROM aim_aula_lecciones WHERE curso_id = $1`, [c.id])).rows[0].n;
            res.set('Cache-Control', 'no-store');
            res.json({ lecciones, completa: completa(req), alumnos: r.rows.map(x => ({
                id: x.id, userId: x.user_id, nombre: x.nombre, email: completa(req) ? x.email : null, estado: x.estado === 'baja' ? 'baja' : x.acceso ? 'dentro' : 'por_pagar',
                origen: x.origen, desde: x.activada_at || x.created_at, cargoEstado: x.cargo_estado || null, ultima: x.ultima,
                progreso: lecciones ? Math.round(100 * x.hechas / lecciones) : 0,
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
                        l.id AS leccion_id, l.titulo AS leccion, l.calificacion, cu.id AS curso_id, cu.titulo AS curso,
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
                `SELECT e.id, l.curso_id, l.calificacion FROM aim_aula_entregas e JOIN aim_aula_lecciones l ON l.id = e.leccion_id WHERE e.id = $1`, [idDe(req.params.id)])).rows[0];
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
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    return { router };
}

// ── Para la campanita ──
// Del personal: las entregas sin corregir de los cursos que lleva (o de todos).
export async function entregasPorCorregir(pool, { userId, todos }) {
    return (await pool.query(
        `SELECT COUNT(*)::int n, MAX(e.entregada_at) AS ultima FROM aim_aula_entregas e
         JOIN aim_aula_lecciones l ON l.id = e.leccion_id JOIN aim_aula_cursos cu ON cu.id = l.curso_id
         WHERE e.corregida_at IS NULL ${todos ? '' : 'AND cu.profesor_id = $1'}`, todos ? [] : [userId])).rows[0];
}
// De quien hace el curso: sus tareas corregidas en las dos últimas semanas.
export async function tareasCorregidas(pool, userId) {
    return (await pool.query(
        `SELECT e.id, e.nota, e.apto, e.corregida_at, l.id AS leccion_id, l.titulo, cu.id AS curso_id, cu.titulo AS curso
         FROM aim_aula_entregas e JOIN aim_aula_lecciones l ON l.id = e.leccion_id JOIN aim_aula_cursos cu ON cu.id = l.curso_id
         WHERE e.user_id = $1 AND e.corregida_at > NOW() - INTERVAL '14 days' ORDER BY e.corregida_at DESC LIMIT 5`, [userId])).rows;
}
