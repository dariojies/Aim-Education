import React, { useState, useEffect, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Mi espacio (#497): lo de cada trabajador. Sus nóminas y contratos para
// descargar, su certificado de delitos de naturaleza sexual (lo sube él) y su
// ficha. Secretaría y la dirección tienen además «Del personal»: el estado de
// cada uno y, al abrirlo, subirle documentos y ver su certificado y su ficha.
// ─────────────────────────────────────────────────────────────────────────────

const campo = { fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', minWidth: 0, width: '100%', boxSizing: 'border-box' };
const tarjeta = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 18, display: 'grid', gap: 10, alignContent: 'start' };
async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', ...opts, headers: { ...(opts.body && !(opts.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
    body: opts.body instanceof Blob ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido.');
  return d;
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesLargo = (p) => { const [a, m] = String(p || '').split('-').map(Number); return a && m ? `${MESES[m - 1]} de ${a}` : ''; };
const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const NOMBRE_RANGO = { trabajador: 'Trabajador', instructor: 'Instructor', it_junior: 'IT Junior', secretaria: 'Secretaría', club_owner: 'Dirección', equipo_it: 'Equipo IT', superadmin: 'Dirección' };
const mesAnterior = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export default function AdminEspacio({ showToast }) {
  const [d, setD] = useState(null);
  const [pestana, setPestana] = useState(() => { try { return new URLSearchParams(window.location.search).get('pestana') === 'personal' ? 'personal' : 'mio'; } catch { return 'mio'; } });
  const cargar = useCallback(() => api('/api/me/espacio').then(setD).catch(e => setD({ error: e.message })), []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  if (d.error) return <p style={{ color: 'var(--pink)' }}>{d.error}</p>;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {d.gestiona && (
        <div style={{ display: 'flex', gap: 6 }}>
          {[['mio', 'Lo mío'], ['personal', 'Del personal']].map(([k, t]) => <button key={k} type="button" className={`filter-pill ${pestana === k ? 'is-active' : ''}`} onClick={() => setPestana(k)}>{t}</button>)}
        </div>
      )}
      {pestana === 'personal' && d.gestiona ? <DelPersonal showToast={showToast} /> : <LoMio d={d} cargar={cargar} showToast={showToast} />}
    </div>
  );
}

// Los documentos de alguien, por tipo (las nóminas, del mes más reciente al más antiguo).
function Documentos({ documentos, tipos, borrar = null, propio = false }) {
  const grupos = ['nomina', 'contrato', 'otro', 'certificado'].map(t => [t, documentos.filter(x => x.tipo === t)]).filter(([, l]) => l.length);
  if (!grupos.length) return <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Aún no hay documentos.</span>;
  return grupos.map(([t, l]) => (
    <div key={t} style={{ display: 'grid', gap: 4 }}>
      <b style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)' }}>{t === 'nomina' ? 'Nóminas' : t === 'contrato' ? 'Contratos' : t === 'certificado' ? 'Certificados' : 'Otros'}</b>
      {l.map(x => (
        <div key={x.id} data-doc={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', borderRadius: 10, background: 'var(--bg-3)', fontSize: 13, flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 200px', minWidth: 0 }}>
            <b>{t === 'nomina' && x.periodo ? mesLargo(x.periodo).replace(/^./, l => l.toUpperCase()) : x.nombre}</b>
            <span style={{ color: 'var(--ink-3)' }}> · {fecha(x.fecha)} · {kb(x.bytes)}</span>
            {propio && !x.descargado && t !== 'certificado' && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: '#fff', background: 'var(--purple)', padding: '1px 7px', borderRadius: 999 }}>nuevo</span>}
          </span>
          <a className="btn btn-sm btn-outline" href={x.url} target="_blank" rel="noreferrer">Ver</a>
          <a className="btn btn-sm btn-outline" href={`${x.url}?descargar=1`}>Descargar</a>
          {borrar && <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--pink)' }} onClick={() => borrar(x)}>Quitar</button>}
        </div>
      ))}
    </div>
  ));
}

