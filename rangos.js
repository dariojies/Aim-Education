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

// Aspecto de cada cinturón, copiado de "aim-tul RNW/src/data/belts.ts". Los de
// punta son bicolor: el cinturón es del color base y la punta del siguiente.
// El color del texto NO puede salir de aquí: un blanco-amarillo llevaba texto
// amarillo sobre fondo blanco y no se leía. Se calcula por luminancia.
const CINTURONES = {
    0:  { base: '#FFFFFF' },
    1:  { base: '#FFFFFF', punta: '#FFE135' },
    2:  { base: '#FFE135' },
    3:  { base: '#FFE135', punta: '#2E8B57' },
    4:  { base: '#2E8B57' },
    5:  { base: '#2E8B57', punta: '#0057B7' },
    6:  { base: '#0057B7' },
    7:  { base: '#0057B7', punta: '#CE1126' },
    8:  { base: '#CE1126' },
    9:  { base: '#CE1126', punta: '#000000' },
};
const NEGRO = { base: '#000000' };

// Texto oscuro sobre fondos claros y claro sobre oscuros, para que siempre se lea.
function textoLegible(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const luz = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luz > 0.4 ? '#1A1A1A' : '#FFFFFF';
}

// La escala de una actividad. Taekwondo la saca de tul_belts (está en la base);
// el resto, de las escalas fijas. Una actividad 'general' no tiene rangos.
export async function escalaDe(activityType, pool) {
    if (activityType === TIPO_TAEKWONDO) {
        const r = await pool.query('SELECT belt_level, name FROM tul_belts ORDER BY belt_level');
        return r.rows.map(b => {
            const c = CINTURONES[b.belt_level] || NEGRO;
            return {
                order: b.belt_level,
                name: b.name,
                color: c.base,
                punta: c.punta || null,
                textColor: textoLegible(c.base),
                // El blanco necesita borde para verse sobre fondo claro.
                borde: c.base === '#FFFFFF' ? '#333333' : null,
            };
        });
    }
    return (ESCALAS[activityType] || []).map(n => ({
        ...n, textColor: n.textColor || textoLegible(n.color), punta: null,
        borde: n.color === '#FFFFFF' ? '#333333' : null,
    }));
}

// Devuelve, para cada actividad del club que tenga escala, sus niveles válidos.
// Es lo que rellena los desplegables: así no se puede escribir un rango que no
// existe, que es lo que pasaba cuando el cinturón era un campo de texto libre.
export async function escalasDelClub(pool, clubId) {
    const acts = await pool.query(
        'SELECT activity_id AS id, name, activity_type AS tipo, icon FROM tul_activities WHERE club_id = $1 ORDER BY name',
        [clubId]
    );
    const salida = [];
    for (const a of acts.rows) {
        const niveles = await escalaDe(a.tipo, pool);
        salida.push({ ...a, tieneRangos: niveles.length > 0, niveles });
    }
    return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exámenes y títulos (ticket #212)
// ─────────────────────────────────────────────────────────────────────────────

// Correspondencia puntos → resultado, por disciplina. Son los baremos de los
// organismos que examinan (la RAD en Ballet, Cambridge en Inglés, la federación
// en Taekwon-Do), NO los decide el club: por eso están fijos aquí, igual que las
// escalas. La nota se normaliza a 100 antes de mirar la banda, así da igual que
// el examen venga sobre 100, sobre 15 o sobre lo que sea. El resultado se puede
// reescribir a mano en cada examen para los casos que no encajan en bandas
// (p. ej. los "shields" de Starters/Movers/Flyers, que no son apto/no apto).
export const BAREMOS = {
    ballet: {
        max: 100,
        bandas: [
            { min: 75, resultado: 'Distinción', apto: true },
            { min: 60, resultado: 'Mérito', apto: true },
            { min: 40, resultado: 'Aprobado', apto: true },
            { min: 0,  resultado: 'No apto', apto: false },
        ],
    },
    ingles: {
        max: 100,
        bandas: [
            { min: 80, resultado: 'Sobresaliente (A)', apto: true },
            { min: 75, resultado: 'Notable (B)', apto: true },
            { min: 60, resultado: 'Aprobado (C)', apto: true },
            { min: 0,  resultado: 'No apto', apto: false },
        ],
    },
    taekwondo_itf: {
        max: 100,
        bandas: [
            { min: 90, resultado: 'Apto con mención', apto: true },
            { min: 60, resultado: 'Apto', apto: true },
            { min: 0,  resultado: 'No apto', apto: false },
        ],
    },
};

export const baremoDe = (activityType) => BAREMOS[activityType] || null;

// A partir de la nota, el resultado y si está apto. Devuelve null si esa
// actividad no tiene baremo o si no hay nota (entonces el resultado se pone a
// mano). puntosMax deja meter exámenes que no van sobre 100.
export function resultadoDe(activityType, puntos, puntosMax) {
    const b = BAREMOS[activityType];
    if (!b || puntos == null || puntos === '') return null;
    const max = Number(puntosMax) || b.max || 100;
    const sobre100 = max !== 100 ? (Number(puntos) / max) * 100 : Number(puntos);
    const banda = b.bandas.find(x => sobre100 >= x.min);
    return banda ? { resultado: banda.resultado, apto: banda.apto } : null;
}

// Cómo se paga la matrícula del examen en cada disciplina (lo explica el ticket
// #212). Solo el Ballet la cobramos nosotros —y la abonamos íntegra a la RAD—,
// así que es la única que genera un cargo. Las demás son pagos que la familia
// hace fuera y de los que no llevamos la caja; se dejan anotados y ya está.
export const MATRICULA_EXAMEN = {
    ballet: {
        modo: 'cobrada',
        nota: 'La matrícula la cobramos nosotros y la abonamos íntegra a la RAD.',
    },
    ingles: {
        modo: 'externa',
        nota: 'La familia transfiere la matrícula directamente al centro examinador. No hacemos seguimiento del pago.',
    },
    taekwondo_itf: {
        modo: 'club',
        nota: 'La cuota del examen se abona al club deportivo.',
    },
};

export const matriculaExamenDe = (activityType) => MATRICULA_EXAMEN[activityType] || { modo: 'externa', nota: '' };
