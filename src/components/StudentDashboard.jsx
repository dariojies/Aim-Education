import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';
import { AimLogo, ACT_BY_ID, CampDayPicker, campFmtLong } from './Shared.jsx';
import { useRouter } from '../App.jsx';
import { UserSupport } from './AdminSupport.jsx';

function EmptyState({ icon, text }) {
  return (
    <div style={{display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "44px 20px", color: "var(--ink-3)", textAlign: "center"}}>
      {icon && <div style={{opacity: .45, transform: "scale(1.5)"}}>{icon}</div>}
      <p style={{margin: 0, fontSize: 14, maxWidth: 360, lineHeight: 1.5}}>{text}</p>
    </div>
  );
}

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function DashOverview({ go, setView }) {
  const [slots, setSlots] = useState([]);
  const [groups, setGroups] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/me/groups', { credentials: 'include' }).then(r => r.ok ? r.json() : { groups: [], slots: [] }),
      fetch('/api/me/attendance', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/posts?limit=3').then(r => r.ok ? r.json() : []),
    ]).then(([g, at, p]) => {
      setGroups(g.groups || []);
      setSlots(g.slots || []);
      setAttendance(Array.isArray(at) ? at : []);
      setPosts(Array.isArray(p) ? p : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const weekClasses = [...slots].sort((a, b) => (a.d - b.d) || (a.s - b.s)).slice(0, 6);
  const attWithRecords = attendance.filter(a => a.total > 0);
  const totAttended = attWithRecords.reduce((s, a) => s + a.attended, 0);
  const totSessions = attWithRecords.reduce((s, a) => s + a.total, 0);
  const attPct = totSessions > 0 ? Math.round((totAttended / totSessions) * 100) : null;

  return (
    <>
      <div className="dash-cards" style={{gridTemplateColumns: "repeat(2, 1fr)"}}>
        <div className="stat-card act-taekwondo">
          <div className="corner"><I.Calendar /></div>
          <div className="l">Mis clases</div>
          <div className="v">{groups.length}</div>
          <div style={{marginTop: 8, fontSize: 13, color: "var(--ink-2)"}}>{groups.length === 1 ? "grupo matriculado" : "grupos matriculados"}</div>
        </div>
        <div className="stat-card act-ballet">
          <div className="corner"><I.Check /></div>
          <div className="l">Mi asistencia</div>
          <div className="v">{attPct != null ? `${attPct}%` : "—"}</div>
          <div style={{marginTop: 8, fontSize: 13, color: "var(--ink-2)"}}>{attPct != null ? "del trimestre" : "sin registros aún"}</div>
        </div>
      </div>

      <div className="panel">
        <h2><I.Calendar /> Mi horario de esta semana</h2>
        <p className="sub">Tus clases programadas.</p>
        {loading ? (
          <EmptyState text="Cargando horario..." />
        ) : weekClasses.length === 0 ? (
          <EmptyState icon={<I.Calendar />} text="No estás matriculado/a en ninguna clase todavía." />
        ) : (
          <div className="classes-grid">
            {weekClasses.map((c) => {
              const a = ACT_BY_ID[c.act];
              return (
                <div key={c.id} className={`class-row ${a?.className || ""}`}>
                  <div className="day"><div className="d">{(DAY_NAMES[c.d] || "").slice(0, 3)}</div><div className="w">{a?.name || c.act}</div></div>
                  <div className="info">
                    <h4>{c.title}</h4>
                    <p>{c.time || `${c.s}:00`} · {c.room}</p>
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
          {receipts.length === 0 ? (
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
              <div style={{fontSize: 12, opacity: .8, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700}}>Total registrado</div>
              <div style={{fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 800, letterSpacing: "-.025em", marginTop: 6}}>{totalPaid.toLocaleString("es-ES", {minimumFractionDigits: 2})}€</div>
              <div style={{fontSize: 12, marginTop: 8, opacity: .9}}>{receipts.length} recibo{receipts.length !== 1 ? "s" : ""}</div>
              <button className="btn" style={{background: "var(--ink)", color: "white", marginTop: 14}} onClick={() => setView("payments")}>
                Ver recibos <I.Arrow />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DashClasses() {
  const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const [groups, setGroups] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);

  useEffect(() => {
    fetch('/api/me/groups', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { groups: [], slots: [] })
      .then(data => {
        setGroups(data.groups || []);
        setSlots(data.slots || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const HOURS = Array.from({length: 14}, (_, i) => 9 + i);

  if (loading) {
    return <div className="panel"><h2><I.Calendar /> Mis clases</h2><EmptyState text="Cargando tus clases..." /></div>;
  }
  if (groups.length === 0) {
    return (
      <div className="panel">
        <h2><I.Calendar /> Mis clases</h2>
        <p className="sub">Tus grupos y tu horario.</p>
        <EmptyState icon={<I.Calendar />} text="No estás matriculado/a en ninguna clase todavía. Habla con el club para apuntarte y aquí verás tu horario." />
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <h2><I.Calendar /> Mis grupos</h2>
        <p className="sub">Las clases en las que estás matriculado/a.</p>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 14}}>
          {groups.map(g => {
            const a = ACT_BY_ID[g.act];
            return (
              <div key={g.id} style={{background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 14, padding: 16, borderLeft: `4px solid ${a?.color || "var(--ink)"}`}}>
                <div style={{fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: a?.color || "var(--ink-3)"}}>{g.activityName}</div>
                <div style={{fontWeight: 700, fontSize: 15, margin: "4px 0"}}>{g.name}</div>
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

function DashPayments() {
  const [recibos, setRecibos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [abierto, setAbierto] = useState(null);

  useEffect(() => {
    fetch('/api/me/recibos', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setRecibos(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const validos = recibos.filter(r => r.estado !== 'anulado');
  const totalPagado = validos.reduce((s, r) => s + (r.importe || 0), 0);

  return (
    <>
      {validos.length > 0 && (
        <div className="dash-cards" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="stat-card">
            <div className="l">Total pagado</div>
            <div className="v">{eurRec(totalPagado)}</div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-2)' }}>{validos.length} recibo{validos.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="stat-card">
            <div className="l">Último pago</div>
            <div className="v">{validos[0]?.fecha ? new Date(validos[0].fecha).toLocaleDateString('es-ES') : '—'}</div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-2)', textTransform: 'capitalize' }}>{validos[0]?.medioPago || ''}</div>
          </div>
        </div>
      )}

      <div className="panel">
        <h2><I.Wallet /> Mis recibos</h2>
        <p className="sub">Los pagos hechos en el club. Toca un recibo para ver el detalle.</p>

        {loading && <EmptyState text="Cargando recibos..." />}
        {!loading && recibos.length === 0 && (
          <EmptyState icon={<I.Wallet />} text="Todavía no hay recibos a tu nombre. Aparecerán aquí en cuanto hagas un pago en el club." />
        )}

        {recibos.map(r => {
          const anulado = r.estado === 'anulado';
          const open = abierto === r.numero;
          return (
            <div key={r.numero} style={{ borderBottom: '1px solid var(--line-2)' }}>
              <button
                onClick={() => setAbierto(open ? null : r.numero)}
                style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'center', padding: '14px 0', background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', opacity: anulado ? .55 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                    Recibo #{r.numero}
                    {anulado && <span className="status-pill pending" style={{ marginLeft: 8 }}>Anulado</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2, textTransform: 'capitalize' }}>
                    {r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES') : ''}{r.medioPago ? ` · ${r.medioPago}` : ''}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, textDecoration: anulado ? 'line-through' : 'none' }}>
                  {eurRec(r.importe)}
                </div>
              </button>
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

  async function deleteKid(kid) {
    if (!window.confirm(`¿Dar de baja a ${kid.nombre} del campamento?`)) return;
    const r = await fetch(`/api/camp/children/${kid.id}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) loadAll();
  }

  async function saveDays(kid) {
    setSaving(true);
    try {
      const r = await fetch(`/api/camp/children/${kid.id}/days`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ days: daysDraft }),
      });
      if (r.ok) { setDaysOpenFor(null); await loadAll(); }
      else { const d = await r.json(); alert(d.error || 'Error al guardar los días.'); }
    } catch { alert('Error de conexión.'); }
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
        <p className="sub">Inscribe a tus hijos, elige los días que asistirán y sigue su día a día.</p>

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
                    <button className="icon-btn danger" onClick={() => deleteKid(kid)} aria-label="Dar de baja"><I.Trash /></button>
                  </div>
                </div>

                {daysOpenFor === kid.id && (
                  <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 12, display: 'grid', gap: 12 }}>
                    <CampDayPicker weeks={weeks} selected={daysDraft} onChange={setDaysDraft} />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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

function DashNews() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/posts?limit=10')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setPosts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="panel">
      <h2><I.Bell /> Avisos del club</h2>
      <p className="sub">Últimas noticias y comunicaciones del club.</p>
      {loading && <p style={{color: "var(--ink-3)", fontSize: 14}}>Cargando...</p>}
      {!loading && posts.length === 0 && <p style={{color: "var(--ink-3)", fontSize: 14}}>No hay noticias publicadas.</p>}
      {posts.map((n, i) => {
        const color = CAT_COLOR[n.category] || "var(--purple)";
        return (
          <div key={n.id} style={{display: "flex", gap: 14, padding: "18px 0", borderBottom: i < posts.length - 1 ? "1px solid var(--line-2)" : "0"}}>
            <div style={{width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 8, flexShrink: 0}} />
            <div style={{flex: 1}}>
              <div style={{display: "flex", justifyContent: "space-between", marginBottom: 6}}>
                <span style={{fontSize: 10, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color}}>{n.category || "Aim"}</span>
                <span style={{fontSize: 11, color: "var(--ink-3)"}}>{timeAgo(n.published_at || n.created_at)}</span>
              </div>
              <h4 style={{margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "var(--ink)"}}>{n.title}</h4>
              {n.excerpt && <p style={{margin: 0, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5}}>{n.excerpt}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DashProfile({ user }) {
  return (
    <div className="panel">
      <h2><I.User /> Perfil de la familia</h2>
      <p className="sub">Tus datos personales y los de tus alumnos.</p>

      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16}}>
        <div className="field"><label>Nombre tutor/a</label><input defaultValue={user?.firstName || ""} /></div>
        <div className="field"><label>Apellidos</label><input defaultValue={user?.lastName || ""} /></div>
        <div className="field"><label>Email</label><input type="email" defaultValue={user?.email || ""} readOnly /></div>
        <div className="field"><label>Teléfono</label><input defaultValue="" placeholder="+34 600 000 000" /></div>
        <div className="field"><label>DNI</label><input defaultValue="" placeholder="00000000A" /></div>
        <div className="field"><label>Dirección</label><input defaultValue="" placeholder="Calle, nº · Ciudad" /></div>
      </div>

      <p style={{marginTop: 24, fontSize: 13, color: "var(--ink-3)"}}>
        Para actualizar los datos de alumnos, contacta con el club en recepción o por email.
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
          { t: "Recordatorios SMS", desc: "Avisos 24h antes de cada clase." },
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
    { id: "news", label: "Avisos del club", icon: <I.Bell /> },
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
          <div className="brand"><AimLogo size="sm" sub /></div>

          <nav className="dash-nav">
            <div className="heading">{familyLabel}</div>
            {navItems.map(it => (
              <button key={it.id} className={view === it.id ? "is-active" : ""} onClick={() => navTo(it.id)}>
                <span className="ico">{it.icon}</span>
                <span>{it.label}</span>
                {it.id === "news" && <span className="dot" style={{background: "var(--teal)"}}/>}
              </button>
            ))}
            <div className="heading">Cuenta</div>
            {settingsItems.map(it => (
              <button key={it.id} className={view === it.id ? "is-active" : ""} onClick={() => navTo(it.id)}>
                <span className="ico">{it.icon}</span>
                <span>{it.label}</span>
              </button>
            ))}
            <button onClick={() => { go("/"); setSidebarOpen(false); }} style={{marginTop: 16, borderTop: "1px dashed var(--line-2)", paddingTop: 16}}>
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
                <h1>{view === "overview" ? `¡Hola ${user?.firstName || ""}!` : navItems.concat(settingsItems).find(i => i.id === view)?.label}</h1>
                {view === "overview" && <p style={{margin: "6px 0 0", color: "var(--ink-3)"}}>Este es el resumen de tu familia esta semana.</p>}
              </div>
            </div>
            <div style={{display: "flex", gap: 12, alignItems: "center"}}>
              <button className="btn btn-icon" aria-label="Notificaciones"><I.Bell /></button>
              <div className="avatar">{initials}</div>
            </div>
          </div>

          {view === "overview" && <DashOverview go={go} setView={setView} />}
          {view === "classes" && <DashClasses />}
          {view === "camp" && <DashCamp />}
          {view === "attendance" && <DashAttendance />}
          {view === "payments" && <DashPayments />}
          {view === "wallet" && <DashWallet />}
          {view === "news" && <DashNews />}
          {view === "profile" && <DashProfile user={user} />}
          {view === "settings" && <DashSettings />}
          {view === "support" && <UserSupport user={user} />}
        </div>
      </div>
    </main>
  );
}
