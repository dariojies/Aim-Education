import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimLogo, ACTIVITIES, ACT_BY_ID, CampDayPicker, campFmtLong, campDayParts } from './Shared.jsx';
import { useRouter } from '../App.jsx';
import { AdminSupport } from './AdminSupport.jsx';

function sectionLabel(id) {
  return ({
    overview: "Resumen",
    students: "Gestión de alumnos",
    classes: "Clases y horarios",
    payments: "Pagos y facturación",
    news: "Noticias y foro",
    events: "Eventos y talleres",
    camp: "Campamento de verano",
    billing: "Facturación",
    groups: "Grupos",
    instructors: "Instructores",
    settings: "Ajustes del club",
    support: "Panel de soporte",
  })[id] || "Panel";
}

function KPI({ label, value, trend, act, icon }) {
  const a = ACT_BY_ID[act];
  return (
    <div className={`stat-card ${a?.className || ""}`}>
      <div className="corner" style={{ color: a?.color }}>{icon}</div>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      <div className="trend" style={{ background: `color-mix(in oklab, ${a?.color || "var(--ink)"} 14%, var(--bg-2))`, color: a?.color || "var(--ink)" }}>{trend}</div>
    </div>
  );
}

function QuickCard({ title, desc, act, icon, onClick }) {
  const a = ACT_BY_ID[act];
  return (
    <button onClick={onClick} className={a?.className || ""} style={{
      background: "var(--bg-2)",
      border: "1px solid var(--line)",
      borderRadius: 18,
      padding: 20,
      cursor: "pointer",
      textAlign: "left",
      fontFamily: "inherit",
      display: "flex",
      gap: 14,
      alignItems: "flex-start",
      transition: "transform var(--tx-base) ease, box-shadow var(--tx-base) ease, border-color var(--tx-base) ease",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "var(--shadow)"; e.currentTarget.style.borderColor = "transparent"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "var(--line)"; }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `color-mix(in oklab, ${a?.color || "var(--ink)"} 16%, var(--bg-2))`,
        color: a?.color || "var(--ink)",
        display: "grid", placeItems: "center", flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 15, color: "var(--ink)" }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.45 }}>{desc}</div>
      </div>
      <I.Arrow style={{ marginLeft: "auto", color: "var(--ink-3)", flexShrink: 0, marginTop: 4 }} />
    </button>
  );
}

