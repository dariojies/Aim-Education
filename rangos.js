// Rangos de los alumnos, por actividad.
//
// Cada actividad tiene su propia escala y NO se pisan entre ellas: un alumno
// puede ser cinturón azul de Taekwondo y estar en Grado 3 de Ballet a la vez.
// El rango de cada alumno en cada actividad vive en tul_user_progression, que
// es la misma tabla que usa Learning Dungeon.
//
// Las escalas son fijas (son sistemas estandarizados, no los decide el club) y
// están copiadas de "aim-tul RNW/src/data/progressionScales.ts" y belts.ts. Si
// allí cambian, hay que cambiarlas aquí igual.

// Taekwondo usa los cinturones, que están en la tabla tul_belts.
export const TIPO_TAEKWONDO = 'taekwondo_itf';

export const ESCALAS = {
    ingles: [
        { order: 0, name: 'Starters', color: '#A0C4FF' },
        { order: 1, name: 'Movers', color: '#9BF6FF' },
        { order: 2, name: 'Flyers', color: '#CAFFBF' },
        { order: 3, name: 'A1', color: '#FDFFB6' },
        { order: 4, name: 'A2', color: '#FFD6A5' },
        { order: 5, name: 'B1', color: '#FFADAD' },
        { order: 6, name: 'B2', color: '#FFC6FF' },
        { order: 7, name: 'C1', color: '#BDB2FF' },
        { order: 8, name: 'C2', color: '#000000', textColor: '#FFFFFF' },
    ],
    ballet: [
        { order: 0, name: 'Pre-Ballet', color: '#FFFFFF', textColor: '#333333' },
        { order: 1, name: 'Grado 1', color: '#FFD1DC' },
        { order: 2, name: 'Grado 2', color: '#FFB6C1' },
        { order: 3, name: 'Grado 3', color: '#FF69B4' },
        { order: 4, name: 'Grado 4', color: '#DB7093' },
        { order: 5, name: 'Grado 5', color: '#C71585', textColor: '#FFFFFF' },
        { order: 6, name: 'Grado 6', color: '#8B008B', textColor: '#FFFFFF' },
        { order: 7, name: 'Grado 7', color: '#4B0082', textColor: '#FFFFFF' },
        { order: 8, name: 'Grado 8', color: '#000000', textColor: '#FFFFFF' },
    ],
};

// Color aproximado de cada cinturón, para pintarlo igual que en Learning Dungeon.
const COLOR_CINTURON = {
    0: '#FFFFFF', 1: '#FFFFFF', 2: '#FFE135', 3: '#FFE135', 4: '#4CAF50',
    5: '#4CAF50', 6: '#2196F3', 7: '#2196F3', 8: '#E53935', 9: '#E53935',
};

// La escala de una actividad. Taekwondo la saca de tul_belts (está en la base);
// el resto, de las escalas fijas. Una actividad 'general' no tiene rangos.
export async function escalaDe(activityType, pool) {
    if (activityType === TIPO_TAEKWONDO) {
        const r = await pool.query('SELECT belt_level, name FROM tul_belts ORDER BY belt_level');
        return r.rows.map(b => ({
            order: b.belt_level,
            name: b.name,
            color: COLOR_CINTURON[b.belt_level] || '#1A1A1A',
            textColor: b.belt_level >= 10 || [1].includes(b.belt_level) ? '#FFFFFF' : undefined,
        }));
    }
    return ESCALAS[activityType] || [];
}

// Devuelve, para cada actividad del club que tenga escala, sus niveles válidos.
// Es lo que rellena los desplegables: así no se puede escribir un rango que no
// existe, que es lo que pasaba cuando el cinturón era un campo de texto libre.
export async function escalasDelClub(pool, clubId) {
    const acts = await pool.query(
        'SELECT activity_id AS id, name, activity_type AS tipo FROM tul_activities WHERE club_id = $1 ORDER BY name',
        [clubId]
    );
    const salida = [];
    for (const a of acts.rows) {
        const niveles = await escalaDe(a.tipo, pool);
        salida.push({ ...a, tieneRangos: niveles.length > 0, niveles });
    }
    return salida;
}
