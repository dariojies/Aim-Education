import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import AdminCampanas from './AdminCampanas.jsx';
import AdminAutomatismos from './AdminAutomatismos.jsx';
import { TIPOS_CORREO, describirSegmento } from './crmTextos.js';

// ─────────────────────────────────────────────────────────────────────────────
// Comunicaciones (CRM). Los segmentos (ticket #313) son grupos de alumnos a los
// que escribir, sacados de los datos del club; se guardan con nombre y los usan
// las campañas (#314). Se crean en tres pasos (qué alumnos, afinar, a quién se
// escribe) con un resumen al lado que dice en una frase quién entra y cuántos
// correos saldrían con cada tipo de correo. El tipo lo pone la campaña, no el
// segmento: aquí solo se enseña cómo cambia la cuenta.
// ─────────────────────────────────────────────────────────────────────────────

const VACIO = { actividades: [], clases: [], estado: 'activos', edadMin: '', edadMax: '', pendientes: false, faltasMin: '', campamento: false, destino: 'familia', tipo: 'servicio' };
const pastilla = (activo) => ({
  padding: '6px 12px', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', border: 0,
  background: activo ? 'var(--purple)' : 'transparent', color: activo ? '#fff' : 'var(--ink-2)',
});
const grupoPastillas = { display: 'inline-flex', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden', background: 'var(--bg-3)' };
const inp = { fontFamily: 'inherit', fontSize: 13, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' };
const mismo = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Comunicaciones: pestañas de segmentos, campañas y automatismos. La pestaña la
// lleva el panel (se elige también desde el menú del CRM); si no se la pasan,
// la guarda ella misma.
export default function AdminComunicaciones({ showToast, onAbrirFicha, pestana: pestanaFuera, onPestana }) {
  const [pestanaDentro, setPestanaDentro] = useState('segmentos');
  const pestana = pestanaFuera || pestanaDentro;
  const setPestana = onPestana || setPestanaDentro;
  // «Usar en una campaña» desde un segmento: abre una campaña nueva con él.
  const [campanaCon, setCampanaCon] = useState(null);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...grupoPastillas, justifySelf: 'start' }}>
        <button type="button" style={{ ...pastilla(pestana === 'segmentos'), padding: '8px 16px', fontSize: 13 }} onClick={() => setPestana('segmentos')}>Segmentos</button>
        <button type="button" style={{ ...pastilla(pestana === 'campanas'), padding: '8px 16px', fontSize: 13 }} onClick={() => setPestana('campanas')}>Campañas</button>
        <button type="button" style={{ ...pastilla(pestana === 'automatismos'), padding: '8px 16px', fontSize: 13 }} onClick={() => setPestana('automatismos')}>Automatismos</button>
      </div>
      {pestana === 'segmentos' && <Segmentos showToast={showToast} onAbrirFicha={onAbrirFicha}
        onUsarEnCampana={(nombre) => { setCampanaCon(nombre); setPestana('campanas'); }} />}
      {pestana === 'campanas' && <AdminCampanas showToast={showToast} onAbrirFicha={onAbrirFicha}
        nuevaConSegmento={campanaCon} onEmpezada={() => setCampanaCon(null)} />}
      {pestana === 'automatismos' && <AdminAutomatismos showToast={showToast} onAbrirFicha={onAbrirFicha} />}
    </div>
  );
}

