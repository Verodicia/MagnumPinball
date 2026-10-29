import type { IPinballEntity } from '../core/IPinballEntity';
import { createModule } from './factory';
import type { ModuleContext, ModuleDef, PlayfieldModule } from './PlayfieldModule';

/** Owns all modules, routes physics contacts to them, and ticks them at the fixed step. */
export class ModuleHost implements IPinballEntity {
  readonly id = 'modules';
  readonly modules = new Map<string, PlayfieldModule>();
  private byCollider = new Map<number, PlayfieldModule>();
  private ctx: ModuleContext;

  constructor(ctx: Omit<ModuleContext, 'host'>) {
    this.ctx = { ...ctx, host: this };
    ctx.pw.collisionListeners.push((h1, h2, started) => {
      for (const [mine, other] of [[h1, h2], [h2, h1]] as const) {
        const m = this.byCollider.get(mine);
        const ball = this.ctx.layers.getBall(other);
        if (!m || !ball) continue;
        const col = m['colliders'].find((c) => c.handle === mine);
        if (col) m.onContact(col, ball, started);
      }
    });
  }

  claim(handle: number, m: PlayfieldModule): void { this.byCollider.set(handle, m); }
  unclaim(handle: number): void { this.byCollider.delete(handle); }

  add(def: ModuleDef): PlayfieldModule {
    const m = createModule(def);
    m.mount(this.ctx);
    this.modules.set(def.id, m);
    return m;
  }

  remove(id: string): void {
    this.modules.get(id)?.dispose();
    this.modules.delete(id);
  }

  fire(moduleId: string, port: string): void {
    this.modules.get(moduleId)?.fire(port);
  }

  update(dt: number): void {
    for (const m of this.modules.values()) m.update(dt);
  }
}
