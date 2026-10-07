// ─────────────────────────────────────────────────────────────────────────────
// «Mi día» en el calendario del móvil (ticket #390).
//
// Cada persona del panel puede sacar un enlace privado de suscripción (iCalendar,
// RFC 5545) con lo suyo: las clases que da, los eventos donde figura como docente,
// los días de cierre del centro y sus turnos de trabajo. Google Calendar, el
// calendario de Samsung (a través de la cuenta de Google o de ICSx⁵) y el del
// iPhone lo leen solos cada cierto tiempo. Es de un solo sentido y no es al
// momento: Google lo refresca cuando quiere (unas horas).
//
// Lo que sale en el enlace y lo que enseña «Mi día» lo calcula la misma función
// (agendaEnRango), para que nunca digan cosas distintas: las clases no salen los
// días que el centro está cerrado, y un evento de varios días sale en todos.
//
// Nada de alumnos (ni nombres, ni listas, ni Speaking) y nada de tareas.
//
// El enlace lleva una clave al azar que se guarda en aim_ajustes ('ical:<userId>').
// Se puede cambiar (el anterior deja de valer) o quitar. Si la persona deja de ser
// personal del club, el enlace deja de funcionar solo.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import express from 'express';

// ── Fechas (siempre 'AAAA-MM-DD', en la hora del club) ──
export const sumarDia = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// 0 = lunes, como en las sesiones de aim-tul y en aim_horario_laboral.
export const diaSemana = (iso) => (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7;
const sumarMeses = (iso, n) => {
    const [y, m, d] = iso.split('-').map(Number);
    const f = new Date(Date.UTC(y, m - 1 + n, 1, 12));
    const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0, 12)).getUTCDate();
    f.setUTCDate(Math.min(d, ultimo));
    return f.toISOString().slice(0, 10);
};

// Lo que abarca el enlace: desde hace 30 días hasta el final del curso (31 de
// agosto) o hasta dentro de 6 meses, lo que llegue más lejos.
export function ventanaCalendario(hoy) {
    const [y, m] = hoy.split('-').map(Number);
    const finCurso = `${m >= 9 ? y + 1 : y}-08-31`;
    const seisMeses = sumarMeses(hoy, 6);
    return [sumarDia(hoy, -30), finCurso > seisMeses ? finCurso : seisMeses];
}

