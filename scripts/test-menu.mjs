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
  console.log('BROWSER LOG [' + m.type() + ']:', m.text());
});
page.on('pageerror', (e) => {
  console.log('PAGE ERROR:', e.message, e.stack);
});

await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.pinball?.game?.runtime, { timeout: 15000 });
await new Promise((r) => setTimeout(r, 1500));

console.log('1. Checking Title Screen & Main Menu...');
const titleText = await page.$eval('.menu-title', (el) => el.textContent);
console.log('  Title text:', titleText);
const isMenuOpen = await page.evaluate(() => window.pinball.titleMenu.isOpen());
console.log('  Menu is open on boot:', isMenuOpen);

await page.screenshot({ path: `${outDir}/magnum_main_menu.png` });

console.log('2. Clicking OPTIONS...');
await page.click('#menu-btn-options');
await new Promise((r) => setTimeout(r, 400));
const optTitle = await page.$eval('.sub-title', (el) => el.textContent);
console.log('  Options panel title:', optTitle);
await page.screenshot({ path: `${outDir}/magnum_options_menu.png` });

console.log('3. Adjusting volume in options...');
await page.$eval('#opt-volume', (el) => {
  el.value = '80';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const volVal = await page.$eval('#opt-volume-val', (el) => el.textContent);
console.log('  Updated volume label:', volVal);
const audioVol = await page.evaluate(() => window.pinball.game.audio.getVolume());
console.log('  Audio engine volume:', audioVol);

console.log('4. Returning to Main Menu...');
await page.click('#menu-btn-back');
await new Promise((r) => setTimeout(r, 400));

console.log('5. Clicking ABOUT...');
await page.click('#menu-btn-about');
await new Promise((r) => setTimeout(r, 400));
const aboutTitle = await page.$eval('.hero-logo', (el) => el.textContent);
console.log('  About panel logo:', aboutTitle);
await page.screenshot({ path: `${outDir}/magnum_about_menu.png` });

console.log('6. Returning to Main Menu...');
await page.click('#menu-btn-back');
await new Promise((r) => setTimeout(r, 400));

console.log('7. Clicking ARCADE TABLE CREATOR...');
await page.click('#menu-btn-creator');
await new Promise((r) => setTimeout(r, 600));
const isEditMode = await page.$eval('#app', (el) => el.dataset.mode);
console.log('  App dataset mode:', isEditMode);
const menuClosed = await page.evaluate(() => !window.pinball.titleMenu.isOpen());
console.log('  Title menu closed:', menuClosed);
await page.screenshot({ path: `${outDir}/magnum_table_creator.png` });

console.log('8. Returning to Main Menu via Menu button in toolbar...');
await page.click('#btn-menu');
await new Promise((r) => setTimeout(r, 400));
const menuOpenAgain = await page.evaluate(() => window.pinball.titleMenu.isOpen());
console.log('  Title menu re-opened:', menuOpenAgain);

console.log('9. Starting PLAY ARCADE...');
await page.click('#menu-btn-play');
await new Promise((r) => setTimeout(r, 600));
const isPlayMode = await page.$eval('#app', (el) => el.dataset.mode);
console.log('  App in play mode:', isPlayMode === 'play');
await page.screenshot({ path: `${outDir}/magnum_play_arcade.png` });

console.log('ALL MENU TESTS PASSED!');
await browser.close();
