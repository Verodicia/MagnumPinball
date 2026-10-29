import type RAPIER from '@dimforge/rapier2d-compat';
import type { IPinballEntity } from '../core/IPinballEntity';
import { staticGroups } from './CollisionLayers';
import { Materials } from './Materials';
import type { PhysicsWorld } from './PhysicsWorld';

const DEG = Math.PI / 180;

export interface FlipperConfig {
  id: string;
  x: number;
  y: number;
  side: 'left' | 'right';
  length?: number; // cm, pivot to tip centre
  pivotRadius?: number;
  tipRadius?: number;
  restDeg?: number; // below horizontal
  upDeg?: number; // above horizontal
  /** Solenoid power-stroke peak torque. */
  powerTorque?: number;
  /** Reduced torque once the end-of-stroke switch opens (hold coil). */
  holdTorque?: number;
  /** Return spring torque. */
  returnTorque?: number;
}

/** Convex outline of a tapered flipper pointing along +x (local space). */
export function flipperOutline(length: number, r0: number, r1: number, segs = 10): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= segs; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / segs;
    pts.push([length + r1 * Math.cos(a), r1 * Math.sin(a)]);
  }
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / segs;
    pts.push([r0 * Math.cos(a), r0 * Math.sin(a)]);
  }
  return pts;
}

/**
 * Revolute-joint flipper driven by a modelled solenoid:
 *  - power stroke: high torque tapering with stroke progress (back-EMF)
 *  - hold: low torque after the end-of-stroke switch
 *  - release: return spring
 * Dynamic body + joint limits (not a kinematic sweep) so live catches, drop catches and post passes emerge naturally.
 */
export class Flipper implements IPinballEntity {
  readonly id: string;
  readonly body: RAPIER.RigidBody;
  readonly dir: 1 | -1; // +1 = left flipper (CCW lifts), -1 = right
  readonly restAngle: number;
  readonly upAngle: number;
  readonly cfg: Required<Omit<FlipperConfig, 'id' | 'x' | 'y' | 'side'>>;
  energized = false;
  enabled = true;

  constructor(pw: PhysicsWorld, c: FlipperConfig) {
    this.id = c.id;
    this.dir = c.side === 'left' ? 1 : -1;
    this.cfg = {
      length: c.length ?? 7.6,
      pivotRadius: c.pivotRadius ?? 1.5,
      tipRadius: c.tipRadius ?? 0.85,
      restDeg: c.restDeg ?? 28,
      upDeg: c.upDeg ?? 22,
      powerTorque: c.powerTorque ?? 75000,
      holdTorque: c.holdTorque ?? 18000,
      returnTorque: c.returnTorque ?? 25000,
    };
    this.restAngle = -this.dir * this.cfg.restDeg * DEG;
    this.upAngle = this.dir * this.cfg.upDeg * DEG;

    const { R, world } = pw;
    const pivot = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(c.x, c.y));
    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(c.x, c.y)
        .setRotation(this.restAngle)
        .setCcdEnabled(true)
        .setGravityScale(0)
        .setAngularDamping(1.5),
    );
    const m = Materials.RubberHard;
    const pts = flipperOutline(this.cfg.length, this.cfg.pivotRadius, this.cfg.tipRadius);
    // Right flipper geometry is mirrored (points along -x) so joint angles never wrap past +-180deg.
    const flat = new Float32Array(pts.flatMap(([x, y]) => [this.dir === 1 ? x : -x, y]));
    const desc = R.ColliderDesc.convexHull(flat);
    if (!desc) throw new Error('flipper hull failed');
    world.createCollider(
      desc.setDensity(0.03).setFriction(m.friction).setRestitution(m.restitution).setCollisionGroups(staticGroups(0)),
      this.body,
    );

    const joint = world.createImpulseJoint(R.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }), pivot, this.body, true) as RAPIER.RevoluteImpulseJoint;
    joint.setLimits(Math.min(this.restAngle, this.upAngle), Math.max(this.restAngle, this.upAngle));
  }

  /** 0 = resting, 1 = fully raised. */
  get progress(): number {
    return (this.body.rotation() - this.restAngle) / (this.upAngle - this.restAngle);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  update(_dt: number): void {
    const p = this.progress;
    let torque: number;
    if (this.energized && this.enabled) {
      torque = p < 0.92 ? this.cfg.powerTorque * (1 - 0.4 * Math.max(0, p)) : this.cfg.holdTorque;
    } else {
      torque = p > 0.01 ? -this.cfg.returnTorque : 0;
    }
    this.body.resetTorques(true);
    this.body.addTorque(this.dir * torque, true);
  }
}
