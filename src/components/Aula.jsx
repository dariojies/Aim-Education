import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, MagicText } from './Shared.jsx';
import { useRouter } from '../App.jsx';
import { imagenSubible } from '../imagenes.js';
import { DudasCurso } from './AulaDudas.jsx';
import { Valoracion } from './AulaValoracion.jsx';

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
  cuestionario: { nombre: 'Cuestionario', icono: '❓' },
  directo: { nombre: 'Clase en directo', icono: '📡' },
};
export const mb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(b >= 10 * 1048576 ? 0 : 1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const euros = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;
const fmtHora = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');
// «el lunes 3 de noviembre a las 18:00»
export const fechaLarga = (d) => (d ? `el ${new Date(d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')} a las ${new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : '');
// «2 días y 3 h», «45 min»
const queda = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  return d ? `${d} ${d === 1 ? 'día' : 'días'}${h ? ` y ${h} h` : ''}` : h ? `${h} h${mi ? ` y ${mi} min` : ''}` : `${mi} min`;
};
const textoCerrada = (x) => (x.cerrada?.hasta ? `Se abre ${fechaLarga(x.cerrada.hasta)}` : x.cerrada?.tras ? `Se abre al terminar «${x.cerrada.tras}»` : '');

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

// Cómo va una lección (#455): las de leer, ver o descargar se terminan al
// abrirlas; un cuestionario, al sacar un 5; una tarea, cuando el profesor la aprueba.
function estadoLeccion(x) {
  if (x.bloqueada) return { icono: '🔒', texto: 'Del curso completo', color: 'var(--ink-3)' };
  if (x.cerrada && !x.hecha) return { icono: '🔒', texto: textoCerrada(x), color: 'var(--ink-3)' };
  if (x.hecha) return { icono: '✓', texto: x.tipo === 'tarea' || x.tipo === 'cuestionario' ? 'Aprobada' : 'Vista', color: 'var(--teal)' };
  if (x.tipo === 'tarea' && x.entrega) {
    if (!x.entrega.corregida_at) return { icono: '⏳', texto: 'Entregada: falta que la corrija el profesor', color: 'var(--orange)' };
    return { icono: '✗', texto: 'No superada: vuelve a entregarla', color: 'var(--pink)' };
  }
  if (x.tipo === 'cuestionario' && x.cuestionario?.mejor != null) return { icono: '✗', texto: `Aún sin aprobar: saca un ${String(x.cuestionario.notaMinima ?? 5).replace('.', ',')} para superarlo`, color: 'var(--pink)' };
  return null;
}
// El diploma de aprovechamiento (#455), al terminar todo el curso.
// Si el diploma está diseñado en «Diseños», se pinta aquí con sus datos y sale
// en PDF; si no, el PDF de siempre, hecho en el servidor.
// Sin la valoración del curso (#463), el botón lleva a hacerla.
function BotonDiploma({ url, grande = false, valorar = false }) {
  const { go } = useRouter();
  const [haciendo, setHaciendo] = useState(false);
  if (!url) return null;
  const aValorar = () => go(`${url.replace(/\/diploma$/, '').replace('/api/aula/cursos/', '/aula/')}/curso?valorar=1`);
  if (valorar) {
    return (
      <button type="button" className={`btn ${grande ? 'btn-primary' : 'btn-sm btn-outline'}`} onClick={aValorar} style={{ justifySelf: 'start' }}>
        ⭐ Valora el curso y consigue tu diploma
      </button>
    );
  }
  async function bajar(e) {
    e.preventDefault();
    setHaciendo(true);
    try {
      const r = await fetch(`${url}?formato=datos`, { credentials: 'include', cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (d.valorar) { aValorar(); return; }
      if (!r.ok) throw new Error(d.error || 'No se ha podido preparar el diploma.');
      if (!d.diseno) { window.location.href = `${url}?descargar=1`; return; }
      const { exportarDiseno } = await import('../disenos/render.js');
      await exportarDiseno(d.diseno, 'pdf', d.nombre || 'Diploma', { variables: d.variables });
    } catch (err) { alert(err.message); } finally { setHaciendo(false); }
  }
  return (
    <a className={`btn ${grande ? 'btn-primary' : 'btn-sm btn-outline'}`} href={`${url}?descargar=1`} onClick={bajar} style={{ justifySelf: 'start' }}>
      🎓 {haciendo ? 'Preparando el diploma…' : 'Descargar mi diploma'}
    </a>
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
        {seg[1] === 'diplomas' ? <ComprobarDiploma /> : id ? <FichaCurso id={id} /> : <Catalogo />}
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
        <p style={{ marginTop: 36, fontSize: 14, color: 'var(--ink-3)' }}>¿Tienes un diploma del aula virtual? <a href="/aula/diplomas" onClick={e => { e.preventDefault(); go('/aula/diplomas'); }} style={{ color: 'var(--purple)', fontWeight: 700 }}>Compruébalo aquí</a>.</p>
      </div>
    </section>
  );
}

// Comprobar un diploma por su código (el que lleva impreso abajo).
function ComprobarDiploma() {
  const { go, path } = useRouter();
  const inicial = new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?')) : '').get('codigo') || '';
  const [codigo, setCodigo] = useState(inicial);
  const [r, setR] = useState(null);
  const [mirando, setMirando] = useState(false);
  const comprobar = useCallback(async (cod) => {
    const k = String(cod || '').trim().toUpperCase();
    if (!k) return;
    setMirando(true);
    try {
      const x = await fetch(`/api/aula/diplomas/${encodeURIComponent(k)}`, { cache: 'no-store' });
      const d = await x.json().catch(() => ({}));
      setR(x.ok ? d : { error: d.error || 'No se ha podido comprobar.' });
    } catch { setR({ error: 'No se ha podido comprobar.' }); } finally { setMirando(false); }
  }, []);
  useEffect(() => { if (inicial) comprobar(inicial); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="block tight">
      <div className="container" style={{ maxWidth: 640, display: 'grid', gap: 18 }}>
        <a href="/aula" onClick={e => { e.preventDefault(); go('/aula'); }} style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-3)' }}>← Aula virtual</a>
        <span className="eyebrow purple">Aula virtual</span>
        <h1 className="title-display" style={{ fontSize: 'clamp(28px, 5vw, 42px)' }}>Comprobar un diploma</h1>
        <p style={{ margin: 0, color: 'var(--ink-2)' }}>Escribe el código que lleva el diploma abajo (10 letras y números) y te decimos si es de verdad de Aim Education.</p>
        <form onSubmit={e => { e.preventDefault(); comprobar(codigo); }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={codigo} onChange={e => { setCodigo(e.target.value); setR(null); }} placeholder="Por ejemplo, 3F9A1C07B2" aria-label="Código del diploma" maxLength={14}
            style={{ flex: '1 1 220px', fontFamily: 'inherit', fontSize: 18, letterSpacing: '.08em', textTransform: 'uppercase', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' }} />
          <button type="submit" className="btn btn-primary" disabled={mirando || !codigo.trim()}>{mirando ? 'Comprobando…' : 'Comprobar'}</button>
        </form>
        {r?.valido && (
          <div role="status" style={{ ...tarjeta, padding: 22, display: 'grid', gap: 8, borderColor: 'var(--teal)', background: 'color-mix(in oklab, var(--teal) 9%, var(--bg-2))' }}>
            <b style={{ fontSize: 20, color: 'var(--teal)' }}>✓ Diploma válido</b>
            <span style={{ fontSize: 16 }}><b>{r.alumno}</b> ha terminado el curso <b>«{r.curso}»</b> del aula virtual de Aim Education{r.fecha ? ` el ${new Date(r.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.</span>
            {r.profesor && <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>Profesor: {r.profesor}</span>}
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Código {r.codigo}</span>
          </div>
        )}
        {r && r.valido === false && (
          <div role="status" style={{ ...tarjeta, padding: 22, display: 'grid', gap: 6, borderColor: 'var(--pink)' }}>
            <b style={{ fontSize: 18, color: 'var(--pink)' }}>No hay ningún diploma con ese código</b>
            <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>Revisa que esté bien escrito (son 10 letras y números). Si crees que es un error, escríbenos.</span>
          </div>
        )}
        {r?.error && <p style={{ margin: 0, color: 'var(--pink)', fontWeight: 700 }}>{r.error}</p>}
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
                <>
                  {/* Su avance (#455). */}
                  <div style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.mio.hechas} de {c.mio.lecciones} {c.mio.lecciones === 1 ? 'lección terminada' : 'lecciones terminadas'}</span>
                    <Progreso pct={c.mio.progreso} />
                  </div>
                  {c.mio.diploma
                    ? <><span style={{ fontWeight: 800, color: 'var(--teal)' }}>🎉 ¡Curso completado!</span><BotonDiploma url={c.mio.diploma} grande valorar={!c.mio.valorado} /></>
                    : null}
                  <button type="button" className={`btn ${c.mio.diploma ? 'btn-outline' : 'btn-primary'}`} onClick={() => go(`/aula/${id}/curso`)}>{c.mio.diploma ? 'Repasar el curso' : c.mio.hechas ? 'Seguir con el curso' : 'Entrar al curso'} <I.Arrow /></button>
                </>
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
              {c.parteGratis && !c.mio?.acceso && !c.gestor && (
                <button type="button" className="btn btn-outline" onClick={() => go(c.sesion ? `/aula/${id}/curso` : `/auth?mode=register&volver=${encodeURIComponent(`/aula/${id}/curso`)}`)}>
                  🔓 Ver gratis las primeras lecciones
                </button>
              )}
              {!c.sesion && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Para apuntarte{c.parteGratis ? ' o ver lo gratis' : ''} necesitas una cuenta en la web (es gratis). Si ya la tienes, entra con ella.</span>}
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
                  <span key={l.id} style={{ display: 'flex', gap: 10, fontSize: 14, color: 'var(--ink-2)', alignItems: 'center' }}>
                    <span style={{ width: 20, textAlign: 'center', color: l.hecha ? 'var(--teal)' : undefined }}>{l.hecha ? '✓' : TIPO_LECCION[l.tipo].icono}</span>{l.titulo}
                    {l.gratis && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)', background: 'color-mix(in oklab, var(--teal) 12%, var(--bg-2))', padding: '1px 8px', borderRadius: 999 }}>Gratis</span>}
                    {l.tipo === 'directo' && l.directoAt && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>· {new Date(l.directoAt).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                    {l.tipo !== 'directo' && l.abreAt && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>· se abre el {new Date(l.abreAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>}
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
  const [verApuntes, setVerApuntes] = useState(false);
  // Lo que cambia en una lección sin recargar el curso (sus apuntes, por dónde va el vídeo).
  const actualizar = useCallback((lid, cambios) => setC(x => (x ? { ...x, temas: x.temas.map(t => ({ ...t, lecciones: t.lecciones.map(y => (y.id === lid ? { ...y, ...cambios } : y)) })) } : x)), []);
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
    // En la parte gratis, se empieza por una que se pueda ver.
    const abiertas = todas.filter(l => !l.bloqueada && !l.cerrada);
    setActual((todas.find(l => l.id === pedida) || abiertas.find(l => !l.hecha) || abiertas[0] || todas[0]).id);
  }, [todas, actual, path]);
  const l = todas.find(x => x.id === actual);
  const i = todas.findIndex(x => x.id === actual);
  // Una duda concreta (?duda=, desde el aviso de que la han contestado).
  const dudaPedida = Number(new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?')) : '').get('duda')) || null;
  useEffect(() => {
    if (dudaPedida && c) setTimeout(() => document.getElementById('aula-dudas')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, [dudaPedida, !!c]); // eslint-disable-line react-hooks/exhaustive-deps
  // A valorar el curso (?valorar=1, desde el botón del diploma).
  const aValorar = /[?&]valorar=1/.test(path);
  useEffect(() => {
    if (aValorar && c) setTimeout(() => document.getElementById('aula-valoracion')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, [aValorar, !!c]); // eslint-disable-line react-hooks/exhaustive-deps
  const hechas = todas.filter(x => x.hecha).length;
  const pct = todas.length ? Math.round(100 * hechas / todas.length) : 0;

  // Las de leer, ver o descargar cuentan como terminadas al abrirlas (#455).
  useEffect(() => {
    if (!c || c.gestor || !l || l.bloqueada || l.cerrada || l.hecha || !['texto', 'video', 'archivo'].includes(l.tipo)) return;
    marcar(l, true);
  }, [l?.id, c?.gestor]); // eslint-disable-line react-hooks/exhaustive-deps
  async function marcar(leccion, hecha) {
    setC(x => ({ ...x, temas: x.temas.map(t => ({ ...t, lecciones: t.lecciones.map(y => (y.id === leccion.id ? { ...y, hecha } : y)) })) }));
    await fetch(`/api/aula/lecciones/${leccion.id}/hecha`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hecha }) }).catch(() => {});
    if (todas.some(x => x.cerrada?.tras)) cargar();
  }
  function ir(n) {
    const sig = todas[n];
    if (!sig) return;
    setActual(sig.id); setMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const cabecera = (
    <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' }}>
      <a href={`/aula/${id}`} onClick={e => { e.preventDefault(); go(c?.gestor || c?.previa ? `/aula/${id}` : '/dashboard/cursos'); }} aria-label="Salir del curso"
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 14, color: 'var(--ink-2)', textDecoration: 'none' }}>←</a>
      <b style={{ flex: 1, minWidth: 0, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c?.titulo || 'Aula virtual'}</b>
      {c && !c.gestor && !c.previa && <Progreso pct={pct} ancho={140} />}
      {c && !c.gestor && !c.previa && <button type="button" className="btn btn-sm btn-outline" onClick={() => setVerApuntes(true)}>📝 Apuntes</button>}
      {c && !c.previa && <button type="button" className="btn btn-sm btn-outline" onClick={() => document.getElementById('aula-dudas')?.scrollIntoView({ behavior: 'smooth' })}>💬 Dudas</button>}
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
              <span title={estadoLeccion(x)?.texto} style={{ width: 20, flex: 'none', textAlign: 'center', fontWeight: 800, color: estadoLeccion(x)?.color || 'inherit' }}>{estadoLeccion(x)?.icono || TIPO_LECCION[x.tipo].icono}</span>
              <span style={{ flex: 1, color: x.bloqueada || x.cerrada ? 'var(--ink-3)' : undefined }}>{x.titulo}
                {x.tipo === 'directo' && x.directo?.at && <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-3)' }}>{new Date(x.directo.at).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
              </span>
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
          {c.anuncios?.length > 0 && <AnunciosCurso anuncios={c.anuncios} abrir={/[?&]anuncios=1/.test(path)} />}
          {c.previa && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', borderRadius: 12, background: 'color-mix(in oklab, var(--teal) 10%, var(--bg-2))', fontSize: 14 }}>
              <span style={{ flex: 1, minWidth: 200 }}>🔓 Estás viendo la parte gratis. Las lecciones con 🔒 son del curso completo.</span>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => go(`/aula/${id}`)}>Conseguir el curso completo{c.precio ? ` · ${euros(c.precio)}` : ''}</button>
            </div>
          )}
          {l && l.bloqueada && (
            <div style={{ ...tarjeta, padding: 28, display: 'grid', gap: 12, justifyItems: 'start' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>{l.tema} · {TIPO_LECCION[l.tipo].nombre}</span>
              <h1 style={{ margin: 0, fontSize: 'clamp(22px, 4vw, 30px)' }}>🔒 {l.titulo}</h1>
              <p style={{ margin: 0, color: 'var(--ink-2)' }}>Esta lección es del curso completo. Consíguelo para verla, junto con todo lo demás.</p>
              <button type="button" className="btn btn-primary" onClick={() => go(`/aula/${id}`)}>Conseguir el curso completo{c.precio ? ` · ${euros(c.precio)}` : ''}</button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-sm btn-outline" disabled={i <= 0} onClick={() => ir(i - 1)}>← Anterior</button>
                <button type="button" className="btn btn-sm btn-outline" disabled={i >= todas.length - 1} onClick={() => ir(i + 1)}>Siguiente →</button>
              </div>
            </div>
          )}
          {l && l.cerrada && !l.bloqueada && (
            <div style={{ ...tarjeta, padding: 28, display: 'grid', gap: 12, justifyItems: 'start' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>{l.tema} · {TIPO_LECCION[l.tipo].nombre}</span>
              <h1 style={{ margin: 0, fontSize: 'clamp(22px, 4vw, 30px)' }}>🔒 {l.titulo}</h1>
              <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 16 }}>{textoCerrada(l)}.{l.cerrada.hasta ? ' Te avisaremos cuando esté.' : ''}</p>
              {l.tipo === 'directo' && l.directo?.at && <p style={{ margin: 0, color: 'var(--ink-2)' }}>📡 La clase en directo es {fechaLarga(l.directo.at)}.</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-sm btn-outline" disabled={i <= 0} onClick={() => ir(i - 1)}>← Anterior</button>
                <button type="button" className="btn btn-sm btn-outline" disabled={i >= todas.length - 1} onClick={() => ir(i + 1)}>Siguiente →</button>
              </div>
            </div>
          )}
          {l && !l.bloqueada && !l.cerrada && (
            <>
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>{l.tema} · {TIPO_LECCION[l.tipo].nombre}</span>
                <h1 style={{ margin: 0, fontSize: 'clamp(24px, 4vw, 34px)', lineHeight: 1.15 }}>{l.titulo}</h1>
              </div>
              <Leccion key={l.id} l={l} gestor={c.gestor} previa={c.previa} curso={c.titulo} onEntregada={cargar} onVista={() => { if (!l.hecha && !c.gestor) marcar(l, true); }} actualizar={actualizar} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <button type="button" className="btn btn-sm btn-outline" disabled={i <= 0} onClick={() => ir(i - 1)}>← Anterior</button>
                <div style={{ flex: 1 }} />
                {!c.gestor && estadoLeccion(l) && <span style={{ fontSize: 13, fontWeight: 800, color: estadoLeccion(l).color }}>{estadoLeccion(l).icono} {estadoLeccion(l).texto}</span>}
                <button type="button" className="btn btn-sm btn-primary" disabled={i >= todas.length - 1} onClick={() => ir(i + 1)}>Siguiente →</button>
              </div>
              {!c.gestor && !c.previa && pct === 100 && !c.valorado && <Valoracion cursoId={id} onHecha={() => setC(x => ({ ...x, valorado: true }))} />}
              {!c.gestor && !c.previa && pct === 100 && c.valorado && (
                <div style={{ padding: 16, borderRadius: 14, background: 'color-mix(in oklab, var(--teal) 12%, var(--bg-2))', display: 'grid', gap: 10 }}>
                  <b style={{ fontSize: 16 }}>🎉 ¡Has completado todo el curso!</b>
                  <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>Ya tienes tu diploma de aprovechamiento.</span>
                  <BotonDiploma url={`/api/aula/cursos/${id}/diploma`} grande />
                </div>
              )}
            </>
          )}
          {verApuntes && <MisApuntes cursoId={id} onCerrar={() => setVerApuntes(false)} />}
          {!c.previa && <DudasCurso cursoId={id} leccion={l && !l.bloqueada && !l.cerrada ? l : null} gestor={c.gestor} abrir={dudaPedida} />}
        </article>
      </div>
    </div>
  );
}

function Leccion({ l, gestor, previa, curso, onEntregada, onVista, actualizar }) {
  const vencida = l.plazoAt && new Date(l.plazoAt) < new Date();
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {l.tipo === 'directo' && <ClaseDirecto l={l} curso={curso} gestor={gestor} onVista={onVista} actualizar={actualizar} />}
      {l.tipo === 'tarea' && l.plazoAt && (
        <div style={{ padding: '10px 14px', borderRadius: 12, fontSize: 14, fontWeight: 700,
          background: `color-mix(in oklab, ${vencida ? 'var(--pink)' : 'var(--orange)'} 12%, var(--bg-2))` }}>
          {vencida ? `⏰ El plazo acabó ${fechaLarga(l.plazoAt)}. ${l.entrega ? '' : 'Aún puedes entregarla: saldrá como «fuera de plazo».'}` : `⏰ Entrega hasta ${fechaLarga(l.plazoAt)}.`}
        </div>
      )}
      {l.tipo === 'video' && l.video && <VideoConMemoria l={l} video={l.video} gestor={gestor} actualizar={actualizar} />}
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
      {l.tipo === 'cuestionario' && <Cuestionario l={l} gestor={gestor} onHecho={onEntregada} />}
      {l.tipo === 'tarea' && (gestor
        ? <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)' }}>Aquí el alumno escribe su respuesta o adjunta un archivo. Las entregas se corrigen desde el panel, en «Aula virtual».</p>
        : previa ? <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)' }}>Para entregar la tarea y que te la corrijan, consigue el curso completo.</p>
        : <Entrega l={l} onEntregada={onEntregada} />)}
      {!gestor && <Apuntes l={l} onGuardado={(t) => actualizar?.(l.id, { apuntes: t })} />}
    </div>
  );
}

// Los anuncios del profesor: el último, a la vista; los demás, desplegando.
function AnunciosCurso({ anuncios, abrir }) {
  const [todos, setTodos] = useState(abrir);
  const nuevo = (a) => Date.now() - new Date(a.created_at).getTime() < 7 * 86400000;
  const uno = (a) => (
    <div key={a.id} style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtHora(a.created_at)}{a.autor ? ` · ${a.autor}` : ''}{nuevo(a) && <b style={{ marginLeft: 6, color: 'var(--pink)' }}>Nuevo</b>}</span>
      <Texto texto={a.texto} />
    </div>
  );
  return (
    <div id="aula-anuncios" style={{ ...tarjeta, padding: 16, display: 'grid', gap: 10, borderColor: nuevo(anuncios[0]) ? 'var(--purple)' : undefined }}>
      <b style={{ fontSize: 15 }}>📢 Anuncios del profesor</b>
      {uno(anuncios[0])}
      {anuncios.length > 1 && (todos
        ? anuncios.slice(1).map(a => <div key={a.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>{uno(a)}</div>)
        : <button type="button" className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }} onClick={() => setTodos(true)}>Ver los {anuncios.length - 1} anteriores</button>)}
    </div>
  );
}

