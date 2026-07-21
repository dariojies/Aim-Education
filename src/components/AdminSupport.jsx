import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from './Icons.jsx';

const APPS = ['Aim Education', 'Learning Dungeon', 'Aim Training', 'Aim Brickslab', 'Aim Artemis', 'Aim Eventos'];

const PRIORITY_COLOR = { high: 'var(--orange)', medium: '#FFD526', low: 'var(--teal)' };
const PRIORITY_LABEL = { high: 'Alta', medium: 'Media', low: 'Baja' };
const STATUS_COLOR = { open: '#ccac00', resolved: 'var(--teal)', closed: 'var(--ink-3)' };
const STATUS_LABEL = { open: 'Abierto', resolved: 'Resuelto', closed: 'Cerrado' };

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('es-ES');
}

function fmtDue(str) {
  if (!str) return null;
  const d = new Date(str);
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}

// Fecha y hora de creación: en un ticket la hora importa para saber el orden real.
function fmtDateTime(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d)) return '—';
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Cuánto hace que se creó, para ver de un vistazo los tickets que llevan tiempo parados.
function hace(str) {
  if (!str) return null;
  const dias = Math.floor((Date.now() - new Date(str).getTime()) / 86400000);
  if (isNaN(dias) || dias < 0) return null;
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'hace 1 mes' : `hace ${meses} meses`;
}

// Cuánto se tardó en resolver, de creación a resolución.
function tardanza(t) {
  if (!t?.created_at || !t?.resolved_at) return null;
  const ms = new Date(t.resolved_at) - new Date(t.created_at);
  if (isNaN(ms) || ms < 0) return null;
  const horas = Math.round(ms / 3600000);
  if (horas < 1) return 'menos de 1 hora';
  if (horas < 48) return horas === 1 ? '1 hora' : `${horas} horas`;
  const dias = Math.round(horas / 24);
  return `${dias} días`;
}

// Texto de un ticket. Lo usan tanto "copiar este ticket" como el listado completo,
// para que los dos formatos no se separen con el tiempo.
function ticketATexto(t) {
  const apps = Array.isArray(t.app_label) ? t.app_label.join(', ') : (t.app_label || 'Aim Education');
  let s = `[#${t.id}] ${(t.subject || '').toUpperCase()}\n`;
  s += `Prioridad: ${(PRIORITY_LABEL[t.priority?.toLowerCase()] || t.priority || '').toUpperCase()} | Estado: ${(STATUS_LABEL[t.status] || t.status || '').toUpperCase()}\n`;
  s += `Apps: ${apps}\n`;
  s += `Creado: ${fmtDateTime(t.created_at)}${hace(t.created_at) ? ` (${hace(t.created_at)})` : ''}\n`;
  s += `Creado por: ${t.name} ${t.surname || ''} (${t.email})\n`;
  s += `Asignado: ${t.assignee_name ? `${t.assignee_name} ${t.assignee_surname || ''}` : 'Sin asignar'}\n`;
  s += `Vence: ${t.due_date ? fmtDate(t.due_date) : 'N/A'}\n`;
  s += `Descripción: ${t.description}\n`;
  if (t.dev_response) s += `Respuesta: ${t.dev_response}\n`;
  return s;
}

// Copia al portapapeles. document.execCommand es el plan B para cuando el navegador
// no da permiso a la API moderna (pasa fuera de https).
async function copiarAlPortapapeles(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
}

