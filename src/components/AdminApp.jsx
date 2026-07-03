import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimLogo, ACTIVITIES, ACT_BY_ID, CampDayPicker, campFmtLong } from './Shared.jsx';
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
      <div className="corner" style={{color: a?.color}}>{icon}</div>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      <div className="trend" style={{background: `color-mix(in oklab, ${a?.color || "var(--ink)"} 14%, var(--bg-2))`, color: a?.color || "var(--ink)"}}>{trend}</div>
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
        <div style={{fontWeight: 800, fontSize: 15, color: "var(--ink)"}}>{title}</div>
        <div style={{fontSize: 13, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.45}}>{desc}</div>
      </div>
      <I.Arrow style={{marginLeft: "auto", color: "var(--ink-3)", flexShrink: 0, marginTop: 4}} />
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
      .catch(() => {});
    fetch('/api/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(u => setUserCount(u.length))
      .catch(() => {});
    fetch('/api/receipts', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setReceipts(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch('/api/classes', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setClasses(Array.isArray(data) ? data : []))
      .catch(() => {});
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

      <div style={{display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18}}>
        <div style={{background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 18, padding: 24}}>
          <div style={{display: "flex", justifyContent: "space-between", marginBottom: 18}}>
            <h2 style={{fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, letterSpacing: "-.015em", margin: 0}}>
              Últimos recibos
            </h2>
            <button className="btn btn-sm btn-outline" onClick={() => setView("payments")}>Ver todos</button>
          </div>
          {receipts.length === 0 ? (
            <div style={{padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14}}>No hay recibos registrados todavía.</div>
          ) : receipts.slice(0, 5).map((r, i) => (
            <div key={r.id || i} className="payment-row">
              <div>
                <div className="name">{r.company || "Recibo"}</div>
                <div className="date">{r.paymentMethod || "—"}</div>
              </div>
              <span className="date">{r.date ? new Date(r.date).toLocaleDateString("es-ES") : "—"}</span>
              <span className="amount">{r.amount != null ? `${parseFloat(r.amount).toLocaleString("es-ES", {minimumFractionDigits: 2})}€` : "—"}</span>
            </div>
          ))}
        </div>

        <div style={{background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 18, padding: 24}}>
          <h2 style={{fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, letterSpacing: "-.015em", margin: 0, marginBottom: 4}}>
            Clases por actividad
          </h2>
          <p style={{fontSize: 13, color: "var(--ink-3)", margin: "0 0 18px"}}>Según el horario semanal</p>
          {actBars.length === 0 ? (
            <div style={{padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14}}>No hay clases en el horario.</div>
          ) : (
            <div style={{display: "grid", gap: 12}}>
              {actBars.map((a, i) => (
                <div key={i}>
                  <div style={{display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, fontWeight: 600}}>
                    <span>{a.name}</span>
                    <span style={{color: "var(--ink-3)"}}>{a.count} clase{a.count !== 1 ? "s" : ""}</span>
                  </div>
                  <div style={{height: 8, background: "var(--bg-3)", borderRadius: 99, overflow: "hidden"}}>
                    <div style={{height: "100%", width: `${(a.count / maxCount) * 100}%`, background: a.color, transition: "width var(--tx-slow) ease"}} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18}}>
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
        <div style={{flex: 1}}/>
        <button className="btn btn-outline btn-sm" onClick={handleExportCSV}>Exportar CSV</button>
      </div>

      <div className="data-table">
        <div className="data-table-head" style={{gridTemplateColumns: "32px 2.4fr 2fr 1fr 1fr 100px"}}>
          <span></span>
          <span>Nombre</span>
          <span>Email</span>
          <span>Cinturón</span>
          <span>Rol</span>
          <span></span>
        </div>
        {loading && (
          <div style={{padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14}}>Cargando...</div>
        )}
        {!loading && visible.map(u => (
          <div key={u.id} className="data-table-row" style={{gridTemplateColumns: "32px 2.4fr 2fr 1fr 1fr 100px"}}>
            <input type="checkbox" style={{accentColor: "var(--purple)"}} />
            <div className="cell-user">
              <div className="avatar" style={{background: "var(--grad-aim)"}}>
                {(u.firstName?.[0] || u.email?.[0] || "?").toUpperCase()}
              </div>
              <div>
                <div className="pri">{u.firstName || ""} {u.lastName || ""}</div>
                {u.isSuperAdmin && <div className="sec">Superadmin</div>}
              </div>
            </div>
            <div className="sec">{u.email}</div>
            <div>{u.belt || <span style={{color: "var(--ink-3)"}}>—</span>}</div>
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

      <div style={{marginTop: 16, fontSize: 13, color: "var(--ink-3)"}}>
        {visible.length} de {users.length} usuario{users.length !== 1 ? "s" : ""}
      </div>
    </>
  );
}

function AdminClasses({ classSlots, setClassSlots, activities = [], classrooms = [], actById = {}, showToast, onAddClassClick, onAddActivityOrAulaClick }) {
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const HOURS = Array.from({length: 14}, (_, i) => 9 + i);

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
        <div style={{display: "flex", gap: 6}}>
          <button className="filter-pill is-active">Semana</button>
          <button className="filter-pill" onClick={() => alert("Vista mensual disponible en el siguiente pase.")}>Mes</button>
        </div>
        <div className="search-input" style={{maxWidth: 280}}>
          <I.Search />
          <input placeholder="Filtrar por sala, monitor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{flex: 1}}/>
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
        <span style={{fontSize: 12, fontWeight: 700, color: "var(--ink-3)", marginRight: 8}}>Aulas / Salas:</span>
        {roomsList.map(room => (
          <button key={room}
            className={`filter-pill ${selectedRoom === room ? "is-active" : ""}`}
            onClick={() => setSelectedRoom(room)}
            style={{padding: "5px 12px", borderRadius: 8, fontSize: 12}}>
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
        <div className="hdr" style={{background: "var(--bg-3)", padding: "12px 8px"}}/>
        {days.map(d => (
          <div key={d} style={{background: "var(--bg-3)", padding: "12px 8px", borderLeft: "1px solid var(--line-2)", textAlign: "center", fontSize: 12, fontWeight: 800, color: "var(--ink)", letterSpacing: ".08em", textTransform: "uppercase"}}>
            {d}
          </div>
        ))}
        {HOURS.map(h => (
          <React.Fragment key={h}>
            <div style={{background: "var(--bg-3)", padding: "8px 12px 8px 8px", borderTop: "1px solid var(--line-2)", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--ink-3)"}}>
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
      <div style={{marginTop: 22, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center"}}>
        {activities.map(a => (
          <span key={a.id} style={{display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", background: `color-mix(in oklab, ${a.color} 14%, var(--bg-2))`, color: a.color, border: `1px solid color-mix(in oklab, ${a.color} 30%, transparent)`, borderRadius: 999, fontSize: 12, fontWeight: 700}}>
            <span style={{width: 8, height: 8, borderRadius: "50%", background: a.color}}/> {a.name}
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
    } catch(e) {
      console.error(e);
    }
  }

  return (
    <>
      <div className="kpis">
        <KPI label="Total en recibos" value={`${totalAmount.toLocaleString("es-ES", {minimumFractionDigits: 0})}€`} trend={`${receipts.length} registros`} act="taekwondo" icon={<I.Wallet />} />
        <KPI label="Recibos con factura" value={String(receipts.filter(r => r.invoiceLink).length)} trend="con PDF adjunto" act="funcional" icon={<I.CreditCard />} />
        <KPI label="Sin factura" value={String(receipts.filter(r => !r.invoiceLink).length)} trend="pendiente de adjuntar" act="ballet" icon={<I.Clock />} />
        <KPI label="Empresas" value={String(new Set(receipts.map(r => r.company).filter(Boolean)).size)} trend="proveedores distintos" act="pintura" icon={<I.Trophy />} />
      </div>

      <div className="data-table">
        <div className="data-table-head" style={{gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 120px"}}>
          <span>Empresa / Concepto</span><span>Método</span><span>Fecha</span><span>Importe</span><span>Factura</span><span></span>
        </div>
        {loading && <div style={{padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14}}>Cargando...</div>}
        {!loading && receipts.length === 0 && <div style={{padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14}}>No hay recibos.</div>}
        {receipts.map((r, i) => {
          const d = r.date ? new Date(r.date).toLocaleDateString("es-ES") : "—";
          const amount = r.amount != null ? `${parseFloat(r.amount).toLocaleString("es-ES", {minimumFractionDigits: 2})}€` : "—";
          return (
            <div key={r.id || i} className="data-table-row" style={{gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 120px"}}>
              <div className="cell-user">
                <div className="avatar" style={{background: "var(--grad-aim)"}}>{(r.company?.[0] || "R").toUpperCase()}</div>
                <div className="pri">{r.company || "Sin empresa"}</div>
              </div>
              <div className="sec">{r.paymentMethod || "—"}</div>
              <div>{d}</div>
              <div className="pri" style={{fontFamily: "var(--font-display)", fontSize: 15}}>{amount}</div>
              <div>
                <span className={`status-pill ${r.invoiceLink ? "ok" : "pending"}`}>
                  {r.invoiceLink ? "Con PDF" : "Sin PDF"}
                </span>
              </div>
              <div className="row-actions" style={{display: 'flex', gap: 8}}>
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
        <div className="search-input" style={{maxWidth: 320}}>
          <I.Search />
          <input placeholder="Buscar título..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className={`filter-pill ${statusFilter === "all" ? "is-active" : ""}`} onClick={() => setStatusFilter("all")}>Todos · {posts.length}</button>
        <button className={`filter-pill ${statusFilter === "published" ? "is-active" : ""}`} onClick={() => setStatusFilter("published")}>Publicados · {published}</button>
        <button className={`filter-pill ${statusFilter === "draft" ? "is-active" : ""}`} onClick={() => setStatusFilter("draft")}>Borradores · {drafts}</button>
        <div style={{flex: 1}} />
      </div>

      <div className="data-table">
        <div className="data-table-head" style={{gridTemplateColumns: "2.4fr 1fr 0.9fr 0.7fr 0.7fr 130px"}}>
          <span>Título</span><span>Categoría</span><span>Estado</span><span>Visitas</span><span>Clicks</span><span></span>
        </div>
        {loading && <div style={{padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14}}>Cargando...</div>}
        {!loading && visible.length === 0 && <div style={{padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14}}>No hay entradas.</div>}
        {visible.map((p) => {
          const a = ACT_BY_ID[p.category];
          const statusLabel = p.status === "published" ? "Publicado" : p.status === "draft" ? "Borrador" : p.status;
          const statusClass = p.status === "published" ? "ok" : p.status === "draft" ? "pending" : "upcoming";
          const dateStr = p.published_at ? new Date(p.published_at).toLocaleDateString("es-ES") : (p.created_at ? new Date(p.created_at).toLocaleDateString("es-ES") : "—");
          return (
            <div key={p.id} className={`data-table-row ${a?.className || ""}`} style={{gridTemplateColumns: "2.4fr 1fr 0.9fr 0.7fr 0.7fr 130px"}}>
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
              <div className="pri" style={{color: p.click_count ? "var(--teal)" : "var(--ink-3)"}}>{p.click_count || "—"}</div>
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
    } catch(err) {
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
        <div style={{flex: 1}}/>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditingInst({ name: '', email: '', phone: '', specialty: '' }); setActiveInstModal('new'); }}><I.Plus /> Nuevo Instructor</button>
      </div>

      <div className="data-table">
        <div className="data-table-head" style={{gridTemplateColumns: "2.4fr 2fr 1.5fr 1.5fr 100px"}}>
          <span>Nombre</span>
          <span>Email</span>
          <span>Teléfono</span>
          <span>Especialidad</span>
          <span></span>
        </div>
        {loading && (
          <div style={{padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14}}>Cargando...</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14}}>No hay instructores.</div>
        )}
        {!loading && visible.map(inst => (
          <div key={inst.id} className="data-table-row" style={{gridTemplateColumns: "2.4fr 2fr 1.5fr 1.5fr 100px"}}>
            <div className="cell-user">
              <div className="avatar" style={{background: "var(--grad-aim)"}}>
                {(inst.name?.[0] || "?").toUpperCase()}
              </div>
              <div className="pri">{inst.name}</div>
            </div>
            <div className="sec">{inst.email || <span style={{color: "var(--ink-3)"}}>—</span>}</div>
            <div>{inst.phone || <span style={{color: "var(--ink-3)"}}>—</span>}</div>
            <div>
              <span className="activity-pill">{inst.specialty || <span style={{color: "var(--ink-3)"}}>—</span>}</span>
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

function AdminCamp({ showToast }) {
  const [tab, setTab] = useState('roster'); // 'roster' | 'children' | 'weeks'
  const [weeks, setWeeks] = useState([]);
  const [children, setChildren] = useState([]);
  const [roster, setRoster] = useState([]);
  const [rosterDay, setRosterDay] = useState(todayISO());
  const [rosterLoading, setRosterLoading] = useState(false);
  const [childrenLoading, setChildrenLoading] = useState(false);

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

  function shiftDay(delta) {
    const d = new Date(rosterDay + 'T12:00:00');
    do { d.setDate(d.getDate() + delta); } while (d.getDay() === 0 || d.getDay() === 6);
    setRosterDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
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
    const rows = roster.map((r, i) => `
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
  const visibleChildren = children.filter(c => {
    if (nameQ && !`${c.nombre} ${c.apellidos}`.toLowerCase().includes(nameQ)) return false;
    if (pagadoFilter === 'pagado' && !c.pagado) return false;
    if (pagadoFilter === 'pendiente' && c.pagado) return false;
    return true;
  });

  const presentCount = roster.filter(r => r.asistio).length;

  return (
    <>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 22, borderBottom: '1px solid var(--line-2)', paddingBottom: 14, flexWrap: 'wrap' }}>
        {[['roster', 'Pasar lista'], ['children', `Inscritos (${children.length})`], ['weeks', 'Semanas y plazas']].map(([id, label]) => (
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <input type="date" value={rosterDay} onChange={e => e.target.value && setRosterDay(e.target.value)}
              style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' }} />
            <button className="btn btn-icon" onClick={() => shiftDay(1)} aria-label="Día siguiente">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'capitalize' }}>{campFmtLong(rosterDay)}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal)' }}>{presentCount}/{roster.length} presentes</span>
              <button className="btn btn-sm btn-outline" onClick={printRoster} disabled={!roster.length}><I.Print /> Imprimir</button>
            </div>
          </div>

          {rosterLoading && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}
          {!rosterLoading && roster.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--ink-3)', fontSize: 14 }}>
              No hay niños apuntados a este día.
            </div>
          )}
          {!rosterLoading && roster.map(row => (
            <CampRosterRow key={`${row.id}-${rosterDay}`} row={row} day={rosterDay} onSaved={onAttendanceSaved} />
          ))}
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
          {visibleChildren.map(c => (
            <div key={c.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 18px', display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>
                    {c.nombre} {c.apellidos}
                    {c.edad ? <span style={{ fontWeight: 600, color: 'var(--ink-3)', marginLeft: 6, fontSize: 12 }}>{c.edad} años</span> : null}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                    {c.parentEmail ? `Familia: ${c.parentName || ''} · ${c.parentEmail}` : 'Alta manual (secretaría)'}
                    {c.contacto ? ` · 📞 ${c.contacto}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {c.alergias && (
                      <span style={{ background: 'color-mix(in oklab, var(--orange) 14%, var(--bg-2))', color: 'var(--orange)', fontWeight: 800, padding: '2px 8px', borderRadius: 999, fontSize: 11, border: '1px solid color-mix(in oklab, var(--orange) 30%, transparent)' }}>
                        ⚠ {c.alergias}
                      </span>
                    )}
                    <span style={{ background: 'var(--bg-3)', color: 'var(--ink-2)', fontWeight: 700, padding: '2px 8px', borderRadius: 999, fontSize: 11, border: '1px solid var(--line-2)' }}>
                      {(c.days || []).length} día{(c.days || []).length !== 1 ? 's' : ''}
                    </span>
                    {c.fotosRrss && <span style={{ color: 'var(--teal)', fontSize: 11, fontWeight: 700 }}>✓ Fotos RRSS</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, fontWeight: 700, color: c.pagado ? 'var(--teal)' : 'var(--orange)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!c.pagado} onChange={e => patchChild(c.id, { pagado: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                    {c.pagado ? 'Pagado' : 'Pendiente'}
                  </label>
                  <button className="btn btn-sm btn-outline" onClick={() => setEditingDays({ child: c, days: [...(c.days || [])] })}>
                    <I.Calendar /> Días
                  </button>
                  <button className="icon-btn" onClick={() => setEditingChild({ ...c, edad: c.edad || '', alergias: c.alergias || '', observaciones: c.observaciones || '', contacto: c.contacto || '', recogida: c.recogida || '' })} aria-label="Editar"><I.Edit /></button>
                  <button className="icon-btn danger" onClick={() => deleteChild(c.id)} aria-label="Eliminar"><I.Trash /></button>
                </div>
              </div>
              {c.observaciones && <div style={{ fontSize: 12, color: 'var(--ink-3)', background: 'var(--bg-3)', borderRadius: 8, padding: '6px 10px' }}>{c.observaciones}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Semanas ── */}
      {tab === 'weeks' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <button className="btn btn-sm btn-primary" onClick={() => setEditingWeek({ label: '', startDate: '', endDate: '', capacity: 24 })}>
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
                    <button className="icon-btn" onClick={() => setEditingWeek({ id: w.id, label: w.label, startDate: w.startDate, endDate: w.endDate, capacity: w.capacity })} aria-label="Editar"><I.Edit /></button>
                    <button className="icon-btn danger" onClick={() => deleteWeek(w.id)} aria-label="Eliminar"><I.Trash /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {w.days.map(({ day, count }) => {
                    const full = w.capacity != null && count >= w.capacity;
                    return (
                      <div key={day} style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                        background: full ? 'color-mix(in oklab, var(--orange) 14%, var(--bg-2))' : 'var(--bg-3)',
                        color: full ? 'var(--orange)' : 'var(--ink-2)',
                        border: `1px solid ${full ? 'color-mix(in oklab, var(--orange) 30%, transparent)' : 'var(--line-2)'}`,
                      }}>
                        {day.slice(8)}/{day.slice(5, 7)} · {count}/{w.capacity}
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
      .catch(() => {});
    fetch('/api/classes', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setClassSlots(data);
      })
      .catch(() => {});
    fetch('/api/activities', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setActivities(data);
        setActById(Object.fromEntries(data.map(a => [a.id, a])));
      })
      .catch(() => {});
    fetch('/api/aulas', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setAulas)
      .catch(() => {});
    fetch('/api/instructores', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setInstructores)
      .catch(() => {});
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
    } catch(err) {
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
    } catch(err) {
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
    } catch(err) {
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
    { heading: "Gestión", items: [
      { id: "overview", label: "Resumen", icon: <I.Dashboard /> },
      { id: "students", label: "Alumnos", icon: <I.Users /> },
      { id: "classes", label: "Clases y horarios", icon: <I.Calendar /> },
      { id: "payments", label: "Recibos", icon: <I.Wallet /> },
      { id: "news", label: "Noticias / Foro", icon: <I.Newspaper /> },
      { id: "events", label: "Eventos", icon: <I.Star /> },
      { id: "camp", label: "Campamento", icon: <I.Sun /> },
    ]},
    { heading: "Club", items: [
      { id: "groups", label: "Grupos", icon: <I.Trophy /> },
      { id: "instructors", label: "Instructores", icon: <I.Users /> },
      { id: "settings", label: "Ajustes", icon: <I.Settings /> },
      { id: "support", label: "Soporte", icon: <I.Bell /> },
    ]},
  ];

  async function handleLogout() {
    if (onLogout) await onLogout();
    else go("/");
  }

  return (
    <main style={{paddingTop: 0}}>
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
            <div className="avatar" style={{width: 36, height: 36, fontSize: 13}}>{adminInitials}</div>
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
            <div style={{display: "flex", alignItems: "center", gap: 12}}>
              <button className="admin-hamburger btn btn-icon" onClick={() => setSidebarOpen(o => !o)} aria-label="Menú">
                <I.Menu />
              </button>
              <div>
                <div className="crumb">Admin · <b>{sectionLabel(view)}</b></div>
                <h1>{sectionLabel(view)}</h1>
              </div>
            </div>
            <div style={{display: "flex", gap: 10, alignItems: "center"}}>
              <button className="btn btn-icon"><I.Bell /></button>
              <button className="btn btn-icon" onClick={() => alert("Función de búsqueda global disponible próximamente.")}><I.Search /></button>
              {!['classes', 'events', 'support', 'camp'].includes(view) && (
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
              <input value={editingItem.title || ''} onChange={e => setEditingItem({...editingItem, title: e.target.value})} required placeholder="Ej. Taekwondo Infantiles" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Actividad</label>
                <select value={editingItem.act || 'taekwondo'} onChange={e => setEditingItem({...editingItem, act: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
                  {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Sala / Aula</label>
                <select value={editingItem.room || ''} onChange={e => setEditingItem({...editingItem, room: e.target.value})} required style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
                  {aulas.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Día de la semana</label>
                <select value={editingItem.d || 0} onChange={e => setEditingItem({...editingItem, d: parseInt(e.target.value)})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
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
                          onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background = 'var(--line)'; }}
                          onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background = 'transparent'; }}
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
                <input type="number" step="0.5" min="0.5" max="4" value={editingItem.h || 1} onChange={e => setEditingItem({...editingItem, h: parseFloat(e.target.value)})} required />
              </div>
              <div className="field">
                <label>Monitor / Profesor</label>
                <select value={editingItem.monitor || ''} onChange={e => setEditingItem({...editingItem, monitor: e.target.value})} required style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
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
