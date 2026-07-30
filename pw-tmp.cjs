const { chromium } = require('C:/Users/juanm/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const D = 'C:/Users/juanm/AppData/Local/Temp/claude/c--Users-juanm-Desktop-Programacion/b6291062-2d9e-4e26-96a0-22f169ae8c54/scratchpad';
(async () => {
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await pg.goto('http://localhost:3000/login');
await pg.fill('input[type=email]', 'zz.adm.claude@example.com');
await pg.fill('input[type=password]', 'pass1234abcd');
await pg.click('button[type=submit]');
await pg.waitForTimeout(4000);
await pg.goto('http://localhost:3000/admin/gastos');
await pg.waitForTimeout(3000);
await pg.screenshot({ path: D + '/g1-lista.png' });
console.log('pills:', (await pg.locator('.filter-pill').allTextContents()).join(' | '));
const fechas = () => Promise.all([pg.locator('input[type=date]').first().inputValue(), pg.locator('input[type=date]').nth(1).inputValue()]);
for (const n of ['Este mes', 'Último trimestre', 'Este año']) {
  await pg.getByRole('button', { name: n, exact: true }).click();
  await pg.waitForTimeout(1300);
  const [a, z] = await fechas();
  const filas = await pg.locator('.data-table-row').count();
  console.log(`${n.padEnd(18)} ${a} → ${z}   (${filas} filas)`);
  await pg.screenshot({ path: `${D}/g-${n.replace(/[^a-z]/gi, '')}.png` });
}
await pg.getByRole('button', { name: /Nuevo gasto/ }).click();
await pg.waitForTimeout(1500);
await pg.screenshot({ path: D + '/g4-form.png', fullPage: true });
console.log('reparto:', (await pg.locator('button:has-text("A partes iguales"), button:has-text("Según los alumnos"), button:has-text("Según las horas")').allTextContents()).join(' | '));
// Poner tipo específico para ver el desplegable de actividades
const selects = pg.locator('select');
for (let i = 0; i < await selects.count(); i++) {
  const opts = await selects.nth(i).locator('option').allTextContents();
  if (opts.some(o => /Espec/i.test(o))) { await selects.nth(i).selectOption({ label: opts.find(o => /Espec/i.test(o)) }); break; }
}
await pg.waitForTimeout(900);
for (let i = 0; i < await selects.count(); i++) {
  const opts = await selects.nth(i).locator('option').allTextContents();
  if (opts.some(o => /Taekwon|Ballet/.test(o))) console.log('actividades:', opts.join(' | '));
}
await pg.screenshot({ path: D + '/g5-form-especifico.png', fullPage: true });
await pg.keyboard.press('Escape');
// Pestaña del informe
await pg.getByRole('button', { name: /Beneficio por actividad/ }).click();
await pg.waitForTimeout(2500);
await pg.screenshot({ path: D + '/g6-informe.png', fullPage: true });
await b.close();
})();
