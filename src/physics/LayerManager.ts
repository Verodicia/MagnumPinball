import type RAPIER from '@dimforge/rapier2d-compat';
import type { Ball } from './Ball';
import { LAYER_BITS, groups, type LayerId } from './CollisionLayers';
import type { PhysicsWorld } from './PhysicsWorld';

export interface GateDef {
  id: string;
  x: number;
  y: number;
  halfW: number;
  halfH: number;
  /** Rotation of the sensor box (radians). */
  angle?: number;
  from: LayerId;
  to: LayerId;
  /** One-way: ball velocity must have a positive component along this normal. Omit for two-way. */
  normal?: { x: number; y: number };
  /** Minimum speed (cm/s) along the normal to pass through. */
  minSpeed?: number;
  /** Elevation track the ball follows after this transition (null = none, undefined = unchanged). */
  trackId?: string | null;
}

/** Sensor gates that switch a ball's active collision bitmask between layers. */
export class LayerManager {
  private gates = new Map<number, GateDef>();
  private balls = new Map<number, Ball>();
  /** Fired after a successful transition. */
  transitionListeners: Array<(ball: Ball, gate: GateDef) => void> = [];

  constructor(private pw: PhysicsWorld) {
    pw.collisionListeners.push(this.handle);
  }

  registerBall(ball: Ball): void {
    this.balls.set(ball.collider.handle, ball);
  }

  getBall(colliderHandle: number): Ball | undefined {
    return this.balls.get(colliderHandle);
  }

  unregisterBall(ball: Ball): void {
    this.balls.delete(ball.collider.handle);
  }

  addGate(def: GateDef): RAPIER.Collider {
    const R = this.pw.R;
    // Membership/filter = source layer only, so the sensor only sees balls currently on `from`.
    const bit = LAYER_BITS[def.from];
    const c = this.pw.world.createCollider(
      R.ColliderDesc.cuboid(def.halfW, def.halfH)
        .setTranslation(def.x, def.y)
        .setRotation(def.angle ?? 0)
        .setSensor(true)
        .setCollisionGroups(groups(bit, bit))
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
    );
    this.gates.set(c.handle, def);
    return c;
  }

  private handle = (h1: number, h2: number, started: boolean): void => {
    if (!started) return;
    const g1 = this.gates.get(h1), g2 = this.gates.get(h2);
    const gate = g1 ?? g2;
    const ball = this.balls.get(g1 ? h2 : h1);
    if (!gate || !ball || ball.layer !== gate.from) return;
    if (gate.normal) {
      const v = ball.body.linvel();
      if (v.x * gate.normal.x + v.y * gate.normal.y < (gate.minSpeed ?? 0)) return;
    }
    ball.setLayer(gate.to);
    for (const l of this.transitionListeners) l(ball, gate);
  };
}
