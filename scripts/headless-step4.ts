// npx tsx scripts/headless-step4.ts
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

const DT = 1 / 240;
async function world() {
  const pw = await PhysicsWorld.create();
  const bus = new PinballEventBus();
  const layers = new LayerManager(pw);
  const balls: Ball[] = [];
  const elevation = new ElevationMapper(layers, () => balls);
  const ports = new SnapPortRegistry();
  const parent = new THREE.Group();
  const host = new ModuleHost({ pw, bus, layers, parent, ports });
  const mk = (x: number, y: number, vx: number, vy: number, gravity = true) => {
    const b = new Ball(pw, x, y);
    layers.registerBall(b); balls.push(b);
    if (!gravity) b.body.setGravityScale(0, true);
    b.body.setLinvel({ x: vx, y: vy }, true);
    return b;
  };
  const run = (secs: number, each?: () => void) => {
    for (let i = 0; i < secs * 240; i++) { host.update(DT); elevation.update(DT); pw.step(); each?.(); }
  };
  const events: string[] = [];
  bus.on('ON_SWITCH_HIT', (e) => events.push(e.id));
  bus.on('ON_TARGET_BANK_COMPLETE', (e) => events.push('COMPLETE:' + e.id));
  bus.on('ON_SPINNER_SPIN', (e) => events.push(`SPIN:${e.id}:${e.spins}`));
  return { pw, bus, layers, balls, elevation, ports, parent, host, mk, run, events };
}
function check(c: boolean, msg: string) { if (!c) throw new Error('FAIL: ' + msg); console.log('  ok -', msg); }

// --- ramp (built from the starter layout; modules first so the snap port exists) ---
for (const [label, v] of [['strong', 330], ['weak', 110]] as const) {
  const w = await world();
  STARTER_MODULES.forEach((d) => d.id === 'ramp_entry' && w.host.add(d));
  const track = new SplineTrack(STARTER_SPLINES[0]!, { pw: w.pw, layers: w.layers, parent: w.parent, ports: w.ports, elevation: w.elevation });
  console.log(label, 'ramp length', track.curve.length.toFixed(1), 'cm; rise', track.curve.at(track.curve.length).p.z);
  const b = w.mk(14, 44, 0, v);
  let maxZ = 0, onRamp = false, maxS = 0, leaveY = NaN;
  w.run(8, () => {
    if (onRamp && b.layer === 0 && Number.isNaN(leaveY)) leaveY = b.body.translation().y;
    maxZ = Math.max(maxZ, b.height - 1.35); if (b.layer === 1) onRamp = true;
    if (b.layer === 1) maxS = Math.max(maxS, track.curve.project(b.body.translation().x, b.body.translation().y).s);
  });
  console.log(`  ${label}: entered=${onRamp} maxS=${maxS.toFixed(1)} maxZ=${maxZ.toFixed(1)} final layer=${b.layer} y=${b.body.translation().y.toFixed(1)}`);
  if (label === 'strong') {
    check(onRamp && maxZ > 7, 'strong shot climbs to top (z~8)');
    check(b.layer === 0 && leaveY > 85, `strong shot exits to layer 0 at the top (y=${leaveY.toFixed(1)})`);
  } else {
    check(onRamp && maxS < track.curve.length - 3, 'weak shot enters but does not reach the top');
    check(b.layer === 0 && leaveY < 56, `weak shot rolls back off the mouth to layer 0 (y=${leaveY.toFixed(1)})`);
  }
}

// --- wood + wireform generators produce colliders/meshes without error ---
{
  const w = await world();
  const wood = new SplineTrack({ id: 'g', kind: 'wood', layer: 0, width: 0, segments: [[[5, 70, 0], [8, 80, 0], [12, 84, 0], [18, 85, 0]]] }, { pw: w.pw, layers: w.layers, parent: w.parent, ports: w.ports });
  const wire = new SplineTrack({ id: 'h', kind: 'wireform', layer: 2, width: 3.2, segments: [[[20, 60, 3], [20, 70, 5], [28, 75, 5], [36, 75, 3]]] }, { pw: w.pw, layers: w.layers, parent: w.parent, ports: w.ports, elevation: w.elevation });
  check(wood.railLines.length === 1 && wire.railLines.length === 2 && wire.group.children.length > 2, 'wood guide (1 rail) and wireform (2 rails + meshes) generated');
}

// --- snap ports ---
{
  const w = await world();
  STARTER_MODULES.forEach((d) => d.id === 'ramp_entry' && w.host.add(d));
  const t = new SplineTrack(STARTER_SPLINES[0]!, { pw: w.pw, layers: w.layers, parent: w.parent, ports: w.ports });
  const p0 = t.curve.at(0).p;
  check(Math.hypot(p0.x - 14, p0.y - 52) < 1e-6, 'ramp start snapped to ramp_entry.out');
}

// --- pop bumper ---
{
  const w = await world(); w.host.add({ id: 'pop', type: 'PopBumper', x: 30, y: 50 });
  const b = w.mk(20, 50, 80, 0, false);
  let peak = 0; w.run(1, () => { peak = Math.max(peak, b.speed()); });
  check(w.events.includes('pop') && peak > 240 && b.body.linvel().x < 0, `pop bumper kicks ball away (peak ${peak.toFixed(0)} cm/s)`);
}

// --- slingshot ---
{
  const w = await world();
  w.host.add(STARTER_MODULES.find((d) => d.id === 'sling_left')!);
  // roll a ball into the face from the right-hand side
  const b = w.mk(24, 40, -90, -40, false);
  let peak = 0; w.run(1, () => { peak = Math.max(peak, b.speed()); });
  check(w.events.includes('sling_left') && peak > 250, `slingshot kicks (peak ${peak.toFixed(0)} cm/s)`);
}

// --- drop target bank ---
{
  const w = await world();
  w.host.add({ id: 'bank', type: 'DropTargetBank', x: 48, y: 50 });
  for (let i = 0; i < 3; i++) { const b = w.mk(42, 50 + 3.4 * i, 140, 0, false); w.run(0.5); b.dispose(); w.balls.pop(); }
  check(w.events.filter((e) => e.startsWith('bank_')).length === 3 && w.events.includes('COMPLETE:bank'), 'bank emits 3 switch hits + ON_TARGET_BANK_COMPLETE');
  w.host.fire('bank', 'reset');
  const b = w.mk(42, 50, 140, 0, false); w.run(0.5);
  check(w.events.filter((e) => e === 'bank_0').length === 2 && b.body.translation().x < 47.5, 'reset solenoid raises targets again (ball blocked)');
}

// --- spinner ---
{
  const w = await world(); w.host.add({ id: 'sp', type: 'Spinner', x: 30, y: 50, rotation: 0 });
  const b = w.mk(30, 40, 0, 220, false); w.run(1.5);
  check(w.events.some((e) => e.startsWith('SPIN:sp')), `spinner spins on pass (${w.events.filter((e) => e.startsWith('SPIN')).length} revs), ball slowed to ${b.speed().toFixed(0)}`);
}

// --- rollover ---
{
  const w = await world(); w.host.add({ id: 'ro', type: 'RolloverSwitch', x: 30, y: 50 });
  w.mk(30, 40, 0, 120, false); w.run(0.5);
  check(w.events.filter((e) => e === 'ro').length === 1, 'rollover emits exactly one ON_SWITCH_HIT');
}
console.log('OK');
