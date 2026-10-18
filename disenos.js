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
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';

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
}

const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
const fallo = (res, err) => {
    if (!err.status) console.error('[diseños]', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'No se ha podido hacer. Inténtalo otra vez.' });
};
const MAX_DATOS = 600_000;       // el JSON de un diseño (sin imágenes dentro: van por URL)
const MAX_MINIATURA = 250_000;
export const CLAVE_DIPLOMA = 'diploma_diseno';

function limpiar(body) {
    const nombre = String(body?.nombre || '').trim().slice(0, 150) || 'Diseño sin nombre';
    const tipo = body?.tipo === 'diploma' ? 'diploma' : 'libre';
    const d = body?.datos;
    if (!d || typeof d !== 'object') corta(400, 'Falta el diseño.');
    const ancho = Math.round(Number(d.ancho)), alto = Math.round(Number(d.alto));
    if (!(ancho >= 50 && ancho <= 6000 && alto >= 50 && alto <= 6000)) corta(400, 'El tamaño tiene que estar entre 50 y 6000 píxeles.');
    if (!Array.isArray(d.elementos) || d.elementos.length > 400) corta(400, 'Como mucho 400 elementos por diseño.');
    const json = JSON.stringify(d);
    if (json.length > MAX_DATOS) corta(400, 'El diseño es demasiado grande. ¿Hay alguna imagen pegada dentro? Súbela.');
    if (/"url"\s*:\s*"data:/.test(json)) corta(400, 'Las imágenes se suben, no se pegan dentro del diseño.');
    const mini = typeof body?.miniatura === 'string' && body.miniatura.startsWith('data:image/') && body.miniatura.length <= MAX_MINIATURA ? body.miniatura : null;
    return { nombre, tipo, ancho, alto, json, mini };
}

export function crearDisenos({ pool, authenticateSession, requireSeccion }) {
    const router = express.Router();
    const gestion = [authenticateSession, requireSeccion('grafico')];
    const resumen = (x) => ({ id: x.id, nombre: x.nombre, tipo: x.tipo, ancho: x.ancho, alto: x.alto, miniatura: x.miniatura, autor: x.autor || null, actualizado: x.updated_at });

    async function diplomaPorDefecto() {
        const v = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = $1`, [CLAVE_DIPLOMA])).rows[0]?.valor;
        return Number(v?.id) || null;
    }

    router.get('/api/admin/disenos', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT d.id, d.nombre, d.tipo, d.ancho, d.alto, d.miniatura, d.updated_at, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS autor
                 FROM aim_disenos d LEFT JOIN users u ON u.user_id = d.creado_por ORDER BY d.updated_at DESC LIMIT 500`);
            res.set('Cache-Control', 'no-store');
            res.json({ disenos: r.rows.map(resumen), diplomaPorDefecto: await diplomaPorDefecto() });
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
            const r = await pool.query(
                `UPDATE aim_disenos SET nombre = $2, tipo = $3, ancho = $4, alto = $5, datos = $6::jsonb, miniatura = COALESCE($7, miniatura), updated_at = NOW()
                 WHERE id = $1 RETURNING id`, [Number(req.params.id) || 0, d.nombre, d.tipo, d.ancho, d.alto, d.json, d.mini]);
            if (!r.rowCount) corta(404, 'Ese diseño ya no existe.');
            res.json({ success: true });
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
            await pool.query(`DELETE FROM aim_disenos WHERE id = $1`, [id]);
            if (await diplomaPorDefecto() === id) await pool.query(`DELETE FROM aim_ajustes WHERE clave = $1`, [CLAVE_DIPLOMA]);
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
            const r = await pool.query(`SELECT id, nombre, miniatura FROM aim_disenos WHERE tipo = 'diploma' ORDER BY nombre`);
            res.set('Cache-Control', 'no-store');
            res.json({ diplomas: r.rows, porDefecto: await diplomaPorDefecto() });
        } catch (err) { fallo(res, err); }
    });

    return { router, diplomaPorDefecto };
}

// El diseño del diploma de un curso: el suyo o el de por defecto (null si no hay).
export async function disenoDiploma(pool, cursoId) {
    const r = (await pool.query(
        `SELECT d.datos FROM aim_disenos d WHERE d.tipo = 'diploma' AND d.id = COALESCE(
            (SELECT diploma_diseno_id FROM aim_aula_cursos WHERE id = $1),
            (SELECT (valor->>'id')::int FROM aim_ajustes WHERE clave = '${CLAVE_DIPLOMA}'))`, [cursoId])).rows[0];
    return r?.datos || null;
}
