// ─────────────────────────────────────────────────────────────────────────────
// Quién puede ver y tocar qué en el panel.
//
// Este archivo lo usan el servidor y la pantalla a la vez, a propósito: si cada
// uno llevara su propia lista, acabarían diciendo cosas distintas y saldría un
// menú con secciones que luego dan 403, o peor, al revés.
//
// Esconder un botón no es seguridad: el permiso se comprueba SIEMPRE también en
// el servidor. Lo de aquí sirve para que la pantalla enseñe solo lo que hay.
// ─────────────────────────────────────────────────────────────────────────────

// De menos a más mando. 'secretaria' está por encima de los instructores y por
// debajo del dueño del club; su panel propio está por hacer, de momento ve lo
// mismo que el dueño salvo los ajustes del club.
export const RANGO = { instructor: 1, secretaria: 2, club_owner: 3, superadmin: 4 };
export const ROLES_STAFF = Object.keys(RANGO);

export const NOMBRE_ROL = {
    instructor: 'Instructor',
    secretaria: 'Secretaría',
    club_owner: 'Dueño del club',
    superadmin: 'Superadmin',
};

// El rol con el que se entra al panel. El dev_role manda por encima del role:
// hay instructores que además llevan el desarrollo y tienen que verlo todo.
export function rolEfectivo(role, devRole) {
    const r = String(role || '').toLowerCase();
    const d = String(devRole || '').toLowerCase();
    if (r === 'superadmin' || d === 'superadmin') return 'superadmin';
    const suyos = [r, d].filter(x => RANGO[x]);
    if (!suyos.length) return null; // no es personal del club
    return suyos.sort((a, b) => RANGO[b] - RANGO[a])[0];
}

export const mandaAlMenos = (rol, minimo) => (RANGO[rol] || 0) >= (RANGO[minimo] || 99);

// Qué puede hacer cada rol. Se parte de que todo está permitido y se recorta
// para los instructores, que son los únicos con el panel limitado por ahora.
export function permisosDe(rol) {
    const instructor = rol === 'instructor';
    const jefe = mandaAlMenos(rol, 'club_owner');

    return {
        rol,
        // ── Secciones del menú ──
        secciones: {
            overview: true,
            // La agenda es de cada uno: la tiene todo el que entra al panel.
            agenda: true,
            students: true,
            familias: !instructor,
            billing: !instructor,
            payments: !instructor,     // gastos del club
            classes: true,
            camp: true,
            reportes: true,
            events: true,
            news: !instructor,
            groups: true,
            instructors: !instructor,
            portada: !instructor,
            settings: jefe,            // los ajustes del club son cosa del club
            support: true,
        },

        // ── Qué se puede hacer dentro de cada una ──
        // El resumen de un instructor solo habla de lo suyo.
        resumenGeneral: !instructor,
        // Las fichas de alumno se miran, no se tocan.
        editarAlumnos: !instructor,
        // Pasar lista y ver la lista solo de los grupos que lleva.
        soloSusGrupos: instructor,
        // Del campamento, solo la lista y la agenda del día.
        campCompleto: !instructor,
        // Las estadísticas de los demás no son asunto suyo.
        reportesGenerales: !instructor,
        // Los eventos se ven y se consultan los inscritos, pero no se tocan.
        editarEventos: !instructor,
        verDineroEventos: !instructor,
        // Un instructor pide que se cree un evento; lo aprueba el club.
        pedirEventos: instructor,
        // En soporte ve sus tickets, como cualquiera desde su perfil.
        soporteCompleto: !instructor,
    };
}

// Lo que se manda a la pantalla al entrar.
export function sesionDe(rol) {
    return { rol, nombreRol: NOMBRE_ROL[rol] || null, permisos: permisosDe(rol) };
}
