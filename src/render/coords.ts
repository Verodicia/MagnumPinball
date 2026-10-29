import * as THREE from 'three';
import { TABLE_H, TABLE_W } from '../physics/PhysicsWorld';

/** Maps physics (x, y-up) in cm to table-local 3D space; z-height is elevation above the playfield. */
export function toLocal(x: number, y: number, h = 0, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x - TABLE_W / 2, h, -(y - TABLE_H / 2));
}
