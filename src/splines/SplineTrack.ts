import * as THREE from 'three';
import type { PinballEventBus } from '../core/PinballEventBus';
import type { ElevationMapper } from '../physics/ElevationMapper';
import { staticGroups, type LayerId } from '../physics/CollisionLayers';
import type { LayerManager } from '../physics/LayerManager';
import { Materials, type MaterialName } from '../physics/Materials';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { toLocal } from '../render/coords';
import { PolyCurve, segFromArrays, type CubicSeg, type V3 } from './Bezier';
import type { SnapPortRegistry } from './SnapPorts';
import { ribbonGeometry, wallGeometry, wireGeometry } from './SplineMeshes';

export type SplineKind = 'wood' | 'ramp' | 'wireform';

/** JSON-serialisable spline: chained cubic Bézier segments, each 4 control points of [x, y, z]. */
export interface SplineDef {
  id: string;
  kind: SplineKind;
  layer: LayerId;
  /** Rail-to-rail distance (cm). 0 = a single guide wall along the curve. Use >= 5.4 for free-entry ramp mouths. */
  width: number;
  segments: number[][][];
  /** Snap the first control point/handle to this port id. */
  snapStart?: string;
  /** Snap the last control point/handle to this port id. */
  snapEnd?: string;
  /** Layer the ball is on before entering / after leaving (default 0). */
  entryLayer?: LayerId;
  exitLayer?: LayerId;
  style?: string;
  color?: string;
}

export interface TrackContext {
  pw: PhysicsWorld;
  layers: LayerManager;
  parent: THREE.Object3D;
  ports: SnapPortRegistry;
  elevation?: ElevationMapper;
  /** When given, ON_SWITCH_HIT("<spline>.entry" / "<spline>.exit") fires as balls pass the gates. */
  bus?: PinballEventBus;
}

const RAIL_MATERIAL: Record<SplineKind, MaterialName> = {
  wood: 'WoodPlayfield', ramp: 'PlasticRamp', wireform: 'SteelWire',
};

/** Pull the end control points onto snap ports. The port normal fixes the end tangent. */
export function applySnaps(segs: CubicSeg[], start?: { x: number; y: number; nx: number; ny: number }, end?: typeof start): void {
  const first = segs[0]!, last = segs[segs.length - 1]!;
  if (start) {
    const h = 0.35 * Math.hypot(first[3].x - start.x, first[3].y - start.y);
    first[0] = { x: start.x, y: start.y, z: first[0].z };
    first[1] = { x: start.x + start.nx * h, y: start.y + start.ny * h, z: first[1].z };
  }
  if (end) {
    const h = 0.35 * Math.hypot(end.x - last[0].x, end.y - last[0].y);
    last[3] = { x: end.x, y: end.y, z: last[3].z };
    last[2] = { x: end.x - end.nx * h, y: end.y - end.ny * h, z: last[2].z };
  }
}

/** Procedural track: rail colliders on the spline's layer, 3D meshes, and layer-transition gates. */
export class SplineTrack {
  readonly id: string;
  readonly curve: PolyCurve;
  /** Control points after snapping (what is actually built). */
  readonly segs: CubicSeg[];
  readonly railLines: V3[][] = [];
  readonly group = new THREE.Group();

  constructor(readonly def: SplineDef, ctx: TrackContext) {
    this.id = def.id;
    const segs = (this.segs = def.segments.map(segFromArrays));
    applySnaps(
      segs,
      def.snapStart ? ctx.ports.get(def.snapStart) : undefined,
      def.snapEnd ? ctx.ports.get(def.snapEnd) : undefined,
    );
    if ((def.snapStart && !ctx.ports.get(def.snapStart)) || (def.snapEnd && !ctx.ports.get(def.snapEnd))) {
      console.warn(`spline ${def.id}: unknown snap port`);
    }
    this.curve = new PolyCurve(segs);
    this.buildColliders(ctx);
    this.buildMeshes();
    ctx.parent.add(this.group);
    if (def.kind !== 'wood') this.buildGates(ctx);
    ctx.elevation?.addTrack(def.id, this.curve);
    if (ctx.bus) {
      const bus = ctx.bus;
      ctx.layers.transitionListeners.push((_ball, gate) => {
        if (gate.id === `${def.id}.entry` || gate.id === `${def.id}.exit`) bus.emit('ON_SWITCH_HIT', { id: gate.id });
      });
    }
  }

