import { MODULE_TYPES } from '../components/factory';
import { LAMP_PATTERNS } from '../components/LightInsert';
import { ALL_EVENTS } from '../core/PinballEventBus';
import { ACTION_TYPES } from '../rules/types';
import type { TableDef } from './schema';

export interface Validation { errors: string[]; warnings: string[] }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Structural validation for imported JSON. Errors block loading; warnings are advisory. */
export function validateTable(raw: unknown): Validation {
  const errors: string[] = [], warnings: string[] = [];
  const t = raw as Partial<TableDef> | null;
  if (!t || typeof t !== 'object') return { errors: ['not a JSON object'], warnings };
  if (t.schema !== 'pinball-table') errors.push('schema must be "pinball-table"');
  if (t.version !== 1) errors.push(`unsupported version ${String(t.version)} (expected 1)`);
  if (typeof t.name !== 'string') errors.push('name must be a string');
  for (const k of ['flippers', 'modules', 'splines'] as const) if (!Array.isArray(t[k])) errors.push(`${k} must be an array`);
  if (!t.rules || typeof t.rules !== 'object') errors.push('rules object missing');
  if (t.theme !== undefined && (typeof t.theme !== 'object' || t.theme === null)) errors.push('theme must be an object');
  if (errors.length) return { errors, warnings };

  const ids = new Set<string>();
  const claim = (kind: string, id: unknown): void => {
    if (typeof id !== 'string' || !id) { errors.push(`${kind}: missing id`); return; }
    if (ids.has(id)) errors.push(`duplicate id "${id}"`);
    ids.add(id);
  };
  t.flippers!.forEach((f) => {
    claim('flipper', f.id);
    if (!isNum(f.x) || !isNum(f.y)) errors.push(`flipper ${f.id}: x/y must be numbers`);
    if (f.side !== 'left' && f.side !== 'right') errors.push(`flipper ${f.id}: side must be left|right`);
  });
  const moduleIds = new Set<string>();
  t.modules!.forEach((m) => {
    claim('module', m.id); moduleIds.add(m.id);
    if (!MODULE_TYPES.includes(m.type)) errors.push(`module ${m.id}: unknown type "${m.type}"`);
    if (!isNum(m.x) || !isNum(m.y)) errors.push(`module ${m.id}: x/y must be numbers`);
  });
  const portIds = new Set<string>();
  t.splines!.forEach((s) => {
    claim('spline', s.id);
    if (!['wood', 'ramp', 'wireform'].includes(s.kind)) errors.push(`spline ${s.id}: bad kind "${s.kind}"`);
    if (![0, 1, 2, 3].includes(s.layer)) errors.push(`spline ${s.id}: layer must be 0-3`);
    if (!isNum(s.width) || s.width < 0) errors.push(`spline ${s.id}: width must be >= 0`);
    if (!Array.isArray(s.segments) || s.segments.length === 0) errors.push(`spline ${s.id}: needs at least one segment`);
    else s.segments.forEach((seg, i) => {
      if (!Array.isArray(seg) || seg.length !== 4 || seg.some((p) => !Array.isArray(p) || p.length < 2 || p.some((n) => !isNum(n)))) {
        errors.push(`spline ${s.id}: segment ${i} must be 4 control points of [x, y, z]`);
      }
    });
    if (s.kind === 'ramp' && s.width > 0 && s.width < 5.4) warnings.push(`spline ${s.id}: ramp narrower than 5.4 cm may eject entering balls`);
    for (const p of [s.snapStart, s.snapEnd]) if (p) portIds.add(p);
  });
  for (const p of portIds) {
    const owner = p.split('.')[0]!;
    if (!moduleIds.has(owner)) warnings.push(`snap port "${p}" does not belong to a known module`);
  }

  const r = t.rules!;
  if (typeof r.initialState !== 'string') errors.push('rules.initialState must be a string');
  else if (!r.states?.[r.initialState]) warnings.push(`initialState "${r.initialState}" is not declared in rules.states`);
  if (!Array.isArray(r.rules)) errors.push('rules.rules must be an array');
  else r.rules.forEach((rule, i) => {
    const tag = `rule ${rule.id ?? i}`;
    if (!ALL_EVENTS.includes(rule.when?.event)) errors.push(`${tag}: unknown WHEN event "${String(rule.when?.event)}"`);
    if (!Array.isArray(rule.do) || rule.do.length === 0) errors.push(`${tag}: DO must be a non-empty array`);
    rule.do?.forEach((a) => {
      if (!ACTION_TYPES.includes(a.type)) { errors.push(`${tag}: unknown action "${String(a.type)}"`); return; }
      if (a.type === 'SET_STATE' && r.states && !r.states[a.state]) warnings.push(`${tag}: SET_STATE "${a.state}" is not declared in rules.states`);
      if (a.type === 'FIRE_SOLENOID' && !moduleIds.has(a.module)) warnings.push(`${tag}: FIRE_SOLENOID unknown module "${a.module}"`);
      if (a.type === 'SET_LAMP') {
        if (!LAMP_PATTERNS.includes(a.pattern)) errors.push(`${tag}: bad lamp pattern "${a.pattern}"`);
        if (!moduleIds.has(a.lamp)) warnings.push(`${tag}: SET_LAMP unknown lamp "${a.lamp}"`);
      }
    });
  });
  return { errors, warnings };
}
