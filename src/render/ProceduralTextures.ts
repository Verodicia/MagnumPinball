import * as THREE from 'three';
import type { TableThemeDef } from '../table/schema';

const isBrowser = typeof document !== 'undefined';

export const BOARD_Y_MIN = -14;
export const BOARD_Y_MAX = 122;
export const BOARD_H = BOARD_Y_MAX - BOARD_Y_MIN; // 136 cm
export const BOARD_CENTER_Y = (BOARD_Y_MIN + BOARD_Y_MAX) / 2; // 54 cm

export interface ThemePresetConfig {
  bgColors: [string, string, string, string, string];
  primary: string;
  secondary: string;
  tertiary: string;
  centerTitle: string;
  archTitle: string;
  isWood?: boolean;
}

export const THEME_PRESETS: Record<string, ThemePresetConfig> = {
  hyperdrive: {
    bgColors: ['#060816', '#0b0f26', '#110d28', '#0c0a20', '#060711'],
    primary: '#00f0ff',
    secondary: '#ff2288',
    tertiary: '#ffcc00',
    centerTitle: 'MAGNUM',
    archTitle: '★  ORBIT LOOP · BONUS MULTIPLIER LANES  ★',
  },
  cyberpunk: {
    bgColors: ['#080712', '#120921', '#1a0a24', '#11081e', '#07060e'],
    primary: '#ffe600',
    secondary: '#ff006e',
    tertiary: '#00f5d4',
    centerTitle: 'NIGHT CITY',
    archTitle: '★  HIGH TECH · LOW LIFE · CYBER SPEED  ★',
  },
  solar: {
    bgColors: ['#0e0503', '#1c0a05', '#2d0f07', '#190804', '#090302'],
    primary: '#ff9e00',
    secondary: '#ff0054',
    tertiary: '#ffd60a',
    centerTitle: 'SUPERNOVA',
    archTitle: '★  CORONAL MASS EJECTION · SOLAR MULTIPLIER  ★',
  },
  matrix: {
    bgColors: ['#020a04', '#041609', '#072410', '#05190b', '#020803'],
    primary: '#00ff66',
    secondary: '#00f0ff',
    tertiary: '#99ff33',
    centerTitle: 'MAINFRAME',
    archTitle: '★  SYSTEM ACCESS · DATASTREAM MULTIPLIER  ★',
  },
  wood: {
    bgColors: ['#221207', '#381e0d', '#4d2c14', '#331a0b', '#1a0d05'],
    primary: '#ffcc66',
    secondary: '#e63946',
    tertiary: '#f4e8c1',
    centerTitle: 'GRAND PRIX',
    archTitle: '★  HIGH SCORE CHAMPIONSHIP · BONUS ROLLOVER  ★',
    isWood: true,
  },
};

export interface StyleOption {
  id: string;
  label: string;
}

export const COMPONENT_STYLES: Record<string, StyleOption[]> = {
  PopBumper: [
    { id: 'starburst', label: 'Starburst' },
    { id: 'turbine', label: 'Jet Turbine' },
    { id: 'hazard', label: 'Hazard' },
    { id: 'plasma', label: 'Plasma Core' },
    { id: 'crown', label: 'Arcade Crown' },
  ],
  Slingshot: [
    { id: 'lightning', label: 'Lightning' },
    { id: 'circuit', label: 'Circuit Matrix' },
    { id: 'hazard', label: 'Caution Stripes' },
    { id: 'grid', label: 'Synth Grid' },
    { id: 'classic', label: 'Classic Stripes' },
  ],
  Flipper: [
    { id: 'classic-red', label: 'Classic Red' },
    { id: 'neon-cyan', label: 'Neon Cyan' },
    { id: 'hot-amber', label: 'Blaze Amber' },
    { id: 'emerald', label: 'Cyber Emerald' },
    { id: 'chrome', label: 'Mirror Chrome' },
  ],
  LightInsert: [
    { id: 'circle', label: 'Round Jewel' },
    { id: 'arrow', label: 'Target Arrow' },
    { id: 'star', label: 'Bonus Star' },
    { id: 'diamond', label: 'Gem Diamond' },
    { id: 'shield', label: 'Shield Lamp' },
  ],
  StandupTarget: [
    { id: 'star', label: 'Star Target' },
    { id: 'bullseye', label: 'Bullseye' },
    { id: 'lightning', label: 'Voltage Bolt' },
    { id: 'skull', label: 'Hazard Skull' },
    { id: 'number', label: 'Point Value' },
  ],
  ArcadeDecal: [
    { id: 'plastic_card', label: 'Decal Placard' },
    { id: 'apron_left', label: 'Apron Wing L' },
    { id: 'apron_right', label: 'Apron Wing R' },
  ],
  Spline: [
    { id: 'neon-cyan', label: 'Cyan Glow' },
    { id: 'hot-magenta', label: 'Neon Magenta' },
    { id: 'polished-chrome', label: 'Chrome Steel' },
    { id: 'gold-brass', label: 'Polished Brass' },
    { id: 'smoke', label: 'Smoked Acrylic' },
  ],
  Theme: [
    { id: 'hyperdrive', label: 'Hyperdrive (Cyan/Pink)' },
    { id: 'cyberpunk', label: 'Cyberpunk (Yellow/Neon)' },
    { id: 'solar', label: 'Solar Flare (Gold/Orange)' },
    { id: 'matrix', label: 'Matrix (Terminal Green)' },
    { id: 'wood', label: 'Vintage Wood (Walnut/Brass)' },
  ],
};