  private buildColliders(ctx: TrackContext): void {
    const { world, R } = ctx.pw;
    const m = Materials[RAIL_MATERIAL[this.def.kind]];
    const offs = this.def.width > 0 ? [this.def.width / 2, -this.def.width / 2] : [0];
    for (const o of offs) {
      const line = this.curve.offset(o);
      this.railLines.push(line);
      world.createCollider(
        R.ColliderDesc.polyline(new Float32Array(line.flatMap((p) => [p.x, p.y])))
          .setFriction(m.friction).setRestitution(m.restitution).setCollisionGroups(staticGroups(this.def.layer)),
      );
    }
  }

  private buildMeshes(): void {
    const { kind, width } = this.def;
    const [a, b] = this.railLines as [V3[], V3[] | undefined];
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.12 });

    if (kind === 'wood') {
      const mat = new THREE.MeshPhysicalMaterial({ color: 0x262d4d, roughness: 0.3, metalness: 0.35, clearcoat: 0.85, side: THREE.DoubleSide });
      for (const line of this.railLines) {
        this.group.add(new THREE.Mesh(wallGeometry(line, 0.7, 2.7), mat));
        this.group.add(new THREE.Mesh(wireGeometry(line, 0.2, 2.75), chrome));
      }
    } else if (kind === 'ramp' && b) {
      const deck = new THREE.MeshPhysicalMaterial({
        color: 0x11aaff,
        emissive: 0x004477,
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.48,
        roughness: 0.08,
        clearcoat: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.group.add(new THREE.Mesh(ribbonGeometry(a, b, -0.05), deck));

      const rail = new THREE.MeshPhysicalMaterial({
        color: 0x88eeff,
        transparent: true,
        opacity: 0.7,
        roughness: 0.12,
        clearcoat: 1,
        side: THREE.DoubleSide,
      });
      const neonEdge = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00f0ff,
        emissiveIntensity: 1.5,
        roughness: 0.2,
      });
      for (const line of this.railLines) {
        this.group.add(new THREE.Mesh(wallGeometry(line, 0.35, 1.65), rail));
        this.group.add(new THREE.Mesh(wireGeometry(line, 0.15, 1.7), neonEdge));
      }

      // Chrome support stanchions under elevated ramp sections
      const step = Math.max(1, Math.floor(a.length / 5));
      for (let i = step; i < a.length; i += step) {
        const pa = a[i]!, pb = b[i]!;
        const z = (pa.z + pb.z) / 2;
        if (z > 2.2) {
          for (const pt of [pa, pb]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, pt.z, 10), chrome);
            toLocal(pt.x, pt.y, pt.z / 2, post.position);
            this.group.add(post);
          }
        }
      }
    } else if (kind === 'wireform' && b) {
      for (const line of this.railLines) this.group.add(new THREE.Mesh(wireGeometry(line, 0.24, 0.25), chrome));
      const step = Math.max(1, Math.floor(a.length / 10));
      for (let i = 0; i < a.length; i += step) {
        this.group.add(new THREE.Mesh(wireGeometry([a[i]!, b[i]!], 0.14, 0.25), chrome));
      }
    }
    void width;
  }

  private buildGates(ctx: TrackContext): void {
    const d = this.def;
    const from = d.entryLayer ?? 0, to = d.exitLayer ?? 0;
    if (d.layer === from && d.layer === to) return;
    const L = this.curve.length;
    const hw = Math.max(d.width / 2 - 2 * 1.35, 0.1);
    const wide = d.width / 2 + 1.5;
    const gate = (id: string, s: number, f: LayerId, t: LayerId, dir: 1 | -1, trackId: string | null, halfW: number): void => {
      const c = this.curve.at(s);
      ctx.layers.addGate({
        id: `${d.id}.${id}`, x: c.p.x, y: c.p.y, halfW, halfH: 0.5,
        angle: Math.atan2(c.ty, c.tx) + Math.PI / 2,
        from: f, to: t, normal: { x: c.tx * dir, y: c.ty * dir }, trackId,
      });
    };
    gate('entry', Math.min(2, L * 0.1), from, d.layer, 1, d.id, hw);
    gate('mouth', 0.6, d.layer, from, -1, null, wide);
    gate('exit', L - 1.5, d.layer, to, 1, null, wide);
  }
}
