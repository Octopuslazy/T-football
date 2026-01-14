import * as PIXI from 'pixi.js';

// Simple full-screen background using ./arts/goal2.png
export default class GoalBackground extends PIXI.Container {
  private sprite: PIXI.Sprite;
  private _onResize: () => void;

  constructor() {
    super();
    const tex = PIXI.Texture.from('./arts/goal2.png');
    this.sprite = new PIXI.Sprite(tex);
    this.sprite.anchor.set(0.5, 0.5);
    this.addChild(this.sprite);

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);

    // Initial layout
    this.resize();
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.sprite.x = w / 2;
    this.sprite.y = h / 2;

    const tex = this.sprite.texture;
    if (tex && tex.width && tex.height) {
      const sx = w / tex.width;
      const sy = h / tex.height;
      const s = Math.max(sx, sy);
      this.sprite.scale.set(s, s);
    } else {
      this.sprite.scale.set(1, 1);
    }
  }

  // Public refresh so external callers can force a layout (useful after
  // being re-added to the scene or when window size changed externally).
  public refresh() {
    this.resize();
  }

  destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    try { this.sprite.destroy(); } catch (e) {}
    super.destroy(options);
  }
}
