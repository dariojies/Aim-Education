import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';
import nodemailer from 'nodemailer';
import { calcularRecibo, mesAGenerar } from './billing.js';
import { crearRouterTulClases } from './tul-clases.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// --- Database ---

const { Pool } = pg;

// Una columna DATE es una fecha de calendario, no un instante. Por defecto
// node-postgres la convierte a Date a medianoche LOCAL, y al serializarla a
// JSON (UTC) se desplaza un día: un cargo de '2026-09-01' llegaba al front como
// '2026-08-31T22:00Z' y se mostraba como agosto. La devolvemos tal cual.
pg.types.setTypeParser(1082, v => v); // 1082 = DATE

// Heroku Postgres provee DATABASE_URL automáticamente.
// En local se usan las variables individuales del .env.
const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
    : new Pool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false }
    });

pool.on('error', (err) => {
    console.error('Error inesperado en el pool de Postgres:', err);
});

const dbLabel = process.env.DATABASE_URL ? 'DATABASE_URL (Heroku)' : `${process.env.DB_HOST}:${process.env.DB_PORT || 5432}`;
console.log(`Conectando a la base de datos: ${dbLabel}...`);

async function initDb() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_education_posts (
                id TEXT PRIMARY KEY,
                title VARCHAR(500) NOT NULL,
                slug VARCHAR(500) UNIQUE NOT NULL,
                excerpt TEXT,
                content TEXT NOT NULL,
                cover_image_url TEXT,
                author_name VARCHAR(200),
                category VARCHAR(100) DEFAULT 'general',
                status VARCHAR(20) DEFAULT 'draft',
                view_count INTEGER DEFAULT 0,
                click_count INTEGER DEFAULT 0,
                published_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_education_post_views (
                id SERIAL PRIMARY KEY,
                post_id TEXT REFERENCES aim_education_posts(id) ON DELETE CASCADE,
                event_type VARCHAR(20) DEFAULT 'view',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_post_views_post_id ON aim_education_post_views(post_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_post_views_created_at ON aim_education_post_views(created_at)`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_education_groups (
                id TEXT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                activity VARCHAR(100) NOT NULL,
                student_ids TEXT
            )
        `);
        // ── REGISTRO DE FACTURACIÓN (Verifactu) ──
        // Cada factura emitida deja aquí un registro que no se modifica ni se borra
        // jamás, encadenado con la huella del registro anterior. Si alguien tocara
        // una fila la cadena dejaría de cuadrar y se notaría.
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_factura_registro (
                id SERIAL PRIMARY KEY,
                recibo_id INTEGER NOT NULL REFERENCES aim_recibos(id),
                tipo_factura VARCHAR(4) NOT NULL,
                serie VARCHAR(5) NOT NULL,
                numero INTEGER NOT NULL,
                fecha_expedicion DATE NOT NULL,
                nif_emisor VARCHAR(20) NOT NULL,
                nombre_emisor VARCHAR(255) NOT NULL,
                nif_receptor VARCHAR(20),
                nombre_receptor VARCHAR(255),
                descripcion TEXT,
                base NUMERIC(12,2) NOT NULL,
                cuota NUMERIC(12,2) NOT NULL,
                total NUMERIC(12,2) NOT NULL,
                rectifica_serie VARCHAR(5),
                rectifica_numero INTEGER,
                rectifica_fecha DATE,
                huella_anterior CHAR(64),
                huella CHAR(64) NOT NULL,
                software_nombre VARCHAR(100),
                software_version VARCHAR(20),
                emitido_por UUID,
                emitido_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                estado_envio VARCHAR(20) NOT NULL DEFAULT 'pendiente',
                aeat_respuesta TEXT,
                UNIQUE (serie, numero)
            )
        `);
        // Registro de eventos: qué se ha hecho y cuándo, también solo de añadir.
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_factura_eventos (
                id SERIAL PRIMARY KEY,
                tipo VARCHAR(40) NOT NULL,
                registro_id INTEGER REFERENCES aim_factura_registro(id),
                recibo_id INTEGER,
                detalle TEXT,
                usuario_id UUID,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        // ── SOPORTE ──
        // Fechas de seguimiento: cuándo se tocó por última vez y cuándo se resolvió.
        for (const col of ['updated_at TIMESTAMPTZ', 'resolved_at TIMESTAMPTZ',
            'adjunto TEXT', 'adjunto_nombre VARCHAR(255)', 'adjunto_mime VARCHAR(100)']) {
            await client.query(`ALTER TABLE tickets_registrosoporte ADD COLUMN IF NOT EXISTS ${col}`);
        }
        // Hilos de conversación del ticket. Hay dos canales separados: 'equipo' (entre
        // desarrolladores, no lo ve quien abrió el ticket) y 'creador' (con quien lo abrió).
        await client.query(`
            CREATE TABLE IF NOT EXISTS tickets_mensajes (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER NOT NULL REFERENCES tickets_registrosoporte(id) ON DELETE CASCADE,
                canal VARCHAR(10) NOT NULL DEFAULT 'equipo',
                autor_id UUID,
                cuerpo TEXT,
                archivo TEXT,
                archivo_nombre VARCHAR(255),
                archivo_mime VARCHAR(100),
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_mensajes_ticket ON tickets_mensajes(ticket_id, id)`);
        // Las respuestas del campo antiguo dev_response pasan a ser el primer mensaje
        // del hilo con el creador. Una sola vez: si el ticket ya tiene mensajes, no se toca.
        await client.query(`
            INSERT INTO tickets_mensajes (ticket_id, canal, autor_id, cuerpo, created_at)
            SELECT t.id, 'creador', t.assigned_to, t.dev_response, COALESCE(t.updated_at, t.created_at)
            FROM tickets_registrosoporte t
            WHERE t.dev_response IS NOT NULL AND TRIM(t.dev_response) <> ''
              AND NOT EXISTS (SELECT 1 FROM tickets_mensajes m WHERE m.ticket_id = t.id)
        `);

        // GASTOS del club. La tabla se llamaba 'aim_education_recibos', pero
        // nunca fueron recibos: siempre han sido gastos (proveedor + su factura).
        // El nombre viejo se confundía con los recibos de cobro a las familias.
        const tablaGastos = await client.query(`SELECT to_regclass('aim_education_recibos') AS vieja, to_regclass('aim_gastos') AS nueva`);
        if (tablaGastos.rows[0].vieja && !tablaGastos.rows[0].nueva) {
            await client.query(`ALTER TABLE aim_education_recibos RENAME TO aim_gastos`);
        }
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_gastos (
                id TEXT PRIMARY KEY,
                date DATE,
                amount NUMERIC(10, 2),
                payment_method VARCHAR(100),
                company VARCHAR(255),
                invoice_link TEXT
            )
        `);
        // Campos del gasto (algunos ya existían en la tabla pero sin usarse).
        for (const col of [
            'cif VARCHAR(50)',
            'invoice_number VARCHAR(100)',
            'concept TEXT',
            'expense_type VARCHAR(20) DEFAULT \'comun\'',   // 'comun' | 'especifico'
            'actividad VARCHAR(255)',                        // solo si es específico
            'is_paid BOOLEAN DEFAULT false',
            'comprobado_banco BOOLEAN DEFAULT false',
            'factura_archivo TEXT',                          // contenido en base64
            'factura_nombre VARCHAR(255)',
            'factura_mime VARCHAR(100)',
            'created_at TIMESTAMPTZ DEFAULT NOW()',
        ]) {
            await client.query(`ALTER TABLE aim_gastos ADD COLUMN IF NOT EXISTS ${col}`);
        }
        // Registro de proveedores, para no reescribir nombre y CIF cada vez.
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_proveedores (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                cif VARCHAR(50),
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_aim_proveedores_nombre ON aim_proveedores (LOWER(nombre))`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_education_activities (
                id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                color VARCHAR(50) NOT NULL,
                class_name VARCHAR(100)
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_education_aulas (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_education_instructores (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                email VARCHAR(255),
                phone VARCHAR(50),
                specialty VARCHAR(255)
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_education_clases (
                id VARCHAR(100) PRIMARY KEY,
                d INTEGER NOT NULL,
                s NUMERIC(4,2) NOT NULL,
                h NUMERIC(4,2) NOT NULL,
                act VARCHAR(100) NOT NULL,
                title VARCHAR(255) NOT NULL,
                room VARCHAR(255) NOT NULL,
                students VARCHAR(50) NOT NULL DEFAULT '0/15',
                monitor VARCHAR(255) NOT NULL
            )
        `);

        // Seeding de datos por defecto
        const actCount = await client.query('SELECT COUNT(*) FROM aim_education_activities');
        if (parseInt(actCount.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO aim_education_activities (id, name, color, class_name) VALUES
                ('taekwondo', 'Taekwondo', '#21B668', 'act-taekwondo'),
                ('ballet', 'Ballet Clásico', '#FF99D3', 'act-ballet'),
                ('baile', 'Baile Urbano', '#AF99FF', 'act-baile'),
                ('ingles', 'Inglés', '#00BBF4', 'act-ingles'),
                ('robotica', 'Robótica', '#FFD526', 'act-robotica'),
                ('camaleon', 'Programa Camaleón', '#25D8BA', 'act-camaleon'),
                ('funcional', 'Entrenamiento Funcional', '#FF4F15', 'act-funcional'),
                ('pilates', 'Pilates', '#BFD300', 'act-pilates'),
                ('pintura', 'Pintura', '#5233A8', 'act-pintura')
            `);
        }
        const aulaCount = await client.query('SELECT COUNT(*) FROM aim_education_aulas');
        if (parseInt(aulaCount.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO aim_education_aulas (name) VALUES
                ('Sala 1'), ('Sala 2'), ('Sala 3'), ('Sala 4'), ('Sala 5'), ('Sala 6'),
                ('Tatami'), ('Lab'), ('Taller'), ('Sala fit'), ('Aula 1'), ('Aula 2'), ('Aula 3')
            `);
        }
        const instCount = await client.query('SELECT COUNT(*) FROM aim_education_instructores');
        if (parseInt(instCount.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO aim_education_instructores (name) VALUES
                ('Darío Francisco'), ('Elena García'), ('James Smith'), ('Mateo Ortiz'), ('Sara Moreno'), ('Carlos Ruiz')
            `);
        }
        const claseCount = await client.query('SELECT COUNT(*) FROM aim_education_clases');
        if (parseInt(claseCount.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO aim_education_clases (id, d, s, h, act, title, room, students, monitor) VALUES
                ('c1', 0, 17, 1, 'taekwondo', 'Taekwondo · Blancos', 'Tatami', '12/16', 'Darío Francisco'),
                ('c2', 0, 18, 1, 'taekwondo', 'Taekwondo · Color', 'Tatami', '14/16', 'Darío Francisco'),
                ('c3', 0, 19, 1.5, 'taekwondo', 'Taekwondo · Adultos', 'Tatami', '8/12', 'Darío Francisco'),
                ('c4', 0, 16, 2, 'ballet', 'Ballet · Primary', 'Sala 1', '12/15', 'Elena García'),
                ('c5', 1, 17, 1, 'ingles', 'Inglés · Movers', 'Aula 3', '9/12', 'James Smith'),
                ('c6', 1, 18, 1.5, 'ingles', 'Inglés · B2 First', 'Aula 1', '7/10', 'James Smith'),
                ('c7', 1, 17, 2.5, 'ballet', 'Ballet · Grades 1-3', 'Sala 1', '11/15', 'Elena García'),
                ('c8', 2, 16, 2, 'ballet', 'Ballet · Pre-primary', 'Sala 2', '10/12', 'Elena García'),
                ('c9', 2, 17, 1.5, 'robotica', 'Robótica · Builders', 'Lab', '8/10', 'Mateo Ortiz'),
                ('c10', 3, 16, 1, 'ingles', 'Inglés · Starters', 'Aula 2', '10/12', 'James Smith'),
                ('c11', 3, 18, 1.5, 'ingles', 'Inglés · B2 First', 'Aula 1', '7/10', 'James Smith'),
                ('c12', 3, 17, 2.5, 'ballet', 'Ballet · Grades 1-3', 'Sala 1', '11/15', 'Elena García'),
                ('c13', 3, 17, 1.5, 'pintura', 'Pintura · Estudio joven', 'Taller', '6/10', 'Sara Moreno'),
                ('c14', 4, 17, 1, 'taekwondo', 'Taekwondo · Blancos', 'Tatami', '12/16', 'Darío Francisco'),
                ('c15', 4, 18, 2, 'ballet', 'Ballet · Vocational', 'Sala 1', '9/12', 'Elena García'),
                ('c16', 4, 19, 1, 'funcional', 'Funcional · Tarde', 'Sala fit', '11/14', 'Carlos Ruiz'),
                ('c17', 5, 10, 2, 'taekwondo', 'Taekwondo · Competición', 'Tatami', '8/10', 'Darío Francisco'),
                ('c18', 5, 11, 1.5, 'kickboxing', 'Kick Boxing · Sparring', 'Tatami', '9/12', 'Darío Francisco')
            `);
        }

        // Support tickets
        await client.query(`
            CREATE TABLE IF NOT EXISTS tickets_registrosoporte (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                subject VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'open',
                priority VARCHAR(20) DEFAULT 'low',
                due_date TIMESTAMP,
                assigned_to UUID REFERENCES users(user_id) ON DELETE SET NULL,
                app_label TEXT[] DEFAULT ARRAY['Aim Education'],
                dev_response TEXT,
                email_sent BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`ALTER TABLE tickets_registrosoporte ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'low'`);
        await client.query(`ALTER TABLE tickets_registrosoporte ADD COLUMN IF NOT EXISTS due_date TIMESTAMP`);
        await client.query(`ALTER TABLE tickets_registrosoporte ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(user_id) ON DELETE SET NULL`);
        await client.query(`ALTER TABLE tickets_registrosoporte ADD COLUMN IF NOT EXISTS app_label TEXT[] DEFAULT ARRAY['Aim Education']`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS dev_role VARCHAR(50) DEFAULT 'student'`);

        // Eventos y talleres del club (propio de aim-education).
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_eventos (
                id TEXT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                event_date DATE NOT NULL,
                end_date DATE,
                time VARCHAR(100),
                venue VARCHAR(255),
                activity VARCHAR(100) DEFAULT 'taekwondo',
                poster_url TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_aim_eventos_date ON aim_eventos(event_date)`);
        await client.query(`ALTER TABLE aim_eventos ADD COLUMN IF NOT EXISTS end_time VARCHAR(100)`);
        await client.query(`ALTER TABLE aim_eventos ADD COLUMN IF NOT EXISTS price VARCHAR(100)`);

        // Inscripciones a eventos.
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_event_registrations (
                id SERIAL PRIMARY KEY,
                event_id TEXT NOT NULL REFERENCES aim_eventos(id) ON DELETE CASCADE,
                nombre VARCHAR(200) NOT NULL,
                apellidos VARCHAR(200) NOT NULL,
                edad INTEGER,
                datos TEXT,
                fotos_rrss BOOLEAN DEFAULT false,
                pagado BOOLEAN DEFAULT false,
                asistio BOOLEAN DEFAULT false,
                user_id TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_aim_reg_event ON aim_event_registrations(event_id)`);

        // ── Campamento de verano ──
        // Semanas del campamento (las define el admin; los días disponibles son L-V de cada semana).
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_camp_weeks (
                id SERIAL PRIMARY KEY,
                label VARCHAR(200) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                capacity INTEGER DEFAULT 24,
                holidays TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await client.query(`ALTER TABLE aim_camp_weeks ADD COLUMN IF NOT EXISTS holidays TEXT`);
        // Niños inscritos (por un usuario de la web o manualmente desde secretaría).
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_camp_children (
                id SERIAL PRIMARY KEY,
                user_id TEXT,
                nombre VARCHAR(200) NOT NULL,
                apellidos VARCHAR(200) NOT NULL,
                edad INTEGER,
                alergias TEXT,
                observaciones TEXT,
                contacto VARCHAR(120),
                recogida TEXT,
                fotos_rrss BOOLEAN DEFAULT false,
                pagado BOOLEAN DEFAULT false,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        // Ficha del alumno al que corresponde el niño, cuando ya es cliente del club.
        // Va aparte de user_id, que es la cuenta de la familia que hizo la inscripción:
        // un niño puede tener ficha propia, cuenta de familia, ambas o ninguna (los que
        // solo vienen al campamento y no son socios).
        await client.query(`ALTER TABLE aim_camp_children ADD COLUMN IF NOT EXISTS alumno_id UUID`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_aim_camp_children_alumno ON aim_camp_children(alumno_id)`);
        // Días que asistirá cada niño.
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_camp_child_days (
                id SERIAL PRIMARY KEY,
                child_id INTEGER NOT NULL REFERENCES aim_camp_children(id) ON DELETE CASCADE,
                day DATE NOT NULL,
                UNIQUE(child_id, day)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_aim_camp_days_day ON aim_camp_child_days(day)`);
        // Servicios de ese día: entra antes (matinal) o se queda después (custodia).
        for (const col of ['matinal BOOLEAN DEFAULT false', 'custodia BOOLEAN DEFAULT false']) {
            await client.query(`ALTER TABLE aim_camp_child_days ADD COLUMN IF NOT EXISTS ${col}`);
        }
        // Asistencia + diario del profesor por niño y día.
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_camp_attendance (
                id SERIAL PRIMARY KEY,
                child_id INTEGER NOT NULL REFERENCES aim_camp_children(id) ON DELETE CASCADE,
                day DATE NOT NULL,
                asistio BOOLEAN,
                note TEXT,
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(child_id, day)
            )
        `);

        // ── Facturación ──
        // Temporadas del club (la marcada como activa manda en la generación).
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_temporadas (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                activa BOOLEAN DEFAULT false,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        // Catálogo de conceptos facturables. El IVA va POR CONCEPTO (antes se
        // deducía comparando tipo == 'material', de donde salía el descuadre).
        // 'precio' es SIEMPRE base imponible: el IVA se suma encima.
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_precios (
                concepto VARCHAR(100) PRIMARY KEY,
                descripcion VARCHAR(255) NOT NULL,
                precio NUMERIC(10,2) NOT NULL DEFAULT 0,
                tipo VARCHAR(50) NOT NULL DEFAULT 'Otros',
                iva_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
                activo BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        // Catálogo de clases PROPIAS (las que no están en aim-tul). Las de
        // aim-tul NO se copian aquí: se leen en vivo, así siempre están al día.
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_clases (
                id UUID PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                actividad VARCHAR(255),
                activa BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        // Migración pre-lanzamiento (tablas vacías): pasamos a referenciar una
        // clase por su id + origen ('aimtul' | 'custom'), no por un id fijo de
        // aim-tul. Solo se dispara mientras exista la columna vieja group_id.
        const groupIdViejo = await client.query(
            `SELECT 1 FROM information_schema.columns WHERE table_name='aim_matriculas' AND column_name='group_id'`
        );
        if (groupIdViejo.rowCount > 0) {
            await client.query(`DROP TABLE IF EXISTS aim_conceptos_temporada CASCADE`);
            await client.query(`DROP TABLE IF EXISTS aim_matriculas CASCADE`);
        }
        // Qué concepto se cobra: a una ACTIVIDAD (por nombre) o a una CLASE
        // concreta (de aim-tul en vivo o propia). Modelo mixto.
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_conceptos_temporada (
                id SERIAL PRIMARY KEY,
                concepto VARCHAR(100) NOT NULL REFERENCES aim_precios(concepto) ON DELETE CASCADE,
                target_tipo VARCHAR(20) NOT NULL,
                target_ref UUID,
                target_origen VARCHAR(20),
                target_actividad VARCHAR(255),
                target_nombre VARCHAR(255),
                temporada_id INTEGER NOT NULL REFERENCES aim_temporadas(id) ON DELETE CASCADE
            )
        `);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_aim_concepto_target
            ON aim_conceptos_temporada (concepto, temporada_id, target_tipo, COALESCE(target_ref::text, target_actividad))`);
        // Fichas / matrículas: el alumno está en una CLASE (aim-tul o propia).
        // Guardamos snapshot de nombre y actividad para no depender de aim-tul.
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_matriculas (
                id SERIAL PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                clase_ref UUID NOT NULL,
                clase_origen VARCHAR(20) NOT NULL DEFAULT 'aimtul',
                clase_nombre VARCHAR(255),
                actividad VARCHAR(255),
                temporada_id INTEGER NOT NULL REFERENCES aim_temporadas(id) ON DELETE CASCADE,
                descuento_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
                alta DATE NOT NULL DEFAULT CURRENT_DATE,
                baja DATE,
                UNIQUE (user_id, clase_ref, temporada_id)
            )
        `);
        // Parentescos por persona (mismo modelo que la tabla familias actual).
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_familias (
                id SERIAL PRIMARY KEY,
                persona_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                familiar_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                tipo VARCHAR(50) NOT NULL,
                UNIQUE (persona_id, familiar_id)
            )
        `);
        // Recibos. El número sale de una secuencia: el max(numero)+1 del sistema
        // viejo repetía número si dos personas cobraban a la vez.
        await client.query(`CREATE SEQUENCE IF NOT EXISTS aim_recibos_numero_seq START 1`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_recibos (
                id SERIAL PRIMARY KEY,
                numero INTEGER UNIQUE NOT NULL,
                pagador_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
                fecha DATE NOT NULL DEFAULT CURRENT_DATE,
                importe NUMERIC(10,2),
                medio_pago VARCHAR(30),
                entregado NUMERIC(10,2),
                cambio NUMERIC(10,2),
                estado VARCHAR(20) NOT NULL DEFAULT 'abierto',
                cobrado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
                cobrado_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        // Anulación de recibos: nunca se borran, se marcan (rastro de auditoría).
        await client.query(`ALTER TABLE aim_recibos ADD COLUMN IF NOT EXISTS anulado_motivo TEXT`);
        await client.query(`ALTER TABLE aim_recibos ADD COLUMN IF NOT EXISTS anulado_por UUID REFERENCES users(user_id) ON DELETE SET NULL`);
        await client.query(`ALTER TABLE aim_recibos ADD COLUMN IF NOT EXISTS anulado_at TIMESTAMPTZ`);
        // Rectificativas: serie propia ('R'), referencia al original, método y motivo.
        await client.query(`ALTER TABLE aim_recibos ADD COLUMN IF NOT EXISTS serie VARCHAR(4) NOT NULL DEFAULT 'A'`);
        await client.query(`ALTER TABLE aim_recibos ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'normal'`);
        await client.query(`ALTER TABLE aim_recibos ADD COLUMN IF NOT EXISTS rectifica_id INTEGER REFERENCES aim_recibos(id) ON DELETE SET NULL`);
        await client.query(`ALTER TABLE aim_recibos ADD COLUMN IF NOT EXISTS rect_metodo VARCHAR(20)`);
        await client.query(`ALTER TABLE aim_recibos ADD COLUMN IF NOT EXISTS rect_motivo TEXT`);
        // La numeración es correlativa DENTRO de cada serie, no global.
        await client.query(`ALTER TABLE aim_recibos DROP CONSTRAINT IF EXISTS aim_recibos_numero_key`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_aim_recibos_serie_numero ON aim_recibos (serie, numero)`);
        await client.query(`CREATE SEQUENCE IF NOT EXISTS aim_recibos_rect_numero_seq START 1`);
        // Líneas del rectificativo: son correcciones, no cargos. Se guardan
        // como copia para que el documento quede fijo aunque cambie el original.
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_recibo_rect_lineas (
                id SERIAL PRIMARY KEY,
                recibo_id INTEGER NOT NULL REFERENCES aim_recibos(id) ON DELETE CASCADE,
                cargo_id INTEGER REFERENCES aim_cargos(id) ON DELETE SET NULL,
                descripcion VARCHAR(255) NOT NULL,
                cliente_nombre VARCHAR(255),
                mes DATE,
                iva_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
                base NUMERIC(10,2) NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_aim_rect_lineas_recibo ON aim_recibo_rect_lineas(recibo_id)`);
        // Migración pre-lanzamiento (tabla vacía): el cargo pasa a llevar el
        // DESTINO (target_ref = clase concreta, NULL = por actividad) para poder
        // cobrar una mensualidad por cada clase. Solo se dispara mientras no
        // exista aún la columna target_ref.
        const cargoDestino = await client.query(
            `SELECT to_regclass('aim_cargos') AS t, (SELECT 1 FROM information_schema.columns WHERE table_name='aim_cargos' AND column_name='target_ref') AS c`
        );
        if (cargoDestino.rows[0].t && !cargoDestino.rows[0].c) {
            await client.query(`DROP TABLE IF EXISTS aim_cargos CASCADE`);
        }
        // Cargos (los "pagos" de antes). precio/iva_pct/descripcion/tipo se
        // CONGELAN al generar: si mañana cambia el precio, agosto sigue siendo
        // el agosto de agosto aunque se pague con retraso. target_ref = la clase
        // concreta a la que corresponde el cargo (NULL = cobro por actividad).
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_cargos (
                id SERIAL PRIMARY KEY,
                cliente_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                concepto VARCHAR(100) NOT NULL,
                mes DATE NOT NULL,
                descripcion VARCHAR(255) NOT NULL,
                tipo VARCHAR(50) NOT NULL,
                precio NUMERIC(10,2) NOT NULL,
                iva_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
                descuento_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
                descuento_mens_pct NUMERIC(5,2),
                importe NUMERIC(10,2),
                target_ref UUID,
                target_nombre VARCHAR(255),
                recibo_id INTEGER REFERENCES aim_recibos(id) ON DELETE SET NULL,
                estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
                anulado_motivo TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        // Origen: 'generado' (generación mensual) o 'manual' (venta en mostrador).
        await client.query(`ALTER TABLE aim_cargos ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'generado'`);
        // Actividad a la que pertenece el cargo, copiada de la ficha al generar.
        // Es lo que permite cruzar ingresos y gastos por actividad.
        await client.query(`ALTER TABLE aim_cargos ADD COLUMN IF NOT EXISTS actividad VARCHAR(255)`);
        // Único por (cliente, concepto, mes, destino) SOLO para los generados: así la
        // generación mensual no duplica, pero sí se puede vender el mismo artículo
        // varias veces en el mismo mes en el mostrador.
        await client.query(`DROP INDEX IF EXISTS uq_aim_cargos_destino`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_aim_cargos_destino
            ON aim_cargos (cliente_id, concepto, mes, COALESCE(target_ref, '00000000-0000-0000-0000-000000000000'::uuid))
            WHERE origen = 'generado'`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_aim_cargos_cliente ON aim_cargos(cliente_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_aim_cargos_recibo ON aim_cargos(recibo_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_aim_cargos_estado ON aim_cargos(estado)`);
    } finally {
        client.release();
    }
}
initDb().catch(err => console.error('DB init error:', err));

// --- Session store ---

const sessions = new Map();
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
        if (now > session.expiresAt) sessions.delete(token);
    }
}, 3_600_000);

// --- Rate limiting stores ---

const ipLoginAttempts = new Map();
const emailLoginFailures = new Map();
const emailBlocks = new Map();

// --- Helpers ---

function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;
    for (const part of cookieHeader.split(';')) {
        const [key, ...val] = part.trim().split('=');
        if (key) cookies[key.trim()] = val.join('=').trim();
    }
    return cookies;
}

function authenticateSession(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['aim_session'];
    if (!token) return res.status(401).json({ error: 'No autenticado.' });

    const session = sessions.get(token);
    if (!session || Date.now() > session.expiresAt) {
        sessions.delete(token);
        return res.status(401).json({ error: 'Sesión inválida o expirada.' });
    }

    req.userSession = session;
    req.sessionToken = token;
    next();
}

function recordEmailFailure(emailLower, now) {
    const thirtyMinAgo = now - 30 * 60_000;
    const failures = (emailLoginFailures.get(emailLower) || []).filter(t => t > thirtyMinAgo);
    failures.push(now);
    emailLoginFailures.set(emailLower, failures);
    if (failures.length >= 15) {
        emailBlocks.set(emailLower, now + 15 * 60_000);
    }
}

function slugify(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function escapeXml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Renderizado con estilos inline — para emails (HubSpot) y RSS readers
function renderMarkdownEmail(text) {
    if (!text) return '';
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    html = html
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<h4 style="font-family:sans-serif;font-size:16px;font-weight:700;margin:20px 0 8px 0">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 style="font-family:sans-serif;font-size:20px;font-weight:700;margin:24px 0 10px 0">$1</h3>')
        .replace(/^# (.+)$/gm, '<h2 style="font-family:sans-serif;font-size:24px;font-weight:700;margin:28px 0 12px 0">$1</h2>');
    const blocks = html.split(/\n\n+/);
    return blocks.map(block => {
        if (/^<h[2-4]/.test(block.trim())) return block;
        return `<p style="font-family:sans-serif;font-size:15px;line-height:1.7;margin:0 0 16px 0;color:#374151">${block.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
}

function renderMarkdown(text) {
    if (!text) return '';
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    html = html
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<h4 class="text-lg font-bold text-slate-900 mt-6 mb-2">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 class="text-2xl font-bold text-slate-900 mt-8 mb-3">$1</h3>')
        .replace(/^# (.+)$/gm, '<h2 class="text-3xl font-bold text-slate-900 mt-8 mb-4">$1</h2>');
    const blocks = html.split(/\n\n+/);
    return blocks.map(block => {
        if (/^<h[2-4]/.test(block.trim())) return block;
        return `<p class="mb-5 leading-relaxed">${block.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
}

const CATEGORY_LABELS = {
    general: 'General',
    club: 'Noticias del Club',
    taekwondo: 'Taekwondo',
    ballet: 'Ballet',
    ingles: 'Inglés',
    robotica: 'Robótica',
    competicion: 'Competición',
    shelfie: 'Shelfie'
};

function newsLayout(pageTitle, bodyContent, siteUrl, meta = {}) {
    const canonical = meta.canonicalUrl || siteUrl;
    const description = meta.description || 'Noticias y novedades de AIM Education Algeciras';
    const ogImage = meta.ogImage || '';
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeXml(pageTitle)} | AIM Education</title>
    <meta name="description" content="${escapeXml(description)}">
    <link rel="canonical" href="${escapeXml(canonical)}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${escapeXml(canonical)}">
    <meta property="og:title" content="${escapeXml(pageTitle)} | AIM Education">
    <meta property="og:description" content="${escapeXml(description)}">
    <meta property="og:site_name" content="AIM Education">
    ${ogImage ? `<meta property="og:image" content="${escapeXml(ogImage)}">` : ''}
    <meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
    <meta name="twitter:title" content="${escapeXml(pageTitle)} | AIM Education">
    <meta name="twitter:description" content="${escapeXml(description)}">
    ${ogImage ? `<meta name="twitter:image" content="${escapeXml(ogImage)}">` : ''}
    <link rel="alternate" type="application/rss+xml" title="AIM Education RSS" href="/feed.xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Montserrat:wght@400;600&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>body { font-family: 'Montserrat', sans-serif; } h1,h2,h3,h4,h5 { font-family: 'Outfit', sans-serif; }</style>
    <script>function loadScript(a){var b=document.getElementsByTagName("head")[0],c=document.createElement("script");c.type="text/javascript",c.src="https://tracker.metricool.com/resources/be.js",c.onreadystatechange=a,c.onload=a,b.appendChild(c)}loadScript(function(){beTracker.t({hash:"88da779c66723ada225db305a176e273"})});</script>
</head>
<body class="bg-slate-50 min-h-screen">
    <nav class="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div class="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
            <a href="/" class="font-extrabold text-xl text-slate-900 tracking-tight" style="font-family:'Outfit',sans-serif">
                AIM<span class="text-emerald-600">EDUCATION</span>
            </a>
            <div class="flex items-center gap-5">
                <a href="/noticias" class="text-sm font-semibold text-slate-600 hover:text-emerald-600 transition">Noticias</a>
                <a href="/" class="text-sm font-semibold text-slate-600 hover:text-emerald-600 transition">Inicio</a>
                <a href="/feed.xml" title="Suscribirse por RSS" class="flex items-center gap-1.5 text-sm font-bold text-orange-500 hover:text-orange-400 transition bg-orange-50 border border-orange-100 px-3 py-1.5 rounded-lg">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/></svg>
                    RSS
                </a>
            </div>
        </div>
    </nav>
    <main class="max-w-5xl mx-auto px-4 py-12">
        ${bodyContent}
    </main>
    <footer class="bg-white border-t border-slate-100 mt-20">
        <div class="max-w-5xl mx-auto px-4 py-6 flex justify-between items-center text-sm text-slate-400">
            <span>&copy; 2026 AIM Education &mdash; Algeciras</span>
            <a href="/feed.xml" class="hover:text-orange-500 transition flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/></svg>
                Suscribirse RSS
            </a>
        </div>
    </footer>
</body>
</html>`;
}

// --- Nodemailer ---

const mailTransporter = (process.env.EMAIL_USER && process.env.EMAIL_PASS)
    ? nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    })
    : null;

// --- Middleware ---

app.use(cors({
    origin: (origin, callback) => callback(null, origin || true),
    credentials: true
}));
app.use(express.json({ limit: '6mb' })); // 6mb para permitir subir el cartel de eventos (base64)

// =============================================================================
// AUTH ROUTES
// =============================================================================

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }

    const emailLower = email.toLowerCase();
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();

    const blockedUntil = emailBlocks.get(emailLower);
    if (blockedUntil) {
        if (now < blockedUntil) {
            const minutesLeft = Math.ceil((blockedUntil - now) / 60_000);
            return res.status(429).json({ error: `Usuario bloqueado por demasiados intentos fallidos. Inténtelo de nuevo en ${minutesLeft} minuto${minutesLeft !== 1 ? 's' : ''}.` });
        }
        emailBlocks.delete(emailLower);
        emailLoginFailures.delete(emailLower);
    }

    const ipData = ipLoginAttempts.get(ip) || { count: 0, resetAt: now + 60_000 };
    if (now >= ipData.resetAt) {
        ipData.count = 0;
        ipData.resetAt = now + 60_000;
    }
    if (ipData.count >= 5) {
        return res.status(429).json({ error: 'Demasiados intentos. Inténtelo de nuevo en un minuto.' });
    }
    ipData.count++;
    ipLoginAttempts.set(ip, ipData);

    try {
        const userRes = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1', [emailLower]);
        if (userRes.rowCount === 0) {
            recordEmailFailure(emailLower, now);
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        }

        const user = userRes.rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            recordEmailFailure(emailLower, now);
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        }

        emailLoginFailures.delete(emailLower);
        emailBlocks.delete(emailLower);

        const userRole = (user.role || '').toLowerCase();
        const devRole = (user.dev_role || '').toLowerCase();
        const allowedRoles = ['instructor', 'club_owner', 'superadmin'];
        const canAccessAdmin = allowedRoles.includes(userRole) || allowedRoles.includes(devRole);
        const isSuperAdmin = devRole === 'superadmin' || userRole === 'superadmin';

        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, {
            userId: user.user_id,
            email: user.email,
            firstName: user.name,
            lastName: user.surname,
            avatar: user.profile_picture,
            isSuperAdmin,
            canAccessAdmin,
            expiresAt: now + SESSION_DURATION_MS
        });

        res.cookie('aim_session', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: SESSION_DURATION_MS,
            path: '/'
        });

        res.json({
            success: true,
            user: {
                id: user.user_id,
                firstName: user.name,
                lastName: user.surname,
                email: user.email,
                avatar: user.profile_picture,
                isSuperAdmin,
                canAccessAdmin
            }
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Error del servidor al intentar iniciar sesión.' });
    }
});

app.post('/api/register', async (req, res) => {
    const { firstName, lastName, email, phone, password, activities } = req.body;
    if (!firstName || !email || !password) {
        return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }
    const emailLower = email.toLowerCase().trim();
    try {
        const exists = await pool.query('SELECT user_id FROM users WHERE LOWER(email) = $1', [emailLower]);
        if (exists.rowCount > 0) {
            return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
        }
        const hash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            `INSERT INTO users (name, surname, email, password, role)
             VALUES ($1, $2, $3, $4, 'student')
             RETURNING user_id, name, surname, email`,
            [firstName.trim(), (lastName || '').trim(), emailLower, hash]
        );
        const newUser = result.rows[0];
        const now = Date.now();
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, {
            userId: newUser.user_id,
            email: newUser.email,
            firstName: newUser.name,
            lastName: newUser.surname,
            avatar: null,
            isSuperAdmin: false,
            canAccessAdmin: false,
            expiresAt: now + SESSION_DURATION_MS
        });
        res.cookie('aim_session', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: SESSION_DURATION_MS,
            path: '/'
        });
        res.status(201).json({
            success: true,
            user: { id: newUser.user_id, firstName: newUser.name, lastName: newUser.surname, email: newUser.email, canAccessAdmin: false, isSuperAdmin: false }
        });
    } catch (err) {
        console.error('Register error:', err);
        if (err.code === '42703') {
            return res.status(500).json({ error: 'Error en la estructura de la base de datos. Contacta con soporte.' });
        }
        res.status(500).json({ error: 'Error al crear la cuenta. Inténtalo de nuevo.' });
    }
});

