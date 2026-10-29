# Magnum Pinball

High-precision 2.5D retro arcade pinball simulator powered by Rapier2D physics (240 Hz fixed-step WebAssembly + continuous collision detection) and Three.js PBR rendering, featuring the **Arcade Table Creator** suite and procedural Web Audio engine.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck + production build (dist/ is Capacitor / Tauri ready)
```

## Features
* **Magnum Title Screen & Main Menu:** Authentic retro arcade overlay with Play Arcade, Arcade Table Creator, Options (volume, camera perspectives, controls), and About modals.
* **240 Hz Rapier2D WASM Physics:** Fixed-timestep physics loop preventing ball tunneling, supporting layered ramps, wireforms, drop targets, and solenoids.
* **Arcade Table Creator:** Sims-style live component look selector, 1-click neon color swatches, 5 board themes (`hyperdrive`, `cyberpunk`, `solar`, `matrix`, `wood`), rule scripting DSL, and JSON import/export.
* **Three.js PBR Graphics:** Studio environment reflections, procedural translite marquee and playfield decals, and ACES Filmic tonemapping.
* **Zero-Latency Procedural Audio:** Mathematical Web Audio synthesizer generating solenoids, chimes, and speed-modulated ball rolling without asset downloads.

## Controls
| Action | Keyboard | Touch |
|---|---|---|
| Flippers | `Z` / `←` / `L-Shift` · `/` / `→` / `R-Shift` | bottom-left / bottom-right halves |
| Plunger | hold + release `Space` / `↓` | drag down in shooter strip |
| Nudge | `A` / `D` / `W` | fast swipe in upper playfield / device shake |
| Restart Game | `R` | - |
| Toggle Menu | `Esc` / Toolbar `⌂ Menu` button | - |

## Table JSON (`public/tables/default_table.json`)
```jsonc
{
  "schema": "pinball-table", "version": 1, "name": "Magnum Classic",
  "flippers": [{ "id": "flipper_left", "x": 16.5, "y": 11.5, "side": "left" }],
  "modules":  [{ "id": "pop_a", "type": "PopBumper", "x": 30, "y": 72, "rotation": 0, "layer": 0, "params": {} }],
  "splines":  [{ "id": "left_ramp", "kind": "ramp", "layer": 1, "width": 6, "snapStart": "ramp_entry.out",
                 "segments": [[[14,52,0],[14,68,2],[18,82,8],[30,92,8]]] }],
  "rules": { "initialState": "BaseMode", "vars": {...}, "states": {...}, "rules": [ ... ] }
}
```

## Tests
```bash
npx tsx scripts/headless-step5.ts        # JSON schema, rules, DSL, gate, scoop, bot play, import/export
node scripts/test-menu.mjs               # Puppeteer test: Title screen, options, about, creator
node scripts/test-editor.mjs             # Puppeteer test: Visual swatches, theme presets, rule builder
```
