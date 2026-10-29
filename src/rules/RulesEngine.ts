import { ALL_EVENTS, type PinballEventBus, type PinballEventName } from '../core/PinballEventBus';
import type { IPinballEntity } from '../core/IPinballEntity';
import type { LampPattern } from '../components/LightInsert';
import type { Action, Condition, Rule, RulesDef, Scalar } from './types';

export interface RuleSinks {
  fireSolenoid(module: string, port: string): void;
  setLamp(lamp: string, pattern: LampPattern, color?: string): void;
  playSfx(name: string): void;
}

const MAX_DEPTH = 12;

export function idMatches(pattern: string | undefined, id: string | undefined): boolean {
  if (pattern === undefined || pattern === '' || pattern === '*') return true;
  if (id === undefined) return false;
  return pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : pattern === id;
}

/**
 * State-machine + event-trigger ruleset (WHEN -> IF -> DO). Listens to every hardware event on the bus,
 * owns score / ball / mode / variables and drives lamps, solenoids and sfx through sinks.
 */
export class RulesEngine implements IPinballEntity {
  readonly id = 'rules';
  score = 0;
  ball = 1;
  state: string;
  vars: Record<string, Scalar>;
  text = '';
  private textLeft = 0;
  private stateTimer = 0;
  private depth = 0;
  readonly lamps = new Map<string, { pattern: LampPattern; color?: string }>();
  readonly firedLog: string[] = [];
  onChange: () => void = () => {};

  constructor(readonly def: RulesDef, private bus: PinballEventBus, private sinks: RuleSinks) {
    this.state = def.initialState;
    this.vars = { ...def.vars };
    for (const ev of ALL_EVENTS) {
      bus.on(ev, (payload) => this.handle(ev, (payload as { id?: string }).id));
    }
    bus.on('ON_BALL_DRAIN', () => this.onDrain());
  }

  get ballsPerGame(): number { return this.def.ballsPerGame ?? 3; }

  /** Begin the game: emits ON_BALL_START for ball 1. */
  start(): void {
    this.startBall();
  }

  get modeLabel(): string {
    return this.def.states[this.state]?.label ?? this.state;
  }

  /** Text shown on the DMD: transient callout if active, else the mode label. */
  get display(): string {
    return this.textLeft > 0 ? this.text : this.modeLabel;
  }

  private startBall(): void {
    this.setState(this.def.initialState, false);
    this.bus.emit('ON_BALL_START', { ball: this.ball });
    this.onChange();
  }

  private onDrain(): void {
    if (this.ball < this.ballsPerGame) {
      this.ball++;
    } else {
      this.bus.emit('ON_GAME_OVER', {});
      this.showText('GAME OVER', 4);
      this.score = 0;
      this.ball = 1;
      this.vars = { ...this.def.vars };
    }
    this.startBall();
  }

  private handle(event: PinballEventName, id: string | undefined): void {
    if (this.depth >= MAX_DEPTH) { console.warn(`rules: recursion limit hit on ${event}`); return; }
    this.depth++;
    try {
      for (const rule of this.def.rules) {
        if (rule.when.event !== event || !idMatches(rule.when.id, id)) continue;
        if (!this.conditionsHold(rule.if)) continue;
        this.firedLog.push(rule.id);
        if (this.firedLog.length > 40) this.firedLog.shift();
        for (const a of rule.do) this.run(a);
      }
    } finally {
      this.depth--;
    }
    this.onChange();
  }

  private resolve(lhs: string): Scalar | undefined {
    if (lhs === 'state') return this.state;
    if (lhs === 'score') return this.score;
    if (lhs === 'ball') return this.ball;
    if (lhs.startsWith('var.')) return this.vars[lhs.slice(4)];
    return undefined;
  }

  evaluate(c: Condition): boolean {
    const l = this.resolve(c.lhs);
    const r = c.rhs;
    switch (c.op) {
      case '==': return l === r;
      case '!=': return l !== r;
      default: {
        if (typeof l !== 'number' || typeof r !== 'number') return false;
        return c.op === '>' ? l > r : c.op === '>=' ? l >= r : c.op === '<' ? l < r : l <= r;
      }
    }
  }

  conditionsHold(conds: Condition[] | undefined): boolean {
    return !conds || conds.every((c) => this.evaluate(c));
  }

  private run(a: Action): void {
    switch (a.type) {
      case 'ADD_SCORE': this.score += a.points; break;
      case 'SET_LAMP':
        this.lamps.set(a.lamp, { pattern: a.pattern, color: a.color });
        this.sinks.setLamp(a.lamp, a.pattern, a.color);
        break;
      case 'SET_STATE': this.setState(a.state, true); break;
      case 'FIRE_SOLENOID': this.sinks.fireSolenoid(a.module, a.port); break;
      case 'PLAY_SFX': this.sinks.playSfx(a.sfx); break;
      case 'SET_VAR': this.vars[a.name] = a.value; break;
      case 'ADD_VAR': this.vars[a.name] = (typeof this.vars[a.name] === 'number' ? (this.vars[a.name] as number) : 0) + a.delta; break;
      case 'SHOW_TEXT': this.showText(a.text, a.seconds ?? 2.5); break;
    }
  }

  showText(text: string, seconds: number): void {
    this.text = text;
    this.textLeft = seconds;
  }

  setState(state: string, emit: boolean): void {
    this.state = state;
    this.stateTimer = this.def.states[state]?.timer ?? 0;
    if (emit) this.bus.emit('ON_STATE_ENTER', { id: state });
  }

  /** Seconds left on the current mode's timer (0 = untimed). */
  get modeTimeLeft(): number { return this.stateTimer; }

  update(dt: number): void {
    if (this.textLeft > 0) this.textLeft = Math.max(0, this.textLeft - dt);
    if (this.stateTimer > 0) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.stateTimer = 0;
        const next = this.def.states[this.state]?.next ?? this.def.initialState;
        this.setState(next, true);
        this.onChange();
      }
    }
  }
}

export type { Rule };
