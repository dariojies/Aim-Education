// Formato de fechas de toda la aplicación.
//
// Dos reglas, para que el equipo y las familias nunca vean horas raras ni dudan
// de si una fecha es día/mes o mes/día:
//   1. Siempre hora peninsular española, sin depender de dónde esté el
//      navegador ni de en qué zona corra el servidor (Heroku va en UTC).
//   2. Siempre día/mes/año con dos dígitos: 05/09/2025, nunca 5/9/2025.
//
// Usar estas funciones en vez de toLocaleDateString suelto.

const ZONA = 'Europe/Madrid';

// Acepta Date, ISO string o null. Devuelve null si no hay fecha válida.
function aFecha(v) {
    if (v == null || v === '') return null;
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

// 05/09/2025
export function fmtFecha(v, vacio = '—') {
    const d = aFecha(v);
    if (!d) return vacio;
    return d.toLocaleDateString('es-ES', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' });
}

// 05/09/2025, 14:30
export function fmtFechaHora(v, vacio = '—') {
    const d = aFecha(v);
    if (!d) return vacio;
    return d.toLocaleString('es-ES', {
        timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

// 14:30
export function fmtHora(v, vacio = '') {
    const d = aFecha(v);
    if (!d) return vacio;
    return d.toLocaleTimeString('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
}

// viernes, 5 de septiembre de 2025
export function fmtFechaLarga(v, vacio = '') {
    const d = aFecha(v);
    if (!d) return vacio;
    return d.toLocaleDateString('es-ES', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// septiembre de 2025
export function fmtMesAno(v, vacio = '') {
    const d = aFecha(v);
    if (!d) return vacio;
    return d.toLocaleDateString('es-ES', { timeZone: ZONA, month: 'long', year: 'numeric' });
}

// 05/09/2025 (día y mes cortos), para etiquetas apretadas: 05 sep 2025
export function fmtFechaCorta(v, vacio = '') {
    const d = aFecha(v);
    if (!d) return vacio;
    return d.toLocaleDateString('es-ES', { timeZone: ZONA, day: '2-digit', month: 'short', year: 'numeric' });
}

// SEP — para las tarjetas de evento del landing.
export function fmtMesAbrev(v) {
    const d = aFecha(v);
    if (!d) return '';
    return d.toLocaleDateString('es-ES', { timeZone: ZONA, month: 'short' }).slice(0, 3).toUpperCase();
}
