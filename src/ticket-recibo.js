// ─────────────────────────────────────────────────────────────────────────────
// Ticket del cobro para la impresora de tickets (ticket #292).
//
// La del mostrador es una Xprinter XP-58IIH: papel de 58 mm, de los que imprime
// 48 mm de ancho, térmica (solo negro, sin grises). El ticket se maqueta a esa
// medida exacta: 48 mm de contenido, página de 58 mm sin márgenes (así el
// navegador no añade cabecera ni pie) y del largo justo de lo impreso, para que
// no salga papel en blanco ni se parta en dos.
//
// Para la familia este ticket ES su factura (simplificada o completa), así que
// lleva lo que exige el art. 6/7 del RD 1619/2012: emisor y NIF, número y fecha,
// qué se cobra, tipo de IVA, total y, si algo va exento, el porqué. Con
// VERI*FACTU encendido, además, el QR tributario de cada factura.
// ─────────────────────────────────────────────────────────────────────────────
import { fmtFecha } from './fechas.js';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eur = (n) => `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const num = (n) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MEDIOS = { tarjeta: 'Tarjeta', bizum: 'Bizum', efectivo: 'Efectivo', transferencia: 'Transferencia', tpv_online: 'Pago por internet', mixto: 'Varios' };
const medio = (m) => MEDIOS[m] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : '');
const mesCorto = (iso) => {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  return isNaN(d) ? '' : d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }).replace('.', '');
};

// Medidas de la XP-58IIH.
export const ANCHO_PAPEL_MM = 58;
export const ANCHO_IMPRESION_MM = 48;

const CSS = `
  @page { size: ${ANCHO_PAPEL_MM}mm 297mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    width: ${ANCHO_IMPRESION_MM}mm; margin: 0 auto; padding: 2mm 1mm 4mm;
    font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; line-height: 1.3; color: #000;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .c { text-align: center; }
  .emp { font-size: 13px; font-weight: 800; text-align: center; line-height: 1.2; }
  .dat { text-align: center; font-size: 10.5px; }
  .sep { border-top: 1px dashed #000; margin: 5px 0; }
  .sep2 { border-top: 2px solid #000; margin: 5px 0; }
  .tit { text-align: center; font-weight: 800; font-size: 12.5px; letter-spacing: .02em; }
  .fila { display: flex; justify-content: space-between; gap: 4px; }
  .fila > span:last-child { text-align: right; white-space: nowrap; }
  .lin { margin: 3px 0; }
  .lin .d { font-weight: 700; word-break: break-word; }
  .lin .s { font-size: 10.5px; }
  .tot { font-size: 16px; font-weight: 800; }
  .caja { border: 2px solid #000; padding: 3px; text-align: center; font-weight: 800; margin: 5px 0; }
  .qr { text-align: center; margin: 4px 0 2px; }
  .qr img { width: 32mm; height: 32mm; image-rendering: pixelated; }
  .peq { font-size: 10px; }
  b { font-weight: 800; }
`;

// El HTML del ticket. `t` es lo que devuelve el cobro (uno o varios en uno) o el
// detalle de un recibo al reimprimirlo.
export function htmlTicketRecibo(t) {
  const r = t.recibo || {};
  const e = t.empresa || {};
  const anulado = r.estado === 'anulado';
  const rect = r.tipo === 'rectificativo';
  const facturas = Array.isArray(t.facturas) && t.facturas.length > 1 ? t.facturas : null;
  const tipoFactura = r.tipoFactura || facturas?.[0]?.tipoFactura || 'F1';
  const simplificada = ['F2', 'R5'].includes(tipoFactura);
  const titulo = rect ? 'FACTURA RECTIFICATIVA' : simplificada ? 'FACTURA SIMPLIFICADA' : 'FACTURA';
  const hayExento = (t.detalle || []).some(d => !(Number(d.ivaPct) > 0));

  const qr = (src, numero) => src ? `
    <div class="qr"><div class="peq"><b>QR tributario:</b></div><img src="${src}" alt="QR"><div><b>VERI*FACTU</b></div>${numero ? `<div class="peq">${esc(numero)}</div>` : ''}</div>` : '';

  const lineas = (t.detalle || []).map(d => {
    const extra = [];
    if (d.tipo === 'Mensualidad' && d.mes) extra.push(mesCorto(d.mes));
    if (d.cliente) extra.push(esc(d.cliente));
    const dto = [];
    if (Number(d.descuentoPct)) dto.push(`dto ${num(d.descuentoPct).replace(',00', '')}%`);
    if (Number(d.descuentoMensPct)) dto.push(`${num(d.descuentoMensPct).replace(',00', '')}% varias act.`);
    const iva = Number(d.ivaPct) > 0 ? `IVA ${num(d.ivaPct).replace(',00', '')}%` : 'Exento';
    return `<div class="lin">
      <div class="d">${esc(d.descripcion)}</div>
      ${extra.length ? `<div class="s">${extra.join(' · ')}</div>` : ''}
      <div class="fila s"><span>${iva}${dto.length ? ` · ${dto.join(' · ')}` : ''}</span><span><b>${num(d.total)}</b></span></div>
    </div>`;
  }).join('');

  const bases = (t.basesPorIva || []).map(b => Number(b.ivaPct) > 0
    ? `<div class="fila"><span>Base ${num(b.ivaPct).replace(',00', '')}%</span><span>${num(b.base)}</span></div>
       <div class="fila"><span>IVA ${num(b.ivaPct).replace(',00', '')}%</span><span>${num(b.iva)}</span></div>`
    : `<div class="fila"><span>Exento de IVA</span><span>${num(b.base)}</span></div>`).join('');

  const pagos = (r.pagos && r.pagos.length > 1)
    ? r.pagos.map(p => `<div class="fila"><span>${medio(p.medio)}</span><span>${num(p.importe)}</span></div>`).join('')
    : `<div class="fila"><span>${medio(r.medioPago)}</span><span>${num(r.total)}</span></div>`;

  const numero = facturas ? null : (r.numeroVisible || r.numero);
  const cliente = [
    r.pagador ? `<div>Cliente: <b>${esc(r.pagador)}</b></div>` : '',
    !simplificada && r.pagadorDni ? `<div>NIF: ${esc(r.pagadorDni)}</div>` : '',
    !simplificada && r.pagadorDomicilio ? `<div class="peq">${esc(r.pagadorDomicilio)}</div>` : '',
  ].join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${esc(titulo)} ${esc(numero || '')}</title>
<style>${CSS}</style></head><body>
  <div class="emp">${esc(e.nombre)}</div>
  <div class="dat">CIF ${esc(e.nif)}<br>${esc(e.direccion)}<br>${esc(e.cp)}${e.tel || e.web ? `<br>${esc([e.tel, e.web].filter(Boolean).join(' · '))}` : ''}</div>
  <div class="sep"></div>
  <div class="tit">${titulo}</div>
  ${anulado ? `<div class="caja">ANULADA${r.anuladoMotivo ? `<br><span class="peq">${esc(r.anuladoMotivo)}</span>` : ''}</div>` : ''}
  ${numero ? `<div class="fila"><span>Nº</span><span><b>${esc(numero)}</b></span></div>` : ''}
  <div class="fila"><span>Fecha</span><span>${esc(fmtFecha(r.fecha))}</span></div>
  ${rect ? `<div class="peq">Rectifica a la nº <b>${esc(r.rectificaNumero || '—')}</b>${r.rectificaFecha ? ` de ${esc(fmtFecha(r.rectificaFecha))}` : ''}, por ${r.rectMetodo === 'diferencias' ? 'diferencias' : 'sustitución'}.${r.rectMotivo ? ` Motivo: ${esc(r.rectMotivo)}` : ''}</div>` : ''}
  ${cliente}
  ${!facturas ? qr(t.qrTributario) : ''}
  <div class="sep"></div>
  ${lineas}
  <div class="sep"></div>
  ${bases}
  <div class="sep2"></div>
  <div class="fila tot"><span>TOTAL</span><span>${eur(r.total)}</span></div>
  ${pagos}
  ${Number(r.cambio) > 0 ? `<div class="fila"><span>Entregado</span><span>${num(r.entregado)}</span></div><div class="fila"><span>Cambio</span><span>${num(r.cambio)}</span></div>` : ''}
  ${Number(t.ahorro) > 0 ? `<div class="fila"><span>Ahorro en descuentos</span><span>${num(t.ahorro)}</span></div>` : ''}
  ${facturas ? `<div class="sep"></div>
    <div class="peq"><b>Este ticket reúne ${facturas.length} facturas:</b></div>
    ${facturas.map(f => `<div class="fila peq"><span>${esc(f.numeroVisible || f.numero)}</span><span>${num(f.total)}</span></div>${qr(f.qrTributario, f.numeroVisible || f.numero)}`).join('')}` : ''}
  ${hayExento ? `<div class="sep"></div><div class="peq">Operación exenta de IVA (art. 20.Uno.9º de la Ley 37/1992, servicios de enseñanza).</div>` : ''}
  ${simplificada && !rect && (t.detalle || []).some(d => Number(d.ivaPct) > 0) ? '<div class="peq">IVA incluido.</div>' : ''}
  <div class="sep"></div>
  <div class="c"><b>¡Gracias!</b></div>
</body></html>`;
}

// Abre el ticket y lo manda a imprimir. Antes de imprimir se ajusta el largo de
// la página a lo que ocupa el ticket, para que salga de una pieza y sin papel de
// más (en un rollo continuo, la página es lo que el papel avanza).
export function imprimirTicketRecibo(t) {
  const w = window.open('', '_blank', 'width=320,height=720');
  if (!w) { alert('El navegador ha bloqueado la ventana del ticket. Permite las ventanas emergentes de esta página e inténtalo otra vez.'); return; }
  w.document.open();
  w.document.write(htmlTicketRecibo(t));
  w.document.close();
  const imprimir = () => {
    const altoMm = Math.ceil(w.document.body.scrollHeight * 25.4 / 96) + 6;
    const st = w.document.createElement('style');
    st.textContent = `@page { size: ${ANCHO_PAPEL_MM}mm ${altoMm}mm; margin: 0; }`;
    w.document.head.appendChild(st);
    w.focus();
    w.onafterprint = () => w.close();
    w.print();
  };
  // Se espera a que carguen las imágenes (los QR) antes de medir.
  if (w.document.readyState === 'complete') setTimeout(imprimir, 50);
  else w.addEventListener('load', () => setTimeout(imprimir, 50));
}
