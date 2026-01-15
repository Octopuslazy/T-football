import * as PIXI from 'pixi.js';

export default class Ball2 extends PIXI.Container {
  private sprite: PIXI.Sprite;
  private _onResize: () => void;
  private _button: PIXI.Container | null = null;
  private _isShooting: boolean = false;
  private _homeX: number = 0;
  private _homeY: number = 0;
  private _homeScale: number = 1;
  private _currentTargetIndex: number | null = null;
  // optional reference to goalkeeper container (set by game code)
  public keeper: PIXI.Container | null = null;
  private _tweenCancelled: boolean = false;
  private _hasDeflected: boolean = false;
  private _collideScaleThreshold = 2.3; // scale multiplier to enable collision deflection (exact match required)

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
    this._homeScale = this.sprite.scale.x;

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
    (btn as any).buttonMode = true;
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
      const idx = Math.floor(Math.random() * this._targets.length);
      this._currentTargetIndex = idx;
      const t = this._targets[idx];
      const screen = this._normalizedToScreen(t.x, t.y);
      if (!screen) {
        this._finishShoot();
        return;
      }
      // tween to target, then wait 2s, then tween back to home and finish
      this._tweenTo(screen.x, screen.y, 700, () => {
        setTimeout(() => {
          this._tweenTo(this._homeX, this._homeY, 220, () => this._finishShoot(), false);
        }, 300);
      }, true);
    }, 300);
  }

  private _finishShoot() {
    this._isShooting = false;
    if (this._button) this._button.alpha = 1;
    this._currentTargetIndex = null;
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

  private _tweenTo(destX: number, destY: number, duration: number, cb?: () => void, scaleUp?: boolean) {
    // Quadratic Bezier arc from current (start) to dest with a single control point.
    const startX = this.x;
    const startY = this.y;
    // midpoint
    const midX = (startX + destX) / 2;
    const midY = (startY + destY) / 2;
    // perpendicular vector from start->dest
    const dx = destX - startX;
    const dy = destY - startY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len; // normalized perp x
    const ny = dx / len;  // normalized perp y
    // arc magnitude proportional to distance, clamped
    const arcMag = Math.min(250, Math.max(40, len * 0.25));
    // bias upward (smaller y) a bit so arc looks natural
    const controlX = midX + nx * arcMag;
    const controlY = midY + ny * arcMag - Math.abs(len) * 0.02;

    this._tweenCancelled = false;
    const start = performance.now();
    const startScale = (this.sprite && this.sprite.scale) ? this.sprite.scale.x : 1;
    const targetScale = (typeof scaleUp === 'boolean') ? (scaleUp ? this._homeScale * 2.3 : this._homeScale) : startScale;
    const animate = (now: number) => {
      if (this._tweenCancelled) return;
      const tRaw = Math.min(1, (now - start) / duration);
      const t = tRaw < 0.5 ? 2 * tRaw * tRaw : -1 + (4 - 2 * tRaw) * tRaw; // ease
      // Quadratic Bézier interpolation
      const u = 1 - t;
      const u2 = u * u;
      const t2 = t * t;
      const twoUt = 2 * u * t;
      const px = u2 * startX + twoUt * controlX + t2 * destX;
      const py = u2 * startY + twoUt * controlY + t2 * destY;
      this.x = px;
      this.y = py;

      // scale interpolation
      try {
        const s = startScale + (targetScale - startScale) * t;
        if (this.sprite && this.sprite.scale) this.sprite.scale.set(s, s);
      } catch (e) {}

      // collision detection: if keeper provided and ball is scaled beyond threshold
      try {
        const keeperObj = this.keeper as any;
        if (!this._hasDeflected && keeperObj && keeperObj.isAnimating && this._currentTargetIndex != null && keeperObj.currentTargetIndex != null && keeperObj.currentTargetIndex === this._currentTargetIndex && (this.sprite.scale.x === this._homeScale * this._collideScaleThreshold)) {
          const ballB = this.getBounds();
          const keeperB = keeperObj.getBounds();
          const overlap = ballB.x < keeperB.x + keeperB.width && ballB.x + ballB.width > keeperB.x &&
                          ballB.y < keeperB.y + keeperB.height && ballB.y + ballB.height > keeperB.y;
          if (overlap) {
            console.log('Ball2 collision: overlap detected', {
              ballScale: this.sprite?.scale?.x,
              homeScale: this._homeScale,
              scaleThreshold: this._homeScale * this._collideScaleThreshold,
              ballPos: { x: this.x, y: this.y },
              keeperBounds: keeperB,
              ballBounds: ballB,
              keeperAnimating: !!keeperObj.isAnimating,
            });
            // cancel the current tween and perform a deflection away from keeper center
            this._tweenCancelled = true;
            this._hasDeflected = true;
            const kcx = keeperB.x + keeperB.width / 2;
            const kcy = keeperB.y + keeperB.height / 2;
            const vx = this.x - kcx;
            const vy = this.y - kcy;
            const vlen = Math.sqrt(vx * vx + vy * vy) || 1;
            const nxv = vx / vlen;
            const nyv = vy / vlen;
            // deflect distance and duration
            const deflectDist = Math.max(160, vlen * 1.2);
            const deflectTargetX = this.x + nxv * deflectDist;
            const deflectTargetY = this.y + nyv * deflectDist;
            // short deflect tween, then return home
            this._tweenTo(deflectTargetX, deflectTargetY, 300, () => {
              this._tweenTo(this._homeX, this._homeY, 400, () => {
                // reset scale and flags
                try { if (this.sprite && this.sprite.scale) this.sprite.scale.set(this._homeScale, this._homeScale); } catch(e){}
                this._hasDeflected = false;
                this._currentTargetIndex = null;
                if (cb) cb();
              }, false);
            }, false);
            return;
          }
        }
      } catch (e) {}

      if (tRaw < 1) requestAnimationFrame(animate);
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
