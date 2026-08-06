import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { useRouter } from '../App.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// La agenda de cada uno: lo que ya tiene ocupado ese día (las clases que da y
// los eventos donde figura como docente) y sus tareas.
//
// Es privada. No hay forma de ver la de otro: el servidor solo devuelve las de
// quien pregunta, y todas las consultas llevan su user_id.
// ─────────────────────────────────────────────────────────────────────────────

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HOY = () => iso(new Date());

// De qué hora a qué hora se pinta el día.
const DESDE = 8, HASTA = 22;
const enMinutos = (h) => { const [a, b] = String(h || '').split(':').map(Number); return (a || 0) * 60 + (b || 0); };
const comoHora = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const fechaLarga = (f) => new Date(f + 'T12:00:00')
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

// Elegir un ticket para engancharlo a una tarea. Se puede mirar entre los
// propios, entre los que no tiene nadie —para cogerlos— o entre todos.
function ElegirTicket({ valor, onElegir, coger, onCoger, yo }) {
    const [tickets, setTickets] = useState([]);
    const [ambito, setAmbito] = useState('mios'); // 'mios' | 'sinDuenio' | 'todos'
    const [busca, setBusca] = useState('');
    const [abierto, setAbierto] = useState(false);

    useEffect(() => {
        fetch('/api/support', { credentials: 'include', cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(d => setTickets(d?.tickets || []))
            .catch(() => {});
    }, []);

    const lista = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return tickets
            .filter(t => t.status !== 'done' && t.status !== 'resolved')
            .filter(t => ambito === 'todos'
                || (ambito === 'mios' && (t.assigned_to === yo || t.user_id === yo))
                || (ambito === 'sinDuenio' && !t.assigned_to))
            .filter(t => !q || `${t.id} ${t.subject}`.toLowerCase().includes(q))
            .slice(0, 40);
    }, [tickets, ambito, busca, yo]);

    const elegido = tickets.find(t => t.id === valor);

    if (valor && !abierto) {
        return (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                    #{valor}{elegido ? ` · ${elegido.subject}` : ''}
                </span>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setAbierto(true)}>Cambiar</button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => onElegir(null)}>Quitar</button>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['mios', 'Míos'], ['sinDuenio', 'Sin dueño'], ['todos', 'Todos']].map(([v, l]) => (
                    <button key={v} type="button" className={`filter-pill ${ambito === v ? 'is-active' : ''}`}
                        onClick={() => setAmbito(v)}>{l}</button>
                ))}
            </div>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por número o asunto..." />
            <div style={{ maxHeight: 190, overflowY: 'auto', display: 'grid', gap: 5 }}>
                {lista.map(t => (
                    <button key={t.id} type="button"
                        onClick={() => { onElegir(t.id); setAbierto(false); }}
                        style={{
                            textAlign: 'left', padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                            border: '1px solid var(--line)', background: 'var(--bg-2)', fontFamily: 'inherit', fontSize: 12,
                        }}>
                        <b>#{t.id}</b> {t.subject}
                        <span style={{ color: 'var(--ink-3)' }}>
                            {' · '}{t.priority === 'high' ? 'alta' : t.priority === 'medium' ? 'media' : 'baja'}
                            {!t.assigned_to ? ' · sin dueño' : ''}
                        </span>
                    </button>
                ))}
                {!lista.length && (
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                        {ambito === 'mios' ? 'No tienes tickets abiertos.' : 'Ninguno con ese filtro.'}
                    </span>
                )}
            </div>
            {ambito !== 'mios' && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={coger} onChange={e => onCoger(e.target.checked)} style={{ accentColor: 'var(--teal)' }} />
                    Asignármelo si no tiene dueño
                </label>
            )}
        </div>
    );
}

