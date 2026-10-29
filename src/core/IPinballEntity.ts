import type { PinballEventBus } from './PinballEventBus';

/** Shared context handed to entities so they can plug into the bus/physics without globals. */
export interface EntityContext {
  bus: PinballEventBus;
}

/**
 * Anything living on the playfield. Future "video game" elements (moving targets,
 * bosses with HP, gravity wells) implement this and talk only via the event bus.
 */
export interface IPinballEntity {
  readonly id: string;
  init?(ctx: EntityContext): void;
  /** Called once per fixed physics step (dt = 1/240 s). */
  update(dt: number): void;
  dispose?(): void;
}
