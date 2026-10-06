import React from 'react';

// Piezas comunes de las pantallas del CRM (segmentos, campañas, automatismos),
// para que todas se vean y se usen igual.

// Un paso numerado con su pregunta.
export function Paso({ n, titulo, ayuda, children }) {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr)', gap: 12 }}>
      <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--purple)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>{n}</span>
      <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{titulo}</h3>
          {ayuda && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>{ayuda}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

// Una opción grande con su explicación, para elegir una entre dos o tres.
export function Opcion({ activa, titulo, texto, extra, onClick }) {
  return (
    <button type="button" role="radio" aria-checked={activa} onClick={onClick} style={{
      flex: '1 1 200px', textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
      border: `2px solid ${activa ? 'var(--purple)' : 'var(--line)'}`,
      background: activa ? 'color-mix(in oklab, var(--purple) 8%, var(--bg-2))' : 'var(--bg-2)',
      display: 'grid', gap: 2, alignContent: 'start',
    }}>
      <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>{titulo}</span>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{texto}</span>
      {extra && <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--purple)', marginTop: 4 }}>{extra}</span>}
    </button>
  );
}

// Lo que se rellena solo en cada correo, dicho con palabras.
const QUE_ES = {
  '{nombre}': 'nombre del alumno',
  '{alumno}': 'nombre y apellidos del alumno',
  '{clases}': 'sus clases',
  '{clase}': 'la clase',
  '{pendiente}': 'lo que tiene sin pagar',
  '{mes}': 'el mes',
  '{faltas}': 'cuántas faltas lleva',
  '{edad}': 'los años que cumple',
};

// Etiquetas que se pueden pulsar para meter el dato en el texto, donde esté el
// cursor.
export function Variables({ vars, onMeter }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Pulsa para añadir un dato que se rellena solo:</span>
      {vars.map(v => (
        <button key={v} type="button" onClick={() => onMeter(v)} title={`Añadir ${v}`} style={{
          fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
          border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink-2)',
        }}>+ {QUE_ES[v] || v}</button>
      ))}
    </div>
  );
}

// Mete un texto en un campo en la posición del cursor y devuelve el nuevo valor.
export function meterEnCursor(campo, valor, texto) {
  if (!campo) return `${valor}${texto}`;
  const a = campo.selectionStart ?? valor.length, b = campo.selectionEnd ?? valor.length;
  const nuevo = valor.slice(0, a) + texto + valor.slice(b);
  requestAnimationFrame(() => { campo.focus(); campo.setSelectionRange(a + texto.length, a + texto.length); });
  return nuevo;
}

// Interruptor de encendido/apagado de un correo automático (#365).
export function Interruptor({ activo, onClick, nombre }) {
  return (
    <button type="button" onClick={onClick} role="switch" aria-checked={activo} aria-label={`${activo ? 'Apagar' : 'Encender'} ${nombre}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 6px', borderRadius: 999, border: '1px solid var(--line)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 12, flexShrink: 0,
        background: activo ? 'color-mix(in oklab, var(--teal) 14%, var(--bg-2))' : 'var(--bg-3)', color: activo ? 'var(--teal)' : 'var(--ink-3)' }}>
      <span style={{ width: 34, height: 20, borderRadius: 999, background: activo ? 'var(--teal)' : 'var(--line)', position: 'relative', transition: 'background .2s' }}>
        <span style={{ position: 'absolute', top: 2, left: activo ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
      </span>
      {activo ? 'Encendido' : 'Apagado'}
    </button>
  );
}

// Los ajustes de cuándo sale un correo automático (#365): cada uno es un número
// con sus límites ({ nombre, unidad, min, max, def }). onGuardar(valores).
export function AjustesCorreo({ def, valores, onGuardar }) {
  const [v, setV] = React.useState(valores || {});
  const [guardando, setGuardando] = React.useState(false);
  React.useEffect(() => { setV(valores || {}); }, [JSON.stringify(valores)]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!def || !Object.keys(def).length) return null;
  const cambiado = Object.keys(def).some(k => Number(v[k]) !== Number(valores?.[k]));
  const fuera = Object.entries(def).some(([k, d]) => !(Number(v[k]) >= d.min && Number(v[k]) <= d.max));
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', background: 'var(--bg-3)', borderRadius: 12, padding: '10px 12px' }}>
      {Object.entries(def).map(([k, d]) => (
        <label key={k} style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}>
          {d.nombre}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={d.min} max={d.max} step="1" value={v[k] ?? ''} aria-label={d.nombre}
              onChange={e => setV(x => ({ ...x, [k]: e.target.value === '' ? '' : Number(e.target.value) }))}
              style={{ width: 70, fontFamily: 'inherit', fontSize: 14, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' }} />
            <span style={{ fontWeight: 400 }}>{d.unidad}</span>
          </span>
        </label>
      ))}
      {cambiado && (
        <button type="button" className="btn btn-sm btn-primary" disabled={guardando || fuera}
          title={fuera ? 'Algún valor está fuera de sus límites' : undefined}
          onClick={async () => { setGuardando(true); try { await onGuardar(v); } finally { setGuardando(false); } }}>
          {guardando ? 'Guardando…' : 'Guardar ajustes'}
        </button>
      )}
      {fuera && <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>{Object.entries(def).filter(([k, d]) => !(Number(v[k]) >= d.min && Number(v[k]) <= d.max)).map(([, d]) => `${d.nombre}: de ${d.min} a ${d.max}`).join(' · ')}</span>}
    </div>
  );
}
