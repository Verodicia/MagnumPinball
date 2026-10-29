// npx tsx scripts/headless-flippers.ts
import { PinballEventBus } from '../src/core/PinballEventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Ball } from '../src/physics/Ball';
import { Playfield, BALL_START } from '../src/physics/Playfield';
import { Flipper } from '../src/physics/Flipper';
import { Plunger } from '../src/physics/Plunger';
import { TiltSystem } from '../src/physics/TiltSystem';

const DEG = 180 / Math.PI;
function fresh() {
  return PhysicsWorld.create().then((pw) => {
    const bus = new PinballEventBus();
    new Playfield(pw, bus);
    return { pw, bus };
  });
}
const L = { id: 'L', x: 16.5, y: 11.5, side: 'left' as const };
const Rt = { id: 'R', x: 35.3, y: 11.5, side: 'right' as const };

// 1) Flipper stroke timing, hold and return, both sides
{
  const { pw } = await fresh();
  for (const cfg of [L, Rt]) {
    const f = new Flipper(pw, cfg);
    f.energized = true;
    let t = 0;
    for (; t < 240 && f.progress < 0.95; t++) { f.update(1 / 240); pw.step(); }
    console.log(cfg.id, 'reached top in ms:', (t / 240 * 1000).toFixed(0), 'angle', (f.body.rotation() * DEG).toFixed(1));
    if (t >= 24) throw new Error('flipper too slow');
    for (let i = 0; i < 240; i++) { f.update(1 / 240); pw.step(); }
    const held = f.progress;
    f.energized = false;
    let r = 0;
    for (; r < 480 && f.progress > 0.05; r++) { f.update(1 / 240); pw.step(); }
    console.log(cfg.id, 'hold progress', held.toFixed(3), 'return ms', (r / 240 * 1000).toFixed(0));
    if (held < 0.97 || held > 1.03) throw new Error('hold drifted');
    if (r >= 480) throw new Error('flipper never returned');
  }
}

// 2) Ball struck by flipper from rest near the tip gets a strong kick up-table
{
  const { pw } = await fresh();
  const f = new Flipper(pw, L);
  const b = new Ball(pw, 16.5 + 4.5, 11.3);
  for (let i = 0; i < 20; i++) { f.update(1 / 240); pw.step(); } // settle on flipper
  f.energized = true;
  let peak = 0;
  for (let i = 0; i < 120; i++) { f.update(1 / 240); pw.step(); peak = Math.max(peak, b.speed()); }
  console.log('flip shot peak ball speed cm/s:', peak.toFixed(0));
  if (peak < 200) throw new Error('flipper too weak');
  if (peak > 1200) throw new Error('flipper unrealistically strong');
}

// 3) Plunger: charge scales launch strength
for (const amt of [0.3, 1]) {
  const { pw } = await fresh();
  const pl = new Plunger(pw);
  const b = new Ball(pw, BALL_START.x, BALL_START.y);
  for (let i = 0; i < 60; i++) { pl.update(1 / 240); pw.step(); }
  pl.hold(amt);
  for (let i = 0; i < 240; i++) { pl.update(1 / 240); pw.step(); }
  pl.release();
  let maxY = 0;
  for (let i = 0; i < 240 * 3; i++) { pl.update(1 / 240); pw.step(); maxY = Math.max(maxY, b.body.translation().y); }
  console.log(`plunger ${amt} -> max y`, maxY.toFixed(1));
  if (amt === 0.3 && maxY > 70) throw new Error('light pull too strong');
  if (amt === 1 && maxY < 100) throw new Error('full pull too weak');
}

// 4) Tilt: single nudge OK, rapid nudges tilt
{
  const { pw, bus } = await fresh();
  const b = new Ball(pw, 20, 50);
  const tilt = new TiltSystem(bus, () => [b]);
  let warned = 0, tilted = 0;
  bus.on('ON_TILT_WARNING', () => warned++);
  bus.on('ON_TILT', () => tilted++);
  tilt.nudge(1, 0);
  for (let i = 0; i < 240 * 3; i++) { tilt.update(1 / 240); pw.step(); }
  if (tilt.tilted) throw new Error('single nudge tilted');
  const vx = b.body.linvel().x;
  console.log('nudge right-shove ball vx sign:', Math.sign(vx));
  for (let n = 0; n < 6; n++) { tilt.nudge(1, 0); for (let i = 0; i < 40; i++) { tilt.update(1 / 240); } }
  for (let i = 0; i < 240; i++) tilt.update(1 / 240);
  console.log({ warned, tilted });
  if (!tilt.tilted) throw new Error('spam nudging did not tilt');
}
console.log('OK');
