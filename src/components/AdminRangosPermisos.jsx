import React, { useMemo } from 'react';
import { I } from './Icons.jsx';
import { permisosDe, NOMBRE_ROL, AVISOS, recibeAviso } from '../../permisos.js';

// ─────────────────────────────────────────────────────────────────────────────
// Rangos y permisos (ticket #333): qué apartados ve cada rango y qué avisos le
// llegan a la campanita. Sale de las mismas reglas que usa el panel
// (permisos.js), así que no se queda desfasado: si cambia una regla, cambia aquí.
// ─────────────────────────────────────────────────────────────────────────────

const ROLES = ['trabajador', 'instructor', 'secretaria', 'club_owner', 'equipo_it'];

// Lo que cambia dentro de un apartado según el rango (cuando lo ve, pero no entero).
const MATIZ = {
  students: (p) => (!p.editarAlumnos ? 'solo mirar' : null),
  classes: (p) => (p.soloSusGrupos ? 'solo sus grupos' : null),
  reportes: (p) => (!p.reportesGenerales ? 'solo lo suyo' : null),
  events: (p) => (!p.editarEventos ? (p.pedirEventos ? 'ver y proponer' : 'solo ver') : null),
  camp: (p) => (!p.campCompleto ? 'lista y agenda del día' : null),
  support: (p) => (!p.soporteCompleto ? 'sus tickets' : null),
  fichaje: (p) => (!p.fichajesGestion ? 'solo el suyo' : 'el de todos'),
  equipo_it: (p) => (!p.editarEquipoIT ? 'solo ver' : null),
  overview: (p, rol) => ({ trabajador: 'su día', instructor: 'sus clases', secretaria: 'el día del club', club_owner: 'negocio', equipo_it: 'tickets y sistema' }[rol]),
};

const RESUMEN = {
  trabajador: 'Su fichaje, sus tareas del día, sus tickets y sus avisos.',
  instructor: 'Sus clases de hoy y si ha pasado lista, alumnos de sus grupos que faltan seguido, cumpleaños, Speaking y sus eventos.',
  secretaria: 'Lo cobrado hoy y la caja, lo que queda por cobrar, las clases de hoy, quién está trabajando, cumpleaños y eventos de la semana.',
  club_owner: 'Ingresos y gastos del mes y de los últimos seis meses, alumnos (altas y bajas), ocupación de las clases, lo pendiente de cobrar. Puede ver también el de Secretaría y el de IT.',
  equipo_it: 'Tickets (suyos, sin asignar, vencidos), la semana del equipo y el estado del sistema. Puede ver también el de Dirección y el de Secretaría.',
};

const celda = { padding: '8px 10px', borderTop: '1px solid var(--line)', fontSize: 13, textAlign: 'center', verticalAlign: 'top' };
const th = { padding: '8px 10px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', textAlign: 'center', position: 'sticky', top: 0, background: 'var(--bg-2)' };

function Marca({ si, nota }) {
  if (!si) return <span aria-label="No" style={{ color: 'var(--ink-3)' }}>—</span>;
  return (
    <span style={{ display: 'inline-grid', justifyItems: 'center', gap: 1 }}>
      <span aria-label="Sí" style={{ color: 'var(--teal)', fontWeight: 900 }}>✓</span>
      {nota && <span style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.2 }}>{nota}</span>}
    </span>
  );
}

