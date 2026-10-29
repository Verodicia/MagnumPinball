import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier2d-compat';
import type { Ball } from '../physics/Ball';
import { staticGroups } from '../physics/CollisionLayers';
import { Materials } from '../physics/Materials';
import { toLocal } from '../render/coords';
import { createTargetDecalTexture } from '../render/ProceduralTextures';
import { PlayfieldModule, type ModuleContext } from './PlayfieldModule';

interface Target {
  collider: RAPIER.Collider;
  mesh: THREE.Mesh;
  lampMat: THREE.MeshBasicMaterial;
  down: boolean;
  z: number;
}

const LABELS = ['L', 'O', 'C', 'K', '★'];

/**
 * Row of drop targets along local +y, faces toward local -x. params: count, spacing, targetLength.
 * Emits ON_SWITCH_HIT("<id>_<n>") per target and ON_TARGET_BANK_COMPLETE(id) when all are down.
 * Solenoid port "reset" raises them all.
 */
export class DropTargetBank extends PlayfieldModule {
  readonly type = 'DropTargetBank';
  private targets: Target[] = [];
  private completed = false;

  override mount(ctx: ModuleContext): void {
    super.mount(ctx);
    const count = Math.round(this.num('count', 3));
    const spacing = this.num('spacing', 3.4);
    const len = this.num('targetLength', 3.2);
    const thick = 0.8;
    this.solenoids.push('reset');
    const m = Materials.RubberHard;

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x3b4562,
      metalness: 0.5,
      roughness: 0.42,
      envMapIntensity: 0.12,
    });

    for (let i = 0; i < count; i++) {
      const c = this.toWorld(0, i * spacing);
      this.switches.push(`${this.id}_${i}`);
      const collider = this.claim(ctx.pw.world.createCollider(
        ctx.pw.R.ColliderDesc.cuboid(thick / 2, len / 2).setTranslation(c.x, c.y).setRotation(this.rot)
          .setFriction(m.friction).setRestitution(m.restitution)
          .setCollisionGroups(staticGroups(this.layer))
          .setActiveEvents(ctx.pw.R.ActiveEvents.COLLISION_EVENTS),
      ));

      const decal = createTargetDecalTexture('#ffd400', '#ff1144', LABELS[i % LABELS.length]);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: decal,
        emissive: 0xffaa00,
        emissiveIntensity: 0.08,
        roughness: 0.4,
        envMapIntensity: 0.1,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, 2.7, len), mat);
      mesh.rotation.y = this.rot;
      mesh.castShadow = true;
      this.group.add(mesh);
      toLocal(c.x, c.y, 1.35, mesh.position);

      // Indicator LED jewel in front of each drop target
      const lampPos = this.toWorld(-1.6, i * spacing);
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), lampMat);
      lamp.rotation.x = -Math.PI / 2;
      toLocal(lampPos.x, lampPos.y, 0.06, lamp.position);
      this.group.add(lamp);

      this.targets.push({ collider, mesh, lampMat, down: false, z: 1.35 });
    }

    // Metallic housing bracket behind the bank
    const mid = this.toWorld(1.1, ((count - 1) * spacing) / 2);
    const totalSpan = (count - 1) * spacing + len + 1.2;
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.1, totalSpan), frameMat);
    housing.rotation.y = this.rot;
    toLocal(mid.x, mid.y, 1.55, housing.position);
    housing.castShadow = true;
    this.group.add(housing);

    this.addPort('in', -2, ((count - 1) * spacing) / 2, 1, 0);
  }

  override onContact(c: RAPIER.Collider, ball: Ball, started: boolean): void {
    if (!started || ball.speed() < 15) return;
    const i = this.targets.findIndex((t) => t.collider === c);
    const t = this.targets[i];
    if (!t || t.down) return;
    t.down = true;
    t.collider.setEnabled(false);
    t.lampMat.color.setHex(0x00ff88);
    this.ctx.bus.emit('ON_SWITCH_HIT', { id: `${this.id}_${i}` });
    if (!this.completed && this.targets.every((x) => x.down)) {
      this.completed = true;
      this.ctx.bus.emit('ON_TARGET_BANK_COMPLETE', { id: this.id });
    }
  }

  get allDown(): boolean { return this.targets.every((t) => t.down); }

  override fire(port: string): void {
    if (port !== 'reset') return;
    for (const t of this.targets) {
      t.down = false;
      t.collider.setEnabled(true);
      t.lampMat.color.setHex(0xffaa00);
    }
    this.completed = false;
  }

  override update(dt: number): void {
    for (const t of this.targets) {
      const goal = t.down ? -1.4 : 1.35;
      t.z += Math.sign(goal - t.z) * Math.min(Math.abs(goal - t.z), 25 * dt);
      t.mesh.position.y = t.z;
    }
  }
}
