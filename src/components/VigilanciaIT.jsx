import React, { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Vigilancia de los servicios, para el Equipo IT. Lo que el servidor comprueba
// de verdad cada pocos minutos (base de datos, web, certificado, correo, Gmail,
// Facebook e Instagram, pagos, VERI*FACTU…), con su historial de 24 h; las tareas
// automáticas (cuándo se hicieron y si fallaron); las peticiones y sus fallos;
// los últimos errores del servidor, y qué está encendido y apagado en la web.
// Todo se apunta en memoria: empieza de cero con cada reinicio o deploy.
// ─────────────────────────────────────────────────────────────────────────────

const COLOR = { ok: 'var(--teal)', aviso: '#B45309', error: 'var(--orange)', apagado: 'var(--ink-3)', pendiente: 'var(--ink-3)' };
const TEXTO = { ok: 'Bien', aviso: 'Aviso', error: 'Error', apagado: 'Apagado', pendiente: 'Sin comprobar' };
const caja = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, display: 'grid', gap: 10 };
const suave = { fontSize: 12, color: 'var(--ink-3)' };
const chip = (estado, texto) => (
  <span style={{ fontSize: 11, fontWeight: 800, color: COLOR[estado], background: `color-mix(in oklab, ${COLOR[estado]} 13%, transparent)`, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{texto || TEXTO[estado]}</span>
);
const hace = (t) => {
  if (!t) return 'nunca';
  const s = Math.round((Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return `hace ${Math.max(s, 0)} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `hace ${m} min` : m < 2880 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`;
};
const cada = (ms) => (ms >= 3600_000 ? `cada ${Math.round(ms / 3600_000)} h` : ms >= 60_000 ? `cada ${Math.round(ms / 60_000)} min` : `cada ${Math.round(ms / 1000)} s`);
const hora = (t) => new Date(t).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });

// Los nombres de las tareas automáticas, para que se entiendan.
const TAREA = {
  recordatoriosFichaje: 'Recordatorios de fichar', cerrarFichajesAbiertos: 'Cierre automático de jornadas', tareasRegistroJornada: 'Resúmenes y sello del registro de jornada',
  publicarRedesProgramadas: 'Publicar en redes lo programado', seguidoresRedes: 'Apuntar los seguidores de las redes', vigilarServiciosCadaMinuto: 'Comprobar los servicios',
  recordatoriosSpeaking: 'Recordatorios de clases individuales', generacionAutomatica: 'Cargos automáticos del mes', revisarRebotes: 'Revisar correos rebotados',
  ejecutarAutomatismos: 'Automatismos del CRM', avisosSoportePeriodicos: 'Avisos de soporte', repasoAvisosMovil: 'Repaso de avisos al móvil',
  enviarSiguienteDeCampana: 'Envío de campañas', lanzarProgramados: 'Lanzar campañas programadas', fotoSegmentos: 'Foto diaria de los segmentos', caducarVisitas: 'Borrar visitas antiguas',
  enviarRegistrosVerifactu: 'Mandar facturas a VERI*FACTU', recordatoriosValoracion: 'Pedir valoraciones de Brickslab', publicarProgramado: 'Publicar noticias programadas',
  reglasCorreoGeneral: 'Reglas del correo general', correosProgramadosBandeja: 'Enviar correos programados', 'Date.now': 'Limpiar sesiones caducadas',
  'ws.terminate': 'Latido de los móviles conectados', 'vistoEn.clear': 'Último contacto de los móviles',
};

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || `Error ${r.status}`), { status: r.status });
  return d;
}

