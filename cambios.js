// ─────────────────────────────────────────────────────────────────────────────
// Registro de cambios (ticket #397): qué se publica en cada deploy.
//
// Cada deploy nuevo deja su entrada al arrancar (resolverEsperaDeploy, en el
// servidor): cuándo se compiló y se publicó, el commit, los tickets que pasaron
// de «Espera de deploy» a «Resuelto» y, si hay GITHUB_TOKEN, los commits que
// trae respecto al deploy anterior. El Equipo IT (y los superadmin) le ponen un
// título y un texto, y pueden añadir entradas a mano (un cambio de ajustes de
// Heroku, por ejemplo). Secretaría y dirección lo leen. Es solo del personal.
//
// Sin tablas nuevas: una fila de aim_ajustes por entrada, con la clave
// 'cambios:<id del deploy>' (las hechas a mano, 'cambios:m-<uuid>'). Así editar
// una no reescribe las demás.
//
// El token de GitHub (de solo lectura) nunca se enseña ni se escribe en el log.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import express from 'express';

export const REPO_GITHUB = 'dariojies/Aim-Education';
const PREFIJO = 'cambios:';
const ES_SHA = /^[0-9a-f]{7,40}$/i;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ES_ID = new RegExp(`^(m-)?${UUID}$`, 'i');
const MAX_COMMITS = 100;
const MAX_TITULO = 150;
const MAX_TEXTO = 4000;

const limpio = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
export const shaValido = (s) => (typeof s === 'string' && ES_SHA.test(s) ? s.toLowerCase() : null);

