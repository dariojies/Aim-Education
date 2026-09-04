import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { I } from './Icons.jsx';
import { Insignia } from './FichaAlumnoClases.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Exámenes y títulos (ticket #212)
//
// Un sitio donde el club sube las calificaciones de los exámenes —Ballet (RAD),
// Inglés (Cambridge) y los cambios de cinturón de Taekwon-Do—, la nota se
// traduce sola a apto/no apto por el baremo de cada disciplina, y desde aquí se
// avisa a la familia por correo. La matrícula: en Ballet la cobramos nosotros
// (genera un cargo), en Inglés y Taekwon-Do se paga fuera y solo se anota.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => `${Number(n ?? 0).toFixed(2)} €`;

async function api(url, opts = {}) {
  const r = await fetch(`/api/admin/examenes${url}`, {
    credentials: 'include',
    cache: 'no-store',
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

const fmtFecha = (f) => f ? new Date(String(f).slice(0, 10)).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

// Pastilla verde/roja según el resultado.
function Resultado({ examen }) {
  const apto = examen.apto;
  const color = apto === true ? 'var(--green, #16a34a)' : apto === false ? 'var(--red, #dc2626)' : 'var(--ink-3)';
  const texto = examen.resultado || (apto === true ? 'Apto' : apto === false ? 'No apto' : '—');
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800,
      color: '#fff', background: color, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>
      {apto === true ? '✓' : apto === false ? '✕' : ''} {texto}
    </span>
  );
}

// Buscador de alumno: escribe y elige de la lista. Habla con el mismo endpoint
// que usan las clases para matricular.
function BuscarAlumno({ onElegir, activityId }) {
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
        if (vivo) setSug(d.students || []);
      } catch { /* noop */ }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, activityId]);
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

