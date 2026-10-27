import React, { useRef, useState, useEffect, useCallback } from 'react';
import { idYoutube, htmlVideoYoutube } from './VideoYoutube.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Editor de texto enriquecido de las noticias y el blog (ticket #438): se
// escribe y se da formato en el mismo sitio, como en un procesador de textos.
// Títulos (H2-H4: el H1 es el título de la noticia), negrita, cursiva,
// subrayado, alineación (también justificado), listas, citas, enlaces,
// imágenes con pie, botones (a otra web, a un apartado de la web o a un
// documento subido), vídeos de YouTube (#502) y separadores.
//
// Escribe HTML; el servidor lo limpia antes de guardarlo (noticias-html.js), así
// que aquí no hace falta ser estricto, solo no dejar pasar basura al pegar: lo
// pegado entra como texto.
// ─────────────────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inp = { fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box' };
const etiqueta = { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', display: 'grid', gap: 4 };

// Los apartados de la web a los que se puede llevar con un enlace o un botón.
const APARTADOS = [
  ['/', 'Inicio'], ['/actividades', 'Actividades'], ['/campamento', 'Campamento'], ['/calendario', 'Calendario'],
  ['/noticias', 'Noticias'], ['/blog', 'Blog'], ['/aula', 'Aula virtual'], ['/tienda', 'Tienda'],
  ['/brickslab', 'Brickslab'], ['/conocenos', 'Conócenos'], ['/contacto', 'Contacto'], ['/auth?mode=register', 'Crear cuenta'],
];
const urlValida = (u) => /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d\s]+|\/[^\s]*|#[\w-]+)$/i.test(String(u || '').trim());

// Sube un documento (PDF, Word…) para descargarlo desde la noticia.
const TIPOS_DOC = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet', txt: 'text/plain', zip: 'application/zip', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
export async function subirDocumento(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('El documento pasa de 10 MB.');
  const tipo = file.type || TIPOS_DOC[(file.name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
  const r = await fetch(`/api/admin/posts/documento?nombre=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': tipo }, body: file });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido subir el documento.');
  return d;
}

function Boton({ titulo, onClick, activo, children, ancho }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onMouseDown={e => e.preventDefault()} onClick={onClick}
      style={{ font: 'inherit', fontSize: 13, fontWeight: 700, minWidth: ancho || 32, height: 32, padding: '0 8px', borderRadius: 8, cursor: 'pointer',
        border: '1px solid transparent', background: activo ? 'color-mix(in oklab, var(--purple) 14%, var(--bg-2))' : 'transparent', color: 'var(--ink)' }}>
      {children}
    </button>
  );
}
const Separa = () => <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)', margin: '4px 2px' }} />;

function Ventana({ titulo, onCerrar, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 2000, padding: 16 }} onMouseDown={onCerrar}>
      {/* Está dentro del formulario de la noticia: Intro en un campo no tiene que publicarla. */}
      <div onMouseDown={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); }} role="dialog" aria-label={titulo}
        style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'grid', gap: 12, width: 'min(480px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{titulo}</h3>
        {children}
      </div>
    </div>
  );
}

// Adónde lleva un enlace o un botón: otra web, un apartado de la web o un documento.
function Destino({ valor, cambiar, conDocumento = true }) {
  const [subiendo, setSubiendo] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['web', 'Otra web'], ['apartado', 'Apartado de la web'], ...(conDocumento ? [['documento', 'Documento']] : [])].map(([k, t]) => (
          <button key={k} type="button" className={`btn btn-sm ${valor.tipo === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => cambiar({ tipo: k, url: k === 'apartado' ? '/' : '' })}>{t}</button>
        ))}
      </div>
      {valor.tipo === 'web' && <input autoFocus value={valor.url} onChange={e => cambiar({ ...valor, url: e.target.value })} style={inp} placeholder="https://…" />}
      {valor.tipo === 'apartado' && (
        <select value={APARTADOS.some(([u]) => u === valor.url) ? valor.url : ''} onChange={e => cambiar({ ...valor, url: e.target.value })} style={inp}>
          {APARTADOS.map(([u, t]) => <option key={u} value={u}>{t} ({u})</option>)}
        </select>
      )}
      {valor.tipo === 'documento' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {valor.nombre && <span style={{ fontSize: 13, fontWeight: 700 }}>📎 {valor.nombre}</span>}
          <label className="btn btn-sm btn-outline" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
            {subiendo ? 'Subiendo…' : valor.url ? 'Cambiar' : 'Subir documento'}
            <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.zip,image/jpeg,image/png" disabled={subiendo}
              onChange={async e => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (!f) return;
                setSubiendo(true);
                try { const d = await subirDocumento(f); cambiar({ ...valor, url: d.url, nombre: d.nombre }); } catch (err) { alert(err.message); } finally { setSubiendo(false); }
              }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          </label>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>PDF, Word, Excel, PowerPoint… hasta 10 MB. El PDF se abre en el navegador; lo demás se descarga.</span>
        </div>
      )}
    </div>
  );
}

