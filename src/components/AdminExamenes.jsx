import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { Insignia } from './FichaAlumnoClases.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Títulos y exámenes por CONVOCATORIA (ticket #212)
//
// En vez de rellenar un formulario entero por cada persona que se examina, se
// crea UNA convocatoria (actividad, fecha, nombre y cómo va la matrícula), se le
// meten los alumnos por su usuario, y luego se entra en cada participante para
// ponerle la nota, el rango/cinturón/título que promociona y avisar por correo a
// la familia (y al propio usuario) de que ha aprobado.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => `${Number(n ?? 0).toFixed(2)} €`;
const fmtFecha = (f) => f ? new Date(String(f).slice(0, 10)).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

async function req(path, opts = {}) {
  const r = await fetch(path, {
    credentials: 'include', cache: 'no-store',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Error de conexión.');
  return d;
}

const inputCss = {
  fontFamily: 'inherit', fontSize: 14, padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', minWidth: 0, width: '100%',
};
const campo = { display: 'grid', gap: 5 };
const label = { fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' };

// Pastilla verde/roja/gris según el resultado.
function Resultado({ apto, resultado }) {
  const color = apto === true ? 'var(--green, #16a34a)' : apto === false ? 'var(--red, #dc2626)' : 'var(--ink-3)';
  const texto = resultado || (apto === true ? 'Apto' : apto === false ? 'No apto' : 'Sin evaluar');
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800,
      color: apto == null ? 'var(--ink-2)' : '#fff', background: apto == null ? 'var(--bg-3)' : color,
      padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>
      {apto === true ? '✓' : apto === false ? '✕' : '•'} {texto}
    </span>
  );
}

// Busca un alumno por su usuario (mismo endpoint que usan las clases).
function BuscarAlumno({ onElegir, activityId, excluir = [] }) {
  const [q, setQ] = useState('');
  const [sug, setSug] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setSug([]); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const url = `/api/admin/tul/students?q=${encodeURIComponent(q.trim())}` + (activityId ? `&activityId=${activityId}` : '');
        const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
        const d = await r.json().catch(() => ({}));
        if (vivo) setSug((d.students || []).filter(s => !excluir.includes(s.id)));
      } catch { /* noop */ }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, activityId, excluir]);
  return (
    <div style={{ position: 'relative' }}>
      <input style={inputCss} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar alumno por nombre o correo..." />
      {sug.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 10,
          maxHeight: 240, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)',
        }}>
          {sug.map(s => (
            <button key={s.id} type="button" onClick={() => { onElegir(s); setQ(''); setSug([]); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', cursor: 'pointer',
                border: 'none', borderBottom: '1px solid var(--line)', background: 'transparent',
                fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)',
              }}>
              <b>{s.name}</b> <span style={{ color: 'var(--ink-3)' }}>· {s.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// El apto que sale del baremo para una nota. null si esa actividad no tiene
// baremo o no hay nota (entonces manda lo que se escriba a mano).
function bandaDe(baremo, puntos, puntosMax) {
  if (!baremo || puntos === '' || puntos == null) return null;
  const max = Number(puntosMax) || baremo.max || 100;
  const sobre100 = max !== 100 ? (Number(puntos) / max) * 100 : Number(puntos);
  return baremo.bandas.find(x => sobre100 >= x.min) || null;
}

// ── El único formulario: crear la convocatoria ──────────────────────────────
function NuevaConvocatoria({ opciones, onCrear, onCancel, creando }) {
  const [activityId, setActividad] = useState(opciones[0]?.id || '');
  const [nombre, setNombre] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [cobrarMatricula, setCobrar] = useState(true);
  const [matriculaImporte, setImporte] = useState('');
  const [observaciones, setObs] = useState('');

  const act = useMemo(() => opciones.find(a => a.id === activityId) || null, [opciones, activityId]);
  const matricula = act?.matricula || { modo: 'externa', nota: '' };

  function enviar(e) {
    e.preventDefault();
    onCrear({
      activityId, nombre: nombre.trim() || null, fecha,
      cobrarMatricula: matricula.modo === 'cobrada' && cobrarMatricula,
      matriculaImporte: matriculaImporte === '' ? null : Number(matriculaImporte),
      observaciones: observaciones.trim() || null,
    });
  }

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
        <div style={campo}>
          <span style={label}>Actividad</span>
          <select style={inputCss} value={activityId} onChange={e => setActividad(e.target.value)}>
            {opciones.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div style={campo}>
          <span style={label}>Fecha del examen</span>
          <input style={inputCss} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
      </div>

      <div style={campo}>
        <span style={label}>Nombre de la convocatoria</span>
        <input style={inputCss} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="p. ej. Junio 2026" />
      </div>

      {/* Matrícula: en Ballet la cobramos (un cargo por participante al meterlo);
          en Inglés y Taekwon-Do se paga fuera y solo se anota. */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, display: 'grid', gap: 8, background: 'var(--bg-2)' }}>
        <span style={{ ...label, textTransform: 'uppercase', letterSpacing: '.05em' }}>Matrícula</span>
        {matricula.modo === 'cobrada' ? (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={cobrarMatricula} onChange={e => setCobrar(e.target.checked)} style={{ accentColor: 'var(--teal)' }} />
              Cobrar la matrícula a cada participante al meterlo en la convocatoria
            </label>
            {cobrarMatricula && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13 }}>Importe por alumno:</span>
                <input style={{ ...inputCss, width: 120 }} type="number" step="0.01" value={matriculaImporte}
                  onChange={e => setImporte(e.target.value)} placeholder="0.00" /> €
              </div>
            )}
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{matricula.nota}</span>
          </>
        ) : (
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>ℹ️ {matricula.nota}</span>
        )}
      </div>

      <div style={campo}>
        <span style={label}>Notas de la convocatoria (opcional)</span>
        <input style={inputCss} value={observaciones} onChange={e => setObs(e.target.value)} placeholder="Centro examinador, horario..." />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={creando}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={creando}>{creando ? 'Creando...' : 'Crear convocatoria'}</button>
      </div>
    </form>
  );
}

