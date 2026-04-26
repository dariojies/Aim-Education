const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

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

// --- AUTH API ---
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Faltan datos.' });

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
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// --- ADMIN API (Merged from Admin App) ---

// GROUPS
app.get('/api/groups', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM aim_education_groups');
    res.json(result.rows.map(r => ({ id: r.id, name: r.name, description: r.description, level: r.level, createdAt: r.created_at })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/groups', async (req, res) => {
  const { id, name, description, level, createdAt } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM aim_education_groups WHERE id = $1', [id]);
    if (existing.rows.length > 0) {
      await pool.query('UPDATE aim_education_groups SET name=$1, description=$2, level=$3 WHERE id=$4', [name, description, level, id]);
    } else {
      await pool.query('INSERT INTO aim_education_groups (id, name, description, level, created_at) VALUES ($1, $2, $3, $4, $5)', [id, name, description, level, createdAt || new Date().toISOString()]);
    }
    res.json(req.body);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/groups/:id', async (req, res) => {
  try { await pool.query('DELETE FROM aim_education_groups WHERE id = $1', [req.params.id]); res.json({ success: true }); } 
  catch (err) { res.status(500).json({ error: err.message }); }
});

// STUDENTS (With Extra Info)
app.get('/api/students', async (req, res) => {
  try {
    const usersRes = await pool.query('SELECT * FROM users');
    const extraRes = await pool.query('SELECT * FROM aim_education_students_extra');
    const extraMap = {};
    extraRes.rows.forEach(e => {
      extraMap[e.id] = { groupId: e.group_id || '', position: e.position || '', emergencyContact: e.emergency_contact || '', monthlyFee: e.monthly_fee ? parseFloat(e.monthly_fee) : 0, active: e.active !== false };
    });
    const combined = usersRes.rows.map(u => ({
      id: u.user_id, groupId: extraMap[u.user_id]?.groupId || '', firstName: u.name || u.username || 'Alumno', lastName: u.surname || '', position: extraMap[u.user_id]?.position || '', active: extraMap[u.user_id]?.active !== false, monthlyFee: extraMap[u.user_id]?.monthlyFee || 0
    }));
    res.json(combined);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GAMES
app.get('/api/games', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM aim_education_games');
    res.json(result.rows.map(r => ({ id: r.id, title: r.title, description: r.description, category: r.category, difficulty: r.difficulty, durationMin: r.duration_min, tags: r.tags ? JSON.parse(r.tags) : [] })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SESSIONS, ATTENDANCE, WALLET (Adding basic support)
app.get('/api/sessions', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM aim_education_sessions');
        res.json(result.rows.map(r => ({ id: r.id, groupId: r.group_id, title: r.title, date: r.date, items: r.items ? JSON.parse(r.items) : [], totalDuration: r.total_duration, description: r.description })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sessions', async (req, res) => {
    const { id, groupId, title, date, items, totalDuration, description } = req.body;
    try {
        await pool.query('INSERT INTO aim_education_sessions (id, group_id, title, date, items, total_duration, description) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET group_id=$1, title=$2, date=$3, items=$4, total_duration=$5, description=$6', 
        [id, groupId, title, date, JSON.stringify(items || []), totalDuration, description]);
        res.json(req.body);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SERVING STATIC FILES ---

// Serve the Main Generic App from root
app.use(express.static(path.join(__dirname)));

// Serve the Admin Panel App (when moved to /admin)
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/admin/assets', express.static(path.join(__dirname, 'admin', 'assets')));

// Fallback for Admin SPA
app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// Fallback for Main SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
