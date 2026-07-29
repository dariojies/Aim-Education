import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Familias del club.
//
// Un parentesco es una pareja (Ana es madre de Luis), pero una familia son
// todas las personas que se tocan entre sí, así que aquí se ven agrupadas. Es
// lo que hace que un padre vea a sus hijos en su zona, que pueda pagarles los
// recibos y que el descuento por varias mensualidades salga bien: si los
// recibos no van juntos, el descuento no se aplica.
// ─────────────────────────────────────────────────────────────────────────────

const PARENTESCOS = ['Madre', 'Padre', 'Hijo/a', 'Hermano/a', 'Abuelo/a', 'Tutor/a', 'Tío/a', 'Primo/a'];
// Al decir "Ana es la madre de Luis", lo natural es que Luis sea su hijo/a.
const INVERSO = { 'Madre': 'Hijo/a', 'Padre': 'Hijo/a', 'Hijo/a': 'Madre', 'Hermano/a': 'Hermano/a', 'Abuelo/a': 'Nieto/a', 'Tutor/a': 'Tutelado/a', 'Tío/a': 'Sobrino/a', 'Primo/a': 'Primo/a' };

const eur = (n) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`;

async function api(url, opts = {}) {
  const r = await fetch(url, {
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    cache: 'no-store',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Error de conexión.');
  return d;
}

// Buscador de personas del club. Avisa de quién ya tiene familia, para no
// montar dos grupos separados de la misma casa sin darse cuenta.
function BuscarPersona({ placeholder, excluir = [], onElegir }) {
  const [q, setQ] = useState('');
  const [sug, setSug] = useState([]);

  useEffect(() => {
    if (q.trim().length < 2) { setSug([]); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const d = await api(`/api/admin/personas?q=${encodeURIComponent(q.trim())}`);
        if (vivo) setSug(d.filter(x => !excluir.includes(x.id)));
      } catch { /* noop */ }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, excluir]);

  return (
    <div style={{ position: 'relative' }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} style={campo} />
      {sug.length > 0 && (
        <div className="scroll-oculto" style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 2,
          background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10,
          maxHeight: 240, overflowY: 'auto', boxShadow: 'var(--shadow)',
        }}>
          {sug.map(x => (
            <button key={x.id} type="button" onClick={() => { onElegir(x); setQ(''); setSug([]); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--line-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{x.nombre}</b>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>{x.email}</span>
              </span>
              {x.tieneFamilia && (
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--teal)', whiteSpace: 'nowrap' }}>YA TIENE FAMILIA</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Alta de un parentesco. Vale tanto para crear una familia desde cero como para
// meter a alguien en una que ya existe.
function NuevoLazo({ persona, miembros, onHecho, onCancelar, showToast }) {
  const [a, setA] = useState(persona || (miembros?.length === 1 ? miembros[0] : null));
  const [b, setB] = useState(null);
  const [tipo, setTipo] = useState('');
  const [inverso, setInverso] = useState('');
  const [guardando, setGuardando] = useState(false);

  function elegirTipo(v) {
    setTipo(v);
    if (!inverso || INVERSO[tipo] === inverso) setInverso(INVERSO[v] || '');
  }

  async function guardar() {
    if (!a || !b || !tipo.trim()) return;
    setGuardando(true);
    try {
      // Se guarda en los dos sentidos para que la relación se vea desde ambos.
      await api('/api/admin/billing/familias', {
        method: 'POST',
        body: { personaId: a.id, familiarId: b.id, tipo: tipo.trim(), tipoInverso: inverso.trim() || null },
      });
      showToast?.('Parentesco guardado.');
      onHecho();
    } catch (e) { alert(e.message); }
    finally { setGuardando(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 12, background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 14 }}>{miembros ? 'Añadir un familiar' : 'Nueva familia'}</div>

      {/* En una familia que ya existe se elige con quién emparenta el nuevo. */}
      {miembros && miembros.length > 1 && (
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
          ¿De quién es familiar?
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {miembros.map(m => (
              <button key={m.id} type="button" onClick={() => setA(m)}
                className={`btn btn-sm ${a?.id === m.id ? 'btn-primary' : 'btn-outline'}`}>{m.nombre}</button>
            ))}
          </div>
        </label>
      )}

      {!persona && !miembros && (
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
          Persona
          {a
            ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <b>{a.nombre}</b>
                <button className="btn btn-sm btn-outline" onClick={() => setA(null)}>Cambiar</button>
              </div>
            : <BuscarPersona placeholder="Buscar por nombre o email..." excluir={b ? [b.id] : []} onElegir={setA} />}
        </label>
      )}

      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
        Familiar
        {b
          ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <b>{b.nombre}</b>
              <button className="btn btn-sm btn-outline" onClick={() => setB(null)}>Cambiar</button>
            </div>
          : <BuscarPersona placeholder="Buscar por nombre o email..." excluir={a ? [a.id] : []} onElegir={setB} />}
      </label>

      {a && b && (
        <>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
            <span><b>{b.nombre}</b> es su...</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PARENTESCOS.map(x => (
                <button key={x} type="button" onClick={() => elegirTipo(x)}
                  className={`btn btn-sm ${tipo === x ? 'btn-primary' : 'btn-outline'}`}>{x}</button>
              ))}
            </div>
          </label>
          {tipo && (
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-2)' }}>
              <span>Y <b>{a.nombre}</b> es su... <span style={{ color: 'var(--ink-3)' }}>(así se ve desde los dos lados)</span></span>
              <input list="parentescos-admin" value={inverso} onChange={e => setInverso(e.target.value)}
                placeholder="Hijo/a, Hermano/a..." style={{ ...campo, maxWidth: 260 }} />
              <datalist id="parentescos-admin">
                {[...PARENTESCOS, 'Nieto/a', 'Sobrino/a', 'Tutelado/a'].map(x => <option key={x} value={x} />)}
              </datalist>
            </label>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-sm btn-outline" onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-sm btn-primary" disabled={!a || !b || !tipo.trim() || guardando} onClick={guardar}>
          {guardando ? 'Guardando...' : 'Enlazar'}
        </button>
      </div>
    </div>
  );
}

export default function AdminFamilias({ showToast, onEditUser }) {
  const [datos, setDatos] = useState(null);
  const [q, setQ] = useState('');
  const [creando, setCreando] = useState(false);
  const [anadiendoA, setAnadiendoA] = useState(null);

  const cargar = useCallback(async () => {
    try { setDatos(await api('/api/admin/familias')); }
    catch { setDatos({ familias: [], totalPersonas: 0 }); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const fam = datos?.familias || [];
    const t = q.trim().toLowerCase();
    if (!t) return fam;
    return fam.filter(f => f.personas.some(p => p.nombre.toLowerCase().includes(t)));
  }, [datos, q]);

  async function quitarLazo(l) {
    if (!window.confirm(`¿Quitar que ${l.a} sea ${l.tipo} de ${l.de}?\nSi es el único parentesco, la familia se deshace.`)) return;
    try { await api(`/api/admin/billing/familias/${l.id}`, { method: 'DELETE' }); await cargar(); showToast?.('Parentesco quitado.'); }
    catch (e) { alert(e.message); }
  }

  if (!datos) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando familias...</p>;

  const totalPendiente = (datos.familias || []).reduce((t, f) => t + f.pendienteImporte, 0);

  return (
    <>
      <div className="toolbar">
        <div className="search-input">
          <I.Search />
          <input placeholder="Buscar por nombre..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div style={{ flex: 1 }} />
        {!creando && (
          <button className="btn btn-primary btn-sm" onClick={() => { setCreando(true); setAnadiendoA(null); }}>
            <I.Plus /> Nueva familia
          </button>
        )}
      </div>

      {creando && (
        <div style={{ marginBottom: 18 }}>
          <NuevoLazo showToast={showToast}
            onHecho={() => { setCreando(false); cargar(); }}
            onCancelar={() => setCreando(false)} />
        </div>
      )}

      {!datos.familias.length && !creando && (
        <div style={{ background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, padding: 24, textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700 }}>Todavía no hay ninguna familia enlazada.</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>
            Enlazar a padres e hijos es lo que hace que una madre vea las clases de sus hijos en su zona,
            que pueda pagarles los recibos desde la web y que el descuento por varias mensualidades salga
            bien: si los recibos no van juntos, el descuento no se aplica.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {visibles.map(f => (
          <div key={f.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>
                {f.personas.length} persona{f.personas.length !== 1 ? 's' : ''}
              </span>
              {f.pendientes > 0 && (
                <span className="status-pill pending">{f.pendientes} pendiente{f.pendientes !== 1 ? 's' : ''} · {eur(f.pendienteImporte)}</span>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn btn-sm btn-outline"
                onClick={() => { setAnadiendoA(anadiendoA === f.id ? null : f.id); setCreando(false); }}>
                <I.Plus /> Añadir familiar
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {f.personas.map(p => (
                <button key={p.id} onClick={() => onEditUser?.({ id: p.id })} title="Abrir su ficha"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{p.nombre}</span>
                  {p.pendientes > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--orange)' }}>{eur(p.pendienteImporte)}</span>
                  )}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              {f.lazos.map(l => (
                <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--ink-2)' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{l.a}</b> es <b>{l.tipo}</b> de <b>{l.de}</b>
                  </span>
                  <button className="icon-btn danger" title="Quitar este parentesco" onClick={() => quitarLazo(l)}><I.Trash /></button>
                </div>
              ))}
            </div>

            {anadiendoA === f.id && (
              <div style={{ marginTop: 12 }}>
                <NuevoLazo showToast={showToast} miembros={f.personas}
                  onHecho={() => { setAnadiendoA(null); cargar(); }}
                  onCancelar={() => setAnadiendoA(null)} />
              </div>
            )}
          </div>
        ))}
      </div>

      {datos.familias.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--ink-3)' }}>
          {visibles.length} de {datos.familias.length} familia{datos.familias.length !== 1 ? 's' : ''} · {datos.totalPersonas} personas enlazadas
          {totalPendiente > 0 && <> · {eur(totalPendiente)} pendientes de cobro</>}
        </div>
      )}
    </>
  );
}

const campo = {
  fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)',
  width: '100%', minWidth: 0,
};
