import { LAMP_PATTERNS, type LampPattern } from '../components/LightInsert';
import type { Action, Cmp, Condition, Scalar } from './types';

/** Split on whitespace, keeping "quoted strings" together. */
function tokens(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2]!);
  return out;
}

export function parseScalar(t: string): Scalar {
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t.trim() !== '' && !Number.isNaN(Number(t))) return Number(t);
  return t;
}

const q = (s: string): string => (/\s/.test(s) || s === '' ? `"${s}"` : s);
const fmtScalar = (v: Scalar): string => (typeof v === 'string' ? q(v) : String(v));

export function formatAction(a: Action): string {
  switch (a.type) {
    case 'ADD_SCORE': return `ADD_SCORE ${a.points}`;
    case 'SET_LAMP': return `SET_LAMP ${a.lamp} ${a.pattern}${a.color ? ' ' + a.color : ''}`;
    case 'SET_STATE': return `SET_STATE ${a.state}`;
    case 'FIRE_SOLENOID': return `FIRE_SOLENOID ${a.module} ${a.port}`;
    case 'PLAY_SFX': return `PLAY_SFX ${a.sfx}`;
    case 'SET_VAR': return `SET_VAR ${a.name} ${fmtScalar(a.value)}`;
    case 'ADD_VAR': return `ADD_VAR ${a.name} ${a.delta}`;
    case 'SHOW_TEXT': return `SHOW_TEXT ${q(a.text)}${a.seconds !== undefined ? ' ' + a.seconds : ''}`;
  }
}

export function parseAction(line: string): Action | string {
  const t = tokens(line.trim());
  const [cmd, a, b, c] = t;
  const need = (n: number): string | null => (t.length - 1 < n ? `${cmd} needs ${n} argument(s)` : null);
  switch (cmd) {
    case 'ADD_SCORE': {
      const e = need(1); if (e) return e;
      const n = Number(a); return Number.isFinite(n) ? { type: 'ADD_SCORE', points: n } : `ADD_SCORE: "${a}" is not a number`;
    }
    case 'SET_LAMP': {
      const e = need(2); if (e) return e;
      if (!LAMP_PATTERNS.includes(b as LampPattern)) return `SET_LAMP: pattern must be one of ${LAMP_PATTERNS.join(', ')}`;
      return { type: 'SET_LAMP', lamp: a!, pattern: b as LampPattern, ...(c ? { color: c } : {}) };
    }
    case 'SET_STATE': { const e = need(1); return e ?? { type: 'SET_STATE', state: a! }; }
    case 'FIRE_SOLENOID': { const e = need(2); return e ?? { type: 'FIRE_SOLENOID', module: a!, port: b! }; }
    case 'PLAY_SFX': { const e = need(1); return e ?? { type: 'PLAY_SFX', sfx: a! }; }
    case 'SET_VAR': { const e = need(2); return e ?? { type: 'SET_VAR', name: a!, value: parseScalar(b!) }; }
    case 'ADD_VAR': {
      const e = need(2); if (e) return e;
      const n = Number(b); return Number.isFinite(n) ? { type: 'ADD_VAR', name: a!, delta: n } : `ADD_VAR: "${b}" is not a number`;
    }
    case 'SHOW_TEXT': {
      const e = need(1); if (e) return e;
      const secs = b !== undefined ? Number(b) : undefined;
      return { type: 'SHOW_TEXT', text: a!, ...(secs !== undefined && Number.isFinite(secs) ? { seconds: secs } : {}) };
    }
    default: return `unknown action "${cmd ?? ''}"`;
  }
}

/** One action per line (blank lines ignored). Returns actions plus per-line errors. */
export function parseActions(text: string): { actions: Action[]; errors: string[] } {
  const actions: Action[] = [], errors: string[] = [];
  text.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l, i) => {
    const r = parseAction(l);
    if (typeof r === 'string') errors.push(`line ${i + 1}: ${r}`); else actions.push(r);
  });
  return { actions, errors };
}

export const formatActions = (as: Action[]): string => as.map(formatAction).join('\n');

const OPS: Cmp[] = ['==', '!=', '>=', '<=', '>', '<'];

export const formatCondition = (c: Condition): string => `${c.lhs} ${c.op} ${fmtScalar(c.rhs)}`;
export const formatConditions = (cs: Condition[] | undefined): string => (cs ?? []).map(formatCondition).join(' AND ');

/** "state == BaseMode AND var.locks_lit == false" (also accepts commas, && and newlines). */
export function parseConditions(text: string): { conditions: Condition[]; errors: string[] } {
  const conditions: Condition[] = [], errors: string[] = [];
  for (const part of text.split(/\s+AND\s+|&&|,|\n/i).map((s) => s.trim()).filter(Boolean)) {
    const t = tokens(part);
    if (t.length !== 3 || !OPS.includes(t[1] as Cmp)) { errors.push(`bad condition "${part}" (use: lhs op value)`); continue; }
    conditions.push({ lhs: t[0]!, op: t[1] as Cmp, rhs: parseScalar(t[2]!) });
  }
  return { conditions, errors };
}
