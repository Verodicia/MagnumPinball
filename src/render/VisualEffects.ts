import * as THREE from 'three';
import type { PinballEventBus } from '../core/PinballEventBus';
import { toLocal } from './coords';
import { getGlowTexture } from './ProceduralTextures';

interface FlasherDome {
  id: string;
  x: number;
  y: number;
  baseColor: THREE.Color;
  activeColor: THREE.Color;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  halo?: THREE.Sprite;
  haloMat?: THREE.SpriteMaterial;
  light: THREE.PointLight;
  energy: number;
  strobeHz: number;
  strobeTimer: number;
}

interface ShockRing {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  maxScale: number;
}

interface Spark {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
}

const FLASHER_LAYOUT: Array<{ id: string; x: number; y: number; z?: number; color: number }> = [
  { id: 'fl_upper_left', x: 9, y: 98, color: 0x00f0ff },
  { id: 'fl_upper_right', x: 41, y: 102, color: 0xff2288 },
  { id: 'fl_bumper_core', x: 34.7, y: 70, color: 0xff9900 },
  { id: 'fl_ramp_side', x: 6.5, y: 58, color: 0x00ff88 },
  { id: 'fl_sling_left', x: 2.2, y: 42, color: 0xff3344 },
  { id: 'fl_sling_right', x: 49.6, y: 42, color: 0xffaa00 },
];

const TRAIL_LEN = 14;

/**
 * Manages 3D arcade Flasher Domes, mode light shows, impact shockwave rings,
 * spark particle bursts, and the high-speed ball motion trail.
 */
export class VisualEffects {
  readonly group = new THREE.Group();
  private flashers: FlasherDome[] = [];
  private rings: ShockRing[] = [];
  private sparks: Spark[] = [];
  private trailMeshes: THREE.Mesh[] = [];
  private trailMats: THREE.MeshBasicMaterial[] = [];
  private trailHistory: Array<{ x: number; y: number; z: number; speed: number }> = [];
  private ballLight: THREE.PointLight;
  private mode = 'BaseMode';
  private tilted = false;
  private time = 0;

  private ringGeo = new THREE.RingGeometry(0.6, 1.0, 28);
  private sparkGeo = new THREE.OctahedronGeometry(0.32, 0);

  constructor(
    parent: THREE.Object3D,
    bus: PinballEventBus,
    private lookupModulePos: (id: string) => { x: number; y: number; z?: number } | undefined,
  ) {
    parent.add(this.group);
    this.ringGeo.rotateX(-Math.PI / 2);

    const glowTex = getGlowTexture();
    const domeGeo = new THREE.SphereGeometry(1.35, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const bezelGeo = new THREE.CylinderGeometry(1.5, 1.65, 0.45, 20);
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0xd0d5dd, metalness: 0.9, roughness: 0.2 });

