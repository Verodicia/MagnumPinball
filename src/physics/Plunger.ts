import type RAPIER from '@dimforge/rapier2d-compat';
import type { IPinballEntity } from '../core/IPinballEntity';
import { Materials } from './Materials';
import { staticGroups } from './CollisionLayers';
import { TABLE_W, type PhysicsWorld } from './PhysicsWorld';
import { LANE_DIVIDER_X } from './Playfield';

export const PLUNGER_MAX_PULL = 9; // cm
const HALF_LEN = 6;

/**
 * Analog spring plunger (kinematic). While held, the rod follows the input; on release it is
 * driven by a damped spring x'' = -w^2 x - c x', so launch speed scales with pull distance.
 */
export class Plunger implements IPinballEntity {
  readonly id = 'plunger';
  readonly body: RAPIER.RigidBody;
  private pull = 0; // cm
  private vel = 0; // cm/s, positive = further back (toward the player)
  private target = 0; // 0..1 while held
  private held = false;
  enabled = true;
  /** Spring angular frequency (rad/s): release speed ~= pull * omega. */
  omega = 28;
  damping = 2;
  private static readonly PULL_RATE = 45; // cm/s the player can drag/pull

  constructor(pw: PhysicsWorld, readonly x = (LANE_DIVIDER_X + TABLE_W) / 2) {
    const { R, world } = pw;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, -HALF_LEN));
    const m = Materials.RubberHard;
    world.createCollider(
      R.ColliderDesc.cuboid((TABLE_W - LANE_DIVIDER_X) / 2 - 0.15, HALF_LEN)
        .setFriction(m.friction).setRestitution(0.1).setCollisionGroups(staticGroups(0)),
      this.body,
    );
  }

  /** Begin / continue holding the plunger back. `amount` in [0,1]. */
  hold(amount: number): void {
    this.held = true;
    this.target = Math.min(1, Math.max(0, amount));
  }

  /** Release the spring. */
  release(): void {
    if (this.held) { this.held = false; this.vel = 0; }
  }

  get pullAmount(): number {
    return this.pull / PLUNGER_MAX_PULL;
  }

  update(dt: number): void {
    if (!this.enabled) this.held = false;
    if (this.held) {
      const want = this.target * PLUNGER_MAX_PULL;
      const d = want - this.pull;
      const step = Math.sign(d) * Math.min(Math.abs(d), Plunger.PULL_RATE * dt);
      this.vel = step / dt;
      this.pull += step;
    } else if (this.pull > 0) {
      // Spring pulls toward rest (pull -> 0): semi-implicit Euler.
      this.vel += (-this.omega * this.omega * this.pull - this.damping * this.vel) * dt;
      this.pull += this.vel * dt;
      if (this.pull <= 0) { this.pull = 0; this.vel = 0; } // hard stop at rest
    }
    this.body.setNextKinematicTranslation({ x: this.x, y: -HALF_LEN - this.pull });
  }
}
