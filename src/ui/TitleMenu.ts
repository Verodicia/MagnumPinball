import type { Game } from '../game/Game';
import type { Renderer } from '../render/Renderer';

export type TitleView = 'main' | 'options' | 'about' | 'hidden';

export class TitleMenu {
  readonly element: HTMLElement;
  private currentView: TitleView = 'main';

  constructor(private game: Game, private gfx: Renderer) {
    this.element = document.createElement('div');
    this.element.id = 'title-screen';
    this.element.className = 'title-screen-overlay';
    // Stop pointer events from bubbling to viewport so setPointerCapture does not steal clicks
    this.element.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.element.addEventListener('pointerup', (e) => e.stopPropagation());
    document.getElementById('viewport')!.appendChild(this.element);

    this.render();
    this.bindEvents();

    // Listen to game mode changes to ensure overlay is hidden when playing or editing directly
    this.game.onModeChange = (_mode) => {
      if (this.currentView !== 'hidden') {
        this.hide();
      }
    };
  }

  isOpen(): boolean {
    return this.currentView !== 'hidden';
  }

  show(view: TitleView = 'main'): void {
    this.currentView = view;
    this.element.classList.remove('hidden');
    this.game.input.enabled = false;
    this.render();
  }

  hide(): void {
    this.currentView = 'hidden';
    this.element.classList.add('hidden');
    this.game.input.enabled = this.game.mode === 'play';
  }

  toggle(): void {
    if (this.isOpen()) {
      this.hide();
    } else {
      this.show('main');
    }
  }