    for (const cfg of FLASHER_LAYOUT) {
      const baseColor = new THREE.Color(cfg.color);
      const activeColor = baseColor.clone();
      const holder = new THREE.Group();
      toLocal(cfg.x, cfg.y, cfg.z ?? 0, holder.position);

      const bezel = new THREE.Mesh(bezelGeo, bezelMat);
      bezel.position.y = 0.22;
      holder.add(bezel);

      const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor,
        emissiveIntensity: 0.45,
        roughness: 0.2,
        metalness: 0.1,
        envMapIntensity: 0.15,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(domeGeo, mat);
      mesh.position.y = 0.4;
      holder.add(mesh);

      let halo: THREE.Sprite | undefined;
      let haloMat: THREE.SpriteMaterial | undefined;
      if (glowTex) {
        haloMat = new THREE.SpriteMaterial({
          map: glowTex,
          color: baseColor,
          transparent: true,
          opacity: 0.2,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        halo = new THREE.Sprite(haloMat);
        halo.position.y = 1.2;
        halo.scale.set(6, 6, 1);
        holder.add(halo);
      }

      const light = new THREE.PointLight(baseColor, 0.5, 26, 1.8);
      light.position.y = 2.6;
      holder.add(light);

      this.group.add(holder);
      this.flashers.push({
        id: cfg.id,
        x: cfg.x,
        y: cfg.y,
        baseColor,
        activeColor,
        mesh,
        mat,
        halo,
        haloMat,
        light,
        energy: 0.2,
        strobeHz: 0,
        strobeTimer: 0,
      });
    }

    // Subtle light following the ball for extra metallic glint on nearby rails
    this.ballLight = new THREE.PointLight(0x88ddff, 1.2, 14, 2);
    this.group.add(this.ballLight);

    // Ball motion trail segments
    const trailGeo = new THREE.SphereGeometry(0.95, 12, 8);
    for (let i = 0; i < TRAIL_LEN; i++) {
      const mMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const m = new THREE.Mesh(trailGeo, mMat);
      m.visible = false;
      this.group.add(m);
      this.trailMeshes.push(m);
      this.trailMats.push(mMat);
    }

    this.bindEvents(bus);
  }

  private bindEvents(bus: PinballEventBus): void {
    bus.on('ON_SWITCH_HIT', ({ id }) => {
      const pos = this.lookupModulePos(id);
      if (id.startsWith('pop_')) {
        this.pulseFlasher('fl_bumper_core', 1.4, 0xffaa00);
        this.pulseFlasher('fl_upper_left', 0.8);
        if (pos) {
          this.spawnShockwave(pos.x, pos.y, 0xffaa00, 7.5, 0.28);
          this.spawnSparks(pos.x, pos.y, 2.2, 0xffcc33, 12);
        }
      } else if (id.startsWith('sling_')) {
        const flId = id.includes('left') ? 'fl_sling_left' : 'fl_sling_right';
        this.pulseFlasher(flId, 1.35, 0xff3344);
        if (pos) {
          this.spawnShockwave(pos.x, pos.y, 0xff3355, 6.5, 0.25);
          this.spawnSparks(pos.x, pos.y, 1.5, 0xff5533, 10);
        }
      } else if (id.startsWith('drop_bank_')) {
        this.pulseFlasher('fl_upper_right', 1.1, 0xffdd00);
        if (pos) {
          this.spawnShockwave(pos.x, pos.y, 0xffdd00, 5.5, 0.22);
          this.spawnSparks(pos.x, pos.y, 1.6, 0xffee44, 10);
        }
      } else if (id.endsWith('.entry')) {
        this.pulseFlasher('fl_ramp_side', 1.4, 0x00ff88);
        this.pulseFlasher('fl_upper_left', 1.2, 0x00f0ff);
        this.spawnShockwave(14, 52, 0x00ff99, 6.5, 0.3);
      } else if (id.endsWith('.exit')) {
        this.triggerAllStrobe(0.7, 14, 0x00ffcc);
        this.spawnShockwave(30, 92, 0x00ffff, 8.5, 0.38);
        this.spawnSparks(30, 92, 8.5, 0x00ffff, 18);
      } else if (pos) {
        this.spawnShockwave(pos.x, pos.y, 0x00ff88, 4.2, 0.2);
      }
    });

    bus.on('ON_TARGET_BANK_COMPLETE', () => {
      this.triggerAllStrobe(1.2, 16, 0x00ff88);
      this.spawnShockwave(48.6, 53.4, 0x00ff88, 10, 0.45);
      this.spawnSparks(48.6, 53.4, 2.0, 0x00ff88, 20);
    });

    bus.on('ON_BALL_LOCKED', () => {
      this.triggerAllStrobe(1.5, 18, 0xff2288);
      this.spawnShockwave(44, 92, 0xff2288, 11, 0.5);
      this.spawnSparks(44, 92, 1.8, 0xff44aa, 22);
    });

    bus.on('ON_SPINNER_SPIN', () => {
      this.pulseFlasher('fl_upper_right', 0.9, 0x00f6ff);
      this.spawnSparks(49, 106.8, 2.2, 0x66ffff, 5);
    });

    bus.on('ON_STATE_ENTER', ({ id }) => {
      this.mode = id;
      if (id === 'JackpotFrenzy') {
        this.triggerAllStrobe(2.2, 20, 0xff00aa);
      } else if (id === 'SkillShotActive') {
        this.pulseFlasher('fl_ramp_side', 1.2, 0x00ff88);
      }
    });

    bus.on('ON_TILT_WARNING', () => {
      this.triggerAllStrobe(0.4, 12, 0xff2200);
    });

    bus.on('ON_TILT', () => {
      this.tilted = true;
      this.triggerAllStrobe(1.5, 8, 0xff0000);
    });

    bus.on('ON_BALL_START', () => {
      this.tilted = false;
      this.trailHistory.length = 0;
    });
  }

  pulseFlasher(id: string, energy = 1.2, colorHex?: number): void {
    const f = this.flashers.find((x) => x.id === id);
    if (!f) return;
    f.energy = Math.max(f.energy, energy);
    if (colorHex !== undefined) f.activeColor.setHex(colorHex);
    else f.activeColor.copy(f.baseColor);
  }

  triggerAllStrobe(duration: number, hz = 15, colorHex?: number): void {
    for (const f of this.flashers) {
      f.strobeTimer = Math.max(f.strobeTimer, duration);
      f.strobeHz = hz;
      f.energy = 1.5;
      if (colorHex !== undefined) f.activeColor.setHex(colorHex);
      else f.activeColor.copy(f.baseColor);
    }
  }

  spawnShockwave(x: number, y: number, colorHex: number, maxScale = 6, maxAge = 0.28): void {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    toLocal(x, y, 0.18, mesh.position);
    this.group.add(mesh);
    this.rings.push({ mesh, mat, age: 0, maxAge, maxScale });
  }

  spawnSparks(x: number, y: number, z: number, colorHex: number, count = 12): void {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      toLocal(x, y, z, mesh.position);
      const a = Math.random() * Math.PI * 2;
      const spd = 12 + Math.random() * 28;
      this.group.add(mesh);
      this.sparks.push({
        mesh,
        mat,
        vx: Math.cos(a) * spd,
        vy: 8 + Math.random() * 18,
        vz: Math.sin(a) * spd,
        age: 0,
        maxAge: 0.18 + Math.random() * 0.2,
      });
    }
  }

