import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// El Resumen del panel (ticket #327): lo primero que se ve al entrar, distinto
// según el rango. Arriba, para todos, «Tu día» (fichaje, tareas, tus tickets) y
// «Para atender» (lo mismo que la campanita, ya filtrado por lo que te toca).
// Debajo, lo de tu puesto:
//  · Instructor: tus clases de hoy, faltas seguidas, cumpleaños, Speaking.
//  · Secretaría: el día del club, lo cobrado, quién está trabajando.
//  · Dirección: ingresos y gastos, alumnos, ocupación de las clases.
//  · Equipo IT: tickets, la semana del equipo y el estado del sistema.
// Cada cosa lleva a su sitio con un clic.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 });
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '');
const fechaCorta = (iso) => new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const tarjeta = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 18px', minWidth: 0 };
const tituloTarjeta = { fontSize: 15, fontWeight: 800, letterSpacing: '-.005em', margin: 0, color: 'var(--ink)' };
const suave = { fontSize: 12, color: 'var(--ink-3)' };
const fila = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: 13, minWidth: 0 };
const enlaceAccion = { background: 'none', border: 0, padding: '2px 0', color: 'var(--purple)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 };

function Tarjeta({ titulo, sub, accion, onAccion, children, style }) {
  return (
    <section style={{ ...tarjeta, ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: sub ? 8 : 6 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={tituloTarjeta}>{titulo}</h2>
          {sub && <div style={{ ...suave, marginTop: 1 }}>{sub}</div>}
        </div>
        {accion && <button type="button" onClick={onAccion} style={enlaceAccion}>{accion} →</button>}
      </div>
      {children}
    </section>
  );
}

// Una cifra grande con lo que significa debajo. Pulsable si lleva a algún sitio.
function Cifra({ etiqueta, valor, detalle, tono, onClick }) {
  const color = { bien: 'var(--teal)', aviso: 'var(--orange)' }[tono];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className="resumen-cifra" style={{
      ...tarjeta, padding: '14px 16px', textAlign: 'left', fontFamily: 'inherit', cursor: onClick ? 'pointer' : 'default',
      display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 2, alignContent: 'start',
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>{etiqueta}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, lineHeight: 1.15, color: 'var(--ink)', letterSpacing: '-.02em' }}>{valor}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color || 'var(--ink-3)', minHeight: 16 }}>{detalle || '\u00a0'}</span>
    </Tag>
  );
}

const Vacio = ({ children }) => <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>{children}</p>;

// Estado con icono y palabra (nunca solo el color).
function Estado({ tipo, children }) {
  const e = { ok: ['✓', 'var(--teal)'], aviso: ['!', '#b45309'], mal: ['✕', '#c62828'], info: ['·', 'var(--ink-3)'] }[tipo] || ['·', 'var(--ink-3)'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: e[1] }}>
      <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900,
        background: `color-mix(in oklab, ${e[1]} 14%, transparent)` }}>{e[0]}</span>
      {children}
    </span>
  );
}

// ── Tu día ──────────────────────────────────────────────────────────────────
// Una sola tarjeta: fichaje, tareas y (si no se ven ya abajo) tus tickets.
function TuDia({ mi, ir, permisos, conTickets }) {
  const f = mi.fichaje;
  const fich = f.estado === 'dentro' ? ['ok', `Trabajando${f.desde ? ` desde las ${hora(f.desde)}` : ''}`]
    : f.estado === 'pausa' ? ['aviso', `En pausa desde las ${hora(f.ultimo)}`]
      : ['info', f.desde ? 'Jornada de hoy cerrada' : 'Sin fichar hoy'];
  const t = mi.tareas;
  const Apartado = ({ titulo, accion, onAccion, children, primero }) => (
    <div style={{ padding: '10px 0', borderTop: primero ? 0 : '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-2)' }}>{titulo}</span>
        {accion && <button type="button" onClick={onAccion} style={enlaceAccion}>{accion} →</button>}
      </div>
      {children}
    </div>
  );
  return (
    <section style={tarjeta}>
      <h2 style={{ ...tituloTarjeta, marginBottom: 2 }}>Tu día</h2>
      {permisos.secciones.fichaje && (
        <Apartado titulo="Fichaje" accion={f.estado === 'fuera' ? 'Fichar' : 'Ver'} onAccion={() => ir('fichaje')} primero>
          <Estado tipo={fich[0]}>{fich[1]}</Estado>
        </Apartado>
      )}
      <Apartado titulo={t.pendientes ? `Tareas de hoy (${t.pendientes})` : 'Tareas de hoy'} accion="Agenda" onAccion={() => ir('agenda')} primero={!permisos.secciones.fichaje}>
        {t.proximas.length ? t.proximas.slice(0, 3).map(x => (
          <div key={x.id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '2px 0', minWidth: 0 }}>
            <span style={{ ...suave, minWidth: 36 }}>{x.hora || '—'}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.titulo}</span>
          </div>
        )) : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t.hechas ? 'Todo hecho por hoy.' : 'Nada apuntado para hoy.'}</span>}
        {t.pendientes > 3 && <div style={suave}>y {t.pendientes - 3} más</div>}
        {t.vencidas > 0 && <div style={{ marginTop: 4 }}><Estado tipo="aviso">{plural(t.vencidas, 'tarea atrasada', 'tareas atrasadas')}</Estado></div>}
      </Apartado>
      {conTickets && permisos.secciones.support && (
        <Apartado titulo="Tus tickets" accion="Soporte" onAccion={() => ir('support')}>
          {mi.ticketsMios ? <Estado tipo="aviso">{plural(mi.ticketsMios, 'abierto asignado a ti', 'abiertos asignados a ti')}</Estado>
            : <Estado tipo="ok">Ninguno pendiente</Estado>}
        </Apartado>
      )}
      {mi.ausencias.length > 0 && (
        <Apartado titulo="Tus próximas ausencias" accion="Ver" onAccion={() => ir('fichaje')}>
          {mi.ausencias.map((a, i) => (
            <div key={i} style={{ fontSize: 13, padding: '1px 0' }}>
              {a.nombre}: {fechaCorta(a.desde)}{a.hasta !== a.desde ? ` – ${fechaCorta(a.hasta)}` : ''}
              {a.estado === 'pendiente' && <span style={{ ...suave, marginLeft: 6 }}>(por aprobar)</span>}
            </div>
          ))}
        </Apartado>
      )}
    </section>
  );
}

