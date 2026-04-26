import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import db from './db/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3001; // use 3001 to avoid colliding with aim-training if they run together

  app.use(cors());
  app.use(express.json());

  // --- Auth Route ---
  app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      const result = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [email.toLowerCase()]);
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Correo no encontrado en la base de datos.' });
      }

      const user = result.rows[0];

      const allowedRoles = ['instructor', 'club_owner'];
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Acceso denegado: Rol no autorizado para esta app.' });
      }

      let isValidPassword = false;
      const dbHash = user.password ? user.password.trim() : '';

      if (dbHash === password) {
        isValidPassword = true;
      } else {
        isValidPassword = await bcrypt.compare(password, dbHash).catch(() => false);
      }

      if (!isValidPassword) {
        return res.status(401).json({ error: 'Contraseña incorrecta.' });
      }

      const mappedInstructor = {
        id: user.user_id,
        name: `${user.name || ''} ${user.surname || ''}`.trim() || user.username || 'Unknown',
        email: user.email,
        role: user.role,
        avatarUrl: user.profile_picture || ''
      };

      res.json(mappedInstructor);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- GROUPS ---
  app.get('/api/groups', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM aim_education_groups');
      res.json(result.rows.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        level: r.level,
        createdAt: r.created_at
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/groups', async (req, res) => {
    const { id, name, description, level, createdAt } = req.body;
    try {
      // Upsert logic
      const existing = await db.query('SELECT id FROM aim_education_groups WHERE id = $1', [id]);
      if (existing.rows.length > 0) {
        await db.query('UPDATE aim_education_groups SET name=$1, description=$2, level=$3 WHERE id=$4', [name, description, level, id]);
      } else {
        await db.query(
          'INSERT INTO aim_education_groups (id, name, description, level, created_at) VALUES ($1, $2, $3, $4, $5)',
          [id, name, description, level, createdAt || new Date().toISOString()]
        );
      }
      res.json(req.body);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/groups/:id', async (req, res) => {
    try {
      await db.query('DELETE FROM aim_education_groups WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- STUDENTS ---
  app.get('/api/students', async (req, res) => {
    try {
      // Traemos a todos los usuarios
      const usersRes = await db.query('SELECT * FROM users');
      // Traemos su data extra
      const extraRes = await db.query('SELECT * FROM aim_education_students_extra');

      const extraMap: any = {};
      extraRes.rows.forEach(e => {
        extraMap[e.id] = {
          groupId: e.group_id || '',
          position: e.position || '',
          emergencyContact: e.emergency_contact || '',
          notes: e.notes || '',
          active: e.active !== false,
          referralCode: e.referral_code || '',
          referredById: e.referred_by_id || '',
          monthlyFee: e.monthly_fee ? parseFloat(e.monthly_fee) : 0,
          // Guardamos firstName y lastName si los insertaron directos sin pasar por users (para nuevos registros locales)
          firstName: e.notes && e.notes.startsWith('FNAME:') ? e.notes.split('|')[0].substring(6) : '',
          lastName: e.notes && e.notes.includes('|LNAME:') ? e.notes.split('|LNAME:')[1] : ''
        };
      });

      // Mapeamos los que están en la base de datos `users`
      const combined = usersRes.rows.map(u => {
        const ext = extraMap[u.user_id] || {};
        return {
          id: u.user_id,
          groupId: ext.groupId || '',
          firstName: u.name || u.username || 'Desconocido',
          lastName: u.surname || '',
          age: 0, // No mapping available in default users easily unless parsing birthday
          position: ext.position || '',
          emergencyContact: ext.emergencyContact || '',
          notes: ext.notes || '',
          active: ext.active !== false,
          referralCode: ext.referralCode || '',
          referredById: ext.referredById || '',
          monthlyFee: ext.monthlyFee || 0
        };
      });

      // Añadimos los "nuevos" agregados por Aim Education que no tienen correlación real en `users`
      // identificados porque el id está en extraMap pero no en usersRes.
      const usersIds = new Set(usersRes.rows.map(u => u.user_id));
      for (const id in extraMap) {
        if (!usersIds.has(id)) {
          const ext = extraMap[id];
          combined.push({
            id: id,
            groupId: ext.groupId || '',
            firstName: ext.firstName || 'Nuevo',
            lastName: ext.lastName || 'Alumno',
            age: 0,
            position: ext.position || '',
            emergencyContact: ext.emergencyContact || '',
            notes: '',
            active: ext.active !== false,
            referralCode: ext.referralCode || '',
            referredById: ext.referredById || '',
            monthlyFee: ext.monthlyFee || 0
          });
        }
      }

      res.json(combined);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/students', async (req, res) => {
    const {
      id, groupId, firstName, lastName, position,
      emergencyContact, notes, active, referralCode, referredById, monthlyFee
    } = req.body;

    // Aquí NUNCA insertamos a la tabla "users", la mantenemos protegida.
    // Insertamos la información a aim_education_students_extra
    // Metemos el nombre y apellido en "notes" como truco por si es un alumno nuevo real sin cuenta en 'users'
    const storedNotes = `FNAME:${firstName || ''}|LNAME:${lastName || ''}`;

    try {
      const existing = await db.query('SELECT id FROM aim_education_students_extra WHERE id = $1', [id]);
      if (existing.rows.length > 0) {
        await db.query(`
           UPDATE aim_education_students_extra SET 
            group_id=$1, position=$2, emergency_contact=$3, notes=$4, active=$5, 
            referral_code=$6, referred_by_id=$7, monthly_fee=$8
           WHERE id=$9
         `, [groupId, position, emergencyContact, storedNotes, active, referralCode, referredById, monthlyFee, id]);
      } else {
        await db.query(`
           INSERT INTO aim_education_students_extra 
           (id, group_id, position, emergency_contact, notes, active, referral_code, referred_by_id, monthly_fee)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         `, [id, groupId, position, emergencyContact, storedNotes, active, referralCode, referredById, monthlyFee]);
      }
      res.json(req.body);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/students/:id', async (req, res) => {
    try {
      await db.query('DELETE FROM aim_education_students_extra WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- GAMES ---
  app.get('/api/games', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM aim_education_games');
      res.json(result.rows.map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        difficulty: r.difficulty,
        durationMin: r.duration_min,
        tags: r.tags ? JSON.parse(r.tags) : []
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/games', async (req, res) => {
    const { id, title, description, category, difficulty, durationMin, tags } = req.body;
    try {
      const existing = await db.query('SELECT id FROM aim_education_games WHERE id = $1', [id]);
      if (existing.rows.length > 0) {
        await db.query('UPDATE aim_education_games SET title=$1, description=$2, category=$3, difficulty=$4, duration_min=$5, tags=$6 WHERE id=$7',
          [title, description, category, difficulty, durationMin, JSON.stringify(tags || []), id]);
      } else {
        await db.query('INSERT INTO aim_education_games (id, title, description, category, difficulty, duration_min, tags) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [id, title, description, category, difficulty, durationMin, JSON.stringify(tags || [])]);
      }
      res.json(req.body);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/games/:id', async (req, res) => {
    try {
      await db.query('DELETE FROM aim_education_games WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- SESSIONS ---
  app.get('/api/sessions', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM aim_education_sessions');
      res.json(result.rows.map(r => ({
        id: r.id,
        groupId: r.group_id,
        title: r.title,
        date: r.date,
        items: r.items ? JSON.parse(r.items) : [],
        totalDuration: r.total_duration,
        description: r.description
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sessions', async (req, res) => {
    const { id, groupId, title, date, items, totalDuration, description } = req.body;
    try {
      const existing = await db.query('SELECT id FROM aim_education_sessions WHERE id = $1', [id]);
      if (existing.rows.length > 0) {
        await db.query('UPDATE aim_education_sessions SET group_id=$1, title=$2, date=$3, items=$4, total_duration=$5, description=$6 WHERE id=$7',
          [groupId, title, date, JSON.stringify(items || []), totalDuration, description, id]);
      } else {
        await db.query('INSERT INTO aim_education_sessions (id, group_id, title, date, items, total_duration, description) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [id, groupId, title, date, JSON.stringify(items || []), totalDuration, description]);
      }
      res.json(req.body);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/sessions/:id', async (req, res) => {
    try {
      await db.query('DELETE FROM aim_education_sessions WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- ATTENDANCE ---
  app.get('/api/attendance', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM aim_education_attendance');
      res.json(result.rows.map(r => ({
        id: r.id,
        date: r.date,
        groupId: r.group_id,
        presentStudentIds: r.present_student_ids ? JSON.parse(r.present_student_ids) : [],
        sessionNotes: r.session_notes
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/attendance', async (req, res) => {
    const { id, date, groupId, presentStudentIds, sessionNotes } = req.body;
    try {
      await db.query('INSERT INTO aim_education_attendance (id, date, group_id, present_student_ids, session_notes) VALUES ($1, $2, $3, $4, $5)',
        [id, date, groupId, JSON.stringify(presentStudentIds || []), sessionNotes]);
      res.json(req.body);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- WALLET ---
  app.get('/api/wallet', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM aim_education_wallet');
      res.json(result.rows.map(r => ({
        id: r.id,
        studentId: r.student_id,
        type: r.type,
        amount: parseFloat(r.amount),
        description: r.description,
        date: r.date
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/wallet', async (req, res) => {
    const { id, studentId, type, amount, description, date } = req.body;
    try {
      await db.query('INSERT INTO aim_education_wallet (id, student_id, type, amount, description, date) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, studentId, type, amount, description, date]);
      res.json(req.body);
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
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Backend server corriendo en el puerto ${PORT}`);
  });
}

startServer();
