import React, { useState, useEffect, useCallback } from 'react';
import { imagenSubible } from '../imagenes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Dudas al profesor del aula virtual (#461). Una duda es privada (la ven el
// alumno y quien lleva el curso) o compartida con el curso (la ven todos los
// apuntados y pueden ayudar). Las contesta el profesor del curso o, si no
// tiene, secretaría. Sale en el curso por dentro (DudasCurso) y en la gestión
// del aula (DudasGestion).
// ─────────────────────────────────────────────────────────────────────────────

const tarjeta = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 18 };
const inp = { fontFamily: 'inherit', fontSize: 15, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' };
const fmtHora = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const pastilla = (color) => ({ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, color, background: `color-mix(in oklab, ${color} 13%, var(--bg-2))`, whiteSpace: 'nowrap' });
const enlace = { font: 'inherit', fontSize: 13, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--purple)', fontWeight: 700 };

async function api(url, { method = 'GET', body } = {}) {
  const r = await fetch(url, {
    method, credentials: 'include', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido hacer.');
  return d;
}
// La foto va aparte, una vez escrito el mensaje.
async function subirFoto(mensajeId, foto) {
  const f = await imagenSubible(foto);
  const r = await fetch(`/api/aula/dudas/mensajes/${mensajeId}/imagen`, {
    method: 'PUT', credentials: 'include', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`El mensaje se ha enviado, pero la foto no: ${d.error || 'inténtalo otra vez.'}`);
}
const fotoDelPortapapeles = (e) => [...(e.clipboardData?.files || [])].find(f => /^image\//.test(f.type)) || null;

function Estado({ d, gestor }) {
  if (d.estado === 'resuelta') return <span style={pastilla('var(--teal)')}>✓ Resuelta</span>;
  if (d.pendiente) return <span style={pastilla(gestor ? 'var(--pink)' : 'var(--orange)')}>{gestor ? 'Por contestar' : 'Esperando respuesta'}</span>;
  return <span style={pastilla('var(--purple)')}>Contestada</span>;
}
const Visibilidad = ({ publica }) => (
  <span style={pastilla('var(--ink-3)')} title={publica ? 'La ven todos los del curso' : 'Solo la veis el alumno y el profesor'}>{publica ? '👥 Compartida' : '🔒 Privada'}</span>
);

function ElegirFoto({ foto, setFoto }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <label className="btn btn-sm btn-outline" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
        📷 {foto ? 'Cambiar la foto' : 'Añadir una foto'}
        <input type="file" accept="image/*" onChange={e => { setFoto(e.target.files?.[0] || null); e.target.value = ''; }}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
      </label>
      {foto && <span style={{ fontSize: 13 }}>{foto.name || 'Foto pegada'} · <button type="button" style={{ ...enlace, color: 'var(--pink)' }} onClick={() => setFoto(null)}>quitar</button></span>}
    </div>
  );
}

// ═══════════════════════ En el curso ═══════════════════════
export function DudasCurso({ cursoId, leccion, gestor, abrir }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [todas, setTodas] = useState(false);
  const [abierta, setAbierta] = useState(abrir || null);
  const [nueva, setNueva] = useState(false);
  const cargar = useCallback(() => api(`/api/aula/cursos/${cursoId}/dudas`).then(d => { setLista(d.dudas); setError(''); }).catch(e => setError(e.message)), [cursoId]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (abrir) { setAbierta(abrir); setNueva(false); } }, [abrir]);

  const deEsta = (lista || []).filter(d => d.leccionId === leccion?.id);
  const vistas = todas || !leccion ? (lista || []) : deEsta;
  return (
    <section id="aula-dudas" style={{ ...tarjeta, padding: 18, display: 'grid', gap: 12, scrollMarginTop: 80 }}>
      {abierta ? (
        <HiloDuda id={abierta} onVolver={() => { setAbierta(null); cargar(); }} onBorrada={() => { setAbierta(null); cargar(); }} />
      ) : nueva ? (
        <NuevaDuda cursoId={cursoId} leccion={leccion} onCancelar={() => setNueva(false)} onCreada={(id) => { setNueva(false); cargar(); setAbierta(id); }} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 17, flex: 1, minWidth: 160 }}>💬 Dudas{gestor ? ' de los alumnos' : ''}</b>
            {!gestor && <button type="button" className="btn btn-sm btn-primary" onClick={() => setNueva(true)}>Preguntar una duda</button>}
          </div>
          {leccion && (
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-3)', padding: 4, borderRadius: 999, justifySelf: 'start' }}>
              {[[false, `De esta lección${lista ? ` · ${deEsta.length}` : ''}`], [true, `Todas las del curso${lista ? ` · ${lista.length}` : ''}`]].map(([v, t]) => (
                <button key={t} type="button" onClick={() => setTodas(v)} className={`btn btn-sm ${todas === v ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 999 }}>{t}</button>
              ))}
            </div>
          )}
          {error && <span style={{ color: 'var(--pink)', fontSize: 14 }}>{error}</span>}
          {!lista && !error && <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</span>}
          {lista && !vistas.length && (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)' }}>
              {gestor ? 'No hay dudas aquí.' : todas || !leccion ? '¿Algo no te ha quedado claro? Pregúntalo: te contesta tu profesor.' : 'Nadie ha preguntado nada de esta lección. Si tienes una duda, pregúntala.'}
            </p>
          )}
          {vistas.length > 0 && <ListaDudas dudas={vistas} gestor={gestor} onAbrir={setAbierta} conLeccion={todas || !leccion} />}
        </>
      )}
    </section>
  );
}

function ListaDudas({ dudas, gestor, onAbrir, conLeccion = true, conCurso = false }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {dudas.map(d => (
        <button key={d.id} type="button" onClick={() => onAbrir(d.id)}
          style={{ font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 4, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 15, flex: 1, minWidth: 160 }}>{d.titulo}</b>
            <Visibilidad publica={d.publica} />
            <Estado d={d} gestor={gestor} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {d.mia ? 'Tuya' : d.autor}{conCurso ? ` · ${d.curso}` : ''}{conLeccion && d.leccion ? ` · ${d.leccion}` : ''} · {d.respuestas} {d.respuestas === 1 ? 'respuesta' : 'respuestas'} · {fmtHora(d.ultima)}
          </span>
        </button>
      ))}
    </div>
  );
}

function NuevaDuda({ cursoId, leccion, onCancelar, onCreada }) {
  const [titulo, setTitulo] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [publica, setPublica] = useState(false);
  const [deLeccion, setDeLeccion] = useState(!!leccion);
  const [foto, setFoto] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  async function enviar(e) {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      const r = await api(`/api/aula/cursos/${cursoId}/dudas`, { method: 'POST', body: { titulo, cuerpo, publica, leccionId: deLeccion ? leccion?.id : null } });
      if (foto) await subirFoto(r.mensajeId, foto).catch(err => alert(err.message));
      onCreada(r.id);
    } catch (err) { setError(err.message); setEnviando(false); }
  }
  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 10 }}>
      <b style={{ fontSize: 17 }}>Preguntar una duda</b>
      <input required autoFocus maxLength={200} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="En pocas palabras, ¿qué no entiendes?" style={inp} />
      <textarea required rows={5} value={cuerpo} onChange={e => setCuerpo(e.target.value)} onPaste={e => { const f = fotoDelPortapapeles(e); if (f) { e.preventDefault(); setFoto(f); } }}
        placeholder="Cuéntalo con detalle: qué estabas haciendo, qué has probado…" style={{ ...inp, resize: 'vertical' }} />
      <ElegirFoto foto={foto} setFoto={setFoto} />
      {leccion && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
          <input type="checkbox" checked={deLeccion} onChange={e => setDeLeccion(e.target.checked)} /> Es de la lección «{leccion.titulo}»
        </label>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        {[[false, '🔒 Privada', 'Solo la veis tu profesor y tú.'], [true, '👥 Compartida con el curso', 'La ven tus compañeros y también pueden ayudarte. Les sale tu nombre.']].map(([v, t, ayuda]) => (
          <label key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 12, cursor: 'pointer',
            border: `1px solid ${publica === v ? 'var(--purple)' : 'var(--line)'}`, background: publica === v ? 'color-mix(in oklab, var(--purple) 8%, var(--bg-2))' : 'transparent' }}>
            <input type="radio" name="visibilidad" checked={publica === v} onChange={() => setPublica(v)} style={{ marginTop: 3 }} />
            <span style={{ display: 'grid' }}><b style={{ fontSize: 14 }}>{t}</b><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{ayuda}</span></span>
          </label>
        ))}
      </div>
      {error && <span style={{ fontSize: 13, color: 'var(--pink)' }}>{error}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-sm btn-primary" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar la duda'}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

export function HiloDuda({ id, onVolver, onBorrada, onCambio }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [texto, setTexto] = useState('');
  const [foto, setFoto] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const cargar = useCallback(() => api(`/api/aula/dudas/${id}`).then(x => { setD(x); setError(''); }).catch(e => setError(e.message)), [id]);
  useEffect(() => { setD(null); cargar(); }, [cargar]);

  async function responder(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const r = await api(`/api/aula/dudas/${id}/mensajes`, { method: 'POST', body: { cuerpo: texto } });
      if (foto) await subirFoto(r.id, foto).catch(err => alert(err.message));
      setTexto(''); setFoto(null);
      await cargar(); onCambio?.();
    } catch (err) { alert(err.message); } finally { setEnviando(false); }
  }
  async function cambiar(body) {
    try { await api(`/api/aula/dudas/${id}`, { method: 'PUT', body }); await cargar(); onCambio?.(); } catch (err) { alert(err.message); }
  }
  async function borrar(m, primero) {
    if (!window.confirm(primero ? '¿Borrar la duda entera, con sus respuestas?' : '¿Borrar este mensaje?')) return;
    try {
      await api(`/api/aula/dudas/mensajes/${m.id}`, { method: 'DELETE' });
      if (primero) { onBorrada?.(); return; }
      await cargar(); onCambio?.();
    } catch (err) { alert(err.message); }
  }

  const volver = <button type="button" style={{ ...enlace, justifySelf: 'start' }} onClick={onVolver}>← Todas las dudas</button>;
  if (error) return <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>{volver}<span style={{ color: 'var(--pink)' }}>{error}</span></div>;
  if (!d) return <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>{volver}<span style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</span></div>;
  const manda = d.gestor || d.mia;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {volver}
      <div style={{ display: 'grid', gap: 6 }}>
        <b style={{ fontSize: 18 }}>{d.titulo}</b>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Visibilidad publica={d.publica} />
          <Estado d={d} gestor={d.gestor} />
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{d.curso}{d.leccion ? ` · ${d.leccion}` : ''}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {d.mensajes.map((m, i) => (
          <div key={m.id} style={{ padding: '10px 12px', borderRadius: 14, display: 'grid', gap: 6,
            background: m.esProfesor ? 'color-mix(in oklab, var(--teal) 10%, var(--bg-2))' : m.mio ? 'color-mix(in oklab, var(--purple) 8%, var(--bg-2))' : 'var(--bg-3)' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <b>{m.mio ? 'Tú' : m.autor}</b>
              {m.esProfesor && <span style={pastilla('var(--teal)')}>Profesor</span>}
              <span style={{ color: 'var(--ink-3)', flex: 1 }}>{fmtHora(m.fecha)}</span>
              {m.puedeBorrar && <button type="button" style={{ ...enlace, fontSize: 12, color: 'var(--ink-3)', fontWeight: 500 }} onClick={() => borrar(m, i === 0)}>Borrar</button>}
            </div>
            <div style={{ fontSize: 15, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.cuerpo}</div>
            {m.imagen && (
              <a href={m.imagen} target="_blank" rel="noreferrer" style={{ justifySelf: 'start' }}>
                <img src={m.imagen} alt="Foto del mensaje" loading="lazy" style={{ maxWidth: 'min(100%, 420px)', maxHeight: 320, borderRadius: 10, display: 'block', border: '1px solid var(--line)' }} />
              </a>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={responder} style={{ display: 'grid', gap: 8 }}>
        <textarea rows={3} value={texto} onChange={e => setTexto(e.target.value)} onPaste={e => { const f = fotoDelPortapapeles(e); if (f) { e.preventDefault(); setFoto(f); } }}
          placeholder={d.gestor ? 'Contesta al alumno…' : d.mia ? 'Añade algo más o da las gracias…' : 'Si sabes la respuesta, ayuda a tu compañero…'} style={{ ...inp, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-sm btn-primary" disabled={enviando || !texto.trim()}>{enviando ? 'Enviando…' : 'Responder'}</button>
          <ElegirFoto foto={foto} setFoto={setFoto} />
        </div>
      </form>
      {manda && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          {d.estado === 'abierta'
            ? <button type="button" style={enlace} onClick={() => cambiar({ estado: 'resuelta' })}>✓ Marcar como resuelta</button>
            : <button type="button" style={enlace} onClick={() => cambiar({ estado: 'abierta' })}>Volver a abrirla</button>}
          {d.mia && !d.publica && <button type="button" style={enlace} onClick={() => cambiar({ publica: true })}>👥 Compartirla con el curso</button>}
          {d.publica && <button type="button" style={enlace} onClick={() => cambiar({ publica: false })}>🔒 Dejarla privada</button>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════ En la gestión del aula ═══════════════════════
export function DudasGestion({ onCambio }) {
  const [solo, setSolo] = useState(true);
  const [lista, setLista] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const cargar = useCallback(() => {
    api(`/api/admin/aula/dudas${solo ? '?pendientes=1' : ''}`).then(setLista).catch(e => alert(e.message));
  }, [solo]);
  useEffect(() => { cargar(); }, [cargar]);
  if (abierta) {
    return (
      <div style={{ ...tarjeta, padding: 18, maxWidth: 900 }}>
        <HiloDuda id={abierta} onVolver={() => { setAbierta(null); cargar(); }} onBorrada={() => { setAbierta(null); cargar(); onCambio?.(); }} onCambio={onCambio} />
      </div>
    );
  }
  if (!lista) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 900 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
        <input type="checkbox" checked={solo} onChange={e => setSolo(e.target.checked)} /> Solo las que faltan por contestar
      </label>
      {lista.length === 0 && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{solo ? 'No hay dudas por contestar. 🎉' : 'Todavía no hay dudas.'}</p>}
      <ListaDudas dudas={lista} gestor onAbrir={setAbierta} conCurso />
    </div>
  );
}
