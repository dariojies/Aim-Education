import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';
import { useRouter } from '../App.jsx';
import { incrustarVideo, TIPO_LECCION, Texto, mb } from './Aula.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Aula virtual, la gestión (ticket #433): los cursos con su temario (temas y
// lecciones de texto, vídeo, archivo o tarea), quién está apuntado y las tareas
// por corregir. Un profe ve y lleva solo los cursos de los que es profesor; el
// precio y los accesos, solo secretaría y la dirección.
// ─────────────────────────────────────────────────────────────────────────────

const inp = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' };
const etiqueta = { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', display: 'grid', gap: 4 };
const tarjeta = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtHora = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const euros = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;

async function api(url, { method = 'GET', body, raw, tipo } = {}) {
  const r = await fetch(url, {
    method, credentials: 'include', cache: 'no-store',
    headers: raw ? { 'Content-Type': tipo || 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : undefined,
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido hacer.');
  return d;
}

// Sube un archivo por trozos (como los guarda el servidor). Si un trozo falla,
// lo reintenta antes de rendirse.
export async function subirAlAula(cursoId, file, onProgreso) {
  const ini = await api(`/api/admin/aula/cursos/${cursoId}/archivos`, { method: 'POST', body: { nombre: file.name, mime: tipoDe(file), bytes: file.size } });
  for (let n = 0; n < ini.trozos; n++) {
    const parte = file.slice(n * ini.trozo, Math.min(file.size, (n + 1) * ini.trozo));
    let intento = 0;
    for (;;) {
      try { await api(`/api/admin/aula/archivos/${ini.id}/trozos/${n}`, { method: 'PUT', raw: parte }); break; }
      catch (e) { if (++intento >= 3) throw e; await new Promise(ok => setTimeout(ok, 1500 * intento)); }
    }
    onProgreso?.(Math.round(100 * (n + 1) / ini.trozos));
  }
  return ini.id;
}
// Algunos navegadores (el iPad con .mov, Windows con .docx) no dan el tipo.
function tipoDe(file) {
  if (file.type) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return ({ mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
    txt: 'text/plain', zip: 'application/zip', mp3: 'audio/mpeg', m4a: 'audio/mp4' })[ext] || 'application/octet-stream';
}

// La portada, a JPG de 1600 px como mucho (las fotos del móvil pesan mucho).
async function portadaJpg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('No se puede leer esa imagen.')); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    if (!b) throw new Error('No se ha podido preparar la imagen.');
    return b;
  } finally { URL.revokeObjectURL(url); }
}

function Espacio({ e }) {
  if (!e) return null;
  const pct = Math.min(100, Math.round(100 * e.usado / e.tope));
  return (
    <div title="Lo que ocupan los vídeos y archivos subidos al aula. Los vídeos por enlace (YouTube, Vimeo) no ocupan nada."
      style={{ display: 'grid', gap: 4, minWidth: 200, fontSize: 12, color: 'var(--ink-3)' }}>
      <span>Espacio del aula: <b style={{ color: pct > 85 ? 'var(--orange)' : 'var(--ink-2)' }}>{mb(e.usado)} de {mb(e.tope)}</b></span>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct > 85 ? 'var(--orange)' : 'var(--teal)' }} />
      </div>
    </div>
  );
}

