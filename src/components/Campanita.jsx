import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Campanita de avisos: lo que hay pendiente de atender ahora mismo, agrupado
// por sitio (soporte, cobros, caja y campamento). Cada aviso lleva a donde se
// resuelve. Se recalcula al abrirla y cada pocos minutos.
// ─────────────────────────────────────────────────────────────────────────────

const COLOR = {
  tickets: 'var(--purple)',
  cobros: 'var(--teal)',
  caja: 'var(--orange)',
  campamento: '#00BBF4',
  clases: '#FF99D3',
};
const TITULO = {
  tickets: 'Soporte',
  cobros: 'Cobros',
  caja: 'Caja',
  campamento: 'Campamento',
  clases: 'Clases',
};

export default function Campanita({ onIr }) {
  const [datos, setDatos] = useState(null);
  const [abierta, setAbierta] = useState(false);
  const caja = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/notificaciones', { credentials: 'include' });
      if (r.ok) setDatos(await r.json());
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [cargar]);

  // Cerrar al pulsar fuera.
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierta(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierta]);

  const avisos = datos?.avisos || [];
  const porTipo = avisos.reduce((acc, a) => {
    (acc[a.tipo] = acc[a.tipo] || []).push(a);
    return acc;
  }, {});

  return (
    <div ref={caja} style={{ position: 'relative' }}>
      <button className="btn btn-icon" onClick={() => { setAbierta(a => !a); if (!abierta) cargar(); }}
        aria-label={avisos.length ? `${avisos.length} avisos` : 'Avisos'} style={{ position: 'relative' }}>
        <I.Bell />
        {avisos.length > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 999, background: 'var(--orange)', color: 'white',
            fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{avisos.length}</span>
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
            <button className="btn btn-sm btn-outline" onClick={cargar} style={{ fontSize: 11, padding: '3px 8px' }}>Actualizar</button>
          </div>

          {!avisos.length && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>
              Nada pendiente. Todo al día.
            </p>
          )}

          {Object.entries(porTipo).map(([tipo, lista]) => (
            <div key={tipo} style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: COLOR[tipo] }}>
                {TITULO[tipo] || tipo}
              </div>
              {lista.map((a, i) => (
                <button key={i} onClick={() => { setAbierta(false); onIr?.(a.destino); }}
                  style={{
                    textAlign: 'left', background: 'var(--bg-3)', border: '1px solid var(--line)',
                    borderLeft: `3px solid ${COLOR[tipo]}`, borderRadius: 10, padding: '8px 10px',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{a.texto}</div>
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
