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
    const tablesToInspect = ['aim_education_sessions', 'tul_aulas', 'aim_education_groups'];
    for (const t of tablesToInspect) {
      const resCol = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${t}'`);
      console.log(`--- ${t.toUpperCase()} COLUMNS ---`);
      console.log(resCol.rows);

      const resSample = await pool.query(`SELECT * FROM ${t} LIMIT 3`);
      console.log(`--- ${t.toUpperCase()} SAMPLE ---`);
      console.log(resSample.rows);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

main();
