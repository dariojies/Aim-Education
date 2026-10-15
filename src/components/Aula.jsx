import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, MagicText } from './Shared.jsx';
import { useRouter } from '../App.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Aula virtual (ticket #433), la parte de quien hace los cursos:
//   /aula             el catálogo de cursos publicados
//   /aula/<id>        un curso: qué es, su temario y apuntarse (y pagar)
//   /aula/<id>/curso  el curso por dentro: lecciones, vídeos, archivos y tareas
// y «Mis cursos» en el área de familias (MisCursos).
// ─────────────────────────────────────────────────────────────────────────────

export const TIPO_LECCION = {
  texto: { nombre: 'Texto', icono: '📄' },
  video: { nombre: 'Vídeo', icono: '🎬' },
  archivo: { nombre: 'Archivo', icono: '📎' },
  tarea: { nombre: 'Tarea', icono: '✏️' },
};
export const mb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(b >= 10 * 1048576 ? 0 : 1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const euros = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;
const fmtHora = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');

// El reproductor de un enlace de YouTube o Vimeo (igual que en el servidor).
export function incrustarVideo(url) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/) || [])[1];
  if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/(?:\/video)?\/(\d{5,})(?:\/([0-9a-f]{6,}))?/);
    const h = m?.[2] || u.searchParams.get('h');
    if (m) return `https://player.vimeo.com/video/${m[1]}${h ? `?h=${h}` : ''}`;
  }
  return null;
}

// Un texto con sus saltos de línea y sus enlaces pulsables. Sin HTML: lo que
// se escribe es lo que se ve.
export function Texto({ texto }) {
  if (!texto) return null;
  return (
    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
      {String(texto).split(/(https?:\/\/[^\s<>"]+)/g).map((t, i) => (i % 2
        ? <a key={i} href={t} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--purple)', fontWeight: 600 }}>{t}</a>
        : <React.Fragment key={i}>{t}</React.Fragment>))}
    </div>
  );
}

const tarjeta = { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 18 };
const fondoPortada = (p) => (p ? `center / cover no-repeat url(${p})` : 'linear-gradient(135deg, var(--purple), var(--teal))');

function Progreso({ pct, ancho = '100%' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: ancho }}>
      <div style={{ flex: 1, height: 7, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)', transition: 'width .3s' }} />
      </div>
      <b style={{ fontSize: 12 }}>{pct} %</b>
    </div>
  );
}

// Pagar el cargo de un curso con tarjeta o Bizum: el mismo pago que el resto.
async function pagarCargo(cargoId) {
  const r = await fetch('/api/me/pagos/iniciar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ cargoIds: [cargoId] }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido iniciar el pago.');
  const form = document.createElement('form');
  form.method = 'POST'; form.action = d.url;
  for (const [k, v] of Object.entries(d.campos)) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; form.appendChild(i); }
  document.body.appendChild(form);
  form.submit();
}

export default function AulaPublica({ seg }) {
  const id = seg[1] && /^\d+$/.test(seg[1]) ? Number(seg[1]) : null;
  if (id && seg[2] === 'curso') return <AulaAprender id={id} />;
  return (
    <>
      <AimHeader route="aula" />
      <main style={{ paddingTop: 0 }}>
        {id ? <FichaCurso id={id} /> : <Catalogo />}
        <AimFooter />
      </main>
    </>
  );
}