// La ficha: cada grupo con sus casillas y cuánto falta.
function Ficha({ campos, inicial, onGuardar, guardando }) {
  const [datos, setDatos] = useState(inicial || {});
  useEffect(() => { setDatos(inicial || {}); }, [inicial]);
  const obligatorios = campos.filter(c => c.obligatorio), hechos = obligatorios.filter(c => String(datos[c.id] || '').trim()).length;
  const grupos = [...new Set(campos.map(c => c.grupo))];
  return (
    <form onSubmit={e => { e.preventDefault(); onGuardar(datos); }} style={{ display: 'grid', gap: 12 }} data-ficha-trabajador>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden' }}><div style={{ width: `${(100 * hechos) / obligatorios.length}%`, height: '100%', background: hechos === obligatorios.length ? 'var(--teal)' : 'var(--orange)' }} /></div>
        <b style={{ fontSize: 12 }}>{hechos === obligatorios.length ? 'Completa' : `${hechos} de ${obligatorios.length}`}</b>
      </div>
      {grupos.map(g => (
        <div key={g} style={{ display: 'grid', gap: 8 }}>
          <b style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)' }}>{g}</b>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {campos.filter(c => c.grupo === g).map(c => (
              <label key={c.id} style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', gridColumn: c.tipo === 'texto' ? '1 / -1' : undefined }}>
                <span>{c.nombre}{c.obligatorio && !String(datos[c.id] || '').trim() && <span style={{ color: 'var(--orange)' }}> · falta</span>}</span>
                {c.tipo === 'texto'
                  ? <textarea rows={2} value={datos[c.id] || ''} onChange={e => setDatos(x => ({ ...x, [c.id]: e.target.value }))} style={{ ...campo, resize: 'vertical' }} />
                  : <input type={c.tipo === 'date' ? 'date' : 'text'} value={datos[c.id] || ''} onChange={e => setDatos(x => ({ ...x, [c.id]: e.target.value }))} style={campo} autoComplete="off" />}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button type="submit" className="btn btn-sm btn-primary" disabled={guardando} style={{ justifySelf: 'start' }}>{guardando ? 'Guardando…' : 'Guardar la ficha'}</button>
    </form>
  );
}

function LoMio({ d, cargar, showToast }) {
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef(null);
  const certificado = d.documentos.filter(x => x.tipo === 'certificado')[0];
  async function subirCertificado(f) {
    if (!f) return;
    setSubiendo(true);
    try {
      await api(`/api/me/espacio/certificado?nombre=${encodeURIComponent(f.name)}`, { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'application/pdf' } });
      showToast?.('Certificado subido. Gracias.'); await cargar();
    } catch (e) { alert(e.message); } finally { setSubiendo(false); }
  }
  async function guardarFicha(datos) {
    setGuardando(true);
    try { await api('/api/me/espacio/ficha', { method: 'PUT', body: { datos } }); showToast?.('Ficha guardada.'); await cargar(); }
    catch (e) { alert(e.message); } finally { setGuardando(false); }
  }
  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', alignItems: 'start' }} data-mi-espacio>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={tarjeta}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Mis nóminas y contratos</h3>
          <Documentos documentos={d.documentos.filter(x => x.tipo !== 'certificado')} tipos={d.tipos} propio />
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Los sube secretaría; te avisamos cuando hay uno nuevo.</span>
        </div>
        <div style={{ ...tarjeta, borderColor: certificado ? 'var(--line)' : 'color-mix(in oklab, var(--orange) 50%, var(--line))' }} data-certificado>
          <h3 style={{ margin: 0, fontSize: 16 }}>Certificado de delitos de naturaleza sexual</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
            Es obligatorio para trabajar con menores. Se pide gratis en la sede electrónica del Ministerio de Justicia (con certificado digital o Cl@ve) y se sube aquí en PDF.
          </p>
          {certificado
            ? <span style={{ fontSize: 13 }}>✅ Subido el {fecha(certificado.fecha)} · <a href={certificado.url} target="_blank" rel="noreferrer">verlo</a></span>
            : <span style={{ fontSize: 13, color: 'var(--orange)', fontWeight: 700 }}>Aún no lo has subido.</span>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={subiendo} onClick={() => archivo.current?.click()}>{subiendo ? 'Subiendo…' : certificado ? 'Subir uno más reciente' : 'Subir el certificado'}</button>
            <a className="btn btn-sm btn-outline" href="https://sede.mjusticia.gob.es/" target="_blank" rel="noopener noreferrer">Pedirlo en la sede del Ministerio</a>
          </div>
          <input ref={archivo} type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={e => { subirCertificado(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
      <div style={tarjeta}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Mi ficha</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Lo que necesita secretaría para tu contrato y tu nómina. Solo lo ve secretaría y la dirección.</p>
        <Ficha campos={d.campos} inicial={d.ficha} onGuardar={guardarFicha} guardando={guardando} />
      </div>
    </div>
  );
}

function DelPersonal({ showToast }) {
  const [lista, setLista] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const cargar = useCallback(() => api('/api/admin/personal-espacio').then(x => setLista(x.personas)).catch(e => { alert(e.message); setLista([]); }), []);
  useEffect(() => { cargar(); }, [cargar]);
  if (abierto) return <Trabajador id={abierto} showToast={showToast} onVolver={() => { setAbierto(null); cargar(); }} />;
  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }} data-del-personal>
      {lista === null && <p style={{ padding: 16, margin: 0, color: 'var(--ink-3)' }}>Cargando…</p>}
      {lista?.map(p => (
        <button key={p.id} type="button" data-trabajador={p.id} onClick={() => setAbierto(p.id)}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) repeat(3, minmax(0, 1.2fr))', gap: 10, width: '100%', textAlign: 'left', padding: '10px 14px', border: 0, borderBottom: '1px solid var(--line)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', alignItems: 'center', fontSize: 13 }}>
          <span><b>{p.nombre}</b><br /><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{NOMBRE_RANGO[p.rango] || p.rango}</span></span>
          <span style={{ color: p.certificado ? 'var(--teal)' : 'var(--orange)', fontWeight: 700 }}>{p.certificado ? `✓ Certificado (${new Date(p.certificado).toLocaleDateString('es-ES')})` : 'Sin certificado'}</span>
          <span style={{ color: p.ficha === p.de ? 'var(--teal)' : 'var(--ink-2)' }}>Ficha {p.ficha === p.de ? 'completa' : `${p.ficha}/${p.de}`}</span>
          <span style={{ color: 'var(--ink-3)' }}>{p.ultimaNomina ? `Última nómina: ${mesLargo(p.ultimaNomina)}` : 'Sin nóminas'}{p.contratos ? ` · ${p.contratos} contrato${p.contratos !== 1 ? 's' : ''}` : ''}</span>
        </button>
      ))}
    </div>
  );
}

