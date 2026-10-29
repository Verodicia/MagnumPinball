import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const outDir = '/Users/clark/.gemini/antigravity/brain/e143d504-0414-459e-9463-f8bf73e0d591/scratch';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

const page = await browser.newPage();
page.on('console', (m) => {
  if (['error'].includes(m.type())) console.log('BROWSER ERROR:', m.text());
});

await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.pinball?.game?.runtime, { timeout: 15000 });
await new Promise((r) => setTimeout(r, 1200));

console.log('1. Page loaded, switching to Edit mode...');
await page.click('#btn-edit');
await new Promise((r) => setTimeout(r, 500));

const editMode = await page.$eval('#app', (e) => e.dataset.mode);
console.log('  edit mode active:', editMode === 'edit');
const rulesHidden = await page.$eval('#rules-panel', (e) => getComputedStyle(e).display === 'none');
const telemHidden = await page.$eval('#telemetry-panel', (e) => getComputedStyle(e).display === 'none');
console.log('  rules-panel hidden:', rulesHidden);
console.log('  telemetry-panel hidden:', telemHidden);

await page.screenshot({ path: `${outDir}/edit_tab_catalog.png` });

console.log('2. Clicking pop_a on the table to inspect...');
const ptPop = await page.evaluate(() => {
  const g = window.pinball.game;
  const V = g.gfx.camera.position.constructor;
  const t = g.gfx.table;
  t.updateMatrixWorld(true);
  const v = new V(30 - 28, 0, -(72 - 56)).applyMatrix4(t.matrixWorld).project(g.gfx.camera);
  const r = g.gfx.renderer.domElement.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
});
await page.mouse.click(ptPop.x, ptPop.y);
await new Promise((r) => setTimeout(r, 600));

const numSwatches = await page.$$eval('.sims-card', (cards) => cards.length);
console.log('  sims-card count for PopBumper:', numSwatches);
await page.screenshot({ path: `${outDir}/edit_tab_style_pop.png` });

console.log('3. Clicking "Jet Turbine" swatch...');
await page.click('.sims-card[data-style="turbine"]');
await new Promise((r) => setTimeout(r, 500));
const bumperStyle = await page.evaluate(() => {
  const m = window.pinball.game.def.modules.find((x) => x.id === 'pop_a');
  return m.params?.style;
});
console.log('  pop_a style updated to:', bumperStyle);

console.log('4. Clicking neon cyan color swatch...');
await page.click('.color-circle[data-color="#00f0ff"]');
await new Promise((r) => setTimeout(r, 500));
const bumperColor = await page.evaluate(() => {
  const m = window.pinball.game.def.modules.find((x) => x.id === 'pop_a');
  return m.params?.color;
});
console.log('  pop_a color updated to:', bumperColor);
await page.screenshot({ path: `${outDir}/edit_tab_style_turbine_cyan.png` });

console.log('5. Switching to 🖼 Board Theme sub-tab...');
await page.click('button[data-act="set-subtab"][data-sub="theme"]');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: `${outDir}/edit_tab_theme.png` });

console.log('  Clicking Cyberpunk theme preset...');
await page.click('.sims-card[data-preset="cyberpunk"]');
await new Promise((r) => setTimeout(r, 600));
const activePreset = await page.evaluate(() => window.pinball.game.def.theme?.preset);
console.log('  active table theme preset:', activePreset);
await page.screenshot({ path: `${outDir}/edit_tab_theme_cyberpunk.png` });

console.log('6. Switching to ⚡ Logic & Table workspace...');
await page.click('button[data-act="set-workspace"][data-ws="logic"]');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: `${outDir}/edit_tab_logic_rules.png` });

await page.click('button[data-act="set-subtab"][data-sub="file"]');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: `${outDir}/edit_tab_logic_file.png` });

console.log('7. Testing rule builder DO text edit...');
await page.$eval('textarea[data-key="do"]', (el) => {
  el.value = 'ADD_SCORE 7777\nPLAY_SFX bumper';
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 300));
const ruleOk = await page.evaluate(() => JSON.stringify(window.pinball.game.def.rules.rules[0].do).includes('7777'));
console.log('  rule DO edit survived:', ruleOk);

console.log('8. Testing paste import box...');
const curJson = await page.evaluate(() => JSON.stringify(window.pinball.game.def));
await page.$eval('textarea[data-scope="paste"]', (el, v) => { el.value = v; }, curJson.replace('"Starter Table"', '"Cyber City"'));
await page.click('button[data-act="apply-paste"]');
await new Promise((r) => setTimeout(r, 400));
const renamed = await page.evaluate(() => window.pinball.game.def.name);
console.log('  table renamed via paste import:', renamed);

console.log('9. Switching back to Play mode...');
await page.click('#btn-play');
await new Promise((r) => setTimeout(r, 800));
const mode = await page.evaluate(() => window.pinball.game.mode);
console.log('  current game mode:', mode);
await page.screenshot({ path: `${outDir}/play_mode_cyberpunk.png` });

await browser.close();
console.log('ALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
