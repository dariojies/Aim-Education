import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, MagicText, campDayParts } from './Shared.jsx';
import { useRouter } from '../App.jsx';

const CAMP_MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
// ── Precios ──────────────────────────────────────────────────────────────────
// Salen del catálogo con el que cobra el club, no escritos aquí a mano: es la
// única forma de que la web no acabe anunciando una tarifa que ya no existe.
function TarifasCampamento() {
  const [datos, setDatos] = useState(null);

  useEffect(() => {
    fetch('/api/camp/precios')
      .then(r => r.ok ? r.json() : null)
      .then(setDatos)
      .catch(() => { });
  }, []);

  if (!datos) return null;

  const de = (clave) => datos.tarifas.find(t => t.clave === clave);
  const semana = de('semana');
  const quincena = de('quincena');
  const mes = de('mes');
  const completo = de('completo');
  const dia = de('dia');
  const eur = (n) => `${Number(n) % 1 === 0 ? Number(n) : Number(n).toFixed(2)}€`;

  const sueltas = (t) => t?.comparado ? `vs ${eur(t.comparado)} sueltas` : null;

  return (
    <>
      <div className="camp-pricing-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginTop: 32 }}>
        {semana && (
          <PriceCard
            tag="Una semana"
            price={eur(semana.precio)}
            desc="Una semana completa, de lunes a viernes."
            features={["De lunes a viernes, de 9:00 a 14:00", "Material y excursiones", "Seguro de accidentes"]}
          />
        )}
        {mes && (
          <PriceCard
            featured
            tag="Un mes"
            price={eur(mes.precio)}
            discount={sueltas(mes)}
            desc={mes.ahorroPct
              ? `Cuatro semanas con un ${mes.ahorroPct}% de ahorro frente a pagarlas sueltas.`
              : "Cuatro semanas de campamento."}
            features={["Todo lo anterior", "Plaza asegurada todo el mes", "Un solo recibo"]}
          />
        )}
        {completo && (
          <PriceCard
            tag="Verano completo"
            price={eur(completo.precio)}
            desc="Todo el campamento, de la primera semana a la última."
            features={["Todo lo anterior", "Sin pensar en reservar cada mes", "El precio por semana más bajo"]}
          />
        )}
      </div>

      {/* Otras formas de venir. */}
      <div style={{
        marginTop: 20, padding: "18px 22px", background: "var(--bg-2)",
        border: "1px solid var(--line)", borderRadius: 18,
        display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center",
      }}>
        {quincena && (
          <span style={{ fontSize: 14, color: "var(--ink-2)" }}>
            <b style={{ color: "var(--ink)" }}>Quincena</b> · {eur(quincena.precio)}
          </span>
        )}
        {dia && (
          <span style={{ fontSize: 14, color: "var(--ink-2)" }}>
            <b style={{ color: "var(--ink)" }}>Día suelto</b> · {eur(dia.precio)}
          </span>
        )}
      </div>

      {/* Matinal y custodia: hay que decir qué son, no basta con nombrarlos. */}
      {datos.servicio && (
        <div style={{
          marginTop: 20, padding: "24px 26px", background: "var(--bg-2)",
          border: "1px solid var(--line)", borderRadius: 18,
        }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 4 }}>
            ¿Necesitáis más margen por la mañana o por la tarde?
          </div>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--ink-3)" }}>
            El campamento va de 9:00 a 14:00. Si os viene mal ese horario, hay dos servicios
            que lo estiran por los extremos y se pagan solo los días que se usan.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            {[
              { t: "Matinal", h: "Entrada a las 8:00", d: "Tu hijo entra una hora antes, a las 8:00 en vez de a las 9:00.", c: "var(--orange-soft)" },
              { t: "Custodia", h: "Salida a las 15:00", d: "Tu hijo sale una hora más tarde, a las 15:00 en vez de a las 14:00.", c: "var(--purple)" },
            ].map(x => (
              <div key={x.t} style={{ background: "var(--bg-3)", border: "1px solid var(--line-2)", borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 6, height: 18, borderRadius: 99, background: x.c }} />
                  <b style={{ fontSize: 15 }}>{x.t}</b>
                  <span style={{ fontSize: 11, fontWeight: 800, color: x.c, background: `color-mix(in oklab, ${x.c} 14%, transparent)`, borderRadius: 999, padding: "2px 8px" }}>
                    {x.h}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{x.d}</p>
              </div>
            ))}
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--ink-2)" }}>
            <b>{eur(datos.servicio.precioDia)} por día y servicio</b>, con un máximo de {eur(datos.servicio.topeSemana)} por
            semana y servicio: a partir de cinco días, la semana entera sale al mismo precio.
          </p>
        </div>
      )}
    </>
  );
}

