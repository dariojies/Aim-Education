import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const userRes = await pool.query('SELECT email, password, dev_role, role FROM users LIMIT 5');
    fs.writeFileSync('check_pass_out.json', JSON.stringify(userRes.rows, null, 2));
    console.log("Done");
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
