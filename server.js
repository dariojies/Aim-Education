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
const dbConfig = {
    host: process.env.DB_HOST || 'c9ffqidprriprp.cluster-czz5s0kz4scl.eu-west-1.rds.amazonaws.com',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'u9r5ap2i65epfh',
    password: process.env.DB_PASSWORD || 'p5c002efc65d006c68cbf2b96e6a30ef98a25f81d3bdac0ea628014b7c45ff543',
    database: process.env.DB_NAME || 'dbas79o4l5tqcf',
    ssl: {
        rejectUnauthorized: false
    }
};

console.log(`Intentando conectar a la base de datos en ${dbConfig.host}:${dbConfig.port}...`);

const pool = new Pool(dbConfig);

pool.on('error', (err) => {
    console.error('Error inesperado en el pool de Postgres:', err);
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

        // Contraseña check
        if (user.password && user.password.startsWith('$2')) {
            match = await bcrypt.compare(password, user.password);
        } else {
            match = (password === user.password);
        }

        if (!match) {
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }

        // Role check: Identificar si es instructor o club_owner (o superadmin)
        const userRole = (user.role || '').toLowerCase();
        const devRole = (user.dev_role || '').toLowerCase();
        const allowedRoles = ['instructor', 'club_owner', 'superadmin'];
        
        const canAccessAdmin = allowedRoles.includes(userRole) || allowedRoles.includes(devRole);
        const isSuperAdmin = devRole === 'superadmin' || userRole === 'superadmin';
        
        res.json({ 
            success: true, 
            user: { 
                ...user, 
                canAccessAdmin,
                isSuperAdmin 
            } 
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Error del servidor al intentar iniciar sesión.' });
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

if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'custom', // We handle routes manually
    });
    app.use(vite.middlewares);

    // Development fallback for /admin
    app.get('/admin*', (req, res) => {
        res.sendFile(path.join(__dirname, 'admin/index.html'));
    });
} else {
    // Serve static files from dist
    app.use(express.static(path.join(__dirname, 'dist')));

    // Production fallback for /admin
    app.get('/admin*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist/admin/index.html'));
    });
}

// Landing Page
app.get('/', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.sendFile(path.join(__dirname, 'dist/index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

// General Fallback (Landing Page)
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
