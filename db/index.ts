import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const db = new Pool({
  connectionString: 'postgres://u9r5ap2i65epfh:p5c002efc65d006c68cbf2b96e6a30ef98a25f81d3bdac0ea628014b7c45ff543@c9ffqidprriprp.cluster-czz5s0kz4scl.eu-west-1.rds.amazonaws.com:5432/dbas79o4l5tqcf',
  ssl: {
    rejectUnauthorized: false
  }
});

export default db;
