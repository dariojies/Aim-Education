import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgres://u9r5ap2i65epfh:p5c002efc65d006c68cbf2b96e6a30ef98a25f81d3bdac0ea628014b7c45ff543@c9ffqidprriprp.cluster-czz5s0kz4scl.eu-west-1.rds.amazonaws.com:5432/dbas79o4l5tqcf',
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
  try {
    await client.connect();
    console.log('Connected carefully');

    // Check users table (read-only)
    const res = await client.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1', ['users']);
    console.log('Users table columns:', res.rows.map(r => r.column_name).join(', '));

    // Check roles
    const rolesRes = await client.query('SELECT DISTINCT role FROM users');
    console.log('Existing roles in users:', rolesRes.rows);

    // Create Aim Education tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS aim_education_groups (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        description TEXT,
        level VARCHAR(50),
        created_at VARCHAR(255)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS aim_education_games (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255),
        description TEXT,
        category VARCHAR(50),
        difficulty VARCHAR(50),
        duration_min INTEGER,
        tags TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS aim_education_sessions (
        id VARCHAR(255) PRIMARY KEY,
        group_id VARCHAR(255),
        title VARCHAR(255),
        date VARCHAR(255),
        items TEXT,
        total_duration INTEGER,
        description TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS aim_education_attendance (
        id VARCHAR(255) PRIMARY KEY,
        date VARCHAR(255),
        group_id VARCHAR(255),
        present_student_ids TEXT,
        session_notes TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS aim_education_wallet (
        id VARCHAR(255) PRIMARY KEY,
        student_id VARCHAR(255),
        type VARCHAR(50),
        amount NUMERIC,
        description TEXT,
        date VARCHAR(255)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS aim_education_students_extra (
        id VARCHAR(255) PRIMARY KEY,
        group_id VARCHAR(255),
        position VARCHAR(255),
        emergency_contact VARCHAR(255),
        notes TEXT,
        active BOOLEAN,
        referral_code VARCHAR(255),
        referred_by_id VARCHAR(255),
        monthly_fee NUMERIC
      );
    `);

    console.log('Aim Education tables created successfully.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
