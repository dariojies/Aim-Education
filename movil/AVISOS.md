# Avisos de la app (#218)

Los avisos llegan al móvil al instante, **sin Firebase**:

- **iPhone:** el servidor los manda directamente a Apple (APNs, con la clave `.p8` de la cuenta de desarrollador).
- **Android:** la app mantiene una conexión propia y permanente (WebSocket) con el servidor. Lo hace desde un servicio en primer plano de tipo `specialUse`, con su notificación fija «Conectado», que la familia puede minimizar.

Este documento es el acuerdo entre las tres partes: servidor, app nativa y web. Si cambia algo, se cambia aquí primero.

## 1. De dónde salen los avisos

No se guarda una lista de avisos aparte. Un aviso es lo mismo que enseña la **campanita** del área de familias (`/api/me/notificaciones`), calculado en el momento:

- La lógica de ese endpoint pasa a una función `avisosFamilia(userId)`. Devuelve los avisos con `tipo`, `destino`, `texto`, `detalle`, `clave`, `n`, `marca` y `nuevo` (este último, de `conVistos`).
- El endpoint la sigue usando tal cual.
- La campanita gana avisos nuevos, que valen para la web y para la app:

| Grupo | Aviso | `clave` | `marca` |
|---|---|---|---|
| `clases` | Speaking por confirmar (sesiones de la familia aún sin responder y con plazo abierto) | `speaking:<id sesión>` | fecha de creación |
| `clases` | Cierre del centro en los próximos 10 días, solo a familias con alguna clase | `cierre:<desde>` | `desde` |
| `brickslab` | Reserva entregada en los últimos 14 días | `bk-entrega:<id reserva>` | fecha de entrega o actualización |
| `brickslab` | Votación activa en la que puede votar y aún no ha votado | `bk-votacion:<id>` | fecha de creación |

Cada aviso lleva además, para el móvil:

- **`grupo`**: `pagos`, `clases`, `soporte`, `brickslab` o `fotos`. Se deduce de `tipo`: `pagos` → pagos; `clases`, `speaking` y `cierre` → clases; `soporte` → soporte; `galeria` → fotos; `brickslab` → brickslab. Las novedades del club (`tipo: 'avisos'`) **no** van al móvil.
- **`titulo` y `cuerpo`**: `titulo` es `texto` y `cuerpo` es `detalle`.
- **`url`**: `/dashboard/<ruta>` según `destino`. `payments` → `/dashboard/pagos`, `classes` → `/dashboard/clases`, `support` → `/dashboard/soporte`, `fotos` → `/dashboard/fotos`, `brickslab` → `/dashboard/brickslab`, `overview` → `/dashboard`.

## 2. Cuándo se manda un aviso al móvil

Un aviso se manda a un dispositivo si se cumplen las tres condiciones:

- `nuevo` es `true`, es decir, no lo ha visto ya en la web o en la app.
- Su `grupo` está activo en las `preferencias` del dispositivo. Por defecto lo están todos.
- **No se le ha mandado ya a ese dispositivo.** Se compara con `avisados[clave]`:
  - Si el aviso tiene `marca`, se manda cuando `marca` es posterior a lo guardado.
  - Si no la tiene (es un contador), se manda cuando `n` es mayor que lo guardado.

Lo mandado se apunta en `avisados[clave]`, con la `marca` en ISO o con `n`. En Android se apunta cuando la app confirma que lo ha recibido (`ack`); en iOS, cuando Apple lo acepta.

**Al registrar un dispositivo, `avisados` empieza con todo lo que ya hay.** Así un móvil recién dado de alta no recibe de golpe lo antiguo.

**Cuándo se recalcula:**

- Cuando pasa algo, a través de `avisarFamilias(personaIds)`. Recibe personas (alumnos o adultos), las amplía a la familia con `familiaIds` y se queda con las cuentas que tienen dispositivo. Se ejecuta en segundo plano, agrupando 2 s, sin bloquear ni romper a quien lo llama, y siempre después del COMMIT. Se engancha en:
  - respuesta del club en un ticket;
  - publicar un álbum y etiquetar una foto en uno publicado;
  - cargos generados, sean mensuales o sueltos;
  - Speaking creado;
  - reserva de Brickslab entregada;
  - votación creada o reabierta.
