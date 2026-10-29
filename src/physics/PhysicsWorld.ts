import RAPIER from '@dimforge/rapier2d-compat';
import { FIXED_DT } from '../core/FixedStepLoop';

/** 1 physics unit = 1 cm. */
export const PLAYFIELD_INCLINE_DEG = 6.5;
export const GRAVITY_CM_S2 = 981 * Math.sin((PLAYFIELD_INCLINE_DEG * Math.PI) / 180);
export const BALL_RADIUS = 1.35; // 27mm steel ball
export const TABLE_W = 56;
export const TABLE_H = 112;

export class PhysicsWorld {
  readonly R = RAPIER;
  world!: RAPIER.World;
  eventQueue!: RAPIER.EventQueue;
  /** Receives (colliderHandle1, colliderHandle2, started) for every collision/sensor event. */
  collisionListeners: Array<(h1: number, h2: number, started: boolean) => void> = [];

  private static ready = false;

  static async create(): Promise<PhysicsWorld> {
    if (!PhysicsWorld.ready) { await RAPIER.init(); PhysicsWorld.ready = true; }
    return PhysicsWorld.createSync();
  }

  /** Fresh world; requires create() to have been awaited once (WASM initialised). Used for live rebuilds. */
  static createSync(): PhysicsWorld {
    const pw = new PhysicsWorld();
    pw.world = new RAPIER.World({ x: 0, y: -GRAVITY_CM_S2 });
    pw.world.timestep = FIXED_DT;
    pw.eventQueue = new RAPIER.EventQueue(true);
    return pw;
  }

  dispose(): void {
    this.collisionListeners.length = 0;
    this.eventQueue.free();
    this.world.free();
  }

  step(): void {
    this.world.step(this.eventQueue);
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      for (const l of this.collisionListeners) l(h1, h2, started);
    });
  }
}
