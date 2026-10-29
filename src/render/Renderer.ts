import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TABLE_H, TABLE_W, PLAYFIELD_INCLINE_DEG } from '../physics/PhysicsWorld';
import { toLocal } from './coords';
import type { Vec2 } from '../physics/Playfield';
import { flipperOutline } from '../physics/Flipper';
import type { TableThemeDef } from '../table/schema';
import {
  BOARD_CENTER_Y,
  BOARD_H,
  createArcadeDecalTexture,
  createBackglassTexture,
  createPlayfieldTexture,
} from './ProceduralTextures';

export type LayoutMode = 'mobile' | 'desktop';

export { toLocal };

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 1, 500);
  /** Tilted by the playfield incline; all table content is parented here. */
  readonly table = new THREE.Group();
  private mode: LayoutMode = 'desktop';
  private customTilt?: number;
  private playfieldMat!: THREE.MeshStandardMaterial;
  private railTrimMats: THREE.MeshStandardMaterial[] = [];
  private giStripMats: THREE.MeshBasicMaterial[] = [];

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);

    // Studio & arcade reflection environment so chrome balls, wireforms, and clearcoat shine
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envScene = new RoomEnvironment();
      this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
      this.scene.environmentIntensity = 0.45;
      envScene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose();
      });
      pmrem.dispose();
    } catch {
      // Fallback if WebGL context is constrained
    }

    this.scene.background = new THREE.Color(0x05060b);
    this.table.rotation.x = (PLAYFIELD_INCLINE_DEG * Math.PI) / 180;
    this.scene.add(this.table);

    // Lighting rig: ambient hemisphere + shadow-casting overhead key + neon arcade rim lights
    this.scene.add(new THREE.HemisphereLight(0xa8c0ff, 0x160f24, 0.65));

    const key = new THREE.DirectionalLight(0xfff5e6, 1.35);
    key.position.set(18, 130, -35);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -38;
    key.shadow.camera.right = 38;
    key.shadow.camera.top = 78;
    key.shadow.camera.bottom = -78;
    key.shadow.camera.near = 40;
    key.shadow.camera.far = 230;
    key.shadow.bias = -0.0006;
    this.scene.add(key);

    const cyanRim = new THREE.DirectionalLight(0x00d8ff, 0.45);
    cyanRim.position.set(-70, 60, -20);
    this.scene.add(cyanRim);

    const magentaRim = new THREE.DirectionalLight(0xff2288, 0.4);
    magentaRim.position.set(70, 60, -30);
    this.scene.add(magentaRim);

    this.buildCabinetAndPlayfield();
    this.setLayout('desktop');
  }

  private buildCabinetAndPlayfield(): void {
    // Playfield board spans y = -14..122 (BOARD_H = 136 cm) so it completely contains the top arch (y=118) and shooter lane (y=-14)
    const playfieldTex = createPlayfieldTexture();
    this.playfieldMat = new THREE.MeshStandardMaterial({
      color: playfieldTex ? 0xffffff : 0x161936,
      map: playfieldTex,
      roughness: 0.62,
      metalness: 0.05,
      envMapIntensity: 0.08,
    });
    const field = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_W, BOARD_H), this.playfieldMat);
    field.rotation.x = -Math.PI / 2;
    toLocal(TABLE_W / 2, BOARD_CENTER_Y, 0, field.position);
    field.receiveShadow = true;
    this.table.add(field);

    // Outer Cabinet Side Walls & Brushed Gunmetal Side Rails (spanning y = -15..123)
    const cabMat = new THREE.MeshStandardMaterial({
      color: 0x101426,
      roughness: 0.55,
      metalness: 0.2,
      envMapIntensity: 0.1,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0x6c7a9c,
      metalness: 0.72,
      roughness: 0.32,
      envMapIntensity: 0.2,
    });
    this.railTrimMats = [chromeMat];
    this.giStripMats = [];

    const wallLen = BOARD_H + 2;
    const wallH = 5.2;
    const centerZ = TABLE_H / 2 - BOARD_CENTER_Y; // +2
    for (const side of [-1, 1] as const) {
      const x = side * (TABLE_W / 2 + 1.1);
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(1.8, wallH, wallLen), cabMat);
      sideWall.position.set(x, wallH / 2 - 0.2, centerZ);
      sideWall.castShadow = true;
      sideWall.receiveShadow = true;
      this.table.add(sideWall);

      const railTrim = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.45, wallLen + 0.4), chromeMat);
      railTrim.position.set(x, wallH - 0.1, centerZ);
      this.table.add(railTrim);

      // Interior cabinet GI neon strip running along the wall
      const giColor = side < 0 ? 0x00d8ff : 0xff2288;
      const giMat = new THREE.MeshBasicMaterial({ color: giColor });
      this.giStripMats.push(giMat);
      const giStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.24, BOARD_H - 6),
        giMat,
      );
      giStrip.position.set(side * (TABLE_W / 2 - 0.12), 2.9, centerZ);
      this.table.add(giStrip);
    }

    // Upper Arch Corner Spandrels (fills the corners outside the r=28 top arch between y=92 and y=122)
    for (const side of [-1, 1] as const) {
      const spandrelShape = new THREE.Shape();
      const r = 28.35;
      if (side < 0) {
        spandrelShape.moveTo(0, 90);
        spandrelShape.lineTo(0, 122);
        spandrelShape.lineTo(28, 122);
        for (let i = 0; i <= 20; i++) {
          const a = Math.PI / 2 + (Math.PI / 2) * (i / 20);
          spandrelShape.lineTo(28 + r * Math.cos(a), 90 + r * Math.sin(a));
        }
      } else {
        spandrelShape.moveTo(56, 90);
        for (let i = 0; i <= 20; i++) {
          const a = (Math.PI / 2) * (i / 20);
          spandrelShape.lineTo(28 + r * Math.cos(a), 90 + r * Math.sin(a));
        }
        spandrelShape.lineTo(28, 122);
        spandrelShape.lineTo(56, 122);
      }
      spandrelShape.closePath();
      const spGeo = new THREE.ExtrudeGeometry(spandrelShape, { depth: 3.1, bevelEnabled: false });
      spGeo.rotateX(-Math.PI / 2);
      const o = toLocal(0, 0, 0);
      spGeo.translate(o.x, 0, o.z);
      const spMesh = new THREE.Mesh(spGeo, cabMat);
      this.table.add(spMesh);
    }

    // Front Chrome Lockbar at bottom of cabinet (y = -15)
    const lockbar = new THREE.Mesh(new THREE.BoxGeometry(TABLE_W + 4.0, 2.2, 2.6), chromeMat);
    toLocal(TABLE_W / 2, -15, 1.4, lockbar.position);
    this.table.add(lockbar);

    // Lower Playfield Apron Housing (below the drain & under the left/right inlane guides)
    const apronGroup = new THREE.Group();
    const apronMat = new THREE.MeshStandardMaterial({ color: 0x101528, metalness: 0.45, roughness: 0.4, envMapIntensity: 0.12 });

    // Bottom drain deck (y = -14..-1, x = 0..51.8)
    const apronW = 51.4;
    const apronD = 12.0;
    const apronBody = new THREE.Mesh(new THREE.BoxGeometry(apronW, 1.5, apronD), apronMat);
    toLocal(apronW / 2 + 0.2, -7.8, 0.75, apronBody.position);
    apronGroup.add(apronBody);

    // Glowing neon accent bar across the drain deck
    const apronNeon = new THREE.Mesh(
      new THREE.BoxGeometry(apronW - 2, 0.25, 0.35),
      new THREE.MeshBasicMaterial({ color: 0x00ff99 }),
    );
    toLocal(apronW / 2 + 0.2, -1.8, 1.6, apronNeon.position);
    apronGroup.add(apronNeon);

    // Printed Instruction & Score Rule Cards on Left and Right of Apron Deck
    const cardTexL = createArcadeDecalTexture('SKILL SHOT', '#00f0ff', 'SHOOT LEFT RAMP +50K');
    const cardTexR = createArcadeDecalTexture('MULTIBALL', '#ff2288', 'DROP TARGETS LIGHT LOCK');
    const cardMatL = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: cardTexL,
      emissive: 0x00d8ff,
      emissiveMap: cardTexL,
      emissiveIntensity: 0.65,
      roughness: 0.3,
    });
    const cardMatR = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: cardTexR,
      emissive: 0xff2288,
      emissiveMap: cardTexR,
      emissiveIntensity: 0.65,
      roughness: 0.3,
    });
    const cardL = new THREE.Mesh(new THREE.PlaneGeometry(18, 8.2), cardMatL);
    cardL.rotation.x = -Math.PI / 2;
    toLocal(11.5, -7.8, 1.55, cardL.position);
    apronGroup.add(cardL);

    const cardR = new THREE.Mesh(new THREE.PlaneGeometry(18, 8.2), cardMatR);
    cardR.rotation.x = -Math.PI / 2;
    toLocal(40.5, -7.8, 1.55, cardR.position);
    apronGroup.add(cardR);

    this.table.add(apronGroup);

    // Illuminated Backbox / Translite Header positioned cleanly BEHIND the y=118 top arch (at y = 123.5)
    const backglassTex = createBackglassTexture();
    const backboxGroup = new THREE.Group();
    const backZ = TABLE_H / 2 - 123.5; // -67.5 (well behind the top arch at z = -62)

    const backFrame = new THREE.Mesh(
      new THREE.BoxGeometry(TABLE_W + 3.8, 15, 2.2),
      cabMat,
    );
    backFrame.position.set(0, 7.5, backZ - 1.2);
    backboxGroup.add(backFrame);

    const translite = new THREE.Mesh(
      new THREE.PlaneGeometry(TABLE_W + 0.6, 12.2),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: backglassTex,
        emissive: 0xffffff,
        emissiveMap: backglassTex,
        emissiveIntensity: 0.65,
        roughness: 0.2,
      }),
    );
    translite.position.set(0, 7.8, backZ);
    backboxGroup.add(translite);

    const topTrim = new THREE.Mesh(new THREE.BoxGeometry(TABLE_W + 4.0, 0.7, 2.5), chromeMat);
    topTrim.position.set(0, 15.1, backZ - 1.2);
    backboxGroup.add(topTrim);

    this.table.add(backboxGroup);
  }

  /** Builds 3D playfield walls with dark clearcoated wood base and polished chrome top rail cap. */
  addWallMesh(pts: Vec2[], color = 0x232946, height = 3, thickness = 0.65, parent: THREE.Object3D = this.table): void {
    const baseMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.45,
      metalness: 0.3,
      envMapIntensity: 0.12,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x6c7a9c,
      metalness: 0.7,
      roughness: 0.34,
      envMapIntensity: 0.18,
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-4) continue;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;

      const m = new THREE.Mesh(new THREE.BoxGeometry(len + thickness * 0.5, height - 0.35, thickness), baseMat);
      toLocal(cx, cy, (height - 0.35) / 2, m.position);
      m.rotation.y = angle;
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(len + thickness * 0.6, 0.38, thickness * 1.15), capMat);
      toLocal(cx, cy, height - 0.15, cap.position);
      cap.rotation.y = angle;
      parent.add(cap);
    }
  }

  /** Applies a live table theme to the playfield, cabinet trim, and GI lighting without a full page reload. */
  applyTheme(theme?: TableThemeDef): void {
    if (!this.playfieldMat) return;
    const newTex = createPlayfieldTexture(theme, () => {
      if (this.playfieldMat) this.playfieldMat.needsUpdate = true;
    });
    if (newTex) {
      this.playfieldMat.map = newTex;
      this.playfieldMat.needsUpdate = true;
    }

    // Cabinet trim colors
    const trim = theme?.cabinetTrim ?? 'chrome';
    let trimHex = 0x6c7a9c, metalness = 0.72, roughness = 0.32;
    if (trim === 'brass') { trimHex = 0xd4a040; metalness = 0.88; roughness = 0.28; }
    else if (trim === 'black') { trimHex = 0x181a24; metalness = 0.4; roughness = 0.5; }
    else if (trim === 'cyan') { trimHex = 0x00d8ff; metalness = 0.7; roughness = 0.25; }
    else if (trim === 'magenta') { trimHex = 0xff2288; metalness = 0.7; roughness = 0.25; }

    for (const m of this.railTrimMats) {
      m.color.setHex(trimHex);
      m.metalness = metalness;
      m.roughness = roughness;
    }

    // GI Neon strip accents
    if (this.giStripMats.length >= 2) {
      const leftCol = theme?.primaryAccent ? new THREE.Color(theme.primaryAccent).getHex() : 0x00d8ff;
      const rightCol = theme?.secondaryAccent ? new THREE.Color(theme.secondaryAccent).getHex() : 0xff2288;
      this.giStripMats[0]?.color.setHex(leftCol);
      this.giStripMats[1]?.color.setHex(rightCol);
    }
  }

  /** High-detail 3D Flipper mesh: customizable molded composite body, styled rubber band, and illuminated pivot cap. */
  createFlipperMesh(
    side: 'left' | 'right',
    length: number,
    r0: number,
    r1: number,
    parent: THREE.Object3D = this.table,
    style = 'classic-red',
    customColor?: string,
  ): THREE.Group {
    let pts = flipperOutline(length, r0, r1);
    if (side === 'right') pts = pts.map(([x, y]): [number, number] => [-x, y]).reverse();

    const shape = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();

    const rubberGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 1.5,
      bevelEnabled: true,
      bevelSize: 0.14,
      bevelThickness: 0.14,
      bevelSegments: 2,
    });
    rubberGeo.rotateX(-Math.PI / 2);
    rubberGeo.translate(0, 0.35, 0);

    const rubberHex = style === 'neon-cyan' ? 0x00e5ff
      : style === 'hot-amber' ? 0xff9900
      : style === 'emerald' ? 0x00ff88
      : style === 'chrome' ? 0x2d3240
      : (customColor ? new THREE.Color(customColor).getHex() : 0xff1e38);

    const rubberMat = new THREE.MeshStandardMaterial({
      color: rubberHex,
      emissive: rubberHex,
      emissiveIntensity: style === 'chrome' ? 0.05 : 0.42,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    const rubberMesh = new THREE.Mesh(rubberGeo, rubberMat);
    rubberMesh.castShadow = true;

    const bodyGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 2.3,
      bevelEnabled: false,
    });
    bodyGeo.rotateX(-Math.PI / 2);

    const bodyHex = style === 'neon-cyan' ? 0x0e111d
      : style === 'chrome' ? 0xecf0f8
      : 0xe2e8f5;
    const bodyMetal = style === 'chrome' ? 0.9 : 0.1;
    const bodyRough = style === 'chrome' ? 0.15 : 0.35;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyHex,
      roughness: bodyRough,
      metalness: bodyMetal,
      envMapIntensity: style === 'chrome' ? 0.4 : 0.12,
      side: THREE.DoubleSide,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.scale.set(0.92, 1, 0.92);
    bodyMesh.castShadow = true;

    const capGeo = new THREE.CylinderGeometry(r0 * 0.65, r0 * 0.72, 2.65, 20);
    const capHex = style === 'neon-cyan' ? 0x00f6ff : style === 'hot-amber' ? 0xffb000 : 0x00e5ff;
    const capMat = new THREE.MeshStandardMaterial({
      color: capHex,
      emissive: capHex,
      emissiveIntensity: 0.55,
      metalness: 0.5,
      roughness: 0.25,
      envMapIntensity: 0.2,
    });
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.position.y = 1.35;

    const g = new THREE.Group();
    g.add(rubberMesh, bodyMesh, capMesh);
    parent.add(g);
    return g;
  }

  /** Detailed Plunger assembly: chrome shooter rod, coiled spring rings, and red rubber impact tip. */
  createPlungerMesh(parent: THREE.Object3D = this.table): THREE.Mesh {
    const rodMat = new THREE.MeshStandardMaterial({ color: 0xd8dee9, metalness: 0.9, roughness: 0.18, envMapIntensity: 0.4 });
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 12, 16), rodMat);
    root.geometry.rotateX(Math.PI / 2);

    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.55, 1.6, 20),
      new THREE.MeshStandardMaterial({ color: 0xff2233, emissive: 0x330008, roughness: 0.4 }),
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = -5.4;
    root.add(tip);

    const washer = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75, 1.75, 0.4, 20),
      rodMat,
    );
    washer.rotation.x = Math.PI / 2;
    washer.position.z = -4.4;
    root.add(washer);

    const springMat = new THREE.MeshStandardMaterial({ color: 0xffb833, metalness: 0.8, roughness: 0.25, envMapIntensity: 0.3 });
    for (let i = 0; i < 8; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.16, 8, 20), springMat);
      coil.position.z = -3.4 + i * 1.15;
      root.add(coil);
    }

    parent.add(root);
    return root;
  }

  /** Pointer position (client px) -> physics coordinates on the playfield plane, or null if off-table. */
  pickPlayfield(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    this.table.updateMatrixWorld(true);
    const inv = this.table.matrixWorld.clone().invert();
    const o = ray.ray.origin.clone().applyMatrix4(inv);
    const d = ray.ray.direction.clone().transformDirection(inv);
    if (Math.abs(d.y) < 1e-6) return null;
    const t = -o.y / d.y;
    if (t < 0) return null;
    const lx = o.x + d.x * t, lz = o.z + d.z * t;
    return { x: lx + TABLE_W / 2, y: TABLE_H / 2 - lz };
  }

  /** Portrait: tall overhead-angled framing. Desktop: wider, more angled view. */
  setLayout(mode: LayoutMode): void {
    this.mode = mode;
    this.resize();
  }

  setCameraAngle(tiltDeg: number): void {
    this.customTilt = tiltDeg;
    this.resize();
  }

  getCameraAngle(): number {
    return this.customTilt ?? (this.mode === 'mobile' ? 78 : 62);
  }

  resize(): void {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;

    // Fit the full table (including top arch y=118 and lower apron y=-12) inside the view.
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const tilt = this.customTilt ?? (this.mode === 'mobile' ? 78 : 62); // degrees above horizon
    const needH = BOARD_H * 0.96 * Math.sin(THREE.MathUtils.degToRad(tilt)) + 10;
    const needW = TABLE_W * 1.12;
    const distV = needH / 2 / Math.tan(fov / 2);
    const distW = needW / 2 / (Math.tan(fov / 2) * this.camera.aspect);
    const dist = Math.max(distV, distW);
    const t = THREE.MathUtils.degToRad(tilt);
    this.camera.position.set(0, Math.sin(t) * dist, Math.cos(t) * dist);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