- Al conectarse un Android: es la puesta al día.
- Cada 10 minutos, una pasada para todas las cuentas con dispositivo, como red de seguridad. Así salen los cierres y lo que cambie fuera de esta web.

## 3. Tabla (una sola, aprobada por el club)

```sql
CREATE TABLE IF NOT EXISTS aim_push_dispositivos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  plataforma   VARCHAR(10) NOT NULL CHECK (plataforma IN ('android','ios')),
  token_hash   VARCHAR(64) UNIQUE,      -- Android: SHA-256 del secreto del dispositivo
  apns_token   VARCHAR(200) UNIQUE,     -- iOS: el token de Apple
  fabricante   VARCHAR(60),
  modelo       VARCHAR(80),
  version_app  VARCHAR(20),
  preferencias JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {"pagos":false,…}; lo que falta = activo
  avisados     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {clave: marca ISO | n}
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_push_disp_user ON aim_push_dispositivos(user_id);
```

## 4. API (con la sesión de la web, cookie `aim_session`)

### `POST /api/me/push/dispositivo`

Body:

```json
{ "plataforma": "android" | "ios", "apnsToken"?: "...", "fabricante"?: "...", "modelo"?: "...", "version"?: "1.0" }
```

- **Android:** crea el dispositivo con un secreto nuevo de 32 bytes, que se guarda solo como hash. Responde `{ id, token }`; el token se devuelve **solo esta vez**.
- **iOS:** hace upsert por `apns_token`. Si ese token estaba en otra cuenta, pasa a esta. Responde `{ id }`.
- **Siempre:** inicializa `avisados` con lo que ya hay. Como mucho 10 dispositivos por cuenta: se borran los más antiguos.

### `DELETE /api/me/push/dispositivo/:id`

Borra el dispositivo, si es suyo, y cierra su conexión.

### `GET /api/me/push/dispositivo/:id`

Devuelve:

```json
{ "id", "plataforma", "preferencias", "conectado": bool, "lastSeenAt" }
```

### `PUT /api/me/push/dispositivo/:id/preferencias`

Body `{ pagos?, clases?, soporte?, brickslab?, fotos? }`, todos booleanos.

### Al cambiar la contraseña

`cerrarSesionesDe(userId)` también borra sus dispositivos y cierra sus conexiones.

## 5. Conexión de Android: `wss://www.aimeducation.es/ws/avisos`

**Conexión**

- Cabecera `Authorization: Bearer <token>`. Nunca en la URL.
- Sin token válido, se rechaza al conectar con 401.
- Si el navegador manda una cabecera `Origin`, se rechaza. La app nativa no la manda.

**Servidor → app**

| Mensaje | Qué es |
|---|---|
| `{"t":"hola","id":"<dispositivo>"}` | Al conectar. Después, la puesta al día. |
| `{"t":"aviso","clave":"…","marca":"…"/n,"grupo":"clases","titulo":"…","cuerpo":"…","url":"/dashboard/clases"}` | Un aviso. |
| `{"t":"fuera"}` y cierre 1008 | El dispositivo ya no vale. La app deja de reintentar y pide entrar otra vez. |

**App → servidor**

| Mensaje | Qué hace el servidor |
|---|---|
| `{"t":"ack","clave":"…","marca":…}` | Apunta en `avisados`. |
| `{"t":"ping"}` | Contesta `{"t":"pong"}`. Sirve para que la app compruebe la conexión al volver a primer plano. |

**Latido**

- El servidor manda un ping de WebSocket cada 40 s. Si no vuelve el pong, cierra con `terminate()`.
- El router de Heroku corta a los 55 s sin tráfico.

**Al apagar el servidor** (SIGTERM, que llega en cada deploy o reinicio diario): cierra todas las conexiones con el código 1012. La app espera entre 2 y 15 s al azar y vuelve a conectar.

**Reconexión de la app**

