import React, { useState, useEffect, useRef } from 'react';
import { I } from './Icons.jsx';
import { AimHeader, AimFooter, ACT_BY_ID, MagicText } from './Shared.jsx';
import { IconoActividad } from './IconoActividad.jsx';
import { TarjetaActividad } from './PublicActivity.jsx';
import { useClasesPublicas, fichasWeb } from './clasesPublicas.js';
import { useRouter } from '../App.jsx';
import { ContenidoExterno, useCookiesExternas } from './Cookies.jsx';

const CAT_COLOR = { taekwondo: '#21B668', ballet: '#FF99D3', ingles: '#00BBF4', robotica: '#FFD526', baile: '#AF99FF', pintura: '#5233A8', funcional: '#FF4F15', pilates: '#BFD300', camaleon: '#25D8BA', competicion: '#21B668', club: '#5233A8', general: '#5233A8', shelfie: '#FF99D3' };
const catColor = c => CAT_COLOR[c] || '#5233A8';
const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Lo que dicen las familias. Se escriben desde el panel; los de Google llevan su
// marca para que se vea de dónde salen.
function Testimonios({ lista }) {
  if (!lista?.length) return null;
  return (
    <section className="block tight">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Lo que dicen las familias</span>
            <h2 className="section-title">Quien mejor nos conoce.</h2>
          </div>
        </div>
        <div className="testi-grid">
          {lista.map(t => (
            <figure key={t.id} className="testi">
              <div className="testi-estrellas" aria-label={`${t.estrellas} de 5`}>
                {'★'.repeat(t.estrellas)}<span className="apagadas">{'★'.repeat(5 - t.estrellas)}</span>
              </div>
              <blockquote>{t.texto}</blockquote>
              <figcaption>
                <span className="quien">{t.nombre}</span>
                {t.actividad && <span className="que"> · {t.actividad}</span>}
                {t.origen === 'google' && <span className="google">Reseña de Google</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// Trabaja con nosotros (#368): formulario propio. Nombre, correo, teléfono, qué
// clases podría dar (las actividades del club, más «Otras»), un mensaje y el CV
// en PDF. Llega al panel (Personas → Candidatos) y a info@, con el CV.
const MAX_CV = 4 * 1024 * 1024;
function TrabajaConNosotros({ empleo }) {
  const { activo } = empleo || {};
  const [clases, setClases] = useState([]);
  const [f, setF] = useState({ nombre: '', email: '', telefono: '', otros: '', mensaje: '', web: '' });
  const [elegidas, setElegidas] = useState([]);
  const [otras, setOtras] = useState(false);
  const [cv, setCv] = useState(null);
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState(false);
  const [encima, setEncima] = useState(false);
  const inputCv = useRef(null);

  useEffect(() => {
    if (!activo) return;
    fetch('/api/empleo').then(r => (r.ok ? r.json() : { clases: [] })).then(d => setClases(d.clases || [])).catch(() => {});
  }, [activo]);

  const upd = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  const alternar = (c) => setElegidas(l => (l.includes(c) ? l.filter(x => x !== c) : [...l, c]));
  function tomarCv(file) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { setError('El currículum tiene que ser un PDF.'); return; }
    if (file.size > MAX_CV) { setError('El PDF no puede pasar de 4 MB.'); return; }
    const fr = new FileReader();
    fr.onload = () => { setError(''); setCv({ data: String(fr.result).replace(/^data:[^;]*;/, 'data:application/pdf;'), nombre: file.name, bytes: file.size }); };
    fr.readAsDataURL(file);
  }
  async function enviar(e) {
    e.preventDefault();
    if (!elegidas.length && !(otras && f.otros.trim())) { setError('Marca qué clases podrías dar (o escribe cuáles en «Otras»).'); return; }
    setEnviando(true); setError('');
    try {
      const r = await fetch('/api/empleo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, otros: otras ? f.otros : '', clases: elegidas, cv: cv?.data || null, cvNombre: cv?.nombre || null, aceptaPrivacidad: acepta }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setHecho(true);
      else setError(d.error || 'No se ha podido enviar.');
    } catch { setError('No hay conexión. Inténtalo de nuevo.'); }
    finally { setEnviando(false); }
  }

  if (!activo) return null;
  const inp = { fontFamily: 'inherit', fontSize: 15, padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%' };
  const etiqueta = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 };
  const pastilla = (sel) => ({
    padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
    border: `1.5px solid ${sel ? 'var(--purple)' : 'var(--line)'}`, background: sel ? 'var(--purple)' : 'var(--bg-3)', color: sel ? '#fff' : 'var(--ink-2)',
    transition: 'background .15s, border-color .15s',
  });
  return (
    <section className="block tight" id="empleo">
      <div className="container">
        <div className="empleo-caja">
          <div>
            <span className="eyebrow">Únete al equipo</span>
            <h2 className="section-title">{empleo.titulo}</h2>
            <p className="section-lede" style={{marginTop: 10}}>{empleo.texto}</p>
          </div>
          <div className="empleo-form" style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 22, padding: 22, boxShadow: 'var(--shadow)' }}>
            {hecho ? (
              <div style={{ display: 'grid', gap: 10, textAlign: 'center', padding: '26px 8px' }}>
                <div style={{ fontSize: 42 }}>🙌</div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800 }}>¡Gracias, {f.nombre.split(' ')[0]}!</h3>
                <p style={{ margin: 0, color: 'var(--ink-2)' }}>Hemos recibido tu candidatura. Si encaja con lo que buscamos, te escribiremos a {f.email}.</p>
              </div>
            ) : (
              <form onSubmit={enviar} style={{ display: 'grid', gap: 14 }}>
                <label style={etiqueta}>Nombre y apellidos
                  <input value={f.nombre} onChange={upd('nombre')} required maxLength={160} autoComplete="name" style={inp} /></label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
                  <label style={etiqueta}>Correo electrónico
                    <input type="email" value={f.email} onChange={upd('email')} required maxLength={255} autoComplete="email" style={inp} /></label>
                  <label style={etiqueta}>Teléfono
                    <input type="tel" value={f.telefono} onChange={upd('telefono')} maxLength={40} autoComplete="tel" style={inp} /></label>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>¿Qué clases podrías dar?</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Clases que podrías dar">
                    {clases.map(c => <button key={c} type="button" aria-pressed={elegidas.includes(c)} onClick={() => alternar(c)} style={pastilla(elegidas.includes(c))}>{c}</button>)}
                    <button type="button" aria-pressed={otras} onClick={() => setOtras(o => !o)} style={pastilla(otras)}>Otras…</button>
                  </div>
                  {otras && <input value={f.otros} onChange={upd('otros')} maxLength={300} placeholder="¿Cuáles? (p. ej. ajedrez, guitarra, monitor de comedor…)" aria-label="Otras clases" style={inp} autoFocus />}
                </div>
                <label style={etiqueta}>Cuéntanos algo de ti <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(opcional)</span>
                  <textarea value={f.mensaje} onChange={upd('mensaje')} maxLength={3000} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="Experiencia, titulación, disponibilidad…" /></label>
                <div style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Currículum en PDF <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(opcional, máx. 4 MB)</span></span>
                  {cv ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg-3)' }}>
                      <span aria-hidden="true" style={{ fontSize: 22 }}>📄</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cv.nombre}</span>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => setCv(null)}>Quitar</button>
                    </div>
                  ) : (
                    <div onClick={() => inputCv.current?.click()} onDragOver={e => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)}
                      onDrop={e => { e.preventDefault(); setEncima(false); tomarCv(e.dataTransfer.files?.[0]); }}
                      role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') inputCv.current?.click(); }}
                      style={{ border: `1.5px dashed ${encima ? 'var(--purple)' : 'var(--line)'}`, background: encima ? 'color-mix(in oklab, var(--purple) 8%, var(--bg-3))' : 'var(--bg-3)', borderRadius: 12, padding: '16px 14px', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: 'var(--ink-3)' }}>
                      <b style={{ color: 'var(--ink-2)' }}>Sube tu CV</b> o arrástralo aquí
                    </div>
                  )}
                  <input ref={inputCv} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={e => { const fl = e.target.files?.[0]; e.target.value = ''; tomarCv(fl); }} />
                </div>
                {/* Campo trampa: las personas no lo ven; los robots lo rellenan. */}
                <input value={f.web} onChange={upd('web')} tabIndex={-1} autoComplete="off" aria-hidden="true"
                  style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                  <input type="checkbox" required checked={acepta} onChange={e => setAcepta(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--purple)' }} />
                  <span>He leído la <a href="/legal/privacidad" target="_blank" rel="noopener">política de privacidad</a> y acepto que guardéis mi candidatura para procesos de selección del club.</span>
                </label>
                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-3)', fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>
                  <b>Protección de datos.</b> Responsable: AIM Deporte y Educación S.L. Finalidad: valorar tu candidatura y contactarte para este u otros
                  procesos de selección. Legitimación: tu consentimiento. No se ceden datos salvo obligación legal. Puedes pedir que la borremos o ejercer tus
                  derechos en info@aimeducation.es.
                </div>
                {error && <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--orange)' }}>{error}</p>}
                <button type="submit" className="btn btn-gradient btn-lg" disabled={enviando}>
                  {enviando ? 'Enviando…' : <>Enviar candidatura <I.Arrow /></>}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// Un hueco del mosaico. Lo que se ve y a dónde lleva se configura desde el panel
// (Portada web): puede ser una actividad, una imagen propia para destacar un
// evento o una noticia, o el patrón de la marca.
function BrandTile({ hueco, go }) {
  const a = ACT_BY_ID[hueco.actId];
  // Sin destino propio, una actividad lleva a su página; el resto, a inicio.
  const destino = hueco.url || (a ? `/actividades/${a.id}` : '/');
  const irA = () => {
    if (/^https?:\/\//i.test(destino)) window.open(destino, '_blank', 'noopener');
    else go(destino);
  };

  const conImagen = !!hueco.imagenUrl;
  const conPatron = hueco.tipo === 'patron' && !conImagen;
  // A sangre, la imagen ES el cuadro entero y no se ve nada de color detrás.
  // 'dentro' es la otra opción: la imagen completa sobre el color, sin recortar.
  const aSangre = conImagen ? hueco.encaje !== 'dentro' : conPatron;
  const sinColor = aSangre;

  return (
    <div className={`tile ${sinColor ? '' : 'colored'} ${hueco.titulo ? '' : 'sin-rotulo'} ${!sinColor && a ? a.className : ''} tile-link`}
      role="link" tabIndex={0}
      onClick={irA}
      onKeyDown={(e) => { if (e.key === 'Enter') irA(); }}
      data-w={hueco.ancho} data-h={hueco.alto}
      style={{
        /* La casilla donde empieza y cuántas ocupa: lo decide el panel. */
        gridColumn: `${hueco.col} / span ${hueco.ancho}`,
        gridRow: `${hueco.fila} / span ${hueco.alto}`,
        ...(sinColor ? {padding: 0} : null),
        /* Con la imagen de borde a borde no se ve nada del fondo: no se pinta
           ningún color detrás, que es justo lo que se pide al subir una foto. */
        ...(hueco.color && !a && !aSangre ? {background: hueco.color} : null),
      }}
      title={hueco.titulo || (a ? `Ver ${a.name}` : 'Ver más')}>

      {conImagen && (
        <img className={`tile-foto ${aSangre ? '' : 'dentro'}`} src={hueco.imagenUrl} alt={hueco.titulo || ''} />
      )}
      {conPatron && <div className="tile-foto tile-patron" />}

      {!conImagen && !conPatron && a && (
        // El icono de la actividad, el mismo SVG del panel, sin el cuadro de color
        // de los logos de antes (#302).
        <span className="tile-icon-hueco tile-icon-svg" aria-label={a.name}>
          <IconoActividad icon={a.icon} sobreColor style={{ width: '56%', height: '56%', maxWidth: 150, maxHeight: 150 }} />
        </span>
      )}

      {hueco.titulo && <span className="label">{hueco.titulo}</span>}
    </div>
  );
}

function NewsCard({ cat, color, img, ph, title, date, body }) {
  return (
    <div className="news-card">
      <div className="img" style={img ? { aspectRatio: 'auto', background: 'var(--bg-3)' } : { background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 55%, #000))` }}>
        {img && <img src={img} alt="" style={{ width: "100%", height: "auto", display: "block" }} />}
        <div className="badge-date">
          <div className="d">{date.d}</div>
          <div className="m">{date.m}</div>
        </div>
        {!img && <div className="ph-watermark">{ph}</div>}
      </div>
      <div className="body">
        <span className="cat" style={{ color }}>{cat}</span>
        <h4>{title}</h4>
        <p>{body}</p>
      </div>
    </div>
  );
}

export default function PublicLanding() {
  const { go } = useRouter();
  // Las actividades de verdad (las del panel), con los iconos del panel (#295).
  const { actividades } = useClasesPublicas();
  const destacadas = fichasWeb(actividades).slice(0, 6);
  const [posts, setPosts] = useState([]);
  const [events, setEvents] = useState([]);
  // Lo que el club puede cambiar de la portada, y los números del club. Se
  // arranca con algo razonable para que nunca se vea la portada a medio pintar.
  // El mismo mosaico que el servidor da por defecto, para que el primer pintado
  // sea ya el bueno y no haya un parpadeo mientras llega la configuración.
  const [portada, setPortada] = useState({
    cta: { texto: 'Campamento de verano', url: '/campamento' },
    anoFundacion: 2008,
    datos: [],
    columnas: 4, filas: 4,
    testimonios: [], empleo: { activo: false },
    mosaico: [
      { id: 'b1', col: 1, fila: 1, ancho: 2, alto: 2, tipo: 'patron', titulo: '10+ actividades', url: '/actividades' },
      { id: 'b2', col: 3, fila: 1, ancho: 2, alto: 1, tipo: 'actividad', actId: 'taekwondo', titulo: 'Taekwondo' },
      { id: 'b3', col: 3, fila: 2, ancho: 1, alto: 1, tipo: 'actividad', actId: 'ballet', titulo: 'Ballet' },
      { id: 'b4', col: 4, fila: 2, ancho: 1, alto: 1, tipo: 'actividad', actId: 'robotica', titulo: 'Robótica' },
      { id: 'b5', col: 1, fila: 3, ancho: 1, alto: 2, tipo: 'actividad', actId: 'funcional', titulo: 'Funcional' },
      { id: 'b6', col: 2, fila: 3, ancho: 1, alto: 2, tipo: 'actividad', actId: 'camaleon', titulo: 'Camaleón' },
      { id: 'b7', col: 3, fila: 3, ancho: 2, alto: 2, tipo: 'actividad', actId: 'pintura', titulo: 'Pintura' },
    ],
  });

  useEffect(() => {
    fetch('/api/posts?limit=3').then(r => r.ok ? r.json() : []).then(d => setPosts(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/events').then(r => r.ok ? r.json() : []).then(d => setEvents(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/landing').then(r => r.ok ? r.json() : null).then(d => { if (d) setPortada(d); }).catch(() => {});
  }, []);

  // El destino del botón puede ser una sección nuestra o un enlace de fuera.
  const irA = (url) => {
    if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener');
    else go(url || '/');
  };

  return (
    <>
      <AimHeader route="home" />
      <main style={{paddingTop: 0}}>
        {/* ===== HERO ===== */}
        <section className="hero">
          <div className="container">
            <div className="hero-grid">
              <div className="fade-up">
                <span className="pill-badge purple">Algeciras · Desde {portada.anoFundacion}</span>
                <h1>
                  Innovación educativa,<br/>
                  <MagicText>pasión por el aprendizaje.</MagicText>
                </h1>
                <p className="lede">
                  Taekwondo, Ballet, Inglés, Robótica y mucho más.
                  Una formación integral en valores, en un entorno de respeto
                  y tolerancia. Cada actividad está diseñada para sacar lo mejor
                  de cada alumno.
                </p>
                <div className="hero-ctas">
                  <button className="btn btn-gradient btn-lg" onClick={() => irA(portada.cta.url)}>
                    {portada.cta.texto} <I.Arrow />
                  </button>
                  <button className="btn btn-outline btn-lg" onClick={() => go("/actividades")}>
                    Ver actividades
                  </button>
                </div>

                <div className="hero-datos">
                  {portada.datos.map((d, i) => (
                    <div key={i}>
                      <div className="v">{d.v}</div>
                      <div className="l">{d.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Visual mosaic — brand submarcas */}
              {/* minmax(0,1fr) y no 1fr: con imágenes dentro, el mínimo automático
                  de la pista es el tamaño real de la imagen y la rejilla crece
                  hasta desbordar el hueco del hero. */}
              <div className="hero-vis fade-up d2" style={{
                gridTemplateColumns: `repeat(${portada.columnas || 4}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${portada.filas || 4}, minmax(0, 1fr))`,
              }}>
                {(portada.mosaico || []).map(h => <BrandTile key={h.id} hueco={h} go={go} />)}
              </div>
            </div>
          </div>
        </section>

        {/* ===== Badges strip ===== */}
        <div className="container">
          <div className="badges-strip">
            <div className="b">
              <span className="ico"><I.Bulb /></span>
              <span>Perseguimos la <b>innovación</b> en cada clase</span>
            </div>
            <div className="b">
              <span className="ico"><I.Trophy /></span>
              <span>Apostamos por la <b>excelencia</b> en nuestros servicios</span>
            </div>
            <div className="b">
              <span className="ico"><I.Heart /></span>
              <span>Sentimos <b>pasión</b> por nuestro trabajo</span>
            </div>
            <div className="b">
              <span className="ico"><I.Shield /></span>
              <span>Grupos reducidos y <b>atención personalizada</b></span>
            </div>
          </div>
        </div>

        {/* ===== Activities ===== */}
        <section className="block">
          <div className="container">
            <div className="section-head" style={{alignItems: "stretch", gap: 40}}>
              <div style={{flex: "1 1 460px", display: "flex", flexDirection: "column", justifyContent: "center"}}>
                <span className="eyebrow">Nuestras actividades</span>
                <h2 className="section-title">Una academia, <MagicText>mil maneras</MagicText> de aprender.</h2>
                <p className="section-lede" style={{marginTop: 12}}>
                  Cada actividad la dirigen profesionales cualificados con su propia metodología.
                  Grupos reducidos por edades — desde los 3 años hasta la edad adulta.
                </p>
              </div>
              <div style={{flex: "1 1 460px", maxWidth: 560}}>
                <div style={{
                  position: "relative",
                  aspectRatio: "16/9",
                  borderRadius: 18,
                  overflow: "hidden",
                  boxShadow: "var(--shadow)",
                  border: "1px solid var(--line)",
                  background: "var(--ink)",
                }}>
                  {/* YouTube pone cookies: el vídeo no se carga hasta que se
                      aceptan los contenidos externos (ticket #295). Se usa además
                      el dominio «nocookie» de YouTube, que pone menos. */}
                  <ContenidoExterno servicio="YouTube" que="el vídeo"
                    style={{position: "absolute", inset: 0, borderRadius: 0, border: 0, background: "var(--bg-3)"}}>
                    <iframe
                      src="https://www.youtube-nocookie.com/embed/_roTJYMv1R4?rel=0&modestbranding=1"
                      title="Aim Education — vídeo de presentación"
                      style={{position: "absolute", inset: 0, width: "100%", height: "100%", border: 0}}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </ContenidoExterno>
                </div>
                <div style={{display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: "var(--ink-3)"}}>
                  <I.Sparkle style={{color: "var(--teal)"}}/>
                  <span>Conoce el club por dentro · 1 min</span>
                </div>
              </div>
            </div>

            <div className="act-grid">
              {destacadas.map((a, i) => (
                <TarjetaActividad key={a.id} act={a} delay={i % 4 + 1} />
              ))}
            </div>

            <div style={{textAlign: "center", marginTop: 32}}>
              <button className="btn btn-outline btn-lg" onClick={() => go("/actividades")}>
                Ver todas las actividades <I.Arrow />
              </button>
            </div>
          </div>
        </section>

        {/* ===== News + Calendar ===== */}
        <section className="block tight" style={{background: "var(--bg-3)"}}>
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow purple">Últimas noticias</span>
                <h2 className="section-title">Lo que está pasando en <MagicText>Aim</MagicText></h2>
              </div>
              <button className="btn btn-outline" onClick={() => go("/noticias")}>Más noticias <I.Arrow /></button>
            </div>

            <div className="news-grid">
              <div className="news-list">
                {posts.length === 0 && (
                  <p style={{color: "var(--ink-3)", fontSize: 14}}>Aún no hay noticias publicadas.</p>
                )}
                {posts.map(p => {
                  const d = new Date(p.published_at || p.created_at);
                  const color = catColor(p.category);
                  return (
                    <div key={p.id} onClick={() => go(`/noticias/${p.slug}`)} style={{cursor: "pointer"}}>
                      <NewsCard
                        cat={`${p.category || "Aim"} · ${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`}
                        color={color}
                        img={p.cover_image_url || null}
                        ph={p.category || "aim"}
                        title={p.title}
                        date={{ d: String(d.getDate()).padStart(2, "0"), m: MONTH_ABBR[d.getMonth()] }}
                        body={p.excerpt || ""} />
                    </div>
                  );
                })}
              </div>

              <div className="calendar-card">
                <h3>Próximos eventos</h3>
                {events.length === 0 && (
                  <p style={{fontSize: 13, opacity: .85, marginBottom: 12}}>No hay eventos próximos publicados.</p>
                )}
                {events.slice(0, 3).map(ev => {
                  const d = new Date(ev.date);
                  const sub = [ev.time, ev.venue].filter(Boolean).join(" · ");
                  return (
                    <div key={ev.id} className="cal-event" onClick={() => go("/calendario")}>
                      <div className="date"><div className="d">{d.getDate()}</div><div className="m">{MONTH_ABBR[d.getMonth()]}</div></div>
                      <div className="info">
                        <h5>{ev.title}</h5>
                        <p>{sub || "Evento del club"}</p>
                      </div>
                    </div>
                  );
                })}
                <button className="btn btn-primary btn-block" onClick={() => go("/calendario")} style={{background: "white", color: "var(--ink)"}}>
                  Ver calendario completo
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ===== Sobre nosotros ===== */}
        <section className="block">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow pink">Sobre nosotros</span>
                <h2 className="section-title">Una formación <MagicText>integral</MagicText> y con valores.</h2>
              </div>
            </div>

            <div className="values-grid">
              <div className="about-block">
                <p>
                  <b>Nuestra misión</b> es proporcionar una formación integral, fomentando los valores
                  fundamentales entre nuestros alumnos en un entorno de respeto y tolerancia.
                  Utilizamos una amplia variedad de actividades como herramienta principal en nuestro
                  programa educativo, diseñadas y organizadas para adaptarse específicamente a las
                  características de cada grupo.
                </p>
                <p>
                  Nuestras actividades se clasifican por <b>grupos de edad</b>, cubriendo desde los 3 años
                  hasta la edad adulta. Este enfoque nos permite ofrecer una enseñanza que se ajusta
                  perfectamente a la edad y las necesidades individuales de cada estudiante. Además,
                  limitamos el número de plazas en todas nuestras actividades para garantizar
                  ambientes de trabajo reducidos y la atención más personalizada posible.
                </p>
              </div>

              <div style={{display: "grid", gap: 14}}>
                <div className="value-card v-innov">
                  <div className="icon"><I.Bulb /></div>
                  <h4>Innovación</h4>
                  <p>Perseguimos la innovación para ofrecer <b>nuevas oportunidades</b> a nuestros alumnos.</p>
                </div>
                <div className="value-card v-excel">
                  <div className="icon"><I.Trophy /></div>
                  <h4>Excelencia</h4>
                  <p>Nos exigimos lo mejor para ofrecer <b>excelencia</b> en nuestros servicios.</p>
                </div>
                <div className="value-card v-passion">
                  <div className="icon"><I.Heart /></div>
                  <h4>Pasión</h4>
                  <p>Sentimos <b>pasión</b> por nuestro trabajo. Disfrutamos de cada clase.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== CTA ===== */}
        <Testimonios lista={portada.testimonios} />
        <TrabajaConNosotros empleo={portada.empleo} />

        <section className="block tight">
          <div className="container">
            <div className="cta-block" style={{
              background: "var(--grad-aim)",
              borderRadius: 36,
              padding: "64px 56px",
              color: "white",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
              boxShadow: "var(--shadow-lg)",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.2))",
                pointerEvents: "none",
              }}/>
              <div style={{position: "relative"}}>
                <h2 style={{fontFamily: "var(--font-display)", fontSize: "clamp(34px, 4.4vw, 56px)", fontWeight: 800, letterSpacing: "-.035em", margin: 0, lineHeight: 1.05}}>
                  ¿Listo para empezar este curso?
                </h2>
                <p style={{fontSize: 18, maxWidth: 540, margin: "18px auto 0", color: "rgba(255,255,255,.92)"}}>
                  Reserva tu plaza online. ¿Quieres probar antes? Con el <b>Pase Explorador</b>{portada.paseExplorador ? ` (${portada.paseExplorador})` : ''} tienes
                  un bono de 3 sesiones para probar las actividades que quieras y ver en cuál te apuntas.
                </p>
                <div style={{display: "flex", gap: 12, justifyContent: "center", marginTop: 28, flexWrap: "wrap"}}>
                  <button className="btn btn-lg" style={{background: "var(--ink)", color: "white"}} onClick={() => go("/auth?mode=register")}>
                    Reservar plaza <I.Arrow />
                  </button>
                  <button className="btn btn-lg btn-outline" style={{background: "transparent", borderColor: "rgba(255,255,255,.5)", color: "white"}} onClick={() => go("/actividades")}>
                    Ver horarios
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <AimFooter />
      </main>
    </>
  );
}