// ── Panel para evaluar a un participante ────────────────────────────────────
function EvaluarParticipante({ participante: p, actividad, onGuardar, onCerrar, guardando }) {
  const niveles = actividad?.niveles || [];
  const baremo = actividad?.baremo || null;
  const [puntos, setPuntos] = useState(p.puntos ?? '');
  const [puntosMax, setPuntosMax] = useState(p.puntosMax ?? 100);
  const [resultado, setResultado] = useState(p.resultado || '');
  const [resultadoTocado, setResultadoTocado] = useState(!!p.resultado);
  const [observaciones, setObs] = useState(p.observaciones || '');
  // Por defecto promociona al nivel siguiente al que tiene ahora.
  const siguiente = p.nivelActualOrder != null
    ? niveles.find(n => n.order === p.nivelActualOrder + 1)?.order
    : (niveles[0]?.order);
  const [nivelOrder, setNivelOrder] = useState(
    p.nivel && niveles.find(n => n.name === p.nivel) ? niveles.find(n => n.name === p.nivel).order
      : (siguiente != null ? siguiente : ''));
  const [promocionar, setPromocionar] = useState(true);

  const banda = useMemo(() => bandaDe(baremo, puntos, puntosMax), [baremo, puntos, puntosMax]);
  useEffect(() => { if (!resultadoTocado && banda) setResultado(banda.resultado); }, [banda, resultadoTocado]);

  const apto = resultadoTocado
    ? (banda ? banda.apto : (resultado.toLowerCase().includes('no apto') ? false : resultado ? true : null))
    : (banda ? banda.apto : null);
  const nivelSel = niveles.find(n => n.order === Number(nivelOrder)) || null;

  function guardar() {
    onGuardar({
      puntos: puntos === '' ? null : Number(puntos),
      puntosMax: Number(puntosMax) || 100,
      resultado: resultado.trim() || null,
      apto,
      nivel: nivelSel?.name || (p.nivel || null),
      nivelOrder: nivelOrder === '' ? null : Number(nivelOrder),
      promocionar: apto === true && promocionar,
      observaciones: observaciones.trim() || null,
    });
  }

  return (
    <div style={{ display: 'grid', gap: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginTop: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: 12, alignItems: 'end' }}>
        <div style={campo}>
          <span style={label}>Puntos</span>
          <input style={inputCss} type="number" step="0.01" value={puntos}
            onChange={e => { setPuntos(e.target.value); setResultadoTocado(false); }} placeholder="—" />
        </div>
        <div style={campo}>
          <span style={label}>Sobre</span>
          <input style={inputCss} type="number" step="1" value={puntosMax} onChange={e => setPuntosMax(e.target.value)} />
        </div>
        <div style={campo}>
          <span style={label}>Resultado {banda && !resultadoTocado && <em style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· sugerido</em>}</span>
          <input style={inputCss} value={resultado}
            onChange={e => { setResultado(e.target.value); setResultadoTocado(true); }}
            placeholder="Apto / No apto / Distinción..." />
        </div>
      </div>
      {baremo && (
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: -6 }}>
          Baremo: {baremo.bandas.map(b => `${b.min}+ ${b.resultado}`).join(' · ')}
        </div>
      )}

      {niveles.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={campo}>
            <span style={label}>Rango / título que obtiene</span>
            <select style={{ ...inputCss, maxWidth: 320 }} value={nivelOrder} onChange={e => setNivelOrder(e.target.value)}>
              <option value="">Sin cambio</option>
              {niveles.map(n => <option key={n.order} value={n.order}>{n.name}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', opacity: nivelSel ? 1 : .5 }}>
            <input type="checkbox" checked={promocionar} disabled={!nivelSel} onChange={e => setPromocionar(e.target.checked)} style={{ accentColor: 'var(--teal)' }} />
            Si aprueba, promocionarle a {nivelSel ? <Insignia nivel={nivelSel} /> : '—'} en {actividad?.name}
          </label>
        </div>
      )}

      <div style={campo}>
        <span style={label}>Observaciones (se envían a la familia)</span>
        <textarea style={{ ...inputCss, minHeight: 56, resize: 'vertical' }} value={observaciones} onChange={e => setObs(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-sm btn-outline" onClick={onCerrar} disabled={guardando}>Cerrar</button>
        <button className="btn btn-sm btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar evaluación'}</button>
      </div>
    </div>
  );
}

function ParticipanteFila({ p, actividad, abierto, onAbrir, onGuardar, onComunicar, onQuitar, guardando, comunicando }) {
  const [conf, setConf] = useState(false);
  const nivelActual = actividad?.niveles?.find(n => n.order === p.nivelActualOrder) || null;
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--bg-1)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{p.alumnoNombre}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {nivelActual ? <>Ahora: <Insignia nivel={nivelActual} /></> : 'Sin rango previo'}
            {p.matriculaModo === 'cobrada' && <span>· matrícula {p.cargoId ? `${p.matriculaImporte ? eur(p.matriculaImporte) : ''} (cargo generado)` : 'sin cobrar'}</span>}
          </div>
        </div>
        <Resultado apto={p.apto} resultado={p.resultado} />
        {p.apto === true && (
          p.comunicadoEnviado
            ? <span title={`Avisado ${fmtFecha(p.comunicadoAt)}`} style={{ fontSize: 11.5, color: 'var(--green, #16a34a)', fontWeight: 700 }}>✓ Avisado</span>
            : <button className="btn btn-sm btn-outline" disabled={comunicando} onClick={() => onComunicar(p)}>{comunicando ? 'Enviando...' : 'Avisar familia'}</button>
        )}
        <button className="btn btn-sm btn-primary" onClick={() => onAbrir(abierto ? null : p.id)}>{abierto ? 'Cerrar' : (p.apto == null ? 'Evaluar' : 'Editar')}</button>
        {conf
          ? <button className="btn btn-sm" style={{ background: 'var(--red, #dc2626)', color: '#fff' }} onClick={() => onQuitar(p)}>¿Sacar?</button>
          : <button className="icon-btn danger" title="Sacar de la convocatoria" onClick={() => setConf(true)}><I.Trash /></button>}
      </div>
      {abierto && (
        <div style={{ padding: '0 14px 14px' }}>
          <EvaluarParticipante participante={p} actividad={actividad} onGuardar={onGuardar} onCerrar={() => onAbrir(null)} guardando={guardando} />
        </div>
      )}
    </div>
  );
}

