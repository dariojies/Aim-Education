import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { useRouter } from '../App.jsx';
import { fmtFechaLarga, fmtHora, fmtFechaHora } from '../fechas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cambios (ticket #397): qué se ha publicado en cada deploy. Cada deploy deja su
// entrada solo al arrancar el servidor (fecha, commit, los tickets que pasaron
// de «Espera de deploy» a «Resuelto» y, con el token de GitHub, sus commits). El
// Equipo IT y los superadmin le ponen título y texto y pueden añadir entradas a
// mano; secretaría y dirección lo leen (el servidor lo comprueba). Solo personal.
// ─────────────────────────────────────────────────────────────────────────────

// Los tickets de cada deploy, agrupados por su categoría de Soporte.
const GRUPOS = [
  ['error', 'Arreglos', '#E5484D'],
  ['mejora', 'Mejoras', 'var(--purple)'],
  ['familia', 'Peticiones de familias', 'var(--teal)'],
  ['facturacion', 'Facturación', '#B45309'],
  ['interna', 'Tareas internas', '#3E63DD'],
  ['', 'Sin categoría', 'var(--ink-3)'],
];

const chip = (color, extra = {}) => ({ fontSize: 11, fontWeight: 800, color, background: `color-mix(in oklab, ${color} 13%, var(--bg-2))`, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', ...extra });
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box' };
const enlace = { color: 'var(--purple)', fontWeight: 700, textDecoration: 'none' };

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

// Un texto con «#123» enlazado a ese ticket de Soporte.
function ConTickets({ texto, abrir }) {
  const partes = String(texto || '').split(/(#\d{1,6})\b/);
  return partes.map((p, i) => (/^#\d+$/.test(p)
    ? <a key={i} href={`/admin/soporte/${p.slice(1)}`} onClick={(e) => { e.preventDefault(); abrir(Number(p.slice(1))); }} style={enlace}>{p}</a>
    : <React.Fragment key={i}>{p}</React.Fragment>));
}

export default function AdminCambios({ showToast }) {
  const { go } = useRouter();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState(null); // { id|null, titulo, texto }
  const [guardando, setGuardando] = useState(false);
  const [recargando, setRecargando] = useState(null);

  const cargar = useCallback(async () => {
    setError(null);
    try { setDatos(await api('/api/admin/cambios')); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const abrirTicket = (id) => go(`/admin/soporte/${id}`);
  const gh = (ruta) => `https://github.com/${datos?.repo}/${ruta}`;

  const lista = useMemo(() => {
    if (!datos) return [];
    const n = q.trim().toLowerCase();
    if (!n) return datos.entradas;
    return datos.entradas.filter(e => [
      e.titulo, e.texto, e.commit, e.release ? `v${e.release}` : '',
      ...e.tickets.flatMap(t => [`#${t.id}`, t.asunto]),
      ...e.commits.map(c => c.mensaje),
    ].some(v => String(v || '').toLowerCase().includes(n)));
  }, [datos, q]);

  async function guardar(ev) {
    ev.preventDefault();
    setGuardando(true);
    try {
      const { id, titulo, texto } = editando;
      if (id) await api(`/api/admin/cambios/${id}`, { method: 'PUT', body: { titulo, texto } });
      else await api('/api/admin/cambios', { method: 'POST', body: { titulo, texto } });
      setEditando(null);
      showToast?.(id ? 'Guardado.' : 'Entrada añadida.');
      cargar();
    } catch (e) { showToast?.(e.message); } finally { setGuardando(false); }
  }
  async function borrar(e) {
    if (!window.confirm('¿Borrar esta entrada?')) return;
    try {
      await api(`/api/admin/cambios/${e.id}`, { method: 'DELETE' });
      showToast?.('Entrada borrada.');
      cargar();
    } catch (err) { showToast?.(err.message); }
  }
  async function recargarCommits(e) {
    setRecargando(e.id);
    try {
      const d = await api(`/api/admin/cambios/${e.id}/commits`, { method: 'POST' });
      showToast?.(`${d.commits} commit${d.commits === 1 ? '' : 's'} de GitHub.`);
      cargar();
    } catch (err) { showToast?.(err.message); } finally { setRecargando(null); }
  }

  if (error) return <p style={{ color: 'var(--orange)', fontSize: 14 }}>{error}</p>;
  if (!datos) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</p>;
  const puede = !!datos.puedeEditar;

  const formulario = (
    <form onSubmit={guardar} style={{ display: 'grid', gap: 8, background: 'var(--bg-3)', borderRadius: 10, padding: 12 }}>
      <input autoFocus value={editando?.titulo || ''} maxLength={150} placeholder="Título (p. ej. «Clases individuales y arreglos en Facturación»)"
        onChange={e => setEditando(x => ({ ...x, titulo: e.target.value }))} style={{ ...campo, background: 'var(--bg-2)' }} />
      <textarea value={editando?.texto || ''} maxLength={4000} rows={5}
        placeholder="Qué cambia, en palabras de todos los días. Escribe #123 para enlazar un ticket."
        onChange={e => setEditando(x => ({ ...x, texto: e.target.value }))} style={{ ...campo, background: 'var(--bg-2)', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditando(null)}>Cancelar</button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', maxWidth: 720, flex: '1 1 320px' }}>
          Lo que se ha publicado en cada deploy de la web. Cada deploy se apunta solo, con los tickets que estaban
          en «Espera de deploy» y pasan a resueltos{datos.conGithub ? ' y sus commits' : ''}.
          {puede ? ' Ponle un título y explica lo que cambia; las entradas a mano sirven para lo que se cambia sin deploy.' : ' Lo escribe el Equipo IT.'}
        </p>
        {puede && !editando?.nueva && (
          <button type="button" className="btn btn-primary" onClick={() => setEditando({ nueva: true, id: null, titulo: '', texto: '' })}>
            <I.Plus width={15} height={15} /> Nueva entrada
          </button>
        )}
      </div>
      {puede && !datos.conGithub && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
          Los commits no se cargan solos porque falta el token de GitHub (GITHUB_TOKEN en Heroku). Mientras tanto,
          «Comparar en GitHub» enseña lo mismo a quien tenga acceso al repositorio.
        </p>
      )}
      {editando?.nueva && formulario}

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por texto, ticket o commit…"
        style={{ ...campo, width: 'auto', maxWidth: 420, borderRadius: 999, padding: '7px 14px', fontSize: 13 }} />

      {lista.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          {datos.entradas.length ? 'Nada coincide con la búsqueda.' : 'Todavía no hay ningún deploy apuntado. El próximo se apuntará solo.'}
        </div>
      ) : lista.map(e => {
        const manual = e.origen === 'manual';
        const grupos = GRUPOS.map(([k, nombre, color]) => ({ nombre, color, tickets: e.tickets.filter(t => (t.categoria || '') === k || (!k && !GRUPOS.some(g => g[0] === t.categoria))) }))
          .filter(g => g.tickets.length);
        const titulo = e.titulo || (manual ? 'Entrada a mano' : `Deploy de las ${fmtHora(e.publicado)}`);
        const enEdicion = editando && !editando.nueva && editando.id === e.id;
        return (
          <div key={e.id} className="card" style={{ padding: 16, display: 'grid', gap: 10, borderLeft: `4px solid ${manual ? 'var(--teal)' : 'var(--purple)'}` }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
              <span style={chip(manual ? 'var(--teal)' : 'var(--purple)', { textTransform: 'uppercase' })}>{manual ? 'A mano' : 'Deploy'}</span>
              <span><b style={{ color: 'var(--ink-2)' }}>{fmtFechaLarga(e.publicado)}</b> · {fmtHora(e.publicado)}</span>
              {e.release && <span style={chip('var(--ink-2)')}>v{e.release}</span>}
              {e.commit && (
                <a href={gh(`commit/${e.commit}`)} target="_blank" rel="noreferrer" style={{ ...enlace, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} title="Ver el commit en GitHub">
                  {e.commit.slice(0, 7)}
                </a>
              )}
              {e.commit && e.commitAnterior && (
                <a href={gh(`compare/${e.commitAnterior}...${e.commit}`)} target="_blank" rel="noreferrer" style={{ ...enlace, fontSize: 12 }}>Comparar en GitHub ↗</a>
              )}
              <div style={{ flex: 1 }} />
              {puede && !enEdicion && (
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditando({ id: e.id, titulo: e.titulo || '', texto: e.texto || '' })}>
                  <I.Edit width={14} height={14} /> {e.titulo || e.texto ? 'Editar' : 'Escribir'}
                </button>
              )}
              {puede && datos.conGithub && !manual && e.commitAnterior && (
                <button type="button" className="btn btn-sm btn-outline" disabled={recargando === e.id} onClick={() => recargarCommits(e)} title="Volver a pedir los commits a GitHub">
                  {recargando === e.id ? 'Pidiendo…' : 'Recargar commits'}
                </button>
              )}
              {puede && manual && (
                <button type="button" className="btn btn-sm btn-outline" style={{ color: 'var(--orange)' }} onClick={() => borrar(e)} aria-label="Borrar la entrada"><I.Trash width={14} height={14} /></button>
              )}
            </div>

            {enEdicion ? formulario : (
              <>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: e.titulo ? 'var(--ink)' : 'var(--ink-2)' }}>{titulo}</h3>
                {e.texto && <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 14 }}><ConTickets texto={e.texto} abrir={abrirTicket} /></p>}
              </>
            )}

            {grupos.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                {grupos.map(g => (
                  <div key={g.nombre} style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: g.color }}>{g.nombre}</span>
                    {g.tickets.map(t => (
                      <a key={t.id} href={`/admin/soporte/${t.id}`} onClick={(ev) => { ev.preventDefault(); abrirTicket(t.id); }}
                        style={{ fontSize: 14, color: 'var(--ink)', textDecoration: 'none', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <b style={{ color: 'var(--purple)', minWidth: 44 }}>#{t.id}</b><span>{t.asunto || 'Sin asunto'}</span>
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {!manual && !e.tickets.length && !e.texto && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Este deploy no resolvió ningún ticket en «Espera de deploy».</p>
            )}

            {e.commits.length > 0 && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>
                  {e.commits.length} commit{e.commits.length === 1 ? '' : 's'}{e.commits.length >= 100 ? ' (los 100 últimos)' : ''}
                </summary>
                <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                  {e.commits.map(c => (
                    <li key={c.sha} style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <a href={gh(`commit/${c.sha}`)} target="_blank" rel="noreferrer" style={{ ...enlace, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{c.sha.slice(0, 7)}</a>
                      <span><ConTickets texto={c.mensaje} abrir={abrirTicket} /></span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {e.editadoPor && (e.titulo || e.texto) && (
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Escrito por {e.editadoPor} · {fmtFechaHora(e.actualizado)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
