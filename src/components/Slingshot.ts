import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier2d-compat';
import type { Ball } from '../physics/Ball';
import { staticGroups } from '../physics/CollisionLayers';
import { Materials } from '../physics/Materials';
import { toLocal } from '../render/coords';
import { createSlingshotPlasticTexture } from '../render/ProceduralTextures';
import { PlayfieldModule, type ModuleContext } from './PlayfieldModule';

type P2 = { x: number; y: number };

/**
 * Triangular rubber kicker. params: points [[x,y]...] relative to (x,y), face [i,j] = kicking edge, kickSpeed.
 * A ball touching the face (any decent speed) gets its normal velocity set to kickSpeed.
 */
export class Slingshot extends PlayfieldModule {
  readonly type = 'Slingshot';
  private kick = 300;
  private cooldown = 0;
  private flash = 0;
  private a: P2 = { x: 0, y: 0 };
  private normal: P2 = { x: 1, y: 0 };
  private len = 1;
  private t: P2 = { x: 0, y: 1 };
  private mat!: THREE.MeshStandardMaterial;
  private bulbMat!: THREE.MeshBasicMaterial;
  private light!: THREE.PointLight;

  override mount(ctx: ModuleContext): void {
    super.mount(ctx);
    const raw = (this.def.params?.['points'] as number[][] | undefined) ?? [[0, 0], [0, 15], [10, 2.5]];
    const [fi, fj] = (this.def.params?.['face'] as number[] | undefined) ?? [1, 2];
    this.kick = this.num('kickSpeed', 300);
    this.switches.push(this.id);
    this.solenoids.push('kick');
    const pts = raw.map(([x = 0, y = 0]) => this.toWorld(x, y));
    const A = pts[fi!]!, B = pts[fj!]!;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    this.a = A;
    this.len = Math.hypot(B.x - A.x, B.y - A.y);
    this.t = { x: (B.x - A.x) / this.len, y: (B.y - A.y) / this.len };
    let n = { x: -this.t.y, y: this.t.x };
    if (n.x * (cx - (A.x + B.x) / 2) + n.y * (cy - (A.y + B.y) / 2) > 0) n = { x: -n.x, y: -n.y }; // point outward
    this.normal = n;

    const m = Materials.RubberSoft;
    const desc = ctx.pw.R.ColliderDesc.convexHull(new Float32Array(pts.flatMap((p) => [p.x, p.y])));
    if (!desc) throw new Error(`slingshot ${this.id}: degenerate points`);
    this.claim(ctx.pw.world.createCollider(
      desc.setRestitution(0).setFriction(m.friction).setCollisionGroups(staticGroups(this.layer))
        .setActiveEvents(ctx.pw.R.ActiveEvents.COLLISION_EVENTS),
    ));

    const style = String(this.def.params?.['style'] ?? 'lightning');
    const userColor = this.def.params?.['color'] as string | undefined;
    const isLeft = this.id.includes('left');
    const primaryHex = typeof userColor === 'string' && userColor ? userColor : (isLeft ? '#00e5ff' : '#ff2288');
    const accentHex = new THREE.Color(primaryHex).getHex();
    const plasticTex = createSlingshotPlasticTexture(primaryHex, '#ffcc00', style);

    // 1. Translucent Illuminated Plastic Cover Plate
    const shape = new THREE.Shape();
    pts.forEach((p, i) => (i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.45,
      bevelEnabled: true,
      bevelSize: 0.12,
      bevelThickness: 0.12,
      bevelSegments: 2,
    });
    geo.rotateX(-Math.PI / 2);
    const origin = toLocal(0, 0, 0);
    geo.translate(origin.x, 2.05, origin.z);

    this.mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: plasticTex,
      emissive: accentHex,
      emissiveIntensity: 0.18,
      roughness: 0.4,
      metalness: 0.1,
      envMapIntensity: 0.1,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const plate = new THREE.Mesh(geo, this.mat);
    plate.castShadow = true;
    this.group.add(plate);

    // 2. Chrome Corner Star Posts & Stretched Rubber Band Perimeter
    const postMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.15 });
    const rubberMat = new THREE.MeshPhysicalMaterial({ color: 0xff2233, emissive: 0x330008, roughness: 0.4, clearcoat: 0.4 });
    const postGeo = new THREE.CylinderGeometry(0.48, 0.58, 2.6, 16);

    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i]!;
      const p2 = pts[(i + 1) % pts.length]!;
      const post = new THREE.Mesh(postGeo, postMat);
      toLocal(p1.x, p1.y, 1.3, post.position);
      post.castShadow = true;
      this.group.add(post);

      // Rubber band segment between p1 and p2
      const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, segLen, 10), rubberMat);
      band.geometry.rotateZ(Math.PI / 2);
      toLocal((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, 1.15, band.position);
      band.rotation.y = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      this.group.add(band);
    }

    // 3. Internal Flasher Bulb & PointLight at centroid
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), this.bulbMat);
    toLocal(cx, cy, 1.2, bulb.position);
    this.group.add(bulb);

    this.light = new THREE.PointLight(0xff5522, 0.8, 15, 2);
    toLocal(cx, cy, 2.8, this.light.position);
    this.group.add(this.light);
  }

  override onContact(_c: RAPIER.Collider, ball: Ball, started: boolean): void {
    if (!started || this.cooldown > 0 || ball.speed() < 25) return;
    const p = ball.body.translation();
    const along = ((p.x - this.a.x) * this.t.x + (p.y - this.a.y) * this.t.y) / this.len;
    const side = (p.x - this.a.x) * this.normal.x + (p.y - this.a.y) * this.normal.y;
    if (along < -0.15 || along > 1.15 || side <= 0) return; // not on the kicking face
    this.cooldown = 0.15;
    const v = ball.body.linvel();
    const vn = v.x * this.normal.x + v.y * this.normal.y;
    const dv = this.kick - vn;
    ball.body.setLinvel({ x: v.x + this.normal.x * dv, y: v.y + this.normal.y * dv }, true);
    this.flash = 1;
    this.ctx.bus.emit('ON_SWITCH_HIT', { id: this.id });
  }

  override update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.mat.emissiveIntensity = 0.18 + this.flash * 1.6;
    this.light.intensity = 0.2 + this.flash * 3.2;
  }
}
