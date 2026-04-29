import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

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

async function main() {
  try {
    const res1 = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'`);
    console.log('--- USERS TABLE ---');
    console.log(res1.rows);

    const res2 = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'aim_education_access'`);
    console.log('--- ACCESS TABLE ---');
    console.log(res2.rows);

    const res3 = await pool.query(`SELECT * FROM users WHERE email = 'abelkaderberkane@gmail.com' LIMIT 1`);
    console.log('--- SAMPLE USER ---');
    console.log(res3.rows);

  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

main();
