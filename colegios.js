// ─────────────────────────────────────────────────────────────────────────────
// Oferta educativa para colegios (#652).
//
// El club ofrece actividades a los colegios (un taller, una clase de prueba, una
// charla…). Cada colegio tiene su enlace (/colegio/<token>): ve la oferta y los
// huecos libres, y pide una actividad un día de tal hora a tal hora. El club
// acepta, rechaza o propone otro día; y al revés, el club puede proponer una
// cita y el colegio la acepta o propone otro día. Todo avisa por correo.
//
// Los huecos libres: van varias personas a la vez (Juan Manuel y Darío), así que
// un hueco es libre solo si lo están TODAS. Cada una pone su horario semanal
// (aim_colegios_horario) y los días que no puede (aim_colegios_bloqueos). Al
// colegio se le enseña solo la intersección, sin decir de quién es cada cosa,
// quitando las citas ya pedidas, propuestas o confirmadas (de cualquier colegio)
// con un margen entre una y otra para el viaje.
//
// Ajustes (aim_ajustes 'colegios'): { personas: [user_id], semanas, antelacion
// (días), margen (minutos) }.
//
// Estados de una cita: solicitada (la pide el colegio; responde el club),
// propuesta (la propone el club; responde el colegio), confirmada, rechazada
// (el club no puede: el colegio puede pedir otra), cambiada (sustituida por otra
// más nueva, que la apunta en anterior_id) y cancelada.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';

