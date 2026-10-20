import React, { useMemo, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Asistente de posicionamiento de una noticia (ticket #425): cómo saldrá en
// Google y lo que conviene cuidar para que la encuentre (y la entienda) pronto.
// No obliga a nada: avisa. Las cuentas son las que usa Google como referencia:
// título de hasta ~60 caracteres, descripción de 70-160, texto con chicha,
// subtítulos, imágenes descritas y enlaces a otras páginas de la web.
// ─────────────────────────────────────────────────────────────────────────────

// Igual que slugify() del servidor: la dirección que se ve es la que se guarda.
export const slugDe = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
const plano = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function analizar(html) {
  const d = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const texto = (d.body.textContent || '').replace(/\s+/g, ' ').trim();
  const imgs = [...d.querySelectorAll('img')];
  const enlaces = [...d.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
  return {
    texto, palabras: texto ? texto.split(' ').length : 0,
    primerParrafo: (d.querySelector('p')?.textContent || texto).slice(0, 300),
    h2: d.querySelectorAll('h2').length, imagenes: imgs.length, sinAlt: imgs.filter(i => !(i.getAttribute('alt') || '').trim()).length,
    internos: enlaces.filter(h => h.startsWith('/') && !h.startsWith('//')).length,
  };
}

export default function AsistenteSeo({ titulo, extracto, contenido, slug, onSlug, portada, tipo, publicada }) {
  const [abierto, setAbierto] = useState(true);
  const [clave, setClave] = useState('');
  const a = useMemo(() => analizar(contenido), [contenido]);
  const direccion = slug ? slugDe(slug) : slugDe(titulo);
  const descripcion = (extracto || a.texto).replace(/\s+/g, ' ').trim();
  const tituloGoogle = `${titulo || 'Título de la noticia'} | Aim Education`;
  // La palabra clave «está» si salen todas sus palabras (no hace falta la frase exacta).
  const k = plano(clave.trim());
  const palabras = k.split(/\s+/).filter(w => w.length >= 3);
  const tiene = (texto) => palabras.length > 0 && palabras.every(w => plano(texto).includes(w));
  const pruebas = [
    { ok: titulo.length >= 30 && titulo.length <= 65, texto: `Título de 30 a 65 letras (tiene ${titulo.length})`, ayuda: titulo.length > 65 ? 'Google lo cortará: lo importante, al principio.' : 'Un poco más largo explica mejor de qué va.' },
    { ok: (extracto || '').length >= 70 && (extracto || '').length <= 160, texto: `Extracto de 70 a 160 letras (tiene ${(extracto || '').length})`, ayuda: 'Es el texto que sale debajo del título en Google y al compartirla.' },
    { ok: !!portada, texto: 'Imagen de portada', ayuda: 'Sale al compartirla por WhatsApp o redes, y en Google Discover.' },
    { ok: a.palabras >= 300, texto: `Al menos 300 palabras (tiene ${a.palabras})`, ayuda: 'Las noticias con contenido completo posicionan mejor que las de dos líneas.' },
    { ok: a.h2 > 0, texto: 'Algún subtítulo (Título H2) en el texto', ayuda: 'Ordena el texto, y Google entiende mejor de qué trata cada parte.' },
    { ok: a.imagenes === 0 || a.sinAlt === 0, texto: a.imagenes ? `Imágenes con descripción (${a.imagenes - a.sinAlt} de ${a.imagenes})` : 'Imágenes con descripción (no hay imágenes)', ayuda: 'Pulsa la imagen y vuelve a ponerla con «Qué se ve».' },
    { ok: a.internos > 0, texto: 'Algún enlace a otra página de la web', ayuda: 'Por ejemplo, a la actividad de la que habla o a Contacto: ayuda a Google a recorrer la web.' },
    ...(k ? [
      { ok: tiene(titulo), texto: `La palabra clave está en el título`, ayuda: 'Lo que buscaría la gente: «Taekwondo Algeciras», «campamento de verano»…' },
      { ok: tiene(a.primerParrafo) || tiene(extracto), texto: 'La palabra clave sale al principio del texto', ayuda: 'En el extracto o en el primer párrafo.' },
      { ok: tiene(direccion.replace(/-/g, ' ')), texto: 'La palabra clave está en la dirección', ayuda: 'Cámbiala abajo mientras no esté publicada.' },
    ] : []),
  ];
  const bien = pruebas.filter(p => p.ok).length;
  const color = bien === pruebas.length ? 'var(--teal)' : bien >= pruebas.length * 0.6 ? 'var(--orange)' : 'var(--pink)';

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--bg-3)' }}>
      <button type="button" onClick={() => setAbierto(x => !x)}
        style={{ width: '100%', font: 'inherit', display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink)', textAlign: 'left' }}>
        <b style={{ flex: 1, fontSize: 14 }}>Posicionamiento en Google</b>
        <span style={{ fontSize: 12, fontWeight: 800, color }}>{bien} de {pruebas.length} bien</span>
        <span aria-hidden="true">{abierto ? '▴' : '▾'}</span>
      </button>
      {abierto && (
        <div style={{ display: 'grid', gap: 12, padding: '0 14px 14px' }}>
          {/* Así sale en Google */}
          <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--line)', fontFamily: 'Arial, sans-serif' }}>
            <div style={{ fontSize: 12, color: '#202124' }}>aimeducation.es › {tipo === 'blog' ? 'blog' : 'noticias'} › {direccion || '…'}</div>
            <div style={{ fontSize: 18, color: '#1a0dab', lineHeight: 1.3, margin: '2px 0' }}>{tituloGoogle.length > 62 ? `${tituloGoogle.slice(0, 60)}…` : tituloGoogle}</div>
            <div style={{ fontSize: 13, color: '#4d5156', lineHeight: 1.45 }}>{descripcion ? (descripcion.length > 160 ? `${descripcion.slice(0, 157)}…` : descripcion) : 'Escribe el extracto: es lo que sale aquí.'}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', display: 'grid', gap: 4, flex: 2, minWidth: 220 }}>Dirección de la noticia
              <input value={slug ?? ''} disabled={publicada} onChange={e => onSlug(e.target.value)} placeholder={slugDe(titulo) || 'se-hace-con-el-titulo'}
                style={{ fontFamily: 'inherit', fontSize: 14, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' }} />
              <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>{publicada ? 'Ya está publicada: cambiarla rompería los enlaces que ya se han compartido.' : 'Corta y con las palabras importantes. Si la dejas vacía, sale del título.'}</span>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', display: 'grid', gap: 4, flex: 1, minWidth: 180 }}>Palabra clave (opcional)
              <input value={clave} onChange={e => setClave(e.target.value)} placeholder="Taekwondo Algeciras"
                style={{ fontFamily: 'inherit', fontSize: 14, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)' }} />
              <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>Lo que buscaría alguien para encontrarla. No se guarda.</span>
            </label>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {pruebas.map(p => (
              <li key={p.texto} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <span style={{ color: p.ok ? 'var(--teal)' : 'var(--orange)', fontWeight: 800 }}>{p.ok ? '✓' : '!'}</span>
                <span><b style={{ fontWeight: 700 }}>{p.texto}</b>{!p.ok && <span style={{ color: 'var(--ink-3)' }}> · {p.ayuda}</span>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
