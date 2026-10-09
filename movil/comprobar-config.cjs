// Antes de compilar el APK o el AAB: la app tiene que abrir la web de verdad.
// (Un APK de pruebas apuntando a un servidor local acabó en un móvil: al abrirlo
// salía «No hay conexión» y, al reintentar, la web cargaba sin los avisos.)
// Para compilar a propósito contra otro servidor: AIM_SERVIDOR_PRUEBAS=1.
const fs = require('fs');
const path = require('path');

const WEB = 'https://www.aimeducation.es';
const leer = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
// node comprobar-config.cjs android|ios: la de la raíz y la copiada a esa plataforma.
const COPIA = { android: 'android/app/src/main/assets/capacitor.config.json', ios: 'ios/App/App/capacitor.config.json' };
const urls = [
  ['capacitor.config.json', leer('capacitor.config.json').server?.url],
  ...[COPIA[process.argv[2]]].filter(f => f && fs.existsSync(path.join(__dirname, f))).map(f => [f, leer(f).server?.url]),
];
const malas = urls.filter(([, u]) => u !== WEB);
if (malas.length && !process.env.AIM_SERVIDOR_PRUEBAS) {
  for (const [f, u] of malas) console.error(`✗ ${f}: la app abre ${u || '(nada)'} y no ${WEB}`);
  console.error('Pon server.url a la web de verdad y vuelve a hacer «npx cap sync». Si es a propósito, AIM_SERVIDOR_PRUEBAS=1.');
  process.exit(1);
}
console.log(`✓ La app abre ${WEB}`);
