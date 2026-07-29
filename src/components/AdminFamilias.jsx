import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Familias del club, por círculos.
//
// Cada persona alcanza a quienes tiene enlazados directamente, y ahí se para:
// los parentescos NO se encadenan. Es lo que hace falta cuando hay separaciones.
// Si Darío y Virginia se separan, los dos siguen administrando a sus hijas; pero
// cuando Darío tiene otro hijo con otra pareja, ese hijo entra en el círculo de
// Darío y no en el de Virginia, que no es su madre. Encadenar los parentescos
// los juntaría a todos en un mismo saco.
//
// Por eso una misma niña sale en el círculo de su padre y en el de su madre: es
// que de verdad pertenece a los dos.
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
function NuevoLazo({ persona, onHecho, onCancelar, showToast }) {
  const [a, setA] = useState(persona || null);
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
      <div style={{ fontWeight: 800, fontSize: 14 }}>
        {persona ? `Añadir un familiar a ${persona.nombre}` : 'Nuevo parentesco'}
      </div>

      {!persona && (
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
    catch { setDatos({ circulos: [], totalPersonas: 0, totalLazos: 0 }); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const cs = datos?.circulos || [];
    const t = q.trim().toLowerCase();
    if (!t) return cs;
    return cs.filter(c => c.nombre.toLowerCase().includes(t) || c.miembros.some(m => m.nombre.toLowerCase().includes(t)));
  }, [datos, q]);

  async function quitarLazo(c, m) {
    if (!window.confirm(`¿Quitar que ${m.nombre} sea ${m.tipo} de ${c.nombre}?\n${c.nombre} dejará de ver sus clases y sus recibos.`)) return;
    try { await api(`/api/admin/billing/familias/${m.lazoId}`, { method: 'DELETE' }); await cargar(); showToast?.('Parentesco quitado.'); }
    catch (e) { alert(e.message); }
  }

  if (!datos) return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando familias...</p>;

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
            <I.Plus /> Nuevo parentesco
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

      {!datos.circulos.length && !creando && (
        <div style={{ background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, padding: 24, textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700 }}>Todavía no hay ningún parentesco.</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>
            Enlazar a padres e hijos es lo que hace que una madre vea las clases de sus hijos en su zona,
            que pueda pagarles los recibos desde la web y que el descuento por varias mensualidades salga
            bien: si los recibos no van juntos, el descuento no se aplica.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {visibles.map(c => (
          <div key={c.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
              <button onClick={() => onEditUser?.({ id: c.id })} title="Abrir su ficha"
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>
                {c.nombre}
              </button>
              {c.alcance > 0 && (
                <span className="status-pill pending">{eur(c.alcance)} a su alcance</span>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn btn-sm btn-outline"
                onClick={() => { setAnadiendoA(anadiendoA === c.id ? null : c.id); setCreando(false); }}>
                <I.Plus /> Añadir familiar
              </button>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--ink-3)' }}>
              Desde su zona ve y puede pagar lo de {c.miembros.length === 1 ? 'esta persona' : `estas ${c.miembros.length} personas`}
              {c.pendientesPropios > 0 ? ', además de lo suyo' : ''}.
            </p>

            <div style={{ display: 'grid', gap: 6 }}>
              {c.miembros.map(m => (
                <div key={m.lazoId} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-3)', borderRadius: 10, padding: '8px 12px' }}>
                  <button onClick={() => onEditUser?.({ id: m.id })} title="Abrir su ficha"
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
                    {m.nombre}
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>es su {m.tipo}</span>
                  <div style={{ flex: 1 }} />
                  {m.pendienteImporte > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--orange)' }}>{eur(m.pendienteImporte)}</span>
                  )}
                  <button className="icon-btn danger" title="Quitar este parentesco" onClick={() => quitarLazo(c, m)}><I.Trash /></button>
                </div>
              ))}
            </div>

            {anadiendoA === c.id && (
              <div style={{ marginTop: 12 }}>
                <NuevoLazo showToast={showToast} persona={{ id: c.id, nombre: c.nombre }}
                  onHecho={() => { setAnadiendoA(null); cargar(); }}
                  onCancelar={() => setAnadiendoA(null)} />
              </div>
            )}
          </div>
        ))}
      </div>

      {datos.circulos.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>
          {visibles.length} de {datos.circulos.length} círculo{datos.circulos.length !== 1 ? 's' : ''} · {datos.totalPersonas} personas enlazadas
          <br />
          Una misma persona sale en varios círculos cuando pertenece a varios: en una separación, la hija
          está en el de su padre y en el de su madre, y cada uno ve solo lo suyo.
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
