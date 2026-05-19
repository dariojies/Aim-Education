# AIM Education

**Página web principal de AIM Education y centro del ecosistema AIM.**

Plataforma integral para la gestión y comunicación del club AIM Education (Algeciras). Combina una web pública de cara al exterior con un panel de administración interno para instructores y responsables del club. Tanto la aplicación como la base de datos están alojadas en **Heroku**.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend público | HTML + CSS + Vanilla JS (Vite) |
| Panel de administración | React 19 + TypeScript |
| Backend | Express.js (Node.js 22, ES Modules) |
| Base de datos | PostgreSQL (Heroku Postgres add-on) |
| Build | Vite 5 |
| IA | Google Gemini — solo servidor, clave nunca expuesta al cliente |
| Estilos admin | Tailwind CSS |
| Despliegue | Heroku (app + DB) |

---

## Estructura del proyecto

```
aim-education/
├── admin/                        # Panel de administración (React SPA)
│   ├── components/               # Vistas del dashboard
│   │   ├── Auth.tsx              # Login
│   │   ├── DashboardView.tsx     # Resumen y accesos rápidos
│   │   ├── StudentsView.tsx      # Gestión de alumnos y grupos
│   │   ├── GamesView.tsx         # Biblioteca de ejercicios (+ IA)
│   │   ├── SessionsView.tsx      # Planificación de sesiones
│   │   ├── AICoachView.tsx       # Chat con Gemini
│   │   ├── NewsView.tsx          # Foro / noticias (CRUD + estadísticas)
│   │   ├── ReceiptsView.tsx      # Recibos y facturas
│   │   ├── WalletView.tsx        # Sistema de referidos
│   │   ├── AccessManagementView.tsx  # Gestión de accesos (superadmin)
│   │   └── SettingsView.tsx      # Configuración del club
│   ├── services/
│   │   ├── storage.ts            # Acceso a datos (API + localStorage)
│   │   └── geminiService.ts      # Cliente IA (llama al servidor)
│   ├── App.tsx                   # Shell principal y navegación
│   ├── types.ts                  # Tipos TypeScript
│   ├── LanguageContext.tsx       # i18n ES/EN
│   └── index.html                # Entrada SPA admin
├── src/                          # Web pública (landing page)
│   ├── main.js                   # Lógica JS (sesión, noticias dinámicas)
│   └── style.css                 # Estilos de la landing
├── server.js                     # Servidor Express (API + SSR noticias)
├── index.html                    # Entrada landing page
├── vite.config.ts
├── tsconfig.json
├── Procfile                      # web: node server.js
└── .env                          # Variables de entorno locales (no en git)
```

---

## Funcionalidades

### Web pública (`/`)
- Presentación del club y actividades (Taekwondo, Ballet, Inglés, Robótica)
- Sección de noticias cargada dinámicamente desde la base de datos
- Detección de sesión activa para mostrar acceso al panel de admin
- Enlace al feed RSS en la navegación y el footer

### Noticias / Foro público (`/noticias`, `/noticias/:slug`)
- Listado de entradas publicadas con filtro por categoría
- Página individual de cada noticia con contenido formateado (markdown básico)
- Seguimiento de visitas y clicks
- Feed RSS estándar en `/feed.xml` (compatible con Feedly, Inoreader, etc.)

### Panel de administración (`/admin`)
Accesible solo para usuarios con rol `instructor`, `club_owner` o `superadmin`.

| Sección | Descripción |
|---|---|
| Dashboard | Estadísticas generales y accesos rápidos |
| Alumnos | CRUD de alumnos, grupos y registro de asistencia |
| Noticias / Foro | Crear y publicar entradas, estadísticas de visitas |
| Recibos | Gestión de facturas (CRUD sincronizado con BD) |
| Wallet | Sistema de comisiones por referidos |
| Juegos / Ejercicios | Biblioteca de drills + generación con IA |
| Sesiones | Planificación de sesiones de entrenamiento |
| AI Coach | Chat con Gemini para consultas estratégicas |
| Gestión de Accesos | Control de roles de usuario (solo superadmin) |

