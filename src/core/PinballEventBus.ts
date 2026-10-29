/** Standardised hardware events. Physics, components and future entities emit; rules/audio/HUD listen. */
export interface PinballEventMap {
  ON_SWITCH_HIT: { id: string };
  ON_TARGET_BANK_COMPLETE: { id: string };
  ON_SPINNER_SPIN: { id: string; spins: number };
  ON_BALL_LOCKED: { id: string };
  ON_BALL_DRAIN: Record<string, never>;
  ON_TILT_WARNING: { level: number };
  ON_TILT: Record<string, never>;
  /** Emitted by the rules engine. */
  ON_BALL_START: { ball: number };
  ON_STATE_ENTER: { id: string };
  ON_GAME_OVER: Record<string, never>;
}

export type PinballEventName = keyof PinballEventMap;
export const ALL_EVENTS: PinballEventName[] = [
  'ON_SWITCH_HIT', 'ON_TARGET_BANK_COMPLETE', 'ON_SPINNER_SPIN', 'ON_BALL_LOCKED', 'ON_BALL_DRAIN',
  'ON_TILT_WARNING', 'ON_TILT', 'ON_BALL_START', 'ON_STATE_ENTER', 'ON_GAME_OVER',
];
type Handler<K extends PinballEventName> = (payload: PinballEventMap[K]) => void;

export class PinballEventBus {
  private handlers = new Map<PinballEventName, Set<Handler<never>>>();

  on<K extends PinballEventName>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends PinballEventName>(event: K, payload: PinballEventMap[K]): void {
    this.handlers.get(event)?.forEach((h) => (h as Handler<K>)(payload));
  }

  clear(): void {
    this.handlers.clear();
  }
}