function Catalogo() {
  const { go } = useRouter();
  const [cursos, setCursos] = useState(null);
  useEffect(() => {
    fetch('/api/aula/cursos', { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : { cursos: [] }))
      .then(d => setCursos(d.cursos || [])).catch(() => setCursos([]));
  }, []);
  return (
    <section className="block tight">
      <div className="container">
        <div style={{ maxWidth: 720 }}>
          <span className="eyebrow purple">Aula virtual</span>
          <h1 className="title-display">Aprende a tu ritmo con <MagicText>Aim Education.</MagicText></h1>
          <p className="section-lede" style={{ marginTop: 18 }}>
            Cursos online con vídeos, materiales y tareas que corrige el profesor. Apúntate y entra cuando quieras.
          </p>
        </div>
        {!cursos && <p style={{ marginTop: 40, color: 'var(--ink-3)' }}>Cargando cursos…</p>}
        {cursos && !cursos.length && (
          <div style={{ marginTop: 48, textAlign: 'center', color: 'var(--ink-3)' }}>
            <p style={{ fontSize: 18, fontWeight: 600 }}>Aún no hay cursos publicados.</p>
            <p style={{ fontSize: 14, marginTop: 8 }}>Vuelve pronto: estamos preparando los primeros.</p>
          </div>
        )}
        {cursos?.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginTop: 40 }}>
            {cursos.map(c => (
              <a key={c.id} href={`/aula/${c.id}`} onClick={e => { e.preventDefault(); go(`/aula/${c.id}`); }}
                style={{ ...tarjeta, overflow: 'hidden', display: 'grid', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ aspectRatio: '16 / 8', background: fondoPortada(c.portada) }} />
                <div style={{ padding: 18, display: 'grid', gap: 8, alignContent: 'start' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={pastilla(c.gratis ? 'var(--teal)' : 'var(--purple)')}>{c.gratis ? 'Gratis' : euros(c.precio)}</span>
                    {c.mio?.acceso && <span style={pastilla('var(--teal)')}>Apuntado</span>}
                    {c.mio?.pendientePago && <span style={pastilla('var(--orange)')}>Falta pagar</span>}
                  </div>
                  <b style={{ fontSize: 18, lineHeight: 1.25 }}>{c.titulo}</b>
                  {c.resumen && <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{c.resumen}</span>}
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.lecciones} {c.lecciones === 1 ? 'lección' : 'lecciones'}{c.profesor ? ` · ${c.profesor}` : ''}</span>
                  {c.mio?.acceso && <Progreso pct={c.mio.progreso} />}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const pastilla = (color) => ({ fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 999, color, background: `color-mix(in oklab, ${color} 13%, var(--bg-2))` });

function FichaCurso({ id }) {
  const { go } = useRouter();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [haciendo, setHaciendo] = useState(false);
  const [aviso, setAviso] = useState('');
  const cargar = useCallback(() => {
    fetch(`/api/aula/cursos/${id}`, { credentials: 'include', cache: 'no-store' })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Ese curso no existe.'); setC(d); })
      .catch(e => setError(e.message));
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function apuntarme() {
    if (!c.sesion) { go(`/auth?mode=register&volver=${encodeURIComponent(`/aula/${id}`)}`); return; }
    setHaciendo(true); setAviso('');
    try {
      const r = await fetch(`/api/aula/cursos/${id}/apuntarme`, { method: 'POST', credentials: 'include' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido.');
      if (d.acceso) { go(`/aula/${id}/curso`); return; }
      if (d.cargoId && c.pagoOnline) { await pagarCargo(d.cargoId); return; }
      cargar();
    } catch (e) { setAviso(e.message); } finally { setHaciendo(false); }
  }
  async function pagar() {
    setHaciendo(true); setAviso('');
    try { await pagarCargo(c.mio.cargoId); } catch (e) { setAviso(e.message); setHaciendo(false); }
  }

  if (error) return <section className="block tight"><div className="container"><p style={{ color: 'var(--ink-3)', fontSize: 18 }}>{error}</p><a href="/aula" onClick={e => { e.preventDefault(); go('/aula'); }}>← Todos los cursos</a></div></section>;
  if (!c) return <section className="block tight"><div className="container"><p style={{ color: 'var(--ink-3)' }}>Cargando…</p></div></section>;
  const lecciones = c.temas.reduce((s, t) => s + t.lecciones.length, 0);
  return (
    <section className="block tight">
      <div className="container" style={{ display: 'grid', gap: 24 }}>
        <a href="/aula" onClick={e => { e.preventDefault(); go('/aula'); }} style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-3)' }}>← Todos los cursos</a>
        {!c.publicado && <p style={{ margin: 0, padding: 12, borderRadius: 12, background: 'color-mix(in oklab, var(--orange) 12%, var(--bg-2))', fontSize: 14 }}>Este curso no está publicado: solo lo ve el personal.</p>}
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <span className="eyebrow purple">Aula virtual</span>
            <h1 className="title-display" style={{ fontSize: 'clamp(30px, 5vw, 48px)' }}>{c.titulo}</h1>
            {c.resumen && <p className="section-lede" style={{ margin: 0 }}>{c.resumen}</p>}
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{lecciones} {lecciones === 1 ? 'lección' : 'lecciones'} en {c.temas.length} {c.temas.length === 1 ? 'tema' : 'temas'}{c.profesor ? ` · Profesor: ${c.profesor}` : ''}</span>
          </div>
          <div style={{ ...tarjeta, overflow: 'hidden' }}>
            <div style={{ aspectRatio: '16 / 8', background: fondoPortada(c.portada) }} />
            <div style={{ padding: 20, display: 'grid', gap: 12 }}>
              <b style={{ fontSize: 28 }}>{c.gratis ? 'Gratis' : euros(c.precio)}</b>
              {!c.gratis && <span style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: -8 }}>{c.conIva ? 'IVA incluido. ' : ''}Pago único, con tarjeta o Bizum, o en secretaría.</span>}
              {c.mio?.acceso ? (
                <button type="button" className="btn btn-primary" onClick={() => go(`/aula/${id}/curso`)}>Entrar al curso <I.Arrow /></button>
              ) : c.mio?.pendientePago ? (
                <>
                  <span style={{ fontSize: 14 }}>Estás apuntado. Entrarás en cuanto esté pagado.</span>
                  {c.pagoOnline && c.mio.cargoId
                    ? <button type="button" className="btn btn-primary" disabled={haciendo} onClick={pagar}>{haciendo ? 'Yendo al banco…' : 'Pagar con tarjeta o Bizum'}</button>
                    : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Puedes pagarlo en secretaría o desde «Pagos y recibos» de tu zona.</span>}
                </>
              ) : (
                <button type="button" className="btn btn-primary" disabled={haciendo} onClick={apuntarme}>
                  {haciendo ? 'Un momento…' : c.gratis ? 'Apuntarme gratis' : c.pagoOnline ? 'Apuntarme y pagar' : 'Apuntarme'}
                </button>
              )}
              {!c.sesion && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Para apuntarte necesitas una cuenta en la web (es gratis). Si ya la tienes, entra con ella.</span>}
              {c.gestor && <a className="btn btn-outline btn-sm" href={`/aula/${id}/curso`} onClick={e => { e.preventDefault(); go(`/aula/${id}/curso`); }}>Ver el contenido (personal)</a>}
              {aviso && <span style={{ fontSize: 13, color: 'var(--pink)' }}>{aviso}</span>}
            </div>
          </div>
        </div>
        {c.descripcion && <div style={{ ...tarjeta, padding: 24, fontSize: 16 }}><Texto texto={c.descripcion} /></div>}
        {c.temas.length > 0 && (
          <div style={{ display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>Temario</h2>
            {c.temas.map((t, i) => (
              <div key={t.id} style={{ ...tarjeta, padding: 18, display: 'grid', gap: 8 }}>
                <b style={{ fontSize: 16 }}>{i + 1}. {t.titulo}</b>
                {t.lecciones.map(l => (
                  <span key={l.id} style={{ display: 'flex', gap: 10, fontSize: 14, color: 'var(--ink-2)' }}>
                    <span style={{ width: 20, textAlign: 'center' }}>{TIPO_LECCION[l.tipo].icono}</span>{l.titulo}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ═══════════════════════ El curso por dentro ═══════════════════════

function AulaAprender({ id }) {
  const { go, path } = useRouter();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [actual, setActual] = useState(null);
  const [menu, setMenu] = useState(false);
  const cargar = useCallback(() => {
    return fetch(`/api/aula/cursos/${id}/contenido`, { credentials: 'include', cache: 'no-store' })
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 401) { go(`/auth?volver=${encodeURIComponent(`/aula/${id}/curso`)}`, { replace: true }); return; }
        if (!r.ok) throw new Error(d.error || 'No se puede abrir el curso.');
        setC(d);
      }).catch(e => setError(e.message));
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  const todas = useMemo(() => (c ? c.temas.flatMap(t => t.lecciones.map(l => ({ ...l, tema: t.titulo }))) : []), [c]);
  // La lección: la del enlace (?leccion=, p. ej. desde un aviso), la elegida, o
  // la primera sin hacer.
  useEffect(() => {
    if (!todas.length || actual) return;
    const pedida = Number(new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?')) : '').get('leccion'));
    setActual((todas.find(l => l.id === pedida) || todas.find(l => !l.hecha) || todas[0]).id);
  }, [todas, actual, path]);
  const l = todas.find(x => x.id === actual);
  const i = todas.findIndex(x => x.id === actual);
  const hechas = todas.filter(x => x.hecha).length;
  const pct = todas.length ? Math.round(100 * hechas / todas.length) : 0;

  async function marcar(leccion, hecha) {
    setC(x => ({ ...x, temas: x.temas.map(t => ({ ...t, lecciones: t.lecciones.map(y => (y.id === leccion.id ? { ...y, hecha } : y)) })) }));
    await fetch(`/api/aula/lecciones/${leccion.id}/hecha`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hecha }) }).catch(() => {});
  }
  function ir(n) {
    const sig = todas[n];
    if (!sig) return;
    setActual(sig.id); setMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const cabecera = (
    <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' }}>
      <a href={`/aula/${id}`} onClick={e => { e.preventDefault(); go(c?.gestor ? `/aula/${id}` : '/dashboard/cursos'); }} aria-label="Salir del curso"
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 14, color: 'var(--ink-2)', textDecoration: 'none' }}>←</a>
      <b style={{ flex: 1, minWidth: 0, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c?.titulo || 'Aula virtual'}</b>
      {c && !c.gestor && <Progreso pct={pct} ancho={140} />}
      {c && <button type="button" className="btn btn-sm btn-outline aula-boton-temario" onClick={() => setMenu(m => !m)}>Temario</button>}
    </header>
  );
  if (error) return <>{cabecera}<div style={{ padding: 24, display: 'grid', gap: 12, justifyItems: 'start' }}><p style={{ fontSize: 18 }}>{error}</p><a className="btn btn-primary btn-sm" href={`/aula/${id}`} onClick={e => { e.preventDefault(); go(`/aula/${id}`); }}>Ver el curso</a></div></>;
  if (!c) return <>{cabecera}<p style={{ padding: 24, color: 'var(--ink-3)' }}>Cargando…</p></>;

  const indice = (
    <nav aria-label="Temario" style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
      {c.temas.map((t, ti) => (
        <div key={t.id} style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--purple)' }}>{ti + 1}. {t.titulo}</span>
          {t.lecciones.map(x => (
            <button key={x.id} type="button" onClick={() => ir(todas.findIndex(y => y.id === x.id))}
              style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: 0,
                background: x.id === actual ? 'color-mix(in oklab, var(--purple) 12%, var(--bg-2))' : 'transparent', color: 'var(--ink)', fontWeight: x.id === actual ? 800 : 500, fontSize: 14 }}>
              <span style={{ width: 20, flex: 'none', textAlign: 'center', color: x.hecha ? 'var(--teal)' : 'inherit' }}>{x.hecha ? '✓' : TIPO_LECCION[x.tipo].icono}</span>
              <span style={{ flex: 1 }}>{x.titulo}</span>
            </button>
          ))}
        </div>
      ))}
      {!todas.length && <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>Este curso aún no tiene lecciones.</span>}
    </nav>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {cabecera}
      <style>{`
        .aula-cuerpo { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 28px; max-width: 1200px; margin: 0 auto; padding: 24px 16px 64px; }
        .aula-indice { position: sticky; top: 72px; max-height: calc(100vh - 96px); overflow-y: auto; }
        .aula-boton-temario { display: none; }
        @media (max-width: 860px) {
          .aula-cuerpo { grid-template-columns: minmax(0, 1fr); }
          .aula-indice { display: none; position: static; max-height: none; }
          .aula-indice.abierto { display: block; }
          .aula-boton-temario { display: inline-flex; }
        }
      `}</style>
      <div className="aula-cuerpo">
        <aside className={`aula-indice${menu ? ' abierto' : ''}`} style={{ ...tarjeta, padding: 14 }}>{indice}</aside>
        <article style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          {c.gestor && <p style={{ margin: 0, padding: 10, borderRadius: 12, background: 'color-mix(in oklab, var(--purple) 10%, var(--bg-2))', fontSize: 13 }}>Lo estás viendo como personal: así lo ven los alumnos (tu progreso no cuenta).</p>}
          {l && (
            <>
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>{l.tema} · {TIPO_LECCION[l.tipo].nombre}</span>
                <h1 style={{ margin: 0, fontSize: 'clamp(24px, 4vw, 34px)', lineHeight: 1.15 }}>{l.titulo}</h1>
              </div>
              <Leccion key={l.id} l={l} gestor={c.gestor} onEntregada={cargar} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <button type="button" className="btn btn-sm btn-outline" disabled={i <= 0} onClick={() => ir(i - 1)}>← Anterior</button>
                <div style={{ flex: 1 }} />
                {!c.gestor && l.tipo !== 'tarea' && (
                  <button type="button" className={`btn btn-sm ${l.hecha ? 'btn-ghost' : 'btn-outline'}`} onClick={() => marcar(l, !l.hecha)}>
                    {l.hecha ? '✓ Hecha' : 'Marcar como hecha'}
                  </button>
                )}
                <button type="button" className="btn btn-sm btn-primary" disabled={i >= todas.length - 1}
                  onClick={() => { if (!c.gestor && !l.hecha && l.tipo !== 'tarea') marcar(l, true); ir(i + 1); }}>Siguiente →</button>
              </div>
              {!c.gestor && pct === 100 && <p style={{ margin: 0, padding: 14, borderRadius: 14, background: 'color-mix(in oklab, var(--teal) 12%, var(--bg-2))', fontWeight: 700 }}>🎉 ¡Has completado todo el curso!</p>}
            </>
          )}
        </article>
      </div>
    </div>
  );
}

function Leccion({ l, gestor, onEntregada }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {l.tipo === 'video' && l.video?.embed && (
        <div style={{ aspectRatio: '16 / 9', borderRadius: 16, overflow: 'hidden', background: '#000' }}>
          <iframe src={l.video.embed} title={l.titulo} style={{ width: '100%', height: '100%', border: 0 }} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      )}
      {l.tipo === 'video' && l.video?.src && (
        <video src={l.video.src} controls playsInline preload="metadata" controlsList="nodownload" style={{ width: '100%', maxHeight: '75vh', borderRadius: 16, background: '#000' }} />
      )}
      {l.tipo === 'video' && !l.video && <p style={{ color: 'var(--ink-3)' }}>Este vídeo aún no está disponible.</p>}
      {l.texto && <div style={{ ...tarjeta, padding: 20, fontSize: 16 }}><Texto texto={l.texto} /></div>}
      {l.archivo && (
        <div style={{ ...tarjeta, padding: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 26 }}>📎</span>
          <div style={{ flex: 1, minWidth: 160 }}><b>{l.archivo.nombre}</b><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{mb(l.archivo.bytes)}</div></div>
          {l.archivo.mime === 'application/pdf' && <a className="btn btn-sm btn-outline" href={l.archivo.url} target="_blank" rel="noreferrer"><I.Eye /> Abrir</a>}
          <a className="btn btn-sm btn-primary" href={`${l.archivo.url}?descargar=1`}><I.Download /> Descargar</a>
        </div>
      )}
      {l.tipo === 'tarea' && (gestor
        ? <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)' }}>Aquí el alumno escribe su respuesta o adjunta un archivo. Las entregas se corrigen desde el panel, en «Aula virtual».</p>
        : <Entrega l={l} onEntregada={onEntregada} />)}
    </div>
  );
}

function Entrega({ l, onEntregada }) {
  const e = l.entrega;
  const [editando, setEditando] = useState(!e);
  const [texto, setTexto] = useState(e?.texto || '');
  const [archivo, setArchivo] = useState(null);
  const [quitar, setQuitar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  async function entregar(ev) {
    ev.preventDefault();
    if (archivo && archivo.size > 10 * 1048576) { setError('El archivo pasa de 10 MB.'); return; }
    if (!texto.trim() && !archivo && !(e?.archivo && !quitar)) { setError('Escribe tu respuesta o adjunta un archivo.'); return; }
    if (e?.corregida_at && !window.confirm('Ya está corregida. Si la vuelves a entregar, el profesor la corregirá de nuevo. ¿Seguir?')) return;
    setEnviando(true); setError('');
    try {
      let r = await fetch(`/api/aula/lecciones/${l.id}/entrega`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, quitarArchivo: quitar && !archivo, conArchivo: !!archivo }),
      });
      let d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido entregar.');
      if (archivo) {
        r = await fetch(`/api/aula/lecciones/${l.id}/entrega/archivo?nombre=${encodeURIComponent(archivo.name)}`, {
          method: 'PUT', credentials: 'include', headers: { 'Content-Type': archivo.type || 'application/octet-stream' }, body: archivo,
        });
        d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'El texto se ha entregado, pero el archivo no. Vuelve a intentarlo.');
      }
      setEditando(false); setArchivo(null); setQuitar(false);
      await onEntregada();
    } catch (err) { setError(err.message); } finally { setEnviando(false); }
  }

  const nota = e?.corregida_at ? (e.nota != null ? `${String(Number(e.nota)).replace('.', ',')} / 10` : e.apto ? 'Apto' : 'No apto') : null;
  return (
    <div style={{ ...tarjeta, padding: 18, display: 'grid', gap: 12 }}>
      <b style={{ fontSize: 16 }}>Tu entrega</b>
      {e && !editando && (
        <>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Entregada el {fmtHora(e.entregada_at)}</span>
          {e.texto && <div style={{ padding: 12, borderRadius: 12, background: 'var(--bg-3)' }}><Texto texto={e.texto} /></div>}
          {e.archivo && <a className="btn btn-sm btn-outline" style={{ justifySelf: 'start' }} href={e.archivo}><I.Download /> {e.archivo_nombre || 'Tu archivo'}</a>}
          {nota ? (
            <div style={{ padding: 14, borderRadius: 12, display: 'grid', gap: 6, background: `color-mix(in oklab, ${e.apto ? 'var(--teal)' : 'var(--orange)'} 12%, var(--bg-2))` }}>
              <b style={{ fontSize: 18 }}>{nota}</b>
              {e.comentario && <Texto texto={e.comentario} />}
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Corregida el {fmtHora(e.corregida_at)}</span>
            </div>
          ) : <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--orange)' }}>Pendiente de corregir</span>}
          <button type="button" className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }} onClick={() => setEditando(true)}>Cambiar mi entrega</button>
        </>
      )}
      {editando && (
        <form onSubmit={entregar} style={{ display: 'grid', gap: 10 }}>
          <textarea rows={6} value={texto} onChange={x => setTexto(x.target.value)} placeholder="Escribe aquí tu respuesta…"
            style={{ fontFamily: 'inherit', fontSize: 15, padding: 12, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="btn btn-sm btn-outline" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
              📎 {archivo ? 'Cambiar archivo' : 'Adjuntar archivo'}
              <input type="file" onChange={x => { setArchivo(x.target.files?.[0] || null); x.target.value = ''; }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
            </label>
            {archivo && <span style={{ fontSize: 13 }}>{archivo.name} ({mb(archivo.size)})</span>}
            {!archivo && e?.archivo && !quitar && <span style={{ fontSize: 13 }}>Se queda el que entregaste ({e.archivo_nombre}) · <button type="button" onClick={() => setQuitar(true)} style={{ font: 'inherit', background: 'none', border: 0, color: 'var(--pink)', cursor: 'pointer', padding: 0 }}>quitarlo</button></span>}
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Hasta 10 MB (PDF, foto, documento…)</span>
          </div>
          {error && <span style={{ fontSize: 13, color: 'var(--pink)' }}>{error}</span>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-sm btn-primary" disabled={enviando}>{enviando ? 'Entregando…' : 'Entregar'}</button>
            {e && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setEditando(false); setTexto(e.texto || ''); setArchivo(null); setQuitar(false); setError(''); }}>Cancelar</button>}
          </div>
        </form>
      )}
    </div>
  );
}

// ═══════════════════════ «Mis cursos» en el área de familias ═══════════════════════

export function MisCursos() {
  const { go } = useRouter();
  const [d, setD] = useState(null);
  const [pagando, setPagando] = useState(null);
  useEffect(() => {
    fetch('/api/me/aula', { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : { cursos: [] })).then(setD).catch(() => setD({ cursos: [] }));
  }, []);
  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Cargando…</p>;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {d.cursos.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 28, display: 'grid', gap: 10, justifyItems: 'center' }}>
          <b style={{ fontSize: 17 }}>Aún no estás en ningún curso</b>
          <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>{d.cursosPublicados ? 'En el aula virtual tienes cursos online, gratis y de pago, para hacer a tu ritmo.' : 'Pronto habrá cursos online para hacer a tu ritmo.'}</span>
          {d.cursosPublicados > 0 && <button type="button" className="btn btn-primary btn-sm" onClick={() => go('/aula')}>Ver los cursos</button>}
        </div>
      )}
      {d.cursos.length > 0 && (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {d.cursos.map(c => (
            <div key={c.id} className="panel" style={{ padding: 0, overflow: 'hidden', display: 'grid' }}>
              <div style={{ aspectRatio: '16 / 7', background: fondoPortada(c.portada) }} />
              <div style={{ padding: 16, display: 'grid', gap: 10 }}>
                <b style={{ fontSize: 16 }}>{c.titulo}</b>
                {c.acceso ? (
                  <>
                    <Progreso pct={c.progreso} />
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => go(`/aula/${c.id}/curso`)}>{c.hechas ? 'Seguir' : 'Empezar'}</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 13, color: 'var(--orange)', fontWeight: 700 }}>Falta pagarlo para entrar</span>
                    {c.cargoId && d.pagoOnline ? <button type="button" className="btn btn-primary btn-sm" disabled={pagando === c.id}
                      onClick={async () => { setPagando(c.id); try { await pagarCargo(c.cargoId); } catch (e) { alert(e.message); setPagando(null); } }}>
                      {pagando === c.id ? 'Yendo al banco…' : 'Pagar con tarjeta o Bizum'}</button>
                      : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Puedes pagarlo en secretaría o en «Pagos y recibos».</span>}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {d.cursos.length > 0 && <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => go('/aula')}>Ver todos los cursos del aula →</button>}
    </div>
  );
}