---

## Base de datos

Tablas gestionadas por la aplicación:

| Tabla | Descripción |
|---|---|
| `users` | Usuarios del sistema (instructores, propietarios, superadmins) |
| `Aim_education_recibos` | Recibos y facturas del club |
| `aim_education_posts` | Entradas del foro/noticias |
| `aim_education_post_views` | Histórico de visitas por entrada (estadísticas) |

> Las tablas `aim_education_posts` y `aim_education_post_views` **se crean automáticamente** al iniciar el servidor si no existen.

---

## Configuración local

Crea un archivo `.env` en la raíz del proyecto (nunca se sube al repositorio):

```env
# Base de datos (desarrollo local)
DB_HOST=<host>
DB_PORT=5432
DB_USER=<usuario>
DB_PASSWORD=<contraseña>
DB_NAME=<nombre-bd>

# Google Gemini
GEMINI_API_KEY=<clave-api>

# Sesiones — genera con: node -e "require('crypto').randomBytes(32).toString('hex')"
SESSION_SECRET=<hex-64-chars>
```

> En producción (Heroku), el add-on Postgres añade `DATABASE_URL` automáticamente. El servidor lo detecta y lo usa con prioridad sobre las variables individuales.

---

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Iniciar en modo desarrollo
npm run dev
```

Arranca en `http://localhost:3000`. Vite corre como middleware dentro de Express — no hay que levantar dos procesos.

## Build de producción

```bash
npm run build   # Compila el frontend a dist/
npm start       # Arranca el servidor de producción
```

---

## Despliegue en Heroku

### Primera vez

```bash
# 1. Crear la app (si no existe)
heroku create nombre-de-la-app

# 2. Añadir el add-on de PostgreSQL
heroku addons:create heroku-postgresql:essential-0

# 3. Configurar variables de entorno
heroku config:set GEMINI_API_KEY=<clave>
heroku config:set SESSION_SECRET=<hex-64-chars>
heroku config:set NODE_ENV=production

# 4. Desplegar
git push heroku main
```

> `DATABASE_URL` la gestiona Heroku automáticamente al añadir el add-on. No es necesario configurarla manualmente.

### Despliegues sucesivos

```bash
git push heroku main
```

Heroku ejecuta automáticamente `npm run build` (Vite) y luego `node server.js` vía el `Procfile`.

### Variables de entorno en Heroku

| Variable | Origen | Descripción |
|---|---|---|
| `DATABASE_URL` | Heroku (automática) | Cadena de conexión a Postgres |
| `GEMINI_API_KEY` | Manual | Clave de la API de Google Gemini |
| `SESSION_SECRET` | Manual | Secreto para firmar sesiones |
| `NODE_ENV` | Manual → `production` | Activa modo producción |
| `PORT` | Heroku (automática) | Puerto asignado por Heroku |

---

## Seguridad

- Sesiones con cookie `HttpOnly; Secure; SameSite=Strict` — inaccesible desde JavaScript
- Roles y permisos nunca almacenados en `localStorage`; validados siempre en servidor via `/api/me`
- Rate limiting en login: **5 intentos/minuto por IP**; bloqueo de **15 minutos** tras 15 fallos en 30 minutos
- Contraseñas hasheadas con bcrypt
- Clave de Gemini nunca expuesta al cliente — todas las llamadas a la IA pasan por el servidor
- Todas las rutas `/api/*` (excepto login y noticias públicas) requieren sesión válida

---

## Roles de usuario

| Rol | Acceso |
|---|---|
| `instructor` | Panel de administración completo |
| `club_owner` | Panel de administración completo |
| `superadmin` | Panel completo + gestión de accesos de otros usuarios |
