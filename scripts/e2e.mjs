// Browser smoke test: node scripts/e2e.mjs  (needs `vite preview --port 4173` and system Chrome)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const errors = [];
const check = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('  ok -', m); };
const page = await browser.newPage();
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.pinball?.game?.runtime, { timeout: 15000 });
await new Promise((r) => setTimeout(r, 1500));
check(await page.$eval('#app', (e) => e.dataset.layout) === 'desktop', 'desktop layout selected');
check((await page.$eval('#telemetry', (e) => e.textContent)).includes('240 Hz'), 'telemetry running at 240 Hz');
await page.screenshot({ path: '/tmp/shots/desktop_play.png' });

// plunge + flip
await page.keyboard.down('Space'); await new Promise((r) => setTimeout(r, 900)); await page.keyboard.up('Space');
for (let i = 0; i < 8; i++) { await page.keyboard.down('KeyZ'); await page.keyboard.down('Slash'); await new Promise((r) => setTimeout(r, 120)); await page.keyboard.up('KeyZ'); await page.keyboard.up('Slash'); await new Promise((r) => setTimeout(r, 500)); }
const st = await page.evaluate(() => { const r = window.pinball.game.runtime; return { y: r.ball.cur.y, score: r.rules.score, finite: Number.isFinite(r.ball.cur.x) }; });
console.log('  after play:', st);
check(st.finite, 'ball state finite after plunge + flips');
await page.screenshot({ path: '/tmp/shots/desktop_play2.png' });

