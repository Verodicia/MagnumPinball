import * as THREE from 'three';
import { MODULE_TYPES } from '../components/factory';
import type { ModuleDef } from '../components/PlayfieldModule';
import { ALL_EVENTS } from '../core/PinballEventBus';
import type { Game } from '../game/Game';
import { toLocal } from '../render/coords';
import {
  COLOR_SWATCHES,
  COMPONENT_STYLES,
  createStyleThumbnail,
  THEME_PRESETS,
} from '../render/ProceduralTextures';
import { formatActions, formatConditions, parseActions, parseConditions } from '../rules/RuleText';
import type { Rule } from '../rules/types';
import type { SplineDef, SplineKind } from '../splines/SplineTrack';
import type { FlipperDef, TableDef, TableThemeDef } from '../table/schema';
import { validateTable } from '../table/validate';

type Sel = { kind: 'module' | 'flipper' | 'spline'; id: string } | null;
type Drag = { kind: 'item'; dx: number; dy: number } | { kind: 'cp'; seg: number; idx: number };

const esc = (s: unknown): string => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const snap = (v: number): number => Math.round(v * 2) / 2; // 0.5 cm grid
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const MODULE_DEFAULTS: Record<string, Partial<ModuleDef>> = {
  PopBumper: { params: { style: 'starburst', color: '#ff8800' } },
  Slingshot: { params: { points: [[0, 0], [0, 15], [10, 2.5]], face: [1, 2], style: 'lightning', color: '#00e5ff' } },
  DropTargetBank: {},
  StandupTarget: { params: { width: 3.2, color: '#00f0ff', label: '★', style: 'star' } },
  BumperPost: { params: { radius: 0.9, color: '#00f0ff' } },
  LaneDivider: { params: { length: 8.5, thickness: 0.7, color: '#00f0ff' } },
  Spinner: {},
  RolloverSwitch: {},
  KickoutHole: { params: { autoEject: 1.5 } },
  Gate: { rotation: 200, params: { length: 4.2, openDir: -1, openDeg: 80 } },
  LightInsert: { params: { size: 2, color: '#ffcc33', lit: true, style: 'circle' } },
  ArcadeDecal: { params: { variant: 'plastic_card', width: 9, height: 4.2, color: '#00f0ff', label: 'HYPERDRIVE', sublabel: 'BONUS X2' } },
};

/** Edit-mode UI: palette, Sims-style visual customizer, board theme styling, rule builder, JSON import/export. */
export class Editor {
  private sel: Sel = null;
  private tool: string | null = null;
  private drag: Drag | null = null;
  private history: string[] = [];
  private rebuildQueued = false;
  private panel = document.getElementById('editor-panel') as HTMLElement;
  private statusEl!: HTMLElement;
  private workspace: 'build' | 'logic' = 'build';
  private subTab = 'catalog';

  constructor(private game: Game) {
    this.buildShell();
    const surface = game.gfx.renderer.domElement;
    surface.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('keydown', this.onKey);
    this.panel.addEventListener('change', this.onChange);
    this.panel.addEventListener('click', this.onClick);
    game.onRebuild = () => { this.refreshGizmos(); };
    game.onModeChange = () => { this.tool = null; this.drag = null; this.renderAll(); this.refreshGizmos(); };
  }

  private get def(): TableDef { return this.game.def; }
  private get editing(): boolean { return this.game.mode === 'edit'; }

  // ---------------------------------------------------------------- shell / rendering
  private buildShell(): void {
    this.panel.innerHTML = `
      <div id="ed-workspace-tabs">
        <button class="ed-main-tab on" data-act="set-workspace" data-ws="build">🛠 Build &amp; Style</button>
        <button class="ed-main-tab" data-act="set-workspace" data-ws="logic">⚡ Logic &amp; Table</button>
      </div>
      <div id="ed-sub-tabs"></div>
      <div id="ed-workspace-body">
        <div id="ed-panel-catalog" class="ed-pane">
          <div class="ed-section">
            <div class="ed-section-title">📦 Component Catalog</div>
            <div id="ed-palette"></div>
            <div id="ed-hint" class="hint">Pick a component and click anywhere on the playfield to place it. Drag items to reposition. Del removes. Ctrl+Z undoes.</div>
          </div>
          <div class="ed-section">
            <div class="ed-section-title">⚡ Quick-Fill Zones</div>
            <div class="row" id="ed-zones">
              <button data-act="fill-zone" data-zone="top" title="Populate top arch rollover lanes &amp; targets">+ Top Arch</button>
              <button data-act="fill-zone" data-zone="flippers" title="Populate outlane dividers, rollovers &amp; center drain post">+ Flipper Area</button>
              <button data-act="fill-zone" data-zone="apron" title="Populate sculpted apron wings &amp; drain decals below flippers">+ Below Flippers</button>
            </div>
          </div>
        </div>
        <div id="ed-panel-style" class="ed-pane">
          <div id="ed-inspector"></div>
        </div>
        <div id="ed-panel-theme" class="ed-pane">
          <div id="ed-theme"></div>
        </div>
        <div id="ed-panel-rules" class="ed-pane">
          <div id="ed-rules"></div>
        </div>
        <div id="ed-panel-modes" class="ed-pane">
          <div id="ed-modes"></div>
        </div>
        <div id="ed-panel-file" class="ed-pane">
          <div id="ed-table"></div>
        </div>
      </div>
      <div id="ed-status"></div>`;
    this.statusEl = this.panel.querySelector('#ed-status') as HTMLElement;
    this.renderAll();
  }

  renderAll(): void {
    if (!this.game.def) return;
    this.renderTabs();
    this.renderPalette();
    this.renderInspector();
    this.renderTheme();
    this.renderRules();
    this.renderModes();
    this.renderTable();
    this.showValidation();
  }

