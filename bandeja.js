// ─────────────────────────────────────────────────────────────────────────────
// Bandeja de correo del CRM (ticket #317). Dos buzones por persona como mucho:
//   · el general del club (info@, el de EMAIL_USER / EMAIL_PASS), que ve solo
//     secretaría y dirección (correoGeneral, #449), nunca un profe ni un trabajador;
//   · el suyo. Solo lo ve su dueño: el servidor elige el buzón por el correo con
//     el que se ha entrado a la app, nunca por lo que pida la pantalla.
// Cómo se entra en cada buzón:
//   · con la cuenta de servicio de Google Workspace (#449, GOOGLE_CUENTA_SERVICIO
//     en Heroku, con delegación en todo el dominio): cualquier cuenta
//     @aimeducation.es, sin contraseñas. Un profe nuevo con su cuenta del dominio
//     ya tiene su correo aquí; si se va, se suspende su cuenta en Workspace y deja
//     de funcionar. Por eso un correo del dominio en una ficha solo lo pone la
//     dirección (si no, cualquiera se pondría el de otro);
//   · o con una contraseña de aplicación (variables BUZON_<LO_QUE_SEA> = «correo
//     contraseña»), lo de antes: si existe para ese correo, manda.
// Nada de esto se guarda en la base de datos.
//
// Los correos no se copian a la base: se leen de Gmail al momento (IMAP) y se
// envían por Gmail (SMTP), así quedan en «Enviados» como siempre. Asignar un
// correo de info@ a un compañero es una etiqueta de Gmail («AIM-nombre»), así
// que también se ve desde Gmail.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import express from 'express';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';

const IMAP_HOST = () => process.env.IMAP_HOST || 'imap.gmail.com';
const POR_PAGINA = 30;
const ETIQUETA_HECHO = 'AIM-hecho';

// «patricia.sabu@x.es abcd efgh ijkl mnop» → { email, pass }. La contraseña de
// aplicación se puede pegar con o sin espacios.
function leerBuzon(valor) {
    const partes = String(valor || '').trim().split(/\s+/);
    if (partes.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partes[0])) return null;
    return { email: partes[0].toLowerCase(), pass: partes.slice(1).join('') };
}
export function buzonesPersonales() {
    return Object.entries(process.env)
        .filter(([k]) => /^BUZON_/i.test(k))
        .map(([k, v]) => ({ variable: k, ...leerBuzon(v) }))
        .filter(b => b.email && b.pass);
}
// ── La cuenta de servicio de Google Workspace (#449) ──
// GOOGLE_CUENTA_SERVICIO: el JSON de su clave tal cual (o en base64). Con la
// delegación de todo el dominio para https://mail.google.com/, el servidor pide
// a Google un permiso de una hora para el buzón de una persona del dominio y
// entra con él (IMAP y SMTP con XOAUTH2).
export function cuentaServicio() {
    const v = String(process.env.GOOGLE_CUENTA_SERVICIO || '').trim();
    if (!v) return null;
    try {
        const j = JSON.parse(v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf8'));
        return j.client_email && j.private_key ? { email: j.client_email, clave: String(j.private_key).replace(/\\n/g, '\n') } : null;
    } catch { return null; }
}
export const dominioCorreo = () => String(process.env.CORREO_DOMINIO || 'aimeducation.es').trim().toLowerCase().replace(/^@/, '');
export const esDelDominio = (email) => String(email || '').trim().toLowerCase().endsWith(`@${dominioCorreo()}`);
const permisosGoogle = new Map(); // correo → { token, hasta }
async function tokenGoogle(email) {
    const g = permisosGoogle.get(email);
    if (g && g.hasta > Date.now() + 120_000) return g.token;
    const cs = cuentaServicio();
    if (!cs) throw Object.assign(new Error('Falta la cuenta de servicio (GOOGLE_CUENTA_SERVICIO).'), { google: true });
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const ahora = Math.floor(Date.now() / 1000);
    const sinFirma = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: cs.email, sub: email, scope: 'https://mail.google.com/', aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 })}`;
    const firma = crypto.createSign('RSA-SHA256').update(sinFirma).sign(cs.clave, 'base64url');
    const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${sinFirma}.${firma}` }),
        signal: AbortSignal.timeout(10_000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) {
        // «invalid_grant · Invalid email or User ID»: esa cuenta no existe en
        // Workspace (o está suspendida). Lo demás es la configuración.
        // Google dice lo mismo si la que no existe es la cuenta de servicio: se
        // comprueba con el general (que existe seguro) antes de echarle la culpa a la persona.
        let sinBuzon = d.error === 'invalid_grant' && /email|user/i.test(d.error_description || '');
        if (sinBuzon && email !== correoGeneral() && esDelDominio(correoGeneral())) {
            sinBuzon = await tokenGoogle(correoGeneral()).then(() => true, () => false);
        }
        throw Object.assign(new Error(`Google: ${d.error || r.status}${d.error_description ? ` (${d.error_description})` : ''}`), { google: true, sinBuzon });
    }
    permisosGoogle.set(email, { token: d.access_token, hasta: Date.now() + (Number(d.expires_in) || 3600) * 1000 });
    return d.access_token;
}
const auth = async (buzon) => (buzon.oauth ? { user: buzon.email, accessToken: await tokenGoogle(buzon.email) } : { user: buzon.email, pass: buzon.pass });

const correoGeneral = () => String(process.env.EMAIL_USER || '').trim().toLowerCase();
const buzonGeneral = () => {
    const email = correoGeneral();
    if (!email) return null;
    if (process.env.EMAIL_PASS) return { email, pass: process.env.EMAIL_PASS, general: true };
    return cuentaServicio() && esDelDominio(email) ? { email, oauth: true, general: true } : null;
};
// El buzón propio de alguien: el de su contraseña de aplicación o, con la cuenta
// de servicio, el de su cuenta del dominio. Nunca el general por esta vía.
const buzonDe = (email) => {
    const e = String(email || '').trim().toLowerCase();
    const b = buzonesPersonales().find(x => x.email === e);
    if (b) return b;
    if (e && e !== correoGeneral() && cuentaServicio() && esDelDominio(e)) return { email: e, oauth: true };
    return null;
};

// La etiqueta de asignación de una persona: «AIM-patricia-jimenez».
export function etiquetaDe(nombre) {
    const slug = String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 2).join('-');
    return `AIM-${slug || 'sin-nombre'}`;
}

