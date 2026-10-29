import type { LayoutMode } from '../render/Renderer';

/** Chooses Mobile-portrait vs Desktop-side-panel layout and notifies on change/resize. */
export class LayoutShell {
  mode: LayoutMode = 'desktop';
  readonly viewport = document.getElementById('viewport') as HTMLElement;
  private app = document.getElementById('app') as HTMLElement;
  private onChange: (mode: LayoutMode) => void = () => {};

  constructor() {
    window.addEventListener('resize', this.update);
    window.addEventListener('orientationchange', this.update);
    new ResizeObserver(() => this.onChange(this.mode)).observe(this.viewport);
  }

  subscribe(cb: (mode: LayoutMode) => void): void {
    this.onChange = cb;
    this.update();
  }

  private update = (): void => {
    const portraitTouch = window.innerHeight > window.innerWidth && window.innerWidth < 900;
    this.mode = portraitTouch ? 'mobile' : 'desktop';
    this.app.dataset.layout = this.mode;
    this.onChange(this.mode);
  };
}