  private renderTabs(): void {
    const wsBtns = this.panel.querySelectorAll('.ed-main-tab');
    wsBtns.forEach((b) => {
      const btn = b as HTMLElement;
      btn.classList.toggle('on', btn.dataset['ws'] === this.workspace);
    });

    const subContainer = this.panel.querySelector('#ed-sub-tabs')!;
    if (this.workspace === 'build') {
      const styleLabel = this.sel ? `🎨 Style (${esc(this.sel.id)})` : '🎨 Style Item';
      subContainer.innerHTML = `
        <button class="ed-sub-tab ${this.subTab === 'catalog' ? 'on' : ''}" data-act="set-subtab" data-sub="catalog">📦 Add Items</button>
        <button class="ed-sub-tab ${this.subTab === 'style' ? 'on' : ''}" data-act="set-subtab" data-sub="style">${styleLabel}</button>
        <button class="ed-sub-tab ${this.subTab === 'theme' ? 'on' : ''}" data-act="set-subtab" data-sub="theme">🖼 Board Theme</button>
      `;
    } else {
      subContainer.innerHTML = `
        <button class="ed-sub-tab ${this.subTab === 'rules' ? 'on' : ''}" data-act="set-subtab" data-sub="rules">⚡ Rules</button>
        <button class="ed-sub-tab ${this.subTab === 'modes' ? 'on' : ''}" data-act="set-subtab" data-sub="modes">🎮 Modes &amp; Vars</button>
        <button class="ed-sub-tab ${this.subTab === 'file' ? 'on' : ''}" data-act="set-subtab" data-sub="file">💾 Table File</button>
      `;
    }

    const show = (id: string, vis: boolean) => {
      const el = this.panel.querySelector(id) as HTMLElement | null;
      if (el) el.style.display = vis ? 'block' : 'none';
    };
    show('#ed-panel-catalog', this.workspace === 'build' && this.subTab === 'catalog');
    show('#ed-panel-style', this.workspace === 'build' && this.subTab === 'style');
    show('#ed-panel-theme', this.workspace === 'build' && this.subTab === 'theme');
    show('#ed-panel-rules', this.workspace === 'logic' && this.subTab === 'rules');
    show('#ed-panel-modes', this.workspace === 'logic' && this.subTab === 'modes');
    show('#ed-panel-file', this.workspace === 'logic' && this.subTab === 'file');
  }

  private renderPalette(): void {
    const items: Array<[string, string]> = [
      ...MODULE_TYPES.map((t): [string, string] => [t, t]),
      ['Flipper:left', 'Flipper L'], ['Flipper:right', 'Flipper R'],
      ['Spline:ramp', 'Ramp'], ['Spline:wood', 'Wood guide'], ['Spline:wireform', 'Wireform'],
    ];
    const paletteEl = this.panel.querySelector('#ed-palette');
    if (paletteEl) {
      paletteEl.innerHTML = items
        .map(([k, label]) => `<button data-act="tool" data-tool="${k}" class="${this.tool === k ? 'on' : ''}">${esc(label)}</button>`).join('');
    }
  }

  private field(scope: string, key: string, label: string, value: unknown, extra = ''): string {
    return `<label>${label}<input data-scope="${scope}" data-key="${key}" value="${esc(value)}" ${extra}></label>`;
  }

