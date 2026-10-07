import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from './Icons.jsx';
import { fmtFechaHora } from '../fechas.js';
import { Variables, meterEnCursor, Interruptor, AjustesCorreo } from './CrmPiezas.jsx';
import EditorDiseno, { ElegirPlantilla } from './EditorDiseno.jsx';
import { VARIABLES_CRM } from '../../correo-diseno.js';
import { CorreosSistema } from './AdminDisenoCorreos.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Automatismos (CRM 7, ticket #316): correos que salen solos. Cada uno se
// enciende y apaga aquí, con su plantilla, se puede ver a quién le saldría ahora
// (sin enviar nada) y qué ha enviado ya. Al encender uno solo cuenta lo que pase
// desde ese momento. Desde el #365 también están aquí, abajo, los correos que la
// app manda siempre (clases individuales, contraseñas, fichaje…), con su diseño.
// ─────────────────────────────────────────────────────────────────────────────

const VARS = {
  bienvenida: ['{nombre}', '{alumno}', '{clases}'],
  faltas: ['{nombre}', '{alumno}', '{clase}', '{faltas}'],
  cumple: ['{nombre}', '{alumno}', '{edad}'],
  cerrado: ['{nombre}', '{alumno}', '{dias}', '{motivo}', '{vuelta}'],
  noticias: ['{nombre}', '{alumno}', '{mes}', '{noticias}'],
};
// Los mismos datos, con su ejemplo, para el diseñador.
const VARS_DISENO = {
  bienvenida: { nombre: VARIABLES_CRM.nombre, alumno: VARIABLES_CRM.alumno, clases: VARIABLES_CRM.clases },
  faltas: { nombre: VARIABLES_CRM.nombre, alumno: VARIABLES_CRM.alumno, clase: { que: 'La clase', ejemplo: 'Ballet (L-X 17:00)' }, faltas: { que: 'Cuántas faltas lleva', ejemplo: '4' } },
  cumple: { nombre: VARIABLES_CRM.nombre, alumno: VARIABLES_CRM.alumno, edad: { que: 'Los años que cumple', ejemplo: '9' } },
  cerrado: {
    nombre: VARIABLES_CRM.nombre, alumno: VARIABLES_CRM.alumno,
    dias: { que: 'Qué días cierra', ejemplo: 'el lunes, 12 de octubre' },
    motivo: { que: 'Por qué (el nombre del festivo o cierre)', ejemplo: 'Día de la Hispanidad' },
    vuelta: { que: 'El día que se vuelve', ejemplo: 'martes, 13 de octubre' },
  },
  noticias: {
    nombre: VARIABLES_CRM.nombre, alumno: VARIABLES_CRM.alumno,
    mes: { que: 'El mes del resumen', ejemplo: 'septiembre' },
    noticias: { que: 'Las noticias del mes, con su enlace', ejemplo: '• ¡Subcampeones en la WRO 2026!\n  https://www.aimeducation.es/noticias/subcampeones-en-la-wro-2026' },
  },
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
  const asuntoRef = useRef(null), cuerpoRef = useRef(null);
  const [ultimo, setUltimo] = useState('cuerpo');
  const [eligiendo, setEligiendo] = useState(false);
  const [disenando, setDisenando] = useState(null);
  const meter = (v) => (ultimo === 'asunto' ? setAsunto(x => meterEnCursor(asuntoRef.current, x, v)) : setCuerpo(x => meterEnCursor(cuerpoRef.current, x, v)));

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
        <Interruptor activo={a.activo} onClick={alternar} nombre={a.nombre} />
      </div>
      {/* Cuándo sale (#365): faltas, hora, días de antelación, día del mes… */}
      <AjustesCorreo def={a.ajustesDef} valores={a.ajustes} onGuardar={(ajustes) => guardar({ ajustes }, 'Ajustes guardados.')} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {a.diseno ? (
          <>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setDisenando({ asunto: a.asunto, diseno: a.diseno })}><I.Edit /> Abrir el diseño</button>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => {
              if (window.confirm('¿Quitar el diseño? Volverá a salir el texto sencillo que tenía.')) guardar({ diseno: null }, 'Vuelve a salir solo con texto.');
            }}>Quitar el diseño</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditar(e => !e)}><I.Edit /> {editar ? 'Cerrar el texto' : 'Editar el texto'}</button>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setEligiendo(true)}>Darle diseño</button>
          </>
        )}
        <button type="button" className="btn btn-sm btn-outline" onClick={verQuien}>¿A quién le llegaría ahora?</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setVerEnviados(v => !v)} disabled={!a.recientes.length}>
          {verEnviados ? 'Ocultar los enviados' : `Ya enviados (${a.recientes.length})`}
        </button>
      </div>

      {a.diseno && <span style={{ fontSize: 12, color: 'var(--purple)', fontWeight: 700 }}>Sale con diseño (imágenes, botones y colores). Asunto: «{a.asunto}»</span>}
      {eligiendo && (
        <ElegirPlantilla textoActual={a.cuerpo} onCerrar={() => setEligiendo(false)}
          onElegir={({ diseno }) => { setEligiendo(false); setDisenando({ asunto: a.asunto, diseno }); }} />
      )}
      {disenando && (
        <EditorDiseno titulo={a.nombre} valor={disenando} variables={VARS_DISENO[a.id]} showToast={showToast}
          textoGuardar="Guardar el diseño" onCerrar={() => setDisenando(null)}
          onGuardar={async ({ asunto: as, diseno }) => {
            await api(`/api/admin/automatismos/${a.id}`, { method: 'PUT', body: { asunto: as, diseno } });
            showToast?.('Diseño guardado: el automatismo sale ya con él.');
            setDisenando(null); onCambio();
          }} />
      )}
      {editar && !a.diseno && (
        <div style={{ display: 'grid', gap: 8 }}>
          <input ref={asuntoRef} style={campo} value={asunto} onFocus={() => setUltimo('asunto')} onChange={e => setAsunto(e.target.value)} aria-label={`Asunto de ${a.nombre}`} placeholder="Asunto" />
          <textarea ref={cuerpoRef} style={{ ...campo, minHeight: 150, resize: 'vertical' }} value={cuerpo} onFocus={() => setUltimo('cuerpo')} onChange={e => setCuerpo(e.target.value)} aria-label={`Texto de ${a.nombre}`} />
          <Variables vars={VARS[a.id]} onMeter={meter} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm btn-primary" onClick={() => guardar({ asunto, cuerpo }, 'Texto guardado.')}>Guardar texto</button>
          </div>
        </div>
      )}

      {vista && (
        <div style={{ display: 'grid', gap: 6, background: 'var(--bg-3)', borderRadius: 12, padding: 12 }}>
          <b style={{ fontSize: 13 }}>
            {vista.familias != null
              ? (vista.familias ? `Ahora mismo le saldría a ${vista.familias} ${vista.familias === 1 ? 'familia' : 'familias'} (${vista.total} alumnos)` : 'Ahora mismo no le saldría a nadie')
              : vista.total ? `Ahora mismo le saldría a ${vista.total} ${vista.total === 1 ? 'persona' : 'personas'}` : 'Ahora mismo no le saldría a nadie'}
            {vista.comoSiEncendido ? ' (si se encendiera ahora)' : ''}.
          </b>
          {vista.ocasion?.dias && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Cierre: {vista.ocasion.dias} · {vista.ocasion.motivo}. Se vuelve el {vista.ocasion.vuelta}.</span>}
          {vista.ocasion?.mes && <span style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'pre-line' }}>Noticias de {vista.ocasion.mes}:{'\n'}{vista.ocasion.noticias}</span>}
          {a.id === 'cerrado' && !vista.total && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Sale 3 días antes de cada cierre; ahora no empieza ninguno en ese plazo.</span>}
          {a.id === 'noticias' && !vista.total && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Sale del 1 al 7 de cada mes con las noticias del mes anterior; ahora no toca o no hubo noticias.</span>}
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
          Todos los correos que salen solos, en un mismo sitio: cada uno se enciende y se apaga, se edita y se diseña, y los que
          dependen de una hora o de un plazo tienen sus ajustes. Arriba, los avisos a las familias (bienvenida, faltas, cumpleaños,
          días que cerramos, noticias del mes): a cada familia le llega una sola vez por cada ocasión, no le llega a quien no quiere
          novedades de sus clases, y queda apuntado en su ficha. Abajo, los que la app manda cuando pasa algo (contraseñas,
          clases individuales, fichaje, avisos al club…).
        </p>
        {!d.correoActivo && <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>El correo no está configurado en el servidor: aunque se enciendan, no saldrán.</p>}
        {d.correoActivo && d.automatismos.some(a => a.activo) && (
          <button type="button" className="btn btn-sm btn-outline" style={{ marginTop: 10 }} onClick={async () => {
            try { const r = await api('/api/admin/automatismos/ejecutar', { method: 'POST' }); showToast?.(r.nuevos ? `${r.nuevos} correo${r.nuevos !== 1 ? 's' : ''} automático${r.nuevos !== 1 ? 's' : ''} revisado${r.nuevos !== 1 ? 's' : ''}.` : 'No había nada que enviar.'); cargar(); }
            catch (e) { alert(e.message); }
          }}>Comprobar ahora si toca enviar alguno</button>
        )}
      </div>
      <h3 style={{ margin: '6px 0 0', fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 800 }}>Avisos y seguimiento de las familias</h3>
      {d.automatismos.map(a => <Tarjeta key={a.id} a={a} onCambio={cargar} onAbrirFicha={onAbrirFicha} showToast={showToast} />)}
      {/* Los que salen siempre (antes en Diseño de correos → Correos automáticos). */}
      <div className="panel" style={{ display: 'grid', gap: 12 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}><I.Mail /> Los que la app manda cuando pasa algo</h2>
          <p className="sub" style={{ margin: 0 }}>
            Vienen encendidos. Si apagas uno, deja de salir (y te decimos antes qué deja de funcionar). Puedes cambiarles el texto,
            los colores, añadir imágenes… Lo que no se puede quitar es lo que los hace funcionar (el enlace de la contraseña, los
            botones de las clases individuales, la tabla de horas…): el editor te avisa.
          </p>
        </div>
        <CorreosSistema showToast={showToast} />
      </div>
    </div>
  );
}