// Lo pendiente: lo mismo que la campanita, en una lista. Con muchas cosas se
// enseñan las primeras y el resto con un clic.
function ParaAtender({ avisos, irRuta }) {
  const [todos, setTodos] = useState(false);
  if (avisos === null) return null;
  const lista = todos ? avisos : avisos.slice(0, 6);
  return (
    <Tarjeta titulo="Para atender" sub={avisos.length ? plural(avisos.length, 'cosa pendiente', 'cosas pendientes') : null}>
      {avisos.length === 0 ? <Estado tipo="ok">Todo al día.</Estado> : lista.map((a, i) => (
        <button key={a.clave || i} type="button" onClick={() => irRuta(a.destino)} className="resumen-aviso" style={{
          ...fila, width: '100%', background: 'none', border: 0, borderTop: '1px solid var(--line)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--ink)', alignItems: 'flex-start',
        }}>
          <span style={{ minWidth: 26, height: 22, padding: '0 6px', borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0,
            background: 'color-mix(in oklab, var(--purple) 12%, var(--bg-2))', color: 'var(--purple)' }}>{a.n || '•'}</span>
          <span style={{ minWidth: 0, flex: 1, lineHeight: 1.35 }}>
            <span style={{ display: 'block', fontWeight: 700 }}>{a.texto}</span>
            {a.detalle && <span style={{ ...suave, display: 'block' }}>{a.detalle}</span>}
          </span>
        </button>
      ))}
      {avisos.length > 6 && (
        <button type="button" onClick={() => setTodos(x => !x)} style={{ ...enlaceAccion, marginTop: 6 }}>{todos ? 'Ver menos' : `Ver ${avisos.length - 6} más`}</button>
      )}
    </Tarjeta>
  );
}

// Las clases de hoy, con la lista pasada o no.
function ClasesHoy({ clases, ir, titulo = 'Clases de hoy' }) {
  const [todas, setTodas] = useState(false);
  if (clases === null) return <Tarjeta titulo={titulo}><Vacio>Cargando…</Vacio></Tarjeta>;
  const orden = [...clases].sort((a, b) => String(a.hora || a.horario || '').localeCompare(String(b.hora || b.horario || '')));
  const sin = clases.filter(c => !c.marcados).length;
  return (
    <Tarjeta titulo={titulo} sub={clases.length ? (sin ? `${plural(sin, 'lista', 'listas')} sin pasar` : 'Todas las listas pasadas') : null} accion="Pasar lista" onAccion={() => ir('classes')}>
      {orden.length === 0 ? <Vacio>Hoy no hay clases.</Vacio> : (todas ? orden : orden.slice(0, 8)).map(c => (
        <div key={c.id} style={fila}>
          <span style={{ ...suave, minWidth: 44 }}>{c.hora || (c.horario || '').split(/[–-]/)[0] || '—'}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</b>
            <span style={suave}>{c.activityName}{c.instructor ? ` · ${c.instructor}` : ''} · {plural(c.studentCount, 'alumno', 'alumnos')}</span>
          </span>
          {c.marcados ? <Estado tipo="ok">Pasada</Estado> : <Estado tipo="info">Sin pasar</Estado>}
        </div>
      ))}
      {orden.length > 8 && (
        <button type="button" className="btn btn-sm btn-outline" style={{ marginTop: 8 }} onClick={() => setTodas(t => !t)}>
          {todas ? 'Ver menos' : `Ver las ${orden.length - 8} restantes`}
        </button>
      )}
    </Tarjeta>
  );
}

