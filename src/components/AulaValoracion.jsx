import React, { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// La valoración del curso (#463). El alumno la rellena al terminar el curso y,
// con ella, tiene su diploma (Valoracion). El personal ve el resumen en el
// curso, pestaña «Valoraciones» (ValoracionesCurso): secretaría y la dirección
// con el nombre de cada alumno; el profesor, sin nombres.
// ─────────────────────────────────────────────────────────────────────────────

export const PREGUNTAS_VALORACION = [
  ['calidad', '¿Cómo valorarías la calidad general del curso?'],
  ['claridad', '¿Cómo valorarías la claridad de las explicaciones del profesor?'],
  ['dominio', '¿Cómo valorarías los conocimientos y el dominio de la materia del profesor?'],
  ['seguir', '¿Te ha resultado fácil seguir las clases y comprender los contenidos?'],
  ['utilidad', '¿Consideras que has aprendido conocimientos útiles y aplicables?'],
  ['materiales', '¿Cómo valorarías los materiales, recursos y actividades del curso?'],
];
export const RECOMENDARIA = [['si', 'Sí, sin duda'], ['probable_si', 'Probablemente sí'], ['probable_no', 'Probablemente no'], ['no', 'No']];
const COLOR_NOTA = ['', '#E5484D', '#F5A400', '#9AA0A6', '#2BB673', '#21B668'];
const inp = { fontFamily: 'inherit', fontSize: 15, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' };
const tarjeta = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 18 };

// ═══════════════════════ El alumno ═══════════════════════
export function Valoracion({ cursoId, onHecha }) {
  const [r, setR] = useState({});
  const [mejoras, setMejoras] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const marcar = (k, v) => { setR(x => ({ ...x, [k]: v })); setError(''); };
  const faltan = PREGUNTAS_VALORACION.filter(([k]) => !r[k]).length + (r.recomendaria ? 0 : 1);
  async function enviar(e) {
    e.preventDefault();
    if (faltan) { setError('Contesta todas las preguntas (la última es opcional).'); return; }
    setEnviando(true); setError('');
    try {
      const x = await fetch(`/api/aula/cursos/${cursoId}/valoracion`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...r, mejoras }),
      });
      const d = await x.json().catch(() => ({}));
      if (!x.ok) throw new Error(d.error || 'No se ha podido enviar.');
      onHecha();
    } catch (err) { setError(err.message); setEnviando(false); }
  }
  return (
    <form id="aula-valoracion" onSubmit={enviar} style={{ ...tarjeta, padding: 20, display: 'grid', gap: 18, scrollMarginTop: 80 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <b style={{ fontSize: 18 }}>🎉 ¡Has terminado el curso! Último paso: valóralo</b>
        <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>Son dos minutos y nos ayudan a mejorar. Al enviarla, tienes tu diploma.</span>
      </div>
      {PREGUNTAS_VALORACION.map(([k, texto], i) => (
        <fieldset key={k} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          <legend style={{ fontWeight: 700, fontSize: 15, padding: 0, marginBottom: 8 }}>{i + 1}. {texto}</legend>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" aria-pressed={r[k] === n} aria-label={`${n} de 5`} onClick={() => marcar(k, n)}
                style={{ font: 'inherit', fontWeight: 800, fontSize: 16, width: 48, height: 44, borderRadius: 12, cursor: 'pointer',
                  border: `1.5px solid ${r[k] === n ? 'var(--purple)' : 'var(--line)'}`, background: r[k] === n ? 'var(--purple)' : 'var(--bg-3)', color: r[k] === n ? '#fff' : 'var(--ink)' }}>{n}</button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 272, fontSize: 12, color: 'var(--ink-3)' }}>
            <span>Muy mala / Muy bajo</span><span>Excelente / Muy alto</span>
          </div>
        </fieldset>
      ))}
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
        <legend style={{ fontWeight: 700, fontSize: 15, padding: 0, marginBottom: 8 }}>7. ¿Recomendarías este curso a otras personas?</legend>
        {RECOMENDARIA.map(([k, t]) => (
          <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 15, cursor: 'pointer' }}>
            <input type="radio" name="recomendaria" checked={r.recomendaria === k} onChange={() => marcar('recomendaria', k)} /> {t}
          </label>
        ))}
      </fieldset>
      <label style={{ display: 'grid', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>8. ¿Qué mejorarías del curso o del profesor? <span style={{ fontWeight: 500, color: 'var(--ink-3)', fontSize: 13 }}>(opcional)</span></span>
        <textarea rows={4} maxLength={3000} value={mejoras} onChange={e => setMejoras(e.target.value)} style={{ ...inp, resize: 'vertical' }} />
      </label>
      {error && <span style={{ color: 'var(--pink)', fontSize: 14 }}>{error}</span>}
      <button type="submit" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={enviando}>
        {enviando ? 'Enviando…' : faltan ? `Enviar y conseguir mi diploma (faltan ${faltan})` : 'Enviar y conseguir mi diploma'}
      </button>
    </form>
  );
}