export async function crearTablasColegios(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_colegios (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(160) NOT NULL,
            contacto VARCHAR(160),
            email VARCHAR(200),
            telefono VARCHAR(40),
            direccion VARCHAR(255),
            notas TEXT,
            token VARCHAR(64) NOT NULL UNIQUE,
            activo BOOLEAN NOT NULL DEFAULT true,
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_colegios_oferta (
            id SERIAL PRIMARY KEY,
            titulo VARCHAR(160) NOT NULL,
            descripcion TEXT,
            duracion_min SMALLINT NOT NULL DEFAULT 60,
            activa BOOLEAN NOT NULL DEFAULT true,
            orden INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_colegios_horario (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            dia SMALLINT NOT NULL CHECK (dia BETWEEN 0 AND 6),
            desde VARCHAR(5) NOT NULL,
            hasta VARCHAR(5) NOT NULL
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_colegios_horario_user ON aim_colegios_horario (user_id)`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_colegios_bloqueos (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            fecha DATE NOT NULL,
            desde VARCHAR(5),
            hasta VARCHAR(5),
            motivo VARCHAR(200),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_colegios_bloqueos_fecha ON aim_colegios_bloqueos (fecha)`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_colegios_citas (
            id SERIAL PRIMARY KEY,
            colegio_id INTEGER NOT NULL REFERENCES aim_colegios(id) ON DELETE CASCADE,
            actividad_id INTEGER REFERENCES aim_colegios_oferta(id) ON DELETE SET NULL,
            actividad VARCHAR(160),
            fecha DATE NOT NULL,
            desde VARCHAR(5) NOT NULL,
            hasta VARCHAR(5) NOT NULL,
            estado VARCHAR(12) NOT NULL,
            origen VARCHAR(8) NOT NULL,
            mensaje TEXT,
            respuesta TEXT,
            anterior_id INTEGER REFERENCES aim_colegios_citas(id) ON DELETE SET NULL,
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            respondida_at TIMESTAMPTZ,
            respondida_por UUID REFERENCES users(user_id) ON DELETE SET NULL
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_colegios_citas_colegio ON aim_colegios_citas (colegio_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_colegios_citas_fecha ON aim_colegios_citas (fecha) WHERE estado IN ('solicitada', 'propuesta', 'confirmada')`);
}

const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
const fallo = (res, err) => {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[colegios]', err.message || err);
    res.status(500).json({ error: 'No se ha podido hacer.' });
};
const txt = (v, n) => { const t = String(v ?? '').trim().slice(0, n); return t || null; };
const ES_CORREO = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const ES_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const aMin = (h) => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
const aHora = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
// 0 = lunes … 6 = domingo, de una fecha «AAAA-MM-DD».
const diaSemana = (f) => (new Date(`${f}T12:00:00Z`).getUTCDay() + 6) % 7;
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hoyMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const fechaLarga = (f) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fechaDe = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const ACTIVAS = ['solicitada', 'propuesta', 'confirmada'];
const NOMBRE_ESTADO = { solicitada: 'Pedida por el colegio', propuesta: 'Propuesta por el club', confirmada: 'Confirmada', rechazada: 'No puede ser', cambiada: 'Cambiada por otra', cancelada: 'Anulada' };

// Intervalos [a, b) en minutos: unir, intersecar y restar.
function unir(xs) {
    const s = xs.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
    const r = [];
    for (const x of s) { const u = r[r.length - 1]; if (u && x[0] <= u[1]) u[1] = Math.max(u[1], x[1]); else r.push([...x]); }
    return r;
}
function intersecar(a, b) {
    const r = [];
    for (const [x1, x2] of a) for (const [y1, y2] of b) { const i = Math.max(x1, y1), j = Math.min(x2, y2); if (j > i) r.push([i, j]); }
    return unir(r);
}
function restar(a, quitar) {
    let r = unir(a);
    for (const [q1, q2] of unir(quitar)) {
        r = r.flatMap(([a1, a2]) => (q2 <= a1 || q1 >= a2 ? [[a1, a2]] : [[a1, Math.min(a2, q1)], [Math.max(a1, q2), a2]].filter(([i, j]) => j > i)));
    }
    return r;
}

export function crearColegios({ pool, authenticateSession, requireSeccion, urlPublica, mandar, avisarClub }) {
    const router = express.Router();
    const gestion = [authenticateSession, requireSeccion('colegios')];
    const idDe = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) corta(400, 'Falta cuál.'); return n; };
    const enlaceDe = (token) => `${urlPublica}/colegio/${token}`;

    // ── Ajustes ──
    const AJUSTES_BASE = { personas: [], semanas: 8, antelacion: 2, margen: 30 };
    async function ajustes(db = pool) {
        const v = (await db.query(`SELECT valor FROM aim_ajustes WHERE clave = 'colegios'`)).rows[0]?.valor || {};
        return {
            personas: Array.isArray(v.personas) ? v.personas.map(String) : [],
            semanas: Number.isInteger(v.semanas) ? v.semanas : AJUSTES_BASE.semanas,
            antelacion: Number.isInteger(v.antelacion) ? v.antelacion : AJUSTES_BASE.antelacion,
            margen: Number.isInteger(v.margen) ? v.margen : AJUSTES_BASE.margen,
        };
    }

    // ── Los huecos libres de todos a la vez, día a día ──
    // { 'AAAA-MM-DD': [[desdeMin, hastaMin], …] }. sinCita: la cita que se está
    // cambiando (su hueco cuenta como libre para ella misma).
    async function huecos({ desde, hasta, sinCita = null, db = pool } = {}) {
        const aj = await ajustes(db);
        const hoy = hoyMadrid();
        const ini = desde || sumarDias(hoy, aj.antelacion);
        const fin = hasta || sumarDias(hoy, aj.semanas * 7);
        if (!aj.personas.length) return { dias: {}, ini, fin, sinPersonas: true };
        const horario = (await db.query(`SELECT user_id, dia, desde, hasta FROM aim_colegios_horario WHERE user_id = ANY($1::uuid[])`, [aj.personas])).rows;
        const bloqueos = (await db.query(`SELECT user_id, fecha, desde, hasta FROM aim_colegios_bloqueos WHERE user_id = ANY($1::uuid[]) AND fecha BETWEEN $2 AND $3`, [aj.personas, ini, fin])).rows;
        const citas = (await db.query(
            `SELECT fecha, desde, hasta FROM aim_colegios_citas WHERE estado = ANY($1::text[]) AND fecha BETWEEN $2 AND $3 AND ($4::int IS NULL OR id <> $4)`,
            [ACTIVAS, ini, fin, sinCita])).rows;
        const dias = {};
        for (let f = ini; f <= fin; f = sumarDias(f, 1)) {
            const ds = diaSemana(f);
            let libre = null;
            for (const p of aj.personas) {
                let suyo = unir(horario.filter(h => String(h.user_id) === p && h.dia === ds).map(h => [aMin(h.desde), aMin(h.hasta)]));
                suyo = restar(suyo, bloqueos.filter(b => String(b.user_id) === p && fechaDe(b.fecha) === f).map(b => (b.desde && b.hasta ? [aMin(b.desde), aMin(b.hasta)] : [0, 24 * 60])));
                libre = libre === null ? suyo : intersecar(libre, suyo);
                if (!libre.length) break;
            }
            libre = restar(libre || [], citas.filter(c => fechaDe(c.fecha) === f).map(c => [aMin(c.desde) - aj.margen, aMin(c.hasta) + aj.margen]));
            // Huecos de menos de media hora no sirven para nada.
            libre = libre.filter(([a, b]) => b - a >= 30);
            if (libre.length) dias[f] = libre;
        }
        return { dias, ini, fin, sinPersonas: false };
    }
    const cabe = (dias, fecha, desde, hasta) => (dias[fecha] || []).some(([a, b]) => aMin(desde) >= a && aMin(hasta) <= b);
    const huecosParaVer = (dias) => Object.fromEntries(Object.entries(dias).map(([f, xs]) => [f, xs.map(([a, b]) => ({ desde: aHora(a), hasta: aHora(b) }))]));

    function validarTramo(b) {
        const fecha = String(b.fecha || ''), desde = String(b.desde || ''), hasta = String(b.hasta || '');
        if (!ES_FECHA.test(fecha)) corta(400, 'Elige el día.');
        if (fecha < hoyMadrid()) corta(400, 'Ese día ya ha pasado.');
        if (!ES_HORA.test(desde) || !ES_HORA.test(hasta)) corta(400, 'Elige la hora de empezar y la de terminar.');
        if (aMin(hasta) - aMin(desde) < 15) corta(400, 'La hora de terminar tiene que ser después de la de empezar.');
        return { fecha, desde, hasta };
    }

    // ── Correos ──
    const varsCita = (c, colegio) => ({
        colegio: colegio.nombre, contacto: colegio.contacto || colegio.nombre, actividad: c.actividad || 'La actividad',
        dia: fechaLarga(fechaDe(c.fecha)), desde: c.desde, hasta: c.hasta, enlace: enlaceDe(colegio.token),
        mensaje: c.respuesta || c.mensaje || '',
    });
    async function correoColegio(clave, c, colegio) {
        if (!colegio.email) return false;
        try { return await mandar(clave, colegio.email, varsCita(c, colegio)); } catch (e) { console.error('[colegios] correo:', e.message); return false; }
    }
    async function avisoAlClub(que, c, colegio) {
        try { await avisarClub({ ...varsCita(c, colegio), que, enlace: `${urlPublica}/admin/colegios` }); } catch (e) { console.error('[colegios] aviso:', e.message); }
    }

    // ── Lo que ve el colegio con su enlace ──
    async function colegioDeToken(token) {
        const t = String(token || '');
        if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) corta(404, 'Este enlace no es válido.');
        const c = (await pool.query(`SELECT * FROM aim_colegios WHERE token = $1`, [t])).rows[0];
        if (!c || !c.activo) corta(404, 'Este enlace ya no está activo. Escribidnos a info@aimeducation.es y os mandamos uno nuevo.');
        return c;
    }
    const mapCita = (c) => ({
        id: c.id, actividadId: c.actividad_id, actividad: c.actividad, fecha: fechaDe(c.fecha), desde: c.desde, hasta: c.hasta,
        estado: c.estado, nombreEstado: NOMBRE_ESTADO[c.estado] || c.estado, origen: c.origen, mensaje: c.mensaje || '', respuesta: c.respuesta || '',
        anteriorId: c.anterior_id, creada: c.created_at, respondida: c.respondida_at,
    });
    const oferta = async () => (await pool.query(`SELECT id, titulo, descripcion, duracion_min FROM aim_colegios_oferta WHERE activa ORDER BY orden, titulo`)).rows
        .map(o => ({ id: o.id, titulo: o.titulo, descripcion: o.descripcion || '', duracion: o.duracion_min }));

    // Que nadie llene el calendario de peticiones desde un enlace.
    const PETICIONES = new Map();
    function frenar(clave) {
        const ahora = Date.now(), r = (PETICIONES.get(clave) || []).filter(t => ahora - t < 3600_000);
        if (r.length >= 20) corta(429, 'Habéis hecho muchas peticiones seguidas. Esperad un rato o escribidnos.');
        PETICIONES.set(clave, [...r, ahora]);
    }

    router.get('/api/colegio/:token', async (req, res) => {
        try {
            const c = await colegioDeToken(req.params.token);
            const h = await huecos();
            const citas = (await pool.query(`SELECT * FROM aim_colegios_citas WHERE colegio_id = $1 ORDER BY fecha DESC, desde DESC, id DESC`, [c.id])).rows;
            res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex');
            res.json({
                colegio: { nombre: c.nombre, contacto: c.contacto || '' },
                oferta: await oferta(), huecos: huecosParaVer(h.dias), desde: h.ini, hasta: h.fin,
                citas: citas.filter(x => x.estado !== 'cambiada').map(mapCita),
            });
        } catch (err) { fallo(res, err); }
    });

    // Pedir una actividad (o, con «cambia», otro día para una cita: la propuesta
    // del club que no le viene bien, o una pedida que aún no se ha contestado).
    router.post('/api/colegio/:token/pedir', async (req, res) => {
        const client = await pool.connect();
        try {
            const c = await colegioDeToken(req.params.token);
            frenar(`c${c.id}`);
            const b = req.body || {};
            const { fecha, desde, hasta } = validarTramo(b);
            const act = (await pool.query(`SELECT id, titulo FROM aim_colegios_oferta WHERE id = $1 AND activa`, [Number(b.actividadId) || 0])).rows[0];
            if (!act) corta(400, 'Elige la actividad.');
            await client.query('BEGIN');
            await client.query(`SELECT pg_advisory_xact_lock(652, 0)`); // una petición a la vez: que no se pisen dos en el mismo hueco
            let anterior = null;
            if (b.cambia) {
                anterior = (await client.query(`SELECT * FROM aim_colegios_citas WHERE id = $1 AND colegio_id = $2 FOR UPDATE`, [Number(b.cambia) || 0, c.id])).rows[0];
                if (!anterior || !['propuesta', 'solicitada', 'rechazada', 'confirmada'].includes(anterior.estado)) corta(409, 'Esa cita ya no se puede cambiar.');
            }
            const h = await huecos({ sinCita: anterior && ACTIVAS.includes(anterior.estado) ? anterior.id : null, db: client });
            if (!cabe(h.dias, fecha, desde, hasta)) corta(409, 'Ese hueco ya no está libre. Elegid otro.');
            if (anterior) await client.query(`UPDATE aim_colegios_citas SET estado = 'cambiada', respondida_at = COALESCE(respondida_at, NOW()) WHERE id = $1`, [anterior.id]);
            const n = (await client.query(
                `INSERT INTO aim_colegios_citas (colegio_id, actividad_id, actividad, fecha, desde, hasta, estado, origen, mensaje, anterior_id)
                 VALUES ($1, $2, $3, $4, $5, $6, 'solicitada', 'colegio', $7, $8) RETURNING *`,
                [c.id, act.id, act.titulo, fecha, desde, hasta, txt(b.mensaje, 2000), anterior?.id || null])).rows[0];
            await client.query('COMMIT');
            avisoAlClub(anterior ? 'propone otro día para una cita' : 'pide una actividad', n, c);
            res.json({ success: true, cita: mapCita(n) });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });

    // Aceptar la propuesta del club.
    router.post('/api/colegio/:token/citas/:id/aceptar', async (req, res) => {
        try {
            const c = await colegioDeToken(req.params.token);
            const r = (await pool.query(
                `UPDATE aim_colegios_citas SET estado = 'confirmada', respondida_at = NOW() WHERE id = $1 AND colegio_id = $2 AND estado = 'propuesta' RETURNING *`,
                [idDe(req.params.id), c.id])).rows[0];
            if (!r) corta(409, 'Esa propuesta ya no está pendiente.');
            avisoAlClub('acepta la cita que le propusimos', r, c);
            correoColegio('colegio_confirmada', r, c);
            res.json({ success: true, cita: mapCita(r) });
        } catch (err) { fallo(res, err); }
    });

    // Anular una cita (la suya pedida, una propuesta que no quiere o una confirmada).
    router.post('/api/colegio/:token/citas/:id/anular', async (req, res) => {
        try {
            const c = await colegioDeToken(req.params.token);
            const r = (await pool.query(
                `UPDATE aim_colegios_citas SET estado = 'cancelada', respondida_at = NOW(), respuesta = $3 WHERE id = $1 AND colegio_id = $2 AND estado = ANY($4::text[]) RETURNING *`,
                [idDe(req.params.id), c.id, txt(req.body?.mensaje, 2000), ACTIVAS])).rows[0];
            if (!r) corta(409, 'Esa cita ya no se puede anular.');
            avisoAlClub('anula una cita', r, c);
            res.json({ success: true, cita: mapCita(r) });
        } catch (err) { fallo(res, err); }
    });

    // ── El panel ──
    router.get('/api/admin/colegios', ...gestion, async (req, res) => {
        try {
            const [cols, citas, ofs, aj] = await Promise.all([
                pool.query(`SELECT c.*, (SELECT COUNT(*)::int FROM aim_colegios_citas x WHERE x.colegio_id = c.id AND x.estado = 'confirmada' AND x.fecha >= CURRENT_DATE) AS proximas
                            FROM aim_colegios c ORDER BY c.activo DESC, c.nombre`),
                pool.query(`SELECT x.*, c.nombre AS colegio FROM aim_colegios_citas x JOIN aim_colegios c ON c.id = x.colegio_id
                            WHERE x.estado <> 'cambiada' AND (x.estado = ANY($1::text[]) OR x.fecha >= CURRENT_DATE - 60)
                            ORDER BY x.fecha, x.desde`, [ACTIVAS]),
                pool.query(`SELECT * FROM aim_colegios_oferta ORDER BY orden, titulo`),
                ajustes(),
            ]);
            const personas = aj.personas.length ? (await pool.query(`SELECT user_id, name, surname FROM users WHERE user_id = ANY($1::uuid[])`, [aj.personas])).rows : [];
            res.set('Cache-Control', 'no-store');
            res.json({
                colegios: cols.rows.map(c => ({ id: c.id, nombre: c.nombre, contacto: c.contacto || '', email: c.email || '', telefono: c.telefono || '', direccion: c.direccion || '', notas: c.notas || '', activo: c.activo, enlace: enlaceDe(c.token), proximas: c.proximas })),
                citas: citas.rows.map(x => ({ ...mapCita(x), colegioId: x.colegio_id, colegio: x.colegio })),
                oferta: ofs.rows.map(o => ({ id: o.id, titulo: o.titulo, descripcion: o.descripcion || '', duracion: o.duracion_min, activa: o.activa, orden: o.orden })),
                ajustes: { ...aj, personas: aj.personas.map(id => { const u = personas.find(p => String(p.user_id) === id); return { id, nombre: u ? `${u.name || ''} ${u.surname || ''}`.trim() : 'Persona borrada' }; }) },
                yo: String(req.userSession.userId), voy: aj.personas.includes(String(req.userSession.userId)),
            });
        } catch (err) { fallo(res, err); }
    });

    router.get('/api/admin/colegios/huecos', ...gestion, async (req, res) => {
        try {
            const h = await huecos({ sinCita: Number(req.query.sinCita) || null });
            res.set('Cache-Control', 'no-store').json({ huecos: huecosParaVer(h.dias), desde: h.ini, hasta: h.fin, sinPersonas: h.sinPersonas });
        } catch (err) { fallo(res, err); }
    });

    // Colegios.
    function datosColegio(b) {
        const nombre = txt(b.nombre, 160);
        if (!nombre) corta(400, 'Pon el nombre del colegio.');
        const email = txt(b.email, 200)?.toLowerCase() || null;
        if (email && !ES_CORREO.test(email)) corta(400, 'El correo no es válido.');
        return [nombre, txt(b.contacto, 160), email, txt(b.telefono, 40), txt(b.direccion, 255), txt(b.notas, 4000)];
    }
    router.post('/api/admin/colegios', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(
                `INSERT INTO aim_colegios (nombre, contacto, email, telefono, direccion, notas, token, creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
                [...datosColegio(req.body || {}), crypto.randomBytes(24).toString('base64url'), req.userSession.userId]);
            res.status(201).json({ id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/colegios/:id(\\d+)', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(
                `UPDATE aim_colegios SET nombre = $2, contacto = $3, email = $4, telefono = $5, direccion = $6, notas = $7, activo = $8, updated_at = NOW() WHERE id = $1`,
                [idDe(req.params.id), ...datosColegio(req.body || {}), req.body?.activo !== false]);
            if (!r.rowCount) corta(404, 'Ese colegio no existe.');
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Un enlace nuevo (el viejo deja de valer): por si se ha pasado a quien no era.
    router.post('/api/admin/colegios/:id(\\d+)/enlace-nuevo', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(`UPDATE aim_colegios SET token = $2, updated_at = NOW() WHERE id = $1 RETURNING token`, [idDe(req.params.id), crypto.randomBytes(24).toString('base64url')]);
            if (!r.rowCount) corta(404, 'Ese colegio no existe.');
            res.json({ enlace: enlaceDe(r.rows[0].token) });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/admin/colegios/:id(\\d+)/enviar-enlace', ...gestion, async (req, res) => {
        try {
            const c = (await pool.query(`SELECT * FROM aim_colegios WHERE id = $1`, [idDe(req.params.id)])).rows[0];
            if (!c) corta(404, 'Ese colegio no existe.');
            if (!c.email) corta(400, 'Ponle un correo al colegio antes de enviarle el enlace.');
            const ok = await mandar('colegio_enlace', c.email, { colegio: c.nombre, contacto: c.contacto || c.nombre, enlace: enlaceDe(c.token) });
            if (!ok) corta(503, 'El correo no está configurado en el servidor.');
            res.json({ success: true, enviadoA: c.email });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/colegios/:id(\\d+)', ...gestion, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            if ((await pool.query(`SELECT 1 FROM aim_colegios_citas WHERE colegio_id = $1 LIMIT 1`, [id])).rowCount) {
                await pool.query(`UPDATE aim_colegios SET activo = false, updated_at = NOW() WHERE id = $1`, [id]);
                return res.json({ success: true, desactivado: true });
            }
            await pool.query(`DELETE FROM aim_colegios WHERE id = $1`, [id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // La oferta.
    function datosOferta(b) {
        const titulo = txt(b.titulo, 160);
        if (!titulo) corta(400, 'Pon el nombre de la actividad.');
        const dur = Math.round(Number(b.duracion) || 60);
        if (dur < 15 || dur > 600) corta(400, 'La duración tiene que estar entre 15 minutos y 10 horas.');
        return [titulo, txt(b.descripcion, 4000), dur, b.activa !== false, Math.round(Number(b.orden) || 0)];
    }
    router.post('/api/admin/colegios/oferta', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(`INSERT INTO aim_colegios_oferta (titulo, descripcion, duracion_min, activa, orden) VALUES ($1,$2,$3,$4,$5) RETURNING id`, datosOferta(req.body || {}));
            res.status(201).json({ id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/colegios/oferta/:id', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(`UPDATE aim_colegios_oferta SET titulo = $2, descripcion = $3, duracion_min = $4, activa = $5, orden = $6 WHERE id = $1`, [idDe(req.params.id), ...datosOferta(req.body || {})]);
            if (!r.rowCount) corta(404, 'Esa actividad no existe.');
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/colegios/oferta/:id', ...gestion, async (req, res) => {
        try {
            const id = idDe(req.params.id);
            // Si ya se ha pedido, se oculta (las citas guardan su nombre).
            if ((await pool.query(`SELECT 1 FROM aim_colegios_citas WHERE actividad_id = $1 LIMIT 1`, [id])).rowCount) {
                await pool.query(`UPDATE aim_colegios_oferta SET activa = false WHERE id = $1`, [id]);
                return res.json({ success: true, oculta: true });
            }
            await pool.query(`DELETE FROM aim_colegios_oferta WHERE id = $1`, [id]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });

    // Mi horario: el de quien está en el panel (cada uno el suyo).
    router.get('/api/admin/colegios/mi-horario', ...gestion, async (req, res) => {
        try {
            const yo = req.userSession.userId;
            const [h, b] = await Promise.all([
                pool.query(`SELECT dia, desde, hasta FROM aim_colegios_horario WHERE user_id = $1 ORDER BY dia, desde`, [yo]),
                pool.query(`SELECT id, fecha, desde, hasta, motivo FROM aim_colegios_bloqueos WHERE user_id = $1 AND fecha >= CURRENT_DATE ORDER BY fecha, desde NULLS FIRST`, [yo]),
            ]);
            res.set('Cache-Control', 'no-store').json({
                horario: h.rows, bloqueos: b.rows.map(x => ({ id: x.id, fecha: fechaDe(x.fecha), desde: x.desde, hasta: x.hasta, motivo: x.motivo || '' })),
            });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/colegios/mi-horario', ...gestion, async (req, res) => {
        const client = await pool.connect();
        try {
            const tramos = (Array.isArray(req.body?.horario) ? req.body.horario : []).slice(0, 60).map(t => {
                const dia = Number(t.dia), desde = String(t.desde || ''), hasta = String(t.hasta || '');
                if (!Number.isInteger(dia) || dia < 0 || dia > 6 || !ES_HORA.test(desde) || !ES_HORA.test(hasta)) corta(400, 'Revisa las horas: tienen que ser como 09:30.');
                if (aMin(hasta) <= aMin(desde)) corta(400, `El tramo de ${desde} a ${hasta} termina antes de empezar.`);
                return { dia, desde, hasta };
            });
            await client.query('BEGIN');
            await client.query(`DELETE FROM aim_colegios_horario WHERE user_id = $1`, [req.userSession.userId]);
            for (const t of tramos) await client.query(`INSERT INTO aim_colegios_horario (user_id, dia, desde, hasta) VALUES ($1,$2,$3,$4)`, [req.userSession.userId, t.dia, t.desde, t.hasta]);
            await client.query('COMMIT');
            res.json({ success: true });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });
    router.post('/api/admin/colegios/mi-horario/bloqueos', ...gestion, async (req, res) => {
        try {
            const b = req.body || {};
            const fecha = String(b.fecha || '');
            if (!ES_FECHA.test(fecha)) corta(400, 'Elige el día.');
            const hasta = String(b.fechaHasta || fecha);
            if (!ES_FECHA.test(hasta) || hasta < fecha) corta(400, 'El último día no puede ser antes del primero.');
            const conHoras = b.desde || b.hasta;
            if (conHoras && (!ES_HORA.test(b.desde) || !ES_HORA.test(b.hasta) || aMin(b.hasta) <= aMin(b.desde))) corta(400, 'Revisa las horas.');
            let n = 0;
            for (let f = fecha; f <= hasta && n < 92; f = sumarDias(f, 1), n++) {
                await pool.query(`INSERT INTO aim_colegios_bloqueos (user_id, fecha, desde, hasta, motivo) VALUES ($1,$2,$3,$4,$5)`,
                    [req.userSession.userId, f, conHoras ? b.desde : null, conHoras ? b.hasta : null, txt(b.motivo, 200)]);
            }
            res.status(201).json({ success: true, dias: n });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/colegios/mi-horario/bloqueos/:id', ...gestion, async (req, res) => {
        try {
            await pool.query(`DELETE FROM aim_colegios_bloqueos WHERE id = $1 AND user_id = $2`, [idDe(req.params.id), req.userSession.userId]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Quién tiene que ir, con cuánta antelación y cuántas semanas se enseñan.
    router.put('/api/admin/colegios/ajustes', ...gestion, async (req, res) => {
        try {
            const b = req.body || {};
            const personas = [...new Set((Array.isArray(b.personas) ? b.personas : []).map(String))].slice(0, 6);
            if (personas.length) {
                const ok = (await pool.query(`SELECT COUNT(*)::int n FROM users WHERE user_id = ANY($1::uuid[])`, [personas])).rows[0].n;
                if (ok !== personas.length) corta(400, 'Alguna de esas personas no existe.');
            }
            const entero = (v, min, max, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
            const valor = { personas, semanas: entero(b.semanas, 1, 26, 8), antelacion: entero(b.antelacion, 0, 30, 2), margen: entero(b.margen, 0, 180, 30) };
            await pool.query(
                `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ('colegios', $1::jsonb, NOW(), $2)
                 ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = EXCLUDED.actualizado_por`,
                [JSON.stringify(valor), req.userSession.userId]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // A quién se puede elegir para «quién tiene que ir»: el personal del club.
    router.get('/api/admin/colegios/personal', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT u.user_id, u.name, u.surname FROM users u
                 WHERE EXISTS (SELECT 1 FROM aim_rangos ar WHERE ar.user_id = u.user_id) OR LOWER(u.role) IN ('instructor', 'club_owner') OR u.dev_role = 'superadmin'
                 ORDER BY u.name, u.surname`);
            res.json(r.rows.map(u => ({ id: String(u.user_id), nombre: `${u.name || ''} ${u.surname || ''}`.trim() })));
        } catch (err) { fallo(res, err); }
    });

    // Las citas desde el club: proponer, aceptar, rechazar, cambiar y anular.
    async function citaConColegio(db, id) {
        const r = (await db.query(`SELECT x.*, row_to_json(c) AS col FROM aim_colegios_citas x JOIN aim_colegios c ON c.id = x.colegio_id WHERE x.id = $1 FOR UPDATE OF x`, [id])).rows[0];
        if (!r) corta(404, 'Esa cita no existe.');
        return r;
    }
    // Proponer una cita a un colegio (nueva, o en lugar de otra: «cambia»).
    router.post('/api/admin/colegios/citas', ...gestion, async (req, res) => {
        const client = await pool.connect();
        try {
            const b = req.body || {};
            const { fecha, desde, hasta } = validarTramo(b);
            await client.query('BEGIN');
            await client.query(`SELECT pg_advisory_xact_lock(652, 0)`);
            let anterior = null, colegioId = Number(b.colegioId) || 0;
            if (b.cambia) {
                anterior = await citaConColegio(client, idDe(b.cambia));
                if (!['solicitada', 'propuesta', 'confirmada', 'rechazada'].includes(anterior.estado)) corta(409, 'Esa cita ya no se puede cambiar.');
                colegioId = anterior.colegio_id;
            }
            const col = (await client.query(`SELECT * FROM aim_colegios WHERE id = $1`, [colegioId])).rows[0];
            if (!col) corta(400, 'Elige el colegio.');
            const act = (await client.query(`SELECT id, titulo FROM aim_colegios_oferta WHERE id = $1`, [Number(b.actividadId) || anterior?.actividad_id || 0])).rows[0];
            if (!act && !anterior?.actividad) corta(400, 'Elige la actividad.');
            // Fuera de los huecos libres se puede, pero solo si se dice a sabiendas.
            const h = await huecos({ sinCita: anterior && ACTIVAS.includes(anterior.estado) ? anterior.id : null, db: client, desde: hoyMadrid() });
            if (!cabe(h.dias, fecha, desde, hasta) && !b.forzar) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Ese día y esa hora no estáis libres todos (o choca con otra cita). ¿La propones igualmente?', fueraDeHueco: true });
            }
            if (anterior) await client.query(`UPDATE aim_colegios_citas SET estado = 'cambiada', respondida_at = COALESCE(respondida_at, NOW()), respondida_por = $2 WHERE id = $1`, [anterior.id, req.userSession.userId]);
            const n = (await client.query(
                `INSERT INTO aim_colegios_citas (colegio_id, actividad_id, actividad, fecha, desde, hasta, estado, origen, mensaje, anterior_id, creado_por)
                 VALUES ($1,$2,$3,$4,$5,$6,'propuesta','club',$7,$8,$9) RETURNING *`,
                [col.id, act?.id || anterior?.actividad_id || null, act?.titulo || anterior?.actividad, fecha, desde, hasta, txt(b.mensaje, 2000), anterior?.id || null, req.userSession.userId])).rows[0];
            await client.query('COMMIT');
            const enviado = await correoColegio('colegio_propuesta', n, col);
            res.status(201).json({ success: true, cita: mapCita(n), correo: enviado ? col.email : null });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });
    router.post('/api/admin/colegios/citas/:id/aceptar', ...gestion, async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const x = await citaConColegio(client, idDe(req.params.id));
            if (x.estado !== 'solicitada') corta(409, 'Esa petición ya está contestada.');
            const r = (await client.query(`UPDATE aim_colegios_citas SET estado = 'confirmada', respuesta = $2, respondida_at = NOW(), respondida_por = $3 WHERE id = $1 RETURNING *`,
                [x.id, txt(req.body?.mensaje, 2000), req.userSession.userId])).rows[0];
            await client.query('COMMIT');
            const enviado = await correoColegio('colegio_confirmada', r, x.col);
            res.json({ success: true, cita: mapCita(r), correo: enviado ? x.col.email : null });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });
    router.post('/api/admin/colegios/citas/:id/rechazar', ...gestion, async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const x = await citaConColegio(client, idDe(req.params.id));
            if (x.estado !== 'solicitada') corta(409, 'Esa petición ya está contestada.');
            const r = (await client.query(`UPDATE aim_colegios_citas SET estado = 'rechazada', respuesta = $2, respondida_at = NOW(), respondida_por = $3 WHERE id = $1 RETURNING *`,
                [x.id, txt(req.body?.mensaje, 2000), req.userSession.userId])).rows[0];
            await client.query('COMMIT');
            const enviado = await correoColegio('colegio_rechazada', r, x.col);
            res.json({ success: true, cita: mapCita(r), correo: enviado ? x.col.email : null });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });
    router.post('/api/admin/colegios/citas/:id/anular', ...gestion, async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const x = await citaConColegio(client, idDe(req.params.id));
            if (!ACTIVAS.includes(x.estado)) corta(409, 'Esa cita ya no está en pie.');
            const r = (await client.query(`UPDATE aim_colegios_citas SET estado = 'cancelada', respuesta = $2, respondida_at = NOW(), respondida_por = $3 WHERE id = $1 RETURNING *`,
                [x.id, txt(req.body?.mensaje, 2000), req.userSession.userId])).rows[0];
            await client.query('COMMIT');
            const enviado = req.body?.avisar === false ? false : await correoColegio('colegio_anulada', r, x.col);
            res.json({ success: true, cita: mapCita(r), correo: enviado ? x.col.email : null });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); } finally { client.release(); }
    });
    // El historial de una cita (sus cambios de un lado y del otro).
    router.get('/api/admin/colegios/citas/:id/historial', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(
                `WITH RECURSIVE h AS (SELECT * FROM aim_colegios_citas WHERE id = $1
                   UNION ALL SELECT c.* FROM aim_colegios_citas c JOIN h ON c.id = h.anterior_id)
                 SELECT h.*, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS quien, TRIM(CONCAT(r.name, ' ', COALESCE(r.surname, ''))) AS quien_responde
                 FROM h LEFT JOIN users u ON u.user_id = h.creado_por LEFT JOIN users r ON r.user_id = h.respondida_por ORDER BY h.created_at`, [idDe(req.params.id)]);
            res.json(r.rows.map(x => ({ ...mapCita(x), quien: x.quien || null, quienResponde: x.quien_responde || null })));
        } catch (err) { fallo(res, err); }
    });

    return router;
}

// Para la campanita: cuántas peticiones de colegios están sin contestar.
export async function colegiosPorContestar(pool) {
    const r = (await pool.query(`SELECT COUNT(*)::int n, MAX(created_at) AS ultima FROM aim_colegios_citas WHERE estado = 'solicitada'`)).rows[0];
    return r;
}
