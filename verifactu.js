import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// VERI*FACTU (ticket #232). Sistema de emisión de facturas verificables.
//
// Por cada factura que se emite se genera un "registro de facturación de alta"
// (y de "anulación" si se anula), encadenado con el anterior por una huella
// SHA-256. En modalidad VERI*FACTU esos registros se remiten a la AEAT y la
// factura lleva un QR con el que el cliente puede cotejarla en la sede.
//
// Todo lo de este módulo sigue la documentación oficial de la AEAT:
//  · Huella: "Detalle de las especificaciones técnicas para la generación de la
//    huella o hash de los registros" (v0.1.2). Campos, orden y separadores son
//    literales de ese documento; el resultado va en hexadecimal y MAYÚSCULAS.
//  · QR: "Detalle de las especificaciones técnicas del código QR" (v0.5.0).
//
// Este módulo no habla con la AEAT por su cuenta: prepara el registro, la huella,
// el QR y el XML. El envío se hace desde server.js cuando hay certificado.
// ─────────────────────────────────────────────────────────────────────────────

// ── Formatos que pide la AEAT ───────────────────────────────────────────────
// Fecha de expedición: DD-MM-AAAA (hora de Madrid, que es donde se factura).
export function fechaAEAT(fecha) {
    const d = fecha instanceof Date ? fecha : new Date(String(fecha).length <= 10 ? `${String(fecha).slice(0, 10)}T12:00:00` : fecha);
    const [a, m, dd] = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).split('-');
    return `${dd}-${m}-${a}`;
}
// Fecha y hora con huso: 2024-01-01T19:20:30+01:00 (ISO 8601).
export function fechaHoraHusoAEAT(fecha = new Date()) {
    const f = (opt) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', hour12: false, ...opt }).format(fecha);
    const dia = f({ year: 'numeric', month: '2-digit', day: '2-digit' });
    const hora = f({ hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace('24:', '00:');
    // El desfase de Madrid ese día (+01:00 en invierno, +02:00 en verano).
    const nombre = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'longOffset' })
        .formatToParts(fecha).find(p => p.type === 'timeZoneName')?.value || 'GMT+01:00';
    const huso = nombre.replace('GMT', '') || '+01:00';
    return `${dia}T${hora}${huso}`;
}
// Importes: con punto decimal y como mucho dos decimales.
export const importeAEAT = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

// ── Huella (hash) de los registros ──────────────────────────────────────────
const sha256Mayus = (cadena) => crypto.createHash('sha256').update(cadena, 'utf8').digest('hex').toUpperCase();
// Los valores van sin espacios delante ni detrás; si no hay valor, solo "campo=".
const cadena = (campos) => campos.map(([k, v]) => `${k}=${v == null ? '' : String(v).trim()}`).join('&');

// Registro de ALTA (una factura emitida).
export function huellaAlta({ nifEmisor, numSerie, fechaExpedicion, tipoFactura, cuotaTotal, importeTotal, huellaAnterior, fechaHoraHuso }) {
    const texto = cadena([
        ['IDEmisorFactura', nifEmisor],
        ['NumSerieFactura', numSerie],
        ['FechaExpedicionFactura', fechaExpedicion],
        ['TipoFactura', tipoFactura],
        ['CuotaTotal', importeAEAT(cuotaTotal)],
        ['ImporteTotal', importeAEAT(importeTotal)],
        ['Huella', huellaAnterior],
        ['FechaHoraHusoGenRegistro', fechaHoraHuso],
    ]);
    return { cadena: texto, huella: sha256Mayus(texto) };
}

// Registro de ANULACIÓN (una factura que se anula).
export function huellaAnulacion({ nifEmisor, numSerie, fechaExpedicion, huellaAnterior, fechaHoraHuso }) {
    const texto = cadena([
        ['IDEmisorFacturaAnulada', nifEmisor],
        ['NumSerieFacturaAnulada', numSerie],
        ['FechaExpedicionFacturaAnulada', fechaExpedicion],
        ['Huella', huellaAnterior],
        ['FechaHoraHusoGenRegistro', fechaHoraHuso],
    ]);
    return { cadena: texto, huella: sha256Mayus(texto) };
}

// ── Código QR de la factura ─────────────────────────────────────────────────
// Va arriba de la factura, precedido de "QR tributario:" y, en VERI*FACTU, con
// la frase "VERI*FACTU" debajo.
const BASES_QR = {
    verificable: {
        pruebas: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
        produccion: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
    },
    noVerificable: {
        pruebas: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu',
        produccion: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu',
    },
};
export const TEXTO_QR = 'QR tributario:';
export const LEYENDA_VERIFACTU = 'VERI*FACTU';
export const LEYENDA_VERIFACTU_LARGA = 'Factura verificable en la sede electrónica de la AEAT';

