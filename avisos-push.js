// ─────────────────────────────────────────────────────────────────────────────
// Avisos al móvil (#218), sin Firebase. Lo que se manda es lo mismo que enseña
// la campanita del área de familias; ver movil/AVISOS.md.
//
//  · Android: la app tiene abierta una conexión propia con el servidor
//    (WebSocket en /ws/avisos) y por ella le llegan los avisos al momento.
//  · iPhone: se mandan a Apple (APNs) con la clave .p8 del club.
//
// De cada móvil se guarda qué se le ha mandado ya (avisados: clave → marca o
// número), para no repetir nada y para ponerlo al día al volver a conectar.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import http2 from 'http2';
import { WebSocketServer } from 'ws';

export const GRUPOS_AVISO = ['pagos', 'clases', 'soporte', 'brickslab', 'fotos'];
// Los de sus actividades se respetan si ha dicho que no a esas comunicaciones
// (#170); pagos y soporte son del servicio y llegan siempre.
const GRUPOS_ACTIVIDADES = new Set(['clases', 'brickslab', 'fotos']);
const RUTA_WS = '/ws/avisos';
const LATIDO_MS = 40_000;          // el router de Heroku corta a los 55 s sin tráfico
const AGRUPAR_MS = 2_000;          // lo que pasa seguido se manda de una vez
const MAX_DISPOSITIVOS = 10;

export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
// Lo que se guarda de un aviso ya mandado: su marca (fecha de lo último) o, si
// es un contador (los cargos), el número.
const valorAviso = (a) => (a.marca ? new Date(a.marca).toISOString() : Number(a.n) || 1);
function esMasNuevo(a, previo) {
  if (previo == null) return true;
  if (a.marca) return new Date(a.marca) > new Date(previo);
  return (Number(a.n) || 1) > Number(previo);
}