  update(dt: number, ballX: number, ballY: number, ballZ: number, ballSpeed: number, ballVisible: boolean): void {
    this.time += dt;

    // 1. Update Flasher Domes & Mode Light Shows
    const isFrenzy = this.mode === 'JackpotFrenzy';
    const isSkill = this.mode === 'SkillShotActive';

    for (let i = 0; i < this.flashers.length; i++) {
      const f = this.flashers[i]!;
      f.energy = Math.max(0, f.energy - dt * 4.2);

      let ambient = 0.18;
      if (this.tilted) {
        ambient = 0.05;
      } else if (isFrenzy) {
        const wave = 0.5 + 0.5 * Math.sin(this.time * 10 + i * 1.1);
        ambient = 0.35 + wave * 0.85;
        f.activeColor.setHSL(((this.time * 0.5 + i * 0.15) % 1), 1.0, 0.55);
      } else if (isSkill && (f.id === 'fl_ramp_side' || f.id === 'fl_upper_left')) {
        ambient = 0.3 + 0.55 * (0.5 + 0.5 * Math.sin(this.time * 7));
      }

      let strobeMult = 1;
      if (f.strobeTimer > 0) {
        f.strobeTimer = Math.max(0, f.strobeTimer - dt);
        strobeMult = Math.floor(this.time * f.strobeHz) % 2 === 0 ? 1.35 : 0.15;
        if (f.strobeTimer === 0) f.activeColor.copy(f.baseColor);
      }

      const level = Math.max(ambient, f.energy) * strobeMult;
      f.mat.color.copy(f.activeColor);
      f.mat.emissive.copy(f.activeColor);
      f.mat.emissiveIntensity = 0.6 + level * 2.2;
      f.light.color.copy(f.activeColor);
      f.light.intensity = level * 2.5;
      if (f.halo && f.haloMat) {
        f.haloMat.color.copy(f.activeColor);
        f.haloMat.opacity = Math.min(0.95, 0.25 + level * 0.65);
        const s = 5.5 + level * 4.5;
        f.halo.scale.set(s, s, 1);
      }
    }

    // 2. Update Shockwave Rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.age += dt;
      if (r.age >= r.maxAge) {
        this.group.remove(r.mesh);
        r.mat.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const p = r.age / r.maxAge;
      const scale = 1 + (r.maxScale - 1) * (1 - Math.pow(1 - p, 2));
      r.mesh.scale.set(scale, 1, scale);
      r.mat.opacity = (1 - p) * 0.9;
    }

    // 3. Update Sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.age += dt;
      if (s.age >= s.maxAge) {
        this.group.remove(s.mesh);
        s.mat.dispose();
        this.sparks.splice(i, 1);
        continue;
      }
      s.vy -= 55 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y = Math.max(0.15, s.mesh.position.y + s.vy * dt);
      s.mesh.position.z += s.vz * dt;
      s.mesh.rotation.x += 12 * dt;
      s.mesh.rotation.y += 15 * dt;
      s.mat.opacity = 1 - s.age / s.maxAge;
    }

    // 4. Update Ball Light & High-Speed Motion Trail
    toLocal(ballX, ballY, ballZ + 2.0, this.ballLight.position);
    this.ballLight.color.setHex(isFrenzy ? 0xff44cc : ballZ > 2 ? 0x00ffcc : 0x88ddff);
    this.ballLight.intensity = ballVisible ? (isFrenzy ? 2.8 : 1.4) : 0;

    if (ballVisible) {
      this.trailHistory.unshift({ x: ballX, y: ballY, z: ballZ, speed: ballSpeed });
      if (this.trailHistory.length > TRAIL_LEN) this.trailHistory.length = TRAIL_LEN;
    } else {
      this.trailHistory.length = 0;
    }

    const trailColor = isFrenzy ? 0xff33aa : ballZ > 2 ? 0x00ffaa : 0x00d8ff;
    for (let i = 0; i < TRAIL_LEN; i++) {
      const m = this.trailMeshes[i]!;
      const mat = this.trailMats[i]!;
      const h = this.trailHistory[i];
      if (!h || h.speed < 85 || i === 0) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      toLocal(h.x, h.y, h.z * 0.9, m.position);
      const fade = 1 - i / TRAIL_LEN;
      const spdFactor = Math.min(1, (h.speed - 85) / 220);
      const scale = fade * (0.45 + 0.45 * spdFactor);
      m.scale.set(scale, scale * 0.4, scale);
      mat.color.setHex(trailColor);
      mat.opacity = fade * spdFactor * 0.42;
    }
  }
}