function Cumples({ lista, titulo = 'Cumpleaños', vacio }) {
  return (
    <Tarjeta titulo={titulo}>
      {lista.length === 0 ? <Vacio>{vacio}</Vacio> : lista.map(c => (
        <div key={`${c.id}`} style={fila}>
          <span aria-hidden="true">🎂</span>
          <span style={{ flex: 1, minWidth: 0 }}>{c.nombre}</span>
          <span style={suave}>{c.enDias === 0 ? `hoy, ${c.edad} años` : c.enDias === 1 ? `mañana, ${c.edad}` : `en ${c.enDias} días, ${c.edad}`}</span>
        </div>
      ))}
    </Tarjeta>
  );
}

function SpeakingHoy({ lista, ir }) {
  if (!lista.length) return null;
  return (
    <Tarjeta titulo="Speaking de hoy" accion="Abrir" onAccion={() => ir('speaking')}>
      {lista.map((s, i) => (
        <div key={i} style={fila}>
          <b style={{ flex: 1, minWidth: 0 }}>{s.grupo}</b>
          <span style={suave}>{s.si} vienen · {s.no} no · {s.sinRespuesta} sin responder</span>
        </div>
      ))}
    </Tarjeta>
  );
}

function Eventos({ lista, ir, titulo = 'Próximos eventos', vacio = 'No hay eventos en los próximos días.' }) {
  return (
    <Tarjeta titulo={titulo} accion="Eventos" onAccion={() => ir('events')}>
      {lista.length === 0 ? <Vacio>{vacio}</Vacio> : lista.map(e => (
        <div key={e.id} style={fila}>
          <span style={{ ...suave, minWidth: 84 }}>{fechaCorta(e.fecha)}</span>
          <span style={{ flex: 1, minWidth: 0 }}><b>{e.titulo}</b>{e.hora ? <span style={suave}> · {e.hora}</span> : null}</span>
        </div>
      ))}
    </Tarjeta>
  );
}

function Personal({ lista, ir }) {
  return (
    <Tarjeta titulo="Trabajando ahora" sub={lista.length ? plural(lista.length, 'persona', 'personas') : null} accion="Fichajes" onAccion={() => ir('fichaje')}>
      {lista.length === 0 ? <Vacio>Nadie ha fichado la entrada ahora mismo.</Vacio> : lista.map(p => (
        <div key={p.id} style={fila}>
          <span style={{ flex: 1, minWidth: 0 }}>{p.nombre}</span>
          {p.estado === 'pausa' ? <Estado tipo="aviso">En pausa</Estado> : <Estado tipo="ok">desde las {hora(p.desde)}</Estado>}
        </div>
      ))}
    </Tarjeta>
  );
}

