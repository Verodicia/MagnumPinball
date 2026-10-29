export interface PhysicsMaterial {
  friction: number;
  restitution: number;
  /** kg per cm² (2D density). Only meaningful for dynamic bodies. */
  density?: number;
}

/** Parameterised presets. Rapier averages friction/restitution of the two touching colliders. */
export const Materials = {
  SteelBall: { friction: 0.25, restitution: 0.5, density: 0.08 / (Math.PI * 1.35 * 1.35) }, // 80 g
  WoodPlayfield: { friction: 0.1, restitution: 0.2 },
  RubberSoft: { friction: 0.9, restitution: 0.7 },
  RubberHard: { friction: 0.7, restitution: 0.9 },
  PlasticRamp: { friction: 0.08, restitution: 0.2 },
  SteelWire: { friction: 0.15, restitution: 0.4 },
} as const satisfies Record<string, PhysicsMaterial>;

export type MaterialName = keyof typeof Materials;