- Backoff con «full jitter»: `random(0, min(60 s, 1 s · 2^n))`, y vuelve a `n = 0` tras 60 s conectada.
- Reconecta también al cambiar la red.
- Lleva un vigilante con alarma inexacta (`setAndAllowWhileIdle`, unos 10 min): si en 90 s no ha llegado nada, reconecta.

**`last_seen_at`** se guarda en memoria y se escribe en la base de datos cada pocos minutos, en lote.

## 6. App de Android

Plugin de Capacitor propio, **`AimAvisos`**. Se usa desde la web con `window.Capacitor.Plugins.AimAvisos`. La web no lleva `@capacitor/core`: el puente nativo pone cada plugin en `window.Capacitor.Plugins`, y su `addListener` devuelve `{ remove }`.

| Método | Qué hace |
|---|---|
| `activar({ token, id })` | Guarda el token y el id y arranca el servicio. Pide antes `POST_NOTIFICATIONS` (Android 13+); si se niega, `{ activo: false, motivo: 'permiso' }`. |
| `desactivar()` | Para el servicio y borra el token. |
| `estado()` | `{ activo, conectado, ultimoContacto (ms), permiso: 'granted'\|'denied'\|'prompt', bateriaSinRestriccion: bool, fabricante, id }` |
| `abrirAjustesBateria()` | Abre los ajustes de batería de la app (sin el permiso restringido). |
| `abrirAjustesApp()` | Abre la ficha de la app en Ajustes. |
| `abrirAjustesAvisos()` | Abre los ajustes de notificaciones de la app. |

Evento `estado`: se emite cuando cambia la conexión.

**Canales de notificación**

| Canal | Nombre | Importancia | Notas |
|---|---|---|---|
| `conexion` | «Conexión con AIM» | LOW | Silenciosa; la notificación fija «Conectado» con el botón «Desactivar». |
| `pagos` | Pagos | DEFAULT | Visibilidad PRIVATE. |
| `clases` | Clases y cierres | HIGH | |
| `soporte` | Soporte | DEFAULT | |
| `brickslab` | Brickslab | DEFAULT | |
| `fotos` | Fotos | DEFAULT | |

**Notificaciones**

- Cada aviso se pinta con el tag igual a la `clave`, así que no sale repetido.
- Al tocarlo se abre `MainActivity` con el extra `url`, y la WebView va a `https://www.aimeducation.es<url>`.

**Arranque**

- El servicio arranca al activarlo, cada vez que se abre la app, al encender el móvil (`BOOT_COMPLETED`) y al actualizar la app (`MY_PACKAGE_REPLACED`).
- Si el sistema no deja arrancarlo, publica un aviso normal: «Avisos en pausa: toca para reactivar».
- Se respeta que el usuario lo pare: si `ApplicationExitInfo` dice `REASON_USER_REQUESTED`, no se vuelve a encender solo.

**Lo que la app no usa**

- Ningún wake lock permanente: solo uno de 10 s como mucho al recibir un aviso.
- No pide `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `SCHEDULE_EXACT_ALARM`, `dataSync` ni `remoteMessaging`.

## 7. iPhone

- Plugin `PushNotifications` de Capacitor: `requestPermissions()`, después `register()`, el evento `registration` da el token y la web llama a `POST /api/me/push/dispositivo {plataforma:'ios', apnsToken}`.
- Al tocar un aviso, el evento `pushNotificationActionPerformed` trae `notification.data.url` y la web va ahí.
- El servidor manda con HTTP/2 a `api.push.apple.com`, o a `api.sandbox.push.apple.com` si `APNS_ENTORNO=sandbox`. Firma con un JWT ES256 que se renueva cada 50 minutos.
- Variables de Heroku:

| Variable | Valor |
|---|---|
| `APNS_KEY` | Contenido del `.p8`, con saltos `\n` |
| `APNS_KEY_ID` | Id de la clave |
| `APNS_TEAM_ID` | Id del equipo de Apple |
| `APNS_TOPIC` | `es.aimeducation.app` |

  Sin ellas, iOS no manda nada y no falla.
- Payload:

```json
{ "aps": { "alert": { "title", "body" }, "sound": "default", "thread-id": grupo }, "url", "clave" }
```

- Si Apple contesta 410 o `BadDeviceToken`, se borra el dispositivo.
