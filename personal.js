// ─────────────────────────────────────────────────────────────────────────────
// Mi espacio (#497): lo de cada trabajador en la web. Descarga sus nóminas y
// sus contratos (los sube secretaría o la dirección), sube su certificado de
// delitos de naturaleza sexual (obligatorio para trabajar con menores) y va
// completando su ficha (DNI, Seguridad Social, cuenta para la nómina, contacto
// de emergencia…). Secretaría y la dirección lo ven y lo llevan todo desde
// «Del personal». Cada uno ve solo lo suyo; son datos delicados, así que todo
// pasa por aquí y nunca sale en otras listas.
// El certificado se renueva cada curso (#507): vale el subido desde el 1 de
// septiembre; en septiembre se avisa a quien no lo tiene. Secretaría también lo
// puede subir por ellos. Al subirle algo a alguien le llega un correo (#510).
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';

// En este orden salen en su espacio (#509).
export const TIPOS_DOCUMENTO = {
    contrato: 'Contrato', modificacion: 'Modificación de contrato', nomina: 'Nómina', modelo145: 'Modelo 145',
    certificado: 'Certificado de delitos sexuales', otro: 'Otro documento',
};
const ORDEN_TIPOS = Object.keys(TIPOS_DOCUMENTO);
// Desde cuándo vale el certificado: el 1 de septiembre del curso en el que estamos.
export function inicioCurso(hoy = new Date()) {
    const a = hoy.getFullYear(), m = hoy.getMonth() + 1;
    return `${m >= 9 ? a : a - 1}-09-01`;
}
const nombreCurso = (inicio) => { const a = Number(inicio.slice(0, 4)); return `${a}-${a + 1}`; };
// La ficha del trabajador: qué se pide y en qué grupo. obligatorio: cuenta para «completa».
export const CAMPOS_FICHA = [
    { id: 'dni', grupo: 'Datos personales', nombre: 'DNI o NIE', obligatorio: true },
    { id: 'nacimiento', grupo: 'Datos personales', nombre: 'Fecha de nacimiento', tipo: 'date', obligatorio: true },
    { id: 'direccion', grupo: 'Datos personales', nombre: 'Dirección', obligatorio: true },
    { id: 'cp', grupo: 'Datos personales', nombre: 'Código postal', obligatorio: true },
    { id: 'localidad', grupo: 'Datos personales', nombre: 'Localidad', obligatorio: true },
    { id: 'telefono', grupo: 'Datos personales', nombre: 'Teléfono', obligatorio: true },
    { id: 'nss', grupo: 'Para la nómina', nombre: 'Número de la Seguridad Social', obligatorio: true },
    { id: 'iban', grupo: 'Para la nómina', nombre: 'Cuenta bancaria (IBAN)', obligatorio: true },
    { id: 'emergencia_nombre', grupo: 'Contacto de emergencia', nombre: 'Nombre y parentesco', obligatorio: true },
    { id: 'emergencia_telefono', grupo: 'Contacto de emergencia', nombre: 'Teléfono', obligatorio: true },
    { id: 'titulacion', grupo: 'Formación', nombre: 'Titulación y cursos', tipo: 'texto' },
    { id: 'notas', grupo: 'Formación', nombre: 'Algo más que debamos saber (alergias, disponibilidad…)', tipo: 'texto' },
];
const OBLIGATORIOS = CAMPOS_FICHA.filter(c => c.obligatorio).map(c => c.id);
const MIME_DOC = /^(application\/pdf|image\/(png|jpeg|webp))$/;
const MAX_DOC = 10 * 1024 * 1024;
const ESPERA_CORREO = Number(process.env.PERSONAL_ESPERA_CORREO_MS) || 60 * 1000;

export async function crearTablasPersonal(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_personal_documentos (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            tipo VARCHAR(20) NOT NULL,
            nombre VARCHAR(200) NOT NULL,
            mime VARCHAR(100) NOT NULL,
            datos BYTEA NOT NULL,
            bytes INTEGER NOT NULL,
            periodo VARCHAR(7),
            subido_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            descargado_at TIMESTAMPTZ
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_aim_personal_documentos_user ON aim_personal_documentos (user_id, tipo, created_at DESC)`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_personal_fichas (
            user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
            datos JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL
        )`);
}

