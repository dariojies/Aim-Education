import React, { useCallback, useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Los canales de YouTube conectados (#651, fase 2): «Conectar con YouTube» lleva
// a Google, se elige la cuenta (o el canal de marca) y se vuelve aquí con
// ?youtube=… (conectado, cancelado o error). Se pueden conectar varios. Los
// conectan el Equipo IT y la dirección.
// ─────────────────────────────────────────────────────────────────────────────
const caja = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, display: 'grid', gap: 8 };
const suave = { fontSize: 12, color: 'var(--ink-3)' };

async function pedir(url, opciones = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido.');
  return d;
}

export default function ConexionYouTube() {
  const [c, setC] = useState(null);
  const [vuelta, setVuelta] = useState(null);
  const [ayuda, setAyuda] = useState(false);
  const cargar = useCallback(() => pedir('/api/admin/youtube/cuentas').then(setC).catch(() => setC({ error: true })), []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const yt = q.get('youtube');
    if (!yt) return;
    if (yt === 'conectado') setVuelta({ tipo: 'ok', texto: `Conectado el canal${q.get('canal') ? ` «${q.get('canal')}»` : ''}. Ya se pueden subir vídeos desde Publicaciones.` });
    else if (yt === 'cancelado') setVuelta({ tipo: 'aviso', texto: 'No se ha conectado: se canceló en Google.' });
    else setVuelta({ tipo: 'error', texto: q.get('motivo') || 'No se ha podido conectar.' });
    ['youtube', 'canal', 'motivo'].forEach(k => q.delete(k));
    window.history.replaceState(null, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}`);
  }, []);
  async function quitar(x) {
    if (!window.confirm(`¿Quitar el canal «${x.nombre}»? Lo que tenga programado para YouTube no saldrá.`)) return;
    try { await pedir(`/api/admin/youtube/cuentas/${x.id}`, { method: 'DELETE' }); cargar(); } catch (e) { alert(e.message); }
  }
  if (!c || c.error) return null;
  const color = vuelta?.tipo === 'error' ? 'var(--orange)' : vuelta?.tipo === 'ok' ? 'var(--teal)' : '#B45309';
  return (
    <div style={caja}>
      {vuelta && <div style={{ fontSize: 13, fontWeight: 700, color }}>{vuelta.texto}</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px', display: 'grid', gap: 2 }}>
          <b style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6, background: '#FF0000', color: '#fff', fontSize: 11 }}>▶</span>
            {c.canales.length ? `YouTube: ${c.canales.length === 1 ? c.canales[0].nombre : `${c.canales.length} canales`}` : 'YouTube sin conectar'}
          </b>
          <span style={suave}>Para subir vídeos desde Publicaciones. Con «Conectar con YouTube» se entra con la cuenta de Google del canal y se acepta.</span>
        </div>
        {c.puedeCambiar ? (c.listo
          ? <a className="btn btn-sm btn-primary" href="/api/admin/youtube/conectar" style={{ background: '#FF0000', borderColor: '#FF0000', color: '#fff' }}>{c.canales.length ? 'Conectar otro canal' : 'Conectar con YouTube'}</a>
          : <span style={{ fontSize: 12, color: 'var(--orange)' }}>Falta el acceso de Google en Heroku (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).</span>)
          : <span style={suave}>Lo conectan el Equipo IT o la dirección.</span>}
      </div>
      {c.canales.map(x => (
        <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '6px 10px', borderRadius: 10, background: 'var(--bg-3)' }}>
          <b>{x.nombre}</b>
          <a href={`https://www.youtube.com/channel/${x.canalId}`} target="_blank" rel="noreferrer" style={{ ...suave, color: 'var(--purple)' }}>ver el canal ↗</a>
          <div style={{ flex: 1 }} />
          {c.puedeCambiar && <button type="button" className="btn btn-sm btn-ghost" onClick={() => quitar(x)}>Quitar</button>}
        </div>
      ))}
      {c.puedeCambiar && (
        <div>
          <button type="button" onClick={() => setAyuda(v => !v)} style={{ font: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--purple)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
            {ayuda ? '▾' : '▸'} Si Google da un error al conectar (preparar Google Cloud, una sola vez)
          </button>
          {ayuda && (
            <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--ink-2)', display: 'grid', gap: 4 }}>
              <li>En console.cloud.google.com, el proyecto de «Entrar con Google»: APIs y servicios › Biblioteca › activa «YouTube Data API v3».</li>
              <li>En Credenciales, el ID de cliente de la web: en «URI de redireccionamiento autorizados» añade <code style={{ userSelect: 'all' }}>{c.direccionVuelta}</code></li>
              <li>Si la pantalla de consentimiento es «Interna», el canal tiene que llevarlo una cuenta @aimeducation.es (o un canal de marca que gestione una de ellas).</li>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
