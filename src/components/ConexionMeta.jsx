import React, { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// La conexión con Facebook e Instagram (#468): cómo está y el botón «Conectar
// con Facebook» (todos los permisos de una vez; se elige la página y se guarda
// sola). Sale en Redes sociales y, si falta algo, en Publicaciones. A la vuelta
// de Facebook se llega a Redes sociales con ?meta=… (conectado, elegir página,
// cancelado o error). La conectan el Equipo IT y la dirección.
// Varias cuentas (#651): se pueden marcar varias páginas (AIM Education,
// Brickslab…), cada una con su Instagram; una es la principal.
// ─────────────────────────────────────────────────────────────────────────────

const caja = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, display: 'grid', gap: 8 };
const suave = { fontSize: 12, color: 'var(--ink-3)' };
const fecha = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

async function pedir(url, opciones = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido.');
  return d;
}

export default function ConexionMeta({ onCambio }) {
  const [c, setC] = useState(null);
  const [vuelta, setVuelta] = useState(null);       // lo que dice la vuelta de Facebook
  const [paginas, setPaginas] = useState(null);     // para elegir, si lleva varias
  const [marcadas, setMarcadas] = useState(new Set());
  const [ayuda, setAyuda] = useState(false);
  const cargar = useCallback(() => pedir('/api/admin/meta/conexion').then(setC).catch(() => setC({ error: true })), []);
  useEffect(() => { cargar(); }, [cargar]);

  // La vuelta de Facebook (?meta=…): se lee una vez y se quita de la dirección.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const meta = q.get('meta');
    if (!meta) return;
    // La clave se guarda ya: justo abajo se quita de la dirección y la lista de
    // páginas llega después (antes se leía entonces, vacía, y salía «Ha caducado»).
    const clave = q.get('clave') || '';
    if (meta === 'elegir') pedir(`/api/admin/meta/elegir?clave=${encodeURIComponent(clave)}`).then(d => { setPaginas({ clave, lista: d.paginas }); setMarcadas(new Set(d.paginas.filter(p => !p.conectada).length === 1 ? d.paginas.filter(p => !p.conectada).map(p => p.id) : [])); }).catch(e => setVuelta({ tipo: 'error', texto: e.message }));
    else if (meta === 'conectado') { setVuelta({ tipo: 'ok', texto: 'Conectado. Ya se pueden recibir mensajes y publicar en Facebook e Instagram.' }); onCambio?.(); }
    else if (meta === 'cancelado') setVuelta({ tipo: 'aviso', texto: 'No se ha conectado: se canceló en Facebook.' });
    else setVuelta({ tipo: 'error', texto: q.get('motivo') || 'No se ha podido conectar.' });
    ['meta', 'clave', 'motivo'].forEach(k => q.delete(k));
    window.history.replaceState(null, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function elegir() {
    try {
      const d = await pedir('/api/admin/meta/elegir', { method: 'POST', body: JSON.stringify({ clave: paginas.clave, paginaIds: [...marcadas] }) });
      setPaginas(null); setVuelta({ tipo: 'ok', texto: d.conectadas?.length > 1 ? `Conectadas: ${d.conectadas.join(', ')}.` : `Conectada la página «${d.conectadas?.[0] || ''}».` });
      cargar(); onCambio?.();
    } catch (e) { setPaginas(null); setVuelta({ tipo: 'error', texto: e.message }); }
  }
  async function hacerPrincipal(x) {
    try { await pedir(`/api/admin/meta/cuentas/${x.id}/principal`, { method: 'POST' }); cargar(); onCambio?.(); } catch (e) { alert(e.message); }
  }
  async function quitarCuenta(x) {
    if (!window.confirm(`¿Quitar «${x.pagina.nombre}»${x.instagram ? ` (e Instagram @${x.instagram.usuario})` : ''}? Dejarán de llegar sus mensajes y de salir lo que tenga programado.`)) return;
    try { await pedir(`/api/admin/meta/cuentas/${x.id}`, { method: 'DELETE' }); cargar(); onCambio?.(); } catch (e) { alert(e.message); }
  }
  async function desconectar() {
    if (!window.confirm('¿Quitar la conexión con Facebook? Dejarán de llegar los mensajes y de salir las publicaciones hasta que se vuelva a conectar.')) return;
    try { await pedir('/api/admin/meta/desconectar', { method: 'POST' }); cargar(); onCambio?.(); } catch (e) { alert(e.message); }
  }

  if (!c) return null;
  if (c.error) return null;
  const caducaPronto = c.datosCaducan && new Date(c.datosCaducan) - Date.now() < 14 * 86_400_000;
  const color = vuelta?.tipo === 'error' ? 'var(--orange)' : vuelta?.tipo === 'ok' ? 'var(--teal)' : '#B45309';
  return (
    <div style={caja}>
      {vuelta && <div style={{ fontSize: 13, fontWeight: 700, color }}>{vuelta.texto}</div>}
      {paginas && (
        <div style={{ display: 'grid', gap: 8 }}>
          <b style={{ fontSize: 14 }}>¿Qué páginas conectas? Se pueden marcar varias.</b>
          <div style={{ display: 'grid', gap: 4 }}>
            {paginas.lista.map(p => (
              <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, cursor: p.conectada ? 'default' : 'pointer' }}>
                <input type="checkbox" disabled={p.conectada} checked={p.conectada || marcadas.has(p.id)}
                  onChange={e => setMarcadas(m => { const n = new Set(m); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                <b>{p.nombre}</b>{p.instagram ? <span style={suave}>e Instagram @{p.instagram}</span> : <span style={suave}>sin Instagram vinculado</span>}
                {p.conectada && <span style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700 }}>ya conectada (renovada)</span>}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={!marcadas.size} onClick={elegir}>Conectar {marcadas.size > 1 ? `las ${marcadas.size}` : 'la marcada'}</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPaginas(null)}>Ahora no</button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px', display: 'grid', gap: 2, minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>
            {c.origen === 'boton' && c.cuentas?.length > 1 ? `Conectadas con Facebook: ${c.cuentas.length} cuentas`
              : c.origen === 'boton' ? `Conectado con Facebook: ${c.pagina?.nombre}${c.instagram?.usuario ? ` e Instagram @${c.instagram.usuario}` : ''}`
              : c.origen === 'heroku' ? 'Conectado con el token puesto a mano en Heroku'
              : 'Facebook e Instagram sin conectar'}
          </b>
          <span style={suave}>
            {c.origen === 'boton' && <>Lo conectó {c.conectadoPor || 'alguien del equipo'} el {fecha(c.conectadoAt)}. {c.datosCaducan && <>Meta pide volver a conectar cada 90 días: hasta el {fecha(c.datosCaducan)} (la campanita avisa antes).</>}</>}
            {c.origen === 'heroku' && 'Solo tiene algunos permisos. Con «Conectar con Facebook» se dan todos de una vez (mensajes, publicar y estadísticas) y se deja de tocar Heroku.'}
            {!c.origen && 'Con «Conectar con Facebook» se inicia sesión en Facebook, se aceptan los permisos y se elige la página del club. Nada más.'}
          </span>
          {c.origen === 'boton' && c.faltan.length > 0 && <span style={{ fontSize: 12, color: '#B45309' }}>No se aceptaron todos los permisos (faltan {c.faltan.join(', ')}): vuelve a conectar y déjalos todos marcados.</span>}
          {c.origen === 'boton' && !c.instagram && <span style={{ fontSize: 12, color: '#B45309' }}>La página no tiene una cuenta de Instagram profesional vinculada (se vincula en la configuración de la página de Facebook).</span>}
          {c.avisos?.map((a, i) => <span key={i} style={{ fontSize: 12, color: '#B45309' }}>{a}</span>)}
          {caducaPronto && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>El acceso de Meta caduca pronto: vuelve a pulsar «Conectar con Facebook».</span>}
        </div>
        {c.puedeCambiar ? (
          <>
            {c.listo
              ? <a className="btn btn-sm btn-primary" href="/api/admin/meta/conectar" style={{ background: '#0866FF', borderColor: '#0866FF', color: '#fff' }}>{c.origen === 'boton' ? 'Volver a conectar' : 'Conectar con Facebook'}</a>
              : <span style={{ fontSize: 12, color: 'var(--orange)' }}>Falta la clave secreta de la app de Meta (META_APP_SECRET) en Heroku.</span>}
            {c.origen === 'boton' && <button type="button" className="btn btn-sm btn-ghost" onClick={desconectar}>{c.cuentas?.length > 1 ? 'Desconectar todas' : 'Desconectar'}</button>}
          </>
        ) : <span style={suave}>La conectan el Equipo IT o la dirección.</span>}
      </div>
      {c.cuentas?.length > 1 && (
        <div style={{ display: 'grid', gap: 6 }}>
          {c.cuentas.map(x => (
            <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, padding: '6px 10px', borderRadius: 10, background: 'var(--bg-3)' }}>
              <b>{x.pagina.nombre}</b>
              <span style={suave}>{x.instagram?.usuario ? `e Instagram @${x.instagram.usuario}` : 'sin Instagram vinculado'}</span>
              {x.principal && <span title="A la que va lo que no dice otra cuenta: las publicaciones automáticas, las noticias…" style={{ fontSize: 11, fontWeight: 800, color: 'var(--purple)', background: 'color-mix(in oklab, var(--purple) 12%, var(--bg-2))', padding: '1px 8px', borderRadius: 999 }}>PRINCIPAL</span>}
              {x.faltan?.length > 0 && <span style={{ fontSize: 11, color: '#B45309' }}>le faltan permisos</span>}
              <div style={{ flex: 1 }} />
              {c.puedeCambiar && !x.principal && <button type="button" className="btn btn-sm btn-ghost" onClick={() => hacerPrincipal(x)}>Hacer principal</button>}
              {c.puedeCambiar && <button type="button" className="btn btn-sm btn-ghost" onClick={() => quitarCuenta(x)}>Quitar</button>}
            </div>
          ))}
          <span style={suave}>Para añadir otra página, «Volver a conectar» y márcala. Lo automático (las noticias y las historias de cada día) va a la principal.</span>
        </div>
      )}
      {c.puedeCambiar && (
        <div>
          <button type="button" onClick={() => setAyuda(x => !x)} style={{ font: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--purple)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
            {ayuda ? '▾' : '▸'} Si Facebook da un error al conectar (preparar la app de Meta, una sola vez)
          </button>
          {ayuda && (
            <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--ink-2)', display: 'grid', gap: 4 }}>
              <li>En developers.facebook.com, abre la app (identificador {c.appId}).</li>
              <li>Añade el producto «Inicio de sesión con Facebook» si no está.</li>
              <li>En su configuración, en «URI de redireccionamiento de OAuth válidos», pon: <code style={{ userSelect: 'all' }}>{c.direccionVuelta}</code></li>
              <li>En los casos de uso / permisos de la app, que estén añadidos: pages_show_list, pages_read_engagement, pages_manage_metadata, pages_messaging, pages_manage_posts, read_insights, instagram_basic, instagram_manage_messages, instagram_content_publish, instagram_manage_insights y business_management.</li>
              <li>Quien conecte tiene que ser administrador de la página del club (y tener un rol en la app mientras no esté revisada por Meta).</li>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
