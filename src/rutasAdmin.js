// Las direcciones del panel de administración (/admin/<ruta>) y la sección que
// abre cada una. Varias rutas pueden llevar a la misma sección: los nombres
// antiguos siguen valiendo porque están en avisos y correos ya enviados. La
// primera de cada lista es la que pone el menú al pulsar.
export const RUTAS_ADMIN = {
  overview: ['', 'resumen'],
  agenda: ['mi-dia', 'agenda'],
  // También /admin/clases/lista[/<grupo>] (los enlaces de Mi día y el Resumen).
  pasarlista: ['pasar-lista'],
  fichaje: ['fichaje'],
  support: ['soporte', 'tickets'],
  incidencias: ['incidencias'],
  classes: ['clases'],
  speaking: ['clases-individuales', 'speaking'],
  faltas: ['faltas'],
  camp: ['campamento'],
  events: ['eventos'],
  galeria: ['fotos', 'galeria'],
  titulos: ['titulos'],
  reportes: ['reportes'],
  students: ['alumnos'],
  familias: ['familias'],
  instructors: ['personal', 'instructores'],
  candidatos: ['candidatos'],
  billing: ['facturacion', 'ingresos'],
  // 'recibos' es el nombre antiguo: esa sección ahora son los gastos del club.
  payments: ['gastos', 'recibos'],
  bandeja: ['correo'],
  redes: ['redes'],
  contactos: ['consultas'],
  comunicaciones: ['comunicaciones', 'crm'],
  almacen: ['almacen'],
  objetos: ['objetos', 'objetos-perdidos'],
  brickslab: ['brickslab'],
  portada: ['portada'],
  ctas: ['avisos'],
  news: ['noticias'],
  rangos: ['rangos'],
  settings: ['ajustes'],
  equipo_it: ['equipo-it'],
  cambios: ['cambios'],
};

// Las pestañas de Comunicación tienen dirección propia (/admin/campanas…), y
// también valen como /admin/comunicaciones/<pestaña>.
export const PESTANAS_CRM = ['campanas', 'segmentos', 'automatismos', 'disenos'];

const SECCION_DE_RUTA = Object.fromEntries(
  Object.entries(RUTAS_ADMIN).flatMap(([id, rutas]) => rutas.map(r => [r, id]))
);

// De los trozos de la dirección (['admin', 'clases', 'lista', '12']) a la
// sección y, si es de Comunicación, la pestaña. Lo que no se conoce, al Resumen.
export function seccionDeRuta(seg = [], params = {}) {
  const s = seg[1] || '';
  // Pasar lista es uno solo, se llegue por el menú o por los enlaces antiguos
  // de Clases (/admin/clases/lista, ?vista=asistencia).
  if (s === 'clases' && (seg[2] === 'lista' || params.vista === 'asistencia')) return { view: 'pasarlista', pestana: null };
  if (PESTANAS_CRM.includes(s)) return { view: 'comunicaciones', pestana: s };
  const view = SECCION_DE_RUTA[s] || 'overview';
  const pestana = view === 'comunicaciones' && PESTANAS_CRM.includes(seg[2]) ? seg[2] : null;
  return { view, pestana };
}

// La dirección que pone el menú para una sección (y pestaña de Comunicación).
export function rutaDeSeccion(id, pestana) {
  if (pestana && PESTANAS_CRM.includes(pestana)) return `/admin/${pestana}`;
  const r = RUTAS_ADMIN[id]?.[0];
  return r ? `/admin/${r}` : '/admin';
}
