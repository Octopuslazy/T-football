import * as PIXI from 'pixi.js';

export default class Ball2 extends PIXI.Container {
  private sprite: PIXI.Sprite;
  private _onResize: () => void;

  constructor() {
    super();
    const tex = PIXI.Texture.from('./arts/ball.png');
    this.sprite = new PIXI.Sprite(tex);
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(0.1);
    this.addChild(this.sprite);

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.x = w / 1.4;
    this.y = 1.05*h / 2;
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