// ═══════════════════════ El vídeo que se acuerda de por dónde iba ═══════════════════════
// Lo subido (<video>), YouTube y Vimeo (por su API de mensajes: sin cargar nada más).
// Cada 10 segundos, al pausar y al salir se guarda por dónde va; si lo termina,
// vuelve a empezar desde el principio la próxima vez.
const minutos = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function VideoConMemoria({ l, video, gestor, actualizar }) {
  const [desde, setDesde] = useState(() => (!gestor && l.vista > 10 ? l.vista : 0));
  const [aviso, setAviso] = useState(!gestor && l.vista > 10);
  const pos = useRef(desde), dur = useRef(0), guardado = useRef(l.vista || 0), movido = useRef(false), marco = useRef(null), vid = useRef(null);
  const embed = useMemo(() => {
    if (!video?.embed) return null;
    const u = new URL(video.embed);
    if (/youtube/.test(u.hostname)) {
      u.searchParams.set('enablejsapi', '1'); u.searchParams.set('origin', window.location.origin);
      if (desde) u.searchParams.set('start', String(Math.floor(desde)));
    } else { u.searchParams.set('api', '1'); if (desde) u.hash = `t=${Math.floor(desde)}s`; }
    return u.toString();
  }, [video?.embed, desde]);
  const guardar = useCallback((final = false) => {
    if (gestor || !movido.current) return;
    let s = Math.floor(pos.current);
    const d = dur.current;
    if (d && d - s < 15) s = 0;
    if (!final && Math.abs(s - guardado.current) < 3) return;
    guardado.current = s;
    actualizar?.(l.id, { vista: s });
    fetch(`/api/aula/lecciones/${l.id}/vista`, { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segundos: s, duracion: d ? Math.round(d) : null }) }).catch(() => {});
  }, [l.id, gestor, actualizar]);
  useEffect(() => {
    const f = (ev) => {
      let host = '';
      try { host = new URL(ev.origin).hostname; } catch { return; }
      if (!/(^|\.)youtube(-nocookie)?\.com$|^player\.vimeo\.com$/.test(host)) return;
      let d = ev.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
      if (d?.event === 'infoDelivery' && d.info) {
        if (typeof d.info.currentTime === 'number' && d.info.currentTime > 0) { pos.current = d.info.currentTime; movido.current = true; }
        if (d.info.duration) dur.current = d.info.duration;
      }
      if (d?.event === 'ready' && host === 'player.vimeo.com') marco.current?.contentWindow?.postMessage(JSON.stringify({ method: 'addEventListener', value: 'timeupdate' }), '*');
      if (d?.event === 'timeupdate' && d.data) { pos.current = d.data.seconds; dur.current = d.data.duration; movido.current = true; }
    };
    window.addEventListener('message', f);
    const t = setInterval(() => guardar(), 10000);
    const salir = () => guardar(true);
    window.addEventListener('pagehide', salir);
    return () => { window.removeEventListener('message', f); clearInterval(t); window.removeEventListener('pagehide', salir); guardar(true); };
  }, [guardar]);
  const alCargar = () => {
    // YouTube: que nos vaya contando por dónde va.
    if (/youtube/.test(embed || '')) marco.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: l.id, channel: 'widget' }), '*');
  };
  const desdeElPrincipio = () => {
    setAviso(false); pos.current = 0; movido.current = true;
    if (vid.current) vid.current.currentTime = 0; else setDesde(0);
  };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {aviso && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', borderRadius: 12, fontSize: 14, background: 'color-mix(in oklab, var(--purple) 9%, var(--bg-2))' }}>
          <span style={{ flex: 1 }}>▶ Sigues por donde lo dejaste (minuto {minutos(desde)}).</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={desdeElPrincipio}>Empezar desde el principio</button>
        </div>
      )}
      {embed && (
        <div style={{ aspectRatio: '16 / 9', borderRadius: 16, overflow: 'hidden', background: '#000' }}>
          <iframe key={embed} ref={marco} src={embed} onLoad={alCargar} title={l.titulo} style={{ width: '100%', height: '100%', border: 0 }} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      )}
      {video?.src && (
        <video ref={vid} src={video.src} controls playsInline preload="metadata" controlsList="nodownload" style={{ width: '100%', maxHeight: '75vh', borderRadius: 16, background: '#000' }}
          onLoadedMetadata={e => { dur.current = e.currentTarget.duration || 0; if (desde && desde < dur.current - 15) e.currentTarget.currentTime = desde; }}
          onTimeUpdate={e => { pos.current = e.currentTarget.currentTime; dur.current = e.currentTarget.duration || dur.current; movido.current = true; if (aviso && Math.abs(pos.current - desde) > 20) setAviso(false); }}
          onPause={() => guardar()} onEnded={() => { pos.current = dur.current; guardar(true); }} />
      )}
    </div>
  );
}

