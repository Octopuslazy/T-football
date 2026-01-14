import * as PIXI from 'pixi.js';

export default class BallCountDisplay extends PIXI.Container {
  private icons: PIXI.Sprite[] = [];
  private _count: number = 0;
  private _onResize: () => void;
  private _goal: any = null;
  private _bg: PIXI.Graphics | null = null;

  constructor() {
    super();
    this._onResize = this.layout.bind(this);
    window.addEventListener('resize', this._onResize);
    this.layout();
  }

  public setCount(n: number) {
    this._count = Math.max(0, Math.floor(n));
    this.redraw();
  }

  public setGoal(goal: any) {
    this._goal = goal;
    this.layout();
  }

  private redraw() {
    // remove existing children but keep background object reference for reuse
    this.removeChildren();
    this.icons = [];
    if (!this._bg) this._bg = new PIXI.Graphics();
    // ensure background is added first
    this.addChild(this._bg);

    if (this._count <= 0) return;

    // compute icon size to fit and scale relative to goal if available
    const screenW = window.innerWidth;
    const maxWidth = Math.min(400, screenW * 0.6);
    const paddingBase = 8;
    const baseSizeBase = 56;

    // scale base sizes by goal scale so icons remain proportional to goal
    const goalScale = (this._goal && this._goal.scale && typeof this._goal.scale.x === 'number') ? this._goal.scale.x : 1;
    const padding = Math.max(4, Math.round(paddingBase * goalScale));
    const baseSize = Math.max(20, Math.round(baseSizeBase * goalScale));

    const totalBase = this._count * baseSize + (this._count - 1) * padding;
    let size = baseSize;
    if (totalBase > maxWidth) {
      // scale down uniformly
      const scale = maxWidth / totalBase;
      size = Math.max(16, Math.floor(baseSize * scale));
    }

    for (let i = 0; i < this._count; i++) {
      const tex = PIXI.Texture.from('./arts/ball.png');
      const s = new PIXI.Sprite(tex);
      s.width = size;
      s.height = size;
      s.anchor.set(0, 0.5);
      s.x = i * (size + padding);
      s.y = Math.round(size / 2);
      this.addChild(s);
      this.icons.push(s);
    }

    // position container: if goal reference available, place at top-right of goal (above/right)
    // otherwise top-right of screen
    // set pivot to top-left for predictable placement
    this.pivot.set(0, 0);
    if (this._goal && this._goal.getGoalArea) {
      const ga = this._goal.getGoalArea();
      // place near the top-right corner of the goal with some margin
      // place a bit more to the right and higher above the goal
      const marginX = Math.round(6 * goalScale); // smaller margin -> shift right
      const marginY = Math.round(28 * goalScale); // larger margin -> move higher
      // compute full width of icons
      const fullWidth = this._count > 0 ? (this._count * size + (this._count - 1) * padding) : 0;
      this.x = ga.x + ga.width - fullWidth - marginX;
      // place slightly above the top of the goal
      this.y = ga.y - size - marginY;
      // clamp to screen bounds
      this.x = Math.max(8, Math.min(this.x, window.innerWidth - fullWidth - 8));
      this.y = Math.max(8, this.y);
    } else {
      this.x = Math.max(20, (window.innerWidth * 0.8));
      this.y = 40;
    }

    // Draw capsule background behind icons
    if (this._bg) {
      this._bg.clear();
      const fullWidth = this._count > 0 ? (this._count * size + (this._count - 1) * padding) : 0;
      const padX = Math.round(8 * goalScale);
      const padY = Math.round(6 * goalScale);
      const rectW = fullWidth + padX * 2;
      const rectH = size + padY * 2;
      const radius = Math.round(rectH / 2);

      // Draw background (white) with subtle alpha and colored border
      this._bg.beginFill(0xffffff, 1);
      this._bg.lineStyle(Math.max(2, Math.round(3 * goalScale)), 0x7a00ff, 1);
      this._bg.drawRoundedRect(0, -padY, rectW, rectH, radius);
      this._bg.endFill();

      // reposition children so icons sit inside background with padding
      // container pivot already set; adjust icon positions by padX
      for (let i = 0; i < this.icons.length; i++) {
        this.icons[i].x = padX + i * (size + padding);
        this.icons[i].y = Math.round(size / 2);
      }
    }
  }

  private layout() {
    // reposition and redraw to adapt to new screen size
    this.redraw();
  }

  public destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    super.destroy(options);
  }
}