// ── Detalle de una convocatoria: participantes y evaluación ─────────────────
function ConvocatoriaDetalle({ convocatoria, opciones, onVolver, onCambio, showToast }) {
  const [participantes, setParticipantes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);      // id del participante que se está evaluando
  const [guardando, setGuardando] = useState(false);
  const [comunicando, setComunicando] = useState(null);
  const [anadiendo, setAnadiendo] = useState(false);

  const actividad = useMemo(() => opciones.find(a => a.id === convocatoria.activityId) || null, [opciones, convocatoria]);
  const aviso = useCallback((m, t) => showToast ? showToast(m, t) : alert(m), [showToast]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const d = await req(`/api/admin/convocatorias/${convocatoria.id}`);
      setParticipantes(d.participantes || []);
    } catch (e) { aviso(e.message, 'error'); }
    finally { setCargando(false); }
  }, [convocatoria.id, aviso]);
  useEffect(() => { cargar(); }, [cargar]);

  async function anadir(alumno) {
    setAnadiendo(true);
    try {
      await req(`/api/admin/convocatorias/${convocatoria.id}/participantes`, { method: 'POST', body: { alumnoId: alumno.id } });
      aviso(`${alumno.name} añadido.`, 'success');
      await cargar(); onCambio?.();
    } catch (e) { aviso(e.message, 'error'); }
    finally { setAnadiendo(false); }
  }

  async function guardarEval(id, datos) {
    setGuardando(true);
    try {
      const d = await req(`/api/admin/examenes/${id}`, { method: 'PATCH', body: datos });
      setParticipantes(xs => xs.map(x => x.id === id ? d.examen : x));
      setAbierto(null);
      aviso('Evaluación guardada.', 'success');
      onCambio?.();
    } catch (e) { aviso(e.message, 'error'); }
    finally { setGuardando(false); }
  }

  async function comunicar(p) {
    setComunicando(p.id);
    try {
      const d = await req(`/api/admin/examenes/${p.id}/comunicar`, { method: 'POST' });
      setParticipantes(xs => xs.map(x => x.id === p.id ? { ...x, comunicadoEnviado: true, comunicadoAt: d.comunicadoAt } : x));
      aviso(`Correo enviado a ${(d.emails || []).join(', ')}.`, 'success');
      onCambio?.();
    } catch (e) { aviso(e.message, 'error'); }
    finally { setComunicando(null); }
  }

  async function quitar(p) {
    try {
      await req(`/api/admin/examenes/${p.id}`, { method: 'DELETE' });
      setParticipantes(xs => xs.filter(x => x.id !== p.id));
      aviso(`${p.alumnoNombre} sacado de la convocatoria.`, 'success');
      onCambio?.();
    } catch (e) { aviso(e.message, 'error'); }
  }

  const idsDentro = participantes.map(p => p.alumnoId);
  const aprobados = participantes.filter(p => p.apto === true).length;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-outline" onClick={onVolver}>← Convocatorias</button>
        <div>
          <h2 style={{ margin: 0 }}>{convocatoria.actividad}{convocatoria.nombre ? ` · ${convocatoria.nombre}` : ''}</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            {fmtFecha(convocatoria.fecha)} · {participantes.length} participante{participantes.length !== 1 ? 's' : ''} · {aprobados} aprobado{aprobados !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 16, background: 'var(--bg-1)', display: 'grid', gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>Añadir participante</span>
        <BuscarAlumno activityId={convocatoria.activityId} excluir={idsDentro} onElegir={anadir} />
        {anadiendo && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Añadiendo...</span>}
      </div>

      {cargando
        ? <p style={{ color: 'var(--ink-3)' }}>Cargando...</p>
        : participantes.length === 0
          ? <p style={{ color: 'var(--ink-3)' }}>Todavía no hay participantes. Búscalos arriba por su usuario.</p>
          : <div style={{ display: 'grid', gap: 8 }}>
              {participantes.map(p => (
                <ParticipanteFila key={p.id} p={p} actividad={actividad}
                  abierto={abierto === p.id} onAbrir={setAbierto}
                  onGuardar={(datos) => guardarEval(p.id, datos)}
                  onComunicar={comunicar} onQuitar={quitar}
                  guardando={guardando} comunicando={comunicando === p.id} />
              ))}
            </div>}
    </div>
  );
}

