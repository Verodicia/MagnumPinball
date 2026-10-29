import type { ModuleDef } from '../components/PlayfieldModule';
import type { SplineDef } from '../splines/SplineTrack';

/** Interim hard-coded layout; Step 5 moves this into default_table.json. */
export const STARTER_MODULES: ModuleDef[] = [
  { id: 'pop_a', type: 'PopBumper', x: 30, y: 72 },
  { id: 'pop_b', type: 'PopBumper', x: 40, y: 78 },
  { id: 'pop_c', type: 'PopBumper', x: 34, y: 60 },
  {
    id: 'sling_left', type: 'Slingshot', x: 4.5, y: 31,
    params: { points: [[0, 0], [0, 15], [10, 2.5]], face: [1, 2] },
  },
  {
    id: 'sling_right', type: 'Slingshot', x: 47.3, y: 31,
    params: { points: [[0, 0], [0, 15], [-10, 2.5]], face: [1, 2] },
  },
  { id: 'drop_bank_alpha', type: 'DropTargetBank', x: 48.6, y: 50 },
  // Launch-lane spinner on the top arch (blade axle along the arch radius)
  { id: 'spinner_arch', type: 'Spinner', x: 49, y: 106.8, rotation: 41 - 90 },
  { id: 'inlane_left', type: 'RolloverSwitch', x: 7.5, y: 24.5 },
  { id: 'inlane_right', type: 'RolloverSwitch', x: 44.3, y: 24.5 },
  { id: 'ramp_entry', type: 'RolloverSwitch', x: 14, y: 52 },
];

export const STARTER_SPLINES: SplineDef[] = [
  {
    id: 'left_ramp', kind: 'ramp', layer: 1, width: 6,
    snapStart: 'ramp_entry.out',
    segments: [[[14, 52, 0], [14, 68, 2], [18, 82, 8], [30, 92, 8]]],
  },
];
