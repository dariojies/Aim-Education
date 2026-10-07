# Publicar la app de AIM Education en Google Play y App Store

Esta guía sirve para dos cosas: dar de alta las cuentas de desarrollador del club y subir la app.
Lo técnico (compilar, firmar, subir versiones) lo hace el equipo de IT. La primera parte la tiene que hacer alguien del club con poder para firmar en nombre de la empresa.

---

## 0. Antes de empezar: el número D-U-N-S (gratis)

Google y Apple piden que la cuenta sea de **organización** y no personal:

- **Google:** las cuentas personales nuevas tienen que pasar antes 14 días de pruebas cerradas con 12 personas.
- **Apple:** con una cuenta de organización, en la tienda sale el nombre del club y no el de una persona.

Para las dos hace falta el **número D-U-N-S** de la empresa, un identificador internacional gratuito.

1. Buscadlo o pedidlo en <https://developer.apple.com/enroll/duns-lookup/>. Necesitaréis la razón social exacta, el CIF, la dirección y un teléfono.
2. Si no lo tenéis, se pide en esa misma página. Suele tardar entre unos días y dos semanas.
3. El nombre y la dirección tienen que coincidir **exactamente** con los del D-U-N-S en Google y en Apple.

Tened también a mano:

- una web propia: `https://www.aimeducation.es`;
- un correo del club que no sea personal, por ejemplo `apps@aimeducation.es` o el de info;
- el DNI de quien lo da de alta;
- una tarjeta para pagar.

---

## 1. Cuenta de Google Play (Android)

Cuesta **25 $, una sola vez**.

1. Entrad en <https://play.google.com/console/signup> con una cuenta de Google del club. No uséis una personal: quien la tenga será el dueño.
2. Elegid **«Una organización o empresa»**.
3. Rellenad los datos de la empresa con el D-U-N-S, el contacto del desarrollador (correo y teléfono públicos de la ficha) y la web.
4. Pagad los 25 $ y completad la **verificación de identidad**. Piden el DNI de quien la da de alta y documentación de la empresa, y tarda unos días.
5. Cuando esté verificada, invitad al equipo de IT: **Usuarios y permisos → Invitar a nuevos usuarios**, con el correo de quien vaya a subir la app y permiso de **Administrador** para esta app.

## 2. Cuenta de Apple Developer (iPhone)

Cuesta **99 € al año**.

1. Instalad la app **Apple Developer** en un iPhone o iPad, o entrad en <https://developer.apple.com/programs/enroll/>, con un **Apple ID del club**. Si no lo hay, cread uno nuevo con el correo del club y activad la verificación en dos pasos.
2. Elegid **«Organización»** e indicad el D-U-N-S, la razón social y la web. La persona que lo da de alta tiene que poder firmar en nombre de la empresa: Apple puede llamar para comprobarlo.
3. Pagad la cuota. La aprobación tarda entre unos días y dos semanas.
4. Cuando esté activa, invitad al equipo de IT en **App Store Connect → Usuarios y acceso**, con el rol de **Administrador** o **App Manager**.

### 2.1 La clave de los avisos del iPhone

Esto se hace una sola vez, con la cuenta ya activa.

1. Id a <https://developer.apple.com/account/resources/authkeys/list> y pulsad el **+**.
2. Ponedle de nombre «Avisos AIM» y marcad **Apple Push Notifications service (APNs)**. Pulsad **Continue** y luego **Register**.
3. **Descargad el archivo `.p8`.** Solo se puede descargar una vez: guardadlo en un sitio seguro.
4. Apuntad el **Key ID**, que sale junto a la clave, y el **Team ID**, que está en «Membership details».
5. Pasad el archivo `.p8`, el Key ID y el Team ID al equipo de IT **por un canal privado**, nunca por el chat de tickets. Se ponen como variables en Heroku:

   | Variable | Valor |
   |---|---|
   | `APNS_KEY` | el contenido del `.p8` |
   | `APNS_KEY_ID` | el Key ID |
   | `APNS_TEAM_ID` | el Team ID |
   | `APNS_TOPIC` | `es.aimeducation.app` |

---

## 3. Lo que tiene que estar listo antes de subirla

| Qué | Dónde está |
|---|---|
| Política de privacidad | <https://www.aimeducation.es/legal/privacidad>. Ya tiene el apartado 10, sobre la app. |
| Enlace para pedir el borrado de la cuenta (Google lo exige) | <https://www.aimeducation.es/legal/eliminar-cuenta>. Ya está hecho. |
| «Eliminar mi cuenta» dentro de la app (Apple y Google lo exigen) | En Perfil: crea la solicitud a secretaría y bloquea la entrada. Ya está hecho. |
| Cuenta de prueba para los revisores | Una «Familia Demo» fija, sin datos reales. IT la crea justo antes de subirla. **Antes de cada envío a revisión, comprobad que no tiene una solicitud de eliminación pedida** (si el revisor la prueba, la cuenta queda bloqueada): se anula desde su ticket en Soporte. |
| Icono, capturas y textos de la ficha | IT prepara el icono y las capturas. El club revisa los textos. |
| Vídeo del servicio de avisos (Google) | Un vídeo corto, sin publicar en YouTube, que enseña cómo llegan los avisos. Lo graba IT. |

