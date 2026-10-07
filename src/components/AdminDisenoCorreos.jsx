import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import EditorDiseno, { ElegirPlantilla, Miniatura, VistaPrevia, useMarca, olvidarMarca, subirImagen } from './EditorDiseno.jsx';
import { htmlCorreo, FUENTES, REDES, GRUPOS_SISTEMA, PLANTILLAS_BASE, MARCA_POR_DEFECTO, ejemplosDe } from '../../correo-diseno.js';
import { fmtFechaHora } from '../fechas.js';
import { Interruptor, AjustesCorreo } from './CrmPiezas.jsx';

// Lo que deja de funcionar si se apaga cada correo de la app (#365): se pregunta antes.
const AL_APAGAR = {
  password_olvido: 'Quien pulse «¿Olvidaste tu contraseña?» no recibirá el enlace y no podrá recuperar su cuenta por su cuenta.',
  acceso_familia: 'El botón «Enviar enlace de contraseña» de la ficha dejará de funcionar.',
  acceso_invitacion: 'El botón «Enviar acceso» del personal dejará de funcionar: no podrán poner su contraseña.',
  password_cambiada: 'Nadie se enterará si alguien le cambia la contraseña (es un aviso de seguridad).',
  examen_resultado: 'El botón «Enviar a la familia» de los exámenes dejará de funcionar.',
  speaking_inicial: 'Las familias no recibirán el correo para confirmar la clase individual: solo podrán confirmarla desde su área o por teléfono.',
  speaking_ultimo_dia: 'No se recordará el último día de plazo a quien no ha confirmado la clase individual.',
  speaking_manana: 'No se recordará la clase individual el día antes.',
  fichaje_resumen: 'El resumen mensual de horas es OBLIGATORIO por ley: si lo apagas, tendréis que entregarlo de otra forma.',
  sello_semanal: 'El sello semanal sirve de prueba ante una inspección de que el registro de jornada no se ha tocado.',
  gestoria_libro: 'El botón «Enviar a la gestoría» de Facturación dejará de funcionar.',
  aviso_alta_web: 'No llegará a info@ el aviso de las familias que se registran en la web (seguirán saliendo en el panel).',
  aviso_consulta_web: 'No llegará a info@ el aviso de las consultas de la web (seguirán saliendo en el panel).',
  aviso_ticket: 'Los encargados no recibirán el aviso de los tickets nuevos.',
  ticket_respuesta: 'Las familias no se enterarán de que les habéis contestado hasta que entren en su área.',
  ticket_asignado: 'Nadie recibirá aviso cuando le asignen un ticket (seguirá saliendo en su campanita).',
  ticket_mensaje: 'No llegará aviso de los mensajes nuevos en los tickets (seguirán en la campanita).',
  incidencia_implicado: 'El personal implicado en una incidencia no recibirá correo (seguirá saliendo en su campanita).',
  incidencia_resuelta: 'Nadie recibirá correo cuando se resuelva una incidencia suya (seguirá saliendo en su campanita).',
};

// ─────────────────────────────────────────────────────────────────────────────
// CRM → Diseño de correos (ticket #326). Dos cosas:
//  · Plantillas: los diseños del club para campañas y correos sueltos.
//  · Marca: logo, colores, letra y pie, que llevan TODOS los correos.
// Los correos que manda la app sola (clases individuales, contraseñas, fichaje…) se
// diseñan desde Automatismos (#365), junto al resto de correos automáticos:
// el componente CorreosSistema de aquí abajo se usa allí.
// ─────────────────────────────────────────────────────────────────────────────

const pastilla = (activa) => ({
  padding: '8px 16px', fontSize: 13, borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
  border: `1px solid ${activa ? 'var(--ink)' : 'var(--line)'}`, background: activa ? 'var(--ink)' : 'var(--bg-2)', color: activa ? '#fff' : 'var(--ink-2)',
});
const tarjeta = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 16 };

async function pedir(url, opciones = {}) {
  const r = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Algo ha fallado.');
  return d;
}

