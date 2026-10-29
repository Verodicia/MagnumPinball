import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { FixedStepLoop, PHYSICS_HZ } from '../core/FixedStepLoop';
import { InputManager, type TableControls } from '../input/InputManager';
import { GRAVITY_CM_S2 } from '../physics/PhysicsWorld';
import type { Renderer } from '../render/Renderer';
import type { TableDef } from '../table/schema';
import { TableRuntime } from '../table/TableRuntime';
import type { LayoutShell } from '../ui/LayoutShell';

export type Mode = 'play' | 'edit';

const $ = (id: string): HTMLElement => document.getElementById(id)!;

/** Owns the loop, audio, input and the current TableRuntime; rebuilds the runtime from a TableDef on demand. */
export class Game {
  readonly audio = new AudioEngine();
  readonly input: InputManager;
  readonly loop: FixedStepLoop;
  /** Editor overlays (not part of the runtime, so they survive rebuilds). */
  readonly gizmos = new THREE.Group();
  def!: TableDef;
  runtime!: TableRuntime;
  mode: Mode = 'play';
  onRebuild: () => void = () => {};
  onModeChange: (mode: Mode) => void = () => {};
  private lastBannerText = '';

  constructor(readonly gfx: Renderer, private layout: LayoutShell) {
    gfx.table.add(this.gizmos);
    const controls: TableControls = {
      setFlipper: (side, down) => {
        if (this.mode !== 'play' || !this.runtime) return;
        this.runtime.setFlipper(side, down);
        if (down) this.audio.sfx('flipper', side === 'left' ? 14 : 42);
      },
      setPlunger: (amount) => {
        if (this.mode !== 'play' || !this.runtime) return;
        const pulled = this.runtime.plunger.pullAmount;
        this.runtime.setPlunger(amount);
        if (amount === null && pulled > 0.15) this.audio.sfx('plunger', 54);
      },
      nudge: (dx, dy, s) => {
        if (this.mode !== 'play' || !this.runtime) return;
        if (!this.runtime.tilt.tilted) this.audio.sfx('nudge');
        this.runtime.nudge(dx, dy, s);
      },
    };
    this.input = new InputManager(controls, layout.viewport);
    const unlock = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('keydown', (e) => {
      if (this.mode === 'play' && e.code === 'KeyR' && !(e.target instanceof HTMLInputElement)) this.resetGame();
    });

    this.loop = new FixedStepLoop({
      step: (dt) => { if (this.mode === 'play') this.runtime.step(dt); },
      render: (alpha) => {
        this.input.tick();
        this.runtime.sync(alpha);
        const r = this.runtime;
        if (this.mode === 'play') {
          this.audio.setRoll(r.ball.speed(), r.ball.body.isEnabled() && r.ball.layer === 0 && r.ball.height < 2);
        } else this.audio.setRoll(0, false);
        gfx.table.position.x = r.tilt.angle * 0.4; // table shudder
        gfx.render();
      },
    });
    setInterval(() => this.updateHud(), 100);
  }

  load(def: TableDef): void {
    this.def = def;
    this.rebuild();
  }

  rebuild(): void {
    this.input.releaseAll();
    this.runtime?.dispose();
    const r = (this.runtime = new TableRuntime(this.def, this.gfx, this.gfx.table, (n, x) => this.audio.sfx(n, x)));
    r.bus.on('ON_BALL_DRAIN', () => this.audio.sfx('drain'));
    r.bus.on('ON_TILT', () => this.audio.sfx('tilt'));
    this.onRebuild();
  }

  /** Fresh game on the current table (new RulesEngine, ball in the lane). */
  resetGame(): void {
    this.rebuild();
  }

  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.input.enabled = mode === 'play';
    this.input.releaseAll();
    this.gizmos.visible = mode === 'edit';
    $('app').dataset.mode = mode;
    $('editor-panel').hidden = mode !== 'edit';
    $('btn-play').classList.toggle('on', mode === 'play');
    $('btn-edit').classList.toggle('on', mode === 'edit');
    if (mode === 'play') this.rebuild(); // every Play session starts a fresh game on the edited table
    this.onModeChange(mode);
  }

  start(): void {
    this.loop.start();
  }

  private updateHud(): void {
    const r = this.runtime;
    if (!r) return;
    const R = r.rules;
    const score = String(R.score).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const mode = r.tilt.tilted ? 'TILT' : R.display;
    $('hud-score').textContent = score;
    $('hud-ball').textContent = `BALL ${R.ball}/${R.ballsPerGame}`;
    $('hud-mode').textContent = mode;
    $('dmd-score').textContent = score;
    $('dmd-mode').textContent = mode;

    const ballBadge = document.getElementById('dmd-ball-badge');
    if (ballBadge) ballBadge.textContent = `BALL ${R.ball}/${R.ballsPerGame}`;
    const statusTag = document.getElementById('dmd-status-tag');
    if (statusTag) {
      statusTag.textContent = r.tilt.tilted
        ? 'TILTED'
        : R.vars['locks_lit']
          ? 'LOCK LIT'
          : R.state === 'JackpotFrenzy'
            ? 'FRENZY!'
            : R.state === 'SkillShotActive'
              ? 'SKILL SHOT'
              : 'IN PLAY';
    }

    const banner = document.getElementById('callout-banner');
    if (banner) {
      const stateLabel = R.def.states?.[R.state]?.label ?? R.state;
      const isSpecialText = mode !== stateLabel || r.tilt.tilted || R.state === 'JackpotFrenzy';
      if (isSpecialText && this.mode === 'play') {
        if (this.lastBannerText !== mode) {
          this.lastBannerText = mode;
          banner.textContent = mode;
        }
        banner.classList.add('active');
      } else {
        banner.classList.remove('active');
      }
    }

    const vars = Object.entries(R.vars).map(([k, v]) => `${k.padEnd(12)} ${String(v)}`).join('\n');
    const lamps = [...R.lamps].filter(([, l]) => l.pattern !== 'OFF').map(([k, l]) => `${k} ${l.pattern}`).join(', ') || '-';
    $('rules-status').textContent =
      `ball  ${R.ball}/${R.ballsPerGame}\nmode  ${R.state}${R.modeTimeLeft > 0 ? ` (${R.modeTimeLeft.toFixed(0)}s)` : ''}\n${vars}\nlamps ${lamps}\nlast  ${R.firedLog.slice(-3).join(', ') || '-'}`;
    const b = r.ball, v = b.speed();
    $('telemetry').textContent =
      `physics   ${PHYSICS_HZ} Hz fixed\nfps       ${this.loop.fps.toFixed(0)}\nsteps/frm ${this.loop.stepsLastFrame}\n` +
      `g         ${GRAVITY_CM_S2.toFixed(1)} cm/s²\nball      ${b.cur.x.toFixed(1)}, ${b.cur.y.toFixed(1)}\n` +
      `speed     ${v.toFixed(0)} cm/s\nlayer     ${b.layer}  z ${b.height.toFixed(1)}\n` +
      `flipL/R   ${r.flippers.map((f) => (f.flipper.progress * 100).toFixed(0) + '%').join(' / ')}\n` +
      `plunger   ${(r.plunger.pullAmount * 100).toFixed(0)}%\ntilt      ${r.tilt.angle.toFixed(2)}${r.tilt.tilted ? ' TILTED' : ''}\n` +
      `drains    ${r.drains}\nlayout    ${this.layout.mode}`;
  }
}
