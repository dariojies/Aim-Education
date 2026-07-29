import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icons.jsx';
import { useEnVivo } from '../envivo.js';
import Campanita from './Campanita.jsx';
import { AimLogo, ACT_BY_ID, CampDayPicker, campFmtLong, nombreMedioPago } from './Shared.jsx';
import { useRouter } from '../App.jsx';
import { UserSupport } from './AdminSupport.jsx';
import { fmtFecha } from '../fechas.js';

function EmptyState({ icon, text, accion, onAccion }) {
  return (
    <div style={{display: "flex", alignItems: "center", gap: 14, padding: "18px 16px", color: "var(--ink-3)",
                 background: "var(--bg-3)", border: "1px dashed var(--line)", borderRadius: 14}}>
      {icon && <span style={{opacity: .5, flexShrink: 0, display: "grid", placeItems: "center"}}>{icon}</span>}
      <p style={{margin: 0, fontSize: 14, lineHeight: 1.5, flex: 1, minWidth: 0}}>{text}</p>
      {accion && (
        <button className="btn btn-brand btn-sm" style={{flexShrink: 0}} onClick={onAccion}>{accion}</button>
      )}
    </div>
  );
}

// Acceso rápido a lo que más se hace, igual que en el panel de admin.
function AccesoRapido({ titulo, desc, color, icon, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 18, padding: 20,
      cursor: "pointer", textAlign: "left", fontFamily: "inherit", display: "flex", gap: 14,
      alignItems: "flex-start", width: "100%",
      transition: "transform var(--tx-base) ease, box-shadow var(--tx-base) ease, border-color var(--tx-base) ease",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "var(--shadow)"; e.currentTarget.style.borderColor = "transparent"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "var(--line)"; }}>
      <span style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center",
        background: `color-mix(in oklab, ${color} 16%, var(--bg-2))`, color,
      }}>{icon}</span>
      <span style={{minWidth: 0}}>
        <span style={{display: "block", fontWeight: 800, fontSize: 15, color: "var(--ink)"}}>{titulo}</span>
        <span style={{display: "block", fontSize: 13, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.45}}>{desc}</span>
      </span>
    </button>
  );
}

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function DashOverview({ go, setView }) {
  const [slots, setSlots] = useState([]);
  const [groups, setGroups] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [posts, setPosts] = useState([]);
  const [recibos, setRecibos] = useState([]);
  const [pendiente, setPendiente] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/me/groups', { credentials: 'include' }).then(r => r.ok ? r.json() : { groups: [], slots: [] }),
      fetch('/api/me/attendance', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/posts?limit=3').then(r => r.ok ? r.json() : []),
      fetch('/api/me/recibos', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/me/cargos', { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : null),
    ]).then(([g, at, p, rc, cg]) => {
      setGroups(g.groups || []);
      setSlots(g.slots || []);
      setAttendance(Array.isArray(at) ? at : []);
      setPosts(Array.isArray(p) ? p : []);
      setRecibos(Array.isArray(rc) ? rc : []);
      setPendiente(Number(cg?.total || 0));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Lo pendiente es lo que más cambia por detrás: se mantiene al día solo.
  useEnVivo(() => {
    fetch('/api/me/cargos', { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setPendiente(Number(d?.total || 0)))
      .catch(() => {});
  }, { cada: 15000 });

  // Solo cuentan los recibos que siguen en pie: un recibo anulado no es dinero pagado.
  const recibosValidos = recibos.filter(r => r.estado !== 'anulado');
  const totalPagado = recibosValidos.reduce((s, r) => s + Number(r.total ?? r.importe ?? 0), 0);

  const weekClasses = [...slots].sort((a, b) => (a.d - b.d) || (a.s - b.s)).slice(0, 6);
  const attWithRecords = attendance.filter(a => a.total > 0);
  const totAttended = attWithRecords.reduce((s, a) => s + a.attended, 0);
  const totSessions = attWithRecords.reduce((s, a) => s + a.total, 0);
  const attPct = totSessions > 0 ? Math.round((totAttended / totSessions) * 100) : null;

  return (
    <>
      <div className="dash-cards" style={{gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"}}>
        <div className="stat-card">
          <div className="corner" style={{color: "#5233A8"}}><I.Calendar /></div>
          <div className="l">Clases de la familia</div>
          <div className="v">{groups.length}</div>
          <div className="trend" style={{background: "color-mix(in oklab, #5233A8 14%, var(--bg-2))", color: "#5233A8"}}>
            {groups.length === 1 ? "1 grupo matriculado" : `${groups.length} grupos matriculados`}
          </div>
        </div>
        <div className="stat-card">
          <div className="corner" style={{color: "#DB7093"}}><I.Check /></div>
          <div className="l">Asistencia</div>
          <div className="v">{attPct != null ? `${attPct}%` : "—"}</div>
          <div className="trend" style={{background: "color-mix(in oklab, #DB7093 14%, var(--bg-2))", color: "#DB7093"}}>
            {attPct != null ? "del trimestre" : "sin registros aún"}
          </div>
        </div>
        <div className="stat-card">
          <div className="corner" style={{color: pendiente > 0 ? "var(--orange)" : "var(--teal)"}}><I.Wallet /></div>
          <div className="l">Pendiente de pago</div>
          <div className="v">{pendiente > 0 ? `${pendiente.toFixed(2)} €` : "0 €"}</div>
          <div className="trend" style={{
            background: `color-mix(in oklab, ${pendiente > 0 ? "var(--orange)" : "var(--teal)"} 14%, var(--bg-2))`,
            color: pendiente > 0 ? "var(--orange)" : "var(--teal)",
          }}>
            {pendiente > 0 ? "hay recibos que pagar" : "todo al día"}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2><I.Calendar /> El horario de esta semana</h2>
        <p className="sub">Las clases de la familia, día a día.</p>
        {loading ? (
          <EmptyState text="Cargando horario..." />
        ) : weekClasses.length === 0 ? (
          <EmptyState icon={<I.Calendar />}
            text="Todavía no hay ninguna clase apuntada en la familia. Mira lo que hacemos y habla con el club para apuntaros."
            accion="Ver actividades" onAccion={() => go("/actividades")} />
        ) : (
          <div className="classes-grid">
            {weekClasses.map((c) => {
              const a = ACT_BY_ID[c.act];
              return (
                <div key={c.id} className={`class-row ${a?.className || ""}`}>
                  <div className="day">
                    <div className="d">{(DAY_NAMES[c.d] || "").slice(0, 3)}</div>
                    <div className="w">{(c.time || "").split("–")[0] || `${c.s}:00`}</div>
                  </div>
                  <div className="info">
                    <h4>{c.title}</h4>
                    <p>{c.time || `${c.s}:00`}{c.room ? ` · ${c.room}` : ""}</p>
                    {c.alumno && <span className="quien"><I.User width={11} height={11} /> {c.alumno}</span>}
                  </div>
                  <span className="badge">{a?.name || c.act}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22}}>
        <div className="panel">
          <h2><I.Bell /> Avisos recientes</h2>
          <p className="sub">Comunicaciones del club.</p>
          {loading ? (
            <EmptyState text="Cargando avisos..." />
          ) : posts.length === 0 ? (
            <EmptyState icon={<I.Bell />} text="No hay avisos publicados." />
          ) : posts.map((n, i) => {
            const color = CAT_COLOR[n.category] || "var(--purple)";
            return (
              <div key={n.id} style={{display: "flex", gap: 14, padding: "14px 0", borderBottom: i < posts.length - 1 ? "1px solid var(--line-2)" : "0"}}>
                <div style={{width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 8, flexShrink: 0}} />
                <div style={{flex: 1}}>
                  <div style={{display: "flex", justifyContent: "space-between", marginBottom: 4}}>
                    <span style={{fontSize: 10, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color}}>{n.category || "Aim"}</span>
                    <span style={{fontSize: 11, color: "var(--ink-3)"}}>{timeAgo(n.published_at || n.created_at)}</span>
                  </div>
                  <h4 style={{margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "var(--ink)"}}>{n.title}</h4>
                  {n.excerpt && <p style={{margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45}}>{n.excerpt}</p>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="panel">
          <h2><I.Wallet /> Resumen económico</h2>
          <p className="sub">Tus recibos registrados.</p>
          {recibosValidos.length === 0 ? (
            <EmptyState icon={<I.Wallet />} text="No hay recibos disponibles." />
          ) : (
            <div style={{
              background: "var(--grad-aim)",
              borderRadius: 14,
              padding: 22,
              color: "white",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{fontSize: 12, opacity: .8, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700}}>Total pagado</div>
              <div style={{fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 800, letterSpacing: "-.025em", marginTop: 6}}>{totalPagado.toLocaleString("es-ES", {minimumFractionDigits: 2})}€</div>
              <div style={{fontSize: 12, marginTop: 8, opacity: .9}}>{recibosValidos.length} recibo{recibosValidos.length !== 1 ? "s" : ""}</div>
              <button className="btn" style={{background: "var(--ink)", color: "white", marginTop: 14}} onClick={() => setView("payments")}>
                Ver recibos <I.Arrow />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Los atajos a lo que más se hace, como los del panel de admin. */}
      <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 22}}>
        <AccesoRapido
          titulo={pendiente > 0 ? "Pagar mis recibos" : "Mis recibos"}
          desc={pendiente > 0 ? `Tienes ${pendiente.toFixed(2)} € pendientes de pago.` : "Consulta y descarga tus recibos."}
          color={pendiente > 0 ? "var(--orange)" : "var(--teal)"}
          icon={<I.Wallet />} onClick={() => setView("payments")} />
        <AccesoRapido
          titulo="Campamento de verano"
          desc="Apunta a los tuyos y consulta los días."
          color="#F99B35" icon={<I.Sun />} onClick={() => setView("camp")} />
        <AccesoRapido
          titulo="¿Necesitas ayuda?"
          desc="Escribe al club y te contestamos por aquí."
          color="#5233A8" icon={<I.Shield />} onClick={() => setView("support")} />
      </div>
    </>
  );
}

function DashClasses() {
  const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const [groups, setGroups] = useState([]);
  const [slots, setSlots] = useState([]);
  const [espera, setEspera] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);

  useEffect(() => {
    fetch('/api/me/groups', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { groups: [], slots: [] })
      .then(data => {
        setGroups(data.groups || []);
        setSlots(data.slots || []);
        setEspera(data.espera || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Clases llenas en las que se está esperando plaza, con el puesto en la cola.
  const bloqueEspera = espera.length > 0 && (
    <div className="panel" style={{marginBottom: 16}}>
      <h2><I.Clock /> En lista de espera</h2>
      <p className="sub">Te avisaremos en cuanto quede una plaza libre.</p>
      <div style={{display: "grid", gap: 10, marginTop: 12}}>
        {espera.map((e, i) => (
          <div key={i} style={{background: "var(--bg-3)", border: "1px solid var(--line)", borderLeft: "4px solid var(--purple)", borderRadius: 12, padding: "12px 14px"}}>
            <div style={{fontWeight: 800, fontSize: 15}}>{e.grupo} <span style={{fontWeight: 400, color: "var(--ink-3)", fontSize: 13}}>· {e.actividad}</span></div>
            <div style={{display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", marginTop: 4}}>
              <span style={{fontSize: 22, fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--purple)"}}>{e.puesto}º</span>
              <span style={{fontSize: 13, color: "var(--ink-2)"}}>de {e.total} en la lista</span>
            </div>
            {e.provisional && (
              <div style={{fontSize: 12, color: "var(--ink-3)", marginTop: 4}}>
                Mientras tanto vas a <b>{e.provisional}</b>.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const HOURS = Array.from({length: 14}, (_, i) => 9 + i);

  if (loading) {
    return <div className="panel"><h2><I.Calendar /> Mis clases</h2><EmptyState text="Cargando tus clases..." /></div>;
  }
  if (groups.length === 0) {
    return (
      <>
      {bloqueEspera}
      <div className="panel">
        <h2><I.Calendar /> Mis clases</h2>
        <p className="sub">Tus grupos y tu horario.</p>
        <EmptyState icon={<I.Calendar />} text="Todavía no hay ninguna clase en la familia. Habla con el club para apuntaros y aquí veréis el horario." />
      </div>
      </>
    );
  }

  return (
    <>
      {bloqueEspera}
      <div className="panel">
        <h2><I.Calendar /> Clases de la familia</h2>
        <p className="sub">Las clases tuyas y las de los tuyos.</p>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 14}}>
          {groups.map(g => {
            const a = ACT_BY_ID[g.act];
            return (
              <div key={g.id} style={{background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 14, padding: 16, borderLeft: `4px solid ${a?.color || "var(--ink)"}`}}>
                <div style={{fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: a?.color || "var(--ink-3)"}}>{g.activityName}</div>
                <div style={{fontWeight: 700, fontSize: 15, margin: "4px 0"}}>{g.name}</div>
                {g.alumno && (
                  <div style={{fontSize: 12, color: "var(--ink-2)", fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 5}}>
                    <I.User width={12} height={12} /> {g.alumno}
                  </div>
                )}
                {g.level && <span style={{display: "inline-block", fontSize: 11, fontWeight: 700, background: "color-mix(in oklab, var(--purple) 12%, var(--bg-2))", color: "var(--purple)", padding: "2px 8px", borderRadius: 6}}>Nivel: {g.level}</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h2><I.Calendar /> Mi horario semanal</h2>
        <p className="sub">Tus clases distribuidas en la semana.</p>
        <div className="week-grid" style={{gridTemplateColumns: "80px repeat(6, 1fr)"}}>
          <div className="hdr"></div>
          {days.map(d => <div key={d} className="hdr">{d}</div>)}
          {HOURS.map(h => (
            <React.Fragment key={h}>
              <div className="time">{h}:00</div>
              {days.map((_, dIdx) => {
                const slotsInCell = slots.filter(s => s.d === dIdx && s.s === h);
                return (
                  <div key={dIdx} style={{minHeight: 52, display: "flex", flexDirection: "column", gap: 4, padding: 4, position: "relative"}}>
                    {slotsInCell.map((slot, sIdx) => (
                      <button key={sIdx} className={`slot ${ACT_BY_ID[slot.act]?.className || ""}`}
                        onClick={() => setSelectedSlot(slot)}
                        style={{
                          position: "relative", inset: "auto", height: "auto",
                          background: ACT_BY_ID[slot.act]?.color || "var(--ink)",
                          display: "flex", flexDirection: "column", gap: 2, width: "100%", boxSizing: "border-box"
                        }}>
                        <span className="t" style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{slot.title}</span>
                        <span className="meta" style={{ fontSize: 10, opacity: 0.9 }}>{slot.time || `${h}:00`} · {slot.room}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Modal Detalles de Clase (Solo Info para Alumnos) */}
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DashAttendance() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me/attendance', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setRows(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const withRecords = rows.filter(r => r.total > 0);

  return (
    <div className="panel">
      <h2><I.Check /> Mi asistencia</h2>
      <p className="sub">Tu asistencia por grupo. Verde: asististe. Naranja: ausencia.</p>
      {loading ? (
        <EmptyState text="Cargando asistencia..." />
      ) : withRecords.length === 0 ? (
        <EmptyState icon={<I.Check />} text="Aún no hay asistencia registrada. Aparecerá aquí cuando el club empiece a pasar lista en tus clases." />
      ) : (
        <div style={{display: "grid", gap: 20, marginTop: 16}}>
          {withRecords.map((s) => {
            const a = ACT_BY_ID[s.act];
            const color = s.percent >= 90 ? "var(--teal)" : s.percent >= 75 ? "var(--orange-soft)" : "var(--orange)";
            const cells = Math.max(s.total, 1);
            return (
              <div key={s.groupId} className={a?.className || ""}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10}}>
                  <div style={{display: "flex", alignItems: "center", gap: 10}}>
                    <div className="avatar" style={{background: a?.color || "var(--ink)"}}>{(s.activityName || "?")[0]}</div>
                    <div>
                      <div style={{fontWeight: 700, fontSize: 15}}>{s.groupName}</div>
                      <div style={{fontSize: 12, color: "var(--ink-3)"}}>{s.activityName} · {s.attended}/{s.total} sesiones</div>
                    </div>
                  </div>
                  <div style={{textAlign: "right"}}>
                    <div style={{fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, letterSpacing: "-.02em", lineHeight: 1, color}}>{s.percent}%</div>
                    <div style={{fontSize: 11, color: "var(--ink-3)", fontWeight: 600, marginTop: 2}}>asistencia</div>
                  </div>
                </div>
                <div className="attendance-bar">
                  {Array.from({length: cells}).map((_, idx) => {
                    if (idx < s.attended) return <div key={idx} className="ok" style={{flex: 1}} />;
                    if (idx < s.attended + s.missed) return <div key={idx} className="miss" style={{flex: 1}} />;
                    return <div key={idx} className="future" style={{flex: 1}} />;
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

// Recibos de la familia: solo los suyos (donde es pagador o tiene algún cargo).
const MESES_REC = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesRec = (iso) => {
  if (!iso) return '';
  const [y, m] = String(iso).slice(0, 7).split('-');
  return `${MESES_REC[Number(m) - 1]} ${y}`;
};
const eurRec = (n) => `${Number(n || 0).toFixed(2)} €`;

// ── Vuelta del banco ─────────────────────────────────────────────────────────
// Al volver de la pasarela no se puede soltar a la familia en la portada sin
// decirle nada: se le confirma lo cobrado y se le enseña el recibo.
function GraciasPorPagar({ pago, onCerrar }) {
  const pdf = pago.recibo ? `/api/me/recibos/${pago.reciboId}/pdf` : null;
  return (
    <div className="panel" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{
          width: 48, height: 48, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center',
          background: 'color-mix(in oklab, var(--teal) 16%, transparent)', color: 'var(--teal)',
        }}><I.Check width={24} height={24} /></span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0 }}>¡Gracias! Hemos recibido tu pago</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Se han cobrado <b>{Number(pago.importe).toFixed(2)} €</b>
            {pago.recibo ? <> y ya tienes la factura <b>#{pago.recibo}</b>.</> : '.'}
          </p>
        </div>
      </div>

      {pdf && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: 'var(--bg-3)', marginTop: 12 }}>
          <iframe src={pdf} title="Factura" style={{ width: '100%', height: 460, border: 0, display: 'block' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {pdf && (
          <>
            <a className="btn btn-outline btn-sm" href={`${pdf}?descargar=1`}>
              <I.Print /> Descargar la factura
            </a>
            <a className="btn btn-outline btn-sm" href={pdf} target="_blank" rel="noreferrer">
              <I.Eye /> Abrirlo aparte
            </a>
          </>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={onCerrar}>Volver a Pagos y recibos</button>
      </div>
    </div>
  );
}

// Los dos botoncitos de cada recibo: verlo y guardarlo.
function BotonesRecibo({ id }) {
  const [viendo, setViendo] = useState(false);
  return (
    <>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-sm btn-outline" title="Ver la factura"
          onClick={(e) => { e.stopPropagation(); setViendo(v => !v); }}>
          <I.Eye /> Ver
        </button>
        <a className="btn btn-sm btn-outline" title="Descargar la factura"
          href={`/api/me/recibos/${id}/pdf?descargar=1`} onClick={(e) => e.stopPropagation()}>
          <I.Print /> PDF
        </a>
      </div>
      {viendo && (
        <div style={{ gridColumn: '1 / -1', width: '100%', marginTop: 10 }}>
          <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: 'var(--bg-3)' }}>
            <iframe src={`/api/me/recibos/${id}/pdf`} title={`Factura ${id}`}
              style={{ width: '100%', height: 460, border: 0, display: 'block' }} />
          </div>
          <a href={`/api/me/recibos/${id}/pdf`} target="_blank" rel="noreferrer"
            style={{ display: 'inline-block', marginTop: 6, fontSize: 12, color: 'var(--purple)', fontWeight: 700 }}>
            ¿No se ve? Ábrelo en otra pestaña
          </a>
        </div>
      )}
    </>
  );
}

// ── Pagar por internet ───────────────────────────────────────────────────────
// Los recibos pendientes de la familia y el botón que lleva al TPV del banco.
// La tarjeta se teclea en la pasarela, aquí no se ve ni se guarda nunca.
function PagoPendiente({ onPagado, onPagoHecho }) {
  const [datos, setDatos] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    fetch('/api/me/cargos', { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setDatos(d);
        setSel(new Set((d?.lineas || []).map(l => l.cargoId)));
      })
      .catch(() => setDatos(null));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  // Si en secretaría cobran un recibo, desaparece de aquí sin recargar.
  useEnVivo(cargar, { cada: 12000 });

  // Al volver del banco se comprueba cómo acabó el pago.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('p');
    if (!p) return;
    let intentos = 0;
    const mirar = () => {
      fetch(`/api/me/pagos/${p}`, { credentials: 'include', cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d) return;
          if (d.estado === 'pagado') { onPagado?.(d); onPagoHecho?.(d); cargar(); return; }
          if (d.estado === 'rechazado') { setError(d.motivo || 'El pago no se ha podido completar.'); cargar(); return; }
          // Puede tardar un instante en llegarnos el aviso del banco.
          if (++intentos < 6) setTimeout(mirar, 1500);
        })
        .catch(() => {});
    };
    mirar();
    window.history.replaceState({}, '', window.location.pathname);
  }, [cargar, onPagado]);

  const lineas = datos?.lineas || [];
  const elegidas = lineas.filter(l => sel.has(l.cargoId));
  const total = elegidas.reduce((t, l) => t + Number(l.total || 0), 0);

  function alternar(id) {
    setSel(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // Se va al banco con un formulario: es como exige el TPV virtual.
  async function pagar() {
    setYendo(true); setError('');
    try {
      const r = await fetch('/api/me/pagos/iniciar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ cargoIds: [...sel] }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'No se ha podido iniciar el pago.'); setYendo(false); return; }
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = d.url;
      for (const [k, v] of Object.entries(d.campos)) {
        const i = document.createElement('input');
        i.type = 'hidden'; i.name = k; i.value = v;
        form.appendChild(i);
      }
      document.body.appendChild(form);
      form.submit();
    } catch {
      setError('No hay conexión con el servidor.');
      setYendo(false);
    }
  }

  if (!datos || !lineas.length) {
    return error ? (
      <div className="panel">
        <h2><I.CreditCard /> Pagar por internet</h2>
        <p style={{ color: 'var(--red, #E5484D)', fontWeight: 600, fontSize: 14 }}>{error}</p>
      </div>
    ) : null;
  }

  return (
    <div className="panel">
      <h2><I.CreditCard /> Pendiente de pago</h2>
      <p className="sub">Elige lo que quieres pagar. La tarjeta se introduce en la pasarela del banco: aquí no se guarda.</p>

      {error && (
        <p style={{ color: '#E5484D', fontWeight: 600, fontSize: 14, marginTop: 0 }}>{error}</p>
      )}

      {lineas.map(l => (
        <label key={l.cargoId} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--line-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={sel.has(l.cargoId)} onChange={() => alternar(l.cargoId)}
            style={{ width: 18, height: 18, accentColor: 'var(--purple)' }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 15 }}>{l.descripcion}</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
              {l.alumno}{l.mes ? ` · ${mesRec(l.mes)}` : ''}
              {l.descuentoMensPct > 0 ? ` · ${l.descuentoMensPct}% por varias mensualidades` : ''}
            </span>
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>{eurRec(l.total)}</span>
        </label>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <span style={{ flex: 1, minWidth: 120 }}>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)' }}>Total a pagar</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26 }}>{eurRec(total)}</span>
        </span>
        <button className="btn btn-primary" disabled={!sel.size || yendo || total <= 0} onClick={pagar}>
          {yendo ? 'Conectando con el banco...' : 'Pagar con tarjeta'}
        </button>
      </div>
      {datos.ahorro > 0 && sel.size === lineas.length && (
        <p style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 700, margin: '8px 0 0' }}>
          Pagándolo todo junto te ahorras {eurRec(datos.ahorro)}.
        </p>
      )}
    </div>
  );
}

function DashPayments() {
  const [recibos, setRecibos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [abierto, setAbierto] = useState(null);
  const [gracias, setGracias] = useState(null);   // pago recién hecho, para agradecerlo

  useEffect(() => {
    fetch('/api/me/recibos', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setRecibos(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const validos = recibos.filter(r => r.estado !== 'anulado');
  const totalPagado = validos.reduce((s, r) => s + (r.importe || 0), 0);

  const recargar = useCallback(() => {
    fetch('/api/me/recibos', { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then(d => setRecibos(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);
  // Un cobro en secretaría también genera recibo: aparece aquí sin recargar.
  useEnVivo(recargar, { cada: 12000 });

  return (
    <>
      {gracias && <GraciasPorPagar pago={gracias} onCerrar={() => setGracias(null)} />}
      <PagoPendiente onPagado={recargar} onPagoHecho={setGracias} />
      {validos.length > 0 && (
        <div className="dash-cards" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="stat-card">
            <div className="l">Total pagado</div>
            <div className="v">{eurRec(totalPagado)}</div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-2)' }}>{validos.length} recibo{validos.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="stat-card">
            <div className="l">Último pago</div>
            <div className="v">{fmtFecha(validos[0]?.fecha)}</div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-2)' }}>{nombreMedioPago(validos[0]?.medioPago)}</div>
          </div>
        </div>
      )}

      <div className="panel">
        <h2><I.Wallet /> Mis facturas</h2>
        <p className="sub">Los pagos de la familia. Toca uno para ver el detalle.</p>

        {loading && <EmptyState text="Cargando recibos..." />}
        {!loading && recibos.length === 0 && (
          <EmptyState icon={<I.Wallet />} text="Todavía no hay facturas de la familia. Aparecerán aquí en cuanto hagáis un pago en el club." />
        )}

        {recibos.map(r => {
          const anulado = r.estado === 'anulado';
          const open = abierto === r.numero;
          return (
            <div key={r.numero} style={{ borderBottom: '1px solid var(--line-2)' }}>
              <div style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '14px 0', opacity: anulado ? .55 : 1 }}>
                <button onClick={() => setAbierto(open ? null : r.numero)}
                  style={{ flex: 1, minWidth: 160, textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                    Factura #{r.numero}
                    {anulado && <span className="status-pill pending" style={{ marginLeft: 8 }}>Anulado</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                    {fmtFecha(r.fecha, '')}{r.medioPago ? ` · ${nombreMedioPago(r.medioPago)}` : ''}
                  </div>
                </button>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, textDecoration: anulado ? 'line-through' : 'none' }}>
                  {eurRec(r.importe)}
                </div>
                {r.mia
                  ? <BotonesRecibo id={r.id} />
                  : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', background: 'color-mix(in oklab, var(--teal) 12%, transparent)', borderRadius: 999, padding: '3px 10px' }}>
                      Pagado por {r.pagador}
                    </span>}
              </div>
              {open && (
                <div style={{ padding: '0 0 14px', display: 'grid', gap: 6 }}>
                  {r.lineas.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Sin detalle disponible.</p>}
                  {r.lineas.map((l, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, background: 'var(--bg-3)', borderRadius: 8, padding: '8px 12px' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{l.descripcion}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'capitalize' }}>{l.alumno} · {mesRec(l.mes)}</div>
                      </div>
                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{eurRec(l.importe + l.importe * l.ivaPct / 100)}</div>
                    </div>
                  ))}
                  {anulado && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--orange)' }}>
                      Este recibo fue anulado por el club. Si tienes dudas, pregúntanos.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Campamento de verano (vista familia) ──
const EMPTY_KID = { nombre: '', apellidos: '', edad: '', alergias: '', observaciones: '', contacto: '', recogida: '', fotosRrss: false, days: [] };

function DashCamp() {
  const [weeks, setWeeks] = useState([]);
  const [kids, setKids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);        // datos del niño (nuevo si !form.id)
  const [saving, setSaving] = useState(false);
  const [daysOpenFor, setDaysOpenFor] = useState(null);  // kid.id con selector de días abierto
  const [daysDraft, setDaysDraft] = useState([]);
  const [errorDias, setErrorDias] = useState('');
  const [diaryOpenFor, setDiaryOpenFor] = useState(null); // kid.id con diario abierto
  const [diary, setDiary] = useState([]);
  const [diaryLoading, setDiaryLoading] = useState(false);

  async function loadAll() {
    try {
      const [wRes, kRes] = await Promise.all([
        fetch('/api/camp/weeks', { credentials: 'include' }),
        fetch('/api/camp/children', { credentials: 'include' }),
      ]);
      if (wRes.ok) setWeeks(await wRes.json());
      if (kRes.ok) setKids(await kRes.json());
    } catch { /* noop */ }
    finally { setLoading(false); }
  }
  useEffect(() => { loadAll(); }, []);

  async function submitKid(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const isEdit = !!form.id;
      const r = await fetch(isEdit ? `/api/camp/children/${form.id}` : '/api/camp/children', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...form, edad: form.edad || null }),
      });
      if (r.ok) { setForm(null); await loadAll(); }
      else { const d = await r.json(); alert(d.error || 'Error al guardar.'); }
    } catch { alert('Error de conexión.'); }
    finally { setSaving(false); }
  }

  // Guardar los días. El servidor tiene la última palabra: comprueba plazas,
  // festivos, días pasados y si ya hay algo cobrado.
  async function saveDays(kid) {
    setSaving(true); setErrorDias('');
    try {
      const r = await fetch(`/api/camp/children/${kid.id}/days`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ days: daysDraft }),
      });
      if (r.ok) { setDaysOpenFor(null); await loadAll(); }
      else { const d = await r.json(); setErrorDias(d.error || 'No se han podido guardar los días.'); }
    } catch { setErrorDias('No hay conexión con el servidor.'); }
    finally { setSaving(false); }
  }

  async function openDiary(kid) {
    if (diaryOpenFor === kid.id) { setDiaryOpenFor(null); return; }
    setDiaryOpenFor(kid.id);
    setDiaryLoading(true);
    setDiary([]);
    try {
      const r = await fetch(`/api/camp/children/${kid.id}/diary`, { credentials: 'include' });
      if (r.ok) setDiary(await r.json());
    } catch { /* noop */ }
    finally { setDiaryLoading(false); }
  }

  const kidFields = (
    <>
      <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field"><label>Nombre</label><input value={form?.nombre || ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required /></div>
        <div className="field"><label>Apellidos</label><input value={form?.apellidos || ''} onChange={e => setForm(f => ({ ...f, apellidos: e.target.value }))} required /></div>
      </div>
      <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12 }}>
        <div className="field"><label>Edad</label><input type="number" min="2" max="17" value={form?.edad || ''} onChange={e => setForm(f => ({ ...f, edad: e.target.value }))} /></div>
        <div className="field"><label>Teléfono de contacto</label><input value={form?.contacto || ''} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} placeholder="+34 600 000 000" /></div>
      </div>
      <div className="field"><label>Alergias / intolerancias</label><input value={form?.alergias || ''} onChange={e => setForm(f => ({ ...f, alergias: e.target.value }))} placeholder="Ej. frutos secos, lactosa..." /></div>
      <div className="field"><label>Personas autorizadas a recogerle</label><input value={form?.recogida || ''} onChange={e => setForm(f => ({ ...f, recogida: e.target.value }))} placeholder="Ej. madre, abuela Carmen..." /></div>
      <div className="field"><label>Observaciones para los monitores</label><textarea rows={2} value={form?.observaciones || ''} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} style={{ fontFamily: 'inherit', fontSize: 14, padding: 12, background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)', resize: 'vertical' }} placeholder="Medicación, necesidades especiales, miedos..." /></div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!form?.fotosRrss} onChange={e => setForm(f => ({ ...f, fotosRrss: e.target.checked }))} />
        Autorizo el uso de fotos en redes sociales del club
      </label>
    </>
  );

  return (
    <>
      <div className="panel">
        <h2><I.Sun /> Campamento de verano</h2>
        <p className="sub">Inscribe a tus hijos, elige los días que les quedan por venir y sigue su día a día.</p>

        {loading && <EmptyState text="Cargando campamento..." />}

        {!loading && weeks.length === 0 && (
          <EmptyState icon={<I.Sun />} text="El campamento aún no tiene fechas publicadas. Vuelve pronto." />
        )}

        {!loading && weeks.length > 0 && kids.length === 0 && !form && (
          <div style={{ textAlign: 'center', padding: '28px 16px' }}>
            <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '0 0 16px' }}>
              Todavía no has inscrito a ningún niño/a.
            </p>
            <button className="btn btn-gradient" onClick={() => setForm({ ...EMPTY_KID })}>
              <I.Plus /> Inscribir a mi hijo/a
            </button>
          </div>
        )}

        {!loading && kids.length > 0 && (
          <div style={{ display: 'grid', gap: 14, marginTop: 8 }}>
            {kids.map(kid => (
              <div key={kid.id} style={{ background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 14, padding: '14px 16px', display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>
                      {kid.nombre} {kid.apellidos}
                      {kid.edad ? <span style={{ fontWeight: 600, color: 'var(--ink-3)', marginLeft: 6, fontSize: 12 }}>{kid.edad} años</span> : null}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, fontSize: 11 }}>
                      <span style={{ background: 'var(--bg-2)', color: 'var(--ink-2)', fontWeight: 700, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)' }}>
                        {(kid.days || []).length} día{(kid.days || []).length !== 1 ? 's' : ''} elegido{(kid.days || []).length !== 1 ? 's' : ''}
                      </span>
                      {kid.apuntadoPor && (
                        <span style={{ background: 'color-mix(in oklab, var(--purple) 12%, transparent)', color: 'var(--purple)', fontWeight: 800, padding: '2px 8px', borderRadius: 999 }}>
                          Apuntado por {kid.apuntadoPor}
                        </span>
                      )}
                      <span style={{ fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: kid.pagado ? 'var(--teal)' : 'var(--orange)', background: `color-mix(in oklab, ${kid.pagado ? 'var(--teal)' : 'var(--orange)'} 12%, var(--bg-2))` }}>
                        {kid.pagado ? 'Pagado' : 'Pago pendiente'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-outline" onClick={() => {
                      if (daysOpenFor === kid.id) { setDaysOpenFor(null); return; }
                      setDaysOpenFor(kid.id); setDaysDraft([...(kid.days || [])]); setDiaryOpenFor(null);
                    }}>
                      <I.Calendar /> Días
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => { openDiary(kid); setDaysOpenFor(null); }}>
                      <I.Newspaper /> Diario
                    </button>
                    <button className="icon-btn" onClick={() => setForm({ id: kid.id, nombre: kid.nombre, apellidos: kid.apellidos, edad: kid.edad || '', alergias: kid.alergias || '', observaciones: kid.observaciones || '', contacto: kid.contacto || '', recogida: kid.recogida || '', fotosRrss: !!kid.fotosRrss })} aria-label="Editar datos"><I.Edit /></button>
                  </div>
                </div>

                {daysOpenFor === kid.id && (
                  <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 12, display: 'grid', gap: 12 }}>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.55 }}>
                      Puedes apuntarle a los días que quedan y tienen plaza. Los días que ya han pasado no se
                      tocan{kid.pagado ? ', y como el campamento ya está pagado, para quitar días habla con el club' : ''}.
                    </p>
                    <CampDayPicker weeks={weeks} selected={daysDraft} onChange={setDaysDraft} bloquearPasados />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                      {errorDias && <span style={{ flex: 1, fontSize: 12, color: '#E5484D', fontWeight: 700 }}>{errorDias}</span>}
                      <button className="btn btn-sm btn-outline" onClick={() => setDaysOpenFor(null)}>Cancelar</button>
                      <button className="btn btn-sm btn-primary" disabled={saving} onClick={() => saveDays(kid)}>
                        {saving ? 'Guardando...' : `Guardar (${daysDraft.length} días)`}
                      </button>
                    </div>
                  </div>
                )}

                {diaryOpenFor === kid.id && (
                  <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 12 }}>
                    {diaryLoading && <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>Cargando diario...</p>}
                    {!diaryLoading && diary.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>Aún no hay anotaciones de los monitores.</p>}
                    {!diaryLoading && diary.map(d => (
                      <div key={d.day} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line-2)', alignItems: 'flex-start' }}>
                        <span style={{
                          flexShrink: 0, fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
                          color: d.asistio ? 'var(--teal)' : d.asistio === false ? 'var(--orange)' : 'var(--ink-3)',
                          background: `color-mix(in oklab, ${d.asistio ? 'var(--teal)' : d.asistio === false ? 'var(--orange)' : 'var(--ink-3)'} 12%, var(--bg-2))`,
                        }}>
                          {d.asistio ? '✓' : d.asistio === false ? '✗' : '·'}
                        </span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', textTransform: 'capitalize' }}>{campFmtLong(d.day)}</div>
                          {d.note
                            ? <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{d.note}</p>
                            : <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>{d.asistio ? 'Asistió — sin anotaciones.' : d.asistio === false ? 'No asistió.' : 'Sin registro.'}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {!form && (
              <div>
                <button className="btn btn-sm btn-outline" onClick={() => setForm({ ...EMPTY_KID })}>
                  <I.Plus /> Inscribir a otro hijo/a
                </button>
              </div>
            )}
          </div>
        )}

        {form && (
          <form onSubmit={submitKid} style={{ marginTop: 18, background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 14, padding: 18, display: 'grid', gap: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{form.id ? `Editar datos de ${form.nombre}` : 'Inscribir niño/a al campamento'}</div>
            {kidFields}
            {!form.id && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>¿Qué días asistirá?</div>
                <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 10px' }}>Puedes cambiarlos más adelante desde esta misma pantalla.</p>
                <CampDayPicker weeks={weeks} selected={form.days || []} onChange={days => setForm(f => ({ ...f, days }))} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : (form.id ? 'Guardar cambios' : 'Inscribir')}</button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

function DashWallet() {
  return (
    <div className="panel">
      <h2><I.CreditCard /> Tu cartera de comisiones</h2>
      <p className="sub">Gana recompensas por cada familia que se inscriba con tu código.</p>
      <EmptyState icon={<I.CreditCard />} text="La cartera de comisiones aún no está disponible. Pronto podrás ver tu código de referido y tu saldo aquí." />
    </div>
  );
}

const CAT_COLOR = { ballet: "var(--pink)", taekwondo: "var(--teal)", ingles: "var(--blue)", robotica: "var(--yellow)", pintura: "var(--purple)", funcional: "var(--orange)", general: "var(--purple)", club: "var(--purple)", competicion: "var(--teal)" };

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "Hace menos de 1h";
  if (h < 24) return `Hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Ayer";
  if (d < 7) return `Hace ${d} días`;
  return `Hace ${Math.floor(d / 7)} semana${Math.floor(d / 7) > 1 ? "s" : ""}`;
}

function DashProfile({ user }) {
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(() => {
    fetch('/api/me/perfil', { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setDatos(d);
        setForm({ telefono: d.telefono || '', ...Object.fromEntries(
          ['dni', 'domicilio', 'cp', 'poblacion'].map(c => [c, d.fiscales[c] || ''])) });
      })
      .catch(() => {});
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEnVivo(cargar, { cada: 20000 });

  if (!datos || !form) {
    return <div className="panel"><h2><I.User /> Perfil de la familia</h2><EmptyState text="Cargando tus datos..." /></div>;
  }

  const cambiaFiscal = ['dni', 'domicilio', 'cp', 'poblacion']
    .some(c => (form[c] || '') !== (datos.fiscales[c] || ''));
  const necesitaVisto = datos.yaRellenados && cambiaFiscal;

  async function guardar() {
    setGuardando(true); setAviso('');
    try {
      const r = await fetch('/api/me/perfil', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { setAviso(d.error || 'No se ha podido guardar.'); return; }
      setAviso(d.requiereVisto
        ? 'Enviado. El club tiene que dar el visto bueno al cambio; mientras tanto siguen los datos de antes.'
        : 'Datos guardados.');
      cargar();
    } catch { setAviso('No hay conexión con el servidor.'); }
    finally { setGuardando(false); }
  }

  const campo = (k, etiqueta, extra = {}) => (
    <div className="field">
      <label>{etiqueta}</label>
      <input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} {...extra} />
    </div>
  );

  return (
    <div className="panel">
      <h2><I.User /> Perfil de la familia</h2>
      <p className="sub">Tus datos de contacto y los que salen en las facturas.</p>

      {datos.pendiente && (
        <div style={{
          marginTop: 14, padding: '12px 14px', borderRadius: 12,
          background: 'color-mix(in oklab, var(--orange) 10%, transparent)',
          border: '1px solid color-mix(in oklab, var(--orange) 35%, transparent)',
        }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--orange)' }}>Tienes un cambio esperando al club</div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.5 }}>
            Has pedido cambiar a: {[datos.pendiente.dni, datos.pendiente.domicilio,
              [datos.pendiente.cp, datos.pendiente.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || '(vacío)'}.
            <br />Hasta que lo autoricen, tus facturas salen con los datos de antes.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
        <div className="field"><label>Nombre</label><input value={datos.nombre || ''} readOnly /></div>
        <div className="field"><label>Apellidos</label><input value={datos.apellidos || ''} readOnly /></div>
        <div className="field"><label>Email</label><input type="email" value={datos.email || ''} readOnly /></div>
        {campo('telefono', 'Teléfono', { type: 'tel', placeholder: '600 000 000' })}
      </div>

      <div style={{ marginTop: 24, borderTop: '1px solid var(--line)', paddingTop: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)' }}>
          Datos para la factura
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.55 }}>
          {datos.yaRellenados
            ? 'Estos datos ya han salido en facturas emitidas, así que cambiarlos tiene que autorizarlo el club.'
            : 'Rellénalos una vez y saldrán en todas tus facturas. Después, para cambiarlos habrá que pedírselo al club.'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          {campo('dni', 'DNI / NIF', { placeholder: '12345678Z' })}
          {campo('domicilio', 'Domicilio', { placeholder: 'Calle, número, piso' })}
          {campo('cp', 'Código postal', { placeholder: '11201' })}
          {campo('poblacion', 'Población', { placeholder: 'Algeciras' })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 18 }}>
        <button className="btn btn-primary" disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando...' : necesitaVisto ? 'Pedir el cambio' : 'Guardar'}
        </button>
        {necesitaVisto && (
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            El club recibirá tu petición y la revisará.
          </span>
        )}
        {aviso && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)' }}>{aviso}</span>}
      </div>

      <p style={{ marginTop: 22, fontSize: 13, color: 'var(--ink-3)' }}>
        Para cambiar los datos de tus hijos, habla con el club.
      </p>
    </div>
  );
}

function DashSettings() {
  return (
    <div className="panel">
      <h2><I.Settings /> Ajustes</h2>
      <p className="sub">Notificaciones, idioma, seguridad y datos.</p>

      <div style={{display: "grid", gap: 12, marginTop: 18}}>
        {[
          { t: "Avisos del club por email", desc: "Eventos, convocatorias y noticias." },
          { t: "Avisos de mi actividad por email", desc: "Solo las clases que sigo." },
          { t: "Newsletter mensual", desc: "Lo más destacado del mes." },
        ].map((s, i) => (
          <label key={i} style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 14, cursor: "pointer"}}>
            <div>
              <div style={{fontWeight: 700}}>{s.t}</div>
              <div style={{fontSize: 12, color: "var(--ink-3)", marginTop: 2}}>{s.desc}</div>
            </div>
            <input type="checkbox" defaultChecked={i < 2} style={{width: 36, height: 20, accentColor: "var(--teal)"}} />
          </label>
        ))}
      </div>
    </div>
  );
}

export default function StudentDashboard({ user, onLogout, subroute = "overview" }) {
  const { go } = useRouter();
  const [view, setView] = useState(subroute);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => { setView(subroute); }, [subroute]);

  const initials = `${user?.firstName?.[0] || ""}${user?.lastName?.[0] || ""}`.toUpperCase() || "?";
  const familyLabel = user?.lastName ? `Familia ${user.lastName}` : (user?.firstName || "Mi familia");

  const navItems = [
    { id: "overview", label: "Resumen", icon: <I.Dashboard /> },
    { id: "classes", label: "Mis clases", icon: <I.Calendar /> },
    { id: "camp", label: "Campamento", icon: <I.Sun /> },
    { id: "attendance", label: "Asistencia", icon: <I.Check /> },
    { id: "payments", label: "Pagos y recibos", icon: <I.Wallet /> },
    { id: "wallet", label: "Mi cartera", icon: <I.CreditCard /> },
  ];
  const settingsItems = [
    { id: "profile", label: "Perfil", icon: <I.User /> },
    { id: "settings", label: "Ajustes", icon: <I.Settings /> },
    { id: "support", label: "Soporte", icon: <I.Shield /> },
  ];

  async function handleLogout() {
    if (onLogout) await onLogout();
    else go("/");
  }

  function navTo(id) { setView(id); setSidebarOpen(false); }

  return (
    <main style={{paddingTop: 0}}>
      {sidebarOpen && <div className="dash-overlay" onClick={() => setSidebarOpen(false)} />}
      <div className="dash-layout">
        <aside className={`dash-side${sidebarOpen ? ' is-open' : ''}`}>
          <div className="brand">
            <AimLogo size="sm" auto onClick={() => go("/")} />
            <div className="role">Zona de familias</div>
          </div>

          <nav className="dash-nav">
            <div className="heading">{familyLabel}</div>
            {navItems.map(it => (
              <button key={it.id} className={view === it.id ? "is-active" : ""} onClick={() => navTo(it.id)}>
                <span className="ico">{it.icon}</span>
                <span>{it.label}</span>
              </button>
            ))}
            <div className="heading">Cuenta</div>
            {settingsItems.map(it => (
              <button key={it.id} className={view === it.id ? "is-active" : ""} onClick={() => navTo(it.id)}>
                <span className="ico">{it.icon}</span>
                <span>{it.label}</span>
              </button>
            ))}
            {/* Vuelta al panel para quien además trabaja en el club. */}
            {user?.canAccessAdmin && (
              <button onClick={() => { go("/admin"); setSidebarOpen(false); }} style={{marginTop: 16, borderTop: "1px dashed var(--line-2)", paddingTop: 16, fontWeight: 700}}>
                <span className="ico"><I.Dashboard width={16} height={16} /></span>
                <span>Panel de admin</span>
              </button>
            )}
            <button onClick={() => { go("/"); setSidebarOpen(false); }} style={{marginTop: user?.canAccessAdmin ? 8 : 16, borderTop: user?.canAccessAdmin ? 0 : "1px dashed var(--line-2)", paddingTop: user?.canAccessAdmin ? 0 : 16}}>
              <span className="ico"><I.Globe width={16} height={16} /></span>
              <span>Volver a la Web</span>
            </button>
            <button onClick={handleLogout} style={{marginTop: 8}}>
              <span className="ico"><I.LogOut /></span>
              <span>Cerrar sesión</span>
            </button>
          </nav>
        </aside>

        <div className="dash-main">
          <div className="dash-topbar">
            <div style={{display: "flex", gap: 12, alignItems: "center"}}>
              <button className="btn btn-icon dash-hamburger" aria-label="Menú" onClick={() => setSidebarOpen(o => !o)}>
                <I.Menu />
              </button>
              <div>
                <p style={{margin: 0, fontSize: 13, color: "var(--ink-3)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase"}}>
                  {navItems.concat(settingsItems).find(i => i.id === view)?.label || "Resumen"}
                </p>
                <h1>
                  {view === "overview"
                    ? <>{"¡Hola "}<span className="grad">{user?.firstName || ""}</span>!</>
                    : navItems.concat(settingsItems).find(i => i.id === view)?.label}
                </h1>
                {view === "overview" && <p style={{margin: "6px 0 0", color: "var(--ink-3)"}}>Este es el resumen de tu familia esta semana.</p>}
              </div>
            </div>
            <div style={{display: "flex", gap: 12, alignItems: "center"}}>
              <Campanita url="/api/me/notificaciones" onIr={(destino) => navTo(destino)}
                vacio="No tienes nada pendiente ahora mismo." />
              <div className="avatar">{initials}</div>
            </div>
          </div>

          {view === "overview" && <DashOverview go={go} setView={setView} />}
          {view === "classes" && <DashClasses />}
          {view === "camp" && <DashCamp />}
          {view === "attendance" && <DashAttendance />}
          {view === "payments" && <DashPayments />}
          {view === "wallet" && <DashWallet />}
          {view === "profile" && <DashProfile user={user} />}
          {view === "settings" && <DashSettings />}
          {view === "support" && <UserSupport user={user} />}
        </div>
      </div>
    </main>
  );
}
