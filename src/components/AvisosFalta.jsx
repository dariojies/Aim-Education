import React, { useState, useEffect, useCallback } from 'react';
import { fmtFecha } from '../fechas.js';

// ─────────────────────────────────────────────────────────────────────────────
// «Ha avisado de que va a faltar» (#525): cuando la familia avisa de que el
// alumno no vendrá una temporada (enfermo, de viaje…), secretaría lo apunta con
// sus fechas. Mientras dure, no sale el correo automático de «Faltas seguidas»
// ni hay que llamar; si pasado el «hasta» sigue sin venir, vuelve a avisar.
// Vale para todas sus clases. Se apunta desde su ficha (antes de que falte) o
// desde la lista de faltas seguidas.
// ─────────────────────────────────────────────────────────────────────────────

const hoyMadrid = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
const campo = { padding: '6px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12 };
export const textoAviso = (a) => (a.desde === a.hasta ? `el ${fmtFecha(a.desde)}` : `del ${fmtFecha(a.desde)} al ${fmtFecha(a.hasta)}`);

async function pedir(url, opciones) {
  const r = await fetch(url, { credentials: 'include', ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido guardar.');
  return d;
}
export const quitarAvisoFalta = (id) => pedir(`/api/admin/faltas/aviso/${id}`, { method: 'DELETE' });

// El formulario: desde (hoy, o lo que se diga), hasta y una nota.
export function FormAvisoFalta({ studentId, desdeInicial, onHecho, onCancelar }) {
  const hoy = hoyMadrid();
  const [desde, setDesde] = useState(desdeInicial || hoy);
  const [hasta, setHasta] = useState('');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function guardar() {
    if (!hasta) { alert('Pon hasta qué día va a faltar.'); return; }
    setEnviando(true);
    try {
      await pedir('/api/admin/faltas/aviso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, desde, hasta, nota: nota.trim() }),
      });
      await onHecho?.();
    } catch (e) { alert(e.message); }
    finally { setEnviando(false); }
  }
  return (
    <div data-aviso-form style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--ink-2)' }}>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>Desde
          <input type="date" name="desde" value={desde} onChange={e => setDesde(e.target.value)} style={campo} />
        </label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>hasta
          <input type="date" name="hasta" value={hasta} min={desde || hoy} autoFocus onChange={e => setHasta(e.target.value)} style={campo} />
        </label>
      </div>
      <input value={nota} maxLength={1000} placeholder="Nota (opcional): por qué va a faltar…"
        onChange={e => setNota(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !enviando) guardar(); if (e.key === 'Escape') onCancelar?.(); }}
        style={{ ...campo, minWidth: 0 }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-primary" disabled={enviando} onClick={guardar}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={enviando} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

// Un aviso apuntado, con «Quitar».
export function AvisoApuntado({ aviso, onQuitado, compacto }) {
  const [enviando, setEnviando] = useState(false);
  async function quitar() {
    if (!window.confirm('¿Quitar este aviso? Si sigue faltando, volverá a salir el correo de faltas seguidas y el aviso para llamar.')) return;
    setEnviando(true);
    try { await quitarAvisoFalta(aviso.id); await onQuitado?.(); } catch (e) { alert(e.message); }
    finally { setEnviando(false); }
  }
  return (
    <span data-aviso-falta={aviso.id} style={{ fontSize: 12, color: 'var(--ink-2)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ minWidth: 0 }}>
        <b style={{ color: 'var(--blue, #1e6fd9)' }}>Avisó de que falta</b> {textoAviso(aviso)}
        {aviso.nota ? ` · ${aviso.nota}` : ''}
        {!compacto && aviso.quien && <span style={{ color: 'var(--ink-3)' }}> · lo apuntó {aviso.quien}</span>}
        <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>Mientras tanto no sale el correo de faltas ni hay que llamar.</span>
      </span>
      <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '2px 8px', fontSize: 11 }} disabled={enviando} onClick={quitar}>Quitar</button>
    </span>
  );
}

// En la ficha del alumno (dentro de «Asistencia»): los avisos de ahora y de más
// adelante, y el botón para apuntar uno. Solo para quien ve las faltas
// (secretaría y dirección) y en fichas con alguna clase.
export default function AvisosFaltaFicha({ studentId }) {
  const [datos, setDatos] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/faltas/avisos/${studentId}`, { credentials: 'include', cache: 'no-store' });
      setDatos(r.ok ? await r.json() : null);
    } catch { setDatos(null); }
  }, [studentId]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!datos || (!datos.tieneClases && !datos.avisos.length)) return null;
  return (
    <div data-avisos-ficha style={{ display: 'grid', gap: 8, marginBottom: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
      {datos.avisos.map(a => <AvisoApuntado key={a.id} aviso={a} onQuitado={cargar} />)}
      {abierto
        ? <FormAvisoFalta studentId={studentId} onHecho={async () => { setAbierto(false); await cargar(); }} onCancelar={() => setAbierto(false)} />
        : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-outline" data-aviso-abrir onClick={() => setAbierto(true)}>Avisó de que va a faltar</button>
            {!datos.avisos.length && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Si la familia avisa de que no vendrá unos días, apúntalo y no le llegará el correo de faltas seguidas.</span>}
          </div>
        )}
    </div>
  );
}
