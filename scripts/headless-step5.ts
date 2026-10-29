// npx tsx scripts/headless-step5.ts
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Renderer } from '../src/render/Renderer';
import { TableRuntime } from '../src/table/TableRuntime';
import { validateTable } from '../src/table/validate';
import type { TableDef } from '../src/table/schema';
import { formatActions, formatConditions, parseActions, parseConditions } from '../src/rules/RuleText';
import { LightInsert } from '../src/components/LightInsert';
import { KickoutHole } from '../src/components/KickoutHole';
import { Gate } from '../src/components/Gate';

const DT = 1 / 240;
const ok = (c: boolean, m: string) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ok -', m); };
await PhysicsWorld.create();
const gfx = Object.create(Renderer.prototype) as Renderer; // mesh factories only (no WebGL)
const load = (): TableDef => JSON.parse(readFileSync('public/tables/default_table.json', 'utf8'));
const build = (d = load()) => new TableRuntime(d, gfx, new THREE.Group(), () => {});
const run = (t: TableRuntime, s: number, each?: () => void) => { for (let i = 0; i < s * 240; i++) { t.step(DT); each?.(); } };

// --- schema validation ---
{
  const v = validateTable(load());
  ok(v.errors.length === 0, `default_table.json validates (${v.warnings.length} warnings: ${v.warnings.join('; ')})`);
  const bad = load() as any;
  bad.modules.push({ id: 'x', type: 'Nope', x: 1, y: 1 });
  bad.rules.rules.push({ id: 'r', when: { event: 'ON_NOPE' }, do: [{ type: 'FLY' }] });
  bad.modules.push({ id: 'pop_a', type: 'PopBumper', x: 0, y: 0 });
  const e = validateTable(bad).errors.join(' | ');
  ok(/unknown type "Nope"/.test(e) && /ON_NOPE/.test(e) && /FLY/.test(e) && /duplicate id "pop_a"/.test(e), 'validator rejects unknown type / event / action / duplicate id');
  ok(validateTable({}).errors.length > 0 && validateTable(null).errors.length > 0, 'validator rejects non-tables');
}

// --- rule text DSL round trip ---
{
  const d = load();
  let n = 0;
  for (const r of d.rules.rules) {
    const a = parseActions(formatActions(r.do));
    const c = parseConditions(formatConditions(r.if));
    if (JSON.stringify(a.actions) !== JSON.stringify(r.do) || a.errors.length) throw new Error('action round trip failed: ' + r.id);
    if (JSON.stringify(c.conditions) !== JSON.stringify(r.if ?? []) || c.errors.length) throw new Error('condition round trip failed: ' + r.id);
    n++;
  }
  ok(n === d.rules.rules.length, `all ${n} rules survive text round trip`);
  ok(parseActions('ADD_SCORE abc\nFOO 1').errors.length === 2, 'DSL reports line errors');
  const c = parseConditions('state == "BaseMode" AND var.locks_lit == false, score >= 100');
  ok(c.conditions.length === 3 && c.conditions[1]!.rhs === false && c.conditions[2]!.rhs === 100, 'condition parser handles AND / commas / typed values');
}

// --- rules engine scenarios ---
{
  const t = build();
  const R = t.rules;
  ok(R.state === 'SkillShotActive' && R.ball === 1, 'ball start enters SkillShotActive');
  t.bus.emit('ON_SWITCH_HIT', { id: 'pop_b' });
  ok(R.score === 1000, 'wildcard rule pop_* scores 1000');
  t.bus.emit('ON_SWITCH_HIT', { id: 'left_ramp.entry' });
  ok(R.score === 51000 && R.state === 'BaseMode', 'skill shot: +50000 and back to BaseMode');
  t.bus.emit('ON_TARGET_BANK_COMPLETE', { id: 'drop_bank_alpha' });
  const arrow = t.host.modules.get('ramp_arrow') as LightInsert;
  ok(R.vars['locks_lit'] === true && R.score === 76000 && R.lamps.get('ramp_arrow')?.pattern === 'BLINK_FAST' && arrow.lit >= 0, 'bank complete in BaseMode lights lock, +25000, blinks ramp_arrow');
  t.bus.emit('ON_TARGET_BANK_COMPLETE', { id: 'drop_bank_alpha' });
  ok(R.score === 86000, 'second completion with lock lit: IF routes to the other rule (+10000)');
  t.bus.emit('ON_SWITCH_HIT', { id: 'left_ramp.exit' });
  ok(R.state === 'JackpotFrenzy' && R.vars['locks_lit'] === false && R.vars['jackpots'] === 1 && R.score === 136000, 'ramp exit with lock lit starts JackpotFrenzy (+50000), no double-award');
  t.bus.emit('ON_SWITCH_HIT', { id: 'left_ramp.exit' });
  ok(R.score === 236000, 'ramp exit during frenzy pays jackpot +100000');
  for (let i = 0; i < 240 * 21; i++) R.update(DT);
  ok(R.state === 'BaseMode', 'JackpotFrenzy timer (20s) expires back to BaseMode');
  const scoreBefore = R.score;
  t.bus.emit('ON_BALL_DRAIN', {}); t.bus.emit('ON_BALL_DRAIN', {});
  ok(R.ball === 3 && R.score === scoreBefore, 'drains advance ball 1 -> 3');
  t.bus.emit('ON_BALL_DRAIN', {});
  ok(R.ball === 1 && R.score === 0 && R.vars['jackpots'] === 0, 'drain after ball 3 = game over, score and vars reset');
  t.dispose();
}

