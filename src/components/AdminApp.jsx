import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimLogo, ACTIVITIES, ACT_BY_ID } from './Shared.jsx';
import { useRouter } from '../App.jsx';

function sectionLabel(id) {
  return ({
    overview: "Resumen",
    students: "Gestión de alumnos",
    classes: "Clases y horarios",
    payments: "Pagos y facturación",
    news: "Noticias y foro",
    groups: "Grupos",
    settings: "Ajustes del club",
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

function AdminOverview({ setView }) {
  const [stats, setStats] = useState(null);
  const [userCount, setUserCount] = useState(null);

  useEffect(() => {
    fetch('/api/admin/posts/stats', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(setStats)
      .catch(() => {});
    fetch('/api/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(u => setUserCount(u.length))
      .catch(() => {});
  }, []);

  return (
    <>
      <div className="kpis">
        <KPI label="Alumnos registrados" value={userCount != null ? String(userCount) : "…"} trend="en la plataforma" act="taekwondo" icon={<I.Users />} />
        <KPI label="Cuotas cobradas" value="—" trend="Sin datos aún" act="funcional" icon={<I.Wallet />} />
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
              <button className="btn btn-sm btn-outline">Recordar</button>
              <button className="btn btn-sm btn-primary">Cobrar</button>
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
          desc="3 sesiones pendientes de marcar."
          act="taekwondo"
          icon={<I.Check />}
          onClick={() => setView("students")}
        />
        <QuickCard
          title="Publicar noticia"
          desc="Llega a 184 familias del club."
          act="pintura"
          icon={<I.Newspaper />}
          onClick={() => setView("news")}
        />
        <QuickCard
          title="Recordatorios de pago"
          desc="Enviar a 12 familias morosas."
          act="funcional"
          icon={<I.Wallet />}
          onClick={() => setView("payments")}
        />
      </div>
    </>
  );
}

function AdminStudents() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch('/api/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(u => { setUsers(u); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const visible = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="toolbar">
        <div className="search-input">
          <I.Search />
          <input placeholder="Buscar por nombre o email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{flex: 1}}/>
        <button className="btn btn-outline btn-sm">Exportar CSV</button>
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
              <button className="icon-btn" aria-label="Ver"><I.Eye /></button>
              <button className="icon-btn" aria-label="Editar"><I.Edit /></button>
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

function AdminClasses() {
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const HOURS = Array.from({length: 14}, (_, i) => 9 + i);

  const slots = [
    { d: 0, s: 17, h: 1, act: "taekwondo", title: "Taekwondo · Blancos", room: "Tatami", students: "12/16" },
    { d: 0, s: 18, h: 1, act: "taekwondo", title: "Taekwondo · Color", room: "Tatami", students: "14/16" },
    { d: 0, s: 19, h: 1.5, act: "taekwondo", title: "Taekwondo · Adultos", room: "Tatami", students: "8/12" },
    { d: 0, s: 16, h: 2, act: "ballet", title: "Ballet · Primary", room: "Sala 1", students: "12/15" },
    { d: 1, s: 17, h: 1, act: "ingles", title: "Inglés · Movers", room: "Aula 3", students: "9/12" },
    { d: 1, s: 18, h: 1.5, act: "ingles", title: "Inglés · B2 First", room: "Aula 1", students: "7/10" },
    { d: 1, s: 17, h: 2.5, act: "ballet", title: "Ballet · Grades 1-3", room: "Sala 1", students: "11/15" },
    { d: 2, s: 16, h: 2, act: "ballet", title: "Ballet · Pre-primary", room: "Sala 2", students: "10/12" },
    { d: 2, s: 17, h: 1.5, act: "robotica", title: "Robótica · Builders", room: "Lab", students: "8/10" },
    { d: 3, s: 16, h: 1, act: "ingles", title: "Inglés · Starters", room: "Aula 2", students: "10/12" },
    { d: 3, s: 18, h: 1.5, act: "ingles", title: "Inglés · B2 First", room: "Aula 1", students: "7/10" },
    { d: 3, s: 17, h: 2.5, act: "ballet", title: "Ballet · Grades 1-3", room: "Sala 1", students: "11/15" },
    { d: 3, s: 17, h: 1.5, act: "pintura", title: "Pintura · Estudio joven", room: "Taller", students: "6/10" },
    { d: 4, s: 17, h: 1, act: "taekwondo", title: "Taekwondo · Blancos", room: "Tatami", students: "12/16" },
    { d: 4, s: 18, h: 2, act: "ballet", title: "Ballet · Vocational", room: "Sala 1", students: "9/12" },
    { d: 4, s: 19, h: 1, act: "funcional", title: "Funcional · Tarde", room: "Sala fit", students: "11/14" },
    { d: 5, s: 10, h: 2, act: "taekwondo", title: "Taekwondo · Competición", room: "Tatami", students: "8/10" },
    { d: 5, s: 11, h: 1.5, act: "kickboxing", title: "Kick Boxing · Sparring", room: "Tatami", students: "9/12" },
  ];

  return (
    <>
      <div className="toolbar">
        <div style={{display: "flex", gap: 6}}>
          <button className="filter-pill is-active">Semana</button>
          <button className="filter-pill">Mes</button>
          <button className="filter-pill">Por actividad</button>
        </div>
        <div className="search-input" style={{maxWidth: 280}}>
          <I.Search />
          <input placeholder="Filtrar por sala o monitor" />
        </div>
        <div style={{flex: 1}}/>
        <button className="btn btn-outline btn-sm">Exportar PDF</button>
        <button className="btn btn-primary btn-sm"><I.Plus /> Nueva clase</button>
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
              const slot = slots.find(s => s.d === dIdx && s.s === h);
              return (
                <div key={dIdx} style={{
                  borderTop: "1px solid var(--line-2)",
                  borderLeft: "1px solid var(--line-2)",
                  minHeight: 52,
                  position: "relative",
                  padding: 3,
                }}>
                  {slot && (
                    <button className={`slot ${ACT_BY_ID[slot.act]?.className || ""}`} style={{
                      position: "absolute",
                      inset: 3,
                      height: `calc(${slot.h} * 52px - 6px)`,
                      background: ACT_BY_ID[slot.act]?.color || "var(--ink)",
                      zIndex: 1,
                    }}>
                      <span className="t">{slot.title}</span>
                      <span className="meta">{slot.room} · {slot.students}</span>
                    </button>
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
    </>
  );
}

function AdminPayments() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/receipts', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setReceipts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const totalAmount = receipts.reduce((s, r) => s + (r.amount || 0), 0);

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
              <div className="row-actions">
                {r.invoiceLink
                  ? <a href={r.invoiceLink} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">PDF</a>
                  : <button className="icon-btn"><I.Eye /></button>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function AdminNews() {
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
  }, []);

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
                <button className="icon-btn"><I.Eye /></button>
                <button className="icon-btn"><I.Edit /></button>
                <button className="icon-btn danger" onClick={() => deletePost(p.id)}><I.Trash /></button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function AdminGroups() {
  return (
    <div style={{background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 18, padding: 32}}>
      <h2 style={{fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", margin: 0}}>Grupos del club</h2>
      <p style={{fontSize: 14, color: "var(--ink-3)", marginTop: 6}}>
        Aún no maquetado en este pase — la vista funcional consume el mismo patrón que la lista de alumnos con tarjetas agrupadas.
      </p>
    </div>
  );
}

function AdminSettings() {
  return (
    <div style={{background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 18, padding: 32}}>
      <h2 style={{fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", margin: 0}}>Ajustes del club</h2>
      <p style={{fontSize: 14, color: "var(--ink-3)", marginTop: 6}}>
        Configuración general, roles, integraciones (Cambridge, RAD, ITF) y exportaciones.
      </p>
    </div>
  );
}

export default function AdminApp({ user, onLogout, subroute = "overview" }) {
  const { go } = useRouter();
  const [view, setView] = useState(subroute);
  useEffect(() => { setView(subroute); }, [subroute]);

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
                  {it.count && <span className="count">{it.count}</span>}
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

          <button onClick={handleLogout} style={{
            marginTop: 12, width: "100%", padding: "10px 12px",
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
              <button className="btn btn-icon"><I.Search /></button>
              <button className="btn btn-primary">
                <I.Plus /> Nuevo
              </button>
            </div>
          </div>

          {view === "overview" && <AdminOverview setView={setView} />}
          {view === "students" && <AdminStudents />}
          {view === "classes" && <AdminClasses />}
          {view === "payments" && <AdminPayments />}
          {view === "news" && <AdminNews />}
          {view === "groups" && <AdminGroups />}
          {view === "settings" && <AdminSettings />}
        </div>
      </div>
    </main>
  );
}