export default function VigilanciaIT({ children }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [comprobando, setComprobando] = useState(null);
  const cargar = useCallback(async () => {
    try { setD(await api('/api/admin/vigilancia')); setError(null); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 60_000); return () => clearInterval(t); }, [cargar]);
  async function comprobar(id) {
    setComprobando(id || 'todo');
    try { setD(await api('/api/admin/vigilancia/comprobar', { method: 'POST', body: { id } })); } catch (e) { alert(e.message); } finally { setComprobando(null); }
  }

  if (error) return <p style={{ color: 'var(--orange)', fontSize: 14 }}>{error}</p>;
  if (!d) return <p style={suave}>Cargando la vigilancia…</p>;
  const cuenta = (e) => d.servicios.filter(s => s.estado === e).length;
  const [mal, avisos] = [cuenta('error'), cuenta('aviso')];
  const grupos = [...new Set(d.servicios.map(s => s.grupo))];
  const s = d.servidor;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Cómo está todo, de un vistazo. */}
      <div style={{ ...caja, gridTemplateColumns: '1fr auto', alignItems: 'center',
        borderColor: mal ? 'color-mix(in oklab, var(--orange) 50%, var(--line))' : avisos ? 'color-mix(in oklab, #B45309 40%, var(--line))' : 'color-mix(in oklab, var(--teal) 40%, var(--line))' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <b style={{ fontSize: 18, fontFamily: 'var(--font-display)', color: mal ? 'var(--orange)' : avisos ? '#B45309' : 'var(--teal)' }}>
            {mal ? `${mal} servicio${mal !== 1 ? 's' : ''} con problemas` : avisos ? `Todo funciona, con ${avisos} aviso${avisos !== 1 ? 's' : ''}` : 'Todo en orden'}
          </b>
          <span style={suave}>
            {s.version ? `Versión ${s.version}` : 'Sin versión de Heroku'}{s.commit ? ` · ${String(s.commit).slice(0, 7)}` : ''} · arrancado {hace(s.arrancado)} · {s.memoriaMb} MB · atasco {s.retardoMs} ms · Node {s.node}{s.dyno ? ` · ${s.dyno}` : ''}
          </span>
        </div>
        <button className="btn btn-sm btn-primary" disabled={!!comprobando} onClick={() => comprobar()}>{comprobando === 'todo' ? 'Comprobando…' : 'Comprobar todo ahora'}</button>
      </div>

      {grupos.map(g => (
        <div key={g} style={{ display: 'grid', gap: 8 }}>
          <b style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)' }}>{g}</b>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
            {d.servicios.filter(x => x.grupo === g).map(x => <Servicio key={x.id} x={x} comprobando={comprobando === x.id} onComprobar={() => comprobar(x.id)} />)}
          </div>
        </div>
      ))}

      <Tareas tareas={d.tareas} />
      <Peticiones p={d.peticiones} />
      <Registro registro={d.registro} />
      <Interruptores lista={d.interruptores} />
      {children}
      <span style={suave}>Se actualiza sola cada minuto. Lo apuntado se guarda en memoria: empieza de cero con cada reinicio o deploy. Para vigilar también Learning Dungeon o Brickslab, pon en Heroku <b>VIGILAR_URLS</b> = «Learning Dungeon=https://…;Brickslab=https://…».</span>
    </div>
  );
}