export default function EditorTexto({ valor, onChange, subirImagen, placeholder = 'Escribe aquí el texto…', alto = 320 }) {
  const ref = useRef(null);
  const rango = useRef(null);
  const [estado, setEstado] = useState({});
  const [ventana, setVentana] = useState(null);   // { tipo: 'enlace' | 'boton' | 'imagen', ... }
  const [imagen, setImagen] = useState(null);     // la imagen elegida dentro del texto
  const [video, setVideo] = useState(null);       // el vídeo de YouTube elegido
  // Los vídeos van como un bloque que no se escribe por dentro (se quitan enteros).
  const bloquearVideos = () => ref.current?.querySelectorAll('figure.video-youtube').forEach(f => { f.contentEditable = 'false'; });

  // El contenido inicial, una sola vez: después manda lo que se escribe.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = valor || '';
    bloquearVideos();
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* navegador viejo */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const avisar = useCallback(() => { if (ref.current) onChange(ref.current.innerHTML); }, [onChange]);
  const guardarRango = () => {
    const s = window.getSelection();
    if (s?.rangeCount && ref.current?.contains(s.getRangeAt(0).commonAncestorContainer)) rango.current = s.getRangeAt(0).cloneRange();
  };
  const volverRango = () => {
    ref.current?.focus();
    if (rango.current) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(rango.current); }
  };
  // Qué está puesto donde está el cursor (para encender los botones).
  const leerEstado = useCallback(() => {
    guardarRango();
    try {
      const bloque = String(document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
      setEstado({
        bloque: ['h2', 'h3', 'h4', 'blockquote'].includes(bloque) ? bloque : 'p',
        b: document.queryCommandState('bold'), i: document.queryCommandState('italic'), u: document.queryCommandState('underline'),
        ul: document.queryCommandState('insertUnorderedList'), ol: document.queryCommandState('insertOrderedList'),
        izq: document.queryCommandState('justifyLeft'), centro: document.queryCommandState('justifyCenter'),
        der: document.queryCommandState('justifyRight'), just: document.queryCommandState('justifyFull'),
      });
    } catch { /* sin estado */ }
  }, []);
  useEffect(() => {
    document.addEventListener('selectionchange', leerEstado);
    return () => document.removeEventListener('selectionchange', leerEstado);
  }, [leerEstado]);

  const hacer = (cmd, arg = null) => {
    volverRango();
    // La alineación, con estilo (text-align); el resto, con etiquetas (<strong>…).
    const conCss = cmd.startsWith('justify');
    try { document.execCommand('styleWithCSS', false, conCss); } catch { /* */ }
    document.execCommand(cmd, false, arg);
    try { document.execCommand('styleWithCSS', false, false); } catch { /* */ }
    avisar(); leerEstado();
  };
  const meter = (html) => { volverRango(); document.execCommand('insertHTML', false, html); bloquearVideos(); avisar(); };

  // Lo pegado entra como texto, en párrafos: así no se cuela el formato de Word o de otra web.
  const pegar = (e) => {
    const texto = e.clipboardData?.getData('text/plain');
    if (texto == null) return;
    e.preventDefault();
    const partes = texto.replace(/\r/g, '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    document.execCommand('insertHTML', false, partes.length > 1 ? partes.map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : esc(texto).replace(/\n/g, '<br>'));
    avisar();
  };
  // Al pulsar una imagen se elige (para cambiarle el tamaño o quitarla).
  const pulsar = (e) => {
    const img = e.target.closest?.('img');
    setImagen(img && ref.current.contains(img) ? img : null);
    const fig = e.target.closest?.('figure.video-youtube');
    if (fig) e.preventDefault();
    setVideo(fig && ref.current.contains(fig) ? fig : null);
  };
  const quitarVideo = () => { video?.remove(); setVideo(null); avisar(); };
  const tamano = (clase) => {
    const fig = imagen?.closest('figure');
    if (!fig) return;
    fig.className = clase; avisar(); setImagen(null);
  };
  const quitarImagen = () => { (imagen?.closest('figure') || imagen)?.remove(); setImagen(null); avisar(); };

  function abrir(tipo) {
    guardarRango();
    const sel = window.getSelection()?.toString() || '';
    if (tipo === 'enlace') setVentana({ tipo, texto: sel, destino: { tipo: 'web', url: '' } });
    if (tipo === 'boton') setVentana({ tipo, texto: sel || '', destino: { tipo: 'web', url: '' }, estilo: 'boton', alinear: 'center' });
    if (tipo === 'imagen') setVentana({ tipo, url: '', alt: '', pie: '', tamano: 'img-grande', subiendo: false });
    if (tipo === 'youtube') setVentana({ tipo, url: '' });
  }
  function aceptar() {
    const v = ventana;
    if (v.tipo === 'enlace' || v.tipo === 'boton') {
      const url = String(v.destino.url || '').trim();
      if (!urlValida(url)) { alert(v.destino.tipo === 'documento' ? 'Sube el documento.' : 'Pon una dirección que empiece por https://, o elige un apartado de la web.'); return; }
      const texto = v.texto.trim() || v.destino.nombre || url;
      if (v.tipo === 'enlace') meter(`<a href="${esc(url)}">${esc(texto)}</a>`);
      else meter(`<p style="text-align:${v.alinear}"><a class="${v.estilo}" href="${esc(url)}">${esc(texto)}</a></p><p><br></p>`);
    }
    if (v.tipo === 'youtube') {
      const id = idYoutube(v.url);
      if (!id) { alert('Pega el enlace de un vídeo de YouTube (por ejemplo https://www.youtube.com/watch?v=… o https://youtu.be/…).'); return; }
      // Como bloque propio, debajo del párrafo del cursor: dentro de un párrafo,
      // el navegador se queda solo con el enlace.
      volverRango();
      let nodo = window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0).startContainer : null;
      while (nodo && nodo.parentNode !== ref.current) nodo = nodo.parentNode;
      const tmp = document.createElement('div');
      tmp.innerHTML = `${htmlVideoYoutube(id)}<p><br></p>`;
      const [fig, despues] = [...tmp.children];
      if (nodo) nodo.after(fig, despues); else ref.current.append(fig, despues);
      const r = document.createRange(); r.setStart(despues, 0); r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      bloquearVideos(); avisar();
    }
    if (v.tipo === 'imagen') {
      if (!v.url) { alert('Sube la imagen.'); return; }
      meter(`<figure class="${v.tamano}"><img src="${esc(v.url)}" alt="${esc(v.alt)}">${v.pie.trim() ? `<figcaption>${esc(v.pie.trim())}</figcaption>` : ''}</figure><p><br></p>`);
    }
    setVentana(null);
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--bg-2)', overflow: 'hidden' }}>
      <div role="toolbar" aria-label="Formato del texto"
        style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', padding: 6, borderBottom: '1px solid var(--line)', background: 'var(--bg-3)', position: 'sticky', top: 0, zIndex: 2 }}>
        <select value={estado.bloque || 'p'} onMouseDown={guardarRango} onChange={e => hacer('formatBlock', e.target.value === 'p' ? 'P' : e.target.value.toUpperCase())} aria-label="Tipo de texto"
          style={{ ...inp, width: 'auto', padding: '5px 8px', fontSize: 13 }}>
          <option value="p">Párrafo</option><option value="h2">Título (H2)</option><option value="h3">Subtítulo (H3)</option><option value="h4">Apartado (H4)</option><option value="blockquote">Cita</option>
        </select>
        <Separa />
        <Boton titulo="Negrita (Ctrl+B)" activo={estado.b} onClick={() => hacer('bold')}><b>N</b></Boton>
        <Boton titulo="Cursiva (Ctrl+I)" activo={estado.i} onClick={() => hacer('italic')}><i>C</i></Boton>
        <Boton titulo="Subrayado (Ctrl+U)" activo={estado.u} onClick={() => hacer('underline')}><u>S</u></Boton>
        <Separa />
        <Boton titulo="Alinear a la izquierda" activo={estado.izq} onClick={() => hacer('justifyLeft')}>⯇</Boton>
        <Boton titulo="Centrar" activo={estado.centro} onClick={() => hacer('justifyCenter')}>≡</Boton>
        <Boton titulo="Alinear a la derecha" activo={estado.der} onClick={() => hacer('justifyRight')}>⯈</Boton>
        <Boton titulo="Justificar" activo={estado.just} onClick={() => hacer('justifyFull')}>☰</Boton>
        <Separa />
        <Boton titulo="Lista con guiones" activo={estado.ul} onClick={() => hacer('insertUnorderedList')}>• Lista</Boton>
        <Boton titulo="Lista numerada" activo={estado.ol} onClick={() => hacer('insertOrderedList')}>1. Lista</Boton>
        <Separa />
        <Boton titulo="Enlace" onClick={() => abrir('enlace')}>🔗 Enlace</Boton>
        <Boton titulo="Quitar enlace" onClick={() => hacer('unlink')}>✕ Enlace</Boton>
        <Boton titulo="Botón (a otra web, a un apartado o a un documento)" onClick={() => abrir('boton')}>▭ Botón</Boton>
        {subirImagen && <Boton titulo="Imagen" onClick={() => abrir('imagen')}>🖼️ Imagen</Boton>}
        <Boton titulo="Vídeo de YouTube" onClick={() => abrir('youtube')}>▶ YouTube</Boton>
        <Boton titulo="Separador" onClick={() => hacer('insertHorizontalRule')}>―</Boton>
        <Separa />
        <Boton titulo="Quitar formato" onClick={() => { hacer('removeFormat'); hacer('formatBlock', 'P'); }}>⌫ Formato</Boton>
        <Boton titulo="Deshacer (Ctrl+Z)" onClick={() => hacer('undo')}>↶</Boton>
        <Boton titulo="Rehacer (Ctrl+Y)" onClick={() => hacer('redo')}>↷</Boton>
      </div>
      {imagen && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '6px 10px', background: 'color-mix(in oklab, var(--purple) 8%, var(--bg-2))', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
          <b>Imagen:</b>
          {[['img-pequena', 'Pequeña'], ['img-mediana', 'Mediana'], ['img-grande', 'Grande']].map(([c, t]) => (
            <button key={c} type="button" className={`btn btn-sm ${imagen.closest('figure')?.className === c ? 'btn-primary' : 'btn-outline'}`} onClick={() => tamano(c)}>{t}</button>
          ))}
          <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--pink)' }} onClick={quitarImagen}>Quitar</button>
        </div>
      )}
      {video && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '6px 10px', background: 'color-mix(in oklab, var(--purple) 8%, var(--bg-2))', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
          <b>Vídeo de YouTube</b>
          <a href={`https://www.youtube.com/watch?v=${video.dataset.youtube}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">Verlo en YouTube</a>
          <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--pink)' }} onClick={quitarVideo}>Quitar</button>
        </div>
      )}
      <div ref={ref} className="post-content editor-texto" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Texto de la noticia"
        data-placeholder={placeholder} onInput={avisar} onKeyUp={leerEstado} onMouseUp={leerEstado} onBlur={() => { guardarRango(); avisar(); }} onPaste={pegar} onClick={pulsar}
        style={{ minHeight: alto, maxHeight: '60vh', overflowY: 'auto', padding: '14px 18px', outline: 'none', background: 'var(--bg-2)', color: 'var(--ink)' }} />

      {ventana?.tipo === 'enlace' && (
        <Ventana titulo="Enlace" onCerrar={() => setVentana(null)}>
          <label style={etiqueta}>Texto que se ve<input value={ventana.texto} onChange={e => setVentana(v => ({ ...v, texto: e.target.value }))} style={inp} placeholder="p. ej. el reglamento" /></label>
          <Destino valor={ventana.destino} cambiar={d => setVentana(v => ({ ...v, destino: d }))} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setVentana(null)}>Cancelar</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={aceptar}>Poner el enlace</button>
          </div>
        </Ventana>
      )}
      {ventana?.tipo === 'boton' && (
        <Ventana titulo="Botón" onCerrar={() => setVentana(null)}>
          <label style={etiqueta}>Texto del botón<input autoFocus value={ventana.texto} onChange={e => setVentana(v => ({ ...v, texto: e.target.value }))} style={inp} placeholder="Descargar la inscripción" /></label>
          <Destino valor={ventana.destino} cambiar={d => setVentana(v => ({ ...v, destino: d }))} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ ...etiqueta, flex: 1, minWidth: 140 }}>Estilo
              <select value={ventana.estilo} onChange={e => setVentana(v => ({ ...v, estilo: e.target.value }))} style={inp}>
                <option value="boton">Relleno</option><option value="boton boton-borde">Solo borde</option>
              </select>
            </label>
            <label style={{ ...etiqueta, flex: 1, minWidth: 140 }}>Dónde
              <select value={ventana.alinear} onChange={e => setVentana(v => ({ ...v, alinear: e.target.value }))} style={inp}>
                <option value="left">A la izquierda</option><option value="center">Centrado</option><option value="right">A la derecha</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: ventana.alinear === 'left' ? 'flex-start' : ventana.alinear === 'right' ? 'flex-end' : 'center', padding: 10, borderRadius: 10, background: 'var(--bg-3)' }}>
            <span className="post-content"><a className={ventana.estilo} href="#vista" onClick={e => e.preventDefault()}>{ventana.texto || 'Texto del botón'}</a></span>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setVentana(null)}>Cancelar</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={aceptar}>Poner el botón</button>
          </div>
        </Ventana>
      )}
      {ventana?.tipo === 'youtube' && (
        <Ventana titulo="Vídeo de YouTube" onCerrar={() => setVentana(null)}>
          <label style={etiqueta}>Enlace del vídeo<input autoFocus value={ventana.url} onChange={e => setVentana(v => ({ ...v, url: e.target.value }))} style={inp} placeholder="https://www.youtube.com/watch?v=…" /></label>
          {idYoutube(ventana.url)
            ? <img src={`https://i.ytimg.com/vi/${idYoutube(ventana.url)}/hqdefault.jpg`} alt="" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 10, justifySelf: 'center' }} />
            : ventana.url.trim() && <span style={{ fontSize: 12, color: 'var(--pink)' }}>Ese enlace no es de un vídeo de YouTube.</span>}
          <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>En la web se ve el reproductor; quien no haya aceptado las cookies de YouTube verá antes un botón para aceptarlas. En el correo y el RSS sale un enlace al vídeo.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setVentana(null)}>Cancelar</button>
            <button type="button" className="btn btn-sm btn-primary" disabled={!idYoutube(ventana.url)} onClick={aceptar}>Poner el vídeo</button>
          </div>
        </Ventana>
      )}
      {ventana?.tipo === 'imagen' && (
        <Ventana titulo="Imagen" onCerrar={() => setVentana(null)}>
          {ventana.url ? <img src={ventana.url} alt="" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 10, justifySelf: 'center' }} /> : null}
          <label className="btn btn-sm btn-outline" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer', justifySelf: 'start' }}>
            {ventana.subiendo ? 'Subiendo…' : ventana.url ? 'Cambiar la imagen' : 'Elegir imagen'}
            <input type="file" accept="image/*" disabled={ventana.subiendo} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
              onChange={async e => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (!f) return;
                setVentana(v => ({ ...v, subiendo: true }));
                try { const url = await subirImagen(f); setVentana(v => ({ ...v, url, subiendo: false, alt: v.alt || f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') })); }
                catch (err) { alert(err.message); setVentana(v => ({ ...v, subiendo: false })); }
              }} />
          </label>
          <label style={etiqueta}>Qué se ve (para Google y para quien no ve la imagen)<input value={ventana.alt} onChange={e => setVentana(v => ({ ...v, alt: e.target.value }))} style={inp} placeholder="Alumnos de Taekwon-Do en el campeonato" /></label>
          <label style={etiqueta}>Pie de foto (opcional)<input value={ventana.pie} onChange={e => setVentana(v => ({ ...v, pie: e.target.value }))} style={inp} /></label>
          <label style={etiqueta}>Tamaño
            <select value={ventana.tamano} onChange={e => setVentana(v => ({ ...v, tamano: e.target.value }))} style={inp}>
              <option value="img-grande">Grande (todo el ancho)</option><option value="img-mediana">Mediana</option><option value="img-pequena">Pequeña</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setVentana(null)}>Cancelar</button>
            <button type="button" className="btn btn-sm btn-primary" disabled={ventana.subiendo} onClick={aceptar}>Poner la imagen</button>
          </div>
        </Ventana>
      )}
    </div>
  );
}
