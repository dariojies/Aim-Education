import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';
import { ACT_BY_ID } from './Shared.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// El Resumen del panel (ticket #327): lo primero que se ve al entrar, distinto
// según el rango, y pensado para verse entero sin bajar:
//   1. Una línea con tu día (fichaje, tareas, tus tickets).
//   2. «Para atender»: lo de la campanita, en una fila de avisos pulsables.
//   3. Cuatro cifras.
//   4. Tres columnas con lo de tu puesto, cada una con pocas filas y «Ver todo».
// La dirección y el Equipo IT pueden ver todas las vistas, también la de un
// instructor o un trabajador concreto, tal cual la ve esa persona.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 });
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '');
const fechaCorta = (iso) => new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const suave = { fontSize: 12, color: 'var(--ink-3)' };
const enlace = { background: 'none', border: 0, padding: 0, color: 'var(--purple)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const recorte = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 };

// Estado: la pastilla de siempre del panel (palabra y color, nunca solo color).
function Estado({ tipo, children }) {
  const clase = { ok: 'ok', aviso: 'pending', mal: 'pending', info: 'upcoming' }[tipo] || 'upcoming';
  return <span className={`status-pill ${clase}`} style={{ maxWidth: '100%', ...recorte }}>{tipo === 'mal' ? '✕ ' : tipo === 'ok' ? '✓ ' : ''}{children}</span>;
}

// Una tarjeta con su título y el botón a su sitio (el estilo de siempre del panel).
function Bloque({ titulo, sub, accion, onAccion, children }) {
  return (
    <section className="res-bloque">
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 800, letterSpacing: '-.015em', margin: 0 }}>{titulo}</h2>
          {sub && <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '3px 0 0' }}>{sub}</p>}
        </div>
        {accion && <button type="button" className="btn btn-sm btn-outline" onClick={onAccion} style={{ flexShrink: 0 }}>{accion}</button>}
      </header>
      {children}
    </section>
  );
}
// Una fila como las de «Últimos gastos»: fondo suave, nombre y detalle.
function Fila({ izq, centro, der, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className="payment-row res-fila"
      style={{ gridTemplateColumns: izq !== undefined ? 'auto minmax(0,1fr) auto' : 'minmax(0,1fr) auto', ...(onClick ? { cursor: 'pointer' } : {}) }}>
      {izq !== undefined && <span className="date" style={{ minWidth: 38 }}>{izq}</span>}
      <span className="name" style={recorte}>{centro}</span>
      {der !== undefined ? <span style={{ flexShrink: 0 }}>{der}</span> : <span />}
    </Tag>
  );
}
// Como mucho `max` filas; el resto, con un enlace a su sitio.
function Lista({ items, max = 5, vacio, render, onMas }) {
  if (!items.length) return <div style={{ padding: '22px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>{vacio}</div>;
  return (
    <div>
      {items.slice(0, max).map(render)}
      {items.length > max && <button type="button" onClick={onMas} style={{ ...enlace, marginTop: 10 }}>y {items.length - max} más →</button>}
    </div>
  );
}

// Una cifra como las de siempre: tarjeta con su icono y su color en la esquina
// y el detalle en una pastilla.
const COLORES_CIFRA = ['taekwondo', 'ballet', 'funcional', 'pintura'];
function Cifra({ etiqueta, valor, detalle, tono, onClick, act = 'taekwondo', icono }) {
  const a = ACT_BY_ID[act];
  const color = tono === 'aviso' ? 'var(--orange)' : (a?.color || 'var(--ink)');
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`stat-card ${a?.className || ''}`}
      style={{ textAlign: 'left', fontFamily: 'inherit', cursor: onClick ? 'pointer' : 'default', width: '100%' }}>
      <div className="corner" style={{ color: a?.color }}>{icono}</div>
      <div className="l">{etiqueta}</div>
      <div className="v">{valor}</div>
      <div className="trend" style={{ background: `color-mix(in oklab, ${color} 14%, var(--bg-2))`, color }}>{detalle || '\u00a0'}</div>
    </Tag>
  );
}

