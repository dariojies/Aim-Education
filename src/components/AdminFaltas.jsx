import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { useEnVivo } from '../envivo.js';
import { fmtFecha } from '../fechas.js';
import { FALTAS_PARA_LLAMAR } from '../../permisos.js';
import { FormAvisoFalta, AvisoApuntado } from './AvisosFalta.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Faltas seguidas: para que secretaría vea qué alumnos llevan varias clases sin
// venir y llame a la familia. Sale de la lista que pasan los profes: por cada
// alumno y clase, las faltas seguidas hasta la última vez que vino. Se puede
// contar entre meses (la racha entera) o solo las de este mes. A partir de
// FALTAS_PARA_LLAMAR seguidas hay que llamar, y a secretaría le llega el aviso
// en la campanita. Cuando llama, lo apunta con «Ya he llamado» (#402): el aviso
// se apaga hasta que falte otras FALTAS_PARA_LLAMAR veces seguidas (#414), y la
// llamada queda en su ficha. Si la familia ha avisado de que va a faltar unos
// días (#525), se apunta con sus fechas y mientras tanto ni se llama ni sale el
// correo automático de faltas.
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

  const paraLlamar = datos?.paraLlamar || FALTAS_PARA_LLAMAR;
  const cuenta = (f) => (modo === 'mes' ? f.rachaMes : f.racha);
  const filas = useMemo(() => {
    const t = sinTildes(q.trim());
    return (datos?.filas || [])
      .filter(f => cuenta(f) >= minimo)
      .filter(f => !t || sinTildes(`${f.alumno} ${f.clase}`).includes(t))
      .sort((a, b) => cuenta(b) - cuenta(a) || String(b.ultimaFalta).localeCompare(String(a.ultimaFalta)));
  }, [datos, modo, minimo, q]);
  const nLlamar = (datos?.filas || []).filter(f => f.llamar).length;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <AvisosProfes onAbrirFicha={onAbrirFicha} onCambio={cargar} />
      <div className="panel">
        <h2><I.Calendar /> Faltas seguidas</h2>
        <p className="sub">
          Sale de la lista que pasan los profes: cuántas clases seguidas lleva cada alumno sin venir a su clase,
          hasta la última vez que vino. Una clase sin lista pasada no cuenta. A partir de {paraLlamar} faltas
          seguidas hay que llamar a la familia (te llega el aviso a la campanita). Cuando llames, pulsa
          «Ya he llamado»: el aviso se quita hasta que falte otras {paraLlamar} veces seguidas, y la llamada queda en su ficha.
          Si la familia avisa de que no vendrá unos días, pulsa «Avisó de que va a faltar» (o apúntalo en su ficha):
          hasta esa fecha no le llega el correo automático de faltas ni hay que llamar.
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
            const llamar = f.llamar;
            const llamado = f.racha >= paraLlamar && f.contactado;
            const avisado = !!f.avisoFalta;
            return (
              <div key={`${f.studentId}:${f.groupId}`} className="data-table-row"
                style={{ gridTemplateColumns: COLUMNAS, alignItems: 'center', background: llamar ? 'color-mix(in oklab, var(--danger, #dc2626) 6%, transparent)' : undefined, opacity: llamado || avisado ? 0.7 : undefined }}>
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
                  <b style={{ fontSize: 20, color: llamar ? 'var(--danger, #dc2626)' : llamado || avisado ? 'var(--ink-2)' : n >= 2 ? 'var(--orange)' : 'var(--ink)' }}>{n}</b>
                  {llamar && <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--danger, #dc2626)', textTransform: 'uppercase' }}>Llamar</span>}
                  {avisado && !llamado && <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--blue, #1e6fd9)', textTransform: 'uppercase' }}>Avisó</span>}
                  {llamado && <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase' }}>Llamado</span>}
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
                <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.contactos || (f.telefono ? `${f.alumno} · ${f.telefono}` : 'sin contacto')}
                  </span>
                  {avisado
                    ? <AvisoApuntado aviso={f.avisoFalta} onQuitado={cargar} compacto />
                    : <>
                        {f.racha >= paraLlamar && <Llamada f={f} onCambio={cargar} />}
                        <AvisarFalta f={f} onCambio={cargar} />
                      </>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Avisos de los profes (#638) ─────────────────────────────────────────────
// Lo que un profe cuenta desde Pasar lista para que secretaría hable con la
// familia. Se atiende con «Ya he hablado con la familia» (y una nota) o, si la
// familia confirma que va a faltar, apuntándolo como «Avisó de que va a faltar»,
// que es lo que frena el correo de faltas. Los atendidos se ven unos días más.
const MOTIVO_PROFE = {
  falta: ['Va a faltar', 'var(--blue, #1e6fd9)'], enfermo: ['Está enfermo', 'var(--orange)'],
  lesion: ['Se ha lesionado', 'var(--danger, #dc2626)'], otro: ['Otra cosa', 'var(--ink-2)'],
};
const fmtCuando = (f) => new Date(f).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
async function atenderAvisoProfe(id, nota) {
  const r = await fetch(`/api/admin/faltas/aviso-profe/${id}/atendido`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ nota }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido guardar.');
}

function AvisosProfes({ onAbrirFicha, onCambio }) {
  const [avisos, setAvisos] = useState(null);
  const [verAtendidos, setVerAtendidos] = useState(false);
  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/faltas/avisos-profes', { credentials: 'include', cache: 'no-store' });
      if (r.ok) setAvisos((await r.json()).avisos || []);
    } catch { /* noop */ }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEnVivo(cargar, { cada: 60000 });
  if (!avisos?.length) return null;
  const pendientes = avisos.filter(a => !a.atendido), atendidos = avisos.filter(a => a.atendido);
  const vistos = verAtendidos ? avisos : pendientes;
  return (
    <div className="panel" data-avisos-profes>
      <h2>📣 Avisos de los profes</h2>
      <p className="sub">
        Lo que los profes cuentan desde Pasar lista. Habla con la familia y pulsa «Ya he hablado con la familia».
        Si la familia confirma que va a faltar, apúntalo con «Avisó de que va a faltar»: así no le llega el correo de faltas.
      </p>
      {!pendientes.length && <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>No hay ninguno sin atender.</p>}
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {vistos.map(a => <AvisoProfe key={a.id} a={a} onAbrirFicha={onAbrirFicha} onCambio={async () => { await cargar(); await onCambio?.(); }} />)}
      </div>
      {atendidos.length > 0 && (
        <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setVerAtendidos(v => !v)}>
          {verAtendidos ? 'Ocultar los atendidos' : `Ver los atendidos estos días (${atendidos.length})`}
        </button>
      )}
    </div>
  );
}

function AvisoProfe({ a, onAbrirFicha, onCambio }) {
  const [modo, setModo] = useState(null); // null | 'hablado' | 'falta'
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [etq, color] = MOTIVO_PROFE[a.motivo] || MOTIVO_PROFE.otro;
  const dias = a.desde ? (a.desde === a.hasta || !a.hasta ? `el ${fmtFecha(a.desde)}` : `del ${fmtFecha(a.desde)} al ${fmtFecha(a.hasta)}`) : null;
  async function hablado() {
    setEnviando(true);
    try { await atenderAvisoProfe(a.id, nota.trim()); setModo(null); await onCambio(); }
    catch (e) { alert(e.message); }
    finally { setEnviando(false); }
  }
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  const desdeFalta = a.desde ? (a.desde < haceDosMeses() ? haceDosMeses() : a.desde) : hoy;
  return (
    <div data-aviso-profe={a.id} style={{ border: `1px solid ${a.atendido ? 'var(--line)' : `color-mix(in oklab, ${color} 40%, var(--line))`}`, borderLeft: `4px solid ${a.atendido ? 'var(--line)' : color}`, borderRadius: 12, padding: '10px 12px', display: 'grid', gap: 6, background: 'var(--bg-2)', opacity: a.atendido ? 0.75 : 1 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onAbrirFicha?.({ id: a.studentId })} title="Abrir su ficha"
          style={{ background: 'none', border: 0, padding: 0, fontFamily: 'inherit', fontWeight: 800, fontSize: 14, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left' }}>
          {a.alumno}
        </button>
        <span style={{ fontSize: 11, fontWeight: 800, color, background: `color-mix(in oklab, ${color} 12%, var(--bg-2))`, padding: '2px 8px', borderRadius: 6 }}>{etq}</span>
        {dias && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>{dias}</span>}
        {a.atendido && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)' }}>✓ Atendido</span>}
      </div>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        {a.profe || 'Un profe'}{a.clase ? ` · ${a.clase}` : ''} · {fmtCuando(a.at)}
      </span>
      {a.nota && <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--ink)', background: 'var(--bg-3)', borderRadius: 8, padding: '8px 10px' }}>{a.nota}</div>}
      {!a.atendido && (
        <>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{a.contactos || (a.telefono ? `${a.alumno} · ${a.telefono}` : 'sin contacto')}</span>
          {modo === null && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setModo('hablado')}><I.Phone width={14} height={14} /> Ya he hablado con la familia</button>
              {a.motivo !== 'otro' && <button type="button" className="btn btn-sm btn-ghost" data-aviso-abrir onClick={() => setModo('falta')}>Avisó de que va a faltar</button>}
            </div>
          )}
          {modo === 'hablado' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input autoFocus value={nota} maxLength={1000} placeholder="Nota (opcional): qué te han dicho…" onChange={e => setNota(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !enviando) hablado(); if (e.key === 'Escape') setModo(null); }}
                style={{ flex: '1 1 200px', minWidth: 0, padding: '6px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12 }} />
              <button type="button" className="btn btn-sm btn-primary" disabled={enviando} onClick={hablado}>{enviando ? 'Guardando…' : 'Guardar'}</button>
              <button type="button" className="btn btn-sm btn-ghost" disabled={enviando} onClick={() => setModo(null)}>Cancelar</button>
            </div>
          )}
          {modo === 'falta' && (
            <FormAvisoFalta studentId={a.studentId} desdeInicial={desdeFalta} hastaInicial={a.hasta && a.hasta >= hoy ? a.hasta : ''}
              notaInicial={a.nota ? `Lo avisó ${a.profe || 'el profe'}: ${a.nota}`.slice(0, 1000) : ''}
              onCancelar={() => setModo(null)}
              onHecho={async () => {
                try { await atenderAvisoProfe(a.id, 'apuntado como «Avisó de que va a faltar».'); } catch { /* ya atendido */ }
                setModo(null); await onCambio();
              }} />
          )}
        </>
      )}
    </div>
  );
}

// «Avisó de que va a faltar» (#525): abre el formulario con sus fechas. Aquí
// la familia suele avisar de las faltas que ya lleva, así que empieza el día en
// que empezó a faltar (como mucho, de hace dos meses), no hoy.
const haceDosMeses = () => new Date(Date.now() - 59 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
function AvisarFalta({ f, onCambio }) {
  const [abierto, setAbierto] = useState(false);
  const inicio = new Date(f.desde).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  if (abierto) return <FormAvisoFalta studentId={f.studentId} desdeInicial={inicio < haceDosMeses() ? haceDosMeses() : inicio} onHecho={async () => { setAbierto(false); await onCambio(); }} onCancelar={() => setAbierto(false)} />;
  return (
    <button type="button" className="btn btn-sm btn-ghost" data-aviso-abrir style={{ justifySelf: 'start', padding: '2px 8px', fontSize: 11 }} onClick={() => setAbierto(true)}>
      Avisó de que va a faltar
    </button>
  );
}

// «Ya he llamado» / «Llamado · quién · fecha · nota» y «Deshacer» (#402). Un
// clic apunta la llamada en todas las clases en las que ese alumno está para
// llamar (es la misma familia); el servidor vuelve a mirar las rachas.
function Llamada({ f, onCambio }) {
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function apuntar() {
    setEnviando(true);
    try {
      const r = await fetch('/api/admin/faltas/llamada', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ studentId: f.studentId, nota: nota.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) alert(d.error || 'No se ha podido apuntar la llamada.');
      else { setAbierto(false); setNota(''); }
      await onCambio();
    } catch { alert('No hay conexión con el servidor.'); }
    finally { setEnviando(false); }
  }
  async function deshacer() {
    if (!window.confirm(`¿Quitar la llamada apuntada a la familia de ${f.alumno} en ${f.clase}? Volverá a salir para llamar.`)) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/admin/faltas/llamada/${f.llamada.id}`, { method: 'DELETE', credentials: 'include' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) alert(d.error || 'No se ha podido deshacer.');
      await onCambio();
    } catch { alert('No hay conexión con el servidor.'); }
    finally { setEnviando(false); }
  }

  if (f.contactado && f.llamada) {
    const l = f.llamada;
    return (
      <span style={{ fontSize: 12, color: 'var(--ink-2)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ minWidth: 0 }}>
          <b style={{ color: 'var(--teal)' }}>Llamado</b>
          {l.quien ? ` · ${l.quien}` : ''} · {fmtFecha(l.at)}{l.nota ? ` · ${l.nota}` : ''}
          <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>
            {f.racha > l.racha ? `${f.racha - l.racha} falta${f.racha - l.racha !== 1 ? 's' : ''} más desde la llamada · ` : ''}
            vuelve a avisar si llega a {l.avisaDeNuevo}
          </span>
        </span>
        <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '2px 8px', fontSize: 11 }} disabled={enviando} onClick={deshacer}>Deshacer</button>
      </span>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {f.llamada && (
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          Se llamó el {fmtFecha(f.llamada.at)} con {f.llamada.racha} faltas y desde entonces ha faltado {f.racha - f.llamada.racha} veces más.
        </span>
      )}
      {!abierto ? (
        <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={() => setAbierto(true)}>
          <I.Phone width={14} height={14} /> Ya he llamado
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input autoFocus value={nota} maxLength={1000} placeholder="Nota (opcional): qué te han dicho…"
            onChange={e => setNota(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !enviando) apuntar(); if (e.key === 'Escape') setAbierto(false); }}
            style={{ flex: '1 1 160px', minWidth: 0, padding: '6px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12 }} />
          <button type="button" className="btn btn-sm btn-primary" disabled={enviando} onClick={apuntar}>{enviando ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={enviando} onClick={() => { setAbierto(false); setNota(''); }}>Cancelar</button>
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