// Las horas de los eventos son texto libre ("19:00", "19.00", "19h"…). Se entiende
// lo que se pueda; si no, el evento va como de día entero.
export function leerHora(texto) {
    const m = String(texto || '').trim().match(/^([01]?\d|2[0-3])(?:\s*[:.h]\s*([0-5]\d))?\s*(?:h|hrs?|horas)?\.?$/i);
    if (!m) return null;
    return `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
}
const minutos = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const masUnaHora = (h) => { const t = Math.min(minutos(h) + 60, 23 * 60 + 59); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

// ¿La persona da esta sesión? Mira los dos monitores (ticket #224): el array
// `instructors` si está, y siempre el instructorId por si la sesión es antigua.
export function esDocente(ses, userId) {
    const yo = String(userId);
    if (String(ses?.instructorId || '') === yo) return true;
    return (Array.isArray(ses?.instructors) ? ses.instructors : []).some(d => String(d?.id || '') === yo);
}

// Las clases que da alguien entre dos fechas, día a día, sin los días de cierre.
// `grupos`: filas de tul_groups ({ group_id, name, actividad, sessions }).
// `cierres`: { 'AAAA-MM-DD': { nombre, tipo } }.
export function clasesEnRango(grupos, userId, desde, hasta, cierres = {}) {
    const propias = [];
    for (const g of grupos) {
        for (const ses of (Array.isArray(g.sessions) ? g.sessions : [])) {
            if (!esDocente(ses, userId)) continue;
            const dias = new Set((ses?.days || []).map(Number));
            if (dias.size) propias.push({ g, ses, dias });
        }
    }
    const out = [];
    for (let f = desde; f <= hasta; f = sumarDia(f, 1)) {
        if (cierres[f]) continue;
        const ds = diaSemana(f);
        for (const { g, ses, dias } of propias) {
            if (!dias.has(ds)) continue;
            out.push({
                id: `${g.group_id}-${ses.startTime}`, fecha: f, grupoId: g.group_id,
                grupo: g.name, actividad: g.actividad,
                hora: ses.startTime || null, horaFin: ses.endTime || null,
                aula: ses.aulaName || null,
            });
        }
    }
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.hora).localeCompare(String(b.hora)));
}

// Los eventos, uno por cada día que duran (dentro del rango). Un evento de un
// fin de semana sale el sábado y el domingo, no solo el primer día.
export function eventosEnRango(eventos, desde, hasta) {
    const out = [];
    for (const e of eventos) {
        const ini = e.fecha, fin = e.fin && e.fin > e.fecha ? e.fin : e.fecha;
        for (let f = ini > desde ? ini : desde; f <= fin && f <= hasta; f = sumarDia(f, 1)) {
            out.push({ ...e, dia: f });
        }
    }
    return out;
}

// Lo de una persona entre dos fechas, tal cual lo usan «Mi día» y el enlace del
// móvil. Con `turnos` también su horario de trabajo (lo que tiene que fichar).
export async function agendaEnRango(pool, { clubId, userId, desde, hasta, turnos = false }) {
    // Consultas una detrás de otra: la base tiene pocas conexiones para todos.
    const grupos = (await pool.query(
        `SELECT g.group_id, g.name, a.name AS actividad, g.sessions
         FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
         WHERE a.club_id = $1`, [clubId])).rows;
    const cierres = {};
    for (const x of (await pool.query(
        `SELECT fecha::text AS fecha, nombre, tipo FROM aim_calendario_laboral
         WHERE fecha BETWEEN $1::date AND $2::date ORDER BY fecha`, [desde, hasta])).rows) {
        cierres[x.fecha] = { nombre: x.nombre, tipo: x.tipo };
    }
    const eventos = (await pool.query(
        `SELECT id, title, description, event_date::text AS fecha, end_date::text AS fin, time, end_time, venue
         FROM aim_eventos
         WHERE docente_id = $1 AND event_date <= $3::date AND COALESCE(end_date, event_date) >= $2::date
         ORDER BY event_date, time`, [userId, desde, hasta])).rows;
    const res = { cierres, clases: clasesEnRango(grupos, userId, desde, hasta, cierres), eventos };
    if (!turnos) return res;

    res.horario = (await pool.query(
        `SELECT dia, tramo, entrada, salida FROM aim_horario_laboral WHERE user_id = $1 ORDER BY dia, tramo`, [userId])).rows;
    // Lo planificado en «Equipo IT» manda sobre el horario semanal ese día, igual
    // que al fichar.
    res.it = (await pool.query(
        `SELECT id, fecha::text AS fecha, to_char(inicio, 'HH24:MI') AS inicio, to_char(fin, 'HH24:MI') AS fin
         FROM aim_it_planificacion WHERE user_id = $1 AND fecha BETWEEN $2::date AND $3::date ORDER BY fecha, inicio`,
        [userId, desde, hasta])).rows;
    res.ausencias = (await pool.query(
        `SELECT desde::text AS desde, hasta::text AS hasta FROM aim_ausencias
         WHERE user_id = $1 AND estado = 'aprobada' AND desde <= $3::date AND hasta >= $2::date`,
        [userId, desde, hasta])).rows;
    return res;
}

// Los turnos de trabajo día a día: el horario semanal (o lo planificado en
// Equipo IT), sin los días de cierre ni las ausencias aprobadas.
export function turnosEnRango({ horario = [], it = [], ausencias = [], cierres = {} }, desde, hasta) {
    const fuera = new Set();
    for (const a of ausencias) {
        for (let f = a.desde > desde ? a.desde : desde; f <= a.hasta && f <= hasta; f = sumarDia(f, 1)) fuera.add(f);
    }
    const itPorDia = {};
    for (const x of it) (itPorDia[x.fecha] ||= []).push(x);
    const out = [];
    for (let f = desde; f <= hasta; f = sumarDia(f, 1)) {
        if (cierres[f] || fuera.has(f)) continue;
        if (itPorDia[f]) {
            for (const x of itPorDia[f]) out.push({ uid: `it-${x.id}`, fecha: f, entrada: x.inicio, salida: x.fin, it: true });
            continue;
        }
        const ds = diaSemana(f);
        for (const h of horario) {
            if (Number(h.dia) !== ds) continue;
            out.push({ uid: `turno-${f.replace(/-/g, '')}-${h.tramo}`, fecha: f, entrada: h.entrada, salida: h.salida, tramo: Number(h.tramo) });
        }
    }
    return out;
}

// ── iCalendar (RFC 5545) ──
const DOMINIO_UID = 'aimeducation.es';

// Texto de una propiedad: se escapan \ ; , y los saltos de línea.
export const escaparTexto = (t) => String(t ?? '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

// Ninguna línea pasa de 75 octetos: se parte y la continuación empieza con un
// espacio. Se corta por caracteres enteros, nunca a mitad de una letra con tilde.
export function plegarLinea(linea) {
    if (Buffer.byteLength(linea, 'utf8') <= 75) return linea;
    const trozos = [];
    let actual = '', bytes = 0, limite = 75;
    for (const c of linea) {
        const n = Buffer.byteLength(c, 'utf8');
        if (bytes + n > limite) { trozos.push(actual); actual = ''; bytes = 0; limite = 74; }
        actual += c; bytes += n;
    }
    trozos.push(actual);
    return trozos.join('\r\n ');
}

const fechaIcs = (iso) => iso.replace(/-/g, '');
const horaLocalIcs = (iso, hhmm) => `${fechaIcs(iso)}T${hhmm.replace(':', '')}00`;
const sello = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const VTIMEZONE_MADRID = [
    'BEGIN:VTIMEZONE', 'TZID:Europe/Madrid', 'X-LIC-LOCATION:Europe/Madrid',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
    'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET',
    'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE',
];

// Los días de cierre seguidos con el mismo nombre van en un solo aviso (la
// Navidad entera, no día a día).
function periodosCierre(cierres) {
    const out = [];
    for (const f of Object.keys(cierres).sort()) {
        const c = cierres[f], ult = out[out.length - 1];
        if (ult && ult.nombre === c.nombre && sumarDia(ult.hasta, 1) === f) ult.hasta = f;
        else out.push({ desde: f, hasta: f, nombre: c.nombre });
    }
    return out;
}

// El archivo .ics entero. `ahora` se pasa para que el DTSTAMP no cambie en cada
// petición (se redondea a la hora): así una petición repetida da lo mismo.
export function generarIcs({ nombreCalendario, clases = [], eventos = [], cierres = {}, turnos = [], desde, hasta, ahora = new Date() }) {
    const dtstamp = sello(new Date(Math.floor(ahora.getTime() / 3600_000) * 3600_000));
    const L = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AIM Education//Mi dia//ES',
        'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        `X-WR-CALNAME:${escaparTexto(nombreCalendario || 'AIM Education')}`,
        'X-WR-TIMEZONE:Europe/Madrid',
        `X-WR-CALDESC:${escaparTexto('Tus clases, eventos, turnos y días de cierre de AIM Education. Solo lectura: se cambia en la web.')}`,
        'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
        ...VTIMEZONE_MADRID,
    ];
    const evento = (props) => { L.push('BEGIN:VEVENT', `DTSTAMP:${dtstamp}`, ...props.filter(Boolean), 'END:VEVENT'); };
    const conHora = (fecha, ini, fin) => {
        const f = fin && minutos(fin) > minutos(ini) ? fin : masUnaHora(ini);
        return [`DTSTART;TZID=Europe/Madrid:${horaLocalIcs(fecha, ini)}`, `DTEND;TZID=Europe/Madrid:${horaLocalIcs(fecha, f)}`];
    };
    const diaEntero = (ini, fin) => [`DTSTART;VALUE=DATE:${fechaIcs(ini)}`, `DTEND;VALUE=DATE:${fechaIcs(sumarDia(fin, 1))}`];

    for (const p of periodosCierre(cierres)) {
        evento([
            `UID:cierre-${fechaIcs(p.desde)}@${DOMINIO_UID}`,
            ...diaEntero(p.desde, p.hasta),
            `SUMMARY:${escaparTexto(`Cerrado: ${p.nombre}`)}`,
            `DESCRIPTION:${escaparTexto('El centro está cerrado: no hay clases.')}`,
            'TRANSP:TRANSPARENT',
        ]);
    }
    for (const c of clases) {
        const ini = leerHora(c.hora);
        if (!ini) continue;
        evento([
            `UID:clase-${c.grupoId}-${fechaIcs(c.fecha)}T${ini.replace(':', '')}@${DOMINIO_UID}`,
            ...conHora(c.fecha, ini, leerHora(c.horaFin)),
            `SUMMARY:${escaparTexto(c.grupo || 'Clase')}`,
            c.actividad && `DESCRIPTION:${escaparTexto(`Clase de ${c.actividad}`)}`,
            c.aula && `LOCATION:${escaparTexto(c.aula)}`,
            'CATEGORIES:Clase',
        ]);
    }
    for (const e of eventos) {
        const ini = leerHora(e.time);
        const descripcion = e.description ? `DESCRIPTION:${escaparTexto(String(e.description).slice(0, 2000))}` : null;
        const lugar = e.venue ? `LOCATION:${escaparTexto(e.venue)}` : null;
        if (!ini) {
            // Sin hora que se entienda: de día entero, todos los días que dura.
            const fin = e.fin && e.fin > e.fecha ? e.fin : e.fecha;
            evento([`UID:evento-${e.id}@${DOMINIO_UID}`, ...diaEntero(e.fecha, fin),
                `SUMMARY:${escaparTexto(e.title || 'Evento')}`, descripcion, lugar, 'CATEGORIES:Evento']);
            continue;
        }
        // Con hora: uno por cada día que dura, a la misma hora.
        for (const x of eventosEnRango([e], desde || e.fecha, hasta || '9999-12-31')) {
            evento([`UID:evento-${e.id}-${fechaIcs(x.dia)}@${DOMINIO_UID}`, ...conHora(x.dia, ini, leerHora(e.end_time)),
                `SUMMARY:${escaparTexto(e.title || 'Evento')}`, descripcion, lugar, 'CATEGORIES:Evento']);
        }
    }
    for (const t of turnos) {
        const ini = leerHora(t.entrada);
        if (!ini) continue;
        evento([
            `UID:${t.uid}@${DOMINIO_UID}`,
            ...conHora(t.fecha, ini, leerHora(t.salida)),
            `SUMMARY:${escaparTexto(t.it ? 'Equipo IT (horas planificadas)' : t.tramo === 2 ? 'Turno de trabajo (tarde)' : 'Turno de trabajo')}`,
            `DESCRIPTION:${escaparTexto('Tu horario de trabajo: lo que tienes que fichar.')}`,
            'CATEGORIES:Trabajo',
        ]);
    }
    L.push('END:VCALENDAR');
    return L.map(plegarLinea).join('\r\n') + '\r\n';
}

// ── Enlace de suscripción y rutas ──
const CLAVE = (userId) => `ical:${userId}`;
const TOKEN_OK = /^[A-Za-z0-9_-]{32}$/;
const nuevoToken = () => crypto.randomBytes(24).toString('base64url');

export function crearRouterCalendarioMovil({ pool, authenticateSession, requireAdmin, rolEfectivo, urlBase, clubId, hoy, bajasDeCuenta }) {
    const router = express.Router();

    const enlaces = (token) => {
        const https = `${urlBase}/api/cal/${token}.ics`;
        const webcal = https.replace(/^https?:\/\//, 'webcal://');
        return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` };
    };
    const leer = async (userId) => (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = $1`, [CLAVE(userId)])).rows[0]?.valor || null;

    // Su enlace, si lo tiene.
    router.get('/api/me/calendario-movil', authenticateSession, requireAdmin, async (req, res) => {
        try {
            const v = await leer(req.userSession.userId);
            res.set('Cache-Control', 'no-store');
            res.json(v?.token ? { activo: true, creado: v.creado || null, ...enlaces(v.token) } : { activo: false });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Crear el enlace o cambiarlo por otro: el de antes deja de valer.
    router.post('/api/me/calendario-movil', authenticateSession, requireAdmin, async (req, res) => {
        const yo = req.userSession.userId;
        try {
            const valor = { token: nuevoToken(), creado: new Date().toISOString() };
            await pool.query(
                `INSERT INTO aim_ajustes (clave, valor, actualizado_at, actualizado_por) VALUES ($1, $2::jsonb, NOW(), $3)
                 ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_at = NOW(), actualizado_por = EXCLUDED.actualizado_por`,
                [CLAVE(yo), JSON.stringify(valor), yo]);
            res.set('Cache-Control', 'no-store');
            res.json({ activo: true, creado: valor.creado, ...enlaces(valor.token) });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Dejar de sincronizar: el enlace deja de funcionar.
    router.delete('/api/me/calendario-movil', authenticateSession, requireAdmin, async (req, res) => {
        try {
            await pool.query(`DELETE FROM aim_ajustes WHERE clave = $1`, [CLAVE(req.userSession.userId)]);
            res.json({ activo: false });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // El calendario en sí. Sin sesión: lo piden los servidores de Google, Apple…
    // Va bajo /api para que no le afecte la redirección al dominio principal;
    // /cal/… es por si alguien lo escribe a mano.
    const fallos = new Map(); // ip → [marcas] de claves que no existen
    const NO_ENCONTRADO = 'No existe este calendario.';
    router.get(['/api/cal/:archivo', '/cal/:archivo'], async (req, res) => {
        res.set('X-Robots-Tag', 'noindex, nofollow');
        const m = String(req.params.archivo || '').match(/^([A-Za-z0-9_-]+)\.ics$/);
        const token = m && TOKEN_OK.test(m[1]) ? m[1] : null;
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
        const ahora = Date.now();
        const recientes = (fallos.get(ip) || []).filter(t => ahora - t < 3600_000);
        if (recientes.length >= 30) return res.status(429).type('text/plain').send('Demasiadas peticiones.');
        const fallo = () => { fallos.set(ip, [...recientes, ahora]); return res.status(404).type('text/plain').send(NO_ENCONTRADO); };
        if (!token) return fallo();
        try {
            const r = await pool.query(
                `SELECT clave, valor->>'token' AS token FROM aim_ajustes WHERE clave LIKE 'ical:%' AND valor->>'token' = $1 LIMIT 1`, [token]);
            const fila = r.rows[0];
            if (!fila || !crypto.timingSafeEqual(Buffer.from(fila.token), Buffer.from(token))) return fallo();
            const userId = fila.clave.slice(5);
            // Solo mientras siga siendo personal del club (y sin la cuenta en baja).
            const u = (await pool.query(
                `SELECT u.name, u.role, u.dev_role, ar.rango FROM users u LEFT JOIN aim_rangos ar ON ar.user_id = u.user_id
                 WHERE u.user_id = $1`, [userId])).rows[0];
            if (!u || !rolEfectivo(u.role, u.dev_role, u.rango)) return res.status(404).type('text/plain').send(NO_ENCONTRADO);
            if (bajasDeCuenta && (await bajasDeCuenta())[userId]) return res.status(404).type('text/plain').send(NO_ENCONTRADO);

            const [desde, hasta] = ventanaCalendario(hoy());
            const a = await agendaEnRango(pool, { clubId, userId, desde, hasta, turnos: true });
            const ics = generarIcs({
                nombreCalendario: 'AIM · Mi agenda', desde, hasta,
                clases: a.clases, eventos: a.eventos, cierres: a.cierres, turnos: turnosEnRango(a, desde, hasta),
            });
            res.set('Content-Type', 'text/calendar; charset=utf-8');
            res.set('Content-Disposition', 'inline; filename="aim-mi-agenda.ics"');
            res.set('Cache-Control', 'private, no-cache');
            res.send(ics);
        } catch (err) {
            console.error('[calendario móvil]', err.message);
            res.status(500).type('text/plain').send('No se ha podido preparar el calendario.');
        }
    });

    return router;
}
