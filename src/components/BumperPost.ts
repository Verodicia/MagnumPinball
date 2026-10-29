import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier2d-compat';
import type { Ball } from '../physics/Ball';
import { staticGroups } from '../physics/CollisionLayers';
import { Materials } from '../physics/Materials';
import { toLocal } from '../render/coords';
import { getGlowTexture } from '../render/ProceduralTextures';
import { PlayfieldModule, type ModuleContext } from './PlayfieldModule';

/**
 * Illuminated rubber star post (for outlanes, inlanes, center drain saver post, or upper arch).
 * params: radius (cm, default 0.9), color (hex string, default '#00f0ff').
 * Emits ON_SWITCH_HIT(id) when struck.
 */
export class BumperPost extends PlayfieldModule {
  readonly type = 'BumperPost';
  private flash = 0;
  private cooldown = 0;
  private postMat!: THREE.MeshStandardMaterial;
  private haloMat?: THREE.SpriteMaterial;

  override mount(ctx: ModuleContext): void {
    super.mount(ctx);
    const r = this.num('radius', 0.9);
    const colorStr = (this.def.params?.['color'] as string | undefined) ?? '#00f0ff';
    const color = new THREE.Color(colorStr);

    this.switches.push(this.id);
    const m = Materials.RubberSoft;
    this.claim(ctx.pw.world.createCollider(
      ctx.pw.R.ColliderDesc.ball(r)
        .setTranslation(this.def.x, this.def.y)
        .setFriction(m.friction)
        .setRestitution(m.restitution)
        .setCollisionGroups(staticGroups(this.layer))
        .setActiveEvents(ctx.pw.R.ActiveEvents.COLLISION_EVENTS),
    ));

    // Translucent glowing star-post body
    this.postMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      envMapIntensity: 0.15,
    });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.85, 2.7, 16), this.postMat);
    post.position.y = 1.35;
    post.castShadow = true;

    // Double rubber rings around the post
    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0xff2244,
      emissive: 0x440011,
      roughness: 0.4,
    });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.85, r * 0.22, 10, 20), rubberMat);
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = 1.1;

    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.78, r * 0.18, 10, 20), rubberMat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 2.0;

    // Chrome top acorn nut
    const nut = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.42, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xd8e0ee, metalness: 0.9, roughness: 0.18, envMapIntensity: 0.25 }),
    );
    nut.position.y = 2.75;

    const glowTex = getGlowTexture();
    if (glowTex) {
      this.haloMat = new THREE.SpriteMaterial({
        map: glowTex,
        color,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Sprite(this.haloMat);
      halo.position.y = 1.5;
      halo.scale.set(r * 4.2, r * 4.2, 1);
      this.group.add(halo);
    }

    this.group.add(post, ring1, ring2, nut);
    toLocal(this.def.x, this.def.y, 0, this.group.position);
  }

  override onContact(_c: RAPIER.Collider, _ball: Ball, started: boolean): void {
    if (!started || this.cooldown > 0) return;
    this.cooldown = 0.08;
    this.flash = 1;
    this.ctx.bus.emit('ON_SWITCH_HIT', { id: this.id });
  }

  override update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.postMat.emissiveIntensity = 0.45 + this.flash * 2.2;
    if (this.haloMat) {
      this.haloMat.opacity = 0.35 + this.flash * 0.6;
    }
  }
}
