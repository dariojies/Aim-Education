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
            // El resumen lo tiene todo el mundo, cada uno con lo suyo (#327): el
            // trabajador ve su día (fichaje, tareas).
            overview: true,
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
            // Los avisos y llamadas a la acción de la web (#341), como la portada.
            ctas: !instructor,
            // Las consultas del formulario de contacto de la web (ticket #295):
            // las atienden secretaría y dirección.
            contactos: mandaAlMenos(rol, 'secretaria'),
            // Los currículums de «Trabaja con nosotros» (#368): secretaría y dirección.
            candidatos: mandaAlMenos(rol, 'secretaria'),
            // La galería de fotos (#364): la llevan secretaría y dirección.
            galeria: !instructor,
            // Faltas seguidas de los alumnos, para llamar a las familias: secretaría
            // y dirección.
            faltas: mandaAlMenos(rol, 'secretaria'),
            // CRM: segmentos, campañas y correo del club (tickets #310-#316).
            comunicaciones: mandaAlMenos(rol, 'secretaria'),
            // La bandeja de correo: el buzón general (info@) y el suyo (#317).
            bandeja: mandaAlMenos(rol, 'secretaria'),
            // Los mensajes de Messenger, Instagram y WhatsApp (#341), como el correo.
            redes: mandaAlMenos(rol, 'secretaria'),
            // La planificación del Equipo IT: la ven secretaría y dirección; solo
            // la tocan el propio equipo y los superadmin (editarEquipoIT).
            equipo_it: mandaAlMenos(rol, 'secretaria'),
            settings: jefe,            // los ajustes del club son cosa del club
            // Qué ve y qué avisos recibe cada rango (ticket #333).
            rangos: jefe,
            support: true,
        },

        // ── Qué se puede hacer dentro de cada una ──
        // El resumen de un instructor solo habla de lo suyo (el servidor elige
        // qué resumen toca según el rango: /api/admin/resumen).
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

// ── Avisos de la campanita (ticket #333) ──
// Quién recibe cada aviso. El servidor pregunta aquí antes de mandar cada uno
// (/api/admin/notificaciones) y la página «Rangos y permisos» lo enseña: así lo
// que se ve en esa página es siempre lo que pasa de verdad.
//   quien(permisos, rol) → ¿lo recibe? · nota(rol) → matiz para ese rango.
const todos = () => true;
const secretariaOMas = (p, rol) => mandaAlMenos(rol, 'secretaria');
export const AVISOS = [
    { id: 'tickets_sin_asignar', grupo: 'Soporte', texto: 'Tickets sin asignar', quien: (p) => p.soporteCompleto },
    { id: 'tickets_mios', grupo: 'Soporte', texto: 'Tickets asignados a ti', quien: todos },
    { id: 'tickets_mensajes', grupo: 'Soporte', texto: 'Mensajes nuevos en un ticket', quien: todos,
      nota: (p) => (p.soporteCompleto ? 'de todos los tickets' : 'solo de los suyos') },
    { id: 'cobros_pendientes', grupo: 'Dinero', texto: 'Cargos pendientes de cobrar', quien: (p) => p.secciones.billing },
    { id: 'caja_sin_cerrar', grupo: 'Dinero', texto: 'Días con cobros y sin arqueo de caja', quien: (p) => p.secciones.billing },
    { id: 'datos_fiscales', grupo: 'Dinero', texto: 'Cambios de datos fiscales por autorizar', quien: (p) => p.secciones.billing },
    { id: 'campamento_sin_ficha', grupo: 'Clases', texto: 'Niños del campamento sin ficha', quien: (p) => p.campCompleto },
    { id: 'eventos_propuestos', grupo: 'Clases', texto: 'Eventos propuestos sin decidir', quien: (p) => p.editarEventos },
    { id: 'eventos_respondidos', grupo: 'Clases', texto: 'Respuesta a un evento que ha propuesto', quien: (p) => !p.editarEventos },
    { id: 'lista_espera', grupo: 'Clases', texto: 'Clases con plaza libre y gente esperando', quien: (p, rol) => rol !== 'trabajador',
      nota: (p) => (p.soloSusGrupos ? 'solo de sus clases' : null) },
    { id: 'faltas', grupo: 'Clases', texto: 'Alumnos con 4 o más faltas seguidas', quien: (p) => p.secciones.faltas },
    { id: 'speaking_por_llamar', grupo: 'Speaking', texto: 'Alumnos de Speaking por avisar a los padres', quien: todos },
    { id: 'speaking_rechazados', grupo: 'Speaking', texto: 'Familias que han dicho que no al Speaking', quien: todos },
    { id: 'fotos', grupo: 'Familias', texto: 'Solicitudes del permiso de fotos', quien: (p) => p.editarAlumnos },
    { id: 'contactos', grupo: 'Familias', texto: 'Consultas de la web sin atender', quien: (p) => p.secciones.contactos },
    { id: 'candidatos', grupo: 'Club', texto: 'Candidaturas nuevas de «Trabaja con nosotros»', quien: (p) => p.secciones.candidatos },
    { id: 'correos_asignados', grupo: 'Correo', texto: 'Correos de info@ asignados a él', quien: (p) => p.secciones.bandeja },
    { id: 'redes_sin_leer', grupo: 'Correo', texto: 'Mensajes de redes sociales sin leer (suyos o sin asignar)', quien: (p) => p.secciones.redes },
    { id: 'almacen', grupo: 'Club', texto: 'Artículos del almacén por debajo del mínimo', quien: (p) => p.secciones.almacen },
    { id: 'resumen_horas', grupo: 'Fichaje', texto: 'Su resumen de horas del mes, por confirmar', quien: todos },
    { id: 'correcciones_por_aprobar', grupo: 'Fichaje', texto: 'Correcciones de su fichaje que le proponen', quien: todos },
    { id: 'correcciones_por_validar', grupo: 'Fichaje', texto: 'Correcciones de fichaje que piden los trabajadores', quien: secretariaOMas },
    { id: 'correcciones_respondidas', grupo: 'Fichaje', texto: 'Respuesta a una corrección que ha pedido', quien: todos },
    { id: 'ausencias_por_aprobar', grupo: 'Fichaje', texto: 'Vacaciones y ausencias por aprobar', quien: secretariaOMas },
    { id: 'ausencias_respondidas', grupo: 'Fichaje', texto: 'Respuesta a sus vacaciones o ausencias', quien: todos },
];
const AVISO_POR_ID = Object.fromEntries(AVISOS.map(a => [a.id, a]));
export function recibeAviso(id, permisos, rol) {
    const a = AVISO_POR_ID[id];
    if (!a) return false;
    // Lo que haya cambiado la dirección en «Rangos y permisos» manda.
    if (typeof permisos?.avisos?.[id] === 'boolean') return permisos.avisos[id];
    // Un superadmin recibe lo mismo que la dirección.
    return !!a.quien(permisos, rol === 'superadmin' ? 'club_owner' : rol);
}