// ── Arriba: tu día y lo que hay que atender ─────────────────────────────────
function TuDia({ mi, ir, permisos, conTickets, como }) {
  const f = mi.fichaje, t = mi.tareas;
  const fich = f.estado === 'dentro' ? ['ok', `Trabajando${f.desde ? ` desde las ${hora(f.desde)}` : ''}`]
    : f.estado === 'pausa' ? ['upcoming', `En pausa desde las ${hora(f.ultimo)}`]
      : ['upcoming', f.desde ? 'Jornada de hoy cerrada' : 'Sin fichar hoy'];
  const Pill = ({ tipo, children, onClick }) => (
    <button type="button" onClick={como ? undefined : onClick} className={`status-pill ${tipo}`}
      style={{ border: 0, cursor: como ? 'default' : 'pointer', fontFamily: 'inherit' }}>{children}</button>
  );
  const a = mi.ausencias[0];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-2)', marginRight: 2 }}>{como ? `El día de ${como.nombre.split(' ')[0]}:` : 'Tu día:'}</span>
      {permisos.secciones.fichaje && <Pill tipo={fich[0]} onClick={() => ir('fichaje')}>{fich[1]}</Pill>}
      <Pill tipo={t.vencidas ? 'pending' : t.pendientes ? 'upcoming' : 'ok'} onClick={() => ir('agenda')}>
        {t.pendientes ? plural(t.pendientes, 'tarea hoy', 'tareas hoy') : t.hechas ? 'Tareas de hoy hechas' : 'Sin tareas hoy'}
        {t.vencidas ? ` · ${plural(t.vencidas, 'atrasada', 'atrasadas')}` : ''}
      </Pill>
      {conTickets && permisos.secciones.support && (
        <Pill tipo={mi.ticketsMios ? 'pending' : 'ok'} onClick={() => ir('support')}>
          {mi.ticketsMios ? `${plural(mi.ticketsMios, 'ticket abierto', 'tickets abiertos')} ${como ? (mi.ticketsMios === 1 ? 'suyo' : 'suyos') : (mi.ticketsMios === 1 ? 'tuyo' : 'tuyos')}` : 'Ningún ticket pendiente'}
        </Pill>
      )}
      {a && <Pill tipo="upcoming" onClick={() => ir('fichaje')}>{a.nombre}: {fechaCorta(a.desde)}{a.hasta !== a.desde ? ` – ${fechaCorta(a.hasta)}` : ''}{a.estado === 'pendiente' ? ' (por aprobar)' : ''}</Pill>}
    </div>
  );
}

// Lo pendiente (lo de la campanita), como tarjeta con sus filas.
function ParaAtender({ avisos, irRuta, como }) {
  const [todos, setTodos] = useState(false);
  if (como) {
    return (
      <Bloque titulo="Para atender" sub={`Los avisos de ${como.nombre.split(' ')[0]} dependen de su rango`}>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>Están en Club → Rangos y permisos.</p>
      </Bloque>
    );
  }
  if (avisos === null) return <Bloque titulo="Para atender"><p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cargando…</p></Bloque>;
  const lista = todos ? avisos : avisos.slice(0, 5);
  return (
    <Bloque titulo="Para atender" sub={avisos.length ? plural(avisos.length, 'cosa pendiente', 'cosas pendientes') : null}>
      {avisos.length === 0 ? <div style={{ padding: '22px 0', textAlign: 'center' }}><span className="status-pill ok">Todo al día</span></div> : lista.map((x, i) => (
        <button key={x.clave || i} type="button" onClick={() => irRuta(x.destino)} className="payment-row res-fila"
          style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto', cursor: 'pointer' }} title={x.detalle || ''}>
          <span className="res-aviso-n">{x.n || '•'}</span>
          <span style={{ minWidth: 0 }}>
            <span className="name" style={{ ...recorte, display: 'block' }}>{x.n ? x.texto.replace(/^\d+\s/, '') : x.texto}</span>
            {x.detalle && <span className="date" style={{ ...recorte, display: 'block' }}>{x.detalle}</span>}
          </span>
          <I.Arrow style={{ color: 'var(--ink-3)' }} />
        </button>
      ))}
      {avisos.length > 5 && <button type="button" onClick={() => setTodos(v => !v)} style={{ ...enlace, marginTop: 10 }}>{todos ? 'Ver menos' : `Ver ${avisos.length - 5} más`}</button>}
    </Bloque>
  );
}