export const COLOR_SWATCHES = [
  '#00f0ff', // Electric Cyan
  '#ff2288', // Hot Magenta
  '#ffcc00', // Arcade Amber / Gold
  '#00ff88', // Emerald Neon
  '#9933ff', // Plasma Purple
  '#ff3322', // High-Voltage Crimson
  '#ffffff', // Pure White
  '#ff8800', // Blazing Orange
];

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!isBrowser) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  return { canvas, ctx };
}

/**
 * Generates a high-resolution (1024x2486) pinball playfield texture spanning y = -14..122 cm:
 * - Zero clipping at the top arch (extends smoothly past y=118 to y=122)
 * - Rich upper-arch rollover lane graphics, outlane/inlane flipper graphics, and lower drain/apron art
 * - Full support for customizable Theme presets, custom accents, titles, and custom image background.
 */
export function createPlayfieldTexture(
  themeOrCb?: TableThemeDef | (() => void),
  maybeCb?: () => void,
): THREE.Texture | null {
  const theme: TableThemeDef | undefined = typeof themeOrCb === 'function' ? undefined : themeOrCb;
  const onUpdate = typeof themeOrCb === 'function' ? themeOrCb : maybeCb;

  const presetName = theme?.preset ?? 'hyperdrive';
  const cfg = THEME_PRESETS[presetName] ?? THEME_PRESETS['hyperdrive']!;
  const primaryCol = theme?.primaryAccent ?? cfg.primary;
  const secondaryCol = theme?.secondaryAccent ?? cfg.secondary;
  const tertiaryCol = cfg.tertiary;
  const centerTitle = theme?.centerTitle ?? cfg.centerTitle;
  const archTitle = theme?.archTitle ?? cfg.archTitle;
  const customImgUrl = theme?.customPlayfieldUrl ?? './assets/playfield_center.png';

  const c = makeCanvas(1024, 2486);
  if (!c) return null;
  const { canvas, ctx } = c;
  const W = canvas.width;
  const H = canvas.height;

  // Physics (x in 0..56, y in -14..122) -> Canvas pixel coordinates
  const px = (x: number) => (x / 56) * W;
  const py = (y: number) => ((BOARD_Y_MAX - y) / BOARD_H) * H;
  const pr = (cm: number) => (cm / 56) * W;

  const drawArtwork = (artImg?: HTMLImageElement) => {
    ctx.save();

    // 1. Deep arcade cabinet base gradient across entire -14..122 board
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, cfg.bgColors[0]);
    bgGrad.addColorStop(0.15, cfg.bgColors[1]);
    bgGrad.addColorStop(0.5, cfg.bgColors[2]);
    bgGrad.addColorStop(0.82, cfg.bgColors[3]);
    bgGrad.addColorStop(1, cfg.bgColors[4]);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // If wood theme, draw warm grain planks
    if (cfg.isWood) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 230, 180, 0.05)';
      ctx.lineWidth = 2;
      for (let x = 0; x < W; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 80) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Subtle tech grid overlay
      ctx.strokeStyle = primaryCol + '0a'; // ~4% opacity
      ctx.lineWidth = 1;
      const gridStep = 48;
      for (let x = 0; x < W; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += gridStep) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }

    // Radial nebula glows in upper arch, center, and flipper zone
    const drawNebula = (x: number, y: number, rCm: number, c0: string, c1: string) => {
      const g = ctx.createRadialGradient(px(x), py(y), 8, px(x), py(y), pr(rCm));
      g.addColorStop(0, c0);
      g.addColorStop(0.55, c1);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };
    drawNebula(26, 102, 24, primaryCol + '38', secondaryCol + '1a');
    drawNebula(28, 62, 28, secondaryCol + '38', primaryCol + '1f');
    drawNebula(26, 18, 22, tertiaryCol + '2e', secondaryCol + '14');

    // Blend external AI centerpiece artwork into the main playfield
    if (artImg) {
      ctx.save();
      ctx.globalAlpha = 0.54;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(artImg, 0, py(117), px(51.8), py(6) - py(117));
      const vig = ctx.createLinearGradient(0, py(42), 0, H);
      vig.addColorStop(0, 'rgba(7, 9, 24, 0.12)');
      vig.addColorStop(0.55, 'rgba(7, 9, 24, 0.58)');
      vig.addColorStop(1, 'rgba(6, 7, 18, 0.85)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Helper for glowing energy circuit traces
    const drawTrace = (pts: Array<[number, number]>, color: string, widthCm = 0.42) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = pr(widthCm);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(px(x), py(y)) : ctx.lineTo(px(x), py(y))));
      ctx.stroke();
      ctx.restore();
    };

    // 2. Top Arch Semicircle Track & Spandrel Corner Graphics (y = 90..120)
    {
      const cx = px(28), cy = py(90);
      // Outer arch glow tracks following the exact r = 28 semicircle
      for (const [rCm, col, wCm] of [
        [27.2, primaryCol + 'a6', 0.4],
        [26.0, secondaryCol + '80', 0.28],
        [24.2, tertiaryCol + '59', 0.2],
      ] as const) {
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = pr(wCm);
        ctx.beginPath();
        ctx.arc(cx, cy, pr(rCm), Math.PI, 0, false);
        ctx.stroke();
        ctx.restore();
      }

      // Upper Arch Rollover Lane Graphics (x = 12..34, y = 96..111)
      const laneX = [14, 21, 28];
      const laneLabels = ['H', 'Y', 'P'];
      for (let i = 0; i < laneX.length; i++) {
        const lx = px(laneX[i]!);
        ctx.fillStyle = primaryCol + '24';
        ctx.strokeStyle = i === 1 ? secondaryCol : primaryCol;
        ctx.lineWidth = pr(0.24);
        ctx.beginPath();
        ctx.roundRect(lx - pr(2.1), py(109), pr(4.2), py(97) - py(109), pr(1.8));
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${Math.round(pr(1.5))}px Impact, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(laneLabels[i]!, lx, py(106.5));
      }

      // Top Arch Banner Callout along y = 113.5
      ctx.save();
      ctx.fillStyle = primaryCol;
      ctx.font = `900 ${Math.round(pr(1.3))}px "Arial Black", Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = primaryCol;
      ctx.shadowBlur = 10;
      ctx.fillText(archTitle, px(25.5), py(113.2));
      ctx.restore();
    }

    // 3. Energy conduits connecting playfield zones
    drawTrace([[26, 38], [14, 44], [14, 54]], '#00ff99', 0.5);
    drawTrace([[26, 38], [34, 60]], '#00e5ff', 0.4);
    drawTrace([[26, 38], [48, 50]], '#ffcc00', 0.4);
    drawTrace([[34, 60], [44, 92]], '#ff2277', 0.45);
    drawTrace([[7.5, 24.5], [16.5, 13.5], [26, 22], [35.3, 13.5], [44.3, 24.5]], '#ff8800', 0.35);

    // 4. Left & Right Outlane / Inlane Graphics around the Flippers (y = 14..46)
    for (const side of ['left', 'right'] as const) {
      const isL = side === 'left';
      const outX = isL ? 2.2 : 49.6;
      const inX = isL ? 7.5 : 44.3;
      const col = isL ? '#00f0ff' : '#ff2288';

      // Outlane track channel
      drawTrace([[outX, 44], [outX, 20], [isL ? 13 : 38.8, 9.5]], col, 0.32);
      // Inlane track channel
      drawTrace([[inX, 34], [inX, 23], [isL ? 16.5 : 35.3, 13.5]], '#00ff88', 0.36);

      // Outlane callout badge
      ctx.save();
      ctx.translate(px(outX), py(32));
      ctx.rotate(isL ? -Math.PI / 2 : Math.PI / 2);
      ctx.fillStyle = col;
      ctx.font = `900 ${Math.round(pr(1.05))}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('OUTLANE · KICKBACK', 0, 0);
      ctx.restore();

      // Inlane callout badge
      ctx.save();
      ctx.translate(px(inX), py(29.5));
      ctx.fillStyle = '#00ff99';
      ctx.font = `900 ${Math.round(pr(1.0))}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('2,500', 0, 0);
      ctx.restore();
    }

    // 5. Center Reactor Medallion ("HYPERDRIVE") at (26, 38)
    {
      const cx = px(26), cy = py(38);
      const rOuter = pr(9.5);
      const rMid = pr(7.2);
      const rInner = pr(4.8);

      const medGrad = ctx.createRadialGradient(cx, cy, rInner * 0.2, cx, cy, rOuter);
      medGrad.addColorStop(0, '#ffea70');
      medGrad.addColorStop(0.35, '#ff3388');
      medGrad.addColorStop(0.7, '#221048');
      medGrad.addColorStop(1, 'rgba(10, 14, 36, 0)');
      ctx.fillStyle = medGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < 24; i++) {
        ctx.rotate((Math.PI * 2) / 24);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(0, 255, 220, 0.28)' : 'rgba(255, 50, 150, 0.22)';
        ctx.beginPath();
        ctx.moveTo(0, -rInner * 0.8);
        ctx.lineTo(pr(0.7), -rOuter * 0.95);
        ctx.lineTo(-pr(0.7), -rOuter * 0.95);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      ctx.lineWidth = pr(0.38);
      ctx.strokeStyle = primaryCol;
      ctx.beginPath();
      ctx.arc(cx, cy, rMid, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = pr(0.28);
      ctx.strokeStyle = secondaryCol;
      ctx.beginPath();
      ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#090b1a';
      ctx.strokeStyle = primaryCol;
      ctx.lineWidth = 4;
      ctx.fillRect(-pr(8.2), -pr(1.6), pr(16.4), pr(3.2));
      ctx.strokeRect(-pr(8.2), -pr(1.6), pr(16.4), pr(3.2));

      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${Math.round(pr(1.85))}px "Arial Black", Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = primaryCol;
      ctx.shadowBlur = 10;
      ctx.fillText(centerTitle, 0, 0);
      ctx.restore();
    }

    // 6. Multiplier Bonus Arc above flippers (y = 22..29)
    const mults: Array<{ x: number; y: number; label: string; col: string }> = [
      { x: 19, y: 24, label: '2X', col: '#00ff88' },
      { x: 23.5, y: 26.5, label: '3X', col: '#00e5ff' },
      { x: 28.5, y: 26.5, label: '5X', col: '#ffcc00' },
      { x: 33, y: 24, label: 'MAX', col: '#ff2277' },
    ];
    for (const m of mults) {
      const mx = px(m.x), my = py(m.y), mr = pr(1.65);
      ctx.fillStyle = '#0b0e1d';
      ctx.strokeStyle = m.col;
      ctx.lineWidth = pr(0.28);
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = m.col;
      ctx.font = `900 ${Math.round(pr(1.1))}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.label, mx, my);
    }

    // 7. Pop Bumper Cluster Starbursts at (30,72), (40,78), (34,60)
    const bumpers = [
      { x: 30, y: 72, c1: '#ffaa00', c2: '#ff2266' },
      { x: 40, y: 78, c1: '#00f0ff', c2: '#0066ff' },
      { x: 34, y: 60, c1: '#ff3399', c2: '#ffcc00' },
    ];
    for (const b of bumpers) {
      const bx = px(b.x), by = py(b.y);
      const rOut = pr(5.2), rIn = pr(3.0);
      ctx.save();
      ctx.translate(bx, by);
      const pts = 16;
      ctx.beginPath();
      for (let i = 0; i < pts * 2; i++) {
        const rad = i % 2 === 0 ? rOut : rIn;
        const a = (i * Math.PI) / pts;
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = b.c2;
      ctx.fill();
      ctx.lineWidth = pr(0.22);
      ctx.strokeStyle = b.c1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, pr(3.6), 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = pr(0.18);
      ctx.stroke();
      ctx.restore();
    }

    // 8. Left Ramp Entry Chevrons & Callout at (14, 42..54)
    {
      const rx = px(14);
      for (let i = 0; i < 4; i++) {
        const cy = py(40 + i * 3.2);
        const w = pr(2.8), h = pr(1.6);
        ctx.fillStyle = i % 2 === 0 ? '#00ff88' : '#00b8ff';
        ctx.beginPath();
        ctx.moveTo(rx, cy - h);
        ctx.lineTo(rx + w, cy + h * 0.4);
        ctx.lineTo(rx + w * 0.55, cy + h);
        ctx.lineTo(rx, cy - h * 0.15);
        ctx.lineTo(rx - w * 0.55, cy + h);
        ctx.lineTo(rx - w, cy + h * 0.4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.save();
      ctx.translate(px(14), py(36.5));
      ctx.fillStyle = '#00ff99';
      ctx.font = `900 ${Math.round(pr(1.25))}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('JACKPOT RAMP', 0, 0);
      ctx.restore();
    }

    // 9. Drop Target Bank Callout at (48.6, 50..57)
    {
      ctx.save();
      ctx.translate(px(45.2), py(53.4));
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#ffd400';
      ctx.font = `900 ${Math.round(pr(1.25))}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('DROP TARGETS · LIGHT LOCK', 0, 0);
      ctx.restore();
    }

    // 10. Lock Scoop Callout at (44, 92)
    {
      const sx = px(44), sy = py(92);
      const grad = ctx.createRadialGradient(sx, sy, pr(1.5), sx, sy, pr(5.5));
      grad.addColorStop(0, 'rgba(255, 40, 120, 0.7)');
      grad.addColorStop(0.6, 'rgba(255, 140, 0, 0.25)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, pr(5.5), 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(px(41), py(86.5));
      ctx.rotate(-0.45);
      ctx.fillStyle = '#ff4488';
      ctx.font = `900 ${Math.round(pr(1.2))}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('LOCK SCOOP', 0, 0);
      ctx.restore();
    }

    // 11. Shooter Lane Calibration Marks (x = 51.8..56, y = -12..84)
    {
      const lx = px(51.8), rx = px(56);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(lx, py(86), rx - lx, py(-14) - py(86));

      for (let y = -8; y <= 80; y += 4) {
        const yy = py(y);
        const major = y % 12 === 0;
        ctx.strokeStyle = major ? '#00f6ff' : 'rgba(255, 180, 0, 0.55)';
        ctx.lineWidth = major ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(lx + 4, yy);
        ctx.lineTo(lx + (major ? 22 : 12), yy);
        ctx.stroke();
      }
    }

    // 12. Below-Flippers Drain Chute, Shoot Again & Apron Graphics (y = -14..18)
    {
      const dx = px(25.9), dy = py(15.5);
      ctx.strokeStyle = 'rgba(255, 60, 80, 0.65)';
      ctx.lineWidth = pr(0.28);
      ctx.beginPath();
      ctx.arc(dx, dy, pr(3.8), 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ff4466';
      ctx.font = `900 ${Math.round(pr(1.05))}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SHOOT AGAIN', dx, dy);

      // Drain Chute Reactor Core below the flippers (x = 16..36, y = -12..8)
      const drainGrad = ctx.createRadialGradient(dx, py(2), pr(1), dx, py(2), pr(12));
      drainGrad.addColorStop(0, 'rgba(255, 40, 100, 0.45)');
      drainGrad.addColorStop(0.5, 'rgba(0, 220, 255, 0.2)');
      drainGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = drainGrad;
      ctx.beginPath();
      ctx.arc(dx, py(2), pr(12), 0, Math.PI * 2);
      ctx.fill();

      // Chevron arrows pointing up from drain saver post
      for (let i = 0; i < 3; i++) {
        const cy = py(1.5 + i * 2.4);
        ctx.strokeStyle = i % 2 === 0 ? '#00f0ff' : '#ff2288';
        ctx.lineWidth = pr(0.26);
        ctx.beginPath();
        ctx.moveTo(dx - pr(3.2), cy + pr(1.1));
        ctx.lineTo(dx, cy);
        ctx.lineTo(dx + pr(3.2), cy + pr(1.1));
        ctx.stroke();
      }

      ctx.fillStyle = primaryCol;
      ctx.font = `900 ${Math.round(pr(1.2))}px "Arial Black", Impact, sans-serif`;
      ctx.fillText(`${centerTitle} · 240HZ PHYSICS`, dx, py(-6.5));
    }

    ctx.restore();
  };

  drawArtwork();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;

  if (isBrowser && typeof Image !== 'undefined') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      drawArtwork(img);
      tex.needsUpdate = true;
      onUpdate?.();
    };
    img.src = customImgUrl;
  }

  return tex;
}

