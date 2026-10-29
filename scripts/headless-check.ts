// Headless physics verification: npx tsx scripts/headless-check.ts
import { PinballEventBus } from '../src/core/PinballEventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Ball } from '../src/physics/Ball';
import { LayerManager } from '../src/physics/LayerManager';
import { Playfield, BALL_START } from '../src/physics/Playfield';

const pw = await PhysicsWorld.create();
const bus = new PinballEventBus();
let drained = 0;
bus.on('ON_BALL_DRAIN', () => drained++);
new Playfield(pw, bus);
const lm = new LayerManager(pw);

// 1) Launch from the lane; ball should leave the lane, stay inside the table and eventually drain.
const ball = new Ball(pw, BALL_START.x, BALL_START.y);
lm.registerBall(ball);
ball.body.applyImpulse({ x: 0, y: 14 }, true);
let maxY = 0, minX = 99, steps = 0;
for (; steps < 240 * 30 && !drained; steps++) {
  pw.step();
  const p = ball.body.translation();
  maxY = Math.max(maxY, p.y); minX = Math.min(minX, p.x);
  if (!Number.isFinite(p.x)) throw new Error('NaN');
}
console.log({ drained, seconds: (steps / 240).toFixed(1), maxY: maxY.toFixed(1), minX: minX.toFixed(1) });
if (!drained) throw new Error('ball never drained');
if (maxY > 118) throw new Error('ball escaped through the top');

// 2) Layer gate: ball rolling up through a gate on layer 0 switches to layer 1; reverse direction is blocked.
const b2 = new Ball(pw, 20, 40);
lm.registerBall(b2);
b2.body.setGravityScale(0, true);
lm.addGate({ id: 'ramp_in', x: 20, y: 50, halfW: 4, halfH: 0.5, from: 0, to: 1, normal: { x: 0, y: 1 } });
b2.body.setLinvel({ x: 0, y: 60 }, true);
for (let i = 0; i < 240; i++) pw.step();
console.log('forward layer ->', b2.layer);
if (b2.layer !== 1) throw new Error('gate did not switch layer');

const b3 = new Ball(pw, 20, 60);
lm.registerBall(b3);
b3.body.setGravityScale(0, true);
b3.body.setLinvel({ x: 0, y: -60 }, true);
for (let i = 0; i < 240; i++) pw.step();
console.log('backward layer ->', b3.layer);
if (b3.layer !== 0) throw new Error('one-way gate leaked');
console.log('OK');
