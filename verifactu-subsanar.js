// ─────────────────────────────────────────────────────────────────────────────
// VERI*FACTU · subsanación automática de un registro (#657). Va aparte de
// server.js para poder probarlo con la base real dentro de una transacción que
// se deshace (nada de la prueba queda ni lo ven las facturas de verdad).
// Lo que necesita de server.js le llega como parámetros.
// ─────────────────────────────────────────────────────────────────────────────
import * as verifactu from './verifactu.js';

// 'AAAA-MM-DD', venga la fecha como texto (en server.js) o como Date.
const dos = (n) => String(n).padStart(2, '0');
const fechaTexto = (f) => (f instanceof Date ? `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}` : String(f).slice(0, 10));

export const MAX_SUBSANACIONES = 5;
// Lo que cuenta de un registro, sin lo que cambia en cada envío.
export const contenidoRegistro = (xml) => String(xml || '')
    .replace(/<Subsanacion>[\s\S]*?<\/Subsanacion>|<RechazoPrevio>[\s\S]*?<\/RechazoPrevio>|<Encadenamiento>[\s\S]*?<\/Encadenamiento>|<FechaHoraHusoGenRegistro>[\s\S]*?<\/FechaHoraHusoGenRegistro>/g, '')
    .replace(/<Huella>[^<]*<\/Huella>/g, '').replace(/\s+/g, '');
