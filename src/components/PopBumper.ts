import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier2d-compat';
import type { Ball } from '../physics/Ball';
import { staticGroups } from '../physics/CollisionLayers';
import { toLocal } from '../render/coords';
import { createBumperCapTexture, getGlowTexture } from '../render/ProceduralTextures';
import { PlayfieldModule, type ModuleContext } from './PlayfieldModule';

/** Active bumper: any ball contact fires a radial kick. params: radius, kickSpeed. */
export class PopBumper extends PlayfieldModule {
  readonly type = 'PopBumper';
  private kick = 260;
  private cooldown = 0;
  private flash = 0;
  private capMat!: THREE.MeshStandardMaterial;
  private domeMat!: THREE.MeshStandardMaterial;
  private skirtMesh!: THREE.Mesh;
  private haloMat?: THREE.SpriteMaterial;
  private light!: THREE.PointLight;

  override mount(ctx: ModuleContext): void {
    super.mount(ctx);
    const r = this.num('radius', 2.8);
    this.kick = this.num('kickSpeed', 260);
    this.switches.push(this.id);
    this.solenoids.push('kick');
    this.claim(ctx.pw.world.createCollider(
      ctx.pw.R.ColliderDesc.ball(r).setTranslation(this.def.x, this.def.y)
        .setRestitution(0).setFriction(0)
        .setCollisionGroups(staticGroups(this.layer))
        .setActiveEvents(ctx.pw.R.ActiveEvents.COLLISION_EVENTS),
    ));

    // Pick vibrant color scheme by bumper id or custom params
    const style = String(this.def.params?.['style'] ?? 'starburst');
    const userColor = this.def.params?.['color'] as string | undefined;

    let primary = typeof userColor === 'string' && userColor ? userColor : '#ff8800';
    let accent = '#ff1166';
    let hex = new THREE.Color(primary).getHex();
    if (!userColor) {
      if (this.id.endsWith('_b')) {
        primary = '#00e5ff'; accent = '#0055ff'; hex = 0x00d8ff;
      } else if (this.id.endsWith('_c')) {
        primary = '#ff2288'; accent = '#ffcc00'; hex = 0xff2288;
      }
    }

    // 1. Playfield LED base ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: hex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    const baseRing = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r * 1.18, 32), ringMat);
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.05;

    // 2. Chrome lower dish & metallic kick ring
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe4e9f2, metalness: 0.95, roughness: 0.12 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.96, 1.3, 28), chromeMat);
    base.position.y = 0.65;
    base.castShadow = true;

    // 3. Animated translucent skirt that kicks down on contact
    const skirtMat = new THREE.MeshPhysicalMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      clearcoat: 1,
    });
    this.skirtMesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 1.06, 0.55, 28), skirtMat);
    this.skirtMesh.position.y = 1.45;

    // 4. Printed starburst cap + center jewel dome
    const capTex = createBumperCapTexture(primary, accent, '1000', style);
    this.capMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: capTex,
      emissive: new THREE.Color(hex),
      emissiveIntensity: 0.28,
      roughness: 0.22,
      metalness: 0.15,
    });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.98, r * 0.88, 0.85, 32), this.capMat);
    cap.position.y = 2.25;
    cap.castShadow = true;

    this.domeMat = new THREE.MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 0.6,
      roughness: 0.18,
      metalness: 0.1,
      envMapIntensity: 0.15,
      transparent: true,
      opacity: 0.92,
    });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.48, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      this.domeMat,
    );
    dome.position.y = 2.68;

    this.light = new THREE.PointLight(hex, 1.2, 18, 2);
    this.light.position.y = 3.8;

    const glowTex = getGlowTexture();
    if (glowTex) {
      this.haloMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: hex,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Sprite(this.haloMat);
      halo.position.y = 2.8;
      halo.scale.set(r * 3.4, r * 3.4, 1);
      this.group.add(halo);
    }

    this.group.add(baseRing, base, this.skirtMesh, cap, dome, this.light);
    toLocal(this.def.x, this.def.y, 0, this.group.position);
  }

  override onContact(_c: RAPIER.Collider, ball: Ball, started: boolean): void {
    if (!started || this.cooldown > 0) return;
    this.cooldown = 0.08;
    const p = ball.body.translation();
    const dx = p.x - this.def.x, dy = p.y - this.def.y, l = Math.hypot(dx, dy) || 1;
    ball.body.setLinvel({ x: (dx / l) * this.kick, y: (dy / l) * this.kick }, true);
    this.flash = 1;
    this.ctx.bus.emit('ON_SWITCH_HIT', { id: this.id });
  }

  override fire(port: string): void {
    if (port === 'kick') this.flash = 1; // visual only; kicks need a ball in contact
  }

  override update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.capMat.emissiveIntensity = 0.35 + this.flash * 2.0;
    this.domeMat.emissiveIntensity = 0.7 + this.flash * 2.4;
    this.light.intensity = 0.45 + this.flash * 4.0;
    this.skirtMesh.position.y = 1.45 - this.flash * 0.45;
    if (this.haloMat) {
      this.haloMat.opacity = 0.42 + this.flash * 0.55;
    }
  }
}
