import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier2d-compat';
import { staticGroups } from '../physics/CollisionLayers';
import { Materials } from '../physics/Materials';
import { toLocal } from '../render/coords';
import { PlayfieldModule, type ModuleContext } from './PlayfieldModule';

const DEG = Math.PI / 180;

/**
 * One-way hinged flap. The pivot is at (x, y); the flap extends along local +x and rests against a stop
 * (angle 0). It swings open toward `openDir` (+1 = CCW, -1 = CW) when pushed from that side and is
 * blocked from the other. params: length, openDeg, openDir, thickness.
 */
export class Gate extends PlayfieldModule {
  readonly type = 'Gate';
  private body!: RAPIER.RigidBody;
  private mesh!: THREE.Mesh;
  private dir = 1;
  private restAngle = 0;

  override mount(ctx: ModuleContext): void {
    super.mount(ctx);
    const { R, world } = ctx.pw;
    const len = this.num('length', 4.2), thick = this.num('thickness', 0.35);
    const open = this.num('openDeg', 80) * DEG;
    this.dir = this.num('openDir', 1) >= 0 ? 1 : -1;
    this.restAngle = this.rot;
    const pivot = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(this.def.x, this.def.y).setRotation(this.rot));
    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(this.def.x, this.def.y).setRotation(this.rot)
        .setGravityScale(0).setAngularDamping(4).setCcdEnabled(true),
    );
    const m = Materials.SteelWire;
    this.colliders.push(world.createCollider(
      R.ColliderDesc.cuboid(len / 2, thick / 2).setTranslation(len / 2, 0)
        .setDensity(0.004).setFriction(m.friction).setRestitution(0.1).setCollisionGroups(staticGroups(this.layer)),
      this.body,
    ));
    const joint = world.createImpulseJoint(R.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }), pivot, this.body, true) as RAPIER.RevoluteImpulseJoint;
    // Pivot body is rotated like the flap, so the joint angle is relative to the rest pose (no angle wrapping).
    joint.setLimits(Math.min(0, this.dir * open), Math.max(0, this.dir * open));

    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.9, thick),
      new THREE.MeshStandardMaterial({ color: 0xcfd3da, metalness: 1, roughness: 0.25 }),
    );
    this.mesh.geometry.translate(len / 2, 0, 0);
    this.group.add(this.mesh);
    toLocal(this.def.x, this.def.y, 0.8, this.group.position);
    this.addPort('pivot', 0, 0, 0, 1);
  }

  /** Current opening in degrees (0 = closed). */
  get openDegrees(): number {
    return Math.abs(this.angle()) / DEG;
  }

  /** Opening angle relative to the rest pose, wrapped to (-pi, pi]. */
  private angle(): number {
    let a = this.body.rotation() - this.restAngle;
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
  }

  override update(_dt: number): void {
    // Light return spring so the flap closes again once the ball has passed.
    const a = this.angle();
    this.body.resetTorques(true);
    this.body.addTorque(-a * 60, true);
    this.mesh.rotation.y = this.body.rotation();
  }

  override dispose(): void {
    this.ctx.pw.world.removeRigidBody(this.body);
    super.dispose();
  }
}