function fmtShort(iso) {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate()} ${CAMP_MONTH_ABBR[d.getMonth()]}`;
}

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
        <span style={{ position: "absolute", top: 16, right: 16, background: "var(--ink)", color: "white", padding: "4px 12px", borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>
          Más elegido
        </span>
      )}
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: featured ? "rgba(255,255,255,.85)" : "var(--ink-3)" }}>{tag}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 800, letterSpacing: "-.025em", lineHeight: 1 }}>{price}</span>
        {discount && <span style={{ fontSize: 13, fontWeight: 600, color: featured ? "rgba(255,255,255,.7)" : "var(--ink-3)", textDecoration: "line-through" }}>{discount}</span>}
      </div>
      <p style={{ margin: 0, fontSize: 14, color: featured ? "rgba(255,255,255,.85)" : "var(--ink-2)", lineHeight: 1.5 }}>{desc}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 8 }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}>
            <span style={{ width: 18, height: 18, borderRadius: "50%", background: featured ? "rgba(255,255,255,.22)" : "color-mix(in oklab, var(--teal) 14%, var(--bg-2))", color: featured ? "white" : "var(--teal)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
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
  const { go, user } = useRouter();
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [apiWeeks, setApiWeeks] = useState([]);

  useEffect(() => {
    fetch('/api/camp/weeks')
      .then(r => r.ok ? r.json() : [])
      .then(d => setApiWeeks(Array.isArray(d) ? d : []))
      .catch(() => { });
  }, []);

  // Reservar: usuarios con sesión van directos a su panel de campamento.
  const reserve = () => go(user ? "/dashboard/campamento" : "/auth?mode=register");
  // Las plazas que caben cada día: es lo que hay que anunciar, no la suma de la
  // semana. Si las semanas tienen aforos distintos se enseña el más habitual.
  const plazasPorDia = (() => {
    const caps = apiWeeks.map(w => w.capacity).filter(c => c != null);
    if (!caps.length) return null;
    const veces = {};
    caps.forEach(c => { veces[c] = (veces[c] || 0) + 1; });
    return Number(Object.entries(veces).sort((a, b) => b[1] - a[1])[0][0]);
  })();

  // Las semanas tal y como están publicadas, con las plazas que quedan de
  // verdad. Fuera se enseña la media por día, no la suma de los cinco: decir
  // "150 plazas" cuando caben 30 por día induce a error.
  const WEEKS = apiWeeks.map((w, i) => {
    const dias = (w.days || []).map(d => ({
      ...d,
      libres: w.capacity == null ? null : Math.max(w.capacity - d.count, 0),
    }));
    const abiertos = dias.filter(d => !d.holiday);
    const libresTotal = abiertos.reduce((t, d) => t + (d.libres ?? 0), 0);
    return {
      id: w.id,
      num: String(i + 1).padStart(2, "0"),
      range: `${fmtShort(w.startDate)} – ${fmtShort(w.endDate)}`,
      theme: w.label,
      capacity: w.capacity,
      dias,
      // Media de huecos por día, sin decimales: es lo que de verdad significa
      // "queda sitio esta semana".
      mediaLibres: abiertos.length ? Math.floor(libresTotal / abiertos.length) : 0,
      // Se considera completa cuando no queda un solo hueco en toda la semana.
      completa: abiertos.length > 0 && libresTotal === 0,
      ocupados: abiertos.reduce((t, d) => t + d.count, 0),
      aforo: (w.capacity || 0) * abiertos.length,
    };
  });

  // El campamento va de 9:00 a 14:00. Matinal y custodia son los dos servicios
  // que alargan ese horario por los extremos, y se cobran aparte.
  const DAY_PLAN = [
    { time: "08:00", title: "Matinal", desc: "Servicio opcional: entrada a las 8:00 en vez de a las 9:00.", color: "var(--orange-soft)", extra: true },
    { time: "09:00", title: "Acogida", desc: "Llegada escalonada y arranque del día.", color: "var(--orange-soft)" },
    { time: "09:30", title: "Bloque activo", desc: "Taekwondo · funcional · gimnasia rítmica.", color: "var(--teal)" },
    { time: "10:30", title: "Desayuno", desc: "Cada niño trae el suyo de casa. Después, rato de juego libre en el patio.", color: "var(--yellow)" },
    { time: "11:00", title: "Bloque creativo", desc: "Pintura · robótica · baile.", color: "var(--purple)" },
    { time: "12:30", title: "Bloque inglés", desc: "Inmersión lúdica con monitores nativos.", color: "var(--blue)" },
    { time: "13:30", title: "Cierre + recogida", desc: "Recogida hasta las 14:00.", color: "var(--pink)" },
    { time: "15:00", title: "Custodia", desc: "Servicio opcional: salida a las 15:00 en vez de a las 14:00.", color: "var(--purple)", extra: true },
  ];

  return (
    <>
      <AimHeader route="camp" />
      <main style={{ paddingTop: 0 }}>

        {/* Hero */}
        <section className="camp-hero">
          <div className="container">
            <div className="camp-hero-grid" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 48, alignItems: "center" }}>
              <div className="fade-up">
                <span className="pill-day">🌞 Verano 2026 · Algeciras</span>
                <h1>Campamento<br />de verano Aim.</h1>
                <p>
                  {WEEKS.length || 'Varias'} semanas de aventura, aprendizaje y diversión, cada una con su tema.
                  Deporte por la mañana, inglés y talleres creativos por la tarde.
                  Para niños y niñas de <b>4 a 14 años</b>.
                </p>
                <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
                  <button className="btn btn-lg" style={{ background: "var(--ink)", color: "white" }} onClick={reserve}>
                    Reservar plaza <I.Arrow />
                  </button>
                  <button className="btn btn-lg" style={{ background: "rgba(255,255,255,.22)", color: "white", border: "1px solid rgba(255,255,255,.4)" }}
                    onClick={() => document.getElementById('camp-precios')?.scrollIntoView({ behavior: 'smooth' })}>
                    Ver precios
                  </button>
                </div>

                <div style={{ display: "flex", gap: 32, marginTop: 38, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 36, letterSpacing: "-.02em", lineHeight: 1 }}>{WEEKS.length || '—'}</div>
                    <div style={{ fontSize: 12, opacity: .9, marginTop: 4, fontWeight: 600 }}>semanas temáticas</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 36, letterSpacing: "-.02em", lineHeight: 1 }}>{plazasPorDia || '—'}</div>
                    <div style={{ fontSize: 12, opacity: .9, marginTop: 4, fontWeight: 600 }}>plazas por día</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 36, letterSpacing: "-.02em", lineHeight: 1 }}>4-14</div>
                    <div style={{ fontSize: 12, opacity: .9, marginTop: 4, fontWeight: 600 }}>años de edad</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 36, letterSpacing: "-.02em", lineHeight: 1 }}>9–14h</div>
                    <div style={{ fontSize: 12, opacity: .9, marginTop: 4, fontWeight: 600 }}>de lunes a viernes</div>
                  </div>
                </div>
              </div>

              <div className="fade-up d2 camp-hero-img">
                <div style={{
                  aspectRatio: "4/5",
                  position: "relative",
                }}>
                  {/* El recorte va en un hueco propio: si se pusiera en el de
                      fuera, se llevaría por delante las etiquetas que asoman. */}
                  <div style={{
                    position: "absolute", inset: 0,
                    borderRadius: 24,
                    border: "2px solid rgba(255,255,255,.3)",
                    boxShadow: "0 30px 80px -20px rgba(0,0,0,.4)",
                    overflow: "hidden",
                  }}>
                    {/* La imagen es vertical (868x1300) y el hueco es 4/5, así
                        que 'cover' recorta un poco por arriba y por abajo. */}
                    <img
                      src="/src/submarcas/AIM VERANO--65.jpg"
                      alt="Campamento de verano de AIM Education"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </div>
                  <span style={{ position: "absolute", top: 24, right: -16, background: "white", color: "var(--ink)", padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, boxShadow: "var(--shadow)" }}>🥋 Taekwondo</span>
                  <span style={{ position: "absolute", bottom: 60, left: -22, background: "white", color: "var(--ink)", padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, boxShadow: "var(--shadow)" }}>🤖 Robótica</span>
                  <span style={{ position: "absolute", top: "50%", right: -28, background: "white", color: "var(--ink)", padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, boxShadow: "var(--shadow)" }}>🌍 Inglés</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Weeks selector */}
        <section className="block tight">
          <div className="container">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
              <div>
                <span className="eyebrow orange">Elige tus días</span>
                <h2 className="section-title">Cada semana, <MagicText>un tema distinto.</MagicText></h2>
              </div>
              <p style={{ fontSize: 14, color: "var(--ink-3)", maxWidth: 340, lineHeight: 1.6 }}>
                Ninguna semana se repite. Apúntate por días sueltos, por semanas o al campamento
                completo; si necesitáis otra combinación, os preparamos un presupuesto a medida.
              </p>
            </div>

            <div className="weeks-grid">
              {WEEKS.map((w, i) => (
                <div key={w.id}
                  className={`week-card ${selectedWeek === i ? "is-selected" : ""} ${w.completa ? "full" : ""}`}
                  onClick={() => setSelectedWeek(selectedWeek === i ? null : i)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div className="num">SEM {w.num}</div>
                    {w.completa ? (
                      <span style={{ background: "var(--orange)", color: "white", fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999, letterSpacing: ".05em" }}>COMPLETA</span>
                    ) : (
                      <span style={{ background: "color-mix(in oklab, var(--teal) 16%, var(--bg-2))", color: "var(--teal)", fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999, letterSpacing: ".05em" }}>
                        {w.mediaLibres} {w.mediaLibres === 1 ? "plaza" : "plazas"} al día
                      </span>
                    )}
                  </div>
                  <div className="range">{w.range}</div>
                  <div className="theme">{w.theme}</div>
                  <div style={{ marginTop: 14 }}>
                    <div style={{ height: 6, background: "var(--bg-3)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--line-2)" }}>
                      <div style={{
                        height: "100%",
                        width: `${w.aforo ? Math.min(100, (w.ocupados / w.aforo) * 100) : 0}%`,
                        background: w.completa ? "var(--orange)" : "var(--orange-soft)",
                      }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--ink-3)", fontWeight: 600 }}>
                      <span>{w.completa ? "Sin huecos" : "Quedan huecos"}</span>
                      <span style={{ color: "var(--purple)", fontWeight: 800 }}>
                        {selectedWeek === i ? "Ocultar días" : "Ver los días"}
                      </span>
                    </div>
                  </div>

                  {/* Al abrir la semana se ve hueco por hueco, día a día. */}
                  {selectedWeek === i && (
                    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 16, borderTop: "1px dashed var(--line)", paddingTop: 14 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {w.dias.map(d => {
                          const p = campDayParts(d.day);
                          const lleno = !d.holiday && d.libres === 0;
                          return (
                            <div key={d.day} title={d.holiday ? "Festivo" : `${d.libres} libres de ${w.capacity}`}
                              style={{
                                minWidth: 62, padding: "8px 10px", borderRadius: 12, textAlign: "center",
                                border: `1.5px ${d.holiday ? "dashed" : "solid"} ${d.holiday ? "color-mix(in oklab, var(--orange) 45%, var(--line))" : lleno ? "var(--line)" : "color-mix(in oklab, var(--teal) 45%, var(--line))"}`,
                                background: d.holiday ? "color-mix(in oklab, var(--orange) 7%, var(--bg-2))" : lleno ? "var(--bg-3)" : "color-mix(in oklab, var(--teal) 8%, var(--bg-2))",
                                opacity: d.holiday || lleno ? .7 : 1,
                              }}>
                              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", color: "var(--ink-3)" }}>{p.dow}</div>
                              <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 800, lineHeight: 1.1, textDecoration: d.holiday ? "line-through" : "none" }}>{p.num}</div>
                              <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, color: d.holiday ? "var(--orange)" : lleno ? "var(--ink-3)" : "var(--teal)" }}>
                                {d.holiday ? "Fiesta" : lleno ? "Completo" : `${d.libres} libres`}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                        <button className="btn btn-sm btn-primary" onClick={reserve}>Reservar días sueltos</button>
                        <button className="btn btn-sm btn-outline" onClick={reserve} disabled={w.completa}>Reservar la semana</button>
                        <button className="btn btn-sm btn-outline" onClick={reserve}>Un mes entero</button>
                        <button className="btn btn-sm btn-outline" onClick={reserve}>Verano completo</button>
                      </div>
                      <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
                        ¿Otra combinación? Escríbenos y os preparamos un presupuesto a medida.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!WEEKS.length && (
              <p style={{ fontSize: 14, color: "var(--ink-3)" }}>
                Las semanas de este verano se publicarán en breve.
              </p>
            )}
          </div>
        </section>

        {/* Day schedule */}
        <section className="block tight" style={{ background: "var(--bg-3)" }}>
          <div className="container">
            <span className="eyebrow orange">Un día en el campamento</span>
            <h2 className="section-title">Equilibrio entre <MagicText>deporte</MagicText>, <MagicText>creatividad</MagicText> e <MagicText>inglés</MagicText>.</h2>

            <div style={{ marginTop: 32, display: "grid", gap: 12 }}>
              {DAY_PLAN.map((d, i) => (
                <div key={i} className="camp-day-grid" style={{
                  display: "grid",
                  gridTemplateColumns: "100px 12px 1fr",
                  gap: 18,
                  alignItems: "center",
                  background: d.extra ? "var(--bg-3)" : "var(--bg-2)",
                  border: `1px ${d.extra ? "dashed" : "solid"} var(--line)`,
                  borderRadius: 14,
                  padding: "16px 22px",
                  transition: "transform var(--tx-fast) ease",
                  cursor: "default",
                }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = "translateX(6px)"}
                  onMouseLeave={(e) => e.currentTarget.style.transform = "translateX(0)"}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: "-.015em" }}>{d.time}</div>
                  <div style={{ width: 4, height: "60%", background: d.color, borderRadius: 99, justifySelf: "center" }} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{d.title}</div>
                    <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>{d.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="block tight" id="camp-precios">
          <div className="container">
            <span className="eyebrow orange">Precios y descuentos</span>
            <h2 className="section-title">Una tarifa <MagicText>clara</MagicText>, sin sorpresas.</h2>

            <TarifasCampamento />

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
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", margin: 0 }}>
                  ¿Listo para reservar?
                </h3>
                <p style={{ margin: "6px 0 0", color: "var(--ink-3)", fontSize: 14 }}>
                  Paga el 20% ahora para fijar tu plaza. El resto el primer día del campamento.
                </p>
              </div>
              <button className="btn btn-gradient btn-lg" onClick={reserve}>
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
