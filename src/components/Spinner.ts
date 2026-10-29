import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier2d-compat';
import type { Ball } from '../physics/Ball';
import { staticGroups } from '../physics/CollisionLayers';
import { toLocal } from '../render/coords';
import { createTargetDecalTexture } from '../render/ProceduralTextures';
import { PlayfieldModule, type ModuleContext } from './PlayfieldModule';

/**
 * Spinner blade across a lane. The sensor's long axis is local +x (the blade axle); balls pass along local +/-y.
 * params: length. Emits ON_SPINNER_SPIN(id, spins) once per full revolution.
 */
export class Spinner extends PlayfieldModule {
  readonly type = 'Spinner';
  private angle = 0;
  private vel = 0;
  private revs = 0;
  private blade!: THREE.Mesh;

  override mount(ctx: ModuleContext): void {
    super.mount(ctx);
    const len = this.num('length', 4.5);
    this.switches.push(this.id);
    this.claim(ctx.pw.world.createCollider(
      ctx.pw.R.ColliderDesc.cuboid(len / 2, 0.4).setTranslation(this.def.x, this.def.y).setRotation(this.rot)
        .setSensor(true).setCollisionGroups(staticGroups(this.layer))
        .setActiveEvents(ctx.pw.R.ActiveEvents.COLLISION_EVENTS),
    ));

    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.12 });
    const postGeo = new THREE.CylinderGeometry(0.22, 0.28, 3.8, 12);
    for (const side of [-1, 1] as const) {
      const post = new THREE.Mesh(postGeo, chromeMat);
      post.position.set(side * (len / 2 + 0.3), 1.9, 0);
      this.group.add(post);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, len + 0.8, 10), chromeMat);
    axle.rotation.z = Math.PI / 2;
    axle.position.y = 3.6;
    this.group.add(axle);

    const decal = createTargetDecalTexture('#00f0ff', '#ff1177', 'SPIN');
    this.blade = new THREE.Mesh(
      new THREE.BoxGeometry(len * 0.88, 2.5, 0.14),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: decal,
        emissive: 0x00aaff,
        emissiveIntensity: 0.25,
        metalness: 0.6,
        roughness: 0.2,
        side: THREE.DoubleSide,
      }),
    );
    const g = new THREE.Group();
    g.position.y = 2.4;
    g.add(this.blade);
    this.group.add(g);
    this.group.rotation.y = this.rot;
    toLocal(this.def.x, this.def.y, 0, this.group.position);
    this.addPort('in', 0, -2, 0, 1);
    this.addPort('out', 0, 2, 0, 1);
  }

  override onContact(_c: RAPIER.Collider, ball: Ball, started: boolean): void {
    if (!started) return;
    const v = ball.body.linvel();
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    const along = -v.x * s + v.y * c; // velocity component across the blade (local +y)
    const dir = along >= 0 ? 1 : -1;
    this.vel = dir * Math.min(60, Math.max(Math.abs(this.vel), ball.speed() * 0.4));
    ball.body.setLinvel({ x: v.x * 0.93, y: v.y * 0.93 }, true); // blade drag
  }

  override update(dt: number): void {
    if (Math.abs(this.vel) < 0.05) { this.vel = 0; return; }
    this.angle += this.vel * dt;
    this.vel *= Math.exp(-1.8 * dt);
    const revs = Math.floor(Math.abs(this.angle) / (2 * Math.PI));
    if (revs > this.revs) {
      this.revs = revs;
      this.ctx.bus.emit('ON_SPINNER_SPIN', { id: this.id, spins: revs });
    }
    this.blade.rotation.x = this.angle;
  }
}