  private bindEvents(): void {
    // Keyboard navigation: Escape toggles menu, Space/Enter in main menu launches Play
    window.addEventListener('keydown', (e) => {
      // Don't intercept if user is typing into an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.currentView === 'options' || this.currentView === 'about') {
          this.show('main');
        } else if (this.isOpen()) {
          this.hide();
        } else {
          this.show('main');
        }
        return;
      }

      if (this.isOpen() && this.currentView === 'main') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this.startArcadePlay();
        }
      }
    });
  }

  private startArcadePlay(): void {
    this.game.audio.unlock();
    this.hide();
    this.game.setMode('play');
    // Ensure viewport canvas has focus for flipper / plunger key events
    this.gfx.renderer.domElement.focus?.();
  }

  private startTableCreator(): void {
    this.game.audio.unlock();
    this.hide();
    this.game.setMode('edit');
  }

  private render(): void {
    if (this.currentView === 'hidden') return;

    if (this.currentView === 'main') {
      this.renderMainMenu();
    } else if (this.currentView === 'options') {
      this.renderOptionsMenu();
    } else if (this.currentView === 'about') {
      this.renderAboutMenu();
    }
  }

  private renderMainMenu(): void {
    this.element.innerHTML = `
      <div class="menu-glass-card">
        <div class="menu-header">
          <div class="menu-badge">★ ARCADE PINBALL SIMULATOR ★</div>
          <h1 class="menu-title">MAGNUM PINBALL</h1>
          <div class="menu-subtitle">HIGH PRECISION 240Hz RETRO PINBALL ENGINE</div>
        </div>

        <div class="menu-actions">
          <button class="menu-btn primary" id="menu-btn-play">
            <span class="btn-icon">🕹</span>
            <div class="btn-text-col">
              <span class="btn-title">PLAY ARCADE</span>
              <span class="btn-desc">Jump straight onto the playfield &amp; score points</span>
            </div>
            <span class="btn-hint">[ENTER]</span>
          </button>

          <button class="menu-btn" id="menu-btn-creator">
            <span class="btn-icon">🛠</span>
            <div class="btn-text-col">
              <span class="btn-title">ARCADE TABLE CREATOR</span>
              <span class="btn-desc">Customize themes, place bumpers, &amp; code rule logic</span>
            </div>
            <span class="btn-hint">EDIT</span>
          </button>

          <button class="menu-btn" id="menu-btn-options">
            <span class="btn-icon">⚙</span>
            <div class="btn-text-col">
              <span class="btn-title">OPTIONS</span>
              <span class="btn-desc">Audio volume, camera angle, and controls cheat sheet</span>
            </div>
          </button>

          <button class="menu-btn" id="menu-btn-about">
            <span class="btn-icon">ℹ</span>
            <div class="btn-text-col">
              <span class="btn-title">ABOUT</span>
              <span class="btn-desc">Engine architecture, 240Hz Rapier2D physics, and specs</span>
            </div>
          </button>
        </div>

        <div class="menu-ticker">
          <div class="ticker-content">
            ★ INSERT COIN TO PLAY ★ MAGNUM HIGH SCORE: 1,500,000 ★ 3 BALLS PER GAME ★ EXTRA BALL LIT AT 500,000 ★ JACKPOT MULTIPLIER READY ★
          </div>
        </div>

        <div class="menu-footer">
          <span>Press <strong>SPACE</strong> or <strong>ENTER</strong> to launch</span>
          <span class="footer-separator">•</span>
          <span>Press <strong>ESC</strong> at any time to return</span>
        </div>
      </div>
    `;

    this.element.querySelector('#menu-btn-play')?.addEventListener('click', () => {
      this.startArcadePlay();
    });

    this.element.querySelector('#menu-btn-creator')?.addEventListener('click', () => {
      this.startTableCreator();
    });

    this.element.querySelector('#menu-btn-options')?.addEventListener('click', () => {
      this.show('options');
    });

    this.element.querySelector('#menu-btn-about')?.addEventListener('click', () => {
      this.show('about');
    });
  }

  private renderOptionsMenu(): void {
    const curVolume = Math.round(this.game.audio.getVolume() * 100);
    const isMuted = this.game.audio.muted;
    const curAngle = this.gfx.getCameraAngle();

    this.element.innerHTML = `
      <div class="menu-glass-card sub-menu-card">
        <div class="menu-header compact">
          <h2 class="sub-title">⚙ GAME OPTIONS</h2>
          <div class="menu-subtitle">Audio, Camera Perspective &amp; Controls</div>
        </div>

        <div class="options-body">
          <!-- Audio Section -->
          <div class="options-group">
            <div class="group-title">🔊 AUDIO &amp; SOUND EFFECTS</div>
            <div class="option-row">
              <label for="opt-volume">Master Volume (<span id="opt-volume-val">${curVolume}%</span>):</label>
              <input type="range" id="opt-volume" min="0" max="100" value="${curVolume}" class="menu-slider" />
            </div>
            <div class="option-row buttons-row">
              <button id="opt-btn-mute" class="opt-btn ${isMuted ? 'active' : ''}">
                ${isMuted ? '🔇 Unmute Audio' : '🔊 Mute Audio'}
              </button>
              <button id="opt-btn-test-sfx" class="opt-btn">
                🔔 Test Solenoid SFX
              </button>
            </div>
          </div>

          <!-- Camera Section -->
          <div class="options-group">
            <div class="group-title">🎥 CAMERA PERSPECTIVE</div>
            <div class="camera-choices">
              <button class="cam-btn ${curAngle === 62 ? 'selected' : ''}" data-angle="62">
                <strong>Classic Arcade (62°)</strong>
                <span>Standard angled cabinet view</span>
              </button>
              <button class="cam-btn ${curAngle === 80 ? 'selected' : ''}" data-angle="80">
                <strong>Bird's Eye (80°)</strong>
                <span>Direct overhead tactical view</span>
              </button>
              <button class="cam-btn ${curAngle === 50 ? 'selected' : ''}" data-angle="50">
                <strong>Action Angle (50°)</strong>
                <span>Steep high-velocity driver view</span>
              </button>
            </div>
          </div>

          <!-- Controls Guide -->
          <div class="options-group">
            <div class="group-title">🎮 CONTROLS CHEAT SHEET</div>
            <div class="controls-grid">
              <div class="key-card">
                <kbd>Z</kbd>
                <span>Left Flipper</span>
              </div>
              <div class="key-card">
                <kbd>/</kbd>
                <span>Right Flipper</span>
              </div>
              <div class="key-card wide">
                <kbd>SPACE</kbd>
                <span>Plunger (Hold to Pull, Release to Fire)</span>
              </div>
              <div class="key-card">
                <kbd>A</kbd> <kbd>D</kbd> <kbd>W</kbd>
                <span>Table Nudge (Left / Right / Up)</span>
              </div>
              <div class="key-card">
                <kbd>R</kbd>
                <span>Restart Game</span>
              </div>
              <div class="key-card">
                <kbd>ESC</kbd>
                <span>Toggle Menu</span>
              </div>
            </div>
          </div>
        </div>

        <div class="menu-bottom-bar">
          <button class="menu-btn secondary" id="menu-btn-back">
            <span>← BACK TO MAIN MENU</span>
          </button>
        </div>
      </div>
    `;

    // Hook up options controls
    const volInput = this.element.querySelector('#opt-volume') as HTMLInputElement;
    const volVal = this.element.querySelector('#opt-volume-val') as HTMLElement;
    volInput?.addEventListener('input', () => {
      const v = Number(volInput.value);
      volVal.textContent = `${v}%`;
      this.game.audio.setVolume(v / 100);
      const muteBtn = document.getElementById('btn-mute');
      if (muteBtn) muteBtn.textContent = v === 0 ? '🔇' : '🔊';
    });

    const muteBtn = this.element.querySelector('#opt-btn-mute') as HTMLButtonElement;
    muteBtn?.addEventListener('click', () => {
      this.game.audio.unlock();
      const newMute = !this.game.audio.muted;
      this.game.audio.setMuted(newMute);
      muteBtn.textContent = newMute ? '🔇 Unmute Audio' : '🔊 Mute Audio';
      muteBtn.classList.toggle('active', newMute);
      const tbMute = document.getElementById('btn-mute');
      if (tbMute) tbMute.textContent = newMute ? '🔇' : '🔊';
    });

    this.element.querySelector('#opt-btn-test-sfx')?.addEventListener('click', () => {
      this.game.audio.unlock();
      this.game.audio.sfx('bumper', 28);
    });

    this.element.querySelectorAll('.cam-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const angle = Number((btn as HTMLElement).dataset.angle);
        this.gfx.setCameraAngle(angle);
        this.element.querySelectorAll('.cam-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    this.element.querySelector('#menu-btn-back')?.addEventListener('click', () => {
      this.show('main');
    });
  }

  private renderAboutMenu(): void {
    this.element.innerHTML = `
      <div class="menu-glass-card sub-menu-card">
        <div class="menu-header compact">
          <h2 class="sub-title">ℹ ABOUT MAGNUM PINBALL</h2>
          <div class="menu-subtitle">Architecture &amp; Technical Specifications</div>
        </div>

        <div class="about-body">
          <div class="about-hero">
            <div class="hero-logo">MAGNUM PINBALL</div>
            <div class="hero-tagline">The Next-Generation Web Pinball Engine</div>
            <div class="hero-version">Version 1.0.0 Arcade Edition</div>
          </div>

          <div class="specs-grid">
            <div class="spec-card">
              <div class="spec-icon">⚡</div>
              <div class="spec-info">
                <strong>240 Hz Rapier2D Physics</strong>
                <p>Fixed-timestep simulation running compiled WebAssembly with sub-step collision detection, preventing tunneling and ensuring authentic ball spin &amp; rail momentum.</p>
              </div>
            </div>

            <div class="spec-card">
              <div class="spec-icon">🎨</div>
              <div class="spec-info">
                <strong>Three.js PBR Rendering</strong>
                <p>Physically Based Rendering with ACES Filmic tonemapping, dynamic studio environment reflections, procedural neon decals, and custom cabinet shaders.</p>
              </div>
            </div>

            <div class="spec-card">
              <div class="spec-icon">🔊</div>
              <div class="spec-info">
                <strong>Zero-Latency Procedural Web Audio</strong>
                <p>Pure mathematical sound synthesis — authentic flipper clacks, pop bumper chimes, and speed-modulated ball rolling without heavy external asset loading.</p>
              </div>
            </div>

            <div class="spec-card">
              <div class="spec-icon">🛠</div>
              <div class="spec-info">
                <strong>Arcade Table Creator Suite</strong>
                <p>Sims-style live visual customization swatches, dynamic rule scripting DSL, hot-reloading table architecture, and instant JSON state serialization.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="menu-bottom-bar">
          <button class="menu-btn secondary" id="menu-btn-back">
            <span>← BACK TO MAIN MENU</span>
          </button>
        </div>
      </div>
    `;

    this.element.querySelector('#menu-btn-back')?.addEventListener('click', () => {
      this.show('main');
    });
  }
}