app.get('/api/me', authenticateSession, (req, res) => {
    const s = req.userSession;
    res.json({
        id: s.userId,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        avatar: s.avatar,
        isSuperAdmin: s.isSuperAdmin,
        canAccessAdmin: s.canAccessAdmin
    });
});

app.post('/api/logout', authenticateSession, (req, res) => {
    sessions.delete(req.sessionToken);
    res.clearCookie('aim_session', { path: '/' });
    res.json({ success: true });
});

// =============================================================================
// PROTECTED DATA ROUTES
// =============================================================================

app.get('/api/users', authenticateSession, async (req, res) => {
    try {
        // Solo alumnos del club Aim Education (no todos los usuarios de la plataforma).
        const result = await pool.query(
            `SELECT user_id, name, surname, email, belt, dev_role, role, profile_picture
             FROM users WHERE club_id = $1 AND role = 'student'
             ORDER BY name, surname`,
            [AIM_CLUB_ID]
        );
        const mapped = result.rows.map(u => ({
            id: u.user_id,
            firstName: u.name,
            lastName: u.surname,
            email: u.email,
            belt: u.belt,
            avatar: u.profile_picture,
            isSuperAdmin: (u.dev_role === 'superadmin' || u.role === 'superadmin' || u.role === 'SuperAdmin')
        }));
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', authenticateSession, async (req, res) => {
    const { firstName, lastName, email, belt, isSuperAdmin } = req.body;
    if (!firstName || !email) {
        return res.status(400).json({ error: 'Nombre y email son requeridos.' });
    }
    const emailLower = email.toLowerCase().trim();
    try {
        const exists = await pool.query('SELECT user_id FROM users WHERE LOWER(email) = $1', [emailLower]);
        if (exists.rowCount > 0) {
            return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
        }
        const hash = await bcrypt.hash('aim123456', 12);
        const user_id = crypto.randomUUID();
        const role = isSuperAdmin ? 'superadmin' : 'student';
        
        await pool.query(
            `INSERT INTO users (user_id, name, surname, email, password, belt, role)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user_id, firstName.trim(), (lastName || '').trim(), emailLower, hash, belt || null, role]
        );
        res.status(201).json({ id: user_id, firstName, lastName, email, belt, isSuperAdmin });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', authenticateSession, async (req, res) => {
    const { firstName, lastName, email, belt, isSuperAdmin } = req.body;
    const { id } = req.params;
    if (!firstName || !email) {
        return res.status(400).json({ error: 'Nombre y email son requeridos.' });
    }
    const emailLower = email.toLowerCase().trim();
    try {
        const role = isSuperAdmin ? 'superadmin' : 'student';
        const dev_role = isSuperAdmin ? 'superadmin' : null;
        await pool.query(
            `UPDATE users
             SET name = $1, surname = $2, email = $3, belt = $4, role = $5, dev_role = $6
             WHERE user_id = $7`,
            [firstName.trim(), (lastName || '').trim(), emailLower, belt || null, role, dev_role, id]
        );
        res.json({ id, firstName, lastName, email, belt, isSuperAdmin });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', authenticateSession, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM users WHERE user_id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// CLUB AIM EDUCATION — integración con las tablas compartidas tul_* (aim-tul).
// aim-education es de un solo club: todo se filtra por este club_id. Lo que se
// edita en aim-tul se refleja aquí automáticamente (misma base de datos).
// =============================================================================
const AIM_CLUB_ID = 'b68ca873-5086-474f-a296-fe60b149b8a2';

// Colores/ids estáticos del frontend (ACT_BY_ID) para pintar el horario.
const ACT_COLORS = {
    taekwondo: '#21B668', ballet: '#FF99D3', baile: '#AF99FF', ingles: '#00BBF4',
    robotica: '#FFD526', camaleon: '#25D8BA', funcional: '#FF4F15', pilates: '#BFD300', pintura: '#5233A8',
};

// Mapea una actividad real del club a la id estática del frontend (para color/clase CSS).
function mapActivityId(name = '', type = '') {
    const n = (name || '').toLowerCase();
    const t = (type || '').toLowerCase();
    if (t === 'taekwondo_itf' || n.includes('taekwon')) return 'taekwondo';
    if (t === 'ballet' || n.includes('ballet')) return 'ballet';
    if (t === 'ingles' || n.includes('inglé') || n.includes('ingles') || n.includes('english')) return 'ingles';
    if (n.includes('baile') || n.includes('danza')) return 'baile';
    if (n.includes('robót') || n.includes('robot')) return 'robotica';
    if (n.includes('pilates')) return 'pilates';
    if (n.includes('pintura')) return 'pintura';
    if (n.includes('defensa')) return 'taekwondo';
    if (n.includes('kick') || n.includes('box')) return 'funcional';
    return 'funcional';
}

function hourFloat(hhmm) {
    const [h, m] = String(hhmm || '0:0').split(':').map(Number);
    return (h || 0) + (m || 0) / 60;
}

// Convierte filas de grupos (con sessions JSONB) en "slots" de horario (un bloque por
// día/sesión) en el formato que consume el frontend. Reutilizado por el horario del club
// y por el horario personal del alumno.
function buildSlotsFromGroups(rows) {
    const slots = [];
    for (const g of rows) {
        const sessions = Array.isArray(g.sessions) ? g.sessions : [];
        const aimId = mapActivityId(g.activity_name, g.activity_type);
        sessions.forEach((sess, si) => {
            const days = Array.isArray(sess.days) ? sess.days : [];
            const start = hourFloat(sess.startTime);
            const end = hourFloat(sess.endTime);
            const dur = end > start ? Number((end - start).toFixed(2)) : 1;
            for (const rawDay of days) {
                const d = Number(rawDay);
                if (isNaN(d) || d < 0 || d > 5) continue; // rejilla Lunes-Sábado
                slots.push({
                    id: `${g.group_id}-${si}-${d}`,
                    d,
                    s: Math.floor(start),
                    h: dur,
                    act: aimId,
                    title: g.name,
                    room: sess.aulaName || '',
                    monitor: sess.instructorName || '',
                    students: `${g.student_count}/${g.max_students ?? '∞'}`,
                    time: `${sess.startTime || ''}–${sess.endTime || ''}`,
                    actColor: ACT_COLORS[aimId],
                    actName: g.activity_name,
                    minAge: g.min_age ?? null,
                    maxAge: g.max_age ?? null,
                });
            }
        });
    }
    slots.sort((a, b) => (a.d - b.d) || (a.s - b.s));
    return slots;
}

// Horario completo del club (todas las clases de la academia).
app.get('/api/classes', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT g.group_id, g.name, g.sessions, g.max_students, g.min_age, g.max_age,
                   act.name AS activity_name, act.activity_type,
                   (SELECT COUNT(*) FROM tul_group_students gs WHERE gs.group_id = g.group_id) AS student_count
            FROM tul_groups g
            JOIN tul_activities act ON g.activity_id = act.activity_id
            WHERE act.club_id = $1
        `, [AIM_CLUB_ID]);
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
        res.json(buildSlotsFromGroups(result.rows));
    } catch (err) {
        console.error('Error fetching classes:', err);
        res.status(500).json({ error: err.message });
    }
});

// Clases del alumno que ha iniciado sesión: sus grupos matriculados + su horario + su nivel.
app.get('/api/me/groups', authenticateSession, async (req, res) => {
    try {
        const userId = req.userSession.userId;
        const result = await pool.query(`
            SELECT g.group_id, g.name, g.sessions, g.max_students,
                   act.name AS activity_name, act.activity_type,
                   up.level_name AS level_name, up.level_order AS level_order,
                   (SELECT COUNT(*) FROM tul_group_students gs2 WHERE gs2.group_id = g.group_id) AS student_count
            FROM tul_groups g
            JOIN tul_group_students gs ON gs.group_id = g.group_id
            JOIN tul_activities act ON g.activity_id = act.activity_id
            LEFT JOIN tul_user_progression up ON up.user_id = gs.student_id AND up.activity_id = g.activity_id
            WHERE gs.student_id = $1 AND act.club_id = $2
            ORDER BY act.name, g.name
        `, [userId, AIM_CLUB_ID]);

        const groups = result.rows.map(g => ({
            id: g.group_id,
            name: g.name,
            act: mapActivityId(g.activity_name, g.activity_type),
            activityName: g.activity_name,
            level: g.level_name || null,
            time: g.sessions,
            studentCount: Number(g.student_count),
        }));
        res.json({ groups, slots: buildSlotsFromGroups(result.rows) });
    } catch (err) {
        console.error('Error fetching my groups:', err);
        res.status(500).json({ error: err.message });
    }
});

// Asistencia del alumno que ha iniciado sesión, agregada por grupo.
app.get('/api/me/attendance', authenticateSession, async (req, res) => {
    try {
        const userId = req.userSession.userId;
        const result = await pool.query(`
            SELECT g.group_id, g.name AS group_name,
                   act.name AS activity_name, act.activity_type,
                   COUNT(*) FILTER (WHERE at.status IN ('present', 'late'))::int AS attended,
                   COUNT(*) FILTER (WHERE at.status = 'absent')::int AS missed,
                   COUNT(*)::int AS total
            FROM tul_attendance at
            JOIN tul_groups g ON at.group_id = g.group_id
            JOIN tul_activities act ON g.activity_id = act.activity_id
            WHERE at.student_id = $1 AND act.club_id = $2
            GROUP BY g.group_id, g.name, act.name, act.activity_type
            ORDER BY act.name, g.name
        `, [userId, AIM_CLUB_ID]);

        res.json(result.rows.map(r => ({
            groupId: r.group_id,
            groupName: r.group_name,
            activityName: r.activity_name,
            act: mapActivityId(r.activity_name, r.activity_type),
            attended: r.attended,
            missed: r.missed,
            total: r.total,
            percent: r.total > 0 ? Math.round((r.attended / r.total) * 100) : 0,
        })));
    } catch (err) {
        console.error('Error fetching my attendance:', err);
        res.status(500).json({ error: err.message });
    }
});

// El horario, actividades y aulas se gestionan desde la app Aim-Tul (fuente única
// de verdad sobre las tablas tul_*). En la web son de solo lectura.
const MANAGE_IN_AIMTUL = { error: 'El horario, las actividades y las aulas se gestionan desde la app Aim-Tul. Aquí se muestran en tiempo real.' };

app.post('/api/classes', authenticateSession, (req, res) => res.status(400).json(MANAGE_IN_AIMTUL));
app.delete('/api/classes/:id', authenticateSession, (req, res) => res.status(400).json(MANAGE_IN_AIMTUL));
app.post('/api/admin/activities', authenticateSession, (req, res) => res.status(400).json(MANAGE_IN_AIMTUL));
app.post('/api/admin/aulas', authenticateSession, (req, res) => res.status(400).json(MANAGE_IN_AIMTUL));

// Actividades reales del club (tul_activities), mapeadas a id/color del frontend.
app.get('/api/activities', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT activity_id, name, activity_type, icon FROM tul_activities WHERE club_id = $1 ORDER BY name',
            [AIM_CLUB_ID]
        );
        res.json(result.rows.map(r => {
            const id = mapActivityId(r.name, r.activity_type);
            return { id, activityId: r.activity_id, name: r.name, color: ACT_COLORS[id], className: `act-${id}` };
        }));
    } catch (err) {
        console.error('Error fetching activities:', err);
        res.status(500).json({ error: err.message });
    }
});

