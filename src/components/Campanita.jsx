import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from './Icons.jsx';
import { useEnVivo } from '../envivo.js';
import { useRouter } from '../App.jsx';
import { seccionDeRuta } from '../rutasAdmin.js';

// ─────────────────────────────────────────────────────────────────────────────
// Campanita de avisos: lo que hay pendiente de atender ahora mismo, agrupado
// por sitio (soporte, cobros, caja…). Cada aviso lleva a donde se resuelve. Se
// recalcula al abrirla y cada 30 s mientras la pestaña está a la vista.
//
// El número rojo cuenta solo lo NUEVO: al pinchar un aviso (o «marcar todo como
// visto») deja de contar hasta que haya algo más (otro mensaje en ese ticket, o
// que suba lo pendiente). Lo ya visto sigue en la lista, más apagado.
// Primero lo urgente (#415): cada aviso trae su prioridad (1 urgente, 2 normal,
// 3 para enterarse) y, si la tiene, la fecha de lo último.
// ─────────────────────────────────────────────────────────────────────────────

// Apuntar avisos como vistos. Si falla, no pasa nada: seguirán contando.
export function marcarAvisosVistos(avisos) {
  const lista = (avisos || []).filter(a => a?.clave).map(a => ({ clave: a.clave, n: a.n || 0 }));
  if (!lista.length) return Promise.resolve();
  window.dispatchEvent(new CustomEvent('aim-avisos-vistos', { detail: lista.map(a => a.clave) }));
  return fetch('/api/avisos/vistos', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avisos: lista }),
  }).catch(() => {});
}

const prio = (a) => a.prioridad || 2;
const cuando = (a) => new Date(a.fecha || a.marca || 0).getTime() || 0;
// Lo urgente arriba; a igualdad, lo nuevo y, después, lo más reciente.
export function ordenarAvisos(avisos) {
  return [...(avisos || [])].sort((a, b) => prio(a) - prio(b) || (b.nuevo ? 1 : 0) - (a.nuevo ? 1 : 0) || cuando(b) - cuando(a));
}

