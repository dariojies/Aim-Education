import React from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, ActIcono } from './Shared.jsx';
import { useRouter } from '../App.jsx';
import {
  useClasesPublicas, fichasWeb, horarioGrupo, monitoresGrupo, edadGrupo, edadesActividad,
  ordenarGrupos, cursoActual, PLAZAS,
} from './clasesPublicas.js';

// ─────────────────────────────────────────────────────────────────────────────
// La página de una actividad o de un programa (#295). Los grupos salen como en
// «Clases y horarios → Lista de clases»: cada grupo una vez, con todos sus días
// y horas, en vez de un renglón por cada hueco del horario (que repetía el mismo
// grupo tantas veces como días tenía). Nada de precios inventados: se pregunta.
// ─────────────────────────────────────────────────────────────────────────────

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, paddingBottom: 12, borderBottom: "1px dashed var(--line)" }}>
      <span style={{ color: "var(--ink-3)", fontWeight: 600 }}>{label}</span>
      <span style={{ color: "var(--ink)", fontWeight: 700, textAlign: "right" }}>{value}</span>
    </div>
  );
}

// Una tarjeta de la lista de actividades. La usan también la portada y el
// listado completo.
export function TarjetaActividad({ act, delay = 0 }) {
  const { go } = useRouter();
  const destino = act.enlace || `/actividades/${act.id}`;
  const n = act.grupos?.length;
  const edades = edadesActividad(act.grupos);
  return (
    <div className={`act-card ${act.className || ''} fade-up d${delay}`} style={{ '--act': act.color }} onClick={() => go(destino)}>
      <div className={`icon-tile suave${act.logo ? ' con-logo' : ''}`}><ActIcono act={act} size={act.logo ? 44 : 38} /></div>
      <h3>{act.name}</h3>
      <p>{act.lede}</p>
      {n > 0 && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>
          {n} grupo{n !== 1 ? 's' : ''}{edades ? ` · ${edades.charAt(0).toLowerCase()}${edades.slice(1)}` : ''}
        </div>
      )}
      <a className="more" href={destino} onClick={(e) => e.preventDefault()}>Saber más <I.Arrow /></a>
    </div>
  );
}

function Grupo({ g, act, conActividad }) {
  const { go } = useRouter();
  const horario = horarioGrupo(g);
  const monitores = monitoresGrupo(g);
  const edad = edadGrupo(g);
  const plazas = PLAZAS[g.plazas] || PLAZAS.libres;
  const sobre = encodeURIComponent(`${g.nombre} (${g.actividad})`);
  return (
    <div className="grupo-web" style={{ borderLeftColor: plazas.color, '--act': act.color }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 16 }}>{g.nombre}</b>
          {conActividad && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{g.actividad}</span>}
          {edad && <span className="level-tag">{edad}</span>}
        </div>
        <div style={{ display: 'grid', gap: 3, marginTop: 6, fontSize: 14, color: 'var(--ink-2)' }}>
          {horario.length ? horario.map((h, i) => (
            <span key={i} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <I.Clock width={14} height={14} style={{ flexShrink: 0, color: 'var(--act)' }} />
              <span><b style={{ color: 'var(--ink)' }}>{h.dias}</b> · {h.hora}</span>
            </span>
          )) : <span style={{ color: 'var(--ink-3)' }}>Horario por confirmar</span>}
          {monitores.length > 0 && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Con {monitores.join(' y ')}</span>}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8, justifyItems: 'end', alignContent: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: plazas.color, whiteSpace: 'nowrap' }}>{plazas.texto}</span>
        {g.plazas === 'completo'
          ? <button className="btn btn-sm btn-outline" onClick={() => go(`/contacto?sobre=${sobre}`)}>Pedir plaza</button>
          : <button className="btn btn-sm" style={{ background: 'var(--act)', color: 'white' }} onClick={() => go('/auth?mode=register')}>Reservar</button>}
      </div>
    </div>
  );
}

