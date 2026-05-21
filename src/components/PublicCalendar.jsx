import React, { useState } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, ACT_BY_ID } from './Shared.jsx';

export default function PublicCalendar() {
  const [month, setMonth] = useState(5); // June (0-indexed)
  const [filter, setFilter] = useState("all");

  const EVENTS = [
    { date: "2026-04-24", end: "2026-04-26", title: "Seminario Taekwondo Avanzado", act: "taekwondo", time: "Todo el día", venue: "Tatami principal", desc: "Tres días intensivos con maestros invitados ITF." },
    { date: "2026-04-30", title: "Gala de Primavera", act: "ballet", time: "19:00", venue: "Teatro Municipal", desc: "Presentación de los grupos de Ballet y Baile Moderno." },
    { date: "2026-05-10", title: "Examen Cambridge B2 First", act: "ingles", time: "10:00 – 14:00", venue: "Aula 1", desc: "Examen oficial — solo alumnos inscritos." },
    { date: "2026-05-17", title: "Open Day Robótica", act: "robotica", time: "11:00 – 13:00", venue: "Lab Camaleón", desc: "Jornada de puertas abiertas para nuevos alumnos." },
    { date: "2026-05-22", title: "Torneo de Promoción Fuengirola", act: "taekwondo", time: "09:00", venue: "Polideportivo Fuengirola", desc: "Competición autonómica — inscripciones abiertas." },
    { date: "2026-06-05", title: "Exposición Taller de Pintura", act: "pintura", time: "18:00", venue: "Sala Municipal", desc: "Más de 60 obras de nuestros alumnos." },
    { date: "2026-06-14", title: "Festival Anual de Ballet Clásico y Baile Moderno", act: "ballet", time: "19:30", venue: "Teatro Florida", desc: "Cierre de curso — entradas a la venta a partir del 1 de junio." },
    { date: "2026-06-21", title: "Demostración Aim — Plaza Alta", act: "taekwondo", time: "12:00", venue: "Plaza Alta · Algeciras", desc: "Exhibición pública con todos los grupos de Taekwondo y Baile." },
    { date: "2026-06-28", title: "Examen de cinturones", act: "taekwondo", time: "10:00", venue: "Tatami principal", desc: "Cambio de cinturón para grupos de iniciación e intermedio." },
    { date: "2026-06-30", title: "Última clase del curso", act: "ingles", time: "Varios", venue: "Todo el centro", desc: "Cierre del curso 2025-2026. Reuniones con tutores." },
    { date: "2026-07-01", title: "Apertura Campamento de Verano", act: "campamento", time: "09:00 – 14:00", venue: "Aim Education", desc: "Primera semana del campamento — actividades, talleres y excursiones." },
  ];

  const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

  const visibleEvents = EVENTS.filter(e => {
    const d = new Date(e.date);
    if (d.getMonth() !== month && (!e.end || new Date(e.end).getMonth() !== month)) return false;
    if (filter !== "all" && e.act !== filter) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const year = 2026;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const totalDays = lastDay.getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let i = 1; i <= totalDays; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  const filters = ["all", "taekwondo", "ballet", "ingles", "robotica", "pintura", "campamento"];

  return (
    <>
      <AimHeader route="calendar" />
      <main style={{paddingTop: 0}}>
        <section className="block tight">
          <div className="container">
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap", marginBottom: 32}}>
              <div>
                <span className="eyebrow purple">Calendario público</span>
                <h1 className="title-display">Todo lo que pasa en <span className="grad">Aim.</span></h1>
                <p className="section-lede" style={{marginTop: 14}}>
                  Eventos, exámenes, torneos, festivales y exhibiciones. Consulta y suscríbete a tu Google Calendar.
                </p>
              </div>
              <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                <button className="btn btn-icon" onClick={() => setMonth(Math.max(0, month - 1))} aria-label="Mes anterior">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <div style={{fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, letterSpacing: "-.02em", minWidth: 180, textAlign: "center"}}>
                  {MONTHS[month]} {year}
                </div>
                <button className="btn btn-icon" onClick={() => setMonth(Math.min(11, month + 1))} aria-label="Mes siguiente">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                </button>
              </div>
            </div>

            <div style={{display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap"}}>
              {filters.map(f => (
                <button key={f}
                  className={`filter-pill ${filter === f ? "is-active" : ""}`}
                  onClick={() => setFilter(f)}>
                  {f === "all" ? "Todos los eventos" : ACT_BY_ID[f]?.name || f}
                </button>
              ))}
            </div>

            <div style={{display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24}}>
              {/* Calendar grid */}
              <div style={{background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 18, padding: 22}}>
                <div style={{display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 12}}>
                  {DAY_LABELS.map(d => (
                    <div key={d} style={{textAlign: "center", fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "var(--ink-3)", textTransform: "uppercase"}}>{d}</div>
                  ))}
                </div>
                <div style={{display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6}}>
                  {cells.map((day, i) => {
                    const dayEvents = day ? EVENTS.filter(e => {
                      const d = new Date(e.date);
                      return d.getMonth() === month && d.getDate() === day && (filter === "all" || e.act === filter);
                    }) : [];
                    const isToday = day === 22 && month === 5;
                    return (
                      <div key={i} style={{
                        aspectRatio: "1/1",
                        background: day ? (isToday ? "var(--bg-3)" : "transparent") : "transparent",
                        border: day ? `1px solid ${isToday ? "var(--ink)" : "var(--line-2)"}` : "none",
                        borderRadius: 10,
                        padding: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        cursor: day && dayEvents.length ? "pointer" : "default",
                        transition: "border-color var(--tx-fast) ease, background var(--tx-fast) ease",
                      }}>
                        {day && (
                          <>
                            <div style={{fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: isToday ? "var(--ink)" : "var(--ink-2)"}}>{day}</div>
                            <div style={{display: "flex", gap: 3, flexWrap: "wrap"}}>
                              {dayEvents.slice(0, 4).map((e, idx) => (
                                <div key={idx} style={{width: 6, height: 6, borderRadius: "50%", background: ACT_BY_ID[e.act]?.color || "var(--ink)"}} />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{marginTop: 22, display: "flex", gap: 6, alignItems: "center", padding: "12px 14px", background: "var(--bg-3)", border: "1px dashed var(--line)", borderRadius: 12, fontSize: 13, color: "var(--ink-2)"}}>
                  <I.Calendar width={16} height={16} />
                  <span>Suscríbete:</span>
                  <code style={{fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--purple)", fontWeight: 600}}>aimeducation.es/feed.ics</code>
                  <button className="btn btn-sm" style={{marginLeft: "auto", background: "var(--purple)", color: "white"}}>Copiar</button>
                </div>
              </div>

              {/* Event list */}
              <div>
                <h3 style={{fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", margin: "0 0 14px"}}>
                  Eventos de {MONTHS[month]}
                </h3>
                <div style={{display: "grid", gap: 12}}>
                  {visibleEvents.length === 0 && (
                    <div style={{padding: 24, textAlign: "center", background: "var(--bg-2)", border: "1px dashed var(--line)", borderRadius: 14, color: "var(--ink-3)"}}>
                      Sin eventos este mes con este filtro.
                    </div>
                  )}
                  {visibleEvents.map((e, i) => {
                    const a = ACT_BY_ID[e.act];
                    const date = new Date(e.date);
                    return (
                      <div key={i} className={a?.className || ""} style={{
                        background: "var(--bg-2)",
                        border: "1px solid var(--line)",
                        borderRadius: 14,
                        padding: 16,
                        display: "flex",
                        gap: 14,
                        cursor: "pointer",
                        transition: "transform var(--tx-fast) ease, box-shadow var(--tx-fast) ease",
                      }}
                      onMouseEnter={(ev) => { ev.currentTarget.style.transform = "translateY(-2px)"; ev.currentTarget.style.boxShadow = "var(--shadow)"; }}
                      onMouseLeave={(ev) => { ev.currentTarget.style.transform = "translateY(0)"; ev.currentTarget.style.boxShadow = "none"; }}>
                        <div style={{
                          width: 60,
                          textAlign: "center",
                          background: a?.color || "var(--ink)",
                          color: "white",
                          borderRadius: 10,
                          padding: "10px 6px",
                          flexShrink: 0,
                          height: "fit-content",
                        }}>
                          <div style={{fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, lineHeight: 1}}>{date.getDate()}</div>
                          <div style={{fontSize: 9, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", marginTop: 4, opacity: .9}}>{MONTHS[date.getMonth()].slice(0,3)}</div>
                        </div>
                        <div style={{flex: 1}}>
                          <div style={{fontSize: 10, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: a?.color}}>{a?.tag || "Evento"}</div>
                          <h4 style={{margin: "4px 0 6px", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, letterSpacing: "-.015em", color: "var(--ink)"}}>{e.title}</h4>
                          <div style={{display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--ink-3)"}}>
                            <span style={{display: "inline-flex", gap: 4, alignItems: "center"}}><I.Clock width={12} height={12} /> {e.time}</span>
                            <span style={{display: "inline-flex", gap: 4, alignItems: "center"}}><I.MapPin width={12} height={12} /> {e.venue}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <AimFooter />
      </main>
    </>
  );
}
