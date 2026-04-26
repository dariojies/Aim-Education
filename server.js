const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: 'postgres://u9r5ap2i65epfh:p5c002efc65d006c68cbf2b96e6a30ef98a25f81d3bdac0ea628014b7c45ff543@c9ffqidprriprp.cluster-czz5s0kz4scl.eu-west-1.rds.amazonaws.com:5432/dbas79o4l5tqcf',
  ssl: {
    rejectUnauthorized: false
  }
});

const JWT_SECRET = 'aim_education_super_secret_key_2026';

// --- DB INITIALIZATION (Create tables if missing) ---
async function initDatabase() {
    try {
        console.log('Verificando tablas en la base de datos...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS aim_education_groups (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255), description TEXT, level VARCHAR(50), created_at VARCHAR(255));
            CREATE TABLE IF NOT EXISTS aim_education_games (id VARCHAR(255) PRIMARY KEY, title VARCHAR(255), description TEXT, category VARCHAR(50), difficulty VARCHAR(50), duration_min INTEGER, tags TEXT);
            CREATE TABLE IF NOT EXISTS aim_education_sessions (id VARCHAR(255) PRIMARY KEY, group_id VARCHAR(255), title VARCHAR(255), date VARCHAR(255), items TEXT, total_duration INTEGER, description TEXT);
            CREATE TABLE IF NOT EXISTS aim_education_attendance (id VARCHAR(255) PRIMARY KEY, date VARCHAR(255), group_id VARCHAR(255), present_student_ids TEXT, session_notes TEXT);
            CREATE TABLE IF NOT EXISTS aim_education_wallet (id VARCHAR(255) PRIMARY KEY, student_id VARCHAR(255), type VARCHAR(50), amount NUMERIC, description TEXT, date VARCHAR(255));
            CREATE TABLE IF NOT EXISTS aim_education_students_extra (id VARCHAR(255) PRIMARY KEY, group_id VARCHAR(255), position VARCHAR(255), emergency_contact VARCHAR(255), notes TEXT, active BOOLEAN, referral_code VARCHAR(255), referred_by_id VARCHAR(255), monthly_fee NUMERIC);
        `);
        console.log('✅ Tablas de Aim Education verificadas/creadas.');
    } catch (err) {
        console.error('❌ Error al inicializar tablas:', err.message);
    }
}
initDatabase();

// --- AUTH API ---
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciales inválidas.' });
    const user = result.rows[0];
    const dbHash = (user.password || '').trim();
    let isValid = (dbHash === password);
    if (!isValid) isValid = await bcrypt.compare(password, dbHash).catch(() => false);
    if (!isValid) return res.status(401).json({ error: 'Credenciales inválidas.' });
    const userName = [user.name, user.surname].filter(Boolean).join(' ') || user.username || 'Usuario';
    const token = jwt.sign({ id: user.user_id, role: user.role, email: user.email, name: userName }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.user_id, name: userName, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ error: 'Error del servidor.' }); }
});

// --- ADMIN API ---
app.get('/api/groups', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM aim_education_groups');
    res.json(result.rows.map(r => ({ id: r.id, name: r.name, description: r.description, level: r.level, createdAt: r.created_at })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/students', async (req, res) => {
  try {
    const usersRes = await pool.query('SELECT * FROM users');
    const extraRes = await pool.query('SELECT * FROM aim_education_students_extra');
    const extraMap = {};
    extraRes.rows.forEach(e => { extraMap[e.id] = { groupId: e.group_id || '', position: e.position || '', emergencyContact: e.emergency_contact || '', monthlyFee: e.monthly_fee ? parseFloat(e.monthly_fee) : 0, active: e.active !== false }; });
    const combined = usersRes.rows.map(u => ({ id: u.user_id, groupId: extraMap[u.user_id]?.groupId || '', firstName: u.name || u.username || 'Alumno', lastName: u.surname || '', position: extraMap[u.user_id]?.position || '', active: extraMap[u.user_id]?.active !== false, monthlyFee: extraMap[u.user_id]?.monthlyFee || 0 }));
    res.json(combined);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/games', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM aim_education_games');
    res.json(result.rows.map(r => ({ id: r.id, title: r.title, description: r.description, category: r.category, difficulty: r.difficulty, durationMin: r.duration_min, tags: r.tags ? JSON.parse(r.tags) : [] })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SERVING FRONTENDS ---

async function setupVite() {
    const adminPath = path.join(__dirname, 'admin');
    
    // Si la carpeta admin existe y tiene un index.html, intentamos usar Vite para procesar los archivos .tsx
    if (fs.existsSync(adminPath) && fs.existsSync(path.join(adminPath, 'index.html'))) {
        try {
            const vite = await require('vite');
            const viteServer = await vite.createServer({
                root: adminPath,
                server: { middlewareMode: true },
                appType: 'spa',
            });
            app.use('/admin', viteServer.middlewares);
            console.log('🚀 Modo Desarrollo: Vite habilitado para el Panel Admin en /admin');
        } catch (e) {
            console.log('⚠️ No se pudo cargar Vite, sirviendo /admin como estático (puede fallar si no está compilado).');
            app.use('/admin', express.static(adminPath));
        }
    } else {
        console.log('ℹ️ Carpeta /admin no encontrada o sin index.html. Ignorando.');
    }

    // Main App
    app.use(express.static(path.join(__dirname)));
    app.use('/src', express.static(path.join(__dirname, 'src')));

    // Fallbacks
    app.get('/admin/*', (req, res) => { res.sendFile(path.join(__dirname, 'admin', 'index.html')); });
    app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

    app.listen(port, () => {
        console.log(`✅ Servidor Super-Aim corriendo en http://localhost:${port}`);
    });
}

setupVite();
