import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Mensajes: el chat interno. El mismo para el panel (ambito 'equipo': privados,
// grupos y, al Equipo IT, lo que habla con cualquiera de la web) y para el área
// de familias (ambito 'familia': lo que le escribe el Equipo IT).
// Se mandan textos, imágenes y archivos (hasta 10 MB) y queda todo guardado. Lo
// nuevo se trae solo cada pocos segundos mientras la conversación está abierta.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ARCHIVO = 10 * 1024 * 1024;
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
const NOMBRE_RANGO = { student: 'Alumno', trabajador: 'Trabajador', instructor: 'Instructor', secretaria: 'Secretaría', club_owner: 'Dirección', it_junior: 'IT Junior', equipo_it: 'Equipo IT', superadmin: 'Equipo IT' };

// Los enlaces del texto, pulsables.
function ConEnlaces({ texto }) {
  const trozos = String(texto).split(/(https?:\/\/[^\s<]+)/g);
  return trozos.map((t, i) => (i % 2
    ? <a key={i} href={t} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', wordBreak: 'break-all' }}>{t}</a>
    : <React.Fragment key={i}>{t}</React.Fragment>));
}

// Una foto grande se achica antes de subirla (a 2000 px y JPEG): llega igual de
// bien y no llena la base de datos. Los GIF, tal cual (se moverían).
async function prepararArchivo(f) {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 1.5 * 1024 * 1024) return f;
  try {
    const img = await createImageBitmap(f);
    const k = Math.min(1, 2000 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
    if (!b || b.size >= f.size) return f;
    return new File([b], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return f; }
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
  const [encima, setEncima] = useState(false);   // arrastrando un archivo encima
  const [estrecho, setEstrecho] = useState(() => typeof window !== 'undefined' && window.innerWidth < 760);
  const fondoRef = useRef(null), archivoRef = useRef(null), ultimoRef = useRef(0), listoRef = useRef(false), pegadoRef = useRef(true), textoRef = useRef(null);

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
      if (!equipo && !abierto && d.chats?.length === 1 && !estrecho) setAbierto(d.chats[0].id);
    } catch (e) { setChats(c => c || []); }
  }, [ambito]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    cargarLista();
    const t = setInterval(() => { if (!document.hidden) cargarLista(); }, 15000);
    return () => clearInterval(t);
  }, [cargarLista]);

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

  // La conversación abierta: entera al abrirla y, luego, lo nuevo cada 4 s.
  useEffect(() => {
    if (!abierto) { setConv(null); return undefined; }
    let vivo = true;
    setConv(null); ultimoRef.current = 0; listoRef.current = false; pegadoRef.current = true;
    (async () => {
      try {
        const d = await pedir(`/api/chats/${abierto}`);
        if (!vivo) return;
        setConv(d);
        ultimoRef.current = d.mensajes.at(-1)?.id || 0; listoRef.current = true;
        bajar(false);
        setChats(l => (l || []).map(c => (c.id === abierto ? { ...c, sinLeer: 0 } : c)));
      } catch (e) { if (vivo) { avisar(e.message); setAbierto(null); } }
    })();
    const traer = async () => {
      if (document.hidden || !listoRef.current) return;
      try {
        const d = await pedir(`/api/chats/${abierto}?desde=${ultimoRef.current}`);
        if (!vivo) return;
        if (d.mensajes.length) {
          ultimoRef.current = d.mensajes.at(-1).id;
          setConv(c => (c ? { ...c, mensajes: [...c.mensajes, ...d.mensajes.filter(m => !c.mensajes.some(x => x.id === m.id))], leidoHasta: d.leidoHasta } : c));
          if (pegadoRef.current) bajar(true);
          cargarLista();
        } else setConv(c => (c && c.leidoHasta !== d.leidoHasta ? { ...c, leidoHasta: d.leidoHasta } : c));
      } catch { /* la próxima vez */ }
    };
    const t = setInterval(traer, 4000);
    // Al volver a la pestaña (o a la app), lo nuevo al momento.
    document.addEventListener('visibilitychange', traer);
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', traer); };
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  async function verAnteriores() {
    const primero = conv?.mensajes[0]?.id;
    if (!primero) return;
    const el = fondoRef.current, alto = el?.scrollHeight || 0;
    try {
      const d = await pedir(`/api/chats/${abierto}?antes=${primero}`);
      setConv(c => ({ ...c, mensajes: [...d.mensajes, ...c.mensajes], hayMas: d.hayMas }));
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - alto; });
    } catch (e) { avisar(e.message); }
  }

  const anadir = (m) => {
    ultimoRef.current = Math.max(ultimoRef.current, m.id);
    setConv(c => (c && !c.mensajes.some(x => x.id === m.id) ? { ...c, mensajes: [...c.mensajes, m] } : c));
    pegadoRef.current = true; bajar(true);
    setChats(l => {
      const lista = (l || []).map(c => (c.id === abierto ? { ...c, fecha: m.fecha, ultimo: { texto: m.texto || (m.archivo ? `📎 ${m.archivo.nombre}` : ''), mio: true } } : c));
      return lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    });
  };

  async function enviar(e) {
    e?.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      const d = await pedir(`/api/chats/${abierto}/mensajes`, conJson('POST', { texto: t }));
      setTexto(''); anadir(d.mensaje);
      requestAnimationFrame(() => textoRef.current?.focus());
    } catch (err) { avisar(err.message); }
    finally { setEnviando(false); }
  }

  async function subir(lista) {
    const archivos = [...(lista || [])];
    if (!archivos.length || !abierto) return;
    for (const original of archivos) {
      const f = await prepararArchivo(original);
      if (f.size > MAX_ARCHIVO) { avisar(`«${original.name}» pasa de 10 MB: no se puede mandar.`); continue; }
      setSubiendo(s => [...s, f.name]);
      try {
        const r = await fetch(`/api/chats/${abierto}/archivo?nombre=${encodeURIComponent(f.name)}`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f,
        });
        const d = await jsonDe(r);
        if (!r.ok) throw new Error(d.error || 'No se ha podido mandar.');
        anadir(d.mensaje);
      } catch (err) { avisar(`«${original.name}»: ${err.message}`); }
      finally { setSubiendo(s => { const i = s.indexOf(f.name); return i < 0 ? s : [...s.slice(0, i), ...s.slice(i + 1)]; }); }
    }
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
        {(chats || []).length > 6 && (
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar conversación…"
            style={{ fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }} />
        )}
      </div>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {chats === null && <p style={{ padding: 16, color: 'var(--ink-3)', fontSize: 13 }}>Cargando…</p>}
        {chats && !vistos.length && (
          <p style={{ padding: 16, color: 'var(--ink-3)', fontSize: 13, margin: 0 }}>
            {equipo ? 'Aún no tienes conversaciones. Empieza una con los botones de arriba.' : 'Aún no tienes mensajes.'}
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
                <span style={{ fontSize: 11, color: c.sinLeer ? 'var(--teal)' : 'var(--ink-3)', fontWeight: c.sinLeer ? 800 : 500 }}>{cuandoCorto(c.fecha)}</span>
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--ink-3)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.tipo === 'it' && !c.conmigo && equipo ? <span style={{ color: 'var(--teal)', fontWeight: 700 }}>Equipo IT · </span> : null}
                  {c.ultimo ? `${c.ultimo.mio ? 'Tú: ' : c.tipo === 'grupo' && c.ultimo.autor ? `${c.ultimo.autor.split(' ')[0]}: ` : ''}${c.ultimo.texto}` : c.tipo === 'grupo' ? `${c.miembros} personas` : 'Sin mensajes todavía'}
                </span>
                {c.sinLeer > 0 && <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: 'var(--teal)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', padding: '0 6px' }}>{c.sinLeer}</span>}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  // ── La conversación ──
  const mensajes = conv?.mensajes || [];
  const leido = conv?.leidoHasta ? new Date(conv.leidoHasta) : null;
  const ultimoMio = [...mensajes].reverse().find(m => m.mio);
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
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
        {estrecho && <button type="button" className="icon-btn" aria-label="Volver" onClick={() => setAbierto(null)}><I.Arrow style={{ transform: 'rotate(180deg)' }} /></button>}
        <Avatar nombre={conv?.chat?.titulo || actual?.titulo} tipo={conv?.chat?.tipo === 'it' && conv?.chat?.conmigo ? 'it' : conv?.chat?.tipo || actual?.tipo} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 15, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv?.chat?.titulo || actual?.titulo || '…'}</b>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {conv?.chat?.tipo === 'grupo' ? conv.chat.miembros.map(m => m.nombre.split(' ')[0]).join(', ')
              : conv?.chat?.tipo === 'it' && conv.chat.persona ? `${NOMBRE_RANGO[conv.chat.persona.rango] || 'Familia / alumno'} · ${conv.chat.persona.email || ''} · lo ve todo el Equipo IT`
                : conv?.chat?.tipo === 'it' ? 'Te escribe el Equipo IT. Puedes contestar aquí y mandar archivos.' : conv?.chat?.tipo === 'privado' ? 'Privado' : ''}
          </span>
        </div>
        {conv?.chat?.tipo === 'grupo' && (
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setGestionar(true)}>{conv.chat.gestiona ? 'Gestionar' : 'Personas'}</button>
        )}
      </div>
      {/* Mensajes */}
      <div ref={fondoRef} onScroll={e => { const el = e.currentTarget; pegadoRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
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
          const esImagen = m.archivo && /^image\/(png|jpeg|gif|webp)$/.test(m.archivo.mime);
          const esVideo = m.archivo && /^video\//.test(m.archivo.mime);
          const esAudio = m.archivo && /^audio\//.test(m.archivo.mime);
          // El nombre de quien escribe, salvo en los privados (ya se sabe quién es).
          const verAutor = !m.mio && !seguido && conv.chat?.tipo !== 'privado';
          return (
            <React.Fragment key={m.id}>
              {otroDia && (
                <div style={{ alignSelf: 'center', margin: '10px 0 6px', fontSize: 11, fontWeight: 800, color: 'var(--ink-3)', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 10px', textTransform: 'capitalize' }}>{nombreDia(m.fecha)}</div>
              )}
              <div data-mensaje={m.id} style={{ alignSelf: m.mio ? 'flex-end' : 'flex-start', maxWidth: 'min(78%, 560px)', marginTop: seguido ? 0 : 6 }}>
                <div style={{ background: m.mio ? 'color-mix(in oklab, var(--teal) 18%, var(--bg-2))' : 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14,
                  borderTopRightRadius: m.mio && !seguido ? 4 : 14, borderTopLeftRadius: !m.mio && !seguido ? 4 : 14, padding: m.archivo && esImagen ? 4 : '7px 10px', overflow: 'hidden' }}>
                  {verAutor && <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--purple)', padding: esImagen ? '3px 6px 4px' : '0 0 2px' }}>{m.autor}</div>}
                  {esImagen && (
                    <a href={m.archivo.url} target="_blank" rel="noopener noreferrer" title={m.archivo.nombre}>
                      <img src={m.archivo.url} alt={m.archivo.nombre} loading="lazy" onLoad={() => pegadoRef.current && bajar(false)}
                        style={{ display: 'block', maxWidth: '100%', maxHeight: 320, borderRadius: 10, objectFit: 'contain' }} />
                    </a>
                  )}
                  {esVideo && <video src={m.archivo.url} controls preload="metadata" style={{ display: 'block', maxWidth: '100%', maxHeight: 320, borderRadius: 10 }} />}
                  {esAudio && <audio src={m.archivo.url} controls preload="metadata" style={{ display: 'block', maxWidth: '100%' }} />}
                  {m.archivo && !esImagen && (
                    <a href={`${m.archivo.url}${esVideo || esAudio ? '?descargar=1' : ''}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--ink)', textDecoration: 'none', padding: esVideo || esAudio ? '4px 2px 0' : 0 }}>
                      <span style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--bg-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><I.Download width={16} height={16} /></span>
                      <span style={{ minWidth: 0 }}>
                        <b style={{ fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.archivo.nombre}</b>
                        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{tamano(m.archivo.bytes)}</span>
                      </span>
                    </a>
                  )}
                  {m.texto && <div style={{ fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: esImagen ? '4px 6px 2px' : 0 }}><ConEnlaces texto={m.texto} /></div>}
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', textAlign: 'right', marginTop: 2, padding: esImagen ? '0 6px 2px' : 0 }}>
                    {hora(m.fecha)}
                    {m.mio && (leido && leido >= new Date(m.fecha)
                      ? <span title="Leído" style={{ color: 'var(--teal)', fontWeight: 800 }}> ✓✓</span>
                      : <span title="Enviado"> ✓</span>)}
                  </div>
                </div>
                {m === ultimoMio && leido && leido >= new Date(m.fecha) && conv.chat?.tipo !== 'grupo' && (
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', textAlign: 'right', marginTop: 2 }}>Leído</div>
                )}
              </div>
            </React.Fragment>
          );
        })}
        {subiendo.map((n, i) => (
          <div key={`${n}-${i}`} style={{ alignSelf: 'flex-end', fontSize: 12, color: 'var(--ink-3)', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 12, padding: '6px 10px' }}>Subiendo «{n}»…</div>
        ))}
      </div>
      {encima && (
        <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, var(--teal) 18%, transparent)', border: '3px dashed var(--teal)', borderRadius: 12, display: 'grid', placeItems: 'center', fontWeight: 800, color: 'var(--ink)', pointerEvents: 'none' }}>
          Suelta para mandarlo
        </div>
      )}
      {/* Escribir */}
      <form onSubmit={enviar} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: 10, borderTop: '1px solid var(--line)' }}>
        <input ref={archivoRef} type="file" multiple hidden onChange={e => { subir(e.target.files); e.target.value = ''; }} />
        <button type="button" className="icon-btn" aria-label="Adjuntar archivo o imagen" title="Adjuntar archivo o imagen (hasta 10 MB)" onClick={() => archivoRef.current?.click()} disabled={!conv}>
          <I.Clip />
        </button>
        <textarea ref={textoRef} rows={1} value={texto} placeholder="Escribe un mensaje…" disabled={!conv}
          onChange={e => { setTexto(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px`; }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !estrecho) { e.preventDefault(); enviar(); } }}
          onPaste={e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); subir(f); } }}
          style={{ flex: 1, resize: 'none', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.4, padding: '9px 12px', borderRadius: 18, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', maxHeight: 140 }} />
        <button type="submit" className="btn btn-primary" disabled={!texto.trim() || enviando || !conv} aria-label="Enviar" style={{ borderRadius: 999, padding: '9px 14px' }}>
          <I.Enviar width={18} height={18} />
        </button>
      </form>
    </div>
  );

  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden', display: 'grid', gridTemplateColumns: estrecho ? '1fr' : 'minmax(240px, 320px) minmax(0, 1fr)', height: 'max(460px, calc(100dvh - 190px))' }}>
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
            else { const d = await pedir(`/api/chats/${abierto}`).catch(() => null); if (d) setConv(d); }
          }} />
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
