import React, { useState, useEffect } from 'react';
import { RUTAS_ADMIN } from '../rutasAdmin.js';

// ─────────────────────────────────────────────────────────────────────────────
// El uso de la web (uso.js): qué secciones del panel y del área de familias se
// abren, cuántas veces y cuántas personas al día, y las páginas más vistas de
// la web pública. Para decidir qué mejorar primero y ver lo que no usa nadie.
// No dice quién: solo cuenta.
// ─────────────────────────────────────────────────────────────────────────────

const caja = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, display: 'grid', gap: 10 };
const suave = { fontSize: 12, color: 'var(--ink-3)' };
const ROL = {
  familia: 'familias', trabajador: 'trabajadores', instructor: 'instructores', secretaria: 'secretaría', club_owner: 'dirección',
  equipo_it: 'Equipo IT', it_junior: 'IT Junior', superadmin: 'superadmin', personal: 'personal',
};
const FAMILIA = {
  resumen: 'Resumen', noticias: 'Noticias', clases: 'Mis clases', campamento: 'Campamento', asistencia: 'Asistencia', fotos: 'Fotos',
  brickslab: 'Brickslab y Biblioteca', cursos: 'Mis cursos', pedidos: 'Mis pedidos', mensajes: 'Mensajes', pagos: 'Pagos y recibos',
  cartera: 'Mi cartera', perfil: 'Perfil', ajustes: 'Ajustes', soporte: 'Soporte', mas: 'Más (en la app)',
};
const num = (n) => Number(n || 0).toLocaleString('es-ES');
const pct = (a, total) => (total ? Math.round((a / total) * 100) : 0);
const fecha = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

// «secretaría 70 % · dirección 30 %» (o «web 60 % · app 40 %»).
function reparto(o, nombres) {
  const total = Object.values(o || {}).reduce((s, x) => s + x, 0);
  return Object.entries(o || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${nombres?.[k] || k} ${pct(v, total)} %`).join(' · ');
}

function Lista({ filas, nombre, conCanal }) {
  if (!filas.length) return <p style={{ ...suave, margin: 0 }}>Aún no hay datos de estos días.</p>;
  const max = Math.max(...filas.map(f => f.veces));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {filas.map(f => (
        <div key={f.seccion} data-uso-seccion={f.seccion} style={{ display: 'grid', gap: 3 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14, flex: '1 1 160px', minWidth: 0 }}>{nombre(f.seccion)}</b>
            <span style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
              {num(f.veces)} {f.veces === 1 ? 'vez' : 'veces'} · {String(f.personasDia).replace('.', ',')} {f.personasDia === 1 ? 'persona' : 'personas'} al día
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-3)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(2, (f.veces / max) * 100)}%`, height: '100%', borderRadius: 999, background: 'var(--teal)' }} />
          </div>
          <span style={{ ...suave, fontSize: 11 }}>
            {reparto(f.roles, ROL)}{conCanal && Object.keys(f.canales || {}).length ? ` · ${reparto(f.canales, { web: 'en la web', app: 'en la app' })}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function UsoWeb({ nombreSeccion = (id) => id }) {
  const [dias, setDias] = useState(30);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let vivo = true;
    setError(null);
    fetch(`/api/admin/uso?dias=${dias}`, { credentials: 'include', cache: 'no-store' })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'No se ha podido cargar.'); return j; })
      .then(j => { if (vivo) setD(j); }).catch(e => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [dias]);

  if (error) return <p style={{ color: 'var(--orange)', fontSize: 14 }}>{error}</p>;
  if (!d) return <p style={suave}>Cargando el uso de la web…</p>;
  const nombreAdmin = (s) => (s.startsWith('comunicaciones/') ? `Comunicación · ${nombreSeccion('comunicaciones', s.split('/')[1])}` : nombreSeccion(s));
  const usadas = new Set(d.admin.map(f => f.seccion.split('/')[0]));
  const sinUso = Object.keys(RUTAS_ADMIN).filter(s => !usadas.has(s)).map(s => nombreSeccion(s)).sort((a, b) => a.localeCompare(b));
  const p = (z, c) => { const n = d.personas[z]?.[c] || 0; return `${String(n).replace('.', ',')} ${n === 1 ? 'persona' : 'personas'}`; };
  const pocos = d.medidos < d.dias;

  return (
    <div style={{ display: 'grid', gap: 14 }} data-uso-web>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {[7, 30, 90].map(n => (
          <button key={n} type="button" className={`filter-pill ${dias === n ? 'is-active' : ''}`} onClick={() => setDias(n)} style={{ borderRadius: 8, padding: '7px 12px' }}>
            Últimos {n} días
          </button>
        ))}
      </div>
      <p style={{ ...suave, margin: 0 }}>
        {pocos ? `Se mide desde el ${fecha(d.desde)}: hay ${d.medidos} ${d.medidos === 1 ? 'día' : 'días'} de datos. ` : `Desde el ${fecha(d.desde)}. `}
        «Personas al día» es, de media, cuántas personas distintas abren esa sección cada día. No se guarda quién: solo se cuenta.
      </p>

      <div style={caja}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 16, flex: '1 1 200px' }}>Panel de administración</b>
          <span style={suave}>{p('admin', 'web')} al día{d.personas.admin?.app ? ` (y ${p('admin', 'app')} desde la app)` : ''}</span>
        </div>
        <Lista filas={d.admin} nombre={nombreAdmin} />
        {sinUso.length > 0 && (
          <div data-uso-sin-uso style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'grid', gap: 4 }}>
            <b style={{ fontSize: 13 }}>Sin abrir en estos días ({sinUso.length})</b>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{sinUso.join(' · ')}</span>
            <span style={suave}>Puede que no se usen, o que solo se usen de vez en cuando (el campamento, los títulos…).</span>
          </div>
        )}
      </div>

      <div style={caja}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 16, flex: '1 1 200px' }}>Área de familias</b>
          <span style={suave}>{p('familias', 'web')} al día en la web · {p('familias', 'app')} en la app</span>
        </div>
        <Lista filas={d.familias} nombre={(s) => FAMILIA[s] || s} conCanal />
      </div>

      <div style={caja}>
        <b style={{ fontSize: 16 }}>Web pública: las páginas más vistas</b>
        <span style={suave}>Solo cuenta a quien ha aceptado las cookies de análisis, así que son menos de las que hay de verdad.</span>
        {!d.web.length ? <p style={{ ...suave, margin: 0 }}>Aún no hay visitas de estos días.</p> : (
          <div style={{ display: 'grid', gap: 4 }}>
            {d.web.map(w => (
              <div key={w.ruta} style={{ display: 'flex', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 180px', minWidth: 0, overflowWrap: 'anywhere' }}>{w.ruta === '/' ? 'Portada (/)' : w.ruta}</span>
                <span style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{num(w.veces)} {w.veces === 1 ? 'visita' : 'visitas'} · {num(w.navegadores)} {w.navegadores === 1 ? 'navegador' : 'navegadores'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
