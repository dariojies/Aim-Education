import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, ACT_BY_ID } from './Shared.jsx';

export default function PublicCalendar() {
  const today = new Date();
  const [viewType, setViewType] = useState("events"); // "events" or "schedule"
  const [month, setMonth] = useState(today.getMonth());
  const [filter, setFilter] = useState("all");
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState("Todas");
  const [eventsRaw, setEventsRaw] = useState([]);

  useEffect(() => {
    fetch('/api/events?all=1')
      .then(r => r.ok ? r.json() : [])
      .then(d => setEventsRaw(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (viewType === "schedule") {
      setLoadingSlots(true);
      fetch('/api/classes')
        .then(r => r.ok ? r.json() : [])
        .then(data => {
          setSlots(data);
          setLoadingSlots(false);
        })
        .catch(() => setLoadingSlots(false));
    }
  }, [viewType]);

  // Eventos reales del club (tabla aim_eventos, gestionados desde el panel admin).
  const EVENTS = eventsRaw.map(e => ({
    date: String(e.date).slice(0, 10),
    end: e.endDate ? String(e.endDate).slice(0, 10) : undefined,
    title: e.title,
    act: e.activity,
    time: e.time || "Todo el día",
    venue: e.venue || "",
    desc: e.description || "",
    posterUrl: e.posterUrl || null,
  }));

  const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
  const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const HOURS = Array.from({length: 14}, (_, i) => 9 + i);

  const visibleEvents = EVENTS.filter(e => {
    const d = new Date(e.date);
    if (d.getMonth() !== month && (!e.end || new Date(e.end).getMonth() !== month)) return false;
    if (filter !== "all" && e.act !== filter) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const year = today.getFullYear();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const totalDays = lastDay.getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let i = 1; i <= totalDays; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  const filters = ["all", ...Array.from(new Set(EVENTS.map(e => e.act)))];

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
                  Eventos, exámenes, torneos, festivales y exhibiciones. Consulta los horarios de las clases regulares.
                </p>
              </div>
              
              {viewType === "events" && (
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
              )}
            </div>

            {/* Vista Toggle */}
            <div style={{display: "flex", gap: 12, marginBottom: 26, borderBottom: "1px solid var(--line-2)", paddingBottom: 16}}>
              <button className={`filter-pill ${viewType === "events" ? "is-active" : ""}`} onClick={() => setViewType("events")} style={{borderRadius: 8, padding: "8px 16px"}}>
                Eventos del mes
              </button>
              <button className={`filter-pill ${viewType === "schedule" ? "is-active" : ""}`} onClick={() => setViewType("schedule")} style={{borderRadius: 8, padding: "8px 16px"}}>
                Horario semanal de clases
              </button>
            </div>

            {/* Classroom filter tabs for schedule view */}
            {viewType === "schedule" && !loadingSlots && (
              <div style={{
                display: "flex", 
                gap: 8, 
                marginTop: -10, 
                marginBottom: 20, 
                flexWrap: "wrap", 
                alignItems: "center",
                padding: "8px 12px",
                background: "var(--bg-3)",
                borderRadius: 12,
                border: "1px solid var(--line)"
              }}>
                <span style={{fontSize: 12, fontWeight: 700, color: "var(--ink-3)", marginRight: 8}}>Aulas / Salas:</span>
                {["Todas", "Sala 1", "Sala 2", "Sala 3", "Sala 4", "Sala 5", "Sala 6"].map(room => (
                  <button key={room}
                    className={`filter-pill ${selectedRoom === room ? "is-active" : ""}`}
                    onClick={() => setSelectedRoom(room)}
                    style={{padding: "5px 12px", borderRadius: 8, fontSize: 12}}>
                    {room}
                  </button>
                ))}
              </div>
            )}

            {viewType === "events" ? (
              <>
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
                        const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
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
                                {e.venue && <span style={{display: "inline-flex", gap: 4, alignItems: "center"}}><I.MapPin width={12} height={12} /> {e.venue}</span>}
                              </div>
                            </div>
                            {e.posterUrl && (
                              <img src={e.posterUrl} alt="" style={{width: 56, height: 56, objectFit: "cover", borderRadius: 10, flexShrink: 0, alignSelf: "flex-start"}} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{marginTop: 16}}>
                {loadingSlots ? (
                  <div style={{padding: 40, textAlign: "center", color: "var(--ink-3)", fontSize: 16}}>
                    Cargando horario de clases...
                  </div>
                ) : (
                  <>
                    <p className="section-lede" style={{marginBottom: 20, fontSize: 15}}>
                      Visualiza todos los grupos y horarios de las diferentes disciplinas operativas en Aim Education.
                    </p>
                    <div className="week-grid" style={{gridTemplateColumns: "80px repeat(6, 1fr)"}}>
                      <div className="hdr"></div>
                      {DAYS.map(d => <div key={d} className="hdr">{d}</div>)}
                      {HOURS.map(h => (
                        <React.Fragment key={h}>
                          <div className="time">{h}:00</div>
                          {DAYS.map((_, dIdx) => {
                            const slotsInCell = slots.filter(s => s.d === dIdx && s.s === h);
                            return (
                              <div key={dIdx} style={{
                                minHeight: 56,
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                                padding: 6,
                                position: "relative"
                              }}>
                                {/* Full box classes for the selected room (or all if "Todas" is selected) */}
                                {slotsInCell
                                  .filter(slot => selectedRoom === "Todas" || slot.room === selectedRoom)
                                  .map((slot, sIdx) => (
                                    <div key={sIdx} className={`slot ${ACT_BY_ID[slot.act]?.className || ""}`}
                                      style={{
                                        position: "relative",
                                        inset: "auto",
                                        height: "auto",
                                        background: ACT_BY_ID[slot.act]?.color || "var(--ink)",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 2,
                                        width: "100%",
                                        boxSizing: "border-box",
                                        borderRadius: 8,
                                        padding: "8px 10px",
                                        color: "white"
                                      }}>
                                      <span className="t" style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{slot.title}</span>
                                      <span className="meta" style={{ fontSize: 10, opacity: 0.95, fontWeight: 600 }}>{slot.time || `${h}:00`} · {slot.room}</span>
                                      <span className="meta" style={{ fontSize: 9, opacity: 0.85, marginTop: 2 }}>{slot.monitor}</span>
                                    </div>
                                  ))}

                                {/* Little dots for classes NOT in the selected room */}
                                {selectedRoom !== "Todas" && slotsInCell.some(slot => slot.room !== selectedRoom) && (
                                  <div style={{
                                    display: "flex",
                                    gap: 6,
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                    marginTop: "auto",
                                    padding: "4px 4px 2px",
                                    borderTop: slotsInCell.some(slot => slot.room === selectedRoom) ? "1px dashed var(--line-2)" : "none"
                                  }}>
                                    {slotsInCell
                                      .filter(slot => slot.room !== selectedRoom)
                                      .map((slot, sIdx) => (
                                        <div 
                                          key={sIdx}
                                          style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: "50%",
                                            background: ACT_BY_ID[slot.act]?.color || "var(--ink)",
                                            transition: "transform 0.15s ease",
                                            boxShadow: "0 1px 3px rgba(0,0,0,0.15)"
                                          }}
                                          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.3)"}
                                          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                                          title={`${slot.title} (${slot.room}) · ${slot.monitor || ''}`}
                                        />
                                      ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        <AimFooter />
      </main>
    </>
  );
}
