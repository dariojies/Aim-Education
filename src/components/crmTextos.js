// Los nombres de los tipos de correo del CRM, iguales en segmentos y campañas.
// Por dentro siguen siendo servicio / actividades / comercial; aquí se dicen
// como los entiende quien los usa, con qué es cada uno y a quién le llega.
export const TIPOS_CORREO = [
  { id: 'servicio', nombre: 'Aviso del club', ejemplo: 'Cambios de horario, cierres, cobros…', quien: 'Llega a todos los que tienen correo.' },
  { id: 'actividades', nombre: 'Novedades de sus clases', ejemplo: 'Exhibiciones, exámenes, excursiones…', quien: 'No llega a quien ha dicho que no las quiere.' },
  { id: 'comercial', nombre: 'Publicidad y ofertas', ejemplo: 'Campamento, promociones, actividades nuevas…', quien: 'Solo llega a quien lo ha aceptado.' },
];
export const NOMBRE_TIPO_CORREO = Object.fromEntries(TIPOS_CORREO.map(t => [t.id, t.nombre]));

const lista = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

// Un segmento contado en una frase: «Alumnos actuales de Ballet, de 6 a 12
// años, con recibos sin pagar. Se escribe a sus padres o tutores.»
export function describirSegmento(f = {}, clases = []) {
  const quien = { activos: 'Alumnos actuales', baja: 'Antiguos alumnos', todos: 'Alumnos actuales y antiguos' }[f.estado || 'activos'];
  const partes = [];
  if (f.clases?.length) {
    const nombres = f.clases.map(id => clases.find(c => c.id === id)?.nombre).filter(Boolean);
    partes.push(nombres.length && nombres.length <= 3 ? `de ${lista(nombres)}` : `de ${f.clases.length} clases concretas`);
  } else if (f.actividades?.length) partes.push(`de ${lista(f.actividades)}`);
  else partes.push('de todas las actividades');
  const min = String(f.edadMin ?? '').trim(), max = String(f.edadMax ?? '').trim();
  if (min && max) partes.push(`de ${min} a ${max} años`);
  else if (min) partes.push(`de ${min} años o más`);
  else if (max) partes.push(`de hasta ${max} años`);
  if (Number(f.faltasMin) > 0) partes.push(`que han faltado ${f.faltasMin} ${Number(f.faltasMin) === 1 ? 'vez' : 'veces'} o más este mes`);
  if (f.pendientes) partes.push('con recibos sin pagar');
  if (f.campamento) partes.push('apuntados al campamento');
  const a = f.destino === 'alumno' ? 'Se escribe al propio alumno.' : 'Se escribe a sus padres o tutores.';
  return `${quien} ${partes.join(', ')}. ${a}`;
}