// ── Permisos cambiados por la dirección (ticket #333) ──
// Desde «Rangos y permisos» el dueño del club puede cambiar qué apartados ve
// cada rango y qué avisos le llegan. Se guardan solo los cambios respecto a lo
// de fábrica: { rol: { secciones: { id: bool }, avisos: { id: bool } } }.
export const RANGOS_EDITABLES = ['trabajador', 'instructor', 'secretaria', 'club_owner'];
// Lo que no se puede cambiar: el fichaje es obligatorio por ley para todo el
// personal, y el dueño no puede quedarse sin «Rangos y permisos» ni «Ajustes»
// (nadie podría deshacerlo). «Rangos y permisos» es solo de la dirección.
export function seccionFija(id, rol) {
    if (id === 'fichaje') return true;
    if (id === 'rangos') return true;
    if (rol === 'club_owner' && id === 'settings') return true;
    return false;
}
export function aplicarAjustesPermisos(p, rol, ajustes) {
    const a = ajustes?.[rol];
    if (!a || !RANGOS_EDITABLES.includes(rol)) return p;
    const secciones = { ...p.secciones };
    for (const [id, v] of Object.entries(a.secciones || {})) {
        if (id in secciones && !seccionFija(id, rol)) secciones[id] = !!v;
    }
    const avisos = {};
    for (const [id, v] of Object.entries(a.avisos || {})) if (AVISO_POR_ID[id]) avisos[id] = !!v;
    return { ...p, secciones, avisos };
}
// Deja unos ajustes recibidos solo con lo que se puede cambiar y solo con lo
// que difiere de lo de fábrica.
export function limpiarAjustesPermisos(entrada) {
    const out = {};
    for (const rol of RANGOS_EDITABLES) {
        const e = entrada?.[rol];
        if (!e) continue;
        const base = permisosDe(rol);
        const secciones = {}, avisos = {};
        for (const [id, v] of Object.entries(e.secciones || {})) {
            if (id in base.secciones && !seccionFija(id, rol) && !!v !== !!base.secciones[id]) secciones[id] = !!v;
        }
        const conSecciones = { ...base, secciones: { ...base.secciones, ...secciones } };
        for (const [id, v] of Object.entries(e.avisos || {})) {
            if (AVISO_POR_ID[id] && !!v !== recibeAviso(id, conSecciones, rol)) avisos[id] = !!v;
        }
        if (Object.keys(secciones).length || Object.keys(avisos).length) out[rol] = { secciones, avisos };
    }
    return out;
}

// Lo que se manda a la pantalla al entrar. El nombre es el del rango VISIBLE,
// no el efectivo: un superadmin ve su rango de verdad (p. ej. Secretaría).
export function sesionDe(rol, visible) {
    return { rol, nombreRol: NOMBRE_ROL[visible] || null, permisos: permisosDe(rol) };
}