// Aulas reales del club (tul_aulas), con su color y capacidad.
app.get('/api/aulas', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT aula_id AS id, name, capacity, color FROM tul_aulas WHERE club_id = $1 ORDER BY name',
            [AIM_CLUB_ID]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching classrooms:', err);
        res.status(500).json({ error: err.message });
    }
});

// Instructores reales del club (usuarios con rol instructor/club_owner). Se gestionan en aim-tul.
app.get('/api/instructores', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT user_id AS id, TRIM(name || ' ' || COALESCE(surname, '')) AS name, email, role
            FROM users
            WHERE club_id = $1 AND (role = 'instructor' OR role = 'club_owner')
            ORDER BY role DESC, name ASC
        `, [AIM_CLUB_ID]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching instructors:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/instructores', authenticateSession, (req, res) => res.status(400).json(MANAGE_IN_AIMTUL));
app.put('/api/admin/instructores/:id', authenticateSession, (req, res) => res.status(400).json(MANAGE_IN_AIMTUL));
app.delete('/api/admin/instructores/:id', authenticateSession, (req, res) => res.status(400).json(MANAGE_IN_AIMTUL));

// Grupos/clases reales del club (tul_groups) con sus alumnos matriculados (tul_group_students).
app.get('/api/admin/groups', authenticateSession, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT g.group_id AS id, g.name, g.time, g.sessions, g.max_students AS "maxStudents",
                   g.min_age AS "minAge", g.max_age AS "maxAge",
                   a.activity_id AS "activityId", a.name AS activity_name, a.activity_type,
                   COALESCE(
                     json_agg(json_build_object('id', u.user_id, 'name', TRIM(u.name || ' ' || COALESCE(u.surname, ''))))
                     FILTER (WHERE u.user_id IS NOT NULL), '[]'
                   ) AS students
            FROM tul_groups g
            JOIN tul_activities a ON g.activity_id = a.activity_id
            LEFT JOIN tul_group_students gs ON gs.group_id = g.group_id
            LEFT JOIN users u ON u.user_id = gs.student_id
            WHERE a.club_id = $1
            GROUP BY g.group_id, g.name, g.time, g.sessions, g.max_students, g.min_age, g.max_age, a.activity_id, a.name, a.activity_type
            ORDER BY a.name, g.name
        `, [AIM_CLUB_ID]);
        const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
        res.json(result.rows.map(g => {
            const sessions = Array.isArray(g.sessions) ? g.sessions : [];
            const rooms = [...new Set(sessions.map(s => s.aulaName).filter(Boolean))];
            const instructors = [...new Set(sessions.map(s => s.instructorName).filter(Boolean))];
            const schedule = [];
            for (const s of sessions) {
                for (const d of (Array.isArray(s.days) ? s.days : [])) {
                    schedule.push({
                        day: DAYS[Number(d)] || '',
                        dayNum: Number(d),
                        time: `${s.startTime || ''}–${s.endTime || ''}`,
                        room: s.aulaName || '',
                        instructor: s.instructorName || '',
                    });
                }
            }
            schedule.sort((x, y) => (x.dayNum - y.dayNum) || x.time.localeCompare(y.time));
            return {
                id: g.id,
                name: g.name,
                activityId: g.activityId,
                activity: mapActivityId(g.activity_name, g.activity_type),
                activityName: g.activity_name,
                maxStudents: g.maxStudents,
                minAge: g.minAge,
                maxAge: g.maxAge,
                rooms,
                instructors,
                schedule,
                students: g.students,
                studentIds: g.students.map(s => s.id),
                studentCount: g.students.length,
            };
        }));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/groups', authenticateSession, (req, res) => res.status(400).json(MANAGE_IN_AIMTUL));
app.put('/api/admin/groups/:id', authenticateSession, (req, res) => res.status(400).json(MANAGE_IN_AIMTUL));
app.delete('/api/admin/groups/:id', authenticateSession, (req, res) => res.status(400).json(MANAGE_IN_AIMTUL));

// =============================================================================
// EVENTOS Y TALLERES (aim_eventos) — propios de aim-education
// =============================================================================

function mapEvent(r) {
    return {
        id: r.id,
        title: r.title,
        description: r.description,
        date: r.event_date,
        endDate: r.end_date,
        time: r.time,
        endTime: r.end_time,
        venue: r.venue,
        price: r.price,
        activity: r.activity || 'taekwondo',
        posterUrl: r.poster_url,
    };
}

