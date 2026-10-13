import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Publicaciones en redes (ticket #410), dentro de Comunicación: nuestro propio
// «Metricool». Se escribe una publicación para Facebook y/o Instagram (texto,
// fotos, carrusel, vídeo, reel o historia), se ve cómo queda en cada red y se
// publica ya o se programa. El calendario enseña lo programado, lo publicado y
// lo que falló (se puede arrastrar a otro día), y las estadísticas, los
// seguidores y cómo van las últimas publicaciones de cada red.
//
// Las fotos se pasan a JPG en el navegador (lo que pide Instagram), a 2048 px
// como mucho y, si van a Instagram, con bandas blancas si se salen de las
// proporciones que admite (de 4:5 a 1,91:1).
// ─────────────────────────────────────────────────────────────────────────────

const RED = {
  facebook: { nombre: 'Facebook', color: '#1877F2', letra: 'f' },
  instagram: { nombre: 'Instagram', color: '#D6249F', letra: 'IG' },
};
const TIPO = { post: 'Publicación', reel: 'Reel', story: 'Historia' };
const ESTADO = {
  borrador: { t: 'Borrador', c: 'var(--ink-3)' },
  programada: { t: 'Programada', c: 'var(--purple)' },
  publicando: { t: 'Publicando…', c: '#B45309' },
  publicada: { t: 'Publicada', c: 'var(--teal)' },
  parcial: { t: 'Publicada a medias', c: '#B45309' },
  error: { t: 'Con error', c: 'var(--orange)' },
};
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', boxSizing: 'border-box' };
const caja = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'grid', gap: 12 };
const suave = { fontSize: 12, color: 'var(--ink-3)' };
const ZONA = 'Europe/Madrid';
const fmtFechaHora = (v) => (v ? new Date(v).toLocaleString('es-ES', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const fmtHora = (v) => (v ? new Date(v).toLocaleTimeString('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' }) : '');
const diaDe = (v) => new Date(v).toLocaleDateString('sv-SE', { timeZone: ZONA });
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('es-ES'));
// Para <input type="datetime-local">: la hora local del navegador.
const aLocal = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}
// Subir un archivo tal cual (con su progreso, que un vídeo tarda).
function subir(url, blob, onProgreso) {
  return new Promise((ok, ko) => {
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.withCredentials = true;
    x.setRequestHeader('Content-Type', blob.type);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgreso?.(e.loaded / e.total); };
    x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch { /* sin cuerpo */ } (x.status < 300 ? ok(d) : ko(new Error(d.error || `Error ${x.status}`))); };
    x.onerror = () => ko(new Error('Se ha cortado la subida.'));
    x.send(blob);
  });
}

// Una foto del ordenador o del móvil → JPG listo para Instagram.
async function prepararFoto(file, paraInstagram) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error(`No se puede leer «${file.name}».`)); i.src = url; });
    let w = img.naturalWidth, h = img.naturalHeight;
    const k = Math.min(1, 2048 / Math.max(w, h));
    w = Math.round(w * k); h = Math.round(h * k);
    // Instagram admite de 4:5 (vertical) a 1,91:1 (apaisada): si se sale, bandas blancas.
    let W = w, H = h;
    if (paraInstagram) { if (w / h < 0.8) W = Math.round(h * 0.8); else if (w / h > 1.91) H = Math.round(w / 1.91); }
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.drawImage(img, Math.round((W - w) / 2), Math.round((H - h) / 2), w, h);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    const t = document.createElement('canvas'); const kt = 360 / Math.max(W, H); t.width = Math.round(W * kt); t.height = Math.round(H * kt);
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    const mini = await new Promise(r => t.toBlob(r, 'image/jpeg', 0.8));
    return { blob, mini, ancho: W, alto: H, bandas: W !== w || H !== h };
  } finally { URL.revokeObjectURL(url); }
}
// Un vídeo: sus medidas y un fotograma para la miniatura.
async function prepararVideo(file) {
  const tipo = file.type === 'video/quicktime' ? 'video/quicktime' : file.type === 'video/mp4' ? 'video/mp4' : null;
  if (!tipo) throw new Error(`«${file.name}»: el vídeo tiene que ser MP4 o MOV.`);
  if (file.size > 100 * 1024 * 1024) throw new Error(`«${file.name}» pasa de 100 MB.`);
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = url;
    await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = () => ko(new Error(`No se puede leer «${file.name}».`)); });
    v.currentTime = Math.min(1, (v.duration || 2) / 2);
    await new Promise(ok => { v.onseeked = ok; setTimeout(ok, 1500); });
    const c = document.createElement('canvas'); const k = 360 / Math.max(v.videoWidth || 360, v.videoHeight || 360);
    c.width = Math.round((v.videoWidth || 360) * k); c.height = Math.round((v.videoHeight || 640) * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const mini = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    return { blob: new Blob([file], { type: tipo }), mini, ancho: v.videoWidth, alto: v.videoHeight, duracion: v.duration };
  } finally { URL.revokeObjectURL(url); }
}

