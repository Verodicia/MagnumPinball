import type { PinballEventName } from '../core/PinballEventBus';
import type { LampPattern } from '../components/LightInsert';

export type Scalar = string | number | boolean;
export type Cmp = '==' | '!=' | '>' | '>=' | '<' | '<=';

/** IF: `lhs` is "state", "score", "ball" or "var.<name>". */
export interface Condition { lhs: string; op: Cmp; rhs: Scalar }

export type Action =
  | { type: 'ADD_SCORE'; points: number }
  | { type: 'SET_LAMP'; lamp: string; pattern: LampPattern; color?: string }
  | { type: 'SET_STATE'; state: string }
  | { type: 'FIRE_SOLENOID'; module: string; port: string }
  | { type: 'PLAY_SFX'; sfx: string }
  | { type: 'SET_VAR'; name: string; value: Scalar }
  | { type: 'ADD_VAR'; name: string; delta: number }
  | { type: 'SHOW_TEXT'; text: string; seconds?: number };

export type ActionType = Action['type'];
export const ACTION_TYPES: ActionType[] = [
  'ADD_SCORE', 'SET_LAMP', 'SET_STATE', 'FIRE_SOLENOID', 'PLAY_SFX', 'SET_VAR', 'ADD_VAR', 'SHOW_TEXT',
];

/** WHEN: event name plus optional id filter. A trailing `*` in `id` is a prefix wildcard ("pop_*"). */
export interface Trigger { event: PinballEventName; id?: string }

export interface Rule {
  id: string;
  when: Trigger;
  if?: Condition[];
  do: Action[];
}

export interface StateDef {
  label?: string;
  /** Mode timer in seconds; when it expires the machine goes to `next` (default: initialState). */
  timer?: number;
  next?: string;
}

export interface RulesDef {
  ballsPerGame?: number;
  initialState: string;
  vars: Record<string, Scalar>;
  states: Record<string, StateDef>;
  rules: Rule[];
}
