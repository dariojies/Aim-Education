import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, ACT_BY_ID } from './Shared.jsx';

export default function PublicCalendar() {
  const today = new Date();
  const [viewType, setViewType] = useState("events"); // "events" or "schedule"
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [filter, setFilter] = useState("all");
  const [shareToast, setShareToast] = useState(false);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState("Todas");
  const [eventsRaw, setEventsRaw] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);

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
    endTime: e.endTime || null,
    venue: e.venue || "",
    price: e.price || null,
    desc: e.description || "",
    posterUrl: e.posterUrl || null,
  }));

  const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
  const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const HOURS = Array.from({length: 14}, (_, i) => 9 + i);

  const visibleEvents = EVENTS.filter(e => {
    const d = new Date(e.date);
    const dEnd = e.end ? new Date(e.end) : null;
    const inMonth = (d.getFullYear() === year && d.getMonth() === month)
      || (dEnd && dEnd.getFullYear() === year && dEnd.getMonth() === month);
    if (!inMonth) return false;
    if (filter !== "all" && e.act !== filter) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

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
                  <button className="btn btn-icon" onClick={() => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else { setMonth(m => m - 1); } }} aria-label="Mes anterior">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  </button>
                  <div style={{fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", minWidth: 200, textAlign: "center"}}>
                    {MONTHS[month]} {year}
                  </div>
                  <button className="btn btn-icon" onClick={() => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else { setMonth(m => m + 1); } }} aria-label="Mes siguiente">
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
                          return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day && (filter === "all" || e.act === filter);
                        }) : [];
                        const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                        return (
                          <div key={i}
                            onClick={() => dayEvents.length && setSelectedEvent(dayEvents[0])}
                            style={{
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
                          <div key={i} className={a?.className || ""}
                          onClick={() => setSelectedEvent(e)}
                          style={{
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

        {selectedEvent && (() => {
          const a = ACT_BY_ID[selectedEvent.act];
          const color = a?.color || "var(--ink)";
          const start = new Date(selectedEvent.date);
          const end = selectedEvent.end ? new Date(selectedEvent.end) : null;
          const fmt = (dt) => dt.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
          const dateText = end && end.getTime() !== start.getTime()
            ? `${fmt(start)} — ${fmt(end)}`
            : fmt(start);
          return (
            <div
              onClick={(ev) => { if (ev.target === ev.currentTarget) setSelectedEvent(null); }}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
              <div style={{ background: "var(--bg-2)", borderRadius: 20, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", position: "relative" }}>
                <button onClick={() => setSelectedEvent(null)} aria-label="Cerrar"
                  style={{ position: "absolute", top: 14, right: 14, zIndex: 2, background: "rgba(0,0,0,.45)", color: "white", border: 0, borderRadius: 10, width: 34, height: 34, cursor: "pointer", display: "grid", placeItems: "center" }}>
                  <I.X />
                </button>

                {selectedEvent.posterUrl ? (
                  <img src={selectedEvent.posterUrl} alt={selectedEvent.title}
                    style={{ width: "100%", maxHeight: 420, objectFit: "contain", background: "var(--ink)", borderRadius: "20px 20px 0 0", display: "block" }} />
                ) : (
                  <div style={{ height: 140, borderRadius: "20px 20px 0 0", background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 55%, #000))` }} />
                )}

                <div style={{ padding: 24 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".12em", color }}>{a?.name || selectedEvent.act}</span>
                  <h2 style={{ margin: "6px 0 16px", fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", color: "var(--ink)" }}>{selectedEvent.title}</h2>

                  <div style={{ display: "grid", gap: 10, marginBottom: selectedEvent.desc ? 20 : 0 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: "var(--ink-2)" }}>
                      <I.Calendar width={16} height={16} style={{ color, flexShrink: 0 }} />
                      <span style={{ textTransform: "capitalize" }}>{dateText}</span>
                    </div>
                    {(selectedEvent.time || selectedEvent.endTime) && (
                      <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: "var(--ink-2)" }}>
                        <I.Clock width={16} height={16} style={{ color, flexShrink: 0 }} />
                        <span>{selectedEvent.time}{selectedEvent.endTime ? ` – ${selectedEvent.endTime}` : ''}</span>
                      </div>
                    )}
                    {selectedEvent.venue && (
                      <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: "var(--ink-2)" }}>
                        <I.MapPin width={16} height={16} style={{ color, flexShrink: 0 }} />
                        <span>{selectedEvent.venue}</span>
                      </div>
                    )}
                    {selectedEvent.price && (
                      <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: "var(--ink-2)" }}>
                        <I.CreditCard width={16} height={16} style={{ color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 700 }}>{selectedEvent.price}</span>
                      </div>
                    )}
                  </div>

                  {selectedEvent.desc && (
                    <p style={{ margin: "0 0 20px", fontSize: 15, lineHeight: 1.6, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{selectedEvent.desc}</p>
                  )}

                  <button
                    onClick={() => {
                      const url = window.location.origin + '/calendario';
                      const shareData = { title: selectedEvent.title, text: `${selectedEvent.title} — AIM Education`, url };
                      if (navigator.share) {
                        navigator.share(shareData).catch(() => {});
                      } else {
                        navigator.clipboard.writeText(url).then(() => {
                          setShareToast(true);
                          setTimeout(() => setShareToast(false), 2200);
                        });
                      }
                    }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-3)", color: "var(--ink-2)", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background var(--tx-fast)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--line)"}
                    onMouseLeave={e => e.currentTarget.style.background = "var(--bg-3)"}
                  >
                    <I.Share />
                    {shareToast ? "¡Enlace copiado!" : "Compartir"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        <AimFooter />
      </main>
    </>
  );
}
