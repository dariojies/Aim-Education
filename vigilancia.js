// ─────────────────────────────────────────────────────────────────────────────
// Vigilancia de los servicios, para el Equipo IT.
//
// Mientras corre el servidor se apunta, en memoria (se empieza de cero en cada
// reinicio o deploy):
//  · las tareas automáticas (cada setInterval de 30 s o más): cuándo se hizo la
//    última, cuánto tardó y si falló;
//  · los últimos errores y avisos del registro (console.error / console.warn);
//  · cuántas peticiones llegan por minuto, cuántas fallan (5xx) y cuántas tardan;
//  · y, cada pocos minutos, se comprueba de verdad cada servicio (base de datos,
//    web, correo, Gmail, Meta, pagos…) y se guarda su historial de 24 h.
//
// Las comprobaciones las define el servidor (necesitan sus piezas); aquí se
// lanzan, se cronometran y se guardan. Nunca se enseña una clave.
//
// Se instala al importarse (antes que el resto del servidor), para que vea todos
// los setInterval que se ponen después.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import { monitorEventLoopDelay } from 'perf_hooks';

const TAREAS = new Map();      // nombre → { nombre, cadaMs, veces, fallos, ultima, ultimaOk, duracionMs, error, errorAt, desde }
const REGISTRO = [];           // { t, nivel, etiqueta, texto, veces }
const PETICIONES = new Map();  // minuto → { n, e4, e5, lentas, ms }
const FALLOS_HTTP = [];        // las últimas peticiones con 5xx
const MAX_REGISTRO = 300;
const retardo = monitorEventLoopDelay({ resolution: 20 });
retardo.enable();

