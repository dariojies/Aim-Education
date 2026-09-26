import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';
import { fmtFechaHora } from '../fechas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Automatismos (CRM 7, ticket #316): correos que salen solos. Cada uno se
// enciende y apaga aquí, con su plantilla, se puede ver a quién le saldría ahora
// (sin enviar nada) y qué ha enviado ya. Al encender uno solo cuenta lo que pase
// desde ese momento.
// ─────────────────────────────────────────────────────────────────────────────

const VARS = {
  bienvenida: ['{nombre}', '{alumno}', '{clases}'],
  faltas: ['{nombre}', '{alumno}', '{clase}', '{faltas}'],
  cumple: ['{nombre}', '{alumno}', '{edad}'],
};
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%' };
const api = async (url, opts = {}) => {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
};

function Tarjeta({ a, onCambio, onAbrirFicha, showToast }) {
  const [editar, setEditar] = useState(false);
  const [asunto, setAsunto] = useState(a.asunto);
  const [cuerpo, setCuerpo] = useState(a.cuerpo);
  const [vista, setVista] = useState(null);
  const [verEnviados, setVerEnviados] = useState(false);

  async function guardar(cambios, aviso) {
    try { await api(`/api/admin/automatismos/${a.id}`, { method: 'PUT', body: cambios }); showToast?.(aviso); onCambio(); }
    catch (e) { alert(e.message); }
  }
  async function alternar() {
    if (!a.activo && !window.confirm(`¿Encender «${a.nombre}»?\n\nA partir de ahora saldrá solo cuando toque. No se enviará a quien ya estuviera en esa situación antes de encenderlo.`)) return;
    guardar({ activo: !a.activo }, a.activo ? `«${a.nombre}» apagado.` : `«${a.nombre}» encendido.`);
  }
  async function verQuien() {
    try { setVista(await api(`/api/admin/automatismos/${a.id}/vista`)); } catch (e) { alert(e.message); }
  }

  return (
    <div className="panel" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>{a.nombre}</h3>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{a.descripcion}</div>
          {a.activo && a.activadoAt && <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 700 }}>Encendido desde el {fmtFechaHora(a.activadoAt)}</div>}
        </div>
        <button type="button" onClick={alternar} role="switch" aria-checked={a.activo} aria-label={`${a.activo ? 'Apagar' : 'Encender'} ${a.nombre}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 6px', borderRadius: 999, border: '1px solid var(--line)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 12,
            background: a.activo ? 'color-mix(in oklab, var(--teal) 14%, var(--bg-2))' : 'var(--bg-3)', color: a.activo ? 'var(--teal)' : 'var(--ink-3)' }}>
          <span style={{ width: 34, height: 20, borderRadius: 999, background: a.activo ? 'var(--teal)' : 'var(--line)', position: 'relative', transition: 'background .2s' }}>
            <span style={{ position: 'absolute', top: 2, left: a.activo ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
          </span>
          {a.activo ? 'Encendido' : 'Apagado'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditar(e => !e)}><I.Edit /> {editar ? 'Cerrar el texto' : 'Editar el texto'}</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={verQuien}>Quién lo recibiría ahora</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setVerEnviados(v => !v)} disabled={!a.recientes.length}>
          {verEnviados ? 'Ocultar enviados' : `Enviados (${a.recientes.length})`}
        </button>
      </div>

      {editar && (
        <div style={{ display: 'grid', gap: 8 }}>
          <input style={campo} value={asunto} onChange={e => setAsunto(e.target.value)} aria-label={`Asunto de ${a.nombre}`} />
          <textarea style={{ ...campo, minHeight: 150, resize: 'vertical' }} value={cuerpo} onChange={e => setCuerpo(e.target.value)} aria-label={`Texto de ${a.nombre}`} />
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Se rellenan solas: {VARS[a.id].map(v => <code key={v} style={{ marginRight: 6 }}>{v}</code>)}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm btn-primary" onClick={() => guardar({ asunto, cuerpo }, 'Texto guardado.')}>Guardar texto</button>
          </div>
        </div>
      )}

      {vista && (
        <div style={{ display: 'grid', gap: 6, background: 'var(--bg-3)', borderRadius: 12, padding: 12 }}>
          <b style={{ fontSize: 13 }}>
            {vista.total ? `Ahora mismo le saldría a ${vista.total} ${vista.total === 1 ? 'persona' : 'personas'}` : 'Ahora mismo no le saldría a nadie'}
            {vista.comoSiEncendido ? ' (si se encendiera ahora)' : ''}.
          </b>
          {a.id === 'bienvenida' && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>La bienvenida es para quien se apunte a partir de que se encienda: no se escribe a los que ya estaban.</span>}
          {vista.filas.map(f => (
            <div key={f.personaId} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
              <button type="button" onClick={() => onAbrirFicha?.({ id: f.personaId })} style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}>{f.alumno}</button>
              {f.fuera ? <span style={{ color: 'var(--orange)' }}>· no se le enviaría: {f.fuera}</span>
                : <span style={{ color: 'var(--ink-3)' }}>· a {f.para.join(', ')} · «{f.asunto}»</span>}
            </div>
          ))}
        </div>
      )}

      {verEnviados && (
        <div style={{ display: 'grid', gap: 4 }}>
          {a.recientes.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-3)' }}>
              <span style={{ color: 'var(--ink-3)', minWidth: 110 }}>{fmtFechaHora(r.fecha)}</span>
              <button type="button" onClick={() => onAbrirFicha?.({ id: r.personaId })} style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}>{r.alumno || '—'}</button>
              <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-2)' }}>{r.estado === 'omitido' ? `no enviado: ${r.error}` : r.asunto}</span>
              <span style={{ fontWeight: 700, color: r.estado === 'enviado' ? 'var(--teal)' : r.estado === 'omitido' ? 'var(--ink-3)' : 'var(--orange)' }}>
                {{ enviado: '✓ enviado', omitido: 'omitido', error: '✗ error' }[r.estado] || r.estado}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminAutomatismos({ showToast, onAbrirFicha }) {
  const [d, setD] = useState(null);
  const cargar = useCallback(() => api('/api/admin/automatismos').then(setD).catch(() => {}), []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="panel">
        <h2><I.Settings /> Automatismos</h2>
        <p className="sub">
          Correos que salen solos a las familias (a sus tutores; si no tiene, al alumno), una sola vez por persona y ocasión.
          Respetan si rechazó las comunicaciones de sus actividades y quedan en el historial de su ficha. Se revisa cada 15 minutos.
        </p>
        {!d.correoActivo && <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>El correo no está configurado en el servidor: aunque se enciendan, no saldrán.</p>}
        {d.correoActivo && d.automatismos.some(a => a.activo) && (
          <button type="button" className="btn btn-sm btn-outline" style={{ marginTop: 10 }} onClick={async () => {
            try { const r = await api('/api/admin/automatismos/ejecutar', { method: 'POST' }); showToast?.(r.nuevos ? `${r.nuevos} correo${r.nuevos !== 1 ? 's' : ''} automático${r.nuevos !== 1 ? 's' : ''} revisado${r.nuevos !== 1 ? 's' : ''}.` : 'No había nada que enviar.'); cargar(); }
            catch (e) { alert(e.message); }
          }}>Revisar ahora</button>
        )}
      </div>
      {d.automatismos.map(a => <Tarjeta key={a.id} a={a} onCambio={cargar} onAbrirFicha={onAbrirFicha} showToast={showToast} />)}
    </div>
  );
}
