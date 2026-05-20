import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';

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

// --- Middleware ---

app.use(cors({
    origin: (origin, callback) => callback(null, origin || true),
    credentials: true
}));
app.use(express.json());

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
        const result = await pool.query(
            'SELECT user_id, name, surname, email, belt, dev_role, role, profile_picture FROM users'
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

app.get('/api/receipts', authenticateSession, async (req, res) => {
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

app.post('/api/receipts', authenticateSession, async (req, res) => {
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

app.delete('/api/receipts/:id', authenticateSession, async (req, res) => {
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
    const { title, excerpt, content, coverImageUrl, category, status, slug } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Título y contenido son obligatorios.' });

    const id = crypto.randomUUID();
    const finalSlug = slug ? slugify(slug) : slugify(title);
    const authorName = `${req.userSession.firstName || ''} ${req.userSession.lastName || ''}`.trim();
    const publishedAt = status === 'published' ? new Date() : null;

    try {
        await pool.query(`
            INSERT INTO aim_education_posts (id, title, slug, excerpt, content, cover_image_url, author_name, category, status, published_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [id, title, finalSlug, excerpt || null, content, coverImageUrl || null, authorName || 'Admin', category || 'general', status || 'draft', publishedAt]);

        const result = await pool.query('SELECT * FROM aim_education_posts WHERE id = $1', [id]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una entrada con ese slug. Usa un título diferente o edita el slug.' });
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/posts/:id', authenticateSession, async (req, res) => {
    const { title, excerpt, content, coverImageUrl, category, status, slug } = req.body;
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
        `, [title, finalSlug, excerpt || null, content, coverImageUrl || null, category || 'general', status || 'draft', publishedAt, req.params.id]);

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
// PUBLIC NEWS HTML PAGES
// =============================================================================

app.get('/noticias', async (req, res) => {
    try {
        const { category } = req.query;
        const params = [];
        let where = `WHERE status = 'published'`;
        if (category) {
            params.push(category);
            where += ` AND category = $1`;
        }

        const result = await pool.query(
            `SELECT id, title, slug, excerpt, cover_image_url, author_name, category, view_count, published_at
             FROM aim_education_posts ${where}
             ORDER BY published_at DESC NULLS LAST`,
            params
        );

        const categoryButtons = ['', ...Object.keys(CATEGORY_LABELS)].map(cat => {
            const isActive = category === cat || (!category && cat === '');
            const label = cat === '' ? 'Todas' : CATEGORY_LABELS[cat];
            const href = cat === '' ? '/noticias' : `/noticias?category=${cat}`;
            return `<a href="${href}" class="px-4 py-2 rounded-full text-sm font-bold border transition-all ${isActive ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-600'}">${label}</a>`;
        }).join('');

        const postCards = result.rows.length === 0
            ? `<div class="col-span-3 text-center py-20 text-slate-400">No hay noticias publicadas aún.</div>`
            : result.rows.map(post => {
                const dateStr = post.published_at
                    ? new Date(post.published_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                    : '';
                const catLabel = CATEGORY_LABELS[post.category] || post.category;
                const cover = post.cover_image_url
                    ? `<img src="${escapeXml(post.cover_image_url)}" alt="" class="w-full h-44 object-cover">`
                    : `<div class="w-full h-32 bg-gradient-to-br from-emerald-500 to-teal-600"></div>`;
                return `
<article class="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-all group">
  ${cover}
  <div class="p-5">
    <div class="flex items-center gap-2 mb-3">
      <span class="text-xs font-bold bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">${escapeXml(catLabel)}</span>
      ${dateStr ? `<span class="text-xs text-slate-400">${dateStr}</span>` : ''}
    </div>
    <h2 class="text-lg font-extrabold text-slate-900 tracking-tight mb-2 group-hover:text-emerald-600 transition-colors leading-snug" style="font-family:'Outfit',sans-serif">${escapeXml(post.title)}</h2>
    ${post.excerpt ? `<p class="text-slate-500 text-sm leading-relaxed line-clamp-3">${escapeXml(post.excerpt)}</p>` : ''}
    <a href="/noticias/${escapeXml(post.slug)}" data-post-id="${post.id}"
       class="read-more inline-flex items-center gap-1 mt-4 text-sm font-bold text-emerald-600 hover:text-emerald-500 transition-colors">
      Leer más <span>→</span>
    </a>
  </div>
</article>`;
            }).join('');

        const body = `
<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
  <div>
    <h1 class="text-4xl font-extrabold text-slate-900 tracking-tight" style="font-family:'Outfit',sans-serif">Noticias</h1>
    <p class="text-slate-400 mt-1 text-sm">Últimas novedades de AIM Education</p>
  </div>
</div>
<div class="flex gap-2 flex-wrap mb-4">${categoryButtons}</div>
<div class="flex gap-2 flex-wrap items-center p-3 mb-8 bg-orange-50 rounded-xl border border-orange-100">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="text-orange-500 shrink-0"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/></svg>
  <span class="text-xs font-bold text-orange-700 mr-1">Suscribirse por RSS:</span>
  <a href="/feed.xml" class="text-xs px-3 py-1 rounded-full bg-white border border-orange-200 text-orange-700 hover:bg-orange-100 font-bold transition-colors">Anuncios generales</a>
  <a href="/feed/taekwondo.xml" class="text-xs px-3 py-1 rounded-full bg-white border border-orange-200 text-orange-700 hover:bg-orange-100 font-bold transition-colors">Taekwondo</a>
  <a href="/feed/ballet.xml" class="text-xs px-3 py-1 rounded-full bg-white border border-orange-200 text-orange-700 hover:bg-orange-100 font-bold transition-colors">Ballet</a>
  <a href="/feed/ingles.xml" class="text-xs px-3 py-1 rounded-full bg-white border border-orange-200 text-orange-700 hover:bg-orange-100 font-bold transition-colors">Inglés</a>
  <a href="/feed/robotica.xml" class="text-xs px-3 py-1 rounded-full bg-white border border-orange-200 text-orange-700 hover:bg-orange-100 font-bold transition-colors">Robótica</a>
  <a href="/feed/competicion.xml" class="text-xs px-3 py-1 rounded-full bg-white border border-orange-200 text-orange-700 hover:bg-orange-100 font-bold transition-colors">Competición</a>
  <a href="/feed/shelfie.xml" class="text-xs px-3 py-1 rounded-full bg-white border border-orange-200 text-orange-700 hover:bg-orange-100 font-bold transition-colors">Shelfie</a>
  <a href="/feed/todo.xml" class="text-xs px-3 py-1 rounded-full bg-white border border-orange-200 text-orange-700 hover:bg-orange-100 font-bold transition-colors">Todo</a>
</div>
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">${postCards}</div>
<script>
document.querySelectorAll('.read-more').forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    const id = this.dataset.postId;
    const href = this.href;
    fetch('/api/posts/' + id + '/click', { method: 'POST' }).finally(() => { window.location.href = href; });
  });
});
</script>`;

        const siteUrlNews = `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
        res.send(newsLayout('Noticias', body, siteUrlNews, {
            canonicalUrl: `${siteUrlNews}/noticias`,
            description: 'Últimas noticias y novedades de AIM Education Algeciras'
        }));
    } catch (err) {
        console.error('News listing error:', err);
        res.status(500).send('Error cargando noticias');
    }
});

app.get('/noticias/:slug', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM aim_education_posts WHERE slug = $1 AND status = 'published'`,
            [req.params.slug]
        );

        if (result.rowCount === 0) {
            const body = `<div class="text-center py-24"><p class="text-6xl mb-4">📰</p><h1 class="text-3xl font-extrabold text-slate-900 mb-2" style="font-family:'Outfit',sans-serif">Noticia no encontrada</h1><p class="text-slate-400 mb-6">Esta entrada no existe o ha sido eliminada.</p><a href="/noticias" class="text-emerald-600 font-bold hover:underline">← Volver a noticias</a></div>`;
            return res.status(404).send(newsLayout('No encontrado', body, ''));
        }

        const post = result.rows[0];
        await pool.query(`UPDATE aim_education_posts SET view_count = view_count + 1 WHERE id = $1`, [post.id]);
        await pool.query(`INSERT INTO aim_education_post_views (post_id, event_type) VALUES ($1, 'view')`, [post.id]);

        const dateStr = post.published_at
            ? new Date(post.published_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
            : '';
        const catLabel = CATEGORY_LABELS[post.category] || post.category;

        const body = `
<article class="max-w-3xl mx-auto">
  <div class="mb-6">
    <a href="/noticias" class="text-sm text-slate-400 hover:text-emerald-600 font-semibold transition-colors">← Volver a noticias</a>
  </div>
  ${post.cover_image_url ? `<img src="${escapeXml(post.cover_image_url)}" alt="${escapeXml(post.title)}" class="w-full h-72 object-cover rounded-2xl mb-8 shadow-sm">` : ''}
  <div class="flex flex-wrap items-center gap-3 mb-4">
    <span class="text-xs font-bold bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">${escapeXml(catLabel)}</span>
    ${dateStr ? `<span class="text-sm text-slate-400">${dateStr}</span>` : ''}
    ${post.author_name ? `<span class="text-sm text-slate-400">por <strong>${escapeXml(post.author_name)}</strong></span>` : ''}
  </div>
  <h1 class="text-4xl font-extrabold text-slate-900 tracking-tight mb-8 leading-tight" style="font-family:'Outfit',sans-serif">${escapeXml(post.title)}</h1>
  <div class="text-slate-600">${renderMarkdown(post.content)}</div>
  <div class="mt-12 pt-8 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
    <span class="text-sm text-slate-400">${post.view_count + 1} visita${post.view_count + 1 !== 1 ? 's' : ''}</span>
    <div class="flex gap-3">
      <a href="/noticias" class="text-sm font-bold text-slate-500 hover:text-emerald-600 transition-colors">← Más noticias</a>
      <a href="${['general', 'club'].includes(post.category) ? '/feed.xml' : '/feed/' + post.category + '.xml'}" class="flex items-center gap-1.5 text-sm font-bold text-orange-500 hover:text-orange-400 transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/></svg>
        RSS ${escapeXml(catLabel)}
      </a>
    </div>
  </div>
</article>`;

        const siteUrlPost = `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
        res.send(newsLayout(post.title, body, siteUrlPost, {
            canonicalUrl: `${siteUrlPost}/noticias/${post.slug}`,
            description: post.excerpt || post.title,
            ogImage: post.cover_image_url || `${siteUrlPost}/src/logo.png`
        }));
    } catch (err) {
        console.error('Post page error:', err);
        res.status(500).send('Error cargando la noticia');
    }
});

// =============================================================================
// VITE / STATIC FILES
// =============================================================================

// Serve src/ assets at /src/* in all environments (logo, images, etc.)
app.use('/src', express.static(path.join(__dirname, 'src')));

if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'custom',
    });
    app.use(vite.middlewares);

    app.get('/admin*', (req, res) => {
        res.sendFile(path.join(__dirname, 'admin/index.html'));
    });
} else {
    app.use(express.static(path.join(__dirname, 'dist')));

    app.get('/admin*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist/admin/index.html'));
    });
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
