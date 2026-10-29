import type { ModuleDef } from '../components/PlayfieldModule';
import type { RulesDef } from '../rules/types';
import type { SplineDef } from '../splines/SplineTrack';

export type CabinetTrimColor = 'chrome' | 'brass' | 'black' | 'cyan' | 'magenta';
export type ThemePreset = 'hyperdrive' | 'cyberpunk' | 'solar' | 'matrix' | 'wood';

export interface TableThemeDef {
  preset?: ThemePreset;
  primaryAccent?: string;
  secondaryAccent?: string;
  centerTitle?: string;
  archTitle?: string;
  customPlayfieldUrl?: string;
  cabinetTrim?: CabinetTrimColor;
  backglassTitle?: string;
  backglassSubtitle?: string;
}

export interface FlipperDef {
  id: string;
  x: number;
  y: number;
  side: 'left' | 'right';
  length?: number;
  restDeg?: number;
  upDeg?: number;
  powerTorque?: number;
  holdTorque?: number;
  returnTorque?: number;
  style?: string;
  color?: string;
}

/** Portable, human-readable table file. The outer cabinet shell and shooter lane are built in. */
export interface TableDef {
  schema: 'pinball-table';
  version: 1;
  name: string;
  author?: string;
  theme?: TableThemeDef;
  flippers: FlipperDef[];
  modules: ModuleDef[];
  splines: SplineDef[];
  rules: RulesDef;
}

export function emptyTable(name = 'Untitled'): TableDef {
  return {
    schema: 'pinball-table', version: 1, name, flippers: [], modules: [], splines: [],
    rules: { initialState: 'BaseMode', vars: {}, states: { BaseMode: { label: 'BASE MODE' } }, rules: [] },
  };
}