function Trabajador({ id, onVolver, showToast }) {
  const [d, setD] = useState(null);
  const [tipo, setTipo] = useState('nomina');
  const [periodo, setPeriodo] = useState(mesAnterior());
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const archivo = useRef(null);
  const cargar = useCallback(() => api(`/api/admin/personal-espacio/${id}`).then(setD).catch(e => { alert(e.message); onVolver(); }), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [cargar]);
  async function subir(files) {
    const lista = [...(files || [])];
    if (!lista.length) return;
    setSubiendo(true);
    try {
      for (const f of lista) {
        await api(`/api/admin/personal-espacio/${id}/documentos?tipo=${tipo}&periodo=${tipo === 'nomina' ? periodo : ''}&nombre=${encodeURIComponent(f.name)}`, { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'application/pdf' } });
      }
      showToast?.(`${lista.length === 1 ? 'Subido' : `${lista.length} subidos`}: le llega el aviso.`); await cargar();
    } catch (e) { alert(e.message); } finally { setSubiendo(false); }
  }
  async function borrar(x) {
    if (!window.confirm(`¿Quitar «${x.tipo === 'nomina' && x.periodo ? `nómina de ${mesLargo(x.periodo)}` : x.nombre}»?`)) return;
    try { await api(`/api/admin/personal-espacio/documentos/${x.id}`, { method: 'DELETE' }); await cargar(); } catch (e) { alert(e.message); }
  }
  async function guardarFicha(datos) {
    setGuardando(true);
    try { await api(`/api/admin/personal-espacio/${id}/ficha`, { method: 'PUT', body: { datos } }); showToast?.('Ficha guardada.'); await cargar(); }
    catch (e) { alert(e.message); } finally { setGuardando(false); }
  }
  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  return (
    <div style={{ display: 'grid', gap: 14 }} data-trabajador-abierto>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button type="button" className="btn btn-sm btn-outline" onClick={onVolver}>← Del personal</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>{d.persona.nombre}</h2>
      </div>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', alignItems: 'start' }}>
        <div style={tarjeta}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Subirle un documento</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>Qué es
              <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...campo, width: 'auto' }}>
                <option value="nomina">Nómina</option><option value="contrato">Contrato</option><option value="otro">Otro documento</option>
              </select>
            </label>
            {tipo === 'nomina' && <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>De qué mes<input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ ...campo, width: 'auto' }} /></label>}
            <button type="button" className="btn btn-sm btn-primary" disabled={subiendo || (tipo === 'nomina' && !periodo)} onClick={() => archivo.current?.click()}>{subiendo ? 'Subiendo…' : 'Elegir el PDF'}</button>
            <input ref={archivo} type="file" accept="application/pdf,image/jpeg,image/png" multiple hidden onChange={e => { subir(e.target.files); e.target.value = ''; }} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Le llega un aviso (en la campanita y en el móvil) y lo descarga desde su espacio.</span>
          <Documentos documentos={d.documentos} tipos={d.tipos} borrar={borrar} />
        </div>
        <div style={tarjeta}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Su ficha</h3>
          <Ficha campos={d.campos} inicial={d.ficha} onGuardar={guardarFicha} guardando={guardando} />
        </div>
      </div>
    </div>
  );
}