// --- gate / scoop / lamps physically ---
{
  const t = build();
  t.ball.teleport(53.9, 70);
  t.ball.body.setLinvel({ x: 0, y: 230 }, true);
  let maxOpen = 0, maxY = 0;
  const gate = t.host.modules.get('lane_gate') as Gate;
  run(t, 1.2, () => { maxOpen = Math.max(maxOpen, gate.openDegrees); maxY = Math.max(maxY, t.ball.cur.y); });
  ok(maxY > 95 && maxOpen > 20, `ball launched up the lane opens the gate (open ${maxOpen.toFixed(0)}°, reached y=${maxY.toFixed(0)})`);
  // ball dropped from above onto the closed flap must not re-enter the lane
  t.ball.teleport(54.6, 96);
  let minLaneY = 999;
  run(t, 3, () => { const p = t.ball.body.translation(); if (p.x > 52.2) minLaneY = Math.min(minLaneY, p.y); });
  ok(minLaneY > 86, `ball falling from above is stopped by the gate flap (lowest y in lane ${minLaneY.toFixed(1)})`);
  t.dispose();
}
{
  const t = build();
  const scoop = t.host.modules.get('lock_scoop') as KickoutHole;
  let locked = 0; t.bus.on('ON_BALL_LOCKED', () => locked++);
  t.ball.teleport(40, 96);
  t.ball.body.setGravityScale(0, true);
  t.ball.body.setLinvel({ x: 100, y: -50 }, true);
  const before = t.rules.score;
  let heldSeen = false;
  run(t, 0.8, () => { if (scoop.occupied) heldSeen = true; });
  ok(heldSeen && locked === 1 && t.rules.score - before >= 5000, 'kickout hole captures ball, emits ON_BALL_LOCKED, rule scores it');
  let ejected = false;
  run(t, 2, () => { if (!scoop.occupied) ejected = true; });
  ok(ejected && Number.isFinite(t.ball.cur.x), 'scoop auto-ejects after 1.5s');
  t.dispose();
}

// --- full play: a bot plunges (whenever the ball rests in the lane) and flips, on the JSON table ---
{
  const t = build();
  const hits: Record<string, number> = {};
  t.bus.on('ON_SWITCH_HIT', (e) => (hits[e.id] = (hits[e.id] ?? 0) + 1));
  let charge = 0, plunges = 0;
  run(t, 120, () => {
    const p = t.ball.body.translation();
    if (!Number.isFinite(p.x)) throw new Error('NaN');
    const inLane = p.x > 52 && p.y < 4 && t.ball.speed() < 8;
    if (inLane && charge === 0) { charge = 1; plunges++; }
    if (charge > 0) { t.setPlunger(0.9); if (++charge > 200) { t.setPlunger(null); charge = -240; } }
    else if (charge < 0) charge++;
    const low = p.y < 20 && p.y > 8 && p.x < 51;
    const pulse = Math.floor(t.ball.cur.y * 7) % 3 !== 0;
    t.setFlipper('left', low && pulse && p.x < 26);
    t.setFlipper('right', low && pulse && p.x >= 26);
  });
  ok(t.rules.score > 0 && plunges >= 1 && Object.keys(hits).length >= 3, `bot play on the JSON table: ${plunges} plunges, score ${t.rules.score}, hits ${JSON.stringify(hits)}`);
  t.dispose();
}

// --- export / import round trip ---
{
  const a = load();
  const text = JSON.stringify(a, null, 2);
  const b = JSON.parse(text) as TableDef;
  ok(validateTable(b).errors.length === 0 && JSON.stringify(b) === JSON.stringify(a), 'export -> import is lossless and valid');
  const t1 = build(a); t1.dispose();
  const t2 = build(b); ok(t2.host.modules.size === a.modules.length && t2.tracks.length === a.splines.length, 'rebuilding from imported JSON recreates every module and spline'); t2.dispose();
  for (let i = 0; i < 5; i++) build().dispose(); // repeated live rebuilds must not blow up
  ok(true, 'repeated dispose/rebuild cycles are stable');
}
console.log('OK');
