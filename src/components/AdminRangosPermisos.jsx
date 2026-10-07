import React, { useMemo, useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { permisosDe, NOMBRE_ROL, AVISOS, recibeAviso, aplicarAjustesPermisos, limpiarAjustesPermisos, seccionFija } from '../../permisos.js';

// ─────────────────────────────────────────────────────────────────────────────
// Rangos y permisos (ticket #333): qué apartados ve cada rango y qué avisos le
// llegan a la campanita, y cambiarlo. Parte de lo de fábrica (permisos.js) y se
// guardan solo los cambios; el servidor los aplica al momento (menú, campanita
// y lo que deja hacer).
// ─────────────────────────────────────────────────────────────────────────────

const ROLES = ['trabajador', 'instructor', 'secretaria', 'club_owner'];

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
  // Lo escriben el Equipo IT y los superadmin (#397).
  cambios: (p) => (!p.editarCambios ? 'solo ver' : null),
  overview: (p, rol) => ({ trabajador: 'su día', instructor: 'sus clases', secretaria: 'el día del club', club_owner: 'negocio' }[rol]),
};

const RESUMEN = {
  trabajador: 'Su fichaje, sus tareas del día, sus tickets y sus avisos.',
  instructor: 'Sus clases de hoy y si ha pasado lista, alumnos de sus grupos que faltan seguido, cumpleaños, clases individuales y sus eventos.',
  secretaria: 'Lo cobrado hoy y la caja, lo que queda por cobrar, las clases de hoy, quién está trabajando, cumpleaños y eventos de la semana.',
  club_owner: 'Ingresos y gastos del mes y de los últimos seis meses, alumnos (altas y bajas), ocupación de las clases y lo pendiente de cobrar. Puede ver también el Resumen de los demás rangos.',
};

const celda = { padding: '6px 8px', borderTop: '1px solid var(--line)', fontSize: 13, textAlign: 'center', verticalAlign: 'middle' };
const th = { padding: '8px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', textAlign: 'center', background: 'var(--bg-2)' };

