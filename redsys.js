import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// TPV Virtual de Redsys (BBVA), integración por redirección con 3D Secure 2.
//
// El comercio nunca ve la tarjeta: se manda al cliente a Redsys con los datos
// del pago firmados, paga allí, y Redsys nos avisa por detrás a una URL de
// notificación. Esa notificación es la única fuente de verdad: el navegador
// puede no volver nunca (se cierra, se queda sin batería) y el pago estar hecho.
//
// La firma es HMAC-SHA256 sobre los parámetros en base64, con una clave que se
// deriva cifrando el número de pedido con la clave del comercio (3DES). Cada
// pago se firma con una clave distinta, por eso el número de pedido entra en el
// cálculo y no puede repetirse.
// ─────────────────────────────────────────────────────────────────────────────

export const ENTORNOS = {
    pruebas: 'https://sis-t.redsys.es:25443/sis/realizarPago',
    real: 'https://sis.redsys.es/sis/realizarPago',
};

// Credenciales públicas del entorno de pruebas de Redsys, para poder probar el
// flujo entero sin tocar el comercio de verdad. No sirven para cobrar.
export const PRUEBAS = {
    comercio: '999008881',
    terminal: '001',
    clave: 'sq7HjrUOBfKmC576ILgskD5srU870gJ7',
};

// Clave de firma de este pago: 3DES-CBC (IV a cero) del número de pedido con la
// clave del comercio. El pedido se rellena con ceros hasta múltiplo de 8.
function claveDelPedido(claveComercio, pedido) {
    const clave = Buffer.from(claveComercio, 'base64');
    const cifrador = crypto.createCipheriv('des-ede3-cbc', clave, Buffer.alloc(8, 0));
    cifrador.setAutoPadding(false);
    const bloque = Buffer.alloc(Math.ceil(pedido.length / 8) * 8, 0);
    bloque.write(pedido, 'utf8');
    return Buffer.concat([cifrador.update(bloque), cifrador.final()]);
}

export function firmar(claveComercio, pedido, parametrosB64) {
    return crypto.createHmac('sha256', claveDelPedido(claveComercio, pedido))
        .update(parametrosB64).digest('base64');
}

// Redsys manda la firma en base64 "seguro para URL" (- y _ en vez de + y /).
const normaliza = (s) => String(s || '').replace(/-/g, '+').replace(/_/g, '/');

export function codificaParametros(datos) {
    return Buffer.from(JSON.stringify(datos), 'utf8').toString('base64');
}

export function decodificaParametros(b64) {
    return JSON.parse(Buffer.from(normaliza(b64), 'base64').toString('utf8'));
}

// Comprueba la firma de una notificación. Se compara en tiempo constante para
// no filtrar por dónde falla, y se devuelve además el contenido ya decodificado.
export function verificaNotificacion(claveComercio, parametrosB64, firmaRecibida) {
    const datos = decodificaParametros(parametrosB64);
    const pedido = datos.Ds_Order || datos.DS_ORDER || datos.Ds_Merchant_Order;
    if (!pedido) return { valida: false, datos };
    const esperada = Buffer.from(normaliza(firmar(claveComercio, pedido, parametrosB64)));
    const recibida = Buffer.from(normaliza(firmaRecibida));
    const valida = esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
    return { valida, datos, pedido };
}

// El número de pedido de Redsys: 12 caracteres, los 4 primeros numéricos, y
// único para siempre en el comercio. Se usa el id de nuestra fila en base para
// que no pueda repetirse ni con dos pagos simultáneos.
export function numeroPedido(id) {
    const n = String(id).padStart(6, '0').slice(-6);
    const sufijo = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 caracteres
    return `${n}${sufijo}`;
}

// Redsys trabaja en céntimos, sin decimales ni separadores.
export const aCentimos = (euros) => String(Math.round(Number(euros) * 100));

// Qué significa cada Ds_Response. 0000–0099 es pago autorizado; el resto,
// denegado, y conviene guardar el código para poder explicárselo a la familia.
export function respuestaAutorizada(ds) {
    const n = Number(ds);
    return Number.isFinite(n) && n >= 0 && n <= 99;
}

export const MOTIVOS = {
    '0101': 'Tarjeta caducada.',
    '0102': 'Tarjeta bloqueada temporalmente o bajo sospecha de fraude.',
    '0106': 'Demasiados intentos de PIN.',
    '0116': 'Saldo o límite de la tarjeta insuficiente.',
    '0118': 'Tarjeta no registrada.',
    '0125': 'Tarjeta no efectiva.',
    '0129': 'Código de seguridad (CVV2/CVC2) incorrecto.',
    '0180': 'Tarjeta ajena al servicio.',
    '0184': 'Error en la autenticación del titular.',
    '0190': 'Denegada por el banco emisor, sin especificar motivo.',
    '0191': 'Fecha de caducidad errónea.',
    '0202': 'Tarjeta bloqueada transitoriamente o bajo sospecha de fraude.',
    '0904': 'Comercio no registrado en FUC.',
    '0909': 'Error del sistema.',
    '0912': 'Banco emisor no disponible.',
    '9915': 'Pago cancelado por el usuario.',
    '9998': 'Operación en proceso de solicitud de datos de tarjeta.',
    '9999': 'Operación que ha sido redirigida al emisor a autenticar.',
};

export function motivoDe(ds) {
    const c = String(ds || '').padStart(4, '0');
    if (respuestaAutorizada(c)) return null;
    return MOTIVOS[c] || `Pago denegado por el banco (código ${c}).`;
}

// ── Tipos de operación y pagos recurrentes ──────────────────────────────────
// Para que la familia autorice un cobro mensual automático hay que usar el
// "pago por referencia" con las marcas COF (Credential On File) que exige
// 3D Secure 2: el primer pago lo hace el titular y deja una referencia, y los
// siguientes los lanza el comercio contra esa referencia sin que él esté.
export const TIPO = {
    autorizacion: '0',      // pago normal
    devolucion: '3',
};

// Parámetros del primer pago de una domiciliación: pide la referencia y marca
// la operación como inicial de una serie recurrente.
export const COF_INICIAL = {
    DS_MERCHANT_IDENTIFIER: 'REQUIRED',
    DS_MERCHANT_COF_INI: 'S',
    DS_MERCHANT_COF_TYPE: 'R',
};

// Parámetros de los cobros siguientes, ya sin el titular delante.
export function cofRecurrente(identificador, txnid) {
    return {
        DS_MERCHANT_IDENTIFIER: identificador,
        DS_MERCHANT_COF_INI: 'N',
        DS_MERCHANT_COF_TYPE: 'R',
        DS_MERCHANT_COF_TXNID: txnid,
        DS_MERCHANT_DIRECTPAYMENT: 'true',
    };
}
