import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Objetos perdidos (ticket #208): se sube una foto, el día en que se encontró y
// el plazo para recogerlo (2 meses por defecto). Mientras está en plazo sale en
// "En custodia"; pasado el plazo (o al recogerse) pasa al "Registro".
// ─────────────────────────────────────────────────────────────────────────────

async function req(path, opts = {}) {
  const r = await fetch(path, {
    credentials: 'include', cache: 'no-store',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Error de conexión.');
  return d;
}

const inputCss = {
  fontFamily: 'inherit', fontSize: 14, padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', minWidth: 0, width: '100%',
};
const campo = { display: 'grid', gap: 5 };
const label = { fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' };
const fmtFecha = (f) => f ? new Date(String(f).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const hoyIso = () => new Date().toISOString().slice(0, 10);

// Suma meses a una fecha ISO y devuelve ISO.
function masMeses(iso, meses) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}
// Días que quedan hasta el plazo (negativo si ya pasó).
function diasHasta(iso) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  return Math.round((d - hoy) / 86400000);
}

function leerImagen(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 3 * 1024 * 1024) return reject(new Error('La foto no puede pasar de 3 MB.'));
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function Fila({ o, onRecoger, onReabrir, onBorrar }) {
  const [conf, setConf] = useState(false);
  const dias = diasHasta(o.plazo);
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--bg-1)' }}>
      <div style={{ width: 54, height: 54, flexShrink: 0, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-3)', display: 'grid', placeItems: 'center' }}>
        {o.tieneFoto
          ? <img src={`/api/admin/objetos/${o.id}/foto`} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <I.Search style={{ color: 'var(--ink-3)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{o.descripcion}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          Encontrado el {fmtFecha(o.fechaEncontrado)}
          {o.situacion === 'recogido'
            ? ` · recogido el ${fmtFecha(o.recogidoAt)}${o.recogidoNota ? ` · ${o.recogidoNota}` : ''}`
            : o.situacion === 'caducado'
              ? ` · plazo vencido el ${fmtFecha(o.plazo)}`
              : ` · plazo hasta ${fmtFecha(o.plazo)} (${dias} día${dias !== 1 ? 's' : ''})`}
        </div>
      </div>
      {o.situacion === 'recogido'
        ? <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--green, #16a34a)' }}>Recogido</span>
        : o.situacion === 'caducado'
          ? <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--orange)' }}>Plazo vencido</span>
          : null}
      <div style={{ display: 'flex', gap: 4 }}>
        {o.situacion !== 'recogido'
          ? <button className="btn btn-sm btn-outline" onClick={() => onRecoger(o)}>Marcar recogido</button>
          : <button className="btn btn-sm btn-outline" onClick={() => onReabrir(o)}>Reabrir</button>}
        {conf
          ? <button className="btn btn-sm" style={{ background: 'var(--red, #dc2626)', color: '#fff' }} onClick={() => onBorrar(o)}>¿Seguro?</button>
          : <button className="icon-btn danger" title="Borrar" onClick={() => setConf(true)}><I.Trash /></button>}
      </div>
    </div>
  );
}

export default function AdminObjetosPerdidos({ showToast }) {
  const [objetos, setObjetos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState(false);
  const [verRegistro, setVerRegistro] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Formulario
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [plazo, setPlazo] = useState(masMeses(hoyIso(), 2));
  const [plazoTocado, setPlazoTocado] = useState(false);
  const [foto, setFoto] = useState(null);
  const [errFoto, setErrFoto] = useState('');

  const aviso = useCallback((m, t) => showToast ? showToast(m, t) : alert(m), [showToast]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { const d = await req('/api/admin/objetos'); setObjetos(d.objetos || []); }
    catch (e) { aviso(e.message, 'error'); }
    finally { setCargando(false); }
  }, [aviso]);
  useEffect(() => { cargar(); }, [cargar]);

  // El plazo por defecto = fecha encontrado + 2 meses, mientras no se toque.
  useEffect(() => { if (!plazoTocado) setPlazo(masMeses(fecha, 2)); }, [fecha, plazoTocado]);

  const enCustodia = useMemo(() => objetos.filter(o => o.situacion === 'activo'), [objetos]);
  const registro = useMemo(() => objetos.filter(o => o.situacion !== 'activo'), [objetos]);

  function resetForm() {
    setDescripcion(''); setFecha(hoyIso()); setPlazo(masMeses(hoyIso(), 2));
    setPlazoTocado(false); setFoto(null); setErrFoto('');
  }

  async function crear(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      await req('/api/admin/objetos', { method: 'POST', body: { descripcion, fechaEncontrado: fecha, plazo, foto } });
      aviso('Objeto guardado.', 'success');
      setNuevo(false); resetForm(); await cargar();
    } catch (err) { aviso(err.message, 'error'); }
    finally { setGuardando(false); }
  }

  async function recoger(o) {
    const nota = window.prompt(`¿Quién recoge "${o.descripcion}"? (opcional)`);
    if (nota === null) return;
    try {
      await req(`/api/admin/objetos/${o.id}`, { method: 'PATCH', body: { estado: 'recogido', recogidoNota: nota || null } });
      aviso('Marcado como recogido.', 'success'); await cargar();
    } catch (err) { aviso(err.message, 'error'); }
  }
  async function reabrir(o) {
    try { await req(`/api/admin/objetos/${o.id}`, { method: 'PATCH', body: { estado: 'activo' } }); await cargar(); }
    catch (err) { aviso(err.message, 'error'); }
  }
  async function borrar(o) {
    try { await req(`/api/admin/objetos/${o.id}`, { method: 'DELETE' }); setObjetos(xs => xs.filter(x => x.id !== o.id)); aviso('Borrado.', 'success'); }
    catch (err) { aviso(err.message, 'error'); }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Objetos perdidos</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            Lo que aparece por el club. Pasado el plazo para recogerlo, pasa al registro.
          </p>
        </div>
        <div style={{ flex: 1 }} />
        {!nuevo && <button className="btn btn-primary" onClick={() => setNuevo(true)}>+ Nuevo objeto</button>}
      </div>

      {nuevo && (
        <form onSubmit={crear} style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 18, background: 'var(--bg-1)', display: 'grid', gap: 14 }}>
          <h3 style={{ margin: 0 }}>Nuevo objeto encontrado</h3>
          <div style={campo}>
            <span style={label}>¿Qué es?</span>
            <input style={inputCss} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej. Sudadera azul talla M, botella metálica..." required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={campo}>
              <span style={label}>Día en que se encontró</span>
              <input style={inputCss} type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
            </div>
            <div style={campo}>
              <span style={label}>Plazo para recogerlo</span>
              <input style={inputCss} type="date" value={plazo} onChange={e => { setPlazo(e.target.value); setPlazoTocado(true); }} required />
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Por defecto, 2 meses desde que se encontró.</span>
            </div>
          </div>
          <div style={campo}>
            <span style={label}>Foto (opcional)</span>
            <input type="file" accept="image/*" onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return;
              try { setFoto(await leerImagen(f)); setErrFoto(''); } catch (err) { setErrFoto(err.message); setFoto(null); }
            }} />
            {foto && <img src={foto} alt="" style={{ maxWidth: 120, maxHeight: 120, borderRadius: 10, border: '1px solid var(--line)', marginTop: 6 }} />}
            {errFoto && <span style={{ fontSize: 12, color: 'var(--orange)' }}>{errFoto}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline" onClick={() => { setNuevo(false); resetForm(); }} disabled={guardando}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      )}

      {/* En custodia */}
      <div>
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)' }}>
          En custodia ({enCustodia.length})
        </span>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {cargando ? <p style={{ color: 'var(--ink-3)' }}>Cargando...</p>
            : enCustodia.length ? enCustodia.map(o => <Fila key={o.id} o={o} onRecoger={recoger} onReabrir={reabrir} onBorrar={borrar} />)
              : <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No hay objetos en custodia ahora mismo.</p>}
        </div>
      </div>

      {/* Registro (plazo vencido o recogidos) */}
      {registro.length > 0 && (
        <div>
          <button type="button" onClick={() => setVerRegistro(v => !v)}
            style={{ background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0 }}>
            <I.Chevron style={{ transform: verRegistro ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            Registro de objetos perdidos ({registro.length})
          </button>
          {verRegistro && (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {registro.map(o => <Fila key={o.id} o={o} onRecoger={recoger} onReabrir={reabrir} onBorrar={borrar} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
