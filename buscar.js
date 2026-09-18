// ─────────────────────────────────────────────────────────────────────────────
// Buscar personas por el nombre a medias (ticket #254).
//
// Quien busca no escribe el nombre completo ni con las tildes: si en la base
// está "Juan Manuel Marín Borrego", escribir "Juan Manuel Borrego" o "marin juan"
// tiene que encontrarle. Cada palabra que se teclea debe aparecer en algún sitio
// del nombre completo (o del correo), en cualquier orden.
// ─────────────────────────────────────────────────────────────────────────────

// La misma normalización en SQL y en JavaScript: minúsculas y sin tildes.
export const SIN_TILDES = (expr) => `translate(lower(${expr}), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')`;
export const textoPlano = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Añade los parámetros a `vals` y devuelve el trozo de WHERE (o null si no hay
// nada que buscar). `nombre` y `email` son expresiones SQL.
export function filtroNombreSQL(texto, nombre, vals, email = null) {
    const palabras = textoPlano(texto).trim().split(/\s+/).filter(Boolean).slice(0, 6);
    if (!palabras.length) return null;
    return palabras.map(p => {
        vals.push(`%${p}%`);
        const i = `$${vals.length}`;
        return `(${SIN_TILDES(nombre)} LIKE ${i}${email ? ` OR ${SIN_TILDES(email)} LIKE ${i}` : ''})`;
    }).join(' AND ');
}