export function crearCambios({ pool, authenticateSession, requireSeccion, requirePermiso, permisos,
    fetch: fetchImpl = (...a) => globalThis.fetch(...a), token = () => process.env.GITHUB_TOKEN || '' }) {
    const router = express.Router();

    const leer = async (id) => (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = $1`, [PREFIJO + id])).rows[0]?.valor || null;

    // La entrada de un deploy nuevo. Se llama una sola vez por deploy (cuando el
    // servidor lo ve por primera vez) y nada más apuntarlo: si el arranque se
    // corta después, el deploy ya tiene su entrada. Si ya existía, no la pisa.
    async function crearEntradaDeploy({ deployId, compilado = null, commit = null, release = null }) {
        if (!ES_ID.test(String(deployId || '')) || String(deployId).startsWith('m-')) throw new Error('Id de deploy no válido.');
        commit = shaValido(commit);
        // El commit del último deploy con commit: lo que hay entre los dos es lo nuevo.
        const ant = commit ? (await pool.query(
            `SELECT valor->>'commit' AS commit FROM aim_ajustes
             WHERE clave LIKE 'cambios:%' AND clave <> $1 AND valor->>'origen' = 'deploy' AND valor->>'commit' IS NOT NULL
             ORDER BY (valor->>'publicado')::timestamptz DESC LIMIT 1`, [PREFIJO + deployId])).rows[0]?.commit : null;
        const valor = {
            deployId,
            compilado: compilado && !Number.isNaN(Date.parse(compilado)) ? new Date(compilado).toISOString() : null,
            publicado: new Date().toISOString(),
            commit,
            commitAnterior: shaValido(ant) && ant !== commit ? ant : null,
            release: release ? String(release).replace(/^v/i, '').slice(0, 20) : null,
            tickets: [],
            commits: [],
            titulo: '',
            texto: '',
            origen: 'deploy',
        };
        const r = await pool.query(
            `INSERT INTO aim_ajustes (clave, valor, actualizado_at) VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (clave) DO NOTHING RETURNING clave`, [PREFIJO + deployId, JSON.stringify(valor)]);
        return r.rowCount ? valor : null;
    }

    // Los tickets que ha resuelto el deploy: [{ id, asunto, categoria }].
    async function anotarTickets(deployId, tickets) {
        const lista = (tickets || []).map(t => ({ id: Number(t.id), asunto: limpio(t.asunto, 200), categoria: t.categoria || null }))
            .filter(t => Number.isInteger(t.id));
        await pool.query(
            `UPDATE aim_ajustes SET valor = jsonb_set(valor, '{tickets}', $2::jsonb) WHERE clave = $1`,
            [PREFIJO + deployId, JSON.stringify(lista)]);
        return lista;
    }

    // Los commits entre el deploy anterior y este, de la API de GitHub (comparar
    // dos commits). Solo el primer renglón de cada mensaje y sin los de «merge».
    async function cargarCommits(id) {
        // El repositorio es público: sin token también contesta (con un límite de
        // consultas por hora); con GITHUB_TOKEN, sin ese límite.
        const tk = token();
        const e = await leer(id);
        if (!e) return { omitido: 'no existe' };
        const base = shaValido(e.commitAnterior), cabeza = shaValido(e.commit);
        if (!base || !cabeza) return { omitido: 'sin commit anterior' };
        const r = await fetchImpl(`https://api.github.com/repos/${REPO_GITHUB}/compare/${base}...${cabeza}`, {
            headers: {
                Accept: 'application/vnd.github+json',
                ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'aim-education-cambios',
            },
            signal: AbortSignal.timeout(10_000),
        });
        if (r.status === 401 || r.status === 403) throw Object.assign(new Error(`GitHub respondió ${r.status}`), { token: true });
        if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
        const d = await r.json();
        const commits = (Array.isArray(d?.commits) ? d.commits : [])
            .filter(c => !(Array.isArray(c?.parents) && c.parents.length > 1))
            .map(c => ({ sha: shaValido(c?.sha), mensaje: limpio(String(c?.commit?.message || '').split('\n')[0], 200) }))
            .filter(c => c.sha && c.mensaje)
            .reverse()                       // el más reciente primero
            .slice(0, MAX_COMMITS);
        await pool.query(
            `UPDATE aim_ajustes SET valor = jsonb_set(valor, '{commits}', $2::jsonb) WHERE clave = $1`,
            [PREFIJO + id, JSON.stringify(commits)]);
        return { commits: commits.length };
    }

    // Al arrancar, sin esperar ni tumbar nada: si GitHub falla, la entrada se
    // queda con sus tickets y el enlace para comparar.
    function cargarCommitsEnSegundoPlano(id) {
        cargarCommits(id).catch(err => console.warn('[cambios] no se pudieron leer los commits de GitHub:', err?.message || err));
    }

    // ── API del panel ──
    const ver = [authenticateSession, requireSeccion('cambios')];
    const editar = [...ver, requirePermiso('editarCambios')];
    const idDe = (req, res) => {
        const id = String(req.params.id || '');
        if (!ES_ID.test(id)) { res.status(400).json({ error: 'Entrada no válida.' }); return null; }
        return id;
    };

    router.get('/api/admin/cambios', ...ver, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT a.clave, a.valor, a.actualizado_at, TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) AS editor
                 FROM aim_ajustes a LEFT JOIN users u ON u.user_id = a.actualizado_por
                 WHERE a.clave LIKE 'cambios:%'
                 ORDER BY (a.valor->>'publicado')::timestamptz DESC NULLS LAST LIMIT 300`);
            res.set('Cache-Control', 'no-store');
            res.json({
                entradas: r.rows.map(x => ({
                    ...x.valor,
                    id: x.clave.slice(PREFIJO.length),
                    tickets: x.valor.tickets || [],
                    commits: x.valor.commits || [],
                    editadoPor: x.editor || null,
                    actualizado: x.actualizado_at,
                })),
                puedeEditar: !!permisos(req).editarCambios,
                conGithub: true,
                conToken: !!token(),
                repo: REPO_GITHUB,
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Una entrada a mano: algo que se ha cambiado sin deploy, o una nota.
    router.post('/api/admin/cambios', ...editar, async (req, res) => {
        const titulo = limpio(req.body?.titulo, MAX_TITULO), texto = limpio(req.body?.texto, MAX_TEXTO);
        if (!titulo && !texto) return res.status(400).json({ error: 'Pon un título o un texto.' });
        const id = `m-${crypto.randomUUID()}`;
        const valor = {
            deployId: null, compilado: null, publicado: new Date().toISOString(), commit: null, commitAnterior: null, release: null,
            tickets: [], commits: [], titulo, texto, origen: 'manual',
        };
        try {
            await pool.query(`INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ($1, $2::jsonb, NOW(), $3)`,
                [PREFIJO + id, JSON.stringify(valor), req.userSession.userId]);
            res.status(201).json({ success: true, id });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Título y texto (de un deploy o de una a mano). Lo demás lo pone el servidor.
    router.put('/api/admin/cambios/:id', ...editar, async (req, res) => {
        const id = idDe(req, res); if (!id) return;
        const titulo = limpio(req.body?.titulo, MAX_TITULO), texto = limpio(req.body?.texto, MAX_TEXTO);
        try {
            const r = await pool.query(
                `UPDATE aim_ajustes SET valor = valor || jsonb_build_object('titulo', $2::text, 'texto', $3::text),
                        actualizado_at = NOW(), actualizado_por = $4
                 WHERE clave = $1 RETURNING clave`, [PREFIJO + id, titulo, texto, req.userSession.userId]);
            if (!r.rowCount) return res.status(404).json({ error: 'Esa entrada ya no existe.' });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Solo se borran las hechas a mano: las de un deploy son el registro de lo publicado.
    router.delete('/api/admin/cambios/:id', ...editar, async (req, res) => {
        const id = idDe(req, res); if (!id) return;
        try {
            const r = await pool.query(`DELETE FROM aim_ajustes WHERE clave = $1 AND valor->>'origen' = 'manual' RETURNING clave`, [PREFIJO + id]);
            if (r.rowCount) return res.json({ success: true });
            const existe = await leer(id);
            res.status(existe ? 409 : 404).json({ error: existe ? 'Las entradas de un deploy no se borran.' : 'Esa entrada ya no existe.' });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Volver a pedir los commits a GitHub (si al arrancar falló, o se ha puesto el token después).
    router.post('/api/admin/cambios/:id/commits', ...editar, async (req, res) => {
        const id = idDe(req, res); if (!id) return;
        try {
            const r = await cargarCommits(id);
            if (r.omitido === 'no existe') return res.status(404).json({ error: 'Esa entrada ya no existe.' });
            if (r.omitido) return res.status(400).json({ error: 'Esta entrada no tiene un deploy anterior con el que comparar.' });
            res.json({ success: true, commits: r.commits });
        } catch (err) {
            console.warn('[cambios] recargar commits:', err?.message || err);
            res.status(502).json({ error: err?.token
                ? (token() ? 'El token de GitHub no vale o ha caducado: hay que renovarlo en Heroku (GITHUB_TOKEN).' : 'GitHub ha limitado las consultas sin token: prueba dentro de un rato.')
                : 'GitHub no ha contestado bien. Prueba más tarde.' });
        }
    });

    return { router, crearEntradaDeploy, anotarTickets, cargarCommits, cargarCommitsEnSegundoPlano };
}
