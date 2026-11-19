import React, { useCallback, useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// LinkedIn (#651, fase 3): los perfiles y páginas conectados. «Conectar mi
// perfil» funciona en cuanto está la app; «Conectar páginas de empresa», cuando
// LinkedIn la apruebe. El permiso dura 60 días: aquí se ve hasta cuándo y se
// vuelve a conectar. A la vuelta se llega con ?linkedin=… (conectado, cancelado o
// error). Los conectan el Equipo IT y la dirección.
// ─────────────────────────────────────────────────────────────────────────────
const caja = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, display: 'grid', gap: 8 };
const suave = { fontSize: 12, color: 'var(--ink-3)' };
const fecha = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const AZUL = '#0A66C2';

async function pedir(url, opciones = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido.');
  return d;
}

export default function ConexionLinkedIn() {
  const [c, setC] = useState(null);
  const [vuelta, setVuelta] = useState(null);
  const [ayuda, setAyuda] = useState(false);
  const cargar = useCallback(() => pedir('/api/admin/linkedin/cuentas').then(setC).catch(() => setC({ error: true })), []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const li = q.get('linkedin');
    if (!li) return;
    if (li === 'conectado') setVuelta({ tipo: 'ok', texto: `Conectado en LinkedIn: ${q.get('cuentas') || ''}. Ya se puede publicar desde Publicaciones.` });
    else if (li === 'cancelado') setVuelta({ tipo: 'aviso', texto: 'No se ha conectado: se canceló en LinkedIn.' });
    else setVuelta({ tipo: 'error', texto: q.get('motivo') || 'No se ha podido conectar.' });
    ['linkedin', 'cuentas', 'motivo'].forEach(k => q.delete(k));
    window.history.replaceState(null, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}`);
  }, []);
  async function quitar(x) {
    if (!window.confirm(`¿Quitar «${x.nombre}» de LinkedIn? Lo que tenga programado para ahí no saldrá.`)) return;
    try { await pedir(`/api/admin/linkedin/cuentas/${x.id}`, { method: 'DELETE' }); cargar(); } catch (e) { alert(e.message); }
  }
  if (!c || c.error) return null;
  const color = vuelta?.tipo === 'error' ? 'var(--orange)' : vuelta?.tipo === 'ok' ? 'var(--teal)' : '#B45309';
  const boton = { background: AZUL, borderColor: AZUL, color: '#fff' };
  return (
    <div style={caja}>
      {vuelta && <div style={{ fontSize: 13, fontWeight: 700, color }}>{vuelta.texto}</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px', display: 'grid', gap: 2 }}>
          <b style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6, background: AZUL, color: '#fff', fontSize: 11, fontWeight: 900 }}>in</span>
            {c.cuentas.length ? `LinkedIn: ${c.cuentas.length === 1 ? c.cuentas[0].nombre : `${c.cuentas.length} cuentas`}` : 'LinkedIn sin conectar'}
          </b>
          <span style={suave}>Para publicar en un perfil personal o en la página de la empresa. LinkedIn pide volver a conectar cada 60 días.</span>
        </div>
        {c.puedeCambiar ? (c.listo ? (
          <>
            <a className="btn btn-sm btn-primary" href="/api/admin/linkedin/conectar?modo=perfil" style={boton}>Conectar mi perfil</a>
            <a className="btn btn-sm btn-outline" href="/api/admin/linkedin/conectar?modo=empresa" title="Solo cuando LinkedIn haya aprobado la app (Community Management API)">Conectar páginas de empresa</a>
          </>
        ) : <span style={{ fontSize: 12, color: 'var(--orange)' }}>Falta la app de LinkedIn en Heroku (LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET).</span>)
          : <span style={suave}>Lo conectan el Equipo IT o la dirección.</span>}
      </div>
      {c.cuentas.map(x => {
        const dias = x.caduca ? Math.ceil((new Date(x.caduca) - Date.now()) / 86_400_000) : null;
        return (
          <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, padding: '6px 10px', borderRadius: 10, background: 'var(--bg-3)' }}>
            <b>{x.nombre}</b>
            <span style={suave}>{x.tipo === 'empresa' ? 'página de empresa' : 'perfil personal'}</span>
            {dias != null && (dias <= 0
              ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>Caducado: vuelve a conectar</span>
              : <span style={{ fontSize: 12, color: dias <= 10 ? 'var(--orange)' : 'var(--ink-3)', fontWeight: dias <= 10 ? 700 : 400 }}>vale hasta el {fecha(x.caduca)}</span>)}
            <div style={{ flex: 1 }} />
            {c.puedeCambiar && <button type="button" className="btn btn-sm btn-ghost" onClick={() => quitar(x)}>Quitar</button>}
          </div>
        );
      })}
      {c.puedeCambiar && (
        <div>
          <button type="button" onClick={() => setAyuda(v => !v)} style={{ font: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--purple)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
            {ayuda ? '▾' : '▸'} Preparar la app de LinkedIn (una sola vez)
          </button>
          {ayuda && (
            <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--ink-2)', display: 'grid', gap: 4 }}>
              <li>En developer.linkedin.com › «Create app»: nombre «AIM Education Web», la página de LinkedIn de AIM Education y el logo. Un administrador de la página tiene que verificarla (LinkedIn le manda un enlace).</li>
              <li>En «Products», añade «Sign In with LinkedIn using OpenID Connect» y «Share on LinkedIn» (se dan al momento: con eso ya se publica en perfiles).</li>
              <li>Para la página de empresa, pide también «Community Management API» (LinkedIn la revisa: política de privacidad, https://www.aimeducation.es/legal/privacidad, y un vídeo de cómo se usa).</li>
              <li>En «Auth», en «Authorized redirect URLs», pon <code style={{ userSelect: 'all' }}>{c.direccionVuelta}</code></li>
              <li>Copia el «Client ID» y el «Client Secret» a Heroku como LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET.</li>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