// deps: lo que pone server.js (sif, receptorDeFactura, numeroVisible, huellaRegistro, software).
export async function subsanarUnRegistro(client, r, { sif, receptorDeFactura, numeroVisible, huellaRegistro, software }) {
    const rec = (await client.query(`SELECT * FROM aim_recibos WHERE id = $1`, [r.recibo_id])).rows[0];
    // El destinatario, con los datos de su ficha de hoy (solo las que lo llevan).
    let receptor = r.nif_receptor ? { nif: r.nif_receptor, nombre: r.nombre_receptor } : null;
    if (receptor && rec?.pagador_id) {
        const f = await receptorDeFactura(client, rec.pagador_id);
        if (f.nif) receptor = { nif: f.nif.toUpperCase(), nombre: f.nombre || receptor.nombre };
    }
    // Si es rectificativa: a qué factura corrige, cómo y (por sustitución) su importe.
    let rectificaA = null, tipoRectificativa = 'I', importeRectificacion = null;
    if (rec?.tipo === 'rectificativo' && rec.rectifica_id) {
        const o = (await client.query(`SELECT serie, numero, ejercicio, fecha FROM aim_recibos WHERE id = $1`, [rec.rectifica_id])).rows[0];
        const of = (await client.query(`SELECT base, cuota FROM aim_factura_registro WHERE recibo_id = $1 ORDER BY id LIMIT 1`, [rec.rectifica_id])).rows[0];
        if (o) rectificaA = { nif: r.nif_emisor, numSerie: numeroVisible(o), fecha: verifactu.fechaAEAT(o.fecha) };
        tipoRectificativa = rec.rect_metodo === 'sustitucion' ? 'S' : 'I';
        importeRectificacion = of ? { base: Number(of.base), cuota: Number(of.cuota) } : null;
    }
    const fechaExp = verifactu.fechaAEAT(fechaTexto(r.fecha_expedicion));
    const datos = {
        nifEmisor: r.nif_emisor, nombreEmisor: r.nombre_emisor, numSerie: r.num_serie, fechaExpedicion: fechaExp,
        tipoFactura: r.tipo_factura, descripcion: (r.descripcion || 'Servicios y material del club').slice(0, 500),
        receptorNombre: receptor?.nombre || null, receptorNif: receptor?.nif || null, sinDestinatario: false,
        desglose: JSON.parse(r.desglose || '[]'), cuotaTotal: r.cuota, importeTotal: r.total,
        rectificaA, tipoRectificativa, importeRectificacion, sif,
    };
    if (contenidoRegistro(verifactu.xmlRegistroAlta({ ...datos, fechaHoraHuso: '', huella: '' })) === contenidoRegistro(r.xml)) return null;
    // ¿Está la factura en la AEAT? (algún registro suyo aceptado, en este entorno)
    const original = r.subsana_id || r.id;
    const enAeat = (await client.query(
        `SELECT 1 FROM aim_factura_registro WHERE (id = $1 OR subsana_id = $1) AND estado_envio IN ('enviado', 'aceptado_errores') LIMIT 1`, [original])).rowCount > 0;
    const rechazoPrevio = !enAeat ? 'X' : r.estado_envio === 'rechazado' ? 'S' : null;
    // Encadenado como cualquier otro registro.
    await client.query('LOCK TABLE aim_factura_registro IN EXCLUSIVE MODE');
    const prev = await client.query(`SELECT huella FROM aim_factura_registro ORDER BY id DESC LIMIT 1`);
    const ant = (await client.query(
        `SELECT num_serie, fecha_expedicion::text AS fecha, huella_aeat, nif_emisor FROM aim_factura_registro
         WHERE huella_aeat IS NOT NULL AND COALESCE(modo, 'apagado') = $1 AND COALESCE(entorno, 'pruebas') = $2
         ORDER BY id DESC LIMIT 1`, [r.modo, r.entorno])).rows[0] || null;
    const fechaHuso = verifactu.fechaHoraHusoAEAT();
    const { huella: huellaAeat } = verifactu.huellaAlta({
        nifEmisor: r.nif_emisor, numSerie: r.num_serie, fechaExpedicion: fechaExp, tipoFactura: r.tipo_factura,
        cuotaTotal: r.cuota, importeTotal: r.total, huellaAnterior: ant?.huella_aeat || '', fechaHoraHuso: fechaHuso,
    });
    const xml = verifactu.xmlRegistroAlta({
        ...datos, subsanacion: true, rechazoPrevio,
        huellaAnterior: ant?.huella_aeat || null, anteriorNif: ant?.nif_emisor || null,
        anteriorNumSerie: ant?.num_serie || null, anteriorFecha: ant ? verifactu.fechaAEAT(ant.fecha) : null,
        fechaHoraHuso: fechaHuso, huella: huellaAeat,
    });
    const fila = {
        nif_emisor: r.nif_emisor, serie: r.serie, numero: r.numero, fecha_expedicion: fechaTexto(r.fecha_expedicion),
        tipo_factura: r.tipo_factura, cuota: r.cuota, total: r.total,
        huella_anterior: prev.rows[0]?.huella || null, emitido_at: new Date().toISOString(),
    };
    fila.huella = huellaRegistro(fila);
    const n = await client.query(
        `INSERT INTO aim_factura_registro
           (recibo_id, tipo_factura, serie, ejercicio, numero, fecha_expedicion, nif_emisor, nombre_emisor,
            nif_receptor, nombre_receptor, descripcion, base, cuota, total,
            rectifica_serie, rectifica_numero, rectifica_fecha,
            huella_anterior, huella, software_nombre, software_version, emitido_por, emitido_at,
            num_serie, huella_aeat, huella_aeat_anterior, fecha_hora_huso, desglose, xml, qr_url,
            estado_envio, modo, entorno, subsana_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NULL,$22,
                 $23,$24,$25,$26,$27,$28,$29,'pendiente',$30,$31,$32)
         RETURNING id`,
        [r.recibo_id, r.tipo_factura, r.serie, r.ejercicio, r.numero, fila.fecha_expedicion, r.nif_emisor, r.nombre_emisor,
         receptor?.nif || null, receptor?.nombre || null, r.descripcion, r.base, r.cuota, r.total,
         r.rectifica_serie, r.rectifica_numero, r.rectifica_fecha,
         fila.huella_anterior, fila.huella, software.nombre, software.version, fila.emitido_at,
         r.num_serie, huellaAeat, ant?.huella_aeat || null, fechaHuso, r.desglose, xml, r.qr_url,
         r.modo, r.entorno, original]);
    await client.query(`INSERT INTO aim_factura_eventos (tipo, registro_id, recibo_id, detalle) VALUES ('subsanacion', $1, $2, $3)`,
        [n.rows[0].id, r.recibo_id, `${r.num_serie}: subsana el registro ${r.id} (${r.estado_envio})${rechazoPrevio ? ` · RechazoPrevio=${rechazoPrevio}` : ''}`]);
    return n.rows[0].id;
}
