import './styles/main.css';
import { Editor } from './editor/Editor';
import { Game } from './game/Game';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { Renderer } from './render/Renderer';
import type { TableDef } from './table/schema';
import { validateTable } from './table/validate';
import { LayoutShell } from './ui/LayoutShell';
import { TitleMenu } from './ui/TitleMenu';

async function boot(): Promise<void> {
  const layout = new LayoutShell();
  const gfx = new Renderer(layout.viewport);
  await PhysicsWorld.create(); // one-time Rapier WASM init; later worlds are created synchronously

  const game = new Game(gfx, layout);
  const editor = new Editor(game);
  const titleMenu = new TitleMenu(game, gfx);

  layout.subscribe((m) => {
    gfx.setLayout(m);
    if (m === 'mobile' && game.mode === 'edit') game.setMode('play'); // editing is a desktop feature
  });

  const res = await fetch(`${import.meta.env.BASE_URL}tables/default_table.json`);
  const def = (await res.json()) as TableDef;
  const v = validateTable(def);
  if (v.errors.length) console.error('default_table.json is invalid:', v.errors);
  game.load(def);
  editor.renderAll();

  document.getElementById('btn-menu')?.addEventListener('click', () => titleMenu.toggle());
  document.getElementById('btn-play')!.addEventListener('click', () => {
    titleMenu.hide();
    game.setMode('play');
  });
  document.getElementById('btn-edit')!.addEventListener('click', () => {
    titleMenu.hide();
    game.setMode('edit');
  });
  const mute = document.getElementById('btn-mute')!;
  mute.addEventListener('click', () => {
    game.audio.setMuted(!game.audio.muted);
    mute.textContent = game.audio.muted ? '🔇' : '🔊';
  });
  game.start();

  // Show Magnum Pinball title screen and main menu on boot
  titleMenu.show('main');

  (window as unknown as { pinball: unknown }).pinball = { game, editor, titleMenu }; // handy for debugging / e2e
}

void boot();
