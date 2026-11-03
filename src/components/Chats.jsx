import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Mensajes: el chat interno. El mismo para el panel (ambito 'equipo': privados,
// grupos y, al Equipo IT, lo que habla con cualquiera de la web) y para el área
// de familias (ambito 'familia': lo que le escribe el Equipo IT).
// Se mandan textos, imágenes, archivos (hasta 10 MB) y notas de voz, y queda
// todo guardado. Cada mensaje se puede responder (citarlo), reaccionar y, lo
// suyo, editar o borrar; en los grupos, mencionar con @ y ver quién lo ha leído.
// Lo nuevo llega al momento por /ws/chats; si esa conexión se corta, se
// pregunta cada pocos segundos como antes.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ARCHIVO = 10 * 1024 * 1024;
const MAX_VOZ_MS = 5 * 60 * 1000;
const REACCIONES = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const jsonDe = (r) => r.json().catch(() => ({}));
const pedir = async (url, o = {}) => {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', ...o });
  const d = await jsonDe(r);
  if (!r.ok) throw new Error(d.error || 'No se ha podido hacer.');
  return d;
};
const conJson = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const hora = (f) => new Date(f).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const diaDe = (f) => new Date(f).toLocaleDateString('sv-SE');
function nombreDia(f) {
  const d = diaDe(f), hoy = diaDe(new Date()), ayer = diaDe(new Date(Date.now() - 86400000));
  if (d === hoy) return 'Hoy';
  if (d === ayer) return 'Ayer';
  return new Date(f).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: d.slice(0, 4) === hoy.slice(0, 4) ? undefined : 'numeric' });
}
// En la lista: la hora si es de hoy; si no, el día.
const cuandoCorto = (f) => (!f ? '' : diaDe(f) === diaDe(new Date()) ? hora(f) : nombreDia(f) === 'Ayer' ? 'Ayer' : new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }));
const tamano = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const iniciales = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?';
const minSeg = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const escRe = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NOMBRE_RANGO = { student: 'Alumno', trabajador: 'Trabajador', instructor: 'Instructor', secretaria: 'Secretaría', club_owner: 'Dirección', it_junior: 'IT Junior', equipo_it: 'Equipo IT', superadmin: 'Equipo IT' };

// El texto de un mensaje: los enlaces, pulsables, y las menciones (@Nombre), resaltadas.
function ConFormato({ texto, nombres = [] }) {
  const reMencion = nombres.length ? new RegExp(`(@(?:${[...nombres].sort((a, b) => b.length - a.length).map(escRe).join('|')}))`, 'g') : null;
  const trozos = String(texto).split(/(https?:\/\/[^\s<]+)/g);
  return trozos.map((t, i) => {
    if (i % 2) return <a key={i} href={t} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', wordBreak: 'break-all' }}>{t}</a>;
    if (!reMencion) return <React.Fragment key={i}>{t}</React.Fragment>;
    return t.split(reMencion).map((x, j) => (j % 2
      ? <b key={`${i}-${j}`} style={{ color: 'var(--purple)' }}>{x}</b>
      : <React.Fragment key={`${i}-${j}`}>{x}</React.Fragment>));
  });
}

// Una foto grande se achica antes de subirla (a 1600 px y JPEG): llega igual de
// bien y no llena la base de datos (el servidor lo vuelve a mirar). Los GIF, tal cual.
async function prepararArchivo(f) {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 400 * 1024) return f;
  try {
    const img = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    if (k === 1 && f.size < 1024 * 1024) return f;
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
    if (!b || b.size >= f.size) return f;
    return new File([b], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return f; }
}

// La conexión directa con el servidor (/ws/chats): avisa de que algo ha
// cambiado en una conversación. Si se corta, vuelve a intentarlo (cada vez más
// espaciado) y, al volver, pide que se mire todo por si se perdió algo.
function useAlMomento(onAviso) {
  const [vivo, setVivo] = useState(false);
  const cb = useRef(onAviso);
  cb.current = onAviso;
  useEffect(() => {
    if (typeof WebSocket === 'undefined') return undefined;
    let ws = null, cerrado = false, espera = 1000, t = null, abiertaUnaVez = false;
    const programar = () => { if (cerrado) return; clearTimeout(t); t = setTimeout(abrir, espera); espera = Math.min(espera * 2, 60000); };
    function abrir() {
      if (cerrado) return;
      try { ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/chats`); } catch { programar(); return; }
      ws.onopen = () => { espera = 1000; setVivo(true); if (abiertaUnaVez) cb.current({ todo: true }); abiertaUnaVez = true; };
      ws.onmessage = (e) => { try { const d = JSON.parse(e.data); if (d.chat) cb.current(d); } catch { /* nada */ } };
      ws.onclose = () => { setVivo(false); programar(); };
      ws.onerror = () => { try { ws.close(); } catch { /* nada */ } };
    }
    abrir();
    const alVolver = () => { if (!document.hidden && (!ws || ws.readyState > 1)) { espera = 1000; programar(); } };
    document.addEventListener('visibilitychange', alVolver);
    return () => { cerrado = true; clearTimeout(t); document.removeEventListener('visibilitychange', alVolver); try { ws?.close(); } catch { /* nada */ } };
  }, []);
  return vivo;
}

function Avatar({ nombre, tipo, size = 38 }) {
  const fondo = tipo === 'grupo' ? 'var(--purple)' : tipo === 'it' ? 'var(--teal)' : 'var(--orange)';
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: `color-mix(in oklab, ${fondo} 22%, var(--bg-3))`, color: fondo, fontWeight: 800, fontSize: size * 0.36 }}>
      {tipo === 'grupo' ? <I.Users width={size * 0.5} height={size * 0.5} /> : iniciales(nombre)}
    </span>
  );
}

function Modal({ titulo, onCerrar, children, ancho = 460 }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: ancho, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', padding: 22, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, flex: 1 }}>{titulo}</h3>
          <button type="button" className="icon-btn" onClick={onCerrar} aria-label="Cerrar"><I.X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Elegir personas: el personal (lista entera, se filtra aquí) o, con «todos», a
// cualquiera de la web buscando en el servidor.
function ElegirPersonas({ todos = false, varias = false, elegidas = [], onCambio, quitar = [] }) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    if (todos && q.trim().length < 2) { setLista([]); return undefined; }
    let vivo = true;
    const t = setTimeout(async () => {
      setCargando(true);
      try {
        const d = await pedir(`/api/chats/personas?${todos ? `todos=1&q=${encodeURIComponent(q.trim())}` : ''}`);
        if (vivo) setLista(d.personas || []);
      } catch { if (vivo) setLista([]); }
      finally { if (vivo) setCargando(false); }
    }, todos ? 250 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [todos, todos ? q : '']); // eslint-disable-line react-hooks/exhaustive-deps
  const fuera = new Set(quitar.map(String));
  const plano = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const vistas = lista.filter(p => !fuera.has(String(p.id)))
    .filter(p => todos || !q.trim() || plano(`${p.nombre} ${p.email}`).includes(plano(q.trim())));
  const marcada = (id) => elegidas.some(e => String(e.id) === String(id));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={todos ? 'Nombre o correo (mínimo 2 letras)…' : 'Buscar…'}
        style={{ fontFamily: 'inherit', fontSize: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }} />
      <div style={{ maxHeight: 280, overflowY: 'auto', display: 'grid', gap: 4 }}>
        {vistas.map(p => (
          <button key={p.id} type="button" onClick={() => onCambio(varias ? (marcada(p.id) ? elegidas.filter(e => String(e.id) !== String(p.id)) : [...elegidas, p]) : p)}
            style={{ display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', padding: '7px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${marcada(p.id) ? 'var(--teal)' : 'var(--line)'}`, background: marcada(p.id) ? 'color-mix(in oklab, var(--teal) 10%, var(--bg-2))' : 'var(--bg-2)', color: 'var(--ink)' }}>
            {varias && <input type="checkbox" readOnly checked={marcada(p.id)} style={{ accentColor: 'var(--teal)' }} tabIndex={-1} />}
            <Avatar nombre={p.nombre} tipo="privado" size={30} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13, display: 'block' }}>{p.nombre}</b>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{[NOMBRE_RANGO[p.rango] || (p.personal ? 'Personal' : 'Familia / alumno'), todos ? p.email : null].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        ))}
        {!vistas.length && (
          <span style={{ fontSize: 13, color: 'var(--ink-3)', padding: 6 }}>
            {cargando ? 'Buscando…' : todos && q.trim().length < 2 ? 'Escribe para buscar a cualquiera de la web.' : 'Nadie con ese nombre.'}
          </span>
        )}
      </div>
    </div>
  );
}