/**
 * Generates a vibrant backbox translite marquee texture (1024x512).
 */
export function createBackglassTexture(onUpdate?: () => void): THREE.Texture | null {
  const c = makeCanvas(1024, 512);
  if (!c) return null;
  const { canvas, ctx } = c;
  const W = canvas.width, H = canvas.height;

  const draw = (img?: HTMLImageElement) => {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#120428');
    g.addColorStop(0.5, '#081b3a');
    g.addColorStop(1, '#26052d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (img) {
      ctx.drawImage(img, 0, 0, W, H);
    } else {
      const sun = ctx.createRadialGradient(W / 2, H * 0.55, 20, W / 2, H * 0.55, 220);
      sun.addColorStop(0, '#fff4a0');
      sun.addColorStop(0.4, '#ff2288');
      sun.addColorStop(0.8, '#6600ff');
      sun.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 78px "Arial Black", Impact, sans-serif';
    ctx.shadowColor = '#00f6ff';
    ctx.shadowBlur = 24;
    ctx.strokeStyle = '#00f6ff';
    ctx.lineWidth = 8;
    ctx.strokeText('MAGNUM PINBALL', W / 2, H * 0.42);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('MAGNUM PINBALL', W / 2, H * 0.42);

    ctx.font = '700 28px Impact, sans-serif';
    ctx.fillStyle = '#ffcc00';
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur = 12;
    ctx.fillText('HIGH VOLTAGE 240Hz PINBALL ACTION', W / 2, H * 0.72);
    ctx.restore();
  };

  draw();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  if (isBrowser && typeof Image !== 'undefined') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      draw(img);
      tex.needsUpdate = true;
      onUpdate?.();
    };
    img.src = './assets/backglass_banner.png';
  }

  return tex;
}