// «hace 5 min», «hace 3 h», «ayer», «el 12 oct».
export function haceCuanto(fecha) {
  const t = new Date(fecha).getTime();
  if (!t) return null;
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  return `el ${new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
}

const COLOR = {
  sistema: 'var(--danger, #dc2626)',
  tickets: 'var(--purple)',
  cobros: 'var(--teal)',
  caja: 'var(--orange)',
  campamento: '#00BBF4',
  clases: '#FF99D3',
  speaking: '#00BBF4',
  fichaje: 'var(--teal)',
  permisos: 'var(--purple)',
  faltas: 'var(--danger, #dc2626)',
  almacen: 'var(--orange)',
  contactos: '#21B668',
  candidatos: '#21B668',
  incidencias: 'var(--orange)',
  brickslab: '#E3A008',
  correo: 'var(--purple)',
  redes: '#1FA855',
  mensajes: 'var(--teal)',
  tareas: 'var(--orange)',
  // Los de la zona de familias.
  pagos: 'var(--orange)',
  soporte: 'var(--purple)',
  galeria: '#FF99D3',
  avisos: '#00BBF4',
  design: '#FF5FA2',
};
const TITULO = {
  sistema: 'La web',
  tickets: 'Soporte',
  cobros: 'Cobros',
  caja: 'Caja',
  campamento: 'Campamento',
  clases: 'Clases',
  speaking: 'Clases individuales',
  fichaje: 'Fichaje',
  permisos: 'Permisos',
  faltas: 'Faltas',
  almacen: 'Almacén',
  contactos: 'Consultas web',
  candidatos: 'Candidatos',
  incidencias: 'Incidencias',
  brickslab: 'Brickslab',
  galeria: 'Fotos',
  design: 'Aim Design',
  correo: 'Correo',
  redes: 'Redes sociales',
  mensajes: 'Mensajes',
  tareas: 'Mi día',
  pagos: 'Pagos',
  soporte: 'Soporte',
  avisos: 'Del club',
};

// La misma campanita para el panel y para la zona de familias: cambia de dónde
// saca los avisos y a dónde lleva cada uno.
// En el panel (panel=true), además:
//  · Solo se ve lo nuevo; lo visto se pliega en «Ya vistos». Entrar en la
//    sección del aviso (aunque sea por el menú) lo da por visto, y vuelve a
//    saltar si cambia o como recordatorio: lo urgente a las 4 h, lo normal al
//    día siguiente (lo decide el servidor).
//  · Notificación del ordenador al llegar algo nuevo, mientras haya una pestaña
//    del panel abierta (aunque esté detrás de otra ventana).
//  · ⚙: qué avisos recibe cada uno y si quiere la notificación del ordenador.
const LS_NOTIFICADOS = 'aim_avisos_notificados';
const ICONO = '/src/brand/Aim_Vertical.png';
const valorNotificado = (a) => `${a.marca || a.n || 1}|${a.recordatorio || ''}`;
const puedeNotificar = () => typeof window !== 'undefined' && 'Notification' in window;
const seccionDe = (destino) => {
  try {
    const u = new URL(destino, window.location.origin);
    const r = seccionDeRuta(u.pathname.split('/').filter(Boolean), Object.fromEntries(u.searchParams));
    return `${r.view}|${r.pestana || ''}`;
  } catch { return null; }
};

function notificar({ titulo, cuerpo, tag, alPulsar }) {
  try {
    const n = new Notification(titulo, { body: cuerpo || '', tag, icon: ICONO, badge: ICONO });
    n.onclick = () => { window.focus(); alPulsar?.(); n.close(); };
  } catch { /* el navegador no deja: no pasa nada */ }
}

export default function Campanita({ onIr, url = '/api/admin/notificaciones', vacio = 'Nada pendiente. Todo al día.', panel = false }) {
  const { path } = useRouter();
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const [sitio, setSitio] = useState(null);   // en el móvil, el panel va de lado a lado
  const [verVistos, setVerVistos] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const [permiso, setPermiso] = useState(() => (puedeNotificar() ? Notification.permission : 'no'));
  const caja = useRef(null);
  const boton = useRef(null);
  // Una sola petición a la vez (#415): volver a la pestaña disparaba dos.
  const enCurso = useRef(null);
  const ultima = useRef(0);
  // Lo que se ha marcado como visto mientras había una petición en marcha no
  // debe volver a encenderse cuando llegue su respuesta (ya vieja).
  const marcadoEn = useRef(0);
  const datosRef = useRef(null);
  datosRef.current = datos;

  const cargar = useCallback(async (forzar = false) => {
    if (enCurso.current) return enCurso.current;
    if (!forzar && Date.now() - ultima.current < 2000) return undefined;
    const empezada = Date.now();
    ultima.current = empezada;
    enCurso.current = (async () => {
      try {
        const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) { setFallo(true); return; }
        const d = await r.json();
        if (empezada < marcadoEn.current) {
          // Llegó tarde: lo marcado después sigue visto.
          setDatos(antes => {
            const vistos = new Set((antes?.avisos || []).filter(a => a.nuevo === false).map(a => a.clave));
            return { ...d, avisos: (d.avisos || []).map(a => (vistos.has(a.clave) ? { ...a, nuevo: false } : a)) };
          });
        } else setDatos(d);
        setFallo(false);
      } catch { setFallo(true); }
      finally { enCurso.current = null; }
    })();
    return enCurso.current;
  }, [url]);

  useEffect(() => { cargar(true); }, [cargar]);
  // Se mantiene al día sola, sin que nadie recargue.
  useEnVivo(cargar, { cada: 30000 });
  // Con la notificación del ordenador puesta, también con la pestaña detrás de
  // otra ventana (cada minuto: es la única forma de enterarse a tiempo).
  const quiereEscritorio = panel && permiso === 'granted' && datos?.escritorio !== false;
  useEffect(() => {
    if (!quiereEscritorio) return undefined;
    const id = setInterval(() => { if (document.visibilityState !== 'visible') cargar(true); }, 60_000);
    return () => clearInterval(id);
  }, [quiereEscritorio, cargar]);

  // Lo marcado como visto en otro sitio (el Resumen, un ticket) se apaga aquí también.
  useEffect(() => {
    const f = (e) => {
      const claves = new Set(e.detail || []);
      marcadoEn.current = Date.now();
      setDatos(d => (d ? { ...d, avisos: (d.avisos || []).map(a => (claves.has(a.clave) ? { ...a, nuevo: false } : a)) } : d));
    };
    window.addEventListener('aim-avisos-vistos', f);
    return () => window.removeEventListener('aim-avisos-vistos', f);
  }, []);

  // Entrar en la sección de un aviso lo da por visto (al segundo y medio: pasar
  // de largo no cuenta). Da igual si se llega por el aviso o por el menú.
  useEffect(() => {
    if (!panel) return undefined;
    const aqui = seccionDe(window.location.pathname + window.location.search);
    if (!aqui || aqui.startsWith('overview|')) return undefined;
    const t = setTimeout(() => {
      const cuales = (datosRef.current?.avisos || []).filter(a => a.nuevo !== false && a.destino && seccionDe(a.destino) === aqui);
      if (cuales.length) marcarAvisosVistos(cuales);
    }, 1500);
    return () => clearTimeout(t);
  }, [path, panel, datos]);

  // La notificación del ordenador: lo que acaba de pasar a nuevo y aún no se
  // ha avisado (en ninguna pestaña: se apunta en el navegador).
  useEffect(() => {
    if (!panel || !datos || !puedeNotificar()) return;
    let mapa = null;
    try { mapa = JSON.parse(localStorage.getItem(LS_NOTIFICADOS) || 'null'); } catch { mapa = null; }
    const primera = !mapa;
    mapa = mapa || {};
    const avisos = datos.avisos || [];
    const recientes = avisos.filter(a => a.nuevo !== false && mapa[a.clave] !== valorNotificado(a));
    for (const a of recientes) mapa[a.clave] = valorNotificado(a);
    // Lo que ya no está se olvida: si vuelve, vuelve a avisar.
    const actuales = new Set(avisos.map(a => a.clave));
    for (const k of Object.keys(mapa)) if (!actuales.has(k)) delete mapa[k];
    try { localStorage.setItem(LS_NOTIFICADOS, JSON.stringify(mapa)); } catch { /* sin almacenamiento: no pasa nada */ }
    // La primera vez solo se apunta lo que hay (no una ráfaga de todo lo pendiente).
    if (primera || !quiereEscritorio || !recientes.length) return;
    if (recientes.length > 3) {
      notificar({ titulo: `${recientes.length} avisos nuevos en el panel`, cuerpo: recientes.slice(0, 3).map(a => a.texto).join(' · '), tag: 'aim-avisos', alPulsar: () => setAbierta(true) });
    } else {
      for (const a of recientes) {
        notificar({
          titulo: a.texto, cuerpo: [a.recordatorio ? 'Recordatorio' : null, a.detalle || TITULO[a.tipo]].filter(Boolean).join(' · '), tag: a.clave,
          alPulsar: () => { marcarAvisosVistos([a]); onIr?.(a.destino); },
        });
      }
    }
  }, [datos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cerrar al pulsar fuera o con Escape.
  useEffect(() => {
    if (!abierta) return undefined;
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierta(false); };
    const tecla = (e) => { if (e.key === 'Escape') { setAbierta(false); boton.current?.focus(); } };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierta]);

  const abrir = () => {
    if (abierta) { setAbierta(false); return; }
    // En pantallas estrechas el panel se sale por la izquierda: ahí va fijo,
    // de lado a lado, justo debajo de la campanita.
    const r = boton.current?.getBoundingClientRect();
    setSitio(window.innerWidth < 480 && r ? { top: Math.round(r.bottom + 8) } : null);
    setAjustes(false);
    setAbierta(true);
    cargar(true);
  };

  const avisos = datos?.avisos || [];
  // Lo nuevo. Si el servidor aún no sabe de vistos, cuenta todo como antes.
  const nuevos = avisos.filter(a => a.nuevo !== false);
  const vistos = avisos.filter(a => a.nuevo === false);
  const verVisto = (lista) => { marcarAvisosVistos(lista); };
  // En el panel, lo visto va aparte (plegado); en familias sigue en la lista, apagado.
  const enLista = panel ? nuevos : avisos;
  const agrupar = (lista) => ordenarAvisos(lista).reduce((acc, a) => {
    (acc[a.tipo] = acc[a.tipo] || []).push(a);
    return acc;
  }, {});
  const fallos = datos?.fallos || [];

  const fila = (a, i) => {
    const hace = haceCuanto(a.recordatorio ? null : (a.fecha || a.marca));
    return (
      <button key={a.clave || i} onClick={() => { if (a.nuevo !== false) verVisto([a]); setAbierta(false); onIr?.(a.destino); }}
        style={{
          textAlign: 'left', background: 'var(--bg-3)', border: '1px solid var(--line)',
          borderLeft: `3px solid ${prio(a) === 1 ? 'var(--danger, #dc2626)' : (COLOR[a.tipo] || 'var(--line)')}`, borderRadius: 10, padding: '8px 10px',
          cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', width: '100%',
          opacity: a.nuevo === false ? 0.6 : 1,
        }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'flex', gap: 6, alignItems: 'baseline' }}>
          {a.nuevo !== false && <span aria-label="nuevo" style={{ width: 7, height: 7, borderRadius: 99, background: prio(a) === 1 ? 'var(--danger, #dc2626)' : 'var(--orange)', flexShrink: 0, alignSelf: 'center' }} />}
          <span style={{ flex: 1, minWidth: 0 }}>{a.texto}</span>
          {a.recordatorio
            ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', whiteSpace: 'nowrap' }} title="Lo viste, pero sigue pendiente">recordatorio</span>
            : hace && <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{hace}</span>}
        </div>
        {a.detalle && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{a.detalle}</div>}
      </button>
    );
  };
  const grupos = (lista) => Object.entries(agrupar(lista)).map(([tipo, l]) => (
    <div key={tipo} style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: COLOR[tipo] || 'var(--ink-3)' }}>
        {TITULO[tipo] || tipo}
      </div>
      {l.map(fila)}
    </div>
  ));
  const chico = { fontSize: 11, padding: '3px 8px' };

  return (
    <div ref={caja} style={{ position: 'relative' }}>
      <button ref={boton} className="btn btn-icon" onClick={abrir} aria-haspopup="true" aria-expanded={abierta}
        aria-label={nuevos.length ? `${nuevos.length} avisos nuevos` : 'Avisos'} style={{ position: 'relative' }}>
        <I.Bell />
        {nuevos.length > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 999, background: nuevos.some(a => prio(a) === 1) ? 'var(--danger, #dc2626)' : 'var(--orange)', color: 'white',
            fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{nuevos.length}</span>
        )}
      </button>

      {abierta && (
        <div role="dialog" aria-label="Avisos" style={{
          ...(sitio
            ? { position: 'fixed', top: sitio.top, left: 12, right: 12, maxHeight: `calc(100vh - ${sitio.top + 16}px)` }
            : { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 360, maxHeight: 'min(560px, 75vh)' }),
          zIndex: 2500, overflowY: 'auto',
          background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14,
          boxShadow: 'var(--shadow)', padding: 12, display: 'grid', gap: 12, alignContent: 'start',
        }} className="scroll-oculto">
          {ajustes ? (
            <AjustesAvisos permiso={permiso} setPermiso={setPermiso} onVolver={() => { setAjustes(false); cargar(true); }} />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 13 }}>Avisos{nuevos.length ? ` · ${nuevos.length} nuevo${nuevos.length !== 1 ? 's' : ''}` : ''}</span>
                <div style={{ flex: 1 }} />
                {nuevos.length > 0 && (
                  <button className="btn btn-sm btn-outline" onClick={() => verVisto(nuevos)} style={chico}>Marcar todo como visto</button>
                )}
                <button className="btn btn-sm btn-outline" onClick={() => cargar(true)} style={chico}>Actualizar</button>
                {panel && <button className="btn btn-sm btn-outline" onClick={() => setAjustes(true)} style={chico} title="Elegir qué avisos recibo y si me avisa el ordenador" aria-label="Ajustes de los avisos">⚙</button>}
              </div>

              {panel && puedeNotificar() && permiso === 'default' && (
                <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start', fontSize: 12 }}
                  onClick={async () => { const p = await Notification.requestPermission(); setPermiso(p); }}>
                  🔔 Avisarme en el ordenador al momento
                </button>
              )}

              {(fallo || fallos.length > 0) && (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--danger, #dc2626)', background: 'color-mix(in oklab, var(--danger, #dc2626) 8%, transparent)', borderRadius: 8, padding: '6px 8px' }}>
                  {fallo
                    ? 'No se han podido actualizar los avisos. Lo que ves puede no estar al día.'
                    : `No se ha podido mirar ${fallos.join(', ')}: puede que falte algún aviso de ahí.`}
                </p>
              )}

              {!enLista.length && !fallo && (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>
                  {!datos ? 'Cargando…' : panel && vistos.length ? 'Nada nuevo. Lo que ya has visto vuelve a avisar si cambia o, si sigue pendiente, como recordatorio.' : vacio}
                </p>
              )}

              {grupos(enLista)}

              {panel && vistos.length > 0 && (
                <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <button type="button" onClick={() => setVerVistos(v => !v)}
                    style={{ font: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                    {verVistos ? '▾' : '▸'} Ya vistos, aún pendientes ({vistos.length})
                  </button>
                  {verVistos && grupos(vistos)}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ⚙ Qué avisos recibe cada uno (de los que le tocan por su rango) y la
// notificación del ordenador.
function AjustesAvisos({ permiso, setPermiso, onVolver }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/admin/avisos/mios', { credentials: 'include', cache: 'no-store' })
      .then(async r => { const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'No se han podido cargar.'); setD(x); })
      .catch(e => setError(e.message));
  }, []);
  async function guardar(nuevo) {
    const antes = d;
    setD(nuevo);
    try {
      const r = await fetch('/api/admin/avisos/mios', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apagados: nuevo.avisos.filter(a => !a.activo).map(a => a.id), escritorio: nuevo.escritorio }),
      });
      if (!r.ok) throw new Error();
    } catch { setD(antes); setError('No se ha podido guardar. Inténtalo otra vez.'); }
  }
  const porGrupo = (d?.avisos || []).reduce((acc, a) => { (acc[a.grupo] = acc[a.grupo] || []).push(a); return acc; }, {});
  const casilla = { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, cursor: 'pointer', lineHeight: 1.35 };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={onVolver} style={{ fontSize: 11, padding: '3px 8px' }}>← Avisos</button>
        <span style={{ fontWeight: 800, fontSize: 13 }}>Qué avisos quiero</span>
      </div>
      {error && <span style={{ fontSize: 12, color: 'var(--danger, #dc2626)' }}>{error}</span>}
      {!d && !error && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Cargando…</span>}
      {d && (
        <>
          <div style={{ display: 'grid', gap: 6, padding: 10, borderRadius: 10, background: 'var(--bg-3)' }}>
            <b style={{ fontSize: 12 }}>En el ordenador</b>
            {!puedeNotificar() ? <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Este navegador no puede mostrar avisos.</span>
              : permiso === 'denied' ? <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>El navegador tiene bloqueados los avisos de esta web. Se activan en el candado de la barra de direcciones → Notificaciones → Permitir.</span>
              : permiso === 'default' ? (
                <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start', fontSize: 12 }}
                  onClick={async () => { const p = await Notification.requestPermission(); setPermiso(p); if (p === 'granted' && !d.escritorio) guardar({ ...d, escritorio: true }); }}>
                  🔔 Permitir avisos en este ordenador
                </button>
              ) : (
                <label style={casilla}>
                  <input type="checkbox" checked={d.escritorio} onChange={e => guardar({ ...d, escritorio: e.target.checked })} />
                  <span>Notificación del ordenador al momento (con una pestaña del panel abierta, aunque esté detrás de otra ventana)</span>
                </label>
              )}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Los que te tocan por tu rango. Quita los que no quieras recibir (ni en la campanita ni en el ordenador).</span>
          {Object.entries(porGrupo).map(([grupo, lista]) => (
            <div key={grupo} style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)' }}>{grupo}</div>
              {lista.map(a => (
                <label key={a.id} style={casilla}>
                  <input type="checkbox" checked={a.activo} onChange={e => guardar({ ...d, avisos: d.avisos.map(x => (x.id === a.id ? { ...x, activo: e.target.checked } : x)) })} />
                  <span>{a.texto}{a.nota ? <span style={{ color: 'var(--ink-3)' }}> · {a.nota}</span> : null}</span>
                </label>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