// Las conexiones con Gmail se reutilizan mientras se usan (#337): abrir una
// nueva en cada clic tardaba un segundo largo. Se cierran solas a los 2 minutos
// sin uso, y si una falla se tira y se abre otra.
// Una conexión de Gmail hace las cosas de una en una. Por eso las búsquedas
// largas (el buzón de la ficha, las respuestas a campañas: 8-9 s en «Todos»)
// van por otra, y la prueba de la vigilancia por otra más: si no, Correo se
// quedaba esperando detrás, y la vigilancia daba el buzón por caído.
const conexiones = new Map(); // «email|canal» → { client, pass, cierre, abriendo, enUso }
const INACTIVA_MS = 120_000;
// La de Correo aguanta más (#477): conectar con Gmail tarda de 1 a 7 segundos, y con
// 2 minutos casi cada vez que alguien abría Correo había que volver a conectar.
const INACTIVA_CORREO_MS = 20 * 60_000;
const claveDe = (buzon, canal) => `${buzon.email}|${canal}`;
async function conexion(buzon, canal) {
    const k = claveDe(buzon, canal);
    const c = conexiones.get(k);
    if (c && c.pass === buzon.pass) {
        if (c.abriendo) await c.abriendo.catch(() => {});
        if (c.client?.usable) { clearTimeout(c.cierre); c.enUso++; return c.client; }
        conexiones.delete(k);
    }
    // Con tiempos máximos (#362): sin ellos, si Gmail tardaba en contestar, la
    // petición se quedaba colgada y Heroku la cortaba a los 30 s con un 503.
    const client = new ImapFlow({
        host: IMAP_HOST(), port: 993, secure: true, logger: false,
        auth: await auth(buzon),
        connectionTimeout: 12_000, greetingTimeout: 8_000, socketTimeout: 60_000,
    });
    client.on('error', () => { if (conexiones.get(k)?.client === client) conexiones.delete(k); }); // un corte de red no tumba el servidor
    client.on('close', () => { if (conexiones.get(k)?.client === client) conexiones.delete(k); });
    const entrada = { client, pass: buzon.pass, cierre: null, abriendo: client.connect(), enUso: 1 };
    conexiones.set(k, entrada);
    try { await entrada.abriendo; } catch (e) { if (conexiones.get(k) === entrada) conexiones.delete(k); throw e; }
    entrada.abriendo = null;
    return client;
}
// ¿El fallo es de la conexión (y no del correo)? Gmail cierra las conexiones que
// llevan rato quietas sin avisar: la guardada parece viva y falla al usarla
// («Connection not available»). Con esos, se abre otra y se repite (#362).
const fallaConexion = (e) => /Connection not available|NoConnection|closed|ECONNRESET|EPIPE|ETIMEDOUT|socket|timed? ?out|Unexpected close/i
    .test(`${e?.code || ''} ${e?.message || e}`);
function tirar(buzon, canal, client) {
    const k = claveDe(buzon, canal);
    if (conexiones.get(k)?.client === client) conexiones.delete(k);
    try { client.close(); } catch { /* ya estaba cerrada */ }
}
// canal: 'correo' (lo que se pulsa en Correo), 'busquedas' o 'vigilancia'.
async function conImap(buzon, fn, canal = 'correo', intento = 1) {
    let client;
    try { client = await conexion(buzon, canal); }
    catch (e) {
        if (intento === 1 && fallaConexion(e)) return conImap(buzon, fn, canal, 2);
        throw e;
    }
    let reintentar = false;
    try { return await fn(client); }
    catch (e) {
        // Si la conexión se ha estropeado, fuera: se abre otra y se prueba una vez más.
        if (!client.usable || fallaConexion(e)) {
            tirar(buzon, canal, client);
            reintentar = intento === 1;
        }
        if (!reintentar) throw e;
    } finally {
        // Se cierra a los 2 minutos sin uso, contados desde que acaba lo último:
        // antes el reloj lo ponía cualquiera que acabase, aunque otro siguiera
        // usándola, y podía cerrársela en medio.
        const c = conexiones.get(claveDe(buzon, canal));
        if (c?.client === client && --c.enUso <= 0) {
            c.enUso = 0;
            clearTimeout(c.cierre);
            c.cierre = setTimeout(() => {
                if (conexiones.get(claveDe(buzon, canal)) === c && !c.enUso) { conexiones.delete(claveDe(buzon, canal)); client.logout().catch(() => {}); }
            }, canal === 'correo' ? INACTIVA_CORREO_MS : INACTIVA_MS);
            c.cierre.unref?.();
        }
    }
    return conImap(buzon, fn, canal, 2);
}
// Correo siempre a punto (#477). Gmail cierra sin avisar las conexiones que llevan
// un rato quietas; un NOOP cada pocos minutos las mantiene. La del buzón general
// (el que más se usa) se abre al arrancar y, si se cae, se vuelve a abrir aquí;
// las de los buzones propios viven mientras se usan (20 minutos sin uso).
export async function calentarCorreo(buzon = buzonGeneral()) {
    if (!buzon) return;
    await conImap(buzon, async (client) => { await carpetas(client); }, 'correo').catch(() => {});
}
export async function mantenerCorreoVivo() {
    const general = buzonGeneral();
    if (general) await conImap(general, async (client) => { await carpetas(client); await client.noop(); }, 'correo').catch(() => {});
    for (const [k, c] of conexiones) {
        if (!k.endsWith('|correo') || (general && k === claveDe(general, 'correo'))) continue;
        if (c.client?.usable && !c.enUso && !c.abriendo) c.client.noop().catch(() => {});
    }
}

// Las carpetas de cada buzón no cambian: se miran una vez por conexión.
const carpetasCache = new WeakMap();
// Las carpetas especiales de Gmail (sus nombres cambian con el idioma).
async function carpetas(client) {
    if (carpetasCache.has(client)) return carpetasCache.get(client);
    const lista = await client.list();
    const por = (uso) => lista.find(m => m.specialUse === uso)?.path || null;
    const r = { entrada: 'INBOX', enviados: por('\\Sent'), todos: por('\\All'), papelera: por('\\Trash'), spam: por('\\Junk') };
    carpetasCache.set(client, r);
    return r;
}

// La carpeta de verdad de cada vista (las de etiquetas viven en «Todos»).
const carpetaDe = (c, v) => (v === 'enviados' ? c.enviados : v === 'todos' ? c.todos : v === 'spam' ? c.spam : c.entrada);