// edit mode
await page.click('#btn-edit');
check(await page.$eval('#app', (e) => e.dataset.mode) === 'edit' && !(await page.$eval('#editor-panel', (e) => e.hidden)), 'edit mode shows the editor panel');
const before = await page.evaluate(() => window.pinball.game.def.modules.length);
await page.click('#ed-palette button[data-tool="PopBumper"]');
// click on the table: convert physics (26,40) to screen
const pt = await page.evaluate(() => {
  const g = window.pinball.game, THREE_V = g.gfx.camera.position.constructor;
  const t = g.gfx.table; t.updateMatrixWorld(true);
  const v = new THREE_V(26 - 28, 0, -(40 - 56)).applyMatrix4(t.matrixWorld).project(g.gfx.camera);
  const r = g.gfx.renderer.domElement.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
});
await page.mouse.click(pt.x, pt.y);
await new Promise((r) => setTimeout(r, 300));
const after = await page.evaluate(() => { const d = window.pinball.game.def; return { n: d.modules.length, last: d.modules[d.modules.length - 1] }; });
check(after.n === before + 1 && after.last.type === 'PopBumper' && Math.abs(after.last.x - 26) < 1.5 && Math.abs(after.last.y - 40) < 1.5, `palette placement lands at the clicked table spot (${JSON.stringify(after.last)})`);
// drag it
const pt2 = await page.evaluate(() => {
  const g = window.pinball.game, V = g.gfx.camera.position.constructor; const t = g.gfx.table;
  const v = new V(36 - 28, 0, -(40 - 56)).applyMatrix4(t.matrixWorld).project(g.gfx.camera);
  const r = g.gfx.renderer.domElement.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
});
await page.mouse.move(pt.x, pt.y); await page.mouse.down(); await page.mouse.move(pt2.x, pt2.y, { steps: 6 }); await page.mouse.up();
await new Promise((r) => setTimeout(r, 300));
const moved = await page.evaluate(() => { const d = window.pinball.game.def; return d.modules[d.modules.length - 1]; });
check(moved.x > 33 && moved.x < 39, `dragging moves the module (x now ${moved.x})`);
// spline: place a ramp, drag its start anchor onto a module snap port, expect snapStart to be set
const toScreen = (x, y) => page.evaluate((x, y) => {
  const g = window.pinball.game, V = g.gfx.camera.position.constructor, t = g.gfx.table; t.updateMatrixWorld(true);
  const v = new V(x - 28, 0, -(y - 56)).applyMatrix4(t.matrixWorld).project(g.gfx.camera);
  const r = g.gfx.renderer.domElement.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
}, x, y);
await page.click('#ed-palette button[data-tool="Spline:ramp"]');
const sp0 = await toScreen(38, 20); await page.mouse.click(sp0.x, sp0.y);
await new Promise((r) => setTimeout(r, 300));
const nSpl = await page.evaluate(() => window.pinball.game.def.splines.length);
check(nSpl === 2, 'ramp spline placed from the palette');
const a0 = await toScreen(38, 20), a1 = await toScreen(7.8, 24.8);
await page.mouse.move(a0.x, a0.y); await page.mouse.down(); await page.mouse.move(a1.x, a1.y, { steps: 8 }); await page.mouse.up();
await new Promise((r) => setTimeout(r, 400));
const snapped = await page.evaluate(() => window.pinball.game.def.splines[1].snapStart);
check(snapped === 'inlane_left.out', `dragging a spline end onto a module port snaps it (snapStart=${snapped})`);
check(await page.evaluate(() => { const t = window.pinball.game.runtime.tracks[1]; const p = t.curve.at(0).p; return Math.hypot(p.x - 7.5, p.y - 24.5) < 0.01; }), 'snapped spline start sits exactly on the port');
// rule builder: change a rule's DO text
await page.$eval('textarea[data-key="do"]', (el) => { el.value = 'ADD_SCORE 4242\nPLAY_SFX bumper'; el.dispatchEvent(new Event('change', { bubbles: true })); });
await new Promise((r) => setTimeout(r, 200));
check(await page.evaluate(() => JSON.stringify(window.pinball.game.def.rules.rules[0].do).includes('4242')), 'rule DO text edit updates the table JSON');
await page.screenshot({ path: '/tmp/shots/desktop_edit.png' });
// export -> import round trip through the paste box
const json = await page.evaluate(() => JSON.stringify(window.pinball.game.def));
await page.$eval('textarea[data-scope="paste"]', (el, v) => { el.value = v; }, json.replace('"Starter Table"', '"Imported Test"'));
await page.click('button[data-act="apply-paste"]');
await new Promise((r) => setTimeout(r, 300));
check(await page.evaluate(() => window.pinball.game.def.name) === 'Imported Test', 'pasted JSON imports and rebuilds the table');
await page.$eval('textarea[data-scope="paste"]', (el) => { el.value = '{"schema":"pinball-table","version":1,"name":"x","flippers":[],"modules":[{"id":"a","type":"Nope","x":0,"y":0}],"splines":[],"rules":{}}'; });
await page.click('button[data-act="apply-paste"]');
check((await page.$eval('#ed-status', (e) => e.className)) === 'error' && await page.evaluate(() => window.pinball.game.def.name) === 'Imported Test', 'invalid JSON is rejected without clobbering the table');
// back to play
await page.click('#btn-play');
await new Promise((r) => setTimeout(r, 800));
check(await page.evaluate(() => window.pinball.game.mode) === 'play', 'back to Play mode');

// mobile layout
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await new Promise((r) => setTimeout(r, 800));
check(await page.$eval('#app', (e) => e.dataset.layout) === 'mobile', 'mobile portrait layout selected');
const hud = await page.$eval('#hud', (e) => e.getBoundingClientRect().height / window.innerHeight);
check(hud > 0.07 && hud < 0.11, `HUD is ~9% of the screen (${(hud * 100).toFixed(1)}%)`);
// touch: bottom-left half raises the left flipper
await page.touchscreen.touchStart(80, 780);
await new Promise((r) => setTimeout(r, 200));
const lf = await page.evaluate(() => window.pinball.game.runtime.flippers.find((f) => f.side === 'left').flipper.energized);
await page.touchscreen.touchEnd();
await new Promise((r) => setTimeout(r, 100));
const lf2 = await page.evaluate(() => window.pinball.game.runtime.flippers.find((f) => f.side === 'left').flipper.energized);
check(lf === true && lf2 === false, 'touch on bottom-left half energizes / releases the left flipper');
await page.screenshot({ path: '/tmp/shots/mobile.png' });
const real = errors.filter((e) => !/GPU stall|swiftshader|WebGL|AudioContext/i.test(e));
check(real.length === 0, 'no console errors: ' + real.join(' | '));
await browser.close();
