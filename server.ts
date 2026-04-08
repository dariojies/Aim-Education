import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  // --- API Routes ---

  // Login Authentication endpoint
  app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
      // Find the user first
      const userRes = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      if (userRes.rowCount === 0) {
        return res.status(401).json({ error: 'Credenciales incorrectas o usuario no encontrado.' });
      }

      const user = userRes.rows[0];

      // Compare password
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ error: 'Credenciales incorrectas.' });
      }

      // Check if user is superadmin directly in the users table
      const isSuperAdminDev = user.dev_role === 'superadmin';
      const isSuperAdminRole = user.role === 'superadmin';
      const isSuperAdminLegacy = user.role === 'SuperAdmin';

      if (isSuperAdminDev || isSuperAdminRole || isSuperAdminLegacy) {
        return res.json({ success: true, user: { ...user, isSuperAdmin: true } });
      }

      // User is not superadmin, check if they exist in the new access table
      const accessRes = await pool.query(
        'SELECT * FROM aim_education_access WHERE user_id = $1',
        [user.user_id]
      );

      if (accessRes.rowCount === 0) {
        return res.status(403).json({ error: 'No tienes permisos para acceder a esta aplicación.' });
      }

      // Authorized
      return res.json({ success: true, user: userRes.rows[0], access: accessRes.rows[0] });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Error del servidor.', details: err.message });
    }
  });

  // Set access rank
  app.post('/api/access', async (req, res) => {
    const { userId, rank } = req.body;
    try {
      // Upsert into aim_education_access
      const current = await pool.query('SELECT * FROM aim_education_access WHERE user_id = $1', [userId]);

      if (current.rowCount === 0) {
        await pool.query(
          'INSERT INTO aim_education_access (id, user_id, access_rank, created_at) VALUES (gen_random_uuid(), $1, $2, NOW())',
          [userId, rank]
        );
      } else {
        await pool.query(
          'UPDATE aim_education_access SET access_rank = $1 WHERE user_id = $2',
          [rank, userId]
        );
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Error setting access rank.', details: err.message });
    }
  });

  // Get all users for the dashboard/students view
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

      // Get all access ranks
      const accessRes = await pool.query('SELECT user_id, access_rank FROM aim_education_access');
      const accessMap = new Map(accessRes.rows.map(r => [r.user_id, r.access_rank]));

      const studentsWithAccess = mapped.map(s => ({
        ...s,
        accessRank: accessMap.get(s.id) || null
      }));

      res.json(studentsWithAccess);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await import('vite');
    const viteServer = await vite.createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
  });
}

startServer();