export default function AdminAgenda({ showToast, user }) {
    const { go } = useRouter();
    const [dia, setDia] = useState(HOY());
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [editando, setEditando] = useState(null); // tarea nueva o existente
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const r = await fetch(`/api/me/agenda?fecha=${dia}`, { credentials: 'include', cache: 'no-store' });
            if (r.ok) setDatos(await r.json());
        } catch { /* noop */ }
        finally { setCargando(false); }
    }, [dia]);
    useEffect(() => { cargar(); }, [cargar]);

    function moverDia(delta) {
        const d = new Date(dia + 'T12:00:00');
        d.setDate(d.getDate() + delta);
        setDia(iso(d));
    }

    async function guardar(e) {
        e.preventDefault();
        setGuardando(true);
        try {
            const nueva = !editando.id;
            const r = await fetch(nueva ? '/api/me/tareas' : `/api/me/tareas/${editando.id}`, {
                method: nueva ? 'POST' : 'PATCH',
                headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ ...editando, fecha: dia }),
            });
            const d = await r.json();
            if (!r.ok) return alert(d.error || 'No se ha podido guardar.');
            setEditando(null);
            await cargar();
        } catch { alert('Error de conexión.'); }
        finally { setGuardando(false); }
    }

    async function marcar(t) {
        await fetch(`/api/me/tareas/${t.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ hecha: !t.hecha }),
        });
        setDatos(d => ({ ...d, tareas: d.tareas.map(x => x.id === t.id ? { ...x, hecha: !x.hecha } : x) }));
    }

    async function borrar(t) {
        if (!window.confirm(`¿Quitar "${t.titulo}"?`)) return;
        const r = await fetch(`/api/me/tareas/${t.id}`, { method: 'DELETE', credentials: 'include' });
        if (r.ok) { await cargar(); showToast?.('Tarea quitada.'); }
    }

    // Lo que ocupa cada franja: las clases y los eventos son intocables, las
    // tareas con hora se pintan encima de su hueco.
    const ocupado = [
        ...(datos?.clases || []).map(c => ({ ...c, tipo: 'clase', nombre: c.grupo, detalle: [c.actividad, c.aula].filter(Boolean).join(' · ') })),
        ...(datos?.eventos || []).map(e => ({ ...e, tipo: 'evento', nombre: e.titulo, detalle: e.lugar })),
    ].filter(x => x.hora);

    const conHora = (datos?.tareas || []).filter(t => t.hora);
    const sinHora = (datos?.tareas || []).filter(t => !t.hora);

    // Una franja por hora. Dentro de cada una se listan las cosas que empiezan ahí.
    const franjas = [];
    for (let h = DESDE; h < HASTA; h++) {
        const desde = h * 60, hasta = desde + 60;
        const dentro = (x) => enMinutos(x.hora) >= desde && enMinutos(x.hora) < hasta;
        franjas.push({
            hora: comoHora(desde),
            ocupado: ocupado.filter(dentro),
            tareas: conHora.filter(dentro),
        });
    }

    const libres = franjas.filter(f => !f.ocupado.length && !f.tareas.length).length;
    const hechas = (datos?.tareas || []).filter(t => t.hecha).length;

    const abrirEn = (hora) => setEditando({ titulo: '', hora, horaFin: '', notas: '' });

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-icon" onClick={() => moverDia(-1)} aria-label="Día anterior">‹</button>
                <input type="date" value={dia} onChange={e => e.target.value && setDia(e.target.value)}
                    style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' }} />
                <button className="btn btn-icon" onClick={() => moverDia(1)} aria-label="Día siguiente">›</button>
                {dia !== HOY() && <button className="btn btn-sm btn-outline" onClick={() => setDia(HOY())}>Hoy</button>}
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'capitalize' }}>{fechaLarga(dia)}</span>
                <div style={{ flex: 1 }} />
                <button className="btn btn-sm btn-primary" onClick={() => abrirEn('')}><I.Plus /> Nueva tarea</button>
            </div>

            <div className="kpis">
                <KPI label="Clases" valor={String((datos?.clases || []).length)} pie="que das hoy" />
                <KPI label="Tareas" valor={String((datos?.tareas || []).length)} pie={`${hechas} hechas`} />
                <KPI label="Horas libres" valor={String(libres)} pie={`de ${HASTA - DESDE} del día`} />
            </div>

            {cargando && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)', gap: 18, alignItems: 'start' }}>
                {/* El día, hora a hora */}
                <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
                    {franjas.map((f, i) => {
                        const libre = !f.ocupado.length && !f.tareas.length;
                        return (
                            <div key={f.hora} style={{
                                display: 'grid', gridTemplateColumns: '56px 1fr', gap: 12,
                                borderTop: i ? '1px solid var(--line)' : 'none',
                                minHeight: 46, alignItems: 'stretch',
                            }}>
                                <div style={{ padding: '10px 0 10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                                    {f.hora}
                                </div>
                                <div style={{ padding: '6px 12px 6px 0', display: 'grid', gap: 6, alignContent: 'center' }}>
                                    {f.ocupado.map(o => (
                                        <div key={o.id} style={{
                                            background: o.tipo === 'clase'
                                                ? 'color-mix(in oklab, var(--purple) 12%, var(--bg-2))'
                                                : 'color-mix(in oklab, var(--teal) 12%, var(--bg-2))',
                                            borderLeft: `3px solid ${o.tipo === 'clase' ? 'var(--purple)' : 'var(--teal)'}`,
                                            borderRadius: 8, padding: '8px 10px',
                                        }}>
                                            <div style={{ fontWeight: 800, fontSize: 13 }}>{o.nombre}</div>
                                            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                                                {[o.hora && `${o.hora}${o.horaFin ? `–${o.horaFin}` : ''}`, o.detalle].filter(Boolean).join(' · ')}
                                                {o.tipo === 'evento' ? ' · evento' : ''}
                                            </div>
                                        </div>
                                    ))}
                                    {f.tareas.map(t => (
                                        <TareaFila key={t.id} t={t} onMarcar={marcar} onEditar={setEditando} onBorrar={borrar} onIrTicket={(id) => go(`/admin/soporte/${id}`)} />
                                    ))}
                                    {libre && (
                                        <button onClick={() => abrirEn(f.hora)} style={{
                                            textAlign: 'left', border: '1px dashed var(--line-2)', background: 'transparent',
                                            borderRadius: 8, padding: '7px 10px', cursor: 'pointer',
                                            color: 'var(--ink-3)', fontSize: 12, fontFamily: 'inherit',
                                        }}>
                                            + Poner algo a las {f.hora}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Lo que hay que hacer sin hora concreta */}
                <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 18, display: 'grid', gap: 10 }}>
                    <div>
                        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800 }}>Sin hora</h3>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
                            Cosas del día que da igual cuándo.
                        </p>
                    </div>
                    {sinHora.map(t => (
                        <TareaFila key={t.id} t={t} onMarcar={marcar} onEditar={setEditando} onBorrar={borrar} onIrTicket={(id) => go(`/admin/soporte/${id}`)} />
                    ))}
                    {!sinHora.length && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Nada apuntado.</p>}
                    <button className="btn btn-sm btn-outline" onClick={() => abrirEn('')}><I.Plus /> Añadir</button>
                </div>
            </div>

            {editando && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: 20 }}
                    onClick={e => { if (e.target === e.currentTarget) setEditando(null); }}>
                    <form onSubmit={guardar} style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: 460, padding: 24, display: 'grid', gap: 14 }}>
                        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                            {editando.id ? 'Cambiar la tarea' : 'Nueva tarea'}
                        </h3>
                        <div className="field">
                            <label>Qué hay que hacer</label>
                            <input autoFocus value={editando.titulo || ''} required
                                onChange={e => setEditando({ ...editando, titulo: e.target.value })} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="field">
                                <label>A qué hora</label>
                                <input type="time" value={editando.hora || ''}
                                    onChange={e => setEditando({ ...editando, hora: e.target.value })} />
                                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Vacío: sin hora.</span>
                            </div>
                            <div className="field">
                                <label>Hasta</label>
                                <input type="time" value={editando.horaFin || ''}
                                    onChange={e => setEditando({ ...editando, horaFin: e.target.value })} />
                            </div>
                        </div>
                        <div className="field">
                            <label>Ticket de soporte</label>
                            <ElegirTicket
                                valor={editando.ticketId || null}
                                onElegir={(id) => setEditando(e => ({
                                    ...e, ticketId: id,
                                    // Si la tarea no tiene nombre todavía, se le pone el del ticket.
                                    titulo: e.titulo?.trim() ? e.titulo : (id ? `Ticket #${id}` : ''),
                                }))}
                                coger={editando.cogerTicket !== false}
                                onCoger={(v) => setEditando(e => ({ ...e, cogerTicket: v }))}
                                yo={user?.id} />
                        </div>

                        <div className="field">
                            <label>Notas</label>
                            <textarea rows={2} value={editando.notas || ''}
                                onChange={e => setEditando({ ...editando, notas: e.target.value })}
                                style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, padding: 12, background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)', resize: 'vertical' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditando(null)}>Cancelar</button>
                            <button type="submit" className="btn btn-sm btn-primary" disabled={guardando}>
                                {guardando ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}

