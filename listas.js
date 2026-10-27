// ─────────────────────────────────────────────────────────────────────────────
// Listas hechas a mano (#499): AMPAs, colegios, asociaciones de la zona… Gente
// que no es alumna ni familia, que se apunta a mano (o pegando una lista) y se
// agrupa en listas. Cada lista es además un segmento para las campañas («a
// mano», junto a los de filtros), y sus personas salen en Personas →
// Contactos, para buscarlas, tener su ficha y ver los correos con ellas.
// Una persona puede estar en varias listas; el correo no se repite.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import { filtroNombreSQL } from './buscar.js';

export async function crearTablasListas(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_listas (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(120) NOT NULL,
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_listas_personas (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(160),
            entidad VARCHAR(160),
            cargo VARCHAR(120),
            email VARCHAR(200),
            telefono VARCHAR(40),
            notas TEXT,
            creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_aim_listas_personas_email ON aim_listas_personas (LOWER(email)) WHERE email IS NOT NULL AND email <> ''`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS aim_listas_miembros (
            lista_id INTEGER NOT NULL REFERENCES aim_listas(id) ON DELETE CASCADE,
            persona_id INTEGER NOT NULL REFERENCES aim_listas_personas(id) ON DELETE CASCADE,
            PRIMARY KEY (lista_id, persona_id)
        )`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_aim_listas_miembros_persona ON aim_listas_miembros (persona_id)`);
}

const ES_CORREO = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const corta = (status, error) => { const e = new Error(error); e.status = status; throw e; };
const fallo = (res, err) => {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[listas]', err.message || err);
    res.status(500).json({ error: 'No se ha podido hacer.' });
};
const txt = (v, n) => { const t = String(v ?? '').trim().slice(0, n); return t || null; };

// Las listas como segmentos (para Comunicación → Segmentos y las campañas).
export async function listasComoSegmentos(pool) {
    const r = await pool.query(`SELECT l.id, l.nombre, (SELECT COUNT(*)::int FROM aim_listas_miembros m WHERE m.lista_id = l.id) AS n FROM aim_listas l ORDER BY l.nombre`);
    return r.rows.map(l => ({ id: `lista-${l.id}`, nombre: l.nombre, manual: true, personas: l.n, filtros: { estado: 'lista', lista: l.id } }));
}

// Quién recibe una campaña a una lista. No son clientes: no se les manda si su
// correo rebota ni, la publicidad, si se dieron de baja.
export async function resolverLista(pool, f, { tiposCorreo, rebotesDe }) {
    const tipo = tiposCorreo.includes(f?.tipo) ? f.tipo : 'servicio';
    const r = await pool.query(
        `SELECT p.id, p.nombre, p.entidad, LOWER(p.email) AS email,
                (SELECT k.otorgado FROM aim_consentimientos k WHERE k.tipo = 'comunicaciones' AND LOWER(k.email) = LOWER(p.email)
                  ORDER BY k.created_at DESC, k.id DESC LIMIT 1) AS com
         FROM aim_listas_personas p JOIN aim_listas_miembros m ON m.persona_id = p.id
         WHERE m.lista_id = $1 AND p.email IS NOT NULL AND p.email <> ''
         ORDER BY p.nombre NULLS LAST, p.email`, [Number(f?.lista) || 0]);
    const rebotan = await rebotesDe(r.rows.map(x => x.email));
    const porTipo = Object.fromEntries(tiposCorreo.map(tp => [tp, { alumnos: 0, correos: 0 }]));
    const alumnos = r.rows.map(x => {
        const fueraDe = (tp) => (rebotan.has(x.email) ? 'su correo rebota' : tp === 'comercial' && x.com === false ? 'se dio de baja' : null);
        const recibe = {}, correos = {};
        for (const tp of tiposCorreo) {
            recibe[tp] = !fueraDe(tp); correos[tp] = recibe[tp] ? [x.email] : [];
            if (recibe[tp]) { porTipo[tp].alumnos++; porTipo[tp].correos++; }
        }
        const nombre = x.nombre || x.entidad || x.email, fuera = fueraDe(tipo);
        return {
            id: `lista-${x.id}`, esContacto: true, nombre, edad: null, clases: x.entidad || 'Lista a mano', recibe, correos,
            destinatarios: fuera ? [] : [{ id: null, nombre, relacion: x.entidad || 'Contacto', email: x.email }], fuera,
        };
    });
    const dentro = alumnos.filter(a => !a.fuera);
    return {
        tipo, destino: 'contacto', alumnos,
        resumen: {
            alumnos: alumnos.length, conDestinatario: dentro.length, direcciones: dentro.length, sinCorreo: 0,
            rebotan: alumnos.filter(a => a.fuera === 'su correo rebota').length, porPermisos: alumnos.filter(a => a.fuera === 'se dio de baja').length,
            limite: false, porTipo,
        },
    };
}
// Para el análisis de segmentos: los correos de la lista.
export async function correosDeLista(pool, listaId) {
    const r = await pool.query(
        `SELECT DISTINCT LOWER(p.email) AS email FROM aim_listas_personas p JOIN aim_listas_miembros m ON m.persona_id = p.id
         WHERE m.lista_id = $1 AND p.email IS NOT NULL AND p.email <> ''`, [Number(listaId) || 0]);
    return r.rows.map(x => x.email);
}

export function crearListas({ pool, authenticateSession, requireSeccion, correosCon }) {
    const router = express.Router();
    const gestion = [authenticateSession, requireSeccion('listas')];
    const idDe = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) corta(400, 'Falta cuál.'); return n; };
    const mapPersona = (p) => ({ id: p.id, nombre: p.nombre || '', entidad: p.entidad || '', cargo: p.cargo || '', email: p.email || '', telefono: p.telefono || '', notas: p.notas || '', listas: p.listas || [], creado: p.created_at });

    // Una persona nueva o, si ese correo ya está, la de antes (y se juntan sus listas).
    async function guardarPersona(db, b, userId, id = null) {
        const email = txt(b.email, 200)?.toLowerCase() || null;
        if (email && !ES_CORREO.test(email)) corta(400, `El correo «${email}» no es válido.`);
        const nombre = txt(b.nombre, 160), entidad = txt(b.entidad, 160);
        if (!nombre && !entidad && !email) corta(400, 'Pon al menos el nombre, la entidad o el correo.');
        const campos = [nombre, entidad, txt(b.cargo, 120), email, txt(b.telefono, 40), txt(b.notas, 4000)];
        if (id) {
            if (email) {
                const otra = (await db.query(`SELECT id FROM aim_listas_personas WHERE LOWER(email) = $1 AND id <> $2`, [email, id])).rows[0];
                if (otra) corta(409, 'Ya hay otra persona con ese correo.');
            }
            const r = await db.query(`UPDATE aim_listas_personas SET nombre = $2, entidad = $3, cargo = $4, email = $5, telefono = $6, notas = $7, updated_at = NOW() WHERE id = $1 RETURNING id`, [id, ...campos]);
            if (!r.rowCount) corta(404, 'Esa persona ya no está.');
            return id;
        }
        const ya = email ? (await db.query(`SELECT id FROM aim_listas_personas WHERE LOWER(email) = $1`, [email])).rows[0] : null;
        if (ya) {
            // Lo que se sabe de nuevo completa lo que había.
            await db.query(`UPDATE aim_listas_personas SET nombre = COALESCE(nombre, $2), entidad = COALESCE(entidad, $3), cargo = COALESCE(cargo, $4),
                            telefono = COALESCE(telefono, $5), updated_at = NOW() WHERE id = $1`, [ya.id, campos[0], campos[1], campos[2], campos[4]]);
            return ya.id;
        }
        return (await db.query(`INSERT INTO aim_listas_personas (nombre, entidad, cargo, email, telefono, notas, creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [...campos, userId])).rows[0].id;
    }
    const ponerEnListas = async (db, personaId, listas, soloAnadir = false) => {
        const ids = [...new Set([].concat(listas || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
        if (!soloAnadir) await db.query(`DELETE FROM aim_listas_miembros WHERE persona_id = $1 AND NOT (lista_id = ANY($2::int[]))`, [personaId, ids]);
        if (ids.length) await db.query(`INSERT INTO aim_listas_miembros (lista_id, persona_id) SELECT x, $1 FROM unnest($2::int[]) x WHERE EXISTS (SELECT 1 FROM aim_listas l WHERE l.id = x) ON CONFLICT DO NOTHING`, [personaId, ids]);
    };

    // ── Las listas ──
    router.get('/api/admin/listas', ...gestion, async (req, res) => {
        try {
            const r = await pool.query(`SELECT l.id, l.nombre, (SELECT COUNT(*)::int FROM aim_listas_miembros m WHERE m.lista_id = l.id) AS n FROM aim_listas l ORDER BY l.nombre`);
            res.set('Cache-Control', 'no-store');
            res.json({ listas: r.rows.map(l => ({ id: l.id, nombre: l.nombre, personas: l.n })) });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/admin/listas', ...gestion, express.json(), async (req, res) => {
        try {
            const nombre = txt(req.body?.nombre, 120);
            if (!nombre) corta(400, 'Ponle nombre a la lista.');
            const r = await pool.query(`INSERT INTO aim_listas (nombre, creado_por) VALUES ($1, $2) RETURNING id`, [nombre, req.userSession.userId]);
            res.status(201).json({ id: r.rows[0].id });
        } catch (err) { fallo(res, err); }
    });
    router.patch('/api/admin/listas/:id', ...gestion, express.json(), async (req, res) => {
        try {
            const nombre = txt(req.body?.nombre, 120);
            if (!nombre) corta(400, 'Ponle nombre a la lista.');
            const r = await pool.query(`UPDATE aim_listas SET nombre = $2 WHERE id = $1`, [idDe(req.params.id), nombre]);
            if (!r.rowCount) corta(404, 'Esa lista ya no existe.');
            res.json({ success: true });
        } catch (err) { fallo(res, err); }
    });
    // Se borra la lista; las personas se quedan (pueden estar en otras).
    router.delete('/api/admin/listas/:id', ...gestion, async (req, res) => {
        try { await pool.query(`DELETE FROM aim_listas WHERE id = $1`, [idDe(req.params.id)]); res.json({ success: true }); } catch (err) { fallo(res, err); }
    });
    // Pegar muchas de golpe: una por línea, «Nombre; Entidad; Cargo; Correo; Teléfono»
    // (o separado por comas o tabuladores, como sale de Excel). Basta con el correo.
    router.post('/api/admin/listas/:id/pegar', ...gestion, express.json({ limit: '1mb' }), async (req, res) => {
        const client = await pool.connect();
        try {
            const id = idDe(req.params.id);
            if (!(await client.query(`SELECT 1 FROM aim_listas WHERE id = $1`, [id])).rowCount) corta(404, 'Esa lista ya no existe.');
            const lineas = String(req.body?.texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 2000);
            let nuevas = 0, ya = 0; const malas = [];
            await client.query('BEGIN');
            for (const l of lineas) {
                const partes = l.split(/\t|;|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(x => x.replace(/^"|"$/g, '').trim());
                const email = partes.find(x => ES_CORREO.test(x)) || null;
                if (!email && partes.some(x => x.includes('@'))) { malas.push(`${l.slice(0, 60)}: el correo no es válido`); continue; }
                const resto = partes.filter(x => x !== email);
                const telefono = resto.find(x => /^[+\d][\d\s().-]{6,}$/.test(x)) || null;
                const textos = resto.filter(x => x && x !== telefono);
                if (!email && !textos.length) continue;
                if (/^(nombre|correo|email|e-mail)$/i.test(textos[0] || '') && !email) continue;   // la cabecera
                // Cada línea por su cuenta: una que falle no deshace las demás.
                await client.query('SAVEPOINT linea');
                try {
                    const antes = email ? (await client.query(`SELECT 1 FROM aim_listas_personas WHERE LOWER(email) = $1`, [email.toLowerCase()])).rowCount : 0;
                    const pid = await guardarPersona(client, { nombre: textos[0], entidad: textos[1], cargo: textos[2], email, telefono }, req.userSession.userId);
                    await ponerEnListas(client, pid, [id], true);
                    await client.query('RELEASE SAVEPOINT linea');
                    if (antes) ya++; else nuevas++;
                } catch (e) { await client.query('ROLLBACK TO SAVEPOINT linea'); malas.push(`${l.slice(0, 60)}: ${e.message}`); }
            }
            await client.query('COMMIT');
            res.json({ nuevas, ya, malas });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); }
        finally { client.release(); }
    });

    // ── Las personas (Personas → Contactos) ──
    router.get('/api/admin/listas/personas', ...gestion, async (req, res) => {
        try {
            const vals = [];
            const filtro = filtroNombreSQL(String(req.query.q || '').slice(0, 80), `(COALESCE(p.nombre, '') || ' ' || COALESCE(p.entidad, '') || ' ' || COALESCE(p.cargo, ''))`, vals, `COALESCE(p.email, '')`);
            const lista = Number(req.query.lista) || null;
            if (lista) vals.push(lista);
            const r = await pool.query(
                `SELECT p.*, COALESCE((SELECT array_agg(m.lista_id ORDER BY m.lista_id) FROM aim_listas_miembros m WHERE m.persona_id = p.id), '{}') AS listas
                 FROM aim_listas_personas p
                 WHERE TRUE ${filtro ? `AND ${filtro}` : ''} ${lista ? `AND EXISTS (SELECT 1 FROM aim_listas_miembros m WHERE m.persona_id = p.id AND m.lista_id = $${vals.length})` : ''}
                 ORDER BY COALESCE(p.nombre, p.entidad, p.email) LIMIT 500`, vals);
            res.set('Cache-Control', 'no-store');
            res.json({ personas: r.rows.map(mapPersona) });
        } catch (err) { fallo(res, err); }
    });
    router.post('/api/admin/listas/personas', ...gestion, express.json(), async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const id = await guardarPersona(client, req.body || {}, req.userSession.userId);
            await ponerEnListas(client, id, req.body?.listas, true);
            await client.query('COMMIT');
            res.status(201).json({ id });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); }
        finally { client.release(); }
    });
    router.patch('/api/admin/listas/personas/:id', ...gestion, express.json(), async (req, res) => {
        const client = await pool.connect();
        try {
            const id = idDe(req.params.id);
            await client.query('BEGIN');
            await guardarPersona(client, req.body || {}, req.userSession.userId, id);
            if (req.body?.listas !== undefined) await ponerEnListas(client, id, req.body.listas);
            await client.query('COMMIT');
            res.json({ success: true });
        } catch (err) { await client.query('ROLLBACK').catch(() => {}); fallo(res, err); }
        finally { client.release(); }
    });
    router.delete('/api/admin/listas/personas/:id', ...gestion, async (req, res) => {
        try { await pool.query(`DELETE FROM aim_listas_personas WHERE id = $1`, [idDe(req.params.id)]); res.json({ success: true }); } catch (err) { fallo(res, err); }
    });
    // Sus correos: los del buzón general (Gmail) y las campañas que se le mandaron.
    router.get('/api/admin/listas/personas/:id/correos', ...gestion, async (req, res) => {
        try {
            const p = (await pool.query(`SELECT email FROM aim_listas_personas WHERE id = $1`, [idDe(req.params.id)])).rows[0];
            if (!p) corta(404, 'Esa persona ya no está.');
            if (!p.email) return res.json({ disponible: true, correos: [], campanas: [] });
            const campanas = (await pool.query(
                `SELECT c.id, c.nombre, c.asunto, e.estado, e.enviado_at, e.clics, e.aperturas, e.baja_at
                 FROM aim_campana_envios e JOIN aim_campanas c ON c.id = e.campana_id
                 WHERE LOWER(e.email) = LOWER($1) ORDER BY COALESCE(e.enviado_at, c.created_at) DESC LIMIT 50`, [p.email]).catch(() => ({ rows: [] }))).rows;
            const r = await correosCon([p.email]).catch(() => null);
            res.set('Cache-Control', 'no-store');
            res.json({ disponible: r !== null, correos: r || [], campanas });
        } catch (err) { fallo(res, err); }
    });
    return router;
}
