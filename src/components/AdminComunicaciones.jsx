import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Comunicaciones (CRM). De momento, los segmentos (ticket #313): a quién va una
// comunicación, sacado de los datos del club. Se ve al momento cuántos y quiénes
// entran, se guarda con nombre y se exporta. Respeta lo que cada familia ha dicho
// de cada tipo de comunicación. Las campañas (#314) usarán estos segmentos.
// ─────────────────────────────────────────────────────────────────────────────

const VACIO = { actividades: [], clases: [], estado: 'activos', edadMin: '', edadMax: '', pendientes: false, faltasMin: '', campamento: false, destino: 'familia', tipo: 'servicio' };
const pastilla = (activo) => ({
  padding: '6px 12px', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', border: 0,
  background: activo ? 'var(--purple)' : 'transparent', color: activo ? '#fff' : 'var(--ink-2)',
});
const grupoPastillas = { display: 'inline-flex', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden', background: 'var(--bg-3)' };
const inp = { fontFamily: 'inherit', fontSize: 13, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' };

function Elegir({ opciones, valor, onCambio }) {
  return (
    <div style={grupoPastillas}>
      {opciones.map(([k, t]) => <button key={k} type="button" style={pastilla(valor === k)} onClick={() => onCambio(k)}>{t}</button>)}
    </div>
  );
}
function Fila({ titulo, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>{titulo}</span>
      {children}
    </div>
  );
}

export default function AdminComunicaciones({ showToast, onAbrirFicha }) {
  const [opciones, setOpciones] = useState({ actividades: [], clases: [] });
  const [f, setF] = useState(VACIO);
  const [res, setRes] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [guardados, setGuardados] = useState([]);
  const [actual, setActual] = useState(''); // id del segmento guardado que se está viendo
  const [verClases, setVerClases] = useState(false);
  const [qClase, setQClase] = useState('');

  useEffect(() => {
    fetch('/api/admin/segmentos/opciones', { credentials: 'include' }).then(r => (r.ok ? r.json() : null)).then(d => d && setOpciones(d)).catch(() => {});
    fetch('/api/admin/segmentos', { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : { segmentos: [] })).then(d => setGuardados(d.segmentos || [])).catch(() => {});
  }, []);

  // La vista se recalcula sola al tocar un filtro (con una pequeña espera).
  const ver = useCallback(async (filtros) => {
    setCargando(true);
    try {
      const r = await fetch('/api/admin/segmentos/vista', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ filtros }),
      });
      if (r.ok) setRes(await r.json());
    } catch { /* noop */ } finally { setCargando(false); }
  }, []);
  useEffect(() => { const t = setTimeout(() => ver(f), 350); return () => clearTimeout(t); }, [f, ver]);

  const cambia = (k, v) => setF(x => ({ ...x, [k]: v }));
  const alterna = (k, v) => setF(x => ({ ...x, [k]: x[k].includes(v) ? x[k].filter(y => y !== v) : [...x[k], v] }));
  const clasesVisibles = useMemo(() => {
    const t = qClase.trim().toLowerCase();
    return opciones.clases.filter(c => (!f.actividades.length || f.actividades.includes(c.actividad))
      && (!t || `${c.nombre} ${c.actividad}`.toLowerCase().includes(t)));
  }, [opciones.clases, f.actividades, qClase]);

  async function guardarLista(lista, aviso) {
    const r = await fetch('/api/admin/segmentos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ segmentos: lista }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return alert(d.error || 'No se ha podido guardar.');
    setGuardados(d.segmentos); showToast?.(aviso);
    return d.segmentos;
  }
  async function guardarComo() {
    const nombre = window.prompt('Nombre del segmento:', guardados.find(s => s.id === actual)?.nombre || '');
    if (!nombre?.trim()) return;
    const existe = guardados.find(s => s.nombre.toLowerCase() === nombre.trim().toLowerCase());
    const lista = existe
      ? guardados.map(s => (s.id === existe.id ? { ...s, filtros: f } : s))
      : [...guardados, { id: '', nombre: nombre.trim(), filtros: f }];
    const nuevos = await guardarLista(lista, `Segmento «${nombre.trim()}» guardado.`);
    if (nuevos) setActual(nuevos.find(s => s.nombre.toLowerCase() === nombre.trim().toLowerCase())?.id || '');
  }
  async function borrar() {
    const s = guardados.find(x => x.id === actual);
    if (!s || !window.confirm(`¿Borrar el segmento «${s.nombre}»?`)) return;
    await guardarLista(guardados.filter(x => x.id !== actual), 'Segmento borrado.');
    setActual('');
  }
  function cargarGuardado(id) {
    setActual(id);
    const s = guardados.find(x => x.id === id);
    if (s) setF({ ...VACIO, ...s.filtros });
  }
  function exportar() {
    if (!res) return;
    const filas = [['Alumno', 'Edad', 'Clases', 'Destinatario', 'Relación', 'Correo', 'Fuera por']];
    for (const a of res.alumnos) {
      if (a.fuera) filas.push([a.nombre, a.edad ?? '', a.clases, '', '', '', a.fuera]);
      else for (const d of a.destinatarios) filas.push([a.nombre, a.edad ?? '', a.clases, d.nombre, d.relacion, d.email, '']);
    }
    const csv = filas.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `segmento-${(guardados.find(s => s.id === actual)?.nombre || 'sin-nombre').replace(/[^\w-]+/g, '_')}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const r = res?.resumen;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel">
        <h2><I.Users /> Segmentos</h2>
        <p className="sub">
          A quién va una comunicación, sacado de los datos del club. Se respeta lo que cada familia ha dicho: en los comerciales
          solo entran quienes los aceptan; en los de actividades se quitan quienes los han rechazado.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <select value={actual} onChange={e => (e.target.value ? cargarGuardado(e.target.value) : (setActual(''), setF(VACIO)))} style={{ ...inp, minWidth: 220 }} aria-label="Segmentos guardados">
            <option value="">— Segmento nuevo —</option>
            {guardados.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <button type="button" className="btn btn-sm btn-primary" onClick={guardarComo}>Guardar segmento</button>
          {actual && <button type="button" className="btn btn-sm btn-outline" onClick={borrar}>Borrar</button>}
          <button type="button" className="btn btn-sm btn-outline" onClick={() => { setActual(''); setF(VACIO); }}>Empezar de cero</button>
        </div>
      </div>

      <div className="panel" style={{ display: 'grid', gap: 14 }}>
        <Fila titulo="Actividades (ninguna marcada = todas)">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {opciones.actividades.map(a => (
              <button key={a} type="button" className={`filter-pill ${f.actividades.includes(a) ? 'is-active' : ''}`} onClick={() => alterna('actividades', a)}>{a}</button>
            ))}
          </div>
        </Fila>
        <Fila titulo={`Clases concretas${f.clases.length ? ` (${f.clases.length} elegidas)` : ''}`}>
          <div>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setVerClases(v => !v)}>{verClases ? 'Ocultar clases' : 'Elegir clases concretas'}</button>
            {f.clases.length > 0 && <button type="button" className="btn btn-sm btn-outline" style={{ marginLeft: 6 }} onClick={() => cambia('clases', [])}>Quitar clases</button>}
          </div>
          {verClases && (
            <div style={{ display: 'grid', gap: 6, border: '1px solid var(--line)', borderRadius: 10, padding: 10, maxHeight: 240, overflowY: 'auto' }}>
              <input style={inp} placeholder="Buscar clase…" value={qClase} onChange={e => setQClase(e.target.value)} />
              {clasesVisibles.map(c => (
                <label key={c.id} style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'center' }}>
                  <input type="checkbox" checked={f.clases.includes(c.id)} onChange={() => alterna('clases', c.id)} />
                  {c.nombre} <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>· {c.actividad}</span>
                </label>
              ))}
            </div>
          )}
        </Fila>
        <Fila titulo="Estado">
          <Elegir valor={f.estado} onCambio={v => cambia('estado', v)} opciones={[['activos', 'Está ahora'], ['baja', 'La dejó'], ['todos', 'Cualquiera']]} />
        </Fila>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
          <Fila titulo="Edad">
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              de <input type="number" min="0" max="99" style={{ ...inp, width: 70 }} value={f.edadMin} onChange={e => cambia('edadMin', e.target.value)} aria-label="Edad desde" />
              a <input type="number" min="0" max="99" style={{ ...inp, width: 70 }} value={f.edadMax} onChange={e => cambia('edadMax', e.target.value)} aria-label="Edad hasta" /> años
            </span>
          </Fila>
          <Fila titulo="Faltas este mes">
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="number" min="0" style={{ ...inp, width: 70 }} value={f.faltasMin} onChange={e => cambia('faltasMin', e.target.value)} aria-label="Faltas mínimas" /> o más
            </span>
          </Fila>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.pendientes} onChange={e => cambia('pendientes', e.target.checked)} /> Con recibos pendientes</label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.campamento} onChange={e => cambia('campamento', e.target.checked)} /> Inscritos en el campamento</label>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Fila titulo="A quién se escribe">
            <Elegir valor={f.destino} onCambio={v => cambia('destino', v)} opciones={[['familia', 'A la familia (tutores)'], ['alumno', 'Al propio alumno']]} />
          </Fila>
          <Fila titulo="Tipo de comunicación">
            <Elegir valor={f.tipo} onCambio={v => cambia('tipo', v)} opciones={[['servicio', 'De servicio'], ['actividades', 'De sus actividades'], ['comercial', 'Comercial']]} />
          </Fila>
        </div>
      </div>

      {r && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            [r.alumnos, 'alumnos en el segmento'],
            [r.conDestinatario, 'con a quién escribir'],
            [r.direcciones, 'direcciones de correo'],
          ].map(([v, t]) => (
            <div key={t} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 14px', minWidth: 140 }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t}</div>
            </div>
          ))}
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {r.sinCorreo ? `${r.sinCorreo} sin correo · ` : ''}{r.porPermisos ? `${r.porPermisos} fuera por sus permisos` : ''}
            {cargando ? ' · calculando…' : ''}
          </span>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm btn-outline" onClick={exportar} disabled={!res.alumnos.length}><I.Download /> Exportar CSV</button>
        </div>
      )}

      {res && res.alumnos.length > 0 && (
        <div className="data-table">
          <div className="data-table-head" style={{ gridTemplateColumns: '1.3fr 70px 1.4fr 2fr' }}>
            <span>Alumno</span><span>Edad</span><span>Clases</span><span>Se escribe a</span>
          </div>
          {res.alumnos.slice(0, 300).map(a => (
            <div key={a.id} className="data-table-row" style={{ gridTemplateColumns: '1.3fr 70px 1.4fr 2fr', alignItems: 'center', opacity: a.fuera ? 0.6 : 1 }}>
              <button type="button" onClick={() => onAbrirFicha?.({ id: a.id })}
                style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontWeight: 800, fontSize: 14, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>{a.nombre}</button>
              <span style={{ fontSize: 13 }}>{a.edad ?? '—'}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{a.clases || '—'}</span>
              <span style={{ fontSize: 12 }}>
                {a.fuera
                  ? <span style={{ color: 'var(--orange)', fontWeight: 700 }}>Fuera: {a.fuera}</span>
                  : a.destinatarios.map(d => <span key={d.email} style={{ display: 'block' }}>{d.nombre} <span style={{ color: 'var(--ink-3)' }}>· {d.relacion} · {d.email}</span></span>)}
              </span>
            </div>
          ))}
        </div>
      )}
      {res && res.alumnos.length > 300 && <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>Se enseñan los 300 primeros; el CSV lleva todos.</p>}
      {res && !res.alumnos.length && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          Nadie cumple esos filtros.
        </div>
      )}
    </div>
  );
}
