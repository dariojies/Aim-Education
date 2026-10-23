import React, { useState, useEffect, useRef } from 'react';
import { numPaginas, paginaDe, pintarDiseno, cargarFuentes, cargarImagenes, tieneAnimacion, duracionAnimacion } from './render.js';
import { cargarVideos, sincronizarVideos, pararVideos } from './videos.js';

// ─────────────────────────────────────────────────────────────────────────────
// Presentar un diseño a pantalla completa: una página tras otra (con sus
// animaciones). Flechas, espacio o clic para pasar; «Pasar solas» las pasa en
// bucle (para la pantalla de recepción o un evento). Esc, para salir.
// La usan el editor y la página de solo ver (/d/…).
// ─────────────────────────────────────────────────────────────────────────────
export default function Presentacion({ doc, inicio = 0, variables = null, onCerrar }) {
  const n = numPaginas(doc);
  const [i, setI] = useState(Math.min(inicio, n - 1));
  const [solas, setSolas] = useState(false);
  const [segundos, setSegundos] = useState(8);
  const [ver, setVer] = useState(true);   // los controles (se esconden solos)
  const [tam, setTam] = useState({ w: window.innerWidth, h: window.innerHeight });
  const caja = useRef(null), lienzo = useRef(null), oculto = useRef(null);
  const salir = useRef(onCerrar); salir.current = onCerrar;

  // Pantalla completa (si el navegador deja); al salir de ella, se cierra.
  useEffect(() => {
    caja.current?.requestFullscreen?.().catch(() => {});
    const f = () => { if (!document.fullscreenElement) salir.current(); };
    const r = () => setTam({ w: window.innerWidth, h: window.innerHeight });
    document.addEventListener('fullscreenchange', f); window.addEventListener('resize', r);
    return () => {
      document.removeEventListener('fullscreenchange', f); window.removeEventListener('resize', r);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
  const pasar = (d) => setI(x => (d > 0 ? (x + 1 < n ? x + 1 : solas ? 0 : x) : Math.max(0, x - 1)));
  useEffect(() => {
    const f = (ev) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(ev.key)) { ev.preventDefault(); pasar(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(ev.key)) { ev.preventDefault(); pasar(-1); }
      else if (ev.key === 'Home') setI(0);
      else if (ev.key === 'End') setI(n - 1);
      else if (ev.key === 'Escape') salir.current();
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  });
  // Pintar la página (con su animación, si la tiene).
  useEffect(() => {
    let vivo = true, raf = null, parar = () => {};
    (async () => {
      const v = paginaDe(doc, i);
      await cargarFuentes(v);
      const imagenes = await cargarImagenes(v);
      const videos = await cargarVideos(v);
      if (!vivo || !lienzo.current) return;
      parar = () => pararVideos(videos);
      const k = Math.min(tam.w / v.ancho, tam.h / v.alto), dpr = Math.min(2, window.devicePixelRatio || 1);
      const c = lienzo.current;
      c.width = Math.round(v.ancho * k * dpr); c.height = Math.round(v.alto * k * dpr);
      c.style.width = `${v.ancho * k}px`; c.style.height = `${v.alto * k}px`;
      const ctx = c.getContext('2d');
      const pinta = (t) => { ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0); pintarDiseno(ctx, v, { imagenes, videos, variables, tiempo: t }); };
      if (!tieneAnimacion(v)) { pinta(null); return; }
      const dur = duracionAnimacion(v), t0 = performance.now();
      const paso = () => {
        if (!vivo) return;
        const t = (performance.now() - t0) / 1000;
        sincronizarVideos(videos, v, Math.min(t, dur), t < dur);
        pinta(Math.min(t, dur + 30)); raf = requestAnimationFrame(paso);
      };
      paso();
    })();
    return () => { vivo = false; cancelAnimationFrame(raf); parar(); };
  }, [doc, i, tam, variables]);
  // Pasar solas.
  useEffect(() => {
    if (!solas) return undefined;
    const espera = Math.max(segundos, tieneAnimacion(paginaDe(doc, i)) ? duracionAnimacion(paginaDe(doc, i)) + 1 : 0);
    const t = setTimeout(() => setI(x => (x + 1) % n), espera * 1000);
    return () => clearTimeout(t);
  }, [solas, i, segundos, doc, n]);
  // Los controles se esconden si no se mueve el ratón.
  const mover = () => { setVer(true); clearTimeout(oculto.current); oculto.current = setTimeout(() => setVer(false), 2500); };
  useEffect(() => { mover(); return () => clearTimeout(oculto.current); }, []);
  const boton = { font: 'inherit', fontSize: 14, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,.12)', border: 0, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' };
  return (
    <div ref={caja} role="dialog" aria-label="Presentación" onMouseMove={mover}
      onClick={(ev) => { if (ev.target === caja.current || ev.target === lienzo.current) pasar(ev.clientX < window.innerWidth / 3 ? -1 : 1); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000', display: 'grid', placeItems: 'center', cursor: ver ? 'default' : 'none' }}>
      <canvas ref={lienzo} style={{ display: 'block' }} />
      <div onClick={ev => ev.stopPropagation()} style={{ position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', borderRadius: 12, background: 'rgba(0,0,0,.7)', color: '#fff', fontSize: 14, opacity: ver ? 1 : 0, transition: 'opacity .3s' }}>
        <button type="button" style={boton} onClick={() => pasar(-1)} disabled={i === 0} aria-label="Página anterior">‹</button>
        <span style={{ minWidth: 60, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{i + 1} / {n}</span>
        <button type="button" style={boton} onClick={() => pasar(1)} disabled={i === n - 1 && !solas} aria-label="Página siguiente">›</button>
        <button type="button" style={{ ...boton, background: solas ? '#7C5CFF' : boton.background }} onClick={() => setSolas(v => !v)} title="Pasan solas, en bucle">{solas ? '⏸ Parar' : '⏵ Pasar solas'}</button>
        {solas && (
          <select value={segundos} onChange={e => setSegundos(Number(e.target.value))} aria-label="Segundos por página" style={{ font: 'inherit', fontSize: 13, background: '#222', color: '#fff', border: 0, borderRadius: 6, padding: '6px' }}>
            {[5, 8, 10, 15, 30].map(s => <option key={s} value={s}>{s} s</option>)}
          </select>
        )}
        <button type="button" style={boton} onClick={() => salir.current()} aria-label="Salir (Esc)">✕</button>
      </div>
    </div>
  );
}
