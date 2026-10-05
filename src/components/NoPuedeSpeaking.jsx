import React, { useState } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Cuándo NO puede venir un alumno a Speaking (ticket #363). Cada regla es un día
// de la semana (0 = lunes, como el horario) y, si no es el día entero, desde y/o
// hasta qué hora. Así cabe «los martes no», y también «los jueves a en punto no,
// pero a y cuarto sí» (jueves, hasta las 17:15). Lo usan secretaría (al citar) y
// la familia (desde su área).
// ─────────────────────────────────────────────────────────────────────────────

export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DIAS_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
const aMin = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const diaDeFecha = (iso) => (new Date(String(iso).slice(0, 10) + 'T12:00:00').getDay() + 6) % 7;

// Una regla en palabras: «los jueves antes de las 17:15».
export function textoRegla(r) {
  const d = `los ${DIAS_PLURAL[r.dia] || '?'}`;
  if (r.desde && r.hasta) return `${d} de ${r.desde} a ${r.hasta}`;
  if (r.hasta) return `${d} antes de las ${r.hasta}`;
  if (r.desde) return `${d} desde las ${r.desde}`;
  return d;
}
export const textoNoPuede = (reglas) => (reglas || []).map(textoRegla).join(' · ');

// Qué choca con un día concreto: el día entero, o qué franjas ({n, desde, hasta}).
export function choques(reglas, fecha, franjas) {
  const delDia = (reglas || []).filter(r => r.dia === diaDeFecha(fecha));
  if (!delDia.length) return { dia: false, franjas: [], reglas: [] };
  if (delDia.some(r => !r.desde && !r.hasta)) return { dia: true, franjas: (franjas || []).map(f => f.n), reglas: delDia };
  const tocadas = (franjas || []).filter(f => f.desde && delDia.some(r =>
    aMin(f.desde) < (r.hasta ? aMin(r.hasta) : 1440) && (r.desde ? aMin(r.desde) : 0) < aMin(f.hasta))).map(f => f.n);
  return { dia: false, franjas: tocadas, reglas: delDia };
}

const campo = { fontFamily: 'inherit', fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' };

// El editor: una fila por regla y una nota libre. onGuardar({ noPuede, nota }).
export function EditorNoPuede({ inicial, notaInicial = '', onGuardar, onCancelar, guardando = false, quien = 'el alumno' }) {
  const [reglas, setReglas] = useState(() => (inicial || []).map(r => ({ ...r, tramo: r.desde || r.hasta ? 'horas' : 'todo' })));
  const [nota, setNota] = useState(notaInicial || '');
  const cambia = (i, c) => setReglas(x => x.map((r, k) => (k === i ? { ...r, ...c } : r)));
  const limpias = reglas.map(r => (r.tramo === 'todo' ? { dia: Number(r.dia) } : { dia: Number(r.dia), desde: r.desde || null, hasta: r.hasta || null }));
  const malas = limpias.some(r => r.desde && r.hasta && aMin(r.desde) >= aMin(r.hasta));

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {reglas.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Puede venir cualquier día. Añade los días u horas en que {quien} no puede.</p>}
      {reglas.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>No puede los</span>
          <select value={r.dia} onChange={e => cambia(i, { dia: Number(e.target.value) })} style={campo} aria-label="Día">
            {DIAS_PLURAL.map((d, k) => <option key={k} value={k}>{d}</option>)}
          </select>
          <select value={r.tramo} onChange={e => cambia(i, { tramo: e.target.value })} style={campo} aria-label="Cuándo">
            <option value="todo">en todo el día</option>
            <option value="horas">a ciertas horas</option>
          </select>
          {r.tramo === 'horas' && (
            <>
              <span style={{ fontSize: 13 }}>desde</span>
              <input type="time" value={r.desde || ''} onChange={e => cambia(i, { desde: e.target.value })} style={campo} aria-label="Desde" />
              <span style={{ fontSize: 13 }}>hasta</span>
              <input type="time" value={r.hasta || ''} onChange={e => cambia(i, { hasta: e.target.value })} style={campo} aria-label="Hasta" />
            </>
          )}
          <button type="button" className="icon-btn danger" onClick={() => setReglas(x => x.filter((_, k) => k !== i))} aria-label="Quitar"><I.X /></button>
        </div>
      ))}
      {reglas.some(r => r.tramo === 'horas') && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
          Si solo pones una hora vale igual: «hasta las 17:15» es que antes de esa hora no puede; «desde las 18:00», que a partir de ahí no.
        </p>
      )}
      <div>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setReglas(x => [...x, { dia: 0, tramo: 'todo' }])}>
          <I.Plus /> Añadir día u hora que no puede
        </button>
      </div>
      <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} maxLength={500}
        placeholder="Algo más que haya que saber (opcional)" style={{ ...campo, width: '100%', resize: 'vertical' }} />
      {malas && <p style={{ margin: 0, fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>En alguna fila la hora «desde» es igual o posterior a «hasta».</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onCancelar && <button type="button" className="btn btn-sm btn-outline" onClick={onCancelar}>Cancelar</button>}
        <button type="button" className="btn btn-sm btn-primary" disabled={guardando || malas}
          onClick={() => onGuardar({ noPuede: limpias, nota: nota.trim() })}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
