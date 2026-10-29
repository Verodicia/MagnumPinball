import * as THREE from 'three';
import { toLocal } from '../render/coords';
import { createArcadeDecalTexture, getGlowTexture } from '../render/ProceduralTextures';
import { PlayfieldModule, type ModuleContext } from './PlayfieldModule';

/**
 * Sculpted 3D illuminated pinball plastic / apron wing / arch banner.
 * Allows the designer to fill empty playfield zones (below flippers, around outlanes, along top arch)
 * with authentic multi-layered backlit plastics, chrome standoffs, and flasher bulbs.
 *
 * params:
 *  - variant: 'plastic_card' | 'apron_left' | 'apron_right'
 *  - width (cm, default 10), height (cm, default 5)
 *  - color (hex string, default '#00f0ff')
 *  - label (string, default 'HYPERDRIVE')
 *  - sublabel (string, default 'BONUS X2')
 */
export class ArcadeDecal extends PlayfieldModule {
  readonly type = 'ArcadeDecal';
  private t = 0;
  private plateMat!: THREE.MeshStandardMaterial;
  private haloMat?: THREE.SpriteMaterial;

  override mount(ctx: ModuleContext): void {
    super.mount(ctx);
    const variant = String(this.def.params?.['style'] ?? this.def.params?.['variant'] ?? 'plastic_card');
    const w = this.num('width', 10);
    const h = this.num('height', 4.8);
    const colorStr = (this.def.params?.['color'] as string | undefined) ?? '#00f0ff';
    const label = (this.def.params?.['label'] as string | undefined) ?? 'HYPERDRIVE';
    const sublabel = (this.def.params?.['sublabel'] as string | undefined) ?? '';
    const color = new THREE.Color(colorStr);

    const tex = createArcadeDecalTexture(label, colorStr, sublabel);
    this.plateMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex,
      emissive: color,
      emissiveMap: tex,
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.1,
      envMapIntensity: 0.12,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xd0d8e8,
      metalness: 0.85,
      roughness: 0.22,
      envMapIntensity: 0.2,
    });

    if (variant === 'apron_left' || variant === 'apron_right') {
      const dir = variant === 'apron_left' ? 1 : -1;
      // Sculpted 4-point apron wing that hugs right underneath the diagonal inlane guide:
      // Outer wall from y=0..hTop, diagonal parallel to inlane guide down to (dir*w, hInner), and down to bottom (dir*w, 0).
      const hInner = Math.max(2, h - w);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(dir * w, 0);
      shape.lineTo(dir * w, hInner);
      shape.lineTo(0, h);
      shape.closePath();

      const baseGeo = new THREE.ExtrudeGeometry(shape, {
        depth: 1.8,
        bevelEnabled: true,
        bevelSize: 0.12,
        bevelThickness: 0.12,
        bevelSegments: 2,
      });
      baseGeo.rotateX(-Math.PI / 2);
      const housingMat = new THREE.MeshStandardMaterial({
        color: 0x11162b,
        roughness: 0.4,
        metalness: 0.35,
        envMapIntensity: 0.12,
      });
      const baseMesh = new THREE.Mesh(baseGeo, housingMat);
      this.group.add(baseMesh);

      // Glowing neon trim bar running parallel along the diagonal inlane edge: from (0, h) to (dir*w, hInner)
      const dx = dir * w;
      const dy = hInner - h; // negative (going down-inward)
      const diagLen = Math.hypot(dx, dy);
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(diagLen, 0.32, 0.38),
        new THREE.MeshBasicMaterial({ color }),
      );
      trim.position.set(dx / 2, 1.98, -(h + hInner) / 2);
      trim.rotation.y = Math.atan2(dy, dx);
      this.group.add(trim);

      // Printed backlit card inset on top of the apron wing
      const cardW = w * 0.68;
      const cardH = Math.min(6.2, h * 0.28);
      const card = new THREE.Mesh(new THREE.PlaneGeometry(cardW, cardH), this.plateMat);
      card.rotation.x = -Math.PI / 2;
      card.position.set(dir * w * 0.44, 1.96, -h * 0.24);
      this.group.add(card);
    } else {
      // Raised backlit arcade plastic sign on 4 chrome standoffs
      const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, h), this.plateMat);
      plate.position.y = 1.9;
      plate.castShadow = true;
      this.group.add(plate);

      const postGeo = new THREE.CylinderGeometry(0.26, 0.32, 2.1, 12);
      for (const sx of [-w * 0.42, w * 0.42]) {
        for (const sz of [-h * 0.38, h * 0.38]) {
          const post = new THREE.Mesh(postGeo, chromeMat);
          post.position.set(sx, 1.05, sz);
          this.group.add(post);
        }
      }
    }

    const glowTex = getGlowTexture();
    if (glowTex) {
      this.haloMat = new THREE.SpriteMaterial({
        map: glowTex,
        color,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Sprite(this.haloMat);
      halo.position.y = 1.6;
      halo.scale.set(Math.max(w, h) * 1.15, Math.max(w, h) * 1.15, 1);
      this.group.add(halo);
    }

    this.group.rotation.y = this.rot;
    toLocal(this.def.x, this.def.y, 0, this.group.position);
  }

  override update(dt: number): void {
    this.t += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3.2);
    this.plateMat.emissiveIntensity = 0.5 + pulse * 0.45;
    if (this.haloMat) {
      this.haloMat.opacity = 0.22 + pulse * 0.2;
    }
  }
}
