// Full starter table: plunge the ball repeatedly; assert stability and that play reaches the toys.
import * as THREE from 'three';
import { PinballEventBus } from '../src/core/PinballEventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Ball } from '../src/physics/Ball';
import { LayerManager } from '../src/physics/LayerManager';
import { ElevationMapper } from '../src/physics/ElevationMapper';
import { Playfield, BALL_START } from '../src/physics/Playfield';
import { Plunger } from '../src/physics/Plunger';
import { Flipper } from '../src/physics/Flipper';
import { ModuleHost } from '../src/components/ModuleHost';
import { SnapPortRegistry } from '../src/splines/SnapPorts';
import { SplineTrack } from '../src/splines/SplineTrack';
import { STARTER_MODULES, STARTER_SPLINES } from '../src/table/starterLayout';

const pw = await PhysicsWorld.create(); const bus = new PinballEventBus();
new Playfield(pw, bus); const layers = new LayerManager(pw);
const ball = new Ball(pw, BALL_START.x, BALL_START.y); layers.registerBall(ball);
const el = new ElevationMapper(layers, () => [ball]);
const ports = new SnapPortRegistry(); const parent = new THREE.Group();
const host = new ModuleHost({ pw, bus, layers, parent, ports });
STARTER_MODULES.forEach((d) => host.add(d));
STARTER_SPLINES.forEach((d) => new SplineTrack(d, { pw, layers, parent, ports, elevation: el }));
const fl = new Flipper(pw, { id: 'L', x: 16.5, y: 11.5, side: 'left' }), fr = new Flipper(pw, { id: 'R', x: 35.3, y: 11.5, side: 'right' });
const plunger = new Plunger(pw);
const hits = new Map<string, number>(); let drains = 0;
bus.on('ON_SWITCH_HIT', (e) => hits.set(e.id, (hits.get(e.id) ?? 0) + 1));
bus.on('ON_BALL_DRAIN', () => drains++);
let respawn = false; bus.on('ON_BALL_DRAIN', () => (respawn = true));
for (let game = 0; game < 6; game++) {
  plunger.hold(0.7 + game * 0.05);
  for (let i = 0; i < 200; i++) { plunger.update(1 / 240); pw.step(); }
  plunger.release(); respawn = false;
  for (let i = 0; i < 240 * 60 && !respawn && !(i > 600 && ball.body.translation().x > 52 && ball.body.translation().y < 4); i++) {
    // dumb bot: flip both when the ball is low and moving down in the flipper zone
    const p = ball.body.translation();
    const low = p.y < 20 && p.y > 8 && p.x < 51;
    const pulse = (i % 144) < 36; fl.energized = low && pulse && p.x < 26; fr.energized = low && pulse && p.x >= 26;
    fl.update(1 / 240); fr.update(1 / 240); plunger.update(1 / 240); host.update(1 / 240); el.update(1 / 240); pw.step();
    if (!Number.isFinite(p.x)) throw new Error('NaN');
    if (ball.layer === 1 && process.env.TRACE && i % 12 === 0) console.log('L1', (p.x).toFixed(1), p.y.toFixed(1), ball.speed().toFixed(0));
  }
  const q = ball.body.translation();
  console.log('game', game, q.x.toFixed(1), q.y.toFixed(1), ball.speed().toFixed(0), ball.layer, respawn);
  if (!respawn && !(q.x > 52 && q.y < 6)) throw new Error('ball stuck mid-table in game ' + game);
  console.log('game', game, 'ended: respawn', respawn, 'pos', q.x.toFixed(1), q.y.toFixed(1), 'layer', ball.layer, 'speed', ball.speed().toFixed(0));
  ball.teleport(BALL_START.x, BALL_START.y);
}
console.log({ drains, games: 6, hits: Object.fromEntries(hits) });
if (hits.size < 4) throw new Error('ball never reached the toys');
console.log('OK');