// ═══════════════════════ Apuntes ═══════════════════════
// Los de la lección (se guardan solos) y todos los del curso (para leerlos,
// bajarlos o imprimirlos). Solo los ve quien los escribe.
function Apuntes({ l, onGuardado }) {
  const [texto, setTexto] = useState(l.apuntes || '');
  const [estado, setEstado] = useState('');
  const [abierto, setAbierto] = useState(!!l.apuntes);
  const temp = useRef(null), ultimo = useRef(l.apuntes || ''), actual = useRef(texto);
  const guardar = useCallback(async (v) => {
    clearTimeout(temp.current); temp.current = null;
    if (v === ultimo.current) return;
    setEstado('Guardando…');
    try {
      const r = await fetch(`/api/aula/lecciones/${l.id}/apuntes`, { method: 'PUT', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: v }) });
      if (!r.ok) throw new Error();
      ultimo.current = v; onGuardado?.(v); setEstado('Guardado');
    } catch { setEstado('No se ha podido guardar: vuelve a intentarlo'); }
  }, [l.id, onGuardado]);
  // Al cambiar de lección, lo que quede por guardar se guarda.
  useEffect(() => () => { if (temp.current) guardar(actual.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cambiar = (v) => { setTexto(v); actual.current = v; setEstado(''); clearTimeout(temp.current); temp.current = setTimeout(() => guardar(v), 1000); };
  if (!abierto) return <button type="button" className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }} onClick={() => setAbierto(true)}>📝 Tomar apuntes de esta lección</button>;
  return (
    <div style={{ ...tarjeta, padding: 14, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ flex: 1 }}>📝 Mis apuntes</b>
        <span style={{ fontSize: 12, color: estado.startsWith('No') ? 'var(--pink)' : 'var(--ink-3)' }}>{estado || 'Se guardan solos · solo los ves tú'}</span>
      </div>
      <textarea aria-label="Mis apuntes de esta lección" rows={5} value={texto} onChange={e => cambiar(e.target.value)} onBlur={() => guardar(texto)}
        placeholder="Escribe aquí lo que quieras recordar de esta lección."
        style={{ fontFamily: 'inherit', fontSize: 15, lineHeight: 1.5, padding: 12, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', resize: 'vertical' }} />
    </div>
  );
}
function MisApuntes({ cursoId, onCerrar }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    fetch(`/api/aula/cursos/${cursoId}/apuntes`, { credentials: 'include', cache: 'no-store' }).then(r => (r.ok ? r.json() : { apuntes: [] })).then(setD).catch(() => setD({ apuntes: [] }));
    const f = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [cursoId, onCerrar]);
  const comoTexto = () => [`Mis apuntes · ${d.curso}`, '', ...d.apuntes.flatMap(a => [`── ${a.tema} · ${a.leccion} ──`, a.texto, ''])].join('\n');
  function bajar() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([comoTexto()], { type: 'text/plain;charset=utf-8' }));
    a.download = `apuntes-${String(d.curso).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '-').toLowerCase()}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function imprimir() {
    const esc = (t) => String(t).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Mis apuntes · ${esc(d.curso)}</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;line-height:1.55}h1{font-size:22px}h2{font-size:15px;margin:22px 0 4px;color:#5233A8}p{white-space:pre-wrap;margin:0}</style><h1>Mis apuntes · ${esc(d.curso)}</h1>${d.apuntes.map(a => `<h2>${esc(a.tema)} · ${esc(a.leccion)}</h2><p>${esc(a.texto)}</p>`).join('')}`);
    w.document.close(); w.focus(); w.print();
  }
  return (
    <div role="dialog" aria-label="Mis apuntes" onClick={onCerrar} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...tarjeta, width: 'min(720px, 100%)', maxHeight: '88vh', overflowY: 'auto', padding: 20, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ flex: 1, fontSize: 18 }}>📝 Mis apuntes del curso</b>
          <button type="button" className="icon-btn" onClick={onCerrar} aria-label="Cerrar"><I.X /></button>
        </div>
        {!d ? <span style={{ color: 'var(--ink-3)' }}>Cargando…</span> : !d.apuntes.length ? (
          <span style={{ color: 'var(--ink-3)' }}>Todavía no has tomado apuntes. En cada lección, abajo, tienes «Tomar apuntes de esta lección».</span>
        ) : <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={bajar}><I.Download /> Descargar (.txt)</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={imprimir}>🖨 Imprimir</button>
          </div>
          {d.apuntes.map(a => (
            <div key={a.id} style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--purple)' }}>{a.tema} · {a.leccion}</span>
              <div style={{ padding: 12, borderRadius: 12, background: 'var(--bg-3)' }}><Texto texto={a.texto} /></div>
            </div>
          ))}
        </>}
      </div>
    </div>
  );
}

