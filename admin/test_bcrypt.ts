import bcrypt from 'bcryptjs';

async function test() {
  const hash = "$2b$10$KZM5xMNmWCw4Sj2jvhdtBebOmuauzpyAG3cqV5xNy/JL11cGfvzZm";
  for (const pw of ['1234', '123456', 'Abel1234', 'password', 'Allegro', 'admin']) {
    const match = await bcrypt.compare(pw, hash);
    console.log(`Testing '${pw}': ${match}`);
  }
}

test();
