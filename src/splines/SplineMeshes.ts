import * as THREE from 'three';
import { toLocal } from '../render/coords';
import type { V3 } from './Bezier';

const L = (p: V3, dz = 0): THREE.Vector3 => toLocal(p.x, p.y, p.z + dz);

/** Surface strip between two 3D rails (ramp deck). */
export function ribbonGeometry(left: V3[], right: V3[], dz = 0): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < left.length; i++) {
    const a = L(left[i]!, dz), b = L(right[i]!, dz);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Rectangular-section wall extruded along a 3D path (rails, guides). */
export function wallGeometry(path: V3[], thickness: number, height: number): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  const h = thickness / 2;
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)]!, b = path[Math.min(path.length - 1, i + 1)]!;
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, p = path[i]!;
    const corners: Array<[number, number]> = [[-h, 0], [h, 0], [h, height], [-h, height]];
    for (const [o, z] of corners) {
      const v = toLocal(p.x + nx * o, p.y + ny * o, p.z + z);
      pos.push(v.x, v.y, v.z);
    }
    if (i > 0) {
      const k = i * 4, q = k - 4;
      for (let c = 0; c < 4; c++) { const c2 = (c + 1) % 4; idx.push(q + c, q + c2, k + c, q + c2, k + c2, k + c); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Round wire along a 3D path (habitrail). */
export function wireGeometry(path: V3[], radius: number, dz: number): THREE.BufferGeometry {
  const step = Math.max(1, Math.floor(path.length / 120));
  const pts = path.filter((_, i) => i % step === 0 || i === path.length - 1).map((p) => L(p, dz));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, radius, 8, false);
}
