import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier2d-compat';
import type { IPinballEntity } from '../core/IPinballEntity';
import type { PinballEventBus } from '../core/PinballEventBus';
import type { Ball } from '../physics/Ball';
import type { LayerId } from '../physics/CollisionLayers';
import type { LayerManager } from '../physics/LayerManager';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { SnapPort, SnapPortRegistry } from '../splines/SnapPorts';
import type { ModuleHost } from './ModuleHost';

/** JSON-serialisable module placement. */
export interface ModuleDef {
  id: string;
  type: string;
  /** Position (cm) in physics space, y up the table. */
  x: number;
  y: number;
  /** Degrees CCW. */
  rotation?: number;
  layer?: LayerId;
  params?: Record<string, unknown>;
}

export interface ModuleContext {
  pw: PhysicsWorld;
  bus: PinballEventBus;
  layers: LayerManager;
  parent: THREE.Object3D;
  ports: SnapPortRegistry;
  host: ModuleHost;
}

/**
 * Base for every playfield component. Each module owns its 2D colliders, 3D meshes,
 * switch/solenoid ports and optional snap ports, and talks to the rest only via the event bus.
 */
export abstract class PlayfieldModule implements IPinballEntity {
  abstract readonly type: string;
  /** Switch ids this module emits via ON_SWITCH_HIT. */
  readonly switches: string[] = [];
  /** Solenoid port names accepted by fire(). */
  readonly solenoids: string[] = [];
  readonly snapPorts: SnapPort[] = [];
  readonly group = new THREE.Group();
  protected ctx!: ModuleContext;
  protected colliders: RAPIER.Collider[] = [];

  constructor(readonly def: ModuleDef) {}

  get id(): string { return this.def.id; }
  get layer(): LayerId { return this.def.layer ?? 0; }
  protected get rot(): number { return ((this.def.rotation ?? 0) * Math.PI) / 180; }

  mount(ctx: ModuleContext): void {
    this.ctx = ctx;
    ctx.parent.add(this.group);
  }

  /** Local -> world physics coordinates (applies module rotation + position). */
  protected toWorld(lx: number, ly: number): { x: number; y: number } {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return { x: this.def.x + lx * c - ly * s, y: this.def.y + lx * s + ly * c };
  }

  protected addPort(id: string, lx: number, ly: number, lnx: number, lny: number): void {
    const p = this.toWorld(lx, ly);
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    const port: SnapPort = { id: `${this.id}.${id}`, ...p, nx: lnx * c - lny * s, ny: lnx * s + lny * c, layer: this.layer };
    this.snapPorts.push(port);
    this.ctx.ports.add(port);
  }

  /** Route collision events for this collider to onContact(). */
  protected claim(c: RAPIER.Collider): RAPIER.Collider {
    this.colliders.push(c);
    this.ctx.host.claim(c.handle, this);
    return c;
  }

  protected num(key: string, fallback: number): number {
    const v = this.def.params?.[key];
    return typeof v === 'number' ? v : fallback;
  }

  onContact(_collider: RAPIER.Collider, _ball: Ball, _started: boolean): void {}
  /** Fire a solenoid port (e.g. 'reset', 'kick'). */
  fire(_port: string): void {}
  update(_dt: number): void {}

  dispose(): void {
    for (const c of this.colliders) { this.ctx.host.unclaim(c.handle); this.ctx.pw.world.removeCollider(c, true); }
    this.group.removeFromParent();
  }
}
