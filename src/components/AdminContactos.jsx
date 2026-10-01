import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Consultas web (ticket #295): lo que llega por el formulario de contacto de la
// web. Secretaría las contesta (por correo o llamando) y las marca como
// atendidas; las notas sirven para que otro compañero sepa qué se habló.
// ─────────────────────────────────────────────────────────────────────────────

const fmtFecha = (iso) => iso ? new Date(iso).toLocaleString('es-ES', {
  timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '';

async function guardar(id, body) {
  const r = await fetch(`/api/admin/contactos/${id}`, {
    method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
}

// Contactos sin ficha (#340): cuentas que no son del club (las creaba la
// sincronización de HubSpot de Aim-Tul, ya apagada). Se pasan a ficha o se
// descartan; solo se borra la que no tiene nada asociado.
function SinFicha({ aviso, onAbrirFicha }) {
  const [datos, setDatos] = useState(null);
  const [q, setQ] = useState('');
  const [buscar, setBuscar] = useState('');
  const [pagina, setPagina] = useState(0);
  const [marcados, setMarcados] = useState({});
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/admin/contactos/sin-ficha?q=${encodeURIComponent(buscar)}&pagina=${pagina}`, { credentials: 'include', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setDatos(d); setMarcados({}); } else aviso(d.error || 'No se han podido cargar.');
  }, [buscar, pagina]);
  useEffect(() => { cargar(); }, [cargar]);
  const ids = Object.keys(marcados).filter(k => marcados[k]);
  async function alta(c) {
    if (!window.confirm(`¿Pasar a ${c.nombre} a ficha del club? Saldrá en Alumnos (sin clases, como inactivo) para darle de alta.`)) return;
    const r = await fetch(`/api/admin/contactos/sin-ficha/${c.id}/alta`, { method: 'POST', credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return alert(d.error || 'No se ha podido.');
    aviso(`${c.nombre} ya es ficha del club.`); cargar();
  }
  async function descartar(lista) {
    if (!lista.length) return;
    if (!window.confirm(lista.length === 1 ? '¿Descartar (borrar) esta cuenta? Solo se borra si no tiene nada asociado.' : `¿Descartar (borrar) estas ${lista.length} cuentas? Las que tengan algo asociado no se tocan.`)) return;
    setOcupado(true);
    try {
      const r = await fetch('/api/admin/contactos/sin-ficha/descartar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: lista }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido.');
      const noSe = d.noSe || [];
      aviso(`${d.borrados} descartada${d.borrados !== 1 ? 's' : ''}.${noSe.length ? ` ${noSe.length} no se han borrado porque tienen datos (${noSe.slice(0, 3).map(x => x.nombre).join(', ')}${noSe.length > 3 ? '…' : ''}).` : ''}`);
      cargar();
    } catch (e) { alert(e.message); }
    finally { setOcupado(false); }
  }
  if (!datos) return <div className="card" style={{ padding: 24, color: 'var(--ink-3)' }}>Cargando…</div>;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', maxWidth: 820 }}>
        Cuentas que existen en la web pero <b>no son fichas del club</b>, así que no salen en Alumnos. Casi todas las creó la sincronización con HubSpot de Aim-Tul (ya apagada): hay familias de verdad, duplicados de alumnos que ya tienen ficha y publicidad.
        Si es alguien del club, <b>Pasar a ficha</b>; si es un duplicado o publicidad, <b>Descartar</b> (solo se borra si no tiene nada asociado).
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <form onSubmit={e => { e.preventDefault(); setPagina(0); setBuscar(q.trim()); }} style={{ flex: '1 1 240px', display: 'flex', gap: 6 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o correo" style={{ flex: 1, fontFamily: 'inherit', fontSize: 13, padding: '8px 12px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' }} />
        </form>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{datos.total} cuenta{datos.total !== 1 ? 's' : ''}</span>
        <button className="btn btn-sm btn-outline" onClick={() => setMarcados(Object.fromEntries(datos.contactos.map(c => [c.id, true])))}>Marcar las de la página</button>
        <button className="btn btn-sm btn-outline" onClick={() => setMarcados(Object.fromEntries(datos.contactos.filter(c => c.parecido).map(c => [c.id, true])))}>Marcar los duplicados</button>
        <button className="btn btn-sm btn-primary" disabled={!ids.length || ocupado} onClick={() => descartar(ids)}>{ocupado ? 'Descartando…' : `Descartar marcadas${ids.length ? ` (${ids.length})` : ''}`}</button>
      </div>
      {datos.contactos.length === 0 ? <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>No hay cuentas sin ficha{buscar ? ' con esa búsqueda' : ''}.</div> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {datos.contactos.map(c => (
            <div key={c.id} className="payment-row" style={{ gridTemplateColumns: 'auto minmax(0,1.4fr) minmax(0,1fr) auto', padding: '10px 14px' }}>
              <input type="checkbox" checked={!!marcados[c.id]} onChange={e => setMarcados(m => ({ ...m, [c.id]: e.target.checked }))} aria-label={`Marcar ${c.nombre}`} />
              <div style={{ minWidth: 0 }}>
                <div className="name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre || '(sin nombre)'}</div>
                <div className="date" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email || 'sin correo'}{c.telefono ? ` · ${c.telefono}` : ''}</div>
              </div>
              <div style={{ minWidth: 0, fontSize: 12 }}>
                <span className="date">{c.origen}{c.fecha ? ` · ${fmtFecha(c.fecha).split(',')[0]}` : ''}{c.consultas ? ` · ${c.consultas} consulta${c.consultas !== 1 ? 's' : ''} web` : ''}</span>
                {c.parecido && (
                  <div>
                    <button type="button" onClick={() => onAbrirFicha?.({ id: c.parecido.id })} className="status-pill pending" style={{ border: 0, cursor: 'pointer', fontFamily: 'inherit', marginTop: 3 }}>
                      Parece duplicado de la ficha de {c.parecido.nombre}
                    </button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-outline" onClick={() => alta(c)}>Pasar a ficha</button>
                <button className="btn btn-sm btn-outline" onClick={() => descartar([c.id])}>Descartar</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {pagina > 0 && <button className="btn btn-sm btn-outline" onClick={() => setPagina(p => p - 1)}>← Anteriores</button>}
        {(pagina + 1) * datos.porPagina < datos.total && <button className="btn btn-sm btn-outline" onClick={() => setPagina(p => p + 1)}>Siguientes →</button>}
      </div>
    </div>
  );
}

export default function AdminContactos({ showToast, onAbrirFicha }) {
  const [filtro, setFiltro] = useState('nuevo');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setError('');
    if (filtro === 'sin_ficha') return;
    try {
      const r = await fetch(`/api/admin/contactos${filtro ? `?estado=${filtro}` : ''}`, { credentials: 'include' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar las consultas.');
      setDatos(d);
    } catch (e) { setError(e.message); }
  }, [filtro]);
  useEffect(() => { cargar(); }, [cargar]);

  const aviso = (m) => (showToast ? showToast(m) : null);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['nuevo', 'Pendientes'], ['atendido', 'Atendidas'], ['', 'Todas'], ['sin_ficha', 'Contactos sin ficha']].map(([id, txt]) => (
          <button key={id || 'todas'} className={`btn btn-sm ${filtro === id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFiltro(id)}>
            {txt}{id === 'nuevo' && datos?.nuevos ? ` (${datos.nuevos})` : ''}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>
          Llegan del formulario de <a href="/contacto" target="_blank" rel="noopener">aimeducation.es/contacto</a>; también se avisa por correo a secretaría.
        </span>
      </div>

      {filtro === 'sin_ficha' && <SinFicha aviso={aviso} onAbrirFicha={onAbrirFicha} />}
      {filtro !== 'sin_ficha' && <>
      {error && <div className="card" style={{ padding: 16, color: 'var(--orange)', fontWeight: 700 }}>{error}</div>}
      {!datos && !error && <div className="card" style={{ padding: 24, color: 'var(--ink-3)' }}>Cargando…</div>}
      {datos && datos.contactos.length === 0 && (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>
          {filtro === 'nuevo' ? 'No hay consultas pendientes. 🎉' : 'No hay consultas.'}
        </div>
      )}
      {datos?.contactos.map(c => <Consulta key={c.id} c={c} onCambio={cargar} aviso={aviso} />)}
      </>}
    </div>
  );
}

function Consulta({ c, onCambio, aviso }) {
  const [notas, setNotas] = useState(c.notas);
  const [ocupado, setOcupado] = useState(false);
  const atendida = c.estado === 'atendido';

  async function hacer(body, ok) {
    setOcupado(true);
    try { await guardar(c.id, body); aviso(ok); onCambio(); }
    catch (e) { aviso(e.message); }
    finally { setOcupado(false); }
  }

  const asunto = encodeURIComponent('Tu consulta a AIM Education');
  return (
    <div className="card" style={{ padding: 18, display: 'grid', gap: 12, borderLeft: `4px solid ${atendida ? 'var(--line)' : 'var(--purple)'}` }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <b style={{ fontSize: 16 }}>{c.nombre}</b>
        <a href={`mailto:${c.email}?subject=${asunto}`} style={{ fontSize: 13 }}>{c.email}</a>
        {c.telefono && <a href={`tel:${c.telefono.replace(/\s/g, '')}`} style={{ fontSize: 13 }}>{c.telefono}</a>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>{fmtFecha(c.fecha)}</span>
      </div>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 14 }}>{c.mensaje}</p>
      <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} maxLength={2000}
        placeholder="Notas internas (p. ej.: «Llamada el martes, viene a probar el jueves»)"
        style={{ fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <a className="btn btn-sm btn-ghost" href={`mailto:${c.email}?subject=${asunto}`}><I.Mail width={14} height={14} /> Responder</a>
        {notas !== c.notas && (
          <button className="btn btn-sm btn-ghost" disabled={ocupado} onClick={() => hacer({ notas }, 'Notas guardadas.')}>Guardar notas</button>
        )}
        {atendida ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Atendida{c.atendidoPor ? ` por ${c.atendidoPor}` : ''} · {fmtFecha(c.atendidoAt)}
            </span>
            <button className="btn btn-sm btn-ghost" disabled={ocupado} onClick={() => hacer({ estado: 'nuevo', notas }, 'Vuelve a pendientes.')}>Reabrir</button>
          </>
        ) : (
          <button className="btn btn-sm btn-primary" disabled={ocupado} onClick={() => hacer({ estado: 'atendido', notas }, 'Consulta atendida.')}>
            <I.Check width={14} height={14} /> Marcar como atendida
          </button>
        )}
      </div>
    </div>
  );
}
