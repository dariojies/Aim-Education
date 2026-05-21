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
  return (
    <>
      <div className="kpis">
        <KPI label="Alumnos activos" value="184" trend="+12 este mes" act="taekwondo" icon={<I.Users />} />
        <KPI label="Cuotas cobradas" value="6.420€" trend="91% del mes" act="funcional" icon={<I.Wallet />} />
        <KPI label="Asistencia media" value="87%" trend="+3% vs mes pasado" act="ballet" icon={<I.Check />} />
        <KPI label="Noticias publicadas" value="14" trend="2.341 visitas" act="pintura" icon={<I.Newspaper />} />
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
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState([]);

  const STUDENTS = [
    { id: 1, name: "Lucía García López", age: 9, group: "Ballet · Primary", act: "ballet", contact: "ana.garcia@email.com", attendance: 95, fee: "ok", joined: "Sep 2024" },
    { id: 2, name: "Mateo García López", age: 6, group: "Taekwondo · Blancos", act: "taekwondo", contact: "ana.garcia@email.com", attendance: 88, fee: "ok", joined: "Sep 2024" },
    { id: 3, name: "Carmen Pérez Soto", age: 11, group: "Robótica · Builders", act: "robotica", contact: "j.perez@email.com", attendance: 100, fee: "pending", joined: "Oct 2024" },
    { id: 4, name: "Adrián Martín Ruiz", age: 14, group: "Taekwondo · Avanzado", act: "taekwondo", contact: "padres.martin@email.com", attendance: 92, fee: "ok", joined: "Jun 2023" },
    { id: 5, name: "Inés Romero Vázquez", age: 8, group: "Ballet · Primary", act: "ballet", contact: "p.romero@email.com", attendance: 76, fee: "pending", joined: "Sep 2025" },
    { id: 6, name: "Pablo Soto Reyes", age: 10, group: "Inglés · A2 Movers", act: "ingles", contact: "soto.familia@email.com", attendance: 89, fee: "ok", joined: "Sep 2024" },
    { id: 7, name: "Daniela Vázquez Cruz", age: 12, group: "Pintura · Estudio joven", act: "pintura", contact: "cruz.familia@email.com", attendance: 100, fee: "ok", joined: "Ene 2025" },
    { id: 8, name: "Hugo Jiménez Quintana", age: 5, group: "Ballet · Pre-primary", act: "ballet", contact: "q.jimenez@email.com", attendance: 80, fee: "ok", joined: "Sep 2025" },
  ];

  const visible = filter === "all" ? STUDENTS : STUDENTS.filter(s => s.act === filter);

  return (
    <>
      <div className="toolbar">
        <div className="search-input">
          <I.Search />
          <input placeholder="Buscar alumno, familia o grupo..." defaultValue="" />
        </div>
        <button className="filter-pill"><I.Filter /> Activos</button>
        <button className="filter-pill">Edad</button>
        <button className="filter-pill">Mes alta</button>
        <div style={{flex: 1}}/>
        <button className="btn btn-outline btn-sm">Exportar CSV</button>
        <button className="btn btn-primary btn-sm"><I.Plus /> Nuevo alumno</button>
      </div>

      <div style={{display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap"}}>
        {["all", "taekwondo", "ballet", "ingles", "robotica", "pintura", "funcional"].map(t => (
          <button key={t}
            className={`filter-pill ${filter === t ? "is-active" : ""}`}
            onClick={() => setFilter(t)}>
            {t === "all" ? `Todos · ${STUDENTS.length}` : `${ACT_BY_ID[t]?.name} · ${STUDENTS.filter(s => s.act === t).length}`}
          </button>
        ))}
      </div>

      <div className="data-table">
        <div className="data-table-head" style={{gridTemplateColumns: "32px 2.4fr 1fr 1.6fr 1.2fr 1fr 0.6fr 100px"}}>
          <span></span>
          <span>Alumno</span>
          <span>Edad</span>
          <span>Grupo</span>
          <span>Contacto</span>
          <span>Asistencia</span>
          <span>Cuota</span>
          <span></span>
        </div>
        {visible.map(s => {
          const a = ACT_BY_ID[s.act];
          return (
            <div key={s.id} className={`data-table-row ${a?.className || ""}`} style={{gridTemplateColumns: "32px 2.4fr 1fr 1.6fr 1.2fr 1fr 0.6fr 100px"}}>
              <input type="checkbox"
                checked={selected.includes(s.id)}
                onChange={(e) => setSelected(prev => e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id))}
                style={{accentColor: a?.color}}/>
              <div className="cell-user">
                <div className="avatar" style={{background: a?.color}}>{s.name[0]}</div>
                <div>
                  <div className="pri">{s.name}</div>
                  <div className="sec">Alta {s.joined}</div>
                </div>
              </div>
              <div>{s.age} años</div>
              <div><span className="activity-pill">{s.group}</span></div>
              <div className="sec">{s.contact}</div>
              <div>
                <div style={{display: "flex", alignItems: "center", gap: 8}}>
                  <div style={{width: 60, height: 6, background: "var(--bg-3)", borderRadius: 99, overflow: "hidden"}}>
                    <div style={{height: "100%", width: `${s.attendance}%`, background: s.attendance >= 90 ? "var(--teal)" : s.attendance >= 75 ? "var(--orange-soft)" : "var(--orange)"}}/>
                  </div>
                  <span style={{fontWeight: 700, fontSize: 12}}>{s.attendance}%</span>
                </div>
              </div>
              <div>
                <span className={`status-pill ${s.fee === "ok" ? "ok" : "pending"}`}>
                  {s.fee === "ok" ? "Al día" : "Pendiente"}
                </span>
              </div>
              <div className="row-actions">
                <button className="icon-btn" aria-label="Ver"><I.Eye /></button>
                <button className="icon-btn" aria-label="Editar"><I.Edit /></button>
                <button className="icon-btn danger" aria-label="Eliminar"><I.Trash /></button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--ink-3)"}}>
        <span>{visible.length} de {STUDENTS.length} alumnos</span>
        <div style={{display: "flex", gap: 6}}>
          <button className="btn btn-sm btn-outline">‹ Anterior</button>
          <button className="btn btn-sm btn-outline">Siguiente ›</button>
        </div>
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
  const [tab, setTab] = useState("pending");

  const PENDING = [
    { family: "Familia Pérez", what: "Mensualidad mayo · 2 alumnos", amount: "84€", date: "01/05/2026", days: 4, method: "Domiciliación" },
    { family: "Familia Romero", what: "Mensualidad + examen", amount: "120€", date: "01/05/2026", days: 6, method: "Domiciliación" },
    { family: "Familia Martínez", what: "Mensualidad mayo", amount: "42€", date: "01/05/2026", days: 9, method: "Transferencia" },
    { family: "Familia Soto", what: "Cuota campamento sem. 1", amount: "160€", date: "01/06/2026", days: 12, method: "Tarjeta" },
  ];
  const PAID = [
    { family: "Familia García", what: "Mensualidad abril · 3 alumnos", amount: "112€", date: "01/04/2026", method: "Domiciliación" },
    { family: "Familia Cruz", what: "Mensualidad abril", amount: "55€", date: "01/04/2026", method: "Domiciliación" },
    { family: "Familia Quintana", what: "Festival ballet · 2 entradas", amount: "20€", date: "12/04/2026", method: "Tarjeta" },
    { family: "Familia Reyes", what: "Examen Cambridge B2", amount: "180€", date: "15/03/2026", method: "Transferencia" },
    { family: "Familia López", what: "Mensualidad abril · 2 alumnos", amount: "84€", date: "01/04/2026", method: "Domiciliación" },
  ];

  return (
    <>
      <div className="kpis">
        <KPI label="Cobrado este mes" value="6.420€" trend="91% del esperado" act="taekwondo" icon={<I.Wallet />} />
        <KPI label="Pendiente" value="612€" trend="12 familias" act="funcional" icon={<I.Clock />} />
        <KPI label="Cuotas previstas" value="7.032€" trend="184 alumnos" act="ballet" icon={<I.Trophy />} />
        <KPI label="Tasa de cobro" value="94%" trend="+2% vs mes pasado" act="pintura" icon={<I.CreditCard />} />
      </div>

      <div className="toolbar">
        <div style={{display: "flex", gap: 6}}>
          <button className={`filter-pill ${tab === "pending" ? "is-active" : ""}`} onClick={() => setTab("pending")}>Pendientes · {PENDING.length}</button>
          <button className={`filter-pill ${tab === "paid" ? "is-active" : ""}`} onClick={() => setTab("paid")}>Cobrados · {PAID.length}</button>
          <button className={`filter-pill ${tab === "invoices" ? "is-active" : ""}`} onClick={() => setTab("invoices")}>Facturas</button>
        </div>
        <div className="search-input" style={{maxWidth: 280}}>
          <I.Search />
          <input placeholder="Buscar familia o concepto" />
        </div>
        <div style={{flex: 1}} />
        <button className="btn btn-outline btn-sm">Exportar</button>
        <button className="btn btn-primary btn-sm"><I.Plus /> Nuevo cobro</button>
      </div>

      {tab !== "invoices" && (
        <div className="data-table">
          <div className="data-table-head" style={{gridTemplateColumns: "32px 2fr 2fr 1fr 1fr 1fr 180px"}}>
            <span></span><span>Familia</span><span>Concepto</span><span>Fecha</span><span>Método</span><span>Importe</span><span></span>
          </div>
          {(tab === "pending" ? PENDING : PAID).map((r, i) => (
            <div key={i} className="data-table-row" style={{gridTemplateColumns: "32px 2fr 2fr 1fr 1fr 1fr 180px"}}>
              <input type="checkbox" style={{accentColor: "var(--purple)"}} />
              <div className="cell-user">
                <div className="avatar" style={{background: "var(--grad-aim)"}}>{r.family.split(" ")[1][0]}</div>
                <div className="pri">{r.family}</div>
              </div>
              <div>{r.what}</div>
              <div>{r.date}</div>
              <div className="sec">{r.method}</div>
              <div className="pri" style={{fontFamily: "var(--font-display)", fontSize: 16}}>{r.amount}</div>
              <div className="row-actions">
                {tab === "pending" ? (
                  <>
                    <button className="btn btn-sm btn-outline">Recordar</button>
                    <button className="btn btn-sm btn-primary">Cobrar</button>
                  </>
                ) : (
                  <>
                    <button className="icon-btn"><I.Eye /></button>
                    <button className="btn btn-sm btn-outline">PDF</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "invoices" && (
        <div style={{background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 18, padding: 36, textAlign: "center"}}>
          <I.Newspaper width={48} height={48} style={{color: "var(--ink-3)", margin: "0 auto 16px"}} />
          <h3 style={{margin: 0, fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800}}>Generador de facturas</h3>
          <p style={{color: "var(--ink-3)", margin: "8px 0 22px", fontSize: 14}}>
            Genera facturas masivas para cualquier rango de fechas. Incluye IVA, retenciones y exportación SII.
          </p>
          <button className="btn btn-gradient">Generar facturas del mes <I.Arrow /></button>
        </div>
      )}
    </>
  );
}

function AdminNews() {
  const POSTS = [
    { title: "¡Se acerca nuestro Festival de Ballet Clásico y Baile Moderno!", status: "Publicado", date: "10/06/2026", views: 412, clicks: 38, act: "ballet" },
    { title: "XVII Torneo Navideño Iván Navarrete", status: "Publicado", date: "01/12/2025", views: 1240, clicks: 192, act: "taekwondo" },
    { title: "Convocatoria Cambridge English curso 2025-2026", status: "Publicado", date: "15/05/2026", views: 580, clicks: 74, act: "ingles" },
    { title: "Campeonato Promoción Robótica Camaleón", status: "Publicado", date: "20/03/2026", views: 312, clicks: 28, act: "robotica" },
    { title: "Inscripciones campamento verano 2026", status: "Publicado", date: "01/04/2026", views: 894, clicks: 156, act: "campamento" },
    { title: "Exposición de fin de curso del Taller de Pintura", status: "Borrador", date: "—", views: 0, clicks: 0, act: "pintura" },
    { title: "Cambio de aula puntual — sala fit", status: "Programado", date: "26/04/2026", views: 0, clicks: 0, act: "funcional" },
  ];

  return (
    <>
      <div className="kpis">
        <KPI label="Posts publicados" value="42" trend="14 este año" act="pintura" icon={<I.Newspaper />} />
        <KPI label="Visitas totales" value="12.4K" trend="+18% mes" act="ingles" icon={<I.Eye />} />
        <KPI label="Clicks a actividades" value="894" trend="7.2% CTR" act="taekwondo" icon={<I.Arrow />} />
        <KPI label="Suscriptores RSS" value="68" trend="+4 este mes" act="ballet" icon={<I.Bell />} />
      </div>

      <div className="toolbar">
        <div className="search-input" style={{maxWidth: 320}}>
          <I.Search />
          <input placeholder="Buscar título, autor o categoría" />
        </div>
        <button className="filter-pill is-active">Todos</button>
        <button className="filter-pill">Publicados</button>
        <button className="filter-pill">Borradores</button>
        <button className="filter-pill">Programados</button>
        <div style={{flex: 1}} />
        <button className="btn btn-primary btn-sm"><I.Plus /> Nueva entrada</button>
      </div>

      <div className="data-table">
        <div className="data-table-head" style={{gridTemplateColumns: "2.4fr 1fr 0.9fr 0.7fr 0.7fr 130px"}}>
          <span>Título</span><span>Categoría</span><span>Estado</span><span>Visitas</span><span>Clicks</span><span></span>
        </div>
        {POSTS.map((p, i) => {
          const a = ACT_BY_ID[p.act];
          return (
            <div key={i} className={`data-table-row ${a?.className || ""}`} style={{gridTemplateColumns: "2.4fr 1fr 0.9fr 0.7fr 0.7fr 130px"}}>
              <div>
                <div className="pri">{p.title}</div>
                <div className="sec">{p.date} · 850 palabras</div>
              </div>
              <div>
                <span className="activity-pill">{a?.name || "Aim"}</span>
              </div>
              <div>
                <span className={`status-pill ${p.status === "Publicado" ? "ok" : p.status === "Borrador" ? "pending" : "upcoming"}`}>
                  {p.status}
                </span>
              </div>
              <div className="pri">{p.views || "—"}</div>
              <div className="pri" style={{color: p.clicks ? "var(--teal)" : "var(--ink-3)"}}>{p.clicks || "—"}</div>
              <div className="row-actions">
                <button className="icon-btn"><I.Eye /></button>
                <button className="icon-btn"><I.Edit /></button>
                <button className="icon-btn danger"><I.Trash /></button>
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

export default function AdminApp({ subroute = "overview" }) {
  const { go } = useRouter();
  const [view, setView] = useState(subroute);
  useEffect(() => { setView(subroute); }, [subroute]);

  const sections = [
    { heading: "Gestión", items: [
      { id: "overview", label: "Resumen", icon: <I.Dashboard /> },
      { id: "students", label: "Alumnos", icon: <I.Users />, count: 184 },
      { id: "classes", label: "Clases y horarios", icon: <I.Calendar /> },
      { id: "payments", label: "Pagos y recibos", icon: <I.Wallet />, count: 12 },
      { id: "news", label: "Noticias / Foro", icon: <I.Newspaper /> },
    ]},
    { heading: "Club", items: [
      { id: "groups", label: "Grupos", icon: <I.Trophy /> },
      { id: "settings", label: "Ajustes", icon: <I.Settings /> },
    ]},
  ];

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
            <div className="avatar" style={{width: 36, height: 36, fontSize: 13}}>DJ</div>
            <div>
              <div className="name">Darío Jiménez</div>
              <div className="role-tag">Director · superadmin</div>
            </div>
          </div>

          <button onClick={() => go("/")} style={{
            marginTop: 12, width: "100%", padding: "10px 12px",
            background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.7)",
            border: 0, borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
            fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
          }}>
            <I.LogOut /> Volver a la web
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
