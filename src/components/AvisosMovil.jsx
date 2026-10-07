import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';
import { plataformaApp, plugin, quitarOyente, activarAvisos, desactivarAvisos, estadoAvisos, guardarPreferenciasAvisos, leerDispositivo } from '../app-movil.js';

// ─────────────────────────────────────────────────────────────────────────────
// Avisos en este móvil (#218): solo dentro de la app. En Android llegan por una
// conexión propia con el club (sin servicios de Google), con su notificación
// fija «Conectado»; en iPhone, por Apple.
// ─────────────────────────────────────────────────────────────────────────────

const GRUPOS = [
  ['pagos', 'Pagos', 'Recibos nuevos por pagar.'],
  ['clases', 'Clases y cierres', 'Clases individuales por confirmar, días que cierra el centro, plazas libres.'],
  ['soporte', 'Soporte', 'Cuando el club te contesta.'],
  ['brickslab', 'Brickslab', 'Sets entregados y votaciones.'],
  ['fotos', 'Fotos', 'Álbumes nuevos donde sale alguien de la familia.'],
];
const CLAVE_CERRADA = 'aim_avisos_tarjeta_cerrada';

const textoMotivo = (m) => (m === 'permiso'
  ? 'El móvil no deja mostrar avisos de la app. Permítelo en los ajustes de notificaciones y vuelve a intentarlo.'
  : m === 'arranque' ? 'El móvil no ha dejado arrancar los avisos. Abre la app de nuevo y vuelve a intentarlo.' : m);

// Pasos de cada marca para que el móvil no cierre la conexión (dontkillmyapp.com).
function pasosFabricante(fab) {
  const f = String(fab || '').toLowerCase();
  if (/xiaomi|redmi|poco/.test(f)) return ['En Ajustes → Aplicaciones → AIM Education, activa «Autoinicio».', 'En «Ahorro de batería» de la app, elige «Sin restricciones».', 'En Recientes, mantén pulsada la app y toca el candado para que no se cierre.'];
  if (/huawei|honor/.test(f)) return ['En Ajustes → Batería → Inicio de aplicaciones, busca AIM Education.', 'Desactiva «Gestionar automáticamente» y deja activadas las tres opciones (inicio automático, secundario y en segundo plano).'];
  if (/samsung/.test(f)) return ['En Ajustes → Aplicaciones → AIM Education → Batería, elige «Sin restricciones».', 'En Ajustes → Batería → Límites de uso en segundo plano, comprueba que no está en «Aplicaciones en suspensión profunda».'];
  if (/oppo|oneplus|realme|vivo/.test(f)) return ['En Ajustes → Aplicaciones → AIM Education, permite la actividad en segundo plano y el inicio automático.', 'En el uso de batería de la app, elige «Sin restricciones».'];
  return ['En el uso de batería de la app, elige «Sin restricciones» (o «No optimizar»).'];
}

// En Inicio: invita a activarlos mientras no estén.
export function TarjetaAvisos() {
  const [ver, setVer] = useState(false);
  const [estado, setEstado] = useState('');
  useEffect(() => {
    let cerrada = false;
    try { cerrada = localStorage.getItem(CLAVE_CERRADA) === '1'; } catch { /* nada */ }
    if (cerrada || !plataformaApp()) return;
    estadoAvisos().then(e => setVer(!e.activo)).catch(() => {});
  }, []);
  if (!ver) return null;
  const cerrar = () => { try { localStorage.setItem(CLAVE_CERRADA, '1'); } catch { /* nada */ } setVer(false); };
  async function activar() {
    setEstado('activando');
    try {
      const r = await activarAvisos();
      if (r.activo) { setEstado('hecho'); setTimeout(() => setVer(false), 2500); }
      else setEstado(textoMotivo(r.motivo));
    } catch (e) { setEstado(e.message || 'No se ha podido.'); }
  }
  return (
    <div className="panel app-avisos-tarjeta">
      <span className="ico"><I.Bell /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>Recibe los avisos al momento</b>
        <p>Cierres del centro, clases individuales por confirmar, respuestas de secretaría, recibos y fotos nuevas.</p>
        {estado === 'hecho'
          ? <p style={{ color: 'var(--teal)', fontWeight: 700 }}>Listo: ya te llegarán los avisos.</p>
          : estado && estado !== 'activando' ? <p style={{ color: 'var(--orange)' }}>{estado}</p> : null}
        {estado !== 'hecho' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={estado === 'activando'} onClick={activar}>
              {estado === 'activando' ? 'Activando…' : 'Activar avisos'}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={cerrar}>Ahora no</button>
          </div>
        )}
      </div>
    </div>
  );
}

