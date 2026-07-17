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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// --- Database ---

const { Pool } = pg;

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
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_education_recibos (
                id TEXT PRIMARY KEY,
                date DATE,
                amount NUMERIC(10, 2),
                payment_method VARCHAR(100),
                company VARCHAR(255),
                invoice_link TEXT
            )
        `);
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
        // Qué concepto se cobra a quien esté en cada hora de cada temporada.
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_conceptos_temporada (
                id SERIAL PRIMARY KEY,
                concepto VARCHAR(100) NOT NULL REFERENCES aim_precios(concepto) ON DELETE CASCADE,
                hora VARCHAR(100) NOT NULL,
                temporada_id INTEGER NOT NULL REFERENCES aim_temporadas(id) ON DELETE CASCADE,
                UNIQUE (concepto, hora, temporada_id)
            )
        `);
        // Fichas / matrículas: sustituye a horarios_seleccionados.
        await client.query(`
            CREATE TABLE IF NOT EXISTS aim_matriculas (
                id SERIAL PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                hora VARCHAR(100) NOT NULL,
                temporada_id INTEGER NOT NULL REFERENCES aim_temporadas(id) ON DELETE CASCADE,
                descuento_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
                alta DATE NOT NULL DEFAULT CURRENT_DATE,
                baja DATE,
                UNIQUE (user_id, hora, temporada_id)
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
        // Cargos (los "pagos" de antes). precio/iva_pct/descripcion/tipo se
        // CONGELAN al generar: si mañana cambia el precio, agosto sigue siendo
        // el agosto de agosto aunque se pague con retraso.
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
                recibo_id INTEGER REFERENCES aim_recibos(id) ON DELETE SET NULL,
                estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
                anulado_motivo TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE (cliente_id, concepto, mes)
            )
        `);
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
        parentName: r.parent_name || null,
        parentEmail: r.parent_email || null,
    };
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
                    u.name || ' ' || COALESCE(u.surname,'') AS parent_name,
                    u.email AS parent_email
             FROM aim_camp_children c
             LEFT JOIN aim_camp_child_days d ON d.child_id = c.id
             LEFT JOIN users u ON u.user_id::text = c.user_id
             GROUP BY c.id, u.name, u.surname, u.email
             ORDER BY c.apellidos ASC, c.nombre ASC`
        );
        res.set('Cache-Control', 'no-store');
        res.json(result.rows.map(mapCampChild));
    } catch (err) {
        console.error('Error fetching admin camp children:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: alta manual de un niño (secretaría).
app.post('/api/admin/camp/children', authenticateSession, requireAdmin, async (req, res) => {
    const { nombre, apellidos, edad, alergias, observaciones, contacto, recogida, fotosRrss, pagado, days } = req.body;
    if (!nombre?.trim() || !apellidos?.trim()) return res.status(400).json({ error: 'Nombre y apellidos son obligatorios.' });
    const dayList = Array.isArray(days) ? [...new Set(days)] : [];
    try {
        const result = await pool.query(
            `INSERT INTO aim_camp_children (user_id, nombre, apellidos, edad, alergias, observaciones, contacto, recogida, fotos_rrss, pagado)
             VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [nombre.trim(), apellidos.trim(), edad || null, alergias?.trim() || null, observaciones?.trim() || null,
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
    const { days } = req.body;
    if (!Array.isArray(days)) return res.status(400).json({ error: 'days debe ser un array de fechas.' });
    const dayList = [...new Set(days)];
    try {
        await pool.query('DELETE FROM aim_camp_child_days WHERE child_id = $1', [req.params.id]);
        for (const day of dayList) {
            await pool.query(`INSERT INTO aim_camp_child_days (child_id, day) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, day]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: lista del día (pasar lista) — niños apuntados a esa fecha con su asistencia y nota.
app.get('/api/admin/camp/roster', authenticateSession, requireAdmin, async (req, res) => {
    const { day } = req.query;
    if (!day) return res.status(400).json({ error: 'Falta el parámetro day (YYYY-MM-DD).' });
    try {
        const result = await pool.query(
            `SELECT c.id, c.nombre, c.apellidos, c.edad, c.alergias, c.observaciones, c.contacto, c.recogida, c.fotos_rrss, c.pagado,
                    a.asistio, a.note,
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

// OJO: aim_education_recibos son GASTOS del club (proveedor + su factura), no
// recibos de familias. Es información interna del negocio: solo admin.
app.get('/api/receipts', authenticateSession, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM Aim_education_recibos ORDER BY date DESC');
        res.json(result.rows.map(r => ({
            id: r.id,
            date: r.date,
            amount: parseFloat(r.amount),
            paymentMethod: r.payment_method,
            company: r.company,
            invoiceLink: r.invoice_link
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/receipts', authenticateSession, requireAdmin, async (req, res) => {
    const { id, date, amount, paymentMethod, company, invoiceLink } = req.body;
    try {
        await pool.query(`
            INSERT INTO Aim_education_recibos (id, date, amount, payment_method, company, invoice_link)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
                date = EXCLUDED.date, amount = EXCLUDED.amount,
                payment_method = EXCLUDED.payment_method, company = EXCLUDED.company,
                invoice_link = EXCLUDED.invoice_link
        `, [id, date, amount, paymentMethod, company, invoiceLink]);
        res.json({ success: true });
    } catch (err) {
        console.error('Save Receipt Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/receipts/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM Aim_education_recibos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
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
    const { subject, description } = req.body;
    const userId = req.userSession.userId;
    if (!subject || !description)
        return res.status(400).json({ error: 'Asunto y descripción son obligatorios.' });
    try {
        const result = await pool.query(
            `INSERT INTO tickets_registrosoporte (user_id, subject, description, app_label)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [userId, subject, description, ['Aim Education']]
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
        const result = await pool.query(`
            SELECT s.*,
                   COALESCE(u.name, 'Admin') as name,
                   COALESCE(u.surname, '') as surname,
                   COALESCE(u.email, '') as email,
                   assignee.name as assignee_name,
                   assignee.surname as assignee_surname
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
        await pool.query(
            `UPDATE tickets_registrosoporte
             SET status = $1, dev_response = $2, priority = $3,
                 due_date = $4, assigned_to = $5, app_label = $6::TEXT[]
             WHERE id = $7`,
            [status || 'open', devResponse || '', priority || 'low', dueDate || null, assignedTo || null, finalAppLabels, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[SUPPORT] Update error:', err);
        res.status(500).json({ error: 'Error al actualizar el ticket.' });
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
