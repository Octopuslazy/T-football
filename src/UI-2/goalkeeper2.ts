import * as PIXI from 'pixi.js';

// Simple static goalkeeper sprite for Other mode.
export default class Goalkeeper2 extends PIXI.Container {
  private sprite: PIXI.Sprite;
  private _onResize: () => void;

  constructor() {
    super();
    const tex = PIXI.Texture.from('./arts/gkeeper.png');
    this.sprite = new PIXI.Sprite(tex);
    this.sprite.anchor.set(0.5, 1); // anchor bottom-center so feet align
    this.addChild(this.sprite);

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);

    this.resize();
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // place horizontally centered, vertically around 66% down the screen
    this.x = w / 2;
    this.y = h * 0.72;

    // scale sprite relative to screen width (make goalkeeper look proportionate)
    const desiredWidth = Math.max(120, Math.round(w * 0.22));
    const tex = this.sprite.texture;
    if (tex && tex.width) {
      const s = 1.3*desiredWidth / tex.width;
      this.sprite.scale.set(s, s);
    } else {
      this.sprite.scale.set(0.7, 0.7);
    }
  }

  public refresh() {
    this.resize();
  }

  destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    try { this.sprite.destroy(); } catch (e) {}
    super.destroy(options);
  }
}