// ── Piezas de las vistas ────────────────────────────────────────────────────
function ClasesHoy({ clases, ir, titulo = 'Clases de hoy', max = 7 }) {
  if (clases === null) return <Bloque titulo={titulo}><p style={suave}>Cargando…</p></Bloque>;
  const orden = [...clases].sort((a, b) => String(a.hora || a.horario || '').localeCompare(String(b.hora || b.horario || '')));
  const sin = clases.filter(c => !c.marcados).length;
  return (
    <Bloque titulo={titulo} sub={clases.length ? (sin ? `${plural(sin, 'lista', 'listas')} sin pasar de ${clases.length}` : 'Todas las listas pasadas') : null} accion="Pasar lista" onAccion={() => ir('classes')}>
      <Lista items={orden} max={max} vacio="Hoy no hay clases." onMas={() => ir('classes')} render={c => (
        <Fila key={c.id} izq={c.hora || (c.horario || '').split(/[–-]/)[0] || '—'}
          centro={<><b>{c.name}</b><span style={suave}> · {c.studentCount} al.{c.instructor ? ` · ${c.instructor.split(' ')[0]}` : ''}</span></>}
          der={c.marcados ? <Estado tipo="ok">Pasada</Estado> : <Estado tipo="info">Sin pasar</Estado>} />
      )} />
    </Bloque>
  );
}
const Cumples = ({ lista, titulo, vacio }) => (
  <Bloque titulo={titulo}>
    <Lista items={lista} max={4} vacio={vacio} render={c => (
      <Fila key={c.id} izq="🎂" centro={c.nombre} der={<span style={suave}>{c.enDias === 0 ? `hoy, ${c.edad}` : c.enDias === 1 ? `mañana, ${c.edad}` : `en ${c.enDias} días`}</span>} />
    )} />
  </Bloque>
);
const Eventos = ({ lista, ir, titulo, vacio }) => (
  <Bloque titulo={titulo} accion="Eventos" onAccion={() => ir('events')}>
    <Lista items={lista} max={3} vacio={vacio} onMas={() => ir('events')} render={e => (
      <Fila key={e.id} izq={fechaCorta(e.fecha)} centro={<b>{e.titulo}</b>} der={e.hora ? <span style={suave}>{e.hora}</span> : undefined} />
    )} />
  </Bloque>
);
const SpeakingHoy = ({ lista, ir }) => (lista.length ? (
  <Bloque titulo="Speaking de hoy" accion="Abrir" onAccion={() => ir('speaking')}>
    {lista.map((s, i) => <Fila key={i} centro={<b>{s.grupo}</b>} der={<span style={suave}>{s.si} sí · {s.no} no · {s.sinRespuesta} sin responder</span>} />)}
  </Bloque>
) : null);
const Personal = ({ lista, ir }) => (
  <Bloque titulo="Trabajando ahora" accion="Fichajes" onAccion={() => ir('fichaje')}>
    <Lista items={lista} max={4} vacio="Nadie ha fichado la entrada ahora mismo." onMas={() => ir('fichaje')} render={p => (
      <Fila key={p.id} centro={p.nombre} der={p.estado === 'pausa' ? <Estado tipo="aviso">En pausa</Estado> : <Estado tipo="ok">desde {hora(p.desde)}</Estado>} />
    )} />
  </Bloque>
);

