// 60 random shots at the ramp mouth: nothing may escape on layer 1 or leave the table region.
import * as THREE from 'three';
import { PinballEventBus } from '../src/core/PinballEventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Ball } from '../src/physics/Ball';
import { LayerManager } from '../src/physics/LayerManager';
import { ElevationMapper } from '../src/physics/ElevationMapper';
import { ModuleHost } from '../src/components/ModuleHost';
import { SnapPortRegistry } from '../src/splines/SnapPorts';
import { SplineTrack } from '../src/splines/SplineTrack';
import { STARTER_MODULES, STARTER_SPLINES } from '../src/table/starterLayout';

const pw = await PhysicsWorld.create(); const bus = new PinballEventBus();
const layers = new LayerManager(pw); const balls: Ball[] = [];
const el = new ElevationMapper(layers, () => balls);
const ports = new SnapPortRegistry(); const parent = new THREE.Group();
const host = new ModuleHost({ pw, bus, layers, parent, ports });
host.add(STARTER_MODULES.find((d) => d.id === 'ramp_entry')!);
new SplineTrack(STARTER_SPLINES[0]!, { pw, layers, parent, ports, elevation: el });
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let top = 0, back = 0, bad = 0;
for (let n = 0; n < 60; n++) {
  const ang = (rnd() - 0.5) * 0.8; const sp = 90 + rnd() * 260;
  const x0 = 14 + (rnd() - 0.5) * 7; const b = new Ball(pw, x0, 42); layers.registerBall(b); balls.push(b);
  b.body.setLinvel({ x: Math.sin(ang) * sp, y: Math.cos(ang) * sp }, true);
  let maxY = 0;
  for (let i = 0; i < 240 * 6; i++) { el.update(1 / 240); pw.step(); maxY = Math.max(maxY, b.body.translation().y); }
  const p = b.body.translation();
  if (maxY > 85) top++; else back++;
  // a ball on layer 1 after 6s, or one trapped on the ramp, is a failure (layer 0 balls simply fall off this bare test table)
  if (b.layer !== 0 && Math.hypot(p.x - 20, p.y - 70) > 40) { bad++; console.log('ESC', { n, ang: ang.toFixed(2), sp: sp.toFixed(0), x0: x0.toFixed(2), maxY: maxY.toFixed(1), at: [p.x.toFixed(0), p.y.toFixed(0)], layer: b.layer }); }
  b.dispose(); balls.pop();
}
console.log({ reachedTop: top, rolledBackOrMissed: back, escaped: bad });
if (bad) throw new Error('balls escaped on layer 1');
console.log('OK');
