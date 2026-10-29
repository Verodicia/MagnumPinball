import type { IPinballEntity } from '../core/IPinballEntity';
import type { PinballEventBus } from '../core/PinballEventBus';
import type { Ball } from './Ball';

/**
 * Nudge + tilt pendulum. A nudge shoves the balls (opposite to the table motion) and kicks a
 * damped pendulum; swinging it past the limit by nudging too often TILTs the table.
 */
export class TiltSystem implements IPinballEntity {
  readonly id = 'tilt';
  angle = 0;
  private vel = 0;
  tilted = false;
  warnings = 0;
  private warned = false;
  private cooldown = 0;
  readonly omega0 = 4;
  readonly zeta = 0.12;
  readonly warnAt = 0.8;
  readonly tiltAt = 1.1;
  /** Ball speed change (cm/s) from a full-strength nudge. */
  nudgeSpeed = 55;
  onTiltChange: (tilted: boolean) => void = () => {};

  constructor(private bus: PinballEventBus, private balls: () => Iterable<Ball>) {}

  /** dir: table nudge direction (x: +right, y: +toward the top of the table). */
  nudge(dx: number, dy: number, strength = 1): void {
    if (this.tilted || this.cooldown > 0) return;
    this.cooldown = 0.12;
    const len = Math.hypot(dx, dy) || 1;
    // Ball inertia: it moves opposite to a lateral table shove; a forward shove sends it up-table.
    const ix = (-dx / len) * this.nudgeSpeed * strength;
    const iy = (dy / len) * this.nudgeSpeed * strength;
    for (const b of this.balls()) {
      const mass = b.body.mass();
      b.body.applyImpulse({ x: ix * mass, y: iy * mass }, true);
    }
    this.vel += 3 * strength;
  }

  reset(): void {
    this.angle = 0; this.vel = 0; this.warnings = 0; this.warned = false; this.cooldown = 0;
    if (this.tilted) { this.tilted = false; this.onTiltChange(false); }
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const acc = -(this.omega0 ** 2) * this.angle - 2 * this.zeta * this.omega0 * this.vel;
    this.vel += acc * dt;
    this.angle += this.vel * dt;
    const a = Math.abs(this.angle);
    if (!this.tilted && a > this.warnAt && !this.warned) {
      this.warned = true;
      this.warnings++;
      this.bus.emit('ON_TILT_WARNING', { level: this.warnings });
    } else if (a < this.warnAt * 0.5) this.warned = false;
    if (!this.tilted && a > this.tiltAt) {
      this.tilted = true;
      this.bus.emit('ON_TILT', {});
      this.onTiltChange(true);
    }
  }
}