export function urlQR({ nif, numSerie, fechaExpedicion, importeTotal, verificable = true, entorno = 'pruebas' }) {
    const base = BASES_QR[verificable ? 'verificable' : 'noVerificable'][entorno === 'produccion' ? 'produccion' : 'pruebas'];
    // Los valores van codificados (URL encoding, UTF-8): un "&" en el número de
    // serie tiene que viajar como %26 o la URL se rompe.
    const p = new URLSearchParams();
    p.set('nif', String(nif || '').trim());
    p.set('numserie', String(numSerie || '').trim());
    p.set('fecha', fechaExpedicion);
    p.set('importe', importeAEAT(importeTotal));
    return `${base}?${p.toString()}`;
}

// ── XML del registro, tal y como se remite a la AEAT ────────────────────────
const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Una línea del desglose por tipo impositivo. Las clases van exentas (art. 20.1.9
// de la Ley del IVA: enseñanza), el material al 21 %.
export function lineaDesglose({ ivaPct, base, cuota, exenta, causaExencion = 'E1' }) {
    if (exenta) {
        return `      <DetalleDesglose>
        <Impuesto>01</Impuesto>
        <ClaveRegimen>01</ClaveRegimen>
        <CalificacionOperacion>S1</CalificacionOperacion>
        <OperacionExenta>${esc(causaExencion)}</OperacionExenta>
        <BaseImponibleOimporteNoSujeto>${importeAEAT(base)}</BaseImponibleOimporteNoSujeto>
      </DetalleDesglose>`;
    }
    return `      <DetalleDesglose>
        <Impuesto>01</Impuesto>
        <ClaveRegimen>01</ClaveRegimen>
        <CalificacionOperacion>S1</CalificacionOperacion>
        <TipoImpositivo>${importeAEAT(ivaPct)}</TipoImpositivo>
        <BaseImponibleOimporteNoSujeto>${importeAEAT(base)}</BaseImponibleOimporteNoSujeto>
        <CuotaRepercutida>${importeAEAT(cuota)}</CuotaRepercutida>
      </DetalleDesglose>`;
}

// Registro de alta en XML (el que se manda dentro de RegFactuSistemaFacturacion).
export function xmlRegistroAlta(r) {
    // Factura sin identificación del destinatario (art. 6.1.d del RD 1619/2012).
    // El orden de los elementos dentro de RegistroAlta lo fija el esquema de la
    // AEAT: esto va justo detrás de DescripcionOperacion y delante de
    // Destinatarios. Solo se admite en F2 y R5.
    const sinDestinatario = (r.sinDestinatario && !r.receptorNif)
        ? '    <FacturaSinIdentifDestinatarioArt61d>S</FacturaSinIdentifDestinatarioArt61d>\n'
        : '';
    const destinatario = r.receptorNif
        ? `    <Destinatarios>
      <IDDestinatario>
        <NombreRazon>${esc(r.receptorNombre)}</NombreRazon>
        <NIF>${esc(r.receptorNif)}</NIF>
      </IDDestinatario>
    </Destinatarios>\n`
        : '';
    // Una rectificativa (R1..R5) tiene que decir por qué método rectifica y a qué
    // factura corrige; sin esto la AEAT la rechaza.
    const rectificada = r.rectificaA
        ? `    <TipoRectificativa>${esc(r.tipoRectificativa || 'I')}</TipoRectificativa>
    <FacturasRectificadas>
      <IDFacturaRectificada>
        <IDEmisorFactura>${esc(r.rectificaA.nif)}</IDEmisorFactura>
        <NumSerieFactura>${esc(r.rectificaA.numSerie)}</NumSerieFactura>
        <FechaExpedicionFactura>${esc(r.rectificaA.fecha)}</FechaExpedicionFactura>
      </IDFacturaRectificada>
    </FacturasRectificadas>\n`
        : '';
    return `  <RegistroAlta>
    <IDVersion>1.0</IDVersion>
    <IDFactura>
      <IDEmisorFactura>${esc(r.nifEmisor)}</IDEmisorFactura>
      <NumSerieFactura>${esc(r.numSerie)}</NumSerieFactura>
      <FechaExpedicionFactura>${esc(r.fechaExpedicion)}</FechaExpedicionFactura>
    </IDFactura>
    <NombreRazonEmisor>${esc(r.nombreEmisor)}</NombreRazonEmisor>
    <TipoFactura>${esc(r.tipoFactura)}</TipoFactura>
${rectificada}    <DescripcionOperacion>${esc(r.descripcion)}</DescripcionOperacion>
${sinDestinatario}${destinatario}    <Desglose>
${r.desglose.map(lineaDesglose).join('\n')}
    </Desglose>
    <CuotaTotal>${importeAEAT(r.cuotaTotal)}</CuotaTotal>
    <ImporteTotal>${importeAEAT(r.importeTotal)}</ImporteTotal>
    <Encadenamiento>
${r.huellaAnterior
        ? `      <RegistroAnterior>
        <IDEmisorFactura>${esc(r.anteriorNif)}</IDEmisorFactura>
        <NumSerieFactura>${esc(r.anteriorNumSerie)}</NumSerieFactura>
        <FechaExpedicionFactura>${esc(r.anteriorFecha)}</FechaExpedicionFactura>
        <Huella>${esc(r.huellaAnterior)}</Huella>
      </RegistroAnterior>`
        : '      <PrimerRegistro>S</PrimerRegistro>'}
    </Encadenamiento>
    <SistemaInformatico>
      <NombreRazon>${esc(r.sif.nombreRazon)}</NombreRazon>
      <NIF>${esc(r.sif.nif)}</NIF>
      <NombreSistemaInformatico>${esc(r.sif.nombre)}</NombreSistemaInformatico>
      <IdSistemaInformatico>${esc(r.sif.id)}</IdSistemaInformatico>
      <Version>${esc(r.sif.version)}</Version>
      <NumeroInstalacion>${esc(r.sif.instalacion)}</NumeroInstalacion>
      <TipoUsoPosibleSoloVerifactu>S</TipoUsoPosibleSoloVerifactu>
      <TipoUsoPosibleMultiOT>N</TipoUsoPosibleMultiOT>
      <IndicadorMultiplesOT>N</IndicadorMultiplesOT>
    </SistemaInformatico>
    <FechaHoraHusoGenRegistro>${esc(r.fechaHoraHuso)}</FechaHoraHusoGenRegistro>
    <TipoHuella>01</TipoHuella>
    <Huella>${esc(r.huella)}</Huella>
  </RegistroAlta>`;
}

// Registro de anulación en XML.
export function xmlRegistroAnulacion(r) {
    return `  <RegistroAnulacion>
    <IDVersion>1.0</IDVersion>
    <IDFactura>
      <IDEmisorFacturaAnulada>${esc(r.nifEmisor)}</IDEmisorFacturaAnulada>
      <NumSerieFacturaAnulada>${esc(r.numSerie)}</NumSerieFacturaAnulada>
      <FechaExpedicionFacturaAnulada>${esc(r.fechaExpedicion)}</FechaExpedicionFacturaAnulada>
    </IDFactura>
    <Encadenamiento>
${r.huellaAnterior
        ? `      <RegistroAnterior>
        <IDEmisorFactura>${esc(r.anteriorNif)}</IDEmisorFactura>
        <NumSerieFactura>${esc(r.anteriorNumSerie)}</NumSerieFactura>
        <FechaExpedicionFactura>${esc(r.anteriorFecha)}</FechaExpedicionFactura>
        <Huella>${esc(r.huellaAnterior)}</Huella>
      </RegistroAnterior>`
        : '      <PrimerRegistro>S</PrimerRegistro>'}
    </Encadenamiento>
    <SistemaInformatico>
      <NombreRazon>${esc(r.sif.nombreRazon)}</NombreRazon>
      <NIF>${esc(r.sif.nif)}</NIF>
      <NombreSistemaInformatico>${esc(r.sif.nombre)}</NombreSistemaInformatico>
      <IdSistemaInformatico>${esc(r.sif.id)}</IdSistemaInformatico>
      <Version>${esc(r.sif.version)}</Version>
      <NumeroInstalacion>${esc(r.sif.instalacion)}</NumeroInstalacion>
      <TipoUsoPosibleSoloVerifactu>S</TipoUsoPosibleSoloVerifactu>
      <TipoUsoPosibleMultiOT>N</TipoUsoPosibleMultiOT>
      <IndicadorMultiplesOT>N</IndicadorMultiplesOT>
    </SistemaInformatico>
    <FechaHoraHusoGenRegistro>${esc(r.fechaHoraHuso)}</FechaHoraHusoGenRegistro>
    <TipoHuella>01</TipoHuella>
    <Huella>${esc(r.huella)}</Huella>
  </RegistroAnulacion>`;
}

// El sobre completo que se envía al servicio de remisión de la AEAT.
export function xmlEnvio({ emisor, registros }) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:sf="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd"
    xmlns:sfLR="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <sf:RegFactuSistemaFacturacion>
      <sfLR:Cabecera>
        <sfLR:ObligadoEmision>
          <sfLR:NombreRazon>${esc(emisor.nombre)}</sfLR:NombreRazon>
          <sfLR:NIF>${esc(emisor.nif)}</sfLR:NIF>
        </sfLR:ObligadoEmision>
      </sfLR:Cabecera>
${registros.join('\n')}
    </sf:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// Servicio de remisión (hace falta certificado del obligado o representante).
export const ENDPOINTS = {
    pruebas: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    produccion: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
};
