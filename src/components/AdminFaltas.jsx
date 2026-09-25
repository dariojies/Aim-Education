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
// Y el resumen de un mes: cuántas faltas tiene cada alumno (sumando sus clases)
// y quién no ha venido ningún día.
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNAS = '1.4fr 1.1fr 110px 110px 1fr 1.5fr';
const sinTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const pastilla = (activo) => ({
  padding: '6px 12px', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', border: 0,
  background: activo ? 'var(--purple)' : 'transparent', color: activo ? '#fff' : 'var(--ink-2)',
});

export default function AdminFaltas({ onAbrirFicha }) {
  const [pestana, setPestana] = useState('seguidas');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'inline-flex', justifySelf: 'start', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden', background: 'var(--bg-2)' }}>
        <button type="button" style={{ ...pastilla(pestana === 'seguidas'), padding: '8px 16px', fontSize: 13 }} onClick={() => setPestana('seguidas')}>Faltas seguidas</button>
        <button type="button" style={{ ...pastilla(pestana === 'mes'), padding: '8px 16px', fontSize: 13 }} onClick={() => setPestana('mes')}>Resumen del mes</button>
      </div>
      {pestana === 'seguidas' ? <FaltasSeguidas onAbrirFicha={onAbrirFicha} /> : <ResumenMes onAbrirFicha={onAbrirFicha} />}
    </div>
  );
}

function FaltasSeguidas({ onAbrirFicha }) {
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
    const t = sinTildes(q.trim());
    return (datos?.filas || [])
      .filter(f => cuenta(f) >= minimo)
      .filter(f => !t || sinTildes(`${f.alumno} ${f.clase}`).includes(t))
      .sort((a, b) => cuenta(b) - cuenta(a) || String(b.ultimaFalta).localeCompare(String(a.ultimaFalta)));
  }, [datos, modo, minimo, q]);
  const nLlamar = (datos?.filas || []).filter(f => f.racha >= paraLlamar).length;

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

// ── Resumen del mes ──────────────────────────────────────────────────────────
const mesActual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).slice(0, 7);
const nombreMes = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
const COLS_MES = '1.4fr 110px 110px 2fr 1.4fr';

function Cifra({ valor, texto, color }) {
  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 16px', minWidth: 150 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--ink)', lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{texto}</div>
    </div>
  );
}

function ResumenMes({ onAbrirFicha }) {
  const [mes, setMes] = useState(mesActual());
  const [datos, setDatos] = useState(null);
  const [soloNunca, setSoloNunca] = useState(false);
  const [q, setQ] = useState('');

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/faltas/mes?mes=${mes}`, { credentials: 'include', cache: 'no-store' });
      if (r.ok) setDatos(await r.json());
    } catch { /* noop */ }
  }, [mes]);
  useEffect(() => { setDatos(null); cargar(); }, [cargar]);
  useEnVivo(cargar, { cada: 60000 });

  const filas = useMemo(() => {
    const t = sinTildes(q.trim());
    return (datos?.alumnos || [])
      .filter(a => !soloNunca || a.nuncaVino)
      .filter(a => !t || sinTildes(`${a.alumno} ${a.detalle.map(d => d.clase).join(' ')}`).includes(t));
  }, [datos, soloNunca, q]);
  const r = datos?.resumen;
  const esteMes = mes === mesActual();

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel">
        <h2><I.Calendar /> Resumen de {nombreMes(mes)}</h2>
        <p className="sub">
          Cuántas faltas tiene cada alumno {esteMes ? 'este mes' : 'ese mes'} (sumando todas sus clases) y quién no ha
          venido ningún día. Solo cuenta lo marcado al pasar lista{esteMes ? ', hasta hoy' : ''}.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <input type="month" value={mes} max={mesActual()} onChange={e => e.target.value && setMes(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', fontFamily: 'inherit' }} />
          <div style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden', background: 'var(--bg-2)' }}>
            <button type="button" style={pastilla(!soloNunca)} onClick={() => setSoloNunca(false)}>Todos con faltas</button>
            <button type="button" style={pastilla(soloNunca)} onClick={() => setSoloNunca(true)}>No han venido ningún día</button>
          </div>
          <div className="search-input" style={{ flex: '1 1 220px', maxWidth: 320 }}>
            <I.Search />
            <input placeholder="Buscar alumno o clase..." value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      {r && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Cifra valor={r.faltas} texto={`falta${r.faltas !== 1 ? 's' : ''} en total`} />
          <Cifra valor={r.alumnosConFaltas} texto={`alumno${r.alumnosConFaltas !== 1 ? 's' : ''} con alguna falta (de ${r.alumnosConLista} con lista)`} color="var(--orange)" />
          <Cifra valor={r.nuncaVinieron} texto={`no ha${r.nuncaVinieron !== 1 ? 'n' : ''} venido ningún día`} color={r.nuncaVinieron ? 'var(--danger, #dc2626)' : undefined} />
        </div>
      )}

      {!datos && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
      {datos && filas.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          {soloNunca ? 'Nadie se ha quedado sin venir ningún día.' : 'Nadie tiene faltas'}{q ? ' con esa búsqueda' : ''}{soloNunca ? '' : ` en ${nombreMes(mes)}.`}
        </div>
      )}
      {filas.length > 0 && (
        <div className="data-table">
          <div className="data-table-head" style={{ gridTemplateColumns: COLS_MES }}>
            <span>Alumno</span><span>Faltas</span><span>Vino</span><span>Por clase</span><span>Contacto familia</span>
          </div>
          {filas.map(a => (
            <div key={a.studentId} className="data-table-row"
              style={{ gridTemplateColumns: COLS_MES, alignItems: 'center', background: a.nuncaVino ? 'color-mix(in oklab, var(--danger, #dc2626) 6%, transparent)' : undefined }}>
              <div className="pri" style={{ minWidth: 0 }}>
                <button type="button" onClick={() => onAbrirFicha?.({ id: a.studentId })} title="Abrir su ficha"
                  style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontWeight: 800, fontSize: 14, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>
                  {a.alumno}
                </button>
                {a.nuncaVino && <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--danger, #dc2626)', textTransform: 'uppercase' }}>No ha venido ningún día</div>}
                {!a.nuncaVino && a.edad != null && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{a.edad} años</div>}
              </div>
              <span>
                <b style={{ fontSize: 20, color: a.nuncaVino ? 'var(--danger, #dc2626)' : a.faltas >= 3 ? 'var(--orange)' : 'var(--ink)' }}>{a.faltas}</b>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>de {a.clases} clase{a.clases !== 1 ? 's' : ''}</span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{a.vino} día{a.vino !== 1 ? 's' : ''}</span>
              <span style={{ fontSize: 12, display: 'grid', gap: 2, minWidth: 0 }}>
                {a.detalle.map(d => (
                  <span key={d.groupId} style={{ color: d.faltas ? 'var(--ink)' : 'var(--ink-3)' }}>
                    <b>{d.clase}</b>: {d.faltas} falta{d.faltas !== 1 ? 's' : ''} de {d.clases}
                    {d.vino === 0 && d.faltas > 0 && <span style={{ color: 'var(--danger, #dc2626)', fontWeight: 700 }}> · ningún día</span>}
                    {!d.sigue && <span style={{ color: 'var(--ink-3)' }}> · ya no está en la clase</span>}
                  </span>
                ))}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {a.contactos || (a.telefono ? `${a.alumno} · ${a.telefono}` : 'sin contacto')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
