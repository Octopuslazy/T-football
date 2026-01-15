import * as PIXI from 'pixi.js';

export default class Ball2 extends PIXI.Container {
  private sprite: PIXI.Sprite;
  private _onResize: () => void;
  private _button: PIXI.Container | null = null;
  private _isShooting: boolean = false;
  private _homeX: number = 0;
  private _homeY: number = 0;

  // normalized target points (match goalkeeper2 targets ordering)
  private _targets = [
    { x: 0.18, y: 0.62 }, // bottom-left (1)
    { x: 0.82, y: 0.62 }, // bottom-right (7)
    { x: 0.18, y: 0.48 }, // mid-left (2)
    { x: 0.82, y: 0.48 }, // mid-right (6)
    { x: 0.18, y: 0.32 }, // upper-left (3)
    { x: 0.5, y: 0.32 },  // upper-center (4)
    { x: 0.82, y: 0.32 }, // upper-right (5)
  ];

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
    this._createButton();
  }

  private _createButton() {
    const btn = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.beginFill(0x0055ff);
    bg.drawRoundedRect(-50, -18, 100, 36, 6);
    bg.endFill();
    const txt = new PIXI.Text('Shoot', { fill: 0xffffff, fontSize: 14 });
    txt.anchor.set(0.5);
    btn.addChild(bg, txt);
    btn.interactive = true;
    btn.buttonMode = true;
    btn.on('pointerdown', () => this._onShootPress());
    this._button = btn;
    this.addChild(btn);
    this._layoutButton();
  }

  private _layoutButton() {
    if (!this._button) return;
    // Button is a child of this container — set local coords relative to the ball sprite
    // place button near the ball lower-left area (local coordinates)
    this._button.x = -60;
    this._button.y = 60;
  }

  private _onShootPress() {
    if (this._isShooting) return;
    this._isShooting = true;
    if (this._button) this._button.alpha = 0.6;
    this.shoot();
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.x = w / 1.4;
    this.y = 1.05*h / 2;
    this._homeX = this.x;
    this._homeY = this.y;
    this._layoutButton();
  }

  public refresh() {
    this.resize();
  }

  // public API to shoot the ball: after 2s snap to a random target among 7
  public shoot() {
    // delay 2s then snap
    setTimeout(() => {
      const t = this._targets[Math.floor(Math.random() * this._targets.length)];
      const screen = this._normalizedToScreen(t.x, t.y);
      if (!screen) {
        this._finishShoot();
        return;
      }
      // tween to target, then wait 2s, then tween back to home and finish
      this._tweenTo(screen.x, screen.y, 220, () => {
        setTimeout(() => {
          this._tweenTo(this._homeX, this._homeY, 220, () => this._finishShoot());
        }, 2000);
      });
    }, 2000);
  }

  private _finishShoot() {
    this._isShooting = false;
    if (this._button) this._button.alpha = 1;
  }

  // convert normalized goal coordinates (0..1) into screen coordinates using goal2.png placement
  private _normalizedToScreen(nx: number, ny: number): { x: number; y: number } | null {
    try {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const tex = PIXI.Texture.from('./arts/goal2.png');
      if (!tex || !tex.width || !tex.height) return null;
      const sx = w / tex.width;
      const sy = h / tex.height;
      const s = Math.max(sx, sy);
      const imgW = tex.width * s;
      const imgH = tex.height * s;
      const imgLeft = w / 2 - imgW / 2;
      const imgTop = h / 2 - imgH / 2;
      const tx = imgLeft + nx * imgW;
      const ty = imgTop + ny * imgH;
      return { x: tx, y: ty };
    } catch (e) { return null; }
  }

  private _tweenTo(destX: number, destY: number, duration: number, cb?: () => void) {
    const startX = this.x;
    const startY = this.y;
    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.x = startX + (destX - startX) * eased;
      this.y = startY + (destY - startY) * eased;
      if (t < 1) requestAnimationFrame(animate);
      else if (cb) cb();
    };
    requestAnimationFrame(animate);
  }

  destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    try { this.sprite.destroy(); } catch (e) {}
    super.destroy(options);
  }
}
