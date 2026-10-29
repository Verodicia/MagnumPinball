import type RAPIER from '@dimforge/rapier2d-compat';
import type { PinballEventBus } from '../core/PinballEventBus';
import { LAYER_0_MAIN, LAYER_1_RAMP, LAYER_2_WIREFORM, LAYER_3_SUBWAY, groups, staticGroups } from './CollisionLayers';
import { Materials, type MaterialName } from './Materials';
import { TABLE_W, type PhysicsWorld } from './PhysicsWorld';

export type Vec2 = { x: number; y: number };

export const LANE_DIVIDER_X = 51.8;
export const LANE_CENTER_X = (LANE_DIVIDER_X + TABLE_W) / 2;
/** Shooter lane extends below the table so the plunger can be pulled back. */
export const LANE_DEPTH = 14;
export const BALL_START = { x: LANE_CENTER_X, y: 1.45 };
const ARC_CY = 90;
const ARC_R = TABLE_W / 2;

function arc(): Vec2[] {
  const pts: Vec2[] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (Math.PI * i) / n;
    pts.push({ x: TABLE_W / 2 + ARC_R * Math.cos(a), y: ARC_CY + ARC_R * Math.sin(a) });
  }
  return pts;
}

/** Wall polylines (physics space) so the renderer can build matching meshes. */
export const WALL_POLYLINES: Array<{ pts: Vec2[]; material: MaterialName }> = [
  // Outer shell: left wall -> top arch -> right wall -> lane floor -> lane divider
  {
    material: 'WoodPlayfield',
    pts: [{ x: 0, y: 2 }, { x: 0, y: ARC_CY }, ...arc().slice(1), { x: TABLE_W, y: -LANE_DEPTH }, { x: LANE_DIVIDER_X, y: -LANE_DEPTH }, { x: LANE_DIVIDER_X, y: 84 }],
  },
  // Slingshot-less inlane guides leading to the flipper gap (flippers arrive in Step 3)
  // Guides lie on the tangent line of the flipper pivot caps (pivots (16.5,11.5) / (35.3,11.5), r=1.5) but stop ~2 cm short so a raised flipper never hits the guide end and no ball-trapping notch forms.
  { material: 'RubberHard', pts: [{ x: 0, y: 30.12 }, { x: 16.0, y: 14.12 }] },
  { material: 'RubberHard', pts: [{ x: LANE_DIVIDER_X, y: 30.12 }, { x: 35.8, y: 14.12 }] },
];

/** Lane exit gate: one-way flap stopping the ball falling back into the shooter lane. */
export const LANE_EXIT = { y: 86 };

export class Playfield {
  drainSensor!: RAPIER.Collider;

  constructor(private pw: PhysicsWorld, private bus: PinballEventBus) {
    this.build();
    pw.collisionListeners.push(this.onCollision);
  }

  private build(): void {
    const { world, R } = this.pw;
    for (const w of WALL_POLYLINES) {
      const m = Materials[w.material];
      const verts = new Float32Array(w.pts.flatMap((p) => [p.x, p.y]));
      world.createCollider(
        R.ColliderDesc.polyline(verts).setFriction(m.friction).setRestitution(m.restitution).setCollisionGroups(staticGroups(0)),
      );
    }
    // Safety floor below the drain so nothing falls forever.
    world.createCollider(
      R.ColliderDesc.cuboid(LANE_DIVIDER_X / 2, 1).setTranslation(LANE_DIVIDER_X / 2, -8).setCollisionGroups(
        groups(LAYER_0_MAIN | LAYER_1_RAMP | LAYER_2_WIREFORM | LAYER_3_SUBWAY, 0xf),
      ),
    );
    // Drain sensor spanning the playfield below the flippers; sees balls on any layer.
    this.drainSensor = world.createCollider(
      R.ColliderDesc.cuboid((LANE_DIVIDER_X - 1.2) / 2, 2.5)
        .setTranslation((LANE_DIVIDER_X - 1.2) / 2, -1)
        .setSensor(true)
        .setCollisionGroups(groups(0xf, 0xf))
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
    );
  }

  private onCollision = (h1: number, h2: number, started: boolean): void => {
    if (started && (h1 === this.drainSensor.handle || h2 === this.drainSensor.handle)) {
      this.bus.emit('ON_BALL_DRAIN', {});
    }
  };
}