// ═══════════════════════ Clases en directo ═══════════════════════
// Antes: cuándo es, cuánto falta y apuntarla en el calendario. Desde 15 minutos
// antes hasta que acaba: el botón para entrar al Meet. Después: la grabación, si
// la hay. Cuenta como vista al entrar o al abrirla una vez terminada.
const ANTES_DE_ENTRAR = 15 * 60000;
function enlaceCalendario(l, curso) {
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const fin = new Date(new Date(l.directo.at).getTime() + l.directo.min * 60000);
  const detalles = `Clase en directo de «${curso}» (aula virtual de Aim Education).${l.directo.enlace ? `\nPara entrar: ${l.directo.enlace}` : ''}\nTambién desde el curso: ${window.location.origin}/aula`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${l.titulo} · ${curso}`)}&dates=${f(l.directo.at)}/${f(fin)}&details=${encodeURIComponent(detalles)}${l.directo.enlace ? `&location=${encodeURIComponent(l.directo.enlace)}` : ''}`;
}
function bajarIcs(l, curso) {
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (t) => String(t).replace(/[\\,;]/g, m => `\\${m}`).replace(/\n/g, '\\n');
  const fin = new Date(new Date(l.directo.at).getTime() + l.directo.min * 60000);
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aim Education//Aula virtual//ES', 'BEGIN:VEVENT', `UID:aula-directo-${l.id}@aimeducation.es`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(l.directo.at)}`, `DTEND:${f(fin)}`, `SUMMARY:${esc(`${l.titulo} · ${curso}`)}`, l.directo.enlace ? `LOCATION:${esc(l.directo.enlace)}` : null,
    `DESCRIPTION:${esc(`Clase en directo del aula virtual.${l.directo.enlace ? ` Para entrar: ${l.directo.enlace}` : ''}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Clase en directo', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lineas.join('\r\n')], { type: 'text/calendar' }));
  a.download = `clase-${l.id}.ics`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function ClaseDirecto({ l, curso, gestor, onVista, actualizar }) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 20000); return () => clearInterval(t); }, []);
  const ini = new Date(l.directo.at).getTime(), fin = ini + l.directo.min * 60000;
  const fase = ahora < ini - ANTES_DE_ENTRAR ? 'antes' : ahora < fin ? 'ahora' : 'despues';
  // Terminada, con solo abrirla ya cuenta.
  useEffect(() => { if (fase === 'despues') onVista?.(); }, [fase]); // eslint-disable-line react-hooks/exhaustive-deps
  const g = l.directo.grabacion;
  return (
    <div style={{ ...tarjeta, padding: 22, display: 'grid', gap: 12 }}>
      {fase === 'ahora' && <span style={{ justifySelf: 'start', fontSize: 12, fontWeight: 900, color: '#fff', background: 'var(--pink)', padding: '3px 10px', borderRadius: 999 }}>{ahora < ini ? `EMPIEZA EN ${queda(ini - ahora).toUpperCase()}` : '● EN DIRECTO AHORA'}</span>}
      <b style={{ fontSize: 20 }}>📡 Clase en directo {fechaLarga(l.directo.at)}</b>
      <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>Dura unos {l.directo.min} minutos.{fase === 'antes' ? ` Faltan ${queda(ini - ahora)}.` : ''}</span>
      {(fase === 'ahora' || gestor) && (l.directo.enlace
        ? <a className="btn btn-primary" style={{ justifySelf: 'start' }} href={l.directo.enlace} target="_blank" rel="noopener noreferrer" onClick={() => onVista?.()}>🎥 Entrar a la clase (Google Meet)</a>
        : <span style={{ color: 'var(--pink)', fontWeight: 700 }}>Falta el enlace de la clase: avisa al profesor desde «Dudas».</span>)}
      {fase === 'antes' && (
        <>
          <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>El botón para entrar se activa 15 minutos antes. Te avisaremos el día antes y una hora antes.</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="btn btn-sm btn-outline" href={enlaceCalendario(l, curso)} target="_blank" rel="noopener noreferrer">📅 Añadir a Google Calendar</a>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => bajarIcs(l, curso)}>Otro calendario (.ics)</button>
          </div>
        </>
      )}
      {fase === 'despues' && (g ? (
        <>
          <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>La clase ya ha terminado. Aquí tienes la grabación:</span>
          <VideoConMemoria l={l} video={g} gestor={gestor} actualizar={actualizar} />
        </>
      ) : <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>La clase ya ha terminado. Cuando el profesor suba la grabación, estará aquí.</span>)}
    </div>
  );
}

