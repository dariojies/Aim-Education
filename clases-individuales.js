// ─────────────────────────────────────────────────────────────────────────────
// Clases individuales (ticket #388; antes «Speaking», ticket #228).
//
// Qué clases del horario son individuales: las que secretaría marca en el
// apartado «Clases individuales». La lista va en aim_ajustes
// ('clases_individuales' = { groupIds: [...] }), así que no se toca tul_groups
// (es de Aim-Tul). Mientras nadie la haya guardado, vale la regla de siempre: la
// clase o la actividad se llama «Speaking». Así lo de ahora sigue igual.
//
// Es la ÚNICA regla: la usan el servidor, las listas de clase y los bonos. En SQL
// (sqlEsIndividual) se lee la tabla en la propia consulta; en JS
// (gruposIndividuales) con una caché corta que se borra al guardar.
// ─────────────────────────────────────────────────────────────────────────────

export const CLAVE_INDIVIDUALES = 'clases_individuales';

// Los ids guardados, como texto (jsonb). Si lo guardado no es una lista, ninguno.
const SQL_IDS_GUARDADOS = `(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(aj_.valor->'groupIds') = 'array'
    THEN aj_.valor->'groupIds' ELSE '[]'::jsonb END) FROM aim_ajustes aj_ WHERE aj_.clave = '${CLAVE_INDIVIDUALES}')`;

// ¿Es individual la clase? `g` = alias de tul_groups, `a` = de tul_activities.
export const sqlEsIndividual = (g = 'g', a = 'a') => `COALESCE(CASE
    WHEN EXISTS (SELECT 1 FROM aim_ajustes aj0_ WHERE aj0_.clave = '${CLAVE_INDIVIDUALES}')
        THEN ${g}.group_id::text IN ${SQL_IDS_GUARDADOS}
    ELSE (${g}.name ILIKE '%speaking%' OR ${a}.name ILIKE '%speaking%') END, false)`;

// Los group_id de las clases individuales de un club, para «group_id IN (...)».
export const sqlGruposIndividuales = (clubId) => `(SELECT gi_.group_id FROM tul_groups gi_
    JOIN tul_activities ai_ ON ai_.activity_id = gi_.activity_id
    WHERE ai_.club_id = '${clubId}' AND ${sqlEsIndividual('gi_', 'ai_')})`;

// Lo mismo en JS: el conjunto de ids, guardado un minuto.
let cache = null;
export async function gruposIndividuales(pool, clubId) {
    if (cache && cache.club === clubId && cache.t > Date.now() - 60_000) return cache.v;
    const r = await pool.query(`SELECT group_id FROM ${sqlGruposIndividuales(clubId)} x`);
    const v = new Set(r.rows.map(x => x.group_id));
    cache = { t: Date.now(), club: clubId, v };
    return v;
}
export const olvidarGruposIndividuales = () => { cache = null; };
