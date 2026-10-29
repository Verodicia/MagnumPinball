import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier2d-compat';
import type { Ball } from '../physics/Ball';
import { staticGroups } from '../physics/CollisionLayers';
import { toLocal } from '../render/coords';
import { PlayfieldModule, type ModuleContext } from './PlayfieldModule';

/**
 * Scoop / saucer: captures a ball (ON_BALL_LOCKED), holds it, and kicks it out along local +y
 * on solenoid "eject" (or automatically after `autoEject` seconds, 0 = rules-driven only).
 * params: radius, ejectSpeed, autoEject.
 */
export class KickoutHole extends PlayfieldModule {
  readonly type = 'KickoutHole';
  private held: Ball | null = null;
  private timer = 0;
  /** After an eject the ball starts inside the sensor; ignore it until it has left. */
  private ignoreFor = 0;
  private autoEject = 0;
  private ejectSpeed = 220;
  private ringMat!: THREE.MeshBasicMaterial;
  private domeMat!: THREE.MeshPhysicalMaterial;
  private light!: THREE.PointLight;
  private pulseTime = 0;

  override mount(ctx: ModuleContext): void {
    super.mount(ctx);
    const r = this.num('radius', 1.8);
    this.autoEject = this.num('autoEject', 0);
    this.ejectSpeed = this.num('ejectSpeed', 220);
    this.switches.push(this.id);
    this.solenoids.push('eject');
    this.claim(ctx.pw.world.createCollider(
      ctx.pw.R.ColliderDesc.ball(r * 0.6).setTranslation(this.def.x, this.def.y)
        .setSensor(true).setCollisionGroups(staticGroups(this.layer))
        .setActiveEvents(ctx.pw.R.ActiveEvents.COLLISION_EVENTS),
    ));

    // 1. Glowing rim ring around the recessed pocket
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xff2288, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.68, r * 1.12, 32), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.group.add(ring);

    // 2. Dark recessed hole pocket
    const hole = new THREE.Mesh(new THREE.CircleGeometry(r * 0.68, 28), new THREE.MeshBasicMaterial({ color: 0x030408 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.07;
    this.group.add(hole);

    // 3. Welded brushed-steel scoop hood arching over the back half of the hole
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xd8dee9,
      metalness: 0.92,
      roughness: 0.18,
      side: THREE.DoubleSide,
    });
    const hoodWall = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 1.05, r * 1.15, 2.5, 24, 1, true, -Math.PI * 0.55, Math.PI * 1.1),
      steelMat,
    );
    hoodWall.position.y = 1.25;
    hoodWall.castShadow = true;
    this.group.add(hoodWall);

    const hoodRoof = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.05, 24, 12, -Math.PI * 0.55, Math.PI * 1.1, 0, Math.PI * 0.5),
      steelMat,
    );
    hoodRoof.position.y = 2.5;
    this.group.add(hoodRoof);

    // 4. Top-mounted Flasher Beacon on the scoop roof
    this.domeMat = new THREE.MeshPhysicalMaterial({
      color: 0xff2288,
      emissive: 0xff1166,
      emissiveIntensity: 0.6,
      roughness: 0.15,
      clearcoat: 1,
    });
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      this.domeMat,
    );
    beacon.position.set(0, 2.5 + r * 0.95, 0);
    this.group.add(beacon);

    this.light = new THREE.PointLight(0xff2288, 1.5, 16, 2);
    this.light.position.y = 3.2;
    this.group.add(this.light);

    this.group.rotation.y = this.rot;
    toLocal(this.def.x, this.def.y, 0, this.group.position);
    this.addPort('in', 0, 0, 0, 1);
  }

  get occupied(): boolean { return this.held !== null; }

  override onContact(_c: RAPIER.Collider, ball: Ball, started: boolean): void {
    if (!started || this.held || this.ignoreFor > 0 || ball.speed() > 260) return;
    this.held = ball;
    this.timer = 0;
    ball.body.setTranslation({ x: this.def.x, y: this.def.y }, true);
    ball.body.setLinvel({ x: 0, y: 0 }, true);
    ball.body.setEnabled(false); // parked inside the scoop
    ball.height = 0.2; // sunk
    this.ctx.bus.emit('ON_SWITCH_HIT', { id: this.id });
    this.ctx.bus.emit('ON_BALL_LOCKED', { id: this.id });
  }

  override fire(port: string): void {
    if (port !== 'eject' || !this.held) return;
    const b = this.held;
    this.held = null;
    this.ignoreFor = 0.4;
    b.body.setEnabled(true);
    b.body.setTranslation({ x: this.def.x, y: this.def.y }, true);
    const c = Math.cos(this.rot + Math.PI / 2), s = Math.sin(this.rot + Math.PI / 2);
    b.body.setLinvel({ x: c * this.ejectSpeed, y: s * this.ejectSpeed }, true);
    b.height = 1.35;
  }

  override update(dt: number): void {
    this.pulseTime += dt;
    this.ignoreFor = Math.max(0, this.ignoreFor - dt);
    if (this.held && this.autoEject > 0) {
      this.timer += dt;
      if (this.timer >= this.autoEject) this.fire('eject');
    }

    if (this.held) {
      const flash = Math.floor(this.pulseTime * 14) % 2 === 0 ? 1 : 0.2;
      this.ringMat.color.setHex(0x00ffcc);
      this.domeMat.emissive.setHex(0x00ffcc);
      this.domeMat.emissiveIntensity = 0.6 + flash * 1.8;
      this.light.color.setHex(0x00ffcc);
      this.light.intensity = 0.6 + flash * 3.0;
    } else {
      const breathe = 0.5 + 0.5 * Math.sin(this.pulseTime * 4);
      this.ringMat.color.setHex(0xff2288);
      this.domeMat.emissive.setHex(0xff1166);
      this.domeMat.emissiveIntensity = 0.35 + breathe * 0.55;
      this.light.color.setHex(0xff2288);
      this.light.intensity = 0.35 + breathe * 0.8;
    }
  }
}