// ═══════════════════════ Cuestionarios (#439) ═══════════════════════
const LETRA = ['A', 'B', 'C', 'D'];
const notaTexto = (n) => `${String(Math.round(Number(n) * 100) / 100).replace('.', ',')} / 10`;

function Opcion({ letra, texto, estado, onClick, disabled }) {
  const color = estado === 'bien' ? 'var(--teal)' : estado === 'mal' ? 'var(--pink)' : estado === 'elegida' ? 'var(--purple)' : 'var(--line)';
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ font: 'inherit', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: '12px 14px', borderRadius: 14,
        cursor: disabled ? 'default' : 'pointer', border: `2px solid ${color}`, color: 'var(--ink)',
        background: estado && estado !== 'nada' ? `color-mix(in oklab, ${color} 12%, var(--bg-2))` : 'var(--bg-2)' }}>
      <b style={{ width: 30, height: 30, borderRadius: 99, display: 'grid', placeItems: 'center', flex: 'none', background: estado && estado !== 'nada' ? color : 'var(--bg-3)', color: estado && estado !== 'nada' ? '#fff' : 'var(--ink-2)' }}>{letra}</b>
      <span style={{ flex: 1, fontSize: 16 }}>{texto}</span>
      {estado === 'bien' && <span aria-label="Correcta">✓</span>}
      {estado === 'mal' && <span aria-label="Incorrecta">✗</span>}
    </button>
  );
}