export default function AdminAula({ showToast }) {
  const { path } = useRouter();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(null);       // id del curso en edición
  const [nuevo, setNuevo] = useState(null);
  const [pestana, setPestana] = useState(() => (/[?&]corregir=1/.test(path || window.location.search) ? 'corregir' : 'cursos'));

  const cargar = useCallback(() => {
    api('/api/admin/aula').then(d => { setDatos(d); setError(''); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (/[?&]corregir=1/.test(path || '')) { setPestana('corregir'); setAbierto(null); } }, [path]);

  if (abierto) return <EditorCurso id={abierto} showToast={showToast} espacio={datos?.espacio} onCerrar={() => { setAbierto(null); cargar(); }} />;

  const porCorregir = datos?.cursos.reduce((s, c) => s + c.porCorregir, 0) || 0;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="seg" style={{ display: 'flex', gap: 4, background: 'var(--bg-3)', padding: 4, borderRadius: 999 }}>
          {[['cursos', 'Cursos'], ['corregir', `Por corregir${porCorregir ? ` · ${porCorregir}` : ''}`]].map(([id, t]) => (
            <button key={id} type="button" onClick={() => setPestana(id)} className={`btn btn-sm ${pestana === id ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 999 }}>{t}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <Espacio e={datos?.espacio} />
        <a className="btn btn-sm btn-outline" href="/aula" target="_blank" rel="noreferrer"><I.Eye /> Ver el aula</a>
        {pestana === 'cursos' && <button type="button" className="btn btn-sm btn-primary" onClick={() => setNuevo({ titulo: '', resumen: '', precio: '', ivaPct: 21 })}><I.Plus /> Nuevo curso</button>}
      </div>
      {error && <p style={{ color: 'var(--pink)' }}>{error}</p>}
      {!datos && !error && <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>}

      {pestana === 'corregir' && datos && <Entregas showToast={showToast} pendientesDeEntrada onCambio={cargar} />}

      {pestana === 'cursos' && datos && (datos.cursos.length === 0 ? (
        <div style={{ ...tarjeta, borderStyle: 'dashed', textAlign: 'center', color: 'var(--ink-3)', padding: 32 }}>
          <p style={{ margin: '0 0 6px', fontWeight: 800, color: 'var(--ink-2)' }}>Todavía no hay cursos</p>
          <p style={{ margin: 0, fontSize: 14 }}>Crea el primero: ponle temas y lecciones (texto, vídeos, archivos y tareas) y publícalo cuando esté listo.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {datos.cursos.map(c => (
            <button key={c.id} type="button" onClick={() => setAbierto(c.id)}
              style={{ ...tarjeta, padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'grid' }}>
              <div style={{ aspectRatio: '16 / 7', background: c.portada ? `center / cover no-repeat url(${c.portada})` : 'linear-gradient(135deg, var(--purple), var(--teal))' }} />
              <div style={{ padding: 14, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className={`pill ${c.publicado ? 'teal' : ''}`} style={pastilla(c.publicado ? 'var(--teal)' : 'var(--ink-3)')}>{c.publicado ? 'Publicado' : 'Borrador'}</span>
                  <span style={pastilla(c.gratis ? 'var(--purple)' : 'var(--orange)')}>{c.gratis ? 'Gratis' : euros(c.precio)}</span>
                  {c.porCorregir > 0 && <span style={pastilla('var(--pink)')}>{c.porCorregir} por corregir</span>}
                </div>
                <b style={{ fontSize: 15 }}>{c.titulo}</b>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {c.lecciones} {c.lecciones === 1 ? 'lección' : 'lecciones'} · {c.alumnos} {c.alumnos === 1 ? 'alumno' : 'alumnos'}{c.porPagar ? ` · ${c.porPagar} por pagar` : ''}{c.profesor ? ` · ${c.profesor}` : ''}
                </span>
              </div>
            </button>
          ))}
        </div>
      ))}

      {nuevo && (
        <Ventana titulo="Nuevo curso" onCerrar={() => setNuevo(null)}>
          <form style={{ display: 'grid', gap: 12 }} onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await api('/api/admin/aula/cursos', { method: 'POST', body: nuevo });
              setNuevo(null); showToast?.('Curso creado. Ahora ponle el temario.'); setAbierto(r.id);
            } catch (err) { alert(err.message); }
          }}>
            <label style={etiqueta}>Título<input required autoFocus value={nuevo.titulo} onChange={e => setNuevo(x => ({ ...x, titulo: e.target.value }))} style={inp} placeholder="p. ej. Inglés para viajar" /></label>
            <label style={etiqueta}>Resumen (una frase, sale en el catálogo)<input value={nuevo.resumen} onChange={e => setNuevo(x => ({ ...x, resumen: e.target.value }))} style={inp} maxLength={400} /></label>
            {datos?.completa && <Precio valor={nuevo} cambiar={(k, v) => setNuevo(x => ({ ...x, [k]: v }))} />}
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Se crea sin publicar: nadie lo ve hasta que lo publiques.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setNuevo(null)}>Cancelar</button>
              <button type="submit" className="btn btn-sm btn-primary">Crear</button>
            </div>
          </form>
        </Ventana>
      )}
    </div>
  );
}

const pastilla = (color) => ({ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, color, background: `color-mix(in oklab, ${color} 13%, var(--bg-2))` });

function Ventana({ titulo, onCerrar, children, ancho = 520 }) {
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 16 }} onClick={onCerrar}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={titulo}
        style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 14, width: `min(${ancho}px, 100%)`, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, flex: 1 }}>{titulo}</h3>
          <button type="button" className="icon-btn" onClick={onCerrar} aria-label="Cerrar"><I.X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// La formación online lleva siempre el 21 % de IVA (#440): no se elige.
const IVA_AULA = 21;
function Precio({ valor, cambiar }) {
  const p = Number(String(valor.precio || '').replace(',', '.')) || 0;
  const total = p * (1 + IVA_AULA / 100);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label style={{ ...etiqueta, maxWidth: 260 }}>Precio sin IVA (vacío = gratis)
        <input inputMode="decimal" value={valor.precio ?? ''} onChange={e => cambiar('precio', e.target.value)} style={inp} placeholder="0,00" />
      </label>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        {p > 0 ? <>Con el 21 % de IVA (la formación online siempre lo lleva), pagará <b>{euros(total)}</b>. Se cobra con tarjeta o Bizum al apuntarse, o en secretaría, y sale su factura como cualquier cobro.</> : 'Gratis: se apunta y entra al momento.'}
      </span>
    </div>
  );
}

// ═══════════════════════ Un curso ═══════════════════════

function EditorCurso({ id, showToast, espacio, onCerrar }) {
  const [c, setC] = useState(null);
  const [pestana, setPestana] = useState('temario');
  const [error, setError] = useState('');
  const cargar = useCallback(() => { api(`/api/admin/aula/cursos/${id}`).then(setC).catch(e => setError(e.message)); }, [id]);
  useEffect(() => { cargar(); }, [cargar]);
  if (error) return <div style={{ display: 'grid', gap: 10 }}><p style={{ color: 'var(--pink)' }}>{error}</p><button className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={onCerrar}>Volver</button></div>;
  if (!c) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  const porCorregir = c.temas.reduce((s, t) => s + t.lecciones.reduce((k, l) => k + (l.porCorregir || 0), 0), 0);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>← Cursos</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, flex: 1, minWidth: 200 }}>{c.titulo}</h2>
        <span style={pastilla(c.publicado ? 'var(--teal)' : 'var(--ink-3)')}>{c.publicado ? 'Publicado' : 'Borrador'}</span>
        <a className="btn btn-sm btn-outline" href={`/aula/${c.id}/curso`} target="_blank" rel="noreferrer"><I.Eye /> Verlo como alumno</a>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
        {[['temario', 'Temario'], ['datos', 'Datos y precio'], ['alumnos', 'Alumnos'], ['entregas', `Entregas${porCorregir ? ` · ${porCorregir}` : ''}`]].map(([k, t]) => (
          <button key={k} type="button" onClick={() => setPestana(k)}
            style={{ font: 'inherit', fontSize: 14, fontWeight: 800, padding: '8px 14px', background: 'none', border: 0, cursor: 'pointer',
              color: pestana === k ? 'var(--purple)' : 'var(--ink-3)', borderBottom: `2px solid ${pestana === k ? 'var(--purple)' : 'transparent'}`, marginBottom: -1 }}>{t}</button>
        ))}
      </div>
      {pestana === 'temario' && <Temario c={c} recargar={cargar} showToast={showToast} espacio={espacio} />}
      {pestana === 'datos' && <DatosCurso c={c} recargar={cargar} showToast={showToast} onBorrado={onCerrar} />}
      {pestana === 'alumnos' && <Alumnos cursoId={c.id} showToast={showToast} />}
      {pestana === 'entregas' && <><Entregas cursoId={c.id} showToast={showToast} onCambio={cargar} /><Resultados cursoId={c.id} /></>}
    </div>
  );
}

function DatosCurso({ c, recargar, showToast, onBorrado }) {
  const [f, setF] = useState({ titulo: c.titulo, resumen: c.resumen || '', descripcion: c.descripcion || '', publicado: c.publicado,
    profesorId: c.profesorId || '', precio: c.precio ? String(c.precio).replace('.', ',') : '', ivaPct: c.ivaPct ?? 21 });
  const [profes, setProfes] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  useEffect(() => { if (c.completa) api('/api/admin/aula/profesores').then(setProfes).catch(() => {}); }, [c.completa]);
  const cambiar = (k, v) => setF(x => ({ ...x, [k]: v }));
  const lecciones = c.temas.reduce((s, t) => s + t.lecciones.length, 0);

  async function guardar(e) {
    e.preventDefault();
    if (f.publicado && !c.publicado && !lecciones && !window.confirm('El curso no tiene ninguna lección todavía. ¿Publicarlo igualmente?')) return;
    setGuardando(true);
    try { await api(`/api/admin/aula/cursos/${c.id}`, { method: 'PUT', body: f }); showToast?.('Curso guardado.'); recargar(); }
    catch (err) { alert(err.message); } finally { setGuardando(false); }
  }
  async function portada(file) {
    if (!file) return;
    setSubiendo(true);
    try { await api(`/api/admin/aula/cursos/${c.id}/portada`, { method: 'PUT', raw: await portadaJpg(file), tipo: 'image/jpeg' }); recargar(); }
    catch (err) { alert(err.message); } finally { setSubiendo(false); }
  }
  async function borrar() {
    if (!window.confirm(`¿Borrar el curso «${c.titulo}» con todo su temario? No se puede deshacer.`)) return;
    try { await api(`/api/admin/aula/cursos/${c.id}`, { method: 'DELETE' }); showToast?.('Curso borrado.'); onBorrado(); }
    catch (err) { alert(err.message); }
  }

  return (
    <form onSubmit={guardar} style={{ ...tarjeta, display: 'grid', gap: 14, maxWidth: 760 }}>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 800, fontSize: 14, padding: 12, borderRadius: 12,
        background: f.publicado ? 'color-mix(in oklab, var(--teal) 12%, var(--bg-2))' : 'var(--bg-3)' }}>
        <input type="checkbox" checked={f.publicado} onChange={e => cambiar('publicado', e.target.checked)} style={{ width: 18, height: 18 }} />
        {f.publicado ? 'Publicado: sale en /aula y la gente se puede apuntar' : 'Sin publicar: solo lo ve el personal'}
      </label>
      <label style={etiqueta}>Título<input required value={f.titulo} onChange={e => cambiar('titulo', e.target.value)} style={inp} /></label>
      <label style={etiqueta}>Resumen (una frase para el catálogo)<input value={f.resumen} onChange={e => cambiar('resumen', e.target.value)} style={inp} maxLength={400} /></label>
      <label style={etiqueta}>Descripción (qué se aprende, a quién va dirigido…)
        <textarea rows={6} value={f.descripcion} onChange={e => cambiar('descripcion', e.target.value)} style={{ ...inp, resize: 'vertical' }} />
      </label>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 200, aspectRatio: '16 / 7', borderRadius: 10, border: '1px solid var(--line)',
          background: c.portada ? `center / cover no-repeat url(${c.portada})` : 'linear-gradient(135deg, var(--purple), var(--teal))' }} />
        <label className="btn btn-sm btn-outline" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
          {subiendo ? 'Subiendo…' : c.portada ? 'Cambiar la portada' : 'Poner portada'}
          <input type="file" accept="image/*" disabled={subiendo} onChange={e => { portada(e.target.files?.[0]); e.target.value = ''; }}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
        </label>
        {c.portada && <button type="button" className="btn btn-sm btn-ghost" onClick={async () => { await api(`/api/admin/aula/cursos/${c.id}/portada`, { method: 'PUT', raw: new Blob([]) }).catch(e => alert(e.message)); recargar(); }}>Quitarla</button>}
      </div>
      {c.completa ? (
        <>
          <label style={etiqueta}>Profesor (lleva el curso y corrige las tareas)
            <select value={f.profesorId} onChange={e => cambiar('profesorId', e.target.value)} style={inp}>
              <option value="">— Sin profesor —</option>
              {profes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              {f.profesorId && !profes.some(p => p.id === f.profesorId) && <option value={f.profesorId}>{c.profesor || 'El actual'}</option>}
            </select>
          </label>
          <Precio valor={f} cambiar={cambiar} />
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>
          {c.total ? `Precio: ${euros(c.total)}.` : 'Curso gratis.'} El precio lo pone secretaría o la dirección.
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--pink)' }} onClick={borrar}><I.Trash /> Borrar curso</button>
      </div>
    </form>
  );
}

// ── Temario ──
function Temario({ c, recargar, showToast, espacio }) {
  const [leccion, setLeccion] = useState(null);   // { temaId, l? }
  const temas = c.temas;

  // Se manda el orden completo: así subir, bajar y cambiar de tema son lo mismo.
  async function ordenar(nuevos) {
    try { await api(`/api/admin/aula/cursos/${c.id}/orden`, { method: 'PUT', body: { temas: nuevos.map(t => ({ id: t.id, lecciones: t.lecciones.map(l => l.id) })) } }); recargar(); }
    catch (err) { alert(err.message); }
  }
  const mover = (lista, i, d) => { const x = [...lista]; const j = i + d; if (j < 0 || j >= x.length) return x; [x[i], x[j]] = [x[j], x[i]]; return x; };
  const moverTema = (i, d) => ordenar(mover(temas, i, d));
  const moverLeccion = (ti, li, d) => {
    const t = temas[ti];
    if ((li + d < 0 && ti > 0) || (li + d >= t.lecciones.length && ti < temas.length - 1)) {
      // Fuera de su tema: pasa al final del anterior o al principio del siguiente.
      const otro = ti + (d < 0 ? -1 : 1);
      return ordenar(temas.map((x, k) => k === ti ? { ...x, lecciones: x.lecciones.filter((_, n) => n !== li) }
        : k === otro ? { ...x, lecciones: d < 0 ? [...x.lecciones, t.lecciones[li]] : [t.lecciones[li], ...x.lecciones] } : x));
    }
    return ordenar(temas.map((x, k) => (k === ti ? { ...x, lecciones: mover(x.lecciones, li, d) } : x)));
  };
  async function nuevoTema() {
    const titulo = window.prompt('Título del tema:', `Tema ${temas.length + 1}`);
    if (!titulo?.trim()) return;
    try { await api(`/api/admin/aula/cursos/${c.id}/temas`, { method: 'POST', body: { titulo } }); recargar(); } catch (err) { alert(err.message); }
  }
  async function renombrar(t, titulo) {
    if (!titulo.trim() || titulo === t.titulo) return;
    try { await api(`/api/admin/aula/temas/${t.id}`, { method: 'PUT', body: { titulo } }); recargar(); } catch (err) { alert(err.message); }
  }
  async function borrarTema(t) {
    if (!window.confirm(`¿Quitar el tema «${t.titulo}»?`)) return;
    try { await api(`/api/admin/aula/temas/${t.id}`, { method: 'DELETE' }); recargar(); } catch (err) { alert(err.message); }
  }
  async function borrarLeccion(l) {
    if (!window.confirm(`¿Quitar la lección «${l.titulo}»?`)) return;
    try { await api(`/api/admin/aula/lecciones/${l.id}`, { method: 'DELETE' }); }
    catch (err) {
      if (!/entrega/.test(err.message) || !window.confirm(`${err.message} ¿Borrarla igualmente?`)) { if (!/entrega/.test(err.message)) alert(err.message); return; }
      try { await api(`/api/admin/aula/lecciones/${l.id}?confirmar=1`, { method: 'DELETE' }); } catch (e2) { alert(e2.message); return; }
    }
    showToast?.('Lección quitada.'); recargar();
  }

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 900 }}>
      {temas.map((t, ti) => (
        <div key={t.id} style={{ ...tarjeta, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--purple)' }}>{ti + 1}.</span>
            <input key={`${t.id}:${t.titulo}`} defaultValue={t.titulo} aria-label="Título del tema" onBlur={e => renombrar(t, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              style={{ ...inp, flex: 1, fontWeight: 800, background: 'transparent', border: '1px solid transparent' }}
              onFocus={e => { e.target.style.borderColor = 'var(--line)'; }} />
            <button type="button" className="icon-btn" disabled={ti === 0} onClick={() => moverTema(ti, -1)} aria-label="Subir tema">↑</button>
            <button type="button" className="icon-btn" disabled={ti === temas.length - 1} onClick={() => moverTema(ti, 1)} aria-label="Bajar tema">↓</button>
            <button type="button" className="icon-btn danger" onClick={() => borrarTema(t)} aria-label="Quitar tema"><I.Trash /></button>
          </div>
          {t.lecciones.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Sin lecciones todavía.</p>}
          {t.lecciones.map((l, li) => (
            <div key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: 'var(--bg-3)' }}>
              <span title={TIPO_LECCION[l.tipo].nombre} style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{TIPO_LECCION[l.tipo].icono}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{l.titulo}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {TIPO_LECCION[l.tipo].nombre}
                  {l.tipo === 'video' && (l.videoUrl ? ' · por enlace' : l.archivo ? ` · subido (${mb(l.archivo.bytes)})` : '')}
                  {l.tipo === 'archivo' && l.archivo ? ` · ${l.archivo.nombre} (${mb(l.archivo.bytes)})` : ''}
                  {l.tipo === 'tarea' && ` · ${l.calificacion === 'nota' ? 'con nota' : 'apto / no apto'}`}
                  {l.tipo === 'cuestionario' && ` · ${l.modo === 'evaluable' ? `evaluable${l.intentos ? `, ${l.intentos} ${l.intentos === 1 ? 'intento' : 'intentos'}` : ''}` : 'de práctica'} · ${l.preguntas} ${l.preguntas === 1 ? 'pregunta' : 'preguntas'}`}
                  {l.gratis && <b style={{ color: 'var(--teal)' }}> · 🔓 gratis</b>}
                  {l.porCorregir > 0 && <b style={{ color: 'var(--pink)' }}> · {l.porCorregir} por corregir</b>}
                </div>
              </div>
              <button type="button" className="icon-btn" disabled={ti === 0 && li === 0} onClick={() => moverLeccion(ti, li, -1)} aria-label="Subir lección">↑</button>
              <button type="button" className="icon-btn" disabled={ti === temas.length - 1 && li === t.lecciones.length - 1} onClick={() => moverLeccion(ti, li, 1)} aria-label="Bajar lección">↓</button>
              <button type="button" className="icon-btn" onClick={() => setLeccion({ temaId: t.id, l })} aria-label="Editar lección"><I.Edit /></button>
              <button type="button" className="icon-btn danger" onClick={() => borrarLeccion(l)} aria-label="Quitar lección"><I.Trash /></button>
            </div>
          ))}
          <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={() => setLeccion({ temaId: t.id })}><I.Plus /> Añadir lección</button>
        </div>
      ))}
      <button type="button" className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }} onClick={nuevoTema}><I.Plus /> Añadir tema</button>
      {leccion && <EditorLeccion cursoId={c.id} temaId={leccion.temaId} l={leccion.l} espacio={espacio}
        onCerrar={() => setLeccion(null)} onGuardado={() => { setLeccion(null); showToast?.('Lección guardada.'); recargar(); }} />}
    </div>
  );
}

function EditorLeccion({ cursoId, temaId, l, espacio, onCerrar, onGuardado }) {
  const [f, setF] = useState({ tipo: l?.tipo || 'texto', titulo: l?.titulo || '', texto: l?.texto || '', videoUrl: l?.videoUrl || '',
    calificacion: l?.calificacion || 'apto', archivoId: l?.archivo?.id || null, archivo: l?.archivo || null,
    modo: l?.modo || 'practica', intentos: l?.intentos ?? '', gratis: !!l?.gratis });
  // Las preguntas de un cuestionario (#439): las que ya tiene, al editarlo.
  const [preguntas, setPreguntas] = useState(l?.tipo === 'cuestionario' ? null : []);
  useEffect(() => {
    if (l?.tipo !== 'cuestionario') return;
    api(`/api/admin/aula/lecciones/${l.id}/preguntas`).then(d => setPreguntas(d.preguntas.map(conCuatro))).catch(e => { alert(e.message); setPreguntas([]); });
  }, [l?.id, l?.tipo]);
  const [modoVideo, setModoVideo] = useState(l?.archivo && !l?.videoUrl ? 'subido' : 'enlace');
  const [subida, setSubida] = useState(null);      // { nombre, pct }
  const [guardando, setGuardando] = useState(false);
  const cambiar = (k, v) => setF(x => ({ ...x, [k]: v }));
  const embed = f.tipo === 'video' && modoVideo === 'enlace' && f.videoUrl ? incrustarVideo(f.videoUrl) : null;
  const esVideo = f.tipo === 'video';

  async function subir(file) {
    if (!file) return;
    const max = esVideo ? espacio?.maxVideo : espacio?.maxArchivo;
    if (max && file.size > max) { alert(esVideo ? 'El vídeo pasa de 100 MB. Súbelo a YouTube (como «oculto») o a Vimeo y pega aquí el enlace.' : 'El archivo pasa de 10 MB.'); return; }
    setSubida({ nombre: file.name, pct: 0 });
    try {
      const id = await subirAlAula(cursoId, file, pct => setSubida({ nombre: file.name, pct }));
      setF(x => ({ ...x, archivoId: id, archivo: { id, nombre: file.name, bytes: file.size } }));
    } catch (err) { alert(err.message); }
    finally { setSubida(null); }
  }
  async function guardar(e) {
    e.preventDefault();
    if (subida) return;
    // Por enlace no lleva archivo; el texto, nunca.
    const porEnlace = esVideo && modoVideo === 'enlace';
    const body = { ...f, videoUrl: porEnlace ? f.videoUrl : '', archivoId: porEnlace || f.tipo === 'texto' || f.tipo === 'cuestionario' ? null : f.archivoId };
    if (porEnlace && !embed) { alert('Pega el enlace de un vídeo de YouTube o de Vimeo.'); return; }
    if (f.tipo === 'cuestionario') {
      if (!preguntas?.length) { alert('Pon al menos una pregunta.'); return; }
      body.preguntas = preguntas.map(p => ({ ...p, imagen: p.imagen || null }));
      body.intentos = f.modo === 'evaluable' && f.intentos ? Number(f.intentos) : null;
    }
    setGuardando(true);
    try {
      if (l) await api(`/api/admin/aula/lecciones/${l.id}`, { method: 'PUT', body });
      else await api(`/api/admin/aula/temas/${temaId}/lecciones`, { method: 'POST', body });
      onGuardado();
    } catch (err) { alert(err.message); } finally { setGuardando(false); }
  }

  return (
    <Ventana titulo={l ? 'Editar lección' : 'Nueva lección'} onCerrar={() => { if (!subida) onCerrar(); }} ancho={f.tipo === 'cuestionario' ? 840 : 640}>
      <form onSubmit={guardar} style={{ display: 'grid', gap: 12 }}>
        {!l && (
          <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
            {Object.entries(TIPO_LECCION).map(([k, t]) => (
              <button key={k} type="button" onClick={() => cambiar('tipo', k)}
                style={{ font: 'inherit', cursor: 'pointer', padding: '10px 8px', borderRadius: 12, display: 'grid', gap: 2, justifyItems: 'center',
                  border: `2px solid ${f.tipo === k ? 'var(--purple)' : 'var(--line)'}`, background: f.tipo === k ? 'color-mix(in oklab, var(--purple) 10%, var(--bg-2))' : 'var(--bg-3)', color: 'var(--ink)' }}>
                <span style={{ fontSize: 22 }}>{t.icono}</span><b style={{ fontSize: 13 }}>{t.nombre}</b>
              </button>
            ))}
          </div>
        )}
        <label style={etiqueta}>Título<input required autoFocus value={f.titulo} onChange={e => cambiar('titulo', e.target.value)} style={inp} /></label>

        {esVideo && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['enlace', 'Enlace de YouTube o Vimeo'], ['subido', 'Subirlo aquí']].map(([k, t]) => (
                <button key={k} type="button" className={`btn btn-sm ${modoVideo === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => setModoVideo(k)}>{t}</button>
              ))}
            </div>
            {modoVideo === 'enlace' ? (
              <>
                <input value={f.videoUrl} onChange={e => cambiar('videoUrl', e.target.value)} style={inp} placeholder="https://www.youtube.com/watch?v=…  o  https://vimeo.com/…" />
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Consejo: en YouTube, súbelo como «Oculto»: solo lo ve quien tiene el enlace, y aquí solo lo tienen los apuntados.</span>
                {embed && <div style={{ aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
                  <iframe src={embed} title="Vista previa" style={{ width: '100%', height: '100%', border: 0 }} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
                </div>}
                {f.videoUrl && !embed && <span style={{ fontSize: 12, color: 'var(--pink)' }}>Ese enlace no es de un vídeo de YouTube o Vimeo.</span>}
              </>
            ) : (
              <Subida f={f} subida={subida} subir={subir} accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                ayuda={`MP4 o MOV, hasta 100 MB. Ocupa espacio del aula (${espacio ? `${mb(espacio.usado)} de ${mb(espacio.tope)} usados` : ''}): si es largo, mejor por enlace.`} />
            )}
          </div>
        )}
        {f.tipo === 'archivo' && <Subida f={f} subida={subida} subir={subir} accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.mp3,.m4a,image/*"
          ayuda="PDF, Word, PowerPoint, Excel, imágenes o audio, hasta 10 MB." />}

        <label style={etiqueta}>
          {f.tipo === 'texto' ? 'Contenido' : f.tipo === 'tarea' ? 'Enunciado: qué tienen que hacer y entregar' : f.tipo === 'cuestionario' ? 'Instrucciones (opcional)' : 'Texto que acompaña (opcional)'}
          <textarea rows={f.tipo === 'texto' ? 12 : f.tipo === 'cuestionario' ? 2 : 6} value={f.texto} onChange={e => cambiar('texto', e.target.value)} style={{ ...inp, resize: 'vertical' }}
            required={f.tipo === 'texto' || f.tipo === 'tarea'} />
          <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>Los saltos de línea se respetan y los enlaces (https://…) se pueden pulsar.</span>
        </label>

        {f.tipo === 'tarea' && (
          <>
            <label style={etiqueta}>Cómo se corrige
              <select value={f.calificacion} onChange={e => cambiar('calificacion', e.target.value)} style={inp}>
                <option value="apto">Apto / no apto</option><option value="nota">Con nota (de 0 a 10)</option>
              </select>
            </label>
            <Subida f={f} subida={subida} subir={subir} opcional accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,image/*"
              ayuda="Opcional: una ficha o plantilla para que la descarguen (hasta 10 MB)." quitar={() => setF(x => ({ ...x, archivoId: null, archivo: null }))} />
          </>
        )}

        {f.tipo === 'cuestionario' && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ ...etiqueta, flex: 2, minWidth: 220 }}>Cómo es
                <select value={f.modo} onChange={e => cambiar('modo', e.target.value)} style={inp}>
                  <option value="practica">De práctica: una a una, se corrige al momento y se repite</option>
                  <option value="evaluable">Evaluable: se entrega entero y saca nota sobre 10</option>
                </select>
              </label>
              {f.modo === 'evaluable' && (
                <label style={{ ...etiqueta, flex: 1, minWidth: 160 }}>Intentos
                  <select value={f.intentos} onChange={e => cambiar('intentos', e.target.value)} style={inp}>
                    <option value="">Sin límite (cuenta la mejor)</option>
                    {[1, 2, 3, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? 'intento' : 'intentos'}</option>)}
                  </select>
                </label>
              )}
            </div>
            {preguntas == null ? <p style={{ color: 'var(--ink-3)' }}>Cargando las preguntas…</p>
              : <EditorPreguntas preguntas={preguntas} setPreguntas={setPreguntas} cursoId={cursoId} />}
          </>
        )}

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, padding: '10px 12px', borderRadius: 10, background: f.gratis ? 'color-mix(in oklab, var(--teal) 10%, var(--bg-2))' : 'var(--bg-3)', cursor: 'pointer' }}>
          <input type="checkbox" checked={f.gratis} onChange={e => cambiar('gratis', e.target.checked)} style={{ marginTop: 2 }} />
          <span><b>🔓 Gratis (vista previa)</b><br /><span style={{ color: 'var(--ink-3)' }}>En un curso de pago, esta lección la puede ver cualquiera con cuenta sin pagar; las demás salen con candado y el botón de comprar.</span></span>
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-sm btn-outline" disabled={!!subida} onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-sm btn-primary" disabled={guardando || !!subida}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Ventana>
  );
}

function Subida({ f, subida, subir, accept, ayuda, opcional, quitar }) {
  return (
    <div style={{ display: 'grid', gap: 6, padding: 12, borderRadius: 12, border: '1px dashed var(--line)', background: 'var(--bg-3)' }}>
      {subida ? (
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13 }}>Subiendo «{subida.nombre}»… {subida.pct} %</span>
          <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-2)', overflow: 'hidden' }}><div style={{ width: `${subida.pct}%`, height: '100%', background: 'var(--purple)', transition: 'width .3s' }} /></div>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>No cierres esta ventana hasta que termine.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {f.archivo && <span style={{ fontSize: 13, fontWeight: 700 }}>📎 {f.archivo.nombre}{f.archivo.bytes ? ` (${mb(f.archivo.bytes)})` : ''}</span>}
          <label className="btn btn-sm btn-outline" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
            {f.archivo ? 'Cambiar' : opcional ? 'Adjuntar archivo' : 'Elegir archivo'}
            <input type="file" accept={accept} onChange={e => { subir(e.target.files?.[0]); e.target.value = ''; }}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          </label>
          {f.archivo && quitar && <button type="button" className="btn btn-sm btn-ghost" onClick={quitar}>Quitar</button>}
        </div>
      )}
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{ayuda}</span>
    </div>
  );
}

// ── Alumnos ──
function Alumnos({ cursoId, showToast }) {
  const [d, setD] = useState(null);
  const [buscar, setBuscar] = useState(false);
  const cargar = useCallback(() => { api(`/api/admin/aula/cursos/${cursoId}/alumnos`).then(setD).catch(e => alert(e.message)); }, [cursoId]);
  useEffect(() => { cargar(); }, [cargar]);
  async function estado(a, nuevo) {
    if (nuevo === 'baja' && !window.confirm(`¿Quitarle el acceso a ${a.nombre}?`)) return;
    try { await api(`/api/admin/aula/inscripciones/${a.id}`, { method: 'PUT', body: { estado: nuevo } }); showToast?.(nuevo === 'baja' ? 'Acceso quitado.' : 'Acceso dado.'); cargar(); }
    catch (err) { alert(err.message); }
  }
  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  const ESTADO = { dentro: ['Dentro', 'var(--teal)'], por_pagar: ['Falta pagar', 'var(--orange)'], baja: ['Sin acceso', 'var(--ink-3)'] };
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 900 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-3)', flex: 1 }}>
          {d.alumnos.filter(a => a.estado === 'dentro').length} dentro{d.alumnos.some(a => a.estado === 'por_pagar') ? ` · ${d.alumnos.filter(a => a.estado === 'por_pagar').length} por pagar (entran solos al cobrarles el cargo, por internet o en secretaría)` : ''}
        </span>
        {d.completa && <button type="button" className="btn btn-sm btn-primary" onClick={() => setBuscar(true)}><I.Plus /> Dar acceso a alguien</button>}
      </div>
      {d.alumnos.length === 0 ? <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Nadie apuntado todavía.</p> : (
        <div className="data-table">
          <div className="data-table-head" style={{ gridTemplateColumns: '1.6fr 110px 1fr 1fr 130px' }}>
            <span>Alumno</span><span>Estado</span><span>Progreso</span><span>Última actividad</span><span></span>
          </div>
          {d.alumnos.map(a => (
            <div key={a.id} className="data-table-row" style={{ gridTemplateColumns: '1.6fr 110px 1fr 1fr 130px', alignItems: 'center', opacity: a.estado === 'baja' ? 0.6 : 1 }}>
              <div><div className="pri">{a.nombre}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{a.email || ''}{a.origen === 'secretaria' ? ' · acceso dado en el club' : ''} · desde {fmt(a.desde)}</div></div>
              <span><span style={pastilla(ESTADO[a.estado][1])}>{ESTADO[a.estado][0]}</span></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden', maxWidth: 120 }}><span style={{ display: 'block', width: `${a.progreso}%`, height: '100%', background: 'var(--teal)' }} /></span>
                <span style={{ fontSize: 12, fontWeight: 800 }}>{a.progreso} %</span>
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{a.ultima ? fmtHora(a.ultima) : '—'}</span>
              <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {d.completa && (a.estado === 'baja' || a.estado === 'por_pagar'
                  ? <button type="button" className="btn btn-sm btn-outline" style={{ fontSize: 11 }} onClick={() => estado(a, 'activa')}>{a.estado === 'por_pagar' ? 'Dar acceso' : 'Volver a dar'}</button>
                  : <button type="button" className="btn btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={() => estado(a, 'baja')}>Quitar acceso</button>)}
              </span>
            </div>
          ))}
        </div>
      )}
      {buscar && <DarAcceso cursoId={cursoId} onCerrar={() => setBuscar(false)} onHecho={() => { setBuscar(false); showToast?.('Acceso dado.'); cargar(); }} />}
    </div>
  );
}

function DarAcceso({ cursoId, onCerrar, onHecho }) {
  const [q, setQ] = useState('');
  const [gente, setGente] = useState([]);
  useEffect(() => {
    if (q.trim().length < 3) { setGente([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/personas/existentes?q=${encodeURIComponent(q.trim())}`, { credentials: 'include', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : [])).then(d => setGente(Array.isArray(d) ? d : [])).catch(() => setGente([]));
    }, 280);
    return () => clearTimeout(t);
  }, [q]);
  async function dar(u) {
    try { await api(`/api/admin/aula/cursos/${cursoId}/alumnos`, { method: 'POST', body: { userId: u.id } }); onHecho(); } catch (err) { alert(err.message); }
  }
  return (
    <Ventana titulo="Dar acceso al curso" onCerrar={onCerrar}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Para quien ha pagado en el club por otro lado, una beca… Entra sin pagar nada más. Tiene que tener cuenta en la web.</p>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Correo, nombre o apellidos…" style={inp} />
      <div style={{ display: 'grid', gap: 6 }}>
        {q.trim().length >= 3 && !gente.length && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Nadie con ese dato.</span>}
        {gente.map(u => (
          <div key={u.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: 'var(--bg-3)' }}>
            <div style={{ flex: 1 }}><b style={{ fontSize: 13 }}>{u.nombre}</b><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{u.email}</div></div>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => dar(u)}>Dar acceso</button>
          </div>
        ))}
      </div>
    </Ventana>
  );
}

// ── Entregas y corrección ──
// ── Cuestionarios (#439) ──
const LETRAS = ['A', 'B', 'C', 'D'];
const conCuatro = (p) => ({ ...p, opciones: [...p.opciones, '', '', '', ''].slice(0, 4), explicacion: p.explicacion || '', imagen: p.imagen || '' });
const preguntaVacia = () => ({ enunciado: '', opciones: ['', '', '', ''], correcta: 0, explicacion: '', imagen: '' });
// «Pegar varias»: 1. Pregunta / A) … / *B) … (el asterisco, la buena) / Explicación: …
export function leerPreguntas(texto) {
  const ps = [], malas = [];
  let p = null;
  const cerrar = () => { if (p) ps.push(p); p = null; };
  for (const linea of String(texto || '').replace(/\r/g, '').split('\n')) {
    const t = linea.trim();
    if (!t) continue;
    const op = t.match(/^(\*)?\s*([A-Da-d])\s*[).:-]\s*(\*)?\s*(.+?)\s*(\*)?$/);
    const ex = t.match(/^explicaci[oó]n\s*:\s*(.+)$/i);
    const num = t.match(/^(?:\d+\s*[.)-]|[-•])\s*(.+)$/);
    if (op && p) {
      const k = 'abcd'.indexOf(op[2].toLowerCase());
      p.opciones[k] = op[4];
      if (op[1] || op[3] || op[5]) p.correcta = k;
    } else if (ex && p) p.explicacion = ex[1];
    else if (num || !p || p.opciones.some(Boolean)) { cerrar(); p = { ...preguntaVacia(), correcta: -1, enunciado: num ? num[1] : t }; }
    else p.enunciado += ` ${t}`;
  }
  cerrar();
  ps.forEach((q, i) => { if (q.correcta < 0 || q.opciones.filter(Boolean).length < 2) malas.push(i + 1); });
  return { preguntas: ps.map(q => ({ ...q, correcta: Math.max(0, q.correcta) })), malas };
}

function EditorPreguntas({ preguntas, setPreguntas, cursoId }) {
  const [pegar, setPegar] = useState(null);
  const [ld, setLd] = useState(null);
  const [subiendo, setSubiendo] = useState(null);
  const cambiar = (i, k, v) => setPreguntas(ps => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const opcion = (i, k, v) => setPreguntas(ps => ps.map((p, j) => (j === i ? { ...p, opciones: p.opciones.map((o, n) => (n === k ? v : o)) } : p)));
  const mover = (i, d) => setPreguntas(ps => { const x = [...ps]; const j = i + d; if (j < 0 || j >= x.length) return ps; [x[i], x[j]] = [x[j], x[i]]; return x; });

  async function imagen(i, file) {
    if (!file) return;
    setSubiendo(i);
    try { const id = await subirAlAula(cursoId, file); cambiar(i, 'imagen', `/api/aula/archivos/${id}`); }
    catch (err) { alert(err.message); } finally { setSubiendo(null); }
  }
  function anadirPegadas() {
    const r = leerPreguntas(pegar);
    if (!r.preguntas.length) { alert('No he encontrado preguntas en ese texto.'); return; }
    if (r.malas.length && !window.confirm(`En ${r.malas.length === 1 ? 'la pregunta' : 'las preguntas'} ${r.malas.join(', ')} no está marcada la buena (con *) o faltan respuestas: se añaden igual y lo arreglas aquí. ¿Seguir?`)) return;
    setPreguntas(ps => [...ps, ...r.preguntas]); setPegar(null);
  }
  async function traerLd() {
    setLd(x => ({ ...x, cargando: true }));
    try {
      const d = await api(`/api/admin/aula/learning-dungeon?nivel=${ld.nivel}&tipo=${ld.tipo}&sentido=${ld.sentido}&n=${ld.n}`);
      if (!d.preguntas.length) { alert(d.disponibles ? 'No hay bastantes palabras para hacer preguntas con esas opciones.' : 'No hay vocabulario de Learning Dungeon con esas opciones.'); setLd(x => ({ ...x, cargando: false })); return; }
      setPreguntas(ps => [...ps, ...d.preguntas.map(conCuatro)]); setLd(null);
    } catch (err) { alert(err.message); setLd(x => ({ ...x, cargando: false })); }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <b style={{ fontSize: 14 }}>Preguntas ({preguntas.length})</b>
      {preguntas.map((p, i) => (
        <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'grid', gap: 8, background: 'var(--bg-3)' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <b style={{ fontSize: 13, color: 'var(--purple)', flex: 1 }}>Pregunta {i + 1}</b>
            <button type="button" className="icon-btn" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir pregunta">↑</button>
            <button type="button" className="icon-btn" disabled={i === preguntas.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar pregunta">↓</button>
            <button type="button" className="icon-btn danger" onClick={() => setPreguntas(ps => ps.filter((_, j) => j !== i))} aria-label="Quitar pregunta"><I.Trash /></button>
          </div>
          <textarea rows={2} value={p.enunciado} onChange={e => cambiar(i, 'enunciado', e.target.value)} placeholder="¿Cuál es…?" style={{ ...inp, resize: 'vertical' }} aria-label={`Enunciado de la pregunta ${i + 1}`} />
          {p.opciones.map((o, k) => (
            <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="radio" name={`buena-${i}`} checked={p.correcta === k} onChange={() => cambiar(i, 'correcta', k)} aria-label={`La ${LETRAS[k]} es la buena`} />
              <b style={{ width: 18 }}>{LETRAS[k]}</b>
              <input value={o} onChange={e => opcion(i, k, e.target.value)} placeholder={k < 2 ? 'Respuesta' : 'Respuesta (opcional)'} style={{ ...inp, flex: 1, padding: '7px 10px', borderColor: p.correcta === k ? 'var(--teal)' : 'var(--line)' }} />
            </label>
          ))}
          <input value={p.explicacion} onChange={e => cambiar(i, 'explicacion', e.target.value)} placeholder="Explicación de la respuesta (opcional): sale al corregir" style={{ ...inp, padding: '7px 10px' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {p.imagen && <img src={p.imagen} alt="" style={{ height: 48, borderRadius: 8 }} />}
            <label className="btn btn-sm btn-ghost" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
              {subiendo === i ? 'Subiendo…' : p.imagen ? 'Cambiar imagen' : '🖼️ Imagen (opcional)'}
              <input type="file" accept="image/*" disabled={subiendo != null} onChange={e => { imagen(i, e.target.files?.[0]); e.target.value = ''; }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
            </label>
            {p.imagen && <button type="button" className="btn btn-sm btn-ghost" onClick={() => cambiar(i, 'imagen', '')}>Quitar imagen</button>}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setPreguntas(ps => [...ps, preguntaVacia()])}><I.Plus /> Añadir pregunta</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setPegar('')}>📋 Pegar varias</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setLd({ nivel: 99, tipo: 'texto', sentido: 'significado', n: 10 })}>🐉 Desde Learning Dungeon</button>
      </div>
      {pegar != null && (
        <div style={{ display: 'grid', gap: 6, padding: 12, borderRadius: 12, border: '1px dashed var(--line)' }}>
          <b style={{ fontSize: 13 }}>Pega las preguntas</b>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Una pregunta numerada y debajo sus respuestas con A), B), C) y D); la buena, con un asterisco. «Explicación:» es opcional.</span>
          <textarea rows={8} value={pegar} onChange={e => setPegar(e.target.value)} style={{ ...inp, fontFamily: 'monospace', fontSize: 13 }}
            placeholder={'1. ¿Qué significa «Charyot»?\nA) Saludo\n*B) Atención\nC) Preparados\nExplicación: Charyot es la voz de atención.\n\n2. ¿Cuántos principios tiene el Taekwon-Do?\nA) Tres\n*B) Cinco\nC) Siete'} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm btn-primary" onClick={anadirPegadas}>Añadir</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPegar(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {ld && (
        <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, border: '1px dashed var(--line)' }}>
          <b style={{ fontSize: 13 }}>Preguntas con el vocabulario de Learning Dungeon</b>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Se hacen con las palabras del juego (término y significado), con tres respuestas falsas de otras palabras. Se añaden aquí para que las revises antes de guardar.</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ ...etiqueta, flex: 1, minWidth: 150 }}>Nivel (cinturón) hasta
              <select value={ld.nivel} onChange={e => setLd(x => ({ ...x, nivel: Number(e.target.value) }))} style={inp}>
                <option value={99}>Todos</option>{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label style={{ ...etiqueta, flex: 1, minWidth: 150 }}>Con
              <select value={ld.tipo} onChange={e => setLd(x => ({ ...x, tipo: e.target.value }))} style={inp}>
                <option value="texto">Palabras</option><option value="imagen">Imágenes (técnicas)</option>
              </select>
            </label>
            {ld.tipo === 'texto' && (
              <label style={{ ...etiqueta, flex: 1, minWidth: 170 }}>Pregunta por
                <select value={ld.sentido} onChange={e => setLd(x => ({ ...x, sentido: e.target.value }))} style={inp}>
                  <option value="significado">El significado</option><option value="termino">El término</option><option value="mixto">De las dos formas</option>
                </select>
              </label>
            )}
            <label style={{ ...etiqueta, width: 110 }}>Cuántas
              <input type="number" min={1} max={50} value={ld.n} onChange={e => setLd(x => ({ ...x, n: e.target.value }))} style={inp} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={ld.cargando} onClick={traerLd}>{ld.cargando ? 'Haciendo…' : 'Añadir preguntas'}</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLd(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Las notas de los cuestionarios del curso, por alumno.
function Resultados({ cursoId }) {
  const [lista, setLista] = useState(null);
  useEffect(() => { api(`/api/admin/aula/cursos/${cursoId}/resultados`).then(setLista).catch(() => setLista([])); }, [cursoId]);
  if (!lista?.length) return null;
  const nota = (n) => String(Math.round(Number(n) * 100) / 100).replace('.', ',');
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 900, marginTop: 18 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>Cuestionarios</h3>
      <div className="data-table">
        <div className="data-table-head" style={{ gridTemplateColumns: '1.4fr 1.2fr 90px 90px 90px 1fr' }}>
          <span>Cuestionario</span><span>Alumno</span><span>Intentos</span><span>Mejor</span><span>Última</span><span>Cuándo</span>
        </div>
        {lista.map((r, i) => (
          <div key={i} className="data-table-row" style={{ gridTemplateColumns: '1.4fr 1.2fr 90px 90px 90px 1fr', alignItems: 'center' }}>
            <span><b>{r.titulo}</b><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{r.modo === 'evaluable' ? 'Evaluable' : 'De práctica'}</div></span>
            <span>{r.alumno}</span>
            <span>{r.intentos}{r.max_intentos ? ` de ${r.max_intentos}` : ''}</span>
            <span style={{ fontWeight: 800, color: r.mejor >= 5 ? 'var(--teal)' : 'var(--pink)' }}>{nota(r.mejor)}</span>
            <span>{nota(r.ultima_nota)}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtHora(r.ultimo)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Entregas({ cursoId, showToast, pendientesDeEntrada = true, onCambio }) {
  const [solo, setSolo] = useState(pendientesDeEntrada);
  const [lista, setLista] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const cargar = useCallback(() => {
    const p = new URLSearchParams(); if (cursoId) p.set('curso', cursoId); if (solo) p.set('pendientes', '1');
    api(`/api/admin/aula/entregas?${p}`).then(setLista).catch(e => alert(e.message));
  }, [cursoId, solo]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!lista) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 900 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
        <input type="checkbox" checked={solo} onChange={e => setSolo(e.target.checked)} /> Solo las que faltan por corregir
      </label>
      {lista.length === 0 && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{solo ? 'No hay nada por corregir. 🎉' : 'Todavía no hay entregas.'}</p>}
      {lista.map(e => (
        <div key={e.id} style={{ ...tarjeta, padding: 12, display: 'grid', gap: 10 }}>
          <button type="button" onClick={() => setAbierta(a => (a === e.id ? null : e.id))}
            style={{ font: 'inherit', color: 'inherit', background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <b style={{ fontSize: 14 }}>{e.alumno}</b> <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>· {e.leccion}{cursoId ? '' : ` · ${e.curso}`}</span>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Entregada el {fmtHora(e.entregada_at)}</div>
            </div>
            {e.corregida_at
              ? <span style={pastilla(e.apto ? 'var(--teal)' : 'var(--orange)')}>{e.nota != null ? `${String(Number(e.nota)).replace('.', ',')} / 10` : e.apto ? 'Apto' : 'No apto'}</span>
              : <span style={pastilla('var(--pink)')}>Por corregir</span>}
            <I.Chevron style={{ transform: abierta === e.id ? 'rotate(180deg)' : 'none' }} />
          </button>
          {abierta === e.id && <Corregir e={e} onHecho={() => { setAbierta(null); showToast?.('Corrección guardada. Le llega el aviso.'); cargar(); onCambio?.(); }} />}
        </div>
      ))}
    </div>
  );
}

function Corregir({ e, onHecho }) {
  const [nota, setNota] = useState(e.nota != null ? String(Number(e.nota)).replace('.', ',') : '');
  const [apto, setApto] = useState(e.apto);
  const [comentario, setComentario] = useState(e.comentario || '');
  const [guardando, setGuardando] = useState(false);
  async function guardar(ev) {
    ev.preventDefault();
    setGuardando(true);
    try { await api(`/api/admin/aula/entregas/${e.id}`, { method: 'PUT', body: e.calificacion === 'nota' ? { nota, comentario } : { apto, comentario } }); onHecho(); }
    catch (err) { alert(err.message); } finally { setGuardando(false); }
  }
  return (
    <form onSubmit={guardar} style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
      {e.texto ? <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-3)', fontSize: 14 }}><Texto texto={e.texto} /></div>
        : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Sin texto.</span>}
      {e.archivo && <a className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} href={e.archivo}><I.Download /> {e.archivo_nombre || 'Archivo entregado'}</a>}
      {e.calificacion === 'nota' ? (
        <label style={{ ...etiqueta, maxWidth: 160 }}>Nota (0 a 10)<input required inputMode="decimal" value={nota} onChange={x => setNota(x.target.value)} style={inp} /></label>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={`btn btn-sm ${apto === true ? 'btn-primary' : 'btn-outline'}`} onClick={() => setApto(true)}>Apto</button>
          <button type="button" className={`btn btn-sm ${apto === false ? 'btn-primary' : 'btn-outline'}`} onClick={() => setApto(false)}>No apto</button>
        </div>
      )}
      <label style={etiqueta}>Comentario para el alumno<textarea rows={3} value={comentario} onChange={x => setComentario(x.target.value)} style={{ ...inp, resize: 'vertical' }} /></label>
      <button type="submit" className="btn btn-sm btn-primary" style={{ justifySelf: 'start' }} disabled={guardando || (e.calificacion !== 'nota' && apto == null)}>{guardando ? 'Guardando…' : e.corregida_at ? 'Cambiar la corrección' : 'Guardar corrección'}</button>
    </form>
  );
}
