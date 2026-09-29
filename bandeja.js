// ─────────────────────────────────────────────────────────────────────────────
// Bandeja de correo del CRM (ticket #317). Dos buzones por persona como mucho:
//   · el general del club (info@, el de EMAIL_USER / EMAIL_PASS), que ve todo el
//     que tiene el apartado «Correo»;
//   · el suyo, si lo tiene conectado. Solo lo ve su dueño: el servidor elige el
//     buzón por el correo con el que se ha entrado a la app, nunca por lo que
//     pida la pantalla.
// Cada buzón se conecta con una contraseña de aplicación de Google puesta en
// Heroku (variables BUZON_<LO_QUE_SEA> = «correo contraseña»). Nada de esto se
// guarda en la base de datos.
//
// Los correos no se copian a la base: se leen de Gmail al momento (IMAP) y se
// envían por Gmail (SMTP), así quedan en «Enviados» como siempre. Asignar un
// correo de info@ a un compañero es una etiqueta de Gmail («AIM-nombre»), así
// que también se ve desde Gmail.
// ─────────────────────────────────────────────────────────────────────────────
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
const buzonGeneral = () => (process.env.EMAIL_USER && process.env.EMAIL_PASS
    ? { email: String(process.env.EMAIL_USER).toLowerCase(), pass: process.env.EMAIL_PASS, general: true } : null);
const buzonDe = (email) => buzonesPersonales().find(b => b.email === String(email || '').toLowerCase()) || null;

// La etiqueta de asignación de una persona: «AIM-patricia-jimenez».
export function etiquetaDe(nombre) {
    const slug = String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 2).join('-');
    return `AIM-${slug || 'sin-nombre'}`;
}

