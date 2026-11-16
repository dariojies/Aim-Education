import React, { useState, useEffect, useCallback, useRef } from 'react';
import { grabarVideo, formatoVideo } from '../disenos/animacion.js';

// ─────────────────────────────────────────────────────────────────────────────
// Aim Design → Pantallas: el carrusel de la tele de recepción (ver pantallas.js).
// Se añaden diseños (una entrada por página), se ordenan, se dice cuánto se ve
// cada uno y, si se quiere, entre qué fechas. Lo que no lleva vídeo lo prepara el
// servidor solo; lo que lleva vídeo o animación se graba aquí («Preparar los
// vídeos»), en MP4, y se sube. La tele abre su dirección y lo pasa en bucle.
// ─────────────────────────────────────────────────────────────────────────────
const api = async (url, opciones = {}) => {
  const r = await fetch(url, { credentials: 'include', ...opciones, headers: { ...(opciones.body && !(opciones.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...(opciones.headers || {}) },
    body: opciones.body && !(opciones.body instanceof Blob) && typeof opciones.body !== 'string' ? JSON.stringify(opciones.body) : opciones.body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `No se ha podido (${r.status}).`);
  return d;
};
const inp = { fontFamily: 'inherit', fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', boxSizing: 'border-box' };
const tarjeta = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, display: 'grid', gap: 10 };
const hace = (f) => {
  if (!f) return null;
  const m = Math.round((Date.now() - new Date(f).getTime()) / 60000);
  return m < 2 ? 'ahora mismo' : m < 60 ? `hace ${m} min` : m < 48 * 60 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`;
};
const ESTADOS = {
  lista: ['✓ Lista', 'var(--teal)'],
  vieja: ['⚠ El diseño ha cambiado', 'var(--orange)'],
  sin_preparar: ['⏳ Sin preparar', 'var(--orange)'],
  sin_pagina: ['✕ Esa página ya no existe', 'var(--pink)'],
  sin_archivo: ['✕ Falta el vídeo: vuelve a subirlo', 'var(--pink)'],
};

// ── El horario de cada entrada: días de la semana, horas y fechas ──
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];   // 1 = lunes … 7 = domingo
const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const PLURAL_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
const diaCorto = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const hoyISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const conY = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}` : l[0] || '');
function textoDias(d) {
  const k = d.join(',');
  if (k === '1,2,3,4,5') return 'De lunes a viernes';
  if (k === '6,7') return 'Sábado y domingo';
  if (k === '1,2,3,4,5,6') return 'De lunes a sábado';
  if (d.length === 1) return `Los ${PLURAL_DIA[d[0] - 1]}`;
  const t = conY(d.map(n => NOMBRES_DIA[n - 1]));
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function resumenHorario(it) {
  const partes = [];
  if (it.dias?.length) partes.push(textoDias(it.dias));
  if (it.horaDesde || it.horaHasta) {
    if (!partes.length) partes.push('Todos los días');
    partes.push(it.horaDesde && it.horaHasta ? `de ${it.horaDesde} a ${it.horaHasta}` : it.horaDesde ? `desde las ${it.horaDesde}` : `hasta las ${it.horaHasta}`);
  }
  if (it.desde || it.hasta) partes.push(it.desde && it.hasta ? `del ${diaCorto(it.desde)} al ${diaCorto(it.hasta)}` : it.desde ? `desde el ${diaCorto(it.desde)}` : `hasta el ${diaCorto(it.hasta)}`);
  return partes.length ? partes.join(' · ') : 'Siempre';
}

// «¿Cuándo sale?»: se abre debajo de la entrada y se guarda todo junto.
function PanelHorario({ it, onGuardar, onCerrar }) {
  const [dias, setDias] = useState(it.dias?.length ? it.dias : [1, 2, 3, 4, 5, 6, 7]);
  const [horaDesde, setHoraDesde] = useState(it.horaDesde || '');
  const [horaHasta, setHoraHasta] = useState(it.horaHasta || '');
  const [desde, setDesde] = useState(it.desde || '');
  const [hasta, setHasta] = useState(it.hasta || '');
  const [guardando, setGuardando] = useState(false);
  const cambiarDia = (n) => setDias(d => (d.includes(n) ? d.filter(x => x !== n) : [...d, n].sort()));
  async function guardar(cambios) {
    if (!cambios.dias.length) { alert('Elige al menos un día (o quita el horario con «Que salga siempre»).'); return; }
    if (cambios.horaDesde && cambios.horaHasta && cambios.horaDesde === cambios.horaHasta) { alert('La hora de empezar y la de acabar son la misma.'); return; }
    if (cambios.desde && cambios.hasta && cambios.hasta < cambios.desde) { alert('El último día no puede ser antes del primero.'); return; }
    setGuardando(true);
    try { await onGuardar({ ...cambios, dias: cambios.dias.length === 7 ? null : cambios.dias }); onCerrar(); }
    catch { /* ya se ha avisado; el panel sigue abierto */ }
    finally { setGuardando(false); }
  }
  const nocturno = horaDesde && horaHasta && horaHasta < horaDesde;
  return (
    <div data-horario={it.id} style={{ marginLeft: 32, padding: 12, borderRadius: 10, border: '1px solid color-mix(in oklab, var(--purple) 40%, var(--line))', background: 'var(--bg-2)', display: 'grid', gap: 10, fontSize: 12.5 }}>
      <b>¿Cuándo sale «{it.nombre}»?</b>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 3, fontWeight: 700, color: 'var(--ink-2)' }}>Días
          <div style={{ display: 'flex', gap: 2 }}>
            {DIAS.map((d, i) => {
              const on = dias.includes(i + 1);
              return <button key={d} type="button" aria-pressed={on} aria-label={NOMBRES_DIA[i]} title={NOMBRES_DIA[i]} onClick={() => cambiarDia(i + 1)}
                style={{ width: 26, height: 28, borderRadius: 6, border: `1px solid ${on ? 'var(--purple)' : 'var(--line)'}`, background: on ? 'var(--purple)' : 'var(--bg-3)', color: on ? '#fff' : 'var(--ink-3)', fontSize: 11.5, fontWeight: 800, padding: 0, fontFamily: 'inherit', cursor: 'pointer' }}>{d}</button>;
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 3, fontWeight: 700, color: 'var(--ink-2)' }}>Horas (vacío: todo el día)
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
            de <input type="time" name="horaDesde" value={horaDesde} onChange={e => setHoraDesde(e.target.value)} style={{ ...inp, width: 104 }} />
            a <input type="time" name="horaHasta" value={horaHasta} onChange={e => setHoraHasta(e.target.value)} style={{ ...inp, width: 104 }} />
          </div>
        </div>
        <label style={{ display: 'grid', gap: 3, fontWeight: 700, color: 'var(--ink-2)' }}>Desde el día
          <input type="date" name="desde" value={desde} onChange={e => setDesde(e.target.value)} style={inp} />
        </label>
        <label style={{ display: 'grid', gap: 3, fontWeight: 700, color: 'var(--ink-2)' }}>Hasta el día
          <input type="date" name="hasta" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} style={inp} />
        </label>
      </div>
      {nocturno && <span style={{ color: 'var(--ink-3)' }}>Pasa de medianoche: sale de {horaDesde} hasta las {horaHasta} del día siguiente.</span>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-primary" disabled={guardando} onClick={() => guardar({ dias, horaDesde: horaDesde || null, horaHasta: horaHasta || null, desde: desde || null, hasta: hasta || null })}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn btn-sm btn-outline" disabled={guardando} onClick={onCerrar}>Cancelar</button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={guardando} onClick={() => guardar({ dias: [1, 2, 3, 4, 5, 6, 7], horaDesde: null, horaHasta: null, desde: null, hasta: null })}>Que salga siempre</button>
      </div>
    </div>
  );
}

// ── Subir un vídeo ya hecho (CapCut y parecidos) ──
const MAX_VIDEO = 100 * 1024 * 1024;
const CONSEJO_CAPCUT = 'En CapCut, al exportar: resolución 1080p, 30 fps, códec H.264 y formato MP4 (si sigue ocupando mucho, baja la «Velocidad de bits»).';
// El códec del vídeo, mirando la caja «moov» del MP4: 'h264', 'hevc', 'av1', 'vp9' o null.
async function codecMp4(file) {
  let pos = 0;
  for (let vueltas = 0; pos + 8 <= file.size && vueltas < 200; vueltas++) {
    const v = new DataView(await file.slice(pos, pos + 16).arrayBuffer());
    let tam = v.getUint32(0);
    const tipo = String.fromCharCode(v.getUint8(4), v.getUint8(5), v.getUint8(6), v.getUint8(7));
    if (tam === 1 && v.byteLength >= 16) tam = Number(v.getBigUint64(8));
    else if (tam === 0) tam = file.size - pos;
    if (tipo === 'moov') {
      const t = new TextDecoder('latin1').decode(await file.slice(pos, pos + Math.min(tam, 30 * 1024 * 1024)).arrayBuffer());
      return t.includes('hvc1') || t.includes('hev1') ? 'hevc' : t.includes('avc1') || t.includes('avc3') ? 'h264' : t.includes('av01') ? 'av1' : t.includes('vp09') ? 'vp9' : null;
    }
    if (tam < 8) break;
    pos += tam;
  }
  return null;
}
// Lo que dura, su tamaño y una portada (un fotograma del principio).
function leerVideo(file) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(file), v = document.createElement('video');
    let hecho = false;
    const fin = (r, e) => { if (hecho) return; hecho = true; clearTimeout(t); URL.revokeObjectURL(url); e ? mal(e) : ok(r); };
    const t = setTimeout(() => fin(null, new Error(`No se ha podido leer el vídeo. ${CONSEJO_CAPCUT}`)), 30000);
    v.muted = true; v.preload = 'auto'; v.playsInline = true;
    v.onerror = () => fin(null, new Error(`Este navegador no puede leer el vídeo: puede que no sea un MP4 normal. ${CONSEJO_CAPCUT}`));
    v.onloadedmetadata = () => {
      const datos = { duracion: v.duration, ancho: v.videoWidth, alto: v.videoHeight, portada: null };
      if (!Number.isFinite(datos.duracion) || datos.duracion <= 0) return fin(null, new Error('No se ha podido saber cuánto dura el vídeo.'));
      if (!datos.ancho) return fin(datos);   // no se ve aquí (códec raro): sin portada
      v.onseeked = () => {
        try {
          const c = document.createElement('canvas'), k = Math.min(1, 540 / datos.ancho);
          c.width = Math.round(datos.ancho * k); c.height = Math.round(datos.alto * k);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          c.toBlob(b => fin({ ...datos, portada: b }), 'image/jpeg', 0.85);
        } catch { fin(datos); }
      };
      v.currentTime = Math.min(1, datos.duracion / 3);
    };
    v.src = url;
  });
}