// ═══════════════════════ El personal ═══════════════════════
export function ValoracionesCurso({ cursoId }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(`/api/admin/aula/cursos/${cursoId}/valoraciones`, { credentials: 'include', cache: 'no-store' })
      .then(async r => { const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'No se han podido cargar.'); setD(x); })
      .catch(e => setError(e.message));
  }, [cursoId]);
  if (error) return <p style={{ color: 'var(--pink)' }}>{error}</p>;
  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  if (!d.total) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Aún nadie ha valorado el curso. Cada alumno lo valora al terminarlo, antes de descargar su diploma.</p>;
  const fmt = (n) => String(n).replace('.', ',');
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
      <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
        {d.total} {d.total === 1 ? 'alumno ha valorado' : 'alumnos han valorado'} el curso.{!d.conNombre && ' Son anónimas: no se ve quién ha puesto cada cosa.'}
      </span>
      <div style={{ ...tarjeta, padding: 16, display: 'grid', gap: 12 }}>
        {PREGUNTAS_VALORACION.map(([k, texto]) => {
          const x = d.notas[k];
          return (
            <div key={k} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{ flex: 1, fontSize: 14 }}>{texto}</span>
                <b style={{ fontSize: 16, color: COLOR_NOTA[Math.round(x.media)] }}>{fmt(x.media)}</b><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>/ 5</span>
              </div>
              <div style={{ height: 8, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(x.media / 5) * 100}%`, borderRadius: 99, background: 'linear-gradient(90deg, #5233A8, #21B668)' }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{x.reparto.map((n, i) => `${i + 1}: ${n}`).join(' · ')}</span>
            </div>
          );
        })}
      </div>
      <div style={{ ...tarjeta, padding: 16, display: 'grid', gap: 8 }}>
        <b style={{ fontSize: 15 }}>¿Lo recomendarían?</b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {RECOMENDARIA.map(([k, t]) => (
            <span key={k} style={{ padding: '6px 12px', borderRadius: 999, background: 'var(--bg-3)', fontSize: 13 }}><b>{d.recomendaria[k]}</b> · {t}</span>
          ))}
        </div>
      </div>
      <div style={{ ...tarjeta, padding: 16, display: 'grid', gap: 10 }}>
        <b style={{ fontSize: 15 }}>Qué mejorarían</b>
        {!d.comentarios.length && <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>Nadie ha escrito nada.</span>}
        {d.comentarios.map((c, i) => (
          <div key={i} style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--bg-3)', display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.texto}</span>
            {c.alumno && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.alumno} · {new Date(c.fecha).toLocaleDateString('es-ES')}</span>}
          </div>
        ))}
      </div>
      {d.respuestas && (
        <div style={{ ...tarjeta, padding: 16, display: 'grid', gap: 8, overflowX: 'auto' }}>
          <b style={{ fontSize: 15 }}>Cada alumno</b>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-3)' }}>
                <th style={{ padding: 6 }}>Alumno</th>{PREGUNTAS_VALORACION.map((_, i) => <th key={i} style={{ padding: 6, textAlign: 'center' }}>{i + 1}</th>)}<th style={{ padding: 6 }}>Recomendaría</th><th style={{ padding: 6 }}>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {d.respuestas.map((x, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: 6, fontWeight: 700 }}>{x.alumno}</td>
                  {PREGUNTAS_VALORACION.map(([k]) => <td key={k} style={{ padding: 6, textAlign: 'center', fontWeight: 800, color: COLOR_NOTA[x[k]] }}>{x[k]}</td>)}
                  <td style={{ padding: 6 }}>{RECOMENDARIA.find(([k]) => k === x.recomendaria)?.[1]}</td>
                  <td style={{ padding: 6, color: 'var(--ink-3)' }}>{new Date(x.fecha).toLocaleDateString('es-ES')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
