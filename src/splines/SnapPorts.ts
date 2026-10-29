import type { LayerId } from '../physics/CollisionLayers';

/** Entry/exit node on a module or spline. (nx, ny) is the direction a ball travels through the port. */
export interface SnapPort {
  id: string;
  x: number;
  y: number;
  nx: number;
  ny: number;
  layer: LayerId;
}

export class SnapPortRegistry {
  private ports = new Map<string, SnapPort>();
  add(p: SnapPort): void { this.ports.set(p.id, p); }
  get(id: string): SnapPort | undefined { return this.ports.get(id); }
  all(): SnapPort[] { return [...this.ports.values()]; }
  clear(): void { this.ports.clear(); }
  /** Nearest port within `radius` cm - used by the editor to snap a dragged spline end. */
  nearest(x: number, y: number, radius = 4): SnapPort | undefined {
    let best: SnapPort | undefined, bd = radius;
    for (const p of this.ports.values()) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= bd) { bd = d; best = p; }
    }
    return best;
  }
}