function Servicio({ x, comprobando, onComprobar }) {
  const [abierto, setAbierto] = useState(false);
  const h = x.historial || [];
  const bien = h.filter(p => p.estado === 'ok' || p.estado === 'apagado').length;
  return (
    <div style={{ ...caja, gap: 8, borderLeft: `4px solid ${COLOR[x.estado]}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, background: COLOR[x.estado], flex: 'none' }} />
        <b style={{ fontSize: 14, flex: 1 }}>{x.nombre}</b>
        {chip(x.estado)}
        <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '4px 8px' }} disabled={comprobando} onClick={onComprobar} title="Comprobar ahora">{comprobando ? '…' : '↻'}</button>
      </div>
      <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>{x.detalle}</span>
      {h.length > 1 && (
        <div title={`Últimas ${h.length} comprobaciones: ${Math.round((bien / h.length) * 100)} % bien`} style={{ display: 'flex', gap: 1, height: 14, alignItems: 'stretch' }}>
          {h.slice(-96).map((p, i) => <span key={i} style={{ flex: 1, minWidth: 2, borderRadius: 2, background: COLOR[p.estado], opacity: p.estado === 'ok' ? 0.55 : 1 }} />)}
        </div>
      )}
      <span style={{ ...suave, fontSize: 11 }}>
        {x.comprobado ? `Comprobado ${hace(x.comprobado)}${x.ms != null ? ` (${x.ms} ms)` : ''} · así ${hace(x.desde).replace('hace', 'desde hace')}` : ''} · cada {x.cadaMin >= 60 ? `${x.cadaMin / 60} h` : `${x.cadaMin} min`}
        {x.datos && <> · <button type="button" onClick={() => setAbierto(v => !v)} style={{ background: 'none', border: 0, padding: 0, color: 'var(--purple)', fontWeight: 700, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>{abierto ? 'menos' : 'más detalle'}</button></>}
      </span>
      {abierto && x.datos?.porApp && (
        <div style={{ fontSize: 12, display: 'grid', gap: 2 }}>
          {x.datos.porApp.map((c, i) => <span key={i}><b>{c.n}</b> · {c.app} · {c.ip}</span>)}
        </div>
      )}
      {abierto && x.datos?.buzones && (
        <div style={{ fontSize: 12, display: 'grid', gap: 2 }}>
          {x.datos.buzones.map(b => <span key={b.email} style={{ color: b.ok ? 'var(--ink-2)' : 'var(--orange)' }}>{b.ok ? '✓' : '✗'} {b.email}{b.general ? ' (general)' : ''} {b.ok ? `· ${b.ms} ms` : `· ${b.error}`}</span>)}
        </div>
      )}
    </div>
  );
}

function Tareas({ tareas }) {
  return (
    <div style={caja}>
      <b style={{ fontSize: 14 }}>Tareas automáticas</b>
      <span style={suave}>Lo que el servidor hace solo cada cierto tiempo. «Atrasada» es que lleva más de dos vueltas sin hacerse.</span>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
          <thead><tr style={{ color: 'var(--ink-3)', fontSize: 11, textAlign: 'left' }}>
            <th style={{ padding: 6 }}>Tarea</th><th style={{ padding: 6 }}>Cada</th><th style={{ padding: 6 }}>Última vez</th><th style={{ padding: 6 }}>Tardó</th><th style={{ padding: 6 }}>Veces</th><th style={{ padding: 6 }}>Estado</th>
          </tr></thead>
          <tbody>
            {tareas.map(t => (
              <tr key={t.nombre} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: 6 }}><b>{TAREA[t.nombre] || t.nombre}</b>{TAREA[t.nombre] && <span style={{ ...suave, fontSize: 11, display: 'block' }}>{t.nombre}</span>}</td>
                <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{cada(t.cadaMs)}</td>
                <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{hace(t.ultima)}</td>
                <td style={{ padding: 6 }}>{t.duracionMs != null ? `${t.duracionMs} ms` : '—'}</td>
                <td style={{ padding: 6 }}>{t.veces}{t.fallos ? <span style={{ color: 'var(--orange)' }}> · {t.fallos} fallos</span> : ''}</td>
                <td style={{ padding: 6 }}>
                  {chip(t.estado, t.estado === 'aviso' ? 'Atrasada' : undefined)}
                  {t.error && t.estado === 'error' && <span style={{ display: 'block', fontSize: 11, color: 'var(--orange)', marginTop: 3 }}>{t.error} · {hace(t.errorAt)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Peticiones({ p }) {
  const max = Math.max(1, ...p.porHora.map(h => h.n));
  const u = p.ultimaHora;
  return (
    <div style={caja}>
      <b style={{ fontSize: 14 }}>Peticiones a la web (24 h)</b>
      <span style={suave}>Última hora: <b>{u.n}</b> peticiones · <b style={{ color: u.e5 ? 'var(--orange)' : 'inherit' }}>{u.e5}</b> fallos del servidor · {u.e4} rechazadas (4xx) · {u.lentas} lentas{u.mediaMs != null ? ` · ${u.mediaMs} ms de media` : ''}</span>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 70 }}>
        {p.porHora.map((h, i) => (
          <div key={i} title={`${new Date(h.desde).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })}: ${h.n} peticiones, ${h.e5} fallos, ${h.lentas} lentas`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', height: '100%' }}>
            <span style={{ height: `${(Math.max(h.n - h.e5, 0) / max) * 100}%`, background: 'color-mix(in oklab, var(--purple) 55%, transparent)', borderRadius: '2px 2px 0 0' }} />
            {h.e5 > 0 && <span style={{ height: `${Math.max((h.e5 / max) * 100, 4)}%`, background: 'var(--orange)' }} />}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', ...suave, fontSize: 10 }}><span>hace 24 h</span><span>ahora</span></div>
      {p.fallos.length > 0 && (
        <div style={{ display: 'grid', gap: 3, fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
          <b style={{ fontFamily: 'inherit', fontSize: 12 }}>Últimos fallos del servidor</b>
          {p.fallos.slice(0, 15).map((f, i) => <span key={i}><span style={suave}>{hora(f.t)}</span> · <b style={{ color: 'var(--orange)' }}>{f.estado}</b> · {f.metodo} {f.ruta} · {f.ms} ms</span>)}
        </div>
      )}
    </div>
  );
}

function Registro({ registro }) {
  const [filtro, setFiltro] = useState('error');
  const lista = registro.filter(r => filtro === 'todo' || r.nivel === filtro);
  return (
    <div style={caja}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 14, flex: 1 }}>Registro del servidor</b>
        {[['error', `Errores (${registro.filter(r => r.nivel === 'error').length})`], ['warn', `Avisos (${registro.filter(r => r.nivel === 'warn').length})`], ['todo', 'Todo']].map(([v, l]) => (
          <button key={v} className={`filter-pill ${filtro === v ? 'is-active' : ''}`} onClick={() => setFiltro(v)}>{l}</button>
        ))}
      </div>
      {!lista.length ? <span style={suave}>Nada desde el último arranque. 🎉</span> : (
        <div style={{ display: 'grid', gap: 4, maxHeight: 360, overflowY: 'auto', fontSize: 12 }}>
          {lista.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '4px 0', borderTop: i ? '1px solid var(--line)' : 0 }}>
              <span style={{ ...suave, fontSize: 11, whiteSpace: 'nowrap' }}>{hora(r.t)}</span>
              {r.etiqueta && <span style={{ fontSize: 10, fontWeight: 800, color: r.nivel === 'error' ? 'var(--orange)' : '#B45309', whiteSpace: 'nowrap' }}>{r.etiqueta}</span>}
              <span style={{ fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word', flex: 1 }}>{r.texto}</span>
              {r.veces > 1 && <b style={{ whiteSpace: 'nowrap' }}>×{r.veces}</b>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Interruptores({ lista }) {
  const [verCorreos, setVerCorreos] = useState(false);
  const grupos = [...new Set(lista.map(x => x.grupo))];
  return (
    <div style={caja}>
      <b style={{ fontSize: 14 }}>Qué está encendido y qué apagado</b>
      <span style={suave}>Solo para mirar: cada cosa se cambia en su apartado.</span>
      {grupos.map(g => {
        const items = lista.filter(x => x.grupo === g);
        const correos = g === 'Correos automáticos';
        const apagados = items.filter(x => x.activo === false).length;
        return (
          <div key={g} style={{ display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <b style={{ fontSize: 12, color: 'var(--ink-2)' }}>{g}</b>
              {correos && <span style={suave}>{items.length - apagados} encendidos · {apagados} apagados</span>}
              {correos && <button type="button" onClick={() => setVerCorreos(v => !v)} style={{ background: 'none', border: 0, padding: 0, color: 'var(--purple)', fontWeight: 700, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>{verCorreos ? 'ocultar' : 'ver cuáles'}</button>}
            </div>
            {(!correos || verCorreos) && items.map((x, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
                {x.activo === true ? chip('ok', 'Encendido') : x.activo === false ? chip('apagado', 'Apagado') : chip('pendiente', 'Info')}
                <span>{x.nombre}</span>
                <span style={suave}>{x.detalle}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