function TareaFila({ t, onMarcar, onEditar, onBorrar, onIrTicket }) {
    return (
        <div style={{
            display: 'flex', gap: 8, alignItems: 'center',
            background: 'var(--bg-3)', borderLeft: `3px solid ${t.hecha ? 'var(--teal)' : 'var(--orange)'}`,
            borderRadius: 8, padding: '7px 10px',
        }}>
            <input type="checkbox" checked={!!t.hecha} onChange={() => onMarcar(t)}
                style={{ accentColor: 'var(--teal)', cursor: 'pointer', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontWeight: 700, fontSize: 13,
                    textDecoration: t.hecha ? 'line-through' : 'none',
                    color: t.hecha ? 'var(--ink-3)' : 'var(--ink)',
                }}>{t.titulo}</div>
                {(t.hora || t.notas) && (
                    <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                        {[t.hora && `${t.hora}${t.horaFin ? `–${t.horaFin}` : ''}`, t.notas].filter(Boolean).join(' · ')}
                    </div>
                )}
                {t.ticket && (
                    <button type="button" onClick={() => onIrTicket(t.ticket.id)}
                        title={t.ticket.asunto}
                        style={{
                            marginTop: 3, padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
                            border: '1px solid var(--line)', background: 'var(--bg-2)',
                            fontFamily: 'inherit', fontSize: 10, fontWeight: 800, color: 'var(--purple)',
                            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                        #{t.ticket.id} · {t.ticket.asunto}
                    </button>
                )}
            </div>
            <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => onEditar(t)} aria-label="Cambiar"><I.Edit /></button>
            <button className="icon-btn danger" style={{ width: 26, height: 26 }} onClick={() => onBorrar(t)} aria-label="Quitar"><I.Trash /></button>
        </div>
    );
}

function KPI({ label, valor, pie }) {
    return (
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)' }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, lineHeight: 1.1, color: 'var(--ink)' }}>{valor}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{pie}</div>
        </div>
    );
}
