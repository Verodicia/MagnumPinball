export interface V3 { x: number; y: number; z: number }
export type CubicSeg = [V3, V3, V3, V3];

export function segFromArrays(a: number[][]): CubicSeg {
  if (a.length !== 4) throw new Error('cubic segment needs 4 control points');
  return a.map(([x = 0, y = 0, z = 0]) => ({ x, y, z })) as CubicSeg;
}

export function bezierPoint(s: CubicSeg, t: number): V3 {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return {
    x: a * s[0].x + b * s[1].x + c * s[2].x + d * s[3].x,
    y: a * s[0].y + b * s[1].y + c * s[2].y + d * s[3].y,
    z: a * s[0].z + b * s[1].z + c * s[2].z + d * s[3].z,
  };
}

export interface CurveSample {
  /** 2D arc length from the start (cm). */
  s: number;
  p: V3;
  /** Unit 2D tangent. */
  tx: number;
  ty: number;
  /** Elevation slope dz/ds along the path. */
  dzds: number;
}

export interface Projection { s: number; z: number; dzds: number; tx: number; ty: number; dist: number }

/** Arc-length parameterised polyline sampled from chained cubic Bézier segments. */
export class PolyCurve {
  readonly samples: CurveSample[] = [];
  readonly length: number;

  constructor(segs: CubicSeg[], step = 0.8) {
    const pts: V3[] = [];
    segs.forEach((seg, si) => {
      let poly = 0;
      for (let i = 0; i < 3; i++) poly += Math.hypot(seg[i + 1]!.x - seg[i]!.x, seg[i + 1]!.y - seg[i]!.y);
      const n = Math.max(8, Math.ceil(poly / step));
      for (let i = si === 0 ? 0 : 1; i <= n; i++) pts.push(bezierPoint(seg, i / n));
    });
    const s: number[] = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
      const ds = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      this.samples.push({ s: s[i]!, p: pts[i]!, tx: (b.x - a.x) / ds, ty: (b.y - a.y) / ds, dzds: (b.z - a.z) / ds });
    }
    this.length = s[s.length - 1]!;
  }

  at(s: number): CurveSample {
    const S = this.samples;
    const t = Math.min(this.length, Math.max(0, s));
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m]!.s <= t) lo = m; else hi = m; }
    const a = S[lo]!, b = S[hi]!;
    const u = b.s > a.s ? (t - a.s) / (b.s - a.s) : 0;
    const tx = a.tx + (b.tx - a.tx) * u, ty = a.ty + (b.ty - a.ty) * u;
    const tl = Math.hypot(tx, ty) || 1;
    return {
      s: t,
      p: { x: a.p.x + (b.p.x - a.p.x) * u, y: a.p.y + (b.p.y - a.p.y) * u, z: a.p.z + (b.p.z - a.p.z) * u },
      tx: tx / tl, ty: ty / tl, dzds: a.dzds + (b.dzds - a.dzds) * u,
    };
  }

  /** Closest point on the curve to (x, y). */
  project(x: number, y: number): Projection {
    const S = this.samples;
    let best: Projection = { s: 0, z: 0, dzds: 0, tx: 1, ty: 0, dist: Infinity };
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i]!, b = S[i + 1]!;
      const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y;
      const l2 = dx * dx + dy * dy || 1e-9;
      const u = Math.min(1, Math.max(0, ((x - a.p.x) * dx + (y - a.p.y) * dy) / l2));
      const px = a.p.x + dx * u, py = a.p.y + dy * u;
      const d = Math.hypot(x - px, y - py);
      if (d < best.dist) {
        const tx = a.tx + (b.tx - a.tx) * u, ty = a.ty + (b.ty - a.ty) * u;
        const tl = Math.hypot(tx, ty) || 1;
        best = {
          s: a.s + (b.s - a.s) * u, z: a.p.z + (b.p.z - a.p.z) * u,
          dzds: a.dzds + (b.dzds - a.dzds) * u, tx: tx / tl, ty: ty / tl, dist: d,
        };
      }
    }
    return best;
  }

  /** Offset the path sideways by `off` cm (positive = left of travel). Returns 3D points. */
  offset(off: number, dz = 0): V3[] {
    return this.samples.map((c) => ({ x: c.p.x - c.ty * off, y: c.p.y + c.tx * off, z: c.p.z + dz }));
  }
}