// ── Gráfico de ingresos y gastos por mes ────────────────────────────────────
// Columnas agrupadas: dos series con leyenda, etiqueta solo en el mes en curso,
// detalle al pasar el ratón y, para quien lo prefiera, la tabla.
function GraficoMeses({ meses }) {
  const [sobre, setSobre] = useState(null);
  const [tabla, setTabla] = useState(false);
  const max = Math.max(1, ...meses.flatMap(m => [m.ingresos, m.gastos]));
  const nombreMes = (m) => MESES[Number(m.slice(5, 7)) - 1];
  const ALTO = 150;
  return (
    <div className="resumen-graf">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 10, fontSize: 12, color: 'var(--ink-2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--serie-ing)' }} />Ingresos</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--serie-gas)' }} />Gastos</span>
        <button type="button" onClick={() => setTabla(t => !t)} style={{ marginLeft: 'auto', background: 'none', border: 0, color: 'var(--purple)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          {tabla ? 'Ver gráfico' : 'Ver en tabla'}
        </button>
      </div>
      {tabla ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ color: 'var(--ink-3)', textAlign: 'right' }}><th style={{ textAlign: 'left', fontWeight: 700, padding: 4 }}>Mes</th><th style={{ padding: 4 }}>Ingresos</th><th style={{ padding: 4 }}>Gastos</th><th style={{ padding: 4 }}>Diferencia</th></tr></thead>
          <tbody>{meses.map(m => (
            <tr key={m.mes} style={{ borderTop: '1px solid var(--line)', textAlign: 'right' }}>
              <td style={{ textAlign: 'left', padding: 4 }}>{nombreMes(m.mes)} {m.mes.slice(0, 4)}</td>
              <td style={{ padding: 4 }}>{eur(m.ingresos)}</td><td style={{ padding: 4 }}>{eur(m.gastos)}</td>
              <td style={{ padding: 4, fontWeight: 700 }}>{eur(m.ingresos - m.gastos)}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${meses.length}, 1fr)`, alignItems: 'end', height: ALTO, borderBottom: '1px solid var(--line)' }}>
            {meses.map((m, i) => {
              const ultimo = i === meses.length - 1;
              return (
                <div key={m.mes} onMouseEnter={() => setSobre(i)} onMouseLeave={() => setSobre(null)} onFocus={() => setSobre(i)} onBlur={() => setSobre(null)} tabIndex={0}
                  aria-label={`${nombreMes(m.mes)}: ingresos ${eur(m.ingresos)}, gastos ${eur(m.gastos)}`}
                  style={{ height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, position: 'relative', outline: 'none',
                    background: sobre === i ? 'color-mix(in oklab, var(--ink) 4%, transparent)' : 'transparent', borderRadius: 6 }}>
                  {ultimo && m.ingresos > 0 && (
                    <span style={{ position: 'absolute', top: Math.max(0, ALTO - (m.ingresos / max) * (ALTO - 18) - 18), fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{eur(m.ingresos)}</span>
                  )}
                  {['ingresos', 'gastos'].map(k => (
                    <span key={k} style={{ width: 'min(22px, 32%)', height: `${(m[k] / max) * (ALTO - 18)}px`, minHeight: m[k] > 0 ? 2 : 0,
                      background: k === 'ingresos' ? 'var(--serie-ing)' : 'var(--serie-gas)', borderRadius: '4px 4px 0 0' }} />
                  ))}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${meses.length}, 1fr)`, marginTop: 6 }}>
            {meses.map(m => <span key={m.mes} style={{ ...suave, textAlign: 'center' }}>{nombreMes(m.mes)}</span>)}
          </div>
          {sobre !== null && (
            <div role="status" style={{ position: 'absolute', top: -6, left: `${((sobre + 0.5) / meses.length) * 100}%`, transform: `translateX(${sobre > meses.length / 2 ? '-100%' : '0'})`,
              background: 'var(--ink)', color: 'var(--bg)', borderRadius: 10, padding: '8px 10px', fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: 'var(--shadow)', zIndex: 2 }}>
              <b>{nombreMes(meses[sobre].mes)} {meses[sobre].mes.slice(0, 4)}</b><br />
              Ingresos: {eur(meses[sobre].ingresos)}<br />Gastos: {eur(meses[sobre].gastos)}<br />
              Diferencia: <b>{eur(meses[sobre].ingresos - meses[sobre].gastos)}</b>
            </div>
          )}
        </div>
      )}
      <style>{`.resumen-graf{--serie-ing:#5233A8;--serie-gas:#C2692A}html[data-theme="dark"] .resumen-graf{--serie-ing:#8F75E0;--serie-gas:#C97C3E}`}</style>
    </div>
  );
}

// ── Cada vista ──────────────────────────────────────────────────────────────
const rejilla = (min = 300) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap: 14, alignItems: 'start' });
const cifras = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: 12 };

function VistaInstructor({ parte, d, clases, ir }) {
  const sin = clases ? clases.filter(c => !c.marcados).length : null;
  const k = (
      <div style={cifras}>
        <Cifra etiqueta="Clases hoy" valor={clases ? clases.length : '…'} detalle={clases && clases.length ? (sin ? `${plural(sin, 'lista', 'listas')} por pasar` : 'listas al día') : null} tono={sin ? 'aviso' : 'bien'} onClick={() => ir('classes')} />
        <Cifra etiqueta="Tus alumnos" valor={d.alumnos} detalle={plural(d.grupos, 'grupo', 'grupos')} onClick={() => ir('groups')} />
        <Cifra etiqueta="Faltas seguidas" valor={d.faltas.length} detalle={d.faltas.length ? '3 o más clases sin venir' : 'nadie falta seguido'} tono={d.faltas.length ? 'aviso' : 'bien'} />
        <Cifra etiqueta="Cumpleaños" valor={d.cumples.filter(c => c.enDias === 0).length} detalle={`hoy · ${d.cumples.length} esta semana`} />
      </div>
  );
  const c = (
      <div style={rejilla()}>
        <ClasesHoy clases={clases} ir={ir} titulo="Tus clases de hoy" />
        <Tarjeta titulo="Alumnos que faltan seguido" sub="En tus grupos, 3 o más clases seguidas sin venir">
          {d.faltas.length === 0 ? <Vacio>Nadie. ¡Bien!</Vacio> : d.faltas.map(f => (
            <div key={`${f.id}-${f.clase}`} style={fila}>
              <span style={{ flex: 1, minWidth: 0 }}><b>{f.alumno}</b><span style={suave}> · {f.clase}</span></span>
              <Estado tipo="aviso">{f.racha} seguidas</Estado>
            </div>
          ))}
        </Tarjeta>
        <Cumples lista={d.cumples} titulo="Cumpleaños de tus alumnos" vacio="Nadie cumple años esta semana." />
        <SpeakingHoy lista={d.speaking} ir={ir} />
        <Eventos lista={d.eventos} ir={ir} titulo="Tus próximos eventos" vacio="No tienes eventos en el próximo mes." />
        {d.eventosPedidos.length > 0 && (
          <Tarjeta titulo="Eventos que has propuesto" sub="Esperando respuesta del club">
            {d.eventosPedidos.map((e, i) => <div key={i} style={fila}>{e.titulo}{e.fecha ? <span style={suave}> · {fechaCorta(e.fecha)}</span> : null}</div>)}
          </Tarjeta>
        )}
      </div>
  );
  return parte === 'cifras' ? k : c;
}