function AdminOverview({ setView, refreshTrigger, showToast }) {
  const [stats, setStats] = useState(null);
  const [userCount, setUserCount] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    fetch('/api/admin/posts/stats', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(setStats)
      .catch(() => { });
    fetch('/api/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(u => setUserCount(u.length))
      .catch(() => { });
    fetch('/api/receipts', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setReceipts(Array.isArray(data) ? data : []))
      .catch(() => { });
    fetch('/api/classes', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setClasses(Array.isArray(data) ? data : []))
      .catch(() => { });
  }, [refreshTrigger]);

  const receiptsTotal = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);

  const classCounts = {};
  classes.forEach(c => { classCounts[c.act] = (classCounts[c.act] || 0) + 1; });
  const actBars = Object.entries(classCounts)
    .map(([act, count]) => ({ count, name: ACT_BY_ID[act]?.name || act, color: ACT_BY_ID[act]?.color || "var(--ink)" }))
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...actBars.map(b => b.count));

  return (
    <>
      <div className="kpis">
        <KPI label="Alumnos registrados" value={userCount != null ? String(userCount) : "…"} trend="en la plataforma" act="taekwondo" icon={<I.Users />} />
        <KPI label="Ingresos registrados" value={receiptsTotal > 0 ? `${receiptsTotal.toLocaleString("es-ES")}€` : "0€"} trend={`${receipts.length} recibo${receipts.length !== 1 ? "s" : ""}`} act="funcional" icon={<I.Wallet />} />
        <KPI label="Posts publicados" value={stats ? String(stats.publishedPosts) : "…"} trend={stats ? `${stats.totalViews.toLocaleString("es-ES")} visitas` : "cargando..."} act="pintura" icon={<I.Newspaper />} />
        <KPI label="Borradores" value={stats ? String(stats.draftPosts) : "…"} trend="sin publicar" act="ballet" icon={<I.Edit />} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18 }}>
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 18, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, letterSpacing: "-.015em", margin: 0 }}>
              Últimos recibos
            </h2>
            <button className="btn btn-sm btn-outline" onClick={() => setView("payments")}>Ver todos</button>
          </div>
          {receipts.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>No hay recibos registrados todavía.</div>
          ) : receipts.slice(0, 5).map((r, i) => (
            <div key={r.id || i} className="payment-row">
              <div>
                <div className="name">{r.company || "Recibo"}</div>
                <div className="date">{r.paymentMethod || "—"}</div>
              </div>
              <span className="date">{r.date ? new Date(r.date).toLocaleDateString("es-ES") : "—"}</span>
              <span className="amount">{r.amount != null ? `${parseFloat(r.amount).toLocaleString("es-ES", { minimumFractionDigits: 2 })}€` : "—"}</span>
            </div>
          ))}
        </div>

        <div style={{ background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 18, padding: 24 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, letterSpacing: "-.015em", margin: 0, marginBottom: 4 }}>
            Clases por actividad
          </h2>
          <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 18px" }}>Según el horario semanal</p>
          {actBars.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>No hay clases en el horario.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {actBars.map((a, i) => (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                    <span>{a.name}</span>
                    <span style={{ color: "var(--ink-3)" }}>{a.count} clase{a.count !== 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ height: 8, background: "var(--bg-3)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(a.count / maxCount) * 100}%`, background: a.color, transition: "width var(--tx-slow) ease" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
        <QuickCard
          title="Pasar lista de hoy"
          desc={`${classes.length} clase${classes.length !== 1 ? "s" : ""} en el horario.`}
          act="taekwondo"
          icon={<I.Check />}
          onClick={() => setView("classes")}
        />
        <QuickCard
          title="Publicar noticia"
          desc="Llega a todas las familias."
          act="pintura"
          icon={<I.Newspaper />}
          onClick={() => setView("news")}
        />
        <QuickCard
          title="Recordatorios de pago"
          desc="Enviar avisos de cobros."
          act="funcional"
          icon={<I.Wallet />}
          onClick={() => setView("payments")}
        />
      </div>
    </>
  );
}

function AdminStudents({ refreshTrigger, onEditUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch('/api/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(u => { setUsers(u); setLoading(false); })
      .catch(() => setLoading(false));
  }, [refreshTrigger]);

  const visible = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q);
  });

  const handleExportCSV = () => {
    const headers = ['ID', 'Nombre', 'Apellidos', 'Email', 'Cinturon', 'Rol'];
    const rows = users.map(u => [u.id, u.firstName, u.lastName, u.email, u.belt || '', u.isSuperAdmin ? 'Admin' : 'Alumno']);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `alumnos_aim_education_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="toolbar">
        <div className="search-input">
          <I.Search />
          <input placeholder="Buscar por nombre o email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-outline btn-sm" onClick={handleExportCSV}>Exportar CSV</button>
      </div>

      <div className="data-table">
        <div className="data-table-head" style={{ gridTemplateColumns: "32px 2.4fr 2fr 1fr 1fr 100px" }}>
          <span></span>
          <span>Nombre</span>
          <span>Email</span>
          <span>Cinturón</span>
          <span>Rol</span>
          <span></span>
        </div>
        {loading && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>Cargando...</div>
        )}
        {!loading && visible.map(u => (
          <div key={u.id} className="data-table-row" style={{ gridTemplateColumns: "32px 2.4fr 2fr 1fr 1fr 100px" }}>
            <input type="checkbox" style={{ accentColor: "var(--purple)" }} />
            <div className="cell-user">
              <div className="avatar" style={{ background: "var(--grad-aim)" }}>
                {(u.firstName?.[0] || u.email?.[0] || "?").toUpperCase()}
              </div>
              <div>
                <div className="pri">{u.firstName || ""} {u.lastName || ""}</div>
                {u.isSuperAdmin && <div className="sec">Superadmin</div>}
              </div>
            </div>
            <div className="sec">{u.email}</div>
            <div>{u.belt || <span style={{ color: "var(--ink-3)" }}>—</span>}</div>
            <div>
              <span className={`status-pill ${u.isSuperAdmin ? "ok" : "upcoming"}`}>
                {u.isSuperAdmin ? "Admin" : "Alumno"}
              </span>
            </div>
            <div className="row-actions">
              <button className="icon-btn" aria-label="Ver" onClick={() => onEditUser(u)}><I.Eye /></button>
              <button className="icon-btn" aria-label="Editar" onClick={() => onEditUser(u)}><I.Edit /></button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, fontSize: 13, color: "var(--ink-3)" }}>
        {visible.length} de {users.length} usuario{users.length !== 1 ? "s" : ""}
      </div>
    </>
  );
}

function AdminClasses({ classSlots, setClassSlots, activities = [], classrooms = [], actById = {}, showToast, onAddClassClick, onAddActivityOrAulaClick }) {
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const HOURS = Array.from({ length: 14 }, (_, i) => 9 + i);

  const [search, setSearch] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState("Todas");

  const roomsList = ["Todas", ...classrooms.map(r => r.name)];

  const filteredSlots = classSlots.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${s.title} ${s.room} ${s.monitor || ''} ${s.act}`.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="toolbar">
        <div style={{ display: "flex", gap: 6 }}>
          <button className="filter-pill is-active">Semana</button>
          <button className="filter-pill" onClick={() => alert("Vista mensual disponible en el siguiente pase.")}>Mes</button>
        </div>
        <div className="search-input" style={{ maxWidth: 280 }}>
          <I.Search />
          <input placeholder="Filtrar por sala, monitor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-outline btn-sm" onClick={() => alert("Listado exportado correctamente en formato PDF.")}>Exportar PDF</button>
        <button className="btn btn-primary btn-sm" onClick={onAddClassClick}><I.Plus /> Nueva clase</button>
      </div>

      {/* Classroom filter tabs */}
      <div style={{
        display: "flex",
        gap: 8,
        marginTop: 10,
        marginBottom: 16,
        flexWrap: "wrap",
        alignItems: "center",
        padding: "8px 12px",
        background: "var(--bg-3)",
        borderRadius: 12,
        border: "1px solid var(--line)"
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", marginRight: 8 }}>Aulas / Salas:</span>
        {roomsList.map(room => (
          <button key={room}
            className={`filter-pill ${selectedRoom === room ? "is-active" : ""}`}
            onClick={() => setSelectedRoom(room)}
            style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12 }}>
            {room}
          </button>
        ))}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "64px repeat(6, 1fr)",
        gap: 0,
        background: "var(--bg-2)",
        border: "1px solid var(--line)",
        borderRadius: 18,
        overflow: "hidden",
      }}>
        <div className="hdr" style={{ background: "var(--bg-3)", padding: "12px 8px" }} />
        {days.map(d => (
          <div key={d} style={{ background: "var(--bg-3)", padding: "12px 8px", borderLeft: "1px solid var(--line-2)", textAlign: "center", fontSize: 12, fontWeight: 800, color: "var(--ink)", letterSpacing: ".08em", textTransform: "uppercase" }}>
            {d}
          </div>
        ))}
        {HOURS.map(h => (
          <React.Fragment key={h}>
            <div style={{ background: "var(--bg-3)", padding: "8px 12px 8px 8px", borderTop: "1px solid var(--line-2)", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>
              {h}:00
            </div>
            {days.map((_, dIdx) => {
              const slotsInCell = filteredSlots.filter(s => s.d === dIdx && Math.floor(s.s) === h);
              return (
                <div key={dIdx} style={{
                  borderTop: "1px solid var(--line-2)",
                  borderLeft: "1px solid var(--line-2)",
                  minHeight: 52,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: 4,
                  position: "relative"
                }}>
                  {/* Full box classes for the selected room (or all if "Todas" is selected) */}
                  {slotsInCell
                    .filter(slot => selectedRoom === "Todas" || slot.room === selectedRoom)
                    .map((slot, sIdx) => {
                      const color = slot.actColor || actById[slot.act]?.color || "var(--ink)";
                      const startMinutes = (slot.s % 1) * 60;
                      const timeLabel = `${Math.floor(slot.s)}:${String(startMinutes).padStart(2, '0')}`;
                      return (
                        <button
                          key={sIdx}
                          className={`slot ${slot.actClassName || actById[slot.act]?.className || ""}`}
                          onClick={() => setSelectedSlot(slot)}
                          style={{
                            position: "relative",
                            inset: "auto",
                            height: "auto",
                            background: color,
                            zIndex: 1,
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                            width: "100%",
                            boxSizing: "border-box"
                          }}
                        >
                          <span className="t" style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{slot.title}</span>
                          <span className="meta" style={{ fontSize: 10, opacity: 0.9 }}>{slot.room} · {timeLabel}</span>
                        </button>
                      );
                    })}

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
                        .map((slot, sIdx) => {
                          const color = slot.actColor || actById[slot.act]?.color || "var(--ink)";
                          return (
                            <div
                              key={sIdx}
                              onClick={() => setSelectedSlot(slot)}
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: color,
                                cursor: "pointer",
                                transition: "transform 0.15s ease",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.15)"
                              }}
                              onMouseEnter={e => e.currentTarget.style.transform = "scale(1.3)"}
                              onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                              title={`${slot.title} (${slot.room}) · ${slot.monitor || ''}`}
                            />
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Legend list of activities by color with '+' button */}
      <div style={{ marginTop: 22, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {activities.map(a => (
          <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", background: `color-mix(in oklab, ${a.color} 14%, var(--bg-2))`, color: a.color, border: `1px solid color-mix(in oklab, ${a.color} 30%, transparent)`, borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.color }} /> {a.name}
          </span>
        ))}
        <button
          onClick={onAddActivityOrAulaClick}
          title="Añadir aula o categoría"
          style={{
            display: "inline-flex", alignItems: "center", justifyCenter: "center",
            width: 28, height: 28, borderRadius: "50%", background: "var(--bg-3)",
            border: "1px solid var(--line)", cursor: "pointer", color: "var(--ink)",
            fontSize: 16, fontWeight: "bold", transition: "all 0.2s",
            padding: 0, justifyContent: "center", width: 28, height: 28
          }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--line)"}
          onMouseLeave={e => e.currentTarget.style.background = "var(--bg-3)"}
        >
          +
        </button>
      </div>

      {/* Modal Detalles de Clase */}
      {selectedSlot && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(6px)',
          display: 'grid', placeItems: 'center', zIndex: 1050
        }}>
          <div style={{
            background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 20,
            padding: 24, width: '100%', maxWidth: 400, position: 'relative'
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{selectedSlot.title}</h3>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ink-2)' }}><strong>Actividad:</strong> {slotName(selectedSlot)}</p>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ink-2)' }}><strong>Horario:</strong> {selectedSlot.time || formatTime(selectedSlot.s, selectedSlot.h)}</p>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ink-2)' }}><strong>Sala:</strong> {selectedSlot.room}</p>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ink-2)' }}><strong>Profesor/a:</strong> {selectedSlot.monitor || '—'}</p>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--ink-2)' }}><strong>Alumnos:</strong> {selectedSlot.students}</p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setSelectedSlot(null)}>Cerrar</button>
              <button className="btn btn-sm" style={{ background: 'var(--orange)', color: 'white' }} onClick={async () => {
                if (selectedSlot.id) {
                  try {
                    const res = await fetch(`/api/classes/${selectedSlot.id}`, { method: 'DELETE', credentials: 'include' });
                    if (res.ok) {
                      setClassSlots(prev => prev.filter(s => s.id !== selectedSlot.id));
                      showToast("Clase eliminada correctamente.");
                    } else {
                      alert("Error al eliminar la clase de la base de datos.");
                    }
                  } catch (e) {
                    console.error(e);
                  }
                } else {
                  setClassSlots(prev => prev.filter(s => !(s.d === selectedSlot.d && s.s === selectedSlot.s && s.act === selectedSlot.act)));
                }
                setSelectedSlot(null);
              }}>Eliminar clase</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  function slotName(slot) {
    return slot.actName || actById[slot.act]?.name || slot.act;
  }

  function formatTime(s, h) {
    const startHour = Math.floor(s);
    const startMin = (s % 1) * 60;
    const end = s + h;
    const endHour = Math.floor(end);
    const endMin = (end % 1) * 60;
    return `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')} – ${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
  }
}

function AdminPayments({ refreshTrigger }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/receipts', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setReceipts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [refreshTrigger]);

  const totalAmount = receipts.reduce((s, r) => s + (r.amount || 0), 0);

  async function deleteReceipt(id) {
    if (!window.confirm("¿Eliminar este recibo?")) return;
    try {
      const res = await fetch(`/api/receipts/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setReceipts(prev => prev.filter(r => r.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <>
      <div className="kpis">
        <KPI label="Total en recibos" value={`${totalAmount.toLocaleString("es-ES", { minimumFractionDigits: 0 })}€`} trend={`${receipts.length} registros`} act="taekwondo" icon={<I.Wallet />} />
        <KPI label="Recibos con factura" value={String(receipts.filter(r => r.invoiceLink).length)} trend="con PDF adjunto" act="funcional" icon={<I.CreditCard />} />
        <KPI label="Sin factura" value={String(receipts.filter(r => !r.invoiceLink).length)} trend="pendiente de adjuntar" act="ballet" icon={<I.Clock />} />
        <KPI label="Empresas" value={String(new Set(receipts.map(r => r.company).filter(Boolean)).size)} trend="proveedores distintos" act="pintura" icon={<I.Trophy />} />
      </div>

      <div className="data-table">
        <div className="data-table-head" style={{ gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 120px" }}>
          <span>Empresa / Concepto</span><span>Método</span><span>Fecha</span><span>Importe</span><span>Factura</span><span></span>
        </div>
        {loading && <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>Cargando...</div>}
        {!loading && receipts.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>No hay recibos.</div>}
        {receipts.map((r, i) => {
          const d = r.date ? new Date(r.date).toLocaleDateString("es-ES") : "—";
          const amount = r.amount != null ? `${parseFloat(r.amount).toLocaleString("es-ES", { minimumFractionDigits: 2 })}€` : "—";
          return (
            <div key={r.id || i} className="data-table-row" style={{ gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 120px" }}>
              <div className="cell-user">
                <div className="avatar" style={{ background: "var(--grad-aim)" }}>{(r.company?.[0] || "R").toUpperCase()}</div>
                <div className="pri">{r.company || "Sin empresa"}</div>
              </div>
              <div className="sec">{r.paymentMethod || "—"}</div>
              <div>{d}</div>
              <div className="pri" style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>{amount}</div>
              <div>
                <span className={`status-pill ${r.invoiceLink ? "ok" : "pending"}`}>
                  {r.invoiceLink ? "Con PDF" : "Sin PDF"}
                </span>
              </div>
              <div className="row-actions" style={{ display: 'flex', gap: 8 }}>
                {r.invoiceLink
                  ? <a href={r.invoiceLink} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">PDF</a>
                  : <button className="icon-btn" disabled><I.Eye /></button>}
                <button className="icon-btn danger" onClick={() => deleteReceipt(r.id)}><I.Trash /></button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function AdminNews({ refreshTrigger, onEditPost }) {
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/posts', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/admin/posts/stats', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    ]).then(([p, s]) => { setPosts(p); setStats(s); setLoading(false); }).catch(() => setLoading(false));
  }, [refreshTrigger]);

  async function deletePost(id) {
    if (!window.confirm("¿Eliminar esta entrada?")) return;
    await fetch(`/api/admin/posts/${id}`, { method: 'DELETE', credentials: 'include' });
    setPosts(prev => prev.filter(p => p.id !== id));
  }

  const visible = posts.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const published = posts.filter(p => p.status === "published").length;
  const drafts = posts.filter(p => p.status === "draft").length;

  return (
    <>
      <div className="kpis">
        <KPI label="Posts publicados" value={String(published)} trend={`de ${posts.length} totales`} act="pintura" icon={<I.Newspaper />} />
        <KPI label="Visitas totales" value={stats ? stats.totalViews.toLocaleString("es-ES") : "…"} trend="acumuladas" act="ingles" icon={<I.Eye />} />
        <KPI label="Clicks" value={stats ? String(stats.totalClicks) : "…"} trend="en artículos" act="taekwondo" icon={<I.Arrow />} />
        <KPI label="Borradores" value={String(drafts)} trend="sin publicar" act="ballet" icon={<I.Edit />} />
      </div>

      <div className="toolbar">
        <div className="search-input" style={{ maxWidth: 320 }}>
          <I.Search />
          <input placeholder="Buscar título..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className={`filter-pill ${statusFilter === "all" ? "is-active" : ""}`} onClick={() => setStatusFilter("all")}>Todos · {posts.length}</button>
        <button className={`filter-pill ${statusFilter === "published" ? "is-active" : ""}`} onClick={() => setStatusFilter("published")}>Publicados · {published}</button>
        <button className={`filter-pill ${statusFilter === "draft" ? "is-active" : ""}`} onClick={() => setStatusFilter("draft")}>Borradores · {drafts}</button>
        <div style={{ flex: 1 }} />
      </div>

      <div className="data-table">
        <div className="data-table-head" style={{ gridTemplateColumns: "2.4fr 1fr 0.9fr 0.7fr 0.7fr 130px" }}>
          <span>Título</span><span>Categoría</span><span>Estado</span><span>Visitas</span><span>Clicks</span><span></span>
        </div>
        {loading && <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>Cargando...</div>}
        {!loading && visible.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>No hay entradas.</div>}
        {visible.map((p) => {
          const a = ACT_BY_ID[p.category];
          const statusLabel = p.status === "published" ? "Publicado" : p.status === "draft" ? "Borrador" : p.status;
          const statusClass = p.status === "published" ? "ok" : p.status === "draft" ? "pending" : "upcoming";
          const dateStr = p.published_at ? new Date(p.published_at).toLocaleDateString("es-ES") : (p.created_at ? new Date(p.created_at).toLocaleDateString("es-ES") : "—");
          return (
            <div key={p.id} className={`data-table-row ${a?.className || ""}`} style={{ gridTemplateColumns: "2.4fr 1fr 0.9fr 0.7fr 0.7fr 130px" }}>
              <div>
                <div className="pri">{p.title}</div>
                <div className="sec">{dateStr} · {p.author_name || "Admin"}</div>
              </div>
              <div>
                <span className="activity-pill">{a?.name || p.category || "General"}</span>
              </div>
              <div>
                <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
              </div>
              <div className="pri">{p.view_count || "—"}</div>
              <div className="pri" style={{ color: p.click_count ? "var(--teal)" : "var(--ink-3)" }}>{p.click_count || "—"}</div>
              <div className="row-actions">
                <button className="icon-btn" title="Ver en web pública" onClick={() => window.open(`/noticias/${p.slug}`, '_blank')}><I.Eye /></button>
                <button className="icon-btn" title="Editar entrada" onClick={() => onEditPost(p)}><I.Edit /></button>
                <button className="icon-btn danger" title="Eliminar entrada" onClick={() => deletePost(p.id)}><I.Trash /></button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function AdminGroups({ refreshTrigger }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch('/api/admin/groups', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(g => { setGroups(Array.isArray(g) ? g : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [refreshTrigger]);

  // Actividades reales presentes en los grupos (para el filtro), con su color.
  // Se agrupan por la actividad real (activityId), no por el id de color, para que
  // "Taekwon-Do ITF" y "Defensa Personal" sean filtros distintos aunque compartan color.
  const activities = [];
  const seen = new Set();
  for (const g of groups) {
    if (!seen.has(g.activityId)) {
      seen.add(g.activityId);
      activities.push({ id: g.activityId, name: g.activityName, color: ACT_BY_ID[g.activity]?.color || 'var(--ink)' });
    }
  }
  activities.sort((a, b) => a.name.localeCompare(b.name));

  const visible = filter === "all" ? groups : groups.filter(g => g.activityId === filter);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button className={`filter-pill ${filter === "all" ? "is-active" : ""}`} onClick={() => setFilter("all")}>
          Todas · {groups.length}
        </button>
        {activities.map(a => {
          const count = groups.filter(g => g.activityId === a.id).length;
          const active = filter === a.id;
          return (
            <button key={a.id} className={`filter-pill ${active ? "is-active" : ""}`} onClick={() => setFilter(a.id)}
              style={active ? { background: a.color, borderColor: a.color, color: '#fff' } : {}}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: active ? '#fff' : a.color, marginRight: 6, verticalAlign: 'middle' }} />
              {a.name} · {count}
            </button>
          );
        })}
      </div>

      {loading && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando grupos...</p>}
      {!loading && visible.length === 0 && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>No hay grupos.</p>}

      <div className="groups-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
        {!loading && visible.map(g => {
          const color = ACT_BY_ID[g.activity]?.color || 'var(--ink)';
          const ageLabel = (g.minAge || g.maxAge)
            ? `${g.minAge || ''}${g.maxAge ? `–${g.maxAge}` : '+'} años`
            : null;
          return (
            <div key={g.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderLeft: `5px solid ${color}`, borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{g.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', background: `color-mix(in oklab, ${color} 16%, var(--bg-2))`, color, padding: '3px 10px', borderRadius: 99 }}>{g.activityName}</span>
                  {ageLabel && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{ageLabel}</span>}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                {g.schedule.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Sin horario asignado</span>}
                {g.schedule.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-2)', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: 'var(--ink)', minWidth: 32 }}>{s.day}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><I.Clock width={13} height={13} /> {s.time}</span>
                    {s.room && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><I.MapPin width={13} height={13} /> {s.room}</span>}
                    {s.instructor && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><I.User width={13} height={13} /> {s.instructor}</span>}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 'auto', borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 8 }}>Alumnos ({g.studentCount})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {g.students.map(s => (
                    <span key={s.id} style={{ fontSize: 11, background: 'var(--bg-3)', border: '1px solid var(--line)', padding: '2px 8px', borderRadius: 6, color: 'var(--ink-2)' }}>
                      {s.name}
                    </span>
                  ))}
                  {g.studentCount === 0 && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Sin alumnos</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function AdminSettings() {
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('aim_education_club_settings');
    return saved ? JSON.parse(saved) : {
      clubName: "AIM Education Algeciras",
      address: "Urb. Terrazas de Doña Lola, Local 1, Algeciras",
      phone: "+34 956 742 216",
      email: "info@aimeducation.es",
    };
  });

  const [saved, setSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    localStorage.setItem('aim_education_club_settings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <form onSubmit={handleSave} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 18, padding: 32, maxWidth: 600, display: 'grid', gap: 18 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, margin: 0, color: 'var(--ink)' }}>Ajustes del club</h2>

      <div style={{ display: 'grid', gap: 16 }}>
        <div className="field">
          <label>Nombre de la academia</label>
          <input value={settings.clubName} onChange={e => setSettings({ ...settings, clubName: e.target.value })} required />
        </div>
        <div className="field">
          <label>Dirección</label>
          <input value={settings.address} onChange={e => setSettings({ ...settings, address: e.target.value })} required />
        </div>
        <div className="field">
          <label>Teléfono de contacto</label>
          <input value={settings.phone} onChange={e => setSettings({ ...settings, phone: e.target.value })} required />
        </div>
        <div className="field">
          <label>Email oficial</label>
          <input type="email" value={settings.email} onChange={e => setSettings({ ...settings, email: e.target.value })} required />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
        <button className="btn btn-primary" type="submit">Guardar cambios</button>
        {saved && (
          <span style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 700 }}>
            ✓ Ajustes guardados correctamente
          </span>
        )}
      </div>
    </form>
  );
}

function AdminInstructores({ refreshTrigger, showToast }) {
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeInstModal, setActiveInstModal] = useState(null); // 'new' | 'edit'
  const [editingInst, setEditingInst] = useState(null);

  const fetchInstructors = () => {
    fetch('/api/instructores')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setInstructors(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchInstructors();
  }, [refreshTrigger]);

  const handleSub = async (e) => {
    e.preventDefault();
    const isEdit = activeInstModal === 'edit';
    const url = isEdit ? `/api/admin/instructores/${editingInst.id}` : '/api/admin/instructores';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingInst),
        credentials: 'include'
      });
      if (res.ok) {
        showToast(isEdit ? "Instructor modificado con éxito." : "Instructor registrado con éxito.");
        fetchInstructors();
        setActiveInstModal(null);
      } else {
        const err = await res.json();
        alert(err.error || "Ocurrió un error.");
      }
    } catch (err) {
      alert("Error al guardar instructor.");
    }
  };

  const handleDel = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este instructor?")) return;
    try {
      const res = await fetch(`/api/admin/instructores/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        showToast("Instructor eliminado.");
        fetchInstructors();
      } else {
        alert("Error al eliminar instructor.");
      }
    } catch (err) {
      alert("Error al eliminar instructor.");
    }
  };

  const visible = instructors.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${i.name} ${i.email || ''} ${i.specialty || ''}`.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="toolbar">
        <div className="search-input">
          <I.Search />
          <input placeholder="Buscar por nombre o especialidad..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={() => { setEditingInst({ name: '', email: '', phone: '', specialty: '' }); setActiveInstModal('new'); }}><I.Plus /> Nuevo Instructor</button>
      </div>

      <div className="data-table">
        <div className="data-table-head" style={{ gridTemplateColumns: "2.4fr 2fr 1.5fr 1.5fr 100px" }}>
          <span>Nombre</span>
          <span>Email</span>
          <span>Teléfono</span>
          <span>Especialidad</span>
          <span></span>
        </div>
        {loading && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>Cargando...</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>No hay instructores.</div>
        )}
        {!loading && visible.map(inst => (
          <div key={inst.id} className="data-table-row" style={{ gridTemplateColumns: "2.4fr 2fr 1.5fr 1.5fr 100px" }}>
            <div className="cell-user">
              <div className="avatar" style={{ background: "var(--grad-aim)" }}>
                {(inst.name?.[0] || "?").toUpperCase()}
              </div>
              <div className="pri">{inst.name}</div>
            </div>
            <div className="sec">{inst.email || <span style={{ color: "var(--ink-3)" }}>—</span>}</div>
            <div>{inst.phone || <span style={{ color: "var(--ink-3)" }}>—</span>}</div>
            <div>
              <span className="activity-pill">{inst.specialty || <span style={{ color: "var(--ink-3)" }}>—</span>}</span>
            </div>
            <div className="row-actions">
              <button className="icon-btn" aria-label="Editar" onClick={() => { setEditingInst(inst); setActiveInstModal('edit'); }}><I.Edit /></button>
              <button className="icon-btn danger" aria-label="Eliminar" onClick={() => handleDel(inst.id)}><I.Trash /></button>
            </div>
          </div>
        ))}
      </div>

      {activeInstModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
          display: 'grid', placeItems: 'center', zIndex: 1100, padding: 20
        }}>
          <form onSubmit={handleSub} style={{
            backgroundColor: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 24,
            width: '100%', maxWidth: 450, padding: 32, display: 'grid', gap: 16
          }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>
              {activeInstModal === 'edit' ? 'Editar Instructor' : 'Registrar Nuevo Instructor'}
            </h3>

            <div className="field">
              <label>Nombre Completo</label>
              <input value={editingInst.name || ''} onChange={e => setEditingInst({ ...editingInst, name: e.target.value })} required placeholder="Ej. Carlos Ruiz" />
            </div>

            <div className="field">
              <label>Correo Electrónico</label>
              <input type="email" value={editingInst.email || ''} onChange={e => setEditingInst({ ...editingInst, email: e.target.value })} placeholder="Ej. carlos@aimeducation.es" />
            </div>

            <div className="field">
              <label>Teléfono</label>
              <input value={editingInst.phone || ''} onChange={e => setEditingInst({ ...editingInst, phone: e.target.value })} placeholder="Ej. +34 600 000 000" />
            </div>

            <div className="field">
              <label>Especialidad / Rol</label>
              <input value={editingInst.specialty || ''} onChange={e => setEditingInst({ ...editingInst, specialty: e.target.value })} placeholder="Ej. Taekwondo, Pilates, Inglés" />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveInstModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary btn-sm">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function AdminEvents({ showToast }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  // ── Gestionar Evento (inscripciones) ──
  const [managingEvent, setManagingEvent] = useState(null);
  const [regList, setRegList] = useState([]);
  const [regLoading, setRegLoading] = useState(false);
  const [regNameFilter, setRegNameFilter] = useState('');
  const [regAgeFilter, setRegAgeFilter] = useState('');
  const [regPagadoFilter, setRegPagadoFilter] = useState('all');
  const [addingReg, setAddingReg] = useState(false);
  const [newReg, setNewReg] = useState({ nombre: '', apellidos: '', edad: '', datos: '', fotosRrss: false, pagado: false });
  const [addingRegSaving, setAddingRegSaving] = useState(false);

  async function submitNewReg(e) {
    e.preventDefault();
    setAddingRegSaving(true);
    try {
      const r = await fetch(`/api/events/${managingEvent.id}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...newReg, fotosRrss: newReg.fotosRrss }),
      });
      if (r.ok) {
        const created = await r.json();
        if (newReg.pagado) {
          await fetch(`/api/admin/events/${managingEvent.id}/registrations/${created.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ pagado: true }),
          });
        }
        await loadRegs(managingEvent.id);
        setAddingReg(false);
        setNewReg({ nombre: '', apellidos: '', edad: '', datos: '', fotosRrss: false, pagado: false });
        showToast?.('Inscripción añadida manualmente.');
      } else {
        const d = await r.json(); alert(d.error || 'Error al añadir inscripción.');
      }
    } catch { alert('Error de conexión.'); }
    finally { setAddingRegSaving(false); }
  }

  async function loadRegs(eventId) {
    setRegLoading(true);
    try {
      const r = await fetch(`/api/admin/events/${eventId}/registrations`, { credentials: 'include' });
      setRegList(r.ok ? await r.json() : []);
    } catch { setRegList([]); }
    setRegLoading(false);
  }

  async function patchReg(regId, patch) {
    const r = await fetch(`/api/admin/events/${managingEvent.id}/registrations/${regId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(patch),
    });
    if (r.ok) setRegList(prev => prev.map(x => x.id === regId ? { ...x, ...patch } : x));
  }

  async function deleteReg(regId) {
    if (!window.confirm('¿Eliminar esta inscripción?')) return;
    const r = await fetch(`/api/admin/events/${managingEvent.id}/registrations/${regId}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) { setRegList(prev => prev.filter(x => x.id !== regId)); showToast?.('Inscripción eliminada.'); }
  }

  function printRegs() {
    const ev = managingEvent;
    const rows = regList.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${r.nombre}</strong></td>
        <td>${r.apellidos}</td>
        <td>${r.edad || '—'}</td>
        <td>${r.datos || '—'}</td>
        <td style="text-align:center">${r.fotos_rrss ? '✓' : '—'}</td>
        <td style="text-align:center">${r.pagado ? '✓' : '☐'}</td>
        <td style="text-align:center">☐</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>Inscripciones — ${ev.title}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 28px 32px; }
        h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
        .meta { font-size: 11px; color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: #f0f0f0; }
        th { padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #ccc; }
        td { padding: 8px 10px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }
        tr:nth-child(even) td { background: #fafafa; }
        .footer { margin-top: 24px; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; display: flex; justify-content: space-between; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>${ev.title}</h1>
      <div class="meta">${ev.date ? new Date(ev.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}${ev.time ? ' · ' + ev.time : ''}${ev.venue ? ' · ' + ev.venue : ''} — ${regList.length} inscritos</div>
      <table>
        <thead><tr><th>#</th><th>Nombre</th><th>Apellidos</th><th>Edad</th><th>Datos / Obs.</th><th>Fotos</th><th>Pagado</th><th>Asistió</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer"><span>AIM Education · Panel de gestión</span><span>Impreso el ${new Date().toLocaleDateString('es-ES')}</span></div>
      <script>window.onload = () => { window.print(); }<\/script>
    </body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
  }

  function load() {
    setLoading(true);
    fetch('/api/admin/events', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setEvents(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const blank = { title: '', description: '', date: '', endDate: '', time: '', endTime: '', venue: '', price: '', activity: 'general', posterUrl: '' };

  function startEdit(ev) {
    setEditing({
      id: ev.id, title: ev.title || '', description: ev.description || '',
      date: ev.date ? String(ev.date).slice(0, 10) : '',
      endDate: ev.endDate ? String(ev.endDate).slice(0, 10) : '',
      time: ev.time || '', endTime: ev.endTime || '', venue: ev.venue || '', price: ev.price || '', activity: ev.activity || 'general', posterUrl: ev.posterUrl || '',
    });
  }

  function handlePoster(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { alert('El cartel no puede superar 4 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setEditing(prev => ({ ...prev, posterUrl: reader.result }));
    reader.readAsDataURL(file);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    const isEdit = !!editing.id;
    try {
      const r = await fetch(isEdit ? `/api/admin/events/${editing.id}` : '/api/admin/events', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editing),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Error al guardar el evento.'); setSaving(false); return; }
      setEditing(null);
      load();
      showToast?.(isEdit ? 'Evento actualizado.' : 'Evento creado.');
    } catch { alert('Error de conexión.'); }
    finally { setSaving(false); }
  }

  async function del(ev) {
    if (!window.confirm(`¿Eliminar el evento "${ev.title}"?`)) return;
    await fetch(`/api/admin/events/${ev.id}`, { method: 'DELETE', credentials: 'include' });
    setEvents(prev => prev.filter(x => x.id !== ev.id));
    showToast?.('Evento eliminado.');
  }

  const fmt = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
        <button className="btn btn-primary" onClick={() => setEditing({ ...blank })}><I.Plus /> Nuevo evento</button>
      </div>

      {loading && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando eventos...</p>}
      {!loading && events.length === 0 && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>No hay eventos creados. Crea el primero con "Nuevo evento".</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
        {events.map(ev => {
          const a = ACT_BY_ID[ev.activity];
          const color = a?.color || 'var(--ink)';
          return (
            <div key={ev.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {ev.posterUrl
                ? <img src={ev.posterUrl} alt={ev.title} style={{ width: '100%', height: 'auto', display: 'block' }} />
                : <div style={{ height: 120, background: `color-mix(in oklab, ${color} 20%, var(--bg-3))`, display: 'grid', placeItems: 'center', color }}><I.Star /></div>
              }
              <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color }}>{a?.name || 'General'}</span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{ev.title}</h3>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', display: 'grid', gap: 4 }}>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><I.Calendar width={13} height={13} /> {fmt(ev.date)}{ev.endDate ? ` – ${fmt(ev.endDate)}` : ''}{ev.time ? ` · ${ev.time}${ev.endTime ? `–${ev.endTime}` : ''}` : ''}</span>
                  {ev.venue && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><I.MapPin width={13} height={13} /> {ev.venue}</span>}
                  {ev.price && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 700, color }}>{ev.price}</span>}
                </div>
                {ev.description && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.4 }}>{ev.description}</p>}
                <div style={{ marginTop: 'auto', display: 'flex', gap: 8, paddingTop: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => { setManagingEvent(ev); loadRegs(ev.id); }}>Gestionar Evento</button>
                  <button className="btn btn-sm btn-outline" onClick={() => startEdit(ev)}><I.Edit /></button>
                  <button className="icon-btn danger" onClick={() => del(ev)}><I.Trash /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Modal Gestionar Evento ── */}
      {managingEvent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={e => { if (e.target === e.currentTarget) { setManagingEvent(null); setAddingReg(false); setRegNameFilter(''); setRegAgeFilter(''); setRegPagadoFilter('all'); } }}>
          <div style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: 820, maxHeight: '90vh', overflowY: 'auto', padding: 28, display: 'grid', gap: 20 }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{managingEvent.title}</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>Gestión de inscripciones</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm btn-outline" onClick={printRegs} title="Imprimir listado">
                  <I.Print /> Imprimir
                </button>
                <button className="icon-btn" onClick={() => { setManagingEvent(null); setAddingReg(false); setRegNameFilter(''); setRegAgeFilter(''); setRegPagadoFilter('all'); }}><I.X /></button>
              </div>
            </div>

            {/* Stats bar */}
            {!regLoading && (() => {
              const total = regList.length;
              const pagados = regList.filter(r => r.pagado).length;
              const asistieron = regList.filter(r => r.asistio).length;
              const priceNum = managingEvent.price ? parseFloat(managingEvent.price.replace(/[^\d.,]/g, '').replace(',', '.')) : NaN;
              const hasPrice = !isNaN(priceNum) && priceNum > 0;
              const fmtEur = n => `${n.toLocaleString('es-ES', { minimumFractionDigits: 0 })}€`;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: hasPrice ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12 }}>

                  {/* Inscritos */}
                  <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--purple)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{total}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Inscritos</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{asistieron} han asistido</div>
                    </div>
                  </div>

                  {/* Asistencia + Pago */}
                  <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 18px', display: 'grid', gap: 10 }}>
                    {[
                      { label: 'Pagado', n: pagados, color: 'var(--teal)' },
                      { label: 'Asistencia', n: asistieron, color: 'var(--orange)' },
                    ].map(({ label, n, color }) => (
                      <div key={label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                          <span style={{ color: 'var(--ink-2)' }}>{label}</span>
                          <span style={{ color }}>{n}/{total}</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--line)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: total ? `${(n / total) * 100}%` : '0%', background: color, borderRadius: 99, transition: 'width .3s ease' }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Dinero (solo si hay precio) */}
                  {hasPrice && (
                    <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 18px', display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
                        Precio unitario · {managingEvent.price}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Recaudado</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal)', fontFamily: 'var(--font-display)' }}>{fmtEur(pagados * priceNum)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Pendiente</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: (total - pagados) > 0 ? 'var(--orange)' : 'var(--ink-3)', fontFamily: 'var(--font-display)' }}>{fmtEur((total - pagados) * priceNum)}</span>
                      </div>
                      <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Total esperado</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-3)' }}>{fmtEur(total * priceNum)}</span>
                      </div>
                    </div>
                  )}

                </div>
              );
            })()}

            {/* Add manual registration */}
            {!addingReg ? (
              <div>
                <button className="btn btn-sm btn-outline" onClick={() => setAddingReg(true)}>
                  <I.Plus /> Añadir inscrito manualmente
                </button>
              </div>
            ) : (
              <form onSubmit={submitNewReg} style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 14, padding: 18, display: 'grid', gap: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)', marginBottom: 2 }}>Nueva inscripción manual</div>
                <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="field">
                    <label>Nombre</label>
                    <input value={newReg.nombre} onChange={e => setNewReg(d => ({ ...d, nombre: e.target.value }))} required placeholder="Nombre" />
                  </div>
                  <div className="field">
                    <label>Apellidos</label>
                    <input value={newReg.apellidos} onChange={e => setNewReg(d => ({ ...d, apellidos: e.target.value }))} required placeholder="Apellidos" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10 }}>
                  <div className="field">
                    <label>Edad</label>
                    <input type="number" min="1" max="99" value={newReg.edad} onChange={e => setNewReg(d => ({ ...d, edad: e.target.value }))} placeholder="—" />
                  </div>
                  <div className="field">
                    <label>Datos a tener en cuenta</label>
                    <input value={newReg.datos} onChange={e => setNewReg(d => ({ ...d, datos: e.target.value }))} placeholder="Alergias, necesidades especiales..." />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={newReg.fotosRrss} onChange={e => setNewReg(d => ({ ...d, fotosRrss: e.target.checked }))} />
                    Autoriza fotos RRSS
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', color: 'var(--teal)', fontWeight: 700 }}>
                    <input type="checkbox" checked={newReg.pagado} onChange={e => setNewReg(d => ({ ...d, pagado: e.target.checked }))} style={{ accentColor: 'var(--teal)' }} />
                    Marcar como pagado
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setAddingReg(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-sm btn-primary" disabled={addingRegSaving}>{addingRegSaving ? 'Guardando...' : 'Añadir inscrito'}</button>
                </div>
              </form>
            )}

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="search-input" style={{ flex: '1 1 200px', maxWidth: 280 }}>
                <I.Search />
                <input placeholder="Buscar por nombre o apellidos..." value={regNameFilter} onChange={e => setRegNameFilter(e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 10, padding: '0 10px', height: 38 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>Edad</span>
                <input type="number" min="1" max="99" value={regAgeFilter} onChange={e => setRegAgeFilter(e.target.value)} placeholder="—" style={{ width: 44, border: 'none', background: 'transparent', fontSize: 14, fontWeight: 700, color: 'var(--ink)', textAlign: 'center', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['all', 'pagado', 'pendiente'].map(f => (
                  <button key={f} className={`filter-pill ${regPagadoFilter === f ? 'is-active' : ''}`} onClick={() => setRegPagadoFilter(f)}>
                    {{ all: 'Todos', pagado: 'Pagados', pendiente: 'Pendientes' }[f]}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            {regLoading && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
            {!regLoading && regList.length === 0 && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>No hay inscripciones todavía.</p>}
            {!regLoading && regList.length > 0 && (() => {
              const ageF = regAgeFilter ? Number(regAgeFilter) : null;
              const nameQ = regNameFilter.trim().toLowerCase();
              const visible = regList.filter(r => {
                if (nameQ && !`${r.nombre} ${r.apellidos}`.toLowerCase().includes(nameQ)) return false;
                if (ageF && Number(r.edad) !== ageF) return false;
                if (regPagadoFilter === 'pagado' && !r.pagado) return false;
                if (regPagadoFilter === 'pendiente' && r.pagado) return false;
                return true;
              });
              return (
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <div style={{ display: 'grid', gap: 8, minWidth: 520 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 60px 1fr auto auto auto', gap: 10, padding: '8px 12px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)', borderBottom: '1px solid var(--line)' }}>
                      <span>Nombre</span><span>Apellidos</span><span>Edad</span><span>Datos</span>
                      <span>Fotos</span><span>Pagado</span><span>Asistió</span>
                    </div>
                    {visible.map(reg => (
                      <div key={reg.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 60px 1fr auto auto auto', gap: 10, padding: '10px 12px', background: 'var(--bg-3)', borderRadius: 10, alignItems: 'center', fontSize: 13 }}>
                        <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{reg.nombre}</span>
                        <span style={{ color: 'var(--ink-2)' }}>{reg.apellidos}</span>
                        <span style={{ color: 'var(--ink-3)' }}>{reg.edad || '—'}</span>
                        <span style={{ color: 'var(--ink-3)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={reg.datos || ''}>{reg.datos || '—'}</span>
                        <span style={{ textAlign: 'center', fontSize: 14 }}>{reg.fotos_rrss ? '✓' : '—'}</span>
                        <label style={{ display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!reg.pagado} onChange={e => patchReg(reg.id, { pagado: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                        </label>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <label style={{ display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!reg.asistio} onChange={e => patchReg(reg.id, { asistio: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--orange)' }} />
                          </label>
                          <button className="icon-btn danger" style={{ width: 26, height: 26 }} onClick={() => deleteReg(reg.id)}><I.Trash /></button>
                        </div>
                      </div>
                    ))}
                    {visible.length === 0 && <p style={{ color: 'var(--ink-3)', fontSize: 13, padding: '8px 0' }}>Ninguna inscripción coincide con el filtro.</p>}
                  </div>
                </div>
              );
            })()}

          </div>
        </div>
      )}

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>{editing.id ? 'Editar evento' : 'Nuevo evento'}</h3>
            <form onSubmit={save} style={{ display: 'grid', gap: 14 }}>
              <div className="field"><label>Título</label><input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} required /></div>
              <div className="field"><label>Descripción</label><textarea rows={3} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, padding: 12, background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)', resize: 'vertical' }} /></div>
              <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field"><label>Fecha</label><input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} required /></div>
                <div className="field"><label>Fecha fin (opcional)</label><input type="date" value={editing.endDate} onChange={e => setEditing({ ...editing, endDate: e.target.value })} /></div>
              </div>
              <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="field"><label>Hora inicio</label><input value={editing.time} onChange={e => setEditing({ ...editing, time: e.target.value })} placeholder="Ej. 19:00" /></div>
                <div className="field"><label>Hora fin</label><input value={editing.endTime} onChange={e => setEditing({ ...editing, endTime: e.target.value })} placeholder="Ej. 21:00" /></div>
                <div className="field"><label>Precio</label><input value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })} placeholder="Ej. 5€ / Gratis" /></div>
              </div>
              <div className="field"><label>Lugar</label><input value={editing.venue} onChange={e => setEditing({ ...editing, venue: e.target.value })} placeholder="Ej. Teatro Municipal" /></div>
              <div className="field">
                <label>Actividad (color)</label>
                <select value={editing.activity} onChange={e => setEditing({ ...editing, activity: e.target.value })}>
                  <option value="general">General / Club</option>
                  {ACTIVITIES.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Cartel (imagen, máx. 4 MB)</label>
                <input type="file" accept="image/*" onChange={handlePoster} />
                {editing.posterUrl && <img src={editing.posterUrl} alt="cartel" style={{ marginTop: 10, maxHeight: 180, borderRadius: 10, border: '1px solid var(--line)' }} />}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : (editing.id ? 'Guardar cambios' : 'Crear evento')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// =============================================================================
// CAMPAMENTO DE VERANO
// =============================================================================

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Días laborables (L-V) entre dos fechas ISO, ambas incluidas.
function weekdaysBetween(start, end) {
  if (!start || !end || end < start) return [];
  const out = [];
  const d = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  while (d <= e) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// Fila de "pasar lista": asistencia + nota del profesor de un niño en un día.
function CampRosterRow({ row, day, onSaved }) {
  const [note, setNote] = useState(row.note || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setNote(row.note || ''); }, [row.id, day, row.note]);

  async function save(patch) {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/camp/attendance', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ childId: row.id, day, ...patch }),
      });
      if (r.ok) onSaved(row.id, patch);
      else { const d = await r.json(); alert(d.error || 'Error al guardar.'); }
    } catch { alert('Error de conexión.'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 12, padding: '12px 14px', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>
          <input type="checkbox" checked={!!row.asistio}
            onChange={e => save({ asistio: e.target.checked })}
            style={{ width: 20, height: 20, accentColor: 'var(--teal)' }} />
        </label>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: row.asistio ? 'var(--teal)' : 'var(--ink)' }}>
            {row.nombre} {row.apellidos}
            {row.edad ? <span style={{ fontWeight: 600, color: 'var(--ink-3)', marginLeft: 6, fontSize: 12 }}>{row.edad} años</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, fontSize: 11 }}>
            {row.alergias && (
              <span style={{ background: 'color-mix(in oklab, var(--orange) 14%, var(--bg-2))', color: 'var(--orange)', fontWeight: 800, padding: '2px 8px', borderRadius: 999, border: '1px solid color-mix(in oklab, var(--orange) 30%, transparent)' }}>
                ⚠ {row.alergias}
              </span>
            )}
            {row.contacto && <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>📞 {row.contacto}</span>}
            {row.recogida && <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>Recoge: {row.recogida}</span>}
            {!row.pagado && <span style={{ color: 'var(--orange)', fontWeight: 800 }}>PAGO PENDIENTE</span>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <textarea
          rows={1}
          placeholder="Nota del día para la familia (comida, ánimo, incidencias...)"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{ flex: 1, fontFamily: 'inherit', fontSize: 13, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', resize: 'vertical', minHeight: 36 }}
        />
        <button className="btn btn-sm btn-outline" disabled={saving || note === (row.note || '')} onClick={() => save({ note })}>
          {saving ? '...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

// Orden compartido: alfabético (nombre) o por edad (edad, luego nombre).
function makeSorter(sortMode) {
  return (a, b) => {
    if (sortMode === 'age') {
      const ea = a.edad == null ? 999 : Number(a.edad);
      const eb = b.edad == null ? 999 : Number(b.edad);
      if (ea !== eb) return ea - eb;
    }
    return `${a.nombre} ${a.apellidos}`.localeCompare(`${b.nombre} ${b.apellidos}`, 'es', { sensitivity: 'base' });
  };
}

// Selector de orden (A–Z / por edad) reutilizable.
function SortToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>Orden:</span>
      {[['alpha', 'A–Z'], ['age', 'Por edad']].map(([id, label]) => (
        <button key={id} className={`filter-pill ${value === id ? 'is-active' : ''}`} onClick={() => onChange(id)}>{label}</button>
      ))}
    </div>
  );
}

// =============================================================================
// FACTURACIÓN — catálogo, temporadas y fichas
// =============================================================================

// TPV / Cobro: buscar familia → cesta de cargos → cobrar → ticket.
function BillingTPV({ showToast }) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [pagador, setPagador] = useState(null);
  const [cesta, setCesta] = useState(null);            // { familia, cargos, preview }
  const [sel, setSel] = useState({});                  // cargoId -> { on, descuentoPct }
  const [extras, setExtras] = useState([]);            // { key, clienteId, nombre, concepto, descripcion, precio, ivaPct, tipo, descuentoPct }
  const [totales, setTotales] = useState(null);
  const [precios, setPrecios] = useState([]);
  const [medioPago, setMedioPago] = useState('tarjeta');
  const [entregado, setEntregado] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [addExtra, setAddExtra] = useState(null);      // { clienteId, concepto }

  useEffect(() => {
    fetch('/api/admin/billing/precios', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setPrecios).catch(() => { });
  }, []);

  // Buscar personas (a partir de 2 letras).
  useEffect(() => {
    if (q.trim().length < 2) { setResultados([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/billing/tpv/buscar?q=${encodeURIComponent(q.trim())}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : []).then(setResultados).catch(() => { });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function elegirPagador(p) {
    setPagador(p); setResultados([]); setQ(''); setExtras([]); setTicket(null); setEntregado('');
    const r = await fetch(`/api/admin/billing/tpv/cesta?pagadorId=${p.id}`, { credentials: 'include' });
    if (r.ok) {
      const c = await r.json();
      setCesta(c);
      const s = {};
      c.cargos.forEach(cg => { s[cg.id] = { on: true, descuentoPct: cg.descuentoPct }; });
      setSel(s);
    }
  }

  // Líneas activas (cargos seleccionados + extras) para calcular y cobrar.
  const lineasActivas = cesta ? cesta.cargos.filter(c => sel[c.id]?.on).map(c => ({
    ...c, descuentoPct: Number(sel[c.id].descuentoPct) || 0,
  })) : [];
  const lineasMotor = [
    ...lineasActivas.map(c => ({ concepto: c.concepto, descripcion: c.descripcion, tipo: c.tipo, mes: c.mes, precio: c.precio, ivaPct: c.ivaPct, descuentoPct: c.descuentoPct })),
    ...extras.map(e => ({ concepto: e.concepto, descripcion: e.descripcion, tipo: e.tipo, mes: new Date().toISOString().slice(0, 7) + '-01', precio: e.precio, ivaPct: e.ivaPct, descuentoPct: Number(e.descuentoPct) || 0 })),
  ];

  // Recalcular totales en el servidor cuando cambian líneas/descuentos/extras.
  useEffect(() => {
    if (!lineasMotor.length) { setTotales(null); return; }
    let cancel = false;
    fetch('/api/admin/billing/simular', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ lineas: lineasMotor }),
    }).then(r => r.ok ? r.json() : null).then(d => { if (!cancel) setTotales(d); }).catch(() => { });
    return () => { cancel = true; };
  }, [JSON.stringify(lineasMotor)]);

  const total = totales?.total || 0;

  async function cobrar() {
    if (!total) return;
    setCobrando(true);
    try {
      const r = await fetch('/api/admin/billing/tpv/cobrar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          pagadorId: pagador.id,
          lineas: lineasActivas.map(c => ({ cargoId: c.id, descuentoPct: c.descuentoPct })),
          extras: extras.map(e => ({ clienteId: e.clienteId, concepto: e.concepto, descuentoPct: Number(e.descuentoPct) || 0 })),
          medioPago,
          entregado: medioPago === 'efectivo' ? (Number(entregado) || total) : total,
        }),
      });
      if (r.ok) { const d = await r.json(); setTicket(d); showToast?.(`Recibo #${d.recibo.numero} cobrado.`); setPagador(null); setCesta(null); setExtras([]); }
      else { const d = await r.json(); alert(d.error || 'Error al cobrar.'); }
    } catch { alert('Error de conexión.'); }
    finally { setCobrando(false); }
  }

  const imprimirTicket = () => imprimirTicketRecibo(ticket);

  const family = cesta?.familia || [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Ticket recién cobrado */}
      {ticket && (
        <div style={{ background: 'color-mix(in oklab, var(--teal) 10%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--teal) 35%, transparent)', borderRadius: 14, padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--teal)' }}>Recibo #{ticket.recibo.numero} cobrado — {eur(ticket.recibo.total)}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{ticket.recibo.pagador} · {ticket.recibo.medioPago}{ticket.recibo.medioPago === 'efectivo' ? ` · cambio ${eur(ticket.recibo.cambio)}` : ''}</div>
          </div>
          <button className="btn btn-sm btn-primary" onClick={imprimirTicket}><I.Print /> Imprimir ticket</button>
          <button className="btn btn-sm btn-outline" onClick={() => setTicket(null)}>Nuevo cobro</button>
        </div>
      )}

      {!pagador && !ticket && (
        <div>
          <div className="search-input" style={{ maxWidth: 420 }}>
            <I.Search />
            <input placeholder="Buscar alumno o pagador por nombre..." value={q} onChange={e => setQ(e.target.value)} autoFocus />
          </div>
          {resultados.length > 0 && (
            <div style={{ marginTop: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', maxWidth: 520 }}>
              {resultados.map(p => (
                <button key={p.id} onClick={() => elegirPagador(p)} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'transparent', border: 0, borderBottom: '1px solid var(--line-2)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{p.nombre} {p.apellidos}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.email || 'sin email'}{p.edad != null ? ` · ${p.edad} años` : ''}{p.esMenor ? ' · menor' : ''}
                    </span>
                  </span>
                  <span style={{
                    flexShrink: 0, fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999,
                    color: p.pendientes > 0 ? 'var(--teal)' : 'var(--ink-3)',
                    background: p.pendientes > 0 ? 'color-mix(in oklab, var(--teal) 14%, var(--bg-2))' : 'var(--bg-3)',
                    border: `1px solid ${p.pendientes > 0 ? 'color-mix(in oklab, var(--teal) 30%, transparent)' : 'var(--line-2)'}`,
                  }}>
                    {p.pendientes > 0 ? `${p.pendientes} pendiente${p.pendientes !== 1 ? 's' : ''}` : 'sin pendientes'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {pagador && cesta && (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Cobro a {pagador.nombre} {pagador.apellidos}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                Familia: {family.map(f => `${f.nombre}`).join(', ')}
                {pagador.esMenor && <span style={{ color: 'var(--orange)', fontWeight: 700 }}> · ⚠ el pagador es menor</span>}
              </div>
            </div>
            <button className="btn btn-sm btn-outline" style={{ marginLeft: 'auto' }} onClick={() => { setPagador(null); setCesta(null); setExtras([]); }}>Cambiar</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(240px, 1fr)', gap: 16, alignItems: 'start' }}>
            {/* Líneas */}
            <div style={{ display: 'grid', gap: 8 }}>
              {cesta.cargos.length === 0 && extras.length === 0 && (
                <div style={{ padding: 20, background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14, display: 'grid', gap: 8 }}>
                  <div style={{ fontWeight: 700, color: 'var(--ink-2)' }}>Esta familia no tiene cargos pendientes.</div>
                  <div style={{ fontSize: 13 }}>
                    Si esperabas ver algo, comprueba: que la persona tenga <b>ficha</b> y se hayan <b>generado</b> los cargos del mes,
                    y que no exista <b>otra cuenta con el mismo nombre</b> — en el buscador se indica cuántos pendientes tiene cada una.
                  </div>
                  <div style={{ fontSize: 13 }}>También puedes añadir un concepto manual abajo.</div>
                </div>
              )}
              {cesta.cargos.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', opacity: sel[c.id]?.on ? 1 : .5 }}>
                  <input type="checkbox" checked={!!sel[c.id]?.on} onChange={e => setSel(s => ({ ...s, [c.id]: { ...s[c.id], on: e.target.checked } }))} style={{ width: 18, height: 18, accentColor: 'var(--teal)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.descripcion} <span style={{ color: 'var(--ink-3)', fontWeight: 500, fontSize: 12 }}>· {c.nombre}</span></div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{mesLargo(c.mes)}{c.tipo === 'Material' ? ` · +${c.ivaPct}% IVA` : ''}</div>
                  </div>
                  <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
                    dto
                    <input type="number" min="0" max="100" value={sel[c.id]?.descuentoPct ?? 0} onChange={e => setSel(s => ({ ...s, [c.id]: { ...s[c.id], descuentoPct: e.target.value } }))} style={{ width: 48, padding: '4px 6px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-3)', fontSize: 13, textAlign: 'center' }} />%
                  </label>
                  <div style={{ fontWeight: 800, fontFamily: 'var(--font-display)', minWidth: 66, textAlign: 'right' }}>{eur(c.precio)}</div>
                </div>
              ))}
              {extras.map(e => (
                <div key={e.key} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'color-mix(in oklab, var(--purple) 6%, var(--bg-2))', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--purple)' }}>Extra</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{e.descripcion} <span style={{ color: 'var(--ink-3)', fontWeight: 500, fontSize: 12 }}>· {e.nombre}</span></div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{e.tipo === 'Material' ? `+${e.ivaPct}% IVA` : ''}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontFamily: 'var(--font-display)', minWidth: 66, textAlign: 'right' }}>{eur(e.precio)}</div>
                  <button className="icon-btn danger" style={{ width: 26, height: 26 }} onClick={() => setExtras(x => x.filter(y => y.key !== e.key))} aria-label="Quitar"><I.X /></button>
                </div>
              ))}
              {/* Añadir concepto manual */}
              {addExtra ? (
                <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}
                  onSubmit={ev => {
                    ev.preventDefault();
                    const p = precios.find(x => x.concepto === addExtra.concepto);
                    const persona = family.find(f => f.id === addExtra.clienteId) || pagador;
                    if (!p || !persona) return;
                    setExtras(x => [...x, { key: Math.random().toString(36).slice(2), clienteId: persona.id, nombre: persona.nombre, concepto: p.concepto, descripcion: p.descripcion, precio: p.precio, ivaPct: p.ivaPct, tipo: p.tipo, descuentoPct: 0 }]);
                    setAddExtra(null);
                  }}>
                  <select value={addExtra.clienteId} onChange={e => setAddExtra(a => ({ ...a, clienteId: e.target.value }))} required style={{ fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
                    <option value="">¿Para quién?...</option>
                    {family.map(f => <option key={f.id} value={f.id}>{f.nombre} {f.apellidos}</option>)}
                  </select>
                  <select value={addExtra.concepto} onChange={e => setAddExtra(a => ({ ...a, concepto: e.target.value }))} required style={{ fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
                    <option value="">Concepto...</option>
                    {precios.map(p => <option key={p.concepto} value={p.concepto}>{p.descripcion} ({eur(p.precio)})</option>)}
                  </select>
                  <button className="btn btn-sm btn-primary" type="submit" disabled={!addExtra.concepto || !addExtra.clienteId}>Añadir</button>
                  <button className="btn btn-sm btn-outline" type="button" onClick={() => setAddExtra(null)}>Cancelar</button>
                </form>
              ) : (
                <button className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} onClick={() => setAddExtra({ clienteId: pagador.id, concepto: '' })}>
                  <I.Plus /> Añadir concepto (material, etc.)
                </button>
              )}
            </div>

            {/* Resumen + cobro */}
            <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 18, position: 'sticky', top: 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                {totales?.basesPorIva?.map(b => (
                  <div key={b.ivaPct} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-2)' }}>
                    <span>Base {b.ivaPct}% IVA{b.ivaPct > 0 ? ` (+${eur(b.iva)})` : ''}</span><span>{eur(b.base)}</span>
                  </div>
                ))}
                {totales?.ahorro > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--teal)', fontWeight: 700 }}>
                    <span>Ahorro descuentos</span><span>−{eur(totales.ahorro)}</span>
                  </div>
                )}
              </div>
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 800, fontSize: 15 }}>TOTAL</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, letterSpacing: '-.02em' }}>{eur(total)}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['tarjeta', 'bizum', 'efectivo'].map(m => (
                  <button key={m} onClick={() => setMedioPago(m)} className={`filter-pill ${medioPago === m ? 'is-active' : ''}`} style={{ flex: 1, justifyContent: 'center', textTransform: 'capitalize' }}>{m}</button>
                ))}
              </div>
              {medioPago === 'efectivo' && (
                <div>
                  <input type="number" step="0.01" min="0" placeholder={`Entregado (${eur(total)})`} value={entregado} onChange={e => setEntregado(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', fontSize: 15, fontWeight: 700 }} />
                  {Number(entregado) > 0 && Number(entregado) >= total && (
                    <div style={{ textAlign: 'right', marginTop: 6, fontSize: 14, fontWeight: 700, color: 'var(--teal)' }}>Cambio: {eur(Number(entregado) - total)}</div>
                  )}
                </div>
              )}
              <button className="btn btn-primary btn-block" disabled={cobrando || !total} onClick={cobrar} style={{ fontSize: 15, padding: '13px 0' }}>
                {cobrando ? 'Cobrando...' : `Cobrar ${eur(total)}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Imprime un ticket a partir del objeto que devuelven cobrar / detalle de recibo.
function imprimirTicketRecibo(t) {
  const anulado = t.recibo.estado === 'anulado';
  const filas = t.detalle.map(d => `<tr><td>${d.descripcion}${d.cliente ? `<br><small>${d.cliente}</small>` : ''}${(d.descuentoPct || d.descuentoMensPct) ? `<br><small>dto ${(d.descuentoPct || 0)}%${d.descuentoMensPct ? ` +${d.descuentoMensPct}%` : ''}</small>` : ''}</td><td style="text-align:right">${d.ivaPct}%</td><td style="text-align:right">${Number(d.total).toFixed(2)}</td></tr>`).join('');
  const bases = t.basesPorIva.map(b => `<tr><td colspan="2">Base ${b.ivaPct}% IVA</td><td style="text-align:right">${b.base.toFixed(2)} (${b.iva.toFixed(2)})</td></tr>`).join('');
  const w = window.open('', '_blank', 'width=380,height=640');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo ${t.recibo.numero}</title>
    <style>body{font-family:sans-serif;width:280px;margin:0 auto;padding:10px;color:#111;font-size:12px}
    h2{text-align:center;font-size:14px;margin:2px 0}.c{text-align:center;color:#555;font-size:11px;line-height:1.4}
    table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:3px 0;border-bottom:1px solid #eee;vertical-align:top}
    .tot{font-size:15px;font-weight:800;text-align:right;margin-top:6px}small{color:#777}
    .anul{text-align:center;color:#c00;font-weight:800;border:2px solid #c00;padding:4px;margin:6px 0}</style></head><body>
    <h2>${t.empresa.nombre}</h2>
    <div class="c">${t.empresa.nif}<br>${t.empresa.direccion}<br>${t.empresa.cp}<br>${t.empresa.tel} · ${t.empresa.web}</div>
    ${anulado ? `<div class="anul">RECIBO ANULADO${t.recibo.anuladoMotivo ? `<br><small style="color:#c00">${t.recibo.anuladoMotivo}</small>` : ''}</div>` : '<hr>'}
    <div>Recibo nº <b>${t.recibo.numero}</b><br>Fecha: ${new Date(t.recibo.fecha).toLocaleDateString('es-ES')}<br>Pagador: ${t.recibo.pagador}</div>
    <table><thead><tr><td><b>Descripción</b></td><td style="text-align:right"><b>IVA</b></td><td style="text-align:right"><b>Importe</b></td></tr></thead>
    <tbody>${filas}${bases}</tbody></table>
    <div class="tot">TOTAL: ${Number(t.recibo.total).toFixed(2)} €</div>
    <div style="text-align:right">${t.recibo.medioPago || ''}${t.recibo.medioPago === 'efectivo' ? ` · entregado ${Number(t.recibo.entregado).toFixed(2)} · cambio ${Number(t.recibo.cambio).toFixed(2)}` : ''}</div>
    ${t.ahorro > 0 ? `<div style="text-align:right;color:#0a0">Ahorro: ${t.ahorro.toFixed(2)} €</div>` : ''}
    <p style="text-align:center;margin-top:10px"><b>¡Gracias!</b></p>
    <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

// Histórico de recibos: buscar, reimprimir y anular.
function BillingRecibos({ showToast }) {
  const [recibos, setRecibos] = useState([]);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState(null);
  const [anulando, setAnulando] = useState(null); // { id, numero, motivo }
  const [saving, setSaving] = useState(false);

  async function cargar() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (estado) params.set('estado', estado);
      const r = await fetch(`/api/admin/billing/recibos?${params}`, { credentials: 'include' });
      if (r.ok) setRecibos(await r.json());
    } catch { /* noop */ }
    finally { setLoading(false); }
  }
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [q, estado]);

  async function verDetalle(id, imprimir) {
    const r = await fetch(`/api/admin/billing/recibos/${id}`, { credentials: 'include' });
    if (!r.ok) { alert('No se pudo cargar el recibo.'); return; }
    const t = await r.json();
    if (imprimir) imprimirTicketRecibo(t); else setDetalle(t);
  }

  async function anular() {
    if (!anulando.motivo?.trim()) { alert('Indica el motivo.'); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/billing/recibos/${anulando.id}/anular`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ motivo: anulando.motivo }),
      });
      if (r.ok) {
        const d = await r.json();
        showToast?.(`Recibo anulado. ${d.cargosDevueltos} cargo${d.cargosDevueltos !== 1 ? 's' : ''} vuelve${d.cargosDevueltos === 1 ? '' : 'n'} a pendiente.`);
        setAnulando(null); setDetalle(null); await cargar();
      } else { const d = await r.json(); alert(d.error || 'No se pudo anular.'); }
    } catch { alert('Error de conexión.'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-input" style={{ flex: '1 1 220px', maxWidth: 320 }}>
          <I.Search />
          <input placeholder="Buscar por pagador o nº de recibo..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['', 'Todos'], ['cobrado', 'Cobrados'], ['anulado', 'Anulados']].map(([v, l]) => (
            <button key={v} className={`filter-pill ${estado === v ? 'is-active' : ''}`} onClick={() => setEstado(v)}>{l}</button>
          ))}
        </div>
      </div>

      {loading && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
      {!loading && recibos.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
          No hay recibos todavía.
        </div>
      )}
      {recibos.length > 0 && (
        <div className="data-table">
          <div className="data-table-head" style={{ gridTemplateColumns: '80px 1.6fr 110px 110px 100px 120px' }}>
            <span>Nº</span><span>Pagador</span><span>Fecha</span><span>Importe</span><span>Medio</span><span></span>
          </div>
          {recibos.map(r => (
            <div key={r.id} className="data-table-row" style={{ gridTemplateColumns: '80px 1.6fr 110px 110px 100px 120px', opacity: r.estado === 'anulado' ? .55 : 1 }}>
              <span style={{ fontWeight: 800, fontFamily: 'var(--font-display)' }}>#{r.numero}</span>
              <div>
                <div className="pri">{r.pagador}</div>
                <div className="sec">{r.nLineas} línea{r.nLineas !== 1 ? 's' : ''}{r.estado === 'anulado' ? ` · anulado: ${r.anuladoMotivo || ''}` : ''}</div>
              </div>
              <span className="sec">{r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES') : ''}</span>
              <span style={{ fontWeight: 700, textDecoration: r.estado === 'anulado' ? 'line-through' : 'none' }}>{eur(r.importe)}</span>
              <span style={{ fontSize: 12, textTransform: 'capitalize' }}>{r.medioPago || '—'}</span>
              <div className="row-actions">
                <button className="icon-btn" title="Ver detalle" onClick={() => verDetalle(r.id, false)} aria-label="Ver"><I.Eye /></button>
                <button className="icon-btn" title="Reimprimir" onClick={() => verDetalle(r.id, true)} aria-label="Imprimir"><I.Print /></button>
                {r.estado !== 'anulado' && (
                  <button className="icon-btn danger" title="Anular" onClick={() => setAnulando({ id: r.id, numero: r.numero, motivo: '' })} aria-label="Anular"><I.X /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detalle */}
      {detalle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setDetalle(null); }}>
          <div style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Recibo #{detalle.recibo.numero}</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
                  {detalle.recibo.pagador} · {detalle.recibo.fecha ? new Date(detalle.recibo.fecha).toLocaleDateString('es-ES') : ''} · {detalle.recibo.medioPago}
                </p>
              </div>
              {detalle.recibo.estado === 'anulado' && <span className="status-pill pending">Anulado</span>}
            </div>
            {detalle.recibo.estado === 'anulado' && detalle.recibo.anuladoMotivo && (
              <p style={{ fontSize: 13, color: 'var(--orange)', background: 'color-mix(in oklab, var(--orange) 8%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--orange) 25%, transparent)', borderRadius: 10, padding: '8px 12px', margin: '0 0 12px' }}>
                Motivo: {detalle.recibo.anuladoMotivo}
              </p>
            )}
            <div style={{ display: 'grid', gap: 6 }}>
              {detalle.detalle.map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--line-2)' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{d.descripcion}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{d.cliente} · {mesLargo(d.mes)}{d.descuentoMensPct ? ` · dto ${d.descuentoMensPct}%` : ''}{d.ivaPct ? ` · IVA ${d.ivaPct}%` : ''}</div>
                  </div>
                  <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{eur(d.total)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontWeight: 800, fontSize: 16 }}>
              <span>TOTAL</span><span>{eur(detalle.recibo.total)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setDetalle(null)}>Cerrar</button>
              <button className="btn btn-primary" onClick={() => imprimirTicketRecibo(detalle)}><I.Print /> Reimprimir</button>
            </div>
          </div>
        </div>
      )}

      {/* Anular */}
      {anulando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setAnulando(null); }}>
          <div style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: 460, padding: 24 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>Anular recibo #{anulando.numero}</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--ink-2)' }}>
              El recibo no se borra: queda marcado como anulado. Sus cargos <b>vuelven a pendientes</b> y se podrán volver a cobrar.
            </p>
            <div className="field">
              <label>Motivo (obligatorio)</label>
              <input value={anulando.motivo} onChange={e => setAnulando(a => ({ ...a, motivo: e.target.value }))} placeholder="Ej. cobro duplicado" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setAnulando(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ background: 'var(--orange)' }} disabled={saving} onClick={anular}>{saving ? 'Anulando...' : 'Anular recibo'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TIPOS_CONCEPTO = ['Mensualidad', 'Material', 'Otros'];
const eur = (n) => `${Number(n || 0).toFixed(2)} €`;
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function mesLargo(iso) {
  if (!iso) return '';
  const [y, m] = String(iso).slice(0, 7).split('-');
  return `${MESES_ES[Number(m) - 1]} de ${y}`;
}

// Generación mensual de cargos (previsualizar → generar → ver pendientes).
function BillingGenerar({ activa, showToast }) {
  const [mes, setMes] = useState('');
  const [preview, setPreview] = useState(null);
  const [cargos, setCargos] = useState([]);
  const [loadingPv, setLoadingPv] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch('/api/admin/billing/mes-a-generar', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null).then(d => { if (d?.mes) setMes(d.mes.slice(0, 7)); }).catch(() => { });
  }, []);

  const mesIso = mes ? `${mes}-01` : '';

  async function cargarPreview() {
    if (!mesIso) return;
    setLoadingPv(true); setPreview(null);
    try {
      const r = await fetch(`/api/admin/billing/generar/preview?mes=${mesIso}`, { credentials: 'include' });
      if (r.ok) setPreview(await r.json());
      else { const d = await r.json(); alert(d.error || 'Error.'); }
    } catch { alert('Error de conexión.'); }
    finally { setLoadingPv(false); }
  }
  async function cargarCargos() {
    if (!mesIso) return;
    try {
      const r = await fetch(`/api/admin/billing/cargos?mes=${mesIso}&estado=pendiente`, { credentials: 'include' });
      if (r.ok) setCargos(await r.json());
    } catch { /* noop */ }
  }
  useEffect(() => { if (mesIso) { cargarPreview(); cargarCargos(); } }, [mesIso]);

  async function generar() {
    if (!window.confirm(`¿Generar los cargos de ${mesLargo(mesIso)}? Es seguro repetirlo: no duplica.`)) return;
    setGenerating(true);
    try {
      const r = await fetch('/api/admin/billing/generar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ mes: mesIso }),
      });
      if (r.ok) { const d = await r.json(); showToast?.(`${d.creados} cargo${d.creados !== 1 ? 's' : ''} generado${d.creados !== 1 ? 's' : ''}.`); await cargarPreview(); await cargarCargos(); }
      else { const d = await r.json(); alert(d.error || 'Error al generar.'); }
    } catch { alert('Error de conexión.'); }
    finally { setGenerating(false); }
  }

  async function borrarCargo(id) {
    if (!window.confirm('¿Borrar este cargo pendiente?')) return;
    const r = await fetch(`/api/admin/billing/cargos/${id}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) { await cargarPreview(); await cargarCargos(); showToast?.('Cargo borrado.'); }
    else { const d = await r.json(); alert(d.error || 'No se pudo borrar.'); }
  }

  if (!activa) return null;
  const totalPendiente = cargos.reduce((s, c) => s + c.precio * (1 - c.descuentoPct / 100), 0);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
        Genera los cargos del mes para todos los alumnos con ficha vigente, según lo definido en <b>Qué se cobra</b>.
        Se cobra por adelantado (corte el día 5). Repetirlo es seguro: no duplica. El descuento por varias mensualidades se aplica al cobrar.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px' }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>Mes a generar</label>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }} />
        <span style={{ fontSize: 13, color: 'var(--ink-3)', textTransform: 'capitalize' }}>{mesLargo(mesIso)}</span>
        <button className="btn btn-sm btn-outline" onClick={cargarPreview} disabled={loadingPv}>Previsualizar</button>
        <button className="btn btn-sm btn-primary" style={{ marginLeft: 'auto' }} onClick={generar} disabled={generating || !preview?.nuevos}>
          {generating ? 'Generando...' : `Generar ${preview?.nuevos ? `(${preview.nuevos})` : ''}`}
        </button>
      </div>

      {loadingPv && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Calculando...</p>}
      {preview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {[
            { l: 'Cargos nuevos', v: preview.nuevos, c: 'var(--teal)' },
            { l: 'Ya existían', v: preview.yaExistian, c: 'var(--ink-3)' },
            { l: 'Alumnos', v: preview.totalAlumnos, c: 'var(--ink)' },
            { l: 'Base (tras dto. manual)', v: eur(preview.importeBase), c: 'var(--purple)' },
          ].map((k, i) => (
            <div key={i} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{k.l}</div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)', color: k.c, marginTop: 4 }}>{k.v}</div>
            </div>
          ))}
        </div>
      )}
      {preview && preview.nuevos > 0 && (
        <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>
          Se crearán {preview.nuevos} cargos nuevos. (El descuento por nº de mensualidades y el IVA se calculan al cobrar en el TPV.)
        </p>
      )}

      {cargos.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, margin: 0 }}>Cargos pendientes de {mesLargo(mesIso)}</h3>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-2)' }}>{cargos.length} cargos · base {eur(totalPendiente)}</span>
          </div>
          <div className="data-table">
            <div className="data-table-head" style={{ gridTemplateColumns: '1.6fr 1.6fr 90px 80px 60px' }}>
              <span>Alumno</span><span>Concepto</span><span>Precio</span><span>Dto.</span><span></span>
            </div>
            {cargos.map(c => (
              <div key={c.id} className="data-table-row" style={{ gridTemplateColumns: '1.6fr 1.6fr 90px 80px 60px' }}>
                <div className="pri">{c.nombre} {c.apellidos}</div>
                <span style={{ fontSize: 13 }}>{c.descripcion}</span>
                <span style={{ fontWeight: 700 }}>{eur(c.precio)}</span>
                <span style={{ color: c.descuentoPct > 0 ? 'var(--teal)' : 'var(--ink-3)', fontWeight: 700 }}>{c.descuentoPct}%</span>
                <div className="row-actions">
                  <button className="icon-btn danger" onClick={() => borrarCargo(c.id)} aria-label="Borrar"><I.Trash /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminBilling({ showToast }) {
  const [tab, setTab] = useState('cobrar'); // 'cobrar' | 'catalogo' | 'clases' | 'temporadas' | 'conceptos' | 'fichas' | 'generar'
  const [temporadas, setTemporadas] = useState([]);
  const [precios, setPrecios] = useState([]);
  const [clases, setClases] = useState([]);       // clases propias
  const [aimtul, setAimtul] = useState({ activities: [], groups: [] }); // aim-tul en vivo
  const [actividades, setActividades] = useState([]);
  const [conceptos, setConceptos] = useState([]);
  const [matriculas, setMatriculas] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editPrecio, setEditPrecio] = useState(null);
  const [editClase, setEditClase] = useState(null);
  const [importing, setImporting] = useState(false);
  const [nuevaTemporada, setNuevaTemporada] = useState('');
  const [nuevoConcepto, setNuevoConcepto] = useState({ concepto: '', destino: '' }); // destino = 'actividad:Nombre' | 'clase:id'
  const [editFicha, setEditFicha] = useState(null);
  const [fichaQ, setFichaQ] = useState('');
  const [saving, setSaving] = useState(false);

  const activa = temporadas.find(t => t.activa) || null;

  async function loadAll() {
    try {
      const [t, p, cl, ac] = await Promise.all([
        fetch('/api/admin/billing/temporadas', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
        fetch('/api/admin/billing/precios?all=1', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
        fetch('/api/admin/billing/clases?all=1', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
        fetch('/api/admin/billing/actividades', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      ]);
      setTemporadas(t); setPrecios(p); setClases(cl); setActividades(ac);
      const act = t.find(x => x.activa);
      if (act) {
        const [c, m] = await Promise.all([
          fetch(`/api/admin/billing/conceptos?temporadaId=${act.id}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
          fetch(`/api/admin/billing/matriculas?temporadaId=${act.id}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
        ]);
        setConceptos(c); setMatriculas(m);
      } else { setConceptos([]); setMatriculas([]); }
    } catch { /* noop */ }
    finally { setLoading(false); }
  }
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    fetch('/api/users', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(u => setAlumnos(Array.isArray(u) ? u : [])).catch(() => { });
    fetch('/api/admin/billing/aimtul', { credentials: 'include' }).then(r => r.ok ? r.json() : { activities: [], groups: [] }).then(setAimtul).catch(() => { });
  }, []);

  async function api(url, opts, okMsg) {
    setSaving(true);
    try {
      const r = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
      if (r.ok) { await loadAll(); if (okMsg) showToast?.(okMsg); return true; }
      const d = await r.json().catch(() => ({}));
      alert(d.error || 'Error al guardar.');
      return false;
    } catch { alert('Error de conexión.'); return false; }
    finally { setSaving(false); }
  }

  const emptyPrecio = { concepto: '', descripcion: '', precio: 0, tipo: 'Mensualidad', ivaPct: 0, activo: true, esNuevo: true };

  // Lista de clases MEZCLADA: aim-tul en vivo + propias. ref+origen la identifica.
  const clasesMerged = [
    ...aimtul.groups.map(g => ({ ref: g.id, origen: 'aimtul', nombre: g.name, actividad: g.activityName })),
    ...clases.filter(c => c.activa).map(c => ({ ref: c.id, origen: 'custom', nombre: c.nombre, actividad: c.actividad || 'Otras (propias)' })),
  ];
  // Agrupadas por actividad para los <optgroup>.
  const clasesPorActividad = {};
  for (const c of clasesMerged) (clasesPorActividad[c.actividad] = clasesPorActividad[c.actividad] || []).push(c);

  // "Qué se cobra" agrupado por destino (actividad o clase) para pintarlo.
  const conceptosPorDestino = {};
  for (const c of conceptos) {
    const key = c.targetTipo === 'actividad' ? `actividad:${c.targetActividad}` : `clase:${c.targetRef}`;
    (conceptosPorDestino[key] = conceptosPorDestino[key] || { tipo: c.targetTipo, nombre: c.targetNombre, items: [] }).items.push(c);
  }

  const fichasVisibles = matriculas.filter(m => {
    const q = fichaQ.trim().toLowerCase();
    return !q || `${m.nombre} ${m.apellidos}`.toLowerCase().includes(q)
      || (m.claseNombre || '').toLowerCase().includes(q) || (m.actividad || '').toLowerCase().includes(q);
  });

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 22, borderBottom: '1px solid var(--line-2)', paddingBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['cobrar', '💳 Cobrar (TPV)'], ['recibos', 'Recibos'], ['catalogo', `Catálogo (${precios.length})`], ['clases', `Clases (${clasesMerged.length})`], ['temporadas', 'Temporadas'], ['conceptos', `Qué se cobra (${conceptos.length})`], ['fichas', `Fichas (${matriculas.length})`], ['generar', 'Generar cargos']].map(([id, label]) => (
          <button key={id} className={`filter-pill ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)} style={{ borderRadius: 8, padding: '8px 16px' }}>{label}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: activa ? 'var(--teal)' : 'var(--orange)' }}>
          {activa ? `Temporada activa: ${activa.nombre}` : 'Sin temporada activa'}
        </span>
      </div>

      {loading && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}

      {!loading && !activa && ['conceptos', 'fichas'].includes(tab) && (
        <div style={{ padding: 24, background: 'color-mix(in oklab, var(--orange) 8%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--orange) 30%, transparent)', borderRadius: 14, marginBottom: 16, fontSize: 14, color: 'var(--ink-2)' }}>
          No hay ninguna temporada activa. Crea una y actívala en <b>Temporadas</b> — sin eso no se puede cobrar nada.
        </div>
      )}

      {/* ── Cobrar (TPV) ── */}
      {!loading && tab === 'cobrar' && <BillingTPV showToast={showToast} />}

      {/* ── Recibos (histórico) ── */}
      {!loading && tab === 'recibos' && <BillingRecibos showToast={showToast} />}

      {/* ── Catálogo ── */}
      {!loading && tab === 'catalogo' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <button className="btn btn-sm btn-primary" onClick={() => setEditPrecio({ ...emptyPrecio })}><I.Plus /> Nuevo concepto</button>
          </div>
          {precios.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
              El catálogo está vacío. Cada concepto es algo que cobráis: una mensualidad, un material, etc.
            </div>
          )}
          {precios.length > 0 && (
            <div className="data-table">
              <div className="data-table-head" style={{ gridTemplateColumns: '1.6fr 100px 110px 90px 90px 80px' }}>
                <span>Concepto</span><span>Tipo</span><span>Precio (base)</span><span>IVA</span><span>Estado</span><span></span>
              </div>
              {precios.map(p => (
                <div key={p.concepto} className="data-table-row" style={{ gridTemplateColumns: '1.6fr 100px 110px 90px 90px 80px', opacity: p.activo ? 1 : .5 }}>
                  <div>
                    <div className="pri">{p.descripcion}</div>
                    <div className="sec">{p.concepto}</div>
                  </div>
                  <span style={{ fontSize: 12 }}>{p.tipo}</span>
                  <span style={{ fontWeight: 700 }}>{eur(p.precio)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: p.ivaPct > 0 ? 'var(--orange)' : 'var(--ink-3)' }}>{p.ivaPct}%</span>
                  <span className={`status-pill ${p.activo ? 'ok' : 'pending'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                  <div className="row-actions">
                    <button className="icon-btn" onClick={() => setEditPrecio({ ...p })} aria-label="Editar"><I.Edit /></button>
                    <button className="icon-btn danger" onClick={async () => {
                      if (!window.confirm(`¿Borrar "${p.descripcion}"? Si ya se ha cobrado alguna vez, se desactivará en vez de borrarse.`)) return;
                      await api(`/api/admin/billing/precios/${encodeURIComponent(p.concepto)}`, { method: 'DELETE' }, 'Concepto eliminado.');
                    }} aria-label="Borrar"><I.Trash /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Clases ── */}
      {!loading && tab === 'clases' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-primary" onClick={() => setEditClase({ nombre: '', actividad: '', esNueva: true })}>
              <I.Plus /> Nueva clase propia
            </button>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Las <b>{aimtul.groups.length}</b> clases de Aim-Tul aparecen aquí y en los desplegables <b>automáticamente y en tiempo real</b> — no hay que importarlas.
            </span>
          </div>
          {Object.entries(clasesPorActividad).sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([act, cs]) => (
            <div key={act} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>{act}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {cs.map(c => (
                  <span key={`${c.origen}:${c.ref}`} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', background: c.origen === 'custom' ? 'color-mix(in oklab, var(--teal) 10%, var(--bg-3))' : 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 999, padding: c.origen === 'custom' ? '4px 6px 4px 12px' : '5px 12px', fontSize: 12, fontWeight: 700 }}>
                    {c.nombre}
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: c.origen === 'custom' ? 'var(--teal)' : 'var(--ink-3)' }}>
                      {c.origen === 'custom' ? 'Propia' : 'Aim-Tul'}
                    </span>
                    {c.origen === 'custom' && (
                      <>
                        <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => setEditClase({ id: c.ref, nombre: c.nombre, actividad: clases.find(x => x.id === c.ref)?.actividad || '' })} aria-label="Editar"><I.Edit /></button>
                        <button className="icon-btn danger" style={{ width: 22, height: 22 }} onClick={async () => {
                          if (!window.confirm(`¿Borrar la clase propia "${c.nombre}"? Si tiene fichas, se desactivará.`)) return;
                          await api(`/api/admin/billing/clases/${c.ref}`, { method: 'DELETE' }, 'Clase eliminada.');
                        }} aria-label="Borrar"><I.Trash /></button>
                      </>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Temporadas ── */}
      {!loading && tab === 'temporadas' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onSubmit={async e => {
            e.preventDefault();
            if (!nuevaTemporada.trim()) return;
            if (await api('/api/admin/billing/temporadas', { method: 'POST', body: JSON.stringify({ nombre: nuevaTemporada.trim() }) }, 'Temporada creada.')) setNuevaTemporada('');
          }}>
            <input value={nuevaTemporada} onChange={e => setNuevaTemporada(e.target.value)} placeholder="Ej. 2026/2027"
              style={{ fontFamily: 'inherit', fontSize: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', minWidth: 200 }} />
            <button className="btn btn-sm btn-primary" type="submit" disabled={saving}><I.Plus /> Crear temporada</button>
          </form>
          {temporadas.map(t => (
            <div key={t.id} style={{ background: 'var(--bg-2)', border: `1px solid ${t.activa ? 'var(--teal)' : 'var(--line)'}`, borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{t.nombre}</div>
              {t.activa
                ? <span className="status-pill ok">Activa</span>
                : <button className="btn btn-sm btn-outline" disabled={saving} onClick={() => api(`/api/admin/billing/temporadas/${t.id}/activar`, { method: 'PUT' }, `Temporada ${t.nombre} activada.`)}>Activar</button>}
              {!t.activa && (
                <button className="icon-btn danger" style={{ marginLeft: 'auto' }} onClick={async () => {
                  if (!window.confirm(`¿Borrar la temporada ${t.nombre}?`)) return;
                  await api(`/api/admin/billing/temporadas/${t.id}`, { method: 'DELETE' }, 'Temporada borrada.');
                }} aria-label="Borrar"><I.Trash /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Qué se cobra a cada actividad / grupo ── */}
      {!loading && tab === 'conceptos' && activa && (
        <div style={{ display: 'grid', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
            Asigna un concepto a una <b>actividad entera</b> (lo pagan todas sus clases) o a una <b>clase concreta</b>.
            La lista mezcla vuestras clases de Aim-Tul (en vivo) con las propias. Es lo que usará la generación mensual.
          </p>
          <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} onSubmit={async e => {
            e.preventDefault();
            if (!nuevoConcepto.concepto || !nuevoConcepto.destino) return;
            let body = { concepto: nuevoConcepto.concepto, temporadaId: activa.id };
            if (nuevoConcepto.destino.startsWith('actividad:')) {
              body = { ...body, targetTipo: 'actividad', targetActividad: nuevoConcepto.destino.slice('actividad:'.length) };
            } else {
              const [, origen, ref] = nuevoConcepto.destino.split(':');
              body = { ...body, targetTipo: 'clase', targetOrigen: origen, targetRef: ref };
            }
            if (await api('/api/admin/billing/conceptos', { method: 'POST', body: JSON.stringify(body) }, 'Asignado.')) {
              setNuevoConcepto({ concepto: '', destino: '' });
            }
          }}>
            <select value={nuevoConcepto.concepto} onChange={e => setNuevoConcepto(c => ({ ...c, concepto: e.target.value }))}
              style={{ fontFamily: 'inherit', fontSize: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', minWidth: 220 }}>
              <option value="">Concepto...</option>
              {precios.filter(p => p.activo).map(p => <option key={p.concepto} value={p.concepto}>{p.descripcion} ({eur(p.precio)})</option>)}
            </select>
            <select value={nuevoConcepto.destino} onChange={e => setNuevoConcepto(c => ({ ...c, destino: e.target.value }))}
              style={{ fontFamily: 'inherit', fontSize: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', minWidth: 260 }}>
              <option value="">¿A quién se le cobra?...</option>
              <optgroup label="Actividad entera (todas sus clases)">
                {actividades.map(a => <option key={a} value={`actividad:${a}`}>🎯 {a}</option>)}
              </optgroup>
              {Object.entries(clasesPorActividad).map(([actName, cs]) => (
                <optgroup key={actName} label={`Clases de ${actName}`}>
                  {cs.map(c => <option key={`${c.origen}:${c.ref}`} value={`clase:${c.origen}:${c.ref}`}>{c.nombre}{c.origen === 'custom' ? ' (propia)' : ''}</option>)}
                </optgroup>
              ))}
            </select>
            <button className="btn btn-sm btn-primary" type="submit" disabled={saving}><I.Plus /> Asignar</button>
          </form>
          {conceptos.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
              Nada asignado todavía en {activa.nombre}.
            </div>
          )}
          {Object.entries(conceptosPorDestino).map(([key, grupo]) => (
            <div key={key} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, background: grupo.tipo === 'actividad' ? 'color-mix(in oklab, var(--purple) 16%, var(--bg-2))' : 'var(--bg-3)', color: grupo.tipo === 'actividad' ? 'var(--purple)' : 'var(--ink-3)', border: '1px solid var(--line-2)' }}>
                  {grupo.tipo === 'actividad' ? 'Actividad' : 'Clase'}
                </span>
                {grupo.nombre || '(sin nombre)'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {grupo.items.map(c => (
                  <span key={c.id} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 999, padding: '4px 6px 4px 12px', fontSize: 12, fontWeight: 700 }}>
                    {c.descripcion} · {eur(c.precio)}{c.ivaPct > 0 ? ` +${c.ivaPct}%` : ''}
                    <button className="icon-btn danger" style={{ width: 22, height: 22 }} onClick={() => api(`/api/admin/billing/conceptos/${c.id}`, { method: 'DELETE' }, 'Quitado.')} aria-label="Quitar"><I.X /></button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Fichas ── */}
      {!loading && tab === 'fichas' && activa && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-sm btn-primary" onClick={() => setEditFicha({ userId: '', clase: '', descuentoPct: 0, alta: '', baja: '', esNueva: true })}>
              <I.Plus /> Nueva ficha
            </button>
            <div className="search-input" style={{ flex: '1 1 200px', maxWidth: 300 }}>
              <I.Search />
              <input placeholder="Buscar por alumno o clase..." value={fichaQ} onChange={e => setFichaQ(e.target.value)} />
            </div>
          </div>
          {matriculas.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
              Sin fichas en {activa.nombre}. La ficha dice que un alumno está en una clase — y con qué descuento.
            </div>
          )}
          {fichasVisibles.length > 0 && (
            <div className="data-table">
              <div className="data-table-head" style={{ gridTemplateColumns: '1.6fr 1.4fr 90px 1fr 80px' }}>
                <span>Alumno</span><span>Clase</span><span>Dto.</span><span>Alta / Baja</span><span></span>
              </div>
              {fichasVisibles.map(m => (
                <div key={m.id} className="data-table-row" style={{ gridTemplateColumns: '1.6fr 1.4fr 90px 1fr 80px', opacity: m.baja ? .5 : 1 }}>
                  <div>
                    <div className="pri">{m.nombre} {m.apellidos}</div>
                    <div className="sec">{m.email}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{m.claseNombre || '—'}</div>
                    <div className="sec">{m.actividad || ''}{m.claseOrigen === 'custom' ? ' · propia' : ''}</div>
                  </div>
                  <span style={{ fontWeight: 700, color: m.descuentoPct > 0 ? 'var(--teal)' : 'var(--ink-3)' }}>{m.descuentoPct}%</span>
                  <span className="sec">
                    {m.alta ? String(m.alta).slice(0, 10) : '—'}{m.baja ? ` → baja ${String(m.baja).slice(0, 10)}` : ''}
                  </span>
                  <div className="row-actions">
                    <button className="icon-btn" onClick={() => setEditFicha({ ...m, alta: m.alta ? String(m.alta).slice(0, 10) : '', baja: m.baja ? String(m.baja).slice(0, 10) : '' })} aria-label="Editar"><I.Edit /></button>
                    <button className="icon-btn danger" onClick={async () => {
                      if (!window.confirm(`¿Borrar la ficha de ${m.nombre}?`)) return;
                      await api(`/api/admin/billing/matriculas/${m.id}`, { method: 'DELETE' }, 'Ficha borrada.');
                    }} aria-label="Borrar"><I.Trash /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Generar cargos ── */}
      {!loading && tab === 'generar' && <BillingGenerar activa={activa} showToast={showToast} />}

      {/* ── Modal concepto ── */}
      {editPrecio && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setEditPrecio(null); }}>
          <div style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: 520, padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>{editPrecio.esNuevo ? 'Nuevo concepto' : 'Editar concepto'}</h3>
            <form style={{ display: 'grid', gap: 14 }} onSubmit={async e => {
              e.preventDefault();
              const body = JSON.stringify(editPrecio);
              const ok = editPrecio.esNuevo
                ? await api('/api/admin/billing/precios', { method: 'POST', body }, 'Concepto creado.')
                : await api(`/api/admin/billing/precios/${encodeURIComponent(editPrecio.concepto)}`, { method: 'PUT', body }, 'Concepto actualizado.');
              if (ok) setEditPrecio(null);
            }}>
              <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label>Código</label>
                  <input value={editPrecio.concepto} onChange={e => setEditPrecio(p => ({ ...p, concepto: e.target.value }))} required disabled={!editPrecio.esNuevo} placeholder="tkd-mens" />
                </div>
                <div className="field">
                  <label>Tipo</label>
                  <select value={editPrecio.tipo} onChange={e => setEditPrecio(p => ({ ...p, tipo: e.target.value }))}>
                    {TIPOS_CONCEPTO.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="field"><label>Descripción (la que sale en el ticket)</label><input value={editPrecio.descripcion} onChange={e => setEditPrecio(p => ({ ...p, descripcion: e.target.value }))} required /></div>
              <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label>Precio sin IVA (base)</label>
                  <input type="number" step="0.01" min="0" value={editPrecio.precio} onChange={e => setEditPrecio(p => ({ ...p, precio: e.target.value }))} required />
                </div>
                <div className="field">
                  <label>IVA %</label>
                  <select value={editPrecio.ivaPct} onChange={e => setEditPrecio(p => ({ ...p, ivaPct: Number(e.target.value) }))}>
                    <option value={0}>0% (exento)</option>
                    <option value={21}>21%</option>
                  </select>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
                El IVA se suma encima del precio. Cambiar el precio aquí <b>no</b> toca los cargos ya generados: cada uno guarda el suyo.
              </p>
              {!editPrecio.esNuevo && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editPrecio.activo !== false} onChange={e => setEditPrecio(p => ({ ...p, activo: e.target.checked }))} />
                  Activo (los inactivos no se pueden asignar ni cobrar)
                </label>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditPrecio(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal clase propia ── */}
      {editClase && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setEditClase(null); }}>
          <div style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: 460, padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>{editClase.esNueva ? 'Nueva clase propia' : 'Editar clase'}</h3>
            <form style={{ display: 'grid', gap: 14 }} onSubmit={async e => {
              e.preventDefault();
              const body = JSON.stringify({ nombre: editClase.nombre, actividad: editClase.actividad });
              const ok = editClase.esNueva
                ? await api('/api/admin/billing/clases', { method: 'POST', body }, 'Clase creada.')
                : await api(`/api/admin/billing/clases/${editClase.id}`, { method: 'PUT', body }, 'Clase actualizada.');
              if (ok) setEditClase(null);
            }}>
              <div className="field"><label>Nombre de la clase</label><input value={editClase.nombre} onChange={e => setEditClase(c => ({ ...c, nombre: e.target.value }))} required placeholder="Ej. Refuerzo escolar" /></div>
              <div className="field">
                <label>Actividad (agrupador)</label>
                <input list="actividades-sug" value={editClase.actividad} onChange={e => setEditClase(c => ({ ...c, actividad: e.target.value }))} placeholder="Ej. Apoyo, Campamento..." />
                <datalist id="actividades-sug">{actividades.map(a => <option key={a} value={a} />)}</datalist>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>La actividad sirve para agrupar y para poder cobrar "por actividad entera".</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditClase(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal ficha ── */}
      {editFicha && activa && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setEditFicha(null); }}>
          <div style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: 520, padding: 24 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>{editFicha.esNueva ? 'Nueva ficha' : `Ficha de ${editFicha.nombre}`}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-3)' }}>Temporada {activa.nombre}</p>
            <form style={{ display: 'grid', gap: 14 }} onSubmit={async e => {
              e.preventDefault();
              if (editFicha.esNueva) {
                if (!editFicha.clase) { alert('Elige una clase.'); return; }
                const [origen, ref] = editFicha.clase.split(/:(.+)/);
                const body = { userId: editFicha.userId, claseRef: ref, claseOrigen: origen, descuentoPct: editFicha.descuentoPct, alta: editFicha.alta, temporadaId: activa.id };
                if (await api('/api/admin/billing/matriculas', { method: 'POST', body: JSON.stringify(body) }, 'Ficha creada.')) setEditFicha(null);
              } else {
                if (await api(`/api/admin/billing/matriculas/${editFicha.id}`, { method: 'PUT', body: JSON.stringify(editFicha) }, 'Ficha actualizada.')) setEditFicha(null);
              }
            }}>
              {editFicha.esNueva ? (
                <>
                  <div className="field">
                    <label>Alumno</label>
                    <select value={editFicha.userId} onChange={e => setEditFicha(f => ({ ...f, userId: e.target.value }))} required>
                      <option value="">Elige alumno...</option>
                      {[...alumnos].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'es'))
                        .map(a => <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Clase (Aim-Tul o propia)</label>
                    <select value={editFicha.clase} onChange={e => setEditFicha(f => ({ ...f, clase: e.target.value }))} required>
                      <option value="">Elige clase...</option>
                      {Object.entries(clasesPorActividad).map(([actName, cs]) => (
                        <optgroup key={actName} label={actName}>
                          {cs.map(c => <option key={`${c.origen}:${c.ref}`} value={`${c.origen}:${c.ref}`}>{c.nombre}{c.origen === 'custom' ? ' (propia)' : ''}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
                  <b>{editFicha.claseNombre}</b>{editFicha.actividad ? ` · ${editFicha.actividad}` : ''}
                </div>
              )}
              <div className="field">
                <label>Descuento manual (%)</label>
                <input type="number" step="0.01" min="0" max="100" value={editFicha.descuentoPct} onChange={e => setEditFicha(f => ({ ...f, descuentoPct: e.target.value }))} />
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
                Este descuento se congela en cada cargo al generarlo. El de hermanos/varias mensualidades se calcula solo al cobrar.
              </p>
              <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field"><label>Alta</label><input type="date" value={editFicha.alta || ''} onChange={e => setEditFicha(f => ({ ...f, alta: e.target.value }))} /></div>
                <div className="field"><label>Baja (vacío = activa)</label><input type="date" value={editFicha.baja || ''} onChange={e => setEditFicha(f => ({ ...f, baja: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditFicha(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// Agenda del campamento: quién viene cada día (semanal / mensual / general).
function CampAgenda({ weeks, children }) {
  const [view, setView] = useState('week'); // 'week' | 'month' | 'general'
  const [weekIdx, setWeekIdx] = useState(0);
  const [selDay, setSelDay] = useState(null);
  const [ym, setYm] = useState(() => {
    const base = weeks[0]?.startDate ? new Date(weeks[0].startDate + 'T12:00:00') : new Date();
    return { y: base.getFullYear(), m: base.getMonth() };
  });

  const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const WD_HEAD = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const dowShort = (day) => ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][new Date(day + 'T12:00:00').getDay()];

  // Mapa día -> niños que asisten
  const byDay = {};
  children.forEach(c => (c.days || []).forEach(d => { (byDay[d] = byDay[d] || []).push(c); }));
  const nameSort = (a, b) => `${a.nombre} ${a.apellidos}`.localeCompare(`${b.nombre} ${b.apellidos}`, 'es', { sensitivity: 'base' });
  const kidsOn = (day) => (byDay[day] || []).slice().sort(nameSort);

  const holidaySet = new Set(weeks.flatMap(w => w.holidays || []));
  const campDaySet = new Set(weeks.flatMap(w => (w.days || []).map(d => d.day)));

  if (!weeks.length) {
    return (
      <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
        Configura primero las semanas del campamento para ver quién viene cada día.
      </div>
    );
  }

  const wk = weeks[Math.min(weekIdx, weeks.length - 1)];

  const NameRow = ({ k }) => (
    <div style={{ fontSize: 12, color: 'var(--ink)', display: 'flex', gap: 6, alignItems: 'center' }}>
      <span title={k.pagado ? 'Pagado' : 'Pago pendiente'} style={{ width: 7, height: 7, borderRadius: '50%', background: k.pagado ? 'var(--teal)' : 'var(--orange)', flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.nombre} {k.apellidos}{k.edad ? <span style={{ color: 'var(--ink-3)' }}> · {k.edad}</span> : null}</span>
    </div>
  );

  // Celdas del mes (lunes primero)
  const firstOfMonth = new Date(ym.y, ym.m, 1);
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const jumpToDay = (day) => {
    const d = new Date(day + 'T12:00:00');
    setYm({ y: d.getFullYear(), m: d.getMonth() });
    setSelDay(day);
    setView('month');
  };

  const chevL = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>;
  const chevR = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['week', 'Semanal'], ['month', 'Mensual'], ['general', 'General']].map(([id, label]) => (
          <button key={id} className={`filter-pill ${view === id ? 'is-active' : ''}`} onClick={() => { setView(id); setSelDay(null); }} style={{ borderRadius: 8, padding: '8px 16px' }}>{label}</button>
        ))}
      </div>

      {/* ── Semanal ── */}
      {view === 'week' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-icon" disabled={weekIdx <= 0} onClick={() => setWeekIdx(i => Math.max(0, i - 1))} aria-label="Semana anterior">{chevL}</button>
            <select value={Math.min(weekIdx, weeks.length - 1)} onChange={e => setWeekIdx(Number(e.target.value))}
              style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', minWidth: 220 }}>
              {weeks.map((w, i) => <option key={w.id} value={i}>{w.label}</option>)}
            </select>
            <button className="btn btn-icon" disabled={weekIdx >= weeks.length - 1} onClick={() => setWeekIdx(i => Math.min(weeks.length - 1, i + 1))} aria-label="Semana siguiente">{chevR}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${wk.days.length || 1}, minmax(150px, 1fr))`, gap: 10, overflowX: 'auto' }}>
            {wk.days.map(({ day, holiday }) => {
              const p = campDayParts(day);
              const list = kidsOn(day);
              return (
                <div key={day} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', display: 'grid', gap: 8, alignContent: 'start' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--line-2)', paddingBottom: 6 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--ink)' }}>{dowShort(day)} {p.num}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: holiday ? 'var(--orange)' : 'var(--teal)' }}>{holiday ? 'Cerrado' : list.length}</div>
                  </div>
                  {holiday
                    ? <div style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>Festivo</div>
                    : list.length
                      ? <div style={{ display: 'grid', gap: 4 }}>{list.map(k => <NameRow key={k.id} k={k} />)}</div>
                      : <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Nadie apuntado.</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Mensual ── */}
      {view === 'month' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-icon" onClick={() => { setYm(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }); setSelDay(null); }} aria-label="Mes anterior">{chevL}</button>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, minWidth: 160, textAlign: 'center' }}>{MONTHS[ym.m]} {ym.y}</span>
            <button className="btn btn-icon" onClick={() => { setYm(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }); setSelDay(null); }} aria-label="Mes siguiente">{chevR}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {WD_HEAD.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>{d}</div>)}
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const isHol = holidaySet.has(day);
              const isCamp = campDaySet.has(day) && !isHol;
              const count = isCamp ? kidsOn(day).length : 0;
              const sel = selDay === day;
              return (
                <button key={i} disabled={!isCamp} onClick={() => setSelDay(day)}
                  style={{
                    minHeight: 62, borderRadius: 10, padding: '6px 8px', textAlign: 'left', fontFamily: 'inherit',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start',
                    cursor: isCamp ? 'pointer' : 'default',
                    border: `1px solid ${sel ? 'var(--ink)' : 'var(--line-2)'}`,
                    background: sel ? 'var(--bg-3)' : isCamp ? 'var(--bg-2)' : 'transparent',
                    opacity: isCamp || isHol ? 1 : .4,
                  }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>{Number(day.slice(8))}</span>
                  {isHol
                    ? <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--orange)' }}>Fiesta</span>
                    : isCamp
                      ? <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: count ? 'color-mix(in oklab, var(--teal) 16%, var(--bg-2))' : 'var(--bg-3)', color: count ? 'var(--teal)' : 'var(--ink-3)' }}>{count}</span>
                      : null}
                </button>
              );
            })}
          </div>
          {selDay && (
            <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)', textTransform: 'capitalize', marginBottom: 10 }}>
                {campFmtLong(selDay)} — {kidsOn(selDay).length} niños/as
              </div>
              {kidsOn(selDay).length
                ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>{kidsOn(selDay).map(k => <NameRow key={k.id} k={k} />)}</div>
                : <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Nadie apuntado este día.</div>}
            </div>
          )}
        </div>
      )}

      {/* ── General ── */}
      {view === 'general' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {weeks.map(w => {
            const total = (w.days || []).reduce((s, d) => s + (holidaySet.has(d.day) ? 0 : kidsOn(d.day).length), 0);
            return (
              <div key={w.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{w.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{total} asistencias · capacidad {w.capacity}/día</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(w.days || []).map(({ day, holiday }) => {
                    const count = kidsOn(day).length;
                    const p = campDayParts(day);
                    const full = !holiday && w.capacity != null && count >= w.capacity;
                    return (
                      <button key={day} onClick={() => jumpToDay(day)} title="Ver quién viene"
                        style={{
                          fontSize: 12, fontWeight: 700, padding: '6px 11px', borderRadius: 10, cursor: 'pointer',
                          border: `1px ${holiday ? 'dashed' : 'solid'} ${holiday ? 'color-mix(in oklab, var(--orange) 35%, transparent)' : full ? 'color-mix(in oklab, var(--orange) 35%, transparent)' : 'var(--line)'}`,
                          background: holiday ? 'color-mix(in oklab, var(--orange) 7%, var(--bg-2))' : 'var(--bg-3)',
                          color: (holiday || full) ? 'var(--orange)' : 'var(--ink-2)',
                        }}>
                        {dowShort(day)} {p.num} · {holiday ? 'Fiesta' : `${count} niños`}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminCamp({ showToast }) {
  const [tab, setTab] = useState('roster'); // 'roster' | 'children' | 'weeks' | 'agenda'
  const [weeks, setWeeks] = useState([]);
  const [children, setChildren] = useState([]);
  const [roster, setRoster] = useState([]);
  const [rosterDay, setRosterDay] = useState(todayISO());
  const [rosterLoading, setRosterLoading] = useState(false);
  const [childrenLoading, setChildrenLoading] = useState(false);

  // Orden (compartido entre inscritos y pasar lista)
  const [sortMode, setSortMode] = useState('alpha'); // 'alpha' | 'age'

  // Filtros de inscritos
  const [nameFilter, setNameFilter] = useState('');
  const [pagadoFilter, setPagadoFilter] = useState('all');

  // Modales
  const [editingChild, setEditingChild] = useState(null);   // datos del niño (nuevo o existente)
  const [editingDays, setEditingDays] = useState(null);     // { child, days: [] }
  const [editingWeek, setEditingWeek] = useState(null);     // semana (nueva o existente)
  const [savingModal, setSavingModal] = useState(false);

  const emptyChild = { nombre: '', apellidos: '', edad: '', alergias: '', observaciones: '', contacto: '', recogida: '', fotosRrss: false, pagado: false, days: [] };

  async function loadWeeks() {
    try {
      const r = await fetch('/api/camp/weeks', { credentials: 'include' });
      if (r.ok) setWeeks(await r.json());
    } catch { /* noop */ }
  }
  async function loadChildren() {
    setChildrenLoading(true);
    try {
      const r = await fetch('/api/admin/camp/children', { credentials: 'include' });
      if (r.ok) setChildren(await r.json());
    } catch { /* noop */ }
    finally { setChildrenLoading(false); }
  }
  async function loadRoster(day) {
    setRosterLoading(true);
    try {
      const r = await fetch(`/api/admin/camp/roster?day=${day}`, { credentials: 'include' });
      if (r.ok) setRoster(await r.json());
    } catch { /* noop */ }
    finally { setRosterLoading(false); }
  }

  useEffect(() => { loadWeeks(); loadChildren(); }, []);
  useEffect(() => { loadRoster(rosterDay); }, [rosterDay]);

  // Si hoy no cae dentro del campamento, saltar al primer día configurado.
  useEffect(() => {
    if (!weeks.length) return;
    const t = todayISO();
    const inCamp = weeks.some(w => t >= w.startDate && t <= w.endDate);
    if (!inCamp && rosterDay === t) {
      const future = weeks.find(w => w.startDate >= t);
      setRosterDay((future || weeks[0]).days[0]?.day || t);
    }
  }, [weeks]);

  const holidaySet = new Set(weeks.flatMap(w => w.holidays || []));

  function shiftDay(delta) {
    const d = new Date(rosterDay + 'T12:00:00');
    let guard = 0;
    const iso = () => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    do { d.setDate(d.getDate() + delta); guard++; } while (guard < 30 && (d.getDay() === 0 || d.getDay() === 6 || holidaySet.has(iso())));
    setRosterDay(iso());
  }

  function onAttendanceSaved(childId, patch) {
    setRoster(prev => prev.map(r => r.id === childId ? { ...r, ...patch } : r));
    showToast?.('Guardado.');
  }

  async function patchChild(id, patch) {
    const r = await fetch(`/api/admin/camp/children/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(patch),
    });
    if (r.ok) setChildren(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  async function deleteChild(id) {
    if (!window.confirm('¿Eliminar esta inscripción del campamento? Se borrarán también sus días, asistencia y notas.')) return;
    const r = await fetch(`/api/admin/camp/children/${id}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) { setChildren(prev => prev.filter(c => c.id !== id)); loadWeeks(); showToast?.('Inscripción eliminada.'); }
  }

  async function submitChild(e) {
    e.preventDefault();
    setSavingModal(true);
    try {
      const isEdit = !!editingChild.id;
      const url = isEdit ? `/api/admin/camp/children/${editingChild.id}` : '/api/admin/camp/children';
      const r = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...editingChild, edad: editingChild.edad || null }),
      });
      if (r.ok) {
        await loadChildren(); await loadWeeks();
        setEditingChild(null);
        showToast?.(isEdit ? 'Datos actualizados.' : 'Niño/a inscrito/a en el campamento.');
      } else { const d = await r.json(); alert(d.error || 'Error al guardar.'); }
    } catch { alert('Error de conexión.'); }
    finally { setSavingModal(false); }
  }

  async function submitDays() {
    setSavingModal(true);
    try {
      const r = await fetch(`/api/admin/camp/children/${editingDays.child.id}/days`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ days: editingDays.days }),
      });
      if (r.ok) {
        await loadChildren(); await loadWeeks(); loadRoster(rosterDay);
        setEditingDays(null);
        showToast?.('Días actualizados.');
      } else { const d = await r.json(); alert(d.error || 'Error al guardar.'); }
    } catch { alert('Error de conexión.'); }
    finally { setSavingModal(false); }
  }

  async function submitWeek(e) {
    e.preventDefault();
    setSavingModal(true);
    try {
      const isEdit = !!editingWeek.id;
      const url = isEdit ? `/api/admin/camp/weeks/${editingWeek.id}` : '/api/admin/camp/weeks';
      const r = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(editingWeek),
      });
      if (r.ok) { await loadWeeks(); setEditingWeek(null); showToast?.(isEdit ? 'Semana actualizada.' : 'Semana creada.'); }
      else { const d = await r.json(); alert(d.error || 'Error al guardar.'); }
    } catch { alert('Error de conexión.'); }
    finally { setSavingModal(false); }
  }

  async function deleteWeek(id) {
    if (!window.confirm('¿Eliminar esta semana del campamento?')) return;
    const r = await fetch(`/api/admin/camp/weeks/${id}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) { loadWeeks(); showToast?.('Semana eliminada.'); }
  }

  function printRoster() {
    const rows = sortedRoster.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.nombre || ''}</td>
        <td>${r.apellidos || ''}</td>
        <td>${r.edad ?? ''}</td>
        <td>${r.alergias || ''}</td>
        <td>${r.contacto || ''}</td>
        <td>${r.recogida || ''}</td>
        <td style="width:60px"></td>
      </tr>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>Lista campamento — ${rosterDay}</title>
      <style>
        body { font-family: sans-serif; padding: 24px; color: #111; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .meta { color: #555; font-size: 13px; margin-bottom: 18px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: left; }
        th { background: #f2f2f2; }
      </style></head><body>
      <h1>Campamento de verano — Pasar lista</h1>
      <div class="meta">${campFmtLong(rosterDay)} — ${roster.length} niños/as apuntados</div>
      <table>
        <thead><tr><th>#</th><th>Nombre</th><th>Apellidos</th><th>Edad</th><th>Alergias</th><th>Contacto</th><th>Recogida</th><th>Asistió</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload = () => window.print();</script>
      </body></html>`);
    w.document.close();
  }

  function printChildren() {
    const rows = visibleChildren.map((c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${c.nombre || ''}</td>
        <td>${c.apellidos || ''}</td>
        <td>${c.edad ?? ''}</td>
        <td>${c.parentEmail || 'Alta manual'}</td>
        <td>${c.contacto || ''}</td>
        <td>${c.alergias || ''}</td>
        <td>${(c.days || []).length}</td>
        <td>${c.pagado ? 'Sí' : 'No'}</td>
      </tr>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>Inscritos campamento</title>
      <style>
        body { font-family: sans-serif; padding: 24px; color: #111; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .meta { color: #555; font-size: 13px; margin-bottom: 18px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: left; }
        th { background: #f2f2f2; }
      </style></head><body>
      <h1>Campamento de verano — Inscritos</h1>
      <div class="meta">${visibleChildren.length} niños/as inscritos</div>
      <table>
        <thead><tr><th>#</th><th>Nombre</th><th>Apellidos</th><th>Edad</th><th>Familia</th><th>Contacto</th><th>Alergias</th><th>Días</th><th>Pagado</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload = () => window.print();</script>
      </body></html>`);
    w.document.close();
  }

  const nameQ = nameFilter.trim().toLowerCase();
  const sorter = makeSorter(sortMode);
  const visibleChildren = children.filter(c => {
    if (nameQ && !`${c.nombre} ${c.apellidos}`.toLowerCase().includes(nameQ)) return false;
    if (pagadoFilter === 'pagado' && !c.pagado) return false;
    if (pagadoFilter === 'pendiente' && c.pagado) return false;
    return true;
  }).sort(sorter);

  const sortedRoster = [...roster].sort(sorter);
  const presentCount = roster.filter(r => r.asistio).length;

  return (
    <>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 22, borderBottom: '1px solid var(--line-2)', paddingBottom: 14, flexWrap: 'wrap' }}>
        {[['roster', 'Pasar lista'], ['children', `Inscritos (${children.length})`], ['agenda', 'Agenda'], ['weeks', 'Semanas y plazas']].map(([id, label]) => (
          <button key={id} className={`filter-pill ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)} style={{ borderRadius: 8, padding: '8px 16px' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Pasar lista ── */}
      {tab === 'roster' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-icon" onClick={() => shiftDay(-1)} aria-label="Día anterior">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <input type="date" value={rosterDay} onChange={e => e.target.value && setRosterDay(e.target.value)}
              style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' }} />
            <button className="btn btn-icon" onClick={() => shiftDay(1)} aria-label="Día siguiente">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'capitalize' }}>{campFmtLong(rosterDay)}</span>
            {holidaySet.has(rosterDay) && (
              <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999, color: 'var(--orange)', background: 'color-mix(in oklab, var(--orange) 12%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--orange) 30%, transparent)' }}>
                Festivo — campamento cerrado
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal)' }}>{presentCount}/{roster.length} presentes</span>
              <button className="btn btn-sm btn-outline" onClick={printRoster} disabled={!roster.length}><I.Print /> Imprimir</button>
            </div>
          </div>

          {roster.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SortToggle value={sortMode} onChange={setSortMode} />
            </div>
          )}

          {rosterLoading && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
          {!rosterLoading && roster.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
              No hay niños apuntados a este día.
            </div>
          )}
          {!rosterLoading && roster.length > 0 && (
            <div className="camp-card-grid">
              {sortedRoster.map(row => (
                <CampRosterRow key={`${row.id}-${rosterDay}`} row={row} day={rosterDay} onSaved={onAttendanceSaved} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Inscritos ── */}
      {tab === 'children' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-sm btn-primary" onClick={() => setEditingChild({ ...emptyChild })}>
              <I.Plus /> Inscribir niño/a
            </button>
            <div className="search-input" style={{ flex: '1 1 200px', maxWidth: 280 }}>
              <I.Search />
              <input placeholder="Buscar por nombre..." value={nameFilter} onChange={e => setNameFilter(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['all', 'pagado', 'pendiente'].map(f => (
                <button key={f} className={`filter-pill ${pagadoFilter === f ? 'is-active' : ''}`} onClick={() => setPagadoFilter(f)}>
                  {{ all: 'Todos', pagado: 'Pagados', pendiente: 'Pendientes' }[f]}
                </button>
              ))}
            </div>
            <SortToggle value={sortMode} onChange={setSortMode} />
            <button className="btn btn-sm btn-outline" style={{ marginLeft: 'auto' }} onClick={printChildren} disabled={!visibleChildren.length}>
              <I.Print /> Imprimir
            </button>
          </div>

          {childrenLoading && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
          {!childrenLoading && children.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
              Todavía no hay niños inscritos en el campamento.
            </div>
          )}
          {!childrenLoading && children.length > 0 && visibleChildren.length === 0 && (
            <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Ningún inscrito coincide con el filtro.</p>
          )}
          <div className="camp-card-grid">
            {visibleChildren.map(c => (
              <div key={c.id}
                onClick={() => setEditingDays({ child: c, days: [...(c.days || [])] })}
                title="Ver / editar días de asistencia"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', display: 'grid', gap: 8, cursor: 'pointer', transition: 'border-color var(--tx-fast) ease, box-shadow var(--tx-fast) ease' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink-3)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)', lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {c.nombre} {c.apellidos}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                      {c.edad ? `${c.edad} años · ` : ''}{c.parentEmail ? 'Familia web' : 'Alta manual'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setEditingChild({ ...c, edad: c.edad || '', alergias: c.alergias || '', observaciones: c.observaciones || '', contacto: c.contacto || '', recogida: c.recogida || '' })} aria-label="Editar"><I.Edit /></button>
                    <button className="icon-btn danger" style={{ width: 28, height: 28 }} onClick={() => deleteChild(c.id)} aria-label="Eliminar"><I.Trash /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => patchChild(c.id, { pagado: !c.pagado })}
                    style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, cursor: 'pointer', border: '1px solid', borderColor: c.pagado ? 'color-mix(in oklab, var(--teal) 40%, transparent)' : 'color-mix(in oklab, var(--orange) 40%, transparent)', color: c.pagado ? 'var(--teal)' : 'var(--orange)', background: `color-mix(in oklab, ${c.pagado ? 'var(--teal)' : 'var(--orange)'} 12%, var(--bg-2))` }}>
                    {c.pagado ? '✓ Pagado' : 'Pendiente'}
                  </button>
                  <span style={{ background: 'var(--bg-3)', color: 'var(--ink-2)', fontWeight: 700, padding: '2px 8px', borderRadius: 999, fontSize: 11, border: '1px solid var(--line-2)' }}>
                    {(c.days || []).length} día{(c.days || []).length !== 1 ? 's' : ''}
                  </span>
                  {c.alergias && (
                    <span title={c.alergias} style={{ background: 'color-mix(in oklab, var(--orange) 14%, var(--bg-2))', color: 'var(--orange)', fontWeight: 800, padding: '2px 8px', borderRadius: 999, fontSize: 11, border: '1px solid color-mix(in oklab, var(--orange) 30%, transparent)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      ⚠ {c.alergias}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Agenda (quién viene cada día) ── */}
      {tab === 'agenda' && <CampAgenda weeks={weeks} children={children} />}

      {/* ── Semanas ── */}
      {tab === 'weeks' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <button className="btn btn-sm btn-primary" onClick={() => setEditingWeek({ label: '', startDate: '', endDate: '', capacity: 24, holidays: [] })}>
              <I.Plus /> Añadir semana
            </button>
          </div>
          {weeks.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
              Configura las semanas del campamento para que las familias puedan elegir días.
            </div>
          )}
          {weeks.map(w => {
            const totalSpots = w.days.reduce((s, d) => s + d.count, 0);
            return (
              <div key={w.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{w.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                      {w.startDate} → {w.endDate} · capacidad {w.capacity}/día · {totalSpots} plazas ocupadas en total
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="icon-btn" onClick={() => setEditingWeek({ id: w.id, label: w.label, startDate: w.startDate, endDate: w.endDate, capacity: w.capacity, holidays: [...(w.holidays || [])] })} aria-label="Editar"><I.Edit /></button>
                    <button className="icon-btn danger" onClick={() => deleteWeek(w.id)} aria-label="Eliminar"><I.Trash /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {w.days.map(({ day, count, holiday }) => {
                    const full = !holiday && w.capacity != null && count >= w.capacity;
                    return (
                      <div key={day} style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                        background: full ? 'color-mix(in oklab, var(--orange) 14%, var(--bg-2))' : holiday ? 'color-mix(in oklab, var(--orange) 7%, var(--bg-2))' : 'var(--bg-3)',
                        color: (full || holiday) ? 'var(--orange)' : 'var(--ink-2)',
                        border: `1px ${holiday ? 'dashed' : 'solid'} ${(full || holiday) ? 'color-mix(in oklab, var(--orange) 30%, transparent)' : 'var(--line-2)'}`,
                        textDecoration: holiday ? 'line-through' : 'none',
                      }}>
                        {day.slice(8)}/{day.slice(5, 7)} · {holiday ? 'Fiesta' : `${count}/${w.capacity}`}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: datos del niño (nuevo / editar) ── */}
      {editingChild && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setEditingChild(null); }}>
          <div style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>{editingChild.id ? 'Editar datos' : 'Inscribir niño/a'}</h3>
            <form onSubmit={submitChild} style={{ display: 'grid', gap: 14 }}>
              <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field"><label>Nombre</label><input value={editingChild.nombre} onChange={e => setEditingChild(c => ({ ...c, nombre: e.target.value }))} required /></div>
                <div className="field"><label>Apellidos</label><input value={editingChild.apellidos} onChange={e => setEditingChild(c => ({ ...c, apellidos: e.target.value }))} required /></div>
              </div>
              <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12 }}>
                <div className="field"><label>Edad</label><input type="number" min="2" max="17" value={editingChild.edad} onChange={e => setEditingChild(c => ({ ...c, edad: e.target.value }))} /></div>
                <div className="field"><label>Teléfono de contacto</label><input value={editingChild.contacto} onChange={e => setEditingChild(c => ({ ...c, contacto: e.target.value }))} placeholder="+34 600 000 000" /></div>
              </div>
              <div className="field"><label>Alergias / intolerancias</label><input value={editingChild.alergias} onChange={e => setEditingChild(c => ({ ...c, alergias: e.target.value }))} placeholder="Ej. frutos secos, lactosa..." /></div>
              <div className="field"><label>Personas autorizadas a recogerle</label><input value={editingChild.recogida} onChange={e => setEditingChild(c => ({ ...c, recogida: e.target.value }))} placeholder="Ej. madre, abuela Carmen..." /></div>
              <div className="field"><label>Observaciones</label><textarea rows={2} value={editingChild.observaciones} onChange={e => setEditingChild(c => ({ ...c, observaciones: e.target.value }))} style={{ fontFamily: 'inherit', fontSize: 14, padding: 12, background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)', resize: 'vertical' }} placeholder="Medicación, necesidades especiales, miedos..." /></div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!editingChild.fotosRrss} onChange={e => setEditingChild(c => ({ ...c, fotosRrss: e.target.checked }))} />
                  Autoriza fotos RRSS
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', color: 'var(--teal)', fontWeight: 700 }}>
                  <input type="checkbox" checked={!!editingChild.pagado} onChange={e => setEditingChild(c => ({ ...c, pagado: e.target.checked }))} style={{ accentColor: 'var(--teal)' }} />
                  Pagado
                </label>
              </div>
              {!editingChild.id && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Días de asistencia</div>
                  <CampDayPicker weeks={weeks} selected={editingChild.days} onChange={days => setEditingChild(c => ({ ...c, days }))} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditingChild(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={savingModal}>{savingModal ? 'Guardando...' : (editingChild.id ? 'Guardar cambios' : 'Inscribir')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: días del niño ── */}
      {editingDays && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setEditingDays(null); }}>
          <div style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>Días de {editingDays.child.nombre}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-3)' }}>{editingDays.days.length} día{editingDays.days.length !== 1 ? 's' : ''} seleccionado{editingDays.days.length !== 1 ? 's' : ''}</p>
            <CampDayPicker weeks={weeks} selected={editingDays.days} onChange={days => setEditingDays(d => ({ ...d, days }))} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <button type="button" className="btn btn-outline" onClick={() => setEditingDays(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={savingModal} onClick={submitDays}>{savingModal ? 'Guardando...' : 'Guardar días'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: semana ── */}
      {editingWeek && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setEditingWeek(null); }}>
          <div style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: 480, padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>{editingWeek.id ? 'Editar semana' : 'Nueva semana'}</h3>
            <form onSubmit={submitWeek} style={{ display: 'grid', gap: 14 }}>
              <div className="field"><label>Nombre</label><input value={editingWeek.label} onChange={e => setEditingWeek(w => ({ ...w, label: e.target.value }))} required placeholder="Ej. Semana 1 · Aventura y deportes" /></div>
              <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field"><label>Inicio</label><input type="date" value={editingWeek.startDate} onChange={e => setEditingWeek(w => ({ ...w, startDate: e.target.value }))} required /></div>
                <div className="field"><label>Fin</label><input type="date" value={editingWeek.endDate} onChange={e => setEditingWeek(w => ({ ...w, endDate: e.target.value }))} required /></div>
              </div>
              <div className="field"><label>Plazas por día</label><input type="number" min="1" max="200" value={editingWeek.capacity} onChange={e => setEditingWeek(w => ({ ...w, capacity: Number(e.target.value) }))} required /></div>
              {(() => {
                const daysInRange = weekdaysBetween(editingWeek.startDate, editingWeek.endDate);
                if (!daysInRange.length) {
                  return <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Elige las fechas de inicio y fin para poder marcar días festivos.</p>;
                }
                const hols = new Set((editingWeek.holidays || []).filter(h => daysInRange.includes(h)));
                return (
                  <div className="field">
                    <label>Días festivos — haz clic para marcar (se cerrará el campamento ese día)</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0' }}>
                      {daysInRange.map(day => {
                        const isHol = hols.has(day);
                        const d = new Date(day + 'T12:00:00');
                        const dow = ['D', 'L', 'M', 'X', 'J', 'V', 'S'][d.getDay()];
                        return (
                          <button key={day} type="button"
                            onClick={() => setEditingWeek(w => {
                              const next = new Set((w.holidays || []).filter(h => daysInRange.includes(h)));
                              next.has(day) ? next.delete(day) : next.add(day);
                              return { ...w, holidays: [...next].sort() };
                            })}
                            style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                              minWidth: 48, padding: '7px 10px', borderRadius: 10,
                              border: `1.5px ${isHol ? 'dashed' : 'solid'} ${isHol ? 'var(--orange)' : 'var(--line)'}`,
                              background: isHol ? 'color-mix(in oklab, var(--orange) 10%, var(--bg-2))' : 'var(--bg-2)',
                              color: isHol ? 'var(--orange)' : 'var(--ink)',
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}>
                            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', opacity: .8 }}>{dow}</span>
                            <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1, textDecoration: isHol ? 'line-through' : 'none' }}>{d.getDate()}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, opacity: .8 }}>{isHol ? 'Fiesta' : 'Abierto'}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditingWeek(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={savingModal}>{savingModal ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminApp({ user, onLogout, subroute = "overview" }) {
  const { go } = useRouter();
  const [view, setView] = useState(subroute);
  useEffect(() => { setView(subroute); }, [subroute]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  function navTo(id) { setView(id); setSidebarOpen(false); }

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [notification, setNotification] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // 'new-student' | 'edit-student' | 'new-receipt' | 'new-post' | 'edit-post' | 'new-group' | 'edit-group' | 'new-class' | 'add-activity-or-aula' | 'new-aula' | 'new-activity'
  const [editingItem, setEditingItem] = useState(null);

  const [studentsList, setStudentsList] = useState([]);
  const [classSlots, setClassSlots] = useState([]);
  const [activities, setActivities] = useState([]);
  const [aulas, setAulas] = useState([]);
  const [instructores, setInstructores] = useState([]);
  const [actById, setActById] = useState({});

  useEffect(() => {
    fetch('/api/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setStudentsList)
      .catch(() => { });
    fetch('/api/classes', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setClassSlots(data);
      })
      .catch(() => { });
    fetch('/api/activities', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setActivities(data);
        setActById(Object.fromEntries(data.map(a => [a.id, a])));
      })
      .catch(() => { });
    fetch('/api/aulas', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setAulas)
      .catch(() => { });
    fetch('/api/instructores', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setInstructores)
      .catch(() => { });
  }, [refreshTrigger]);

  const showToast = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  // Modals Submit Handlers
  const handleUserSubmit = async (e) => {
    e.preventDefault();
    const isEdit = activeModal === 'edit-student';
    const url = isEdit ? `/api/users/${editingItem.id}` : '/api/users';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem),
        credentials: 'include'
      });
      if (res.ok) {
        showToast(isEdit ? "Alumno modificado con éxito." : "Alumno creado con éxito (contraseña por defecto: aim123456).");
        setRefreshTrigger(p => p + 1);
        setActiveModal(null);
      } else {
        const err = await res.json();
        alert(err.error || "Ocurrió un error.");
      }
    } catch (err) {
      alert("Error al guardar alumno.");
    }
  };

  const handleUserDelete = async () => {
    if (!window.confirm("¿Seguro que deseas eliminar este usuario de la base de datos de forma permanente?")) return;
    try {
      const res = await fetch(`/api/users/${editingItem.id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        showToast("Alumno eliminado.");
        setRefreshTrigger(p => p + 1);
        setActiveModal(null);
      }
    } catch (err) {
      alert("Error al eliminar alumno.");
    }
  };

  const handleReceiptSubmit = async (e) => {
    e.preventDefault();
    const id = editingItem.id || Math.random().toString(36).substring(2, 11);
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editingItem, id }),
        credentials: 'include'
      });
      if (res.ok) {
        showToast("Recibo guardado correctamente.");
        setRefreshTrigger(p => p + 1);
        setActiveModal(null);
      }
    } catch (err) {
      alert("Error al guardar recibo.");
    }
  };

  const handlePostSubmit = async (e) => {
    e.preventDefault();
    const isEdit = activeModal === 'edit-post';
    const url = isEdit ? `/api/admin/posts/${editingItem.id}` : '/api/admin/posts';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem),
        credentials: 'include'
      });
      if (res.ok) {
        showToast(isEdit ? "Noticia modificada." : "Noticia publicada con éxito.");
        setRefreshTrigger(p => p + 1);
        setActiveModal(null);
      } else {
        const err = await res.json();
        alert(err.error || "Error al guardar noticia.");
      }
    } catch (err) {
      alert("Error al conectar con la base de datos.");
    }
  };

  const handleGroupSubmit = async (e) => {
    e.preventDefault();
    const isEdit = activeModal === 'edit-group';
    const url = isEdit ? `/api/admin/groups/${editingItem.id}` : '/api/admin/groups';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem),
        credentials: 'include'
      });
      if (res.ok) {
        showToast(isEdit ? "Grupo deportivo actualizado." : "Grupo deportivo creado con éxito.");
        setRefreshTrigger(p => p + 1);
        setActiveModal(null);
      }
    } catch (err) {
      alert("Error al guardar grupo.");
    }
  };

  const handleClassSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem),
        credentials: 'include'
      });
      if (res.ok) {
        showToast("Clase programada con éxito.");
        setRefreshTrigger(p => p + 1);
        setActiveModal(null);
      } else {
        const err = await res.json();
        alert(err.error || "Error al programar la clase.");
      }
    } catch (err) {
      alert("Error de conexión al guardar la clase.");
    }
  };

  const adminInitials = `${user?.firstName?.[0] || ""}${user?.lastName?.[0] || ""}`.toUpperCase() || "A";
  const adminName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "Admin";

  const sections = [
    {
      heading: "Gestión", items: [
        { id: "overview", label: "Resumen", icon: <I.Dashboard /> },
        { id: "students", label: "Alumnos", icon: <I.Users /> },
        { id: "billing", label: "Facturación", icon: <I.CreditCard /> },
        { id: "payments", label: "Gastos", icon: <I.Wallet /> },
        { id: "classes", label: "Clases y horarios", icon: <I.Calendar /> },
        { id: "camp", label: "Campamento", icon: <I.Sun /> },
        { id: "events", label: "Eventos", icon: <I.Star /> },
        { id: "news", label: "Noticias / Foro", icon: <I.Newspaper /> },
      ]
    },
    {
      heading: "Club", items: [
        { id: "groups", label: "Grupos", icon: <I.Trophy /> },
        { id: "instructors", label: "Instructores", icon: <I.Users /> },
        { id: "settings", label: "Ajustes", icon: <I.Settings /> },
        { id: "support", label: "Soporte", icon: <I.Bell /> },
      ]
    },
  ];

  async function handleLogout() {
    if (onLogout) await onLogout();
    else go("/");
  }

  return (
    <main style={{ paddingTop: 0 }}>
      <div className="admin-layout">
        {sidebarOpen && <div className="admin-overlay" onClick={() => setSidebarOpen(false)} />}
        <aside className={`admin-side${sidebarOpen ? ' is-open' : ''}`}>
          <div className="brand">
            <AimLogo size="sm" />
            <span className="role">Panel admin</span>
          </div>

          {sections.map((s, i) => (
            <div key={i} className="admin-nav">
              <div className="heading">{s.heading}</div>
              {s.items.map(it => (
                <button key={it.id} className={view === it.id ? "is-active" : ""} onClick={() => navTo(it.id)}>
                  {it.icon}
                  <span>{it.label}</span>
                </button>
              ))}
            </div>
          ))}

          <div className="me">
            <div className="avatar" style={{ width: 36, height: 36, fontSize: 13 }}>{adminInitials}</div>
            <div>
              <div className="name">{adminName}</div>
              <div className="role-tag">{user?.isSuperAdmin ? "Superadmin" : "Admin"}</div>
            </div>
          </div>

          <button onClick={() => go("/")} style={{
            marginTop: 16, width: "100%", padding: "10px 12px",
            background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.9)",
            border: 0, borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
            fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
            transition: "background 0.2s"
          }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,.16)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,.1)"}
          >
            <I.Globe width={16} height={16} /> Volver a la Web
          </button>

          <button onClick={handleLogout} style={{
            marginTop: 8, width: "100%", padding: "10px 12px",
            background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.7)",
            border: 0, borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
            fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
          }}>
            <I.LogOut /> Cerrar sesión
          </button>
        </aside>

        <div className="admin-main">
          <div className="admin-topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="admin-hamburger btn btn-icon" onClick={() => setSidebarOpen(o => !o)} aria-label="Menú">
                <I.Menu />
              </button>
              <div>
                <div className="crumb">Admin · <b>{sectionLabel(view)}</b></div>
                <h1>{sectionLabel(view)}</h1>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="btn btn-icon"><I.Bell /></button>
              <button className="btn btn-icon" onClick={() => alert("Función de búsqueda global disponible próximamente.")}><I.Search /></button>
              {!['classes', 'events', 'support', 'camp', 'billing'].includes(view) && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (view === 'students') {
                      setEditingItem({ firstName: '', lastName: '', email: '', belt: '', isSuperAdmin: false });
                      setActiveModal('new-student');
                    } else if (view === 'payments') {
                      setEditingItem({ date: new Date().toISOString().split('T')[0], amount: 0, paymentMethod: 'Domiciliación SEPA', company: '', invoiceLink: '' });
                      setActiveModal('new-receipt');
                    } else if (view === 'news') {
                      setEditingItem({ title: '', slug: '', excerpt: '', content: '', coverImageUrl: '', category: 'general', status: 'draft' });
                      setActiveModal('new-post');
                    } else if (view === 'groups') {
                      setEditingItem({ name: '', activity: 'taekwondo', studentIds: [] });
                      setActiveModal('new-group');
                    }
                  }}
                  disabled={['overview', 'settings'].includes(view)}
                >
                  <I.Plus /> Nuevo
                </button>
              )}
            </div>
          </div>

          {view === "overview" && <AdminOverview setView={setView} refreshTrigger={refreshTrigger} showToast={showToast} />}
          {view === "students" && <AdminStudents refreshTrigger={refreshTrigger} onEditUser={(u) => { setEditingItem(u); setActiveModal('edit-student'); }} />}
          {view === "classes" && (
            <AdminClasses
              classSlots={classSlots}
              setClassSlots={setClassSlots}
              activities={activities}
              classrooms={aulas}
              actById={actById}
              showToast={showToast}
              onAddClassClick={() => {
                const defaultRoom = aulas[0]?.name || '';
                const defaultMonitor = instructores[0]?.name || '';
                const defaultAct = activities[0]?.id || 'taekwondo';
                setEditingItem({ d: 0, s: 17, h: 1, act: defaultAct, title: '', room: defaultRoom, students: '0/15', monitor: defaultMonitor });
                setActiveModal('new-class');
              }}
              onAddActivityOrAulaClick={() => {
                setEditingItem({ name: '' });
                setActiveModal('add-activity-or-aula');
              }}
            />
          )}
          {view === "payments" && <AdminPayments refreshTrigger={refreshTrigger} />}
          {view === "news" && <AdminNews refreshTrigger={refreshTrigger} onEditPost={(p) => { setEditingItem({ ...p, coverImageUrl: p.cover_image_url }); setActiveModal('edit-post'); }} />}
          {view === "events" && <AdminEvents showToast={showToast} />}
          {view === "camp" && <AdminCamp showToast={showToast} />}
          {view === "billing" && <AdminBilling showToast={showToast} />}
          {view === "groups" && <AdminGroups refreshTrigger={refreshTrigger} onEditGroup={(g) => { setEditingItem(g); setActiveModal('edit-group'); }} />}
          {view === "instructors" && <AdminInstructores refreshTrigger={refreshTrigger} showToast={showToast} />}
          {view === "settings" && <AdminSettings />}
          {view === "support" && <AdminSupport user={user} />}
        </div>
      </div>

      {/* --- FLOATING TOAST NOTIFICATION --- */}
      {notification && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: 'var(--ink)', color: 'white',
          padding: '12px 24px', borderRadius: 12,
          boxShadow: 'var(--shadow)', zIndex: 1100,
          fontWeight: 700, fontSize: 14,
        }}>
          {notification}
        </div>
      )}

      {/* --- MODAL NUEVO / EDITAR ALUMNO --- */}
      {(activeModal === 'new-student' || activeModal === 'edit-student') && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
          display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20
        }}>
          <form onSubmit={handleUserSubmit} style={{
            backgroundColor: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 24,
            width: '100%', maxWidth: 500, padding: 32, display: 'grid', gap: 16
          }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>
              {activeModal === 'edit-student' ? 'Editar Alumno' : 'Registrar Nuevo Alumno'}
            </h3>

            <div className="field">
              <label>Nombre</label>
              <input value={editingItem.firstName || ''} onChange={e => setEditingItem({ ...editingItem, firstName: e.target.value })} required />
            </div>

            <div className="field">
              <label>Apellidos</label>
              <input value={editingItem.lastName || ''} onChange={e => setEditingItem({ ...editingItem, lastName: e.target.value })} required />
            </div>

            <div className="field">
              <label>Correo Electrónico</label>
              <input type="email" value={editingItem.email || ''} onChange={e => setEditingItem({ ...editingItem, email: e.target.value })} required />
            </div>

            <div className="field">
              <label>Cinturón (Si aplica)</label>
              <input value={editingItem.belt || ''} onChange={e => setEditingItem({ ...editingItem, belt: e.target.value })} placeholder="Ej. Blanco / Amarillo / N/A" />
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
              <input type="checkbox" checked={!!editingItem.isSuperAdmin} onChange={e => setEditingItem({ ...editingItem, isSuperAdmin: e.target.checked })} style={{ width: 18, height: 18 }} />
              ¿Tiene permisos de Administrador?
            </label>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              {activeModal === 'edit-student' && (
                <button type="button" className="btn btn-outline" style={{ border: '1px solid red', color: 'red', marginRight: 'auto' }} onClick={handleUserDelete}>
                  Eliminar
                </button>
              )}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary btn-sm">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL NUEVO RECIBO --- */}
      {activeModal === 'new-receipt' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
          display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20
        }}>
          <form onSubmit={handleReceiptSubmit} style={{
            backgroundColor: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 24,
            width: '100%', maxWidth: 500, padding: 32, display: 'grid', gap: 16
          }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Emitir Nuevo Recibo</h3>

            <div className="field">
              <label>Empresa / Concepto</label>
              <input value={editingItem.company || ''} onChange={e => setEditingItem({ ...editingItem, company: e.target.value })} required placeholder="Ej. Cuota mensual de Taekwondo" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Importe (€)</label>
                <input type="number" min="0" step="0.01" value={editingItem.amount || 0} onChange={e => setEditingItem({ ...editingItem, amount: parseFloat(e.target.value) })} required />
              </div>
              <div className="field">
                <label>Fecha de cobro</label>
                <input type="date" value={editingItem.date || ''} onChange={e => setEditingItem({ ...editingItem, date: e.target.value })} required />
              </div>
            </div>

            <div className="field">
              <label>Método de Pago</label>
              <select value={editingItem.paymentMethod} onChange={e => setEditingItem({ ...editingItem, paymentMethod: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
                <option value="Domiciliación SEPA">Domiciliación SEPA</option>
                <option value="Tarjeta de crédito">Tarjeta de crédito</option>
                <option value="Transferencia bancaria">Transferencia bancaria</option>
                <option value="Efectivo">Efectivo</option>
              </select>
            </div>

            <div className="field">
              <label>Enlace PDF de Factura (Opcional)</label>
              <input value={editingItem.invoiceLink || ''} onChange={e => setEditingItem({ ...editingItem, invoiceLink: e.target.value })} placeholder="Ej. https://url-al-pdf.com/factura.pdf" />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary btn-sm">Emitir Recibo</button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL NUEVO / EDITAR POST (NEWS) --- */}
      {(activeModal === 'new-post' || activeModal === 'edit-post') && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
          display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20
        }}>
          <form onSubmit={handlePostSubmit} style={{
            backgroundColor: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 24,
            width: '100%', maxWidth: 650, padding: 32, display: 'grid', gap: 14,
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>
              {activeModal === 'edit-post' ? 'Editar Entrada de Noticias' : 'Nueva Publicación de Noticias'}
            </h3>

            <div className="field">
              <label>Título de la entrada</label>
              <input value={editingItem.title || ''} onChange={e => setEditingItem({ ...editingItem, title: e.target.value })} required placeholder="Escribe el titular aquí..." />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12 }}>
              <div className="field">
                <label>Categoría</label>
                <select value={editingItem.category} onChange={e => setEditingItem({ ...editingItem, category: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
                  <option value="general">General</option>
                  <option value="club">Noticias del Club</option>
                  <option value="taekwondo">Taekwondo</option>
                  <option value="ballet">Ballet</option>
                  <option value="ingles">Inglés</option>
                  <option value="robotica">Robótica</option>
                  <option value="competicion">Competición</option>
                </select>
              </div>
              <div className="field">
                <label>Estado</label>
                <select value={editingItem.status} onChange={e => setEditingItem({ ...editingItem, status: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
                  <option value="draft">Borrador (Oculto)</option>
                  <option value="published">Publicado (Visible en la web)</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label>URL Imagen de Portada</label>
              <input value={editingItem.coverImageUrl || ''} onChange={e => setEditingItem({ ...editingItem, coverImageUrl: e.target.value })} placeholder="Ej. https://miservidor.com/imagen.jpg" />
            </div>

            <div className="field">
              <label>Extracto de Introducción (Lede)</label>
              <input value={editingItem.excerpt || ''} onChange={e => setEditingItem({ ...editingItem, excerpt: e.target.value })} placeholder="Breve resumen de 1-2 líneas para la tarjeta de noticias..." />
            </div>

            <div className="field">
              <label>Contenido del Post (Soporta Markdown)</label>
              <textarea value={editingItem.content || ''} onChange={e => setEditingItem({ ...editingItem, content: e.target.value })} required style={{ width: '100%', minHeight: 180, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', fontFamily: 'inherit', resize: 'vertical' }} placeholder="Escribe el cuerpo de la noticia en formato Markdown..." />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary btn-sm">Publicar</button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL NUEVO / EDITAR GRUPO --- */}
      {(activeModal === 'new-group' || activeModal === 'edit-group') && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
          display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20
        }}>
          <form onSubmit={handleGroupSubmit} style={{
            backgroundColor: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 24,
            width: '100%', maxWidth: 500, padding: 32, display: 'grid', gap: 16,
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>
              {activeModal === 'edit-group' ? 'Editar Grupo' : 'Crear Nuevo Grupo'}
            </h3>

            <div className="field">
              <label>Nombre del Grupo</label>
              <input value={editingItem.name || ''} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} required placeholder="Ej. Taekwondo Juveniles Tatami" />
            </div>

            <div className="field">
              <label>Actividad Deportiva</label>
              <select value={editingItem.activity} onChange={e => setEditingItem({ ...editingItem, activity: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
                {ACTIVITIES.slice(0, 8).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div className="field">
              <label style={{ marginBottom: 8, display: 'block' }}>Asignar alumnos al grupo ({editingItem.studentIds?.length || 0} seleccionados)</label>
              <div style={{
                maxHeight: 180, overflowY: 'auto', border: '1px solid var(--line)',
                borderRadius: 10, padding: 10, display: 'grid', gap: 8, background: 'var(--bg-3)'
              }}>
                {studentsList.map(st => {
                  const isChecked = editingItem.studentIds?.includes(st.id);
                  return (
                    <label key={st.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        style={{ width: 16, height: 16 }}
                        onChange={e => {
                          const checked = e.target.checked;
                          const currentIds = editingItem.studentIds || [];
                          const updated = checked
                            ? [...currentIds, st.id]
                            : currentIds.filter(id => id !== st.id);
                          setEditingItem({ ...editingItem, studentIds: updated });
                        }}
                      />
                      {st.firstName} {st.lastName} ({st.email})
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary btn-sm">Guardar Grupo</button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL NUEVA CLASE --- */}
      {activeModal === 'new-class' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
          display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20
        }}>
          <form onSubmit={handleClassSubmit} style={{
            backgroundColor: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 24,
            width: '100%', maxWidth: 450, padding: 32, display: 'grid', gap: 14
          }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Nueva clase programada</h3>

            <div className="field">
              <label>Título del grupo</label>
              <input value={editingItem.title || ''} onChange={e => setEditingItem({ ...editingItem, title: e.target.value })} required placeholder="Ej. Taekwondo Infantiles" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Actividad</label>
                <select value={editingItem.act || 'taekwondo'} onChange={e => setEditingItem({ ...editingItem, act: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
                  {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Sala / Aula</label>
                <select value={editingItem.room || ''} onChange={e => setEditingItem({ ...editingItem, room: e.target.value })} required style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
                  {aulas.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Día de la semana</label>
                <select value={editingItem.d || 0} onChange={e => setEditingItem({ ...editingItem, d: parseInt(e.target.value) })} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
                  {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day, idx) => <option key={idx} value={idx}>{day}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Hora de inicio</label>
                <div style={{
                  maxHeight: '120px',
                  overflowY: 'auto',
                  border: '1px solid var(--line)',
                  borderRadius: '10px',
                  background: 'var(--bg-3)',
                  display: 'grid',
                  gap: '4px',
                  padding: '6px',
                  scrollbarWidth: 'thin'
                }}>
                  {(() => {
                    const timeSlots = [];
                    for (let h = 8; h <= 21; h++) {
                      timeSlots.push({ val: h, label: `${String(h).padStart(2, '0')}:00` });
                      timeSlots.push({ val: h + 0.5, label: `${String(h).padStart(2, '0')}:30` });
                    }
                    timeSlots.push({ val: 22, label: '22:00' });
                    return timeSlots.map(slot => {
                      const isSelected = editingItem.s === slot.val;
                      return (
                        <button
                          type="button"
                          key={slot.label}
                          onClick={() => setEditingItem({ ...editingItem, s: slot.val })}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: 'none',
                            background: isSelected ? 'var(--purple)' : 'transparent',
                            color: isSelected ? 'white' : 'var(--ink)',
                            cursor: 'pointer',
                            fontWeight: isSelected ? '800' : 'normal',
                            textAlign: 'center',
                            fontSize: '13px',
                            transition: 'background 0.2s, color 0.2s'
                          }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--line)'; }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                        >
                          {slot.label}
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Duración (Horas)</label>
                <input type="number" step="0.5" min="0.5" max="4" value={editingItem.h || 1} onChange={e => setEditingItem({ ...editingItem, h: parseFloat(e.target.value) })} required />
              </div>
              <div className="field">
                <label>Monitor / Profesor</label>
                <select value={editingItem.monitor || ''} onChange={e => setEditingItem({ ...editingItem, monitor: e.target.value })} required style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
                  {instructores.map(ins => <option key={ins.id} value={ins.name}>{ins.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary btn-sm">Guardar clase</button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL AÑADIR AULA O CATEGORÍA --- */}
      {activeModal === 'add-activity-or-aula' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
          display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20
        }}>
          <div style={{
            backgroundColor: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 24,
            width: '100%', maxWidth: 450, padding: 32, display: 'grid', gap: 20
          }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)', textAlign: 'center' }}>¿Qué deseas crear?</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setEditingItem({ name: '' });
                  setActiveModal('new-aula');
                }}
                style={{ padding: '20px 10px', height: 'auto', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}
              >
                <I.Dashboard style={{ width: 24, height: 24 }} />
                <span>Nueva Aula / Sala</span>
              </button>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setEditingItem({ name: '', color: '#21B668' });
                  setActiveModal('new-activity');
                }}
                style={{ padding: '20px 10px', height: 'auto', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}
              >
                <I.Trophy style={{ width: 24, height: 24 }} />
                <span>Nueva Categoría</span>
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn btn-outline btn-sm" onClick={() => setActiveModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL NUEVA AULA --- */}
      {activeModal === 'new-aula' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
          display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20
        }}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await fetch('/api/admin/aulas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingItem),
                credentials: 'include'
              });
              if (res.ok) {
                showToast("Aula creada con éxito.");
                setRefreshTrigger(p => p + 1);
                setActiveModal(null);
              } else {
                const err = await res.json();
                alert(err.error || "Error al crear aula.");
              }
            } catch (err) {
              alert("Error de conexión.");
            }
          }} style={{
            backgroundColor: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 24,
            width: '100%', maxWidth: 400, padding: 32, display: 'grid', gap: 16
          }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Crear Nueva Aula</h3>
            <div className="field">
              <label>Nombre del Aula / Sala</label>
              <input value={editingItem.name || ''} onChange={e => setEditingItem({ name: e.target.value })} required placeholder="Ej. Sala 7 o Tatami 2" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveModal('add-activity-or-aula')}>Atrás</button>
              <button type="submit" className="btn btn-primary btn-sm">Crear Aula</button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL NUEVA ACTIVIDAD / CATEGORÍA --- */}
      {activeModal === 'new-activity' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
          display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20
        }}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await fetch('/api/admin/activities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingItem),
                credentials: 'include'
              });
              if (res.ok) {
                showToast("Categoría creada con éxito.");
                setRefreshTrigger(p => p + 1);
                setActiveModal(null);
              } else {
                const err = await res.json();
                alert(err.error || "Error al crear categoría.");
              }
            } catch (err) {
              alert("Error de conexión.");
            }
          }} style={{
            backgroundColor: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 24,
            width: '100%', maxWidth: 400, padding: 32, display: 'grid', gap: 16
          }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Crear Nueva Categoría</h3>
            <div className="field">
              <label>Nombre de la Categoría</label>
              <input value={editingItem.name || ''} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} required placeholder="Ej. Kick Boxing o Yoga" />
            </div>
            <div className="field">
              <label>Color representativo</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="color" value={editingItem.color || '#21B668'} onChange={e => setEditingItem({ ...editingItem, color: e.target.value })} style={{ border: 0, padding: 0, width: 44, height: 44, borderRadius: 8, cursor: 'pointer', background: 'none' }} />
                <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>{editingItem.color || '#21B668'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveModal('add-activity-or-aula')}>Atrás</button>
              <button type="submit" className="btn btn-primary btn-sm">Crear Categoría</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
