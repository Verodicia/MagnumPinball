import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier2d-compat';
import type { Ball } from '../physics/Ball';
import { staticGroups } from '../physics/CollisionLayers';
import { Materials } from '../physics/Materials';
import { toLocal } from '../render/coords';
import { createTargetDecalTexture, getGlowTexture } from '../render/ProceduralTextures';
import { PlayfieldModule, type ModuleContext } from './PlayfieldModule';

/**
 * Single spring-loaded neon standup target.
 * params: width (cm, default 3.2), color (hex string), label (string).
 * Emits ON_SWITCH_HIT(id) on ball impact.
 */
export class StandupTarget extends PlayfieldModule {
  readonly type = 'StandupTarget';
  private cooldown = 0;
  private flash = 0;
  private targetMesh!: THREE.Mesh;
  private faceMat!: THREE.MeshStandardMaterial;
  private haloMat?: THREE.SpriteMaterial;

  override mount(ctx: ModuleContext): void {
    super.mount(ctx);
    const width = this.num('width', 3.2);
    const thick = 0.7;
    const style = String(this.def.params?.['style'] ?? 'star');
    const colorStr = (this.def.params?.['color'] as string | undefined) ?? '#00f0ff';
    const rawLabel = (this.def.params?.['label'] as string | undefined) ?? '★';
    const sym = style === 'bullseye' ? '◎' : style === 'lightning' ? '⚡' : style === 'skull' ? '☠' : style === 'number' ? '100' : rawLabel;
    const color = new THREE.Color(colorStr);

    this.switches.push(this.id);
    const m = Materials.RubberHard;
    this.claim(ctx.pw.world.createCollider(
      ctx.pw.R.ColliderDesc.cuboid(width / 2, thick / 2)
        .setTranslation(this.def.x, this.def.y)
        .setRotation(this.rot)
        .setFriction(m.friction)
        .setRestitution(m.restitution * 1.1)
        .setCollisionGroups(staticGroups(this.layer))
        .setActiveEvents(ctx.pw.R.ActiveEvents.COLLISION_EVENTS),
    ));

    const decal = createTargetDecalTexture(colorStr, '#ffffff', sym);
    this.faceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: decal,
      emissive: color,
      emissiveIntensity: 0.35,
      roughness: 0.28,
      envMapIntensity: 0.15,
    });
    this.targetMesh = new THREE.Mesh(new THREE.BoxGeometry(width, 2.7, thick), this.faceMat);
    this.targetMesh.position.y = 1.35;
    this.targetMesh.castShadow = true;
    this.group.add(this.targetMesh);

    // Rear chrome support bracket
    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.5, 2.1, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x8a99b8, metalness: 0.8, roughness: 0.25, envMapIntensity: 0.2 }),
    );
    bracket.position.set(0, 1.05, -0.55);
    this.group.add(bracket);

    // Front playfield LED indicator dot
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
      halo.position.set(0, 0.4, 0.8);
      halo.scale.set(width * 1.6, width * 1.6, 1);
      this.group.add(halo);
    }

    this.group.rotation.y = this.rot;
    toLocal(this.def.x, this.def.y, 0, this.group.position);
  }

  override onContact(_c: RAPIER.Collider, ball: Ball, started: boolean): void {
    if (!started || this.cooldown > 0 || ball.speed() < 12) return;
    this.cooldown = 0.1;
    this.flash = 1;
    this.ctx.bus.emit('ON_SWITCH_HIT', { id: this.id });
  }

  override update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.faceMat.emissiveIntensity = 0.35 + this.flash * 2.2;
    this.targetMesh.position.z = -this.flash * 0.35;
    if (this.haloMat) {
      this.haloMat.opacity = 0.32 + this.flash * 0.65;
    }
  }
}
