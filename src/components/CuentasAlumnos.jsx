import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { I } from './Icons.jsx';
import { fmtFecha } from '../fechas.js';

// Las cuentas de los alumnos (#643): contraseñas provisionales para entrar en la
// web (al entrar se pide una nueva) y sus cuentas de Google del club. Las
// contraseñas no se guardan en claro: se ven aquí una vez, para imprimir las
// cartas o descargar el fichero de Google.

const api = async (url, opciones = {}) => {
  const r = await fetch(url, { credentials: 'include', ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'No se ha podido hacer.'), { datos: d });
  return d;
};
const post = (url, cuerpo) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Las cartas, tres por folio, para recortar y dar a cada alumno (o a su familia).
export function imprimirCartas(filas, { conGoogle } = {}) {
  const w = window.open('', '_blank');
  if (!w) { alert('El navegador ha bloqueado la ventana. Permite las ventanas emergentes de esta web y vuelve a pulsar.'); return; }
  const carta = (f) => `
    <section class="carta">
      <h2>Acceso de ${esc(`${f.nombre} ${f.apellidos}`.trim())}</h2>
      <table>
        <tr><th>Usuario</th><td><b>${esc(f.email)}</b></td></tr>
        <tr><th>Contraseña provisional</th><td><b class="clave">${esc(f.password)}</b></td></tr>
      </table>
      <ol>
        <li>Entra en <b>www.aimeducation.es</b> y pulsa <b>Entrar</b>.</li>
        <li>Escribe el usuario y la contraseña provisional, tal cual (mayúsculas incluidas).</li>
        <li>Te pedirá una contraseña nueva: elige una que recuerdes y no se la digas a nadie.</li>
      </ol>
      ${conGoogle ? '<p class="nota">Es también tu cuenta de Google del club (Gmail, Drive…): la primera vez se entra con esta misma contraseña provisional y Google también pedirá cambiarla. En la web puedes entrar después con el botón «Entrar con Google».</p>' : ''}
    </section>`;
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Accesos de los alumnos</title><style>
    @page { size: A4; margin: 12mm; }
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #111; margin: 0; }
    .carta { height: 86mm; box-sizing: border-box; padding: 6mm 4mm; border-bottom: 1px dashed #999; break-inside: avoid; }
    .carta:nth-child(3n) { border-bottom: 0; break-after: page; }
    h2 { font-size: 17px; margin: 0 0 8px; }
    table { border-collapse: collapse; margin: 0 0 8px; font-size: 14px; }
    th { text-align: left; font-weight: 600; color: #555; padding: 3px 14px 3px 0; }
    td { padding: 3px 0; }
    .clave { font-family: ui-monospace, Consolas, monospace; font-size: 16px; letter-spacing: .04em; }
    ol { margin: 0 0 6px; padding-left: 20px; font-size: 12.5px; line-height: 1.45; }
    .nota { font-size: 11.5px; color: #444; margin: 0; }
  </style></head><body>${filas.map(carta).join('')}<script>window.onload = () => window.print();<\/script></body></html>`);
  w.document.close();
}

async function descargarCsv(filas) {
  const r = await fetch('/api/admin/cuentas-alumnos/csv', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filas: filas.map(({ nombre, apellidos, email, password }) => ({ nombre, apellidos, email, password })) }),
  });
  if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'No se ha podido descargar.'); return; }
  const url = URL.createObjectURL(await r.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: 'cuentas-google-alumnos.csv' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const fondo = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 3000, display: 'grid', placeItems: 'center', padding: 16 };
const aviso = (color) => ({ padding: '10px 12px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.45, background: `color-mix(in oklab, var(${color}) 10%, var(--bg-2))`, border: `1px solid color-mix(in oklab, var(${color}) 30%, transparent)` });

// ── Desde la ficha: la contraseña provisional de una persona ──
export function PasswordProvisional({ persona, onCerrar, showToast }) {
  const correo = String(persona.email || '').toLowerCase();
  const delClub = correo.endsWith('@aimeducation.es');
  const [password, setPassword] = useState('');
  const [google, setGoogle] = useState(false);
  const [googleOk, setGoogleOk] = useState(null); // null: mirando
  useEffect(() => {
    if (!delClub) return;
    api('/api/admin/cuentas-alumnos/google').then(d => { setGoogleOk(!!d.ok); setGoogle(!!d.ok); }).catch(() => setGoogleOk(false));
  }, [delClub]);
  const [hecho, setHecho] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function poner() {
    setError('');
    if (password && password.length < 8) return setError('Al menos 8 caracteres (o déjala vacía y la web inventa una).');
    setGuardando(true);
    try {
      const d = await post(`/api/admin/usuarios/${persona.id}/password-provisional`, { password: password || undefined, google: delClub && googleOk && google });
      setHecho(d);
      showToast?.('Contraseña provisional puesta.');
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  const nombre = `${persona.firstName || ''} ${persona.lastName || ''}`.trim();
  // En el body: así tapa todo el panel, menú incluido.
  return createPortal(
    <div style={fondo} role="dialog" aria-modal="true" aria-labelledby="pp-titulo" onMouseDown={e => { if (e.target === e.currentTarget && !guardando) onCerrar(); }}>
      <div className="panel" style={{ maxWidth: 460, width: '100%', margin: 0 }}>
        <h2 id="pp-titulo" style={{ margin: '0 0 6px' }}>Contraseña provisional</h2>
        {!hecho ? (
          <>
            <p className="sub" style={{ margin: '0 0 14px' }}>
              Para que {nombre || 'esta persona'} entre en la web. La primera vez que entre con ella, la web le pedirá poner una suya.
              La que tuviera deja de valer y se le cierran las sesiones abiertas.
            </p>
            <div className="field">
              <label htmlFor="pp-clave">Contraseña</label>
              <input id="pp-clave" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" placeholder="Déjala vacía y la web inventa una" />
            </div>
            {delClub && googleOk && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '0 0 12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={google} onChange={e => setGoogle(e.target.checked)} style={{ marginTop: 2 }} />
                <span>Ponerla también en su cuenta de Google <b>{correo}</b> (si no existe, se crea). Google también le pedirá cambiarla.</span>
              </label>
            )}
            {delClub && googleOk === false && (
              <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 12px' }}>
                Solo para la web: la web aún no puede tocar las cuentas de Google. Para su cuenta de Google, usa «Cuentas de los alumnos» en Alumnos, que prepara el fichero para la consola de Google.
              </p>
            )}
            {!delClub && (
              <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 12px' }}>Su ficha no tiene un correo del club: solo es para la web.</p>
            )}
            {error && <p role="alert" style={{ color: 'var(--orange)', fontSize: 13, fontWeight: 700, margin: '0 0 12px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={onCerrar} disabled={guardando}>Cancelar</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={poner} disabled={guardando}>{guardando ? 'Poniendo…' : 'Poner la contraseña'}</button>
            </div>
          </>
        ) : (
          <>
            <p className="sub" style={{ margin: '0 0 12px' }}>Apúntala o imprime la carta: después ya no se puede volver a ver.</p>
            <div style={{ background: 'var(--bg-3)', borderRadius: 12, padding: 14, display: 'grid', gap: 6, fontSize: 14, marginBottom: 12 }}>
              <div><span style={{ color: 'var(--ink-3)' }}>Usuario: </span><b>{hecho.usuario || 'su usuario o su teléfono'}</b></div>
              <div><span style={{ color: 'var(--ink-3)' }}>Contraseña: </span><b style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 16 }}>{hecho.password}</b></div>
            </div>
            {hecho.google && <p style={{ ...aviso('--teal'), margin: '0 0 12px' }}>Cuenta de Google {hecho.google === 'creada' ? 'creada' : 'actualizada'} con la misma contraseña.</p>}
            {hecho.errorGoogle && <p style={{ ...aviso('--orange'), margin: '0 0 12px' }}>En la web ya vale, pero en Google no se ha podido: {hecho.errorGoogle}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {hecho.usuario && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => imprimirCartas([{ nombre: persona.firstName || '', apellidos: persona.lastName || '', email: hecho.usuario, password: hecho.password }], { conGoogle: !!hecho.google })}>
                  <I.Print width={14} height={14} /> Imprimir la carta
                </button>
              )}
              <button type="button" className="btn btn-primary btn-sm" onClick={onCerrar}>Hecho</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Desde Alumnos: todas las cuentas del curso de una vez ──
export default function CuentasAlumnos({ onCerrar, showToast }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState('todos'); // todos | sinGoogle | sinWeb
  const [solo14, setSolo14] = useState(false);
  const [elegidos, setElegidos] = useState(new Set());
  const [enWeb, setEnWeb] = useState(true);
  const [enGoogle, setEnGoogle] = useState(false);
  const [progreso, setProgreso] = useState(null); // { hechos, total }
  const [resultado, setResultado] = useState(null); // [{...fila, password}]
  const [errorPreparar, setErrorPreparar] = useState('');
  const [verAyuda, setVerAyuda] = useState(false);
  const [cartasConGoogle, setCartasConGoogle] = useState(true);

  useEffect(() => {
    api('/api/admin/cuentas-alumnos')
      .then(d => { setDatos(d); setEnGoogle(!!d.google?.ok); })
      .catch(e => setError(e.message));
  }, []);

  const googleOk = !!datos?.google?.ok;
  const lista = useMemo(() => {
    if (!datos) return [];
    const q = buscar.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return datos.alumnos.filter(a => {
      if (solo14 && !(a.edad >= 14)) return false;
      if (filtro === 'sinGoogle' && a.google?.existe !== false) return false;
      if (filtro === 'sinWeb' && a.entroWeb) return false;
      if (!q) return true;
      return `${a.nombre} ${a.apellidos} ${a.email} ${a.actividades}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q);
    });
  }, [datos, buscar, filtro, solo14]);

  const todosMarcados = lista.length > 0 && lista.every(a => elegidos.has(a.id));
  const marcarTodos = () => setElegidos(prev => {
    const s = new Set(prev);
    if (todosMarcados) lista.forEach(a => s.delete(a.id)); else lista.forEach(a => s.add(a.id));
    return s;
  });
  const marcar = (id) => setElegidos(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  const elegidosDatos = (datos?.alumnos || []).filter(a => elegidos.has(a.id));
  const menores14 = elegidosDatos.filter(a => a.edad != null && a.edad < 14).length;
  const nuevosEnGoogle = elegidosDatos.filter(a => a.google?.existe === false).length;
  const yaUsanWeb = elegidosDatos.filter(a => a.entroWeb && !a.provisionalPendiente).length;

  async function preparar() {
    const ids = [...elegidos];
    if (!ids.length || (!enWeb && !enGoogle)) return;
    const partes = [`Se va a generar una contraseña provisional para ${ids.length} alumno${ids.length !== 1 ? 's' : ''}.`];
    if (enWeb) partes.push(`· En la web: la que tuvieran deja de valer${yaUsanWeb ? ` (${yaUsanWeb} ya entraban con la suya)` : ''}; al entrar se les pedirá una nueva.`);
    if (enGoogle) partes.push(`· En Google: se crean ${nuevosEnGoogle} cuenta${nuevosEnGoogle !== 1 ? 's' : ''} nueva${nuevosEnGoogle !== 1 ? 's' : ''} y a las demás se les cambia la contraseña.`);
    partes.push('', 'Las contraseñas solo se ven al terminar: imprime las cartas o descarga el fichero antes de cerrar.');
    if (!window.confirm(partes.join('\n'))) return;
    setErrorPreparar('');
    const hechos = [];
    setProgreso({ hechos: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i += 10) {
        try {
          const d = await post('/api/admin/cuentas-alumnos/preparar', { ids: ids.slice(i, i + 10), web: enWeb, google: enGoogle });
          hechos.push(...d.hechos);
        } catch (e) {
          hechos.push(...(e.datos?.hechos || []));
          setErrorPreparar(`${e.message} Se han preparado ${hechos.filter(h => h.password).length} de ${ids.length}; los demás no se han tocado.`);
          break;
        }
        setProgreso({ hechos: Math.min(i + 10, ids.length), total: ids.length });
      }
    } finally {
      setProgreso(null);
      setResultado(hechos);
      setElegidos(new Set());
      showToast?.('Cuentas preparadas.');
    }
  }

  const conClave = (resultado || []).filter(h => h.password);
  const cerrar = () => {
    if (conClave.length && !window.confirm('¿Cerrar? Las contraseñas ya no se podrán volver a ver. Si no has impreso las cartas ni descargado el fichero, tendrás que generarlas de nuevo.')) return;
    onCerrar();
  };

  const celda = { fontSize: 12.5, padding: '8px 10px', borderBottom: '1px solid var(--line-2)', textAlign: 'left', verticalAlign: 'middle' };
  const etiquetaGoogle = (a) => {
    if (!a.google) return <span style={{ color: 'var(--ink-3)' }}>—</span>;
    if (!a.google.existe) return <span style={{ color: 'var(--orange)', fontWeight: 700 }}>No tiene</span>;
    if (a.google.suspendida) return <span style={{ color: 'var(--ink-3)' }}>Suspendida</span>;
    return a.google.ultimoAcceso ? <span>Entró el {fmtFecha(a.google.ultimoAcceso)}</span> : <span style={{ color: 'var(--ink-3)' }}>Nunca ha entrado</span>;
  };
  const etiquetaWeb = (a) => {
    if (a.provisionalPendiente) return <span style={{ color: 'var(--purple)' }}>Provisional sin cambiar</span>;
    return a.entroWeb ? <span>Entró el {fmtFecha(a.entroWeb)}</span> : <span style={{ color: 'var(--ink-3)' }}>Nunca</span>;
  };

  return createPortal(
    <div style={fondo} role="dialog" aria-modal="true" aria-labelledby="ca-titulo">
      <div className="panel" style={{ maxWidth: 1080, width: '100%', margin: 0, maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2 id="ca-titulo" style={{ margin: 0 }}>Cuentas de los alumnos</h2>
            <p className="sub" style={{ margin: '4px 0 0' }}>
              Los alumnos de este curso con correo del club{datos ? ` (@${datos.dominio})` : ''}: una contraseña provisional para cada uno,
              en la web y en su cuenta de Google. Al entrar por primera vez se les pide poner la suya.
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={cerrar} disabled={!!progreso}><I.X width={16} height={16} /></button>
        </div>

        {error && <p role="alert" style={aviso('--orange')}>{error}</p>}
        {!datos && !error && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando…</p>}

        {datos && !resultado && (
          <>
            {googleOk ? (
              <div style={aviso('--teal')}>
                <b>La web puede crear las cuentas de Google</b> y cambiarles la contraseña.
                {datos.google.errorCuentas && <> Pero no ha podido ver cuáles existen ya ({datos.google.errorCuentas}).</>}
              </div>
            ) : (
              <div style={aviso('--orange')}>
                <b>La web aún no puede crear cuentas en Google.</b> Puedes preparar las contraseñas igual y, al terminar,
                descargar el fichero para subirlo en la consola de Google (Usuarios › Actualizar usuarios de forma masiva):
                crea las que faltan y cambia la contraseña de las que ya existen.{' '}
                <button type="button" onClick={() => setVerAyuda(v => !v)} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--ink)', textDecoration: 'underline', cursor: 'pointer' }}>
                  {verAyuda ? 'Ocultar' : 'Cómo hacer que la web las cree sola'}
                </button>
                {verAyuda && (
                  <ol style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    <li>Un superadministrador de Google, en la consola: Seguridad › Controles de API › Delegación en todo el dominio. En la cuenta de servicio de la web (la de «Correo»), <b>añadir</b> el permiso <code>https://www.googleapis.com/auth/admin.directory.user</code> sin quitar el que ya tiene.</li>
                    <li>En Google Cloud, activar la «Admin SDK API» en el proyecto de esa cuenta de servicio.</li>
                    <li>En Heroku, la variable <code>GOOGLE_ADMIN_CUENTAS</code> con el correo de ese superadministrador.</li>
                  </ol>
                )}
                {datos.google.motivo && datos.google.motivo !== 'sin-configurar' && <div style={{ marginTop: 6, color: 'var(--ink-3)' }}>Google dice: {datos.google.motivo}</div>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="search-input" style={{ flex: '1 1 220px', maxWidth: 320 }}>
                <I.Search />
                <input placeholder="Buscar por nombre, correo o actividad…" value={buscar} onChange={e => setBuscar(e.target.value)} />
              </div>
              {[['todos', `Todos (${datos.alumnos.length})`], ...(googleOk ? [['sinGoogle', 'Sin cuenta de Google']] : []), ['sinWeb', 'Nunca han entrado en la web']].map(([id, txt]) => (
                <button key={id} type="button" className={`btn btn-sm ${filtro === id ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFiltro(id)}>{txt}</button>
              ))}
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={solo14} onChange={e => setSolo14(e.target.checked)} /> Solo de 14 años o más
              </label>
            </div>

            <div style={{ overflow: 'auto', flex: 1, minHeight: 160, border: '1px solid var(--line)', borderRadius: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-3)', zIndex: 1 }}>
                  <tr>
                    <th style={{ ...celda, width: 34 }}><input type="checkbox" aria-label="Marcar todos los de la lista" checked={todosMarcados} onChange={marcarTodos} /></th>
                    <th style={celda}>Alumno</th>
                    <th style={celda}>Edad</th>
                    <th style={celda}>Usuario</th>
                    <th style={celda}>Google</th>
                    <th style={celda}>Web</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(a => (
                    <tr key={a.id} onClick={() => marcar(a.id)} style={{ cursor: 'pointer', background: elegidos.has(a.id) ? 'color-mix(in oklab, var(--teal) 8%, transparent)' : undefined }}>
                      <td style={celda}><input type="checkbox" aria-label={`Marcar a ${a.nombre}`} checked={elegidos.has(a.id)} onChange={() => marcar(a.id)} onClick={e => e.stopPropagation()} /></td>
                      <td style={celda}><b>{a.nombre} {a.apellidos}</b><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{a.actividades}</div></td>
                      <td style={celda}>{a.edad ?? '—'}</td>
                      <td style={{ ...celda, wordBreak: 'break-all' }}>{a.email}</td>
                      <td style={celda}>{etiquetaGoogle(a)}</td>
                      <td style={celda}>{etiquetaWeb(a)}</td>
                    </tr>
                  ))}
                  {!lista.length && <tr><td colSpan={6} style={{ ...celda, textAlign: 'center', color: 'var(--ink-3)', padding: 24 }}>No hay alumnos con estos filtros.</td></tr>}
                </tbody>
              </table>
            </div>
            {datos.sinCorreoClub.length > 0 && (
              <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>
                {datos.sinCorreoClub.length} alumno{datos.sinCorreoClub.length !== 1 ? 's' : ''} del curso no tiene{datos.sinCorreoClub.length !== 1 ? 'n' : ''} correo del club en su ficha y no sale{datos.sinCorreoClub.length !== 1 ? 'n' : ''} aquí
                ({datos.sinCorreoClub.slice(0, 6).map(a => `${a.nombre} ${a.apellidos}`.trim()).join(', ')}{datos.sinCorreoClub.length > 6 ? '…' : ''}). A ellos se les puede poner la contraseña provisional desde su ficha.
              </p>
            )}

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={enWeb} onChange={e => setEnWeb(e.target.checked)} /> Para entrar en la web
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: googleOk ? 'pointer' : 'not-allowed', color: googleOk ? undefined : 'var(--ink-3)' }}>
                <input type="checkbox" checked={enGoogle && googleOk} disabled={!googleOk} onChange={e => setEnGoogle(e.target.checked)} /> Crear o actualizar su cuenta de Google
              </label>
              <div style={{ flex: 1 }} />
              {progreso
                ? <span style={{ fontSize: 13, fontWeight: 700 }}>Preparando… {progreso.hechos} de {progreso.total}</span>
                : <button type="button" className="btn btn-primary btn-sm" disabled={!elegidos.size || (!enWeb && !(enGoogle && googleOk))} onClick={preparar}>
                    Preparar {elegidos.size || ''} cuenta{elegidos.size !== 1 ? 's' : ''}
                  </button>}
            </div>
            {elegidos.size > 0 && (menores14 > 0 || (enGoogle && googleOk && nuevosEnGoogle > 0)) && (
              <div style={aviso('--orange')}>
                {menores14 > 0 && <div><b>{menores14} de los elegidos tiene{menores14 !== 1 ? 'n' : ''} menos de 14 años.</b> Para darles una cuenta de Google hace falta el permiso de sus familias, y Google solo admite cuentas de menores en algunos planes de Workspace: comprobadlo antes.</div>}
                {enGoogle && googleOk && nuevosEnGoogle > 0 && <div><b>Se crearán {nuevosEnGoogle} cuenta{nuevosEnGoogle !== 1 ? 's' : ''} nueva{nuevosEnGoogle !== 1 ? 's' : ''} en Google.</b> Según vuestro plan, cada cuenta puede ocupar una licencia de pago.</div>}
              </div>
            )}
          </>
        )}

        {resultado && (
          <>
            {errorPreparar && <p role="alert" style={aviso('--orange')}>{errorPreparar}</p>}
            <div style={aviso('--teal')}>
              <b>{conClave.length} cuenta{conClave.length !== 1 ? 's' : ''} preparada{conClave.length !== 1 ? 's' : ''}.</b> Estas contraseñas solo se ven ahora: imprime las cartas
              {!googleOk || !enGoogle ? ' y descarga el fichero para Google' : ''} antes de cerrar.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={!conClave.length} onClick={() => imprimirCartas(conClave, { conGoogle: cartasConGoogle })}>
                <I.Print width={14} height={14} /> Imprimir las cartas
              </button>
              <button type="button" className="btn btn-outline btn-sm" disabled={!conClave.length} onClick={() => descargarCsv(conClave)}>
                <I.Download width={14} height={14} /> Descargar el fichero para Google
              </button>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={cartasConGoogle} onChange={e => setCartasConGoogle(e.target.checked)} /> Las cartas explican también su cuenta de Google
              </label>
            </div>
            <div style={{ overflow: 'auto', flex: 1, minHeight: 120, border: '1px solid var(--line)', borderRadius: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-3)' }}>
                  <tr><th style={celda}>Alumno</th><th style={celda}>Usuario</th><th style={celda}>Contraseña provisional</th><th style={celda}>Resultado</th></tr>
                </thead>
                <tbody>
                  {resultado.map(h => (
                    <tr key={h.id}>
                      <td style={celda}><b>{h.nombre} {h.apellidos}</b></td>
                      <td style={{ ...celda, wordBreak: 'break-all' }}>{h.email}</td>
                      <td style={{ ...celda, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13.5 }}>{h.password || '—'}</td>
                      <td style={celda}>
                        {h.error ? <span style={{ color: 'var(--orange)' }}>{h.error}</span> : (
                          <>
                            {h.web && 'Web lista'}
                            {h.google && `${h.web ? ' · ' : ''}Google: ${h.google === 'creada' ? 'cuenta creada' : 'contraseña cambiada'}`}
                            {h.errorGoogle && <span style={{ color: 'var(--orange)' }}>{h.web ? ' · ' : ''}Google: {h.errorGoogle}</span>}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={cerrar}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