// Para la vigilancia del Equipo IT: ¿se puede entrar en cada buzón de Gmail?
// Usa la misma conexión que el correo (si ya está abierta, solo un NOOP).
// Con la cuenta de servicio (#449), además: ¿Google le da permiso? Se prueba
// con el general (es del dominio), sin abrir el buzón.
export async function probarBuzones() {
    const lista = [buzonGeneral(), ...buzonesPersonales()].filter(Boolean);
    const cs = cuentaServicio();
    const prueba = cs && esDelDominio(correoGeneral()) ? (async () => {
        const ini = Date.now();
        try { await tokenGoogle(correoGeneral()); return { email: `cuenta de servicio (${cs.email})`, general: false, ok: true, ms: Date.now() - ini }; }
        catch (e) { return { email: `cuenta de servicio (${cs.email})`, general: false, ok: false, error: String(e?.message || e).slice(0, 200) }; }
    })() : null;
    if (process.env.GOOGLE_CUENTA_SERVICIO && !cs) return [{ email: 'cuenta de servicio', general: false, ok: false, error: 'GOOGLE_CUENTA_SERVICIO no es el JSON de una clave.' },
        ...(await probarBuzonesImap(lista))];
    return [...(await probarBuzonesImap(lista)), ...(prueba ? [await prueba] : [])];
}
async function probarBuzonesImap(lista) {
    return Promise.all(lista.map(async (b) => {
        const ini = Date.now();
        const probar = () => conImap(b, async (client) => { await client.noop(); }, 'vigilancia');
        try {
            // Un «no» suelto de Gmail no es una avería: se prueba otra vez a los
            // pocos segundos (salvo si es la contraseña, que no se arregla sola).
            try { await probar(); } catch (e) {
                if (e?.authenticationFailed) throw e;
                await new Promise(ok => setTimeout(ok, 4000));
                await probar();
            }
            return { email: b.email, general: !!b.general, ok: true, ms: Date.now() - ini };
        } catch (e) {
            return { email: b.email, general: !!b.general, ok: false, error: motivoImap(e, b).slice(0, 300) };
        }
    }));
}
// «Command failed» es lo que dice la librería cuando Gmail contesta que no; el
// porqué va aparte (responseText). Se dan los dos, y la pista si es la contraseña.
function motivoImap(e, b) {
    const gmail = String(e?.responseText || '').trim();
    const base = [String(e?.message || e), gmail && gmail !== e?.message ? `Gmail: ${gmail}` : null].filter(Boolean).join(' · ');
    if (e?.authenticationFailed) {
        return `${base} · ${b.oauth ? 'Google no deja entrar a la cuenta de servicio en este buzón.' : 'Gmail no acepta la contraseña de aplicación: ¿se ha cambiado la contraseña de la cuenta o se ha borrado esa contraseña de aplicación?'}`;
    }
    return base;
}