// ── Segmentos: la lista y el editor ──────────────────────────────────────────
function Segmentos({ showToast, onAbrirFicha, onUsarEnCampana }) {
  const [opciones, setOpciones] = useState({ actividades: [], clases: [] });
  const [guardados, setGuardados] = useState(null);
  const [editando, setEditando] = useState(null); // { id, nombre, filtros }

  const cargar = useCallback(() => fetch('/api/admin/segmentos', { credentials: 'include', cache: 'no-store' })
    .then(r => (r.ok ? r.json() : { segmentos: [] })).then(d => setGuardados(d.segmentos || [])).catch(() => setGuardados([])), []);
  useEffect(() => {
    fetch('/api/admin/segmentos/opciones', { credentials: 'include' }).then(r => (r.ok ? r.json() : null)).then(d => d && setOpciones(d)).catch(() => {});
    cargar();
  }, [cargar]);

  async function guardarLista(lista, aviso) {
    const r = await fetch('/api/admin/segmentos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ segmentos: lista }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { alert(d.error || 'No se ha podido guardar.'); return null; }
    setGuardados(d.segmentos); showToast?.(aviso);
    return d.segmentos;
  }

  if (editando) {
    return <EditorSegmento inicial={editando} opciones={opciones} guardados={guardados || []} guardarLista={guardarLista}
      onAbrirFicha={onAbrirFicha} onUsarEnCampana={onUsarEnCampana} onVolver={() => setEditando(null)} />;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}><I.Users /> Segmentos</h2>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditando({ id: '', nombre: '', filtros: VACIO })}><I.Plus /> Crear segmento</button>
        </div>
        <p className="sub" style={{ marginBottom: 0 }}>
          Un segmento es un grupo de alumnos al que escribir, por ejemplo «Padres de Ballet de 6 a 10 años».
          Lo creas aquí una vez y luego lo eliges al preparar una campaña.
        </p>
      </div>

      {guardados === null && <p style={{ color: 'var(--ink-3)', margin: 0 }}>Cargando…</p>}
      {guardados?.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          Todavía no hay ningún segmento. Pulsa <b>Crear segmento</b> para hacer el primero.
        </div>
      )}
      {guardados?.length > 0 && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {guardados.map(s => (
            <button key={s.id} type="button" onClick={() => setEditando({ id: s.id, nombre: s.nombre, filtros: { ...VACIO, ...s.filtros } })}
              className="panel" style={{ margin: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'grid', gap: 6, alignContent: 'start' }}>
              <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>{s.nombre}</span>
              <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>{describirSegmento({ ...VACIO, ...s.filtros }, opciones.clases)}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--purple)', marginTop: 4 }}>Abrir →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Paso({ n, titulo, ayuda, children }) {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr)', gap: 12 }}>
      <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--purple)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>{n}</span>
      <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{titulo}</h3>
          {ayuda && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>{ayuda}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

// Una opción grande con su explicación, para elegir una de dos o tres.
function Opcion({ activa, titulo, texto, onClick }) {
  return (
    <button type="button" role="radio" aria-checked={activa} onClick={onClick} style={{
      flex: '1 1 200px', textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
      border: `2px solid ${activa ? 'var(--purple)' : 'var(--line)'}`,
      background: activa ? 'color-mix(in oklab, var(--purple) 8%, var(--bg-2))' : 'var(--bg-2)',
    }}>
      <span style={{ display: 'block', fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>{titulo}</span>
      <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{texto}</span>
    </button>
  );
}

function EditorSegmento({ inicial, opciones, guardados, guardarLista, onAbrirFicha, onUsarEnCampana, onVolver }) {
  const [id, setId] = useState(inicial.id);
  const [nombre, setNombre] = useState(inicial.nombre);
  const [f, setF] = useState(inicial.filtros);
  const [guardado, setGuardado] = useState({ nombre: inicial.nombre, filtros: inicial.filtros });
  const [res, setRes] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [verClases, setVerClases] = useState(inicial.filtros.clases?.length > 0);
  const [qClase, setQClase] = useState('');
  const [verLista, setVerLista] = useState(false);

  // La cuenta se rehace sola al tocar algo (con una pequeña espera). La lista
  // se pide como «aviso del club», que es la que llega a todos los que tienen
  // correo; cada fila dice además qué otros tipos recibiría.
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      setCargando(true);
      try {
        const r = await fetch('/api/admin/segmentos/vista', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ filtros: { ...f, tipo: 'servicio' } }),
        });
        if (r.ok && vivo) setRes(await r.json());
      } catch { /* noop */ } finally { if (vivo) setCargando(false); }
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [f]);

  const cambia = (k, v) => setF(x => ({ ...x, [k]: v }));
  const alterna = (k, v) => setF(x => ({ ...x, [k]: x[k].includes(v) ? x[k].filter(y => y !== v) : [...x[k], v] }));
  const clasesVisibles = useMemo(() => {
    const t = qClase.trim().toLowerCase();
    return opciones.clases.filter(c => (!f.actividades.length || f.actividades.includes(c.actividad))
      && (!t || `${c.nombre} ${c.actividad}`.toLowerCase().includes(t)));
  }, [opciones.clases, f.actividades, qClase]);
  const sinGuardar = !id || nombre.trim() !== guardado.nombre || !mismo(f, guardado.filtros);

  async function guardar() {
    const n = nombre.trim();
    if (!n) { alert('Ponle un nombre al segmento para poder guardarlo.'); return null; }
    if (guardados.some(s => s.id !== id && s.nombre.toLowerCase() === n.toLowerCase())) { alert(`Ya hay otro segmento que se llama «${n}». Ponle otro nombre.`); return null; }
    const lista = id ? guardados.map(s => (s.id === id ? { ...s, nombre: n, filtros: f } : s)) : [...guardados, { id: '', nombre: n, filtros: f }];
    const nuevos = await guardarLista(lista, `Segmento «${n}» guardado.`);
    if (!nuevos) return null;
    const este = nuevos.find(s => s.nombre.toLowerCase() === n.toLowerCase());
    setId(este?.id || ''); setNombre(n); setGuardado({ nombre: n, filtros: f });
    return n;
  }
  async function borrar() {
    if (!id || !window.confirm(`¿Borrar el segmento «${guardado.nombre}»? Las campañas ya enviadas no cambian.`)) return;
    if (await guardarLista(guardados.filter(s => s.id !== id), 'Segmento borrado.')) onVolver();
  }
  async function usarEnCampana() {
    const n = sinGuardar ? await guardar() : nombre.trim();
    if (n) onUsarEnCampana?.(n);
  }
  function volver() {
    if (sinGuardar && (id || nombre.trim() || !mismo(f, VACIO)) && !window.confirm('Hay cambios sin guardar. ¿Salir igualmente?')) return;
    onVolver();
  }
  function exportar() {
    if (!res) return;
    const si = (b) => (b ? 'Sí' : 'No');
    const filas = [['Alumno', 'Edad', 'Clases', 'Se escribe a', 'Relación', 'Correo', 'Aviso del club', 'Novedades de sus clases', 'Publicidad y ofertas']];
    for (const a of res.alumnos) {
      const r = a.recibe || {};
      if (!a.destinatarios.length) filas.push([a.nombre, a.edad ?? '', a.clases, '', '', 'Sin correo', 'No', 'No', 'No']);
      else for (const d of a.destinatarios) filas.push([a.nombre, a.edad ?? '', a.clases, d.nombre, d.relacion, d.email, si(r.servicio), si(r.actividades), si(r.comercial)]);
    }
    const csv = filas.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `segmento-${(nombre.trim() || 'sin-nombre').replace(/[^\w-]+/g, '_')}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const r = res?.resumen;
  // La edad cuenta como una sola condición aunque tenga «desde» y «hasta».
  const afinados = [f.edadMin || f.edadMax, Number(f.faltasMin) > 0, f.pendientes, f.campamento].filter(Boolean).length;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={volver}>← Tus segmentos</button>
        <input style={{ ...inp, fontSize: 15, fontWeight: 700, flex: '1 1 260px', padding: '9px 12px' }} value={nombre} onChange={e => setNombre(e.target.value)}
          placeholder="Ponle un nombre, p. ej. «Padres de Ballet»" aria-label="Nombre del segmento" />
        {id && <button type="button" className="btn btn-sm btn-outline" onClick={borrar}><I.Trash /> Borrar</button>}
        <button type="button" className="btn btn-sm btn-primary" onClick={guardar} disabled={!sinGuardar}>{sinGuardar ? 'Guardar' : 'Guardado ✓'}</button>
      </div>

      <div className="seg-editor">
        <div className="panel" style={{ display: 'grid', gap: 26, margin: 0 }}>
          <Paso n={1} titulo="¿Qué alumnos?">
            <div style={grupoPastillas} role="radiogroup" aria-label="Qué alumnos">
              {[['activos', 'Los que vienen ahora'], ['baja', 'Los que ya no vienen'], ['todos', 'Los dos']].map(([k, t]) => (
                <button key={k} type="button" role="radio" aria-checked={f.estado === k} style={pastilla(f.estado === k)} onClick={() => cambia('estado', k)}>{t}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>De qué actividades</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className={`filter-pill ${!f.actividades.length ? 'is-active' : ''}`} onClick={() => cambia('actividades', [])}>Todas</button>
                {opciones.actividades.map(a => (
                  <button key={a} type="button" aria-pressed={f.actividades.includes(a)} className={`filter-pill ${f.actividades.includes(a) ? 'is-active' : ''}`} onClick={() => alterna('actividades', a)}>{a}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={verClases || f.clases.length > 0} onChange={e => { setVerClases(e.target.checked); if (!e.target.checked) cambia('clases', []); }} />
                Solo algunas clases{f.clases.length ? ` (${f.clases.length} elegida${f.clases.length !== 1 ? 's' : ''})` : ''}
              </label>
              {(verClases || f.clases.length > 0) && (
                <div style={{ display: 'grid', gap: 6, border: '1px solid var(--line)', borderRadius: 10, padding: 10, maxHeight: 240, overflowY: 'auto' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Marca las clases. Si marcas alguna, cuentan solo esas.</span>
                  <input style={inp} placeholder="Buscar clase…" value={qClase} onChange={e => setQClase(e.target.value)} />
                  {clasesVisibles.map(c => (
                    <label key={c.id} style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'center' }}>
                      <input type="checkbox" checked={f.clases.includes(c.id)} onChange={() => alterna('clases', c.id)} />
                      {c.nombre} <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>· {c.actividad}</span>
                    </label>
                  ))}
                  {!clasesVisibles.length && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Ninguna clase con esa búsqueda.</span>}
                </div>
              )}
            </div>
          </Paso>

          <Paso n={2} titulo="¿Quieres afinar más?" ayuda={`Opcional. Déjalo en blanco si no hace falta.${afinados ? ` Ahora mismo: ${afinados} ${afinados === 1 ? 'condición' : 'condiciones'}.` : ''}`}>
            <div style={{ display: 'grid', gap: 10 }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
                Que tengan entre
                <input type="number" min="0" max="99" style={{ ...inp, width: 64 }} value={f.edadMin} onChange={e => cambia('edadMin', e.target.value)} aria-label="Edad desde" />
                y
                <input type="number" min="0" max="99" style={{ ...inp, width: 64 }} value={f.edadMax} onChange={e => cambia('edadMax', e.target.value)} aria-label="Edad hasta" />
                años
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
                Que hayan faltado
                <input type="number" min="0" style={{ ...inp, width: 64 }} value={f.faltasMin} onChange={e => cambia('faltasMin', e.target.value)} aria-label="Faltas mínimas este mes" />
                veces o más este mes
              </span>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={f.pendientes} onChange={e => cambia('pendientes', e.target.checked)} /> Que tengan recibos sin pagar</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={f.campamento} onChange={e => cambia('campamento', e.target.checked)} /> Que estén apuntados al campamento</label>
            </div>
          </Paso>

          <Paso n={3} titulo="¿A quién le escribimos?">
            <div role="radiogroup" aria-label="A quién se escribe" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Opcion activa={f.destino !== 'alumno'} onClick={() => cambia('destino', 'familia')} titulo="A sus padres o tutores"
                texto="Lo normal con menores. Si un alumno no tiene tutores con correo, se le escribe a él." />
              <Opcion activa={f.destino === 'alumno'} onClick={() => cambia('destino', 'alumno')} titulo="Al propio alumno"
                texto="Para alumnos adultos, a su propio correo." />
            </div>
          </Paso>
        </div>

        <aside className="panel seg-resumen" style={{ margin: 0, display: 'grid', gap: 14 }} aria-live="polite">
          <div>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Resumen</span>
            <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--ink)' }}>{describirSegmento(f, opciones.clases)}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{r ? r.alumnos : '…'}</span>
            <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>alumno{r?.alumnos === 1 ? '' : 's'} en el segmento{cargando ? ' · contando…' : ''}</span>
          </div>
          {r && (
            <div style={{ display: 'grid', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Cuántos correos saldrían según lo que mandes:</span>
              {TIPOS_CORREO.map(t => {
                const c = r.porTipo?.[t.id];
                return (
                  <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: 'var(--bg-3)' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{t.nombre}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>{t.quien}</span>
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', fontWeight: 800, fontSize: 18 }}>{c ? c.correos : '—'}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>correo{c?.correos === 1 ? '' : 's'}</span>
                    </span>
                  </div>
                );
              })}
              {r.sinCorreo > 0 && <span style={{ fontSize: 12, color: 'var(--orange)' }}>{r.sinCorreo} alumno{r.sinCorreo !== 1 ? 's' : ''} no {r.sinCorreo !== 1 ? 'tienen' : 'tiene'} ningún correo al que escribir.</span>}
              {r.limite && <span style={{ fontSize: 12, color: 'var(--orange)' }}>Se cuentan los 2.000 primeros: afina un poco más.</span>}
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={usarEnCampana} disabled={!r?.alumnos}>Usar en una campaña →</button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm btn-outline" style={{ flex: 1 }} onClick={() => setVerLista(v => !v)} disabled={!r?.alumnos}>{verLista ? 'Ocultar la lista' : 'Ver quiénes son'}</button>
              <button type="button" className="btn btn-sm btn-outline" style={{ flex: 1 }} onClick={exportar} disabled={!r?.alumnos}><I.Download /> Descargar</button>
            </div>
          </div>
        </aside>
      </div>

      {verLista && res && res.alumnos.length > 0 && (
        <div className="data-table">
          <div className="data-table-head" style={{ gridTemplateColumns: '1.2fr 60px 1.3fr 1.8fr 1.3fr' }}>
            <span>Alumno</span><span>Edad</span><span>Clases</span><span>Se escribe a</span><span>Qué recibe</span>
          </div>
          {res.alumnos.slice(0, 300).map(a => (
            <div key={a.id} className="data-table-row" style={{ gridTemplateColumns: '1.2fr 60px 1.3fr 1.8fr 1.3fr', alignItems: 'center' }}>
              <button type="button" onClick={() => onAbrirFicha?.({ id: a.id })}
                style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontWeight: 800, fontSize: 14, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>{a.nombre}</button>
              <span style={{ fontSize: 13 }}>{a.edad ?? '—'}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{a.clases || '—'}</span>
              <span style={{ fontSize: 12 }}>
                {a.destinatarios.length
                  ? a.destinatarios.map(d => <span key={d.email} style={{ display: 'block' }}>{d.nombre} <span style={{ color: 'var(--ink-3)' }}>· {d.relacion} · {d.email}</span></span>)
                  : <span style={{ color: 'var(--orange)', fontWeight: 700 }}>Sin correo</span>}
              </span>
              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {TIPOS_CORREO.map(t => {
                  const si = !!a.recibe?.[t.id];
                  return (
                    <span key={t.id} title={`${t.nombre}: ${si ? 'sí' : 'no'}`} style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                      background: si ? 'color-mix(in oklab, var(--teal) 16%, transparent)' : 'var(--bg-3)',
                      color: si ? 'var(--teal)' : 'var(--ink-3)', textDecoration: si ? 'none' : 'line-through',
                    }}>{{ servicio: 'Avisos', actividades: 'Novedades', comercial: 'Publicidad' }[t.id]}</span>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      )}
      {verLista && res && res.alumnos.length > 300 && <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>Se enseñan los 300 primeros; en «Descargar» van todos.</p>}
      {res && !res.alumnos.length && (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          Ningún alumno cumple todo eso. Prueba a quitar alguna condición.
        </div>
      )}
    </div>
  );
}
