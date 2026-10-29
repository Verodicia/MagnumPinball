import type { IPinballEntity } from '../core/IPinballEntity';
import type { PolyCurve } from '../splines/Bezier';
import type { Ball } from './Ball';
import type { LayerManager } from './LayerManager';
import { BALL_RADIUS } from './PhysicsWorld';

/** 5/7: a solid sphere rolling without slipping feels 5/7 of the slope's gravity component. */
const ROLLING_FACTOR = 5 / 7;
const G = 981;

/**
 * While a ball is on an elevated spline: sets its 3D visual height from Z(s) and applies
 * tangential slope resistance a = -g * dz/ds so slow balls roll back down steep ramps.
 */
export class ElevationMapper implements IPinballEntity {
  readonly id = 'elevation';
  private tracks = new Map<string, PolyCurve>();
  private on = new Map<Ball, string | null>();

  constructor(layers: LayerManager, private balls: () => Iterable<Ball>) {
    layers.transitionListeners.push((ball, gate) => {
      if (gate.trackId !== undefined) this.on.set(ball, gate.trackId);
    });
  }

  addTrack(id: string, curve: PolyCurve): void {
    this.tracks.set(id, curve);
  }

  trackOf(ball: Ball): string | null {
    return this.on.get(ball) ?? null;
  }

  update(dt: number): void {
    for (const b of this.balls()) {
      const id = this.on.get(b);
      const curve = id ? this.tracks.get(id) : undefined;
      if (curve) {
        const p = b.body.translation();
        const pr = curve.project(p.x, p.y);
        const a = -G * ROLLING_FACTOR * pr.dzds; // along +tangent (negative = pushes back downhill)
        const k = b.body.mass() * a * dt;
        b.body.applyImpulse({ x: pr.tx * k, y: pr.ty * k }, true);
        b.height = pr.z + BALL_RADIUS;
        b.heightVel = 0;
      } else if (b.height > BALL_RADIUS) {
        // Dropped off the end of a ramp: visual free fall to the playfield.
        b.heightVel -= G * dt;
        b.height = Math.max(BALL_RADIUS, b.height + b.heightVel * dt);
      }
    }
  }
}
