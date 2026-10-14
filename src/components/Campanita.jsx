import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from './Icons.jsx';
import { useEnVivo } from '../envivo.js';

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
  // Los de la zona de familias.
  pagos: 'var(--orange)',
  soporte: 'var(--purple)',
  galeria: '#FF99D3',
  avisos: '#00BBF4',
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
  correo: 'Correo',
  redes: 'Redes sociales',
  pagos: 'Pagos',
  soporte: 'Soporte',
  avisos: 'Del club',
};

// La misma campanita para el panel y para la zona de familias: cambia de dónde
// saca los avisos y a dónde lleva cada uno.
export default function Campanita({ onIr, url = '/api/admin/notificaciones', vacio = 'Nada pendiente. Todo al día.' }) {
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const [sitio, setSitio] = useState(null);   // en el móvil, el panel va de lado a lado
  const caja = useRef(null);
  const boton = useRef(null);
  // Una sola petición a la vez (#415): volver a la pestaña disparaba dos.
  const enCurso = useRef(null);
  const ultima = useRef(0);
  // Lo que se ha marcado como visto mientras había una petición en marcha no
  // debe volver a encenderse cuando llegue su respuesta (ya vieja).
  const marcadoEn = useRef(0);

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

  // Cerrar al pulsar fuera o con Escape.
  useEffect(() => {
    if (!abierta) return;
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
    setAbierta(true);
    cargar(true);
  };

  const avisos = datos?.avisos || [];
  // Lo nuevo. Si el servidor aún no sabe de vistos, cuenta todo como antes.
  const nuevos = avisos.filter(a => a.nuevo !== false);
  const verVisto = (lista) => { marcarAvisosVistos(lista); };
  // Por sitio; los grupos, por lo más urgente que tengan.
  const porTipo = ordenarAvisos(avisos).reduce((acc, a) => {
    (acc[a.tipo] = acc[a.tipo] || []).push(a);
    return acc;
  }, {});
  const fallos = datos?.fallos || [];

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 13 }}>Avisos{nuevos.length ? ` · ${nuevos.length} nuevo${nuevos.length !== 1 ? 's' : ''}` : ''}</span>
            <div style={{ flex: 1 }} />
            {nuevos.length > 0 && (
              <button className="btn btn-sm btn-outline" onClick={() => verVisto(nuevos)} style={{ fontSize: 11, padding: '3px 8px' }}>Marcar todo como visto</button>
            )}
            <button className="btn btn-sm btn-outline" onClick={() => cargar(true)} style={{ fontSize: 11, padding: '3px 8px' }}>Actualizar</button>
          </div>

          {(fallo || fallos.length > 0) && (
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--danger, #dc2626)', background: 'color-mix(in oklab, var(--danger, #dc2626) 8%, transparent)', borderRadius: 8, padding: '6px 8px' }}>
              {fallo
                ? 'No se han podido actualizar los avisos. Lo que ves puede no estar al día.'
                : `No se ha podido mirar ${fallos.join(', ')}: puede que falte algún aviso de ahí.`}
            </p>
          )}

          {!avisos.length && !fallo && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>{datos ? vacio : 'Cargando…'}</p>
          )}

          {Object.entries(porTipo).map(([tipo, lista]) => (
            <div key={tipo} style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: COLOR[tipo] || 'var(--ink-3)' }}>
                {TITULO[tipo] || tipo}
              </div>
              {lista.map((a, i) => {
                const hace = haceCuanto(a.fecha || a.marca);
                return (
                  <button key={a.clave || i} onClick={() => { if (a.nuevo !== false) verVisto([a]); setAbierta(false); onIr?.(a.destino); }}
                    style={{
                      textAlign: 'left', background: 'var(--bg-3)', border: '1px solid var(--line)',
                      borderLeft: `3px solid ${prio(a) === 1 ? 'var(--danger, #dc2626)' : (COLOR[tipo] || 'var(--line)')}`, borderRadius: 10, padding: '8px 10px',
                      cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)',
                      // Lo ya visto sigue ahí (es trabajo pendiente), pero apagado.
                      opacity: a.nuevo === false ? 0.6 : 1,
                    }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      {a.nuevo !== false && <span aria-label="nuevo" style={{ width: 7, height: 7, borderRadius: 99, background: prio(a) === 1 ? 'var(--danger, #dc2626)' : 'var(--orange)', flexShrink: 0, alignSelf: 'center' }} />}
                      <span style={{ flex: 1, minWidth: 0 }}>{a.texto}</span>
                      {hace && <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{hace}</span>}
                    </div>
                    {a.detalle && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{a.detalle}</div>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