### Textos de la ficha (propuesta)

- **Nombre:** AIM Education
- **Descripción corta** (máximo 80 caracteres): «Clases, pagos, avisos y fotos de tu familia en AIM Education.»
- **Descripción larga:** «La app de las familias de AIM Education (Algeciras). Consulta el horario y la asistencia de tus hijos, paga los recibos con tarjeta o Bizum y descarga las facturas. Recibe al momento los avisos de cierres, Speaking, respuestas de secretaría y fotos nuevas. Reserva sets de LEGO y libros de Brickslab y la Biblioteca. Para entrar necesitas tu cuenta del club; si aún no la tienes, puedes crearla desde la app.»
- **Categoría:** Educación.
- **Público objetivo:** mayores de 18 años. La usan madres, padres y tutores, no los niños.

---

## 4. Subir la app (lo hace IT)

### Android

1. Se crea la clave de subida (*upload key*) con `keytool`. Se guarda fuera del repositorio y con copia de seguridad: sin ella no se pueden publicar actualizaciones.
2. Se crea el archivo `~/.aim-education/firma.properties`, o el que diga la variable `AIM_FIRMA`, con estas cuatro líneas: `storeFile`, `storePassword`, `keyAlias` y `keyPassword`. `build.gradle` lo lee si existe; el archivo nunca va al repositorio.
3. Se compila con `npm run aab` en `movil/` (en Mac o Linux, `npm run aab:mac`). Sale firmado con esa clave.
4. En Play Console:
   1. **Crear app**: nombre «AIM Education», idioma español, App, Gratis.
   2. **Panel → Configurar tu app.** Hay que completar todo:
      - **Acceso a la app:** usuario y contraseña de la Familia Demo.
      - **Anuncios:** No.
      - **Clasificación de contenido:** el cuestionario de la IARC.
      - **Público objetivo:** 18 años o más.
      - **Seguridad de los datos:** nombre, correo, teléfono, pagos (los procesa Redsys), fotos, identificadores del dispositivo, datos cifrados en tránsito, y que se puede pedir el borrado. Enlace de borrado: `https://www.aimeducation.es/legal/eliminar-cuenta`.
      - **Permisos de servicio en primer plano:** tipo `specialUse`, con la descripción de AVISOS.md y el vídeo.
      - **Política de privacidad:** su URL.
   3. **Ficha de Play Store:**
      - icono de 512×512;
      - gráfico destacado de 1024×500;
      - entre 2 y 8 capturas de móvil;
      - los textos de arriba.
   4. **Prueba interna:** se sube el `.aab` y se instala en dos o tres móviles del club (uno Xiaomi o Samsung si es posible) para probar los avisos.
   5. **Producción:** se envía a revisión. La primera vez puede tardar varios días, y es probable que pregunten por el servicio en primer plano. La respuesta es que **el club no usa servicios de avisos de terceros, para que los datos de las familias y los menores no pasen por ellos**.

### iPhone

Para compilar una app de iPhone hace falta un **Mac con Xcode** o un servicio en la nube que preste uno; Codemagic, por ejemplo, tiene plan gratuito. Hay dos maneras:

- **Con un Mac** (aunque sea prestado una tarde):
  1. `npm install` y `npx cap sync ios` en `movil/`.
  2. Abrir `ios/App/App.xcodeproj`.
  3. En *Signing & Capabilities*, elegir el equipo del club y comprobar que está **Push Notifications**.
  4. *Product → Archive → Distribute App → App Store Connect*.
- **Con Codemagic (sin Mac):** se conecta el repositorio y se le da una clave de la API de App Store Connect. Compila y sube a TestFlight solo.

Después, en App Store Connect:

1. **Mis apps → +** → bundle ID `es.aimeducation.app`, nombre «AIM Education», idioma español.
2. **Privacidad de la app:** los mismos datos que en Google.
3. **Capturas de iPhone de 6,9"** (la app es solo para iPhone, así que no hacen falta de iPad).
4. **Información para la revisión:** usuario y contraseña de la Familia Demo, y una nota: «Los pagos son de clases presenciales y préstamo físico de material (servicios del mundo real), por eso se pagan fuera de la App Store».
5. **TestFlight** para probar en los iPhone del club y, después, **Enviar a revisión**.

---

## 5. Después de publicarla

- **Cambios en la web:** se ven en la app sin publicar nada, porque la app abre la web.
- **Nueva versión de la app:** solo hace falta para cambios en la parte nativa (avisos, icono, permisos). Se sube igual: nueva versión, `versionCode` + 1 en Android y número de compilación + 1 en iOS.
- **Revisar la política de Google Play** antes del 27 de enero de 2027, que hay cambios anunciados.
