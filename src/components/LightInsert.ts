import * as THREE from 'three';
import { toLocal } from '../render/coords';
import { createInsertJewelTexture, getGlowTexture } from '../render/ProceduralTextures';
import { PlayfieldModule, type ModuleContext } from './PlayfieldModule';

export type LampPattern = 'OFF' | 'ON' | 'BLINK_SLOW' | 'BLINK_FAST' | 'PULSE';
export const LAMP_PATTERNS: LampPattern[] = ['OFF', 'ON', 'BLINK_SLOW', 'BLINK_FAST', 'PULSE'];

/**
 * Under-playfield LED insert (visual only). Driven by the rules engine via SET_LAMP.
 * params: shape ('circle' | 'arrow'), size, color (initial hex).
 */
export class LightInsert extends PlayfieldModule {
  readonly type = 'LightInsert';
  private pattern: LampPattern = 'OFF';
  private color = new THREE.Color(0xffffff);
  private t = 0;
  private mat!: THREE.MeshStandardMaterial;
  private haloMat?: THREE.SpriteMaterial;
  private light!: THREE.PointLight;

  override mount(ctx: ModuleContext): void {
    super.mount(ctx);
    const size = this.num('size', 2);
    const shape = String(this.def.params?.['style'] ?? this.def.params?.['shape'] ?? 'circle');
    const initial = (this.def.params?.['color'] as string | undefined) ?? '#ffcc33';
    this.color.set(initial);

    const jewelTex = createInsertJewelTexture();
    this.mat = new THREE.MeshStandardMaterial({
      color: this.color,
      map: jewelTex,
      emissive: this.color,
      emissiveMap: jewelTex,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.05,
      envMapIntensity: 0.1,
      transparent: true,
      opacity: 0.96,
    });

    let geo: THREE.BufferGeometry;
    if (shape === 'arrow') {
      const s = new THREE.Shape();
      s.moveTo(0, size * 1.1);
      s.lineTo(size * 0.85, -size * 0.15);
      s.lineTo(size * 0.35, -size * 0.15);
      s.lineTo(size * 0.35, -size);
      s.lineTo(-size * 0.35, -size);
      s.lineTo(-size * 0.35, -size * 0.15);
      s.lineTo(-size * 0.85, -size * 0.15);
      s.closePath();
      geo = new THREE.ShapeGeometry(s);
    } else if (shape === 'star') {
      const s = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? size * 1.15 : size * 0.55;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
      }
      s.closePath();
      geo = new THREE.ShapeGeometry(s);
    } else if (shape === 'diamond') {
      const s = new THREE.Shape();
      s.moveTo(0, size * 1.25);
      s.lineTo(size * 0.9, 0);
      s.lineTo(0, -size * 1.25);
      s.lineTo(-size * 0.9, 0);
      s.closePath();
      geo = new THREE.ShapeGeometry(s);
    } else if (shape === 'shield') {
      const s = new THREE.Shape();
      s.moveTo(-size * 0.85, size * 0.85);
      s.lineTo(size * 0.85, size * 0.85);
      s.lineTo(size * 0.85, 0);
      s.quadraticCurveTo(size * 0.85, -size * 0.85, 0, -size * 1.15);
      s.quadraticCurveTo(-size * 0.85, -size * 0.85, -size * 0.85, 0);
      s.closePath();
      geo = new THREE.ShapeGeometry(s);
    } else {
      geo = new THREE.CircleGeometry(size, 32);
      // Black bezel ring around circular insert
      const bezel = new THREE.Mesh(
        new THREE.RingGeometry(size * 0.95, size * 1.12, 32),
        new THREE.MeshBasicMaterial({ color: 0x05070e, side: THREE.DoubleSide }),
      );
      bezel.rotation.x = -Math.PI / 2;
      bezel.position.y = 0.04;
      this.group.add(bezel);
    }

    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.06;
    this.group.add(mesh);

    const glowTex = getGlowTexture();
    if (glowTex) {
      this.haloMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: this.color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Sprite(this.haloMat);
      halo.position.y = 0.25;
      halo.scale.set(size * 3.4, size * 3.4, 1);
      this.group.add(halo);
    }

    this.light = new THREE.PointLight(this.color, 0, 16, 2);
    this.light.position.y = 2.2;
    this.group.add(this.light);

    this.group.rotation.y = this.rot;
    toLocal(this.def.x, this.def.y, 0, this.group.position);
    this.solenoids.push('on', 'off');
    if (this.def.params?.['lit']) this.pattern = 'ON';
  }

  setLamp(pattern: LampPattern, color?: string): void {
    this.pattern = pattern;
    if (color) this.color.set(color);
    this.mat.color.copy(this.color);
    this.mat.emissive.copy(this.color);
    this.light.color.copy(this.color);
    if (this.haloMat) this.haloMat.color.copy(this.color);
  }

  override fire(port: string): void {
    if (port === 'on') this.setLamp('ON');
    if (port === 'off') this.setLamp('OFF');
  }

  get lit(): number {
    switch (this.pattern) {
      case 'OFF': return 0;
      case 'ON': return 1;
      case 'BLINK_SLOW': return Math.floor(this.t * 2) % 2 ? 0.08 : 1;
      case 'BLINK_FAST': return Math.floor(this.t * 6) % 2 ? 0.08 : 1;
      case 'PULSE': return 0.5 + 0.5 * Math.sin(this.t * 4);
    }
  }

  override update(dt: number): void {
    this.t += dt;
    const v = this.lit;
    this.mat.emissiveIntensity = 0.55 + v * 1.85;
    this.light.intensity = v * 2.4;
    if (this.haloMat) {
      this.haloMat.opacity = 0.32 + v * 0.62;
    }
  }
}