// Un resultado de la búsqueda, con lo buscado resaltado.
function Resaltar({ texto, q }) {
  const t = String(texto || '');
  const i = t.toLowerCase().indexOf(String(q || '').toLowerCase());
  if (!q || i < 0) return t.slice(0, 120);
  const ini = Math.max(0, i - 40);
  return <>{ini ? '…' : ''}{t.slice(ini, i)}<mark style={{ background: 'color-mix(in oklab, var(--yellow, #FFD526) 60%, transparent)', color: 'inherit', borderRadius: 3 }}>{t.slice(i, i + q.length)}</mark>{t.slice(i + q.length, i + q.length + 80)}</>;
}

export default function Chats({ ambito = 'equipo', showToast }) {
  const equipo = ambito === 'equipo';
  const avisar = (t) => (showToast ? showToast(t) : window.alert(t));
  const [chats, setChats] = useState(null);
  const [puede, setPuede] = useState({});
  const [abierto, setAbierto] = useState(() => { try { return Number(new URLSearchParams(window.location.search).get('chat')) || null; } catch { return null; } });
  const [conv, setConv] = useState(null);       // { chat, mensajes, leidoHasta, hayMas }
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [subiendo, setSubiendo] = useState([]);  // nombres de lo que se está subiendo
  const [nuevo, setNuevo] = useState(null);      // 'privado' | 'grupo' | 'it'
  const [gestionar, setGestionar] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [encontrados, setEncontrados] = useState(null);   // mensajes que casan con la búsqueda de la lista
  const [encima, setEncima] = useState(false);   // arrastrando un archivo encima
  const [estrecho, setEstrecho] = useState(() => typeof window !== 'undefined' && window.innerWidth < 760);
  const [respondiendo, setRespondiendo] = useState(null);  // el mensaje al que se contesta
  const [editando, setEditando] = useState(null);          // el mensaje propio que se cambia
  const [menuDe, setMenuDe] = useState(null);              // id del mensaje con sus acciones abiertas
  const [sobre, setSobre] = useState(null);                // id del mensaje con el ratón encima
  const [resaltado, setResaltado] = useState(null);        // el mensaje al que se ha saltado
  const [opciones, setOpciones] = useState(false);         // el menú «⋯» de la conversación
  const [buscarAqui, setBuscarAqui] = useState(null);      // null | { q, resultados }
  const [leidoPor, setLeidoPor] = useState(null);          // { m, datos } (en los grupos)
  const [mencionados, setMencionados] = useState([]);      // [{ id, nombre }] elegidos con @
  const [sugerencias, setSugerencias] = useState(null);    // { desde, lista } mientras se escribe @…
  const [grabando, setGrabando] = useState(null);          // cuándo empezó la nota de voz
  const [tic, setTic] = useState(0);
  const fondoRef = useRef(null), archivoRef = useRef(null), ultimoRef = useRef(0), listoRef = useRef(false), pegadoRef = useRef(true), textoRef = useRef(null);
  const cambiosRef = useRef(null), traerRef = useRef(null), convRef = useRef(null), abiertoRef = useRef(abierto), objetivoRef = useRef(null), grabRef = useRef(null), listaT = useRef(null);
  convRef.current = conv;
  abiertoRef.current = abierto;

  useEffect(() => {
    const f = () => setEstrecho(window.innerWidth < 760);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  const cargarLista = useCallback(async () => {
    try {
      const d = await pedir(`/api/chats?ambito=${ambito}`);
      setChats(d.chats || []); setPuede(d.puede || {});
      // En el área, si solo hay una conversación, se abre directamente.
      if (!equipo && !abiertoRef.current && d.chats?.length === 1 && !estrecho) setAbierto(d.chats[0].id);
    } catch (e) { setChats(c => c || []); }
  }, [ambito]); // eslint-disable-line react-hooks/exhaustive-deps
  const listaPronto = () => { clearTimeout(listaT.current); listaT.current = setTimeout(cargarLista, 400); };

  // Al momento: un aviso de la conversación abierta trae lo nuevo; de cualquiera, la lista.
  const vivo = useAlMomento((d) => {
    if (d.todo || d.chat === abiertoRef.current) traerRef.current?.();
    listaPronto();
  });

  // Por si la conexión directa no va: cada 15 s (si va, cada minuto, por si acaso).
  useEffect(() => {
    cargarLista();
    const t = setInterval(() => { if (!document.hidden) cargarLista(); }, vivo ? 60000 : 15000);
    return () => clearInterval(t);
  }, [cargarLista, vivo]);

  // La dirección lleva la conversación abierta (?chat=), para el aviso del móvil y el botón atrás.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (abierto) u.searchParams.set('chat', abierto); else u.searchParams.delete('chat');
      u.searchParams.delete('aviso'); u.searchParams.delete('n');
      window.history.replaceState(window.history.state, '', u.pathname + u.search);
    } catch { /* noop */ }
  }, [abierto]);

  const bajar = (suave) => requestAnimationFrame(() => { const el = fondoRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: suave ? 'smooth' : 'auto' }); });
  const reemplazar = (m) => setConv(c => (c ? { ...c, mensajes: c.mensajes.map(x => (x.id === m.id ? m : x)) } : c));

  // La conversación abierta: entera al abrirla y, luego, lo nuevo y lo cambiado.
  useEffect(() => {
    setRespondiendo(null); setEditando(null); setMenuDe(null); setBuscarAqui(null); setOpciones(false); setMencionados([]); setSugerencias(null);
    if (!abierto) { setConv(null); traerRef.current = null; return undefined; }
    let vivoAqui = true;
    setConv(null); ultimoRef.current = 0; listoRef.current = false; pegadoRef.current = true; cambiosRef.current = null;
    (async () => {
      try {
        const d = await pedir(`/api/chats/${abierto}`);
        if (!vivoAqui) return;
        setConv(d); convRef.current = d;
        ultimoRef.current = d.mensajes.at(-1)?.id || 0; cambiosRef.current = d.ahora; listoRef.current = true;
        setChats(l => (l || []).map(c => (c.id === abierto ? { ...c, sinLeer: 0, menciones: 0 } : c)));
        if (objetivoRef.current) { const o = objetivoRef.current; objetivoRef.current = null; irA(o); } else bajar(false);
      } catch (e) { if (vivoAqui) { avisar(e.message); setAbierto(null); } }
    })();
    let enCurso = false;
    const traer = async () => {
      if (document.hidden || !listoRef.current || enCurso) return;
      enCurso = true;
      try {
        const d = await pedir(`/api/chats/${abierto}?desde=${ultimoRef.current}${cambiosRef.current ? `&cambios=${encodeURIComponent(cambiosRef.current)}` : ''}`);
        if (!vivoAqui) return;
        if (d.ahora) cambiosRef.current = d.ahora;
        const nuevos = d.mensajes || [], cambiados = d.cambiados || [];
        if (nuevos.length) ultimoRef.current = nuevos.at(-1).id;
        if (nuevos.length || cambiados.length || convRef.current?.leidoHasta !== d.leidoHasta) {
          setConv(c => {
            if (!c) return c;
            const porId = new Map(cambiados.map(m => [m.id, m]));
            const viejos = c.mensajes.map(x => porId.get(x.id) || x);
            return { ...c, mensajes: [...viejos, ...nuevos.filter(m => !viejos.some(x => x.id === m.id))], leidoHasta: d.leidoHasta };
          });
        }
        if (nuevos.length) { if (pegadoRef.current) bajar(true); listaPronto(); }
      } catch { /* la próxima vez */ }
      finally { enCurso = false; }
    };
    traerRef.current = traer;
    // Al volver a la pestaña (o a la app), lo nuevo al momento.
    document.addEventListener('visibilitychange', traer);
    return () => { vivoAqui = false; document.removeEventListener('visibilitychange', traer); };
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps
  // Si la conexión directa no va, cada 4 s; si va, cada 30 s por si acaso.
  useEffect(() => {
    if (!abierto) return undefined;
    const t = setInterval(() => traerRef.current?.(), vivo ? 30000 : 4000);
    return () => clearInterval(t);
  }, [abierto, vivo]);

  async function verAnteriores() {
    const c = convRef.current, primero = c?.mensajes[0]?.id;
    if (!primero || !c.hayMas) return c;
    const el = fondoRef.current, alto = el?.scrollHeight || 0;
    try {
      const d = await pedir(`/api/chats/${abierto}?antes=${primero}`);
      const nuevo = { ...c, mensajes: [...d.mensajes.filter(m => !c.mensajes.some(x => x.id === m.id)), ...c.mensajes], hayMas: d.hayMas };
      convRef.current = nuevo;
      setConv(cc => (cc ? { ...cc, mensajes: [...d.mensajes.filter(m => !cc.mensajes.some(x => x.id === m.id)), ...cc.mensajes], hayMas: d.hayMas } : cc));
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - alto; });
      return nuevo;
    } catch (e) { avisar(e.message); return c; }
  }

  // Saltar a un mensaje (una cita o un resultado de la búsqueda): si es antiguo,
  // se traen los anteriores hasta llegar a él.
  async function irA(mid) {
    let c = convRef.current;
    for (let i = 0; c && !c.mensajes.some(m => m.id === mid) && c.hayMas && i < 30; i++) c = await verAnteriores();
    setTimeout(() => {
      const el = fondoRef.current?.querySelector(`[data-mensaje="${mid}"]`);
      if (!el) { avisar('Ese mensaje ya no está.'); return; }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setResaltado(mid); setTimeout(() => setResaltado(r => (r === mid ? null : r)), 2400);
    }, 60);
  }

  const anadir = (m) => {
    ultimoRef.current = Math.max(ultimoRef.current, m.id);
    setConv(c => (c && !c.mensajes.some(x => x.id === m.id) ? { ...c, mensajes: [...c.mensajes, m] } : c));
    pegadoRef.current = true; bajar(true);
    setChats(l => {
      const lista = (l || []).map(c => (c.id === abierto ? { ...c, fecha: m.fecha, ultimo: { texto: m.texto || (m.archivo ? (m.archivo.voz ? '🎤 Nota de voz' : `📎 ${m.archivo.nombre}`) : ''), mio: true } } : c));
      return lista.sort((a, b) => (b.fijado - a.fijado) || (new Date(b.fecha) - new Date(a.fecha)));
    });
  };

  // Las menciones que siguen en el texto (si se ha borrado el @Nombre, ya no).
  const mencionesDe = (t) => mencionados.filter(p => t.includes(`@${p.nombre}`)).map(p => p.id);

  async function enviar(e) {
    e?.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      if (editando) {
        const d = await pedir(`/api/chats/${abierto}/mensajes/${editando.id}`, conJson('PATCH', { texto: t, menciones: mencionesDe(t) }));
        reemplazar(d.mensaje); setEditando(null);
      } else {
        const d = await pedir(`/api/chats/${abierto}/mensajes`, conJson('POST', { texto: t, respondeA: respondiendo?.id || null, menciones: mencionesDe(t) }));
        anadir(d.mensaje); setRespondiendo(null);
      }
      setTexto(''); setMencionados([]); setSugerencias(null);
      if (textoRef.current) textoRef.current.style.height = 'auto';
      requestAnimationFrame(() => textoRef.current?.focus());
    } catch (err) { avisar(err.message); }
    finally { setEnviando(false); }
  }

  async function subir(lista) {
    const archivos = [...(lista || [])];
    if (!archivos.length || !abierto) return;
    let responde = respondiendo?.id || null;
    setRespondiendo(null);
    for (const original of archivos) {
      const f = await prepararArchivo(original);
      if (f.size > MAX_ARCHIVO) { avisar(`«${original.name}» pasa de 10 MB: no se puede mandar.`); continue; }
      const etiqueta = /^nota-de-voz/.test(f.name) ? 'la nota de voz' : f.name;
      setSubiendo(s => [...s, etiqueta]);
      try {
        const r = await fetch(`/api/chats/${abierto}/archivo?nombre=${encodeURIComponent(f.name)}${responde ? `&respondeA=${responde}` : ''}`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': (f.type || 'application/octet-stream').split(';')[0] }, body: f,
        });
        const d = await jsonDe(r);
        if (!r.ok) throw new Error(d.error || 'No se ha podido mandar.');
        anadir(d.mensaje); responde = null;
      } catch (err) { avisar(`«${original.name}»: ${err.message}`); }
      finally { setSubiendo(s => { const i = s.indexOf(etiqueta); return i < 0 ? s : [...s.slice(0, i), ...s.slice(i + 1)]; }); }
    }
  }

  // ── Notas de voz ──
  useEffect(() => {
    if (!grabando) return undefined;
    const t = setInterval(() => {
      setTic(x => x + 1);
      if (Date.now() - grabando > MAX_VOZ_MS) pararGrabar(true);
    }, 250);
    return () => clearInterval(t);
  }, [grabando]); // eslint-disable-line react-hooks/exhaustive-deps
  async function empezarGrabar() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { avisar('Este navegador no deja grabar audio.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(x => MediaRecorder.isTypeSupported?.(x)) || '';
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      const trozos = [];
      rec.ondataavailable = (e) => { if (e.data?.size) trozos.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const g = grabRef.current; grabRef.current = null; setGrabando(null);
        if (!g?.enviar) return;
        const mime = (rec.mimeType || tipo || 'audio/webm').split(';')[0];
        const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(trozos, { type: mime });
        if (blob.size < 1200 || Date.now() - g.inicio < 700) { avisar('La nota de voz es demasiado corta.'); return; }
        subir([new File([blob], `nota-de-voz-${Date.now()}.${ext}`, { type: mime })]);
      };
      rec.start(250);
      grabRef.current = { rec, enviar: false, inicio: Date.now() };
      setGrabando(Date.now());
    } catch { avisar('No se ha podido usar el micrófono: dale permiso en el navegador.'); }
  }
  function pararGrabar(enviarla) {
    const g = grabRef.current;
    if (!g) return;
    g.enviar = enviarla;
    try { g.rec.stop(); } catch { setGrabando(null); grabRef.current = null; }
  }
  useEffect(() => () => { if (grabRef.current) pararGrabar(false); }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cada mensaje: reaccionar, responder, editar, borrar, quién lo ha leído ──
  async function reaccionar(m, emoji) {
    setMenuDe(null);
    try { const d = await pedir(`/api/chats/${abierto}/mensajes/${m.id}/reaccion`, conJson('POST', { emoji })); reemplazar(d.mensaje); }
    catch (e) { avisar(e.message); }
  }
  function responder(m) {
    setMenuDe(null); setEditando(null); setRespondiendo(m);
    requestAnimationFrame(() => textoRef.current?.focus());
  }
  function editar(m) {
    setMenuDe(null); setRespondiendo(null); setEditando(m); setTexto(m.texto);
    const nombres = (conv?.chat?.miembros || []).filter(p => (m.menciones || []).includes(String(p.id)));
    setMencionados(nombres.map(p => ({ id: String(p.id), nombre: p.nombre })));
    requestAnimationFrame(() => { const el = textoRef.current; if (el) { el.focus(); el.style.height = 'auto'; el.style.height = `${Math.min(140, el.scrollHeight)}px`; } });
  }
  async function borrar(m) {
    setMenuDe(null);
    if (!window.confirm('¿Borrar este mensaje para todos? Quedará «Mensaje borrado».')) return;
    try { const d = await pedir(`/api/chats/${abierto}/mensajes/${m.id}`, { method: 'DELETE' }); reemplazar(d.mensaje); if (editando?.id === m.id) { setEditando(null); setTexto(''); } }
    catch (e) { avisar(e.message); }
  }
  async function verLeido(m) {
    setMenuDe(null);
    setLeidoPor({ m, datos: null });
    try { setLeidoPor({ m, datos: await pedir(`/api/chats/${abierto}/mensajes/${m.id}/leido`) }); }
    catch (e) { setLeidoPor(null); avisar(e.message); }
  }
  const cancelarEscribir = () => { setRespondiendo(null); if (editando) { setEditando(null); setTexto(''); setMencionados([]); } };

  // ── Silenciar y fijar ──
  async function cambiarYo(cambio) {
    setOpciones(false);
    try {
      await pedir(`/api/chats/${abierto}/yo`, conJson('PATCH', cambio));
      setConv(c => (c ? { ...c, chat: { ...c.chat, ...cambio } } : c));
      cargarLista();
      if (cambio.silenciado !== undefined) avisar(cambio.silenciado ? 'Silenciada: no te avisará, salvo si te mencionan.' : 'Ya te avisa otra vez.');
    } catch (e) { avisar(e.message); }
  }

  // ── Buscar ──
  useEffect(() => {
    const q = filtro.trim();
    if (q.length < 2) { setEncontrados(null); return undefined; }
    const t = setTimeout(() => { pedir(`/api/chats/buscar?ambito=${ambito}&q=${encodeURIComponent(q)}`).then(d => setEncontrados(d.resultados || [])).catch(() => setEncontrados([])); }, 300);
    return () => clearTimeout(t);
  }, [filtro, ambito]);
  useEffect(() => {
    const q = buscarAqui?.q?.trim() || '';
    if (!abierto || q.length < 2) { if (buscarAqui?.resultados) setBuscarAqui(b => (b ? { ...b, resultados: null } : b)); return undefined; }
    const t = setTimeout(() => {
      pedir(`/api/chats/buscar?ambito=${ambito}&chat=${abierto}&q=${encodeURIComponent(q)}`)
        .then(d => setBuscarAqui(b => (b && b.q === buscarAqui.q ? { ...b, resultados: d.resultados || [] } : b))).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [buscarAqui?.q, abierto]); // eslint-disable-line react-hooks/exhaustive-deps
  function abrirResultado(r) {
    if (r.chatId === abierto) { irA(r.id); return; }
    objetivoRef.current = r.id;
    setAbierto(r.chatId);
  }

  // ── Menciones: al escribir @ en un grupo, la lista de los que están ──
  const miembros = conv?.chat?.tipo === 'grupo' ? (conv.chat.miembros || []).filter(p => String(p.id) !== String(conv.chat.yo)) : [];
  function alEscribir(e) {
    const v = e.target.value;
    setTexto(v);
    e.target.style.height = 'auto'; e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px`;
    if (!miembros.length) return;
    const antes = v.slice(0, e.target.selectionStart);
    const m = /(^|\s)@([^\s@]{0,30})$/u.exec(antes);
    if (!m) { setSugerencias(null); return; }
    const q = m[2].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const lista = miembros.filter(p => p.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).some(x => x.startsWith(q)) || !q).slice(0, 6);
    setSugerencias(lista.length ? { desde: antes.length - m[2].length - 1, hasta: antes.length, lista } : null);
  }
  function elegirMencion(p) {
    const s = sugerencias;
    if (!s) return;
    const nuevoTexto = `${texto.slice(0, s.desde)}@${p.nombre} ${texto.slice(s.hasta)}`;
    setTexto(nuevoTexto);
    setMencionados(l => (l.some(x => x.id === String(p.id)) ? l : [...l, { id: String(p.id), nombre: p.nombre }]));
    setSugerencias(null);
    requestAnimationFrame(() => { const el = textoRef.current; if (el) { el.focus(); const pos = s.desde + p.nombre.length + 2; el.setSelectionRange(pos, pos); } });
  }

  async function empezar(cuerpo) {
    try {
      const d = await pedir('/api/chats', conJson('POST', cuerpo));
      setNuevo(null);
      await cargarLista();
      setAbierto(d.id);
    } catch (e) { avisar(e.message); }
  }

  const vistos = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return (chats || []).filter(c => !q || String(c.titulo).toLowerCase().includes(q));
  }, [chats, filtro]);
  const actual = (chats || []).find(c => c.id === abierto);
  const enLista = !estrecho || !abierto;
  const enConv = !estrecho || !!abierto;

  // ── La lista ──
  const lista = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: estrecho ? 0 : '1px solid var(--line)' }}>
      <div style={{ padding: 12, display: 'grid', gap: 8, borderBottom: '1px solid var(--line)' }}>
        {equipo && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {puede.privados && <button type="button" className="btn btn-sm btn-outline" onClick={() => setNuevo('privado')}><I.User width={14} height={14} /> Privado</button>}
            {puede.grupos && <button type="button" className="btn btn-sm btn-outline" onClick={() => setNuevo('grupo')}><I.Users width={14} height={14} /> Grupo</button>}
            {puede.it && <button type="button" className="btn btn-sm btn-primary" onClick={() => setNuevo('it')} title="Escribir a cualquier persona de la web como Equipo IT"><I.Plus width={14} height={14} /> A un usuario</button>}
          </div>
        )}
        {(chats || []).length > 0 && (
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar conversación o mensaje…" aria-label="Buscar" data-buscar-chats
            style={{ fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }} />
        )}
      </div>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {chats === null && <p style={{ padding: 16, color: 'var(--ink-3)', fontSize: 13 }}>Cargando…</p>}
        {chats && !vistos.length && !encontrados?.length && (
          <p style={{ padding: 16, color: 'var(--ink-3)', fontSize: 13, margin: 0 }}>
            {filtro.trim() ? (encontrados === null && filtro.trim().length >= 2 ? 'Buscando…' : 'Nada con eso.') : equipo ? 'Aún no tienes conversaciones. Empieza una con los botones de arriba.' : 'Aún no tienes mensajes.'}
          </p>
        )}
        {vistos.map(c => (
          <button key={c.id} type="button" data-chat={c.id} onClick={() => setAbierto(c.id)}
            style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left', padding: '10px 12px', border: 0, borderBottom: '1px solid var(--line)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)',
              background: c.id === abierto ? 'color-mix(in oklab, var(--teal) 10%, var(--bg-2))' : 'transparent' }}>
            <Avatar nombre={c.titulo} tipo={c.tipo === 'it' && c.conmigo ? 'it' : c.tipo} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <b style={{ fontSize: 14, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.titulo}</b>
                {c.fijado && <span title="Fijada arriba" aria-label="Fijada" style={{ fontSize: 11 }}>📌</span>}
                {c.silenciado && <span title="Silenciada" aria-label="Silenciada" style={{ fontSize: 11 }}>🔕</span>}
                <span style={{ fontSize: 11, color: c.sinLeer && !c.silenciado ? 'var(--teal)' : 'var(--ink-3)', fontWeight: c.sinLeer ? 800 : 500 }}>{cuandoCorto(c.fecha)}</span>
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--ink-3)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.tipo === 'it' && !c.conmigo && equipo ? <span style={{ color: 'var(--teal)', fontWeight: 700 }}>Equipo IT · </span> : null}
                  {c.ultimo ? `${c.ultimo.mio ? 'Tú: ' : c.tipo === 'grupo' && c.ultimo.autor ? `${c.ultimo.autor.split(' ')[0]}: ` : ''}${c.ultimo.texto}` : c.tipo === 'grupo' ? `${c.miembros} personas` : 'Sin mensajes todavía'}
                </span>
                {c.menciones > 0 && <span title="Te han mencionado" style={{ minWidth: 20, height: 20, borderRadius: 10, background: 'var(--purple)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center' }}>@</span>}
                {c.sinLeer > 0 && <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: c.silenciado ? 'var(--ink-3)' : 'var(--teal)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', padding: '0 6px' }}>{c.sinLeer}</span>}
              </span>
            </span>
          </button>
        ))}
        {encontrados?.length > 0 && (
          <div data-resultados-mensajes>
            <div style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Mensajes</div>
            {encontrados.map(r => (
              <button key={r.id} type="button" onClick={() => abrirResultado(r)}
                style={{ display: 'grid', gap: 2, width: '100%', textAlign: 'left', padding: '8px 12px', border: 0, borderBottom: '1px solid var(--line)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', background: 'transparent' }}>
                <span style={{ display: 'flex', gap: 6 }}>
                  <b style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo}</b>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{cuandoCorto(r.fecha)}</span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{r.tipo === 'grupo' && r.autor ? `${r.autor.split(' ')[0]}: ` : ''}<Resaltar texto={r.texto} q={filtro.trim()} /></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── La conversación ──
  const mensajes = conv?.mensajes || [];
  const leido = conv?.leidoHasta ? new Date(conv.leidoHasta) : null;
  const ultimoMio = [...mensajes].reverse().find(m => m.mio && !m.borrado);
  const nombresMiembros = (conv?.chat?.miembros || []).map(p => p.nombre);
  const yo = conv?.chat?.yo;
  const accion = (titulo, contenido, onClick, peligro) => (
    <button type="button" onClick={onClick} title={titulo} aria-label={titulo}
      style={{ border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '6px 8px', borderRadius: 8, color: peligro ? 'var(--danger, #dc2626)' : 'var(--ink)', whiteSpace: 'nowrap' }}>{contenido}</button>
  );
  const conversacion = !abierto ? (
    <div style={{ display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 14, padding: 24, textAlign: 'center' }}>
      <div><I.Chat width={40} height={40} style={{ opacity: 0.4 }} /><p style={{ margin: '8px 0 0' }}>Elige una conversación.</p></div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}
      onDragOver={e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setEncima(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setEncima(false); }}
      onDrop={e => { e.preventDefault(); setEncima(false); subir(e.dataTransfer.files); }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--line)', position: 'relative' }}>
        {estrecho && <button type="button" className="icon-btn" aria-label="Volver" onClick={() => setAbierto(null)}><I.Arrow style={{ transform: 'rotate(180deg)' }} /></button>}
        <Avatar nombre={conv?.chat?.titulo || actual?.titulo} tipo={conv?.chat?.tipo === 'it' && conv?.chat?.conmigo ? 'it' : conv?.chat?.tipo || actual?.tipo} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 15, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conv?.chat?.titulo || actual?.titulo || '…'}{conv?.chat?.silenciado ? ' 🔕' : ''}
          </b>
          <span style={{ fontSize: 12, color: 'var(--ink-3)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conv?.chat?.tipo === 'grupo' ? conv.chat.miembros.map(m => m.nombre.split(' ')[0]).join(', ')
              : conv?.chat?.tipo === 'it' && conv.chat.persona ? `${NOMBRE_RANGO[conv.chat.persona.rango] || 'Familia / alumno'} · ${conv.chat.persona.email || ''} · lo ve todo el Equipo IT`
                : conv?.chat?.tipo === 'it' ? 'Te escribe el Equipo IT. Puedes contestar aquí y mandar archivos.' : conv?.chat?.tipo === 'privado' ? 'Privado' : ''}
          </span>
        </div>
        <button type="button" className="icon-btn" aria-label="Buscar en la conversación" title="Buscar en la conversación" data-buscar-aqui
          onClick={() => setBuscarAqui(b => (b ? null : { q: '', resultados: null }))} disabled={!conv}><I.Search /></button>
        {conv?.chat?.tipo === 'grupo' && (
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setGestionar(true)}>{conv.chat.gestiona ? 'Gestionar' : 'Personas'}</button>
        )}
        <button type="button" className="icon-btn" aria-label="Más opciones" title="Silenciar, fijar…" data-opciones-chat onClick={() => setOpciones(o => !o)} disabled={!conv}>⋯</button>
        {opciones && conv?.chat && (
          <div role="menu" style={{ position: 'absolute', right: 10, top: '100%', zIndex: 20, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.18)', padding: 6, display: 'grid', minWidth: 200 }}>
            {accion(conv.chat.silenciado ? 'Quitar el silencio' : 'Silenciar', conv.chat.silenciado ? '🔔 Quitar el silencio' : '🔕 Silenciar (solo te avisa si te mencionan)', () => cambiarYo({ silenciado: !conv.chat.silenciado }))}
            {accion(conv.chat.fijado ? 'Quitar de arriba' : 'Fijar arriba', conv.chat.fijado ? '📌 Quitar de arriba' : '📌 Fijar arriba', () => cambiarYo({ fijado: !conv.chat.fijado }))}
          </div>
        )}
      </div>
      {/* Buscar en esta conversación */}
      {buscarAqui && (
        <div style={{ borderBottom: '1px solid var(--line)', padding: 8, display: 'grid', gap: 6, background: 'var(--bg-2)' }}>
          <input autoFocus value={buscarAqui.q} onChange={e => setBuscarAqui({ q: e.target.value, resultados: buscarAqui.resultados })} placeholder="Buscar en esta conversación…" aria-label="Buscar en esta conversación"
            onKeyDown={e => { if (e.key === 'Escape') setBuscarAqui(null); }}
            style={{ fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }} />
          {buscarAqui.resultados && (
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'grid' }}>
              {!buscarAqui.resultados.length && <span style={{ fontSize: 12, color: 'var(--ink-3)', padding: 4 }}>Nada con eso.</span>}
              {buscarAqui.resultados.map(r => (
                <button key={r.id} type="button" onClick={() => irA(r.id)} style={{ textAlign: 'left', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: '6px 6px', borderRadius: 8, color: 'var(--ink)', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--ink-3)' }}>{cuandoCorto(r.fecha)} · {r.autor ? r.autor.split(' ')[0] : ''}: </span><Resaltar texto={r.texto} q={buscarAqui.q.trim()} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Mensajes */}
      <div ref={fondoRef} onScroll={e => { const el = e.currentTarget; pegadoRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        onClick={e => { if (e.target === e.currentTarget) setMenuDe(null); }}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, background: 'color-mix(in oklab, var(--bg-3) 60%, var(--bg-2))' }}>
        {!conv && <p style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center' }}>Cargando…</p>}
        {conv?.hayMas && <button type="button" className="btn btn-sm btn-outline" style={{ alignSelf: 'center' }} onClick={verAnteriores}>Ver anteriores</button>}
        {conv && !mensajes.length && (
          <p style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', margin: 'auto 0' }}>
            {conv.chat?.tipo === 'it' && !conv.chat.conmigo ? 'Escríbele lo que necesites: le llega a su área de la web y al móvil, si tiene la app.' : 'Aún no hay mensajes. Escribe el primero.'}
          </p>
        )}
        {mensajes.map((m, i) => {
          const antes = mensajes[i - 1];
          const otroDia = !antes || diaDe(antes.fecha) !== diaDe(m.fecha);
          const seguido = antes && !otroDia && antes.autorId === m.autorId && new Date(m.fecha) - new Date(antes.fecha) < 5 * 60000;
          const esImagen = !m.borrado && m.archivo && /^image\/(png|jpeg|gif|webp)$/.test(m.archivo.mime);
          const esVideo = !m.borrado && m.archivo && /^video\//.test(m.archivo.mime);
          const esAudio = !m.borrado && m.archivo && /^audio\//.test(m.archivo.mime);
          const esVoz = esAudio && m.archivo.voz;
          const meMencionan = !m.mio && yo && (m.menciones || []).includes(String(yo));
          // El nombre de quien escribe, salvo en los privados (ya se sabe quién es).
          const verAutor = !m.mio && !seguido && conv.chat?.tipo !== 'privado';
          const abiertoMenu = menuDe === m.id;
          const conAcciones = !m.borrado && conv.chat;
          return (
            <React.Fragment key={m.id}>
              {otroDia && (
                <div style={{ alignSelf: 'center', margin: '10px 0 6px', fontSize: 11, fontWeight: 800, color: 'var(--ink-3)', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 10px', textTransform: 'capitalize' }}>{nombreDia(m.fecha)}</div>
              )}
              <div data-mensaje={m.id} onMouseEnter={() => setSobre(m.id)} onMouseLeave={() => setSobre(s => (s === m.id ? null : s))}
                style={{ alignSelf: m.mio ? 'flex-end' : 'flex-start', maxWidth: 'min(78%, 560px)', marginTop: seguido ? 0 : 6, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: m.mio ? 'flex-end' : 'flex-start' }}>
                <div onClick={e => { if (!conAcciones || e.target.closest('a, audio, video, button')) return; setMenuDe(x => (x === m.id ? null : m.id)); }}
                  style={{ background: m.borrado ? 'transparent' : m.mio ? 'color-mix(in oklab, var(--teal) 18%, var(--bg-2))' : 'var(--bg-2)', border: `1px ${m.borrado ? 'dashed' : 'solid'} var(--line)`, borderRadius: 14,
                    borderTopRightRadius: m.mio && !seguido ? 4 : 14, borderTopLeftRadius: !m.mio && !seguido ? 4 : 14, padding: esImagen ? 4 : '7px 10px', overflow: 'hidden', cursor: conAcciones ? 'pointer' : 'default',
                    boxShadow: resaltado === m.id ? '0 0 0 3px var(--yellow, #FFD526)' : meMencionan ? 'inset 3px 0 0 var(--purple)' : 'none', transition: 'box-shadow .3s', maxWidth: '100%' }}>
                  {verAutor && <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--purple)', padding: esImagen ? '3px 6px 4px' : '0 0 2px' }}>{m.autor}</div>}
                  {m.borrado ? (
                    <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--ink-3)' }} data-borrado>🚫 {m.mio ? 'Has borrado este mensaje' : 'Mensaje borrado'}</div>
                  ) : (
                    <>
                      {m.respuesta && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); irA(m.respuesta.id); }} data-cita
                          style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, borderLeft: '3px solid var(--purple)', background: 'color-mix(in oklab, var(--purple) 8%, transparent)', borderRadius: 6, padding: '4px 8px', margin: esImagen ? '2px 2px 6px' : '0 0 5px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
                          <b style={{ fontSize: 11, color: 'var(--purple)', display: 'block' }}>{m.respuesta.autor}</b>
                          <span style={{ fontSize: 12, color: 'var(--ink-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {m.respuesta.borrado ? '🚫 Mensaje borrado' : m.respuesta.texto || (m.respuesta.archivo ? (/^nota-de-voz/.test(m.respuesta.archivo) ? '🎤 Nota de voz' : `📎 ${m.respuesta.archivo}`) : '')}
                          </span>
                        </button>
                      )}
                      {esImagen && (
                        <a href={m.archivo.url} target="_blank" rel="noopener noreferrer" title={m.archivo.nombre}>
                          <img src={m.archivo.url} alt={m.archivo.nombre} loading="lazy" onLoad={() => pegadoRef.current && bajar(false)}
                            style={{ display: 'block', maxWidth: '100%', maxHeight: 320, borderRadius: 10, objectFit: 'contain' }} />
                        </a>
                      )}
                      {esVideo && <video src={m.archivo.url} controls preload="metadata" style={{ display: 'block', maxWidth: '100%', maxHeight: 320, borderRadius: 10 }} />}
                      {esVoz && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span aria-hidden="true">🎤</span><audio src={m.archivo.url} controls preload="metadata" style={{ display: 'block', maxWidth: 260, height: 36 }} /></div>}
                      {esAudio && !esVoz && <audio src={m.archivo.url} controls preload="metadata" style={{ display: 'block', maxWidth: '100%' }} />}
                      {m.archivo && !esImagen && !esVoz && (
                        <a href={`${m.archivo.url}${esVideo || esAudio ? '?descargar=1' : ''}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--ink)', textDecoration: 'none', padding: esVideo || esAudio ? '4px 2px 0' : 0 }}>
                          <span style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--bg-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><I.Download width={16} height={16} /></span>
                          <span style={{ minWidth: 0 }}>
                            <b style={{ fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.archivo.nombre}</b>
                            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{tamano(m.archivo.bytes)}</span>
                          </span>
                        </a>
                      )}
                      {m.texto && <div style={{ fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: esImagen ? '4px 6px 2px' : 0 }}><ConFormato texto={m.texto} nombres={nombresMiembros} /></div>}
                    </>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', textAlign: 'right', marginTop: 2, padding: esImagen ? '0 6px 2px' : 0 }}>
                    {m.editado && !m.borrado && <span style={{ fontStyle: 'italic' }} data-editado>editado · </span>}
                    {hora(m.fecha)}
                    {m.mio && !m.borrado && (leido && leido >= new Date(m.fecha)
                      ? <span title="Leído" style={{ color: 'var(--teal)', fontWeight: 800 }}> ✓✓</span>
                      : <span title="Enviado"> ✓</span>)}
                  </div>
                </div>
                {/* Las reacciones */}
                {!m.borrado && m.reacciones?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: -4, padding: '0 6px', zIndex: 1, flexWrap: 'wrap' }} data-reacciones>
                    {m.reacciones.map(r => (
                      <button key={r.emoji} type="button" onClick={() => reaccionar(m, r.emoji)} title={r.quienes.join(', ')}
                        style={{ fontSize: 12, padding: '1px 7px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${r.mia ? 'var(--teal)' : 'var(--line)'}`, background: r.mia ? 'color-mix(in oklab, var(--teal) 15%, var(--bg-2))' : 'var(--bg-2)', color: 'var(--ink)' }}>
                        {r.emoji}{r.n > 1 ? ` ${r.n}` : ''}
                      </button>
                    ))}
                  </div>
                )}
                {/* El botón de acciones (con el ratón encima) y sus acciones */}
                {conAcciones && (sobre === m.id || abiertoMenu) && !abiertoMenu && (
                  <button type="button" aria-label="Acciones del mensaje" title="Responder, reaccionar…" onClick={() => setMenuDe(m.id)} data-acciones
                    style={{ position: 'absolute', top: 2, [m.mio ? 'left' : 'right']: -30, width: 26, height: 26, borderRadius: 99, border: '1px solid var(--line)', background: 'var(--bg-2)', cursor: 'pointer', fontSize: 13, color: 'var(--ink-2)', display: 'grid', placeItems: 'center' }}>⌄</button>
                )}
                {abiertoMenu && (
                  <div role="menu" data-menu-mensaje onClick={e => e.stopPropagation()}
                    style={{ marginTop: 4, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.14)', padding: 4, display: 'grid', gap: 2, zIndex: 5 }}>
                    <div style={{ display: 'flex', gap: 2, padding: '2px 2px 4px', borderBottom: '1px solid var(--line)' }}>
                      {(conv.chat.reacciones || REACCIONES).map(e => (
                        <button key={e} type="button" onClick={() => reaccionar(m, e)} aria-label={`Reaccionar ${e}`}
                          style={{ fontSize: 18, border: 0, background: m.reacciones?.some(r => r.emoji === e && r.mia) ? 'color-mix(in oklab, var(--teal) 18%, transparent)' : 'transparent', borderRadius: 8, cursor: 'pointer', padding: '2px 4px' }}>{e}</button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                      {accion('Responder', '↩ Responder', () => responder(m))}
                      {m.mio && m.texto !== undefined && accion('Editar', '✏️ Editar', () => editar(m))}
                      {m.mio && conv.chat.tipo === 'grupo' && accion('Quién lo ha leído', '👁 Leído por', () => verLeido(m))}
                      {m.mio && accion('Borrar', '🗑 Borrar', () => borrar(m), true)}
                      {accion('Cerrar', '✕', () => setMenuDe(null))}
                    </div>
                  </div>
                )}
                {m === ultimoMio && leido && leido >= new Date(m.fecha) && conv.chat?.tipo !== 'grupo' && (
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', textAlign: 'right', marginTop: 2 }}>Leído</div>
                )}
              </div>
            </React.Fragment>
          );
        })}
        {subiendo.map((n, i) => (
          <div key={`${n}-${i}`} style={{ alignSelf: 'flex-end', fontSize: 12, color: 'var(--ink-3)', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 12, padding: '6px 10px' }}>Subiendo {n === 'la nota de voz' ? n : `«${n}»`}…</div>
        ))}
      </div>
      {encima && (
        <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, var(--teal) 18%, transparent)', border: '3px dashed var(--teal)', borderRadius: 12, display: 'grid', placeItems: 'center', fontWeight: 800, color: 'var(--ink)', pointerEvents: 'none' }}>
          Suelta para mandarlo
        </div>
      )}
      {/* Respondiendo o editando */}
      {(respondiendo || editando) && (
        <div data-barra-escribir style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px 0', borderTop: '1px solid var(--line)' }}>
          <div style={{ flex: 1, minWidth: 0, borderLeft: `3px solid ${editando ? 'var(--orange)' : 'var(--purple)'}`, paddingLeft: 8 }}>
            <b style={{ fontSize: 12, color: editando ? 'var(--orange)' : 'var(--purple)' }}>{editando ? 'Editando el mensaje' : `Respondiendo a ${respondiendo.mio ? 'ti' : respondiendo.autor}`}</b>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(editando || respondiendo).texto || ((editando || respondiendo).archivo ? ((editando || respondiendo).archivo.voz ? '🎤 Nota de voz' : `📎 ${(editando || respondiendo).archivo.nombre}`) : '')}
            </div>
          </div>
          <button type="button" className="icon-btn" aria-label="Cancelar" onClick={cancelarEscribir}><I.X /></button>
        </div>
      )}
      {/* Escribir */}
      {grabando ? (
        <div data-grabando style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, borderTop: (respondiendo || editando) ? 0 : '1px solid var(--line)' }}>
          <button type="button" className="icon-btn" aria-label="Descartar la nota de voz" title="Descartar" onClick={() => pararGrabar(false)}><I.Trash /></button>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 99, background: '#dc2626', animation: 'pulse 1s infinite' }} />
            Grabando… {minSeg(Date.now() - grabando + tic * 0)}
            <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>(máx. 5 min)</span>
          </span>
          <button type="button" className="btn btn-primary" aria-label="Mandar la nota de voz" onClick={() => pararGrabar(true)} style={{ borderRadius: 999, padding: '9px 14px' }}><I.Enviar width={18} height={18} /></button>
        </div>
      ) : (
        <form onSubmit={enviar} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: 10, borderTop: (respondiendo || editando) ? 0 : '1px solid var(--line)', position: 'relative' }}>
          {sugerencias && (
            <div role="listbox" data-sugerencias style={{ position: 'absolute', left: 52, bottom: '100%', marginBottom: 4, zIndex: 20, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.18)', padding: 4, display: 'grid', minWidth: 220 }}>
              {sugerencias.lista.map((p, k) => (
                <button key={p.id} type="button" role="option" aria-selected={k === 0} onMouseDown={e => { e.preventDefault(); elegirMencion(p); }}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', textAlign: 'left', border: 0, background: k === 0 ? 'var(--bg-3)' : 'transparent', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', fontSize: 13 }}>
                  <Avatar nombre={p.nombre} tipo="privado" size={24} /> {p.nombre}
                </button>
              ))}
            </div>
          )}
          <input ref={archivoRef} type="file" multiple hidden onChange={e => { subir(e.target.files); e.target.value = ''; }} />
          {!editando && (
            <button type="button" className="icon-btn" aria-label="Adjuntar archivo o imagen" title="Adjuntar archivo o imagen (hasta 10 MB)" onClick={() => archivoRef.current?.click()} disabled={!conv}>
              <I.Clip />
            </button>
          )}
          <textarea ref={textoRef} rows={1} value={texto} placeholder={editando ? 'Cambia el mensaje…' : miembros.length ? 'Escribe un mensaje… (@ para mencionar)' : 'Escribe un mensaje…'} disabled={!conv}
            onChange={alEscribir}
            onKeyDown={e => {
              if (sugerencias && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); elegirMencion(sugerencias.lista[0]); return; }
              if (e.key === 'Escape') { if (sugerencias) setSugerencias(null); else cancelarEscribir(); return; }
              if (e.key === 'Enter' && !e.shiftKey && !estrecho) { e.preventDefault(); enviar(); }
            }}
            onPaste={e => { const f = [...(e.clipboardData?.files || [])]; if (f.length && !editando) { e.preventDefault(); subir(f); } }}
            style={{ flex: 1, resize: 'none', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.4, padding: '9px 12px', borderRadius: 18, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', maxHeight: 140 }} />
          {!texto.trim() && !editando ? (
            <button type="button" className="btn btn-primary" disabled={!conv} aria-label="Grabar una nota de voz" title="Grabar una nota de voz" onClick={empezarGrabar} data-grabar style={{ borderRadius: 999, padding: '9px 14px', fontSize: 16, lineHeight: 1 }}>
              🎤
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={!texto.trim() || enviando || !conv} aria-label={editando ? 'Guardar el cambio' : 'Enviar'} style={{ borderRadius: 999, padding: '9px 14px' }}>
              {editando ? <I.Check width={18} height={18} /> : <I.Enviar width={18} height={18} />}
            </button>
          )}
        </form>
      )}
    </div>
  );

  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden', display: 'grid', gridTemplateColumns: estrecho ? '1fr' : 'minmax(240px, 320px) minmax(0, 1fr)', height: 'max(460px, calc(100dvh - 190px))' }}>
      <style>{'@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: .25 } }'}</style>
      {enLista && lista}
      {enConv && conversacion}

      {nuevo && (
        <NuevaConversacion tipo={nuevo} onCerrar={() => setNuevo(null)} onEmpezar={empezar} />
      )}
      {gestionar && conv?.chat?.tipo === 'grupo' && (
        <GestionarGrupo chat={conv.chat} onCerrar={() => setGestionar(false)} avisar={avisar}
          onCambio={async (fuera) => {
            setGestionar(false);
            await cargarLista();
            if (fuera) setAbierto(null);
            else { const d = await pedir(`/api/chats/${abierto}`).catch(() => null); if (d) { setConv(d); cambiosRef.current = d.ahora; } }
          }} />
      )}
      {leidoPor && (
        <Modal titulo="Quién lo ha leído" onCerrar={() => setLeidoPor(null)} ancho={380}>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leidoPor.m.texto || (leidoPor.m.archivo ? leidoPor.m.archivo.nombre : '')}</div>
          {!leidoPor.datos ? <span style={{ color: 'var(--ink-3)' }}>Cargando…</span> : (
            <div style={{ display: 'grid', gap: 10 }} data-leido-por>
              <div>
                <b style={{ fontSize: 13 }}>✓✓ Leído ({leidoPor.datos.leido.length})</b>
                {leidoPor.datos.leido.map(x => <div key={x.nombre} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}><span>{x.nombre}</span><span style={{ color: 'var(--ink-3)' }}>{cuandoCorto(x.cuando)}{diaDe(x.cuando) !== diaDe(new Date()) ? ` ${hora(x.cuando)}` : ''}</span></div>)}
                {!leidoPor.datos.leido.length && <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Nadie todavía.</div>}
              </div>
              <div>
                <b style={{ fontSize: 13 }}>Sin leer ({leidoPor.datos.sinLeer.length})</b>
                {leidoPor.datos.sinLeer.map(n => <div key={n} style={{ fontSize: 13, padding: '3px 0', color: 'var(--ink-2)' }}>{n}</div>)}
                {!leidoPor.datos.sinLeer.length && <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Lo han leído todos.</div>}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function NuevaConversacion({ tipo, onCerrar, onEmpezar }) {
  const [nombre, setNombre] = useState('');
  const [miembros, setMiembros] = useState([]);
  if (tipo === 'grupo') {
    return (
      <Modal titulo="Nuevo grupo" onCerrar={onCerrar}>
        <div className="field">
          <label>Nombre del grupo</label>
          <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Recepción, Profes de inglés…" maxLength={120} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Quién está {miembros.length ? `(${miembros.length} + tú)` : ''}</div>
        <ElegirPersonas varias elegidas={miembros} onCambio={setMiembros} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={!nombre.trim() || !miembros.length}
            onClick={() => onEmpezar({ tipo: 'grupo', nombre: nombre.trim(), miembros: miembros.map(m => m.id) })}>Crear el grupo</button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal titulo={tipo === 'it' ? 'Escribir a un usuario de la web' : 'Privado con…'} onCerrar={onCerrar}>
      {tipo === 'it' && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Le escribes como Equipo IT: lo ve en «Mensajes» de su área (y en el móvil). Los del Equipo IT veis la misma conversación.</p>}
      <ElegirPersonas todos={tipo === 'it'} onCambio={(p) => onEmpezar(tipo === 'it' ? { tipo: 'it', persona: p.id } : { tipo: 'privado', con: p.id })} />
    </Modal>
  );
}

function GestionarGrupo({ chat, onCerrar, onCambio, avisar }) {
  const [nombre, setNombre] = useState(chat.titulo);
  const [anadir, setAnadir] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const hacer = async (fn, fuera = false) => {
    setOcupado(true);
    try { await fn(); await onCambio(fuera); } catch (e) { avisar(e.message); } finally { setOcupado(false); }
  };
  const cambiar = (cuerpo) => pedir(`/api/chats/${chat.id}`, conJson('PATCH', cuerpo));
  return (
    <Modal titulo={chat.gestiona ? 'Gestionar el grupo' : chat.titulo} onCerrar={onCerrar}>
      {chat.gestiona && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, margin: 0 }}>
            <label>Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={120} />
          </div>
          <button type="button" className="btn btn-sm btn-outline" disabled={ocupado || !nombre.trim() || nombre.trim() === chat.titulo} onClick={() => hacer(() => cambiar({ nombre: nombre.trim() }))}>Guardar</button>
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 700 }}>En el grupo ({chat.miembros.length})</div>
      <div style={{ display: 'grid', gap: 4 }}>
        {chat.miembros.map(m => (
          <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <Avatar nombre={m.nombre} tipo="privado" size={26} />
            <span style={{ flex: 1 }}>{m.nombre}</span>
            {chat.gestiona && <button type="button" className="btn btn-sm btn-outline" disabled={ocupado} onClick={() => hacer(() => cambiar({ quitar: [m.id] }))}>Quitar</button>}
          </div>
        ))}
      </div>
      {chat.gestiona && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Añadir</div>
          <ElegirPersonas varias elegidas={anadir} onCambio={setAnadir} quitar={chat.miembros.map(m => m.id)} />
          <button type="button" className="btn btn-sm btn-primary" style={{ justifySelf: 'start' }} disabled={ocupado || !anadir.length}
            onClick={() => hacer(() => cambiar({ anadir: anadir.map(a => a.id) }))}>Añadir {anadir.length || ''}</button>
        </>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" disabled={ocupado}
          onClick={() => window.confirm('¿Salir del grupo? Dejarás de ver sus mensajes.') && hacer(() => pedir(`/api/chats/${chat.id}/salir`, { method: 'POST' }), true)}>Salir del grupo</button>
        {chat.gestiona && (
          <button type="button" className="btn btn-sm btn-outline" style={{ color: 'var(--danger, #dc2626)' }} disabled={ocupado}
            onClick={() => window.confirm(`¿Borrar el grupo «${chat.titulo}» con todos sus mensajes? No se puede deshacer.`) && hacer(() => pedir(`/api/chats/${chat.id}`, { method: 'DELETE' }), true)}>Borrar el grupo</button>
        )}
      </div>
    </Modal>
  );
}