// ── Apple (APNs) ──
// Variables: APNS_KEY (contenido del .p8), APNS_KEY_ID, APNS_TEAM_ID,
// APNS_TOPIC (es.aimeducation.app) y APNS_ENTORNO=sandbox para pruebas.
function crearApns() {
  const clave = (process.env.APNS_KEY || '').replace(/\\n/g, '\n').trim();
  const kid = process.env.APNS_KEY_ID, equipo = process.env.APNS_TEAM_ID;
  const topic = process.env.APNS_TOPIC || 'es.aimeducation.app';
  if (!clave || !kid || !equipo) return null;
  const host = process.env.APNS_ENTORNO === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  let jwt = null, jwtHecho = 0, sesion = null;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = () => {
    // Apple pide renovarlo entre 20 y 60 minutos.
    if (jwt && Date.now() - jwtHecho < 50 * 60_000) return jwt;
    const datos = `${b64({ alg: 'ES256', kid })}.${b64({ iss: equipo, iat: Math.floor(Date.now() / 1000) })}`;
    const firma = crypto.sign('sha256', Buffer.from(datos), { key: clave, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    jwt = `${datos}.${firma}`; jwtHecho = Date.now();
    return jwt;
  };
  const conexion = () => {
    if (sesion && !sesion.closed && !sesion.destroyed) return sesion;
    sesion = http2.connect(host);
    sesion.on('error', (e) => { console.error('[avisos] APNs:', e.message); sesion = null; });
    sesion.on('goaway', () => { sesion = null; });
    sesion.setTimeout(10 * 60_000, () => { sesion?.close(); sesion = null; });
    return sesion;
  };
  return {
    // → { ok } | { ok: false, borrar: true } si el token ya no vale.
    enviar: (apnsToken, a) => new Promise((resolve) => {
      let s;
      try { s = conexion(); } catch (e) { resolve({ ok: false, error: e.message }); return; }
      const cuerpo = JSON.stringify({
        aps: { alert: { title: a.titulo, body: a.cuerpo || undefined }, sound: 'default', 'thread-id': a.grupo },
        url: a.url, clave: a.clave,
      });
      const req = s.request({
        ':method': 'POST', ':path': `/3/device/${apnsToken}`,
        authorization: `bearer ${token()}`, 'apns-topic': topic, 'apns-push-type': 'alert', 'apns-priority': '10',
        'apns-collapse-id': hashToken(a.clave).slice(0, 32), 'content-type': 'application/json',
      });
      let estado = 0, resp = '';
      req.setTimeout(15_000, () => { req.close(); resolve({ ok: false, error: 'tiempo' }); });
      req.on('response', (h) => { estado = h[':status']; });
      req.on('data', (d) => { resp += d; });
      req.on('end', () => {
        if (estado === 200) return resolve({ ok: true });
        let motivo = '';
        try { motivo = JSON.parse(resp).reason || ''; } catch { /* sin cuerpo */ }
        resolve({ ok: false, borrar: estado === 410 || ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'].includes(motivo), error: `${estado} ${motivo}` });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.end(cuerpo);
    }),
  };
}

export function crearAvisosPush({ pool, familiaIds, avisosFamilia, sinActividades }) {
  const apns = crearApns();
  const porHash = new Map();      // hash del token → { id, userId } (Android)
  const sockets = new Map();      // id del dispositivo → ws
  const vistoEn = new Map();      // id → fecha del último contacto (se guarda en lote)
  const enCurso = new Map();      // id → { clave: valor } mandado y aún sin confirmar
  const noValen = new Set();      // huellas que no son de nadie (se vacía al dar de alta)
  let buscando = 0;               // consultas de tokens en marcha
  let wss = null;

  const cargarTokens = async () => {
    const r = await pool.query(`SELECT id, user_id, token_hash FROM aim_push_dispositivos WHERE token_hash IS NOT NULL`);
    porHash.clear();
    for (const x of r.rows) porHash.set(x.token_hash, { id: x.id, userId: x.user_id });
  };

  // Los avisos que tocan a una cuenta ahora, ya listos para el móvil.
  async function avisosPara(userId) {
    const lista = (await avisosFamilia(userId)).filter(a => a.grupo);
    const conActividad = lista.filter(a => GRUPOS_ACTIVIDADES.has(a.grupo));
    if (!conActividad.length) return lista;
    const quienes = [...new Set(conActividad.map(a => a.alumnoId || userId))];
    const no = new Set();
    for (const q of quienes) if (await sinActividades(q)) no.add(String(q));
    return lista.filter(a => !GRUPOS_ACTIVIDADES.has(a.grupo) || !no.has(String(a.alumnoId || userId)));
  }

  const marcarAvisados = (id, cambios) => {
    const entradas = Object.entries(cambios);
    if (!entradas.length) return Promise.resolve();
    return pool.query(`UPDATE aim_push_dispositivos SET avisados = avisados || $2::jsonb WHERE id = $1`, [id, JSON.stringify(cambios)]);
  };

  // Manda a los móviles de una cuenta lo que tengan pendiente. Con «solo», a uno.
  async function ponerAlDia(userId, { solo = null } = {}) {
    const disp = (await pool.query(
      `SELECT id, plataforma, apns_token, preferencias, avisados FROM aim_push_dispositivos WHERE user_id = $1 ${solo ? 'AND id = $2' : ''}`,
      solo ? [userId, solo] : [userId])).rows;
    if (!disp.length) return;
    const lista = await avisosPara(userId);
    const avisos = lista.filter(a => a.nuevo);
    const contadores = new Map(lista.filter(a => !a.marca).map(a => [a.clave, Number(a.n) || 1]));
    for (const d of disp) {
      // Un contador (los recibos por pagar) que ya no está, o que ha bajado, se
      // olvida o se baja: así el recibo del mes que viene vuelve a avisar.
      const olvidar = [], bajar = {};
      for (const [k, v] of Object.entries(d.avisados || {})) {
        if (typeof v !== 'number') continue;
        if (!contadores.has(k)) olvidar.push(k);
        else if (contadores.get(k) < v) bajar[k] = contadores.get(k);
      }
      if (olvidar.length || Object.keys(bajar).length) {
        await pool.query(`UPDATE aim_push_dispositivos SET avisados = (avisados - $2::text[]) || $3::jsonb WHERE id = $1`, [d.id, olvidar, JSON.stringify(bajar)]);
        for (const k of olvidar) delete d.avisados[k];
        Object.assign(d.avisados, bajar);
      }
      const pref = d.preferencias || {};
      const ya = { ...(d.avisados || {}), ...(enCurso.get(d.id) || {}) };
      const toca = avisos.filter(a => pref[a.grupo] !== false && esMasNuevo(a, ya[a.clave]));
      if (!toca.length) continue;
      if (d.plataforma === 'android') {
        const ws = sockets.get(d.id);
        if (!ws || ws.readyState !== 1) continue;   // al conectar se pone al día
        const pend = enCurso.get(d.id) || {};
        for (const a of toca) {
          pend[a.clave] = valorAviso(a);
          ws.send(JSON.stringify({ t: 'aviso', clave: a.clave, marca: a.marca ? new Date(a.marca).toISOString() : null, n: Number(a.n) || 1, grupo: a.grupo, titulo: a.titulo, cuerpo: a.cuerpo || '', url: a.url }));
        }
        enCurso.set(d.id, pend);
      } else if (apns && d.apns_token) {
        const hechos = {};
        for (const a of toca) {
          const r = await apns.enviar(d.apns_token, a);
          if (r.ok) hechos[a.clave] = valorAviso(a);
          else if (r.borrar) { await pool.query(`DELETE FROM aim_push_dispositivos WHERE id = $1`, [d.id]); break; }
          else console.error('[avisos] APNs no lo ha aceptado:', r.error);
        }
        await marcarAvisados(d.id, hechos);
      }
    }
  }

  // ── Cola: lo que pasa seguido (una respuesta, varias fotos…) va junto ──
  const pendientes = new Set();
  let todos = false, temporizador = null, trabajando = false;
  async function vaciar() {
    temporizador = null;
    if (trabajando) { temporizador = setTimeout(() => vaciar(), AGRUPAR_MS); return; }
    trabajando = true;
    try {
      let ids;
      if (todos) {
        todos = false; pendientes.clear();
        ids = (await pool.query(`SELECT DISTINCT user_id FROM aim_push_dispositivos`)).rows.map(x => x.user_id);
      } else {
        const personas = [...pendientes]; pendientes.clear();
        const fam = new Set();
        for (const p of personas) for (const f of await familiaIds(p)) fam.add(String(f));
        ids = fam.size ? (await pool.query(`SELECT DISTINCT user_id FROM aim_push_dispositivos WHERE user_id = ANY($1::uuid[])`, [[...fam]])).rows.map(x => x.user_id) : [];
      }
      for (const u of ids) await ponerAlDia(u).catch(e => console.error('[avisos]', u, e.message));
    } catch (e) {
      console.error('[avisos] cola:', e.message);
    } finally { trabajando = false; }
  }
  const programar = () => { if (!temporizador) temporizador = setTimeout(() => { vaciar(); }, AGRUPAR_MS); };
  // Algo ha cambiado para estas personas (alumnos o adultos): a sus familias.
  // Nunca falla ni hace esperar a quien lo llama.
  function avisarFamilias(personaIds) {
    for (const p of [].concat(personaIds || [])) if (p) pendientes.add(String(p));
    if (pendientes.size) programar();
  }
  // Algo que puede tocar a muchos (un álbum, una votación, los cargos del mes).
  function avisarTodos() { todos = true; programar(); }
  // Los Android que llevan meses sin conectar (la app desinstalada): fuera. Los
  // iPhone no: de esos avisa Apple (410) en cuanto se les manda algo.
  async function purgar() {
    const r = await pool.query(
      `SELECT id FROM aim_push_dispositivos WHERE plataforma = 'android' AND COALESCE(last_seen_at, created_at) < NOW() - INTERVAL '90 days'`);
    for (const x of r.rows) await quitar(x.id);
  }

  // ── Dispositivos ──
  async function registrar(userId, b) {
    const plataforma = b.plataforma === 'ios' ? 'ios' : b.plataforma === 'android' ? 'android' : null;
    if (!plataforma) throw Object.assign(new Error('Plataforma no válida.'), { http: 400 });
    const txt = (v, n) => (v == null ? null : String(v).slice(0, n) || null);
    // Lo que ya hay no se manda: solo lo que pase desde ahora.
    const base = {};
    for (const a of await avisosPara(userId).catch(() => [])) base[a.clave] = valorAviso(a);
    let id, token = null;
    if (plataforma === 'ios') {
      const apnsToken = String(b.apnsToken || '').replace(/[^0-9a-fA-F]/g, '');
      if (apnsToken.length < 32 || apnsToken.length > 200) throw Object.assign(new Error('Falta el identificador del iPhone.'), { http: 400 });
      id = (await pool.query(
        `INSERT INTO aim_push_dispositivos (user_id, plataforma, apns_token, fabricante, modelo, version_app, avisados, last_seen_at)
         VALUES ($1, 'ios', $2, $3, $4, $5, $6::jsonb, NOW())
         ON CONFLICT (apns_token) DO UPDATE SET user_id = EXCLUDED.user_id, modelo = EXCLUDED.modelo, version_app = EXCLUDED.version_app,
           avisados = CASE WHEN aim_push_dispositivos.user_id = EXCLUDED.user_id THEN aim_push_dispositivos.avisados ELSE EXCLUDED.avisados END,
           preferencias = CASE WHEN aim_push_dispositivos.user_id = EXCLUDED.user_id THEN aim_push_dispositivos.preferencias ELSE '{}'::jsonb END,
           last_seen_at = NOW()
         RETURNING id`, [userId, apnsToken.toLowerCase(), txt(b.fabricante, 60) || 'Apple', txt(b.modelo, 80), txt(b.version, 20), JSON.stringify(base)])).rows[0].id;
    } else {
      token = crypto.randomBytes(32).toString('base64url');
      const h = hashToken(token);
      id = (await pool.query(
        `INSERT INTO aim_push_dispositivos (user_id, plataforma, token_hash, fabricante, modelo, version_app, avisados, last_seen_at)
         VALUES ($1, 'android', $2, $3, $4, $5, $6::jsonb, NOW()) RETURNING id`,
        [userId, h, txt(b.fabricante, 60), txt(b.modelo, 80), txt(b.version, 20), JSON.stringify(base)])).rows[0].id;
      porHash.set(h, { id, userId });
      noValen.delete(h);
    }
    // Como mucho unos pocos por cuenta: los más antiguos fuera.
    const sobran = (await pool.query(
      `SELECT id FROM aim_push_dispositivos WHERE user_id = $1 ORDER BY COALESCE(last_seen_at, created_at) DESC OFFSET ${MAX_DISPOSITIVOS}`, [userId])).rows;
    for (const s of sobran) await quitar(s.id);
    return { id, token };
  }

  async function quitar(id) {
    const r = await pool.query(`DELETE FROM aim_push_dispositivos WHERE id = $1 RETURNING token_hash`, [id]);
    const h = r.rows[0]?.token_hash;
    if (h) porHash.delete(h);
    enCurso.delete(id);
    const ws = sockets.get(id);
    if (ws) { try { ws.send(JSON.stringify({ t: 'fuera' })); ws.close(1008, 'fuera'); } catch { /* ya cerrada */ } sockets.delete(id); }
    return r.rowCount > 0;
  }
  // Al cambiar la contraseña: fuera todos sus móviles.
  async function quitarDeUsuario(userId) {
    const r = await pool.query(`SELECT id FROM aim_push_dispositivos WHERE user_id = $1`, [userId]);
    for (const x of r.rows) await quitar(x.id);
  }

  const conectado = (id) => sockets.get(id)?.readyState === 1;

  // ── Conexión de Android ──
  function enganchar(server) {
    wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
    server.on('upgrade', (req, socket, head) => {
      // Node ya no escucha los errores de este socket: sin esto, un corte de la
      // conexión mientras se consulta la base tumbaría el proceso entero.
      const alError = () => socket.destroy();
      socket.on('error', alError);
      let ruta = '';
      try { ruta = new URL(req.url, 'http://x').pathname; } catch { /* mala */ }
      if (ruta !== RUTA_WS) { socket.destroy(); return; }
      const rechazar = (codigo, texto) => {
        if (!socket.destroyed) socket.end(`HTTP/1.1 ${codigo} ${texto}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
        setTimeout(() => socket.destroy(), 1000).unref?.();
      };
      // Desde un navegador no: solo la app (que no manda Origin).
      if (req.headers.origin) return rechazar(403, 'Forbidden');
      const m = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || '');
      if (!m) return rechazar(401, 'Unauthorized');
      const h = hashToken(m[1]);
      const sigue = (d) => {
        if (socket.destroyed) return;
        if (!d) return rechazar(401, 'Unauthorized');
        socket.removeListener('error', alError);
        wss.handleUpgrade(req, socket, head, (ws) => alConectar(ws, d));
      };
      const d = porHash.get(h);
      if (d) return sigue(d);
      // Los tokens que no valen se recuerdan un rato: a la base, solo lo nuevo, y
      // pocas consultas a la vez (no se puede gastar el pool con tokens inventados).
      if (noValen.has(h)) return rechazar(401, 'Unauthorized');
      if (buscando >= 2) return rechazar(503, 'Service Unavailable');
      buscando += 1;
      // Por si se registró en otro proceso, o aún no se habían cargado: a la base.
      pool.query(`SELECT id, user_id FROM aim_push_dispositivos WHERE token_hash = $1`, [h])
        .then(r => {
          const x = r.rows[0];
          if (x) porHash.set(h, { id: x.id, userId: x.user_id });
          else { if (noValen.size > 5000) noValen.clear(); noValen.add(h); }
          sigue(x ? { id: x.id, userId: x.user_id } : null);
        })
        .catch(() => rechazar(503, 'Service Unavailable'))
        .finally(() => { buscando -= 1; });
    });
    // Latido: el router corta a los 55 s sin tráfico; quien no contesta, fuera.
    setInterval(() => {
      for (const ws of wss.clients) {
        if (ws.vivo === false) { ws.terminate(); continue; }
        ws.vivo = false;
        try { ws.ping(); } catch { /* cerrada */ }
      }
    }, LATIDO_MS);
    // El último contacto, en lote cada pocos minutos.
    setInterval(() => {
      const lote = [...vistoEn]; vistoEn.clear();
      if (!lote.length) return;
      pool.query(
        `UPDATE aim_push_dispositivos d SET last_seen_at = v.f FROM unnest($1::uuid[], $2::timestamptz[]) AS v(id, f) WHERE d.id = v.id`,
        [lote.map(x => x[0]), lote.map(x => x[1])]).catch(() => {});
    }, 5 * 60_000);
  }

  function alConectar(ws, d) {
    const anterior = sockets.get(d.id);
    if (anterior && anterior !== ws) { try { anterior.close(1000, 'otra conexión'); } catch { /* ya */ } }
    sockets.set(d.id, ws);
    enCurso.delete(d.id);
    ws.vivo = true;
    vistoEn.set(d.id, new Date());
    ws.on('pong', () => { ws.vivo = true; vistoEn.set(d.id, new Date()); });
    ws.on('message', (datos) => {
      ws.vivo = true; vistoEn.set(d.id, new Date());
      let m; try { m = JSON.parse(String(datos)); } catch { return; }
      if (m?.t === 'ping') { ws.send(JSON.stringify({ t: 'pong' })); return; }
      if (m?.t === 'baja') { quitar(d.id).catch(e => console.error('[avisos] baja:', e.message)); return; }
      if (m?.t === 'ack' && typeof m.clave === 'string') {
        const pend = enCurso.get(d.id) || {};
        const valor = pend[m.clave] ?? (m.marca || Number(m.n) || 1);
        delete pend[m.clave];
        marcarAvisados(d.id, { [m.clave.slice(0, 200)]: valor }).catch(e => console.error('[avisos] ack:', e.message));
      }
    });
    ws.on('close', () => { if (sockets.get(d.id) === ws) { sockets.delete(d.id); enCurso.delete(d.id); } });
    ws.on('error', () => {});
    ws.send(JSON.stringify({ t: 'hola', id: d.id }));
    // Lo que se haya perdido mientras no estaba conectado.
    ponerAlDia(d.userId, { solo: d.id }).catch(e => console.error('[avisos] puesta al día:', e.message));
  }

  // Al apagar el servidor (cada deploy y el reinicio diario): que vuelvan luego.
  function cerrarTodo() {
    for (const ws of sockets.values()) { try { ws.close(1012, 'reinicio'); } catch { /* ya */ } }
  }

  return {
    cargarTokens, enganchar, cerrarTodo, avisarFamilias, avisarTodos, purgar, registrar, quitar, quitarDeUsuario, conectado,
    apnsActivo: () => !!apns,
  };
}