const miniUrl = (m) => m.local || `/api/admin/publicaciones/medios/${m.id}/miniatura`;
function Marca({ red, tam = 18 }) {
  const r = RED[red];
  return <span title={r.nombre} style={{ display: 'inline-grid', placeItems: 'center', width: tam, height: tam, borderRadius: 5, background: r.color, color: '#fff', fontSize: tam * 0.5, fontWeight: 900, flex: 'none' }}>{r.letra}</span>;
}

export default function AdminPublicaciones({ showToast }) {
  const [cuenta, setCuenta] = useState(null);
  const [vista, setVista] = useState('calendario');
  const [lista, setLista] = useState(null);
  const [editando, setEditando] = useState(null);   // publicación (o {} para una nueva)
  const cargar = useCallback(async () => {
    try { setLista((await api('/api/admin/publicaciones')).publicaciones || []); } catch (e) { showToast?.(e.message); setLista([]); }
  }, [showToast]);
  useEffect(() => { cargar(); api('/api/admin/publicaciones/cuenta').then(setCuenta).catch(() => setCuenta({ conectado: false, motivo: 'No se ha podido comprobar la conexión con Meta.' })); }, [cargar]);
  // Mientras algo se está publicando, se mira cada pocos segundos cómo va.
  const enCurso = (lista || []).some(p => p.estado === 'publicando');
  useEffect(() => { if (!enCurso) return undefined; const t = setInterval(cargar, 4000); return () => clearInterval(t); }, [enCurso, cargar]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Conexion cuenta={cuenta} onRecargar={() => api('/api/admin/publicaciones/cuenta?forzar=1').then(setCuenta).catch(() => {})} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['calendario', 'Calendario'], ['lista', 'Lista'], ['estadisticas', 'Estadísticas']].map(([v, l]) => (
          <button key={v} className={`filter-pill ${vista === v ? 'is-active' : ''}`} onClick={() => setVista(v)} style={{ borderRadius: 8, padding: '8px 16px' }}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => setEditando({})}><I.Plus width={15} height={15} /> Nueva publicación</button>
      </div>
      {vista === 'calendario' && <Calendario lista={lista} onAbrir={setEditando} onNueva={(dia) => setEditando({ dia })} onMovida={cargar} showToast={showToast} />}
      {vista === 'lista' && <Lista lista={lista} onAbrir={setEditando} onCambio={cargar} showToast={showToast} />}
      {vista === 'estadisticas' && <Estadisticas />}
      {editando && (
        <Editor inicial={editando} cuenta={cuenta} showToast={showToast}
          onCerrar={(cambio) => { setEditando(null); if (cambio) cargar(); }} />
      )}
    </div>
  );
}