function Cuestionario({ l, gestor, onHecho }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => {
    fetch(`/api/aula/lecciones/${l.id}/cuestionario`, { credentials: 'include', cache: 'no-store' })
      .then(async r => { const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'No se puede abrir el cuestionario.'); setD(x); })
      .catch(e => setError(e.message));
  }, [l.id]);
  useEffect(() => { cargar(); }, [cargar]);
  if (error) return <p style={{ color: 'var(--pink)' }}>{error}</p>;
  if (!d) return <p style={{ color: 'var(--ink-3)' }}>Cargando el cuestionario…</p>;
  if (!d.preguntas.length) return <p style={{ color: 'var(--ink-3)' }}>Este cuestionario aún no tiene preguntas.</p>;
  return d.modo === 'evaluable' && !gestor
    ? <Evaluable d={d} l={l} recargar={() => { cargar(); onHecho?.(); }} />
    : <Practica d={d} l={l} gestor={gestor} onHecho={onHecho} />;
}

// #453: las preguntas y sus respuestas salen en otro orden cada vez. Cada
// opción guarda su número de verdad (k): eso es lo que se contesta y se corrige.
function barajar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const barajarCuestionario = (preguntas) => barajar(preguntas).map(p => ({ ...p, orden: barajar(p.opciones.map((_, k) => k)) }));

