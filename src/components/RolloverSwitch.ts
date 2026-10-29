import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier2d-compat';
import type { Ball } from '../physics/Ball';
import { staticGroups } from '../physics/CollisionLayers';
import { toLocal } from '../render/coords';
import { createInsertJewelTexture, getGlowTexture } from '../render/ProceduralTextures';
import { PlayfieldModule, type ModuleContext } from './PlayfieldModule';

/** Inlane/lane rollover: a sensor disc. params: radius. Emits ON_SWITCH_HIT(id). Exposes snap port "out". */
export class RolloverSwitch extends PlayfieldModule {
  readonly type = 'RolloverSwitch';
  private cooldown = 0;
  private flash = 0;
  private mat!: THREE.MeshStandardMaterial;
  private haloMat?: THREE.SpriteMaterial;

  override mount(ctx: ModuleContext): void {
    super.mount(ctx);
    const r = this.num('radius', 1.3);
    this.switches.push(this.id);
    this.claim(ctx.pw.world.createCollider(
      ctx.pw.R.ColliderDesc.ball(r).setTranslation(this.def.x, this.def.y)
        .setSensor(true).setCollisionGroups(staticGroups(this.layer))
        .setActiveEvents(ctx.pw.R.ActiveEvents.COLLISION_EVENTS),
    ));

    const jewelTex = createInsertJewelTexture();
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x0b2e22,
      map: jewelTex,
      emissive: 0x00ff99,
      emissiveMap: jewelTex,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 28), this.mat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.06;
    this.group.add(disc);

    // Chrome bezel ring & rollover wire blade
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.15 });
    const rim = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r * 1.12, 28), chromeMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.07;
    this.group.add(rim);

    const wire = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, r * 1.3), chromeMat);
    wire.position.y = 0.2;
    this.group.add(wire);

    const glowTex = getGlowTexture();
    if (glowTex) {
      this.haloMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0x00ff99,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Sprite(this.haloMat);
      halo.position.y = 0.25;
      halo.scale.set(r * 3.0, r * 3.0, 1);
      this.group.add(halo);
    }

    toLocal(this.def.x, this.def.y, 0, this.group.position);
    this.addPort('out', 0, 0, 0, 1);
  }

  override onContact(_c: RAPIER.Collider, _ball: Ball, started: boolean): void {
    if (!started || this.cooldown > 0) return;
    this.cooldown = 0.1;
    this.flash = 1;
    this.ctx.bus.emit('ON_SWITCH_HIT', { id: this.id });
  }

  override update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.mat.emissiveIntensity = 0.45 + this.flash * 3.2;
    if (this.haloMat) {
      this.haloMat.opacity = 0.25 + this.flash * 0.7;
    }
  }
}
