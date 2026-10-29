import type RAPIER from '@dimforge/rapier2d-compat';
import { ballGroups, type LayerId } from './CollisionLayers';
import { Materials } from './Materials';
import { BALL_RADIUS, type PhysicsWorld } from './PhysicsWorld';

/** CCD steel ball. Tracks previous/current position for render interpolation. */
export class Ball {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  layer: LayerId;
  /** Visual height above the playfield (cm). Elevation mapping drives this on ramps. */
  height = BALL_RADIUS;
  /** Visual vertical velocity while falling off a ramp (cm/s). */
  heightVel = 0;
  prev: { x: number; y: number };
  cur: { x: number; y: number };

  constructor(private pw: PhysicsWorld, x: number, y: number, layer: LayerId = 0) {
    const R = pw.R;
    this.layer = layer;
    this.body = pw.world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(x, y).setCcdEnabled(true).setLinearDamping(0.04).setAngularDamping(0.02),
    );
    const m = Materials.SteelBall;
    this.collider = pw.world.createCollider(
      R.ColliderDesc.ball(BALL_RADIUS)
        .setDensity(m.density)
        .setFriction(m.friction)
        .setRestitution(m.restitution)
        .setCollisionGroups(ballGroups(layer))
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
    this.prev = { x, y };
    this.cur = { x, y };
  }

  /** Swap the active collision bitmask (layer transition). */
  setLayer(layer: LayerId): void {
    this.layer = layer;
    this.collider.setCollisionGroups(ballGroups(layer));
    this.body.wakeUp();
  }

  /** Call after every physics step. */
  snapshot(): void {
    this.prev = this.cur;
    const p = this.body.translation();
    this.cur = { x: p.x, y: p.y };
  }

  teleport(x: number, y: number, layer: LayerId = 0): void {
    this.body.setTranslation({ x, y }, true);
    this.body.setLinvel({ x: 0, y: 0 }, true);
    this.body.setAngvel(0, true);
    this.setLayer(layer);
    this.prev = { x, y };
    this.cur = { x, y };
  }

  speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y);
  }

  dispose(): void {
    this.pw.world.removeRigidBody(this.body);
  }
}
