import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Correo (ticket #317): el buzón general del club (info@) y el tuyo. En el
// general los correos se asignan a un compañero y se marcan como hechos; los
// tuyos se pasan a un compañero reenviándoselos. Se lee y se envía por Gmail al
// momento, así que lo que se hace aquí se ve también en Gmail.
// ─────────────────────────────────────────────────────────────────────────────

// La lista a la izquierda y el detalle a la derecha (también lo usan las redes).
export const ESTILO_BANDEJA = `
        .bandeja{display:grid;grid-template-columns:minmax(280px,380px) minmax(0,1fr);gap:12px;height:calc(100vh - 250px);min-height:460px}
        .bandeja-lista{background:var(--bg-2);border:1px solid var(--line);border-radius:14px;overflow:auto}
        .bandeja-detalle{background:var(--bg-2);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:12px;overflow:auto;min-width:0}
        .bandeja-fila{display:grid;gap:2px;width:100%;text-align:left;padding:10px 12px;border:0;border-bottom:1px solid var(--line);background:none;cursor:pointer;font-family:inherit;color:var(--ink);font-size:13px}
        .bandeja-fila:hover{background:color-mix(in oklab,var(--purple) 5%,transparent)}
        .bandeja-fila.on{background:color-mix(in oklab,var(--purple) 10%,transparent)}
        .bandeja-volver{display:none;justify-self:start;border:0;background:none;color:var(--purple);font-weight:700;font-size:13px;cursor:pointer;padding:0;font-family:inherit}
        @media (max-width:860px){
          .bandeja{grid-template-columns:1fr;height:auto}
          .bandeja.con-detalle .bandeja-lista{display:none}
          .bandeja:not(.con-detalle) .bandeja-detalle{display:none}
          .bandeja-detalle{min-height:70vh}
          .bandeja-volver{display:inline}
        }
      `;

// Etiqueta de cada correo en la lista: de quién es, sin asignar, hecho.
const chipFila = (color) => ({ fontSize: 10.5, fontWeight: 800, padding: '1px 7px', borderRadius: 999, color, background: `color-mix(in oklab, ${color} 13%, transparent)`, border: `1px solid color-mix(in oklab, ${color} 35%, transparent)` });
const VISTAS = {
  general: [['entrada', 'Entrada'], ['sin_asignar', 'Sin asignar'], ['mios', 'Asignados a mí'], ['hechos', 'Hechos'], ['enviados', 'Enviados'], ['programados', 'Programados'], ['spam', 'Spam']],
  mio: [['entrada', 'Entrada'], ['enviados', 'Enviados'], ['programados', 'Programados'], ['spam', 'Spam']],
};
const api = async (url, opts = {}) => {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
};
const fechaLista = (iso) => {
  if (!iso) return '';
  const d = new Date(iso), hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(d.getFullYear() !== hoy.getFullYear() ? { year: '2-digit' } : {}) });
};
const fechaLarga = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const nombreDe = (a) => (a ? (a.nombre || a.email) : '');
const tam = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const campo = { fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box' };
const pastilla = (on) => ({ padding: '6px 12px', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', border: 0, borderRadius: 999, background: on ? 'var(--ink)' : 'transparent', color: on ? 'var(--bg-2)' : 'var(--ink-2)' });

// El cuerpo del correo, aislado: sin scripts y, hasta que se pida, sin cargar
// imágenes de fuera (son las que avisan al que envía de que se ha abierto).
function Cuerpo({ html, texto, imagenes }) {
  const doc = useMemo(() => {
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const csp = `default-src 'none'; img-src data: ${imagenes ? 'https: http:' : ''}; style-src 'unsafe-inline'; font-src data:`;
    const contenido = html || `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${esc(texto).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</pre>`;
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank">`
      + `<style>body{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;margin:16px;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${contenido}</body></html>`;
  }, [html, texto, imagenes]);
  return <iframe title="Contenido del correo" srcDoc={doc} sandbox="allow-popups allow-popups-to-escape-sandbox" style={{ border: 0, width: '100%', flex: 1, minHeight: 320, background: '#fff', borderRadius: 10 }} />;
}

// Escribir, responder o reenviar. Con varios buzones (al escribir desde otra
// pantalla) se elige desde cuál sale.
function Redactar({ inicial, buzon, buzones, onBuzon, onCerrar, onEnviado, showToast }) {
  const [c, setC] = useState(inicial);
  const [enviando, setEnviando] = useState(false);
  // Programar (#338): sale solo a la hora elegida.
  const [programar, setProgramar] = useState(false);
  const [cuando, setCuando] = useState(() => { const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); });
  const input = useRef(null);
  const set = (k, v) => setC(x => ({ ...x, [k]: v }));
  const leer = (f) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok({ nombre: f.name, datos: r.result, bytes: f.size }); r.onerror = mal; r.readAsDataURL(f); });
  async function enviar() {
    setEnviando(true);
    try {
      const d = await api(`/api/admin/bandeja/${buzon}/enviar`, { method: 'POST', body: { para: c.para, cc: c.cc, asunto: c.asunto, texto: c.texto, modo: c.modo, origen: c.origen, adjuntos: c.adjuntos || [], programadoAt: programar ? new Date(cuando).toISOString() : null } });
      showToast?.(d.programado ? `Programado: saldrá el ${new Date(d.programado.enviar_at).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : 'Correo enviado.');
      onEnviado?.();
    } catch (e) { alert(e.message); }
    finally { setEnviando(false); }
  }
  const titulo = { nuevo: 'Correo nuevo', responder: 'Responder', responder_todos: 'Responder a todos', reenviar: 'Reenviar' }[c.modo] || 'Correo';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: 16 }} onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div style={{ background: 'var(--bg-2)', borderRadius: 16, width: 'min(720px, 100%)', maxHeight: '92vh', overflow: 'auto', padding: 18, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{titulo}</h2>
          {buzones?.length > 1 ? (
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
              Sale desde
              <select value={buzon} onChange={e => onBuzon(e.target.value)} style={{ ...campo, width: 'auto', padding: '4px 8px', fontSize: 12, fontWeight: 700 }}>
                {buzones.map(b => <option key={b.id} value={b.id}>{b.email}</option>)}
              </select>
            </label>
          ) : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Sale desde {buzones?.find(b => b.id === buzon)?.email || c.desde}</span>}
        </div>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>Para<input style={campo} value={c.para} onChange={e => set('para', e.target.value)} placeholder="correo@ejemplo.com, otro@ejemplo.com" autoFocus={!c.para} /></label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>CC (opcional)<input style={campo} value={c.cc} onChange={e => set('cc', e.target.value)} /></label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>Asunto<input style={campo} value={c.asunto} onChange={e => set('asunto', e.target.value)} /></label>
        <textarea style={{ ...campo, minHeight: 200, resize: 'vertical', lineHeight: 1.5 }} value={c.texto} onChange={e => set('texto', e.target.value)} autoFocus={!!c.para} placeholder="Escribe aquí…" />
        {c.origen && <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>{c.modo === 'reenviar' ? 'Debajo va el correo original con sus adjuntos.' : 'Debajo va citado el correo al que respondes.'}</p>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {(c.adjuntos || []).map((a, i) => (
            <span key={i} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, background: 'var(--bg-3)', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              📎 {a.nombre} · {tam(a.bytes)}
              <button type="button" onClick={() => set('adjuntos', c.adjuntos.filter((_, j) => j !== i))} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-3)' }} aria-label="Quitar">✕</button>
            </span>
          ))}
          <button type="button" className="btn btn-sm btn-outline" onClick={() => input.current?.click()}>📎 Adjuntar</button>
          <input ref={input} type="file" multiple hidden onChange={async e => { const fs = [...(e.target.files || [])]; e.target.value = ''; const nuevos = await Promise.all(fs.map(leer)); set('adjuntos', [...(c.adjuntos || []), ...nuevos]); }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700, marginRight: 'auto' }}>
            <input type="checkbox" checked={programar} onChange={e => setProgramar(e.target.checked)} /> Programar el envío
            {programar && <input type="datetime-local" value={cuando} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={e => setCuando(e.target.value)} style={{ ...campo, width: 'auto', padding: '5px 8px' }} />}
          </label>
          <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={enviando || !c.para.trim() || !c.asunto.trim() || (programar && !cuando)} onClick={enviar}>{enviando ? 'Enviando…' : programar ? 'Programar' : 'Enviar'}</button>
        </div>
      </div>
    </div>
  );
}

// Las reglas del buzón general (#339): los correos de un remitente (o de todo un
// dominio) van siempre a la misma persona.
function Reglas({ companeros, onCerrar, showToast }) {
  const [lista, setLista] = useState(null);
  const [remitente, setRemitente] = useState('');
  const [a, setA] = useState('');
  const cargar = useCallback(() => api('/api/admin/bandeja/general/reglas').then(d => setLista(d.reglas)).catch(e => alert(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  async function crear() {
    try { await api('/api/admin/bandeja/general/reglas', { method: 'POST', body: { remitente, a } }); setRemitente(''); setA(''); showToast?.('Regla creada.'); cargar(); }
    catch (e) { alert(e.message); }
  }
  async function quitar(r) {
    if (!window.confirm(`¿Quitar la regla de ${r.remitente}? Los correos ya asignados se quedan como están.`)) return;
    try { await api(`/api/admin/bandeja/general/reglas/${r.i}`, { method: 'DELETE' }); cargar(); } catch (e) { alert(e.message); }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: 16 }} onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div style={{ background: 'var(--bg-2)', borderRadius: 16, width: 'min(620px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 18, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Reglas de asignación</h2>
          <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>Cerrar</button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Los correos de info@ de ese remitente se asignan solos a esa persona en cuanto llegan. Vale un correo (ana@colegio.es) o un dominio entero (@colegio.es).</p>
        {lista === null ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cargando…</p> : lista.length === 0 ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Todavía no hay reglas.</p> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {lista.map(r => (
              <div key={r.i} className="payment-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto', padding: '9px 12px' }}>
                <span className="name" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.remitente}</span>
                <span className="date">→ {r.nombre}</span>
                <button type="button" className="icon-btn danger" aria-label="Quitar regla" onClick={() => quitar(r)}><I.Trash width={14} height={14} /></button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input style={{ ...campo, flex: '1 1 200px', width: 'auto' }} value={remitente} onChange={e => setRemitente(e.target.value)} placeholder="ana@colegio.es o @colegio.es" />
          <select style={{ ...campo, width: 'auto' }} value={a} onChange={e => setA(e.target.value)}>
            <option value="">A quién…</option>
            {companeros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <button type="button" className="btn btn-sm btn-primary" disabled={!remitente.trim() || !a} onClick={crear}>Añadir</button>
        </div>
      </div>
    </div>
  );
}

// Los correos programados de un buzón (#338): cuándo salen y cancelarlos.
function Programados({ buzon, showToast }) {
  const [lista, setLista] = useState(null);
  const cargar = useCallback(() => api(`/api/admin/bandeja/${buzon}/programados`).then(d => setLista(d.programados)).catch(e => { alert(e.message); setLista([]); }), [buzon]);
  useEffect(() => { cargar(); }, [cargar]);
  async function cancelar(x) {
    if (!window.confirm(`¿Cancelar «${x.asunto}»? No saldrá.`)) return;
    try { await api(`/api/admin/bandeja/${buzon}/programados/${x.id}`, { method: 'DELETE' }); showToast?.('Cancelado.'); cargar(); } catch (e) { alert(e.message); }
  }
  if (lista === null) return <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Cargando…</p>;
  if (!lista.length) return <div className="panel" style={{ textAlign: 'center', color: 'var(--ink-3)' }}>No hay correos programados. Al escribir uno, marca «Programar el envío».</div>;
  const estado = { pendiente: ['upcoming', 'Saldrá'], enviando: ['upcoming', 'Saliendo'], enviado: ['ok', 'Enviado'], error: ['pending', 'Error'], cancelado: ['upcoming', 'Cancelado'] };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {lista.map(x => (
        <div key={x.id} className="payment-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
          <div style={{ minWidth: 0 }}>
            <div className="name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.asunto}</div>
            <div className="date" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Para: {x.para}{x.adjuntos ? ` · 📎 ${x.adjuntos}` : ''}{!x.mio && x.autor ? ` · lo programó ${x.autor}` : ''}{x.error ? ` · ${x.error}` : ''}</div>
          </div>
          <span className={`status-pill ${(estado[x.estado] || estado.pendiente)[0]}`}>{(estado[x.estado] || estado.pendiente)[1]} {x.estado === 'enviado' ? fechaLarga(x.enviado) : x.estado === 'pendiente' ? fechaLarga(x.cuando) : ''}</span>
          {x.estado === 'pendiente' ? <button type="button" className="btn btn-sm btn-outline" onClick={() => cancelar(x)}>Cancelar</button> : <span />}
        </div>
      ))}
    </div>
  );
}

// Escribir un correo desde otra pantalla (#382: contestar una consulta web desde
// el CRM). Sale por el correo de la web, como desde «Correo», con el general
// primero. Si quien escribe no tiene ningún buzón, se abre su programa de correo.
export function EscribirCorreo({ para, asunto, texto = '', onCerrar, onEnviado, showToast }) {
  const [info, setInfo] = useState(null);
  const [buzon, setBuzon] = useState(null);
  useEffect(() => {
    api('/api/admin/bandeja/buzones').then(d => { setInfo(d); setBuzon(d.buzones?.[0]?.id || null); }).catch(() => setInfo({ buzones: [] }));
  }, []);
  useEffect(() => {
    if (info && !info.buzones?.length) {
      window.location.href = `mailto:${para}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;
      onCerrar();
    }
  }, [info]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!info || !buzon) return null;
  const inicial = { modo: 'nuevo', para, cc: '', asunto, texto, desde: info.buzones.find(b => b.id === buzon)?.email, adjuntos: [] };
  return <Redactar inicial={inicial} buzon={buzon} buzones={info.buzones} onBuzon={setBuzon} showToast={showToast} onCerrar={onCerrar} onEnviado={onEnviado} />;
}

