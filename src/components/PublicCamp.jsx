import React, { useState } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, MagicText } from './Shared.jsx';
import { useRouter } from '../App.jsx';

function PriceCard({ tag, price, discount, desc, features, featured }) {
  return (
    <div style={{
      background: featured ? "var(--grad-aim)" : "var(--bg-2)",
      border: featured ? "0" : "1px solid var(--line)",
      borderRadius: 18,
      padding: 28,
      color: featured ? "white" : "var(--ink)",
      position: "relative",
      transform: featured ? "translateY(-10px)" : "none",
      boxShadow: featured ? "var(--shadow)" : "none",
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      {featured && (
        <span style={{position: "absolute", top: 16, right: 16, background: "var(--ink)", color: "white", padding: "4px 12px", borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase"}}>
          Más elegido
        </span>
      )}
      <div style={{fontSize: 12, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: featured ? "rgba(255,255,255,.85)" : "var(--ink-3)"}}>{tag}</div>
      <div style={{display: "flex", alignItems: "baseline", gap: 10}}>
        <span style={{fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 800, letterSpacing: "-.025em", lineHeight: 1}}>{price}</span>
        {discount && <span style={{fontSize: 13, fontWeight: 600, color: featured ? "rgba(255,255,255,.7)" : "var(--ink-3)", textDecoration: "line-through"}}>{discount}</span>}
      </div>
      <p style={{margin: 0, fontSize: 14, color: featured ? "rgba(255,255,255,.85)" : "var(--ink-2)", lineHeight: 1.5}}>{desc}</p>
      <ul style={{listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 8}}>
        {features.map((f, i) => (
          <li key={i} style={{display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14}}>
            <span style={{width: 18, height: 18, borderRadius: "50%", background: featured ? "rgba(255,255,255,.22)" : "color-mix(in oklab, var(--teal) 14%, var(--bg-2))", color: featured ? "white" : "var(--teal)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1}}>
              <I.Check width={11} height={11} />
            </span>
            {f}
          </li>
        ))}
      </ul>
      <button className="btn" style={{
        marginTop: "auto",
        background: featured ? "var(--ink)" : "var(--bg-3)",
        color: featured ? "white" : "var(--ink)",
        border: featured ? "0" : "1.5px solid var(--line)",
      }}>
        Elegir este plan
      </button>
    </div>
  );
}

export default function PublicCamp() {
  const { go } = useRouter();
  const [selectedWeek, setSelectedWeek] = useState(0);

  const WEEKS = [
    { num: "01", range: "1 – 5 Jul", theme: "Aventura y deportes", spots: 8, total: 24 },
    { num: "02", range: "8 – 12 Jul", theme: "Robots, ciencia y código", spots: 4, total: 24 },
    { num: "03", range: "15 – 19 Jul", theme: "Cine, arte y baile", spots: 12, total: 24 },
    { num: "04", range: "22 – 26 Jul", theme: "Olimpiadas Aim", spots: 0, total: 24 },
  ];

  const DAY_PLAN = [
    { time: "09:00", title: "Acogida", desc: "Llegada escalonada, desayuno saludable.", color: "var(--orange-soft)" },
    { time: "09:30", title: "Bloque activo", desc: "Taekwondo · funcional · gimnasia rítmica.", color: "var(--teal)" },
    { time: "11:00", title: "Snack + juego libre", desc: "Patio y zona de descanso.", color: "var(--yellow)" },
    { time: "11:30", title: "Bloque creativo", desc: "Pintura · robótica · baile.", color: "var(--purple)" },
    { time: "13:00", title: "Comida", desc: "Menú equilibrado adaptado a alergias.", color: "var(--orange)" },
    { time: "14:00", title: "Bloque inglés", desc: "Inmersión lúdica con monitores nativos.", color: "var(--blue)" },
    { time: "15:30", title: "Cierre + recogida", desc: "Recogida hasta las 16:00.", color: "var(--pink)" },
  ];

  return (
    <>
      <AimHeader route="camp" />
      <main style={{paddingTop: 0}}>

        {/* Hero */}
        <section className="camp-hero">
          <div className="container">
            <div style={{display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 48, alignItems: "center"}}>
              <div className="fade-up">
                <span className="pill-day">🌞 Verano 2026 · Algeciras</span>
                <h1>Campamento<br/>de verano Aim.</h1>
                <p>
                  Cuatro semanas de aventura, aprendizaje y diversión. Deporte por la mañana,
                  inglés y talleres creativos por la tarde. Para niños y niñas de <b>4 a 14 años</b>.
                </p>
                <div style={{display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap"}}>
                  <button className="btn btn-lg" style={{background: "var(--ink)", color: "white"}} onClick={() => go("/auth?mode=register")}>
                    Reservar plaza <I.Arrow />
                  </button>
                  <button className="btn btn-lg" style={{background: "rgba(255,255,255,.22)", color: "white", border: "1px solid rgba(255,255,255,.4)"}}>
                    Descargar folleto
                  </button>
                </div>

                <div style={{display: "flex", gap: 32, marginTop: 38, flexWrap: "wrap"}}>
                  <div>
                    <div style={{fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 36, letterSpacing: "-.02em", lineHeight: 1}}>4</div>
                    <div style={{fontSize: 12, opacity: .9, marginTop: 4, fontWeight: 600}}>semanas temáticas</div>
                  </div>
                  <div>
                    <div style={{fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 36, letterSpacing: "-.02em", lineHeight: 1}}>24</div>
                    <div style={{fontSize: 12, opacity: .9, marginTop: 4, fontWeight: 600}}>plazas/semana</div>
                  </div>
                  <div>
                    <div style={{fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 36, letterSpacing: "-.02em", lineHeight: 1}}>4-14</div>
                    <div style={{fontSize: 12, opacity: .9, marginTop: 4, fontWeight: 600}}>años de edad</div>
                  </div>
                  <div>
                    <div style={{fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 36, letterSpacing: "-.02em", lineHeight: 1}}>-30%</div>
                    <div style={{fontSize: 12, opacity: .9, marginTop: 4, fontWeight: 600}}>familias socias</div>
                  </div>
                </div>
              </div>

              <div className="fade-up d2">
                <div style={{
                  aspectRatio: "4/5",
                  background: "repeating-linear-gradient(45deg, rgba(255,255,255,.08) 0 12px, rgba(255,255,255,.16) 12px 24px)",
                  borderRadius: 24,
                  border: "2px solid rgba(255,255,255,.3)",
                  boxShadow: "0 30px 80px -20px rgba(0,0,0,.4)",
                  position: "relative",
                  display: "grid",
                  placeItems: "center",
                }}>
                  <span style={{fontFamily: "var(--font-mono)", fontSize: 13, color: "rgba(255,255,255,.85)", background: "rgba(0,0,0,.2)", padding: "8px 14px", borderRadius: 8}}>
                    foto · campamento aim
                  </span>
                  <span style={{position: "absolute", top: 24, right: -16, background: "white", color: "var(--ink)", padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, boxShadow: "var(--shadow)"}}>🥋 Taekwondo</span>
                  <span style={{position: "absolute", bottom: 60, left: -22, background: "white", color: "var(--ink)", padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, boxShadow: "var(--shadow)"}}>🤖 Robótica</span>
                  <span style={{position: "absolute", top: "50%", right: -28, background: "white", color: "var(--ink)", padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, boxShadow: "var(--shadow)"}}>🌍 Inglés</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Weeks selector */}
        <section className="block tight">
          <div className="container">
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 28}}>
              <div>
                <span className="eyebrow orange">Elige tu semana</span>
                <h2 className="section-title">Cuatro semanas, <MagicText>cuatro temas.</MagicText></h2>
              </div>
              <p style={{fontSize: 14, color: "var(--ink-3)", maxWidth: 320}}>
                Puedes inscribirte a una, varias o las cuatro. Cada semana es independiente.
              </p>
            </div>

            <div className="weeks-grid">
              {WEEKS.map((w, i) => (
                <div key={i}
                  className={`week-card ${selectedWeek === i ? "is-selected" : ""} ${w.spots === 0 ? "full" : ""}`}
                  onClick={() => setSelectedWeek(i)}>
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start"}}>
                    <div className="num">SEM {w.num}</div>
                    {w.spots === 0 ? (
                      <span style={{background: "var(--orange)", color: "white", fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999, letterSpacing: ".05em"}}>COMPLETA</span>
                    ) : (
                      <span style={{background: "color-mix(in oklab, var(--teal) 16%, var(--bg-2))", color: "var(--teal)", fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999, letterSpacing: ".05em"}}>{w.spots} plazas</span>
                    )}
                  </div>
                  <div className="range">{w.range}</div>
                  <div className="theme">{w.theme}</div>
                  <div style={{marginTop: 14}}>
                    <div style={{height: 6, background: "var(--bg-3)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--line-2)"}}>
                      <div style={{
                        height: "100%",
                        width: `${((w.total - w.spots) / w.total) * 100}%`,
                        background: w.spots === 0 ? "var(--orange)" : "var(--orange-soft)",
                      }} />
                    </div>
                    <div style={{display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--ink-3)", fontWeight: 600}}>
                      <span>{w.total - w.spots}/{w.total} inscritos</span>
                      <span>{w.spots > 0 ? "Disponible" : "Lista de espera"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Day schedule */}
        <section className="block tight" style={{background: "var(--bg-3)"}}>
          <div className="container">
            <span className="eyebrow orange">Un día en el campamento</span>
            <h2 className="section-title">Equilibrio entre <MagicText>deporte</MagicText>, <MagicText>creatividad</MagicText> e <MagicText>inglés</MagicText>.</h2>

            <div style={{marginTop: 32, display: "grid", gap: 12}}>
              {DAY_PLAN.map((d, i) => (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "100px 12px 1fr",
                  gap: 18,
                  alignItems: "center",
                  background: "var(--bg-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 14,
                  padding: "16px 22px",
                  transition: "transform var(--tx-fast) ease",
                  cursor: "default",
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = "translateX(6px)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "translateX(0)"}>
                  <div style={{fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-.015em"}}>{d.time}</div>
                  <div style={{width: 4, height: "60%", background: d.color, borderRadius: 99, justifySelf: "center"}} />
                  <div>
                    <div style={{fontSize: 15, fontWeight: 700, color: "var(--ink)"}}>{d.title}</div>
                    <div style={{fontSize: 13, color: "var(--ink-2)", marginTop: 2}}>{d.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="block tight">
          <div className="container">
            <span className="eyebrow orange">Precios y descuentos</span>
            <h2 className="section-title">Una tarifa <MagicText>clara</MagicText>, sin sorpresas.</h2>

            <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginTop: 32}}>
              <PriceCard
                tag="Una semana"
                price="160€"
                desc="Una semana completa, lunes a viernes de 9:00 a 16:00."
                features={["Comida incluida", "Material y excursiones", "Seguro de accidentes"]}
              />
              <PriceCard
                featured
                tag="Mes completo"
                price="550€"
                discount="vs 640€"
                desc="Las cuatro semanas con un -14% sobre el precio individual."
                features={["Todo lo anterior", "Camiseta exclusiva campamento", "Foto-libro de recuerdo"]}
              />
              <PriceCard
                tag="Familia Aim"
                price="-30%"
                discount="sobre cualquier paquete"
                desc="Si ya eres familia del club, descuento automático en cualquier reserva."
                features={["Aplica sobre cualquier semana", "Acumulable con hermanos", "Prioridad de reserva"]}
              />
            </div>

            <div style={{
              marginTop: 40,
              padding: "28px 32px",
              background: "var(--bg-2)",
              border: "1px solid var(--line)",
              borderRadius: 18,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 24,
              flexWrap: "wrap",
            }}>
              <div>
                <h3 style={{fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", margin: 0}}>
                  ¿Listo para reservar?
                </h3>
                <p style={{margin: "6px 0 0", color: "var(--ink-3)", fontSize: 14}}>
                  Paga el 20% ahora para fijar tu plaza. El resto el primer día del campamento.
                </p>
              </div>
              <button className="btn btn-gradient btn-lg" onClick={() => go("/auth?mode=register")}>
                Reservar plaza <I.Arrow />
              </button>
            </div>
          </div>
        </section>

        <AimFooter />
      </main>
    </>
  );
}