// ── Pantalla principal: lista de convocatorias ──────────────────────────────
export default function AdminExamenes({ showToast }) {
  const [opciones, setOpciones] = useState([]);
  const [convocatorias, setConvocatorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nueva, setNueva] = useState(false);
  const [creando, setCreando] = useState(false);
  const [sel, setSel] = useState(null);   // convocatoria abierta

  const aviso = useCallback((m, t) => showToast ? showToast(m, t) : alert(m), [showToast]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const d = await req('/api/admin/convocatorias');
      setConvocatorias(d.convocatorias || []);
    } catch (e) { aviso(e.message, 'error'); }
    finally { setCargando(false); }
  }, [aviso]);

  useEffect(() => {
    req('/api/admin/examenes/opciones').then(d => setOpciones(d.actividades || [])).catch(() => {});
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function crear(datos) {
    setCreando(true);
    try {
      const d = await req('/api/admin/convocatorias', { method: 'POST', body: datos });
      setNueva(false);
      await cargar();
      setSel(d.convocatoria);   // abre la nueva para meterle gente
      aviso('Convocatoria creada. Ahora mete a los alumnos.', 'success');
    } catch (e) { aviso(e.message, 'error'); }
    finally { setCreando(false); }
  }

  async function borrar(c) {
    if (!window.confirm(`¿Borrar la convocatoria "${c.actividad}${c.nombre ? ` · ${c.nombre}` : ''}" con sus ${c.participantes} participante(s)?`)) return;
    try {
      await req(`/api/admin/convocatorias/${c.id}`, { method: 'DELETE' });
      setConvocatorias(xs => xs.filter(x => x.id !== c.id));
      aviso('Convocatoria borrada.', 'success');
    } catch (e) { aviso(e.message, 'error'); }
  }

  if (sel) {
    return <ConvocatoriaDetalle convocatoria={sel} opciones={opciones}
      onVolver={() => { setSel(null); cargar(); }} onCambio={cargar} showToast={showToast} />;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Títulos y exámenes</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            Crea una convocatoria, mete a los alumnos que se examinan y evalúalos uno a uno.
          </p>
        </div>
        <div style={{ flex: 1 }} />
        {!nueva && <button className="btn btn-primary" onClick={() => setNueva(true)} disabled={!opciones.length}>+ Nueva convocatoria</button>}
      </div>

      {nueva && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 18, background: 'var(--bg-1)' }}>
          <h3 style={{ margin: '0 0 14px' }}>Nueva convocatoria</h3>
          {opciones.length === 0
            ? <p style={{ color: 'var(--ink-3)' }}>No hay actividades con escala de niveles (Ballet, Inglés o Taekwon-Do).</p>
            : <NuevaConvocatoria opciones={opciones} creando={creando} onCrear={crear} onCancel={() => setNueva(false)} />}
        </div>
      )}

      {cargando
        ? <p style={{ color: 'var(--ink-3)' }}>Cargando...</p>
        : convocatorias.length === 0
          ? <p style={{ color: 'var(--ink-3)' }}>No hay convocatorias todavía.</p>
          : <div style={{ display: 'grid', gap: 8 }}>
              {convocatorias.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--bg-1)', cursor: 'pointer' }}
                  onClick={() => setSel(c)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{c.actividad}{c.nombre ? ` · ${c.nombre}` : ''}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      {fmtFecha(c.fecha)} · {c.participantes} participante{c.participantes !== 1 ? 's' : ''}
                      {c.participantes > 0 ? ` · ${c.evaluados}/${c.participantes} evaluados · ${c.aprobados} aprobados` : ''}
                      {c.avisados > 0 ? ` · ${c.avisados} avisados` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Abrir →</span>
                  <button className="icon-btn danger" title="Borrar convocatoria" onClick={e => { e.stopPropagation(); borrar(c); }}><I.Trash /></button>
                </div>
              ))}
            </div>}
    </div>
  );
}