function Tabla({ titulo, sub, filas }) {
  return (
    <section style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 8 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{titulo}</h2>
        {sub && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>{sub}</p>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}> </th>
              {ROLES.map(r => <th key={r} style={th}>{NOMBRE_ROL[r]}</th>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => f.grupo ? (
              <tr key={`g${i}`}><td colSpan={ROLES.length + 1} style={{ padding: '14px 10px 4px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--purple)' }}>{f.grupo}</td></tr>
            ) : (
              <tr key={f.clave}>
                <td style={{ ...celda, textAlign: 'left', fontWeight: 600 }}>{f.nombre}{f.detalle && <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)', fontWeight: 400 }}>{f.detalle}</span>}</td>
                {f.celdas.map((c, j) => <td key={j} style={celda}><Marca {...c} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminRangosPermisos({ grupos }) {
  const permisos = useMemo(() => Object.fromEntries(ROLES.map(r => [r, permisosDe(r)])), []);

  const filasMenu = useMemo(() => {
    const filas = [];
    const vistos = new Set();
    for (const g of grupos) {
      filas.push({ grupo: g.heading });
      for (const it of g.items) {
        const clave = `${it.id}:${it.pestana || ''}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        filas.push({
          clave, nombre: it.label,
          celdas: ROLES.map(r => ({ si: !!permisos[r].secciones[it.id], nota: MATIZ[it.id]?.(permisos[r], r) || null })),
        });
      }
    }
    return filas;
  }, [grupos, permisos]);

  const filasAvisos = useMemo(() => {
    const filas = [];
    let grupo = null;
    for (const a of AVISOS) {
      if (a.grupo !== grupo) { grupo = a.grupo; filas.push({ grupo }); }
      filas.push({
        clave: a.id, nombre: a.texto,
        celdas: ROLES.map(r => ({ si: recibeAviso(a.id, permisos[r], r), nota: a.nota?.(permisos[r], r) || null })),
      });
    }
    return filas;
  }, [permisos]);

  // Lo que distingue a Secretaría del Dueño del club (lo que preguntaba el ticket).
  const diferencias = useMemo(() => {
    const s = permisos.secretaria, d = permisos.club_owner;
    const menu = grupos.flatMap(g => g.items).filter((it, i, arr) => arr.findIndex(x => x.id === it.id) === i)
      .filter(it => !!s.secciones[it.id] !== !!d.secciones[it.id]).map(it => it.label);
    const avisos = AVISOS.filter(a => recibeAviso(a.id, s, 'secretaria') !== recibeAviso(a.id, d, 'club_owner')).map(a => a.texto);
    return { menu, avisos };
  }, [grupos, permisos]);

  return (
    <div style={{ display: 'grid', gap: 16 }} className="rangos-permisos">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', maxWidth: 760 }}>
          Qué apartados ve cada rango, qué avisos le llegan a la campanita y qué ve en su Resumen. Sale de las mismas reglas que usa el panel,
          así que siempre está al día. Para cambiar algo, pídelo por un ticket diciendo qué rango y qué aviso o apartado.
        </p>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => window.print()}><I.Print /> Imprimir</button>
      </div>

      <section style={{ background: 'color-mix(in oklab, var(--purple) 7%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--purple) 25%, var(--line))', borderRadius: 16, padding: 16, fontSize: 13, display: 'grid', gap: 6 }}>
        <b style={{ fontSize: 14 }}>Secretaría y Dueño del club</b>
        <span>Ven casi lo mismo y reciben casi los mismos avisos: así está pensado, para que secretaría pueda llevar el día a día sola.</span>
        <span><b>Apartados que solo ve el Dueño del club:</b> {diferencias.menu.length ? diferencias.menu.join(', ') : 'ninguno'}.</span>
        <span><b>Avisos distintos:</b> {diferencias.avisos.length ? diferencias.avisos.join(', ') : 'ninguno: reciben exactamente los mismos'}.</span>
        <span style={{ color: 'var(--ink-3)' }}>El Equipo IT tiene los mismos permisos que el Dueño del club. Además, el Dueño y el Equipo IT pueden dar y quitar rangos.</span>
      </section>

      <Tabla titulo="Apartados del menú" sub="✓ lo ve · — no lo ve. Debajo, lo que puede hacer dentro si no es todo." filas={filasMenu} />
      <Tabla titulo="Avisos de la campanita" sub="✓ le llega el aviso · — no le llega." filas={filasAvisos} />

      <section style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'grid', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Qué ve cada uno en su Resumen</h2>
        {ROLES.map(r => (
          <div key={r} style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: 10, fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--line)' }}>
            <b>{NOMBRE_ROL[r]}</b><span>{RESUMEN[r]}</span>
          </div>
        ))}
      </section>
      <style>{`@media print { .admin-side, .admin-top, header { display: none !important } .rangos-permisos button { display: none !important } }`}</style>
    </div>
  );
}
