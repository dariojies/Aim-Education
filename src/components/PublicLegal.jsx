import React from 'react';
import { AimHeader, AimFooter } from './Shared.jsx';
import { useRouter } from '../App.jsx';
import { DOCS_LEGALES, DOC_POR_ID, EMPRESA_LEGAL, VERSION_LEGAL } from '../legal/textos.js';
import { abrirConfiguracionCookies } from './Cookies.jsx';

// Los textos legales de la web (ticket #295): aviso legal, privacidad, cookies,
// términos de venta y reglamento interno, con un índice para ir de uno a otro.
const fechaVersion = (iso) => { const [a, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}/${a}`; };

function Bloque({ b }) {
  const [tipo, contenido, desde] = b;
  if (tipo === 'h') return <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, margin: '28px 0 8px', letterSpacing: '-.01em' }}>{contenido}</h2>;
  if (tipo === 'p') return <p style={{ margin: '0 0 12px', lineHeight: 1.65, color: 'var(--ink-2)', fontSize: 15 }}>{contenido}</p>;
  if (tipo === 'ul' || tipo === 'ol') {
    const Lista = tipo;
    return (
      <Lista start={desde || undefined} style={{ margin: '0 0 14px', paddingLeft: 22, display: 'grid', gap: 6, color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.6 }}>
        {contenido.map((x, i) => <li key={i}>{x}</li>)}
      </Lista>
    );
  }
  if (tipo === 'tabla') {
    const [cab, ...filas] = contenido;
    return (
      <div style={{ overflowX: 'auto', margin: '6px 0 16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr>{cab.map(c => <th key={c} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--line)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)' }}>{c}</th>)}</tr></thead>
          <tbody>{filas.map((f, i) => <tr key={i}>{f.map((c, j) => <td key={j} style={{ padding: '9px 10px', borderBottom: '1px solid var(--line)', verticalAlign: 'top', color: j === 0 ? 'var(--ink)' : 'var(--ink-2)', fontWeight: j === 0 ? 700 : 400 }}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  return null;
}

export default function PublicLegal({ id }) {
  const { go } = useRouter();
  const doc = DOC_POR_ID[id] || DOCS_LEGALES[0];

  return (
    <>
      <AimHeader route="" />
      <main style={{ paddingTop: 0 }}>
        <section className="block tight">
          <div className="container legal-grid">
            <nav aria-label="Textos legales" className="legal-indice">
              <span className="eyebrow purple" style={{ marginBottom: 6 }}>Legal</span>
              {DOCS_LEGALES.map(d => (
                <a key={d.id} href={`/legal/${d.id}`} onClick={(e) => { e.preventDefault(); go(`/legal/${d.id}`); }}
                  style={{ padding: '8px 10px', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none',
                    color: d.id === doc.id ? 'var(--purple)' : 'var(--ink-2)',
                    background: d.id === doc.id ? 'color-mix(in oklab, var(--purple) 10%, transparent)' : 'transparent' }}>
                  {d.titulo}
                </a>
              ))}
              <button type="button" onClick={abrirConfiguracionCookies}
                style={{ marginTop: 8, textAlign: 'left', padding: '8px 10px', borderRadius: 10, fontSize: 13, border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Configurar cookies
              </button>
            </nav>

            <article style={{ maxWidth: 780 }}>
              <h1 className="title-display" style={{ fontSize: 'clamp(28px, 4vw, 42px)', marginBottom: 6 }}>{doc.titulo}</h1>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--ink-3)' }}>
                {EMPRESA_LEGAL.razonSocial} · CIF {EMPRESA_LEGAL.cif} · Actualizado el {fechaVersion(VERSION_LEGAL)}
              </p>
              {doc.bloques.map((b, i) => <Bloque key={i} b={b} />)}
            </article>
          </div>
        </section>
        <AimFooter />
      </main>
    </>
  );
}
