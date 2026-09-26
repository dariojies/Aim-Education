import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from './Icons.jsx';
import { useEnVivo } from '../envivo.js';

// ─────────────────────────────────────────────────────────────────────────────
// Campanita de avisos: lo que hay pendiente de atender ahora mismo, agrupado
// por sitio (soporte, cobros, caja y campamento). Cada aviso lleva a donde se
// resuelve. Se recalcula al abrirla y cada pocos minutos.
//
// El número rojo cuenta solo lo NUEVO: al pinchar un aviso (o «marcar todo como
// visto») deja de contar hasta que haya algo más (otro mensaje en ese ticket, o
// que suba lo pendiente). Lo ya visto sigue en la lista, más apagado.
// ─────────────────────────────────────────────────────────────────────────────

// Apuntar avisos como vistos. Si falla, no pasa nada: seguirán contando.
export function marcarAvisosVistos(avisos) {
  const lista = (avisos || []).filter(a => a?.clave).map(a => ({ clave: a.clave, n: a.n || 0 }));
  if (!lista.length) return Promise.resolve();
  return fetch('/api/avisos/vistos', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avisos: lista }),
  }).catch(() => {});
}

const COLOR = {
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
  // Los de la zona de familias.
  pagos: 'var(--orange)',
  soporte: 'var(--purple)',
  avisos: '#00BBF4',
};
const TITULO = {
  tickets: 'Soporte',
  cobros: 'Cobros',
  caja: 'Caja',
  campamento: 'Campamento',
  clases: 'Clases',
  speaking: 'Speaking',
  fichaje: 'Fichaje',
  permisos: 'Permisos',
  faltas: 'Faltas',
  almacen: 'Almacén',
  pagos: 'Pagos',
  soporte: 'Soporte',
  avisos: 'Del club',
};

// La misma campanita para el panel y para la zona de familias: cambia de dónde
// saca los avisos y a dónde lleva cada uno.
export default function Campanita({ onIr, url = '/api/admin/notificaciones', vacio = 'Nada pendiente. Todo al día.' }) {
  const [datos, setDatos] = useState(null);
  const [abierta, setAbierta] = useState(false);
  const caja = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (r.ok) setDatos(await r.json());
    } catch { /* noop */ }
  }, [url]);

  useEffect(() => { cargar(); }, [cargar]);
  // Se mantiene al día sola, sin que nadie recargue.
  useEnVivo(cargar, { cada: 30000 });

  // Cerrar al pulsar fuera.
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierta(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierta]);

  const avisos = datos?.avisos || [];
  // Lo nuevo. Si el servidor aún no sabe de vistos, cuenta todo como antes.
  const nuevos = avisos.filter(a => a.nuevo !== false);
  const verVisto = (lista) => {
    const claves = new Set(lista.map(a => a.clave));
    setDatos(d => d ? { ...d, avisos: d.avisos.map(a => (claves.has(a.clave) ? { ...a, nuevo: false } : a)) } : d);
    marcarAvisosVistos(lista);
  };
  const porTipo = avisos.reduce((acc, a) => {
    (acc[a.tipo] = acc[a.tipo] || []).push(a);
    return acc;
  }, {});

  return (
    <div ref={caja} style={{ position: 'relative' }}>
      <button className="btn btn-icon" onClick={() => { setAbierta(a => !a); if (!abierta) cargar(); }}
        aria-label={nuevos.length ? `${nuevos.length} avisos nuevos` : 'Avisos'} style={{ position: 'relative' }}>
        <I.Bell />
        {nuevos.length > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 999, background: 'var(--orange)', color: 'white',
            fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{nuevos.length}</span>
        )}
      </button>

      {abierta && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 2500,
          width: 320, maxHeight: 420, overflowY: 'auto',
          background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14,
          boxShadow: 'var(--shadow)', padding: 12, display: 'grid', gap: 12,
        }} className="scroll-oculto">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 13 }}>Avisos</span>
            <div style={{ flex: 1 }} />
            {nuevos.length > 0 && (
              <button className="btn btn-sm btn-outline" onClick={() => verVisto(nuevos)} style={{ fontSize: 11, padding: '3px 8px' }}>Marcar todo como visto</button>
            )}
            <button className="btn btn-sm btn-outline" onClick={cargar} style={{ fontSize: 11, padding: '3px 8px' }}>Actualizar</button>
          </div>

          {!avisos.length && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>{vacio}</p>
          )}

          {Object.entries(porTipo).map(([tipo, lista]) => (
            <div key={tipo} style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: COLOR[tipo] }}>
                {TITULO[tipo] || tipo}
              </div>
              {lista.map((a, i) => (
                <button key={a.clave || i} onClick={() => { if (a.nuevo !== false) verVisto([a]); setAbierta(false); onIr?.(a.destino); }}
                  style={{
                    textAlign: 'left', background: 'var(--bg-3)', border: '1px solid var(--line)',
                    borderLeft: `3px solid ${COLOR[tipo]}`, borderRadius: 10, padding: '8px 10px',
                    cursor: 'pointer', fontFamily: 'inherit',
                    // Lo ya visto sigue ahí (es trabajo pendiente), pero apagado.
                    opacity: a.nuevo === false ? 0.6 : 1,
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'flex', gap: 6, alignItems: 'center' }}>
                    {a.nuevo !== false && <span aria-label="nuevo" style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--orange)', flexShrink: 0 }} />}
                    <span>{a.texto}</span>
                  </div>
                  {a.detalle && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{a.detalle}</div>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
