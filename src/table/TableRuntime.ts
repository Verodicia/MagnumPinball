import * as THREE from 'three';
import { ModuleHost } from '../components/ModuleHost';
import { LightInsert } from '../components/LightInsert';
import { PinballEventBus } from '../core/PinballEventBus';
import type { IPinballEntity } from '../core/IPinballEntity';
import type { TableControls } from '../input/InputManager';
import { Ball } from '../physics/Ball';
import { ElevationMapper } from '../physics/ElevationMapper';
import { Flipper } from '../physics/Flipper';
import { LayerManager } from '../physics/LayerManager';
import { PhysicsWorld, BALL_RADIUS } from '../physics/PhysicsWorld';
import { Playfield, WALL_POLYLINES, BALL_START } from '../physics/Playfield';
import { Plunger } from '../physics/Plunger';
import { TiltSystem } from '../physics/TiltSystem';
import { toLocal } from '../render/coords';
import type { Renderer } from '../render/Renderer';
import { VisualEffects } from '../render/VisualEffects';
import { RulesEngine } from '../rules/RulesEngine';
import { SnapPortRegistry } from '../splines/SnapPorts';
import { SplineTrack } from '../splines/SplineTrack';
import type { TableDef } from './schema';

/** Everything instantiated from a TableDef: physics world, meshes, modules, splines, rules. Rebuilt on every edit. */
export class TableRuntime implements TableControls {
  readonly bus = new PinballEventBus();
  readonly root = new THREE.Group();
  readonly physics: PhysicsWorld;
  readonly layers: LayerManager;
  readonly ports = new SnapPortRegistry();
  readonly host: ModuleHost;
  readonly elevation: ElevationMapper;
  readonly tilt: TiltSystem;
  readonly plunger: Plunger;
  readonly rules: RulesEngine;
  readonly ball: Ball;
  readonly tracks: SplineTrack[] = [];
  readonly flippers: Array<{ id: string; side: 'left' | 'right'; flipper: Flipper; mesh: THREE.Group }> = [];
  readonly balls: Ball[];
  readonly vfx: VisualEffects;
  drains = 0;
  private ballMesh: THREE.Mesh;
  private plungerMesh: THREE.Mesh;
  private entities: IPinballEntity[] = [];
  private pendingRespawn = false;

  constructor(readonly def: TableDef, gfx: Renderer, parent: THREE.Object3D, onSfx: (name: string, x?: number) => void) {
    parent.add(this.root);
    const pw = (this.physics = PhysicsWorld.createSync());
    new Playfield(pw, this.bus);
    for (const w of WALL_POLYLINES) gfx.addWallMesh(w.pts, 0x202744, 3, 0.65, this.root);
    this.layers = new LayerManager(pw);

    this.ball = new Ball(pw, BALL_START.x, BALL_START.y);
    this.layers.registerBall(this.ball);
    this.balls = [this.ball];
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 36, 20),
      new THREE.MeshPhysicalMaterial({
        color: 0xf4f7fc,
        metalness: 1.0,
        roughness: 0.04,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
      }),
    );
    this.ballMesh.castShadow = true;
    this.root.add(this.ballMesh);

    gfx.applyTheme?.(def.theme);

    for (const f of def.flippers) {
      const flipper = new Flipper(pw, f);
      this.flippers.push({ id: f.id, side: f.side, flipper, mesh: gfx.createFlipperMesh(f.side, flipper.cfg.length, flipper.cfg.pivotRadius, flipper.cfg.tipRadius, this.root, f.style, f.color) });
    }
    this.plunger = new Plunger(pw);
    this.plungerMesh = gfx.createPlungerMesh(this.root);

    this.tilt = new TiltSystem(this.bus, () => this.balls);
    this.tilt.onTiltChange = (tilted) => {
      for (const f of this.flippers) f.flipper.setEnabled(!tilted);
      this.plunger.enabled = !tilted;
    };
    this.elevation = new ElevationMapper(this.layers, () => this.balls);
    this.host = new ModuleHost({ pw, bus: this.bus, layers: this.layers, parent: this.root, ports: this.ports });
    for (const m of def.modules) {
      try { this.host.add(m); } catch (e) { console.warn(`module ${m.id} skipped:`, e); }
    }
    for (const s of def.splines) {
      try { this.tracks.push(new SplineTrack(s, { pw, layers: this.layers, parent: this.root, ports: this.ports, elevation: this.elevation, bus: this.bus })); }
      catch (e) { console.warn(`spline ${s.id} skipped:`, e); }
    }

    this.vfx = new VisualEffects(this.root, this.bus, (id) => {
      const exact = this.host.modules.get(id);
      if (exact) return { x: exact.def.x, y: exact.def.y };
      const baseId = id.replace(/_\d+$/, '');
      const base = this.host.modules.get(baseId);
      if (base) return { x: base.def.x, y: base.def.y };
      return undefined;
    });

    this.rules = new RulesEngine(def.rules, this.bus, {
      fireSolenoid: (module, port) => this.host.fire(module, port),
      setLamp: (lamp, pattern, color) => {
        const m = this.host.modules.get(lamp);
        if (m instanceof LightInsert) m.setLamp(pattern, color);
      },
      playSfx: (name) => onSfx(name),
    });
    this.bus.on('ON_BALL_DRAIN', () => { this.drains++; this.pendingRespawn = true; });

    this.entities = [...this.flippers.map((f) => f.flipper), this.plunger, this.tilt, this.host, this.elevation, this.rules];
    this.rules.start();
  }

  // ----- TableControls -----
  setFlipper(side: 'left' | 'right', down: boolean): void {
    for (const f of this.flippers) if (f.side === side) f.flipper.energized = down;
  }
  setPlunger(amount: number | null): void {
    if (amount === null) this.plunger.release(); else this.plunger.hold(amount);
  }
  nudge(dx: number, dy: number, strength?: number): void {
    this.tilt.nudge(dx, dy, strength);
  }

  /** One fixed physics step (dt = 1/240). */
  step(dt: number): void {
    for (const e of this.entities) e.update(dt);
    this.physics.step();
    if (this.pendingRespawn) {
      this.pendingRespawn = false;
      this.ball.teleport(BALL_START.x, BALL_START.y);
      this.tilt.reset();
    }
    for (const b of this.balls) b.snapshot();
    this.vfx.update(dt, this.ball.cur.x, this.ball.cur.y, this.ball.height, this.ball.speed(), this.ball.body.isEnabled());
  }

  /** Pose meshes from the latest physics state, interpolated by alpha. */
  sync(alpha: number): void {
    const b = this.ball;
    toLocal(b.prev.x + (b.cur.x - b.prev.x) * alpha, b.prev.y + (b.cur.y - b.prev.y) * alpha, b.height, this.ballMesh.position);
    for (const { flipper, mesh } of this.flippers) {
      const p = flipper.body.translation();
      toLocal(p.x, p.y, 0.05, mesh.position);
      mesh.rotation.y = flipper.body.rotation();
    }
    const pp = this.plunger.body.translation();
    toLocal(pp.x, pp.y, 0.8, this.plungerMesh.position);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    this.bus.clear();
    this.physics.dispose();
  }
}