/**
 * Generates a radial soft additive glow sprite texture for LEDs and flashers.
 */
let cachedGlowTex: THREE.Texture | null = null;
export function getGlowTexture(): THREE.Texture | null {
  if (cachedGlowTex) return cachedGlowTex;
  const c = makeCanvas(128, 128);
  if (!c) return null;
  const { canvas, ctx } = c;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.25, 'rgba(255, 255, 255, 0.75)');
  g.addColorStop(0.6, 'rgba(255, 255, 255, 0.2)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  cachedGlowTex = new THREE.CanvasTexture(canvas);
  return cachedGlowTex;
}

/**
 * Generates a detailed pop bumper cap texture with customizable style (starburst, turbine, hazard, plasma, crown).
 */
export function createBumperCapTexture(
  primaryColor: string,
  accentColor: string,
  label = '1000',
  style = 'starburst',
): THREE.Texture | null {
  const c = makeCanvas(256, 256);
  if (!c) return null;
  const { canvas, ctx } = c;
  const cx = 128, cy = 128;

  ctx.fillStyle = primaryColor;
  ctx.beginPath();
  ctx.arc(cx, cy, 126, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);

  if (style === 'turbine') {
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 44, Math.sin(a) * 44);
      ctx.quadraticCurveTo(Math.cos(a + 0.5) * 85, Math.sin(a + 0.5) * 85, Math.cos(a) * 115, Math.sin(a) * 115);
      ctx.stroke();
    }
  } else if (style === 'hazard') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 115, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#11131a';
    for (let i = -200; i < 250; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, -128);
      ctx.lineTo(i + 24, -128);
      ctx.lineTo(i - 20, 128);
      ctx.lineTo(i - 44, 128);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 115, 0, Math.PI * 2);
    ctx.stroke();
  } else if (style === 'plasma') {
    for (const [r, col, lw] of [[112, accentColor, 6], [82, primaryColor, 8], [58, '#ffffff', 4]] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (style === 'crown') {
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    const spikes = 8;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? 116 : 68;
      const a = (i * Math.PI) / spikes;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.stroke();
  } else {
    // Starburst default
    const spikes = 12;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? 114 : 62;
      const a = (i * Math.PI) / spikes;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = accentColor;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  // Inner dark jewel disc
  ctx.beginPath();
  ctx.arc(0, 0, 48, 0, Math.PI * 2);
  ctx.fillStyle = '#111424';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 2);

  for (const sx of [-78, 78]) {
    ctx.beginPath();
    ctx.arc(sx, 0, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#d8dde6';
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Faceted jewel lens texture for under-playfield LED LightInserts.
 */
export function createInsertJewelTexture(): THREE.Texture | null {
  const c = makeCanvas(256, 256);
  if (!c) return null;
  const { canvas, ctx } = c;
  const cx = 128, cy = 128;

  const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, 120);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#d8d8d8');
  g.addColorStop(0.85, '#777777');
  g.addColorStop(0.95, '#111111');
  g.addColorStop(1, '#050505');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 2;
  for (let i = -256; i < 512; i += 20) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, 256);
    ctx.lineTo(i + 256, 0);
    ctx.stroke();
  }

  for (const r of [40, 75, 108]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

/**
 * Target decal texture for DropTargetBank faces, StandupTargets, and Spinners.
 */
export function createTargetDecalTexture(bgColor: string, ringColor: string, symbol = '★'): THREE.Texture | null {
  const c = makeCanvas(128, 256);
  if (!c) return null;
  const { canvas, ctx } = c;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 128, 256);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 112, 240);

  const cx = 64, cy = 110;
  for (const [r, col] of [[44, ringColor], [30, '#ffffff'], [16, ringColor]] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  }

  ctx.fillStyle = '#111111';
  ctx.font = '900 32px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, cx, 200);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Custom printed arcade plastic texture for Slingshot covers with customizable style (lightning, circuit, hazard, grid, classic).
 */
export function createSlingshotPlasticTexture(
  primaryHex: string,
  secondaryHex: string,
  style = 'lightning',
): THREE.Texture | null {
  const c = makeCanvas(256, 256);
  if (!c) return null;
  const { canvas, ctx } = c;

  ctx.fillStyle = '#0d1228';
  ctx.fillRect(0, 0, 256, 256);

  ctx.save();
  if (style === 'circuit') {
    ctx.strokeStyle = primaryHex;
    ctx.lineWidth = 4;
    for (let x = 20; x < 256; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 100);
      ctx.lineTo(x + 20, 120);
      ctx.lineTo(x + 20, 256);
      ctx.stroke();
    }
    ctx.fillStyle = secondaryHex;
    for (let x = 20; x < 256; x += 40) {
      ctx.beginPath();
      ctx.arc(x, 100, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#0a0d18';
    ctx.fillRect(80, 80, 96, 96);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(80, 80, 96, 96);
  } else if (style === 'hazard') {
    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 22;
    for (let i = -256; i < 512; i += 48) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 256, 256);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(10, 14, 30, 0.85)';
    ctx.beginPath();
    ctx.arc(128, 128, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffe600';
    ctx.stroke();
  } else if (style === 'grid') {
    ctx.strokeStyle = secondaryHex;
    ctx.lineWidth = 3;
    for (let y = 120; y < 256; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    for (let x = -60; x <= 320; x += 36) {
      ctx.beginPath();
      ctx.moveTo(128, 110);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    // Neon retro sun
    const sunGrad = ctx.createLinearGradient(0, 40, 0, 120);
    sunGrad.addColorStop(0, '#fff4a0');
    sunGrad.addColorStop(1, primaryHex);
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(128, 115, 48, Math.PI, 0, false);
    ctx.fill();
  } else {
    // Lightning default
    ctx.strokeStyle = primaryHex;
    ctx.lineWidth = 14;
    for (let i = -256; i < 512; i += 44) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 256, 256);
      ctx.stroke();
    }

    ctx.strokeStyle = secondaryHex;
    ctx.lineWidth = 6;
    for (let i = -234; i < 512; i += 44) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 256, 256);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(10, 14, 30, 0.78)';
    ctx.beginPath();
    ctx.arc(128, 128, 72, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.moveTo(140, 75);
    ctx.lineTo(102, 132);
    ctx.lineTo(130, 132);
    ctx.lineTo(114, 182);
    ctx.lineTo(156, 122);
    ctx.lineTo(128, 122);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.08, 0.08);
  return tex;
}

/**
 * Generates a custom printed arcade plastic decal texture with neon border, circuit lines, and bold callout text.
 */
export function createArcadeDecalTexture(title: string, colorHex: string, subtitle = ''): THREE.Texture | null {
  const c = makeCanvas(512, 256);
  if (!c) return null;
  const { canvas, ctx } = c;

  const g = ctx.createLinearGradient(0, 0, 512, 256);
  g.addColorStop(0, '#0a0f26');
  g.addColorStop(0.5, '#151b3d');
  g.addColorStop(1, '#090d20');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);

  ctx.strokeStyle = 'rgba(0, 240, 255, 0.14)';
  ctx.lineWidth = 8;
  for (let i = -256; i < 768; i += 48) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 180, 256);
    ctx.stroke();
  }

  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, 492, 236);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, 468, 212);

  for (const [bx, by] of [[38, 38], [474, 38], [38, 218], [474, 218]] as const) {
    ctx.beginPath();
    ctx.arc(bx, by, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#d8e0ef';
    ctx.fill();
  }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = colorHex;
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 54px "Arial Black", Impact, sans-serif';
  ctx.fillText(title, 256, subtitle ? 108 : 128);

  if (subtitle) {
    ctx.fillStyle = colorHex;
    ctx.font = '700 28px Impact, sans-serif';
    ctx.fillText(subtitle, 256, 172);
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const thumbnailCache = new Map<string, string>();

/**
 * Renders a crisp 64x64 Data URL thumbnail for Sims-style visual swatch cards in the editor.
 */
export function createStyleThumbnail(
  type: string,
  style: string,
  primaryColor = '#00f0ff',
  secondaryColor = '#ff2288',
): string {
  const cacheKey = `${type}:${style}:${primaryColor}:${secondaryColor}`;
  const hit = thumbnailCache.get(cacheKey);
  if (hit) return hit;

  if (!isBrowser) {
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%23111422"/></svg>';
  }

  const c = makeCanvas(64, 64);
  if (!c) return '';
  const { canvas, ctx } = c;

  // Background card badge
  ctx.fillStyle = '#0c0e18';
  ctx.fillRect(0, 0, 64, 64);

  // Subtle border
  ctx.strokeStyle = '#1e243a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 1, 62, 62);

  const cx = 32, cy = 32;

  if (type === 'PopBumper') {
    // Outer base
    ctx.fillStyle = '#1e2538';
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();

    // Cap
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();

    if (style === 'turbine') {
      ctx.strokeStyle = secondaryColor;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
        ctx.quadraticCurveTo(cx + Math.cos(a + 0.6) * 16, cy + Math.sin(a + 0.6) * 16, cx + Math.cos(a) * 21, cy + Math.sin(a) * 21);
        ctx.stroke();
      }
    } else if (style === 'hazard') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 21, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#111111';
      for (let i = -30; i < 70; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 5, 0);
        ctx.lineTo(i - 4, 64);
        ctx.lineTo(i - 9, 64);
        ctx.fill();
      }
      ctx.restore();
    } else if (style === 'plasma') {
      for (const [r, col] of [[18, primaryColor], [13, secondaryColor], [7, '#ffffff']] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (style === 'crown') {
      ctx.fillStyle = secondaryColor;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const r = i % 2 === 0 ? 21 : 12;
        const a = (i * Math.PI) / 8;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // Starburst default
      ctx.fillStyle = secondaryColor;
      ctx.beginPath();
      for (let i = 0; i < 20; i++) {
        const r = i % 2 === 0 ? 21 : 11;
        const a = (i * Math.PI) / 10;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Center jewel dome
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'Slingshot') {
    // Triangular slingshot cover
    ctx.fillStyle = '#101426';
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(14, 12);
    ctx.lineTo(14, 52);
    ctx.lineTo(52, 38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = secondaryColor;
    if (style === 'circuit') {
      ctx.strokeStyle = secondaryColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(18, 22); ctx.lineTo(30, 22); ctx.lineTo(36, 32);
      ctx.moveTo(18, 42); ctx.lineTo(28, 42); ctx.lineTo(38, 36);
      ctx.stroke();
      ctx.fillRect(26, 28, 10, 10);
    } else if (style === 'hazard') {
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 2;
      for (let i = 16; i < 48; i += 6) {
        ctx.beginPath(); ctx.moveTo(i, 20); ctx.lineTo(i - 6, 44); ctx.stroke();
      }
    } else if (style === 'grid') {
      ctx.strokeStyle = secondaryColor;
      ctx.lineWidth = 1;
      for (let y = 20; y <= 45; y += 5) {
        ctx.beginPath(); ctx.moveTo(16, y); ctx.lineTo(44 - (y - 20) * 0.4, y); ctx.stroke();
      }
      ctx.fillStyle = '#ff2288';
      ctx.beginPath(); ctx.arc(28, 26, 7, Math.PI, 0); ctx.fill();
    } else {
      // Lightning default
      ctx.beginPath();
      ctx.moveTo(30, 18); ctx.lineTo(20, 32); ctx.lineTo(28, 32);
      ctx.lineTo(24, 46); ctx.lineTo(36, 28); ctx.lineTo(28, 28);
      ctx.closePath();
      ctx.fill();
    }
  } else if (type === 'Flipper') {
    // Flipper bat thumbnail
    const rubberCol = style === 'classic-red' ? '#ff2244'
      : style === 'neon-cyan' ? '#00e5ff'
      : style === 'hot-amber' ? '#ff9900'
      : style === 'emerald' ? '#00ff88'
      : style === 'chrome' ? '#444455' : primaryColor;
    const bodyCol = style === 'chrome' ? '#e8edf5' : style === 'neon-cyan' ? '#0a0d18' : '#e6ecf8';

    ctx.save();
    ctx.translate(18, 32);
    ctx.rotate(0.35);

    // Rubber outline
    ctx.fillStyle = rubberCol;
    ctx.beginPath();
    ctx.arc(0, 0, 12, Math.PI / 2, -Math.PI / 2);
    ctx.arc(28, 0, 5, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    // Molded bat body
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.arc(0, 0, 9.5, Math.PI / 2, -Math.PI / 2);
    ctx.arc(26, 0, 3.5, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    // Pivot cap
    ctx.fillStyle = style === 'neon-cyan' ? '#00f6ff' : '#ffaa00';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (type === 'LightInsert') {
    ctx.fillStyle = '#080a14';
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();

    // Metal ring
    ctx.strokeStyle = '#5a6480';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 23, 0, Math.PI * 2);
    ctx.stroke();

    // Glowing shape
    ctx.fillStyle = primaryColor;
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 8;
    if (style === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(32, 14); ctx.lineTo(46, 32); ctx.lineTo(38, 32);
      ctx.lineTo(38, 48); ctx.lineTo(26, 48); ctx.lineTo(26, 32);
      ctx.lineTo(18, 32); ctx.closePath();
      ctx.fill();
    } else if (style === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 17 : 8;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    } else if (style === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(32, 14); ctx.lineTo(48, 32); ctx.lineTo(32, 50); ctx.lineTo(16, 32);
      ctx.closePath();
      ctx.fill();
    } else if (style === 'shield') {
      ctx.beginPath();
      ctx.moveTo(18, 18); ctx.lineTo(46, 18); ctx.lineTo(46, 34);
      ctx.quadraticCurveTo(46, 48, 32, 52);
      ctx.quadraticCurveTo(18, 48, 18, 34);
      ctx.closePath();
      ctx.fill();
    } else {
      // Circle default
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'StandupTarget') {
    ctx.fillStyle = '#0f1424';
    ctx.fillRect(16, 10, 32, 44);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(17, 11, 30, 42);

    ctx.fillStyle = primaryColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 20px Impact, sans-serif';
    const sym = style === 'bullseye' ? '◎' : style === 'lightning' ? '⚡' : style === 'skull' ? '☠' : style === 'number' ? '100' : '★';
    ctx.fillText(sym, 32, 32);
  } else if (type === 'ArcadeDecal') {
    ctx.fillStyle = '#0f1426';
    ctx.fillRect(10, 16, 44, 32);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 16, 44, 32);
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(16, 22, 32, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(20, 34, 24, 4);
  } else if (type === 'Spline') {
    const col = style === 'neon-cyan' ? '#00e5ff' : style === 'hot-magenta' ? '#ff2288' : style === 'gold-brass' ? '#ffcc00' : style === 'smoke' ? '#556677' : '#d0d8e8';
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(12, 50);
    ctx.bezierCurveTo(20, 14, 44, 52, 52, 14);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, 50);
    ctx.bezierCurveTo(20, 14, 44, 52, 52, 14);
    ctx.stroke();
  } else if (type === 'Theme') {
    // Mini playfield board preview
    const cfg = THEME_PRESETS[style] ?? THEME_PRESETS['hyperdrive']!;
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, cfg.bgColors[0]);
    g.addColorStop(0.5, cfg.bgColors[2]);
    g.addColorStop(1, cfg.bgColors[4]);
    ctx.fillStyle = g;
    ctx.fillRect(6, 6, 52, 52);

    // Arch
    ctx.strokeStyle = cfg.primary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(32, 24, 18, Math.PI, 0, false);
    ctx.stroke();

    // Medallion
    ctx.fillStyle = cfg.secondary;
    ctx.beginPath();
    ctx.arc(32, 36, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = cfg.tertiary;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  const url = canvas.toDataURL('image/png');
  thumbnailCache.set(cacheKey, url);
  return url;
}