const hace = (ms) => {
  if (!ms) return null;
  const s = Math.max(0, Math.round((Date.now() - Number(ms)) / 1000));
  return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`;
};

// En Ajustes: activar o no, qué avisos, y (Android) cómo va la conexión.
export function AjustesAvisos() {
  const plat = plataformaApp();
  const [e, setE] = useState(null);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(() => estadoAvisos().then(setE).catch(() => setE({ activo: false, preferencias: {} })), []);
  useEffect(() => {
    if (!plat) return undefined;
    cargar();
    // El estado de la conexión, al momento (Android) y al volver a la app.
    const A = plat === 'android' ? plugin('AimAvisos') : null;
    const h = A?.addListener?.('estado', (nativo) => setE(x => (x ? { ...x, nativo } : x)));
    const vuelve = () => cargar();
    window.addEventListener('aim-app-vuelve', vuelve);
    return () => { if (h) quitarOyente(h); window.removeEventListener('aim-app-vuelve', vuelve); };
  }, [plat, cargar]);
  if (!plat) return null;

  async function cambiarActivo(v) {
    setOcupado(true); setAviso('');
    try {
      if (v) {
        const r = await activarAvisos();
        if (!r.activo) setAviso(textoMotivo(r.motivo));
      } else await desactivarAvisos();
    } catch (err) { setAviso(err.message || 'No se ha podido.'); }
    finally { setOcupado(false); cargar(); }
  }
  async function cambiarGrupo(g, v) {
    setE(x => ({ ...x, preferencias: { ...x.preferencias, [g]: v } }));
    try { await guardarPreferenciasAvisos({ [g]: v }); setAviso('Guardado.'); }
    catch (err) { setAviso(err.message || 'No se ha podido guardar.'); cargar(); }
  }
  const abrir = (m) => plugin('AimAvisos')?.[m]?.().catch(() => setAviso('No se han podido abrir los ajustes del móvil.'));

  const n = e?.nativo;
  const fila = { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' };
  const interruptor = (on, onCambio, etiqueta) => (
    <button type="button" role="switch" aria-checked={!!on} aria-label={etiqueta} disabled={ocupado} onClick={() => onCambio(!on)}
      className={`app-interruptor${on ? ' is-on' : ''}`}><span /></button>
  );

  return (
    <div style={{ marginTop: 24, borderTop: '1px solid var(--line)', paddingTop: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)' }}>
        Avisos en este móvil
      </div>
      {!e ? <p className="sub">Cargando…</p> : (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <div style={{ ...fila, border: '1px solid var(--line)', borderRadius: 14, padding: 14, background: 'var(--bg-2)' }}>
            <div>
              <div style={{ fontWeight: 800 }}>Recibir avisos</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                {e.activo
                  ? (plat === 'android' ? (n?.conectado ? `Conectado${n.ultimoContacto ? ` · ${hace(n.ultimoContacto)}` : ''}` : 'Reconectando…') : 'Activados')
                  : 'Desactivados'}
              </div>
            </div>
            {interruptor(e.activo, cambiarActivo, 'Recibir avisos')}
          </div>

          {e.activo && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: '6px 14px', background: 'var(--bg-2)' }}>
              {GRUPOS.map(([g, t, d], i) => (
                <div key={g} style={{ ...fila, padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{t}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{d}</div>
                  </div>
                  {interruptor(e.preferencias?.[g] !== false, (v) => cambiarGrupo(g, v), t)}
                </div>
              ))}
            </div>
          )}

          {aviso && <p style={{ margin: 0, fontSize: 13, color: aviso === 'Guardado.' ? 'var(--teal)' : 'var(--orange)' }}>{aviso}</p>}

          {plat === 'android' && e.activo && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 14, background: 'var(--bg-2)', display: 'grid', gap: 10, fontSize: 13.5, lineHeight: 1.55 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Mejorar la fiabilidad</div>
              <p style={{ margin: 0, color: 'var(--ink-2)' }}>
                Para que los avisos lleguen al momento, la app mantiene una conexión con el club y por eso verás la notificación
                silenciosa «Conectado». Puedes ocultarla: mantenla pulsada y desactiva «Conexión con AIM».
              </p>
              <div style={fila}>
                <span>Batería sin restricciones: <b style={{ color: n?.bateriaSinRestriccion ? 'var(--teal)' : 'var(--orange)' }}>{n?.bateriaSinRestriccion ? 'sí' : 'no'}</b></span>
                {!n?.bateriaSinRestriccion && <button type="button" className="btn btn-sm btn-outline" onClick={() => abrir('abrirAjustesBateria')}>Cambiarlo</button>}
              </div>
              <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--ink-2)' }}>
                {pasosFabricante(n?.fabricante).map(p => <li key={p}>{p}</li>)}
              </ol>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => abrir('abrirAjustesApp')}>Ajustes de la app</button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => abrir('abrirAjustesAvisos')}>Ajustes de notificaciones</button>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)' }}>
                Si fuerzas la detención de la app, no llegarán avisos hasta que la vuelvas a abrir. Todo lo importante sigue
                apareciendo además en la campanita.
              </p>
            </div>
          )}
          {!e.activo && leerDispositivo() === null && plat === 'ios' && e.permiso === 'denied' && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Las notificaciones de la app están desactivadas en Ajustes del iPhone → AIM Education → Notificaciones.</p>
          )}
        </div>
      )}
    </div>
  );
}