export default function AdminDisenoCorreos({ showToast }) {
  const [pestana, setPestana] = useState('plantillas');
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 800 }}>Diseño de correos</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)', maxWidth: 720 }}>
          Aquí se diseñan los correos del club, como en Canva: plantillas para las campañas y la imagen de marca que llevan todos. Los correos que salen solos se diseñan en <b>Automatismos</b>.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={pastilla(pestana === 'plantillas')} onClick={() => setPestana('plantillas')}>Plantillas</button>
        <button type="button" style={pastilla(pestana === 'marca')} onClick={() => setPestana('marca')}>Marca</button>
      </div>
      {pestana === 'plantillas' && <Plantillas showToast={showToast} />}
      {pestana === 'marca' && <Marca showToast={showToast} />}
    </div>
  );
}

// ── Plantillas del club ─────────────────────────────────────────────────────
function Plantillas({ showToast }) {
  const marca = useMarca();
  const [lista, setLista] = useState(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [editando, setEditando] = useState(null); // { id?, nombre, asunto, diseno }
  const cargar = useCallback(() => {
    pedir('/api/admin/correo/plantillas').then(d => setLista(d.plantillas)).catch(e => { setLista([]); showToast?.(e.message, 'error'); });
  }, [showToast]);
  useEffect(cargar, [cargar]);

  const guardar = async ({ nombre, asunto, diseno }) => {
    const cuerpo = JSON.stringify({ nombre, asunto, diseno });
    const d = editando.id
      ? await pedir(`/api/admin/correo/plantillas/${editando.id}`, { method: 'PUT', body: cuerpo })
      : await pedir('/api/admin/correo/plantillas', { method: 'POST', body: cuerpo });
    setEditando(e => ({ ...e, id: d.id }));
    showToast?.('Plantilla guardada.', 'success');
    cargar();
  };
  const duplicar = async (p) => {
    try {
      await pedir('/api/admin/correo/plantillas', { method: 'POST', body: JSON.stringify({ nombre: `${p.nombre} (copia)`, asunto: p.asunto, diseno: p.diseno }) });
      cargar();
    } catch (e) { showToast?.(e.message, 'error'); }
  };
  const borrar = async (p) => {
    if (!window.confirm(`¿Borrar la plantilla «${p.nombre}»? Los correos que ya la usan no cambian.`)) return;
    try { await pedir(`/api/admin/correo/plantillas/${p.id}`, { method: 'DELETE' }); cargar(); }
    catch (e) { showToast?.(e.message, 'error'); }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', maxWidth: 640 }}>
          Las plantillas son el punto de partida de las campañas, los automatismos y los correos desde la ficha. Al usarlas se copian: cambiar una plantilla no cambia los correos ya hechos.
        </p>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setEligiendo(true)}><I.Plus width={14} height={14} /> Nueva plantilla</button>
      </div>
      {lista === null ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cargando…</p> : lista.length === 0 ? (
        <div style={{ ...tarjeta, textAlign: 'center', padding: 36, color: 'var(--ink-3)', fontSize: 14 }}>
          Todavía no hay plantillas del club. Crea la primera con «Nueva plantilla»: puedes partir de una de las de ejemplo.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
          {lista.map(p => (
            <div key={p.id} style={{ ...tarjeta, padding: 10, display: 'grid', gap: 8 }}>
              <button type="button" onClick={() => setEditando(p)} style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer' }} title="Editar">
                <Miniatura diseno={p.diseno} marca={marca} alto={210} vars={{ nombre: 'Lucía' }} />
              </button>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{p.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{p.asunto || 'Sin asunto'}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>Cambiada {fmtFechaHora(p.actualizada)}{p.autor ? ` · ${p.autor}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditando(p)}>Editar</button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => duplicar(p)}>Duplicar</button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => borrar(p)} title="Borrar"><I.Trash width={14} height={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {eligiendo && (
        <ElegirPlantilla soloBase onCerrar={() => setEligiendo(false)}
          onElegir={({ diseno, asunto }) => { setEligiendo(false); setEditando({ nombre: '', asunto: asunto || '', diseno }); }} />
      )}
      {editando && (
        <EditorDiseno titulo={editando.id ? 'Editar plantilla' : 'Nueva plantilla'} valor={editando} conNombre
          puedeGuardarComoPlantilla={false} onGuardar={guardar} onCerrar={() => setEditando(null)} showToast={showToast} />
      )}
    </div>
  );
}

// ── Correos que la app manda sola (se ven en Automatismos, #365) ────────────
export function CorreosSistema({ showToast }) {
  const marca = useMarca();
  const [correos, setCorreos] = useState(null);
  const [editando, setEditando] = useState(null);
  const [viendo, setViendo] = useState(null);
  const cargar = useCallback(() => {
    pedir('/api/admin/correo/sistema').then(d => setCorreos(d.correos)).catch(e => { setCorreos([]); showToast?.(e.message, 'error'); });
  }, [showToast]);
  useEffect(cargar, [cargar]);

  const guardar = async ({ asunto, diseno }) => {
    await pedir(`/api/admin/correo/sistema/${editando.clave}`, { method: 'PUT', body: JSON.stringify({ asunto, diseno }) });
    showToast?.('Guardado. A partir de ahora sale con este diseño.', 'success');
    cargar();
  };
  // Encender o apagar, y sus ajustes (#365).
  const cambiarEstado = async (c, cambios, aviso) => {
    try {
      await pedir(`/api/admin/correo/sistema/${c.clave}/estado`, { method: 'PUT', body: JSON.stringify(cambios) });
      showToast?.(aviso, 'success'); cargar();
    } catch (e) { showToast?.(e.message, 'error'); }
  };
  const alternar = (c) => {
    if (!c.apagado) {
      const extra = AL_APAGAR[c.clave] ? `\n\n${AL_APAGAR[c.clave]}` : '';
      if (!window.confirm(`¿Apagar «${c.nombre}»? Dejará de enviarse.${extra}`)) return;
    }
    cambiarEstado(c, { apagado: !c.apagado }, c.apagado ? `«${c.nombre}» encendido.` : `«${c.nombre}» apagado: ya no sale.`);
  };
  const restaurar = async (c) => {
    if (!window.confirm(`¿Volver al diseño de fábrica de «${c.nombre}»? Se pierde el que tiene ahora.`)) return;
    try { await pedir(`/api/admin/correo/sistema/${c.clave}`, { method: 'DELETE' }); showToast?.('Vuelve a salir el de fábrica.', 'success'); cargar(); }
    catch (e) { showToast?.(e.message, 'error'); }
  };

  if (correos === null) return <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cargando…</p>;
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {Object.entries(GRUPOS_SISTEMA).map(([g, titulo]) => (
        <section key={g} style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{titulo}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {correos.filter(c => c.grupo === g).map(c => (
              <div key={c.clave} style={{ ...tarjeta, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '12px 16px', opacity: c.apagado ? 0.75 : 1 }}>
                <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14 }}>{c.nombre}</strong>
                    {c.roto
                      ? <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fdecec', color: '#8a1c1c' }}>Al guardado le falta algo: sale el de fábrica</span>
                      : c.personalizado
                        ? <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'color-mix(in oklab, var(--purple) 14%, var(--bg-2))', color: 'var(--purple)' }}>Personalizado</span>
                        : <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--bg-3)', color: 'var(--ink-3)' }}>De fábrica</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{c.cuando}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>Asunto: {c.asunto}</div>
                  {c.personalizado && c.actualizado && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>Cambiado {fmtFechaHora(c.actualizado)}</div>}
                  {c.apagado && <div style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700, marginTop: 2 }}>Apagado{c.apagadoAt ? ` desde el ${fmtFechaHora(c.apagadoAt)}` : ''}: no se envía.</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Interruptor activo={!c.apagado} onClick={() => alternar(c)} nombre={c.nombre} />
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setViendo(c)}><I.Eye width={14} height={14} /> Ver</button>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditando(c)}><I.Edit width={14} height={14} /> Diseñar</button>
                  {(c.personalizado || c.roto) && <button type="button" className="btn btn-sm btn-outline" onClick={() => restaurar(c)}>Volver al de fábrica</button>}
                </div>
                {c.ajustesDef && (
                  <div style={{ flex: '1 1 100%' }}>
                    <AjustesCorreo def={c.ajustesDef} valores={c.ajustes} onGuardar={(ajustes) => cambiarEstado(c, { ajustes }, 'Ajustes guardados.')} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      {viendo && (() => { const ej = ejemplosDe(viendo); return <VistaPrevia diseno={viendo.diseno} marca={marca} vars={ej.vars} automaticos={ej.automaticos} asunto={viendo.asunto} onCerrar={() => setViendo(null)} />; })()}
      {editando && (
        <EditorDiseno titulo={editando.nombre} valor={{ asunto: editando.asunto, diseno: editando.diseno }}
          variables={editando.variables} automaticos={editando.automaticos} def={editando} clavePrueba={editando.clave}
          puedeGuardarComoPlantilla={false} onGuardar={guardar} onCerrar={() => setEditando(null)} showToast={showToast} />
      )}
    </div>
  );
}

// ── Marca ───────────────────────────────────────────────────────────────────
function Marca({ showToast }) {
  const [m, setM] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [movil, setMovil] = useState(false);
  useEffect(() => {
    pedir('/api/admin/correo/marca').then(d => setM(d.marca)).catch(e => { setM({ ...MARCA_POR_DEFECTO }); showToast?.(e.message, 'error'); });
  }, [showToast]);
  const ejemplo = useMemo(() => PLANTILLAS_BASE.find(p => p.id === 'base-anuncio').diseno(), []);
  const html = useMemo(() => (m ? htmlCorreo(ejemplo, { marca: m, vars: { nombre: 'Lucía' } }) : ''), [m, ejemplo]);
  if (!m) return <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cargando…</p>;
  const set = (k, v) => setM(x => ({ ...x, [k]: v }));
  const setRed = (k, v) => setM(x => ({ ...x, redes: { ...(x.redes || {}), [k]: v } }));
  const subirLogo = async (f) => {
    if (!f) return;
    setSubiendo(true);
    try { const d = await subirImagen(f); set('logo', d.url); }
    catch (e) { showToast?.(e.message, 'error'); }
    finally { setSubiendo(false); }
  };
  const guardar = async () => {
    setGuardando(true);
    try {
      const d = await pedir('/api/admin/correo/marca', { method: 'PUT', body: JSON.stringify({ marca: m }) });
      setM(d.marca); olvidarMarca(d.marca);
      showToast?.('Marca guardada: ya la llevan todos los correos.', 'success');
    } catch (e) { showToast?.(e.message, 'error'); }
    finally { setGuardando(false); }
  };
  const etq = { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', display: 'grid', gap: 5 };
  const campo = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 13 };
  const color = (k, txt) => (
    <label style={etq}><span>{txt}</span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="color" value={m[k]} onChange={e => set(k, e.target.value)} style={{ width: 44, height: 32, border: '1px solid var(--line)', borderRadius: 8, padding: 2, background: 'var(--bg)' }} />
        <input value={m[k]} onChange={e => set(k, e.target.value)} style={{ ...campo, width: 100, fontFamily: 'monospace' }} />
      </span>
    </label>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: 18, alignItems: 'start' }} className="marca-correo">
      <div style={{ ...tarjeta, display: 'grid', gap: 16 }}>
        <section style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Cabecera</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ width: 140, height: 70, borderRadius: 10, background: m.cabecera === 'banda' ? m.colorPrincipal : '#fff', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
              {m.logo ? <img src={m.logo} alt="Logo" style={{ maxWidth: '90%', maxHeight: '80%' }} /> : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Sin logo</span>}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="btn btn-sm btn-primary" style={{ cursor: 'pointer' }}>
                {subiendo ? 'Subiendo…' : m.logo ? 'Cambiar el logo' : 'Subir el logo'}
                <input type="file" accept="image/png,image/jpeg,image/gif" hidden onChange={e => { subirLogo(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {m.logo && <button type="button" className="btn btn-sm btn-outline" onClick={() => set('logo', '')}>Quitar el logo</button>}
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Mejor en PNG con fondo transparente. Sin logo, sale el nombre del club con el color principal.</p>
          <label style={etq}><span>Nombre del club</span><input value={m.nombre} onChange={e => set('nombre', e.target.value)} style={campo} /></label>
          <label style={etq}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tamaño del logo</span><span style={{ color: 'var(--ink-3)' }}>{m.logoAncho} px</span></span>
            <input type="range" min={60} max={320} value={m.logoAncho} onChange={e => set('logoAncho', Number(e.target.value))} style={{ accentColor: 'var(--purple)' }} />
          </label>
          <div style={etq}><span>Estilo</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={pastilla(m.cabecera !== 'banda')} onClick={() => set('cabecera', 'logo')}>Logo sobre blanco</button>
              <button type="button" style={pastilla(m.cabecera === 'banda')} onClick={() => set('cabecera', 'banda')}>Franja de color</button>
            </div>
          </div>
        </section>
        <section style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Colores y letra</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {color('colorPrincipal', 'Principal (botones, enlaces)')}
            {color('colorTexto', 'Texto')}
            {color('fondo', 'Fondo de fuera')}
            {color('lienzo', 'Fondo del correo')}
          </div>
          <div style={etq}>
            <span>Imagen de fondo (opcional)</span>
            <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>Ocupa todo el fondo, detrás del correo. Debajo queda el color de fuera, que es lo que se ve en los programas que no muestran imágenes de fondo (Outlook de escritorio). Cada diseño puede cambiarla o quitarla.</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {m.fondoImagen && <img src={m.fondoImagen} alt="" style={{ width: 90, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />}
              <label className="btn btn-sm btn-outline" style={{ cursor: 'pointer' }}>
                {m.fondoImagen ? 'Cambiar la imagen' : 'Subir una imagen'}
                <input type="file" accept="image/png,image/jpeg,image/gif" hidden onChange={async e => {
                  const f = e.target.files?.[0]; e.target.value = '';
                  if (!f) return;
                  try { const d = await subirImagen(f); set('fondoImagen', d.url); } catch (err) { showToast?.(err.message, 'error'); }
                }} />
              </label>
              {m.fondoImagen && <button type="button" className="btn btn-sm btn-outline" onClick={() => set('fondoImagen', '')}>Quitar</button>}
            </span>
          </div>
          <label style={etq}><span>Tipo de letra</span>
            <select value={m.fuente} onChange={e => set('fuente', e.target.value)} style={campo}>
              {Object.entries(FUENTES).map(([k, f]) => <option key={k} value={k}>{f.nombre}</option>)}
            </select>
            <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>Solo letras que tienen todos los ordenadores y móviles, para que el correo se vea igual en todas partes.</span>
          </label>
          <label style={etq}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>Esquinas del correo</span><span style={{ color: 'var(--ink-3)' }}>{m.radio} px</span></span>
            <input type="range" min={0} max={30} value={m.radio} onChange={e => set('radio', Number(e.target.value))} style={{ accentColor: 'var(--purple)' }} />
          </label>
        </section>
        <section style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Pie</h3>
          <label style={etq}><span>Texto del pie</span><input value={m.pieTexto} onChange={e => set('pieTexto', e.target.value)} style={campo} /></label>
          <label style={etq}><span>Web</span><input value={m.web} onChange={e => set('web', e.target.value)} style={campo} placeholder="https://www.aimeducation.es" /></label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {Object.entries(REDES).map(([k, n]) => (
              <label key={k} style={etq}><span>{n}</span><input value={m.redes?.[k] || ''} onChange={e => setRed(k, e.target.value)} style={campo} placeholder={k === 'whatsapp' ? 'https://wa.me/34…' : `https://${k}.com/…`} /></label>
            ))}
          </div>
        </section>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar la marca'}</button>
          <button type="button" className="btn btn-outline" onClick={() => setM({ ...MARCA_POR_DEFECTO, logo: m.logo })}>Colores de fábrica</button>
        </div>
      </div>
      <div style={{ position: 'sticky', top: 16, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 13 }}>Así se ve (con una plantilla de ejemplo)</strong>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" style={{ ...pastilla(!movil), padding: '5px 10px', fontSize: 12 }} onClick={() => setMovil(false)}>Ordenador</button>
            <button type="button" style={{ ...pastilla(movil), padding: '5px 10px', fontSize: 12 }} onClick={() => setMovil(true)}>Móvil</button>
          </div>
        </div>
        <iframe title="Ejemplo con la marca" srcDoc={html} sandbox="" style={{ border: '1px solid var(--line)', borderRadius: 14, width: movil ? 390 : '100%', maxWidth: '100%', height: '75vh', background: m.fondo, justifySelf: 'center' }} />
      </div>
      <style>{`@media (max-width: 900px){.marca-correo{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}
