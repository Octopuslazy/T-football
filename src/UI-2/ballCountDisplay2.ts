import * as PIXI from 'pixi.js';
import { BASE_WIDTH } from '../constant/global';

export default class BallCountDisplay2 extends PIXI.Container {
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
    this.removeChildren();
    this.icons = [];
    if (!this._bg) this._bg = new PIXI.Graphics();
    this.addChild(this._bg);

    if (this._count <= 0) return;

    const screenW = BASE_WIDTH;
    const maxWidth = Math.min(140, screenW * 0.45);
    const paddingBase = 8;
    const baseSizeBase = 56;

    const goalScale = (this._goal && this._goal.scale && typeof this._goal.scale.x === 'number') ? this._goal.scale.x : 1;
    const padding = Math.max(5, Math.round(paddingBase * goalScale));
    const baseSize = Math.max(20, Math.round(baseSizeBase * goalScale));

    const totalBase = this._count * baseSize + (this._count - 1) * padding;
    let size = baseSize;
    if (totalBase > maxWidth) {
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

    this.pivot.set(0, 0);
    if (this._goal && this._goal.getGoalArea) {
      const ga = this._goal.getGoalArea();
      const marginX = Math.round(6 * goalScale);
      const marginY = Math.round(28 * goalScale);
      const fullWidth = this._count > 0 ? (this._count * size + (this._count - 1) * padding) : 0;
      this.x = ga.x + ga.width - fullWidth - marginX;
      this.y = ga.y - size - marginY;
      this.x = Math.max(8, Math.min(this.x, BASE_WIDTH - fullWidth - 8));
      this.y = Math.max(8, this.y);
    } else {
      this.x = Math.max(20, (BASE_WIDTH * 0.8));
      this.y = 40;
    }

    if (this._bg) {
      this._bg.clear();
      const fullWidth = this._count > 0 ? (this._count * size + (this._count - 1) * padding) : 0;
      const padX = Math.round(8 * goalScale);
      const padY = Math.round(6 * goalScale);
      const rectW = fullWidth + padX * 2;
      const rectH = size + padY * 2;
      const radius = Math.round(rectH / 2);

      this._bg.beginFill(0xffffff, 1);
      this._bg.lineStyle(Math.max(2, Math.round(3 * goalScale)), 0x7a00ff, 1);
      this._bg.drawRoundedRect(0, -padY, rectW, rectH, radius);
      this._bg.endFill();

      for (let i = 0; i < this.icons.length; i++) {
        this.icons[i].x = padX + i * (size + padding);
        this.icons[i].y = Math.round(size / 2);
      }
    }
  }

  private layout() {
    this.redraw();
  }

  public destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    super.destroy(options);
  }
}
