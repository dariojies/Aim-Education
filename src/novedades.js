// ─────────────────────────────────────────────────────────────────────────────
// Novedades de un deploy (ticket #397), redactadas a partir de sus commits, sin
// IA ni nada de pago. Cada commit da una o varias líneas:
//  · si su mensaje trae líneas «Novedad: …» (cambios.js las guarda en
//    `novedades`), esas tal cual: están escritas para quien lo lee;
//  · si no, su primer renglón, «Apartado (#123): qué cambia», que se parte en
//    apartado y texto. Los «arreglos de la revisión» y los «Unir …» no se
//    cuentan como novedad: como mucho, «Pequeños arreglos» en su apartado.
// ─────────────────────────────────────────────────────────────────────────────

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Los apartados con más de un nombre en los commits, con el que se enseña.
const APARTADOS = {
  menu: 'Menú del panel', 'menu del panel': 'Menú del panel', panel: 'Menú del panel', 'menu del panel ordenado': 'Menú del panel',
  cambios: 'Registro de cambios',
  cobros: 'Cobros y facturación', facturacion: 'Cobros y facturación',
  galeria: 'Galería',
  'faltas seguidas': 'Faltas',
  'soporte renovado': 'Soporte',
};

const TICKETS = /#\d{1,6}\b/g;
// «(#160, #168 y #92)» o «#389/#393», para quitarlos del texto (se enseñan aparte).
const TICKETS_ENTRE_PARENTESIS = /\s*\(\s*#\d{1,6}(?:\s*(?:,|\/|\by\b|\be\b)\s*#\d{1,6})*\s*\)/g;
const TICKETS_SUELTOS = /\s*#\d{1,6}(?:\s*\/\s*#\d{1,6})*/g;
const ES_ARREGLO = /^(pequeños\s+)?arreglos?(\s+(de|tras)\s+la\s+revisi[oó]n)?\.?$/i;
const ES_UNION = /^(unir|merge)\b/i;

const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function nombreApartado(crudo) {
  // Sin tickets, sin «(familias)» y sin «, parte 2»: el apartado a secas.
  const limpio = String(crudo || '').replace(TICKETS_ENTRE_PARENTESIS, '').replace(TICKETS_SUELTOS, '')
    .replace(/\s*\([^)]*\)/g, '').replace(/,\s*parte\s+\d+$/i, '').replace(/\s+/g, ' ').trim();
  if (!limpio) return null;
  return APARTADOS[sinTildes(limpio)] || mayuscula(limpio);
}

// Une una lista a la española: «A, B y C» (con «e» delante de «i»/«hi»).
export function unirConY(lista) {
  if (lista.length < 2) return lista.join('');
  const ultimo = lista[lista.length - 1];
  const y = /^h?i(?![aeiou])/.test(sinTildes(ultimo)) ? ' e ' : ' y ';
  return lista.slice(0, -1).join(', ') + y + ultimo;
}

// Una línea («Galería (#12): etiquetar por clase») → { apartados, texto, tickets }.
function partirLinea(linea) {
  const tickets = [...new Set(String(linea).match(TICKETS) || [])];
  const m = /^([^:«»"]{2,48}?):\s+(.+)$/.exec(linea);
  const crudo = m ? m[1] : null;
  const texto = (m ? m[2] : linea).replace(TICKETS_ENTRE_PARENTESIS, '').replace(TICKETS_SUELTOS, '').replace(/\s+/g, ' ').replace(/[\s;,.]+$/, '').trim();
  // «Faltas (#402) y Cambios (#397): arreglos…» habla de dos apartados (solo
  // en los arreglos: «Brickslab y Biblioteca: …» es uno).
  const sinTk = crudo ? crudo.replace(TICKETS_ENTRE_PARENTESIS, '').replace(TICKETS_SUELTOS, '') : '';
  const apartados = !crudo ? [] : (ES_ARREGLO.test(texto) ? sinTk.split(/\s+(?:y|e)\s+/) : [sinTk]).map(nombreApartado).filter(Boolean);
  return { apartados, texto, tickets };
}

// Las líneas de un commit: sus «Novedad:» o, si no tiene, su primer renglón
// partido por «; Apartado: …» (un commit que toca dos cosas).
function lineasDe(c) {
  if (Array.isArray(c?.novedades) && c.novedades.length) return { lineas: c.novedades, escritas: true };
  const m = String(c?.mensaje || '').trim();
  if (!m || ES_UNION.test(m)) return { lineas: [], escritas: false };
  return { lineas: m.split(/;\s+(?=[^:;«»]{2,48}:\s)/), escritas: false };
}

// [{ apartado|null, puntos: [{ texto, tickets }] }], en el orden en que se hicieron.
export function novedadesDe(commits) {
  const grupos = new Map();
  const grupo = (nombre) => {
    const k = nombre ? sinTildes(nombre) : '';
    if (!grupos.has(k)) grupos.set(k, { apartado: nombre, puntos: [], arreglos: 0, vistos: new Set() });
    return grupos.get(k);
  };
  // Los commits llegan del más reciente al más antiguo; se cuentan en orden.
  for (const c of [...(commits || [])].reverse()) {
    const { lineas, escritas } = lineasDe(c);
    // Una «Novedad:» sin apartado va con la anterior del mismo commit o, si es
    // la primera, con el apartado del primer renglón.
    let deEsteCommit = escritas ? (partirLinea(String(c.mensaje || '').trim()).apartados[0] || null) : null;
    for (const l of lineas) {
      const { apartados, texto, tickets } = partirLinea(String(l || '').trim());
      if (!texto) continue;
      if (!escritas && ES_ARREGLO.test(texto)) { (apartados.length ? apartados : [null]).forEach(a => { grupo(a).arreglos++; }); continue; }
      if (escritas && apartados[0]) deEsteCommit = apartados[0];
      const g = grupo(apartados[0] || deEsteCommit);
      const clave = sinTildes(texto);
      if (g.vistos.has(clave)) continue;          // el mismo commit dos veces (un cherry-pick)
      g.vistos.add(clave);
      g.puntos.push({ texto: mayuscula(texto), tickets });
    }
  }
  // Los apartados que solo traen arreglos van juntos en una línea al final.
  const soloArreglos = [...grupos.values()].filter(g => !g.puntos.length && g.arreglos);
  if (soloArreglos.length) {
    const nombres = soloArreglos.map(g => g.apartado).filter(Boolean);
    grupo(null).puntos.push({ texto: nombres.length ? `Pequeños arreglos en ${unirConY(nombres)}` : 'Pequeños arreglos', tickets: [] });
  }
  const lista = [...grupos.values()].map(g => ({ apartado: g.apartado, puntos: g.puntos })).filter(g => g.puntos.length);
  // Los apartados que más traen, primero (a igualdad, el que se hizo antes);
  // lo que no tiene apartado, al final.
  const con = lista.filter(g => g.apartado).map((g, i) => ({ g, i }))
    .sort((a, b) => b.g.puntos.length - a.g.puntos.length || a.i - b.i).map(x => x.g);
  return [...con, ...lista.filter(g => !g.apartado)];
}

// Un título a partir de los apartados (ya van los que más traen primero):
// «Galería, Menú del panel e Incidencias».
export function tituloDe(grupos) {
  const nombres = grupos.map(g => g.apartado).filter(Boolean);
  if (!nombres.length) return null;
  return nombres.length > 3 ? `${nombres.slice(0, 3).join(', ')} y más` : unirConY(nombres);
}
