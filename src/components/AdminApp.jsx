import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimLogo, ACTIVITIES, ACT_BY_ID } from './Shared.jsx';
import { useRouter } from '../App.jsx';
import { AdminSupport } from './AdminSupport.jsx';

function sectionLabel(id) {
  return ({
    overview: "Resumen",
    students: "Gestión de alumnos",
    classes: "Clases y horarios",
    payments: "Pagos y facturación",
    news: "Noticias y foro",
    groups: "Grupos",
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
  const [receiptsTotal, setReceiptsTotal] = useState(0);

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
      .then(data => {
        const total = data.reduce((sum, r) => sum + (r.amount || 0), 0);
        setReceiptsTotal(total);
      })
      .catch(() => {});
  }, [refreshTrigger]);

  return (
    <>
      <div className="kpis">
        <KPI label="Alumnos registrados" value={userCount != null ? String(userCount) : "…"} trend="en la plataforma" act="taekwondo" icon={<I.Users />} />
        <KPI label="Cuotas cobradas" value={receiptsTotal > 0 ? `${receiptsTotal.toLocaleString("es-ES")}€` : "0€"} trend="Ingresos registrados" act="funcional" icon={<I.Wallet />} />
        <KPI label="Posts publicados" value={stats ? String(stats.publishedPosts) : "…"} trend={stats ? `${stats.totalViews.toLocaleString("es-ES")} visitas` : "cargando..."} act="pintura" icon={<I.Newspaper />} />
        <KPI label="Borradores" value={stats ? String(stats.draftPosts) : "…"} trend="sin publicar" act="ballet" icon={<I.Edit />} />
      </div>

      <div style={{display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18}}>
        <div style={{background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 18, padding: 24}}>
          <div style={{display: "flex", justifyContent: "space-between", marginBottom: 18}}>
            <h2 style={{fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, letterSpacing: "-.015em", margin: 0}}>
              Cuotas pendientes
            </h2>
            <button className="btn btn-sm btn-outline" onClick={() => setView("payments")}>Ver todas</button>
          </div>
          {[
            { name: "Familia Pérez", what: "Mensualidad mayo · 2 alumnos", amount: "84€", days: 4 },
            { name: "Familia Romero", what: "Mensualidad mayo + examen", amount: "120€", days: 6 },
            { name: "Familia Martínez", what: "Mensualidad mayo · 1 alumno", amount: "42€", days: 9 },
            { name: "Familia Soto", what: "Cuota campamento", amount: "160€", days: 12 },
          ].map((r, i) => (
            <div key={i} className="payment-row">
              <div>
                <div className="name">{r.name}</div>
                <div className="date">{r.what}</div>
              </div>
              <span className="status-pill pending">{r.days}d</span>
              <span className="amount">{r.amount}</span>
              <button className="btn btn-sm btn-outline" onClick={() => showToast(`Recordatorio enviado a ${r.name}`)}>Recordar</button>
              <button className="btn btn-sm btn-primary" onClick={() => showToast(`Pago de ${r.amount} registrado para ${r.name}`)}>Cobrar</button>
            </div>
          ))}
        </div>

        <div style={{background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 18, padding: 24}}>
          <h2 style={{fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, letterSpacing: "-.015em", margin: 0, marginBottom: 4}}>
            Inscripciones por actividad
          </h2>
          <p style={{fontSize: 13, color: "var(--ink-3)", margin: "0 0 18px"}}>Curso 2025-2026</p>
          <div style={{display: "grid", gap: 12}}>
            {[
              { name: "Taekwondo", v: 62, c: "var(--teal)" },
              { name: "Ballet Clásico", v: 38, c: "var(--pink)" },
              { name: "Inglés", v: 34, c: "var(--blue)" },
              { name: "Funcional", v: 22, c: "var(--orange)" },
              { name: "Robótica", v: 18, c: "var(--yellow)" },
              { name: "Pintura", v: 10, c: "var(--purple)" },
            ].map((a, i) => (
              <div key={i}>
                <div style={{display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, fontWeight: 600}}>
                  <span>{a.name}</span>
                  <span style={{color: "var(--ink-3)"}}>{a.v} alumnos</span>
                </div>
                <div style={{height: 8, background: "var(--bg-3)", borderRadius: 99, overflow: "hidden"}}>
                  <div style={{height: "100%", width: `${a.v}%`, background: a.c, transition: "width var(--tx-slow) ease"}} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18}}>
        <QuickCard
          title="Pasar lista de hoy"
          desc="3 clases programadas."
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

function AdminClasses({ classSlots, setClassSlots, onAddClassClick }) {
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const HOURS = Array.from({length: 14}, (_, i) => 9 + i);

  const [search, setSearch] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState("Todas");

  const classrooms = ["Todas", "Sala 1", "Sala 2", "Sala 3", "Sala 4", "Sala 5", "Sala 6"];

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
        {classrooms.map(room => (
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
              const slotsInCell = filteredSlots.filter(s => s.d === dIdx && s.s === h);
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
                    .map((slot, sIdx) => (
                      <button 
                        key={sIdx}
                        className={`slot ${ACT_BY_ID[slot.act]?.className || ""}`} 
                        onClick={() => setSelectedSlot(slot)}
                        style={{
                          position: "relative",
                          inset: "auto",
                          height: "auto",
                          background: ACT_BY_ID[slot.act]?.color || "var(--ink)",
                          zIndex: 1,
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          width: "100%",
                          boxSizing: "border-box"
                        }}
                      >
                        <span className="t" style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{slot.title}</span>
                        <span className="meta" style={{ fontSize: 10, opacity: 0.9 }}>{slot.room} · {slot.students}</span>
                      </button>
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
                            onClick={() => setSelectedSlot(slot)}
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: ACT_BY_ID[slot.act]?.color || "var(--ink)",
                              cursor: "pointer",
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

      <div style={{marginTop: 22, display: "flex", gap: 8, flexWrap: "wrap"}}>
        {ACTIVITIES.slice(0, 8).map(a => (
          <span key={a.id} style={{display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", background: `color-mix(in oklab, ${a.color} 14%, var(--bg-2))`, color: a.color, border: `1px solid color-mix(in oklab, ${a.color} 30%, transparent)`, borderRadius: 999, fontSize: 12, fontWeight: 700}}>
            <span style={{width: 8, height: 8, borderRadius: "50%", background: a.color}}/> {a.name}
          </span>
        ))}
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
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ink-2)' }}><strong>Actividad:</strong> {ACT_BY_ID[selectedSlot.act]?.name || selectedSlot.act}</p>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ink-2)' }}><strong>Horario:</strong> {selectedSlot.time || `${selectedSlot.s}:00`}</p>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ink-2)' }}><strong>Sala:</strong> {selectedSlot.room}</p>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ink-2)' }}><strong>Profesor/a:</strong> {selectedSlot.monitor || '—'}</p>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--ink-2)' }}><strong>Alumnos:</strong> {selectedSlot.students}</p>
            
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setSelectedSlot(null)}>Cerrar</button>
              <button className="btn btn-sm" style={{ background: 'var(--orange)', color: 'white' }} onClick={() => {
                setClassSlots(prev => prev.filter(s => !(s.d === selectedSlot.d && s.s === selectedSlot.s && s.act === selectedSlot.act)));
                setSelectedSlot(null);
              }}>Eliminar clase</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
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

function AdminGroups({ refreshTrigger, onEditGroup }) {
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/groups', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/users', { credentials: 'include' }).then(r => r.ok ? r.json() : [])
    ]).then(([g, s]) => {
      setGroups(g);
      setStudents(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [refreshTrigger]);

  async function deleteGroup(id) {
    if (!window.confirm("¿Eliminar este grupo?")) return;
    await fetch(`/api/admin/groups/${id}`, { method: 'DELETE', credentials: 'include' });
    setGroups(prev => prev.filter(g => g.id !== id));
  }

  return (
    <div className="groups-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
      {loading && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Cargando grupos...</p>}
      {!loading && groups.length === 0 && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>No hay grupos creados aún.</p>}
      {!loading && groups.map(g => {
        const groupStudents = students.filter(s => g.studentIds.includes(s.id));
        return (
          <div key={g.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{g.name}</h3>
                <span className="activity-pill" style={{ display: 'inline-block', marginTop: 4 }}>{ACT_BY_ID[g.activity]?.name || g.activity}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="icon-btn" onClick={() => onEditGroup(g)}><I.Edit /></button>
                <button className="icon-btn danger" onClick={() => deleteGroup(g.id)}><I.Trash /></button>
              </div>
            </div>
            
            <div style={{ marginTop: 'auto', borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 8 }}>Alumnos ({groupStudents.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {groupStudents.map(s => (
                  <span key={s.id} style={{ fontSize: 11, background: 'var(--bg-3)', border: '1px solid var(--line)', padding: '2px 8px', borderRadius: 6, color: 'var(--ink-2)' }}>
                    {s.firstName} {s.lastName?.[0] || ""}.
                  </span>
                ))}
                {groupStudents.length === 0 && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Sin alumnos</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
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

export default function AdminApp({ user, onLogout, subroute = "overview" }) {
  const { go } = useRouter();
  const [view, setView] = useState(subroute);
  useEffect(() => { setView(subroute); }, [subroute]);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [notification, setNotification] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // 'new-student' | 'edit-student' | 'new-receipt' | 'new-post' | 'edit-post' | 'new-group' | 'edit-group' | 'new-class'
  const [editingItem, setEditingItem] = useState(null);
  
  const [studentsList, setStudentsList] = useState([]);

  const [classSlots, setClassSlots] = useState(() => {
    const saved = localStorage.getItem('aim_education_classes');
    return saved ? JSON.parse(saved) : [
      { d: 0, s: 17, h: 1, act: "taekwondo", title: "Taekwondo · Blancos", room: "Tatami", students: "12/16", monitor: "Darío Francisco" },
      { d: 0, s: 18, h: 1, act: "taekwondo", title: "Taekwondo · Color", room: "Tatami", students: "14/16", monitor: "Darío Francisco" },
      { d: 0, s: 19, h: 1.5, act: "taekwondo", title: "Taekwondo · Adultos", room: "Tatami", students: "8/12", monitor: "Darío Francisco" },
      { d: 0, s: 16, h: 2, act: "ballet", title: "Ballet · Primary", room: "Sala 1", students: "12/15", monitor: "Elena García" },
      { d: 1, s: 17, h: 1, act: "ingles", title: "Inglés · Movers", room: "Aula 3", students: "9/12", monitor: "James Smith" },
      { d: 1, s: 18, h: 1.5, act: "ingles", title: "Inglés · B2 First", room: "Aula 1", students: "7/10", monitor: "James Smith" },
      { d: 1, s: 17, h: 2.5, act: "ballet", title: "Ballet · Grades 1-3", room: "Sala 1", students: "11/15", monitor: "Elena García" },
      { d: 2, s: 16, h: 2, act: "ballet", title: "Ballet · Pre-primary", room: "Sala 2", students: "10/12", monitor: "Elena García" },
      { d: 2, s: 17, h: 1.5, act: "robotica", title: "Robótica · Builders", room: "Lab", students: "8/10", monitor: "Mateo Ortiz" },
      { d: 3, s: 16, h: 1, act: "ingles", title: "Inglés · Starters", room: "Aula 2", students: "10/12", monitor: "James Smith" },
      { d: 3, s: 18, h: 1.5, act: "ingles", title: "Inglés · B2 First", room: "Aula 1", students: "7/10", monitor: "James Smith" },
      { d: 3, s: 17, h: 2.5, act: "ballet", title: "Ballet · Grades 1-3", room: "Sala 1", students: "11/15", monitor: "Elena García" },
      { d: 3, s: 17, h: 1.5, act: "pintura", title: "Pintura · Estudio joven", room: "Taller", students: "6/10", monitor: "Sara Moreno" },
      { d: 4, s: 17, h: 1, act: "taekwondo", title: "Taekwondo · Blancos", room: "Tatami", students: "12/16", monitor: "Darío Francisco" },
      { d: 4, s: 18, h: 2, act: "ballet", title: "Ballet · Vocational", room: "Sala 1", students: "9/12", monitor: "Elena García" },
      { d: 4, s: 19, h: 1, act: "funcional", title: "Funcional · Tarde", room: "Sala fit", students: "11/14", monitor: "Carlos Ruiz" },
      { d: 5, s: 10, h: 2, act: "taekwondo", title: "Taekwondo · Competición", room: "Tatami", students: "8/10", monitor: "Darío Francisco" },
      { d: 5, s: 11, h: 1.5, act: "kickboxing", title: "Kick Boxing · Sparring", room: "Tatami", students: "9/12", monitor: "Darío Francisco" },
    ];
  });

  useEffect(() => {
    localStorage.setItem('aim_education_classes', JSON.stringify(classSlots));
  }, [classSlots]);
  
  useEffect(() => {
    fetch('/api/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setStudentsList)
      .catch(() => {});
    fetch('/api/classes', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (data && data.length > 0) {
          setClassSlots(data);
        }
      })
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

  const handleClassSubmit = (e) => {
    e.preventDefault();
    setClassSlots(prev => [...prev, editingItem]);
    showToast("Clase programada con éxito.");
    setActiveModal(null);
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
    ]},
    { heading: "Club", items: [
      { id: "groups", label: "Grupos", icon: <I.Trophy /> },
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
        <aside className="admin-side">
          <div className="brand">
            <AimLogo size="sm" />
            <span className="role">Panel admin</span>
          </div>

          {sections.map((s, i) => (
            <div key={i} className="admin-nav">
              <div className="heading">{s.heading}</div>
              {s.items.map(it => (
                <button key={it.id} className={view === it.id ? "is-active" : ""} onClick={() => setView(it.id)}>
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
            <div>
              <div className="crumb">
                Admin · <b>{sectionLabel(view)}</b>
              </div>
              <h1>{sectionLabel(view)}</h1>
            </div>
            <div style={{display: "flex", gap: 10, alignItems: "center"}}>
              <button className="btn btn-icon"><I.Bell /></button>
              <button className="btn btn-icon" onClick={() => alert("Función de búsqueda global disponible próximamente.")}><I.Search /></button>
              <button 
                className="btn btn-primary"
                onClick={() => {
                  if (view === 'students') {
                    setEditingItem({ firstName: '', lastName: '', email: '', belt: '', isSuperAdmin: false });
                    setActiveModal('new-student');
                  } else if (view === 'classes') {
                    setEditingItem({ d: 0, s: 17, h: 1, act: 'taekwondo', title: '', room: '', students: '0/15', monitor: '' });
                    setActiveModal('new-class');
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
            </div>
          </div>

          {view === "overview" && <AdminOverview setView={setView} refreshTrigger={refreshTrigger} showToast={showToast} />}
          {view === "students" && <AdminStudents refreshTrigger={refreshTrigger} onEditUser={(u) => { setEditingItem(u); setActiveModal('edit-student'); }} />}
          {view === "classes" && <AdminClasses classSlots={classSlots} setClassSlots={setClassSlots} onAddClassClick={() => { setEditingItem({ d: 0, s: 17, h: 1, act: 'taekwondo', title: '', room: '', students: '0/15', monitor: '' }); setActiveModal('new-class'); }} />}
          {view === "payments" && <AdminPayments refreshTrigger={refreshTrigger} />}
          {view === "news" && <AdminNews refreshTrigger={refreshTrigger} onEditPost={(p) => { setEditingItem({ ...p, coverImageUrl: p.cover_image_url }); setActiveModal('edit-post'); }} />}
          {view === "groups" && <AdminGroups refreshTrigger={refreshTrigger} onEditGroup={(g) => { setEditingItem(g); setActiveModal('edit-group'); }} />}
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
                  <option value="camaleon">Camaleón (STEM)</option>
                  <option value="funcional">Funcional</option>
                  <option value="pintura">Pintura</option>
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
                  {ACTIVITIES.slice(0, 8).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Sala / Aula</label>
                <input value={editingItem.room || ''} onChange={e => setEditingItem({...editingItem, room: e.target.value})} required placeholder="Ej. Tatami / Aula 2" />
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
                <select value={editingItem.s || 9} onChange={e => setEditingItem({...editingItem, s: parseInt(e.target.value)})} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }}>
                  {Array.from({length: 14}, (_, i) => 9 + i).map(h => <option key={h} value={h}>{h}:00</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Duración (Horas)</label>
                <input type="number" step="0.5" min="0.5" max="4" value={editingItem.h || 1} onChange={e => setEditingItem({...editingItem, h: parseFloat(e.target.value)})} required />
              </div>
              <div className="field">
                <label>Monitor / Profesor</label>
                <input value={editingItem.monitor || ''} onChange={e => setEditingItem({...editingItem, monitor: e.target.value})} placeholder="Ej. Darío Francisco" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary btn-sm">Guardar clase</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
