/** Abstract table controls. Keyboard and touch both drive this; the game implements it. */
export interface TableControls {
  setFlipper(side: 'left' | 'right', down: boolean): void;
  /** amount in [0,1] while holding; null = released. */
  setPlunger(amount: number | null): void;
  nudge(dx: number, dy: number, strength?: number): void;
}

const CHARGE_SECONDS = 0.8;

/**
 * Keyboard:  Z / Left / LShift = left flipper,  / / Right / RShift = right flipper,
 *            Space / Down (hold, release) = plunger,  A / D / W = nudge left / right / up.
 * Touch:     bottom-left / bottom-right halves = flippers; drag down in the right-hand shooter strip = plunger;
 *            fast swipe in the upper playfield = nudge; shaking the device = nudge up.
 */
export class InputManager {
  private charge = 0;
  private charging = false;
  private pointers = new Map<number, { role: 'left' | 'right' | 'plunger' | 'swipe'; x0: number; y0: number; t0: number }>();
  private lastFrame = performance.now();
  /** Disabled (e.g. in Edit mode) -> all input is ignored. */
  enabled = true;

  constructor(private controls: TableControls, private surface: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('pointermove', this.onPointerMove);
    surface.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('devicemotion', this.onMotion);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Call every render frame (charge accumulation for keyboard plunger). */
  tick(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    if (this.charging && this.enabled) {
      this.charge = Math.min(1, this.charge + dt / CHARGE_SECONDS);
      this.controls.setPlunger(this.charge);
    }
  }

  private flipperKeys: Record<string, 'left' | 'right'> = {
    KeyZ: 'left', ArrowLeft: 'left', ShiftLeft: 'left',
    Slash: 'right', ArrowRight: 'right', ShiftRight: 'right',
  };

  private static typing(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat || !this.enabled || InputManager.typing(e)) return;
    const side = this.flipperKeys[e.code];
    if (side) { this.controls.setFlipper(side, true); e.preventDefault(); return; }
    switch (e.code) {
      case 'Space': case 'ArrowDown': this.charging = true; this.charge = 0; e.preventDefault(); break;
      case 'KeyA': this.controls.nudge(-1, 0); break;
      case 'KeyD': this.controls.nudge(1, 0); break;
      case 'KeyW': this.controls.nudge(0, 1); break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (InputManager.typing(e)) return;
    const side = this.flipperKeys[e.code];
    if (side) { this.controls.setFlipper(side, false); return; }
    if (e.code === 'Space' || e.code === 'ArrowDown') {
      this.charging = false;
      this.charge = 0;
      this.controls.setPlunger(null);
    }
  };

  /** Release everything (used when switching modes / losing focus). */
  releaseAll = (): void => {
    this.controls.setFlipper('left', false);
    this.controls.setFlipper('right', false);
    this.controls.setPlunger(null);
    this.charging = false;
    this.pointers.clear();
  };

  // ----- touch / pointer -----
  private onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.surface.setPointerCapture(e.pointerId);
    this.requestMotionPermission();
    const r = this.surface.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    let role: 'left' | 'right' | 'plunger' | 'swipe';
    if (fx > 0.82 && fy > 0.45) role = 'plunger';
    else if (fy > 0.55) role = fx < 0.5 ? 'left' : 'right';
    else role = 'swipe';
    this.pointers.set(e.pointerId, { role, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    if (role === 'left' || role === 'right') this.controls.setFlipper(role, true);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (p?.role !== 'plunger') return;
    const r = this.surface.getBoundingClientRect();
    this.controls.setPlunger(Math.min(1, Math.max(0, (e.clientY - p.y0) / (r.height * 0.22))));
  };

  private onPointerUp = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.role === 'left' || p.role === 'right') this.controls.setFlipper(p.role, false);
    else if (p.role === 'plunger') this.controls.setPlunger(null);
    else {
      const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
      const dist = Math.hypot(dx, dy), dt = Math.max(1, performance.now() - p.t0);
      if (dist > 40 && dist / dt > 0.8) {
        // Swipe direction = table shove direction (screen up = toward the top of the table).
        if (Math.abs(dx) > Math.abs(dy)) this.controls.nudge(Math.sign(dx), 0);
        else this.controls.nudge(0, -Math.sign(dy));
      }
    }
  };

  // ----- shake -----
  private motionAsked = false;
  private lastShake = 0;
  private requestMotionPermission(): void {
    if (this.motionAsked) return;
    this.motionAsked = true;
    const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
    DME?.requestPermission?.().catch(() => {});
  }
  private onMotion = (e: DeviceMotionEvent): void => {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
    const now = performance.now();
    if (mag > 22 && now - this.lastShake > 300) { this.lastShake = now; this.controls.nudge(0, 1); }
  };
}