export default function PantallasTele({ disenos = [], abrirDiseno, showToast }) {
  const [datos, setDatos] = useState(null);
  const [eligiendo, setEligiendo] = useState(null);     // la pantalla a la que se añade
  const [grabando, setGrabando] = useState(null);       // { n, de, seg, dur, nombre }
  const [subiendo, setSubiendo] = useState(null);       // { pantalla, nombre, progreso }
  const [horario, setHorario] = useState(null);         // la entrada con «¿Cuándo sale?» abierto
  const elegirVideo = useRef(null);
  const subirA = useRef(null);
  const cargar = useCallback(() => api('/api/admin/pantallas').then(setDatos).catch(e => setDatos({ error: e.message })), []);
  useEffect(() => { cargar(); }, [cargar]);
  // Lo que prepara el servidor tarda un poco: se mira de vez en cuando.
  useEffect(() => {
    const faltan = (datos?.pantallas || []).some(p => p.items.some(i => !i.video && i.estado !== 'lista' && i.estado !== 'sin_pagina'));
    if (!faltan) return undefined;
    const t = setTimeout(cargar, 5000); return () => clearTimeout(t);
  }, [datos, cargar]);
  const hacer = async (f, aviso) => { try { await f(); if (aviso) showToast?.(aviso); cargar(); } catch (e) { alert(e.message); } };

  async function prepararVideos(p) {
    const lista = p.items.filter(i => i.video && !i.subido && i.estado !== 'lista' && i.estado !== 'sin_pagina');
    if (!formatoVideo()) { alert('Este navegador no sabe grabar vídeo. Prepáralos con Chrome o Edge.'); return; }
    if (!formatoVideo()?.tipo.startsWith('video/mp4') && !window.confirm('Este navegador graba en WebM y la tele puede no leerlo. Mejor con Chrome o Edge al día. ¿Seguir igualmente?')) return;
    try {
      for (const [k, it] of lista.entries()) {
        const { pagina, huella } = await api(`/api/admin/pantallas/items/${it.id}/preparar`);
        // Que quepa en 100 MB: la calidad, según lo que dure.
        const bitrate = Math.max(2_000_000, Math.min(7_000_000, Math.floor((90 * 8 * 1024 * 1024) / Math.max(1, it.duracion || 10))));
        const v = await grabarVideo(pagina, { ancho: Math.min(1080, pagina.ancho), bitrate, onProgreso: (s, dur) => setGrabando({ n: k + 1, de: lista.length, seg: s, dur, nombre: it.nombre }) });
        setGrabando(g => ({ ...g, subiendo: 0 }));
        const m = await api(`/api/admin/pantallas/items/${it.id}/medio`, { method: 'POST', body: { mime: v.mime, bytes: v.blob.size, duracion: it.duracion, ancho: v.ancho, alto: v.alto } });
        const n = Math.ceil(v.blob.size / m.trozo);
        for (let i = 0; i < n; i++) {
          await api(`/api/admin/pantallas/medios/${m.id}/trozos/${i}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: v.blob.slice(i * m.trozo, Math.min(v.blob.size, (i + 1) * m.trozo)) });
          setGrabando(g => ({ ...g, subiendo: (i + 1) / n }));
        }
        await api(`/api/admin/pantallas/items/${it.id}/medio/${m.id}/fin`, { method: 'POST', body: { huella } });
      }
      showToast?.('Vídeos preparados: la tele los pondrá en cuanto acabe la vuelta.');
    } catch (e) { alert(e.message); }
    finally { setGrabando(null); cargar(); }
  }
  // Un MP4 hecho fuera (CapCut…): se mira, se sube en trozos con su portada y
  // entra al final del carrusel.
  async function subirVideo(p, file) {
    if (!file) return;
    if (!(file.type === 'video/mp4' || /\.mp4$/i.test(file.name))) { alert(`Para la tele, el vídeo tiene que ir en MP4. ${CONSEJO_CAPCUT}`); return; }
    if (file.size > MAX_VIDEO) { alert(`Este vídeo ocupa ${Math.round(file.size / 1048576)} MB y el máximo son 100 MB. ${CONSEJO_CAPCUT} También puedes recortarlo.`); return; }
    setSubiendo({ pantalla: p.id, nombre: file.name, progreso: 0 });
    try {
      const codec = await codecMp4(file).catch(() => null);
      if (codec && codec !== 'h264' && !window.confirm(`Este vídeo va en ${codec === 'hevc' ? 'H.265 (HEVC)' : codec.toUpperCase()} y puede que la tele no lo ponga. ${CONSEJO_CAPCUT}\n\n¿Subirlo igualmente?`)) return;
      const v = await leerVideo(file);
      if (v.ancho && v.ancho > v.alto && !window.confirm('Este vídeo es apaisado: en la tele de pie saldrá con bandas negras arriba y abajo. ¿Subirlo igualmente?')) return;
      const m = await api(`/api/admin/pantallas/${p.id}/videos`, { method: 'POST', body: { nombre: file.name, mime: 'video/mp4', bytes: file.size, duracion: v.duracion, ancho: v.ancho, alto: v.alto } });
      const n = Math.ceil(file.size / m.trozo);
      for (let i = 0; i < n; i++) {
        await api(`/api/admin/pantallas/medios/${m.id}/trozos/${i}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file.slice(i * m.trozo, Math.min(file.size, (i + 1) * m.trozo)) });
        setSubiendo(s => ({ ...s, progreso: (i + 1) / n }));
      }
      if (v.portada) await api(`/api/admin/pantallas/medios/${m.id}/portada`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: v.portada }).catch(() => {});
      await api(`/api/admin/pantallas/${p.id}/videos/${m.id}/fin`, { method: 'POST' });
      showToast?.(`«${file.name}» subido: la tele lo pondrá en cuanto acabe la vuelta.`);
    } catch (e) { alert(e.message); }
    finally { setSubiendo(null); cargar(); }
  }
  function mover(p, i, d) {
    const ids = p.items.map(x => x.id), j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    hacer(() => api(`/api/admin/pantallas/${p.id}/orden`, { method: 'PUT', body: { ids } }));
  }

  if (!datos) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  if (datos.error) return <p style={{ color: 'var(--pink)' }}>{datos.error}</p>;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>
        El carrusel de la tele de recepción: los diseños que elijas pasan en bucle, a pantalla completa. Para la tele de pie, haz los diseños en tamaño «Historia» (1080 × 1920).
        Los que no llevan vídeo se preparan solos; los que llevan vídeo o animación, con «Preparar los vídeos» (con Chrome o Edge).
        También puedes subir un vídeo ya hecho (de CapCut o parecidos, en MP4). Con «🕒» eliges qué días y a qué horas sale cada cosa.
      </p>
      <input ref={elegirVideo} type="file" accept="video/mp4,.mp4" hidden data-subir-video
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; const p = subirA.current; if (f && p) subirVideo(p, f); }} />
      {/* Los cierres (#493): la historia del festivo sale sola en la tele los días antes. */}
      {datos.cierres && datos.pantallas.length > 0 && (
        <div style={tarjeta} data-cierres>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, cursor: 'pointer' }}>
              <input type="checkbox" checked={datos.cierres.activo} onChange={e => hacer(() => api('/api/admin/pantallas-cierres', { method: 'PATCH', body: { activo: e.target.checked } }))} style={{ accentColor: 'var(--teal)' }} />
              Avisar de los días de cierre
            </label>
            <select value={datos.cierres.dias} disabled={!datos.cierres.activo} onChange={e => hacer(() => api('/api/admin/pantallas-cierres', { method: 'PATCH', body: { dias: Number(e.target.value) } }))} style={{ ...inp, width: 'auto' }} aria-label="Desde cuántos días antes">
              {[7, 14, 21].map(n => <option key={n} value={n}>desde {n === 7 ? 'una semana' : n === 14 ? 'dos semanas' : 'tres semanas'} antes</option>)}
            </select>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
            La historia de los festivos (la plantilla que tengas en «Que salga solo… → Historia de los festivos y cierres»), con el día y la vuelta ya puestos, sale la primera del carrusel hasta el mismo día del cierre. Se prepara sola; si la plantilla tiene animaciones, en vídeo. En cada pantalla se puede quitar con su casilla «Avisos de cierre automáticos».
          </p>
          {!datos.cierres.plantilla && <p style={{ margin: 0, fontSize: 13, color: 'var(--pink)' }}>No hay plantilla para la historia de los festivos: elígela en Aim Design (en el diseño, «Que salga solo…»).</p>}
          {datos.cierres.plantilla && datos.cierres.activo && (
            <div style={{ fontSize: 13, display: 'grid', gap: 3 }}>
              {datos.cierres.proximos.length
                ? datos.cierres.proximos.map(c => <span key={c.fecha}>{c.listo ? '✅' : '⏳'} {new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · {c.nombre}{c.listo ? ' · en la tele' : ' · preparándose…'}</span>)
                : <span style={{ color: 'var(--ink-3)' }}>Ningún cierre en esos días.</span>}
            </div>
          )}
        </div>
      )}
      {!datos.pantallas.length && (
        <div style={{ ...tarjeta, justifyItems: 'start' }}>
          <b>Aún no hay ninguna pantalla.</b>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => hacer(() => api('/api/admin/pantallas', { method: 'POST', body: { nombre: 'Tele de recepción' } }))}>📺 Crear la pantalla de la tele de recepción</button>
        </div>
      )}
      {datos.pantallas.map(p => {
        const url = `${window.location.origin}/tele/${p.clave}`;
        const porPreparar = p.items.filter(i => i.video && !i.subido && i.estado !== 'lista' && i.estado !== 'sin_pagina');
        return (
          <div key={p.id} style={tarjeta}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22 }}>📺</span>
              <input defaultValue={p.nombre} aria-label="Nombre de la pantalla" onBlur={e => e.target.value.trim() !== p.nombre && hacer(() => api(`/api/admin/pantallas/${p.id}`, { method: 'PATCH', body: { nombre: e.target.value } }))}
                style={{ ...inp, fontWeight: 800, fontSize: 15, flex: '1 1 200px' }} />
              <span style={{ fontSize: 12.5, color: p.vistoAt && Date.now() - new Date(p.vistoAt) < 5 * 60000 ? 'var(--teal)' : 'var(--ink-3)', fontWeight: 700 }}>
                {p.vistoAt ? `● La tele se conectó ${hace(p.vistoAt)}` : '○ Ninguna tele la ha abierto todavía'}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 6, padding: 10, borderRadius: 10, background: 'var(--bg-3)', fontSize: 13 }}>
              <b>La dirección para la tele</b>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <code style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, background: 'var(--bg-2)', border: '1px solid var(--line)', overflowWrap: 'anywhere' }}>{url}</code>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => navigator.clipboard?.writeText(url).then(() => showToast?.('Copiada.'))}>Copiar</button>
                <a className="btn btn-sm btn-outline" href={url} target="_blank" rel="noreferrer">Ver como en la tele</a>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.confirm('¿Dirección nueva? La de ahora deja de funcionar y habrá que ponerle la nueva a la tele.') && hacer(() => api(`/api/admin/pantallas/${p.id}/clave`, { method: 'POST' }), 'Dirección nueva: pónsela a la tele.')}>Cambiar la dirección</button>
              </div>
              <details>
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Cómo ponerla en la tele (LG 55XS4J)</summary>
                <ol style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 3 }}>
                  <li>Con el mando: <b>Ajustes</b> (rueda) → <b>Ez Setting</b> → <b>Play via URL</b>.</li>
                  <li>Enciende <b>URL Loader</b> y en <b>Set URL</b> escribe la dirección de arriba. Con <b>Preview</b> se comprueba.</li>
                  <li>Guarda y reinicia la tele: al encenderse, abre el carrusel sola.</li>
                  <li>Si la tele está de pie, busca en sus ajustes la rotación de la pantalla (vertical o «Portrait») y actívala. Si no se puede, usa aquí «Girar la imagen».</li>
                  <li>Si la tele dice que la página no es segura o no carga, prueba la misma dirección empezando por <code>http://</code> en vez de <code>https://</code>.</li>
                </ol>
              </details>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>
              <label style={{ display: 'grid', gap: 3 }}>Segundos por diseño
                <input type="number" min={3} max={120} defaultValue={p.segundos} onBlur={e => Number(e.target.value) !== p.segundos && hacer(() => api(`/api/admin/pantallas/${p.id}`, { method: 'PATCH', body: { segundos: Number(e.target.value) } }))} style={{ ...inp, width: 90 }} />
              </label>
              <label style={{ display: 'grid', gap: 3 }}>Entre uno y otro
                <select value={p.transicion} onChange={e => hacer(() => api(`/api/admin/pantallas/${p.id}`, { method: 'PATCH', body: { transicion: e.target.value } }))} style={inp}>
                  <option value="fundido">Fundido</option><option value="corte">De golpe</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 3 }}>Girar la imagen
                <select value={p.girar} onChange={e => hacer(() => api(`/api/admin/pantallas/${p.id}`, { method: 'PATCH', body: { girar: Number(e.target.value) } }))} style={inp}>
                  <option value={0}>No (la tele ya está en vertical)</option><option value={90}>90° a la derecha</option><option value={270}>90° a la izquierda</option><option value={180}>Boca abajo</option>
                </select>
              </label>
              {/* #642: cada pantalla elige si le salen los avisos de cierre automáticos. */}
              {datos.cierres?.activo && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', alignSelf: 'center', paddingTop: 14 }}
                  title="La historia de los festivos y cierres que se pone sola al principio del carrusel">
                  <input type="checkbox" checked={p.cierres !== false} style={{ accentColor: 'var(--teal)' }}
                    onChange={e => hacer(() => api(`/api/admin/pantallas/${p.id}`, { method: 'PATCH', body: { cierres: e.target.checked } }),
                      e.target.checked ? 'En esta pantalla saldrán los avisos de cierre.' : 'En esta pantalla ya no salen los avisos de cierre.')} />
                  Avisos de cierre automáticos
                </label>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setEligiendo(p)}>＋ Añadir diseños</button>
              <button type="button" className="btn btn-sm btn-outline" disabled={!!subiendo} title={CONSEJO_CAPCUT}
                onClick={() => { subirA.current = p; elegirVideo.current?.click(); }}>📤 Subir un vídeo (MP4)</button>
              {subiendo?.pantalla === p.id && (
                <span style={{ fontSize: 13, display: 'grid', gap: 3, minWidth: 260 }} data-subiendo>
                  {subiendo.progreso ? `Subiendo «${subiendo.nombre}»… No cierres esta pestaña.` : `Mirando «${subiendo.nombre}»…`}
                  <progress value={subiendo.progreso || 0} max={1} style={{ width: '100%' }} />
                </span>
              )}
              {porPreparar.length > 0 && !grabando && <button type="button" className="btn btn-sm btn-outline" onClick={() => prepararVideos(p)}>🎬 Preparar los vídeos ({porPreparar.length})</button>}
              {grabando && (
                <span style={{ fontSize: 13, display: 'grid', gap: 3, minWidth: 260 }}>
                  {grabando.subiendo != null ? `Subiendo ${grabando.n} de ${grabando.de}…` : `Grabando ${grabando.n} de ${grabando.de} («${grabando.nombre}»): ${Math.round(grabando.seg || 0)} de ${Math.round(grabando.dur || 0)} s. No cierres esta pestaña.`}
                  <progress value={grabando.subiendo ?? (grabando.seg || 0) / (grabando.dur || 1)} max={1} style={{ width: '100%' }} />
                </span>
              )}
            </div>
            {!p.items.length ? <div style={{ padding: 20, textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 12, color: 'var(--ink-3)' }}>Aún no hay diseños en el carrusel.</div> : (
              <div style={{ display: 'grid', gap: 6 }}>
                {p.items.map((it, i) => {
                  const [estado, color] = ESTADOS[it.estado] || ['', 'inherit'];
                  const tumbado = it.ancho > it.alto;
                  const conHorario = !!(it.dias || it.horaDesde || it.horaHasta || it.desde || it.hasta);
                  const caducada = it.hasta && it.hasta < hoyISO();
                  return (<React.Fragment key={it.id}>
                    <div data-entrada={it.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 8, borderRadius: 10, border: '1px solid var(--line)', background: it.activo ? 'var(--bg-3)' : 'transparent', opacity: it.activo ? 1 : 0.6 }}>
                      <span style={{ width: 22, textAlign: 'center', fontWeight: 800, color: 'var(--ink-3)' }}>{i + 1}</span>
                      <button type="button" onClick={() => (it.subido ? it.url && window.open(it.url, '_blank', 'noopener') : abrirDiseno?.(it.disenoId))} title={it.subido ? 'Ver el vídeo' : 'Abrir en Aim Design'} style={{ border: 0, padding: 0, background: 'none', cursor: 'pointer' }}>
                        {it.miniatura ? <img src={it.miniatura} alt="" style={{ width: 46, height: 60, objectFit: 'contain', background: '#000', borderRadius: 6 }} />
                          : it.subido ? <span style={{ display: 'grid', placeItems: 'center', width: 46, height: 60, background: '#000', color: '#fff', borderRadius: 6, fontSize: 18 }}>▶</span>
                          : <span style={{ display: 'inline-block', width: 46, height: 60, background: 'var(--bg-2)', borderRadius: 6 }} />}
                      </button>
                      <div style={{ flex: '1 1 180px', minWidth: 0, display: 'grid', gap: 2 }}>
                        <b style={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>{it.nombre}{it.paginas > 1 ? ` · página ${it.pagina + 1}` : ''}</b>
                        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                          {it.subido
                            ? `📤 Vídeo subido · ${Math.round(it.duracion || 0)} s${it.ancho ? ` · ${it.ancho} × ${it.alto}` : ''}${it.bytes ? ` · ${Math.max(1, Math.round(it.bytes / 1048576))} MB` : ''}`
                            : it.video ? `🎬 Vídeo · ${Math.round(it.duracion)} s` : '🖼 Imagen'}{tumbado ? ' · apaisado: en la tele de pie se verá con bandas' : ''}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 800, color }}>{estado}{it.video && !it.subido && it.estado !== 'lista' && it.estado !== 'sin_pagina' ? ' (pulsa «Preparar los vídeos»)' : ''}</span>
                      </div>
                      {!it.video && (
                        <label style={{ display: 'grid', gap: 2, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Segundos
                          <input type="number" min={3} max={120} placeholder={String(p.segundos)} defaultValue={it.segundos ?? ''} onBlur={e => hacer(() => api(`/api/admin/pantallas/items/${it.id}`, { method: 'PATCH', body: { segundos: e.target.value === '' ? null : Number(e.target.value) } }))} style={{ ...inp, width: 70 }} />
                        </label>
                      )}
                      {/* Cuándo sale: días, horas y fechas, en un resumen que abre su panel. */}
                      <button type="button" data-horario-boton aria-expanded={horario === it.id} onClick={() => setHorario(h => (h === it.id ? null : it.id))}
                        title={caducada ? 'Ya pasó su último día: no sale en la tele' : 'Elegir qué días y a qué horas sale'}
                        style={{ font: 'inherit', fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', maxWidth: 340, textAlign: 'left',
                          border: `1px solid ${caducada ? 'var(--orange)' : conHorario ? 'var(--purple)' : 'var(--line)'}`,
                          background: conHorario ? `color-mix(in oklab, ${caducada ? 'var(--orange)' : 'var(--purple)'} 10%, var(--bg-2))` : 'var(--bg-2)',
                          color: caducada ? 'var(--orange)' : conHorario ? 'var(--purple)' : 'var(--ink-2)' }}>
                        🕒 {resumenHorario(it)}{caducada ? ' (ya pasó)' : ''} ▾
                      </button>
                      <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12.5 }}>
                        <input type="checkbox" checked={it.activo} onChange={e => hacer(() => api(`/api/admin/pantallas/items/${it.id}`, { method: 'PATCH', body: { activo: e.target.checked } }))} /> Sale
                      </label>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button type="button" className="icon-btn" disabled={i === 0} onClick={() => mover(p, i, -1)} aria-label="Antes">↑</button>
                        <button type="button" className="icon-btn" disabled={i === p.items.length - 1} onClick={() => mover(p, i, 1)} aria-label="Después">↓</button>
                        <button type="button" className="icon-btn danger" onClick={() => window.confirm(`¿Quitar «${it.nombre}» del carrusel?`) && hacer(() => api(`/api/admin/pantallas/items/${it.id}`, { method: 'DELETE' }))} aria-label="Quitar del carrusel" title="Quitar del carrusel">✕</button>
                      </div>
                    </div>
                    {horario === it.id && (
                      <PanelHorario it={it} onCerrar={() => setHorario(null)}
                        onGuardar={async (cambios) => {
                          try { await api(`/api/admin/pantallas/items/${it.id}`, { method: 'PATCH', body: cambios }); showToast?.('Horario guardado.'); cargar(); }
                          catch (e) { alert(e.message); throw e; }
                        }} />
                    )}
                  </React.Fragment>);
                })}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--orange)' }} onClick={() => window.confirm(`¿Borrar la pantalla «${p.nombre}»? La tele dejará de mostrar el carrusel.`) && hacer(() => api(`/api/admin/pantallas/${p.id}`, { method: 'DELETE' }))}>Borrar esta pantalla</button>
            </div>
          </div>
        );
      })}
      {datos.pantallas.length > 0 && (
        <button type="button" className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }} onClick={() => hacer(() => api('/api/admin/pantallas', { method: 'POST', body: { nombre: 'Otra pantalla' } }))}>＋ Otra pantalla</button>
      )}
      {eligiendo && (
        <div role="dialog" aria-label="Añadir diseños a la pantalla" onClick={() => setEligiendo(null)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 16, padding: 18, width: 'min(860px, 100%)', maxHeight: '85vh', overflowY: 'auto', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <b style={{ flex: 1, fontSize: 17 }}>Añadir a «{eligiendo.nombre}»</b>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setEligiendo(null)}>Hecho</button>
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Toca un diseño para añadirlo (todas sus páginas). Los verticales (1080 × 1920) llenan la tele de pie.</span>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {disenos.filter(d => d.tipo !== 'diploma').map(d => (
                <button key={d.id} type="button" onClick={() => hacer(() => api(`/api/admin/pantallas/${eligiendo.id}/items`, { method: 'POST', body: { disenoId: d.id } }), `«${d.nombre}» añadido.`)}
                  style={{ font: 'inherit', cursor: 'pointer', display: 'grid', gap: 4, padding: 8, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', textAlign: 'left' }}>
                  <span style={{ display: 'grid', placeItems: 'center', height: 120, background: 'var(--bg-3)', borderRadius: 8 }}>
                    {d.miniatura ? <img src={d.miniatura} alt="" style={{ maxWidth: '92%', maxHeight: 112 }} /> : null}
                  </span>
                  <b style={{ fontSize: 12.5 }}>{d.nombre}</b>
                  <span style={{ fontSize: 11, color: d.alto > d.ancho ? 'var(--teal)' : 'var(--ink-3)' }}>{d.ancho} × {d.alto}{d.alto > d.ancho ? ' · vertical' : ''}{d.paginas > 1 ? ` · ${d.paginas} páginas` : ''}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
