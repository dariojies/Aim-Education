import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { useRouter } from '../App.jsx';
import { fmtFecha, fmtFechaLarga, fmtHora, fmtFechaHora } from '../fechas.js';
import { novedadesDe, tituloDe } from '../novedades.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cambios (ticket #397): qué se ha publicado en cada deploy. Cada deploy deja su
// entrada solo al arrancar el servidor (fecha, commit, los tickets que pasaron
// de «Espera de deploy» a «Resuelto» y, con el token de GitHub, sus commits). El
// Equipo IT y los superadmin le ponen título y texto y pueden añadir entradas a
// mano; secretaría y dirección lo leen (el servidor lo comprueba). Solo personal.
// Se enseña como un historial por días: cada publicación con sus «Novedades»
// (redactadas de los commits, src/novedades.js) y, al pie, sus tickets y sus
// commits, plegados.
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

const chip = (color, extra = {}) => ({ fontSize: 11, fontWeight: 800, color: legible(color), background: `color-mix(in oklab, ${color} 13%, var(--bg-2))`, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', ...extra });
const campo = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box' };
// Los colores, mezclados con el del texto: igual en claro y legibles en oscuro.
const legible = (c) => `color-mix(in oklab, ${c} 72%, var(--ink))`;
const enlace = { color: legible('var(--purple)'), fontWeight: 700, textDecoration: 'none' };
const caja = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: '0 1px 3px rgba(0, 0, 0, .04)' };
const botonIcono = { padding: 7, borderRadius: 9, color: 'var(--ink-3)', lineHeight: 0 };

// Cada apartado de las novedades con su color, siempre el mismo.
const COLORES = ['var(--purple)', '#0E9F6E', '#3E63DD', '#B45309', '#D6409F', '#0891B2'];
function colorApartado(nombre) {
  if (!nombre) return 'var(--ink-3)';
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}

// «Hoy · jueves, 8 de octubre», «Ayer · …» o la fecha (con el año si no es este).
function etiquetaDia(v) {
  const sinAnio = fmtFechaLarga(v).replace(new RegExp(` de ${new Date().getFullYear()}$`), '');
  const k = fmtFecha(v);
  const etiqueta = k === fmtFecha(new Date()) ? 'Hoy' : k === fmtFecha(new Date(Date.now() - 864e5)) ? 'Ayer' : null;
  return etiqueta
    ? <>{etiqueta}<span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>{sinAnio}</span></>
    : sinAnio.charAt(0).toUpperCase() + sinAnio.slice(1);
}

function Recargar({ girando }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={girando ? { opacity: .4 } : undefined}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
    </svg>
  );
}

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
  const [abiertos, setAbiertos] = useState(() => new Set());   // las entradas con los commits a la vista
  const alternar = (id) => setAbiertos(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

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
      ...e.commits.flatMap(c => [c.mensaje, ...(c.novedades || [])]),
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

  const formulario = (nueva) => (
    <form onSubmit={guardar} className={nueva ? 'card' : undefined}
      style={{ ...(nueva ? caja : {}), display: 'grid', gap: 8, padding: nueva ? 16 : 0 }}>
      {nueva && <b style={{ fontSize: 14 }}>Nota a mano</b>}
      {nueva && <span style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: -4 }}>Para lo que se cambia sin publicar la web: un ajuste de Heroku, un dato corregido, un aviso al equipo…</span>}
      <input autoFocus value={editando?.titulo || ''} maxLength={150} placeholder={nueva ? 'Título' : 'Título (si lo dejas vacío, se pone solo)'}
        onChange={e => setEditando(x => ({ ...x, titulo: e.target.value }))} style={campo} />
      <textarea value={editando?.texto || ''} maxLength={4000} rows={4}
        placeholder="Qué cambia, en palabras de todos los días. Escribe #123 para enlazar un ticket."
        onChange={e => setEditando(x => ({ ...x, texto: e.target.value }))} style={{ ...campo, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditando(null)}>Cancelar</button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );

  // Las entradas, por días.
  const dias = [];
  for (const e of lista) {
    const k = fmtFecha(e.publicado);
    if (dias[dias.length - 1]?.k !== k) dias.push({ k, fecha: e.publicado, entradas: [] });
    dias[dias.length - 1].entradas.push(e);
  }

  const tarjeta = (e) => {
    const manual = e.origen === 'manual';
    const tickets = e.tickets.map(t => ({ ...t, grupo: GRUPOS.find(g => g[0] === (t.categoria || '')) || GRUPOS[GRUPOS.length - 1] }));
    const novedades = novedadesDe(e.commits);
    const titulo = e.titulo || (manual ? 'Nota' : (tituloDe(novedades) || `Publicación de las ${fmtHora(e.publicado)}`));
    const enEdicion = editando && !editando.nueva && editando.id === e.id;
    const abierto = abiertos.has(e.id);
    const color = manual ? 'var(--teal)' : 'var(--purple)';
    const vacia = !e.texto && !novedades.length && !tickets.length;
    const firma = e.editadoPor && (e.titulo || e.texto);
    return (
      <article key={e.id} style={{ position: 'relative' }}>
        <span aria-hidden="true" style={{ position: 'absolute', left: -27, top: 20, width: 12, height: 12, borderRadius: 999, background: color, boxShadow: '0 0 0 4px var(--bg)' }} />
        <div className="card" style={{ ...caja, padding: '16px 20px', display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-3)', minHeight: 30 }}>
            <span style={{ fontWeight: 800, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>{fmtHora(e.publicado)}</span>
            {manual && <span style={chip('var(--teal)')}>Nota a mano</span>}
            {e.release && <span style={chip('var(--ink-3)')}>v{e.release}</span>}
            <div style={{ flex: 1 }} />
            {puede && !enEdicion && (
              <button type="button" className="btn btn-ghost" style={botonIcono} title={e.titulo || e.texto ? 'Editar el título y el texto' : 'Escribir un título y un texto'}
                aria-label="Editar" onClick={() => setEditando({ id: e.id, titulo: e.titulo || '', texto: e.texto || '' })}>
                <I.Edit width={15} height={15} />
              </button>
            )}
            {puede && !manual && e.commitAnterior && (
              <button type="button" className="btn btn-ghost" style={botonIcono} disabled={recargando === e.id} onClick={() => recargarCommits(e)}
                aria-label="Recargar commits"
                title={`Volver a pedir los commits a GitHub${datos.conToken ? '' : ' (sin GITHUB_TOKEN, GitHub limita las consultas: si falla, prueba un rato después)'}`}>
                <Recargar girando={recargando === e.id} />
              </button>
            )}
            {puede && manual && (
              <button type="button" className="btn btn-ghost" style={{ ...botonIcono, color: 'var(--orange)' }} onClick={() => borrar(e)} aria-label="Borrar la nota" title="Borrar la nota">
                <I.Trash width={15} height={15} />
              </button>
            )}
          </div>

          {enEdicion ? formulario(false) : (
            <div style={{ display: 'grid', gap: 6, marginTop: -6 }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.25, color: 'var(--ink)' }}>{titulo}</h3>
              {e.texto && <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14.5, color: 'var(--ink-2)' }}><ConTickets texto={e.texto} abrir={abrirTicket} /></p>}
            </div>
          )}

          {novedades.length > 0 && (
            <div style={{ display: 'grid', gap: 14 }}>
              {novedades.map(g => {
                const c = colorApartado(g.apartado);
                return (
                  <div key={g.apartado || '—'} style={{ display: 'grid', gap: 6 }}>
                    {(g.apartado || novedades.length > 1) && (
                      <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: legible(c) }}>{g.apartado || 'Además'}</span>
                    )}
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 5 }}>
                      {g.puntos.map((pt, j) => (
                        <li key={j} style={{ display: 'flex', gap: 10, fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink)' }}>
                          <span aria-hidden="true" style={{ flex: 'none', width: 6, height: 6, borderRadius: 999, background: c, marginTop: 8, opacity: .75 }} />
                          <span>
                            <ConTickets texto={pt.texto} abrir={abrirTicket} />
                            {pt.tickets.length > 0 && <span style={{ fontSize: 12, marginLeft: 6 }}><ConTickets texto={pt.tickets.join(' ')} abrir={abrirTicket} /></span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          {vacia && !enEdicion && (
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-3)' }}>
              {manual ? 'Sin texto.' : 'No hay novedades apuntadas para esta publicación.'}
            </p>
          )}

          {(tickets.length > 0 || e.commits.length > 0 || e.commit || firma) && (
            <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              {tickets.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', marginRight: 2 }}>Tickets resueltos</span>
                  {tickets.map(t => (
                    <a key={t.id} href={`/admin/soporte/${t.id}`} onClick={(ev) => { ev.preventDefault(); abrirTicket(t.id); }}
                      title={`${t.grupo[1]} · ${t.asunto || 'Sin asunto'}`}
                      style={{ ...chip(t.grupo[2], { fontWeight: 600, fontSize: 12, padding: '3px 10px', borderRadius: 999 }), textDecoration: 'none', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>
                      <b>#{t.id}</b> {t.asunto || 'Sin asunto'}
                    </a>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
                {e.commits.length > 0 && (
                  <button type="button" onClick={() => alternar(e.id)} aria-expanded={abierto}
                    style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 700, color: 'var(--ink-2)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <I.Chevron width={13} height={13} style={{ transform: abierto ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                    {e.commits.length === 1 ? '1 commit' : `${e.commits.length} commits`}{e.commits.length >= 100 ? ' (los 100 últimos)' : ''}
                  </button>
                )}
                {e.commit && (
                  <a href={e.commitAnterior ? gh(`compare/${e.commitAnterior}...${e.commit}`) : gh(`commit/${e.commit}`)} target="_blank" rel="noreferrer"
                    style={{ ...enlace, fontWeight: 600, fontSize: 12 }} title={e.commitAnterior ? 'Comparar con la publicación anterior en GitHub' : 'Ver el commit en GitHub'}>
                    <span style={{ fontFamily: 'ui-monospace, monospace' }}>{e.commit.slice(0, 7)}</span> en GitHub ↗
                  </a>
                )}
                {firma && <span style={{ marginLeft: 'auto' }}>Escrito por {e.editadoPor} · {fmtFechaHora(e.actualizado)}</span>}
              </div>
              {abierto && (
                <ul style={{ margin: 0, padding: '10px 12px', listStyle: 'none', display: 'grid', gap: 5, background: 'var(--bg-3)', borderRadius: 10 }}>
                  {e.commits.map(c => (
                    <li key={c.sha} style={{ fontSize: 13, display: 'flex', gap: 10, alignItems: 'baseline', color: 'var(--ink-2)' }}>
                      <a href={gh(`commit/${c.sha}`)} target="_blank" rel="noreferrer" style={{ ...enlace, fontWeight: 600, fontFamily: 'ui-monospace, monospace', fontSize: 12, flex: 'none' }}>{c.sha.slice(0, 7)}</a>
                      <span><ConTickets texto={c.mensaje} abrir={abrirTicket} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 860 }}>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.5 }}>
        Cada vez que se publica la web, aquí queda lo nuevo: qué cambia y qué tickets resuelve.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 420 }}>
          <I.Search width={15} height={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar novedades, tickets o commits…" aria-label="Buscar"
            style={{ ...campo, borderRadius: 999, padding: '8px 14px 8px 34px', fontSize: 13, background: 'var(--bg-2)' }} />
        </div>
        {puede && !editando?.nueva && (
          <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--ink-2)' }}
            title="Para apuntar lo que se cambia sin publicar la web" onClick={() => setEditando({ nueva: true, id: null, titulo: '', texto: '' })}>
            <I.Plus width={14} height={14} /> Nota a mano
          </button>
        )}
      </div>
      {editando?.nueva && formulario(true)}

      {lista.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          {datos.entradas.length ? 'Nada coincide con la búsqueda.' : 'Todavía no hay ninguna publicación apuntada. La próxima se apuntará sola.'}
        </div>
      ) : dias.map(d => (
        <section key={d.k} style={{ display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', display: 'flex', gap: 8, alignItems: 'baseline' }}>
            {etiquetaDia(d.fecha)}
          </h2>
          <div style={{ position: 'relative', display: 'grid', gap: 14, paddingLeft: 28 }}>
            <span aria-hidden="true" style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 2, borderRadius: 2, background: 'var(--line)' }} />
            {d.entradas.map(tarjeta)}
          </div>
        </section>
      ))}
    </div>
  );
}