// Abre el buzón, hace lo que haga falta y lo cierra. Una conexión por petición:
// es poco uso y así nunca se queda una colgada.
async function conImap(buzon, fn) {
    const client = new ImapFlow({
        host: IMAP_HOST(), port: 993, secure: true, logger: false,
        auth: { user: buzon.email, pass: buzon.pass },
    });
    client.on('error', () => {}); // un corte de red no tumba el servidor
    await client.connect();
    try { return await fn(client); }
    finally { await client.logout().catch(() => {}); }
}
// Las carpetas especiales de Gmail (sus nombres cambian con el idioma).
async function carpetas(client) {
    const lista = await client.list();
    const por = (uso) => lista.find(m => m.specialUse === uso)?.path || null;
    return { entrada: 'INBOX', enviados: por('\\Sent'), todos: por('\\All'), papelera: por('\\Trash') };
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

    // Qué buzón es: 'general' o 'mio'. Nunca el de otra persona.
    function resolver(req, res) {
        const cual = req.params.buzon;
        if (cual === 'general') {
            const b = buzonGeneral();
            if (!b) { res.status(503).json({ error: 'El buzón general no está conectado (faltan EMAIL_USER y EMAIL_PASS en Heroku).' }); return null; }
            return b;
        }
        if (cual === 'mio') {
            const b = buzonDe(req.userSession.email);
            if (!b) { res.status(404).json({ error: 'Tu buzón no está conectado. Mira el ticket #317.' }); return null; }
            return b;
        }
        res.status(404).json({ error: 'Ese buzón no existe.' });
        return null;
    }
    const error = (res, e) => {
        const m = String(e?.responseText || e?.message || e);
        const auth = /AUTHENTICATIONFAILED|Invalid credentials|authenticate|Application-specific/i.test(m);
        res.status(auth ? 502 : 500).json({ error: auth ? 'Gmail no acepta la contraseña de este buzón: hay que crear otra (ticket #317).' : `No se ha podido leer el correo: ${m}` });
    };

    // Los buzones que ve esta persona y a quién se le pueden pasar correos.
    router.get('/buzones', async (req, res) => {
        try {
            const g = buzonGeneral();
            const mio = buzonDe(req.userSession.email);
            const lista = await companeros();
            res.set('Cache-Control', 'no-store');
            res.json({
                buzones: [
                    g && { id: 'general', nombre: 'General', email: g.email },
                    mio && { id: 'mio', nombre: 'El mío', email: mio.email },
                ].filter(Boolean),
                // Sin buzón propio: para decirle cómo conectarlo.
                miCorreo: req.userSession.email, tengoBuzon: !!mio,
                companeros: lista.map(c => ({ id: c.id, nombre: c.nombre, email: c.email, etiqueta: etiquetaDe(c.nombre), yo: String(c.id) === String(req.userSession.userId) })),
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // La lista de una carpeta.
    //  entrada · sin_asignar · mios (asignados a mí, sin hacer) · hechos · enviados
    router.get('/:buzon/mensajes', async (req, res) => {
        const buzon = resolver(req, res); if (!buzon) return;
        const vista = String(req.query.vista || 'entrada');
        const pagina = Math.max(0, Number(req.query.pagina) || 0);
        const q = String(req.query.q || '').trim().slice(0, 200).replace(/["\\]/g, ' ');
        try {
            const lista = await companeros();
            const miEtiqueta = etiquetaDe(lista.find(c => String(c.id) === String(req.userSession.userId))?.nombre || req.userSession.firstName);
            const r = await conImap(buzon, async (client) => {
                const c = await carpetas(client);
                const gmail = client.capabilities?.has?.('X-GM-EXT-1');
                let carpeta = c.entrada, criterio = { all: true };
                const texto = q ? ` ${q}` : '';
                if (vista === 'enviados') { carpeta = c.enviados || c.entrada; criterio = q && gmail ? { gmraw: q } : { all: true }; }
                else if (buzon.general && vista === 'sin_asignar' && gmail) {
                    criterio = { gmraw: `${lista.map(x => `-label:${etiquetaDe(x.nombre)}`).join(' ')} -label:${ETIQUETA_HECHO}${texto}`.trim() };
                } else if (buzon.general && (vista === 'mios' || vista === 'hechos') && gmail) {
                    carpeta = c.todos || c.entrada;
                    criterio = { gmraw: `label:${miEtiqueta} ${vista === 'hechos' ? '' : '-'}label:${ETIQUETA_HECHO}${texto}` };
                } else if (q && gmail) criterio = { gmraw: q };
                if (!carpeta) return { mensajes: [], total: 0, carpeta: null };
                const lock = await client.getMailboxLock(carpeta);
                try {
                    const uids = (await client.search(criterio, { uid: true })) || [];
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
                    return { mensajes, total: uids.length, carpeta };
                } finally { lock.release(); }
            });
            res.set('Cache-Control', 'no-store');
            res.json({ ...r, pagina, porPagina: POR_PAGINA });
        } catch (e) { error(res, e); }
    });

    // Un correo entero (sin marcarlo como leído: eso lo pide la pantalla).
    async function leerUno(buzon, carpetaVista, uid) {
        return conImap(buzon, async (client) => {
            const c = await carpetas(client);
            const carpeta = carpetaVista === 'enviados' ? c.enviados : carpetaVista === 'todos' ? c.todos : c.entrada;
            const lock = await client.getMailboxLock(carpeta || c.entrada);
            try {
                const m = await client.fetchOne(String(uid), { uid: true, source: true, labels: true, flags: true }, { uid: true });
                if (!m?.source) return null;
                const p = await simpleParser(m.source);
                return { m, p };
            } finally { lock.release(); }
        });
    }
    const carpetaDeVista = (v) => (v === 'enviados' ? 'enviados' : (v === 'mios' || v === 'hechos') ? 'todos' : 'entrada');

    router.get('/:buzon/mensajes/:uid(\\d+)', async (req, res) => {
        const buzon = resolver(req, res); if (!buzon) return;
        try {
            const r = await leerUno(buzon, carpetaDeVista(req.query.vista), req.params.uid);
            if (!r) return res.status(404).json({ error: 'Ese correo ya no está.' });
            const { m, p } = r;
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
                leido: m.flags?.has?.('\\Seen') || false,
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

    // Leído / no leído, archivar, papelera, asignar, hecho.
    router.post('/:buzon/mensajes/:uid(\\d+)/accion', async (req, res) => {
        const buzon = resolver(req, res); if (!buzon) return;
        const { accion, a } = req.body || {};
        const uid = String(req.params.uid);
        try {
            const lista = await companeros();
            if (['asignar', 'hecho', 'reabrir'].includes(accion) && !buzon.general) {
                return res.status(400).json({ error: 'Solo se asignan los correos del buzón general. Los tuyos se reenvían.' });
            }
            let destino = null;
            if (accion === 'asignar' && a) {
                destino = lista.find(x => String(x.id) === String(a));
                if (!destino) return res.status(400).json({ error: 'Esa persona no puede tener correos asignados.' });
            }
            await conImap(buzon, async (client) => {
                const c = await carpetas(client);
                const carpeta = carpetaDeVista(req.body?.vista) === 'enviados' ? c.enviados : carpetaDeVista(req.body?.vista) === 'todos' ? c.todos : c.entrada;
                const lock = await client.getMailboxLock(carpeta || c.entrada);
                try {
                    if (accion === 'leido') await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                    else if (accion === 'no_leido') await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
                    else if (accion === 'archivar') await client.messageFlagsRemove(uid, ['\\Inbox'], { uid: true, useLabels: true });
                    else if (accion === 'papelera') { if (c.papelera) await client.messageMove(uid, c.papelera, { uid: true }); }
                    else if (accion === 'asignar') {
                        const quitar = lista.map(x => etiquetaDe(x.nombre)).filter(e => e !== (destino && etiquetaDe(destino.nombre)));
                        if (quitar.length) await client.messageFlagsRemove(uid, quitar, { uid: true, useLabels: true });
                        if (destino) await client.messageFlagsAdd(uid, [etiquetaDe(destino.nombre)], { uid: true, useLabels: true });
                        await client.messageFlagsRemove(uid, [ETIQUETA_HECHO], { uid: true, useLabels: true });
                    }
                    else if (accion === 'hecho') await client.messageFlagsAdd(uid, [ETIQUETA_HECHO], { uid: true, useLabels: true });
                    else if (accion === 'reabrir') await client.messageFlagsRemove(uid, [ETIQUETA_HECHO], { uid: true, useLabels: true });
                    else throw Object.assign(new Error('Acción desconocida.'), { http: 400 });
                } finally { lock.release(); }
            });
            olvidarAsignados();
            res.json({ success: true, asignado: destino ? { id: destino.id, nombre: destino.nombre } : null });
        } catch (e) { if (e.http) return res.status(e.http).json({ error: e.message }); error(res, e); }
    });

    // Escribir, responder o reenviar. Sale por el Gmail de ese buzón: queda en
    // sus «Enviados» y las respuestas vuelven a él.
    router.post('/:buzon/enviar', async (req, res) => {
        const buzon = resolver(req, res); if (!buzon) return;
        const b = req.body || {};
        const lista = (v) => String(v || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
        const para = lista(b.para), cc = lista(b.cc);
        const valido = (e) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e.replace(/^.*<(.+)>$/, '$1'));
        if (!para.length) return res.status(400).json({ error: 'Falta a quién va.' });
        if ([...para, ...cc].some(e => !valido(e))) return res.status(400).json({ error: 'Hay alguna dirección que no parece un correo.' });
        if (para.length + cc.length > 20) return res.status(400).json({ error: 'Como mucho 20 destinatarios.' });
        const asunto = String(b.asunto || '').trim().slice(0, 250);
        const texto = String(b.texto || '').slice(0, 50000);
        if (!asunto) return res.status(400).json({ error: 'Falta el asunto.' });
        try {
            let original = null;
            if (b.origen?.uid) original = await leerUno(buzon, carpetaDeVista(b.origen.vista), b.origen.uid);
            const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            let html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${esc(texto).replace(/\n/g, '<br>')}</div>`;
            let text = texto;
            const correo = { attachments: [] };
            if (original) {
                const p = original.p;
                const cuando = p.date ? new Date(p.date).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : '';
                const quien = p.from?.text || '';
                const cita = p.html || `<div style="white-space:pre-wrap">${esc(p.text || '')}</div>`;
                if (b.modo === 'reenviar') {
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
            for (const a of (Array.isArray(b.adjuntos) ? b.adjuntos : []).slice(0, 10)) {
                const m = String(a?.datos || '').match(/^data:([^;,]+);base64,(.+)$/);
                if (m) correo.attachments.push({ filename: String(a.nombre || 'adjunto').slice(0, 150), content: Buffer.from(m[2], 'base64'), contentType: m[1] });
            }
            const tam = correo.attachments.reduce((t, a) => t + (a.content?.length || 0), 0);
            if (tam > 20 * 1024 * 1024) return res.status(413).json({ error: 'Los adjuntos pesan demasiado (Gmail admite 25 MB en total).' });
            const nombre = buzon.general ? 'AIM Education' : `${req.userSession.firstName || ''} ${req.userSession.lastName || ''}`.trim();
            const envio = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: buzon.email, pass: buzon.pass } });
            await envio.sendMail({
                from: nombre ? `${nombre} <${buzon.email}>` : buzon.email,
                to: para.join(', '), cc: cc.length ? cc.join(', ') : undefined,
                subject: asunto, text, html, ...correo,
            });
            // Contestar un correo del general lo da por atendido si estaba asignado a quien contesta.
            res.json({ success: true });
        } catch (e) {
            const m = String(e?.response || e?.message || e);
            res.status(/535|Username and Password|auth/i.test(m) ? 502 : 500).json({ error: /535|Username and Password|auth/i.test(m) ? 'Gmail no acepta la contraseña de este buzón (ticket #317).' : `No se ha podido enviar: ${m}` });
        }
    });

    // ── Para la campanita: correos de info@ asignados a alguien y sin hacer ──
    // Mirar Gmail en cada aviso sería lento: se guarda 3 minutos.
    let cacheAsignados = { t: 0, v: null };
    const olvidarAsignados = () => { cacheAsignados = { t: 0, v: null }; };
    async function asignadosSinHacer() {
        if (cacheAsignados.v && Date.now() - cacheAsignados.t < 180_000) return cacheAsignados.v;
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

    return { router, asignadosSinHacer };
}