// De práctica, como en Learning Dungeon: una a una, se ve al momento si está
// bien; si no, se vuelve a intentar. Cuenta lo acertado a la primera.
function Practica({ d, l, gestor, onHecho }) {
  const [ps, setPs] = useState(() => barajarCuestionario(d.preguntas));
  const [i, setI] = useState(0);
  const [tocadas, setTocadas] = useState([]);       // las elegidas en la pregunta de ahora
  const [primeras, setPrimeras] = useState({});     // { idPregunta: primera elegida }
  const [fin, setFin] = useState(null);
  const p = ps[i];
  const acertada = tocadas.includes(p?.correcta);

  function elegir(k) {
    if (acertada || tocadas.includes(k)) return;
    setTocadas(t => [...t, k]);
    setPrimeras(x => (p.id in x ? x : { ...x, [p.id]: k }));
  }
  async function terminar() {
    const aciertos = ps.filter(q => primeras[q.id] === q.correcta).length;
    setFin({ aciertos, total: ps.length });
    if (gestor) return;
    await fetch(`/api/aula/lecciones/${l.id}/intentos`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ respuestas: primeras }) }).catch(() => {});
    onHecho?.();
  }
  function otraVez() { setPs(barajarCuestionario(d.preguntas)); setI(0); setTocadas([]); setPrimeras({}); setFin(null); }

  if (fin) {
    const pct = Math.round(100 * fin.aciertos / fin.total);
    return (
      <div style={{ ...tarjeta, padding: 24, display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center' }}>
        <span style={{ fontSize: 44 }}>{pct === 100 ? '🏆' : pct >= 70 ? '🎉' : '💪'}</span>
        <b style={{ fontSize: 22 }}>Has acertado {fin.aciertos} de {fin.total} a la primera</b>
        <span style={{ color: 'var(--ink-3)' }}>{pct === 100 ? '¡Perfecto!' : pct >= 70 ? '¡Muy bien! Repítelo para afinar.' : 'Repítelo: a la segunda sale mejor.'}</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={otraVez}>Repetir</button>
      </div>
    );
  }
  return (
    <div style={{ ...tarjeta, padding: 20, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: 'var(--ink-3)' }}>
        <span style={{ fontWeight: 800, color: 'var(--purple)' }}>Práctica{gestor ? ' (vista del personal)' : ''}</span>
        <span style={{ flex: 1 }} />
        <span>Pregunta {i + 1} de {ps.length}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden' }}><div style={{ width: `${100 * i / ps.length}%`, height: '100%', background: 'var(--purple)', transition: 'width .3s' }} /></div>
      {p.imagen && <img src={p.imagen} alt="" style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain', justifySelf: 'center', borderRadius: 12 }} />}
      <b style={{ fontSize: 20, lineHeight: 1.35 }}>{p.enunciado}</b>
      <div style={{ display: 'grid', gap: 8 }}>
        {p.orden.map((k, pos) => (
          <Opcion key={k} letra={LETRA[pos]} texto={p.opciones[k]} disabled={acertada}
            estado={tocadas.includes(k) ? (k === p.correcta ? 'bien' : 'mal') : acertada ? 'nada' : null} onClick={() => elegir(k)} />
        ))}
      </div>
      {tocadas.length > 0 && !acertada && <span style={{ color: 'var(--pink)', fontWeight: 700 }}>No es esa. Prueba otra vez.</span>}
      {acertada && (
        <div style={{ display: 'grid', gap: 10 }}>
          <span style={{ color: 'var(--teal)', fontWeight: 800 }}>{tocadas.length === 1 ? '¡Correcto!' : 'Ahora sí.'}</span>
          {p.explicacion && <div style={{ padding: 12, borderRadius: 12, background: 'var(--bg-3)', fontSize: 14 }}><Texto texto={p.explicacion} /></div>}
          <button type="button" className="btn btn-primary btn-sm" style={{ justifySelf: 'end' }}
            onClick={() => { if (i + 1 < ps.length) { setI(i + 1); setTocadas([]); } else terminar(); }}>{i + 1 < ps.length ? 'Siguiente pregunta →' : 'Ver cómo me ha ido'}</button>
        </div>
      )}
    </div>
  );
}

function Correcciones({ detalle }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {detalle.map((q, n) => (
        <div key={n} style={{ ...tarjeta, padding: 16, display: 'grid', gap: 8, borderColor: q.bien ? 'var(--teal)' : 'var(--pink)' }}>
          <b>{n + 1}. {q.enunciado} <span style={{ color: q.bien ? 'var(--teal)' : 'var(--pink)' }}>{q.bien ? '✓' : '✗'}</span></b>
          {q.imagen && <img src={q.imagen} alt="" style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 10 }} />}
          {q.opciones.map((o, k) => (
            <Opcion key={k} letra={LETRA[k]} texto={o} disabled estado={k === q.correcta ? 'bien' : k === q.elegida ? 'mal' : 'nada'} />
          ))}
          {q.elegida == null && <span style={{ fontSize: 13, color: 'var(--pink)' }}>Sin contestar.</span>}
          {q.explicacion && <div style={{ padding: 10, borderRadius: 10, background: 'var(--bg-3)', fontSize: 14 }}><Texto texto={q.explicacion} /></div>}
        </div>
      ))}
    </div>
  );
}

