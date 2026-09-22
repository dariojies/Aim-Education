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

// De menos a más mando. El trabajador (personal que no da clase: limpieza,
// recepción…) está por debajo del instructor y por encima del alumno: entra al
// panel para fichar. 'secretaria' va por encima de los instructores y por debajo
// del dueño del club, que ve lo mismo salvo los ajustes. El Equipo IT tiene los
// mismos privilegios que el dueño del club.
export const RANGO = { trabajador: 1, instructor: 2, secretaria: 3, club_owner: 4, equipo_it: 4, superadmin: 5 };
export const ROLES_STAFF = Object.keys(RANGO);

export const NOMBRE_ROL = {
    trabajador: 'Trabajador',
    instructor: 'Instructor',
    secretaria: 'Secretaría',
    club_owner: 'Dueño del club',
    equipo_it: 'Equipo IT',
    superadmin: 'Superadmin',
};

// Rangos que solo existen en Aim Education. La cuenta la comparten otras apps
// (Aim-Tul solo conoce alumno, instructor y dueño), así que estos no se escriben
// en ella: van en la tabla aim_rangos, y allí cada uno sigue con el suyo.
export const RANGOS_PROPIOS = ['trabajador', 'secretaria', 'equipo_it'];
// Los que se pueden dar desde el panel. El superadmin no: es un rango de
// desarrollo, para gente concreta, y no se muestra en ningún sitio.
export const RANGOS_ASIGNABLES = ['student', 'trabajador', 'instructor', 'secretaria', 'club_owner', 'equipo_it'];
export const NOMBRE_RANGO = {
    student: 'Alumno', trabajador: 'Trabajador', instructor: 'Instructor', secretaria: 'Secretaría',
    club_owner: 'Dueño del club', equipo_it: 'Equipo IT',
};

// El rango de alguien en Aim Education: el propio (aim_rangos) si lo tiene y, si
// no, el de su cuenta.
const rangoBase = (role, rangoAim) => String(rangoAim || role || '').toLowerCase();

// El rol con el que se entra al panel y que decide qué se puede hacer. El
// superadmin (dev_role) manda por encima de todo, pero no cambia el rango que se
// ve: es invisible.
export function rolEfectivo(role, devRole, rangoAim) {
    const base = rangoBase(role, rangoAim);
    if (base === 'superadmin' || String(devRole || '').toLowerCase() === 'superadmin'
        || String(role || '').toLowerCase() === 'superadmin') return 'superadmin';
    return RANGO[base] ? base : null; // null: no es personal del club
}

// El rango que se enseña. Nunca "superadmin": ese poder existe, pero no se ve.
export function rolVisible(role, rangoAim) {
    const base = rangoBase(role, rangoAim);
    return NOMBRE_RANGO[base] ? base : null;
}

export const mandaAlMenos = (rol, minimo) => (RANGO[rol] || 0) >= (RANGO[minimo] || 99);

// Qué puede hacer cada rol. Se parte de que todo está permitido y se recorta
// para los instructores y, más todavía, para los trabajadores.
export function permisosDe(rol) {
    // El trabajador solo entra a lo suyo: fichar, su día y soporte.
    const trabajador = rol === 'trabajador';
    // Lo que no ve un instructor tampoco lo ve un trabajador.
    const instructor = rol === 'instructor' || trabajador;
    const jefe = mandaAlMenos(rol, 'club_owner');

    return {
        rol,
        // ── Secciones del menú ──
        secciones: {
            overview: !trabajador,
            // La agenda es de cada uno: la tiene todo el que entra al panel.
            agenda: true,
            students: !trabajador,
            familias: !instructor,
            billing: !instructor,
            payments: !instructor,     // gastos del club
            classes: !trabajador,
            // La clase de Speaking la gestionan los profes (apuntar alumnos) y la
            // ve secretaría (llamar a los padres). Ticket #228.
            speaking: !trabajador,
            // El fichaje (registro de jornada) lo usa TODO el personal, también los
            // instructores y los trabajadores: cada uno ficha su jornada (#233).
            fichaje: true,
            camp: !trabajador,
            // Los títulos y las notas de examen los sube el club, no el monitor.
            titulos: !instructor,
            // Objetos perdidos: lo lleva secretaría/dirección.
            objetos: !instructor,
            // El almacén (inventario) lo gestiona secretaría/dirección (ticket #250).
            almacen: !instructor,
            reportes: !trabajador,
            events: !trabajador,
            news: !instructor,
            groups: !trabajador,
            instructors: !instructor,
            portada: !instructor,
            // La planificación del Equipo IT: la ven secretaría y dirección; solo
            // la tocan el propio equipo y los superadmin (editarEquipoIT).
            equipo_it: mandaAlMenos(rol, 'secretaria'),
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
        pedirEventos: rol === 'instructor',
        // En soporte ve sus tickets, como cualquiera desde su perfil.
        soporteCompleto: !instructor,
        // Ver los fichajes de TODO el personal, corregir olvidos y exportar para la
        // Inspección es cosa de secretaría/dirección; un instructor solo ve el suyo.
        fichajesGestion: mandaAlMenos(rol, 'secretaria'),
        // Planificar las semanas del Equipo IT: el equipo y los superadmin.
        editarEquipoIT: rol === 'equipo_it' || rol === 'superadmin',
        // Dar o quitar rangos del club (dueño del club y por encima).
        cambiarRangos: jefe,
    };
}

// Lo que se manda a la pantalla al entrar. El nombre es el del rango VISIBLE,
// no el efectivo: un superadmin ve su rango de verdad (p. ej. Secretaría).
export function sesionDe(rol, visible) {
    return { rol, nombreRol: NOMBRE_ROL[visible] || null, permisos: permisosDe(rol) };
}