// Una casilla: ✓ / —, pulsable si se puede cambiar. Si está cambiada respecto a
// lo de fábrica, se marca.
function Casilla({ si, nota, editable, cambiada, fija, onCambio }) {
  const contenido = (
    <span style={{ display: 'inline-grid', justifyItems: 'center', gap: 1 }}>
      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 13,
        background: si ? 'color-mix(in oklab, var(--teal) 16%, transparent)' : 'var(--bg-3)', color: si ? 'var(--teal)' : 'var(--ink-3)',
        outline: cambiada ? '2px solid var(--purple)' : 'none', outlineOffset: 1 }}>{si ? '✓' : '—'}</span>
      {nota && si && <span style={{ fontSize: 10, color: 'var(--ink-3)', lineHeight: 1.2 }}>{nota}</span>}
    </span>
  );
  if (!editable || fija) {
    return <span title={fija ? 'No se puede cambiar' : undefined} style={{ opacity: fija && editable ? 0.6 : 1 }}>{contenido}</span>;
  }
  return (
    <button type="button" role="switch" aria-checked={si} onClick={() => onCambio(!si)} title={si ? 'Pulsa para quitarlo' : 'Pulsa para darlo'}
      style={{ background: 'none', border: 0, padding: 2, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8 }}>
      {contenido}
    </button>
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
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr><th style={{ ...th, textAlign: 'left' }}> </th>{ROLES.map(r => <th key={r} style={th}>{NOMBRE_ROL[r]}</th>)}</tr>
          </thead>
          <tbody>
            {filas.map((f, i) => f.grupo ? (
              <tr key={`g${i}`}><td colSpan={ROLES.length + 1} style={{ padding: '14px 8px 4px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--purple)' }}>{f.grupo}</td></tr>
            ) : (
              <tr key={f.clave}>
                <td style={{ ...celda, textAlign: 'left', fontWeight: 600 }}>{f.nombre}</td>
                {f.celdas.map((c, j) => <td key={j} style={celda}><Casilla {...c} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminRangosPermisos({ grupos, showToast }) {
  const [guardado, setGuardado] = useState(null);     // lo que hay en el servidor
  const [ajustes, setAjustes] = useState({});         // lo que se está editando
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch('/api/admin/permisos-rangos', { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { ajustes: {} }))
      .then(d => { setGuardado(d.ajustes || {}); setAjustes(d.ajustes || {}); setPuedeEditar(!!d.puedeEditar); })
      .catch(() => { setGuardado({}); setAjustes({}); });
  }, []);

  const fabrica = useMemo(() => Object.fromEntries(ROLES.map(r => [r, permisosDe(r)])), []);
  const efectivos = useMemo(() => Object.fromEntries(ROLES.map(r => [r, aplicarAjustesPermisos(fabrica[r], r, ajustes)])), [fabrica, ajustes]);
  const cambios = JSON.stringify(limpiarAjustesPermisos(ajustes)) !== JSON.stringify(limpiarAjustesPermisos(guardado || {}));

  const poner = (rol, tipo, id, valor) => setAjustes(a => {
    const r = { secciones: { ...(a[rol]?.secciones || {}) }, avisos: { ...(a[rol]?.avisos || {}) } };
    r[tipo][id] = valor;
    return limpiarAjustesPermisos({ ...a, [rol]: r });
  });

  const menu = useMemo(() => {
    const vistos = new Set();
    return grupos.map(g => ({ heading: g.heading, items: g.items.filter(it => { if (vistos.has(it.id) || it.id === 'equipo_it' || it.id === 'cambios') return false; vistos.add(it.id); return true; }) }))
      .filter(g => g.items.length);
  }, [grupos]);

  const filasMenu = menu.flatMap(g => [{ grupo: g.heading }, ...g.items.map(it => ({
    clave: it.id, nombre: it.pestana ? sectionLabelCrm(it) : it.label,
    celdas: ROLES.map(r => {
      const si = !!efectivos[r].secciones[it.id];
      return {
        si, nota: MATIZ[it.id]?.(fabrica[r], r) || null, editable: puedeEditar, fija: seccionFija(it.id, r),
        cambiada: si !== !!fabrica[r].secciones[it.id], onCambio: (v) => poner(r, 'secciones', it.id, v),
      };
    }),
  }))]);

  let grupoAviso = null;
  const filasAvisos = AVISOS.flatMap(a => {
    const filas = [];
    if (a.grupo !== grupoAviso) { grupoAviso = a.grupo; filas.push({ grupo: a.grupo }); }
    filas.push({
      clave: a.id, nombre: a.texto,
      celdas: ROLES.map(r => {
        const si = recibeAviso(a.id, efectivos[r], r);
        const deFabrica = recibeAviso(a.id, { ...efectivos[r], avisos: {} }, r);
        return {
          si, nota: a.nota?.(efectivos[r], r) || null, editable: puedeEditar, fija: false,
          cambiada: si !== deFabrica, onCambio: (v) => poner(r, 'avisos', a.id, v),
        };
      }),
    });
    return filas;
  });

  // Lo que distingue a Secretaría del Dueño del club.
  const s = efectivos.secretaria, dd = efectivos.club_owner;
  const difMenu = menu.flatMap(g => g.items).filter(it => !!s.secciones[it.id] !== !!dd.secciones[it.id]).map(it => it.label);
  const difAvisos = AVISOS.filter(a => recibeAviso(a.id, s, 'secretaria') !== recibeAviso(a.id, dd, 'club_owner')).map(a => a.texto);

  async function guardar() {
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/permisos-rangos', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ajustes }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido guardar.');
      setGuardado(d.ajustes); setAjustes(d.ajustes);
      showToast?.('Permisos guardados. Cada persona los verá la próxima vez que abra el panel.');
    } catch (e) { alert(e.message); }
    finally { setGuardando(false); }
  }

  if (guardado === null) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  const hayCambiosGuardados = Object.keys(guardado || {}).length > 0;

  return (
    <div style={{ display: 'grid', gap: 16 }} className="rangos-permisos">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', maxWidth: 760 }}>
          Qué apartados ve cada rango y qué avisos le llegan a la campanita. {puedeEditar ? 'Pulsa una casilla para darlo o quitarlo y guarda los cambios: se aplican al momento.' : ''}
          {' '}Las casillas con marco morado son cambios respecto a como venía de fábrica. Las apagadas no se pueden cambiar (el fichaje es obligatorio para todo el personal).
        </p>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => window.print()}><I.Print /> Imprimir</button>
      </div>

      {puedeEditar && (
        <div style={{ position: 'sticky', top: 8, zIndex: 3, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderRadius: 14,
          background: cambios ? 'color-mix(in oklab, var(--purple) 10%, var(--bg-2))' : 'var(--bg-2)', border: `1px solid ${cambios ? 'var(--purple)' : 'var(--line)'}` }}>
          <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{cambios ? 'Tienes cambios sin guardar.' : hayCambiosGuardados ? 'Hay permisos cambiados respecto a los de fábrica.' : 'Todo está como venía de fábrica.'}</span>
          {cambios && <button type="button" className="btn btn-sm btn-outline" onClick={() => setAjustes(guardado)}>Deshacer</button>}
          {hayCambiosGuardados && !cambios && <button type="button" className="btn btn-sm btn-outline" onClick={() => { if (window.confirm('¿Volver a los permisos de fábrica para todos los rangos? Tendrás que guardar después.')) setAjustes({}); }}>Volver a los de fábrica</button>}
          <button type="button" className="btn btn-sm btn-primary" disabled={!cambios || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      )}

      <section style={{ background: 'color-mix(in oklab, var(--purple) 7%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--purple) 25%, var(--line))', borderRadius: 16, padding: 16, fontSize: 13, display: 'grid', gap: 6 }}>
        <b style={{ fontSize: 14 }}>Secretaría y Dueño del club</b>
        <span><b>Apartados distintos:</b> {difMenu.length ? difMenu.join(', ') : 'ninguno'}.</span>
        <span><b>Avisos distintos:</b> {difAvisos.length ? difAvisos.join(', ') : 'ninguno: reciben exactamente los mismos'}.</span>
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
      <style>{`@media print { .admin-side, .admin-top, header { display: none !important } .rangos-permisos button:not([role=switch]) { display: none !important } }`}</style>
    </div>
  );
}

// Las entradas del CRM son pestañas de Comunicaciones: se ven o no todas juntas.
function sectionLabelCrm(it) { return it.id === 'comunicaciones' ? 'CRM (segmentos, campañas, automatismos, diseño de correos)' : it.label; }