function VistaSecretaria({ parte, d, clases, ir }) {
  const sin = clases ? clases.filter(c => !c.marcados).length : null;
  const k = (
      <div style={cifras}>
        <Cifra etiqueta="Cobrado hoy" valor={eur(d.cobradoHoy.total)} detalle={plural(d.cobradoHoy.recibos, 'recibo', 'recibos')} onClick={() => ir('billing')} />
        <Cifra etiqueta="Por cobrar" valor={eur(d.porCobrar.total)} detalle={plural(d.porCobrar.familias, 'familia', 'familias')} tono={d.porCobrar.total > 0 ? 'aviso' : 'bien'} onClick={() => ir('billing')} />
        <Cifra etiqueta="Clases hoy" valor={clases ? clases.length : '…'} detalle={clases && clases.length ? (sin ? `${plural(sin, 'lista', 'listas')} sin pasar` : 'todas las listas pasadas') : null} tono={sin ? 'aviso' : 'bien'} onClick={() => ir('classes')} />
        {d.campamentoHoy > 0
          ? <Cifra etiqueta="Campamento hoy" valor={d.campamentoHoy} detalle="niños apuntados" onClick={() => ir('camp')} />
          : <Cifra etiqueta="Trabajando ahora" valor={d.personal.length} detalle="del equipo" onClick={() => ir('fichaje')} />}
      </div>
  );
  const c = (
      <div style={rejilla()}>
        <ClasesHoy clases={clases} ir={ir} />
        <Tarjeta titulo="La caja de hoy" accion={d.cajaCerrada ? 'Ver' : 'Cerrar la caja'} onAccion={() => ir('billing')}>
          {d.cobradoHoy.porMedio.length === 0 ? <Vacio>Todavía no se ha cobrado nada hoy.</Vacio> : d.cobradoHoy.porMedio.map(m => (
            <div key={m.medio} style={fila}><span style={{ flex: 1 }}>{m.medio}</span><b>{eur(m.total)}</b></div>
          ))}
          <div style={{ marginTop: 8 }}>{d.cajaCerrada ? <Estado tipo="ok">Caja cerrada a las {hora(d.cajaCerrada)}</Estado> : <Estado tipo="info">Caja de hoy aún abierta</Estado>}</div>
        </Tarjeta>
        <Personal lista={d.personal} ir={ir} />
        <Cumples lista={d.cumples} titulo="Cumpleaños de hoy" vacio="Hoy no cumple años nadie." />
        <SpeakingHoy lista={d.speaking} ir={ir} />
        <Eventos lista={d.eventos} ir={ir} titulo="Esta semana" vacio="No hay eventos en los próximos 7 días." />
      </div>
  );
  return parte === 'cifras' ? k : c;
}