// El nombre de una tarea: el de su función o, si es anónima, la primera función
// a la que llama («() => { cerrarFichajesAbiertos()… }» → cerrarFichajesAbiertos).
const NO_NOMBRE = new Set(['async', 'function', 'catch', 'then', 'finally', 'setTimeout', 'Promise', 'console', 'resolve', 'reject', 'Date', 'Number', 'String', 'if', 'for', 'while', 'return', 'await', 'error', 'warn', 'log']);
function nombreDe(fn) {
    const n = String(fn.name || '').replace(/^bound /, '');
    if (n) return n;
    // Sin lo que va entre comillas (un «NOW()» de SQL no es una función).
    const src = String(fn).replace(/`[^`]*`|'[^'\n]*'|"[^"\n]*"/g, '""');
    // Primero una función suelta (no un método: «Date.now()» no da nombre)…
    for (const m of src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) if (!NO_NOMBRE.has(m[1])) return m[1];
    // …y si no, el primer método («sessions.entries»).
    const m = /([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)\s*\(/.exec(src);
    return m ? m[1] : 'tarea sin nombre';
}

(function instalar() {
    if (globalThis.__vigilanciaInstalada) return;
    globalThis.__vigilanciaInstalada = true;
    const original = globalThis.setInterval;
    globalThis.setInterval = function (fn, ms, ...resto) {
        if (typeof fn !== 'function' || !(Number(ms) >= 30_000)) return original(fn, ms, ...resto);
        // Solo las nuestras: las de las librerías (node_modules) no se apuntan.
        if (/node_modules/.test(String(new Error().stack || '').split('\n')[2] || '')) return original(fn, ms, ...resto);
        const nombre = nombreDe(fn);
        const t = TAREAS.get(nombre) || { nombre, cadaMs: ms, veces: 0, fallos: 0, ultima: null, ultimaOk: null, duracionMs: null, error: null, errorAt: null, desde: Date.now() };
        t.cadaMs = ms;
        TAREAS.set(nombre, t);
        const falla = (e, ini) => { t.fallos++; t.error = String(e?.message || e).slice(0, 300); t.errorAt = Date.now(); t.duracionMs = Date.now() - ini; };
        const envuelta = function (...a) {
            const ini = Date.now();
            t.ultima = ini; t.veces++;
            let r;
            try { r = fn.apply(this, a); } catch (e) { falla(e, ini); throw e; }
            if (r && typeof r.then === 'function') r.then(() => { t.duracionMs = Date.now() - ini; t.ultimaOk = Date.now(); }, (e) => falla(e, ini));
            else { t.duracionMs = Date.now() - ini; t.ultimaOk = Date.now(); }
            return r;
        };
        // Mismo nombre que la original (lo usa, por ejemplo, el arnés de pruebas).
        Object.defineProperty(envuelta, 'name', { value: fn.name });
        return original(envuelta, ms, ...resto);
    };
    for (const nivel of ['error', 'warn']) {
        const o = console[nivel].bind(console);
        console[nivel] = (...a) => { try { apuntar(nivel, a); } catch { /* que el registro nunca rompa nada */ } o(...a); };
    }
})();

function apuntar(nivel, args) {
    const texto = args.map(x => (x instanceof Error ? String(x.stack || x.message).split('\n').slice(0, 2).join(' · ')
        : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' ').replace(/\s+/g, ' ').slice(0, 600);
    const etiqueta = /^\[([^\]]{1,40})\]/.exec(texto)?.[1] || null;
    const ultimo = REGISTRO[REGISTRO.length - 1];
    // El mismo mensaje seguido se cuenta en vez de repetirse.
    if (ultimo && ultimo.texto === texto && ultimo.nivel === nivel && Date.now() - ultimo.t < 10 * 60_000) { ultimo.veces++; ultimo.t = Date.now(); return; }
    REGISTRO.push({ t: Date.now(), nivel, etiqueta, texto, veces: 1 });
    if (REGISTRO.length > MAX_REGISTRO) REGISTRO.shift();
}

// Middleware: cuenta las peticiones de la API (no los archivos de la web).
const rutaLimpia = (r) => r.split('?')[0].replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id').replace(/\/\d+(?=\/|$)/g, '/:n').replace(/\/[0-9a-f]{24,}(\.\w+)?/gi, '/:clave');
export function medirPeticiones(req, res, next) {
    const ruta = req.originalUrl || '';
    if (!/^\/(api|webhooks|publico)\//.test(ruta)) return next();
    const ini = process.hrtime.bigint();
    res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - ini) / 1e6;
        const min = Math.floor(Date.now() / 60_000);
        const b = PETICIONES.get(min) || { n: 0, e4: 0, e5: 0, lentas: 0, ms: 0 };
        b.n++; b.ms += ms;
        if (res.statusCode >= 500) b.e5++; else if (res.statusCode >= 400) b.e4++;
        if (ms >= 2000) b.lentas++;
        PETICIONES.set(min, b);
        if (PETICIONES.size > 1500) for (const k of PETICIONES.keys()) { if (k < min - 1440) PETICIONES.delete(k); else break; }
        if (res.statusCode >= 500) {
            FALLOS_HTTP.push({ t: Date.now(), metodo: req.method, ruta: rutaLimpia(ruta), estado: res.statusCode, ms: Math.round(ms) });
            if (FALLOS_HTTP.length > 50) FALLOS_HTTP.shift();
        }
    });
    next();
}

// El resumen de peticiones: por horas (24) y la última hora.
function resumenPeticiones() {
    const ahora = Math.floor(Date.now() / 60_000);
    const horas = Array.from({ length: 24 }, (_, i) => ({ hora: ahora - (23 - i) * 60, n: 0, e5: 0, e4: 0, lentas: 0, ms: 0 }));
    const ultimaHora = { n: 0, e5: 0, e4: 0, lentas: 0, ms: 0 };
    for (const [min, b] of PETICIONES) {
        const atras = ahora - min;
        if (atras < 0 || atras >= 1440) continue;
        const h = horas[23 - Math.floor(atras / 60)];
        for (const k of ['n', 'e5', 'e4', 'lentas', 'ms']) h[k] += b[k];
        if (atras < 60) for (const k of ['n', 'e5', 'e4', 'lentas', 'ms']) ultimaHora[k] += b[k];
    }
    const media = (x) => (x.n ? Math.round(x.ms / x.n) : null);
    return {
        porHora: horas.map(h => ({ desde: new Date(h.hora * 60_000).toISOString(), n: h.n, e5: h.e5, e4: h.e4, lentas: h.lentas, mediaMs: media(h) })),
        ultimaHora: { ...ultimaHora, mediaMs: media(ultimaHora) },
        fallos: [...FALLOS_HTTP].reverse(),
    };
}

// Cuánto se atasca el servidor (el p99 del retardo del bucle de eventos, en ms).
export const retardoBucle = () => Math.round(retardo.percentile(99) / 1e6);

// El estado de una tarea automática: atrasada si lleva más de dos vueltas sin
// hacerse; con error si la última vez falló.
function estadoTarea(t) {
    const ahora = Date.now(), margen = 2 * t.cadaMs + 60_000;
    if (t.errorAt && (!t.ultimaOk || t.errorAt > t.ultimaOk)) return 'error';
    if ((t.ultima || t.desde) < ahora - margen) return 'aviso';
    return 'ok';
}

export function crearVigilancia({ authenticateSession, requireSeccion, requirePermiso, comprobaciones: propias, interruptores, servidor }) {
    const router = express.Router();
    // Dos comprobaciones de aquí mismo: las tareas automáticas y las peticiones.
    const comprobaciones = [
        ...propias,
        { id: 'tareas', grupo: 'Sistema', nombre: 'Tareas automáticas', cadaMin: 5, fn: async () => {
            const ts = [...TAREAS.values()].map(t => ({ ...t, estado: estadoTarea(t) }));
            const mal = ts.filter(t => t.estado === 'error'), tarde = ts.filter(t => t.estado === 'aviso');
            return {
                estado: mal.length ? 'error' : tarde.length ? 'aviso' : 'ok',
                detalle: mal.length ? `Con error: ${mal.map(t => t.nombre).join(', ')}` : tarde.length ? `Atrasadas: ${tarde.map(t => t.nombre).join(', ')}` : `${ts.length} tareas, todas al día`,
            };
        } },
        { id: 'peticiones', grupo: 'Sistema', nombre: 'Peticiones a la web', cadaMin: 5, fn: async () => {
            const u = resumenPeticiones().ultimaHora;
            const tasa = u.n ? u.e5 / u.n : 0;
            return {
                estado: u.e5 >= 30 || (u.n >= 50 && tasa > 0.1) ? 'error' : u.e5 >= 5 || tasa > 0.02 ? 'aviso' : 'ok',
                detalle: `Última hora: ${u.n} peticiones, ${u.e5} fallos del servidor, ${u.lentas} lentas${u.mediaMs != null ? ` · ${u.mediaMs} ms de media` : ''}`,
            };
        } },
    ];
    const RESULTADOS = new Map();   // id → { …último resultado, historial: [{ t, estado, ms }] }
    const HISTORIAL = 288;           // 24 h a 5 minutos

    async function comprobar(c) {
        const ini = Date.now();
        let r;
        try {
            r = await Promise.race([
                c.fn(),
                new Promise((_, ko) => setTimeout(() => ko(new Error('No ha contestado en 15 s')), 15_000)),
            ]);
        } catch (e) { r = { estado: 'error', detalle: String(e?.message || e).slice(0, 300) }; }
        const ms = Date.now() - ini;
        const antes = RESULTADOS.get(c.id);
        const historial = [...(antes?.historial || []), { t: ini, estado: r.estado, ms }].slice(-HISTORIAL);
        // Desde cuándo está así (para «caído desde las 10:05»).
        const desde = antes && antes.estado === r.estado ? antes.desde : ini;
        RESULTADOS.set(c.id, { id: c.id, nombre: c.nombre, grupo: c.grupo, cadaMin: c.cadaMin, estado: r.estado, detalle: r.detalle || '', datos: r.datos || null, ms, comprobado: ini, desde, historial });
        if (antes && antes.estado !== r.estado && (r.estado === 'error' || antes.estado === 'error')) {
            console.warn(`[vigilancia] ${c.nombre}: ${antes.estado} → ${r.estado}${r.detalle ? ` (${r.detalle})` : ''}`);
        }
    }
    async function comprobarTodo(soloPendientes = false) {
        const ahora = Date.now();
        const toca = comprobaciones.filter(c => !soloPendientes || !RESULTADOS.has(c.id) || ahora - RESULTADOS.get(c.id).comprobado >= c.cadaMin * 60_000 - 5_000);
        await Promise.all(toca.map(comprobar));
    }
    let enMarcha = false;
    async function vigilarServicios() {
        if (enMarcha) return;
        enMarcha = true;
        try { await comprobarTodo(true); } finally { enMarcha = false; }
    }
    // La primera, al minuto de arrancar (que la base ya esté preparada).
    setTimeout(() => { vigilarServicios().catch(() => {}); }, 60_000);
    setInterval(function vigilarServiciosCadaMinuto() { vigilarServicios().catch(() => {}); }, 60_000);

    const ver = [authenticateSession, requireSeccion('equipo_it'), requirePermiso('editarEquipoIT')];
    async function estado() {
        const tareas = [...TAREAS.values()].map(t => ({ ...t, estado: estadoTarea(t) })).sort((a, b) => a.nombre.localeCompare(b.nombre));
        return {
            ahora: new Date().toISOString(),
            servicios: comprobaciones.map(c => RESULTADOS.get(c.id) || { id: c.id, nombre: c.nombre, grupo: c.grupo, cadaMin: c.cadaMin, estado: 'pendiente', detalle: 'Aún no se ha comprobado (la primera vez, al minuto de arrancar).', historial: [] }),
            tareas,
            peticiones: resumenPeticiones(),
            registro: [...REGISTRO].reverse(),
            interruptores: await interruptores().catch(e => [{ nombre: 'No se han podido leer', activo: false, detalle: e.message }]),
            servidor: {
                ...(await servidor()),
                arrancado: new Date(Date.now() - process.uptime() * 1000).toISOString(),
                memoriaMb: Math.round(process.memoryUsage().rss / 1048576),
                retardoMs: Math.round(retardo.percentile(99) / 1e6),
                node: process.version,
                dyno: process.env.DYNO || null,
            },
        };
    }
    router.get('/api/admin/vigilancia', ...ver, async (req, res) => {
        try { res.set('Cache-Control', 'no-store'); res.json(await estado()); } catch (err) { res.status(500).json({ error: err.message }); }
    });
    router.post('/api/admin/vigilancia/comprobar', ...ver, async (req, res) => {
        try {
            const id = String(req.body?.id || '');
            const una = comprobaciones.find(c => c.id === id);
            if (una) await comprobar(una); else await comprobarTodo(false);
            res.json(await estado());
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Para la campanita: lo que ahora mismo está con error.
    const caidos = () => [...RESULTADOS.values()].filter(r => r.estado === 'error').map(r => ({ id: r.id, nombre: r.nombre, desde: r.desde }));
    return { router, caidos, comprobarTodo };
}