// Evaluable: se contesta entero, se entrega y sale la nota con las correcciones.
function Evaluable({ d, l, recargar }) {
  const [haciendo, setHaciendoE] = useState(false);
  const [ps, setPs] = useState(() => barajarCuestionario(d.preguntas));
  // Cada intento, en otro orden.
  const setHaciendo = (v) => { if (v) setPs(barajarCuestionario(d.preguntas)); setHaciendoE(v); };
  const [resp, setResp] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  // Con tiempo límite: la marca de cuándo empezó (la firma el servidor) y lo que queda.
  const [empezado, setEmpezado] = useState(null);
  const [fin, setFin] = useState(null);
  const [queda, setQueda] = useState(null);
  const agotado = d.quedan === 0;
  const contestadas = Object.keys(resp).length;
  const minima = d.notaMinima ?? 5;
  const respRef = useRef(resp); respRef.current = resp;

  async function empezar() {
    setError('');
    if (d.tiempoMin) {
      try {
        const r = await fetch(`/api/aula/lecciones/${l.id}/cuestionario?empezar=1`, { credentials: 'include', cache: 'no-store' });
        const x = await r.json().catch(() => ({}));
        if (!r.ok || !x.empezado) throw new Error(x.error || 'No se ha podido empezar.');
        setEmpezado(x.empezado); setFin(Date.now() + d.tiempoMin * 60000);
      } catch (e) { setError(e.message); return; }
    }
    setHaciendo(true);
  }
  useEffect(() => {
    if (!haciendo || !fin) return undefined;
    const paso = () => {
      const q = Math.max(0, Math.round((fin - Date.now()) / 1000));
      setQueda(q);
      if (q <= 0) entregar(true);
    };
    paso();
    const t = setInterval(paso, 1000);
    return () => clearInterval(t);
  }, [haciendo, fin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function entregar(solo = false) {
    if (enviando) return;
    if (!solo && contestadas < d.preguntas.length && !window.confirm(`Te faltan ${d.preguntas.length - contestadas} por contestar. ¿Entregar igualmente?`)) return;
    setEnviando(true); setError(''); setFin(null);
    try {
      const r = await fetch(`/api/aula/lecciones/${l.id}/intentos`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ respuestas: respRef.current, empezado }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'No se ha podido entregar.');
      setResultado(x); setHaciendo(false); setResp({});
      recargar();
    } catch (e) { setError(e.message); } finally { setEnviando(false); }
  }

  if (resultado) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ ...tarjeta, padding: 20, display: 'grid', gap: 6, justifyItems: 'center', textAlign: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>Tu nota</span>
          <b style={{ fontSize: 40, color: resultado.nota >= minima ? 'var(--teal)' : 'var(--pink)' }}>{notaTexto(resultado.nota)}</b>
          <span>{resultado.aciertos} de {resultado.total} bien · {resultado.nota >= minima ? '¡Aprobado!' : `para aprobar hace falta un ${String(minima).replace('.', ',')}`}</span>
          {/* d ya viene al día (se recarga al entregar): quedan los de después de este. */}
          {(d.quedan == null || d.quedan > 0) && <button type="button" className="btn btn-outline btn-sm" onClick={() => setResultado(null)}>Volver a intentarlo</button>}
        </div>
        <Correcciones detalle={resultado.detalle} />
      </div>
    );
  }
  if (!haciendo) {
    return (
      <div style={{ ...tarjeta, padding: 20, display: 'grid', gap: 10 }}>
        <b style={{ fontSize: 17 }}>Cuestionario evaluable · {d.preguntas.length} preguntas</b>
        <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>
          Se contesta entero y se entrega: la nota es sobre 10 y se aprueba con un {String(minima).replace('.', ',')}.{d.tiempoMin ? ` Tienes ${d.tiempoMin} minutos desde que empiezas: al acabarse, se entrega solo.` : ''} {d.intentos ? `Tienes ${d.intentos} ${d.intentos === 1 ? 'intento' : 'intentos'} (has usado ${d.usados}).` : 'Puedes repetirlo las veces que quieras; cuenta tu mejor nota.'}
        </span>
        {d.mejor != null && <span style={{ fontWeight: 800 }}>Tu mejor nota: {notaTexto(d.mejor)}</span>}
        {!agotado && <button type="button" className="btn btn-primary btn-sm" style={{ justifySelf: 'start' }} onClick={empezar}>{d.usados ? 'Hacerlo otra vez' : 'Empezar'}{d.tiempoMin ? ` (${d.tiempoMin} min)` : ''}</button>}
        {error && <span style={{ color: 'var(--pink)', fontWeight: 700 }}>{error}</span>}
        {agotado && <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>Ya has usado todos los intentos.</span>}
        {d.ultimo && (
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Ver tu último intento ({notaTexto(d.ultimo.nota)})</summary>
            <div style={{ marginTop: 10 }}><Correcciones detalle={d.ultimo.detalle} /></div>
          </details>
        )}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {ps.map((p, n) => (
        <div key={p.id} style={{ ...tarjeta, padding: 16, display: 'grid', gap: 8 }}>
          <b>{n + 1}. {p.enunciado}</b>
          {p.imagen && <img src={p.imagen} alt="" style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 10 }} />}
          {p.orden.map((k, pos) => (
            <Opcion key={k} letra={LETRA[pos]} texto={p.opciones[k]} estado={resp[p.id] === k ? 'elegida' : null} onClick={() => setResp(x => ({ ...x, [p.id]: k }))} />
          ))}
        </div>
      ))}
      {error && <span style={{ color: 'var(--pink)', fontWeight: 700 }}>{error}</span>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', bottom: 0, padding: '10px 0', background: 'var(--bg)' }}>
        <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{contestadas} de {d.preguntas.length} contestadas</span>
        {queda != null && fin && <b role="timer" aria-label="Tiempo que queda" style={{ fontSize: 15, padding: '3px 10px', borderRadius: 999, color: queda <= 60 ? '#fff' : 'var(--ink)', background: queda <= 60 ? 'var(--pink)' : 'var(--bg-3)' }}>⏱ {minutos(queda)}</b>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setHaciendo(false); setResp({}); setFin(null); }}>Salir sin entregar</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={enviando} onClick={() => entregar()}>{enviando ? 'Entregando…' : 'Entregar'}</button>
      </div>
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
              <input type="file" onChange={async x => { const f = x.target.files?.[0] || null; x.target.value = ''; setArchivo(f ? await imagenSubible(f) : null); }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
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
      {d.cursos.length === 0 && !d.familia?.length && (
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
                    {c.progreso === 100 && c.lecciones > 0 && <BotonDiploma url={`/api/aula/cursos/${c.id}/diploma`} valorar={!c.valorado} />}
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => go(`/aula/${c.id}/curso`)}>{c.progreso === 100 ? 'Repasar' : c.hechas ? 'Seguir' : 'Empezar'}</button>
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
      {d.familia?.length > 0 && (
        <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>Los cursos de tus hijos</h3>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {d.familia.map(c => {
              const dias = c.ultimoAcceso ? Math.floor((Date.now() - new Date(c.ultimoAcceso).getTime()) / 86400000) : null;
              return (
                <div key={`${c.nombre}-${c.id}`} className="panel" style={{ padding: 16, display: 'grid', gap: 8, alignContent: 'start' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--purple)' }}>{c.nombre}</span>
                  <b style={{ fontSize: 16 }}>{c.titulo}</b>
                  <Progreso pct={c.progreso} />
                  <span style={{ fontSize: 13, color: dias != null && dias > 7 && c.progreso < 100 ? 'var(--orange)' : 'var(--ink-3)' }}>
                    {c.progreso === 100 ? '🎉 Curso terminado' : dias == null ? 'Aún no ha entrado' : `Entró ${dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`}`}
                  </span>
                  {c.proximaClase && <span style={{ fontSize: 13 }}>📡 Próxima clase en directo: {fechaLarga(c.proximaClase)}</span>}
                  {c.tareas > 0 && c.progreso < 100 && <span style={{ fontSize: 13 }}>✏️ {c.tareas} {c.tareas === 1 ? 'tarea por entregar' : 'tareas por entregar'}</span>}
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Lo hace con su cuenta. Los avisos del curso os llegan también a vosotros.</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