// Ingresos y gastos de los seis últimos meses: columnas agrupadas, leyenda,
// detalle al pasar por encima y la tabla para quien la prefiera.
function GraficoMeses({ meses }) {
  const [sobre, setSobre] = useState(null);
  const [tabla, setTabla] = useState(false);
  const max = Math.max(1, ...meses.flatMap(m => [m.ingresos, m.gastos]));
  const nombreMes = (m) => MESES[Number(m.slice(5, 7)) - 1];
  const ALTO = 120;
  return (
    <div className="resumen-graf">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, fontSize: 12, color: 'var(--ink-2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--serie-ing)' }} />Ingresos</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--serie-gas)' }} />Gastos</span>
        <button type="button" onClick={() => setTabla(t => !t)} style={{ ...enlace, marginLeft: 'auto' }}>{tabla ? 'Ver gráfico' : 'Ver en tabla'}</button>
      </div>
      {tabla ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ color: 'var(--ink-3)', textAlign: 'right' }}><th style={{ textAlign: 'left', padding: 3 }}>Mes</th><th style={{ padding: 3 }}>Ingresos</th><th style={{ padding: 3 }}>Gastos</th><th style={{ padding: 3 }}>Diferencia</th></tr></thead>
          <tbody>{meses.map(m => (
            <tr key={m.mes} style={{ borderTop: '1px solid var(--line)', textAlign: 'right' }}>
              <td style={{ textAlign: 'left', padding: 3 }}>{nombreMes(m.mes)}</td><td style={{ padding: 3 }}>{eur(m.ingresos)}</td><td style={{ padding: 3 }}>{eur(m.gastos)}</td><td style={{ padding: 3, fontWeight: 700 }}>{eur(m.ingresos - m.gastos)}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${meses.length}, 1fr)`, alignItems: 'end', height: ALTO, borderBottom: '1px solid var(--line)' }}>
            {meses.map((m, i) => (
              <div key={m.mes} onMouseEnter={() => setSobre(i)} onMouseLeave={() => setSobre(null)} onFocus={() => setSobre(i)} onBlur={() => setSobre(null)} tabIndex={0}
                aria-label={`${nombreMes(m.mes)}: ingresos ${eur(m.ingresos)}, gastos ${eur(m.gastos)}`}
                style={{ height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, outline: 'none', borderRadius: 6,
                  background: sobre === i ? 'color-mix(in oklab, var(--ink) 5%, transparent)' : 'transparent' }}>
                {['ingresos', 'gastos'].map(k => (
                  <span key={k} style={{ width: 'min(18px, 32%)', height: `${(m[k] / max) * (ALTO - 4)}px`, minHeight: m[k] > 0 ? 2 : 0,
                    background: k === 'ingresos' ? 'var(--serie-ing)' : 'var(--serie-gas)', borderRadius: '4px 4px 0 0' }} />
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${meses.length}, 1fr)`, marginTop: 4 }}>
            {meses.map(m => <span key={m.mes} style={{ ...suave, textAlign: 'center' }}>{nombreMes(m.mes)}</span>)}
          </div>
          {sobre !== null && (
            <div role="status" style={{ position: 'absolute', top: 0, left: `${((sobre + 0.5) / meses.length) * 100}%`, transform: `translateX(${sobre > meses.length / 2 ? '-100%' : '0'})`,
              background: 'var(--ink)', color: 'var(--bg)', borderRadius: 10, padding: '7px 10px', fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 2 }}>
              <b>{nombreMes(meses[sobre].mes)} {meses[sobre].mes.slice(0, 4)}</b><br />
              Ingresos: {eur(meses[sobre].ingresos)} · Gastos: {eur(meses[sobre].gastos)}<br />
              Diferencia: <b>{eur(meses[sobre].ingresos - meses[sobre].gastos)}</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Cada vista: sus cuatro cifras y sus tres columnas ───────────────────────
function vistaInstructor({ d, clases, ir, como }) {
  const sin = clases ? clases.filter(c => !c.marcados).length : null;
  const su = como ? 'Sus' : 'Tus';
  return {
    cifras: [
      <Cifra key="1" etiqueta="Clases hoy" valor={clases ? clases.length : '…'} detalle={clases && clases.length ? (sin ? `${plural(sin, 'lista', 'listas')} por pasar` : 'listas al día') : null} tono={sin ? 'aviso' : 'bien'} onClick={() => ir('classes')} />,
      <Cifra key="2" etiqueta="Alumnos" valor={d.alumnos} detalle={plural(d.grupos, 'grupo', 'grupos')} />,
      <Cifra key="3" etiqueta="Faltan seguido" valor={d.faltas.length} detalle={d.faltas.length ? '3 o más clases' : 'nadie'} tono={d.faltas.length ? 'aviso' : 'bien'} />,
      <Cifra key="4" etiqueta="Cumpleaños" valor={d.cumples.filter(c => c.enDias === 0).length} detalle={`hoy · ${d.cumples.length} esta semana`} />,
    ],
    columnas: [
      [<ClasesHoy key="c" clases={clases} ir={ir} titulo={`${su} clases de hoy`} />],
      [<Bloque key="f" titulo="Alumnos que faltan seguido" sub="3 o más clases seguidas sin venir">
        <Lista items={d.faltas} max={7} vacio="Nadie. ¡Bien!" render={f => (
          <Fila key={`${f.id}-${f.clase}`} centro={<><b>{f.alumno}</b><span style={suave}> · {f.clase}</span></>} der={<Estado tipo="aviso">{f.racha} seguidas</Estado>} />
        )} />
      </Bloque>],
      [
        <Cumples key="cu" lista={d.cumples} titulo="Cumpleaños de sus alumnos" vacio="Nadie cumple años esta semana." />,
        <SpeakingHoy key="s" lista={d.speaking} ir={ir} />,
        <Eventos key="e" lista={d.eventos} ir={ir} titulo={`${su} próximos eventos`} vacio="Ninguno en el próximo mes." />,
      ],
    ],
  };
}

function vistaSecretaria({ d, clases, ir }) {
  const sin = clases ? clases.filter(c => !c.marcados).length : null;
  return {
    cifras: [
      <Cifra key="1" etiqueta="Cobrado hoy" valor={eur(d.cobradoHoy.total)} detalle={plural(d.cobradoHoy.recibos, 'recibo', 'recibos')} onClick={() => ir('billing')} />,
      <Cifra key="2" etiqueta="Por cobrar" valor={eur(d.porCobrar.total)} detalle={plural(d.porCobrar.familias, 'familia', 'familias')} tono={d.porCobrar.total > 0 ? 'aviso' : 'bien'} onClick={() => ir('billing')} />,
      <Cifra key="3" etiqueta="Clases hoy" valor={clases ? clases.length : '…'} detalle={clases && clases.length ? (sin ? `${plural(sin, 'lista', 'listas')} sin pasar` : 'listas al día') : null} tono={sin ? 'aviso' : 'bien'} onClick={() => ir('classes')} />,
      d.campamentoHoy > 0
        ? <Cifra key="4" etiqueta="Campamento hoy" valor={d.campamentoHoy} detalle="niños" onClick={() => ir('camp')} />
        : <Cifra key="4" etiqueta="Trabajando ahora" valor={d.personal.length} detalle="del equipo" onClick={() => ir('fichaje')} />,
    ],
    columnas: [
      [<ClasesHoy key="c" clases={clases} ir={ir} />],
      [
        <Bloque key="caja" titulo="La caja de hoy" accion={d.cajaCerrada ? 'Ver' : 'Cerrar la caja'} onAccion={() => ir('billing')}>
          {d.cobradoHoy.porMedio.length === 0 ? <p style={{ ...suave, margin: '4px 0' }}>Todavía no se ha cobrado nada hoy.</p>
            : d.cobradoHoy.porMedio.map(m => <Fila key={m.medio} centro={m.medio} der={<b>{eur(m.total)}</b>} />)}
          <div style={{ marginTop: 6 }}>{d.cajaCerrada ? <Estado tipo="ok">Cerrada a las {hora(d.cajaCerrada)}</Estado> : <Estado tipo="info">Aún abierta</Estado>}</div>
        </Bloque>,
        <Personal key="p" lista={d.personal} ir={ir} />,
      ],
      [
        <Cumples key="cu" lista={d.cumples} titulo="Cumpleaños de hoy" vacio="Hoy no cumple años nadie." />,
        <SpeakingHoy key="s" lista={d.speaking} ir={ir} />,
        <Eventos key="e" lista={d.eventos} ir={ir} titulo="Esta semana" vacio="Sin eventos en 7 días." />,
      ],
    ],
  };
}

function vistaDireccion({ d, ir }) {
  const ing = d.ingresos;
  const cambio = ing.pasadoIgual > 0 ? Math.round(((ing.mes - ing.pasadoIgual) / ing.pasadoIgual) * 100) : null;
  const resultado = ing.mes - d.gastosMes;
  const o = d.ocupacion;
  return {
    cifras: [
      <Cifra key="1" etiqueta="Ingresos del mes" valor={eur(ing.mes)} onClick={() => ir('billing')}
        detalle={cambio === null ? `mes pasado: ${eur(ing.pasado)}` : `${cambio >= 0 ? '▲' : '▼'} ${Math.abs(cambio)} % vs. el mes pasado`} tono={cambio === null ? null : cambio >= 0 ? 'bien' : 'aviso'} />,
      <Cifra key="2" etiqueta="Gastos del mes" valor={eur(d.gastosMes)} detalle="apuntados hasta hoy" onClick={() => ir('payments')} />,
      <Cifra key="3" etiqueta="Diferencia" valor={eur(resultado)} detalle="ingresos menos gastos" tono={resultado >= 0 ? 'bien' : 'aviso'} />,
      <Cifra key="4" etiqueta="Alumnos activos" valor={d.alumnos.activos} detalle={`+${d.alumnos.altas} altas · −${d.alumnos.bajas} bajas este mes`} onClick={() => ir('students')} />,
    ],
    columnas: [
      [<Bloque key="g" titulo="Ingresos y gastos" sub="Últimos seis meses (el actual, hasta hoy)"><GraficoMeses meses={d.meses} /></Bloque>],
      [<Bloque key="o" titulo="Ocupación de las clases" sub={o.pct !== null ? `${o.ocupadas} de ${o.plazas} plazas (${o.pct} %) · ${o.espera} en espera` : 'Las clases no tienen plazas máximas'} accion="Clases" onAccion={() => ir('classes')}>
        {o.pct !== null && <div aria-hidden="true" style={{ height: 6, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden', margin: '2px 0 8px' }}><div style={{ height: '100%', width: `${o.pct}%`, background: 'var(--purple)' }} /></div>}
        {o.llenas.length > 0 && <div style={{ ...suave, fontWeight: 800 }}>Llenas</div>}
        {o.llenas.slice(0, 3).map(g => <Fila key={g.nombre} centro={<>{g.nombre}<span style={suave}> · {g.actividad}</span></>} der={<span style={suave}>{g.n}/{g.max}{g.espera ? ` · ${g.espera} esp.` : ''}</span>} />)}
        {o.flojas.length > 0 && <div style={{ ...suave, fontWeight: 800, marginTop: 6 }}>Con muchas plazas libres</div>}
        {o.flojas.slice(0, 4).map(g => <Fila key={g.nombre} centro={<>{g.nombre}<span style={suave}> · {g.actividad}</span></>} der={<span style={suave}>{g.n}/{g.max}</span>} />)}
      </Bloque>],
      [
        <Bloque key="c" titulo="Por cobrar" accion="Cobrar" onAccion={() => ir('billing')}>
          {d.porCobrar.total > 0
            ? <div><b style={{ fontSize: 20, fontFamily: 'var(--font-display)' }}>{eur(d.porCobrar.total)}</b><div style={suave}>{plural(d.porCobrar.cargos, 'cargo', 'cargos')} de {plural(d.porCobrar.familias, 'familia', 'familias')}</div></div>
            : <Estado tipo="ok">Nada pendiente de cobrar.</Estado>}
        </Bloque>,
        <Personal key="p" lista={d.personal} ir={ir} />,
      ],
    ],
  };
}

function vistaIT({ d, ir, irRuta }) {
  const t = d.tickets, s = d.sistema;
  const prio = { high: ['mal', 'Alta'], medium: ['aviso', 'Media'], low: ['info', 'Baja'] };
  const ticket = (x) => (
    <Fila key={x.id} izq={`#${x.id}`} centro={x.asunto} onClick={() => irRuta(`/admin/soporte/${x.id}`)}
      der={x.vence && new Date(x.vence) < new Date() ? <Estado tipo="mal">Vencido</Estado> : <Estado tipo={(prio[x.prioridad] || prio.low)[0]}>{(prio[x.prioridad] || prio.low)[1]}</Estado>} />
  );
  const imap = s.imap.error ? ['mal', 'Falla'] : s.imap.revisado ? ['ok', `Leído a las ${hora(s.imap.revisado)}`] : ['aviso', 'Sin leer aún'];
  const vf = s.verifactu.modo !== 'verifactu' ? ['info', 'Apagado'] : s.verifactu.errores ? ['mal', `${s.verifactu.errores} con error`] : s.verifactu.pendientes ? ['aviso', `${s.verifactu.pendientes} por enviar`] : ['ok', 'Al día'];
  const bd = s.baseDatos;
  const sistema = [
    ['Correo', s.correo ? ['ok', 'Configurado'] : ['mal', 'Sin configurar']],
    ['Rebotes (IMAP)', imap],
    ['Correos que rebotan', s.rebotes ? ['aviso', `${s.rebotes} apartados`] : ['ok', 'Ninguno']],
    ['Cola de campañas', s.colaCampanas ? ['info', `${s.colaCampanas} en cola`] : ['ok', 'Vacía']],
    ['Verifactu', vf],
    ['Pagos online', s.pagosOnline ? ['ok', 'Abiertos'] : ['info', 'Próximamente']],
    ['Pagos por revisar', s.tpvRevisar ? ['aviso', String(s.tpvRevisar)] : ['ok', 'Ninguno']],
    ['Base de datos', bd.esperando ? ['aviso', `${bd.esperando} esperando`] : ['ok', `${bd.abiertas}/${bd.max} conexiones`]],
    ['Servidor', ['info', `${s.servidor.memoriaMb} MB · desde ${hora(s.servidor.arrancado)}`]],
    ['Versión', ['info', [s.servidor.version, s.servidor.commit].filter(Boolean).join(' · ') || s.servidor.node]],
  ];
  const dias = [];
  for (const b of d.semana.bloques) { const u = dias.find(x => x[0] === b.fecha); if (u) u[1].push(b); else dias.push([b.fecha, [b]]); }
  return {
    cifras: [
      <Cifra key="1" etiqueta="Tickets abiertos" valor={t.abiertos} detalle={`${t.resueltos_semana} resueltos esta semana`} onClick={() => ir('support')} />,
      <Cifra key="2" etiqueta="Asignados a ti" valor={t.mios} detalle={`${t.urgentes} de prioridad alta en total`} onClick={() => ir('support')} />,
      <Cifra key="3" etiqueta="Sin asignar" valor={t.sin_asignar} tono={t.sin_asignar ? 'aviso' : 'bien'} detalle={t.sin_asignar ? 'hay que repartirlos' : 'todos tienen dueño'} onClick={() => ir('support')} />,
      <Cifra key="4" etiqueta="Vencidos" valor={t.vencidos} tono={t.vencidos ? 'aviso' : 'bien'} detalle={t.vencidos ? 'se pasó su fecha' : 'ninguno'} onClick={() => ir('support')} />,
    ],
    columnas: [
      [<Bloque key="m" titulo="Tus tickets" sub="Urgentes y los que vencen antes, primero" accion="Todos" onAccion={() => ir('support')}>
        <Lista items={t.miosLista} max={8} vacio="No tienes tickets abiertos." onMas={() => ir('support')} render={ticket} />
        {t.mios > t.miosLista.length && <button type="button" onClick={() => ir('support')} style={{ ...enlace, marginTop: 6 }}>y {t.mios - t.miosLista.length} más en Soporte →</button>}
      </Bloque>],
      [<Bloque key="s" titulo="Estado del sistema">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 14 }}>
          {sistema.map(([k, [tipo, txt]]) => (
            <div key={k} style={{ padding: '6px 0', borderTop: '1px solid var(--line)', minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700 }}>{k}</div>
              <Estado tipo={tipo}>{txt}</Estado>
            </div>
          ))}
        </div>
        {s.imap.error && <p style={{ margin: '6px 0 0', fontSize: 11, color: '#c62828' }}>IMAP: {s.imap.error}</p>}
      </Bloque>],
      [
        <Bloque key="n" titulo="Sin asignar" accion="Repartir" onAccion={() => ir('support')}>
          <Lista items={t.sinAsignarLista} max={4} vacio="Todos tienen dueño." onMas={() => ir('support')} render={ticket} />
        </Bloque>,
        <Bloque key="w" titulo="La semana del equipo" accion="Planificar" onAccion={() => ir('equipo_it')}>
          <Lista items={dias} max={4} vacio="Nada planificado esta semana." onMas={() => ir('equipo_it')} render={([dia, bs]) => (
            <Fila key={dia} izq={fechaCorta(dia)} centro={bs.map(b => `${b.inicio}–${b.fin} ${b.nombre.split(' ')[0]}`).join(' · ')} />
          )} />
        </Bloque>,
      ],
    ],
  };
}

function vistaTrabajador({ mi, ir }) {
  const t = mi.tareas;
  return {
    cifras: [
      <Cifra key="1" etiqueta="Tareas hoy" valor={t.pendientes} detalle={t.hechas ? `${t.hechas} hechas` : null} onClick={() => ir('agenda')} />,
      <Cifra key="2" etiqueta="Atrasadas" valor={t.vencidas} tono={t.vencidas ? 'aviso' : 'bien'} detalle={t.vencidas ? 'de días anteriores' : 'ninguna'} onClick={() => ir('agenda')} />,
      <Cifra key="3" etiqueta="Tickets" valor={mi.ticketsMios} detalle="abiertos asignados" onClick={() => ir('support')} />,
      <Cifra key="4" etiqueta="Ausencias" valor={mi.ausencias.length} detalle="próximas" onClick={() => ir('fichaje')} />,
    ],
    columnas: [
      [<Bloque key="t" titulo="Tareas de hoy" accion="Agenda" onAccion={() => ir('agenda')}>
        <Lista items={t.proximas} max={6} vacio="Nada apuntado para hoy." render={x => <Fila key={x.id} izq={x.hora || '—'} centro={x.titulo} />} />
      </Bloque>],
      [<Bloque key="a" titulo="Próximas ausencias" accion="Fichaje" onAccion={() => ir('fichaje')}>
        <Lista items={mi.ausencias} max={4} vacio="Ninguna pedida." render={(a, i) => (
          <Fila key={i} centro={a.nombre} der={<span style={suave}>{fechaCorta(a.desde)}{a.hasta !== a.desde ? ` – ${fechaCorta(a.hasta)}` : ''}{a.estado === 'pendiente' ? ' · por aprobar' : ''}</span>} />
        )} />
      </Bloque>],
      [],
    ],
  };
}

// ── La página ───────────────────────────────────────────────────────────────
export default function AdminResumen({ permisos, ir, irRuta, refreshTrigger }) {
  // Siempre abre en el resumen de tu rango; cambiar de pestaña es solo para mirar.
  const [vista, setVista] = useState('');
  const [como, setComo] = useState('');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [avisos, setAvisos] = useState(null);
  const [clases, setClases] = useState(null);

  const cargar = useCallback(() => {
    setError(null);
    const q = new URLSearchParams();
    if (vista) q.set('vista', vista);
    if (como) q.set('como', como);
    fetch(`/api/admin/resumen?${q}`, { credentials: 'include', cache: 'no-store' })
      .then(async r => { const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'No se ha podido cargar el resumen.'); return x; })
      .then(setD).catch(e => setError(e.message));
    fetch('/api/admin/notificaciones', { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { avisos: [] })).then(x => setAvisos(x.avisos || [])).catch(() => setAvisos([]));
  }, [vista, como]);
  useEffect(() => { cargar(); }, [cargar, refreshTrigger]);
  // Cada cinco minutos, por si se queda abierto en recepción.
  useEffect(() => { const t = setInterval(cargar, 5 * 60_000); return () => clearInterval(t); }, [cargar]);

  // Las clases de hoy (ya filtradas por el servidor si es un instructor); viendo
  // a otro instructor, las suyas.
  const conClases = d && (d.vista === 'instructor' || d.vista === 'secretaria');
  const idComo = d?.vista === 'instructor' ? (d?.como?.id || '') : '';
  useEffect(() => {
    if (!conClases) return;
    setClases(null);
    fetch(`/api/admin/tul/attendance/dia/${d.hoy}${idComo ? `?instructor=${idComo}` : ''}`, { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { clases: [] })).then(x => setClases(x.clases || [])).catch(() => setClases([]));
  }, [conClases, d?.hoy, d?.vista, idComo, refreshTrigger]);

  const elegirVista = (v) => { setVista(v); setComo(''); };

  if (error) return <div className="res-bloque"><p style={{ margin: 0 }}>{error}</p><button type="button" className="btn btn-sm btn-outline" style={{ marginTop: 10 }} onClick={cargar}>Reintentar</button></div>;
  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Cargando el resumen…</p>;

  const h = Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }));
  const saludo = h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  const f = new Date(d.hoy + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const fecha = f.charAt(0).toUpperCase() + f.slice(1);
  const esIT = d.vista === 'it';
  // En la vista de IT los tickets ya están abajo: no se repiten arriba.
  const pendientes = avisos && (esIT ? avisos.filter(a => !(a.tipo === 'tickets' && a.destino === '/admin/soporte' && !a.clave)) : avisos);
  const hacer = { instructor: vistaInstructor, secretaria: vistaSecretaria, direccion: vistaDireccion, it: vistaIT, trabajador: vistaTrabajador }[d.vista];
  const v = hacer ? hacer({ d: d.datos, mi: d.mi, clases, ir, irRuta, como: d.como }) : null;

  // Iconos de las cuatro cifras de cada vista (el color va por posición, como antes).
  const ICONOS = {
    it: [<I.Bell key="i" />, <I.User key="i" />, <I.Users key="i" />, <I.Clock key="i" />],
    direccion: [<I.Wallet key="i" />, <I.CreditCard key="i" />, <I.Chart key="i" />, <I.Users key="i" />],
    secretaria: [<I.Wallet key="i" />, <I.CreditCard key="i" />, <I.Calendar key="i" />, <I.Users key="i" />],
    instructor: [<I.Calendar key="i" />, <I.Users key="i" />, <I.Phone key="i" />, <I.Star key="i" />],
    trabajador: [<I.Check key="i" />, <I.Clock key="i" />, <I.Bell key="i" />, <I.Calendar key="i" />],
  }[d.vista] || [];
  const piezas = v ? v.columnas.flat().filter(Boolean) : [];
  const [principal, ...resto] = piezas;

  return (
    <div className="res">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, letterSpacing: '-.015em' }}>
            {saludo}{d.nombre ? `, ${d.nombre}` : ''} <span style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 500, color: 'var(--ink-3)', letterSpacing: 0 }}>· {fecha}</span>
          </div>
          <TuDia mi={d.mi} ir={ir} permisos={permisos} conTickets={!esIT} como={d.como} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {d.personas && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}>
              Ver como
              <select value={d.como?.id || ''} onChange={e => setComo(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 13, padding: '6px 8px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', maxWidth: 220 }}>
                {!d.como && <option value="">Tú</option>}
                {d.personas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
          )}
          {d.vistas.length > 1 && (
            <div role="tablist" aria-label="Qué resumen ver" className="res-tabs">
              {d.vistas.map(x => (
                <button key={x.id} type="button" role="tab" aria-selected={d.vista === x.id} onClick={() => elegirVista(x.id)} className={d.vista === x.id ? 'on' : ''}>{x.nombre}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {v && (
        <div className="kpis" style={{ marginBottom: 0 }}>
          {v.cifras.map((c, i) => React.cloneElement(c, { act: COLORES_CIFRA[i % 4], icono: ICONOS[i] }))}
        </div>
      )}

      <div className="res-fila-1">
        {principal || null}
        <ParaAtender avisos={pendientes} irRuta={irRuta} como={d.como} />
      </div>
      {resto.length > 0 && <div className="res-fila-2">{resto}</div>}

      <style>{`
        .res{display:grid;gap:18px}
        .res-tabs{display:inline-flex;border:1px solid var(--line);border-radius:999px;background:var(--bg-2);padding:3px;gap:2px;flex-wrap:wrap}
        .res-tabs button{padding:6px 13px;font-size:12px;font-weight:800;font-family:inherit;cursor:pointer;border:0;border-radius:999px;background:transparent;color:var(--ink-2)}
        .res-tabs button.on{background:var(--purple);color:#fff}
        .res-bloque{background:var(--bg-2);border:1px solid var(--line);border-radius:18px;padding:22px;min-width:0}
        .res-fila-1{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:18px;align-items:start}
        .res-fila-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:18px;align-items:start}
        .res-fila{width:100%;font-family:inherit;color:var(--ink);text-align:left;padding:11px 14px!important}
        button.res-fila:hover{border-color:color-mix(in oklab,var(--purple) 40%,var(--line))}
        .res-aviso-n{min-width:26px;height:24px;padding:0 7px;border-radius:999px;display:grid;place-items:center;font-size:12px;font-weight:800;background:color-mix(in oklab,var(--purple) 12%,var(--bg-2));color:var(--purple)}
        .resumen-graf{--serie-ing:#5233A8;--serie-gas:#C2692A}
        html[data-theme="dark"] .resumen-graf{--serie-ing:#8F75E0;--serie-gas:#C97C3E}
        @media (max-width:1000px){.res-fila-1{grid-template-columns:minmax(0,1fr)}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
      `}</style>
    </div>
  );
}