  private renderInspector(): void {
    const el = this.panel.querySelector('#ed-inspector');
    if (!el) return;
    const s = this.sel;
    if (!s) {
      el.innerHTML = `
        <div class="ed-section">
          <div class="hint" style="text-align:center; padding:18px 8px;">
            <b>No Item Selected</b><br><br>
            Click any bumper, flipper, target, or light on the table to customize its visual look, neon colors, and properties.
          </div>
        </div>`;
      return;
    }

    if (s.kind === 'module') {
      const m = this.def.modules.find((x) => x.id === s.id);
      if (!m) { el.innerHTML = ''; return; }
      const mod = this.game.runtime.host.modules.get(m.id);
      const p = m.params ?? {};
      const styles = COMPONENT_STYLES[m.type];
      const curStyle = String(p['style'] ?? (styles?.[0]?.id ?? ''));
      const curColor = typeof p['color'] === 'string' && p['color'].startsWith('#') ? p['color'] : '#00f0ff';

      let stylesHtml = '';
      if (styles && styles.length) {
        stylesHtml = `
          <div class="ed-section">
            <div class="ed-section-title">✨ Sims-Style Look Presets</div>
            <div class="sims-swatch-grid">
              ${styles.map((st) => {
                const thumb = createStyleThumbnail(m.type, st.id, curColor, '#ff2288');
                return `
                  <div class="sims-card ${curStyle === st.id ? 'on' : ''}" data-act="set-style" data-style="${st.id}">
                    <img src="${thumb}" alt="${st.label}">
                    <div class="sims-label">${st.label}</div>
                  </div>`;
              }).join('')}
            </div>
          </div>`;
      }

      let colorsHtml = '';
      if (['PopBumper', 'Slingshot', 'StandupTarget', 'BumperPost', 'LaneDivider', 'LightInsert', 'ArcadeDecal'].includes(m.type)) {
        colorsHtml = `
          <div class="ed-section">
            <div class="ed-section-title">🎨 Neon Accent Color</div>
            <div class="color-swatches">
              ${COLOR_SWATCHES.map((hex) => `<div class="color-circle ${curColor === hex ? 'on' : ''}" style="background:${hex};" data-act="set-color" data-color="${hex}"></div>`).join('')}
              <input type="color" data-scope="mparam" data-key="color" value="${curColor}" class="color-custom-input" title="Custom color picker">
            </div>
          </div>`;
      }

      let quickFields = '';
      if (m.type === 'ArcadeDecal') {
        quickFields += this.field('mparam', 'label', 'label', p['label'] ?? 'HYPERDRIVE');
        quickFields += this.field('mparam', 'sublabel', 'sublabel', p['sublabel'] ?? '');
        quickFields += this.field('mparam', 'width', 'width (cm)', p['width'] ?? 10, 'type=number step=0.5');
        quickFields += this.field('mparam', 'height', 'height (cm)', p['height'] ?? 4.8, 'type=number step=0.5');
      } else if (m.type === 'LaneDivider') {
        quickFields += this.field('mparam', 'length', 'length (cm)', p['length'] ?? 8.5, 'type=number step=0.5');
        quickFields += this.field('mparam', 'thickness', 'thickness', p['thickness'] ?? 0.7, 'type=number step=0.1');
      } else if (m.type === 'StandupTarget') {
        quickFields += this.field('mparam', 'label', 'target symbol', p['label'] ?? '★');
        quickFields += this.field('mparam', 'width', 'width (cm)', p['width'] ?? 3.2, 'type=number step=0.2');
      } else if (m.type === 'BumperPost') {
        quickFields += this.field('mparam', 'radius', 'radius (cm)', p['radius'] ?? 0.9, 'type=number step=0.1');
      } else if (m.type === 'PopBumper') {
        quickFields += this.field('mparam', 'radius', 'radius (cm)', p['radius'] ?? 2.8, 'type=number step=0.1');
        quickFields += this.field('mparam', 'kickSpeed', 'kick speed', p['kickSpeed'] ?? 260, 'type=number step=10');
      } else if (m.type === 'LightInsert') {
        quickFields += this.field('mparam', 'size', 'size (cm)', p['size'] ?? 2, 'type=number step=0.2');
      }

      el.innerHTML = `
        <div class="row" style="justify-content:space-between; margin-bottom:8px;">
          <div><b>${esc(m.id)}</b> <span class="tag">${esc(m.type)}</span></div>
          <button data-act="delete" style="background:#4a121d; border-color:#ff4466; color:#ffffff;">Delete</button>
        </div>
        ${stylesHtml}
        ${colorsHtml}
        <div class="ed-section">
          <div class="ed-section-title">📐 Transform &amp; Properties</div>
          <div class="grid">
            ${this.field('module', 'x', 'x (cm)', m.x, 'type=number step=0.5')}
            ${this.field('module', 'y', 'y (cm)', m.y, 'type=number step=0.5')}
            ${this.field('module', 'rotation', 'rot°', m.rotation ?? 0, 'type=number step=5')}
            ${this.field('module', 'layer', 'layer (0-3)', m.layer ?? 0, 'type=number min=0 max=3')}
            ${quickFields}
          </div>
        </div>
        <details class="ed-section">
          <summary style="cursor:pointer; font-size:10px; color:#7a86b8;">⚙ Advanced JSON &amp; Ports</summary>
          <label style="margin-top:6px;">params (JSON)<textarea data-scope="module" data-key="params" rows="3">${esc(JSON.stringify(m.params ?? {}))}</textarea></label>
          <div class="hint">switches: ${esc(mod?.switches.join(', ') || '-')} · solenoids: ${esc(mod?.solenoids.join(', ') || '-')}${mod && mod.snapPorts.length ? ' · ports: ' + esc(mod.snapPorts.map((pt) => pt.id).join(', ')) : ''}</div>
        </details>`;
    } else if (s.kind === 'flipper') {
      const f = this.def.flippers.find((x) => x.id === s.id);
      if (!f) { el.innerHTML = ''; return; }
      const styles = COMPONENT_STYLES['Flipper']!;
      const curStyle = f.style ?? 'classic-red';
      const curColor = f.color ?? '#ff1e38';

      el.innerHTML = `
        <div class="row" style="justify-content:space-between; margin-bottom:8px;">
          <div><b>${esc(f.id)}</b> <span class="tag">Flipper (${f.side})</span></div>
          <button data-act="delete" style="background:#4a121d; border-color:#ff4466; color:#ffffff;">Delete</button>
        </div>
        <div class="ed-section">
          <div class="ed-section-title">✨ Sims-Style Look Presets</div>
          <div class="sims-swatch-grid">
            ${styles.map((st) => {
              const thumb = createStyleThumbnail('Flipper', st.id, curColor, '#ff2288');
              return `
                <div class="sims-card ${curStyle === st.id ? 'on' : ''}" data-act="set-style" data-style="${st.id}">
                  <img src="${thumb}" alt="${st.label}">
                  <div class="sims-label">${st.label}</div>
                </div>`;
            }).join('')}
          </div>
        </div>
        <div class="ed-section">
          <div class="ed-section-title">🎨 Rubber Band Color</div>
          <div class="color-swatches">
            ${COLOR_SWATCHES.map((hex) => `<div class="color-circle ${curColor === hex ? 'on' : ''}" style="background:${hex};" data-act="set-color" data-color="${hex}"></div>`).join('')}
            <input type="color" data-scope="flipper" data-key="color" value="${curColor}" class="color-custom-input" title="Custom color picker">
          </div>
        </div>
        <div class="ed-section">
          <div class="ed-section-title">📐 Geometry &amp; Solenoid Power</div>
          <div class="grid">
            ${this.field('flipper', 'x', 'x (cm)', f.x, 'type=number step=0.5')}
            ${this.field('flipper', 'y', 'y (cm)', f.y, 'type=number step=0.5')}
            <label>side<select data-scope="flipper" data-key="side"><option ${f.side === 'left' ? 'selected' : ''}>left</option><option ${f.side === 'right' ? 'selected' : ''}>right</option></select></label>
            ${this.field('flipper', 'powerTorque', 'power torque', f.powerTorque ?? 75000, 'type=number step=5000')}
          </div>
        </div>`;
    } else {
      const sp = this.def.splines.find((x) => x.id === s.id);
      if (!sp) { el.innerHTML = ''; return; }
      const styles = COMPONENT_STYLES['Spline']!;
      const curStyle = sp.style ?? 'neon-cyan';
      const curColor = sp.color ?? '#00f0ff';
      const ports = this.game.runtime.ports.all();
      const portSel = (key: 'snapStart' | 'snapEnd'): string =>
        `<label>${key}<select data-scope="spline" data-key="${key}"><option value="">(none)</option>${ports.map((p) => `<option ${sp[key] === p.id ? 'selected' : ''}>${esc(p.id)}</option>`).join('')}</select></label>`;
      const rows = sp.segments.map((seg, si) => seg.map((p, pi) =>
        `<div class="cp"><span>${si}.${pi}</span>${(['x', 'y', 'z'] as const).map((_, ai) =>
          `<input type="number" step="0.5" data-scope="cp" data-seg="${si}" data-pt="${pi}" data-axis="${ai}" value="${p[ai] ?? 0}">`).join('')}</div>`).join('')).join('<hr>');

      el.innerHTML = `
        <div class="row" style="justify-content:space-between; margin-bottom:8px;">
          <div><b>${esc(sp.id)}</b> <span class="tag">Spline (${sp.kind})</span></div>
          <button data-act="delete" style="background:#4a121d; border-color:#ff4466; color:#ffffff;">Delete</button>
        </div>
        <div class="ed-section">
          <div class="ed-section-title">✨ Sims-Style Rail Look</div>
          <div class="sims-swatch-grid">
            ${styles.map((st) => {
              const thumb = createStyleThumbnail('Spline', st.id, curColor, '#ff2288');
              return `
                <div class="sims-card ${curStyle === st.id ? 'on' : ''}" data-act="set-style" data-style="${st.id}">
                  <img src="${thumb}" alt="${st.label}">
                  <div class="sims-label">${st.label}</div>
                </div>`;
            }).join('')}
          </div>
        </div>
        <div class="ed-section">
          <div class="ed-section-title">📐 Track Properties</div>
          <div class="grid">
            <label>kind<select data-scope="spline" data-key="kind">${(['ramp', 'wood', 'wireform'] as SplineKind[]).map((k) => `<option ${sp.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
            ${this.field('spline', 'layer', 'layer (0-3)', sp.layer, 'type=number min=0 max=3')}
            ${this.field('spline', 'width', 'width (cm)', sp.width, 'type=number step=0.2 min=0')}
            ${portSel('snapStart')}${portSel('snapEnd')}
          </div>
        </div>
        <div class="ed-section">
          <div class="ed-section-title">Bézier Control Points</div>
          <div class="cps">${rows}</div>
          <div class="row" style="margin-top:6px;">
            <button data-act="add-seg">+ Segment</button>
            <button data-act="del-seg">− Segment</button>
          </div>
        </div>`;
    }
  }

  private renderTheme(): void {
    const el = this.panel.querySelector('#ed-theme');
    if (!el) return;
    const t = this.def.theme ?? {};
    const curPreset = t.preset ?? 'hyperdrive';
    const cfg = THEME_PRESETS[curPreset] ?? THEME_PRESETS['hyperdrive']!;
    const curPrimary = t.primaryAccent ?? cfg.primary;
    const curSecondary = t.secondaryAccent ?? cfg.secondary;
    const curCenter = t.centerTitle ?? cfg.centerTitle;
    const curArch = t.archTitle ?? cfg.archTitle;
    const curTrim = t.cabinetTrim ?? 'chrome';

    const presetsHtml = Object.keys(THEME_PRESETS).map((k) => {
      const c = THEME_PRESETS[k]!;
      const thumb = createStyleThumbnail('Theme', k, c.primary, c.secondary);
      return `
        <div class="sims-card ${curPreset === k ? 'on' : ''}" data-act="set-theme-preset" data-preset="${k}">
          <img src="${thumb}" alt="${c.centerTitle}">
          <div class="sims-label">${c.centerTitle}</div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="ed-section">
        <div class="ed-section-title">🌟 Playfield Theme Presets</div>
        <div class="sims-swatch-grid">${presetsHtml}</div>
      </div>
      <div class="ed-section">
        <div class="ed-section-title">🎨 Theme Graphics &amp; Titles</div>
        <label>Center Medallion Title<input data-scope="theme" data-key="centerTitle" value="${esc(curCenter)}"></label>
        <label>Top Arch Banner Title<input data-scope="theme" data-key="archTitle" value="${esc(curArch)}"></label>
        <div class="grid">
          <label>Primary Glow<input type="color" data-scope="theme" data-key="primaryAccent" value="${esc(curPrimary)}"></label>
          <label>Secondary Glow<input type="color" data-scope="theme" data-key="secondaryAccent" value="${esc(curSecondary)}"></label>
        </div>
      </div>
      <div class="ed-section">
        <div class="ed-section-title">🏛 Cabinet &amp; Trim Finish</div>
        <label>Side Rail &amp; Lockbar Material
          <select data-scope="theme" data-key="cabinetTrim">
            ${['chrome', 'brass', 'black', 'cyan', 'magenta'].map((opt) => `<option ${curTrim === opt ? 'selected' : ''}>${opt}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="ed-section">
        <div class="ed-section-title">🖼 Custom Playfield Artwork</div>
        <label>Center Art Image URL<input data-scope="theme" data-key="customPlayfieldUrl" placeholder="Image URL or data URI" value="${esc(t.customPlayfieldUrl ?? '')}"></label>
        <div class="row">
          <label class="file">📁 Upload Image<input type="file" accept="image/*" data-scope="playfield-art-file"></label>
        </div>
      </div>
    `;
  }

  private renderRules(): void {
    const el = this.panel.querySelector('#ed-rules');
    if (!el) return;
    const r = this.def.rules;
    const ids = new Set<string>(['left_ramp.entry', 'left_ramp.exit']);
    for (const m of this.game.runtime.host.modules.values()) { ids.add(m.id); m.switches.forEach((x) => ids.add(x)); }
    this.def.splines.forEach((s) => { ids.add(`${s.id}.entry`); ids.add(`${s.id}.exit`); });
    Object.keys(r.states).forEach((x) => ids.add(x));
    const rules = r.rules.map((rule, i) => `<div class="rule">
      <div class="row"><input data-scope="rule" data-i="${i}" data-key="id" value="${esc(rule.id)}"><button data-act="del-rule" data-i="${i}">✕</button></div>
      <div class="row"><span class="kw">WHEN</span>
        <select data-scope="rule" data-i="${i}" data-key="event">${ALL_EVENTS.map((e) => `<option ${rule.when.event === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
        <input data-scope="rule" data-i="${i}" data-key="whenId" list="ed-ids" placeholder="id / prefix*" value="${esc(rule.when.id ?? '')}"></div>
      <div class="row"><span class="kw">IF</span><input class="wide" data-scope="rule" data-i="${i}" data-key="if" placeholder='state == BaseMode AND var.x == false' value="${esc(formatConditions(rule.if))}"></div>
      <div class="row"><span class="kw">DO</span><textarea class="wide" rows="${Math.max(2, rule.do.length)}" data-scope="rule" data-i="${i}" data-key="do">${esc(formatActions(rule.do))}</textarea></div>
    </div>`).join('');

    el.innerHTML = `
      <datalist id="ed-ids">${[...ids].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <div class="ed-section">
        <div class="ed-section-title">⚡ Event Rules (Top to Bottom)</div>
        ${rules}
        <button data-act="add-rule" style="margin-top:6px;">+ Rule</button>
      </div>
      <div class="hint">Actions: ADD_SCORE n · SET_LAMP lamp PATTERN [#color] · SET_STATE s · FIRE_SOLENOID module port · PLAY_SFX name · SET_VAR n v · ADD_VAR n d · SHOW_TEXT "t" [sec].</div>
    `;
  }

  private renderModes(): void {
    const el = this.panel.querySelector('#ed-modes');
    if (!el) return;
    const r = this.def.rules;
    const modes = JSON.stringify({ ballsPerGame: r.ballsPerGame ?? 3, initialState: r.initialState, vars: r.vars, states: r.states }, null, 2);
    el.innerHTML = `
      <div class="ed-section">
        <div class="ed-section-title">🎮 Game Modes, States &amp; Variables</div>
        <label>Modes, variables &amp; balls (JSON)<textarea data-scope="modes" rows="14">${esc(modes)}</textarea></label>
      </div>
    `;
  }

  private renderTable(): void {
    const el = this.panel.querySelector('#ed-table');
    if (!el) return;
    el.innerHTML = `
      <div class="ed-section">
        <div class="ed-section-title">💾 Table Properties &amp; File</div>
        ${this.field('meta', 'name', 'Table Name', this.def.name)}
        <div class="row" style="margin-top:8px;">
          <button data-act="export">Export JSON</button>
          <button data-act="copy">Copy JSON</button>
          <label class="file">Import<input type="file" accept=".json,application/json" data-scope="file"></label>
          <button data-act="reset-starter">Starter Table</button>
          <button data-act="undo">Undo</button>
        </div>
      </div>
      <div class="ed-section">
        <div class="ed-section-title">📋 Direct JSON Paste</div>
        <label>Paste JSON<textarea data-scope="paste" rows="4" placeholder="Paste table JSON here and click Apply..."></textarea></label>
        <button data-act="apply-paste" style="margin-top:6px;">Apply pasted JSON</button>
      </div>
    `;
  }

  private status(lines: string[], cls: 'ok' | 'warn' | 'error'): void {
    this.statusEl.className = cls;
    this.statusEl.innerHTML = lines.map(esc).join('<br>');
  }

  private showValidation(): void {
    const v = validateTable(this.def);
    if (v.errors.length) this.status(v.errors, 'error');
    else if (v.warnings.length) this.status(v.warnings, 'warn');
    else this.status(['Table valid.'], 'ok');
  }

  // ---------------------------------------------------------------- state changes
  private checkpoint(): void {
    this.history.push(JSON.stringify(this.def));
    if (this.history.length > 60) this.history.shift();
  }

  private undo(): void {
    const prev = this.history.pop();
    if (!prev) return;
    this.sel = null;
    this.game.load(JSON.parse(prev) as TableDef);
    this.renderAll();
  }

  private commit(rerender = false): void {
    if (rerender) { this.game.rebuild(); this.renderAll(); return; }
    if (this.rebuildQueued) return;
    this.rebuildQueued = true;
    requestAnimationFrame(() => { this.rebuildQueued = false; this.game.rebuild(); });
  }

  private uniqueId(prefix: string): string {
    const all = new Set([...this.def.modules, ...this.def.flippers, ...this.def.splines].map((x) => x.id));
    let n = 1;
    while (all.has(`${prefix}_${n}`)) n++;
    return `${prefix}_${n}`;
  }

  private place(tool: string, x: number, y: number): void {
    this.checkpoint();
    if (tool.startsWith('Flipper:')) {
      const side = tool.split(':')[1] as 'left' | 'right';
      const f: FlipperDef = { id: this.uniqueId(`flipper_${side}`), x, y, side, style: 'classic-red', color: '#ff1e38' };
      this.def.flippers.push(f);
      this.sel = { kind: 'flipper', id: f.id };
    } else if (tool.startsWith('Spline:')) {
      const kind = tool.split(':')[1] as SplineKind;
      const z = kind === 'ramp' ? [0, 2, 6, 6] : kind === 'wireform' ? [3, 3, 3, 3] : [0, 0, 0, 0];
      const s: SplineDef = {
        id: this.uniqueId(kind), kind, layer: kind === 'ramp' ? 1 : kind === 'wireform' ? 2 : 0,
        width: kind === 'ramp' ? 6 : kind === 'wireform' ? 3.2 : 0,
        style: 'neon-cyan',
        segments: [[[x, y, z[0]!], [x, y + 10, z[1]!], [x + 4, y + 20, z[2]!], [x + 10, y + 28, z[3]!]]],
      };
      this.def.splines.push(s);
      this.sel = { kind: 'spline', id: s.id };
    } else {
      const m: ModuleDef = { id: this.uniqueId(tool.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()), type: tool, x, y, ...clone(MODULE_DEFAULTS[tool] ?? {}) };
      this.def.modules.push(m);
      this.sel = { kind: 'module', id: m.id };
    }
    this.tool = null;
    this.workspace = 'build';
    this.subTab = 'style';
    this.commit(true);
  }

  /** Populates missing elements in the requested zone (top arch, flipper/outlanes, or below-flippers apron). */
  private fillZone(zone: string): void {
    this.checkpoint();
    const existing = new Set(this.def.modules.map((m) => m.id));
    const addIfMissing = (m: ModuleDef) => {
      if (!existing.has(m.id)) {
        this.def.modules.push(m);
        existing.add(m.id);
      }
    };

    if (zone === 'top') {
      addIfMissing({ id: 'top_div_1', type: 'LaneDivider', x: 17.5, y: 103, params: { length: 8.5, thickness: 0.7, color: '#00f0ff' } });
      addIfMissing({ id: 'top_div_2', type: 'LaneDivider', x: 24.5, y: 103, params: { length: 8.5, thickness: 0.7, color: '#ff2288' } });
      addIfMissing({ id: 'top_lane_h', type: 'RolloverSwitch', x: 14, y: 102, params: { radius: 1.1 } });
      addIfMissing({ id: 'top_lane_y', type: 'RolloverSwitch', x: 21, y: 102, params: { radius: 1.1 } });
      addIfMissing({ id: 'top_lane_p', type: 'RolloverSwitch', x: 28, y: 102, params: { radius: 1.1 } });
      addIfMissing({ id: 'top_target_left', type: 'StandupTarget', x: 5.5, y: 92, rotation: -55, params: { width: 3.2, color: '#00f0ff', label: 'H', style: 'bullseye' } });
      addIfMissing({ id: 'top_arch_banner', type: 'ArcadeDecal', x: 21, y: 113, params: { variant: 'plastic_card', width: 16, height: 3.2, color: '#00f0ff', label: 'ORBIT LANES', sublabel: '2X BONUS' } });
    } else if (zone === 'flippers') {
      addIfMissing({ id: 'outlane_div_left', type: 'LaneDivider', x: 4.5, y: 24.5, params: { length: 10, thickness: 0.7, color: '#00f0ff' } });
      addIfMissing({ id: 'outlane_div_right', type: 'LaneDivider', x: 47.3, y: 24.5, params: { length: 10, thickness: 0.7, color: '#ff2288' } });
      addIfMissing({ id: 'outlane_left', type: 'RolloverSwitch', x: 2.2, y: 24.5, params: { radius: 1.1 } });
      addIfMissing({ id: 'outlane_right', type: 'RolloverSwitch', x: 49.6, y: 24.5, params: { radius: 1.1 } });
      addIfMissing({ id: 'center_saver_post', type: 'BumperPost', x: 25.9, y: 5.2, params: { radius: 0.95, color: '#ff2266' } });
      addIfMissing({ id: 'mid_target_left', type: 'StandupTarget', x: 3.2, y: 52, rotation: -90, params: { width: 3.2, color: '#ffcc00', label: '★', style: 'star' } });
    } else if (zone === 'apron') {
      addIfMissing({
        id: 'apron_wing_left', type: 'ArcadeDecal', x: 0.4, y: 2,
        params: { variant: 'apron_left', width: 14.8, height: 26, color: '#00f0ff', label: 'HYPERDRIVE', sublabel: 'LEFT KICKBACK' },
      });
      addIfMissing({
        id: 'apron_wing_right', type: 'ArcadeDecal', x: 51.4, y: 2,
        params: { variant: 'apron_right', width: 14.8, height: 26, color: '#ff2288', label: 'MULTIBALL', sublabel: 'RIGHT GATE' },
      });
      addIfMissing({
        id: 'drain_shield_sign', type: 'ArcadeDecal', x: 25.9, y: 0.8,
        params: { variant: 'plastic_card', width: 11, height: 3.2, color: '#ff3366', label: 'BALL SAVE', sublabel: 'SHOOT AGAIN' },
      });
    }
    this.commit(true);
    this.status([`Populated ${zone} zone components.`], 'ok');
  }

  private deleteSelected(): void {
    const s = this.sel;
    if (!s) return;
    this.checkpoint();
    const d = this.def;
    if (s.kind === 'module') d.modules = d.modules.filter((m) => m.id !== s.id);
    else if (s.kind === 'flipper') d.flippers = d.flippers.filter((f) => f.id !== s.id);
    else d.splines = d.splines.filter((x) => x.id !== s.id);
    this.sel = null;
    this.commit(true);
  }

  // ---------------------------------------------------------------- pointer interaction
  private hit(x: number, y: number): { sel: NonNullable<Sel>; cp?: { seg: number; idx: number } } | null {
    let best: { d: number; id: string; seg: number; idx: number } | null = null;
    for (const t of this.game.runtime.tracks) {
      t.segs.forEach((seg, si) => seg.forEach((p, pi) => {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < 1.8 && (!best || d < best.d)) best = { d, id: t.id, seg: si, idx: pi };
      }));
    }
    if (best) { const b = best as { id: string; seg: number; idx: number }; return { sel: { kind: 'spline', id: b.id }, cp: { seg: b.seg, idx: b.idx } }; }
    let bi: { d: number; sel: NonNullable<Sel> } | null = null;
    const consider = (kind: 'module' | 'flipper', id: string, px: number, py: number): void => {
      const d = Math.hypot(px - x, py - y);
      if (d < 3.5 && (!bi || d < bi.d)) bi = { d, sel: { kind, id } };
    };
    this.def.modules.forEach((m) => consider('module', m.id, m.x, m.y));
    this.def.flippers.forEach((f) => consider('flipper', f.id, f.x, f.y));
    return bi ? { sel: (bi as { sel: NonNullable<Sel> }).sel } : null;
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.editing) return;
    const p = this.game.gfx.pickPlayfield(e.clientX, e.clientY);
    if (!p) return;
    if (this.tool) { this.place(this.tool, snap(p.x), snap(p.y)); return; }
    const h = this.hit(p.x, p.y);
    if (!h) {
      this.sel = null;
      this.renderAll();
      this.refreshGizmos();
      return;
    }
    this.sel = h.sel;
    this.workspace = 'build';
    this.subTab = 'style';
    this.checkpoint();
    if (h.cp) {
      const sp = this.def.splines.find((s) => s.id === h.sel.id)!;
      const track = this.game.runtime.tracks.find((t) => t.id === sp.id);
      if (track) sp.segments = track.segs.map((seg) => seg.map((q) => [q.x, q.y, q.z]));
      if (h.cp.seg === 0 && h.cp.idx <= 1) delete sp.snapStart;
      if (h.cp.seg === sp.segments.length - 1 && h.cp.idx >= 2) delete sp.snapEnd;
      this.drag = { kind: 'cp', ...h.cp };
    } else {
      const it = this.itemPos(h.sel);
      this.drag = { kind: 'item', dx: (it?.x ?? p.x) - p.x, dy: (it?.y ?? p.y) - p.y };
    }
    this.renderAll();
    this.refreshGizmos();
    e.preventDefault();
  };

  private itemPos(s: NonNullable<Sel>): { x: number; y: number } | undefined {
    return s.kind === 'module' ? this.def.modules.find((m) => m.id === s.id) : s.kind === 'flipper' ? this.def.flippers.find((f) => f.id === s.id) : undefined;
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.drag || !this.sel || !this.editing) return;
    const p = this.game.gfx.pickPlayfield(e.clientX, e.clientY);
    if (!p) return;
    const d = this.drag;
    if (d.kind === 'item') {
      const it = this.itemPos(this.sel);
      if (it) { it.x = snap(p.x + d.dx); it.y = snap(p.y + d.dy); }
    } else {
      const sp = this.def.splines.find((s) => s.id === this.sel!.id);
      if (!sp) return;
      const x = snap(p.x), y = snap(p.y);
      const seg = sp.segments[d.seg]!, pt = seg[d.idx]!;
      const ddx = x - pt[0]!, ddy = y - pt[1]!;
      pt[0] = x; pt[1] = y;
      if (d.idx === 0 || d.idx === 3) {
        const hnd = seg[d.idx === 0 ? 1 : 2]!;
        hnd[0] = hnd[0]! + ddx; hnd[1] = hnd[1]! + ddy;
        const nb = d.idx === 0 ? sp.segments[d.seg - 1] : sp.segments[d.seg + 1];
        if (nb) {
          const j = nb[d.idx === 0 ? 3 : 0]!, jh = nb[d.idx === 0 ? 2 : 1]!;
          j[0] = x; j[1] = y; jh[0] = jh[0]! + ddx; jh[1] = jh[1]! + ddy;
        }
      }
    }
    this.commit();
  };

  private onUp = (): void => {
    const d = this.drag;
    this.drag = null;
    if (!d || !this.sel) return;
    if (d.kind === 'cp') {
      const sp = this.def.splines.find((s) => s.id === this.sel!.id);
      if (sp) {
        const first = d.seg === 0 && d.idx === 0, last = d.seg === sp.segments.length - 1 && d.idx === 3;
        const pt = sp.segments[d.seg]![d.idx]!;
        const port = (first || last) ? this.game.runtime.ports.nearest(pt[0]!, pt[1]!, 3) : undefined;
        if (port && first) sp.snapStart = port.id;
        if (port && last) sp.snapEnd = port.id;
      }
    }
    this.commit(true);
  };

  private onKey = (e: KeyboardEvent): void => {
    if (!this.editing) return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) { this.deleteSelected(); e.preventDefault(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { this.undo(); e.preventDefault(); }
    else if (e.key === 'Escape') { this.tool = null; this.sel = null; this.renderAll(); this.refreshGizmos(); }
  };

  // ---------------------------------------------------------------- panel events
  private onClick = (e: MouseEvent): void => {
    const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!el) return;
    const act = el.dataset['act'];
    const d = this.def;
    switch (act) {
      case 'set-workspace': {
        const ws = el.dataset['ws'] as 'build' | 'logic';
        this.workspace = ws;
        this.subTab = ws === 'build' ? (this.sel ? 'style' : 'catalog') : 'rules';
        this.renderAll();
        break;
      }
      case 'set-subtab': {
        this.subTab = el.dataset['sub'] ?? 'catalog';
        this.renderAll();
        break;
      }
      case 'set-style': {
        const st = el.dataset['style']!;
        this.checkpoint();
        if (this.sel?.kind === 'module') {
          const m = d.modules.find((x) => x.id === this.sel!.id);
          if (m) {
            m.params = m.params ?? {};
            m.params['style'] = st;
          }
        } else if (this.sel?.kind === 'flipper') {
          const f = d.flippers.find((x) => x.id === this.sel!.id);
          if (f) f.style = st;
        } else if (this.sel?.kind === 'spline') {
          const sp = d.splines.find((x) => x.id === this.sel!.id);
          if (sp) sp.style = st;
        }
        this.commit(true);
        break;
      }
      case 'set-color': {
        const col = el.dataset['color']!;
        this.checkpoint();
        if (this.sel?.kind === 'module') {
          const m = d.modules.find((x) => x.id === this.sel!.id);
          if (m) {
            m.params = m.params ?? {};
            m.params['color'] = col;
          }
        } else if (this.sel?.kind === 'flipper') {
          const f = d.flippers.find((x) => x.id === this.sel!.id);
          if (f) f.color = col;
        } else if (this.sel?.kind === 'spline') {
          const sp = d.splines.find((x) => x.id === this.sel!.id);
          if (sp) sp.color = col;
        }
        this.commit(true);
        break;
      }
      case 'set-theme-preset': {
        const preset = el.dataset['preset'] as TableThemeDef['preset'];
        this.checkpoint();
        d.theme = d.theme ?? {};
        d.theme.preset = preset;
        const cfg = THEME_PRESETS[preset ?? 'hyperdrive'];
        if (cfg) {
          d.theme.primaryAccent = cfg.primary;
          d.theme.secondaryAccent = cfg.secondary;
          d.theme.centerTitle = cfg.centerTitle;
          d.theme.archTitle = cfg.archTitle;
        }
        this.game.gfx.applyTheme?.(d.theme);
        this.commit(true);
        this.status([`Applied ${cfg?.centerTitle ?? preset} theme preset.`], 'ok');
        break;
      }
      case 'tool': {
        this.tool = this.tool === el.dataset['tool'] ? null : el.dataset['tool']!;
        this.renderPalette();
        break;
      }
      case 'fill-zone': {
        this.fillZone(el.dataset['zone'] ?? 'top');
        break;
      }
      case 'delete': this.deleteSelected(); break;
      case 'add-seg': {
        const sp = d.splines.find((s) => s.id === this.sel?.id);
        if (!sp) break;
        this.checkpoint();
        const last = sp.segments[sp.segments.length - 1]!, a = last[3]!, h = last[2]!;
        const tx = a[0]! - h[0]!, ty = a[1]! - h[1]!;
        sp.segments.push([[a[0]!, a[1]!, a[2]!], [a[0]! + tx, a[1]! + ty, a[2]!], [a[0]! + tx * 2 + 4, a[1]! + ty * 2 + 6, a[2]!], [a[0]! + tx * 3 + 8, a[1]! + ty * 3 + 12, a[2]!]]);
        delete sp.snapEnd;
        this.commit(true);
        break;
      }
      case 'del-seg': {
        const sp = d.splines.find((s) => s.id === this.sel?.id);
        if (!sp || sp.segments.length < 2) break;
        this.checkpoint(); sp.segments.pop(); delete sp.snapEnd; this.commit(true);
        break;
      }
      case 'add-rule': {
        this.checkpoint();
        const rule: Rule = { id: this.uniqueRuleId(), when: { event: 'ON_SWITCH_HIT' }, do: [{ type: 'ADD_SCORE', points: 100 }] };
        d.rules.rules.push(rule); this.commit(true);
        break;
      }
      case 'del-rule': this.checkpoint(); d.rules.rules.splice(Number(el.dataset['i']), 1); this.commit(true); break;
      case 'export': this.download(); break;
      case 'copy': void navigator.clipboard?.writeText(JSON.stringify(d, null, 2)).then(() => this.status(['Copied table JSON to clipboard.'], 'ok')); break;
      case 'undo': this.undo(); break;
      case 'reset-starter': void this.loadStarter(); break;
      case 'apply-paste': {
        const ta = this.panel.querySelector('textarea[data-scope="paste"]') as HTMLTextAreaElement;
        this.importText(ta.value);
        break;
      }
    }
  };

  private uniqueRuleId(): string {
    const ids = new Set(this.def.rules.rules.map((r) => r.id));
    let n = 1;
    while (ids.has(`rule_${n}`)) n++;
    return `rule_${n}`;
  }

  private onChange = (e: Event): void => {
    const el = e.target as HTMLInputElement;
    const ds = el.dataset;
    const d = this.def;
    const num = (): number | null => { const n = Number(el.value); return Number.isFinite(n) ? n : null; };
    switch (ds['scope']) {
      case 'module': {
        const m = d.modules.find((x) => x.id === this.sel?.id);
        if (!m) return;
        this.checkpoint();
        const k = ds['key']!;
        if (k === 'params') {
          try { m.params = JSON.parse(el.value || '{}') as Record<string, unknown>; } catch { this.status(['params is not valid JSON'], 'error'); return; }
        } else { const n = num(); if (n === null) return; (m as unknown as Record<string, number>)[k] = n; }
        this.commit(true);
        break;
      }
      case 'mparam': {
        const m = d.modules.find((x) => x.id === this.sel?.id);
        if (!m) return;
        this.checkpoint();
        m.params = m.params ?? {};
        const k = ds['key']!;
        if (el.type === 'number') {
          const n = num();
          if (n !== null) m.params[k] = n;
        } else {
          m.params[k] = el.value;
        }
        this.commit(true);
        break;
      }
      case 'flipper': {
        const f = d.flippers.find((x) => x.id === this.sel?.id);
        if (!f) return;
        this.checkpoint();
        const k = ds['key']!;
        if (k === 'side') f.side = el.value as 'left' | 'right';
        else if (k === 'color') f.color = el.value;
        else { const n = num(); if (n === null) return; (f as unknown as Record<string, number>)[k] = n; }
        this.commit(true);
        break;
      }
      case 'spline': {
        const s = d.splines.find((x) => x.id === this.sel?.id);
        if (!s) return;
        this.checkpoint();
        const k = ds['key']!;
        if (k === 'kind') s.kind = el.value as SplineKind;
        else if (k === 'color') s.color = el.value;
        else if (k === 'snapStart' || k === 'snapEnd') { if (el.value) s[k] = el.value; else delete s[k]; }
        else { const n = num(); if (n === null) return; (s as unknown as Record<string, number>)[k] = n; }
        this.commit(true);
        break;
      }
      case 'theme': {
        this.checkpoint();
        d.theme = d.theme ?? {};
        const k = ds['key'] as keyof TableThemeDef;
        (d.theme as unknown as Record<string, unknown>)[k] = el.value;
        this.game.gfx.applyTheme?.(d.theme);
        this.commit(true);
        break;
      }
      case 'playfield-art-file': {
        const f = el.files?.[0];
        if (f) {
          const reader = new FileReader();
          reader.onload = () => {
            this.checkpoint();
            d.theme = d.theme ?? {};
            d.theme.customPlayfieldUrl = String(reader.result);
            this.game.gfx.applyTheme?.(d.theme);
            this.commit(true);
            this.status(['Custom playfield art loaded.'], 'ok');
          };
          reader.readAsDataURL(f);
        }
        break;
      }
      case 'cp': {
        const s = d.splines.find((x) => x.id === this.sel?.id);
        const n = num();
        if (!s || n === null) return;
        this.checkpoint();
        const si = Number(ds['seg']), pi = Number(ds['pt']), ai = Number(ds['axis']);
        s.segments[si]![pi]![ai] = n;
        if (si === 0 && pi <= 1 && ai < 2) delete s.snapStart;
        if (si === s.segments.length - 1 && pi >= 2 && ai < 2) delete s.snapEnd;
        this.commit(true);
        break;
      }
      case 'rule': this.editRule(el); break;
      case 'modes': {
        try {
          const j = JSON.parse(el.value) as { ballsPerGame?: number; initialState: string; vars: Record<string, never>; states: Record<string, never> };
          this.checkpoint();
          d.rules.ballsPerGame = j.ballsPerGame; d.rules.initialState = j.initialState; d.rules.vars = j.vars; d.rules.states = j.states;
          this.commit(true);
        } catch (err) { this.status([`modes JSON: ${(err as Error).message}`], 'error'); }
        break;
      }
      case 'meta': this.checkpoint(); d.name = el.value; this.showValidation(); break;
      case 'file': {
        const f = el.files?.[0];
        if (f) void f.text().then((t) => this.importText(t));
        break;
      }
    }
  };

  private editRule(el: HTMLInputElement): void {
    const i = Number(el.dataset['i']);
    const rule = this.def.rules.rules[i];
    if (!rule) return;
    const k = el.dataset['key']!;
    const prev = clone(rule);
    if (k === 'id') rule.id = el.value;
    else if (k === 'event') rule.when.event = el.value as Rule['when']['event'];
    else if (k === 'whenId') { if (el.value) rule.when.id = el.value; else delete rule.when.id; }
    else if (k === 'if') {
      const r = parseConditions(el.value);
      if (r.errors.length) { this.status(r.errors, 'error'); el.classList.add('bad'); return; }
      if (r.conditions.length) rule.if = r.conditions; else delete rule.if;
    } else if (k === 'do') {
      const r = parseActions(el.value);
      if (r.errors.length) { this.status(r.errors.map((m) => `rule ${rule.id}: ${m}`), 'error'); el.classList.add('bad'); return; }
      rule.do = r.actions;
    }
    el.classList.remove('bad');
    this.history.push(JSON.stringify({ ...this.def, rules: { ...this.def.rules, rules: this.def.rules.rules.map((x, j) => (j === i ? prev : x)) } }));
    this.commit(true);
  }

  // ---------------------------------------------------------------- import / export
  private download(): void {
    const blob = new Blob([JSON.stringify(this.def, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.def.name.replace(/[^\w-]+/g, '_') || 'table'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.status([`Exported ${a.download}`], 'ok');
  }

  importText(text: string): void {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch (err) { this.status([`Not valid JSON: ${(err as Error).message}`], 'error'); return; }
    const v = validateTable(raw);
    if (v.errors.length) { this.status(['Import rejected:', ...v.errors], 'error'); return; }
    this.checkpoint();
    this.sel = null;
    this.game.load(raw as TableDef);
    this.renderAll();
    if (v.warnings.length) this.status(['Imported with warnings:', ...v.warnings], 'warn');
    else this.status([`Imported "${this.def.name}".`], 'ok');
  }

  async loadStarter(): Promise<void> {
    const res = await fetch(`${import.meta.env.BASE_URL}tables/default_table.json`);
    this.importText(await res.text());
  }

  // ---------------------------------------------------------------- gizmos
  refreshGizmos(): void {
    const g = this.game.gizmos;
    for (const c of [...g.children]) {
      g.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
      ((c as THREE.Mesh).material as THREE.Material | undefined)?.dispose();
    }
    if (!this.editing && this.game.mode !== 'edit') return;

    // Subtle zone boundary guides for Top Arch, Flippers/Outlanes, and Lower Apron
    const addZoneBox = (x0: number, y0: number, x1: number, y1: number, color: number) => {
      const pts = [
        toLocal(x0, y0, 0.25), toLocal(x1, y0, 0.25),
        toLocal(x1, y0, 0.25), toLocal(x1, y1, 0.25),
        toLocal(x1, y1, 0.25), toLocal(x0, y1, 0.25),
        toLocal(x0, y1, 0.25), toLocal(x0, y0, 0.25),
      ];
      const lg = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35, depthTest: false }));
      line.renderOrder = 8;
      g.add(line);
    };
    addZoneBox(2, 90, 50, 117, 0x00f0ff); // Top Arch Zone
    addZoneBox(0.5, 11, 51, 46, 0xffaa00); // Flipper & Outlanes Zone
    addZoneBox(0.5, -12, 51, 11, 0xff2288); // Below-Flippers Apron Zone

    const ring = (x: number, y: number, r: number, color: number): void => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.35, 28), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      toLocal(x, y, 0.4, m.position);
      m.renderOrder = 10;
      g.add(m);
    };
    const sel = this.sel;
    const col = (kind: string, id: string): number => (sel && sel.kind === kind && sel.id === id ? 0xffee00 : 0x4aa3ff);
    this.def.modules.forEach((m) => ring(m.x, m.y, 2.4, col('module', m.id)));
    this.def.flippers.forEach((f) => ring(f.x, f.y, 2.4, col('flipper', f.id)));
    for (const p of this.game.runtime.ports.all()) ring(p.x, p.y, 0.9, 0x33ff99);
    for (const t of this.game.runtime.tracks) {
      const selected = sel?.kind === 'spline' && sel.id === t.id;
      t.segs.forEach((seg) => {
        const pts = seg.map((p) => toLocal(p.x, p.y, p.z + 0.6));
        const lg = new THREE.BufferGeometry().setFromPoints([pts[0]!, pts[1]!, pts[1]!, pts[2]!, pts[2]!, pts[3]!]);
        const line = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: selected ? 0xffee00 : 0x888899, depthTest: false }));
        line.renderOrder = 10;
        g.add(line);
        pts.forEach((v, i) => {
          const s = new THREE.Mesh(new THREE.SphereGeometry(i === 0 || i === 3 ? 0.85 : 0.6, 12, 8), new THREE.MeshBasicMaterial({ color: i === 0 || i === 3 ? 0xff9a2e : 0x2ee6ff, depthTest: false }));
          s.position.copy(v);
          s.renderOrder = 11;
          g.add(s);
        });
      });
    }
  }
}