const campo = { display: 'grid', gap: 5 };
const label = { fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' };

// El formulario de alta/edición. Sirve para los dos: si llega `inicial`, edita.
function FormExamen({ opciones, inicial, onGuardar, onCancelar, guardando }) {
  const editando = !!inicial?.id;
  const [alumno, setAlumno] = useState(inicial ? { id: inicial.alumnoId, name: inicial.alumnoNombre, email: inicial.alumnoEmail } : null);
  const [activityId, setActividad] = useState(inicial?.activityId || (opciones[0]?.id || ''));
  const [fecha, setFecha] = useState(inicial?.fecha ? String(inicial.fecha).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [convocatoria, setConvocatoria] = useState(inicial?.convocatoria || '');
  const [nivelOrder, setNivelOrder] = useState(inicial?.nivelOrder ?? '');
  const [nivelTexto, setNivelTexto] = useState(inicial?.nivel || '');
  const [puntos, setPuntos] = useState(inicial?.puntos ?? '');
  const [puntosMax, setPuntosMax] = useState(inicial?.puntosMax ?? 100);
  const [resultado, setResultado] = useState(inicial?.resultado || '');
  const [resultadoTocado, setResultadoTocado] = useState(!!inicial?.resultado);
  const [observaciones, setObservaciones] = useState(inicial?.observaciones || '');
  const [cobrarMatricula, setCobrar] = useState(inicial ? !!inicial.cargoId : true);
  const [matriculaImporte, setImporte] = useState(inicial?.matriculaImporte ?? '');
  const [promocionar, setPromocionar] = useState(false);

  const act = useMemo(() => opciones.find(a => a.id === activityId) || null, [opciones, activityId]);
  const niveles = act?.niveles || [];
  const baremo = act?.baremo || null;
  const matricula = act?.matricula || { modo: 'externa', nota: '' };

  // El nivel elegido pone su nombre como "nivel" del título de forma automática.
  useEffect(() => {
    if (nivelOrder === '' ) return;
    const n = niveles.find(x => x.order === Number(nivelOrder));
    if (n) setNivelTexto(n.name);
  }, [nivelOrder, niveles]);

  // El resultado se sugiere solo desde la nota y el baremo, mientras no se
  // escriba a mano. Es orientativo: los "shields" de Inglés no son apto/suspenso.
  const sugerido = useMemo(() => {
    if (!baremo || puntos === '' || puntos == null) return null;
    const max = Number(puntosMax) || baremo.max || 100;
    const sobre100 = max !== 100 ? (Number(puntos) / max) * 100 : Number(puntos);
    const banda = baremo.bandas.find(x => sobre100 >= x.min);
    return banda || null;
  }, [baremo, puntos, puntosMax]);

  useEffect(() => {
    if (!resultadoTocado && sugerido) setResultado(sugerido.resultado);
  }, [sugerido, resultadoTocado]);

  const nivelActual = niveles.find(n => n.order === Number(nivelOrder)) || null;

  function enviar(e) {
    e.preventDefault();
    if (!alumno) { alert('Elige un alumno.'); return; }
    const apto = resultadoTocado
      ? (sugerido ? sugerido.apto : (resultado.toLowerCase().includes('no apto') ? false : true))
      : (sugerido ? sugerido.apto : null);
    onGuardar({
      alumnoId: alumno.id, activityId, fecha,
      convocatoria: convocatoria.trim() || null,
      nivel: nivelTexto.trim() || null,
      nivelOrder: nivelOrder === '' ? null : Number(nivelOrder),
      puntos: puntos === '' ? null : Number(puntos),
      puntosMax: Number(puntosMax) || 100,
      resultado: resultado.trim() || null,
      apto,
      observaciones: observaciones.trim() || null,
      cobrarMatricula: matricula.modo === 'cobrada' && cobrarMatricula,
      matriculaImporte: matriculaImporte === '' ? null : Number(matriculaImporte),
      promocionar: apto === true && promocionar,
    });
  }

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 14 }}>
      <div style={campo}>
        <span style={label}>Alumno</span>
        {alumno
          ? <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <b style={{ fontSize: 14 }}>{alumno.name}</b>
              <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{alumno.email}</span>
              {!editando && <button type="button" className="btn btn-sm btn-outline" onClick={() => setAlumno(null)}>Cambiar</button>}
            </div>
          : <BuscarAlumno activityId={activityId} onElegir={setAlumno} />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={campo}>
          <span style={label}>Actividad</span>
          <select style={inputCss} value={activityId} onChange={e => { setActividad(e.target.value); setNivelOrder(''); }} disabled={editando}>
            {opciones.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div style={campo}>
          <span style={label}>Fecha</span>
          <input style={inputCss} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={campo}>
          <span style={label}>Convocatoria</span>
          <input style={inputCss} value={convocatoria} onChange={e => setConvocatoria(e.target.value)} placeholder="p. ej. Junio 2026" />
        </div>
        <div style={campo}>
          <span style={label}>Nivel / título</span>
          {niveles.length > 0
            ? <select style={inputCss} value={nivelOrder} onChange={e => setNivelOrder(e.target.value)}>
                <option value="">Sin especificar</option>
                {niveles.map(n => <option key={n.order} value={n.order}>{n.name}</option>)}
              </select>
            : <input style={inputCss} value={nivelTexto} onChange={e => setNivelTexto(e.target.value)} />}
        </div>
      </div>

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
          <span style={label}>Resultado {sugerido && !resultadoTocado && <em style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· sugerido</em>}</span>
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

      <div style={campo}>
        <span style={label}>Observaciones</span>
        <textarea style={{ ...inputCss, minHeight: 60, resize: 'vertical' }} value={observaciones}
          onChange={e => setObservaciones(e.target.value)} placeholder="Comentarios que verá la familia en el correo (opcional)." />
      </div>

      {/* Matrícula: distinta en cada disciplina, tal y como pide el ticket. */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, display: 'grid', gap: 8, background: 'var(--bg-2)' }}>
        <span style={{ ...label, textTransform: 'uppercase', letterSpacing: '.05em' }}>Matrícula</span>
        {matricula.modo === 'cobrada' ? (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={cobrarMatricula} onChange={e => setCobrar(e.target.checked)} style={{ accentColor: 'var(--teal)' }} />
              Generar el cargo de la matrícula a la familia
            </label>
            {cobrarMatricula && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13 }}>Importe:</span>
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

      {nivelActual && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={promocionar} onChange={e => setPromocionar(e.target.checked)} style={{ accentColor: 'var(--teal)' }} />
          Si aprueba, subir su rango a <Insignia nivel={nivelActual} /> en {act?.name}
        </label>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-outline" onClick={onCancelar} disabled={guardando}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : (editando ? 'Guardar cambios' : 'Registrar examen')}</button>
      </div>
    </form>
  );
}

function FilaExamen({ examen, onEditar, onBorrar, onComunicar, comunicando }) {
  const [conf, setConf] = useState(false);
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1.4fr 1fr auto auto auto', gap: 12, alignItems: 'center',
      padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--bg-1)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{examen.alumnoNombre}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {examen.actividad}{examen.nivel ? ` · ${examen.nivel}` : ''}{examen.convocatoria ? ` · ${examen.convocatoria}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Resultado examen={examen} />
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          {examen.puntos != null ? `${examen.puntos}${examen.puntosMax ? `/${examen.puntosMax}` : ''} · ` : ''}{fmtFecha(examen.fecha)}
        </span>
      </div>
      <div style={{ fontSize: 11.5, textAlign: 'center', minWidth: 90 }}>
        {examen.matriculaModo === 'cobrada'
          ? <span style={{ color: examen.matriculaEstado === 'pagada' || (examen.cargoId ? false : false) ? 'var(--green)' : 'var(--ink-3)' }}>
              Matrícula {examen.cargoId ? '· cargo generado' : '· sin cobrar'}
              {examen.matriculaImporte ? ` (${eur(examen.matriculaImporte)})` : ''}
            </span>
          : <span style={{ color: 'var(--ink-3)' }}>{examen.matriculaModo === 'club' ? 'Cuota al club' : 'Pago externo'}</span>}
      </div>
      <div style={{ textAlign: 'center' }}>
        {examen.comunicadoEnviado
          ? <span title={`Enviado ${fmtFecha(examen.comunicadoAt)}`} style={{ fontSize: 11.5, color: 'var(--green, #16a34a)', fontWeight: 700 }}>✓ Avisado</span>
          : <button className="btn btn-sm btn-outline" disabled={comunicando} onClick={() => onComunicar(examen)}>
              {comunicando ? 'Enviando...' : 'Avisar familia'}
            </button>}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="icon-btn" title="Editar" onClick={() => onEditar(examen)}><I.Edit /></button>
        {conf
          ? <button className="btn btn-sm" style={{ background: 'var(--red, #dc2626)', color: '#fff' }} onClick={() => onBorrar(examen)}>¿Seguro?</button>
          : <button className="icon-btn danger" title="Borrar" onClick={() => setConf(true)}><I.Trash /></button>}
      </div>
    </div>
  );
}

export default function AdminExamenes({ showToast }) {
  const [opciones, setOpciones] = useState([]);
  const [examenes, setExamenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroAct, setFiltroAct] = useState('');
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState(null);        // null | {} nuevo | examen para editar
  const [guardando, setGuardando] = useState(false);
  const [comunicando, setComunicando] = useState(null);

  const aviso = useCallback((msg, tipo) => showToast ? showToast(msg, tipo) : alert(msg), [showToast]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const q = filtroAct ? `?actividad=${filtroAct}` : '';
      const d = await api(q);
      setExamenes(d.examenes || []);
    } catch (e) { aviso(e.message, 'error'); }
    finally { setCargando(false); }
  }, [filtroAct, aviso]);

  useEffect(() => {
    api('/opciones').then(d => setOpciones(d.actividades || [])).catch(() => {});
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return examenes;
    return examenes.filter(e => e.alumnoNombre.toLowerCase().includes(q));
  }, [examenes, busca]);

  async function guardar(datos) {
    setGuardando(true);
    try {
      if (form?.id) {
        await api(`/${form.id}`, { method: 'PATCH', body: datos });
        aviso('Examen actualizado.', 'success');
      } else {
        await api('', { method: 'POST', body: datos });
        aviso('Examen registrado.', 'success');
      }
      setForm(null);
      await cargar();
    } catch (e) { aviso(e.message, 'error'); }
    finally { setGuardando(false); }
  }

  async function borrar(examen) {
    try {
      await api(`/${examen.id}`, { method: 'DELETE' });
      setExamenes(xs => xs.filter(x => x.id !== examen.id));
      aviso('Examen borrado.', 'success');
    } catch (e) { aviso(e.message, 'error'); }
  }

  async function comunicar(examen) {
    setComunicando(examen.id);
    try {
      const d = await api(`/${examen.id}/comunicar`, { method: 'POST' });
      setExamenes(xs => xs.map(x => x.id === examen.id ? { ...x, comunicadoEnviado: true, comunicadoAt: d.comunicadoAt } : x));
      aviso(`Correo enviado a ${d.email}.`, 'success');
    } catch (e) { aviso(e.message, 'error'); }
    finally { setComunicando(null); }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Títulos y exámenes</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            Calificaciones de Ballet, Inglés y cambios de cinturón. Al guardar puedes avisar a la familia.
          </p>
        </div>
        <div style={{ flex: 1 }} />
        {!form && <button className="btn btn-primary" onClick={() => setForm({})}>+ Nuevo examen</button>}
      </div>

      {form && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 18, background: 'var(--bg-1)' }}>
          <h3 style={{ margin: '0 0 14px' }}>{form.id ? 'Editar examen' : 'Nuevo examen'}</h3>
          {opciones.length === 0
            ? <p style={{ color: 'var(--ink-3)' }}>No hay actividades con escala de niveles (Ballet, Inglés o Taekwon-Do).</p>
            : <FormExamen opciones={opciones} inicial={form.id ? form : null} guardando={guardando}
                onGuardar={guardar} onCancelar={() => setForm(null)} />}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...inputCss, width: 'auto' }} value={filtroAct} onChange={e => setFiltroAct(e.target.value)}>
          <option value="">Todas las actividades</option>
          {opciones.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input style={{ ...inputCss, width: 'auto', flex: 1, minWidth: 180 }} value={busca}
          onChange={e => setBusca(e.target.value)} placeholder="Buscar por alumno..." />
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{filtrados.length} examen{filtrados.length !== 1 ? 'es' : ''}</span>
      </div>

      {cargando
        ? <p style={{ color: 'var(--ink-3)' }}>Cargando...</p>
        : filtrados.length === 0
          ? <p style={{ color: 'var(--ink-3)' }}>Todavía no hay exámenes registrados.</p>
          : <div style={{ display: 'grid', gap: 8 }}>
              {filtrados.map(e => (
                <FilaExamen key={e.id} examen={e} comunicando={comunicando === e.id}
                  onEditar={setForm} onBorrar={borrar} onComunicar={comunicar} />
              ))}
            </div>}
    </div>
  );
}
