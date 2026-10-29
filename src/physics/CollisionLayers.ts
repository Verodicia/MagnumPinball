/** Collision layer bitmasks (Rapier interaction groups). */
export const LAYER_0_MAIN = 0x0001;
export const LAYER_1_RAMP = 0x0002;
export const LAYER_2_WIREFORM = 0x0004;
export const LAYER_3_SUBWAY = 0x0008;

export type LayerId = 0 | 1 | 2 | 3;
export const LAYER_BITS: Record<LayerId, number> = {
  0: LAYER_0_MAIN,
  1: LAYER_1_RAMP,
  2: LAYER_2_WIREFORM,
  3: LAYER_3_SUBWAY,
};

/** Rapier interaction groups: high 16 bits = membership, low 16 bits = filter. */
export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

/** A static piece of geometry on `layer` collides with balls currently on that layer. */
export function staticGroups(layer: LayerId): number {
  return groups(LAYER_BITS[layer], LAYER_BITS[layer]);
}

/** A ball whose active layer is `layer` (its filter is swapped on transitions). */
export function ballGroups(layer: LayerId): number {
  return groups(LAYER_BITS[layer], LAYER_BITS[layer]);
}
