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

export default function AdminContactos({ showToast }) {
  const [filtro, setFiltro] = useState('nuevo');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setError('');
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
        {[['nuevo', 'Pendientes'], ['atendido', 'Atendidas'], ['', 'Todas']].map(([id, txt]) => (
          <button key={id || 'todas'} className={`btn btn-sm ${filtro === id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFiltro(id)}>
            {txt}{id === 'nuevo' && datos?.nuevos ? ` (${datos.nuevos})` : ''}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>
          Llegan del formulario de <a href="/contacto" target="_blank" rel="noopener">aimeducation.es/contacto</a>; también se avisa por correo a secretaría.
        </span>
      </div>

      {error && <div className="card" style={{ padding: 16, color: 'var(--orange)', fontWeight: 700 }}>{error}</div>}
      {!datos && !error && <div className="card" style={{ padding: 24, color: 'var(--ink-3)' }}>Cargando…</div>}
      {datos && datos.contactos.length === 0 && (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}>
          {filtro === 'nuevo' ? 'No hay consultas pendientes. 🎉' : 'No hay consultas.'}
        </div>
      )}
      {datos?.contactos.map(c => <Consulta key={c.id} c={c} onCambio={cargar} aviso={aviso} />)}
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