function Conexion({ cuenta, onRecargar }) {
  if (!cuenta) return <p style={suave}>Comprobando la conexión con Facebook e Instagram…</p>;
  if (!cuenta.conectado) {
    return (
      <div style={{ ...caja, borderColor: 'color-mix(in oklab, var(--orange) 40%, var(--line))' }}>
        <b style={{ color: 'var(--orange)' }}>Sin conexión con Meta</b>
        <span style={{ fontSize: 13 }}>{cuenta.motivo}</span>
        <span style={suave}>Se puede preparar y programar igual; saldrá cuando esté conectado (si no, se marcará con error y se reintenta).</span>
      </div>
    );
  }
  const faltan = cuenta.faltan || [], faltanE = cuenta.faltanEstadisticas || [];
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <a href={cuenta.facebook.enlace} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink)', textDecoration: 'none', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 999, padding: '5px 12px 5px 6px' }}>
        <Marca red="facebook" tam={22} /> <b>{cuenta.facebook.nombre}</b> <span style={suave}>{num(cuenta.facebook.seguidores)} seguidores</span>
      </a>
      {cuenta.instagram ? (
        <a href={`https://www.instagram.com/${cuenta.instagram.usuario || ''}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink)', textDecoration: 'none', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 999, padding: '5px 12px 5px 6px' }}>
          <Marca red="instagram" tam={22} /> <b>@{cuenta.instagram.usuario}</b> <span style={suave}>{num(cuenta.instagram.seguidores)} seguidores</span>
        </a>
      ) : <span style={{ fontSize: 12, color: '#B45309' }}>La página no tiene una cuenta de Instagram profesional vinculada.</span>}
      <button className="btn btn-sm btn-ghost" onClick={onRecargar} title="Volver a comprobar">↻</button>
      {(faltan.length > 0 || faltanE.length > 0) && (
        <span style={{ fontSize: 12, color: '#B45309', flexBasis: '100%' }}>
          {faltan.length > 0 && <>Al token de la página le faltan permisos para publicar: <b>{faltan.join(', ')}</b>. </>}
          {faltanE.length > 0 && <>Para las estadísticas: <b>{faltanE.join(', ')}</b>. </>}
          Hay que generar el token de nuevo en Meta con esos permisos y ponerlo en Heroku (META_PAGE_TOKEN).
        </span>
      )}
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────
function Editor({ inicial, cuenta, onCerrar, showToast }) {
  const nueva = !inicial.id;
  const soloVer = ['publicada', 'parcial', 'publicando'].includes(inicial.estado);
  const [id, setId] = useState(inicial.id || null);
  const [texto, setTexto] = useState(inicial.texto || '');
  const [redes, setRedes] = useState(inicial.redes?.length ? inicial.redes : ['facebook', 'instagram']);
  const [tipo, setTipo] = useState(inicial.tipo || 'post');
  const [medios, setMedios] = useState(inicial.medios || []);
  const [cuando, setCuando] = useState(inicial.programadaAt ? 'programar' : 'programar');
  const [fecha, setFecha] = useState(() => {
    if (inicial.programadaAt) return aLocal(inicial.programadaAt);
    const d = inicial.dia ? new Date(`${inicial.dia}T18:00:00`) : new Date(Date.now() + 3600_000);
    if (!inicial.dia) d.setMinutes(0, 0, 0);
    return aLocal(d);
  });
  const [subiendo, setSubiendo] = useState(null);     // { nombre, progreso }
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [estado, setEstado] = useState(inicial);
  const archivo = useRef(null);
  const tocado = useRef(false);

  const asegurarId = async () => {
    if (id) return id;
    const d = await api('/api/admin/publicaciones', { method: 'POST', body: { texto, redes, tipo } });
    setId(d.id); tocado.current = true;
    return d.id;
  };
  async function añadir(files) {
    const lista = [...files];
    if (!lista.length) return;
    try {
      const pid = await asegurarId();
      const notas = [];
      for (const f of lista) {
        setSubiendo({ nombre: f.name, progreso: 0 });
        const esVideo = f.type.startsWith('video/') || /\.(mp4|mov)$/i.test(f.name);
        const p = esVideo ? await prepararVideo(f) : await prepararFoto(f, redes.includes('instagram') && tipo !== 'story');
        if (p.bandas) notas.push(`«${f.name}» llevaba unas proporciones que Instagram no admite: se le han puesto bandas blancas.`);
        const r = await subir(`/api/admin/publicaciones/${pid}/medios?ancho=${p.ancho}&alto=${p.alto}`, p.blob, (x) => setSubiendo({ nombre: f.name, progreso: x }));
        if (p.mini) await subir(`/api/admin/publicaciones/${pid}/medios/${r.id}/miniatura`, new Blob([p.mini], { type: 'image/jpeg' }));
        setMedios(ms => [...ms, { id: r.id, mime: p.blob.type, ancho: p.ancho, alto: p.alto, local: URL.createObjectURL(p.mini || p.blob), archivo: true }]);
        tocado.current = true;
      }
      setAviso(notas.length ? notas.join(' ') : null);
    } catch (e) { alert(e.message); } finally { setSubiendo(null); if (archivo.current) archivo.current.value = ''; }
  }
  async function quitar(m) {
    try { await api(`/api/admin/publicaciones/${id}/medios/${m.id}`, { method: 'DELETE' }); setMedios(ms => ms.filter(x => x.id !== m.id)); tocado.current = true; } catch (e) { alert(e.message); }
  }
  async function mover(i, d) {
    const ms = [...medios]; const j = i + d;
    if (j < 0 || j >= ms.length) return;
    [ms[i], ms[j]] = [ms[j], ms[i]];
    setMedios(ms);
    try { await api(`/api/admin/publicaciones/${id}/medios/orden`, { method: 'PUT', body: { ids: ms.map(m => m.id) } }); tocado.current = true; } catch (e) { alert(e.message); }
  }
  async function guardar(accion) {
    setGuardando(true);
    try {
      const pid = await asegurarId();
      const d = await api(`/api/admin/publicaciones/${pid}`, { method: 'PUT', body: { texto, redes, tipo, accion, programadaAt: accion === 'programar' ? new Date(fecha).toISOString() : undefined } });
      tocado.current = true;
      if (accion === 'publicar') {
        setEstado(d.publicacion);
        showToast?.(d.publicacion.estado === 'publicada' ? '¡Publicada!' : d.publicacion.estado === 'publicando' || d.publicacion.estado === 'programada' ? 'Publicándose… (puede tardar un poco con los vídeos)' : 'No ha salido del todo: mira el resultado.');
        if (['publicada', 'publicando', 'programada'].includes(d.publicacion.estado)) onCerrar(true);
      } else {
        showToast?.(accion === 'borrador' ? 'Borrador guardado.' : `Programada para el ${fmtFechaHora(d.publicacion.programadaAt)}.`);
        onCerrar(true);
      }
    } catch (e) { alert(e.message); } finally { setGuardando(false); }
  }
  async function borrar() {
    if (!id) { onCerrar(false); return; }
    if (!window.confirm(soloVer ? 'Se quita de aquí, pero NO de Facebook ni de Instagram (allí sigue publicada). ¿Seguir?' : '¿Borrar esta publicación?')) return;
    try { await api(`/api/admin/publicaciones/${id}`, { method: 'DELETE' }); showToast?.('Borrada.'); onCerrar(true); } catch (e) { alert(e.message); }
  }
  async function reintentar() {
    try { const d = await api(`/api/admin/publicaciones/${id}/reintentar`, { method: 'POST' }); setEstado(d.publicacion); showToast?.('Reintentando…'); onCerrar(true); } catch (e) { alert(e.message); }
  }
  const cerrar = () => { if (nueva && id && !tocado.current) onCerrar(false); else onCerrar(tocado.current); };
  const hashtags = (texto.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  const res = estado.resultado || {};

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'grid', placeItems: 'center', padding: 12 }} onClick={cerrar}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 18, width: 'min(1100px, 100%)', maxHeight: '94vh', overflowY: 'auto', padding: 18, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 800 }}>{nueva ? 'Nueva publicación' : soloVer ? 'Publicación' : 'Editar publicación'}</h3>
          {!nueva && <span style={{ fontSize: 12, fontWeight: 800, color: ESTADO[estado.estado]?.c }}>● {ESTADO[estado.estado]?.t}</span>}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm btn-ghost" onClick={cerrar} aria-label="Cerrar"><I.X /></button>
        </div>

        {/* Lo que pasó al publicar. */}
        {Object.keys(res).some(k => RED[k]) && (
          <div style={{ display: 'grid', gap: 6 }}>
            {Object.entries(res).filter(([k]) => RED[k]).map(([k, r]) => (
              <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
                <Marca red={k} /> {r.ok
                  ? <>Publicada{r.url && <> · <a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'var(--purple)', fontWeight: 700 }}>verla en {RED[k].nombre} ↗</a></>}</>
                  : <span style={{ color: 'var(--orange)' }}>No ha salido: {r.error}</span>}
              </div>
            ))}
            {res.aviso && <span style={{ fontSize: 13, color: '#B45309' }}>{res.aviso}</span>}
            {['error', 'parcial'].includes(estado.estado) && <button className="btn btn-sm btn-primary" style={{ justifySelf: 'start' }} onClick={reintentar}>Reintentar lo que falló</button>}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.keys(RED).map(r => {
                const on = redes.includes(r);
                return (
                  <button key={r} type="button" disabled={soloVer} onClick={() => setRedes(rs => (on ? rs.filter(x => x !== r) : [...rs, r]))}
                    style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '7px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
                      border: `1.5px solid ${on ? RED[r].color : 'var(--line)'}`, background: on ? `color-mix(in oklab, ${RED[r].color} 10%, var(--bg-2))` : 'var(--bg-2)', color: 'var(--ink)', opacity: on ? 1 : 0.6 }}>
                    <Marca red={r} /> {RED[r].nombre}
                  </button>
                );
              })}
              <span style={{ width: 1, background: 'var(--line)', margin: '0 4px' }} />
              {Object.entries(TIPO).map(([t, l]) => (
                <button key={t} type="button" disabled={soloVer} className={`filter-pill ${tipo === t ? 'is-active' : ''}`} onClick={() => setTipo(t)}>{l}</button>
              ))}
            </div>
            {tipo === 'story' && <span style={suave}>Las historias solo salen en Instagram, con una foto o un vídeo (mejor en vertical, 9:16) y sin texto.</span>}
            {tipo === 'reel' && <span style={suave}>Un reel es un vídeo vertical (9:16), MP4 o MOV, de 3 segundos a 15 minutos.</span>}
            {tipo !== 'story' && (
              <div style={{ display: 'grid', gap: 4 }}>
                <textarea value={texto} disabled={soloVer} onChange={e => setTexto(e.target.value)} rows={7} placeholder="Escribe la publicación… Los #hashtags y los emojis van tal cual."
                  style={{ ...campo, width: '100%', resize: 'vertical', lineHeight: 1.5 }} />
                <span style={{ ...suave, color: texto.length > 2200 || hashtags > 30 ? 'var(--orange)' : 'var(--ink-3)' }}>
                  {texto.length.toLocaleString('es-ES')} caracteres{redes.includes('instagram') ? ' de 2.200 en Instagram' : ''} · {hashtags} hashtag{hashtags !== 1 ? 's' : ''}{redes.includes('instagram') ? ' de 30' : ''}
                </span>
              </div>
            )}

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {medios.map((m, i) => (
                  <div key={m.id} style={{ position: 'relative', width: 96, height: 96, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-3)', border: '1px solid var(--line)' }}>
                    <img src={miniUrl(m)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {m.mime.startsWith('video/') && <span style={{ position: 'absolute', left: 6, bottom: 6, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6 }}>▶ VÍDEO</span>}
                    {!soloVer && (
                      <span style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 3 }}>
                        {i > 0 && <button type="button" onClick={() => mover(i, -1)} style={botonMini} aria-label="Antes">‹</button>}
                        {i < medios.length - 1 && <button type="button" onClick={() => mover(i, 1)} style={botonMini} aria-label="Después">›</button>}
                        <button type="button" onClick={() => quitar(m)} style={botonMini} aria-label="Quitar">×</button>
                      </span>
                    )}
                  </div>
                ))}
                {!soloVer && medios.length < 10 && (
                  <label style={{ width: 96, height: 96, borderRadius: 10, border: '2px dashed var(--line)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 12, textAlign: 'center' }}
                    onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); añadir(e.dataTransfer.files); }}>
                    <span><I.Plus width={18} height={18} /><br />Foto o vídeo</span>
                    <input ref={archivo} type="file" accept="image/*,video/mp4,video/quicktime" multiple hidden onChange={e => añadir(e.target.files)} />
                  </label>
                )}
              </div>
              {subiendo && <span style={{ fontSize: 12, color: 'var(--purple)', fontWeight: 700 }}>Subiendo «{subiendo.nombre}»… {Math.round(subiendo.progreso * 100)} %</span>}
              {aviso && <span style={{ fontSize: 12, color: '#B45309' }}>{aviso}</span>}
              <span style={suave}>Hasta 10 fotos (carrusel) o un vídeo de 100 MB como mucho. Las fotos se guardan hasta que se publican.</span>
            </div>

            {!soloVer && (
              <div style={{ ...caja, gap: 10, background: 'var(--bg-2)' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" className={`filter-pill ${cuando === 'programar' ? 'is-active' : ''}`} onClick={() => setCuando('programar')}>Programar</button>
                  <button type="button" className={`filter-pill ${cuando === 'ahora' ? 'is-active' : ''}`} onClick={() => setCuando('ahora')}>Publicar ahora</button>
                  {cuando === 'programar' && <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...campo, padding: '7px 10px' }} />}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {!nueva && <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--orange)', marginRight: 'auto' }} onClick={borrar}><I.Trash width={14} height={14} /> Borrar</button>}
                  <button type="button" className="btn btn-sm btn-outline" disabled={guardando || !!subiendo} onClick={() => guardar('borrador')}>Guardar borrador</button>
                  <button type="button" className="btn btn-sm btn-primary" disabled={guardando || !!subiendo} onClick={() => guardar(cuando === 'ahora' ? 'publicar' : 'programar')}>
                    {guardando ? 'Un momento…' : cuando === 'ahora' ? 'Publicar ahora' : 'Programar'}
                  </button>
                </div>
              </div>
            )}
            {soloVer && <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--orange)' }} onClick={borrar}><I.Trash width={14} height={14} /> Quitar de aquí</button></div>}
          </div>

          <VistaPrevia redes={redes} tipo={tipo} texto={texto} medios={medios} cuenta={cuenta} />
        </div>
      </div>
    </div>
  );
}
const botonMini = { width: 22, height: 22, borderRadius: 6, border: 0, background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 };

// Cómo se verá, aproximadamente, en cada red.
function VistaPrevia({ redes, tipo, texto, medios, cuenta }) {
  const [red, setRed] = useState(redes[0] || 'facebook');
  useEffect(() => { if (!redes.includes(red) && redes.length) setRed(redes[0]); }, [redes, red]);
  if (!redes.length) return <div style={{ ...caja, ...suave }}>Elige una red para ver cómo quedará.</div>;
  const primera = medios[0];
  const nombreFb = cuenta?.facebook?.nombre || 'AIM Education', usuarioIg = cuenta?.instagram?.usuario || 'aimeducation';
  return (
    <div style={{ display: 'grid', gap: 8, position: 'sticky', top: 0 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {redes.map(r => <button key={r} type="button" className={`filter-pill ${red === r ? 'is-active' : ''}`} onClick={() => setRed(r)}>Vista en {RED[r].nombre}</button>)}
      </div>
      <div style={{ background: '#fff', color: '#111', borderRadius: 12, border: '1px solid #ddd', overflow: 'hidden', maxWidth: 420, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
        {red === 'facebook' ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 12 }}>
              {cuenta?.facebook?.foto ? <img src={cuenta.facebook.foto} alt="" style={{ width: 36, height: 36, borderRadius: 999 }} /> : <Marca red="facebook" tam={36} />}
              <div><b style={{ fontSize: 14 }}>{nombreFb}</b><div style={{ fontSize: 12, color: '#65676B' }}>Ahora · 🌐</div></div>
            </div>
            {texto && <div style={{ padding: '0 12px 10px', fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{texto}</div>}
            {medios.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: medios.length > 1 ? '1fr 1fr' : '1fr', gap: 2 }}>
                {medios.slice(0, 4).map((m, i) => (
                  <div key={m.id} style={{ position: 'relative', aspectRatio: medios.length > 1 ? '1' : 'auto', background: '#000' }}>
                    <img src={miniUrl(m)} alt="" style={{ width: '100%', height: '100%', maxHeight: medios.length > 1 ? undefined : 460, objectFit: medios.length > 1 ? 'cover' : 'contain', display: 'block' }} />
                    {i === 3 && medios.length > 4 && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.5)', color: '#fff', fontSize: 26, fontWeight: 700 }}>+{medios.length - 4}</span>}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '1px solid #e4e6eb', padding: 8, fontSize: 13, color: '#65676B', fontWeight: 600 }}>
              <span>👍 Me gusta</span><span>💬 Comentar</span><span>↪ Compartir</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10 }}>
              {cuenta?.instagram?.foto ? <img src={cuenta.instagram.foto} alt="" style={{ width: 30, height: 30, borderRadius: 999 }} /> : <Marca red="instagram" tam={30} />}
              <b style={{ fontSize: 13 }}>{usuarioIg}</b>
              {tipo !== 'post' && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#D6249F' }}>{TIPO[tipo].toUpperCase()}</span>}
            </div>
            <div style={{ position: 'relative', aspectRatio: tipo === 'post' ? (primera?.ancho && primera?.alto ? `${primera.ancho} / ${primera.alto}` : '1') : '9 / 16', background: '#eee', maxHeight: tipo === 'post' ? undefined : 520 }}>
              {primera ? <img src={miniUrl(primera)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#888', fontSize: 13 }}>Instagram necesita una foto o un vídeo</span>}
              {medios.length > 1 && <span style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>1/{medios.length}</span>}
            </div>
            {tipo !== 'story' && (
              <div style={{ padding: 10, fontSize: 13, lineHeight: 1.4 }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>♡ 💬 ↗</div>
                <b>{usuarioIg}</b> <span style={{ whiteSpace: 'pre-wrap' }}>{texto.length > 125 ? `${texto.slice(0, 125)}… más` : texto}</span>
              </div>
            )}
          </>
        )}
      </div>
      <span style={suave}>Vista aproximada: cada red lo coloca a su manera.</span>
    </div>
  );
}

// ── Calendario ──────────────────────────────────────────────────────────────
function Calendario({ lista, onAbrir, onNueva, onMovida, showToast }) {
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [arrastrando, setArrastrando] = useState(null);
  const hoy = diaDe(new Date());
  const primero = new Date(mes); const desfase = (primero.getDay() + 6) % 7;
  const inicio = new Date(primero); inicio.setDate(1 - desfase);
  const dias = Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d; });
  const porDia = new Map();
  for (const p of lista || []) {
    const cuando = p.publicadaAt || p.programadaAt;
    if (!cuando) continue;
    const k = diaDe(cuando);
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k).push(p);
  }
  for (const v of porDia.values()) v.sort((a, b) => new Date(a.publicadaAt || a.programadaAt) - new Date(b.publicadaAt || b.programadaAt));
  const borradores = (lista || []).filter(p => p.estado === 'borrador');
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Arrastrar una programada a otro día: misma hora, otro día.
  async function soltar(dia) {
    const p = arrastrando; setArrastrando(null);
    if (!p || p.estado !== 'programada') return;
    const antes = new Date(p.programadaAt);
    const nueva = new Date(`${dia}T${fmtHora(antes)}:00`);
    if (nueva < new Date()) { showToast?.('Ese momento ya ha pasado.'); return; }
    try {
      await api(`/api/admin/publicaciones/${p.id}`, { method: 'PUT', body: { texto: p.texto, redes: p.redes, tipo: p.tipo, accion: 'programar', programadaAt: nueva.toISOString() } });
      showToast?.(`Movida al ${fmtFechaHora(nueva)}.`); onMovida();
    } catch (e) { alert(e.message); }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-icon" onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Mes anterior">‹</button>
        <b style={{ fontSize: 16, textTransform: 'capitalize', minWidth: 170, textAlign: 'center' }}>{mes.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</b>
        <button className="btn btn-icon" onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Mes siguiente">›</button>
        <button className="btn btn-sm btn-outline" onClick={() => { const d = new Date(); setMes(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Hoy</button>
        <span style={{ ...suave, marginLeft: 'auto' }}>Arrastra una programada a otro día para moverla.</span>
      </div>
      {lista === null ? <p style={suave}>Cargando…</p> : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', gap: 4, minWidth: 780 }}>
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3)', textAlign: 'center', padding: 4 }}>{d}</div>)}
            {dias.map(d => {
              const k = isoLocal(d), deMes = d.getMonth() === mes.getMonth(), pubs = porDia.get(k) || [];
              return (
                <div key={k} onDragOver={e => { if (arrastrando) e.preventDefault(); }} onDrop={() => soltar(k)}
                  onDoubleClick={() => k >= hoy && onNueva(k)}
                  style={{ minHeight: 104, background: deMes ? 'var(--bg-2)' : 'var(--bg)', border: `1px solid ${k === hoy ? 'var(--purple)' : 'var(--line)'}`, borderRadius: 10, padding: 6, display: 'grid', alignContent: 'start', gap: 4, opacity: deMes ? 1 : 0.55 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: k === hoy ? 'var(--purple)' : 'var(--ink-2)' }}>{d.getDate()}</span>
                  {pubs.map(p => (
                    <button key={p.id} type="button" draggable={p.estado === 'programada'} onDragStart={() => setArrastrando(p)} onDragEnd={() => setArrastrando(null)} onClick={() => onAbrir(p)}
                      title={p.texto}
                      style={{ display: 'flex', gap: 4, alignItems: 'center', textAlign: 'left', fontFamily: 'inherit', fontSize: 11, padding: '3px 5px', borderRadius: 7, cursor: 'pointer',
                        border: `1px solid color-mix(in oklab, ${ESTADO[p.estado]?.c} 45%, transparent)`, background: `color-mix(in oklab, ${ESTADO[p.estado]?.c} 10%, var(--bg-2))`, color: 'var(--ink)', minWidth: 0 }}>
                      {p.medios?.[0] && <img src={miniUrl(p.medios[0])} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover', flex: 'none' }} />}
                      <b style={{ flex: 'none' }}>{fmtHora(p.publicadaAt || p.programadaAt)}</b>
                      {p.redes.map(r => <Marca key={r} red={r} tam={13} />)}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.texto || TIPO[p.tipo]}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {borradores.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <b style={{ fontSize: 13 }}>Borradores ({borradores.length})</b>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {borradores.map(p => (
              <button key={p.id} type="button" onClick={() => onAbrir(p)} className="btn btn-sm btn-outline" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.redes.map(r => <Marca key={r} red={r} tam={13} />)} {p.texto || TIPO[p.tipo]}
              </button>
            ))}
          </div>
        </div>
      )}
      <span style={suave}>Doble clic en un día para preparar una publicación para ese día.</span>
    </div>
  );
}

// ── Lista ───────────────────────────────────────────────────────────────────
function Lista({ lista, onAbrir, onCambio, showToast }) {
  const [filtro, setFiltro] = useState('todas');
  const filtros = [['todas', 'Todas'], ['programada', 'Programadas'], ['borrador', 'Borradores'], ['publicada', 'Publicadas'], ['error', 'Con error']];
  const visibles = (lista || []).filter(p => filtro === 'todas' || p.estado === filtro || (filtro === 'error' && p.estado === 'parcial') || (filtro === 'publicada' && p.estado === 'parcial'));
  async function duplicar(p) {
    try {
      const d = await api(`/api/admin/publicaciones/${p.id}/duplicar`, { method: 'POST' });
      showToast?.('Duplicada como borrador.');
      const nueva = ((await api('/api/admin/publicaciones')).publicaciones || []).find(x => x.id === d.id);
      await onCambio();
      if (nueva) onAbrir(nueva);
    }
    catch (e) { alert(e.message); }
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {filtros.map(([v, l]) => <button key={v} className={`filter-pill ${filtro === v ? 'is-active' : ''}`} onClick={() => setFiltro(v)}>{l}</button>)}
      </div>
      {lista === null ? <p style={suave}>Cargando…</p> : !visibles.length ? <p style={suave}>No hay publicaciones{filtro !== 'todas' ? ' así' : ''}. Empieza con «Nueva publicación».</p> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {visibles.map(p => (
            <div key={p.id} style={{ ...caja, gridTemplateColumns: '64px 1fr', gap: 12, padding: 12, alignItems: 'start' }}>
              <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-3)', display: 'grid', placeItems: 'center' }}>
                {p.medios?.[0] ? <img src={miniUrl(p.medios[0])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={suave}>Texto</span>}
              </div>
              <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                  {p.redes.map(r => <Marca key={r} red={r} />)}
                  <b style={{ color: ESTADO[p.estado]?.c }}>{ESTADO[p.estado]?.t}</b>
                  <span style={suave}>{TIPO[p.tipo]}{p.medios?.length > 1 ? ` · ${p.medios.length} fotos` : ''}</span>
                  <span style={suave}>{p.publicadaAt ? `· ${fmtFechaHora(p.publicadaAt)}` : p.programadaAt ? `· ${fmtFechaHora(p.programadaAt)}` : ''}</span>
                  {p.autor && <span style={suave}>· {p.autor}</span>}
                </div>
                <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.texto || <i style={suave}>Sin texto</i>}</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {Object.entries(p.resultado || {}).filter(([k]) => RED[k]).map(([k, r]) => (r.ok && r.url
                    ? <a key={k} href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>Ver en {RED[k].nombre} ↗</a>
                    : !r.ok ? <span key={k} style={{ fontSize: 12, color: 'var(--orange)' }}>{RED[k].nombre}: {r.error}</span> : null))}
                  <div style={{ flex: 1 }} />
                  <button className="btn btn-sm btn-outline" onClick={() => onAbrir(p)}>{['publicada', 'parcial', 'publicando'].includes(p.estado) ? 'Ver' : 'Editar'}</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => duplicar(p)} title="Hacer otra igual">Duplicar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Estadísticas ────────────────────────────────────────────────────────────
function Estadisticas() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [orden, setOrden] = useState('recientes');
  const cargar = useCallback((forzar) => {
    setError(null);
    api(`/api/admin/publicaciones/estadisticas${forzar ? '?forzar=1' : ''}`).then(setD).catch(e => setError(e.message));
  }, []);
  useEffect(() => { cargar(false); }, [cargar]);
  if (error) return <p style={{ color: 'var(--orange)', fontSize: 14 }}>{error}</p>;
  if (!d) return <p style={suave}>Pidiendo los números a Facebook e Instagram…</p>;
  if (!d.cuenta?.conectado) return <p style={suave}>Sin conexión con Meta: no hay estadísticas que enseñar.</p>;
  const hace30 = (red) => {
    const lista = (d.seguidores || []).filter(x => x[red] != null);
    if (lista.length < 2) return null;
    const limite = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const base = lista.find(x => x.fecha >= limite) || lista[0];
    return lista[lista.length - 1][red] - base[red];
  };
  const interaccion = (p) => (p.reacciones ?? p.meGusta ?? 0) + (p.comentarios ?? 0) + (p.compartidos ?? 0) + (p.guardados ?? 0);
  const ordenar = (l) => (orden === 'interaccion' ? [...l].sort((a, b) => interaccion(b) - interaccion(a)) : l);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Tarjeta red="facebook" titulo={d.cuenta.facebook.nombre} valor={d.cuenta.facebook.seguidores} cambio={hace30('facebook')} serie={(d.seguidores || []).map(x => x.facebook)} />
        {d.cuenta.instagram && <Tarjeta red="instagram" titulo={`@${d.cuenta.instagram.usuario}`} valor={d.cuenta.instagram.seguidores} cambio={hace30('instagram')} serie={(d.seguidores || []).map(x => x.instagram)} extra={`${num(d.cuenta.instagram.publicaciones)} publicaciones`} />}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className={`filter-pill ${orden === 'recientes' ? 'is-active' : ''}`} onClick={() => setOrden('recientes')}>Las más recientes</button>
        <button className={`filter-pill ${orden === 'interaccion' ? 'is-active' : ''}`} onClick={() => setOrden('interaccion')}>Las que más gustan</button>
        <span style={{ ...suave, marginLeft: 'auto' }}>Actualizado {fmtFechaHora(d.actualizado)}</span>
        <button className="btn btn-sm btn-ghost" onClick={() => { setD(null); cargar(true); }}>↻ Actualizar</button>
      </div>
      {Object.entries(d.errores || {}).map(([k, e]) => <span key={k} style={{ fontSize: 12, color: '#B45309' }}>{RED[k].nombre}: {e}</span>)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, alignItems: 'start' }}>
        {['facebook', 'instagram'].filter(r => r === 'facebook' || d.cuenta.instagram).map(r => (
          <div key={r} style={{ display: 'grid', gap: 8 }}>
            <b style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Marca red={r} /> Últimas en {RED[r].nombre}</b>
            {!(d[r] || []).length && <span style={suave}>No hay publicaciones (o no se pueden leer).</span>}
            {ordenar(d[r] || []).map(p => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ ...caja, gridTemplateColumns: '56px 1fr', gap: 10, padding: 10, textDecoration: 'none', color: 'var(--ink)' }}>
                <div style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', background: 'var(--bg-3)' }}>{p.imagen && <img src={p.imagen} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{fmtFechaHora(p.fecha)}{p.tipo ? ` · ${String(p.tipo).toLowerCase()}` : ''}{p.deAqui ? ' · desde aquí' : ''}</span>
                  <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.texto || '—'}</span>
                  <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                    <span title="Me gusta">♥ {num(p.reacciones ?? p.meGusta)}</span>
                    <span title="Comentarios">💬 {num(p.comentarios)}</span>
                    {p.compartidos != null && <span title="Compartidos">↪ {num(p.compartidos)}</span>}
                    {p.guardados != null && <span title="Guardados">🔖 {num(p.guardados)}</span>}
                    {p.alcance != null && <span title="Personas alcanzadas" style={{ color: 'var(--purple)' }}>👁 {num(p.alcance)}</span>}
                    {p.reproducciones != null && <span title="Reproducciones">▶ {num(p.reproducciones)}</span>}
                  </span>
                </div>
              </a>
            ))}
          </div>
        ))}
      </div>
      <span style={suave}>«Alcance» es cuántas personas distintas la vieron. Si sale «—», Meta no lo da con los permisos actuales del token.</span>
    </div>
  );
}

function Tarjeta({ red, titulo, valor, cambio, serie, extra }) {
  const pts = serie.filter(v => v != null);
  let linea = null;
  if (pts.length > 1) {
    const min = Math.min(...pts), max = Math.max(...pts), rango = max - min || 1;
    linea = pts.map((v, i) => `${(i / (pts.length - 1)) * 120},${30 - ((v - min) / rango) * 28}`).join(' ');
  }
  return (
    <div style={{ ...caja, minWidth: 240, flex: '1 1 260px', gap: 6 }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><Marca red={red} /> <b>{titulo}</b></span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800 }}>{num(valor)}</span>
      <span style={suave}>seguidores{cambio != null ? <> · <b style={{ color: cambio >= 0 ? 'var(--teal)' : 'var(--orange)' }}>{cambio >= 0 ? '+' : ''}{num(cambio)}</b> en 30 días</> : ''}{extra ? ` · ${extra}` : ''}</span>
      {linea && <svg width="120" height="32" aria-hidden="true"><polyline points={linea} fill="none" stroke={RED[red].color} strokeWidth="2" /></svg>}
      {!linea && <span style={{ ...suave, fontSize: 11 }}>La evolución aparece a partir de mañana (se apunta una vez al día).</span>}
    </div>
  );
}
