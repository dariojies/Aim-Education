import { useState, useEffect } from 'react';
import { ACTIVITIES, ACT_BY_ID } from './Shared.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Las actividades de la web pública, a partir de las reales del panel (#295):
// cada actividad con sus grupos, como en «Clases y horarios → Lista de clases».
// Los textos salen del catálogo (Shared.jsx); lo que hay y cuándo, de la base.
// ─────────────────────────────────────────────────────────────────────────────

// Se pide una vez y se reutiliza al ir de una página a otra; pasado un rato se
// vuelve a pedir, por si han cambiado los grupos.
let pedido = null;
let pedidoEn = 0;
function pedir() {
  if (!pedido || Date.now() - pedidoEn > 120_000) {
    pedidoEn = Date.now();
    pedido = fetch('/api/publico/clases')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('sin datos'))))
      .then(d => d.actividades || [])
      .catch(e => { pedido = null; throw e; });
  }
  return pedido;
}

export function useClasesPublicas() {
  const [estado, setEstado] = useState({ cargando: true, actividades: null });
  useEffect(() => {
    let vivo = true;
    pedir()
      .then(a => { if (vivo) setEstado({ cargando: false, actividades: a }); })
      .catch(() => { if (vivo) setEstado({ cargando: false, actividades: null }); });
    return () => { vivo = false; };
  }, []);
  return estado;
}

const ordenCatalogo = (id) => {
  const i = ACTIVITIES.findIndex(a => a.id === id);
  return i < 0 ? 999 : i;
};

// Las fichas de la web: una por actividad real (juntando las que sean la misma
// actividad de la web) y, después, los programas, que reúnen grupos de otras
// actividades por su nombre. Sin datos (la base no responde), el catálogo tal
// cual, sin grupos: grupos = null quiere decir «no se sabe», no «no hay».
export function fichasWeb(actividades) {
  if (!actividades) {
    return ACTIVITIES.map(a => ({ ...a, grupos: null }));
  }
  const porId = new Map();
  for (const a of actividades) {
    const base = ACT_BY_ID[a.act];
    if (!porId.has(a.act)) {
      porId.set(a.act, {
        ...(base || { id: a.act, name: a.nombre, color: '#5233A8', className: 'act-otra', tag: 'Otras', lede: '', long: '', aprender: [] }),
        // El icono, el que tenga puesto en el panel: si lo cambian allí, cambia aquí.
        icon: a.icon || base?.icon,
        grupos: [],
      });
    }
    porId.get(a.act).grupos.push(...a.grupos.map(g => ({ ...g, actividad: a.nombre })));
  }
  const todos = actividades.flatMap(a => a.grupos.map(g => ({ ...g, actividad: a.nombre })));
  // Las que se ofrecen aunque no estén en el horario (Entrenamiento Funcional,
  // #303): salen igual, sin grupos, con su página.
  for (const a of ACTIVITIES) {
    if (a.siempre && !porId.has(a.id)) porId.set(a.id, { ...a, grupos: [] });
  }
  const reales = [...porId.values()].sort((x, y) => (ordenCatalogo(x.id) - ordenCatalogo(y.id)) || x.name.localeCompare(y.name, 'es'));
  const programas = ACTIVITIES.filter(p => p.programa).map(p => ({
    ...p, grupos: p.grupoPatron ? todos.filter(g => p.grupoPatron.test(g.nombre)) : [],
  }));
  return [...reales, ...programas];
}

// ── Cómo se cuenta cada cosa ─────────────────────────────────────────────────
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function diasTexto(dias) {
  const n = dias.map(d => DIAS[d]).filter(Boolean);
  if (n.length <= 1) return mayus(n[0] || '');
  return mayus(`${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`);
}

// Las sesiones de un grupo, juntando las que son a la misma hora: «Lunes,
// miércoles y viernes · 09:30–10:30» y no tres líneas iguales.
export function horarioGrupo(g) {
  const porHora = new Map();
  for (const s of g.sesiones || []) {
    const k = `${s.inicio}–${s.fin || ''}`;
    if (!porHora.has(k)) porHora.set(k, { inicio: s.inicio, fin: s.fin, dias: new Set() });
    s.dias.forEach(d => porHora.get(k).dias.add(d));
  }
  return [...porHora.values()]
    .map(h => ({ ...h, dias: [...h.dias].sort((a, b) => a - b) }))
    .sort((a, b) => (a.dias[0] - b.dias[0]) || String(a.inicio).localeCompare(String(b.inicio)))
    .map(h => ({ dias: diasTexto(h.dias), hora: h.fin ? `${h.inicio}–${h.fin}` : h.inicio }));
}

export function monitoresGrupo(g) {
  return [...new Set((g.sesiones || []).flatMap(s => s.monitores || []))];
}

const ABIERTA = 60; // una edad máxima tan alta es «sin límite»

export function edadGrupo(g) {
  const min = g.minAge, max = g.maxAge != null && g.maxAge < ABIERTA ? g.maxAge : null;
  if (min == null && max == null) return null;
  if (min != null && max != null) return min === max ? `${min} años` : `De ${min} a ${max} años`;
  if (min != null) return min >= 18 ? 'Adultos' : `Desde ${min} años`;
  return `Hasta ${max} años`;
}

// Las edades de toda una actividad, a partir de sus grupos.
export function edadesActividad(grupos) {
  if (!grupos?.length) return null;
  const mins = grupos.map(g => g.minAge).filter(n => n != null);
  if (!mins.length) return null;
  const min = Math.min(...mins);
  const abierta = grupos.some(g => g.maxAge == null || g.maxAge >= ABIERTA);
  const max = Math.max(...grupos.map(g => g.maxAge).filter(n => n != null && n < ABIERTA));
  return abierta || !Number.isFinite(max) ? `Desde ${min} años` : `De ${min} a ${max} años`;
}

// Por edad, que es como busca una familia: primero los más pequeños.
export function ordenarGrupos(grupos) {
  return [...(grupos || [])].sort((a, b) =>
    ((a.minAge ?? 99) - (b.minAge ?? 99)) || String(a.nombre).localeCompare(String(b.nombre), 'es', { numeric: true }));
}

// El curso en marcha: de septiembre a junio (el de agosto ya es el siguiente).
export function cursoActual(hoy = new Date()) {
  const y = hoy.getFullYear();
  const ini = hoy.getMonth() >= 7 ? y : y - 1;
  return `${ini}-${String(ini + 1).slice(2)}`;
}

export const PLAZAS = {
  libres: { texto: 'Plazas libres', color: 'var(--teal)' },
  pocas: { texto: 'Últimas plazas', color: '#B7791F' },
  completo: { texto: 'Completo · lista de espera', color: '#E5484D' },
};