function VistaDireccion({ parte, d, ir }) {
  const ing = d.ingresos;
  const cambio = ing.pasadoIgual > 0 ? Math.round(((ing.mes - ing.pasadoIgual) / ing.pasadoIgual) * 100) : null;
  const resultado = ing.mes - d.gastosMes;
  const k = (
      <div style={cifras}>
        <Cifra etiqueta="Ingresos del mes" valor={eur(ing.mes)} onClick={() => ir('billing')}
          detalle={cambio === null ? `el mes pasado: ${eur(ing.pasado)}` : `${cambio >= 0 ? '▲' : '▼'} ${Math.abs(cambio)} % que el mes pasado a estas alturas`} tono={cambio === null ? null : cambio >= 0 ? 'bien' : 'aviso'} />
        <Cifra etiqueta="Gastos del mes" valor={eur(d.gastosMes)} detalle="apuntados hasta hoy" onClick={() => ir('payments')} />
        <Cifra etiqueta="Diferencia" valor={eur(resultado)} detalle={resultado >= 0 ? 'ingresos menos gastos' : 'se ha gastado más de lo ingresado'} tono={resultado >= 0 ? 'bien' : 'aviso'} />
        <Cifra etiqueta="Alumnos activos" valor={d.alumnos.activos} detalle={`${plural(d.alumnos.altas, 'alta', 'altas')} y ${plural(d.alumnos.bajas, 'baja', 'bajas')} este mes`} onClick={() => ir('students')} />
      </div>
  );
  const c = (
      <div style={rejilla(340)}>
        <Tarjeta titulo="Ingresos y gastos" sub="Los últimos seis meses (el actual, hasta hoy)">
          <GraficoMeses meses={d.meses} />
        </Tarjeta>
        <Tarjeta titulo="Ocupación de las clases" sub={d.ocupacion.pct !== null ? `${d.ocupacion.ocupadas} de ${d.ocupacion.plazas} plazas ocupadas (${d.ocupacion.pct} %) · ${plural(d.ocupacion.espera, 'persona', 'personas')} en lista de espera` : 'Las clases no tienen plazas máximas puestas'} accion="Clases" onAccion={() => ir('classes')}>
          {d.ocupacion.pct !== null && (
            <div style={{ height: 8, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden', margin: '4px 0 10px' }} aria-hidden="true">
              <div style={{ height: '100%', width: `${d.ocupacion.pct}%`, background: 'var(--purple)', borderRadius: 99 }} />
            </div>
          )}
          {d.ocupacion.llenas.length > 0 && <div style={{ ...suave, fontWeight: 700, marginTop: 6 }}>Llenas</div>}
          {d.ocupacion.llenas.map(g => (
            <div key={g.nombre} style={fila}><span style={{ flex: 1, minWidth: 0 }}>{g.nombre}<span style={suave}> · {g.actividad}</span></span>
              <span style={suave}>{g.n}/{g.max}{g.espera ? ` · ${g.espera} esperando` : ''}</span></div>
          ))}
          {d.ocupacion.flojas.length > 0 && <div style={{ ...suave, fontWeight: 700, marginTop: 10 }}>Con muchas plazas libres</div>}
          {d.ocupacion.flojas.map(g => (
            <div key={g.nombre} style={fila}><span style={{ flex: 1, minWidth: 0 }}>{g.nombre}<span style={suave}> · {g.actividad}</span></span><span style={suave}>{g.n}/{g.max}</span></div>
          ))}
        </Tarjeta>
        <Tarjeta titulo="Por cobrar" accion="Cobrar" onAccion={() => ir('billing')}>
          {d.porCobrar.total > 0
            ? <p style={{ margin: 0, fontSize: 14 }}><b style={{ fontSize: 22 }}>{eur(d.porCobrar.total)}</b><br /><span style={suave}>{plural(d.porCobrar.cargos, 'cargo pendiente', 'cargos pendientes')} de {plural(d.porCobrar.familias, 'familia', 'familias')}</span></p>
            : <Estado tipo="ok">No hay nada pendiente de cobrar.</Estado>}
        </Tarjeta>
        <Personal lista={d.personal} ir={ir} />
      </div>
  );
  return parte === 'cifras' ? k : c;
}

function VistaIT({ parte, d, irRuta, ir }) {
  const t = d.tickets, s = d.sistema;
  const dias = useMemo(() => {
    const m = new Map();
    for (const b of d.semana.bloques) { if (!m.has(b.fecha)) m.set(b.fecha, []); m.get(b.fecha).push(b); }
    return [...m.entries()];
  }, [d.semana.bloques]);
  const prio = { high: ['mal', 'Alta'], medium: ['aviso', 'Media'], low: ['info', 'Baja'] };
  const Ticket = ({ x }) => (
    <button type="button" onClick={() => irRuta(`/admin/soporte/${x.id}`)} style={{ ...fila, width: '100%', background: 'none', border: 0, borderTop: '1px solid var(--line)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', textAlign: 'left' }}>
      <span style={{ ...suave, minWidth: 40 }}>#{x.id}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{x.asunto}</span>
      {x.vence && new Date(x.vence) < new Date() && <Estado tipo="mal">Vencido</Estado>}
      <Estado tipo={(prio[x.prioridad] || prio.low)[0]}>{(prio[x.prioridad] || prio.low)[1]}</Estado>
    </button>
  );
  const imap = s.imap.error ? ['mal', `Falla: ${s.imap.error}`] : s.imap.revisado ? ['ok', `Revisado a las ${hora(s.imap.revisado)}`] : ['aviso', 'Aún no se ha leído el buzón (¿IMAP activado? ticket #328)'];
  const vf = s.verifactu.modo !== 'verifactu' ? ['info', 'Apagado'] : s.verifactu.errores ? ['mal', `${s.verifactu.errores} con error`] : s.verifactu.pendientes ? ['aviso', `${s.verifactu.pendientes} por enviar`] : ['ok', `Al día (${s.verifactu.entorno})`];
  const bd = s.baseDatos;
  const sistema = [
    ['Correo de la app', s.correo ? ['ok', 'Configurado'] : ['mal', 'Sin configurar: no sale ningún correo']],
    ['Lectura de rebotes (IMAP)', imap],
    ['Correos que rebotan', s.rebotes ? ['aviso', plural(s.rebotes, 'dirección apartada', 'direcciones apartadas')] : ['ok', 'Ninguno']],
    ['Campañas enviándose', s.colaCampanas ? ['info', `${s.colaCampanas} correos en cola`] : ['ok', 'Nada en cola']],
    ['Verifactu (AEAT)', vf],
    ['Pagos online (Redsys)', s.pagosOnline ? ['ok', 'Abiertos'] : ['info', 'En «Próximamente»']],
    ['Pagos online por revisar', s.tpvRevisar ? ['aviso', plural(s.tpvRevisar, 'pago', 'pagos')] : ['ok', 'Ninguno']],
    ['Base de datos', bd.esperando ? ['aviso', `${bd.esperando} esperando conexión (${bd.abiertas}/${bd.max} en uso)`] : ['ok', `${bd.abiertas} de ${bd.max} conexiones abiertas`]],
    ['Servidor', ['info', `En marcha desde el ${fechaCorta(s.servidor.arrancado)} a las ${hora(s.servidor.arrancado)} · ${s.servidor.memoriaMb} MB · Node ${s.servidor.node}`]],
    ...(s.servidor.version || s.servidor.commit ? [['Versión publicada', ['info', [s.servidor.version, s.servidor.commit].filter(Boolean).join(' · ')]]] : []),
  ];
  const k = (
      <div style={cifras}>
        <Cifra etiqueta="Tickets abiertos" valor={t.abiertos} detalle={`${t.resueltos_semana} resueltos esta semana`} onClick={() => ir('support')} />
        <Cifra etiqueta="Asignados a ti" valor={t.mios} detalle={t.mios ? 'abiertos' : 'ninguno'} onClick={() => ir('support')} />
        <Cifra etiqueta="Sin asignar" valor={t.sin_asignar} tono={t.sin_asignar ? 'aviso' : 'bien'} detalle={t.sin_asignar ? 'hay que repartirlos' : 'todos tienen dueño'} onClick={() => ir('support')} />
        <Cifra etiqueta="Vencidos" valor={t.vencidos} tono={t.vencidos ? 'aviso' : null} detalle={t.vencidos ? 'se ha pasado su fecha' : `ninguno · ${t.urgentes} de prioridad alta`} onClick={() => ir('support')} />
      </div>
  );
  const c = (
      <div style={rejilla(340)}>
        <Tarjeta titulo="Tus tickets" sub="Los urgentes y los que vencen antes, primero" accion="Todos" onAccion={() => ir('support')}>
          {t.miosLista.length === 0 ? <Vacio>No tienes tickets abiertos.</Vacio> : t.miosLista.map(x => <Ticket key={x.id} x={x} />)}
          {t.mios > t.miosLista.length && <div style={{ ...suave, marginTop: 6 }}>y {t.mios - t.miosLista.length} más en Soporte</div>}
        </Tarjeta>
        <Tarjeta titulo="Estado del sistema">
          {sistema.map(([k, [tipo, txt]]) => (
            <div key={k} style={{ ...fila, justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 600, flexShrink: 0 }}>{k}</span>
              <span style={{ minWidth: 0, textAlign: 'right' }}><Estado tipo={tipo}>{txt}</Estado></span>
            </div>
          ))}
        </Tarjeta>
        {t.sinAsignarLista.length > 0 && (
          <Tarjeta titulo="Sin asignar" sub="Los más urgentes y antiguos">
            {t.sinAsignarLista.map(x => <Ticket key={x.id} x={x} />)}
          </Tarjeta>
        )}
        <Tarjeta titulo="La semana del equipo" sub={`Desde el lunes ${fechaCorta(d.semana.lunes)}`} accion="Planificar" onAccion={() => ir('equipo_it')}>
          {dias.length === 0 ? <Vacio>No hay nada planificado esta semana.</Vacio> : dias.map(([dia, bloques]) => (
            <div key={dia} style={{ ...fila, alignItems: 'flex-start' }}>
              <span style={{ ...suave, minWidth: 84, fontWeight: 700 }}>{fechaCorta(dia)}</span>
              <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
                {bloques.map((b, i) => <span key={i} style={{ fontWeight: b.mio ? 700 : 400 }}>{b.inicio}–{b.fin} · {b.nombre}{b.nota ? <span style={suave}> · {b.nota}</span> : null}</span>)}
              </span>
            </div>
          ))}
        </Tarjeta>
      </div>
  );
  return parte === 'cifras' ? k : c;
}

// ── La página ───────────────────────────────────────────────────────────────
export default function AdminResumen({ permisos, ir, irRuta, refreshTrigger }) {
  const [vista, setVista] = useState(() => { try { return localStorage.getItem('aim_resumen_vista') || ''; } catch { return ''; } });
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [avisos, setAvisos] = useState(null);
  const [clases, setClases] = useState(null);

  const cargar = useCallback(() => {
    setError(null);
    fetch(`/api/admin/resumen${vista ? `?vista=${vista}` : ''}`, { credentials: 'include', cache: 'no-store' })
      .then(async r => { const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'No se ha podido cargar el resumen.'); return x; })
      .then(setD).catch(e => setError(e.message));
    fetch('/api/admin/notificaciones', { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { avisos: [] })).then(x => setAvisos(x.avisos || [])).catch(() => setAvisos([]));
  }, [vista]);
  useEffect(() => { cargar(); }, [cargar, refreshTrigger]);
  // Cada cinco minutos, por si se queda abierto en recepción.
  useEffect(() => { const t = setInterval(cargar, 5 * 60_000); return () => clearInterval(t); }, [cargar]);

  const conClases = d && (d.vista === 'instructor' || d.vista === 'secretaria');
  useEffect(() => {
    if (!conClases) return;
    setClases(null);
    fetch(`/api/admin/tul/attendance/dia/${d.hoy}`, { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { clases: [] })).then(x => setClases(x.clases || [])).catch(() => setClases([]));
  }, [conClases, d?.hoy, d?.vista, refreshTrigger]);

  const elegirVista = (v) => { setVista(v); try { localStorage.setItem('aim_resumen_vista', v); } catch { /* sin almacenamiento */ } };

  if (error) return <div style={tarjeta}><p style={{ margin: 0 }}>{error}</p><button type="button" className="btn btn-sm btn-outline" style={{ marginTop: 10 }} onClick={cargar}>Reintentar</button></div>;
  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Cargando el resumen…</p>;

  const h = Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }));
  const saludo = h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  const f = new Date(d.hoy + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const fecha = f.charAt(0).toUpperCase() + f.slice(1);
  // En la vista de IT los tickets ya están abajo: no se repiten en «Tu día» ni
  // en «Para atender» (sí los mensajes nuevos de cada ticket).
  const esIT = d.vista === 'it';
  const pendientes = avisos && (esIT ? avisos.filter(a => !(a.tipo === 'tickets' && a.destino === '/admin/soporte' && !a.clave)) : avisos);
  const Vista = { instructor: VistaInstructor, secretaria: VistaSecretaria, direccion: VistaDireccion, it: VistaIT }[d.vista] || null;
  const props = { d: d.datos, clases, ir, irRuta };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, color: 'var(--ink-2)' }}>
          <b style={{ color: 'var(--ink)' }}>{saludo}{d.nombre ? `, ${d.nombre}` : ''}.</b> <span style={{ color: 'var(--ink-3)' }}>{fecha}</span>
        </div>
        {d.vistas.length > 1 && (
          <div role="tablist" aria-label="Qué resumen ver" style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden', background: 'var(--bg-2)', padding: 3, gap: 2 }}>
            {d.vistas.map(v => (
              <button key={v.id} type="button" role="tab" aria-selected={d.vista === v.id} onClick={() => elegirVista(v.id)} style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', border: 0, borderRadius: 999,
                background: d.vista === v.id ? 'var(--ink)' : 'transparent', color: d.vista === v.id ? 'var(--bg-2)' : 'var(--ink-2)',
              }}>{v.nombre}</button>
            ))}
          </div>
        )}
      </div>

      {Vista && <Vista parte="cifras" {...props} />}

      <div className={`resumen-cuerpo${Vista ? '' : ' solo-lado'}`}>
        <aside className="resumen-lado">
          <TuDia mi={d.mi} ir={ir} permisos={permisos} conTickets={!esIT} />
          <ParaAtender avisos={pendientes} irRuta={irRuta} />
        </aside>
        {Vista && <div className="resumen-principal"><Vista parte="cuerpo" {...props} /></div>}
      </div>
      <style>{`
        .resumen-cuerpo{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start}
        .resumen-cuerpo .resumen-lado{grid-column:2;grid-row:1;display:grid;gap:16px;position:sticky;top:16px}
        .resumen-cuerpo .resumen-principal{grid-column:1;grid-row:1;min-width:0}
        .resumen-principal > div{display:block!important;columns:2 300px;column-gap:14px}
        .resumen-principal > div > *{break-inside:avoid;margin:0 0 14px;width:100%;box-sizing:border-box}
        .resumen-cuerpo.solo-lado{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
        .resumen-cuerpo.solo-lado .resumen-lado{grid-column:1 / -1;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));position:static}
        .resumen-cifra{transition:border-color var(--tx-fast) ease, transform var(--tx-fast) ease}
        button.resumen-cifra:hover{border-color:color-mix(in oklab, var(--purple) 45%, var(--line));transform:translateY(-1px)}
        .resumen-aviso:hover{background:color-mix(in oklab, var(--purple) 5%, transparent)!important}
        @media (max-width: 1100px){
          .resumen-cuerpo{grid-template-columns:minmax(0,1fr)}
          .resumen-cuerpo .resumen-lado{grid-column:1;grid-row:1;position:static;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))}
          .resumen-cuerpo .resumen-principal{grid-column:1;grid-row:2}
        }
      `}</style>
    </div>
  );
}
