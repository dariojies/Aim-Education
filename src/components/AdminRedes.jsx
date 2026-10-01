import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from './Icons.jsx';
import { ESTILO_BANDEJA } from './AdminBandeja.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Redes sociales (ticket #341): los mensajes privados de Messenger, Instagram y
// WhatsApp, para contestarlos desde aquí, repartirlos entre el equipo y fichar
// a quien escribe (unirlo a su ficha o guardarlo como consulta web). Mientras no
// estén conectadas, se explica qué falta (los pasos, en el ticket #341).
// ─────────────────────────────────────────────────────────────────────────────

const CANALES = { messenger: ['Messenger', '#0866FF'], instagram: ['Instagram', '#D62976'], whatsapp: ['WhatsApp', '#1FA855'] };
const VISTAS = [['abiertas', 'Abiertas'], ['sin_asignar', 'Sin asignar'], ['mias', 'Mías'], ['hechas', 'Hechas']];
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%' };
const pastilla = (on) => ({ padding: '6px 12px', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', border: 0, borderRadius: 999, background: on ? 'var(--purple)' : 'transparent', color: on ? '#fff' : 'var(--ink-2)' });
const hora = (iso) => {
  const d = new Date(iso), hoy = new Date();
  return d.toDateString() === hoy.toDateString() ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};
const fechaLarga = (iso) => new Date(iso).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

async function api(url, { method = 'GET', body } = {}) {
  const r = await fetch(`/api/admin/redes${url}`, { method, credentials: 'include', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido.');
  return d;
}

function Canal({ c, chico }) {
  const [n, col] = CANALES[c] || [c, 'var(--ink-3)'];
  return <span style={{ fontSize: chico ? 10 : 11, fontWeight: 800, color: col, textTransform: 'uppercase', letterSpacing: '.05em' }}>{n}</span>;
}

// Unirla a una ficha del club (buscando) o guardarla como consulta web.
function Fichar({ conv, onHecho, onCerrar }) {
  const [q, setQ] = useState(conv.telefono || conv.nombre || '');
  const [res, setRes] = useState([]);
  const [contacto, setContacto] = useState(false);
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState(conv.nombre || '');
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return undefined; }
    const t = setTimeout(() => api(`/buscar-ficha?q=${encodeURIComponent(q.trim())}`).then(d => setRes(d.fichas)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const accion = async (body, aviso) => { try { await api(`/conversaciones/${conv.id}/accion`, { method: 'POST', body }); onHecho(aviso); } catch (e) { alert(e.message); } };
  return (
    <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, background: 'var(--bg-3)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b style={{ fontSize: 13 }}>Fichar a {conv.nombre}</b><div style={{ flex: 1 }} /><button type="button" className="btn btn-sm btn-outline" onClick={onCerrar}>Cerrar</button></div>
      {!contacto ? (
        <>
          <input style={campo} value={q} onChange={e => setQ(e.target.value)} placeholder="Busca su ficha: nombre, correo o teléfono" autoFocus />
          {res.map(f => (
            <button key={f.id} type="button" className="payment-row" onClick={() => accion({ accion: 'fichar', personaId: f.id }, `Unida a la ficha de ${f.nombre}.`)}
              style={{ gridTemplateColumns: 'minmax(0,1fr) auto', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--ink)' }}>
              <span><b>{f.nombre}</b><span style={{ fontSize: 12, color: 'var(--ink-3)' }}> · {[f.email, f.telefono].filter(Boolean).join(' · ')}</span></span>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--purple)' }}>Es esta →</span>
            </button>
          ))}
          {q.trim().length >= 2 && !res.length && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>No hay ninguna ficha así.</span>}
          <button type="button" className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={() => setContacto(true)}>No tiene ficha: guardarlo como consulta</button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Queda en CRM → Consultas web, con su primer mensaje, para atenderla y darle de alta desde allí.</span>
          <input style={campo} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre" />
          <input style={campo} value={email} onChange={e => setEmail(e.target.value)} placeholder="Su correo (pídeselo en la conversación)" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setContacto(false)}>← Buscar ficha</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => accion({ accion: 'contacto', nombre, email }, 'Guardado en Consultas web.')}>Guardar consulta</button>
          </div>
        </>
      )}
    </div>
  );
}

function Hilo({ id, companeros, onCambio, onAbrirFicha, showToast, onVolver }) {
  const [d, setD] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fichando, setFichando] = useState(false);
  const fin = useRef(null);
  const cargar = useCallback(() => api(`/conversaciones/${id}`).then(setD).catch(e => alert(e.message)), [id]);
  useEffect(() => { setD(null); setFichando(false); cargar(); }, [cargar]);
  useEffect(() => { const t = setInterval(cargar, 20_000); return () => clearInterval(t); }, [cargar]);
  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }); }, [d?.mensajes?.length]);
  if (!d) return <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Abriendo…</p>;
  const c = d.conversacion;
  const accion = async (body, aviso) => {
    try { await api(`/conversaciones/${id}/accion`, { method: 'POST', body }); if (aviso) showToast?.(aviso); cargar(); onCambio(); } catch (e) { alert(e.message); }
  };
  async function responder() {
    if (!texto.trim()) return;
    setEnviando(true);
    try { await api(`/conversaciones/${id}/responder`, { method: 'POST', body: { texto } }); setTexto(''); cargar(); onCambio(); }
    catch (e) { alert(e.message); } finally { setEnviando(false); }
  }
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto', gap: 10, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <button type="button" className="bandeja-volver" onClick={onVolver}>← Volver a la lista</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{c.nombre}</h2>
          <Canal c={c.canal} />
          {c.usuario && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>@{c.usuario}</span>}
          {c.telefono && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.telefono}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {c.persona
            ? <button type="button" className="btn btn-sm btn-outline" onClick={() => onAbrirFicha?.({ id: c.persona.id })}><I.User width={14} height={14} /> Ficha de {c.persona.nombre} →</button>
            : c.contactoId ? <span className="status-pill upcoming">Guardado en Consultas web</span>
              : <button type="button" className="btn btn-sm btn-primary" onClick={() => setFichando(v => !v)}><I.User width={14} height={14} /> Fichar</button>}
          {c.persona && <button type="button" className="btn btn-sm btn-outline" onClick={() => { if (window.confirm('¿Quitar la ficha de esta conversación?')) accion({ accion: 'desfichar' }, 'Ya no está unida a la ficha.'); }}>Quitar ficha</button>}
          <select value={c.asignado?.id || ''} onChange={e => accion({ accion: 'asignar', a: e.target.value || null }, e.target.value ? `Asignada a ${companeros.find(x => String(x.id) === e.target.value)?.nombre}.` : 'Sin asignar.')}
            style={{ ...campo, width: 'auto', padding: '6px 8px', fontWeight: 700, fontSize: 13 }} aria-label="Asignar a">
            <option value="">Asignar a…</option>
            {companeros.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
          {c.estado === 'hecha'
            ? <button type="button" className="btn btn-sm btn-outline" onClick={() => accion({ accion: 'reabrir' }, 'Reabierta.')}>Reabrir</button>
            : <button type="button" className="btn btn-sm btn-outline" onClick={() => accion({ accion: 'hecha' }, 'Marcada como hecha.')}>✓ Hecha</button>}
        </div>
        {fichando && <Fichar conv={c} onCerrar={() => setFichando(false)} onHecho={(aviso) => { setFichando(false); showToast?.(aviso); cargar(); onCambio(); }} />}
      </div>

      <div style={{ overflowY: 'auto', display: 'grid', gap: 6, alignContent: 'start', padding: '8px 4px', background: 'var(--bg-3)', borderRadius: 12, minHeight: 200 }}>
        {d.mensajes.map(m => (
          <div key={m.id} style={{ justifySelf: m.entrante ? 'start' : 'end', maxWidth: '78%', display: 'grid', gap: 2 }}>
            <div style={{ padding: '8px 12px', borderRadius: 14, borderBottomLeftRadius: m.entrante ? 4 : 14, borderBottomRightRadius: m.entrante ? 14 : 4,
              background: m.entrante ? 'var(--bg-2)' : 'var(--purple)', color: m.entrante ? 'var(--ink)' : '#fff', fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: m.entrante ? '1px solid var(--line)' : 0 }}>
              {m.texto}
              {(m.adjuntos || []).map((a, i) => (
                <div key={i} style={{ marginTop: m.texto ? 6 : 0 }}>
                  {a.mediaId && a.tipo === 'image' ? <a href={`/api/admin/redes/media/${a.mediaId}`} target="_blank" rel="noopener noreferrer"><img src={`/api/admin/redes/media/${a.mediaId}`} alt="Foto" style={{ maxWidth: 220, borderRadius: 8, display: 'block' }} /></a>
                    : a.mediaId ? <a href={`/api/admin/redes/media/${a.mediaId}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>📎 {a.nombre || a.tipo}</a>
                      : a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>📎 {a.tipo}</a>
                        : <span>📎 {a.tipo}</span>}
                </div>
              ))}
            </div>
            <span style={{ fontSize: 10, color: 'var(--ink-3)', justifySelf: m.entrante ? 'start' : 'end' }}>
              {fechaLarga(m.fecha)}{!m.entrante && m.autor ? ` · ${m.autor.split(' ')[0]}` : ''}{!m.entrante && m.estado && m.estado !== 'ok' ? ` · ${{ sent: 'enviado', delivered: 'entregado', read: 'leído', failed: '✗ no llegó' }[m.estado] || m.estado}` : ''}
              {m.error ? ` · ${m.error}` : ''}
            </span>
          </div>
        ))}
        <div ref={fin} />
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {!c.puedeContestar && (
          <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>
            Han pasado más de 24 horas desde su último mensaje: {CANALES[c.canal]?.[0]} no deja escribir primero. Llámale o escríbele por correo; cuando vuelva a escribir, podrás contestar aquí.
          </span>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea style={{ ...campo, minHeight: 46, maxHeight: 160, resize: 'vertical' }} value={texto} disabled={!c.puedeContestar} placeholder={c.puedeContestar ? 'Escribe la respuesta… (Ctrl+Intro para enviar)' : 'No se puede contestar ahora'}
            onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) responder(); }} />
          <button type="button" className="btn btn-sm btn-primary" disabled={!c.puedeContestar || enviando || !texto.trim()} onClick={responder}>{enviando ? 'Enviando…' : 'Enviar'}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminRedes({ showToast, onAbrirFicha }) {
  const [estado, setEstado] = useState(null);
  const [vista, setVista] = useState('abiertas');
  const [canal, setCanal] = useState('');
  const [q, setQ] = useState('');
  const [lista, setLista] = useState(null);
  const [sel, setSel] = useState(null);
  const cargar = useCallback(() => {
    const p = new URLSearchParams({ vista }); if (canal) p.set('canal', canal); if (q.trim()) p.set('q', q.trim());
    return api(`/conversaciones?${p}`).then(d => setLista(d.conversaciones)).catch(e => { alert(e.message); setLista([]); });
  }, [vista, canal, q]);
  useEffect(() => { api('/estado').then(setEstado).catch(() => setEstado({ canales: {}, cuentas: [], companeros: [] })); }, []);
  useEffect(() => { setLista(null); const t = setTimeout(cargar, q ? 250 : 0); return () => clearTimeout(t); }, [cargar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(cargar, 30_000); return () => clearInterval(t); }, [cargar]);

  if (!estado) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  const conectados = Object.entries(estado.canales).filter(([, v]) => v).map(([k]) => CANALES[k][0]);
  const hayAlgo = estado.cuentas.length > 0;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {(!conectados.length || !estado.webhook) && (
        <div className="panel" style={{ display: 'grid', gap: 6, margin: 0 }}>
          <b>{conectados.length ? `Conectado: ${conectados.join(', ')}` : 'Todavía no hay ninguna red conectada'}</b>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            Para que lleguen aquí los mensajes de Messenger, Instagram y WhatsApp hay que conectar la cuenta de Meta del club y poner sus claves en Heroku.
            Los pasos, uno a uno, están en el ticket #341. {!estado.webhook && 'Falta además el aviso de Meta (META_VERIFY_TOKEN y META_APP_SECRET).'}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--bg-2)', padding: 3, gap: 2, flexWrap: 'wrap' }}>
          {VISTAS.map(([k, n]) => <button key={k} type="button" style={pastilla(vista === k)} onClick={() => { setVista(k); setSel(null); }}>{n}</button>)}
        </div>
        <div style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--bg-2)', padding: 3, gap: 2, flexWrap: 'wrap' }}>
          <button type="button" style={pastilla(!canal)} onClick={() => setCanal('')}>Todas</button>
          {Object.entries(CANALES).map(([k, [n]]) => <button key={k} type="button" style={pastilla(canal === k)} onClick={() => setCanal(k)}>{n}</button>)}
        </div>
        <input style={{ ...campo, borderRadius: 999, flex: '1 1 200px', width: 'auto' }} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, usuario o teléfono" />
        <button type="button" className="btn btn-sm btn-outline" onClick={cargar} title="Actualizar">↻</button>
      </div>
      <div className={`bandeja${sel ? ' con-detalle' : ''}`}>
        <section className="bandeja-lista">
          {lista === null ? <p style={{ color: 'var(--ink-3)', fontSize: 13, padding: 12 }}>Cargando…</p>
            : !lista.length ? <p style={{ color: 'var(--ink-3)', fontSize: 13, padding: 12 }}>{hayAlgo ? 'Nada por aquí.' : 'Cuando alguien escriba por redes, saldrá aquí.'}</p>
              : lista.map(c => (
                <button key={c.id} type="button" onClick={() => setSel(c.id)} className={`bandeja-fila${sel === c.id ? ' on' : ''}`}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: c.noLeidos ? 900 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.noLeidos > 0 && <span aria-label="Sin leer" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: 'var(--purple)', marginRight: 6, verticalAlign: 'middle' }} />}
                      {c.nombre}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>{c.ultimoAt ? hora(c.ultimoAt) : ''}</span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: c.noLeidos ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink-2)' }}>{c.ultimoTexto}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Canal c={c.canal} chico />
                    {c.noLeidos > 1 && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--purple)' }}>{c.noLeidos} sin leer</span>}
                    {c.persona && <span style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700 }}>✓ {c.persona.nombre.split(' ')[0]}</span>}
                    {c.asignado && <span style={{ fontSize: 11, color: 'var(--purple)', fontWeight: 700 }}>→ {c.asignado.nombre.split(' ')[0]}</span>}
                  </span>
                </button>
              ))}
        </section>
        <section className="bandeja-detalle">
          {!sel ? <p style={{ color: 'var(--ink-3)', fontSize: 13, margin: 'auto' }}>Elige una conversación.</p>
            : <Hilo id={sel} companeros={estado.companeros} onCambio={cargar} onAbrirFicha={onAbrirFicha} showToast={showToast} onVolver={() => setSel(null)} />}
        </section>
      </div>
      <style>{ESTILO_BANDEJA}</style>
    </div>
  );
}