// Respuestas a un correo de campaña (#341): las campañas salen con «responder a»
// el buzón general, así que se buscan ahí, en «Todos» (también lo archivado),
// por el asunto y desde el día del envío. Cuenta quién de `emails` escribió.
// Devuelve null si no hay buzón general conectado.
export async function buscarRespuestas({ asunto, desde, emails }) {
    const buzon = buzonGeneral();
    if (!buzon) return null;
    const quienes = new Set([...emails].map(e => String(e || '').toLowerCase()));
    // El trozo fijo más largo del asunto (los {nombre} cambian en cada correo).
    const fijo = String(asunto || '').split(/\{\w+\}/).map(x => x.replace(/["\\]/g, ' ').trim()).sort((a, b) => b.length - a.length)[0] || '';
    const dia = new Date(desde || Date.now());
    return conImap(buzon, async (client) => {
        const c = await carpetas(client);
        const lock = await client.getMailboxLock(c.todos || c.entrada);
        try {
            const gmail = client.capabilities?.has?.('X-GM-EXT-1');
            const criterio = gmail
                ? { gmraw: `${fijo.length >= 4 ? `subject:"${fijo}" ` : ''}after:${Math.floor(dia.getTime() / 1000)} -from:me` }
                : { since: dia, ...(fijo.length >= 4 ? { subject: fijo } : {}) };
            const uids = ((await client.search(criterio, { uid: true })) || []).sort((a, b) => b - a).slice(0, 500);
            const r = new Map();
            if (uids.length) {
                for await (const m of client.fetch(uids, { uid: true, envelope: true }, { uid: true })) {
                    const de = String(m.envelope?.from?.[0]?.address || '').toLowerCase();
                    const fecha = m.envelope?.date ? new Date(m.envelope.date) : null;
                    if (!quienes.has(de) || (fecha && fecha < dia)) continue;
                    if (!r.has(de) || (fecha && fecha < r.get(de))) r.set(de, fecha);
                }
            }
            return r;
        } finally { lock.release(); }
    }, 'busquedas');
}

// Los correos del buzón general con unas direcciones (#341, historial de la
// ficha): los que escribieron y los que se les mandaron, los más recientes.
// null si no hay buzón general conectado.
// Buscar en todo Gmail tarda (8-9 s): se guarda 5 minutos por familia.
const correosConCache = new Map();
export async function correosCon(emails, max = 40) {
    const buzon = buzonGeneral();
    const lista = [...new Set(emails.map(e => String(e || '').toLowerCase().replace(/[^a-z0-9@._+-]/g, '')).filter(e => e.includes('@')))];
    if (!buzon) return null;
    if (!lista.length) return [];
    const clave = [...lista].sort().join(',');
    const guardado = correosConCache.get(clave);
    if (guardado && Date.now() - guardado.t < 5 * 60_000) return guardado.v;
    const v = await buscarCorreosCon(buzon, lista, max);
    correosConCache.set(clave, { v, t: Date.now() });
    while (correosConCache.size > 200) correosConCache.delete(correosConCache.keys().next().value);
    return v;
}
async function buscarCorreosCon(buzon, lista, max) {
    return conImap(buzon, async (client) => {
        const c = await carpetas(client);
        const lock = await client.getMailboxLock(c.todos || c.entrada);
        try {
            const gmail = client.capabilities?.has?.('X-GM-EXT-1');
            const criterio = gmail
                ? { gmraw: `{${lista.map(e => `from:${e} to:${e} cc:${e}`).join(' ')}}` }
                : { or: lista.flatMap(e => [{ from: e }, { to: e }]) };
            const uids = ((await client.search(criterio, { uid: true })) || []).sort((a, b) => b - a).slice(0, max);
            const r = [];
            if (uids.length) {
                for await (const m of client.fetch(uids, { uid: true, envelope: true }, { uid: true })) {
                    const de = direccion(m.envelope?.from?.[0]);
                    const para = [...(m.envelope?.to || []), ...(m.envelope?.cc || [])].map(direccion);
                    if (!lista.includes(de?.email) && !para.some(x => lista.includes(x?.email))) continue;
                    r.push({ uid: m.uid, fecha: m.envelope?.date || null, de, para, asunto: m.envelope?.subject || '(sin asunto)', entrante: lista.includes(de?.email) });
                }
            }
            return r.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        } finally { lock.release(); }
    }, 'busquedas');
}

const direccion = (a) => (a ? { nombre: a.name || '', email: String(a.address || '').toLowerCase() } : null);
const conAdjuntos = (bs) => {
    let hay = false;
    const mirar = (n) => {
        if (!n) return;
        if (n.disposition === 'attachment' || (n.dispositionParameters?.filename && n.disposition !== 'inline')) hay = true;
        (n.childNodes || []).forEach(mirar);
    };
    mirar(bs);
    return hay;
};

export function crearRouterBandeja({ pool, permisos, companeros, fichaDe }) {
    const router = express.Router();
    // Las listas recordadas (#477): «correo|vista|página|búsqueda|quién» → { v, t }.
    const listas = new Map();
    const LISTA_MS = 45_000;
    const olvidarListas = (email) => { for (const k of listas.keys()) if (!email || k.startsWith(`${email}|`)) listas.delete(k); };
    // Cualquier cambio (marcar, asignar, enviar, reglas…) olvida las listas de ese buzón.
    router.use((req, res, next) => {
        if (req.method !== 'GET') res.on('finish', () => olvidarListas(null));
        next();
    });

    // ── Reglas de asignación (#339): «todos los de este remitente, a X» ──
    // remitente: un correo («ana@x.es») o un dominio entero («@colegio.es»).
    async function reglas() {
        const r = await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = 'bandeja_reglas'`);
        return Array.isArray(r.rows[0]?.valor) ? r.rows[0].valor : [];
    }
    async function guardarReglas(lista, userId) {
        await pool.query(
            `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ('bandeja_reglas', $1::jsonb, NOW(), $2)
             ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = EXCLUDED.actualizado_por`,
            [JSON.stringify(lista), userId || null]);
    }
    const casa = (regla, email) => {
        const e = String(email || '').toLowerCase();
        return regla.remitente.startsWith('@') ? e.endsWith(regla.remitente) : e === regla.remitente;
    };
    // La regla que le toca a un remitente (la de su correo manda sobre la del dominio).
    const reglaDe = (lista, email) => lista.find(r => !r.remitente.startsWith('@') && casa(r, email)) || lista.find(r => casa(r, email)) || null;

    // El general (info@) solo para secretaría y dirección (#449): un profe o un
    // trabajador tiene «Correo» para ver el suyo.
    const veGeneral = (req) => !!permisos(req)?.correoGeneral;
    // Qué buzón es: 'general' o 'mio'. Nunca el de otra persona.
    function resolver(req, res) {
        const cual = req.params.buzon;
        if (cual === 'general') {
            if (!veGeneral(req)) { res.status(403).json({ error: 'El buzón general es de secretaría y dirección.' }); return null; }
            const b = buzonGeneral();
            if (!b) { res.status(503).json({ error: 'El buzón general no está conectado (faltan EMAIL_USER y EMAIL_PASS en Heroku).' }); return null; }
            return b;
        }
        if (cual === 'mio') {
            const b = buzonDe(req.userSession.email);
            if (!b) { res.status(404).json({ error: `Tu cuenta (${req.userSession.email}) no tiene un buzón de @${dominioCorreo()} conectado.` }); return null; }
            return b;
        }
        res.status(404).json({ error: 'Ese buzón no existe.' });
        return null;
    }
    const error = (res, e) => {
        const m = String(e?.responseText || e?.message || e);
        if (e?.sinBuzon) return res.status(404).json({ error: `Esa cuenta no tiene buzón en Google Workspace (o está suspendida). Si es nueva, puede tardar unos minutos.` });
        if (e?.google) { console.warn('[bandeja] cuenta de servicio:', m); return res.status(502).json({ error: 'Google no deja entrar en el buzón con la cuenta de servicio. Avisa a IT (ticket #449).' }); }
        const auth = /AUTHENTICATIONFAILED|Invalid credentials|authenticate|Application-specific/i.test(m);
        if (auth) return res.status(502).json({ error: 'Gmail no acepta la contraseña de este buzón: hay que crear otra (ticket #317).' });
        if (fallaConexion(e)) return res.status(503).json({ error: 'Gmail no ha contestado a tiempo. Vuelve a intentarlo en un momento (botón ↻).' });
        res.status(500).json({ error: `No se ha podido leer el correo: ${m}` });
    };

    // Los buzones que ve esta persona y a quién se le pueden pasar correos.
    router.get('/buzones', async (req, res) => {
        try {
            const g = veGeneral(req) ? buzonGeneral() : null;
            const mio = buzonDe(req.userSession.email);
            // Se van conectando ya (#477): cuando llegue la lista, el buzón está abierto.
            if (g) calentarCorreo(g);
            if (mio) calentarCorreo(mio);
            const lista = await companeros();
            res.set('Cache-Control', 'no-store');
            res.json({
                buzones: [
                    g && { id: 'general', nombre: 'General', email: g.email },
                    mio && { id: 'mio', nombre: 'El mío', email: mio.email },
                ].filter(Boolean),
                // Sin buzón propio: para decirle cómo conectarlo.
                miCorreo: req.userSession.email, tengoBuzon: !!mio, dominio: dominioCorreo(),
                companeros: lista.map(c => ({ id: c.id, nombre: c.nombre, email: c.email, etiqueta: etiquetaDe(c.nombre), yo: String(c.id) === String(req.userSession.userId) })),
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // La lista de una carpeta.
    //  entrada · sin_asignar · mios (asignados a mí, sin hacer) · hechos · enviados · spam
    // «Hecho» es archivar (#384, #465): sale de la entrada y queda solo en
    // «Hechos» (en el general, los de todos; en el tuyo, los tuyos).
    router.get('/:buzon/mensajes', async (req, res) => {
        const buzon = resolver(req, res); if (!buzon) return;
        const vista = String(req.query.vista || 'entrada');
        const pagina = Math.max(0, Number(req.query.pagina) || 0);
        const q = String(req.query.q || '').trim().slice(0, 200).replace(/["\\]/g, ' ');
        const claveLista = `${buzon.email}|${vista}|${pagina}|${q}|${req.userSession.userId}`;
        const guardada = listas.get(claveLista);
        if (guardada && Date.now() - guardada.t < LISTA_MS && req.query.fresco !== '1') {
            res.set('Cache-Control', 'no-store');
            return res.json({ ...guardada.v, pagina, porPagina: POR_PAGINA });
        }
        const t0 = Date.now(), tiempos = {};
        try {
            const lista = await companeros();
            const miEtiqueta = etiquetaDe(lista.find(c => String(c.id) === String(req.userSession.userId))?.nombre || req.userSession.firstName);
            const r = await conImap(buzon, async (client) => {
                const c = await carpetas(client);
                const gmail = client.capabilities?.has?.('X-GM-EXT-1');
                let carpeta = c.entrada, criterio = { all: true };
                const texto = q ? ` ${q}` : '';
                if (vista === 'enviados') { carpeta = c.enviados || c.entrada; criterio = q && gmail ? { gmraw: q } : { all: true }; }
                else if (vista === 'spam') { carpeta = c.spam; criterio = q && gmail ? { gmraw: q } : { all: true }; }
                else if (buzon.general && vista === 'sin_asignar' && gmail) {
                    criterio = { gmraw: `${lista.map(x => `-label:${etiquetaDe(x.nombre)}`).join(' ')} -label:${ETIQUETA_HECHO}${texto}`.trim() };
                } else if (buzon.general && vista === 'mios' && gmail) {
                    carpeta = c.todos || c.entrada;
                    criterio = { gmraw: `label:${miEtiqueta} -label:${ETIQUETA_HECHO}${texto}` };
                } else if (vista === 'hechos' && gmail) {
                    carpeta = c.todos || c.entrada;
                    criterio = { gmraw: `label:${ETIQUETA_HECHO}${texto}` };
                } else if (gmail) {
                    // La entrada, sin lo hecho (lo que se marcó antes de que «hecho» archivara).
                    criterio = { gmraw: `-label:${ETIQUETA_HECHO}${texto}` };
                } else if (q && gmail) criterio = { gmraw: q };
                if (!carpeta) return { mensajes: [], total: 0, carpeta: null };
                tiempos.conectar = Date.now() - t0;
                const lock = await client.getMailboxLock(carpeta);
                try {
                    const t1 = Date.now();
                    const uids = (await client.search(criterio, { uid: true })) || [];
                    tiempos.buscar = Date.now() - t1;
                    const t2 = Date.now();
                    uids.sort((a, b) => b - a);
                    const trozo = uids.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
                    const mensajes = [];
                    if (trozo.length) {
                        for await (const m of client.fetch(trozo, { uid: true, envelope: true, flags: true, labels: true, bodyStructure: true, internalDate: true }, { uid: true })) {
                            const etiquetas = [...(m.labels || [])].map(String);
                            const asignado = lista.find(x => etiquetas.includes(etiquetaDe(x.nombre)));
                            mensajes.push({
                                uid: m.uid,
                                de: direccion(m.envelope?.from?.[0]), para: (m.envelope?.to || []).map(direccion),
                                asunto: m.envelope?.subject || '(sin asunto)',
                                fecha: m.envelope?.date || m.internalDate,
                                leido: m.flags?.has?.('\\Seen') || false,
                                adjuntos: conAdjuntos(m.bodyStructure),
                                asignado: asignado ? { id: asignado.id, nombre: asignado.nombre } : null,
                                hecho: etiquetas.includes(ETIQUETA_HECHO),
                            });
                        }
                    }
                    mensajes.sort((a, b) => b.uid - a.uid);
                    tiempos.traer = Date.now() - t2;
                    if (buzon.general && vista !== 'enviados' && vista !== 'spam') {
                        const rs = await reglas().catch(() => []);
                        for (const m of mensajes) {
                            if (m.asignado || m.hecho || !m.de) continue;
                            const regla = reglaDe(rs, m.de.email);
                            const destino = regla && lista.find(x => String(x.id) === String(regla.a));
                            if (!destino) continue;
                            await client.messageFlagsAdd(String(m.uid), [etiquetaDe(destino.nombre)], { uid: true, useLabels: true }).catch(() => {});
                            m.asignado = { id: destino.id, nombre: destino.nombre, porRegla: true };
                        }
                    }
                    return { mensajes, total: uids.length, carpeta };
                } finally { lock.release(); }
            });
            const ms = Date.now() - t0;
            if (ms > 2000) console.warn(`[bandeja] lista lenta (${vista}): ${ms} ms · conectar y abrir ${tiempos.conectar ?? '?'} ms, buscar ${tiempos.buscar ?? '?'} ms, traer ${tiempos.traer ?? '?'} ms`);
            listas.set(claveLista, { v: r, t: Date.now() });
            while (listas.size > 100) listas.delete(listas.keys().next().value);
            res.set('Cache-Control', 'no-store');
            res.json({ ...r, pagina, porPagina: POR_PAGINA });
        } catch (e) { error(res, e); }
    });

    // Un correo entero (sin marcarlo como leído: eso lo pide la pantalla).
    // Los últimos correos abiertos, ya leídos: al abrir uno y luego bajar su
    // adjunto no se vuelve a descargar y leer entero (eran 4-7 s). Solo el
    // contenido, que no cambia; las etiquetas (asignado, hecho) se piden siempre.
    const leidos = new Map(); // «correo|carpeta|uid» → { p, t }
    const LEIDO_MS = 10 * 60_000;
    async function leerUno(buzon, carpetaVista, uid) {
        return conImap(buzon, async (client) => {
            const c = await carpetas(client);
            const carpeta = carpetaDe(c, carpetaVista) || c.entrada;
            const lock = await client.getMailboxLock(carpeta);
            try {
                const clave = `${buzon.email}|${carpeta}|${uid}`;
                const guardado = leidos.get(clave);
                if (guardado && Date.now() - guardado.t < LEIDO_MS) {
                    const m = await client.fetchOne(String(uid), { uid: true, labels: true, flags: true }, { uid: true });
                    if (m) return { m, p: guardado.p };
                }
                const m = await client.fetchOne(String(uid), { uid: true, source: true, labels: true, flags: true }, { uid: true });
                if (!m?.source) return null;
                const p = await simpleParser(m.source);
                // Los muy grandes no se guardan (memoria).
                if (m.source.length < 10 * 1024 * 1024) {
                    leidos.set(clave, { p, t: Date.now() });
                    while (leidos.size > 20) leidos.delete(leidos.keys().next().value);
                }
                return { m, p };
            } finally { lock.release(); }
        });
    }
    const carpetaDeVista = (v) => (v === 'enviados' || v === 'spam' ? v : (v === 'mios' || v === 'hechos') ? 'todos' : 'entrada');

    router.get('/:buzon/mensajes/:uid(\\d+)', async (req, res) => {
        const buzon = resolver(req, res); if (!buzon) return;
        try {
            const t0 = Date.now();
            const r = await leerUno(buzon, carpetaDeVista(req.query.vista), req.params.uid);
            if (!r) return res.status(404).json({ error: 'Ese correo ya no está.' });
            const { m, p } = r;
            // Marcarlo como leído aquí mismo (#477): antes era otra petición, a la cola detrás.
            let leido = m.flags?.has?.('\\Seen') || false;
            if (!leido && req.query.leer === '1') {
                await conImap(buzon, async (client) => {
                    const c = await carpetas(client);
                    const lock = await client.getMailboxLock(carpetaDe(c, carpetaDeVista(req.query.vista)) || c.entrada);
                    try { await client.messageFlagsAdd(String(m.uid), ['\\Seen'], { uid: true }); } finally { lock.release(); }
                }).then(() => { leido = true; olvidarListas(buzon.email); }).catch(() => {});
            }
            if (Date.now() - t0 > 2000) console.warn(`[bandeja] abrir un correo: ${Date.now() - t0} ms (${Math.round((m.source?.length || 0) / 1024)} KB)`);
            // Las imágenes pegadas en el correo (cid:) van dentro; las de fuera no
            // se cargan hasta que se pida (son las que chivan que se ha abierto).
            let html = p.html || '';
            (p.attachments || []).forEach(a => {
                if (a.cid && a.content && a.size < 3 * 1024 * 1024) {
                    html = html.split(`cid:${a.cid}`).join(`data:${a.contentType};base64,${a.content.toString('base64')}`);
                }
            });
            const de = p.from?.value?.[0] ? { nombre: p.from.value[0].name || '', email: String(p.from.value[0].address || '').toLowerCase() } : null;
            const lista = await companeros();
            const etiquetas = [...(m.labels || [])].map(String);
            const asignado = lista.find(x => etiquetas.includes(etiquetaDe(x.nombre)));
            res.set('Cache-Control', 'no-store');
            res.json({
                uid: m.uid, asunto: p.subject || '(sin asunto)', fecha: p.date, de,
                para: (p.to?.value || []).map(x => ({ nombre: x.name || '', email: String(x.address || '').toLowerCase() })),
                cc: (p.cc?.value || []).map(x => ({ nombre: x.name || '', email: String(x.address || '').toLowerCase() })),
                responderA: p.replyTo?.value?.[0]?.address || null,
                html: html || null, texto: p.text || '',
                // Las imágenes pegadas en el texto (related) no son adjuntos.
                adjuntos: (p.attachments || []).filter(a => !a.related)
                    .map((a) => ({ i: p.attachments.indexOf(a), nombre: a.filename || 'adjunto', tipo: a.contentType, bytes: a.size })),
                messageId: p.messageId || null, referencias: [].concat(p.references || []),
                leido,
                asignado: asignado ? { id: asignado.id, nombre: asignado.nombre } : null,
                hecho: etiquetas.includes(ETIQUETA_HECHO),
                ficha: de ? await fichaDe(de.email).catch(() => null) : null,
            });
        } catch (e) { error(res, e); }
    });

    router.get('/:buzon/mensajes/:uid(\\d+)/adjunto/:i(\\d+)', async (req, res) => {
        const buzon = resolver(req, res); if (!buzon) return;
        try {
            const r = await leerUno(buzon, carpetaDeVista(req.query.vista), req.params.uid);
            const a = r?.p?.attachments?.[Number(req.params.i)];
            if (!a) return res.status(404).end();
            res.setHeader('Content-Type', a.contentType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.filename || 'adjunto')}`);
            res.setHeader('Cache-Control', 'no-store');
            res.send(a.content);
        } catch (e) { error(res, e); }
    });

    // Las reglas son del general: solo quien lo ve.
    router.use('/general/reglas', (req, res, next) => (veGeneral(req) ? next() : res.status(403).json({ error: 'El buzón general es de secretaría y dirección.' })));
    router.get('/general/reglas', async (req, res) => {
        try {
            const lista = await companeros();
            res.set('Cache-Control', 'no-store');
            res.json({ reglas: (await reglas()).map((r, i) => ({ i, remitente: r.remitente, a: r.a, nombre: lista.find(x => String(x.id) === String(r.a))?.nombre || '(ya no puede tener correos)' })) });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    router.post('/general/reglas', async (req, res) => {
        let remitente = String(req.body?.remitente || '').trim().toLowerCase();
        if (/^[^\s@]+\.[^\s@]+$/.test(remitente)) remitente = `@${remitente}`; // «colegio.es» → «@colegio.es»
        if (!/^([^\s@]+)?@[^\s@]+\.[^\s@]+$/.test(remitente)) return res.status(400).json({ error: 'Pon un correo (ana@colegio.es) o un dominio (@colegio.es).' });
        try {
            const lista = await companeros();
            const destino = lista.find(x => String(x.id) === String(req.body?.a));
            if (!destino) return res.status(400).json({ error: 'Esa persona no puede tener correos asignados.' });
            const rs = (await reglas()).filter(r => r.remitente !== remitente);
            rs.push({ remitente, a: destino.id, por: req.userSession.userId, at: new Date().toISOString() });
            await guardarReglas(rs, req.userSession.userId);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    router.delete('/general/reglas/:i(\\d+)', async (req, res) => {
        try {
            const rs = await reglas();
            rs.splice(Number(req.params.i), 1);
            await guardarReglas(rs, req.userSession.userId);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Leído / no leído, archivar, papelera, asignar, hecho, no es spam.
    router.post('/:buzon/mensajes/:uid(\\d+)/accion', async (req, res) => {
        const buzon = resolver(req, res); if (!buzon) return;
        const { accion, a } = req.body || {};
        const uid = String(req.params.uid);
        try {
            const lista = await companeros();
            if (['asignar', 'hecho', 'reabrir'].includes(accion) && req.body?.vista === 'spam') {
                return res.status(400).json({ error: 'Primero sácalo del spam («No es spam»).' });
            }
            if (accion === 'asignar' && !buzon.general) {
                return res.status(400).json({ error: 'Solo se asignan los correos del buzón general. Los tuyos se reenvían.' });
            }
            let destino = null;
            if (accion === 'asignar' && a) {
                destino = lista.find(x => String(x.id) === String(a));
                if (!destino) return res.status(400).json({ error: 'Esa persona no puede tener correos asignados.' });
            }
            await conImap(buzon, async (client) => {
                const c = await carpetas(client);
                const carpeta = carpetaDe(c, carpetaDeVista(req.body?.vista)) || c.entrada;
                const lock = await client.getMailboxLock(carpeta);
                // La librería no avisa si Gmail rechaza un cambio (devuelve false): se
                // comprueba, para no decir «archivado» y que luego vuelva a salir (#413).
                const exigir = (hecho) => { if (!hecho) throw Object.assign(new Error('Gmail no ha aceptado el cambio. Vuelve a intentarlo en un momento.'), { http: 502 }); };
                // Archivar en Gmail es quitar la etiqueta «Recibidos». Desde la entrada,
                // lo seguro es moverlo a «Todos» (Gmail lo entiende como archivar); desde
                // otra carpeta, se le quita la etiqueta.
                const archivar = async () => {
                    if (carpeta === c.entrada && c.todos) exigir(await client.messageMove(uid, c.todos, { uid: true }));
                    else exigir(await client.messageFlagsRemove(uid, ['\\Inbox'], { uid: true, useLabels: true }));
                };
                try {
                    if (accion === 'leido') await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                    else if (accion === 'no_leido') await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
                    else if (accion === 'archivar') await archivar();
                    else if (accion === 'papelera') { if (c.papelera) await client.messageMove(uid, c.papelera, { uid: true }); }
                    // Gmail aprende: lo devuelve a la entrada y no lo vuelve a tomar por spam.
                    else if (accion === 'no_spam') { if (req.body?.vista !== 'spam') throw Object.assign(new Error('Ese correo no está en el spam.'), { http: 400 }); await client.messageMove(uid, 'INBOX', { uid: true }); }
                    else if (accion === 'asignar') {
                        const quitar = lista.map(x => etiquetaDe(x.nombre)).filter(e => e !== (destino && etiquetaDe(destino.nombre)));
                        if (quitar.length) await client.messageFlagsRemove(uid, quitar, { uid: true, useLabels: true });
                        if (destino) exigir(await client.messageFlagsAdd(uid, [etiquetaDe(destino.nombre)], { uid: true, useLabels: true }));
                        // Asignar uno hecho lo reabre: vuelve a la entrada.
                        await client.messageFlagsRemove(uid, [ETIQUETA_HECHO], { uid: true, useLabels: true });
                        await client.messageFlagsAdd(uid, ['\\Inbox'], { uid: true, useLabels: true });
                    }
                    // Hecho = archivado (#384): sale de la entrada (también en Gmail) y
                    // queda en «Hechos». Reabrir lo devuelve a la entrada.
                    else if (accion === 'hecho') {
                        exigir(await client.messageFlagsAdd(uid, [ETIQUETA_HECHO], { uid: true, useLabels: true }));
                        await archivar();
                    }
                    else if (accion === 'reabrir') {
                        await client.messageFlagsRemove(uid, [ETIQUETA_HECHO], { uid: true, useLabels: true });
                        exigir(await client.messageFlagsAdd(uid, ['\\Inbox'], { uid: true, useLabels: true }));
                    }
                    else throw Object.assign(new Error('Acción desconocida.'), { http: 400 });
                } finally { lock.release(); }
            });
            olvidarAsignados();
            res.json({ success: true, asignado: destino ? { id: destino.id, nombre: destino.nombre } : null });
        } catch (e) { if (e.http) return res.status(e.http).json({ error: e.message }); error(res, e); }
    });

    // Comprueba lo que se va a enviar. Devuelve el error o los datos limpios.
    function revisarEnvio(b) {
        const lista = (v) => String(v || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
        const para = lista(b.para), cc = lista(b.cc);
        const valido = (e) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e.replace(/^.*<(.+)>$/, '$1'));
        if (!para.length) return { error: 'Falta a quién va.' };
        if ([...para, ...cc].some(e => !valido(e))) return { error: 'Hay alguna dirección que no parece un correo.' };
        if (para.length + cc.length > 20) return { error: 'Como mucho 20 destinatarios.' };
        const asunto = String(b.asunto || '').trim().slice(0, 250);
        if (!asunto) return { error: 'Falta el asunto.' };
        const adjuntos = (Array.isArray(b.adjuntos) ? b.adjuntos : []).slice(0, 10)
            .filter(x => /^data:[^;,]+;base64,/.test(String(x?.datos || '')))
            .map(x => ({ nombre: String(x.nombre || 'adjunto').slice(0, 150), datos: String(x.datos) }));
        const pesan = adjuntos.reduce((t, x) => t + x.datos.length * 0.75, 0);
        if (pesan > 20 * 1024 * 1024) return { error: 'Los adjuntos pesan demasiado (Gmail admite 25 MB en total).' };
        return { para, cc, asunto, texto: String(b.texto || '').slice(0, 50000), modo: b.modo || null, origen: b.origen?.uid ? { uid: b.origen.uid, vista: b.origen.vista } : null, adjuntos };
    }

    // Envía de verdad. Sale por el Gmail de ese buzón: queda en sus «Enviados» y
    // las respuestas vuelven a él. Lo usan «Enviar» y los programados.
    async function enviarDesde(buzon, e, autor) {
        let original = null;
        if (e.origen?.uid) original = await leerUno(buzon, carpetaDeVista(e.origen.vista), e.origen.uid).catch(() => null);
        const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${esc(e.texto).replace(/\n/g, '<br>')}</div>`;
        let text = e.texto;
        const correo = { attachments: [] };
        if (original) {
            const p = original.p;
            const cuando = p.date ? new Date(p.date).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : '';
            const quien = p.from?.text || '';
            const cita = p.html || `<div style="white-space:pre-wrap">${esc(p.text || '')}</div>`;
            if (e.modo === 'reenviar') {
                html += `<br><div style="color:#555">---------- Mensaje reenviado ----------<br>De: ${esc(quien)}<br>Fecha: ${esc(cuando)}<br>Asunto: ${esc(p.subject || '')}<br>Para: ${esc(p.to?.text || '')}</div><br>${cita}`;
                text += `\n\n---------- Mensaje reenviado ----------\nDe: ${quien}\nFecha: ${cuando}\nAsunto: ${p.subject || ''}\n\n${p.text || ''}`;
                correo.attachments = (p.attachments || []).map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType, cid: a.cid || undefined }));
            } else {
                html += `<br><div style="color:#555">El ${esc(cuando)}, ${esc(quien)} escribió:</div><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${cita}</blockquote>`;
                text += `\n\nEl ${cuando}, ${quien} escribió:\n${String(p.text || '').split('\n').map(l => `> ${l}`).join('\n')}`;
                if (p.messageId) {
                    correo.inReplyTo = p.messageId;
                    correo.references = [...[].concat(p.references || []), p.messageId].slice(-20);
                }
                // Las imágenes pegadas del original, para que la cita se vea igual.
                correo.attachments = (p.attachments || []).filter(a => a.cid).map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType, cid: a.cid }));
            }
        }
        for (const a of e.adjuntos || []) {
            const m = String(a.datos).match(/^data:([^;,]+);base64,(.+)$/);
            if (m) correo.attachments.push({ filename: a.nombre, content: Buffer.from(m[2], 'base64'), contentType: m[1] });
        }
        const nombre = buzon.general ? 'AIM Education' : String(autor || '').trim();
        const envio = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true,
            auth: buzon.oauth ? { type: 'OAuth2', ...(await auth(buzon)) } : { user: buzon.email, pass: buzon.pass } });
        await envio.sendMail({
            from: nombre ? `${nombre} <${buzon.email}>` : buzon.email,
            to: e.para.join(', '), cc: e.cc.length ? e.cc.join(', ') : undefined,
            subject: e.asunto, text, html, ...correo,
        });
    }
    const errorEnvio = (e) => {
        const m = String(e?.response || e?.message || e);
        if (e?.sinBuzon) return 'Esa cuenta no tiene buzón en Google Workspace (o está suspendida).';
        if (e?.google) return 'Google no deja enviar con la cuenta de servicio. Avisa a IT (ticket #449).';
        return /535|Username and Password|auth/i.test(m) ? 'Gmail no acepta la contraseña de este buzón (ticket #317).' : `No se ha podido enviar: ${m}`;
    };

    // Escribir, responder o reenviar. Con «programadoAt» se guarda y sale sola a
    // esa hora (#338).
    router.post('/:buzon/enviar', async (req, res) => {
        const buzon = resolver(req, res); if (!buzon) return;
        const e = revisarEnvio(req.body || {});
        if (e.error) return res.status(400).json({ error: e.error });
        const autor = `${req.userSession.firstName || ''} ${req.userSession.lastName || ''}`.trim();
        if (req.body?.programadoAt) {
            const cuando = new Date(req.body.programadoAt);
            if (Number.isNaN(cuando.getTime()) || cuando.getTime() < Date.now() + 30_000) return res.status(400).json({ error: 'Pon una fecha y hora que no haya pasado.' });
            try {
                const r = await pool.query(
                    `INSERT INTO aim_correos_programados (buzon_email, general, user_id, autor, para, cc, asunto, texto, modo, origen, adjuntos, enviar_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12) RETURNING id, enviar_at`,
                    [buzon.email, !!buzon.general, req.userSession.userId, autor, e.para.join(', '), e.cc.join(', '), e.asunto, e.texto, e.modo,
                     e.origen ? JSON.stringify(e.origen) : null, JSON.stringify(e.adjuntos), cuando.toISOString()]);
                return res.json({ success: true, programado: r.rows[0] });
            } catch (err) { return res.status(500).json({ error: err.message }); }
        }
        try {
            await enviarDesde(buzon, e, autor);
            res.json({ success: true });
        } catch (err) {
            const m = errorEnvio(err);
            res.status(/contraseña/.test(m) ? 502 : 500).json({ error: m });
        }
    });

    // Los programados de este buzón que ha dejado esta persona.
    router.get('/:buzon/programados', async (req, res) => {
        const buzon = resolver(req, res); if (!buzon) return;
        try {
            const r = await pool.query(
                `SELECT id, para, cc, asunto, texto, enviar_at, estado, error, enviado_at, autor, user_id,
                        jsonb_array_length(COALESCE(adjuntos, '[]'::jsonb))::int AS adjuntos
                 FROM aim_correos_programados
                 WHERE buzon_email = $1 AND (general OR user_id = $2) AND (estado = 'pendiente' OR enviado_at > NOW() - INTERVAL '7 days' OR estado = 'error')
                 ORDER BY (estado = 'pendiente') DESC, enviar_at`, [buzon.email, req.userSession.userId]);
            res.set('Cache-Control', 'no-store');
            res.json({ programados: r.rows.map(x => ({ id: x.id, para: x.para, cc: x.cc, asunto: x.asunto, texto: x.texto, cuando: x.enviar_at, estado: x.estado, error: x.error, enviado: x.enviado_at, autor: x.autor, mio: String(x.user_id) === String(req.userSession.userId), adjuntos: x.adjuntos })) });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
    router.delete('/:buzon/programados/:id(\\d+)', async (req, res) => {
        const buzon = resolver(req, res); if (!buzon) return;
        try {
            const r = await pool.query(
                `UPDATE aim_correos_programados SET estado = 'cancelado' WHERE id = $1 AND buzon_email = $2 AND (general OR user_id = $3) AND estado = 'pendiente' RETURNING id`,
                [req.params.id, buzon.email, req.userSession.userId]);
            if (!r.rowCount) return res.status(409).json({ error: 'Ese correo ya ha salido o no está.' });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // La pasada que envía los programados cuya hora ha llegado (cada minuto).
    let enviandoProgramados = false;
    async function enviarProgramados() {
        if (enviandoProgramados) return;
        enviandoProgramados = true;
        try {
            // Uno que se quedó a medias (el servidor se reinició al enviarlo): no se
            // reintenta solo, por si llegó a salir; se marca para revisarlo.
            await pool.query(
                `UPDATE aim_correos_programados SET estado = 'error', error = 'Se cortó al enviarlo: mira en «Enviados» de Gmail si salió.'
                 WHERE estado = 'enviando' AND enviar_at < NOW() - INTERVAL '10 minutes'`);
            const r = await pool.query(
                `UPDATE aim_correos_programados SET estado = 'enviando' WHERE id IN (
                   SELECT id FROM aim_correos_programados WHERE estado = 'pendiente' AND enviar_at <= NOW() ORDER BY enviar_at LIMIT 10 FOR UPDATE SKIP LOCKED)
                 RETURNING *`);
            for (const x of r.rows) {
                const g = buzonGeneral();
                const buzon = x.general ? (g && g.email === x.buzon_email ? g : null) : buzonDe(x.buzon_email);
                let estado = 'enviado', error = null;
                if (!buzon) { estado = 'error'; error = 'Ese buzón ya no está conectado.'; }
                else {
                    try {
                        await enviarDesde(buzon, {
                            para: String(x.para).split(/,\s*/).filter(Boolean), cc: String(x.cc || '').split(/,\s*/).filter(Boolean),
                            asunto: x.asunto, texto: x.texto || '', modo: x.modo, origen: x.origen, adjuntos: x.adjuntos || [],
                        }, x.autor);
                    } catch (e) { estado = 'error'; error = errorEnvio(e); }
                }
                await pool.query(
                    `UPDATE aim_correos_programados SET estado = $2::varchar, error = $3,
                            enviado_at = CASE WHEN $2::varchar = 'enviado' THEN NOW() END,
                            adjuntos = CASE WHEN $2::varchar = 'enviado' THEN NULL ELSE adjuntos END
                     WHERE id = $1`, [x.id, estado, error]);
            }
        } catch (e) { console.error('[correos programados]', e.message); }
        finally { enviandoProgramados = false; }
    }

    // ── Para la campanita: correos de info@ asignados a alguien y sin hacer ──
    // Mirar Gmail en cada aviso sería lento: se guarda 3 minutos. Y la campanita
    // nunca espera a Gmail: contesta con lo último que se sabe y, si está viejo,
    // se pone al día por detrás, una sola vez aunque lleguen varias peticiones a
    // la vez (antes cada una abría su consulta y esperaban en fila: 3-6 s).
    let cacheAsignados = { t: 0, v: null };
    let refrescando = null;
    // Tras asignar o marcar hecho: lo guardado sigue valiendo, pero se rehace ya.
    const olvidarAsignados = () => { cacheAsignados = { ...cacheAsignados, t: 0 }; };
    async function asignadosSinHacer({ espera = 800 } = {}) {
        if (cacheAsignados.v && Date.now() - cacheAsignados.t < 180_000) return cacheAsignados.v;
        if (!refrescando) refrescando = contarAsignados().finally(() => { refrescando = null; });
        if (cacheAsignados.v) return cacheAsignados.v;
        // La primera vez se espera un poco; si Gmail tarda más, sale en el siguiente aviso.
        return Promise.race([refrescando, new Promise(r => setTimeout(() => r({}), espera))]);
    }
    async function contarAsignados() {
        const g = buzonGeneral();
        if (!g) return {};
        const lista = await companeros();
        // Si Gmail falla, tampoco se reintenta en cada aviso: se guarda el vacío.
        const v = await conImap(g, async (client) => {
            const c = await carpetas(client);
            if (!client.capabilities?.has?.('X-GM-EXT-1')) return {};
            const lock = await client.getMailboxLock(c.todos || c.entrada);
            try {
                const out = {};
                for (const x of lista) {
                    const uids = await client.search({ gmraw: `label:${etiquetaDe(x.nombre)} -label:${ETIQUETA_HECHO}` }, { uid: true });
                    if (uids?.length) out[x.id] = uids.length;
                }
                return out;
            } finally { lock.release(); }
        }).catch(() => ({}));
        cacheAsignados = { t: Date.now(), v };
        return v;
    }

    async function aplicarReglasBandeja() {
        const g = buzonGeneral();
        if (!g) return 0;
        const rs = await reglas().catch(() => []);
        if (!rs.length) return 0;
        const lista = await companeros();
        return conImap(g, async (client) => {
            if (!client.capabilities?.has?.('X-GM-EXT-1')) return 0;
            const lock = await client.getMailboxLock('INBOX');
            try {
                const uids = (await client.search({ gmraw: `newer_than:30d ${lista.map(x => `-label:${etiquetaDe(x.nombre)}`).join(' ')} -label:${ETIQUETA_HECHO}` }, { uid: true })) || [];
                let n = 0;
                if (!uids.length) return 0;
                for await (const m of client.fetch(uids.slice(-200), { uid: true, envelope: true }, { uid: true })) {
                    const de = String(m.envelope?.from?.[0]?.address || '').toLowerCase();
                    const regla = reglaDe(rs, de);
                    const destino = regla && lista.find(x => String(x.id) === String(regla.a));
                    if (!destino) continue;
                    await client.messageFlagsAdd(String(m.uid), [etiquetaDe(destino.nombre)], { uid: true, useLabels: true }).catch(() => {});
                    n++;
                }
                if (n) olvidarAsignados();
                return n;
            } finally { lock.release(); }
        }).catch(() => 0);
    }

    return { router, asignadosSinHacer, aplicarReglasBandeja, enviarProgramados };
}