export default function PublicActivity({ id }) {
  const { go } = useRouter();
  const { cargando, actividades } = useClasesPublicas();
  const fichas = fichasWeb(actividades);
  const act = fichas.find(f => f.id === id);

  if (!act) {
    return (
      <>
        <AimHeader route="activities" />
        <main style={{ paddingTop: 0 }}>
          <section className="block tight">
            <div className="container" style={{ textAlign: 'center', padding: '70px 0' }}>
              {cargando ? <p style={{ color: 'var(--ink-3)' }}>Cargando…</p> : (
                <>
                  <h1 className="title-display">Esa actividad no existe</h1>
                  <p style={{ color: 'var(--ink-3)', marginTop: 12 }}>Puede que haya cambiado de nombre o que ya no la ofrezcamos.</p>
                  <button className="btn btn-outline" style={{ marginTop: 26 }} onClick={() => go('/actividades')}>← Ver todas las actividades</button>
                </>
              )}
            </div>
          </section>
          <AimFooter />
        </main>
      </>
    );
  }

  const grupos = ordenarGrupos(act.grupos);
  const edades = edadesActividad(act.grupos) || act.ages;
  const sobre = encodeURIComponent(act.name);
  // Las tres siguientes del catálogo, para que no salgan siempre las mismas.
  const lista = fichas.filter(f => !f.enlace);
  const yo = lista.findIndex(f => f.id === act.id);
  const otras = [1, 2, 3].map(k => lista[(yo + k + lista.length) % lista.length])
    .filter((f, i, arr) => f && f.id !== act.id && arr.indexOf(f) === i);
  // En un programa los grupos pueden ser de varias actividades: se dice de cuál.
  const variasActividades = new Set(grupos.map(g => g.actividad)).size > 1 || act.programa;

  return (
    <>
      <AimHeader route="activities" />
      {/* El color de la actividad, para toda la página: tiñe botones, iconos y fondos. */}
      <main style={{ paddingTop: 0, '--act': act.color }}>
        <section className={`act-hero ${act.className || ''}`}>
          <div className="container">
            <div className="act-hero-grid">
              <div className="fade-up">
                <div className="breadcrumb">
                  <a href="/actividades" onClick={(e) => { e.preventDefault(); go("/actividades"); }} style={{ color: "rgba(255,255,255,.85)" }}>Actividades</a>
                  <span> · </span><b>{act.name}</b>
                </div>
                <h1>{act.name}</h1>
                <p className="lede">{act.lede}</p>

                <div className="quick-stats">
                  {/* Un «0» enorme no dice nada bueno: si aún no hay grupos, «pronto». */}
                  <div className="qs">
                    <div className="v" style={act.grupos?.length ? null : { fontSize: 20 }}>{act.grupos?.length || (act.sinHorario ? 'A medida' : act.grupos ? 'Pronto' : '—')}</div>
                    <div className="l">{!act.grupos?.length && act.sinHorario ? 'Horario' : act.grupos?.length === 1 ? 'Grupo este curso' : 'Grupos este curso'}</div>
                  </div>
                  <div className="qs"><div className="v" style={{ fontSize: 20 }}>{edades || '—'}</div><div className="l">Edades</div></div>
                  <div className="qs"><div className="v">{cursoActual()}</div><div className="l">Curso</div></div>
                </div>

                <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
                  <button className="btn btn-lg" style={{ background: "var(--ink)", color: "white" }} onClick={() => go("/auth?mode=register")}>
                    Reservar plaza <I.Arrow />
                  </button>
                  <button className="btn btn-lg" style={{ background: "rgba(255,255,255,.18)", color: "white", border: "1px solid rgba(255,255,255,.4)" }}
                    onClick={() => go(`/contacto?sobre=${sobre}`)}>
                    Pedir información
                  </button>
                </div>
              </div>

              <div className="fade-up d2 act-hero-icono">
                <div className={`icon-tile suave grande${act.logo ? ' con-logo' : ''}`}>
                  <ActIcono act={act} size={act.logo ? 110 : 150} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Qué es + datos */}
        <section className="block tight">
          <div className="container">
            <div className="act-info-grid">
              <div>
                <span className="eyebrow purple">Qué es</span>
                <h2 className="section-title">Sobre {act.name}</h2>
                <p style={{ fontSize: 17, color: "var(--ink-2)", lineHeight: 1.6, marginTop: 16 }}>{act.long}</p>

                {act.aprender?.length > 0 && (
                  <div style={{ marginTop: 36 }}>
                    <h3 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, letterSpacing: "-.02em", margin: "0 0 18px" }}>
                      Lo que aprenderás
                    </h3>
                    <div className="aprender-grid">
                      {act.aprender.map((item, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 14, background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 12 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center", background: "color-mix(in oklab, var(--act) 16%, var(--bg-2))", color: "var(--act)", flexShrink: 0 }}>
                            <I.Check />
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4 }}>{item}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <aside className="act-datos">
                <div className="pill-badge purple" style={{ marginBottom: 14 }}>{act.tag}</div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", margin: 0 }}>
                  Datos del programa
                </h3>
                <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
                  <InfoRow label="Edad" value={edades || 'Consúltanos'} />
                  {act.grupos && <InfoRow label="Grupos" value={act.grupos.length ? `${act.grupos.length} este curso` : act.sinHorario ? 'Horario a medida' : 'Próximamente'} />}
                  <InfoRow label="Curso" value={`${cursoActual()} · septiembre a junio`} />
                  <InfoRow label="Precios" value="Te informamos sin compromiso" />
                  <InfoRow label="Para probar" value="Pase Explorador: 3 sesiones" />
                </div>
                <button className="btn btn-block btn-lg" style={{ marginTop: 22, background: "var(--act)", color: "white" }} onClick={() => go("/auth?mode=register")}>
                  Reservar mi plaza
                </button>
                <button className="btn btn-block btn-outline" style={{ marginTop: 10 }} onClick={() => go(`/contacto?sobre=${sobre}`)}>
                  Solicitar más info
                </button>
              </aside>
            </div>
          </div>
        </section>

        {/* Grupos y horarios */}
        <section className="block tight" style={{ background: "var(--bg-3)" }}>
          <div className="container">
            <span className="eyebrow purple">Grupos y horarios</span>
            <h2 className="section-title">Horarios del curso {cursoActual()}</h2>
            <p className="section-lede" style={{ marginTop: 8, marginBottom: 26 }}>
              Encuentra el grupo que mejor encaje con tu edad y nivel. Las plazas se asignan por orden de inscripción.
            </p>

            {cargando ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)", fontSize: 16 }}>Cargando horarios…</div>
            ) : !act.grupos ? (
              <div className="grupos-vacio">No hemos podido cargar los horarios. Vuelve a intentarlo en un momento o llámanos al 956 742 216.</div>
            ) : grupos.length === 0 && act.sinHorario ? (
              <div className="grupos-vacio">
                {act.sinHorario} <a href={`/contacto?sobre=${sobre}`} onClick={(e) => { e.preventDefault(); go(`/contacto?sobre=${sobre}`); }}>Pedir información</a>
              </div>
            ) : grupos.length === 0 ? (
              <div className="grupos-vacio">
                Todavía no hay grupos publicados para este curso. <a href={`/contacto?sobre=${sobre}`} onClick={(e) => { e.preventDefault(); go(`/contacto?sobre=${sobre}`); }}>Escríbenos</a> y te avisamos.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {grupos.map(g => <Grupo key={g.id} g={g} act={act} conActividad={variasActividades} />)}
              </div>
            )}
          </div>
        </section>

        {/* Otras actividades */}
        {otras.length > 0 && (
          <section className="block tight">
            <div className="container">
              <span className="eyebrow purple">Mira también</span>
              <h2 className="section-title">Otras actividades del club</h2>
              <div className="act-grid" style={{ marginTop: 24 }}>
                {otras.map((a) => <TarjetaActividad key={a.id} act={a} />)}
              </div>
            </div>
          </section>
        )}

        <AimFooter />
      </main>
    </>
  );
}
