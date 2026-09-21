import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─────────────────────────────────────────────────────────────────────────────
// Libro registro de facturas expedidas y prorrata del IVA (ticket #292).
//
// El libro sale en la plantilla que usa la gestoría (plantillas/
// PLANTILLA_AON_FACTURAS.xlsx), con sus mismas columnas y formatos, para que la
// puedan importar tal cual. Una fila por factura y tipo de IVA: tras el reparto
// por series casi todas las facturas llevan un único tipo, pero si alguna mezcla
// dos, cada tipo va en su fila, que es como se lleva un libro registro.
//
// La prorrata sale de lo mismo: lo facturado con IVA (da derecho a deducir) frente
// al total, contando lo exento (art. 104 de la Ley 37/1992).
// ─────────────────────────────────────────────────────────────────────────────

const PLANTILLA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plantillas', 'PLANTILLA_AON_FACTURAS.xlsx');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Qué se escribe en "TIPO OPERACIÓN" para cada serie. Se puede cambiar en
// pantalla: si la gestoría usa códigos, se ponen sus códigos.
export const TIPOS_OPERACION_DEFECTO = {
    MAT: 'Entrega de bienes',
    IVA: 'Prestación de servicios',
    SIVA: 'Exenta art. 20.Uno.9º LIVA',
    MATR: 'Rectificativa entrega de bienes',
    IVAR: 'Rectificativa prestación de servicios',
    SIVAR: 'Rectificativa exenta',
};

// Las líneas de IVA de un registro. Si por lo que sea no guardó el desglose (los
// de antes de VERI*FACTU), se deduce de la base y la cuota.
export function lineasDeRegistro(reg) {
    let desglose = reg.desglose;
    if (typeof desglose === 'string') { try { desglose = JSON.parse(desglose); } catch { desglose = null; } }
    if (Array.isArray(desglose) && desglose.length) {
        return desglose.map(d => {
            const ivaPct = Number(d.ivaPct) || 0;
            return { ivaPct, base: r2(d.base), cuota: r2(d.cuota ?? d.iva), exenta: d.exenta === true || ivaPct === 0 };
        });
    }
    const cuota = r2(reg.cuota);
    const base = r2(reg.base);
    const ivaPct = cuota && base ? Math.round(cuota / base * 100) : 0;
    return [{ ivaPct, base, cuota, exenta: ivaPct === 0 }];
}

// Tipo de operación de una línea: manda lo que ES la línea, no solo su serie. Una
// línea exenta es exenta aunque, por un concepto fijado a mano, haya caído en otra
// serie; y así también se clasifican las de antes de las series (la "A").
function tipoOperacion(reg, linea, tipos) {
    const rect = /^R/.test(reg.tipo_factura || '');
    const serieBase = String(reg.serie || '').replace(/R$/, '');      // MATR -> MAT
    const familia = linea.exenta ? 'SIVA' : (serieBase === 'MAT' ? 'MAT' : 'IVA');
    const clave = familia + (rect ? 'R' : '');
    const t = tipos?.[clave] ?? TIPOS_OPERACION_DEFECTO[clave];
    return String(t ?? '').trim();
}

// Las filas del libro, en el orden de las columnas de la plantilla.
export function filasLibroRegistro(registros, tipos = TIPOS_OPERACION_DEFECTO) {
    const filas = [];
    for (const reg of registros) {
        for (const l of lineasDeRegistro(reg)) {
            filas.push({
                tipo: tipoOperacion(reg, l, tipos),
                fecha: String(reg.fecha).slice(0, 10),
                numero: reg.num_serie,
                nif: (reg.nif_receptor || '').trim(),
                nombre: (reg.nombre_receptor || '').trim(),
                base: l.base,
                pct: l.ivaPct,
                cuota: l.cuota,
                // El total de ESA fila (base + cuota). Con una sola línea es el total
                // de la factura; con dos, sumar la columna sigue dando lo facturado.
                total: r2(l.base + l.cuota),
                serie: reg.serie,
                exenta: l.exenta,
                tipoFactura: reg.tipo_factura,
            });
        }
    }
    return filas;
}

// Rellena la plantilla de la gestoría y la escribe en `salida` (un stream).
export async function generarLibroRegistro(filas, salida) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(PLANTILLA);
    const ws = wb.worksheets[0];
    // Formato de cada columna, el mismo que trae la plantilla, puesto a mano por
    // si hay más filas de las que la plantilla deja preparadas.
    const FORMATOS = ['0', 'D/M/YYYY', '@', '0', '0', '0.00', '0.00', '0.00', '0.00'];
    filas.forEach((f, i) => {
        const row = ws.getRow(i + 2);
        const [a, m, d] = f.fecha.split('-').map(Number);
        // Si el tipo de operación es un código numérico, va como número (la
        // columna viene con formato numérico en la plantilla).
        const tipo = /^\d+$/.test(f.tipo) ? Number(f.tipo) : f.tipo;
        const valores = [tipo, new Date(Date.UTC(a, m - 1, d)), f.numero, f.nif || null, f.nombre || null,
            f.base, f.pct, f.cuota, f.total];
        valores.forEach((v, c) => {
            const cell = row.getCell(c + 1);
            cell.value = v;
            cell.numFmt = FORMATOS[c];
        });
        row.commit();
    });
    await wb.xlsx.write(salida);
}

// ── Prorrata ────────────────────────────────────────────────────────────────
// Porcentaje de deducción = operaciones con derecho a deducir / total, y se
// redondea a la UNIDAD SUPERIOR (art. 104.Dos.2º de la Ley 37/1992). Aquí, las
// que dan derecho son las sujetas y no exentas (material y servicios con IVA);
// las que no, la enseñanza exenta.
export function porcentajeProrrata(sujeta, exenta) {
    const total = r2(sujeta + exenta);
    if (!(total > 0)) return null;
    if (!(sujeta > 0)) return 0;
    if (!(exenta > 0)) return 100;
    // El margen evita que un 45,0000001 por redondeo de coma flotante suba a 46.
    return Math.min(100, Math.ceil(sujeta / total * 100 - 1e-9));
}

// Suma lo sujeto y lo exento de unos registros, en total y por trimestre.
export function prorrataDe(registros) {
    const trimestres = [1, 2, 3, 4].map(t => ({ trimestre: t, sujeta: 0, exenta: 0 }));
    let sujeta = 0, exenta = 0;
    for (const reg of registros) {
        const t = Math.floor((Number(String(reg.fecha).slice(5, 7)) - 1) / 3);
        for (const l of lineasDeRegistro(reg)) {
            if (l.exenta) { exenta = r2(exenta + l.base); trimestres[t].exenta = r2(trimestres[t].exenta + l.base); }
            else { sujeta = r2(sujeta + l.base); trimestres[t].sujeta = r2(trimestres[t].sujeta + l.base); }
        }
    }
    // Lo acumulado hasta cada trimestre, que es como avanza la definitiva.
    let accS = 0, accE = 0;
    for (const t of trimestres) {
        accS = r2(accS + t.sujeta); accE = r2(accE + t.exenta);
        t.pctTrimestre = porcentajeProrrata(t.sujeta, t.exenta);
        t.acumulado = { sujeta: accS, exenta: accE, pct: porcentajeProrrata(accS, accE) };
    }
    return { sujeta, exenta, total: r2(sujeta + exenta), pct: porcentajeProrrata(sujeta, exenta), trimestres };
}
