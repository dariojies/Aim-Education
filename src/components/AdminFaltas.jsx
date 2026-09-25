import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { useEnVivo } from '../envivo.js';
import { fmtFecha } from '../fechas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Faltas seguidas: para que secretaría vea qué alumnos llevan varias clases sin
// venir y llame a la familia. Sale de la lista que pasan los profes: por cada
// alumno y clase, las faltas seguidas hasta la última vez que vino. Se puede
// contar entre meses (la racha entera) o solo las de este mes. A partir de 4
// seguidas hay que llamar, y a secretaría le llega el aviso en la campanita.
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNAS = '1.4fr 1.1fr 110px 110px 1fr 1.5fr';

export default function AdminFaltas({ onAbrirFicha }) {
  const [datos, setDatos] = useState(null);
  const [modo, setModo] = useState('entre'); // 'entre' meses | 'mes' (solo este mes)
  const [minimo, setMinimo] = useState(2);
  const [q, setQ] = useState('');

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/faltas?minimo=1', { credentials: 'include', cache: 'no-store' });
      if (r.ok) setDatos(await r.json());
    } catch { /* noop */ }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEnVivo(cargar, { cada: 60000 });

  const paraLlamar = datos?.paraLlamar || 4;
  const cuenta = (f) => (modo === 'mes' ? f.rachaMes : f.racha);
  const filas = useMemo(() => {
    const t = q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return (datos?.filas || [])
      .filter(f => cuenta(f) >= minimo)
      .filter(f => !t || `${f.alumno} ${f.clase}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t))
      .sort((a, b) => cuenta(b) - cuenta(a) || String(b.ultimaFalta).localeCompare(String(a.ultimaFalta)));
  }, [datos, modo, minimo, q]);
  const nLlamar = (datos?.filas || []).filter(f => f.racha >= paraLlamar).length;

  const pastilla = (activo) => ({
    padding: '6px 12px', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', border: 0,
    background: activo ? 'var(--purple)' : 'transparent', color: activo ? '#fff' : 'var(--ink-2)',
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel">
        <h2><I.Calendar /> Faltas seguidas</h2>
        <p className="sub">
          Sale de la lista que pasan los profes: cuántas clases seguidas lleva cada alumno sin venir a su clase,
          hasta la última vez que vino. Una clase sin lista pasada no cuenta. A partir de {paraLlamar} faltas
          seguidas hay que llamar a la familia (te llega el aviso a la campanita).
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <div style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden', background: 'var(--bg-2)' }}>
            <button type="button" style={pastilla(modo === 'entre')} onClick={() => setModo('entre')}>Entre meses</button>
            <button type="button" style={pastilla(modo === 'mes')} onClick={() => setModo('mes')}>Solo este mes</button>
          </div>
          <label style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', gap: 6, alignItems: 'center' }}>
            Desde
            <select value={minimo} onChange={e => setMinimo(Number(e.target.value))}
              style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', fontFamily: 'inherit' }}>
              {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            falta{minimo !== 1 ? 's' : ''} seguida{minimo !== 1 ? 's' : ''}
          </label>
          <div className="search-input" style={{ flex: '1 1 220px', maxWidth: 320 }}>
            <I.Search />
            <input placeholder="Buscar alumno o clase..." value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {nLlamar > 0 && (
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--danger, #dc2626)' }}>
              <I.Phone /> {nLlamar} para llamar
            </span>
          )}
        </div>
      </div>

      {!datos && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
      {datos && filas.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          {modo === 'mes' ? 'Este mes nadie' : 'Nadie'} lleva {minimo} falta{minimo !== 1 ? 's' : ''} seguida{minimo !== 1 ? 's' : ''}{q ? ' con esa búsqueda' : ''}.
        </div>
      )}
      {filas.length > 0 && (
        <div className="data-table">
          <div className="data-table-head" style={{ gridTemplateColumns: COLUMNAS }}>
            <span>Alumno</span><span>Clase</span>
            <span>{modo === 'mes' ? 'Seguidas (mes)' : 'Seguidas'}</span>
            <span>Este mes</span><span>Desde · vino por última vez</span><span>Contacto familia</span>
          </div>
          {filas.map(f => {
            const n = cuenta(f);
            const llamar = f.racha >= paraLlamar;
            return (
              <div key={`${f.studentId}:${f.groupId}`} className="data-table-row"
                style={{ gridTemplateColumns: COLUMNAS, alignItems: 'center', background: llamar ? 'color-mix(in oklab, var(--danger, #dc2626) 6%, transparent)' : undefined }}>
                <div className="pri" style={{ minWidth: 0 }}>
                  <button type="button" onClick={() => onAbrirFicha?.({ id: f.studentId })} title="Abrir su ficha"
                    style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontWeight: 800, fontSize: 14, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>
                    {f.alumno}
                  </button>
                  {f.edad != null && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{f.edad} años</div>}
                </div>
                <span style={{ fontSize: 12.5, minWidth: 0 }}>
                  <b>{f.clase}</b>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>{f.actividad}</span>
                </span>
                <span>
                  <b style={{ fontSize: 20, color: llamar ? 'var(--danger, #dc2626)' : n >= 2 ? 'var(--orange)' : 'var(--ink)' }}>{n}</b>
                  {llamar && <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--danger, #dc2626)', textTransform: 'uppercase' }}>Llamar</span>}
                  {modo === 'mes' && f.racha > f.rachaMes && <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-3)' }}>{f.racha} entre meses</span>}
                </span>
                <span style={{ fontSize: 12.5 }}>
                  <b>{f.faltasMes}</b> de {f.clasesMes} clase{f.clasesMes !== 1 ? 's' : ''}
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>faltas</span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                  desde el {fmtFecha(f.desde)}
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>
                    {f.ultimaVez ? `vino el ${fmtFecha(f.ultimaVez)}` : 'no consta que haya venido'}
                  </span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.contactos || (f.telefono ? `${f.alumno} · ${f.telefono}` : 'sin contacto')}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
