export const PHYSICS_HZ = 240;
export const FIXED_DT = 1 / PHYSICS_HZ;
/** Cap per-frame sub-steps (~50ms of catch-up) to avoid the spiral of death. */
const MAX_STEPS_PER_FRAME = 12;

export interface LoopCallbacks {
  /** Fixed-rate simulation step. */
  step(dt: number): void;
  /** Variable-rate render; alpha in [0,1) is the interpolation factor between the last two steps. */
  render(alpha: number, frameDt: number): void;
}

/** Decouples physics from requestAnimationFrame via a strict 240Hz accumulator. */
export class FixedStepLoop {
  private accumulator = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  stepsLastFrame = 0;
  fps = 0;

  constructor(private cb: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const frameDt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    this.fps = this.fps * 0.9 + (frameDt > 0 ? 1 / frameDt : 0) * 0.1;

    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.cb.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0; // drop backlog
    this.stepsLastFrame = steps;

    this.cb.render(this.accumulator / FIXED_DT, frameDt);
    this.raf = requestAnimationFrame(this.frame);
  };
}
