// ─────────────────────────────────────────────────────────────────────────────
// Un ZIP que se va mandando mientras se arma (#420: descargar un álbum entero o
// todas las fotos donde sale alguien). Sin comprimir: las fotos son JPEG y ya
// están comprimidas, así que solo se ganaría tiempo de servidor. Cada foto se
// escribe en cuanto se lee de la base, de modo que la descarga empieza al
// momento (Heroku corta si en 30 s no llega nada) y no hay que tenerlas todas
// en memoria. Formato ZIP clásico (hasta 4 GB y 65.535 archivos), con los
// nombres en UTF-8 para que salgan bien las tildes.
// Este mismo archivo está en aim-kidsngrow (server/zip.js): si se cambia aquí,
// también allí.
// ─────────────────────────────────────────────────────────────────────────────

const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}
// Fecha y hora en el formato de MS-DOS que usa el ZIP (hora de Madrid).
function fechaDos(d) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date()).map(x => [x.type, Number(x.value)]));
    return {
        hora: ((p.hour % 24) << 11) | (p.minute << 5) | Math.floor(p.second / 2),
        dia: ((Math.max(1980, p.year) - 1980) << 9) | (p.month << 5) | p.day,
    };
}
// Un nombre de archivo o carpeta que valga en Windows, Mac y móviles.
export function nombreArchivo(texto, max = 80) {
    return String(texto || '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
        .replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, max).trim() || 'sin nombre';
}
// Content-Disposition con el nombre bien puesto (con tildes incluidas).
export function cabeceraAdjunto(nombre) {
    const ascii = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

// salida: la respuesta HTTP (o cualquier stream escribible).
export function crearZip(salida) {
    const central = [];
    const usados = new Set();
    let posicion = 0;
    const escribir = async (b) => {
        if (salida.destroyed) throw Object.assign(new Error('La descarga se ha cortado.'), { cortada: true });
        if (!salida.write(b)) {
            await new Promise(ok => { salida.once('drain', ok); salida.once('close', ok); });
        }
    };
    return {
        get cortada() { return salida.destroyed; },
        // Añade un archivo. Si el nombre se repite, «foto (2).jpg».
        async anadir(nombre, datos, fecha = new Date()) {
            let n = nombre, i = 2;
            while (usados.has(n.toLowerCase())) n = nombre.replace(/(\.[^./]*)?$/, (ext) => ` (${i++})${ext}`);
            usados.add(n.toLowerCase());
            const nb = Buffer.from(n, 'utf8');
            const crc = crc32(datos), { hora, dia } = fechaDos(fecha);
            const h = Buffer.alloc(30);
            h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8);
            h.writeUInt16LE(hora, 10); h.writeUInt16LE(dia, 12); h.writeUInt32LE(crc, 14);
            h.writeUInt32LE(datos.length, 18); h.writeUInt32LE(datos.length, 22); h.writeUInt16LE(nb.length, 26); h.writeUInt16LE(0, 28);
            central.push({ nb, crc, tam: datos.length, hora, dia, posicion });
            await escribir(Buffer.concat([h, nb]));
            await escribir(datos);
            posicion += 30 + nb.length + datos.length;
        },
        // El índice del final, y se cierra la respuesta.
        async cerrar() {
            const inicio = posicion;
            let tam = 0;
            for (const c of central) {
                const h = Buffer.alloc(46);
                h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0800, 8);
                h.writeUInt16LE(0, 10); h.writeUInt16LE(c.hora, 12); h.writeUInt16LE(c.dia, 14); h.writeUInt32LE(c.crc, 16);
                h.writeUInt32LE(c.tam, 20); h.writeUInt32LE(c.tam, 24); h.writeUInt16LE(c.nb.length, 28);
                h.writeUInt16LE(0, 30); h.writeUInt16LE(0, 32); h.writeUInt16LE(0, 34); h.writeUInt16LE(0, 36);
                h.writeUInt32LE(0, 38); h.writeUInt32LE(c.posicion, 42);
                await escribir(Buffer.concat([h, c.nb]));
                tam += 46 + c.nb.length;
            }
            const e = Buffer.alloc(22);
            e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(0, 4); e.writeUInt16LE(0, 6);
            e.writeUInt16LE(central.length, 8); e.writeUInt16LE(central.length, 10);
            e.writeUInt32LE(tam, 12); e.writeUInt32LE(inicio, 16); e.writeUInt16LE(0, 20);
            await escribir(e);
            salida.end();
        },
    };
}

// Manda un ZIP con las fotos de la lista. leer(ids) → [{ id, datos }] (de diez
// en diez, para no ir una a una a la base ni cargarlas todas). Cada foto:
// { id, nombre (con su carpeta, si va), fecha }.
export async function enviarZipFotos(res, nombreZip, fotos, leer) {
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', cabeceraAdjunto(nombreZip));
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    const zip = crearZip(res);
    try {
        for (let i = 0; i < fotos.length && !zip.cortada; i += 10) {
            const tanda = fotos.slice(i, i + 10);
            const datos = new Map((await leer(tanda.map(f => f.id))).map(x => [String(x.id), x.datos]));
            for (const f of tanda) {
                const d = datos.get(String(f.id));
                if (d) await zip.anadir(f.nombre, d, f.fecha);
            }
        }
        if (!zip.cortada) await zip.cerrar();
    } catch (e) {
        // Si quien descarga se va a medias, no es un error del servidor.
        if (!e?.cortada) console.error('[zip]', e.message);
        if (!res.headersSent) {
            res.removeHeader('Content-Disposition');
            res.status(500).json({ error: 'No se han podido preparar las fotos. Vuelve a intentarlo.' });
        } else res.destroy();
    }
}