const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
const fallo = (res, err) => {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[personal]', err.message || err);
    res.status(500).json({ error: 'No se ha podido hacer.' });
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limpiarFicha = (b) => Object.fromEntries(CAMPOS_FICHA.map(c => [c.id, String(b?.[c.id] ?? '').trim().slice(0, c.tipo === 'texto' ? 2000 : 200)]).filter(([, v]) => v));
const completa = (datos) => OBLIGATORIOS.filter(k => String(datos?.[k] || '').trim()).length;
const SIN_AVISO = ['certificado'];   // lo demás, al subirlo, le avisa (campanita, móvil y correo)
// Lo que se le dice: «tu nómina de octubre de 2026», «un contrato nuevo»…
export function queDocumento(d) {
    if (d.tipo === 'nomina') return d.periodo ? `tu nómina de ${mesLargo(d.periodo)}` : 'una nómina nueva';
    return { contrato: 'un contrato nuevo', modificacion: 'una modificación de tu contrato', modelo145: 'tu modelo 145' }[d.tipo] || `un documento nuevo (${d.nombre})`;
}
const mapDoc = (d) => ({ id: d.id, tipo: d.tipo, nombre: d.nombre, mime: d.mime, bytes: d.bytes, periodo: d.periodo, fecha: d.created_at, descargado: d.descargado_at, url: `/api/espacio/documentos/${d.id}` });

// Los avisos: al trabajador, los documentos nuevos que aún no ha abierto; a
// quien lleva el personal, cuántos trabajan sin el certificado subido.
export async function avisosEspacio(pool, userId, { gestiona = false, sqlEsPersonal, clubId }) {
    const l = [];
    const r = await pool.query(
        `SELECT id, tipo, nombre, periodo, created_at FROM aim_personal_documentos
         WHERE user_id = $1 AND tipo <> ALL($2::text[]) AND descargado_at IS NULL AND subido_por IS DISTINCT FROM $1
           AND created_at > NOW() - INTERVAL '60 days' ORDER BY created_at DESC LIMIT 6`, [userId, SIN_AVISO]);
    for (const d of r.rows) {
        l.push({ tipo: 'personal', clave: `personal_doc:${d.id}`, n: 1, marca: d.created_at, fecha: d.created_at, destino: '/admin/mi-espacio', soloSinLeer: true,
            texto: `Tienes ${queDocumento(d)}`, detalle: 'En «Mi espacio», para descargarlo' });
    }
    // Su certificado de este curso: sin él, el aviso sigue hasta que lo suba.
    const desde = inicioCurso();
    const c = (await pool.query(
        `SELECT ${sqlEsPersonal('u')} AS personal,
                (SELECT MAX(d.created_at) FROM aim_personal_documentos d WHERE d.user_id = u.user_id AND d.tipo = 'certificado') AS ultimo
         FROM users u WHERE u.user_id = $1 AND u.club_id = $2`, [userId, clubId]).catch(() => ({ rows: [] }))).rows[0];
    if (c?.personal && !(c.ultimo && new Date(c.ultimo) >= new Date(`${desde}T00:00:00`))) {
        l.push({ tipo: 'personal', clave: `personal_certificado:${desde.slice(0, 4)}`, n: 1, destino: '/admin/mi-espacio',
            texto: c.ultimo ? 'Toca renovar tu certificado de delitos sexuales' : 'Sube tu certificado de delitos sexuales',
            detalle: c.ultimo ? `Para el curso ${nombreCurso(desde)}: pídelo de nuevo y súbelo en «Mi espacio»` : 'Es obligatorio para trabajar con menores: súbelo en «Mi espacio»' });
    }
    if (gestiona) {
        const f = (await pool.query(
            `SELECT COUNT(*)::int n FROM users u
             WHERE u.club_id = $1 AND ${sqlEsPersonal('u')}
               AND NOT EXISTS (SELECT 1 FROM aim_personal_documentos d WHERE d.user_id = u.user_id AND d.tipo = 'certificado' AND d.created_at >= $2::date)`, [clubId, desde]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
        if (f) l.push({ tipo: 'personal', clave: 'personal_sin_certificado', n: f, destino: '/admin/mi-espacio?pestana=personal',
            texto: `${f} ${f === 1 ? 'persona del equipo no tiene' : 'personas del equipo no tienen'} el certificado de delitos sexuales de este curso`, detalle: 'Se sube en «Mi espacio»' });
    }
    return l;
}
// En septiembre (#507), una vez por curso: correo a quien aún no tiene el
// certificado de este curso, y su aviso al móvil. enviar(persona, vars) manda
// el correo (si está apagado, no sale); avisar(ids), al móvil.
export async function recordarCertificados({ pool, clubId, sqlEsPersonal, enviar, avisar = () => {}, hoy = new Date() }) {
    if (hoy.getMonth() + 1 !== 9) return 0;
    const desde = inicioCurso(hoy), curso = nombreCurso(desde);
    const hecho = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = 'personal_certificado_recordatorio'`)).rows[0]?.valor || {};
    if (hecho.curso === curso) return 0;
    // Primero se apunta: si algo falla a medias, no se repite a nadie.
    await pool.query(
        `INSERT INTO aim_ajustes (clave, valor, actualizado_at) VALUES ('personal_certificado_recordatorio', $1::jsonb, NOW())
         ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW()`, [JSON.stringify({ curso, at: new Date().toISOString() })]);
    const r = await pool.query(
        `SELECT u.user_id, u.email, u.name
         FROM users u WHERE u.club_id = $1 AND ${sqlEsPersonal('u')}
           AND NOT EXISTS (SELECT 1 FROM aim_personal_documentos d WHERE d.user_id = u.user_id AND d.tipo = 'certificado' AND d.created_at >= $2::date)`, [clubId, desde]);
    for (const p of r.rows) await enviar(p, { curso }).catch(e => { if (!e.apagado) console.error('[personal] recordatorio del certificado:', e.message); });
    avisar(r.rows.map(p => p.user_id));
    return r.rows.length;
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesLargo = (p) => { const [a, m] = String(p).split('-').map(Number); return a && m ? `${MESES[m - 1]} de ${a}` : p; };

export function crearPersonal({ pool, authenticateSession, requireAdmin, permisos, clubId, sqlEsPersonal, avisar = () => {}, correo = null }) {
    const router = express.Router();
    const yo = (req) => req.userSession.userId;
    const gestiona = (req) => !!permisos(req).gestionarPersonal;
    const soloGestion = (req, res, next) => (gestiona(req) ? next() : res.status(403).json({ error: 'Esto lo llevan secretaría y la dirección.' }));
    const crudo = express.raw({ type: () => true, limit: '11mb' });
    const listaDocs = async (userId) => (await pool.query(
        `SELECT id, tipo, nombre, mime, bytes, periodo, created_at, descargado_at FROM aim_personal_documentos WHERE user_id = $1
         ORDER BY array_position($2::text[], tipo::text), periodo DESC NULLS LAST, created_at DESC`, [userId, ORDEN_TIPOS])).rows.map(mapDoc);
    // El correo de lo subido (#510): si se suben varios seguidos (las nóminas de
    // un mes, por ejemplo), un correo por persona con todo, al minuto del último.
    const porMandar = new Map();
    function correoLuego(userId, docId) {
        if (!correo) return;
        const p = porMandar.get(userId) || { ids: [], t: null };
        p.ids.push(docId);
        clearTimeout(p.t);
        p.t = setTimeout(async () => {
            porMandar.delete(userId);
            try {
                const docs = (await pool.query(`SELECT id, tipo, nombre, periodo FROM aim_personal_documentos WHERE id = ANY($1::int[]) AND descargado_at IS NULL`, [p.ids])).rows;
                if (docs.length) await correo(userId, docs.length === 1 ? queDocumento(docs[0]) : `${docs.length} documentos nuevos`);
            } catch (e) { if (!e.apagado) console.error('[personal] correo:', e.message); }
        }, ESPERA_CORREO);
        porMandar.set(userId, p);
    }
    // La ficha, con lo que ya se sabía de su cuenta para lo que aún no ha puesto.
    async function fichaDe(userId) {
        const f = (await pool.query(`SELECT datos, updated_at FROM aim_personal_fichas WHERE user_id = $1`, [userId])).rows[0] || { datos: {}, updated_at: null };
        const u = (await pool.query(`SELECT dni, domicilio, cp, poblacion, phone, to_char(birthday, 'YYYY-MM-DD') AS nac FROM users WHERE user_id = $1`, [userId])).rows[0] || {};
        const deCuenta = { dni: u.dni, direccion: u.domicilio, cp: u.cp, localidad: u.poblacion, telefono: u.phone, nacimiento: u.nac };
        const datos = { ...f.datos };
        for (const [k, v] of Object.entries(deCuenta)) if (!String(datos[k] || '').trim() && String(v || '').trim()) datos[k] = String(v).trim();
        return { datos, updated_at: f.updated_at };
    }
    async function guardarDoc(userId, req, tipo, periodo = null) {
        const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const datos = Buffer.isBuffer(req.body) ? req.body : null;
        if (!datos?.length) corta(400, 'No ha llegado el archivo.');
        if (!MIME_DOC.test(mime)) corta(400, 'Tiene que ser un PDF o una foto (JPG o PNG).');
        if (datos.length > MAX_DOC) corta(413, 'El archivo pasa de 10 MB.');
        if (!TIPOS_DOCUMENTO[tipo]) corta(400, 'Qué documento es no se entiende.');
        if (periodo && !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) corta(400, 'El mes no es válido.');
        const nombre = String(req.query.nombre || '').replace(/[\r\n"\\/]/g, '').trim().slice(0, 200) || `${TIPOS_DOCUMENTO[tipo]}.${mime === 'application/pdf' ? 'pdf' : 'jpg'}`;
        const r = await pool.query(
            `INSERT INTO aim_personal_documentos (user_id, tipo, nombre, mime, datos, bytes, periodo, subido_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [userId, tipo, nombre, mime, datos, datos.length, periodo, yo(req)]);
        return r.rows[0].id;
    }
    // Que sea alguien del personal del club.
    async function trabajador(userId) {
        if (!UUID.test(String(userId))) corta(404, 'Esa persona no es del equipo.');
        const u = (await pool.query(`SELECT u.user_id, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS nombre FROM users u WHERE u.user_id = $1 AND u.club_id = $2 AND ${sqlEsPersonal('u')}`, [userId, clubId])).rows[0];
        if (!u) corta(404, 'Esa persona no es del equipo.');
        return u;
    }

    // ── Lo de cada uno ──
    router.get('/api/me/espacio', authenticateSession, requireAdmin, async (req, res) => {
        try {
            const f = await fichaDe(yo(req));
            res.set('Cache-Control', 'no-store');
            res.json({ documentos: await listaDocs(yo(req)), ficha: f.datos, fichaAt: f.updated_at, campos: CAMPOS_FICHA, tipos: TIPOS_DOCUMENTO, gestiona: gestiona(req), cursoDesde: inicioCurso(), curso: nombreCurso(inicioCurso()) });
        } catch (err) { fallo(res, err); }
    });
    router.put('/api/me/espacio/ficha', authenticateSession, requireAdmin, express.json(), async (req, res) => {
        try {
            const datos = limpiarFicha(req.body?.datos);
            await pool.query(`INSERT INTO aim_personal_fichas (user_id, datos, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $1)
                              ON CONFLICT (user_id) DO UPDATE SET datos = $2::jsonb, updated_at = NOW(), updated_by = $1`, [yo(req), JSON.stringify(datos)]);
            res.json({ success: true, completa: completa(datos), de: OBLIGATORIOS.length });
        } catch (err) { fallo(res, err); }
    });
    // Su certificado (se guardan todos; vale el último).
    router.post('/api/me/espacio/certificado', authenticateSession, requireAdmin, crudo, async (req, res) => {
        try { res.status(201).json({ id: await guardarDoc(yo(req), req, 'certificado') }); } catch (err) { fallo(res, err); }
    });
    // Descargar: lo suyo, o cualquiera si lleva el personal. Al abrir lo suyo, deja de ser nuevo.
    router.get('/api/espacio/documentos/:id', authenticateSession, requireAdmin, async (req, res) => {
        try {
            const d = (await pool.query(`SELECT * FROM aim_personal_documentos WHERE id = $1`, [Number(req.params.id) || 0])).rows[0];
            if (!d || (String(d.user_id) !== String(yo(req)) && !gestiona(req))) corta(404, 'Ese documento no está.');
            if (String(d.user_id) === String(yo(req)) && !d.descargado_at) await pool.query(`UPDATE aim_personal_documentos SET descargado_at = NOW() WHERE id = $1`, [d.id]);
            res.set({
                'Content-Type': d.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
                'Content-Disposition': `${req.query.descargar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(d.nombre)}`,
            }).send(d.datos);
        } catch (err) { fallo(res, err); }
    });

    // ── Del personal (secretaría y la dirección) ──
    router.get('/api/admin/personal-espacio', authenticateSession, requireAdmin, soloGestion, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT u.user_id AS id, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS nombre,
                        COALESCE((SELECT ar.rango FROM aim_rangos ar WHERE ar.user_id = u.user_id), u.role) AS rango,
                        (SELECT MAX(d.created_at) FROM aim_personal_documentos d WHERE d.user_id = u.user_id AND d.tipo = 'certificado') AS certificado,
                        EXISTS (SELECT 1 FROM aim_personal_documentos d WHERE d.user_id = u.user_id AND d.tipo = 'certificado' AND d.created_at >= $2::date) AS certificado_vigente,
                        (SELECT MAX(d.periodo) FROM aim_personal_documentos d WHERE d.user_id = u.user_id AND d.tipo = 'nomina') AS ultima_nomina,
                        (SELECT COUNT(*)::int FROM aim_personal_documentos d WHERE d.user_id = u.user_id AND d.tipo = 'contrato') AS contratos,
                        (SELECT f.datos FROM aim_personal_fichas f WHERE f.user_id = u.user_id) AS ficha
                 FROM users u WHERE u.club_id = $1 AND ${sqlEsPersonal('u')}
                 ORDER BY u.name, u.surname`, [clubId, inicioCurso()]);
            res.set('Cache-Control', 'no-store');
            res.json({ curso: nombreCurso(inicioCurso()), personas: r.rows.map(x => ({ id: x.id, nombre: x.nombre, rango: x.rango, certificado: x.certificado, certificadoVigente: x.certificado_vigente, ultimaNomina: x.ultima_nomina, contratos: x.contratos, ficha: completa(x.ficha || {}), de: OBLIGATORIOS.length })) });
        } catch (err) { fallo(res, err); }
    });
    router.get('/api/admin/personal-espacio/:id', authenticateSession, requireAdmin, soloGestion, async (req, res) => {
        try {
            const u = await trabajador(req.params.id), f = await fichaDe(u.user_id);
            res.set('Cache-Control', 'no-store');
            res.json({ persona: { id: u.user_id, nombre: u.nombre }, documentos: await listaDocs(u.user_id), ficha: f.datos, fichaAt: f.updated_at, campos: CAMPOS_FICHA, tipos: TIPOS_DOCUMENTO, cursoDesde: inicioCurso() });
        } catch (err) { fallo(res, err); }
    });
    // Subir un documento a alguien: ?tipo=nomina&periodo=2026-10&nombre=… También
    // su certificado, si lo ha entregado en papel o por correo (#507).
    router.post('/api/admin/personal-espacio/:id/documentos', authenticateSession, requireAdmin, soloGestion, crudo, async (req, res) => {
        try {
            const u = await trabajador(req.params.id);
            const tipo = String(req.query.tipo || '');
            const id = await guardarDoc(u.user_id, req, tipo, tipo === 'nomina' ? String(req.query.periodo || '') || null : null);
            avisar([u.user_id]);
            if (!SIN_AVISO.includes(tipo) && String(u.user_id) !== String(yo(req))) correoLuego(u.user_id, id);
            res.status(201).json({ id });
        } catch (err) { fallo(res, err); }
    });
    router.delete('/api/admin/personal-espacio/documentos/:id', authenticateSession, requireAdmin, soloGestion, async (req, res) => {
        try { await pool.query(`DELETE FROM aim_personal_documentos WHERE id = $1`, [Number(req.params.id) || 0]); res.json({ success: true }); } catch (err) { fallo(res, err); }
    });
    router.put('/api/admin/personal-espacio/:id/ficha', authenticateSession, requireAdmin, soloGestion, express.json(), async (req, res) => {
        try {
            const u = await trabajador(req.params.id), datos = limpiarFicha(req.body?.datos);
            await pool.query(`INSERT INTO aim_personal_fichas (user_id, datos, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
                              ON CONFLICT (user_id) DO UPDATE SET datos = $2::jsonb, updated_at = NOW(), updated_by = $3`, [u.user_id, JSON.stringify(datos), yo(req)]);
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    return router;
}
