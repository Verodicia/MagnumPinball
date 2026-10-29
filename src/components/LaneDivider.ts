import * as THREE from 'three';
import { staticGroups } from '../physics/CollisionLayers';
import { Materials } from '../physics/Materials';
import { toLocal } from '../render/coords';
import { PlayfieldModule, type ModuleContext } from './PlayfieldModule';

/**
 * Illuminated lane divider fin with dual rubber end posts.
 * Extends along local +y of length `length` centered at (x, y).
 * params: length (cm, default 9), thickness (cm, default 0.7), color (hex string, default '#00f0ff').
 */
export class LaneDivider extends PlayfieldModule {
  readonly type = 'LaneDivider';

  override mount(ctx: ModuleContext): void {
    super.mount(ctx);
    const len = this.num('length', 9);
    const thick = this.num('thickness', 0.7);
    const colorStr = (this.def.params?.['color'] as string | undefined) ?? '#00f0ff';
    const color = new THREE.Color(colorStr);
    const m = Materials.RubberHard;

    // Main divider wall collider + rounded end caps
    this.claim(ctx.pw.world.createCollider(
      ctx.pw.R.ColliderDesc.capsule(len / 2, thick / 2)
        .setTranslation(this.def.x, this.def.y)
        .setRotation(this.rot + Math.PI / 2)
        .setFriction(m.friction)
        .setRestitution(m.restitution)
        .setCollisionGroups(staticGroups(this.layer)),
    ));

    // 1. Dark metallic core wall
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1b223a,
      roughness: 0.4,
      metalness: 0.35,
      envMapIntensity: 0.15,
    });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(thick, 2.5, len), wallMat);
    wall.position.y = 1.25;
    wall.castShadow = true;
    this.group.add(wall);

    // 2. Glowing neon top fin strip
    const neonMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
    const fin = new THREE.Mesh(new THREE.BoxGeometry(thick * 0.85, 0.35, len + 0.2), neonMat);
    fin.position.y = 2.65;
    this.group.add(fin);

    // 3. End star posts with rubber sleeves at +/- len/2
    const postMat = new THREE.MeshStandardMaterial({ color: 0xd8e0ee, metalness: 0.85, roughness: 0.2, envMapIntensity: 0.2 });
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0xff2244, roughness: 0.4 });
    const postGeo = new THREE.CylinderGeometry(thick * 0.65, thick * 0.75, 2.85, 14);
    const ringGeo = new THREE.TorusGeometry(thick * 0.75, 0.16, 8, 16);
    ringGeo.rotateX(Math.PI / 2);

    for (const end of [-1, 1] as const) {
      const z = end * (len / 2);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(0, 1.42, z);
      this.group.add(post);

      const ring = new THREE.Mesh(ringGeo, rubberMat);
      ring.position.set(0, 1.2, z);
      this.group.add(ring);
    }

    this.group.rotation.y = this.rot;
    toLocal(this.def.x, this.def.y, 0, this.group.position);
  }
}
