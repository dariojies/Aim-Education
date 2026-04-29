import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import cors from 'cors';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const { Pool } = pg;
const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
});

app.use(cors());
app.use(express.json());

// --- API Routes ---

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        if (userRes.rowCount === 0) {
            return res.status(401).json({ error: 'Credenciales incorrectas o usuario no encontrado.' });
        }
        const user = userRes.rows[0];
        let match = false;
        if (user.password && user.password.startsWith('$2')) {
            match = await bcrypt.compare(password, user.password);
        } else {
            match = (password === user.password);
        }
        if (!match) {
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }
        const isSuperAdmin = user.dev_role === 'superadmin' || user.role === 'superadmin' || user.role === 'SuperAdmin';
        res.json({ success: true, user: { ...user, isSuperAdmin } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT user_id, name, surname, email, belt, dev_role, role, profile_picture FROM users');
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

// --- Vite / Static Files ---

// Admin panel (Vite entry point)
app.get('/admin*', (req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
        res.sendFile(path.join(__dirname, 'dist/admin/index.html'));
    } else {
        next(); // Handled by Vite middleware or fallback
    }
});

if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
    });
    app.use(vite.middlewares);
} else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.use(express.static(path.join(__dirname)));
}

// Landing Page Fallback
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// SPA Fallback for /admin
app.get('/admin/*', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.sendFile(path.join(__dirname, 'dist/admin/index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'admin/index.html')); // We'll create this
    }
});

// General Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
