import React, { useState } from 'react';

// Al entrar con una contraseña provisional (la puso secretaría, #643), antes de
// nada se pide una nueva. No se puede cerrar: solo poner la nueva o salir.
export default function ContrasenaNueva({ user, onHecho, onSalir }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar(e) {
    e.preventDefault();
    setError('');
    if (p1.length < 8) return setError('Tiene que tener al menos 8 caracteres.');
    if (p1 !== p2) return setError('Las dos contraseñas no coinciden.');
    setGuardando(true);
    try {
      const r = await fetch('/api/password/nueva', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: p1 }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409) return onHecho();
      if (!r.ok) return setError(d.error || 'No se ha podido guardar.');
      onHecho();
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setGuardando(false); }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="contrasena-nueva"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 5000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <form className="panel" onSubmit={guardar} style={{ maxWidth: 420, width: '100%', margin: 0 }}>
        <h2 id="contrasena-nueva" style={{ margin: '0 0 6px' }}>Pon tu contraseña</h2>
        <p className="sub" style={{ margin: '0 0 16px' }}>
          {user?.firstName ? `Hola, ${user.firstName}. ` : ''}Has entrado con una contraseña provisional.
          Elige ahora la tuya: es la que usarás a partir de hoy.
        </p>
        <div className="field">
          <label htmlFor="cn-1">Contraseña nueva</label>
          <input id="cn-1" type={ver ? 'text' : 'password'} autoComplete="new-password" autoFocus value={p1} onChange={e => setP1(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cn-2">Repítela</label>
          <input id="cn-2" type={ver ? 'text' : 'password'} autoComplete="new-password" value={p2} onChange={e => setP2(e.target.value)} />
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink-2)', margin: '-4px 0 12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={ver} onChange={e => setVer(e.target.checked)} /> Ver lo que escribo
        </label>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 14px' }}>Al menos 8 caracteres. Que no sea la provisional.</p>
        {error && <p role="alert" style={{ color: 'var(--orange)', fontSize: 13, fontWeight: 700, margin: '0 0 12px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={onSalir}>Salir</button>
          <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar y entrar'}</button>
        </div>
      </form>
    </div>
  );
}
