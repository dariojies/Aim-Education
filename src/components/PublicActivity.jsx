import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, ACT_BY_ID } from './Shared.jsx';
import { useRouter } from '../App.jsx';

function InfoRow({ label, value }) {
  return (
    <div style={{display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, paddingBottom: 12, borderBottom: "1px dashed var(--line)"}}>
      <span style={{color: "var(--ink-3)", fontWeight: 600}}>{label}</span>
      <span style={{color: "var(--ink)", fontWeight: 700, textAlign: "right"}}>{value}</span>
    </div>
  );
}

const PILL_BY_ID = {
  taekwondo: "", ballet: "pink", ingles: "blue", robotica: "yellow",
  funcional: "orange", pintura: "purple", baile: "pink", gimnasia: "",
  kickboxing: "orange", pilates: "purple",
};

const LEARN = {
  taekwondo: [
    "Técnica completa: poomsae, sparring, defensa personal",
    "Valores de respeto, disciplina y autocontrol",
    "Preparación para exámenes oficiales ITF",
    "Confianza, equilibrio y resistencia física",
  ],
  ballet: [
    "Técnica clásica con metodología RAD",
    "Musicalidad, expresión y memoria coreográfica",
    "Preparación para exámenes oficiales RAD",
    "Postura, flexibilidad y fuerza corporal",
  ],
  ingles: [
    "Speaking, listening, reading y writing",
    "Preparación para exámenes Cambridge oficiales",
    "Vocabulario y gramática progresivos",
    "Confianza para hablar inglés con fluidez",
  ],
  robotica: [
    "Pensamiento computacional y lógica",
    "Construcción mecánica con LEGO Education",
    "Programación por bloques (Scratch, mBlock)",
    "Resolución creativa de problemas",
  ],
  funcional: [
    "Fuerza funcional y movilidad articular",
    "Trabajo de core y postura",
    "Resistencia cardiovascular",
    "Técnica correcta para prevenir lesiones",
  ],
  pintura: [
    "Técnicas: acuarela, óleo, mixtas",
    "Teoría del color y composición",
    "Dibujo del natural y observación",
    "Expresión personal y creatividad",
  ],
  kickboxing: [
    "Técnica de boxeo y patadas",
    "Cardio de alta intensidad",
    "Autodefensa práctica",
    "Coordinación, agilidad y reflejos",
  ],
  baile: [
    "Estilos urbanos contemporáneos",
    "Coreografía y trabajo en grupo",
    "Expresión corporal y musicalidad",
    "Resistencia y coordinación",
  ],
  pilates: [
    "Trabajo de core profundo",
    "Postura y alineación corporal",
    "Flexibilidad y movilidad",
    "Respiración consciente",
  ],
  gimnasia: [
    "Manejo de aparatos (aro, cinta, mazas, pelota)",
    "Coreografía y musicalidad",
    "Flexibilidad y fuerza",
    "Preparación para competición autonómica",
  ],
};

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export default function PublicActivity({ id }) {
  const { go } = useRouter();
  const act = ACT_BY_ID[id] || ACT_BY_ID["taekwondo"];

  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/classes')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const filtered = data.filter(c => c.act === id);
        // Sort by day index, then by start hour
        filtered.sort((a, b) => {
          if (a.d !== b.d) return a.d - b.d;
          return a.s - b.s;
        });
        setClasses(filtered);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  return (
    <>
      <AimHeader route="activities" />
      <main style={{paddingTop: 0}}>
        <section className={`act-hero ${act.className}`}>
          <div className="container">
            <div className="act-hero-grid">
              <div className="fade-up">
                <div className="breadcrumb">
                  <a href="#" onClick={(e) => { e.preventDefault(); go("/actividades"); }} style={{color: "rgba(255,255,255,.85)"}}>Actividades</a>
                  <span> · </span><b>{act.name}</b>
                </div>
                <h1>{act.name}</h1>
                <p className="lede">{act.lede}</p>

                <div className="quick-stats">
                  <div className="qs"><div className="v">{act.levels.length}</div><div className="l">Grupos por niveles</div></div>
                  <div className="qs"><div className="v">8 – 12</div><div className="l">Alumnos por grupo</div></div>
                  <div className="qs"><div className="v">2026</div><div className="l">Plazas curso actual</div></div>
                </div>

                <div style={{display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap"}}>
                  <button className="btn btn-lg" style={{background: "var(--ink)", color: "white"}} onClick={() => go("/auth?mode=register")}>
                    Reservar plaza <I.Arrow />
                  </button>
                  <button className="btn btn-lg" style={{background: "rgba(255,255,255,.18)", color: "white", border: "1px solid rgba(255,255,255,.4)"}}>
                    Clase de prueba gratis
                  </button>
                </div>
              </div>

              <div className="fade-up d2">
                <div className="act-photo-frame">
                  <div className="ph-text">foto · {act.name.toLowerCase()}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Descripción + datos clave */}
        <section className="block tight">
          <div className="container">
            <div style={{display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 36, alignItems: "start"}}>
              <div>
                <span className="eyebrow purple">Qué es</span>
                <h2 className="section-title">Sobre {act.name.toLowerCase()}</h2>
                <p style={{fontSize: 17, color: "var(--ink-2)", lineHeight: 1.6, marginTop: 16}}>
                  {act.long}
                </p>

                <div style={{marginTop: 36}}>
                  <h3 style={{fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, letterSpacing: "-.02em", margin: "0 0 18px"}}>
                    Lo que aprenderás
                  </h3>
                  <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14}}>
                    {LEARN[act.id]?.map((item, i) => (
                      <div key={i} style={{display: "flex", gap: 12, alignItems: "flex-start", padding: 14, background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 12}}>
                        <div className={`${act.className}`} style={{width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center", background: "color-mix(in oklab, var(--act) 16%, var(--bg-2))", color: "var(--act)", flexShrink: 0}}>
                          <I.Check />
                        </div>
                        <div style={{fontSize: 14, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4}}>{item}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <aside style={{position: "sticky", top: 120, background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 18, padding: 24}}>
                <div className={`pill-badge ${PILL_BY_ID[act.id] || "purple"}`} style={{marginBottom: 14}}>{act.tag}</div>
                <h3 style={{fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", margin: 0}}>
                  Datos del programa
                </h3>
                <div style={{display: "grid", gap: 14, marginTop: 18}}>
                  <InfoRow label="Edad" value={act.ages} />
                  <InfoRow label="Duración" value="Curso completo · sept–junio" />
                  <InfoRow label="Mensualidad" value="Desde 49€/mes" />
                  <InfoRow label="Matrícula" value="35€ (única)" />
                  <InfoRow label="Material" value="Incluido (uniforme aparte)" />
                  <InfoRow label="Hermanos" value="-15% en mensualidad" />
                </div>
                <button className={`btn btn-block btn-lg ${act.className}`} style={{marginTop: 22, background: "var(--act)", color: "white"}} onClick={() => go("/auth?mode=register")}>
                  Reservar mi plaza
                </button>
                <button className="btn btn-block btn-outline" style={{marginTop: 10}}>
                  Solicitar más info
                </button>
              </aside>
            </div>
          </div>
        </section>

        {/* Horarios */}
        <section className="block tight" style={{background: "var(--bg-3)"}}>
          <div className="container">
            <span className="eyebrow purple">Grupos y horarios</span>
            <h2 className="section-title">Horarios del curso 2025-2026</h2>
            <p className="section-lede" style={{marginTop: 8, marginBottom: 26}}>
              Encuentra el grupo que mejor encaje con tu edad y nivel. Las plazas se asignan
              por orden de inscripción.
            </p>

            {loading ? (
              <div style={{padding: 40, textAlign: "center", color: "var(--ink-3)", fontSize: 16}}>
                Cargando horarios de la base de datos...
              </div>
            ) : classes.length === 0 ? (
              <div style={{padding: 40, textAlign: "center", background: "var(--bg-2)", border: "1px dashed var(--line)", borderRadius: 14, color: "var(--ink-3)"}}>
                No hay horarios disponibles para esta actividad actualmente.
              </div>
            ) : (
              <table className={`schedule-table ${act.className}`}>
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>Horario</th>
                    <th>Grupo</th>
                    <th>Sala</th>
                    <th>Profesor/a</th>
                    <th style={{textAlign: "right"}}>Plazas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c, i) => {
                    const parts = c.students.split('/');
                    const current = parseInt(parts[0], 10);
                    const max = parseInt(parts[1], 10);
                    const left = max - current;
                    const spotsText = left <= 0 ? "Completo" : left <= 3 ? `${left} plazas libres` : "Disponible";
                    const spotsColor = left <= 0 ? "var(--orange)" : left <= 3 ? "var(--orange-soft)" : "var(--teal)";

                    return (
                      <tr key={i}>
                        <td style={{fontWeight: 700}}>{DAY_NAMES[c.d] || "—"}</td>
                        <td>
                          <span style={{display: "inline-flex", gap: 6, alignItems: "center"}}>
                            <I.Clock width={14} height={14}/> {c.time || `${c.s}:00`}
                          </span>
                        </td>
                        <td>{c.title}</td>
                        <td><span className="level-tag">{c.room}</span></td>
                        <td style={{color: "var(--ink-2)"}}>{c.monitor || "—"}</td>
                        <td style={{textAlign: "right", fontWeight: 700, color: spotsColor}}>
                          {spotsText}
                        </td>
                        <td>
                          <button className={`btn btn-sm ${act.className}`} style={{background: "var(--act)", color: "white"}} onClick={() => go("/auth?mode=register")}>
                            Reservar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Otras actividades */}
        <section className="block tight">
          <div className="container">
            <span className="eyebrow purple">Mira también</span>
            <h2 className="section-title">Otras actividades del club</h2>
            <div className="act-grid" style={{marginTop: 24}}>
              {Object.values(ACT_BY_ID).filter(a => a.id !== act.id).slice(0, 3).map((a) => (
                <div key={a.id} className={`act-card ${a.className}`} onClick={() => go(`/actividades/${a.id}`)}>
                  <div className="icon-tile"><img src={a.iconAsset} alt={a.name} /></div>
                  <h3>{a.name}</h3>
                  <p>{a.lede}</p>
                  <a className="more" href="#" onClick={(e) => e.preventDefault()}>Saber más <I.Arrow /></a>
                </div>
              ))}
            </div>
          </div>
        </section>

        <AimFooter />
      </main>
    </>
  );
}
