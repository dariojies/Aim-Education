// ─────────────────────────────────────────────────────────────────────────────
// Las cuentas de Google de los alumnos (#643): crearlas en Google Workspace y
// ponerles una contraseña provisional, desde la web.
//
// Usa la misma cuenta de servicio que «Correo» (#449, GOOGLE_CUENTA_SERVICIO),
// pero con otro permiso y en nombre de un administrador del dominio:
//   · GOOGLE_ADMIN_CUENTAS = el correo de un superadministrador de Workspace
//     (la cuenta de servicio actúa en su nombre; Google no deja otra forma).
//   · En la consola de Google (Seguridad › Controles de API › Delegación en
//     todo el dominio), al ID de cliente de la cuenta de servicio se le AÑADE
//     el permiso https://www.googleapis.com/auth/admin.directory.user, sin
//     quitar el de https://mail.google.com/ (si no, deja de ir «Correo»).
//   · Y la «Admin SDK API» activada en el proyecto de Google Cloud de la cuenta.
// Sin eso, la web no crea nada en Google: prepara el fichero CSV para subirlo a
// mano en la consola (Usuarios › Actualizar usuarios de forma masiva).
// Las contraseñas no se guardan en ningún sitio: se usan y se enseñan una vez.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import { cuentaServicio, dominioCorreo } from './bandeja.js';

const PERMISO = 'https://www.googleapis.com/auth/admin.directory.user';
const API = 'https://admin.googleapis.com/admin/directory/v1/users';
export const adminCuentas = () => String(process.env.GOOGLE_ADMIN_CUENTAS || '').trim().toLowerCase();

let permiso = null; // { token, hasta }
async function token() {
    if (permiso && permiso.hasta > Date.now() + 120_000) return permiso.token;
    const cs = cuentaServicio();
    if (!cs) throw Object.assign(new Error('Falta la cuenta de servicio de Google (GOOGLE_CUENTA_SERVICIO).'), { config: true });
    if (!adminCuentas()) throw Object.assign(new Error('Falta GOOGLE_ADMIN_CUENTAS: el correo del administrador de Google en cuyo nombre se crean las cuentas.'), { config: true });
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const ahora = Math.floor(Date.now() / 1000);
    const sinFirma = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: cs.email, sub: adminCuentas(), scope: PERMISO, aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 })}`;
    const firma = crypto.createSign('RSA-SHA256').update(sinFirma).sign(cs.clave, 'base64url');
    const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${sinFirma}.${firma}` }),
        signal: AbortSignal.timeout(10_000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) {
        // «unauthorized_client»: falta añadir el permiso en la delegación del dominio.
        const sinPermiso = d.error === 'unauthorized_client';
        throw Object.assign(new Error(sinPermiso
            ? 'Google aún no deja a la web crear cuentas: falta añadir el permiso en la delegación del dominio.'
            : `Google: ${d.error || r.status}${d.error_description ? ` (${d.error_description})` : ''}`), { config: true });
    }
    permiso = { token: d.access_token, hasta: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
    return permiso.token;
}

async function llamar(metodo, ruta, cuerpo) {
    const r = await fetch(API + ruta, {
        method: metodo,
        headers: { Authorization: `Bearer ${await token()}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: AbortSignal.timeout(20_000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
        const msg = d.error?.message || `HTTP ${r.status}`;
        // La Admin SDK sin activar, o el administrador sin permisos: es configuración.
        const config = r.status === 403 && /has not been used|is disabled|Not Authorized/i.test(msg);
        throw Object.assign(new Error(`Google: ${msg}`), { status: r.status, config });
    }
    return d;
}

// ¿Está todo listo para crear cuentas? { ok, motivo }
export async function estadoGoogle() {
    if (!cuentaServicio() || !adminCuentas()) return { ok: false, motivo: 'sin-configurar' };
    try {
        await llamar('GET', `?domain=${encodeURIComponent(dominioCorreo())}&maxResults=1&fields=users(primaryEmail)`);
        return { ok: true };
    } catch (e) { return { ok: false, motivo: e.message }; }
}

// Todas las cuentas del dominio: correo → { suspendida, ultimoAcceso }.
export async function cuentasDelDominio() {
    const cuentas = new Map();
    let pagina = '';
    for (let i = 0; i < 40; i++) {
        const q = new URLSearchParams({ domain: dominioCorreo(), maxResults: '500', fields: 'users(primaryEmail,aliases,suspended,lastLoginTime),nextPageToken' });
        if (pagina) q.set('pageToken', pagina);
        const d = await llamar('GET', `?${q}`);
        for (const u of d.users || []) {
            // Google pone 1970 si nunca ha entrado.
            const ultimo = u.lastLoginTime && !u.lastLoginTime.startsWith('1970') ? u.lastLoginTime : null;
            const datos = { suspendida: !!u.suspended, ultimoAcceso: ultimo };
            for (const e of [u.primaryEmail, ...(u.aliases || [])]) cuentas.set(String(e).toLowerCase(), datos);
        }
        if (!d.nextPageToken) break;
        pagina = d.nextPageToken;
    }
    return cuentas;
}

// Crea la cuenta o, si ya existe, le pone la contraseña. En los dos casos se
// le pide cambiarla al entrar. Devuelve 'creada' | 'actualizada'.
export async function prepararCuenta({ email, nombre, apellidos, password, unidad = '/' }) {
    const correo = String(email).toLowerCase();
    try {
        await llamar('PUT', `/${encodeURIComponent(correo)}`, { password, changePasswordAtNextLogin: true });
        return 'actualizada';
    } catch (e) {
        if (e.status !== 404) throw e;
    }
    await llamar('POST', '', {
        primaryEmail: correo,
        name: { givenName: String(nombre || '').trim() || correo.split('@')[0], familyName: String(apellidos || '').trim() || '-' },
        password, changePasswordAtNextLogin: true, orgUnitPath: unidad || '/',
    });
    return 'creada';
}

// Una contraseña provisional fácil de leer y de teclear: sin letras que se
// confundan (l/I/1, O/0). P. ej. «Aim-Kesu-4827».
export function passwordProvisional() {
    const cons = 'bcdfghjkmnpqrstvwxz', voc = 'aeiu';
    const n = (max) => crypto.randomInt(max);
    const silaba = () => cons[n(cons.length)] + voc[n(voc.length)];
    const palabra = silaba() + silaba();
    return `Aim-${palabra[0].toUpperCase()}${palabra.slice(1)}-${String(n(9000) + 1000)}`;
}

// El fichero para «Actualizar usuarios de forma masiva» de la consola de Google:
// crea las que no existen y cambia la contraseña de las que sí. En UTF-8 con BOM
// (lo pide Google para las tildes).
export function csvGoogle(filas, unidad = '/') {
    const campo = (v) => {
        const s = String(v ?? '');
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cab = ['First Name [Required]', 'Last Name [Required]', 'Email Address [Required]', 'Password [Required]', 'Org Unit Path [Required]', 'Change Password at Next Sign-In'];
    const lineas = filas.map(f => [f.nombre || '-', f.apellidos || '-', f.email, f.password, unidad || '/', 'TRUE'].map(campo).join(','));
    return '﻿' + [cab.join(','), ...lineas].join('\r\n') + '\r\n';
}
