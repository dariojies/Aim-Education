const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://u9r5ap2i65epfh:p5c002efc65d006c68cbf2b96e6a30ef98a25f81d3bdac0ea628014b7c45ff543@c9ffqidprriprp.cluster-czz5s0kz4scl.eu-west-1.rds.amazonaws.com:5432/dbas79o4l5tqcf',
  ssl: {
    rejectUnauthorized: false
  }
});

const tablesToCheck = [
  'users',
  'aim_education_groups',
  'aim_education_students_extra',
  'aim_education_games',
  'aim_education_sessions',
  'aim_education_attendance',
  'aim_education_wallet'
];

async function run() {
  try {
    await client.connect();
    for (const table of tablesToCheck) {
      const res = await client.query('SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)', [table]);
      console.log(`Table ${table}: ${res.rows[0].exists ? 'EXISTS' : 'MISSING'}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