// Público: lista de eventos (por defecto próximos; ?all=1 para todos).
app.get('/api/events', async (req, res) => {
    try {
        const all = req.query.all === '1';
        const result = await pool.query(
            all
                ? `SELECT * FROM aim_eventos ORDER BY event_date ASC`
                : `SELECT * FROM aim_eventos WHERE COALESCE(end_date, event_date) >= CURRENT_DATE ORDER BY event_date ASC`
        );
        res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=30');
        res.json(result.rows.map(mapEvent));
    } catch (err) {
        console.error('Error fetching events:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: lista completa de eventos sin caché (para el panel de gestión).
app.get('/api/admin/events', authenticateSession, async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM aim_eventos ORDER BY event_date ASC`);
        res.set('Cache-Control', 'no-store');
        res.json(result.rows.map(mapEvent));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/events', authenticateSession, async (req, res) => {
    const { title, description, date, endDate, time, endTime, venue, price, activity, posterUrl } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'Título y fecha son obligatorios.' });
    const id = crypto.randomUUID();
    try {
        await pool.query(
            `INSERT INTO aim_eventos (id, title, description, event_date, end_date, time, end_time, venue, price, activity, poster_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [id, title, description || null, date, endDate || null, time || null, endTime || null, venue || null, price || null, activity || 'taekwondo', posterUrl || null]
        );
        const result = await pool.query('SELECT * FROM aim_eventos WHERE id = $1', [id]);
        res.status(201).json(mapEvent(result.rows[0]));
    } catch (err) {
        console.error('Error creating event:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/events/:id', authenticateSession, async (req, res) => {
    const { title, description, date, endDate, time, endTime, venue, price, activity, posterUrl } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'Título y fecha son obligatorios.' });
    try {
        const result = await pool.query(
            `UPDATE aim_eventos
             SET title=$1, description=$2, event_date=$3, end_date=$4, time=$5, end_time=$6, venue=$7, price=$8, activity=$9, poster_url=$10, updated_at=NOW()
             WHERE id=$11 RETURNING *`,
            [title, description || null, date, endDate || null, time || null, endTime || null, venue || null, price || null, activity || 'taekwondo', posterUrl || null, req.params.id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Evento no encontrado.' });
        res.json(mapEvent(result.rows[0]));
    } catch (err) {
        console.error('Error updating event:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/events/:id', authenticateSession, async (req, res) => {
    try {
        await pool.query('DELETE FROM aim_eventos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting event:', err);
        res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// INSCRIPCIONES A EVENTOS
// =============================================================================

// Público: inscribirse a un evento.
app.post('/api/events/:id/register', async (req, res) => {
    const { nombre, apellidos, edad, datos, fotosRrss } = req.body;
    if (!nombre?.trim() || !apellidos?.trim()) return res.status(400).json({ error: 'Nombre y apellidos son obligatorios.' });
    const token = req.cookies?.aim_session;
    const session = token ? sessions.get(token) : null;
    try {
        const result = await pool.query(
            `INSERT INTO aim_event_registrations (event_id, nombre, apellidos, edad, datos, fotos_rrss, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [req.params.id, nombre.trim(), apellidos.trim(), edad || null, datos?.trim() || null, !!fotosRrss, session?.userId || null]
        );
        res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
        console.error('Error registering:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: listar inscritos de un evento.
app.get('/api/admin/events/:id/registrations', authenticateSession, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM aim_event_registrations WHERE event_id = $1 ORDER BY created_at ASC`,
            [req.params.id]
        );
        res.set('Cache-Control', 'no-store');
        res.json(result.rows.map(r => ({
            id: r.id, nombre: r.nombre, apellidos: r.apellidos, edad: r.edad,
            datos: r.datos, fotosRrss: r.fotos_rrss, pagado: r.pagado,
            asistio: r.asistio, userId: r.user_id, createdAt: r.created_at,
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: actualizar pagado/asistio de un inscrito.
app.patch('/api/admin/events/:id/registrations/:regId', authenticateSession, async (req, res) => {
    const { pagado, asistio } = req.body;
    const fields = [];
    const vals = [];
    if (pagado !== undefined) { fields.push(`pagado = $${fields.length + 1}`); vals.push(!!pagado); }
    if (asistio !== undefined) { fields.push(`asistio = $${fields.length + 1}`); vals.push(!!asistio); }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar.' });
    vals.push(req.params.regId, req.params.id);
    try {
        await pool.query(
            `UPDATE aim_event_registrations SET ${fields.join(', ')} WHERE id = $${vals.length - 1} AND event_id = $${vals.length}`,
            vals
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: eliminar un inscrito.
app.delete('/api/admin/events/:id/registrations/:regId', authenticateSession, async (req, res) => {
    try {
        await pool.query('DELETE FROM aim_event_registrations WHERE id = $1 AND event_id = $2', [req.params.regId, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// CAMPAMENTO DE VERANO
// =============================================================================

function requireAdmin(req, res, next) {
    if (!req.userSession?.canAccessAdmin) return res.status(403).json({ error: 'Acceso solo para administradores.' });
    next();
}

// Gestión de clases y reportes de Aim-Tul (mismas tablas tul_*, mismo SQL),
// portados a nuestro panel. Ver tul-clases.js.
app.use('/api/admin/tul', authenticateSession, requireAdmin, crearRouterTulClases({ pool, clubId: AIM_CLUB_ID }));

function mapCampChild(r) {
    return {
        id: r.id,
        userId: r.user_id,
        nombre: r.nombre,
        apellidos: r.apellidos,
        edad: r.edad,
        alergias: r.alergias,
        observaciones: r.observaciones,
        contacto: r.contacto,
        recogida: r.recogida,
        fotosRrss: r.fotos_rrss,
        pagado: r.pagado,
        createdAt: r.created_at,
        days: r.days || [],
        servicios: r.servicios || {},
        parentName: r.parent_name || null,
        parentEmail: r.parent_email || null,
        alumnoId: r.alumno_id || null,
        alumnoNombre: r.alumno_nombre || null,
        alumnoEmail: r.alumno_email || null,
    };
}

// Comprueba que un id de usuario recibido del cliente es una ficha real del club.
// Devuelve { id } (null si no se envió nada) o { error } si no vale.
async function validarUsuarioClub(id, etiqueta) {
    if (!id) return { id: null };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) {
        return { error: `La ficha de ${etiqueta} no es válida.` };
    }
    const r = await pool.query('SELECT user_id FROM users WHERE user_id = $1 AND club_id = $2', [id, AIM_CLUB_ID]);
    if (!r.rowCount) return { error: `No se ha encontrado la ficha de ${etiqueta} en el club.` };
    return { id: r.rows[0].user_id };
}

// Días L-V (laborables) dentro de una semana del campamento.
function weekDays(startStr, endStr) {
    const days = [];
    const d = new Date(startStr + 'T12:00:00Z');
    const end = new Date(endStr + 'T12:00:00Z');
    while (d <= end) {
        const dow = d.getUTCDay();
        if (dow >= 1 && dow <= 5) days.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return days;
}

// Festivos de una semana: columna TEXT con array JSON de fechas ISO.
function parseHolidays(raw) {
    if (!raw) return [];
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
    } catch { return []; }
}

// Comprueba los días solicitados: devuelve { day, reason: 'full' | 'holiday' } o null.
async function findBlockedDay(daysToAdd, excludeChildId) {
    if (!daysToAdd.length) return null;
    const weeksRes = await pool.query(`SELECT *, to_char(start_date,'YYYY-MM-DD') AS s, to_char(end_date,'YYYY-MM-DD') AS e FROM aim_camp_weeks`);
    const countsRes = await pool.query(
        `SELECT to_char(day,'YYYY-MM-DD') AS day, COUNT(*)::int AS n
         FROM aim_camp_child_days WHERE day = ANY($1::date[]) ${excludeChildId ? 'AND child_id <> $2' : ''}
         GROUP BY day`,
        excludeChildId ? [daysToAdd, excludeChildId] : [daysToAdd]
    );
    const counts = Object.fromEntries(countsRes.rows.map(r => [r.day, r.n]));
    for (const day of daysToAdd) {
        // Si varias semanas cubren la misma fecha, el festivo de cualquiera de ellas bloquea el día.
        const containing = weeksRes.rows.filter(w => day >= w.s && day <= w.e);
        if (containing.some(w => parseHolidays(w.holidays).includes(day))) return { day, reason: 'holiday' };
        const cap = containing[0]?.capacity ?? null;
        if (cap != null && (counts[day] || 0) >= cap) return { day, reason: 'full' };
    }
    return null;
}

function blockedDayError(blocked) {
    return blocked.reason === 'holiday'
        ? `El día ${blocked.day} es festivo y el campamento permanece cerrado.`
        : `El día ${blocked.day} ya no tiene plazas libres.`;
}

// Público: semanas del campamento con ocupación por día.
app.get('/api/camp/weeks', async (req, res) => {
    try {
        const weeks = await pool.query(`SELECT id, label, capacity, holidays, to_char(start_date,'YYYY-MM-DD') AS start_date, to_char(end_date,'YYYY-MM-DD') AS end_date FROM aim_camp_weeks ORDER BY start_date ASC`);
        const counts = await pool.query(`SELECT to_char(day,'YYYY-MM-DD') AS day, COUNT(*)::int AS n FROM aim_camp_child_days GROUP BY day`);
        const countByDay = Object.fromEntries(counts.rows.map(r => [r.day, r.n]));
        res.set('Cache-Control', 'no-store');
        res.json(weeks.rows.map(w => {
            const hols = parseHolidays(w.holidays);
            return {
                id: w.id,
                label: w.label,
                startDate: w.start_date,
                endDate: w.end_date,
                capacity: w.capacity,
                holidays: hols,
                days: weekDays(w.start_date, w.end_date).map(day => ({ day, count: countByDay[day] || 0, holiday: hols.includes(day) })),
            };
        }));
    } catch (err) {
        console.error('Error fetching camp weeks:', err);
        res.status(500).json({ error: err.message });
    }
});

// Usuario: mis niños inscritos (con sus días).
app.get('/api/camp/children', authenticateSession, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT c.*, COALESCE(json_agg(to_char(d.day,'YYYY-MM-DD') ORDER BY d.day) FILTER (WHERE d.id IS NOT NULL), '[]') AS days
             FROM aim_camp_children c
             LEFT JOIN aim_camp_child_days d ON d.child_id = c.id
             WHERE c.user_id = $1
             GROUP BY c.id ORDER BY c.created_at ASC`,
            [String(req.userSession.userId)]
        );
        res.set('Cache-Control', 'no-store');
        res.json(result.rows.map(mapCampChild));
    } catch (err) {
        console.error('Error fetching camp children:', err);
        res.status(500).json({ error: err.message });
    }
});

// Usuario: inscribir a un niño (con días opcionales en la misma llamada).
app.post('/api/camp/children', authenticateSession, async (req, res) => {
    const { nombre, apellidos, edad, alergias, observaciones, contacto, recogida, fotosRrss, days } = req.body;
    if (!nombre?.trim() || !apellidos?.trim()) return res.status(400).json({ error: 'Nombre y apellidos son obligatorios.' });
    const dayList = Array.isArray(days) ? [...new Set(days)] : [];
    try {
        const blocked = await findBlockedDay(dayList, null);
        if (blocked) return res.status(409).json({ error: blockedDayError(blocked) });
        const result = await pool.query(
            `INSERT INTO aim_camp_children (user_id, nombre, apellidos, edad, alergias, observaciones, contacto, recogida, fotos_rrss)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [String(req.userSession.userId), nombre.trim(), apellidos.trim(), edad || null, alergias?.trim() || null,
             observaciones?.trim() || null, contacto?.trim() || null, recogida?.trim() || null, !!fotosRrss]
        );
        const childId = result.rows[0].id;
        for (const day of dayList) {
            await pool.query(`INSERT INTO aim_camp_child_days (child_id, day) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [childId, day]);
        }
        res.status(201).json({ id: childId });
    } catch (err) {
        console.error('Error enrolling camp child:', err);
        res.status(500).json({ error: err.message });
    }
});

// Usuario/Admin: comprobar propiedad del niño.
async function getOwnedChild(req, res) {
    const result = await pool.query('SELECT * FROM aim_camp_children WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) { res.status(404).json({ error: 'Niño/a no encontrado/a.' }); return null; }
    const child = result.rows[0];
    if (!req.userSession.canAccessAdmin && String(child.user_id) !== String(req.userSession.userId)) {
        res.status(403).json({ error: 'No autorizado.' });
        return null;
    }
    return child;
}

// Usuario: editar datos del niño.
app.put('/api/camp/children/:id', authenticateSession, async (req, res) => {
    try {
        const child = await getOwnedChild(req, res);
        if (!child) return;
        const { nombre, apellidos, edad, alergias, observaciones, contacto, recogida, fotosRrss } = req.body;
        if (!nombre?.trim() || !apellidos?.trim()) return res.status(400).json({ error: 'Nombre y apellidos son obligatorios.' });
        await pool.query(
            `UPDATE aim_camp_children SET nombre=$1, apellidos=$2, edad=$3, alergias=$4, observaciones=$5, contacto=$6, recogida=$7, fotos_rrss=$8 WHERE id=$9`,
            [nombre.trim(), apellidos.trim(), edad || null, alergias?.trim() || null, observaciones?.trim() || null,
             contacto?.trim() || null, recogida?.trim() || null, !!fotosRrss, child.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Usuario: dar de baja al niño del campamento.
app.delete('/api/camp/children/:id', authenticateSession, async (req, res) => {
    try {
        const child = await getOwnedChild(req, res);
        if (!child) return;
        await pool.query('DELETE FROM aim_camp_children WHERE id = $1', [child.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Usuario: elegir los días que asistirá el niño (reemplaza la selección).
app.put('/api/camp/children/:id/days', authenticateSession, async (req, res) => {
    const { days } = req.body;
    if (!Array.isArray(days)) return res.status(400).json({ error: 'days debe ser un array de fechas.' });
    const dayList = [...new Set(days)];
    try {
        const child = await getOwnedChild(req, res);
        if (!child) return;
        const currentRes = await pool.query(`SELECT to_char(day,'YYYY-MM-DD') AS day FROM aim_camp_child_days WHERE child_id = $1`, [child.id]);
        const current = new Set(currentRes.rows.map(r => r.day));
        const toAdd = dayList.filter(d => !current.has(d));
        const blocked = await findBlockedDay(toAdd, child.id);
        if (blocked) return res.status(409).json({ error: blockedDayError(blocked) });
        await pool.query('DELETE FROM aim_camp_child_days WHERE child_id = $1', [child.id]);
        for (const day of dayList) {
            await pool.query(`INSERT INTO aim_camp_child_days (child_id, day) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [child.id, day]);
        }
        res.json({ success: true, days: dayList.sort() });
    } catch (err) {
        console.error('Error setting camp days:', err);
        res.status(500).json({ error: err.message });
    }
});

// Usuario: diario del niño (asistencia + notas del profesor), visible para la familia.
app.get('/api/camp/children/:id/diary', authenticateSession, async (req, res) => {
    try {
        const child = await getOwnedChild(req, res);
        if (!child) return;
        const result = await pool.query(
            `SELECT to_char(day,'YYYY-MM-DD') AS day, asistio, note, updated_at FROM aim_camp_attendance WHERE child_id = $1 ORDER BY day ASC`,
            [child.id]
        );
        res.set('Cache-Control', 'no-store');
        res.json(result.rows.map(r => ({ day: r.day, asistio: r.asistio, note: r.note, updatedAt: r.updated_at })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Admin: semanas ──
// Festivos: solo fechas válidas dentro del rango de la semana.
function cleanHolidays(holidays, startDate, endDate) {
    if (!Array.isArray(holidays)) return [];
    return [...new Set(holidays.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= startDate && d <= endDate))].sort();
}

app.post('/api/admin/camp/weeks', authenticateSession, requireAdmin, async (req, res) => {
    const { label, startDate, endDate, capacity, holidays } = req.body;
    if (!label?.trim() || !startDate || !endDate) return res.status(400).json({ error: 'Nombre, fecha de inicio y fin son obligatorios.' });
    if (endDate < startDate) return res.status(400).json({ error: 'La fecha de fin debe ser posterior a la de inicio.' });
    try {
        const result = await pool.query(
            `INSERT INTO aim_camp_weeks (label, start_date, end_date, capacity, holidays) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [label.trim(), startDate, endDate, capacity || 24, JSON.stringify(cleanHolidays(holidays, startDate, endDate))]
        );
        res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/camp/weeks/:id', authenticateSession, requireAdmin, async (req, res) => {
    const { label, startDate, endDate, capacity, holidays } = req.body;
    if (!label?.trim() || !startDate || !endDate) return res.status(400).json({ error: 'Nombre, fecha de inicio y fin son obligatorios.' });
    try {
        await pool.query(
            `UPDATE aim_camp_weeks SET label=$1, start_date=$2, end_date=$3, capacity=$4, holidays=$5 WHERE id=$6`,
            [label.trim(), startDate, endDate, capacity || 24, JSON.stringify(cleanHolidays(holidays, startDate, endDate)), req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/camp/weeks/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM aim_camp_weeks WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Admin: niños inscritos (todos, con familia y días) ──
app.get('/api/admin/camp/children', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT c.*,
                    COALESCE(json_agg(to_char(d.day,'YYYY-MM-DD') ORDER BY d.day) FILTER (WHERE d.id IS NOT NULL), '[]') AS days,
                    COALESCE(json_object_agg(to_char(d.day,'YYYY-MM-DD'),
                        json_build_object('matinal', d.matinal, 'custodia', d.custodia))
                        FILTER (WHERE d.id IS NOT NULL AND (d.matinal OR d.custodia)), '{}') AS servicios,
                    u.name || ' ' || COALESCE(u.surname,'') AS parent_name,
                    u.email AS parent_email,
                    a.name || ' ' || COALESCE(a.surname,'') AS alumno_nombre,
                    a.email AS alumno_email
             FROM aim_camp_children c
             LEFT JOIN aim_camp_child_days d ON d.child_id = c.id
             LEFT JOIN users u ON u.user_id::text = c.user_id
             LEFT JOIN users a ON a.user_id = c.alumno_id
             GROUP BY c.id, u.name, u.surname, u.email, a.name, a.surname, a.email
             ORDER BY c.apellidos ASC, c.nombre ASC`
        );
        res.set('Cache-Control', 'no-store');
        res.json(result.rows.map(mapCampChild));
    } catch (err) {
        console.error('Error fetching admin camp children:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: buscar fichas del club para vincularlas a una inscripción del campamento.
// Trae ya los datos que si no habría que teclear a mano (teléfono, edad, permiso de fotos)
// y avisa de si esa ficha ya está inscrita, para no duplicar niños.
app.get('/api/admin/camp/fichas', authenticateSession, requireAdmin, async (req, res) => {
    const termino = (req.query.q || '').trim();
    if (termino.length < 2) return res.json([]);
    const q = `%${termino}%`;
    try {
        const r = await pool.query(
            `SELECT u.user_id, u.name, u.surname, u.email, u.phone, u.birthday, u.media_consent,
                    EXISTS (SELECT 1 FROM aim_camp_children c WHERE c.alumno_id = u.user_id) AS ya_inscrito
             FROM users u
             WHERE u.club_id = $1
               AND (u.name ILIKE $2 OR u.surname ILIKE $2
                    OR (u.name || ' ' || COALESCE(u.surname,'')) ILIKE $2 OR u.email ILIKE $2)
             ORDER BY u.surname, u.name LIMIT 20`,
            [AIM_CLUB_ID, q]
        );
        res.set('Cache-Control', 'no-store');
        res.json(r.rows.map(u => ({
            id: u.user_id, nombre: u.name, apellidos: u.surname || '', email: u.email,
            contacto: u.phone || '', edad: edadDe(u.birthday), fotosRrss: !!u.media_consent,
            yaInscrito: u.ya_inscrito,
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: crear la ficha de alumno de un niño que solo venía al campamento.
// Los correos del club siguen el patrón nombre.apellido@aimeducation.es; si ya existe
// se le añade un número. La contraseña es provisional y se debe cambiar al entrar.
app.post('/api/admin/camp/children/:id/ficha', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const c = await pool.query('SELECT * FROM aim_camp_children WHERE id = $1', [req.params.id]);
        if (!c.rowCount) return res.status(404).json({ error: 'No se ha encontrado al niño.' });
        const nino = c.rows[0];
        if (nino.alumno_id) return res.status(409).json({ error: 'Este niño ya tiene ficha de alumno.' });

        const limpia = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '');
        const base = `${limpia(nino.nombre)}.${limpia(String(nino.apellidos).split(' ')[0])}`;
        let email = `${base}@aimeducation.es`;
        for (let i = 2; (await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1', [email])).rowCount; i++) {
            email = `${base}${i}@aimeducation.es`;
        }
        const hash = await bcrypt.hash(crypto.randomUUID(), 12);
        const nuevo = await pool.query(
            `INSERT INTO users (name, surname, email, password, role, club_id, phone, media_consent, requires_password_change)
             VALUES ($1,$2,$3,$4,'student',$5,$6,$7,true) RETURNING user_id`,
            [nino.nombre, nino.apellidos, email, hash, AIM_CLUB_ID, nino.contacto || null, !!nino.fotos_rrss]
        );
        const alumnoId = nuevo.rows[0].user_id;
        await pool.query('UPDATE aim_camp_children SET alumno_id = $1 WHERE id = $2', [alumnoId, nino.id]);
        res.status(201).json({ alumnoId, email });
    } catch (err) {
        console.error('Error creando ficha desde campamento:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: alta manual de un niño (secretaría).
app.post('/api/admin/camp/children', authenticateSession, requireAdmin, async (req, res) => {
    const { nombre, apellidos, edad, alergias, observaciones, contacto, recogida, fotosRrss, pagado, days, alumnoId, familiaId } = req.body;
    if (!nombre?.trim() || !apellidos?.trim()) return res.status(400).json({ error: 'Nombre y apellidos son obligatorios.' });
    const dayList = Array.isArray(days) ? [...new Set(days)] : [];
    try {
        const alumno = await validarUsuarioClub(alumnoId, 'alumno');
        if (alumno.error) return res.status(400).json({ error: alumno.error });
        const familia = await validarUsuarioClub(familiaId, 'familia');
        if (familia.error) return res.status(400).json({ error: familia.error });
        const result = await pool.query(
            `INSERT INTO aim_camp_children (user_id, alumno_id, nombre, apellidos, edad, alergias, observaciones, contacto, recogida, fotos_rrss, pagado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [familia.id, alumno.id, nombre.trim(), apellidos.trim(), edad || null, alergias?.trim() || null, observaciones?.trim() || null,
             contacto?.trim() || null, recogida?.trim() || null, !!fotosRrss, !!pagado]
        );
        const childId = result.rows[0].id;
        for (const day of dayList) {
            await pool.query(`INSERT INTO aim_camp_child_days (child_id, day) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [childId, day]);
        }
        res.status(201).json({ id: childId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: actualizar datos / pagado de un niño.
app.patch('/api/admin/camp/children/:id', authenticateSession, requireAdmin, async (req, res) => {
    const allowed = { nombre: 'nombre', apellidos: 'apellidos', edad: 'edad', alergias: 'alergias', observaciones: 'observaciones', contacto: 'contacto', recogida: 'recogida', fotosRrss: 'fotos_rrss', pagado: 'pagado' };
    const fields = [];
    const vals = [];
    for (const [key, col] of Object.entries(allowed)) {
        if (req.body[key] !== undefined) {
            fields.push(`${col} = $${fields.length + 1}`);
            vals.push(req.body[key]);
        }
    }
    // Vínculos con fichas: se validan aparte y se permite desvincular enviando null.
    for (const [key, col, etiqueta] of [['alumnoId', 'alumno_id', 'alumno'], ['familiaId', 'user_id', 'familia']]) {
        if (req.body[key] === undefined) continue;
        const v = await validarUsuarioClub(req.body[key], etiqueta);
        if (v.error) return res.status(400).json({ error: v.error });
        fields.push(`${col} = $${fields.length + 1}`);
        vals.push(v.id);
    }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar.' });
    vals.push(req.params.id);
    try {
        await pool.query(`UPDATE aim_camp_children SET ${fields.join(', ')} WHERE id = $${vals.length}`, vals);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: eliminar inscripción de un niño.
app.delete('/api/admin/camp/children/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM aim_camp_children WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: modificar los días de un niño.
app.put('/api/admin/camp/children/:id/days', authenticateSession, requireAdmin, async (req, res) => {
    const { days, servicios } = req.body;
    if (!Array.isArray(days)) return res.status(400).json({ error: 'days debe ser un array de fechas.' });
    const dayList = [...new Set(days)];
    // servicios: { 'YYYY-MM-DD': { matinal: bool, custodia: bool } }. Solo cuenta
    // lo de los días realmente elegidos.
    const srv = servicios && typeof servicios === 'object' ? servicios : {};
    try {
        await pool.query('DELETE FROM aim_camp_child_days WHERE child_id = $1', [req.params.id]);
        for (const day of dayList) {
            const s = srv[day] || {};
            await pool.query(
                `INSERT INTO aim_camp_child_days (child_id, day, matinal, custodia) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
                [req.params.id, day, !!s.matinal, !!s.custodia]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Matinal y custodia se cobran con el concepto 20401: 3 € por día y servicio, y
// 15 € si es la semana entera (5 × 3 = 15, así que el tope nunca cobra de más).
const CAMP_SERVICIO_CONCEPTO = '20401';
const CAMP_SERVICIO_DIA = 3;
const CAMP_SERVICIO_SEMANA = 15;

function importeServicio(diasMarcados) {
    return Math.min(diasMarcados * CAMP_SERVICIO_DIA, CAMP_SERVICIO_SEMANA);
}

// Agrupa los días marcados por semana del campamento y devuelve lo que toca
// cobrar a cada niño por matinal y por custodia.
async function calcularServiciosCampamento() {
    const semanas = (await pool.query('SELECT id, label, start_date, end_date FROM aim_camp_weeks ORDER BY start_date')).rows;
    const filas = (await pool.query(
        `SELECT d.day, d.matinal, d.custodia, c.id AS child_id, c.nombre, c.apellidos, c.alumno_id
         FROM aim_camp_child_days d JOIN aim_camp_children c ON c.id = d.child_id
         WHERE d.matinal OR d.custodia
         ORDER BY c.apellidos, c.nombre, d.day`
    )).rows;

    const porNino = new Map();
    for (const f of filas) {
        const sem = semanas.find(s => f.day >= s.start_date && f.day <= s.end_date);
        const claveSem = sem ? sem.id : 'sin-semana';
        const etiqueta = sem ? sem.label : 'Días sueltos';
        const inicio = sem ? sem.start_date : f.day;
        const k = `${f.child_id}|${claveSem}`;
        if (!porNino.has(k)) {
            porNino.set(k, {
                childId: f.child_id, alumnoId: f.alumno_id,
                nombre: `${f.nombre} ${f.apellidos}`, semana: etiqueta, inicio,
                matinal: 0, custodia: 0,
            });
        }
        const e = porNino.get(k);
        if (f.matinal) e.matinal++;
        if (f.custodia) e.custodia++;
    }
    return [...porNino.values()].map(e => ({
        ...e,
        importeMatinal: e.matinal ? importeServicio(e.matinal) : 0,
        importeCustodia: e.custodia ? importeServicio(e.custodia) : 0,
    }));
}

// Admin: qué se cobraría por matinal y custodia, sin tocar nada.
app.get('/api/admin/camp/servicios', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const filas = await calcularServiciosCampamento();
        res.set('Cache-Control', 'no-store');
        res.json({
            precioDia: CAMP_SERVICIO_DIA, precioSemana: CAMP_SERVICIO_SEMANA,
            total: r2Server(filas.reduce((s, f) => s + f.importeMatinal + f.importeCustodia, 0)),
            filas,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: generar los cargos pendientes de matinal y custodia. Se puede pulsar
// las veces que haga falta: primero borra los pendientes que generó antes y los
// vuelve a calcular, sin tocar jamás lo que ya se cobró.
app.post('/api/admin/camp/servicios/facturar', authenticateSession, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        const precio = await pool.query('SELECT descripcion, iva_pct FROM aim_precios WHERE concepto = $1', [CAMP_SERVICIO_CONCEPTO]);
        if (!precio.rowCount) return res.status(409).json({ error: `Falta el concepto ${CAMP_SERVICIO_CONCEPTO} en el catálogo.` });
        const { descripcion, iva_pct } = precio.rows[0];
        const filas = await calcularServiciosCampamento();

        await client.query('BEGIN');
        const borrados = await client.query(
            `DELETE FROM aim_cargos WHERE origen = 'campamento' AND concepto = $1 AND estado = 'pendiente' AND recibo_id IS NULL`,
            [CAMP_SERVICIO_CONCEPTO]
        );
        let creados = 0, sinFicha = [];
        for (const f of filas) {
            if (!f.alumnoId) { sinFicha.push(f.nombre); continue; }
            for (const [servicio, dias, importe] of [['Matinal', f.matinal, f.importeMatinal], ['Custodia', f.custodia, f.importeCustodia]]) {
                if (!dias) continue;
                await client.query(
                    `INSERT INTO aim_cargos (cliente_id, concepto, mes, descripcion, tipo, precio, iva_pct,
                                             descuento_pct, importe, target_nombre, estado, origen)
                     VALUES ($1,$2,$3,$4,'Otros',$5,$6,0,$5,$7,'pendiente','campamento')`,
                    [f.alumnoId, CAMP_SERVICIO_CONCEPTO, f.inicio,
                     `${descripcion} — ${servicio} · ${f.semana} (${dias} día${dias !== 1 ? 's' : ''})`,
                     importe, iva_pct, servicio]
                );
                creados++;
            }
        }
        await client.query('COMMIT');
        res.json({
            success: true, creados, reemplazados: borrados.rowCount,
            sinFicha: [...new Set(sinFicha)],
            total: r2Server(filas.filter(f => f.alumnoId).reduce((s, f) => s + f.importeMatinal + f.importeCustodia, 0)),
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error facturando servicios de campamento:', err);
        res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

// Admin: lista del día (pasar lista) — niños apuntados a esa fecha con su asistencia y nota.
app.get('/api/admin/camp/roster', authenticateSession, requireAdmin, async (req, res) => {
    const { day } = req.query;
    if (!day) return res.status(400).json({ error: 'Falta el parámetro day (YYYY-MM-DD).' });
    try {
        const result = await pool.query(
            `SELECT c.id, c.nombre, c.apellidos, c.edad, c.alergias, c.observaciones, c.contacto, c.recogida, c.fotos_rrss, c.pagado,
                    a.asistio, a.note, d.matinal, d.custodia,
                    u.name || ' ' || COALESCE(u.surname,'') AS parent_name, u.email AS parent_email
             FROM aim_camp_child_days d
             JOIN aim_camp_children c ON c.id = d.child_id
             LEFT JOIN aim_camp_attendance a ON a.child_id = c.id AND a.day = d.day
             LEFT JOIN users u ON u.user_id::text = c.user_id
             WHERE d.day = $1
             ORDER BY c.apellidos ASC, c.nombre ASC`,
            [day]
        );
        res.set('Cache-Control', 'no-store');
        res.json(result.rows.map(r => ({
            id: r.id, nombre: r.nombre, apellidos: r.apellidos, edad: r.edad,
            alergias: r.alergias, observaciones: r.observaciones, contacto: r.contacto,
            recogida: r.recogida, fotosRrss: r.fotos_rrss, pagado: r.pagado,
            asistio: r.asistio, note: r.note,
            matinal: !!r.matinal, custodia: !!r.custodia,
            parentName: r.parent_name, parentEmail: r.parent_email,
        })));
    } catch (err) {
        console.error('Error fetching camp roster:', err);
        res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// FACTURACIÓN
// =============================================================================

// Admin: recalcular un recibo a partir de sus líneas, sin guardar nada.
// Es lo que usará el TPV para refrescar totales según se añaden/quitan líneas.
app.post('/api/admin/billing/simular', authenticateSession, requireAdmin, (req, res) => {
    const { lineas } = req.body;
    if (!Array.isArray(lineas)) return res.status(400).json({ error: 'lineas debe ser un array.' });
    try {
        res.json(calcularRecibo(lineas));
    } catch (err) {
        console.error('Error simulando recibo:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: qué mes toca generar hoy (por adelantado, con corte el día 5).
app.get('/api/admin/billing/mes-a-generar', authenticateSession, requireAdmin, (req, res) => {
    res.json({ mes: mesAGenerar() });
});

// ── Temporadas ──
app.get('/api/admin/billing/temporadas', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM aim_temporadas ORDER BY activa DESC, nombre DESC');
        res.set('Cache-Control', 'no-store');
        res.json(r.rows.map(t => ({ id: t.id, nombre: t.nombre, activa: t.activa })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/billing/temporadas', authenticateSession, requireAdmin, async (req, res) => {
    const { nombre } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    try {
        const r = await pool.query('INSERT INTO aim_temporadas (nombre) VALUES ($1) RETURNING id', [nombre.trim()]);
        res.status(201).json({ id: r.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Activar una temporada: solo puede haber una activa a la vez.
app.put('/api/admin/billing/temporadas/:id/activar', authenticateSession, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE aim_temporadas SET activa = false WHERE activa = true');
        const r = await client.query('UPDATE aim_temporadas SET activa = true WHERE id = $1 RETURNING id', [req.params.id]);
        if (r.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Temporada no encontrada.' }); }
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

app.delete('/api/admin/billing/temporadas/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM aim_temporadas WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(409).json({ error: 'No se puede borrar: tiene conceptos o fichas asociadas.' }); }
});

// ── Catálogo de precios ──
app.get('/api/admin/billing/precios', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const soloActivos = req.query.all !== '1';
        const r = await pool.query(
            `SELECT * FROM aim_precios ${soloActivos ? 'WHERE activo = true' : ''} ORDER BY tipo, descripcion`
        );
        res.set('Cache-Control', 'no-store');
        res.json(r.rows.map(p => ({
            concepto: p.concepto, descripcion: p.descripcion, precio: Number(p.precio),
            tipo: p.tipo, ivaPct: Number(p.iva_pct), activo: p.activo,
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const TIPOS_CONCEPTO = ['Mensualidad', 'Material', 'Otros'];

app.post('/api/admin/billing/precios', authenticateSession, requireAdmin, async (req, res) => {
    const { concepto, descripcion, precio, tipo, ivaPct } = req.body;
    if (!concepto?.trim() || !descripcion?.trim()) return res.status(400).json({ error: 'Código y descripción son obligatorios.' });
    if (!TIPOS_CONCEPTO.includes(tipo)) return res.status(400).json({ error: `Tipo no válido. Debe ser: ${TIPOS_CONCEPTO.join(', ')}.` });
    if (Number(precio) < 0) return res.status(400).json({ error: 'El precio no puede ser negativo.' });
    try {
        await pool.query(
            `INSERT INTO aim_precios (concepto, descripcion, precio, tipo, iva_pct) VALUES ($1,$2,$3,$4,$5)`,
            [concepto.trim(), descripcion.trim(), Number(precio) || 0, tipo, Number(ivaPct) || 0]
        );
        res.status(201).json({ concepto: concepto.trim() });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un concepto con ese código.' });
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/billing/precios/:concepto', authenticateSession, requireAdmin, async (req, res) => {
    const { descripcion, precio, tipo, ivaPct, activo } = req.body;
    if (!descripcion?.trim()) return res.status(400).json({ error: 'La descripción es obligatoria.' });
    if (!TIPOS_CONCEPTO.includes(tipo)) return res.status(400).json({ error: `Tipo no válido. Debe ser: ${TIPOS_CONCEPTO.join(', ')}.` });
    if (Number(precio) < 0) return res.status(400).json({ error: 'El precio no puede ser negativo.' });
    try {
        // Cambiar el precio aquí NO altera los cargos ya generados: cada cargo
        // guarda su propio precio congelado.
        const r = await pool.query(
            `UPDATE aim_precios SET descripcion=$1, precio=$2, tipo=$3, iva_pct=$4, activo=$5, updated_at=NOW()
             WHERE concepto=$6 RETURNING concepto`,
            [descripcion.trim(), Number(precio) || 0, tipo, Number(ivaPct) || 0, activo !== false, req.params.concepto]
        );
        if (r.rowCount === 0) return res.status(404).json({ error: 'Concepto no encontrado.' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/billing/precios/:concepto', authenticateSession, requireAdmin, async (req, res) => {
    try {
        // Si ya se ha usado en algún cargo, no se borra: se desactiva, para no
        // perder el histórico.
        const usado = await pool.query('SELECT 1 FROM aim_cargos WHERE concepto = $1 LIMIT 1', [req.params.concepto]);
        if (usado.rowCount > 0) {
            await pool.query('UPDATE aim_precios SET activo = false WHERE concepto = $1', [req.params.concepto]);
            return res.json({ success: true, desactivado: true });
        }
        await pool.query('DELETE FROM aim_precios WHERE concepto = $1', [req.params.concepto]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Clases reales de aim-tul (solo lectura) para las listas de facturación ──
// Nunca escribimos en aim-tul; solo leemos actividades y grupos del club.
app.get('/api/admin/billing/aimtul', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const acts = await pool.query(
            `SELECT activity_id, name FROM tul_activities WHERE club_id = $1 ORDER BY name`, [AIM_CLUB_ID]
        );
        const groups = await pool.query(
            `SELECT g.group_id, g.name, g.activity_id, a.name AS activity_name
             FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
             WHERE a.club_id = $1 ORDER BY a.name, g.name`, [AIM_CLUB_ID]
        );
        res.set('Cache-Control', 'no-store');
        res.json({
            activities: acts.rows.map(a => ({ id: a.activity_id, name: a.name })),
            groups: groups.rows.map(g => ({ id: g.group_id, name: g.name, activityId: g.activity_id, activityName: g.activity_name })),
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Catálogo de clases (propio) ──
app.get('/api/admin/billing/clases', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const soloActivas = req.query.all !== '1';
        const r = await pool.query(
            `SELECT * FROM aim_clases ${soloActivas ? 'WHERE activa = true' : ''} ORDER BY actividad NULLS LAST, nombre`
        );
        res.set('Cache-Control', 'no-store');
        res.json(r.rows.map(c => ({
            id: c.id, nombre: c.nombre, actividad: c.actividad, origen: c.origen,
            aimtulGroupId: c.aimtul_group_id, activa: c.activa,
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Actividades disponibles para "cobrar por actividad": las de las clases del
// catálogo más las de aim-tul (por si aún no se ha importado ninguna).
app.get('/api/admin/billing/actividades', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const cat = await pool.query(`SELECT DISTINCT actividad FROM aim_clases WHERE actividad IS NOT NULL AND activa = true`);
        const tul = await pool.query(`SELECT name FROM tul_activities WHERE club_id = $1`, [AIM_CLUB_ID]);
        const set = new Set([...cat.rows.map(r => r.actividad), ...tul.rows.map(r => r.name)].filter(Boolean));
        res.set('Cache-Control', 'no-store');
        res.json([...set].sort((a, b) => a.localeCompare(b, 'es')));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/billing/clases', authenticateSession, requireAdmin, async (req, res) => {
    const { nombre, actividad } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre de la clase es obligatorio.' });
    try {
        const id = crypto.randomUUID();
        await pool.query(
            `INSERT INTO aim_clases (id, nombre, actividad) VALUES ($1,$2,$3)`,
            [id, nombre.trim(), actividad?.trim() || null]
        );
        res.status(201).json({ id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/billing/clases/:id', authenticateSession, requireAdmin, async (req, res) => {
    const { nombre, actividad, activa } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre de la clase es obligatorio.' });
    try {
        const r = await pool.query(
            `UPDATE aim_clases SET nombre=$1, actividad=$2, activa=$3 WHERE id=$4 RETURNING id`,
            [nombre.trim(), actividad?.trim() || null, activa !== false, req.params.id]
        );
        if (r.rowCount === 0) return res.status(404).json({ error: 'Clase no encontrada.' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/billing/clases/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
        // Si está en uso (fichas), se desactiva en vez de borrarse.
        const usada = await pool.query(`SELECT 1 FROM aim_matriculas WHERE clase_ref = $1 AND clase_origen = 'custom' LIMIT 1`, [req.params.id]);
        if (usada.rowCount > 0) {
            await pool.query('UPDATE aim_clases SET activa = false WHERE id = $1', [req.params.id]);
            return res.json({ success: true, desactivada: true });
        }
        await pool.query('DELETE FROM aim_clases WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Resuelve nombre y actividad de una clase (aim-tul en vivo o propia).
async function resolverClase(ref, origen) {
    if (origen === 'custom') {
        const r = await pool.query('SELECT nombre, actividad FROM aim_clases WHERE id = $1', [ref]);
        return r.rows[0] ? { nombre: r.rows[0].nombre, actividad: r.rows[0].actividad } : null;
    }
    const r = await pool.query(
        `SELECT g.name AS nombre, a.name AS actividad
         FROM tul_groups g JOIN tul_activities a ON a.activity_id = g.activity_id
         WHERE g.group_id = $1 AND a.club_id = $2`, [ref, AIM_CLUB_ID]
    );
    return r.rows[0] || null;
}

// ── Conceptos por temporada (qué se cobra: por actividad o por clase) ──
app.get('/api/admin/billing/conceptos', authenticateSession, requireAdmin, async (req, res) => {
    const { temporadaId } = req.query;
    try {
        const r = await pool.query(
            `SELECT ct.id, ct.concepto, ct.target_tipo, ct.target_ref, ct.target_origen, ct.target_actividad, ct.target_nombre, ct.temporada_id,
                    p.descripcion, p.precio, p.tipo, p.iva_pct
             FROM aim_conceptos_temporada ct
             JOIN aim_precios p ON p.concepto = ct.concepto
             ${temporadaId ? 'WHERE ct.temporada_id = $1' : ''}
             ORDER BY ct.target_tipo, ct.target_nombre, p.descripcion`,
            temporadaId ? [temporadaId] : []
        );
        res.set('Cache-Control', 'no-store');
        res.json(r.rows.map(c => ({
            id: c.id, concepto: c.concepto, targetTipo: c.target_tipo,
            targetRef: c.target_ref, targetOrigen: c.target_origen, targetActividad: c.target_actividad, targetNombre: c.target_nombre,
            temporadaId: c.temporada_id,
            descripcion: c.descripcion, precio: Number(c.precio), tipo: c.tipo, ivaPct: Number(c.iva_pct),
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/billing/conceptos', authenticateSession, requireAdmin, async (req, res) => {
    const { concepto, targetTipo, targetRef, targetOrigen, targetActividad, temporadaId } = req.body;
    if (!concepto || !temporadaId) return res.status(400).json({ error: 'Concepto y temporada son obligatorios.' });
    if (!['actividad', 'clase'].includes(targetTipo)) return res.status(400).json({ error: 'El destino debe ser actividad o clase.' });
    try {
        let targetNombre, origen = null;
        if (targetTipo === 'clase') {
            if (!targetRef || !['aimtul', 'custom'].includes(targetOrigen)) return res.status(400).json({ error: 'Falta la clase.' });
            const cl = await resolverClase(targetRef, targetOrigen);
            if (!cl) return res.status(400).json({ error: 'Clase no válida.' });
            targetNombre = cl.nombre;
            origen = targetOrigen;
        } else {
            if (!targetActividad?.trim()) return res.status(400).json({ error: 'Falta la actividad.' });
            targetNombre = targetActividad.trim();
        }
        const r = await pool.query(
            `INSERT INTO aim_conceptos_temporada (concepto, target_tipo, target_ref, target_origen, target_actividad, target_nombre, temporada_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [concepto, targetTipo, targetTipo === 'clase' ? targetRef : null, origen, targetTipo === 'actividad' ? targetActividad.trim() : null, targetNombre, temporadaId]
        );
        res.status(201).json({ id: r.rows[0].id });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ese concepto ya está asignado a ese destino en esta temporada.' });
        if (err.code === '22P02') return res.status(400).json({ error: 'Destino no válido.' });
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/billing/conceptos/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM aim_conceptos_temporada WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Fichas / matrículas ──
app.get('/api/admin/billing/matriculas', authenticateSession, requireAdmin, async (req, res) => {
    const { temporadaId, userId } = req.query;
    const where = ['u.club_id = $1'];
    const vals = [AIM_CLUB_ID];
    if (temporadaId) { vals.push(temporadaId); where.push(`m.temporada_id = $${vals.length}`); }
    if (userId) { vals.push(userId); where.push(`m.user_id = $${vals.length}`); }
    try {
        const r = await pool.query(
            `SELECT m.*, u.name, u.surname, u.email
             FROM aim_matriculas m
             JOIN users u ON u.user_id = m.user_id
             WHERE ${where.join(' AND ')}
             ORDER BY u.name, u.surname, m.clase_nombre`,
            vals
        );
        res.set('Cache-Control', 'no-store');
        res.json(r.rows.map(m => ({
            id: m.id, userId: m.user_id, nombre: m.name, apellidos: m.surname, email: m.email,
            claseRef: m.clase_ref, claseOrigen: m.clase_origen, claseNombre: m.clase_nombre, actividad: m.actividad,
            temporadaId: m.temporada_id, descuentoPct: Number(m.descuento_pct), alta: m.alta, baja: m.baja,
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/billing/matriculas', authenticateSession, requireAdmin, async (req, res) => {
    const { userId, claseRef, claseOrigen, temporadaId, descuentoPct, alta, baja } = req.body;
    if (!userId || !claseRef || !temporadaId) return res.status(400).json({ error: 'Alumno, clase y temporada son obligatorios.' });
    if (!['aimtul', 'custom'].includes(claseOrigen)) return res.status(400).json({ error: 'Origen de clase no válido.' });
    const dto = Number(descuentoPct) || 0;
    if (dto < 0 || dto > 100) return res.status(400).json({ error: 'El descuento debe estar entre 0 y 100.' });
    try {
        // Snapshot del nombre/actividad, para no depender de aim-tul al facturar.
        const cl = await resolverClase(claseRef, claseOrigen);
        if (!cl) return res.status(400).json({ error: 'Clase no válida.' });
        const r = await pool.query(
            `INSERT INTO aim_matriculas (user_id, clase_ref, clase_origen, clase_nombre, actividad, temporada_id, descuento_pct, alta, baja)
             VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8::date, CURRENT_DATE), $9::date) RETURNING id`,
            [userId, claseRef, claseOrigen, cl.nombre, cl.actividad, temporadaId, dto, alta || null, baja || null]
        );
        res.status(201).json({ id: r.rows[0].id });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ese alumno ya tiene ficha en esa clase esta temporada.' });
        if (err.code === '22P02') return res.status(400).json({ error: 'Clase no válida.' });
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/billing/matriculas/:id', authenticateSession, requireAdmin, async (req, res) => {
    const { descuentoPct, alta, baja } = req.body;
    const dto = Number(descuentoPct) || 0;
    if (dto < 0 || dto > 100) return res.status(400).json({ error: 'El descuento debe estar entre 0 y 100.' });
    try {
        const r = await pool.query(
            `UPDATE aim_matriculas SET descuento_pct = $1, alta = COALESCE($2::date, alta), baja = $3::date
             WHERE id = $4 RETURNING id`,
            [dto, alta || null, baja || null, req.params.id]
        );
        if (r.rowCount === 0) return res.status(404).json({ error: 'Ficha no encontrada.' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/billing/matriculas/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM aim_matriculas WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Generación mensual de cargos ──
// Candidatos = (ficha × concepto que le aplica) de la temporada activa, con la
// ficha vigente ese mes. Se congela precio/IVA/descripción/tipo del catálogo y
// el descuento manual de la ficha. El descuento por nº de mensualidades NO se
// congela: se calcula al cobrar (depende de la composición del recibo).
function normalizaMes(mes) {
    if (!mes) return mesAGenerar();
    const s = String(mes).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(0, 7)}-01` : mesAGenerar();
}

// El destino del cargo: por clase → la clase concreta (un cargo por clase);
// por actividad → NULL (un cargo por alumno aunque esté en varios grupos).
const SQL_TARGET_REF = `(CASE WHEN ct.target_tipo = 'clase' THEN ct.target_ref ELSE NULL END)`;
const SQL_JOIN_FICHA = `JOIN aim_matriculas m ON m.temporada_id = ct.temporada_id AND (
      (ct.target_tipo = 'clase' AND m.clase_ref = ct.target_ref)
   OR (ct.target_tipo = 'actividad' AND m.actividad = ct.target_actividad)
 )`;
const SQL_FILTRO_VIGENTE = `m.alta <= ($2::date + INTERVAL '1 month - 1 day') AND (m.baja IS NULL OR m.baja >= $2::date)`;

async function candidatosGeneracion(temporadaId, mes) {
    // DISTINCT ON (alumno, concepto, destino): un cargo por cada destino; si una
    // misma clase casa dos veces, el mejor descuento para el alumno.
    const r = await pool.query(
        `SELECT DISTINCT ON (m.user_id, ct.concepto, ${SQL_TARGET_REF})
                m.user_id, u.name, u.surname, ct.concepto, ${SQL_TARGET_REF} AS target_ref,
                p.descripcion, p.tipo, p.precio, p.iva_pct, m.descuento_pct,
                EXISTS (SELECT 1 FROM aim_cargos c WHERE c.cliente_id = m.user_id AND c.concepto = ct.concepto
                        AND c.mes = $2::date AND c.target_ref IS NOT DISTINCT FROM ${SQL_TARGET_REF}) AS ya_existe
         FROM aim_conceptos_temporada ct
         JOIN aim_precios p ON p.concepto = ct.concepto AND p.activo = true
         ${SQL_JOIN_FICHA}
         JOIN users u ON u.user_id = m.user_id
         WHERE ct.temporada_id = $1 AND ${SQL_FILTRO_VIGENTE}
         ORDER BY m.user_id, ct.concepto, ${SQL_TARGET_REF}, m.descuento_pct DESC`,
        [temporadaId, mes]
    );
    return r.rows;
}

// Previsualizar: cuántos cargos se crearían, sin insertar nada.
app.get('/api/admin/billing/generar/preview', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const temp = await pool.query('SELECT id, nombre FROM aim_temporadas WHERE activa = true');
        if (temp.rowCount === 0) return res.status(400).json({ error: 'No hay temporada activa.' });
        const mes = normalizaMes(req.query.mes);
        const rows = await candidatosGeneracion(temp.rows[0].id, mes);
        const nuevos = rows.filter(r => !r.ya_existe);
        res.set('Cache-Control', 'no-store');
        res.json({
            mes, temporada: temp.rows[0].nombre,
            nuevos: nuevos.length,
            yaExistian: rows.length - nuevos.length,
            totalAlumnos: new Set(nuevos.map(r => r.user_id)).size,
            importeBase: r2Server(nuevos.reduce((s, r) => s + Number(r.precio) * (1 - Number(r.descuento_pct) / 100), 0)),
            detalle: nuevos.slice(0, 200).map(r => ({
                nombre: `${r.name} ${r.surname}`, concepto: r.descripcion,
                precio: Number(r.precio), descuentoPct: Number(r.descuento_pct),
            })),
        });
    } catch (err) {
        console.error('Error preview generación:', err);
        res.status(500).json({ error: err.message });
    }
});

function r2Server(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

// Generar: inserta los cargos que falten (idempotente por (cliente, concepto, mes)).
app.post('/api/admin/billing/generar', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const temp = await pool.query('SELECT id, nombre FROM aim_temporadas WHERE activa = true');
        if (temp.rowCount === 0) return res.status(400).json({ error: 'No hay temporada activa.' });
        const mes = normalizaMes(req.body.mes);
        const r = await pool.query(
            `INSERT INTO aim_cargos (cliente_id, concepto, mes, descripcion, tipo, precio, iva_pct, descuento_pct, target_ref, target_nombre, actividad, estado)
             SELECT DISTINCT ON (m.user_id, ct.concepto, ${SQL_TARGET_REF})
                    m.user_id, ct.concepto, $2::date, p.descripcion, p.tipo, p.precio, p.iva_pct, m.descuento_pct,
                    ${SQL_TARGET_REF}, ct.target_nombre, m.actividad, 'pendiente'
             FROM aim_conceptos_temporada ct
             JOIN aim_precios p ON p.concepto = ct.concepto AND p.activo = true
             ${SQL_JOIN_FICHA}
             WHERE ct.temporada_id = $1 AND ${SQL_FILTRO_VIGENTE}
             ORDER BY m.user_id, ct.concepto, ${SQL_TARGET_REF}, m.descuento_pct DESC
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [temp.rows[0].id, mes]
        );
        res.json({ success: true, mes, creados: r.rowCount });
    } catch (err) {
        console.error('Error generando cargos:', err);
        res.status(500).json({ error: err.message });
    }
});

// Listar cargos (pendientes por defecto), opcionalmente por mes o alumno.
app.get('/api/admin/billing/cargos', authenticateSession, requireAdmin, async (req, res) => {
    const { mes, clienteId, estado } = req.query;
    const where = [];
    const vals = [];
    if (mes) { vals.push(normalizaMes(mes)); where.push(`c.mes = $${vals.length}::date`); }
    if (clienteId) { vals.push(clienteId); where.push(`c.cliente_id = $${vals.length}`); }
    if (estado) { vals.push(estado); where.push(`c.estado = $${vals.length}`); }
    try {
        const r = await pool.query(
            `SELECT c.*, u.name, u.surname
             FROM aim_cargos c JOIN users u ON u.user_id = c.cliente_id
             ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
             ORDER BY u.surname, u.name, c.mes DESC`,
            vals
        );
        res.set('Cache-Control', 'no-store');
        res.json(r.rows.map(c => ({
            id: c.id, clienteId: c.cliente_id, nombre: c.name, apellidos: c.surname,
            concepto: c.concepto, mes: c.mes, descripcion: c.descripcion, tipo: c.tipo,
            precio: Number(c.precio), ivaPct: Number(c.iva_pct), descuentoPct: Number(c.descuento_pct),
            importe: c.importe == null ? null : Number(c.importe), reciboId: c.recibo_id, estado: c.estado,
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Borrar un cargo pendiente (aún no cobrado / sin recibo).
app.delete('/api/admin/billing/cargos/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const r = await pool.query(
            `DELETE FROM aim_cargos WHERE id = $1 AND estado = 'pendiente' AND recibo_id IS NULL RETURNING id`,
            [req.params.id]
        );
        if (r.rowCount === 0) return res.status(409).json({ error: 'Solo se pueden borrar cargos pendientes sin recibo.' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TPV / Cobro ──
// Datos fiscales del emisor para el ticket (autónomo del club).
const EMPRESA_TICKET = {
    nombre: 'Darío Francisco Jiménez España',
    nif: '75896712R',
    direccion: 'Urb. Terrazas de Doña Lola, Local 1',
    cp: '11203 Algeciras (Cádiz)',
    web: 'www.aimeducation.es',
    email: 'info@aimeducation.es',
    tel: '956 742 216',
};
const MEDIOS_PAGO = ['tarjeta', 'bizum', 'efectivo', 'transferencia'];

function edadDe(birthday) {
    if (!birthday) return null;
    const b = new Date(birthday);
    const diff = Date.now() - b.getTime();
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

// Cluster familiar de una persona (ambos sentidos del parentesco) + ella misma.
async function familiaIds(personaId) {
    const r = await pool.query(
        `SELECT familiar_id AS id FROM aim_familias WHERE persona_id = $1
         UNION SELECT persona_id FROM aim_familias WHERE familiar_id = $1`,
        [personaId]
    );
    return [personaId, ...r.rows.map(x => x.id)];
}

const cargoParaMotor = (c) => ({
    id: c.id, concepto: c.concepto, descripcion: c.descripcion, tipo: c.tipo,
    mes: c.mes, precio: Number(c.precio), ivaPct: Number(c.iva_pct), descuentoPct: Number(c.descuento_pct),
});

// Buscar personas del club por nombre/apellidos. Devuelve también el email y
// cuántos cargos pendientes tiene su familia: con cuentas duplicadas (mismo
// nombre) es la única forma de saber cuál es la buena antes de seleccionarla.
app.get('/api/admin/billing/tpv/buscar', authenticateSession, requireAdmin, async (req, res) => {
    const q = `%${(req.query.q || '').trim()}%`;
    try {
        const r = await pool.query(
            `SELECT u.user_id, u.name, u.surname, u.email, u.birthday,
                    (SELECT COUNT(*) FROM aim_cargos c
                      WHERE c.estado = 'pendiente' AND c.recibo_id IS NULL
                        AND (c.cliente_id = u.user_id
                          OR c.cliente_id IN (SELECT familiar_id FROM aim_familias WHERE persona_id = u.user_id)
                          OR c.cliente_id IN (SELECT persona_id FROM aim_familias WHERE familiar_id = u.user_id)))::int AS pendientes
             FROM users u
             WHERE u.club_id = $1 AND (u.name ILIKE $2 OR u.surname ILIKE $2 OR (u.name || ' ' || u.surname) ILIKE $2)
             ORDER BY pendientes DESC, u.surname, u.name LIMIT 25`,
            [AIM_CLUB_ID, q]
        );
        res.set('Cache-Control', 'no-store');
        res.json(r.rows.map(u => {
            const edad = edadDe(u.birthday);
            return {
                id: u.user_id, nombre: u.name, apellidos: u.surname, email: u.email,
                edad, esMenor: edad != null && edad < 18, pendientes: u.pendientes,
            };
        }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cesta: cargos pendientes de toda la familia del pagador + totales en vivo.
app.get('/api/admin/billing/tpv/cesta', authenticateSession, requireAdmin, async (req, res) => {
    const { pagadorId } = req.query;
    if (!pagadorId) return res.status(400).json({ error: 'Falta el pagador.' });
    try {
        const fam = await familiaIds(pagadorId);
        const cargos = await pool.query(
            `SELECT c.*, u.name, u.surname FROM aim_cargos c JOIN users u ON u.user_id = c.cliente_id
             WHERE c.cliente_id = ANY($1::uuid[]) AND c.estado = 'pendiente' AND c.recibo_id IS NULL
             ORDER BY u.surname, u.name, c.mes`,
            [fam]
        );
        const familia = await pool.query(
            `SELECT user_id, name, surname, birthday FROM users WHERE user_id = ANY($1::uuid[]) ORDER BY birthday NULLS FIRST`,
            [fam]
        );
        const preview = calcularRecibo(cargos.rows.map(cargoParaMotor));
        res.set('Cache-Control', 'no-store');
        res.json({
            familia: familia.rows.map(u => {
                const edad = edadDe(u.birthday);
                return { id: u.user_id, nombre: u.name, apellidos: u.surname, edad, esMenor: edad != null && edad < 18 };
            }),
            cargos: cargos.rows.map(c => ({
                id: c.id, clienteId: c.cliente_id, nombre: c.name, apellidos: c.surname,
                concepto: c.concepto, descripcion: c.descripcion, tipo: c.tipo, mes: c.mes,
                precio: Number(c.precio), ivaPct: Number(c.iva_pct), descuentoPct: Number(c.descuento_pct),
            })),
            preview,
        });
    } catch (err) {
        console.error('Error cesta TPV:', err);
        res.status(500).json({ error: err.message });
    }
});

// Cobrar: crea el recibo, congela los cargos y devuelve el ticket. El importe
// se calcula SIEMPRE en el servidor (nunca se confía en el cliente).
app.post('/api/admin/billing/tpv/cobrar', authenticateSession, requireAdmin, async (req, res) => {
    const { pagadorId, lineas, extras, medioPago, entregado } = req.body;
    if (!pagadorId) return res.status(400).json({ error: 'Falta el pagador.' });
    if (!MEDIOS_PAGO.includes(medioPago)) return res.status(400).json({ error: 'Medio de pago no válido.' });
    const idsSel = Array.isArray(lineas) ? lineas.map(l => l.cargoId).filter(Boolean) : [];
    const extrasArr = Array.isArray(extras) ? extras : [];
    if (idsSel.length === 0 && extrasArr.length === 0) return res.status(400).json({ error: 'No hay nada que cobrar.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1) Overrides de descuento en líneas existentes.
        for (const l of (lineas || [])) {
            if (l.descuentoPct != null) {
                const d = Number(l.descuentoPct);
                if (d < 0 || d > 100) throw { httP: 400, msg: 'Descuento fuera de rango.' };
                await client.query(`UPDATE aim_cargos SET descuento_pct = $1 WHERE id = $2 AND estado = 'pendiente' AND recibo_id IS NULL`, [d, l.cargoId]);
            }
        }

        // 2) Crear cargos "extra" (venta al momento: material, etc.).
        const mesActual = new Date().toISOString().slice(0, 7) + '-01';
        const extraIds = [];
        for (const ex of extrasArr) {
            const pr = await client.query(`SELECT descripcion, tipo, precio, iva_pct FROM aim_precios WHERE concepto = $1 AND activo = true`, [ex.concepto]);
            if (pr.rowCount === 0) throw { httP: 400, msg: `Concepto no válido: ${ex.concepto}` };
            const p = pr.rows[0];
            const d = Number(ex.descuentoPct) || 0;
            const ins = await client.query(
                `INSERT INTO aim_cargos (cliente_id, concepto, mes, descripcion, tipo, precio, iva_pct, descuento_pct, estado, origen)
                 VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,'pendiente','manual') RETURNING id`,
                [ex.clienteId || pagadorId, ex.concepto, mesActual, p.descripcion, p.tipo, p.precio, p.iva_pct, d]
            );
            extraIds.push(ins.rows[0].id);
        }

        // 3) Cargar todos los cargos a cobrar (bloqueados), validando estado.
        const allIds = [...idsSel, ...extraIds];
        const cs = await client.query(
            `SELECT * FROM aim_cargos WHERE id = ANY($1::int[]) AND estado = 'pendiente' AND recibo_id IS NULL FOR UPDATE`,
            [allIds]
        );
        if (cs.rowCount === 0) throw { httP: 409, msg: 'Los cargos ya no están disponibles.' };

        // 4) Calcular importes (autoritativo).
        const calc = calcularRecibo(cs.rows.map(cargoParaMotor));
        const total = calc.total;
        const entregadoNum = medioPago === 'efectivo' ? (Number(entregado) || total) : total;
        const cambio = r2Server(entregadoNum - total);
        if (cambio < 0) throw { httP: 400, msg: 'El importe entregado es menor que el total.' };

        // 5) Número de recibo por secuencia (atómico).
        const num = (await client.query(`SELECT nextval('aim_recibos_numero_seq') AS n`)).rows[0].n;
        const rec = await client.query(
            `INSERT INTO aim_recibos (numero, pagador_id, fecha, importe, medio_pago, entregado, cambio, estado, cobrado_por, cobrado_at)
             VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,$6,'cobrado',$7,NOW()) RETURNING id, numero, fecha`,
            [num, pagadorId, total, medioPago, entregadoNum, cambio, req.userSession.userId]
        );
        const reciboId = rec.rows[0].id;

        // 6) Congelar cada cargo en el recibo.
        for (const d of calc.detalle) {
            await client.query(
                `UPDATE aim_cargos SET recibo_id = $1, descuento_mens_pct = $2, importe = $3, estado = 'cobrado' WHERE id = $4`,
                [reciboId, d.descuentoMensPct, d.base, d.id]
            );
        }

        // Datos del pagador para el ticket.
        const pg = await client.query(`SELECT name, surname FROM users WHERE user_id = $1`, [pagadorId]);

        // La factura queda anotada en el registro encadenado dentro de la misma
        // transacción: si el registro falla, el cobro no se llega a emitir.
        await registrarFactura(client, {
            recibo: { ...rec.rows[0], id: reciboId, serie: rec.rows[0].serie || 'A', tipo: 'normal' },
            receptor: { nombre: pg.rows[0] ? `${pg.rows[0].name} ${pg.rows[0].surname || ''}`.trim() : null },
            descripcion: calc.detalle.map(d => d.descripcion).join('; ').slice(0, 500),
            base: calc.baseTotal, cuota: calc.ivaTotal, total,
            userId: req.userSession.userId,
        });

        await client.query('COMMIT');

        res.json({
            recibo: {
                id: reciboId, numero: rec.rows[0].numero, fecha: rec.rows[0].fecha,
                pagador: pg.rows[0] ? `${pg.rows[0].name} ${pg.rows[0].surname}` : '',
                medioPago, entregado: entregadoNum, cambio, total,
            },
            detalle: calc.detalle.map(d => ({
                descripcion: d.descripcion, mes: d.mes, precio: d.precio,
                descuentoPct: d.descuentoPct, descuentoMensPct: d.descuentoMensPct,
                ivaPct: d.ivaPct, base: d.base, total: d.total,
            })),
            basesPorIva: calc.basesPorIva, baseTotal: calc.baseTotal, ivaTotal: calc.ivaTotal, ahorro: calc.ahorro,
            empresa: EMPRESA_TICKET,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err && err.httP) return res.status(err.httP).json({ error: err.msg });
        console.error('Error cobrando:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// ── Histórico de recibos, reimpresión y anulación ──

// Nº visible: la serie 'A' (normal) se muestra sin prefijo; la 'R' como R-n.
const numeroVisible = (rec) => (rec.serie === 'R' ? `R-${rec.numero}` : `${rec.numero}`);

// Monta el objeto de ticket (mismo formato que devuelve el cobro).
async function ticketDeRecibo(reciboId) {
    const r = await pool.query(
        `SELECT rc.*, u.name, u.surname,
                o.numero AS orig_numero, o.serie AS orig_serie, o.fecha AS orig_fecha
         FROM aim_recibos rc
         LEFT JOIN users u ON u.user_id = rc.pagador_id
         LEFT JOIN aim_recibos o ON o.id = rc.rectifica_id
         WHERE rc.id = $1`, [reciboId]
    );
    if (r.rowCount === 0) return null;
    const rec = r.rows[0];
    let detalle;
    if (rec.tipo === 'rectificativo') {
        // Las líneas del rectificativo son copias fijas, no cargos.
        const ls = await pool.query(
            `SELECT * FROM aim_recibo_rect_lineas WHERE recibo_id = $1 ORDER BY id`, [reciboId]
        );
        detalle = ls.rows.map(l => {
            const base = Number(l.base);
            const ivaPct = Number(l.iva_pct);
            return {
                descripcion: l.descripcion, cliente: l.cliente_nombre || '', mes: l.mes,
                precio: base, descuentoPct: 0, descuentoMensPct: 0,
                ivaPct, base, total: r2Server(base + base * ivaPct / 100),
            };
        });
    } else {
        const cs = await pool.query(
            `SELECT c.*, u.name, u.surname FROM aim_cargos c JOIN users u ON u.user_id = c.cliente_id
             WHERE c.recibo_id = $1 ORDER BY u.surname, u.name, c.mes`, [reciboId]
        );
        detalle = cs.rows.map(c => {
            const base = Number(c.importe ?? 0);
            const ivaPct = Number(c.iva_pct);
            return {
                cargoId: c.id,
                descripcion: c.descripcion, cliente: `${c.name} ${c.surname}`, mes: c.mes,
                precio: Number(c.precio), descuentoPct: Number(c.descuento_pct),
                descuentoMensPct: c.descuento_mens_pct == null ? 0 : Number(c.descuento_mens_pct),
                // El recibo sigue mostrando la línea (es un documento, no cambia), pero
                // marcada: ya se rectificó antes y no se puede volver a rectificar.
                rectificada: c.estado === 'rectificado',
                ivaPct, base, total: r2Server(base + base * ivaPct / 100),
            };
        });
    }
    const grupos = new Map();
    for (const d of detalle) {
        const g = grupos.get(d.ivaPct) || { ivaPct: d.ivaPct, base: 0, iva: 0 };
        g.base = r2Server(g.base + d.base);
        grupos.set(d.ivaPct, g);
    }
    for (const g of grupos.values()) g.iva = r2Server(g.base * g.ivaPct / 100);
    return {
        recibo: {
            id: rec.id, numero: numeroVisible(rec), serie: rec.serie, tipo: rec.tipo, fecha: rec.fecha,
            pagador: rec.name ? `${rec.name} ${rec.surname}` : '(sin pagador)',
            medioPago: rec.medio_pago, entregado: Number(rec.entregado ?? 0), cambio: Number(rec.cambio ?? 0),
            total: Number(rec.importe ?? 0), estado: rec.estado,
            anuladoMotivo: rec.anulado_motivo, anuladoAt: rec.anulado_at,
            rectMetodo: rec.rect_metodo, rectMotivo: rec.rect_motivo,
            rectificaNumero: rec.orig_numero == null ? null : numeroVisible({ serie: rec.orig_serie, numero: rec.orig_numero }),
            rectificaFecha: rec.orig_fecha,
        },
        detalle,
        basesPorIva: [...grupos.values()].sort((a, b) => a.ivaPct - b.ivaPct),
        ahorro: r2Server(detalle.reduce((s, d) => s + (d.precio - d.base), 0)),
        empresa: EMPRESA_TICKET,
    };
}

app.get('/api/admin/billing/recibos', authenticateSession, requireAdmin, async (req, res) => {
    const { desde, hasta, q, estado } = req.query;
    const where = [];
    const vals = [];
    if (desde) { vals.push(desde); where.push(`rc.fecha >= $${vals.length}::date`); }
    if (hasta) { vals.push(hasta); where.push(`rc.fecha <= $${vals.length}::date`); }
    if (estado) { vals.push(estado); where.push(`rc.estado = $${vals.length}`); }
    if (q) {
        vals.push(`%${q}%`);
        const pNombre = vals.length;
        vals.push(String(q).trim());
        where.push(`(u.name || ' ' || u.surname ILIKE $${pNombre} OR rc.numero::text = $${vals.length})`);
    }
    try {
        const r = await pool.query(
            `SELECT rc.*, u.name, u.surname,
                    o.numero AS orig_numero, o.serie AS orig_serie,
                    (SELECT COUNT(*) FROM aim_cargos c WHERE c.recibo_id = rc.id)::int
                      + (SELECT COUNT(*) FROM aim_recibo_rect_lineas l WHERE l.recibo_id = rc.id)::int AS n_lineas
             FROM aim_recibos rc
             LEFT JOIN users u ON u.user_id = rc.pagador_id
             LEFT JOIN aim_recibos o ON o.id = rc.rectifica_id
             ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
             ORDER BY rc.fecha DESC, rc.id DESC LIMIT 300`,
            vals
        );
        res.set('Cache-Control', 'no-store');
        res.json(r.rows.map(rc => ({
            id: rc.id, numero: numeroVisible(rc), serie: rc.serie, tipo: rc.tipo, fecha: rc.fecha,
            pagador: rc.name ? `${rc.name} ${rc.surname}` : '(sin pagador)',
            importe: Number(rc.importe ?? 0), medioPago: rc.medio_pago, estado: rc.estado,
            nLineas: rc.n_lineas, anuladoMotivo: rc.anulado_motivo,
            rectMotivo: rc.rect_motivo, rectMetodo: rc.rect_metodo,
            rectificaNumero: rc.orig_numero == null ? null : numeroVisible({ serie: rc.orig_serie, numero: rc.orig_numero }),
        })));
    } catch (err) {
        console.error('Error listando recibos:', err);
        res.status(500).json({ error: err.message });
    }
});

// Detalle completo (para reimprimir el ticket).
app.get('/api/admin/billing/recibos/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const t = await ticketDeRecibo(req.params.id);
        if (!t) return res.status(404).json({ error: 'Recibo no encontrado.' });
        res.set('Cache-Control', 'no-store');
        res.json(t);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Anular: el recibo se marca (nunca se borra) y sus cargos vuelven a pendientes.
// ── Registro de facturación encadenado ──────────────────────────────────────
const SOFTWARE_FACTURACION = { nombre: 'Aim Education', version: '1.0' };

// Huella del registro: SHA-256 sobre los campos que identifican la factura más la
// huella del registro anterior. Encadenarlos así hace que no se pueda cambiar ni
// borrar una factura sin romper todas las siguientes.
function huellaRegistro(r) {
    const campos = [
        `IDEmisorFactura=${r.nif_emisor}`,
        `NumSerieFactura=${r.serie}-${r.numero}`,
        `FechaExpedicionFactura=${r.fecha_expedicion}`,
        `TipoFactura=${r.tipo_factura}`,
        `CuotaTotal=${Number(r.cuota).toFixed(2)}`,
        `ImporteTotal=${Number(r.total).toFixed(2)}`,
        `Huella=${r.huella_anterior || ''}`,
        `FechaHoraHusoGenRegistro=${r.emitido_at}`,
    ].join('&');
    return crypto.createHash('sha256').update(campos, 'utf8').digest('hex');
}

// Anota una factura en el registro. Va dentro de la misma transacción que la
// emite: si el registro falla, la factura no se emite.
async function registrarFactura(client, { recibo, receptor, descripcion, base, cuota, total, original, userId }) {
    // El bloqueo evita que dos cobros a la vez se encadenen del mismo eslabón.
    await client.query('LOCK TABLE aim_factura_registro IN EXCLUSIVE MODE');
    const prev = await client.query(`SELECT huella FROM aim_factura_registro ORDER BY id DESC LIMIT 1`);
    const fila = {
        nif_emisor: EMPRESA_TICKET.nif,
        serie: recibo.serie, numero: recibo.numero,
        fecha_expedicion: String(recibo.fecha).slice(0, 10),
        // F1 factura completa; R1 rectificativa por error fundado en derecho.
        tipo_factura: recibo.tipo === 'rectificativo' ? 'R1' : 'F1',
        cuota, total,
        huella_anterior: prev.rows[0]?.huella || null,
        emitido_at: new Date().toISOString(),
    };
    fila.huella = huellaRegistro(fila);
    const r = await client.query(
        `INSERT INTO aim_factura_registro
           (recibo_id, tipo_factura, serie, numero, fecha_expedicion, nif_emisor, nombre_emisor,
            nif_receptor, nombre_receptor, descripcion, base, cuota, total,
            rectifica_serie, rectifica_numero, rectifica_fecha,
            huella_anterior, huella, software_nombre, software_version, emitido_por, emitido_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING id`,
        [recibo.id, fila.tipo_factura, fila.serie, fila.numero, fila.fecha_expedicion,
         fila.nif_emisor, EMPRESA_TICKET.nombre,
         receptor?.nif || null, receptor?.nombre || null, descripcion || null,
         base, cuota, total,
         original?.serie || null, original?.numero || null,
         original?.fecha ? String(original.fecha).slice(0, 10) : null,
         fila.huella_anterior, fila.huella,
         SOFTWARE_FACTURACION.nombre, SOFTWARE_FACTURACION.version, userId || null, fila.emitido_at]
    );
    await client.query(
        `INSERT INTO aim_factura_eventos (tipo, registro_id, recibo_id, detalle, usuario_id)
         VALUES ($1,$2,$3,$4,$5)`,
        ['alta_factura', r.rows[0].id, recibo.id, `${fila.serie}-${fila.numero} · ${Number(total).toFixed(2)} €`, userId || null]
    );
    return { id: r.rows[0].id, huella: fila.huella };
}

// Líneas de un recibo que siguen vivas: ni devueltas al cliente (recibo_id a NULL)
// ni ya rectificadas antes. Es lo que se puede rectificar en una nueva pasada.
async function lineasVivasDeRecibo(client, reciboId) {
    const cs = await client.query(
        `SELECT c.*, u.name, u.surname FROM aim_cargos c JOIN users u ON u.user_id = c.cliente_id
         WHERE c.recibo_id = $1 AND COALESCE(c.estado,'') <> 'rectificado'
         ORDER BY u.surname, u.name, c.mes`, [reciboId]
    );
    return cs.rows;
}

// Emite el documento rectificativo en la serie R referenciando al original y
// devuelve { id, importe, aDevolver }. No decide qué pasa con los cargos: de eso
// se encarga quien la llama, porque anular y rectificar no hacen lo mismo.
async function emitirRectificativa(client, { orig, quitadas, quedan, metodo, motivo, userId }) {
    const conIva = c => r2Server(Number(c.importe ?? 0) * (1 + Number(c.iva_pct) / 100));
    const aDevolver = r2Server(quitadas.reduce((s, c) => s + conIva(c), 0));
    // Por diferencias: lo rectificado en negativo. Por sustitución: lo que queda correcto.
    const lineas = metodo === 'diferencias'
        ? quitadas.map(c => ({ c, base: r2Server(-Number(c.importe ?? 0)) }))
        : quedan.map(c => ({ c, base: r2Server(Number(c.importe ?? 0)) }));
    const importe = r2Server(lineas.reduce((s, l) => s + l.base * (1 + Number(l.c.iva_pct) / 100), 0));

    const num = (await client.query(`SELECT nextval('aim_recibos_rect_numero_seq') AS n`)).rows[0].n;
    const nuevo = await client.query(
        `INSERT INTO aim_recibos (numero, serie, tipo, rectifica_id, rect_metodo, rect_motivo,
                                  pagador_id, fecha, importe, medio_pago, entregado, cambio, estado, cobrado_por, cobrado_at)
         VALUES ($1,'R','rectificativo',$2,$3,$4,$5,CURRENT_DATE,$6,$7,0,0,'cobrado',$8,NOW()) RETURNING id, numero, serie, fecha`,
        [num, orig.id, metodo, motivo.trim(), orig.pagador_id, importe, orig.medio_pago, userId]
    );
    const nuevoId = nuevo.rows[0].id;
    for (const l of lineas) {
        await client.query(
            `INSERT INTO aim_recibo_rect_lineas (recibo_id, cargo_id, descripcion, cliente_nombre, mes, iva_pct, base)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [nuevoId, l.c.id, l.c.descripcion, `${l.c.name} ${l.c.surname}`, l.c.mes, l.c.iva_pct, l.base]
        );
    }

    // Anotar el rectificativo en el registro encadenado, referenciando a la
    // factura que corrige.
    const baseTotal = r2Server(lineas.reduce((s, l) => s + l.base, 0));
    const pag = await client.query('SELECT name, surname FROM users WHERE user_id = $1', [orig.pagador_id]);
    await registrarFactura(client, {
        recibo: { ...nuevo.rows[0], tipo: 'rectificativo' },
        receptor: { nombre: pag.rows[0] ? `${pag.rows[0].name} ${pag.rows[0].surname || ''}`.trim() : null },
        descripcion: `Rectificativa de ${orig.serie || 'A'}-${orig.numero}: ${motivo.trim()}`,
        base: baseTotal, cuota: r2Server(importe - baseTotal), total: importe,
        original: { serie: orig.serie || 'A', numero: orig.numero, fecha: orig.fecha },
        userId,
    });

    return { id: nuevoId, importe, aDevolver };
}

// Registro de facturación: lista los asientos y recalcula la cadena entera para
// comprobar que nadie ha tocado ni borrado una factura por detrás.
app.get('/api/admin/billing/registro', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const r = await pool.query(`SELECT * FROM aim_factura_registro ORDER BY id ASC`);
        let anterior = null;
        const filas = r.rows.map(f => {
            const esperada = huellaRegistro({
                nif_emisor: f.nif_emisor, serie: f.serie, numero: f.numero,
                fecha_expedicion: String(f.fecha_expedicion).slice(0, 10),
                tipo_factura: f.tipo_factura, cuota: f.cuota, total: f.total,
                huella_anterior: f.huella_anterior,
                emitido_at: f.emitido_at instanceof Date ? f.emitido_at.toISOString() : f.emitido_at,
            });
            const encadenaBien = (f.huella_anterior || null) === anterior;
            const intacta = esperada === f.huella;
            anterior = f.huella;
            return {
                id: f.id, numero: `${f.serie}-${f.numero}`, tipoFactura: f.tipo_factura,
                fecha: f.fecha_expedicion, receptor: f.nombre_receptor, descripcion: f.descripcion,
                base: Number(f.base), cuota: Number(f.cuota), total: Number(f.total),
                rectifica: f.rectifica_numero ? `${f.rectifica_serie}-${f.rectifica_numero}` : null,
                huella: f.huella, huellaAnterior: f.huella_anterior,
                estadoEnvio: f.estado_envio, emitidoAt: f.emitido_at,
                intacta, encadenaBien,
            };
        });
        const rotas = filas.filter(f => !f.intacta || !f.encadenaBien);
        res.set('Cache-Control', 'no-store');
        res.json({
            registros: filas.length, cadenaIntacta: rotas.length === 0,
            problemas: rotas.map(f => ({ numero: f.numero, intacta: f.intacta, encadenaBien: f.encadenaBien })),
            filas,
        });
    } catch (err) {
        console.error('Error leyendo el registro de facturación:', err);
        res.status(500).json({ error: err.message });
    }
});

// Una factura emitida NO se anula nunca: se queda registrada con su número tal
// como se emitió. Si hay que devolver dinero se emite un rectificativo que la
// referencia, y se pueden emitir tantos como devoluciones haya. Este endpoint se
// mantiene solo para que una llamada antigua no falle en silencio.
app.post('/api/admin/billing/recibos/:id/anular', authenticateSession, requireAdmin, (req, res) => {
    res.status(410).json({ error: 'Las facturas no se anulan. Emite un rectificativo por el importe a devolver.' });
});

// Rectificar un recibo ya entregado: emite un documento NUEVO en la serie R que
// referencia al original. Por 'diferencias' muestra solo lo rectificado en
// negativo; por 'sustitución' muestra los importes correctos que quedan.
app.post('/api/admin/billing/recibos/:id/rectificar', authenticateSession, requireAdmin, async (req, res) => {
    const { metodo, motivo, cargoIds, devolverAPendiente } = req.body;
    if (!['sustitucion', 'diferencias'].includes(metodo)) return res.status(400).json({ error: 'Método no válido (sustitución o diferencias).' });
    if (!motivo?.trim()) return res.status(400).json({ error: 'Hay que indicar el motivo de la rectificación.' });
    const rectificar = Array.isArray(cargoIds) ? cargoIds : [];
    if (rectificar.length === 0) return res.status(400).json({ error: 'Selecciona al menos una línea a rectificar.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const o = await client.query(`SELECT * FROM aim_recibos WHERE id = $1 FOR UPDATE`, [req.params.id]);
        if (o.rowCount === 0) throw { httP: 404, msg: 'Recibo no encontrado.' };
        const orig = o.rows[0];
        if (orig.tipo === 'rectificativo') throw { httP: 409, msg: 'No se puede rectificar un documento rectificativo.' };

        // Una factura se puede rectificar tantas veces como devoluciones haya: hoy
        // devuelves 25 € y mañana otros 50, y cada devolución es su propio
        // rectificativo. Cada pasada trabaja solo sobre lo que sigue vivo, así que
        // una línea ya devuelta no se puede devolver dos veces.
        const vivas = await lineasVivasDeRecibo(client, orig.id);
        if (vivas.length === 0) throw { httP: 409, msg: 'De esta factura ya se ha devuelto todo; no queda nada que rectificar.' };
        const idsSet = new Set(rectificar.map(Number));
        const quitadas = vivas.filter(c => idsSet.has(c.id));
        const quedan = vivas.filter(c => !idsSet.has(c.id));
        if (quitadas.length === 0) throw { httP: 400, msg: 'Las líneas seleccionadas ya estaban devueltas o no son de esta factura.' };

        const rect = await emitirRectificativa(client, {
            orig, quitadas, quedan, metodo, motivo, userId: req.userSession.userId,
        });
        const nuevoId = rect.id;
        const aDevolver = rect.aDevolver;

        // La factura original NO se toca: se emitió y se queda como está, con su
        // número y su importe. Lo que cambia son sus líneas, que dejan de contar
        // como cobradas porque ya se han devuelto.
        if (devolverAPendiente) {
            await client.query(
                `UPDATE aim_cargos SET recibo_id = NULL, estado = 'pendiente', importe = NULL, descuento_mens_pct = NULL
                 WHERE id = ANY($1::int[])`, [quitadas.map(c => c.id)]
            );
        } else {
            await client.query(`UPDATE aim_cargos SET estado = 'rectificado' WHERE id = ANY($1::int[])`, [quitadas.map(c => c.id)]);
        }

        await client.query('COMMIT');
        const ticket = await ticketDeRecibo(nuevoId);
        res.json({ ...ticket, aDevolver, lineasRectificadas: quitadas.length });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err && err.httP) return res.status(err.httP).json({ error: err.msg });
        console.error('Error rectificando recibo:', err);
        res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

// ── Recibos de la familia (panel del alumno/familia) ──
// Solo los suyos: donde es pagador o donde hay algún cargo a su nombre.
app.get('/api/me/recibos', authenticateSession, async (req, res) => {
    const me = req.userSession.userId;
    try {
        const r = await pool.query(
            `SELECT rc.*, u.name, u.surname FROM aim_recibos rc
             LEFT JOIN users u ON u.user_id = rc.pagador_id
             WHERE rc.pagador_id = $1
                OR rc.id IN (SELECT recibo_id FROM aim_cargos WHERE cliente_id = $1 AND recibo_id IS NOT NULL)
             ORDER BY rc.numero DESC LIMIT 100`, [me]
        );
        const ids = r.rows.map(x => x.id);
        let lineasPorRecibo = {};
        if (ids.length) {
            const cs = await pool.query(
                `SELECT c.recibo_id, c.descripcion, c.mes, c.importe, c.iva_pct, u.name, u.surname
                 FROM aim_cargos c JOIN users u ON u.user_id = c.cliente_id
                 WHERE c.recibo_id = ANY($1::int[]) ORDER BY c.mes`, [ids]
            );
            for (const c of cs.rows) {
                (lineasPorRecibo[c.recibo_id] = lineasPorRecibo[c.recibo_id] || []).push({
                    descripcion: c.descripcion, alumno: `${c.name} ${c.surname}`, mes: c.mes,
                    importe: Number(c.importe ?? 0), ivaPct: Number(c.iva_pct),
                });
            }
            // Líneas de los documentos rectificativos.
            const rl = await pool.query(
                `SELECT recibo_id, descripcion, cliente_nombre, mes, base, iva_pct
                 FROM aim_recibo_rect_lineas WHERE recibo_id = ANY($1::int[]) ORDER BY id`, [ids]
            );
            for (const l of rl.rows) {
                (lineasPorRecibo[l.recibo_id] = lineasPorRecibo[l.recibo_id] || []).push({
                    descripcion: l.descripcion, alumno: l.cliente_nombre || '', mes: l.mes,
                    importe: Number(l.base), ivaPct: Number(l.iva_pct),
                });
            }
        }
        res.set('Cache-Control', 'no-store');
        res.json(r.rows.map(rc => ({
            numero: numeroVisible(rc), tipo: rc.tipo, fecha: rc.fecha, importe: Number(rc.importe ?? 0),
            medioPago: rc.medio_pago, estado: rc.estado,
            pagador: rc.name ? `${rc.name} ${rc.surname}` : '',
            rectMotivo: rc.rect_motivo,
            lineas: lineasPorRecibo[rc.id] || [],
        })));
    } catch (err) {
        console.error('Error recibos de familia:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── Familias (parentescos por persona, igual que la tabla familias antigua) ──
app.get('/api/admin/billing/familias/:personaId', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT f.id, f.familiar_id, f.tipo, u.name, u.surname, u.email, u.birthday
             FROM aim_familias f JOIN users u ON u.user_id = f.familiar_id
             WHERE f.persona_id = $1 ORDER BY f.tipo, u.name`,
            [req.params.personaId]
        );
        res.set('Cache-Control', 'no-store');
        res.json(r.rows.map(f => ({
            id: f.id, familiarId: f.familiar_id, tipo: f.tipo,
            nombre: f.name, apellidos: f.surname, email: f.email, nacimiento: f.birthday,
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/billing/familias', authenticateSession, requireAdmin, async (req, res) => {
    const { personaId, familiarId, tipo, tipoInverso } = req.body;
    if (!personaId || !familiarId || !tipo?.trim()) return res.status(400).json({ error: 'Persona, familiar y tipo son obligatorios.' });
    if (personaId === familiarId) return res.status(400).json({ error: 'Una persona no puede ser familiar de sí misma.' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `INSERT INTO aim_familias (persona_id, familiar_id, tipo) VALUES ($1,$2,$3)
             ON CONFLICT (persona_id, familiar_id) DO UPDATE SET tipo = EXCLUDED.tipo`,
            [personaId, familiarId, tipo.trim()]
        );
        // El parentesco es una lista por persona: guardamos también el reflejo,
        // para que la relación se vea desde los dos lados.
        if (tipoInverso?.trim()) {
            await client.query(
                `INSERT INTO aim_familias (persona_id, familiar_id, tipo) VALUES ($1,$2,$3)
                 ON CONFLICT (persona_id, familiar_id) DO UPDATE SET tipo = EXCLUDED.tipo`,
                [familiarId, personaId, tipoInverso.trim()]
            );
        }
        await client.query('COMMIT');
        res.status(201).json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

app.delete('/api/admin/billing/familias/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM aim_familias WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: guardar asistencia y/o nota del profesor de un niño en un día.
app.put('/api/admin/camp/attendance', authenticateSession, requireAdmin, async (req, res) => {
    const { childId, day, asistio, note } = req.body;
    if (!childId || !day) return res.status(400).json({ error: 'childId y day son obligatorios.' });
    try {
        await pool.query(
            `INSERT INTO aim_camp_attendance (child_id, day, asistio, note, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (child_id, day) DO UPDATE SET
                asistio = COALESCE(EXCLUDED.asistio, aim_camp_attendance.asistio),
                note = COALESCE(EXCLUDED.note, aim_camp_attendance.note),
                updated_at = NOW()`,
            [childId, day, asistio === undefined ? null : asistio, note === undefined ? null : note]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving camp attendance:', err);
        res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// GASTOS DEL CLUB (proveedor + su factura). Información interna: solo admin.
// =============================================================================

const mapGasto = (r, conArchivo = false) => ({
    id: r.id, fecha: r.date, importe: r.amount == null ? null : parseFloat(r.amount),
    medioPago: r.payment_method, proveedor: r.company, cif: r.cif,
    numeroFactura: r.invoice_number, concepto: r.concept,
    tipo: r.expense_type || 'comun', actividad: r.actividad,
    pagado: !!r.is_paid, comprobadoBanco: !!r.comprobado_banco,
    facturaUrl: r.invoice_link,
    facturaNombre: r.factura_nombre, facturaMime: r.factura_mime,
    tieneArchivo: !!r.factura_nombre,
    ...(conArchivo ? { facturaArchivo: r.factura_archivo } : {}),
});

app.get('/api/admin/gastos', authenticateSession, requireAdmin, async (req, res) => {
    const { desde, hasta, q, pagado, tipo, actividad } = req.query;
    const where = [];
    const vals = [];
    if (desde) { vals.push(desde); where.push(`date >= $${vals.length}::date`); }
    if (hasta) { vals.push(hasta); where.push(`date <= $${vals.length}::date`); }
    if (pagado === 'si') where.push('is_paid = true');
    if (pagado === 'no') where.push('is_paid = false');
    if (tipo) { vals.push(tipo); where.push(`COALESCE(expense_type,'comun') = $${vals.length}`); }
    if (actividad) { vals.push(actividad); where.push(`actividad = $${vals.length}`); }
    if (q) {
        vals.push(`%${q}%`);
        where.push(`(company ILIKE $${vals.length} OR cif ILIKE $${vals.length} OR concept ILIKE $${vals.length} OR invoice_number ILIKE $${vals.length})`);
    }
    try {
        // No devolvemos el archivo en el listado: pesaría muchísimo.
        const r = await pool.query(
            `SELECT id, date, amount, payment_method, company, invoice_link, cif, invoice_number,
                    concept, expense_type, actividad, is_paid, comprobado_banco, factura_nombre, factura_mime
             FROM aim_gastos ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
             ORDER BY date DESC NULLS LAST, created_at DESC LIMIT 500`,
            vals
        );
        res.set('Cache-Control', 'no-store');
        res.json(r.rows.map(x => mapGasto(x)));
    } catch (err) {
        console.error('Error listando gastos:', err);
        res.status(500).json({ error: err.message });
    }
});

const MEDIOS_GASTO = ['Tarjeta', 'Transferencia bancaria', 'Domiciliación SEPA', 'Efectivo', 'Bizum', 'Otro'];

app.post('/api/admin/gastos', authenticateSession, requireAdmin, async (req, res) => {
    const {
        id, fecha, importe, medioPago, proveedor, cif, numeroFactura, concepto,
        tipo, actividad, pagado, comprobadoBanco, facturaUrl,
        facturaArchivo, facturaNombre, facturaMime,
    } = req.body;
    if (!proveedor?.trim()) return res.status(400).json({ error: 'El proveedor es obligatorio.' });
    if (importe == null || isNaN(Number(importe))) return res.status(400).json({ error: 'El importe es obligatorio.' });
    if (Number(importe) < 0) return res.status(400).json({ error: 'El importe no puede ser negativo.' });
    if (!fecha) return res.status(400).json({ error: 'La fecha de factura es obligatoria.' });
    if (tipo === 'especifico' && !actividad?.trim()) return res.status(400).json({ error: 'Un gasto específico necesita una actividad.' });
    // ~5MB de archivo en base64 (el límite del body es 6mb).
    if (facturaArchivo && facturaArchivo.length > 5_000_000) return res.status(413).json({ error: 'La factura es demasiado grande (máx. ~3,5 MB).' });

    const gastoId = id || crypto.randomBytes(6).toString('hex');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Si no se envía archivo nuevo, se conserva el que hubiera.
        const setArchivo = facturaArchivo !== undefined;
        await client.query(
            `INSERT INTO aim_gastos (id, date, amount, payment_method, company, cif, invoice_number, concept,
                                     expense_type, actividad, is_paid, comprobado_banco, invoice_link,
                                     factura_archivo, factura_nombre, factura_mime)
             VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             ON CONFLICT (id) DO UPDATE SET
                date = EXCLUDED.date, amount = EXCLUDED.amount, payment_method = EXCLUDED.payment_method,
                company = EXCLUDED.company, cif = EXCLUDED.cif, invoice_number = EXCLUDED.invoice_number,
                concept = EXCLUDED.concept, expense_type = EXCLUDED.expense_type, actividad = EXCLUDED.actividad,
                is_paid = EXCLUDED.is_paid, comprobado_banco = EXCLUDED.comprobado_banco,
                invoice_link = EXCLUDED.invoice_link,
                factura_archivo = CASE WHEN $17 THEN EXCLUDED.factura_archivo ELSE aim_gastos.factura_archivo END,
                factura_nombre  = CASE WHEN $17 THEN EXCLUDED.factura_nombre  ELSE aim_gastos.factura_nombre END,
                factura_mime    = CASE WHEN $17 THEN EXCLUDED.factura_mime    ELSE aim_gastos.factura_mime END`,
            [gastoId, fecha, Number(importe), medioPago || null, proveedor.trim(), cif?.trim() || null,
             numeroFactura?.trim() || null, concepto?.trim() || null, tipo === 'especifico' ? 'especifico' : 'comun',
             tipo === 'especifico' ? actividad.trim() : null, !!pagado, !!comprobadoBanco, facturaUrl?.trim() || null,
             facturaArchivo || null, facturaNombre?.trim() || null, facturaMime || null, setArchivo]
        );
        // El proveedor se guarda en el registro para poder buscarlo la próxima vez.
        await client.query(
            `INSERT INTO aim_proveedores (nombre, cif) VALUES ($1,$2)
             ON CONFLICT (LOWER(nombre)) DO UPDATE SET cif = COALESCE(EXCLUDED.cif, aim_proveedores.cif)`,
            [proveedor.trim(), cif?.trim() || null]
        );
        await client.query('COMMIT');
        res.json({ success: true, id: gastoId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error guardando gasto:', err);
        res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

app.delete('/api/admin/gastos/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM aim_gastos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Descargar la factura adjunta de un gasto.
app.get('/api/admin/gastos/:id/factura', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const r = await pool.query('SELECT factura_archivo, factura_nombre, factura_mime FROM aim_gastos WHERE id = $1', [req.params.id]);
        if (r.rowCount === 0 || !r.rows[0].factura_archivo) return res.status(404).json({ error: 'Ese gasto no tiene factura adjunta.' });
        const { factura_archivo, factura_nombre, factura_mime } = r.rows[0];
        const b64 = String(factura_archivo).includes(',') ? String(factura_archivo).split(',').pop() : factura_archivo;
        const buf = Buffer.from(b64, 'base64');
        res.setHeader('Content-Type', factura_mime || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${(factura_nombre || 'factura').replace(/"/g, '')}"`);
        res.send(buf);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Registro de proveedores (autocompletado de nombre + CIF).
app.get('/api/admin/proveedores', authenticateSession, requireAdmin, async (req, res) => {
    const q = `%${(req.query.q || '').trim()}%`;
    try {
        const r = await pool.query(
            `SELECT id, nombre, cif FROM aim_proveedores
             WHERE nombre ILIKE $1 OR COALESCE(cif,'') ILIKE $1 ORDER BY nombre LIMIT 25`, [q]
        );
        res.set('Cache-Control', 'no-store');
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/proveedores/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM aim_proveedores WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Informe de beneficios por actividad: ingresos (cargos cobrados en recibos no
// anulados) menos gastos. Los gastos comunes se reparten según 'reparto'.
app.get('/api/admin/informes/beneficios', authenticateSession, requireAdmin, async (req, res) => {
    const { desde, hasta, reparto = 'ingresos' } = req.query;
    try {
        // Rango de fechas por parámetros ($1 desde, $2 hasta; NULL = sin límite).
        const esFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
        if ((desde && !esFecha(desde)) || (hasta && !esFecha(hasta))) {
            return res.status(400).json({ error: 'Las fechas deben tener el formato AAAA-MM-DD.' });
        }
        const d = desde || null, h = hasta || null;
        // Ingresos: importe base de cada cargo cobrado, agrupado por actividad.
        const ing = await pool.query(
            `SELECT COALESCE(NULLIF(c.actividad,''), 'Sin actividad') AS actividad,
                    COALESCE(SUM(c.importe),0)::numeric AS total
             FROM aim_cargos c
             JOIN aim_recibos r ON r.id = c.recibo_id
             WHERE c.estado = 'cobrado' AND r.estado <> 'anulado'
               AND ($1::date IS NULL OR r.fecha >= $1::date)
               AND ($2::date IS NULL OR r.fecha <= $2::date)
             GROUP BY 1`, [d, h]
        );
        const gas = await pool.query(
            `SELECT COALESCE(expense_type,'comun') AS tipo,
                    COALESCE(NULLIF(actividad,''),'') AS actividad,
                    COALESCE(SUM(amount),0)::numeric AS total
             FROM aim_gastos
             WHERE ($1::date IS NULL OR date >= $1::date)
               AND ($2::date IS NULL OR date <= $2::date)
             GROUP BY 1,2`, [d, h]
        );

        const ingresos = {};
        for (const r of ing.rows) ingresos[r.actividad] = Number(r.total);
        const gastosDir = {};
        let gastosComunes = 0;
        for (const g of gas.rows) {
            if (g.tipo === 'especifico' && g.actividad) gastosDir[g.actividad] = (gastosDir[g.actividad] || 0) + Number(g.total);
            else gastosComunes += Number(g.total);
        }

        // Actividades a considerar: las que tienen ingresos o gastos directos.
        const nombres = [...new Set([...Object.keys(ingresos), ...Object.keys(gastosDir)])].filter(n => n !== 'Sin actividad');
        const totalIngresos = nombres.reduce((s, n) => s + (ingresos[n] || 0), 0);
        // Cuota de gastos comunes por actividad, ya redondeada a céntimos.
        const cuotas = nombres.map(n => {
            if (gastosComunes <= 0 || nombres.length === 0) return 0;
            const ingr = ingresos[n] || 0;
            const bruta = reparto === 'iguales'
                ? gastosComunes / nombres.length
                : (totalIngresos > 0 ? gastosComunes * (ingr / totalIngresos) : gastosComunes / nombres.length);
            return r2Server(bruta);
        });
        // Redondear cada cuota por separado deja céntimos sueltos: el sobrante (o
        // el defecto) se carga a la actividad con la cuota mayor para que la suma
        // de las filas cuadre exactamente con el total de gastos comunes.
        const descuadre = r2Server(r2Server(gastosComunes) - cuotas.reduce((s, c) => s + c, 0));
        if (descuadre !== 0 && cuotas.length > 0) {
            let mayor = 0;
            for (let i = 1; i < cuotas.length; i++) if (cuotas[i] > cuotas[mayor]) mayor = i;
            cuotas[mayor] = r2Server(cuotas[mayor] + descuadre);
        }
        const filas = nombres.map((n, i) => {
            const ingr = r2Server(ingresos[n] || 0);
            const dir = r2Server(gastosDir[n] || 0);
            return {
                actividad: n, ingresos: ingr, gastosDirectos: dir,
                gastosComunes: cuotas[i], beneficio: r2Server(ingr - dir - cuotas[i]),
            };
        }).sort((a, b) => b.beneficio - a.beneficio);

        res.set('Cache-Control', 'no-store');
        res.json({
            reparto, desde: desde || null, hasta: hasta || null,
            sinActividad: r2Server(ingresos['Sin actividad'] || 0),
            totalGastosComunes: r2Server(gastosComunes),
            filas,
            totales: {
                ingresos: r2Server(filas.reduce((s, f) => s + f.ingresos, 0)),
                gastos: r2Server(filas.reduce((s, f) => s + f.gastosDirectos + f.gastosComunes, 0)),
                beneficio: r2Server(filas.reduce((s, f) => s + f.beneficio, 0)),
            },
        });
    } catch (err) {
        console.error('Error informe beneficios:', err);
        res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// AI ROUTES (Gemini server-side)
// =============================================================================

app.post('/api/ai/generate-game', authenticateSession, async (req, res) => {
    const { prompt, language = 'en', sportName = 'Deporte' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt requerido.' });

    const langPrompt = language === 'es' ? 'Salida puramente en Español.' : 'Output purely in English.';
    const finalPrompt = `Crea un ejercicio o juego de entrenamiento para ${sportName} enfocado en: ${prompt}. Asegúrate de que las reglas sean claras y acordes al deporte ${sportName}. ${langPrompt}`;

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: finalPrompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        category: { type: Type.STRING },
                        difficulty: { type: Type.STRING },
                        durationMin: { type: Type.INTEGER }
                    },
                    required: ['title', 'description', 'category', 'difficulty', 'durationMin']
                }
            }
        });
        res.json(JSON.parse(response.text || '{}'));
    } catch (err) {
        console.error('AI generate-game error:', err);
        res.status(500).json({ error: 'Error al generar ejercicio con IA.' });
    }
});

app.post('/api/ai/consult', authenticateSession, async (req, res) => {
    const { message, dataContext = {}, language = 'en', sportName = 'Deporte' } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensaje requerido.' });

    const { students = [], groups = [], games = [], sessions: sessionList = [] } = dataContext;
    const systemInstruction = `
Eres un Consultor Experto en Gestión Deportiva para el club "AIM".
Tu deporte actual es: ${sportName}.
Idioma de respuesta: ${language === 'es' ? 'Español' : 'Inglés'}.
Datos disponibles: Alumnos: ${students.length}, Grupos: ${groups.map(g => g.name).join(', ')}, Ejercicios: ${games.length}, Sesiones: ${sessionList.length}.
Sé profesional, conciso y motivador. Usa Markdown para formatear las respuestas.
    `.trim();

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: message,
            config: { systemInstruction }
        });
        res.json({ text: response.text || 'Sin respuesta.' });
    } catch (err) {
        console.error('AI consult error:', err);
        res.status(500).json({ error: 'Error al conectar con el AI Coach.' });
    }
});

// =============================================================================
// ADMIN POSTS ROUTES (stats before :id to avoid route conflict)
// =============================================================================

app.get('/api/admin/posts/stats', authenticateSession, async (req, res) => {
    try {
        const [views, clicks, published, drafts, topPost, recentViews] = await Promise.all([
            pool.query(`SELECT COALESCE(SUM(view_count), 0) AS total FROM aim_education_posts`),
            pool.query(`SELECT COALESCE(SUM(click_count), 0) AS total FROM aim_education_posts`),
            pool.query(`SELECT COUNT(*) AS total FROM aim_education_posts WHERE status = 'published'`),
            pool.query(`SELECT COUNT(*) AS total FROM aim_education_posts WHERE status = 'draft'`),
            pool.query(`SELECT title, slug, view_count FROM aim_education_posts WHERE status = 'published' ORDER BY view_count DESC LIMIT 1`),
            pool.query(`
                SELECT DATE(created_at) AS date, COUNT(*) AS count
                FROM aim_education_post_views
                WHERE event_type = 'view' AND created_at > NOW() - INTERVAL '14 days'
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `)
        ]);
        res.json({
            totalViews: parseInt(views.rows[0].total),
            totalClicks: parseInt(clicks.rows[0].total),
            publishedPosts: parseInt(published.rows[0].total),
            draftPosts: parseInt(drafts.rows[0].total),
            topPost: topPost.rows[0] || null,
            recentViews: recentViews.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/posts', authenticateSession, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*,
                   (SELECT COUNT(*) FROM aim_education_post_views v
                    WHERE v.post_id = p.id AND v.event_type = 'view'
                    AND v.created_at > NOW() - INTERVAL '7 days') AS views_last_7d
            FROM aim_education_posts p
            ORDER BY p.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/posts', authenticateSession, async (req, res) => {
    const { title, excerpt, content, coverImageUrl, cover_image_url, category, status, slug } = req.body;
    const imageUrl = coverImageUrl || cover_image_url;
    if (!title || !content) return res.status(400).json({ error: 'Título y contenido son obligatorios.' });

    const id = crypto.randomUUID();
    const finalSlug = slug ? slugify(slug) : slugify(title);
    const authorName = `${req.userSession.firstName || ''} ${req.userSession.lastName || ''}`.trim();
    const publishedAt = status === 'published' ? new Date() : null;

    try {
        await pool.query(`
            INSERT INTO aim_education_posts (id, title, slug, excerpt, content, cover_image_url, author_name, category, status, published_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [id, title, finalSlug, excerpt || null, content, imageUrl || null, authorName || 'Admin', category || 'general', status || 'draft', publishedAt]);

        const result = await pool.query('SELECT * FROM aim_education_posts WHERE id = $1', [id]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una entrada con ese slug. Usa un título diferente o edita el slug.' });
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/posts/:id', authenticateSession, async (req, res) => {
    const { title, excerpt, content, coverImageUrl, cover_image_url, category, status, slug } = req.body;
    const imageUrl = coverImageUrl || cover_image_url;
    try {
        const current = await pool.query('SELECT * FROM aim_education_posts WHERE id = $1', [req.params.id]);
        if (current.rowCount === 0) return res.status(404).json({ error: 'Entrada no encontrada.' });

        const wasPublished = current.rows[0].status === 'published';
        const willPublish = status === 'published';
        const publishedAt = willPublish && !wasPublished ? new Date() : current.rows[0].published_at;
        const finalSlug = slug ? slugify(slug) : slugify(title);

        await pool.query(`
            UPDATE aim_education_posts
            SET title = $1, slug = $2, excerpt = $3, content = $4, cover_image_url = $5,
                category = $6, status = $7, published_at = $8, updated_at = NOW()
            WHERE id = $9
        `, [title, finalSlug, excerpt || null, content, imageUrl || null, category || 'general', status || 'draft', publishedAt, req.params.id]);

        const result = await pool.query('SELECT * FROM aim_education_posts WHERE id = $1', [req.params.id]);
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una entrada con ese slug.' });
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/posts/:id', authenticateSession, async (req, res) => {
    try {
        await pool.query('DELETE FROM aim_education_posts WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// PUBLIC POSTS API
// =============================================================================

app.get('/api/posts', async (req, res) => {
    try {
        const { category, limit = '20' } = req.query;
        const params = [];
        let where = `WHERE status = 'published'`;
        if (category) {
            params.push(category);
            where += ` AND category = $${params.length}`;
        }
        params.push(Math.min(parseInt(limit) || 20, 100));
        const result = await pool.query(
            `SELECT id, title, slug, excerpt, cover_image_url, author_name, category, view_count, published_at
             FROM aim_education_posts ${where}
             ORDER BY published_at DESC NULLS LAST
             LIMIT $${params.length}`,
            params
        );
        res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=30');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/posts/:id/click', async (req, res) => {
    try {
        await pool.query(`UPDATE aim_education_posts SET click_count = click_count + 1 WHERE id = $1`, [req.params.id]);
        await pool.query(`INSERT INTO aim_education_post_views (post_id, event_type) VALUES ($1, 'click')`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/posts/:slug', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, slug, excerpt, content, cover_image_url, author_name, category, view_count, published_at
             FROM aim_education_posts WHERE slug = $1 AND status = 'published'`,
            [req.params.slug]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
        const post = result.rows[0];
        await pool.query(`UPDATE aim_education_posts SET view_count = view_count + 1 WHERE id = $1`, [post.id]);
        await pool.query(`INSERT INTO aim_education_post_views (post_id, event_type) VALUES ($1, 'view')`, [post.id]);
        res.json(post);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// RSS FEEDS
// =============================================================================

async function generateRssFeed(siteUrl, { categories, feedPath, feedTitle, feedDescription }) {
    let whereClause = `WHERE status = 'published'`;
    const params = [];

    if (categories && categories.length > 0) {
        const placeholders = categories.map((_, i) => `$${i + 1}`).join(', ');
        whereClause += ` AND category IN (${placeholders})`;
        params.push(...categories);
    }

    const result = await pool.query(`
        SELECT id, title, slug, excerpt, content, cover_image_url,
               author_name, category, published_at, created_at
        FROM aim_education_posts
        ${whereClause}
        ORDER BY published_at DESC NULLS LAST
        LIMIT 50
    `, params);

    const items = result.rows.map(post => {
        const pubDate = new Date(post.published_at || post.created_at).toUTCString();
        const canonicalLink = `${siteUrl}/noticias/${post.slug}`;
        const trackingLink = `${siteUrl}/noticias/${post.slug}?utm_source=rss&amp;utm_medium=feed&amp;utm_campaign=aim-education-noticias`;

        const fullHtml = post.cover_image_url
            ? `<img src="${escapeXml(post.cover_image_url)}" alt="${escapeXml(post.title)}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:20px">\n${renderMarkdownEmail(post.content)}`
            : renderMarkdownEmail(post.content);

        const catLabel = CATEGORY_LABELS[post.category] || post.category;

        return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${trackingLink}</link>
      <description>${escapeXml(post.excerpt || post.title)}</description>
      <content:encoded><![CDATA[${fullHtml}]]></content:encoded>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${canonicalLink}</guid>
      <category>${escapeXml(catLabel)}</category>
      ${post.author_name ? `<dc:creator>${escapeXml(post.author_name)}</dc:creator>` : ''}
      ${post.cover_image_url ? `
      <media:content url="${escapeXml(post.cover_image_url)}" medium="image">
        <media:title type="plain">${escapeXml(post.title)}</media:title>
      </media:content>
      <enclosure url="${escapeXml(post.cover_image_url)}" type="image/jpeg" length="0"/>` : ''}
    </item>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:media="http://search.yahoo.com/mrss/"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(feedTitle)}</title>
    <link>${siteUrl}</link>
    <description>${escapeXml(feedDescription)}</description>
    <language>es-ES</language>
    <atom:link href="${siteUrl}${feedPath}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <image>
      <url>${siteUrl}/src/logo.png</url>
      <title>${escapeXml(feedTitle)}</title>
      <link>${siteUrl}</link>
    </image>
    ${items}
  </channel>
</rss>`;
}

function setFeedHeaders(res, req) {
    const origin = (req && req.get('Origin')) || '*';
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
}

// Preflight OPTIONS para todos los feeds
app.options('/feed.xml', (req, res) => { setFeedHeaders(res, req); res.sendStatus(204); });
app.options('/feed/:category.xml', (req, res) => { setFeedHeaders(res, req); res.sendStatus(204); });

// Feed principal — anuncios generales y noticias del club (para todos los suscriptores)
app.get('/feed.xml', async (req, res) => {
    try {
        const proto = req.get('x-forwarded-proto') || req.protocol;
        const siteUrl = `${proto}://${req.get('host')}`;
        const xml = await generateRssFeed(siteUrl, {
            categories: ['general', 'club'],
            feedPath: '/feed.xml',
            feedTitle: 'AIM Education — Anuncios',
            feedDescription: 'Anuncios generales y noticias del club AIM Education Algeciras'
        });
        setFeedHeaders(res, req);
        res.send(xml);
    } catch (err) {
        console.error('RSS error:', err);
        res.status(500).send('Error generating RSS feed');
    }
});

// Feeds por categoría: /feed/taekwondo.xml, /feed/ballet.xml, etc. + /feed/todo.xml
const SUBSCRIBABLE_CATEGORIES = new Set(['taekwondo', 'ballet', 'ingles', 'robotica', 'competicion', 'shelfie', 'todo']);

app.get('/feed/:category.xml', async (req, res) => {
    try {
        const cat = req.params.category.toLowerCase();
        if (!SUBSCRIBABLE_CATEGORIES.has(cat)) {
            return res.status(404).send('Feed no encontrado');
        }

        const proto = req.get('x-forwarded-proto') || req.protocol;
        const siteUrl = `${proto}://${req.get('host')}`;
        const isAll = cat === 'todo';
        const catLabel = isAll ? 'Todo' : (CATEGORY_LABELS[cat] || cat);

        const xml = await generateRssFeed(siteUrl, {
            categories: isAll ? null : [cat],
            feedPath: `/feed/${cat}.xml`,
            feedTitle: `AIM Education — ${catLabel}`,
            feedDescription: isAll
                ? 'Todas las noticias de AIM Education Algeciras'
                : `Noticias de ${catLabel} en AIM Education Algeciras`
        });

        setFeedHeaders(res, req);
        res.send(xml);
    } catch (err) {
        console.error('RSS category error:', err);
        res.status(500).send('Error generating RSS feed');
    }
});

// =============================================================================
// PUBLIC NEWS PAGES — served by the SPA (dist/index.html)
// =============================================================================

app.get('/noticias', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/index.html'));
});

app.get('/noticias/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/index.html'));
});

// =============================================================================
// SUPPORT TICKET ROUTES
// =============================================================================

app.post('/api/support', authenticateSession, async (req, res) => {
    const { subject, description, adjunto, adjuntoNombre, adjuntoMime } = req.body;
    const userId = req.userSession.userId;
    if (!subject || !description)
        return res.status(400).json({ error: 'Asunto y descripción son obligatorios.' });
    if (adjunto && !/^data:image\/(png|jpe?g|gif|webp);base64,/.test(adjunto)) {
        return res.status(400).json({ error: 'El adjunto debe ser una imagen.' });
    }
    if (adjunto && adjunto.length > 4_400_000) return res.status(400).json({ error: 'La imagen no puede pasar de 3 MB.' });
    try {
        const result = await pool.query(
            `INSERT INTO tickets_registrosoporte (user_id, subject, description, app_label, adjunto, adjunto_nombre, adjunto_mime)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [userId, subject, description, ['Aim Education'], adjunto || null, adjuntoNombre || null, adjuntoMime || null]
        );
        const ticketId = result.rows[0].id;
        if (mailTransporter) {
            mailTransporter.sendMail({
                from: process.env.EMAIL_USER,
                to: process.env.EMAIL_USER,
                subject: `[Soporte Aim Education] Ticket #${ticketId}: ${subject}`,
                text: `Nuevo ticket de ${req.userSession.firstName} ${req.userSession.lastName || ''} (${req.userSession.email})\n\nAsunto: ${subject}\n\nDescripción:\n${description}`
            }).then(() => {
                pool.query('UPDATE tickets_registrosoporte SET email_sent = true WHERE id = $1', [ticketId]).catch(() => {});
            }).catch(err => console.error('[SMTP ERROR]', err.message));
        }
        res.json({ success: true, ticketId });
    } catch (err) {
        console.error('[SUPPORT] Create error:', err);
        res.status(500).json({ error: 'Error al crear el ticket.' });
    }
});

app.get('/api/support', authenticateSession, async (req, res) => {
    if (!req.userSession.isSuperAdmin && !req.userSession.canAccessAdmin)
        return res.status(403).json({ error: 'Sin permisos.' });
    try {
        // Columnas explícitas a propósito: 'adjunto' guarda la imagen en base64 y con
        // s.* el listado entero se llevaría todas las capturas por delante.
        const result = await pool.query(`
            SELECT s.id, s.user_id, s.subject, s.description, s.status, s.priority,
                   s.due_date, s.assigned_to, s.app_label, s.dev_response, s.email_sent,
                   s.created_at, s.updated_at, s.resolved_at,
                   (s.adjunto IS NOT NULL) AS tiene_adjunto,
                   COALESCE(u.name, 'Admin') as name,
                   COALESCE(u.surname, '') as surname,
                   COALESCE(u.email, '') as email,
                   assignee.name as assignee_name,
                   assignee.surname as assignee_surname,
                   (SELECT COUNT(*) FROM tickets_mensajes m WHERE m.ticket_id = s.id AND m.canal = 'equipo')::int AS msgs_equipo,
                   (SELECT COUNT(*) FROM tickets_mensajes m WHERE m.ticket_id = s.id AND m.canal = 'creador')::int AS msgs_creador
            FROM tickets_registrosoporte s
            LEFT JOIN users u ON s.user_id = u.user_id
            LEFT JOIN users assignee ON s.assigned_to = assignee.user_id
            ORDER BY s.created_at DESC
        `);
        res.json({ success: true, tickets: result.rows });
    } catch (err) {
        console.error('[SUPPORT] Fetch error:', err);
        res.status(500).json({ error: 'Error al obtener tickets.' });
    }
});

app.put('/api/support/:id', authenticateSession, async (req, res) => {
    if (!req.userSession.isSuperAdmin && !req.userSession.canAccessAdmin)
        return res.status(403).json({ error: 'Sin permisos.' });
    const { status, devResponse, priority, dueDate, assignedTo, appLabel } = req.body;
    const finalAppLabels = Array.isArray(appLabel) ? appLabel : (appLabel ? [appLabel] : ['Aim Education']);
    try {
        const nuevoEstado = status || 'open';
        // resolved_at se sella la primera vez que pasa a resuelto/cerrado y se borra
        // si vuelve a abrirse, para que "cuánto tardó" siga siendo cierto. El estado
        // final va como booleano aparte: reusar $1 dentro del CASE deja a Postgres sin
        // poder deducir su tipo.
        const esFinal = ['resolved', 'closed'].includes(nuevoEstado);
        await pool.query(
            `UPDATE tickets_registrosoporte
             SET status = $1, dev_response = $2, priority = $3,
                 due_date = $4, assigned_to = $5, app_label = $6::TEXT[],
                 updated_at = NOW(),
                 resolved_at = CASE WHEN $8 THEN COALESCE(resolved_at, NOW()) ELSE NULL END
             WHERE id = $7`,
            [nuevoEstado, devResponse || '', priority || 'low', dueDate || null, assignedTo || null, finalAppLabels, req.params.id, esFinal]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[SUPPORT] Update error:', err);
        res.status(500).json({ error: 'Error al actualizar el ticket.' });
    }
});

// ── Conversación de un ticket ──────────────────────────────────────────────
// Dos canales: 'equipo' (solo desarrolladores) y 'creador' (con quien lo abrió).
// Quien abrió el ticket solo alcanza su propio ticket y solo el canal 'creador'.
async function accesoTicket(req, ticketId, canal) {
    const t = await pool.query('SELECT id, user_id FROM tickets_registrosoporte WHERE id = $1', [ticketId]);
    if (!t.rowCount) return { error: 'Ticket no encontrado.', code: 404 };
    const esStaff = req.userSession.isSuperAdmin || req.userSession.canAccessAdmin;
    if (esStaff) return { ticket: t.rows[0], esStaff: true };
    if (String(t.rows[0].user_id) !== String(req.userSession.userId)) {
        return { error: 'Sin permisos.', code: 403 };
    }
    if (canal && canal !== 'creador') return { error: 'Sin permisos.', code: 403 };
    return { ticket: t.rows[0], esStaff: false };
}

app.get('/api/support/:id/mensajes', authenticateSession, async (req, res) => {
    const canal = req.query.canal === 'equipo' ? 'equipo' : 'creador';
    try {
        const a = await accesoTicket(req, req.params.id, canal);
        if (a.error) return res.status(a.code).json({ error: a.error });
        // 'desde' permite pedir solo lo nuevo en cada consulta periódica.
        const desde = Number.parseInt(req.query.desde, 10) || 0;
        const r = await pool.query(
            `SELECT m.id, m.canal, m.cuerpo, m.created_at, m.autor_id,
                    m.archivo_nombre, m.archivo_mime,
                    (m.archivo IS NOT NULL) AS tiene_archivo,
                    u.name AS autor_nombre, u.surname AS autor_apellido
             FROM tickets_mensajes m
             LEFT JOIN users u ON u.user_id = m.autor_id
             WHERE m.ticket_id = $1 AND m.canal = $2 AND m.id > $3
             ORDER BY m.id ASC`,
            [req.params.id, canal, desde]
        );
        res.set('Cache-Control', 'no-store');
        res.json({
            success: true,
            mensajes: r.rows.map(m => ({
                id: m.id, canal: m.canal, cuerpo: m.cuerpo, createdAt: m.created_at,
                autorId: m.autor_id, autor: [m.autor_nombre, m.autor_apellido].filter(Boolean).join(' ') || 'Soporte',
                mio: String(m.autor_id) === String(req.userSession.userId),
                tieneArchivo: m.tiene_archivo, archivoNombre: m.archivo_nombre, archivoMime: m.archivo_mime,
            })),
        });
    } catch (err) {
        console.error('[SUPPORT] Mensajes error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/support/:id/mensajes', authenticateSession, async (req, res) => {
    const { cuerpo, archivo, archivoNombre, archivoMime } = req.body;
    const canal = req.body.canal === 'equipo' ? 'equipo' : 'creador';
    if (!cuerpo?.trim() && !archivo) return res.status(400).json({ error: 'Escribe un mensaje o adjunta una imagen.' });
    if (archivo && !/^data:image\/(png|jpe?g|gif|webp);base64,/.test(archivo)) {
        return res.status(400).json({ error: 'El adjunto debe ser una imagen.' });
    }
    if (archivo && archivo.length > 4_400_000) return res.status(400).json({ error: 'La imagen no puede pasar de 3 MB.' });
    try {
        const a = await accesoTicket(req, req.params.id, canal);
        if (a.error) return res.status(a.code).json({ error: a.error });
        const r = await pool.query(
            `INSERT INTO tickets_mensajes (ticket_id, canal, autor_id, cuerpo, archivo, archivo_nombre, archivo_mime)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [req.params.id, canal, req.userSession.userId, cuerpo?.trim() || null,
             archivo || null, archivoNombre || null, archivoMime || null]
        );
        await pool.query('UPDATE tickets_registrosoporte SET updated_at = NOW() WHERE id = $1', [req.params.id]);
        res.status(201).json({ success: true, id: r.rows[0].id });
    } catch (err) {
        console.error('[SUPPORT] Enviar mensaje error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Imagen adjunta a un mensaje, servida como archivo real.
app.get('/api/support/mensajes/:id/archivo', authenticateSession, async (req, res) => {
    try {
        const r = await pool.query('SELECT ticket_id, canal, archivo, archivo_nombre, archivo_mime FROM tickets_mensajes WHERE id = $1', [req.params.id]);
        if (!r.rowCount || !r.rows[0].archivo) return res.status(404).json({ error: 'Sin adjunto.' });
        const m = r.rows[0];
        const a = await accesoTicket(req, m.ticket_id, m.canal);
        if (a.error) return res.status(a.code).json({ error: a.error });
        const b64 = String(m.archivo).includes(',') ? String(m.archivo).split(',')[1] : m.archivo;
        res.set('Content-Type', m.archivo_mime || 'image/png');
        res.set('Content-Disposition', `inline; filename="${(m.archivo_nombre || 'captura').replace(/"/g, '')}"`);
        res.send(Buffer.from(b64, 'base64'));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Imagen adjunta al propio ticket (la que se sube al crearlo).
app.get('/api/support/:id/adjunto', authenticateSession, async (req, res) => {
    try {
        const a = await accesoTicket(req, req.params.id, 'creador');
        if (a.error) return res.status(a.code).json({ error: a.error });
        const r = await pool.query('SELECT adjunto, adjunto_nombre, adjunto_mime FROM tickets_registrosoporte WHERE id = $1', [req.params.id]);
        if (!r.rowCount || !r.rows[0].adjunto) return res.status(404).json({ error: 'Sin adjunto.' });
        const t = r.rows[0];
        const b64 = String(t.adjunto).includes(',') ? String(t.adjunto).split(',')[1] : t.adjunto;
        res.set('Content-Type', t.adjunto_mime || 'image/png');
        res.set('Content-Disposition', `inline; filename="${(t.adjunto_nombre || 'captura').replace(/"/g, '')}"`);
        res.send(Buffer.from(b64, 'base64'));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Tickets propios de quien consulta. Filtra en el servidor: antes el panel de
// familias pedía la lista completa y la filtraba en el navegador.
app.get('/api/support/mios', authenticateSession, async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT s.id, s.subject, s.description, s.status, s.priority, s.created_at,
                    s.updated_at, s.resolved_at, s.app_label,
                    (s.adjunto IS NOT NULL) AS tiene_adjunto,
                    (SELECT COUNT(*) FROM tickets_mensajes m WHERE m.ticket_id = s.id AND m.canal = 'creador')::int AS mensajes
             FROM tickets_registrosoporte s
             WHERE s.user_id = $1
             ORDER BY s.created_at DESC`,
            [req.userSession.userId]
        );
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, tickets: r.rows });
    } catch (err) {
        console.error('[SUPPORT] Mis tickets error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/superadmins', authenticateSession, async (req, res) => {
    if (!req.userSession.isSuperAdmin && !req.userSession.canAccessAdmin)
        return res.status(403).json({ error: 'Sin permisos.' });
    try {
        const result = await pool.query(`
            SELECT user_id as id, name, surname, email
            FROM users
            WHERE role = 'superadmin' OR dev_role = 'superadmin' OR role = 'SuperAdmin'
            ORDER BY name ASC
        `);
        res.json({ success: true, superadmins: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// VITE / STATIC FILES
// =============================================================================

if (process.env.NODE_ENV !== 'production') {
    // Serve image/binary assets directly (Vite transforms source files but not binaries)
    app.use('/src', (req, res, next) => {
        if (/\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|pdf)$/i.test(req.path)) {
            express.static(path.join(__dirname, 'src'))(req, res, next);
        } else {
            next();
        }
    });

    // Dev: Vite handles all source files (including JSX transforms) before static middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'custom',
    });
    app.use(vite.middlewares);

    // /admin lo gestiona la SPA principal (interfaz nueva), no la app antigua de admin/
    app.get('/admin*', (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });
} else {
    // Prod: serve src/ images and dist/ built files
    app.use('/src', express.static(path.join(__dirname, 'src')));

    // /admin lo gestiona la SPA principal (interfaz nueva). Debe ir ANTES del
    // express.static para que no sirva el index del antiguo dist/admin/ por indexado.
    app.get('/admin*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist/index.html'));
    });

    app.use(express.static(path.join(__dirname, 'dist')));
}

app.get('/', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.sendFile(path.join(__dirname, 'dist/index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

app.get('*', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.sendFile(path.join(__dirname, 'dist/index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