export default function AdminBandeja({ showToast, onAbrirFicha }) {
  const [info, setInfo] = useState(null);
  const [buzon, setBuzon] = useState('general');
  const [vista, setVista] = useState('entrada');
  const [q, setQ] = useState('');
  const [buscar, setBuscar] = useState('');
  const [pagina, setPagina] = useState(0);
  const [lista, setLista] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [imagenes, setImagenes] = useState(false);
  const [redactar, setRedactar] = useState(null);
  const [verReglas, setVerReglas] = useState(false);
  // Al asignar: «y todos los de este remitente» (#339).
  const [siempre, setSiempre] = useState(false);

  useEffect(() => {
    api('/api/admin/bandeja/buzones').then(d => { setInfo(d); if (d.buzones[0]) setBuzon(d.buzones[0].id); }).catch(e => setInfo({ buzones: [], error: e.message }));
  }, []);
  const actual = info?.buzones.find(b => b.id === buzon);
  const yo = info?.companeros.find(c => c.yo);

  const cargar = useCallback(async () => {
    if (!actual || vista === 'programados') return;
    setError(null);
    try {
      const d = await api(`/api/admin/bandeja/${buzon}/mensajes?vista=${vista}&pagina=${pagina}&q=${encodeURIComponent(buscar)}`);
      setLista(d.mensajes); setTotal(d.total);
    } catch (e) { setError(e.message); setLista([]); }
  }, [actual, buzon, vista, pagina, buscar]);
  useEffect(() => { setLista(null); cargar(); }, [cargar]);
  useEffect(() => { setSel(null); setDetalle(null); setPagina(0); }, [buzon, vista, buscar]);

  async function abrir(m) {
    setSel(m.uid); setDetalle(null); setImagenes(false);
    try {
      const d = await api(`/api/admin/bandeja/${buzon}/mensajes/${m.uid}?vista=${vista}`);
      setDetalle(d);
      if (!d.leido) {
        api(`/api/admin/bandeja/${buzon}/mensajes/${m.uid}/accion`, { method: 'POST', body: { accion: 'leido', vista } }).catch(() => {});
        setLista(l => l?.map(x => (x.uid === m.uid ? { ...x, leido: true } : x)));
      }
    } catch (e) { alert(e.message); setSel(null); }
  }
  async function accion(nombre, extra = {}, aviso) {
    try {
      const d = await api(`/api/admin/bandeja/${buzon}/mensajes/${detalle.uid}/accion`, { method: 'POST', body: { accion: nombre, vista, ...extra } });
      if (aviso) showToast?.(aviso);
      // Lo hecho sale de la entrada (es archivarlo, #384) y lo reabierto, de «Hechos».
      if (['archivar', 'papelera', 'no_spam'].includes(nombre) || (nombre === 'hecho' && vista !== 'hechos')
        || (['reabrir', 'asignar'].includes(nombre) && vista === 'hechos') || (nombre === 'asignar' && vista === 'sin_asignar')) {
        // Sale de la lista: se abre el siguiente (o el anterior si era el último),
        // para no tener que ir pinchando uno a uno (#337).
        const i = (lista || []).findIndex(x => x.uid === detalle.uid);
        const siguiente = lista?.[i + 1] || lista?.[i - 1] || null;
        setLista(l => l?.filter(x => x.uid !== detalle.uid));
        if (siguiente) abrir(siguiente); else { setDetalle(null); setSel(null); }
      } else {
        const cambio = nombre === 'asignar' ? { asignado: d.asignado, hecho: false } : nombre === 'hecho' ? { hecho: true } : nombre === 'reabrir' ? { hecho: false } : nombre === 'no_leido' ? { leido: false } : {};
        setDetalle(x => ({ ...x, ...cambio }));
        setLista(l => l?.map(x => (x.uid === detalle.uid ? { ...x, ...cambio } : x)));
        // Marcado como hecho: ya está atendido, se pasa al siguiente (#337).
        if (nombre === 'hecho') {
          const i = (lista || []).findIndex(x => x.uid === detalle.uid);
          if (lista?.[i + 1]) abrir(lista[i + 1]);
        }
      }
    } catch (e) { alert(e.message); }
  }
  function escribir(modo, extra = {}) {
    const base = { modo, para: '', cc: '', asunto: '', texto: '', desde: actual?.email, adjuntos: [] };
    if (!detalle || modo === 'nuevo') return setRedactar({ ...base, ...extra });
    const conPrefijo = (p) => (new RegExp(`^${p}:`, 'i').test(detalle.asunto) ? detalle.asunto : `${p}: ${detalle.asunto}`);
    const propio = (e) => e && e.toLowerCase() !== actual?.email;
    const origen = { uid: detalle.uid, vista };
    if (modo === 'responder') setRedactar({ ...base, origen, para: detalle.responderA || detalle.de?.email || '', asunto: conPrefijo('Re'), ...extra });
    else if (modo === 'responder_todos') {
      const para = [detalle.responderA || detalle.de?.email, ...detalle.para.map(x => x.email)].filter(propio);
      setRedactar({ ...base, origen, para: [...new Set(para)].join(', '), cc: detalle.cc.map(x => x.email).filter(propio).join(', '), asunto: conPrefijo('Re'), ...extra });
    } else setRedactar({ ...base, origen, asunto: conPrefijo('Rv'), ...extra });
  }

  if (!info) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  if (!info.buzones.length) {
    return (
      <div className="panel" style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ margin: 0 }}><I.Mail /> Correo</h2>
        <p style={{ margin: 0, color: 'var(--ink-2)' }}>{info.error || 'Todavía no hay ningún buzón conectado.'} Los pasos para conectarlos están en el ticket #317.</p>
      </div>
    );
  }
  const vistas = VISTAS[buzon] || VISTAS.mio;
  const companeros = (info.companeros || []);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Buzón" style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--bg-2)', padding: 3, gap: 2 }}>
          {info.buzones.map(b => <button key={b.id} type="button" role="tab" aria-selected={buzon === b.id} style={pastilla(buzon === b.id)} onClick={() => { setBuzon(b.id); setVista('entrada'); }}>{b.nombre} · {b.email}</button>)}
        </div>
        <div style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--bg-2)', padding: 3, gap: 2, flexWrap: 'wrap' }}>
          {vistas.map(([id, t]) => <button key={id} type="button" style={pastilla(vista === id)} onClick={() => setVista(id)}>{t}</button>)}
        </div>
        <form onSubmit={e => { e.preventDefault(); setBuscar(q.trim()); }} style={{ display: 'flex', gap: 6, flex: '1 1 220px' }}>
          <input style={{ ...campo, borderRadius: 999 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar (como en Gmail: de:, asunto:…)" />
        </form>
        <button type="button" className="btn btn-sm btn-outline" onClick={cargar} title="Actualizar">↻</button>
        {buzon === 'general' && <button type="button" className="btn btn-sm btn-outline" onClick={() => setVerReglas(true)} title="Correos de un remitente que van siempre a la misma persona">Reglas</button>}
        <button type="button" className="btn btn-sm btn-primary" onClick={() => escribir('nuevo')}><I.Plus width={14} height={14} /> Escribir</button>
      </div>
      {!info.tengoBuzon && buzon === 'general' && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Tu buzón ({info.miCorreo}) no está conectado: cuando IT lo conecte (ticket #317), saldrá aquí al lado del general.</p>
      )}

      {vista === 'programados' ? <Programados buzon={buzon} showToast={showToast} /> : (
      <div className={`bandeja${detalle || sel ? ' con-detalle' : ''}`}>
        <section className="bandeja-lista">
          {error && <p style={{ color: '#c62828', fontSize: 13, padding: 12, margin: 0 }}>{error}</p>}
          {lista === null ? <p style={{ color: 'var(--ink-3)', fontSize: 13, padding: 12 }}>Cargando…</p>
            : lista.length === 0 && !error ? <p style={{ color: 'var(--ink-3)', fontSize: 13, padding: 12 }}>{vista === 'mios' ? 'No tienes correos asignados pendientes.' : vista === 'spam' ? 'No hay nada en el spam.' : vista === 'hechos' ? 'Todavía no hay correos hechos.' : 'No hay correos aquí.'}</p>
              : lista.map(m => (
                <button key={m.uid} type="button" onClick={() => abrir(m)} className={`bandeja-fila${sel === m.uid ? ' on' : ''}`}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: m.leido ? 600 : 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {!m.leido && <span aria-label="Sin leer" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: 'var(--purple)', marginRight: 6, verticalAlign: 'middle' }} />}
                      {vista === 'enviados' ? `Para: ${m.para.map(nombreDe).join(', ')}` : nombreDe(m.de)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>{m.adjuntos ? '📎 ' : ''}{fechaLista(m.fecha)}</span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: m.leido ? 400 : 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink-2)' }}>{m.asunto}</span>
                  {/* En el general, cada correo dice de un vistazo si es de alguien o está por repartir (#384). */}
                  {buzon === 'general' && !['enviados', 'spam'].includes(vista) ? (
                    <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {m.asignado
                        ? <span style={chipFila('var(--purple)')}>→ {m.asignado.nombre.split(' ')[0]}{m.asignado.porRegla ? ' (regla)' : ''}</span>
                        : <span style={chipFila('var(--orange)')}>Sin asignar</span>}
                      {m.hecho && <span style={chipFila('var(--teal)')}>✓ Hecho</span>}
                    </span>
                  ) : (m.asignado || m.hecho) && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: m.hecho ? 'var(--teal)' : 'var(--purple)' }}>
                      {m.hecho ? '✓ Hecho' : ''}{m.hecho && m.asignado ? ' · ' : ''}{m.asignado ? `→ ${m.asignado.nombre.split(' ')[0]}` : ''}
                    </span>
                  )}
                </button>
              ))}
          {total > (pagina + 1) * 30 && <button type="button" className="btn btn-sm btn-outline" style={{ margin: 10 }} onClick={() => setPagina(p => p + 1)}>Más antiguos →</button>}
          {pagina > 0 && <button type="button" className="btn btn-sm btn-outline" style={{ margin: 10 }} onClick={() => setPagina(p => p - 1)}>← Más recientes</button>}
        </section>

        <section className="bandeja-detalle">
          {!sel ? <p style={{ color: 'var(--ink-3)', fontSize: 13, margin: 'auto' }}>Elige un correo de la lista.</p>
            : !detalle ? <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Abriendo…</p> : (
              <>
                <div style={{ display: 'grid', gap: 6 }}>
                  <button type="button" className="bandeja-volver" onClick={() => { setSel(null); setDetalle(null); }}>← Volver a la lista</button>
                  <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.3 }}>{detalle.asunto}</h2>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    <b>{nombreDe(detalle.de)}</b> <span style={{ color: 'var(--ink-3)' }}>&lt;{detalle.de?.email}&gt;</span>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Para: {detalle.para.map(nombreDe).join(', ')}{detalle.cc.length ? ` · CC: ${detalle.cc.map(nombreDe).join(', ')}` : ''} · {fechaLarga(detalle.fecha)}</div>
                  </div>
                  {detalle.ficha && (
                    <button type="button" onClick={() => onAbrirFicha?.({ id: detalle.ficha.id })} style={{ justifySelf: 'start', border: '1px solid var(--line)', background: 'var(--bg-3)', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
                      <I.User width={13} height={13} /> Es de la ficha de {detalle.ficha.nombre} → abrir
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => escribir('responder')}>Responder</button>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => escribir('responder_todos')}>A todos</button>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => escribir('reenviar')}>Reenviar</button>
                    {vista === 'spam' ? (
                      <button type="button" className="btn btn-sm btn-outline" title="Vuelve a la entrada y Gmail aprende que este remitente es de fiar" onClick={() => accion('no_spam', {}, 'Devuelto a la entrada.')}>No es spam</button>
                    ) : buzon === 'general' ? (
                      <>
                        <select value={detalle.asignado?.id || ''} onChange={async e => {
                          const a = e.target.value || null;
                          const nombre = companeros.find(c => String(c.id) === e.target.value)?.nombre;
                          if (a && siempre && detalle.de?.email) {
                            try { await api('/api/admin/bandeja/general/reglas', { method: 'POST', body: { remitente: detalle.de.email, a } }); }
                            catch (err) { alert(err.message); }
                          }
                          accion('asignar', { a }, a ? `Asignado a ${nombre}${siempre ? `, y a partir de ahora todos los de ${detalle.de?.email}` : ''}.` : 'Ya no está asignado.');
                          setSiempre(false);
                        }}
                          style={{ ...campo, width: 'auto', padding: '6px 8px', fontWeight: 700 }} aria-label="Asignar a">
                          <option value="">Asignar a…</option>
                          {companeros.map(c => <option key={c.id} value={c.id}>{c.yo ? `Mí (${c.nombre.split(' ')[0]})` : c.nombre}</option>)}
                        </select>
                        <label title="Los próximos correos de este remitente se le asignarán solos" style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={siempre} onChange={e => setSiempre(e.target.checked)} /> y todos los de este remitente
                        </label>
                        {detalle.hecho
                          ? <button type="button" className="btn btn-sm btn-outline" onClick={() => accion('reabrir', {}, 'Vuelve a estar pendiente.')}>Reabrir</button>
                          : <button type="button" className="btn btn-sm btn-outline" title="Sale de la entrada y queda en «Hechos»" onClick={() => accion('hecho', {}, 'Hecho: está en «Hechos».')}>✓ Hecho</button>}
                      </>
                    ) : (
                      <select value="" onChange={e => { const c = companeros.find(x => String(x.id) === e.target.value); if (c) escribir('reenviar', { para: c.email, texto: `Hola ${c.nombre.split(' ')[0]}, te paso este correo.\n` }); }}
                        style={{ ...campo, width: 'auto', padding: '6px 8px', fontWeight: 700 }} aria-label="Pasar a un compañero">
                        <option value="">Pasar a…</option>
                        {companeros.filter(c => !c.yo).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    )}
                    {vista !== 'enviados' && vista !== 'spam' && <button type="button" className="btn btn-sm btn-outline" onClick={() => accion('archivar', {}, 'Archivado (sigue en Gmail, en «Todos»).')}>Archivar</button>}
                    <button type="button" className="btn btn-sm btn-outline" title="Marcar como no leído" onClick={() => accion('no_leido', {}, 'Marcado como no leído.')}>No leído</button>
                    <button type="button" className="btn btn-sm btn-outline" title="A la papelera" onClick={() => { if (window.confirm('¿Mandar este correo a la papelera?')) accion('papelera', {}, 'En la papelera.'); }}><I.Trash width={14} height={14} /></button>
                  </div>
                  {(detalle.asignado || detalle.hecho) && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: detalle.hecho ? 'var(--teal)' : 'var(--purple)' }}>
                      {detalle.asignado ? `Asignado a ${detalle.asignado.nombre}` : ''}{detalle.hecho ? `${detalle.asignado ? ' · ' : ''}✓ Hecho` : ''}
                    </div>
                  )}
                  {detalle.html && !imagenes && /<img[^>]+src=["']?https?:/i.test(detalle.html) && (
                    <button type="button" onClick={() => setImagenes(true)} style={{ justifySelf: 'start', border: 0, background: 'none', color: 'var(--purple)', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      Este correo tiene imágenes de fuera: mostrarlas
                    </button>
                  )}
                </div>
                <Cuerpo html={detalle.html} texto={detalle.texto} imagenes={imagenes} />
                {detalle.adjuntos.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {detalle.adjuntos.map(a => (
                      <a key={a.i} href={`/api/admin/bandeja/${buzon}/mensajes/${detalle.uid}/adjunto/${a.i}?vista=${vista}`} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-3)', color: 'var(--ink)', textDecoration: 'none', fontWeight: 600 }}>
                        📎 {a.nombre} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· {tam(a.bytes)}</span>
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}
        </section>
      </div>

      )}
      {verReglas && <Reglas companeros={companeros} showToast={showToast} onCerrar={() => { setVerReglas(false); cargar(); }} />}
      {redactar && <Redactar inicial={redactar} buzon={buzon} showToast={showToast} onCerrar={() => setRedactar(null)} onEnviado={() => { setRedactar(null); if (vista === 'enviados') cargar(); }} />}
      <style>{ESTILO_BANDEJA}</style>
    </div>
  );
}