function parseInputDate(str) {
  if (!str) return null;
  const parts = str.split('-');
  if (parts.length === 3 && str.includes('-')) {
    if (parts[0].length === 4) return str;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return null;
}

// Lee un archivo de imagen a base64 para mandarlo en el JSON, igual que las facturas.
function leerImagen(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve({ data: fr.result, nombre: file.name, mime: file.type });
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function fmtHora(str) {
  const d = new Date(str);
  if (isNaN(d)) return '';
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  return mismoDia
    ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Conversación de un ticket. Dos canales separados: 'equipo' (entre desarrolladores)
// y 'creador' (con quien abrió el ticket). Refresca cada 5 s pidiendo solo lo nuevo.
function TicketChat({ ticketId, canal, alto = 260 }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [imagen, setImagen] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const ultimoId = useRef(0);
  const finRef = useRef(null);
  const cajaRef = useRef(null);

  // El sondeo periódico y el envío pueden pedir lo nuevo a la vez y traerse el mismo
  // mensaje; se añaden por id para que no salga duplicado en pantalla.
  const añadir = useCallback(nuevos => {
    if (!nuevos.length) return;
    ultimoId.current = Math.max(ultimoId.current, ...nuevos.map(m => m.id));
    setMensajes(prev => {
      const vistos = new Set(prev.map(m => m.id));
      const limpios = nuevos.filter(m => !vistos.has(m.id));
      return limpios.length ? [...prev, ...limpios] : prev;
    });
  }, []);

  // Al cambiar de canal se empieza de cero: son conversaciones distintas.
  useEffect(() => { setMensajes([]); ultimoId.current = 0; }, [canal, ticketId]);

  useEffect(() => {
    let vivo = true;
    async function traer() {
      try {
        const r = await fetch(`/api/support/${ticketId}/mensajes?canal=${canal}&desde=${ultimoId.current}`, { credentials: 'include' });
        if (!r.ok || !vivo) return;
        const d = await r.json();
        if (vivo) añadir(d.mensajes || []);
      } catch { /* si falla una consulta, la siguiente lo arregla */ }
    }
    traer();
    const t = setInterval(traer, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, [ticketId, canal, añadir]);

  // Bajar al último mensaje, pero solo si ya estabas abajo: si estás leyendo
  // hacia arriba, un mensaje nuevo no debe arrastrarte.
  useEffect(() => {
    const caja = cajaRef.current;
    if (!caja) return;
    const abajo = caja.scrollHeight - caja.scrollTop - caja.clientHeight < 120;
    if (abajo) finRef.current?.scrollIntoView({ block: 'nearest' });
  }, [mensajes]);

  async function enviar(e) {
    e?.preventDefault();
    if (!texto.trim() && !imagen) return;
    setEnviando(true);
    setError('');
    try {
      const r = await fetch(`/api/support/${ticketId}/mensajes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          canal, cuerpo: texto,
          archivo: imagen?.data || null, archivoNombre: imagen?.nombre || null, archivoMime: imagen?.mime || null,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setTexto(''); setImagen(null);
        // Traer ya lo recién escrito sin esperar a la siguiente vuelta.
        const rr = await fetch(`/api/support/${ticketId}/mensajes?canal=${canal}&desde=${ultimoId.current}`, { credentials: 'include' });
        if (rr.ok) añadir((await rr.json()).mensajes || []);
      } else setError(d.error || 'No se pudo enviar.');
    } catch { setError('Error de conexión.'); }
    finally { setEnviando(false); }
  }

  async function elegirImagen(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Solo se pueden adjuntar imágenes.'); return; }
    if (f.size > 3 * 1024 * 1024) { setError('La imagen no puede pasar de 3 MB.'); return; }
    setError('');
    setImagen(await leerImagen(f));
  }

  return (
    <div>
      <div ref={cajaRef} style={{ height: alto, overflowY: 'auto', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
        {!mensajes.length && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Todavía no hay mensajes en esta conversación.</p>}
        {mensajes.map(m => (
          <div key={m.id} style={{ justifySelf: m.mio ? 'end' : 'start', maxWidth: '85%' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 2, textAlign: m.mio ? 'right' : 'left' }}>
              {m.mio ? 'Tú' : m.autor} · {fmtHora(m.createdAt)}
            </div>
            <div style={{ background: m.mio ? 'var(--purple)' : 'var(--bg-2)', color: m.mio ? 'white' : 'var(--ink)', border: m.mio ? 'none' : '1px solid var(--line)', borderRadius: 12, padding: '8px 12px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {m.cuerpo}
              {m.tieneArchivo && (
                <a href={`/api/support/mensajes/${m.id}/archivo`} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: m.cuerpo ? 8 : 0 }}>
                  <img src={`/api/support/mensajes/${m.id}/archivo`} alt={m.archivoNombre || 'captura'}
                    style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, display: 'block' }} />
                </a>
              )}
            </div>
          </div>
        ))}
        <div ref={finRef} />
      </div>

      <form onSubmit={enviar} style={{ marginTop: 10 }}>
        {imagen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12, color: 'var(--ink-2)' }}>
            <img src={imagen.data} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imagen.nombre}</span>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setImagen(null)}>Quitar</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviar(e); }}
            placeholder="Escribe un mensaje... (Ctrl+Enter para enviar)"
            style={{ flex: 1, minWidth: 0, resize: 'vertical', fontFamily: 'inherit', fontSize: 14, padding: 10, background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)' }} />
          <label className="btn btn-sm btn-outline" style={{ cursor: 'pointer', flexShrink: 0 }} title="Adjuntar captura">
            <I.Share /><input type="file" accept="image/*" onChange={elegirImagen} style={{ display: 'none' }} />
          </label>
          <button type="submit" className="btn btn-sm btn-primary" disabled={enviando || (!texto.trim() && !imagen)} style={{ flexShrink: 0 }}>
            {enviando ? '...' : 'Enviar'}
          </button>
        </div>
        {error && <p style={{ color: 'var(--orange)', fontSize: 12, fontWeight: 600, margin: '6px 0 0' }}>{error}</p>}
      </form>
    </div>
  );
}

export function AdminSupport({ user, ticketId = null }) {
  const [tickets, setTickets] = useState([]);
  const [superadmins, setSuperadmins] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filterPriority, setFilterPriority] = useState('all');
  const [filterApp, setFilterApp] = useState('all');
  const [filterStatus, setFilterStatus] = useState('open');
  const [filterOnlyMe, setFilterOnlyMe] = useState(false);
  const [sortDir, setSortDir] = useState('desc');
  const [sortByPriority, setSortByPriority] = useState(false);

  const [activeTab, setActiveTab] = useState('list');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  const [selected, setSelected] = useState(null);
  const [devResponse, setDevResponse] = useState('');
  const [ticketPriority, setTicketPriority] = useState('low');
  const [ticketDueDate, setTicketDueDate] = useState('');
  const [ticketAssignedId, setTicketAssignedId] = useState('');
  const [ticketAppLabels, setTicketAppLabels] = useState(['Aim Education']);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');
  const [aviso, setAviso] = useState('');
  const [busqueda, setBusqueda] = useState('');
  // null = pantalla de gestión; 'equipo' | 'creador' = ese chat a pantalla completa.
  const [chatCanal, setChatCanal] = useState(null);

  const fetchTickets = useCallback(() => {
    setLoading(true);
    fetch('/api/support', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { tickets: [] })
      .then(d => { setTickets(d.tickets || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTickets();
    fetch('/api/admin/superadmins', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { superadmins: [] })
      .then(d => setSuperadmins(d.superadmins || []))
      .catch(() => {});
  }, [fetchTickets]);

  // Si se ha entrado por /admin/soporte/180, abrir ese ticket en cuanto cargue.
  const abiertoPorEnlace = useRef(false);
  useEffect(() => {
    if (!ticketId || abiertoPorEnlace.current || !tickets.length) return;
    const t = tickets.find(x => x.id === ticketId);
    if (t) { abiertoPorEnlace.current = true; openTicket(t); }
  }, [ticketId, tickets]);

  async function copiarEnlace(t) {
    const url = `${window.location.origin}/admin/soporte/${t.id}`;
    avisar(await copiarAlPortapapeles(url) ? 'Enlace copiado.' : 'No se pudo copiar.');
  }

  function openTicket(t) {
    setSelected(t);
    setDevResponse(t.dev_response || '');
    setTicketPriority(t.priority || 'low');
    setTicketDueDate(fmtDue(t.due_date) || '');
    setTicketAssignedId(t.assigned_to || '');
    setTicketAppLabels(Array.isArray(t.app_label) ? t.app_label : ['Aim Education']);
    setUpdateMsg('');
    setChatCanal(null);
  }

  async function updateTicket(newStatus) {
    if (!selected) return;
    setUpdating(true);
    setUpdateMsg('');
    const body = {
      status: newStatus || selected.status,
      devResponse,
      priority: ticketPriority,
      dueDate: parseInputDate(ticketDueDate),
      assignedTo: ticketAssignedId || null,
      appLabel: ticketAppLabels,
    };
    try {
      const r = await fetch(`/api/support/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.success) { setSelected(null); fetchTickets(); }
      else setUpdateMsg(d.error || 'Error al actualizar.');
    } catch { setUpdateMsg('Error de conexión.'); }
    finally { setUpdating(false); }
  }

  async function submitTicket(e) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitMsg('');
    try {
      const r = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject, description }),
      });
      const d = await r.json();
      if (d.success) {
        setSubmitMsg('Ticket #' + d.ticketId + ' creado correctamente.');
        setSubject(''); setDescription('');
        fetchTickets();
        setTimeout(() => setActiveTab('list'), 1500);
      } else { setSubmitMsg(d.error || 'Error al crear el ticket.'); }
    } catch { setSubmitMsg('Error de conexión.'); }
    finally { setSubmitting(false); }
  }

  function exportPDF() {
    const filtered = getFiltered();
    const html = `<html><head><style>
      body{font-family:sans-serif;padding:20px;color:#333}
      h1{color:#5233A8;border-bottom:2px solid #5233A8;padding-bottom:8px}
      .ticket{border:1px solid #ddd;border-radius:8px;padding:15px;margin-bottom:18px;page-break-inside:avoid}
      .prio{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;text-transform:uppercase;margin-left:8px}
      .prio-high{color:#e53e3e;background:#fff5f5;border:1px solid #e53e3e}
      .prio-medium{color:#d69e2e;background:#fffff0;border:1px solid #d69e2e}
      .prio-low{color:#38a169;background:#f0fff4;border:1px solid #38a169}
      .subject{font-size:17px;font-weight:bold;margin:8px 0}
      .meta{font-size:12px;color:#666;display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#f9f9f9;padding:10px;border-radius:4px;margin-top:10px}
      .response{border-left:3px solid #5233A8;background:#f5f3ff;padding:10px;margin-top:12px;font-size:13px;font-style:italic}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>Reporte de Soporte — Aim Education</h1>
    <p style="color:#666;font-size:13px">Generado: ${new Date().toLocaleString('es-ES')} | Filtros: App: ${filterApp}, Estado: ${filterStatus}, Prioridad: ${filterPriority}</p>
    ${filtered.map(t => `
      <div class="ticket">
        <div><strong style="color:#5233A8">#${t.id}</strong><span class="prio prio-${t.priority}">${t.priority}</span> <span style="font-size:12px;font-weight:bold;color:${t.status==='open'?'#ccac00':t.status==='resolved'?'#38a169':'#666'}">${(t.status||'').toUpperCase()}</span></div>
        <div class="subject">${t.subject}</div>
        <div style="font-size:14px;line-height:1.6;white-space:pre-wrap">${t.description}</div>
        <div class="meta">
          <div><strong>Creado por:</strong><br>${t.name} ${t.surname||''}<br><span style="font-size:11px">${t.email}</span></div>
          <div><strong>Asignado a:</strong><br>${t.assignee_name ? `${t.assignee_name} ${t.assignee_surname||''}` : 'Sin asignar'}</div>
          <div><strong>Fecha creación:</strong><br>${fmtDate(t.created_at)}</div>
          <div><strong>Fecha límite:</strong><br>${t.due_date ? fmtDate(t.due_date) : 'Sin fecha'}</div>
        </div>
        <div style="margin-top:8px;font-size:12px;color:#888">Apps: ${(Array.isArray(t.app_label)?t.app_label:[t.app_label||'Aim Education']).join(', ')}</div>
        ${t.dev_response ? `<div class="response"><strong>Respuesta:</strong> ${t.dev_response}</div>` : ''}
      </div>
    `).join('')}
    </body></html>`;

    const style = document.createElement('style');
    style.id = 'support-print-style';
    style.innerHTML = `@media print { body > *:not(#support-print-root) { display: none !important; } #support-print-root { display: block !important; position: fixed; left: 0; top: 0; width: 100%; background: white; z-index: 999999; } }`;
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.id = 'support-print-root';
    el.innerHTML = html;
    document.body.appendChild(el);
    window.print();
    setTimeout(() => {
      document.getElementById('support-print-style')?.remove();
      document.getElementById('support-print-root')?.remove();
    }, 1000);
  }

  async function copyText() {
    const filtered = getFiltered();
    let text = `REPORTE DE TICKETS — ${new Date().toLocaleDateString('es-ES')}\n`;
    text += `Filtros: App: ${filterApp}, Estado: ${filterStatus}, Prioridad: ${filterPriority}\n`;
    text += `${'─'.repeat(50)}\n\n`;
    filtered.forEach(t => { text += ticketATexto(t) + `\n${'─'.repeat(50)}\n\n`; });
    const ok = await copiarAlPortapapeles(text);
    avisar(ok ? `${filtered.length} ticket${filtered.length !== 1 ? 's' : ''} copiado${filtered.length !== 1 ? 's' : ''}.` : 'No se pudo copiar.');
  }

  // Copia un único ticket, con el mismo formato que el listado completo.
  async function copiarTicket(t) {
    const ok = await copiarAlPortapapeles(ticketATexto(t));
    avisar(ok ? `Ticket #${t.id} copiado.` : 'No se pudo copiar.');
  }

  function avisar(texto) {
    setAviso(texto);
    setTimeout(() => setAviso(''), 2500);
  }

  function getFiltered() {
    // Busca en nº, asunto, descripción, quien lo abrió y la respuesta antigua.
    const q = busqueda.trim().toLowerCase();
    const casa = t => {
      if (!q) return true;
      if (q.replace('#', '') === String(t.id)) return true;
      return [t.subject, t.description, t.dev_response, t.name, t.surname, t.email,
        t.assignee_name, t.assignee_surname]
        .some(v => (v || '').toString().toLowerCase().includes(q));
    };
    return tickets
      .filter(t =>
        casa(t) &&
        (filterPriority === 'all' || t.priority === filterPriority) &&
        (filterApp === 'all' || (Array.isArray(t.app_label) ? t.app_label.includes(filterApp) : t.app_label === filterApp)) &&
        (filterStatus === 'all' || t.status === filterStatus) &&
        (!filterOnlyMe || t.assigned_to === user?.id)
      )
      .sort((a, b) => {
        if (sortByPriority) {
          const w = { high: 3, medium: 2, low: 1 };
          const diff = (w[b.priority?.toLowerCase()] || 0) - (w[a.priority?.toLowerCase()] || 0);
          if (diff !== 0) return diff;
        }
        return sortDir === 'desc' ? b.id - a.id : a.id - b.id;
      });
  }

  const filtered = getFiltered();
  const openCount = tickets.filter(t => t.status === 'open').length;
  const highCount = tickets.filter(t => t.priority === 'high').length;

  return (
    <>
      {/* Aviso de copiado. Por encima del modal, que va a z-index 2000. */}
      {aviso && (
        <div role="status" style={{position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 3000, background: "var(--ink)", color: "var(--bg-2)", padding: "10px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, boxShadow: "var(--shadow)"}}>
          {aviso}
        </div>
      )}

      {/* Tabs */}
      <div style={{display: "flex", gap: 6, marginBottom: 22}}>
        {[
          { id: "list", label: `Ver tickets · ${tickets.length}` },
          { id: "create", label: "Crear ticket" },
        ].map(t => (
          <button key={t.id} className={`filter-pill ${activeTab === t.id ? "is-active" : ""}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
        <div style={{flex: 1}} />
        <div style={{display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: "var(--ink-3)"}}>
          <span style={{color: "var(--orange)", fontWeight: 700}}>{openCount} abiertos</span>
          {highCount > 0 && <span style={{color: "var(--orange)", fontWeight: 700, background: "color-mix(in oklab, var(--orange) 12%, var(--bg-2))", padding: "2px 10px", borderRadius: 99}}>{highCount} alta prioridad</span>}
        </div>
      </div>

      {activeTab === 'create' && (
        <div className="panel" style={{maxWidth: 640}}>
          <h2>Crear nuevo ticket de soporte</h2>
          <p className="sub">Documenta un bug, mejora o tarea interna.</p>
          <form onSubmit={submitTicket}>
            <div className="field" style={{marginTop: 16}}>
              <label>Asunto</label>
              <input placeholder="Ej. Bug en el formulario de login" value={subject} onChange={e => setSubject(e.target.value)} required />
            </div>
            <div className="field">
              <label>Descripción detallada</label>
              <textarea placeholder="Describe el problema o tarea con el mayor detalle posible..." value={description} onChange={e => setDescription(e.target.value)} required rows={6} style={{width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 14, padding: 12, background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--ink)"}} />
            </div>
            {submitMsg && <p style={{color: submitMsg.startsWith('Ticket') ? "var(--teal)" : "var(--orange)", fontWeight: 600, fontSize: 13, marginBottom: 12}}>{submitMsg}</p>}
            <button type="submit" className="btn btn-gradient" disabled={submitting}>
              {submitting ? <span className="dot-loader" /> : <>Enviar ticket <I.Arrow /></>}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'list' && (
        <>
          {/* Buscador */}
          <div style={{position: "relative", marginBottom: 14, maxWidth: 520}}>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar en asunto, descripción, nº de ticket o persona..."
              style={{width: "100%", fontFamily: "inherit", fontSize: 14, padding: "10px 34px 10px 14px", background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--ink)"}}
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} title="Limpiar"
                style={{position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, cursor: "pointer", color: "var(--ink-3)", fontSize: 16, lineHeight: 1}}>×</button>
            )}
          </div>

          {/* Filter bar */}
          <div style={{display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center"}}>
            <span style={{fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".08em"}}>App:</span>
            {['all', ...APPS].map(a => (
              <button key={a} className={`filter-pill ${filterApp === a ? "is-active" : ""}`} onClick={() => setFilterApp(a)}>{a === 'all' ? 'Todas' : a}</button>
            ))}
          </div>
          <div style={{display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center"}}>
            <span style={{fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".08em"}}>Estado:</span>
            {[['all','Todos'],['open','Abiertos'],['resolved','Resueltos'],['closed','Cerrados']].map(([v, l]) => (
              <button key={v} className={`filter-pill ${filterStatus === v ? "is-active" : ""}`} onClick={() => setFilterStatus(v)}>{l}</button>
            ))}
            <span style={{fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".08em", marginLeft: 8}}>Prioridad:</span>
            {[['all','Todas'],['low','Baja'],['medium','Media'],['high','Alta']].map(([v, l]) => (
              <button key={v} className={`filter-pill ${filterPriority === v ? "is-active" : ""}`} onClick={() => setFilterPriority(v)}>{l}</button>
            ))}
            <div style={{flex: 1}} />
            <button className={`filter-pill ${filterOnlyMe ? "is-active" : ""}`} onClick={() => setFilterOnlyMe(x => !x)}>
              <I.User width={13} height={13} style={{verticalAlign: "middle"}} /> Solo las mías
            </button>
            <button className="filter-pill" onClick={() => setSortByPriority(x => !x)} style={sortByPriority ? {background: "var(--orange)", color: "white", borderColor: "var(--orange)"} : {}}>
              Por prioridad
            </button>
            <button className="filter-pill" onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}>
              ID {sortDir === 'desc' ? '↓' : '↑'}
            </button>
            <button className="btn btn-sm btn-outline" onClick={exportPDF}>Exportar PDF</button>
            <button className="btn btn-sm btn-outline" onClick={copyText}>Copiar texto</button>
          </div>

          {/* Ticket list */}
          {loading && <p style={{color: "var(--ink-3)", fontSize: 14}}>Cargando tickets...</p>}
          {!loading && filtered.length === 0 && <p style={{color: "var(--ink-3)", fontSize: 14}}>No hay tickets con estos filtros.</p>}
          <div style={{display: "grid", gap: 12}}>
            {filtered.map(t => {
              const prioColor = PRIORITY_COLOR[t.priority?.toLowerCase()] || PRIORITY_COLOR.low;
              const labels = Array.isArray(t.app_label) ? t.app_label : ['Aim Education'];
              return (
                <div key={t.id}
                  onClick={() => openTicket(t)}
                  style={{
                    background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 14,
                    padding: "16px 20px", cursor: "pointer",
                    borderLeft: `5px solid ${prioColor}`,
                    transition: "box-shadow var(--tx-base) ease",
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = "var(--shadow)"}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
                >
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 10}}>
                    <div style={{display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap"}}>
                      <span style={{fontWeight: 800, color: "var(--purple)", fontSize: 13}}>#{t.id}</span>
                      {labels.map(l => (
                        <span key={l} style={{fontSize: 11, fontWeight: 700, background: "color-mix(in oklab, var(--purple) 12%, var(--bg-2))", color: "var(--purple)", padding: "2px 8px", borderRadius: 6}}>{l}</span>
                      ))}
                      <span style={{fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: prioColor, background: `color-mix(in oklab, ${prioColor} 14%, var(--bg-2))`, padding: "2px 8px", borderRadius: 6}}>{PRIORITY_LABEL[t.priority?.toLowerCase()] || t.priority}</span>
                    </div>
                    <span style={{fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: STATUS_COLOR[t.status] || "var(--ink-3)", flexShrink: 0}}>
                      {STATUS_LABEL[t.status] || t.status}
                    </span>
                  </div>
                  <div style={{fontWeight: 700, fontSize: 15, color: "var(--ink)", marginBottom: 4}}>{t.subject}</div>
                  <div style={{fontSize: 13, color: "var(--ink-2)", marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"}}>{t.description}</div>
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--ink-3)"}}>
                    <div style={{display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center"}}>
                      <span style={{fontStyle: "italic"}}>De: {t.name} {t.surname || ''}</span>
                      <span title={fmtDateTime(t.created_at)}>Creado: {fmtDate(t.created_at)}{hace(t.created_at) ? ` · ${hace(t.created_at)}` : ''}</span>
                      {t.due_date && <span style={{color: "var(--orange)", fontWeight: 700}}>Vence: {fmtDue(t.due_date)}</span>}
                    </div>
                    {t.assignee_name && (
                      <span style={{fontWeight: 600}}>→ {t.assignee_name} {t.assignee_surname || ''}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Detail modal */}
      {selected && (
        <div style={{position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center"}} onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div style={{
            background: "var(--bg-2)", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 700,
            maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column",
            boxShadow: "0 -8px 40px rgba(0,0,0,.3)",
          }}>
            {/* Modal header */}
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid var(--line)"}}>
              <div style={{minWidth: 0}}>
                <p style={{margin: 0, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--purple)"}}>Ticket #{selected.id}</p>
                <h3 style={{margin: "4px 0 0", fontSize: 18, fontWeight: 800}}>{selected.subject}</h3>
                <p style={{margin: "4px 0 0", fontSize: 12, color: "var(--ink-3)"}}>
                  Creado el {fmtDateTime(selected.created_at)}{hace(selected.created_at) ? ` · ${hace(selected.created_at)}` : ''}
                </p>
              </div>
              <div style={{display: "flex", gap: 8, alignItems: "center", flexShrink: 0}}>
                <button className="btn btn-sm btn-outline" onClick={() => copiarEnlace(selected)} title="Copiar el enlace directo a este ticket">
                  Enlace
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => copiarTicket(selected)} title="Copiar este ticket al portapapeles">
                  Copiar ticket
                </button>
                <button onClick={() => setSelected(null)} style={{background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 700, color: "var(--ink)"}}>
                  <I.X />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div style={{overflowY: "auto", padding: "20px 24px", flex: 1}}>

            {chatCanal ? (
              /* Vista de chat: solo el motivo del ticket y la conversación elegida */
              <>
                <button onClick={() => setChatCanal(null)}
                  style={{background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--purple)", fontWeight: 700, fontSize: 13, fontFamily: "inherit", marginBottom: 12}}>
                  ← Volver a la gestión del ticket
                </button>
                <div style={{background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 14}}>
                  <p style={{margin: "0 0 4px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)"}}>Motivo del ticket</p>
                  <p style={{margin: 0, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6, whiteSpace: "pre-wrap"}}>{selected.description}</p>
                  {selected.tiene_adjunto && (
                    <a href={`/api/support/${selected.id}/adjunto`} target="_blank" rel="noopener noreferrer" style={{display: "block", marginTop: 10}}>
                      <img src={`/api/support/${selected.id}/adjunto`} alt="Captura adjunta" style={{maxWidth: "100%", maxHeight: 160, borderRadius: 8, border: "1px solid var(--line)"}} />
                    </a>
                  )}
                </div>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8}}>
                  <p style={{margin: 0, fontSize: 13, fontWeight: 800, color: "var(--ink)"}}>
                    {chatCanal === 'equipo' ? 'Equipo de desarrollo' : `Con ${selected.name} ${selected.surname || ''}`}
                  </p>
                  {chatCanal === 'equipo' && <span style={{fontSize: 11, color: "var(--ink-3)"}}>Privado: quien abrió el ticket no lo ve.</span>}
                </div>
                <TicketChat ticketId={selected.id} canal={chatCanal} alto={340} />
                <div style={{height: 24}} />
              </>
            ) : (
              <>

              {/* Ticket info */}
              <div style={{background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 20}}>
                <p style={{margin: "0 0 4px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)"}}>Usuario</p>
                <p style={{margin: "0 0 12px", fontWeight: 700}}>{selected.name} {selected.surname || ''} <span style={{fontWeight: 400, fontSize: 13, color: "var(--ink-3)"}}>— {selected.email}</span></p>
                <p style={{margin: "0 0 4px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)"}}>Descripción</p>
                <p style={{margin: 0, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6, whiteSpace: "pre-wrap"}}>{selected.description}</p>
                {selected.tiene_adjunto && (
                  <a href={`/api/support/${selected.id}/adjunto`} target="_blank" rel="noopener noreferrer" style={{display: "block", marginTop: 10}}>
                    <img src={`/api/support/${selected.id}/adjunto`} alt="Captura adjunta" style={{maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: "1px solid var(--line)"}} />
                  </a>
                )}
                <div style={{display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, fontSize: 12, color: "var(--ink-3)"}}>
                  <span>Última actualización: <b>{selected.updated_at ? fmtDateTime(selected.updated_at) : 'sin cambios'}</b></span>
                  {selected.resolved_at && <span style={{color: "var(--teal)"}}>Resuelto: <b>{fmtDateTime(selected.resolved_at)}</b>{tardanza(selected) ? ` · tardó ${tardanza(selected)}` : ''}</span>}
                </div>
              </div>

              {/* Los chats se abren en su propia vista para no alargar esta pantalla */}
              <div style={{marginBottom: 20}}>
                <p style={{margin: "0 0 10px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)"}}>Conversación</p>
                <div style={{display: "flex", gap: 8}}>
                  {[['equipo', 'Equipo de desarrollo', selected.msgs_equipo], ['creador', 'Con quien abrió el ticket', selected.msgs_creador]].map(([c, l, n]) => (
                    <button key={c} type="button" onClick={() => setChatCanal(c)}
                      style={{flex: 1, padding: "10px 8px", borderRadius: 8, border: "1px solid var(--line)", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit", background: "var(--bg-3)", color: "var(--ink-2)"}}>
                      {l}{n ? <span style={{color: "var(--purple)"}}> · {n}</span> : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status buttons */}
              <div style={{marginBottom: 20}}>
                <p style={{margin: "0 0 10px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)"}}>Cambiar estado</p>
                <div style={{display: "flex", gap: 8}}>
                  <button className="btn" style={{flex: 1, background: "#FFD526", color: "#000"}} onClick={() => updateTicket('open')}>Abierto</button>
                  <button className="btn" style={{flex: 1, background: "var(--teal)", color: "white"}} onClick={() => updateTicket('resolved')}>Resuelto</button>
                  <button className="btn" style={{flex: 1, background: "var(--ink-3)", color: "white"}} onClick={() => updateTicket('closed')}>Cerrar</button>
                </div>
              </div>

              <hr style={{border: 0, borderTop: "1px solid var(--line)", margin: "20px 0"}} />

              {/* Internal management */}
              <p style={{margin: "0 0 14px", fontSize: 13, fontWeight: 800, color: "var(--ink)", textTransform: "uppercase", letterSpacing: ".08em"}}>Gestión interna</p>

              {/* Priority */}
              <div style={{marginBottom: 16}}>
                <p style={{margin: "0 0 8px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)"}}>Prioridad</p>
                <div style={{display: "flex", gap: 8}}>
                  {['low','medium','high'].map(p => (
                    <button key={p}
                      onClick={() => setTicketPriority(p)}
                      style={{
                        flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid var(--line)", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit",
                        background: ticketPriority === p ? PRIORITY_COLOR[p] : "var(--bg-3)",
                        color: ticketPriority === p ? (p === 'medium' ? '#000' : 'white') : "var(--ink-2)",
                      }}>
                      {PRIORITY_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assignee */}
              <div style={{marginBottom: 16}}>
                <p style={{margin: "0 0 8px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)"}}>Asignado a (superadmins)</p>
                <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
                  <button onClick={() => setTicketAssignedId('')}
                    style={{padding: "6px 14px", borderRadius: 8, border: "1px solid var(--line)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", background: !ticketAssignedId ? "var(--purple)" : "var(--bg-3)", color: !ticketAssignedId ? "white" : "var(--ink-2)"}}>
                    Sin asignar
                  </button>
                  {superadmins.map(sa => (
                    <button key={sa.id} onClick={() => setTicketAssignedId(sa.id)}
                      style={{padding: "6px 14px", borderRadius: 8, border: "1px solid var(--line)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", background: ticketAssignedId === sa.id ? "var(--purple)" : "var(--bg-3)", color: ticketAssignedId === sa.id ? "white" : "var(--ink-2)"}}>
                      {sa.name} {sa.surname || ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Due date */}
              <div className="field" style={{marginBottom: 16}}>
                <label>Fecha límite (DD-MM-YYYY)</label>
                <input placeholder="31-12-2026" value={ticketDueDate} onChange={e => setTicketDueDate(e.target.value)} style={{maxWidth: 200}} />
              </div>

              {/* App labels */}
              <div style={{marginBottom: 20}}>
                <p style={{margin: "0 0 8px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)"}}>Aplicaciones relacionadas</p>
                <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
                  {APPS.map(app => {
                    const sel = ticketAppLabels.includes(app);
                    return (
                      <button key={app} onClick={() => setTicketAppLabels(prev => sel ? prev.filter(l => l !== app) : [...prev, app])}
                        style={{padding: "6px 14px", borderRadius: 8, border: "1px solid var(--line)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", background: sel ? "var(--purple)" : "var(--bg-3)", color: sel ? "white" : "var(--ink-2)"}}>
                        {app}
                      </button>
                    );
                  })}
                </div>
              </div>

              {updateMsg && <p style={{color: "var(--orange)", fontWeight: 600, fontSize: 13, marginBottom: 12}}>{updateMsg}</p>}
              <button className="btn btn-gradient btn-block" onClick={() => updateTicket()} disabled={updating}>
                {updating ? <span className="dot-loader" /> : <>Guardar cambios internos <I.Check /></>}
              </button>
              <div style={{height: 24}} />
              </>
            )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


// Panel de soporte de las familias: crear consultas, ver en qué estado están
// y hablar con el equipo dentro de cada una.
export function UserSupport({ user }) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [imagen, setImagen] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [misTickets, setMisTickets] = useState([]);
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(() => {
    fetch('/api/support/mios', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { tickets: [] })
      .then(d => setMisTickets(d.tickets || []))
      .catch(() => {});
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function elegirImagen(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setMsg('Solo se pueden adjuntar imágenes.'); return; }
    if (f.size > 3 * 1024 * 1024) { setMsg('La imagen no puede pasar de 3 MB.'); return; }
    setMsg('');
    setImagen(await leerImagen(f));
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject, description,
          adjunto: imagen?.data || null, adjuntoNombre: imagen?.nombre || null, adjuntoMime: imagen?.mime || null,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg('Ticket #' + d.ticketId + ' enviado correctamente. Te responderemos pronto.');
        setSubject(''); setDescription(''); setImagen(null);
        cargar();
      } else {
        setMsg(d.error || 'Error al enviar el ticket.');
      }
    } catch {
      setMsg('Error de conexión.');
    }
    setLoading(false);
  }

  return (
    <div className="panel" style={{maxWidth: 680}}>
      <h2><I.Bell /> Soporte</h2>
      <p className="sub">¿Tienes algún problema o sugerencia? Escríbenos y te responderemos.</p>

      <form onSubmit={submit} style={{marginTop: 20}}>
        <div className="field">
          <label>Asunto</label>
          <input placeholder="Ej. No puedo iniciar sesión" value={subject} onChange={e => setSubject(e.target.value)} required />
        </div>
        <div className="field">
          <label>Descripción</label>
          <textarea placeholder="Describe tu consulta o problema con el mayor detalle posible..." value={description} onChange={e => setDescription(e.target.value)} required rows={5} style={{width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 14, padding: 12, background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--ink)"}} />
        </div>
        <div className="field">
          <label>Captura (opcional)</label>
          {imagen ? (
            <div style={{display: "flex", alignItems: "center", gap: 10}}>
              <img src={imagen.data} alt="" style={{width: 48, height: 48, objectFit: "cover", borderRadius: 8}} />
              <span style={{flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{imagen.nombre}</span>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setImagen(null)}>Quitar</button>
            </div>
          ) : (
            <input type="file" accept="image/*" onChange={elegirImagen} />
          )}
          <span style={{fontSize: 11, color: "var(--ink-3)"}}>Una imagen ayuda mucho a entender el problema. Máx. 3 MB.</span>
        </div>
        {msg && <p style={{color: msg.startsWith('Ticket') ? "var(--teal)" : "var(--orange)", fontWeight: 600, fontSize: 13, marginBottom: 12}}>{msg}</p>}
        <button type="submit" className="btn btn-gradient" disabled={loading}>
          {loading ? <span className="dot-loader" /> : <>Enviar consulta <I.Arrow /></>}
        </button>
      </form>

      {misTickets.length > 0 && (
        <>
          <h3 style={{marginTop: 32, fontSize: 16, fontWeight: 700}}>Mis solicitudes</h3>
          <div style={{display: "grid", gap: 10, marginTop: 12}}>
            {misTickets.map(t => {
              const prioColor = PRIORITY_COLOR[t.priority?.toLowerCase()] || PRIORITY_COLOR.low;
              const estaAbierto = abierto === t.id;
              return (
                <div key={t.id} style={{background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", borderLeft: `4px solid ${prioColor}`}}>
                  <div style={{display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4}}>
                    <span style={{fontWeight: 700, fontSize: 14}}>{t.subject}</span>
                    <span style={{fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: STATUS_COLOR[t.status] || "var(--ink-3)", flexShrink: 0}}>{STATUS_LABEL[t.status] || t.status}</span>
                  </div>
                  <p style={{margin: 0, fontSize: 12, color: "var(--ink-3)"}}>
                    Enviado el {fmtDate(t.created_at)}
                    {t.resolved_at && <span style={{color: "var(--teal)"}}> · resuelto el {fmtDate(t.resolved_at)}</span>}
                  </p>
                  <button
                    onClick={() => setAbierto(estaAbierto ? null : t.id)}
                    style={{marginTop: 10, background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--purple)", fontWeight: 700, fontSize: 13, fontFamily: "inherit"}}>
                    {estaAbierto ? 'Ocultar conversación' : `Ver conversación${t.mensajes ? ` (${t.mensajes})` : ''}`}
                  </button>
                  {estaAbierto && (
                    <div style={{marginTop: 12}}>
                      <TicketChat ticketId={t.id} canal="creador" alto={240} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
