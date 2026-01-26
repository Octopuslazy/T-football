import * as PIXI from 'pixi.js';
import { BASE_WIDTH, BASE_HEIGHT, HIT_RADIUS, COLLIDE_SCALE_THRESHOLD, TWEEN_ARC_FACTOR_DEFAULT } from '../constant/global';

export default class Ball2 extends PIXI.Container {
  private sprite: PIXI.Sprite;
  private _onResize: () => void;
  // shoot button removed
  private _isShooting: boolean = false;
  private _homeX: number = 0;
  private _homeY: number = 0;
  private _homeScale: number = 1;
  private _currentTargetIndex: number | null = null;
  // optional reference to goalkeeper container (set by game code)
  public keeper: PIXI.Container | null = null;
  // optional callback invoked when the ball is deflected (useful to suppress other animations)
  public onDeflect?: () => void;
  private _suppressArrival: boolean = false;
  private _tweenCancelled: boolean = false;
  private _hasDeflected: boolean = false;
  private _collideScaleThreshold = COLLIDE_SCALE_THRESHOLD; // scale multiplier to enable collision deflection (larger so snap is more visible)

  // normalized target points (match goalkeeper2 targets ordering)
  private _targets = [
    { x: 0.228, y: 0.75 },
    { x: 0.78, y: 0.75 },
    { x: 0.33, y: 0.69 },
    { x: 0.66, y: 0.69 },
    { x: 0.228, y: 0.63 },
    { x: 0.50, y: 0.63 },
    { x: 0.78, y: 0.63 },
  ];

  constructor() {
    super();
    // use generated white circle texture for the ball visual (canvas-based)
    const _r = 48;
    const _diam = _r * 2;
    const _c = document.createElement('canvas');
    _c.width = _diam;
    _c.height = _diam;
    const _ctx = _c.getContext('2d');
    if (_ctx) {
      _ctx.fillStyle = '#ffffff';
      _ctx.beginPath();
      _ctx.arc(_r, _r, _r, 0, Math.PI * 2);
      _ctx.fill();
    }
    const _tex = PIXI.Texture.from(_c);
    this.sprite = new PIXI.Sprite(_tex);
    this.sprite.anchor.set(0.5);
    // initial scale: x=1, y=0.6 as requested
    this.sprite.scale.set(0.6, 0.6);
    this.addChild(this.sprite);
    this._homeScale = this.sprite.scale.x;

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  // Public API: fly the ball along a quadratic Bézier defined by start, control and end points.
  // This allows the ball to follow a player-drawn arc instead of snapping to a preselected zone.
  public shootAlongPath(startX: number, startY: number, controlX: number, controlY: number, endX: number, endY: number, duration: number = 1000, scaleUp: boolean = false) {
    // cancel any existing tweens
    this._tweenCancelled = true;
    this._tweenCancelled = false;
    const start = performance.now();
    const startScale = (this.sprite && this.sprite.scale) ? this.sprite.scale.x : 1;
    const targetScale = (scaleUp) ? (this._homeScale * this._collideScaleThreshold) : this._homeScale;
    const animate = (now: number) => {
      if (this._tweenCancelled) return;
      const tRaw = Math.min(1, (now - start) / duration);
      const t = tRaw < 0.5 ? 2 * tRaw * tRaw : -1 + (4 - 2 * tRaw) * tRaw; // ease
      const u = 1 - t;
      const u2 = u * u;
      const t2 = t * t;
      const twoUt = 2 * u * t;
      const px = u2 * startX + twoUt * controlX + t2 * endX;
      const py = u2 * startY + twoUt * controlY + t2 * endY;
      this.x = px; this.y = py;
      try {
        const s = startScale + (targetScale - startScale) * t;
        if (this.sprite && this.sprite.scale) this.sprite.scale.set(s, s);
      } catch (e) {}

      // keeper collision: require precise head position match to save
      try {
        const keeperObj = this.keeper as any;
        if (!this._hasDeflected && keeperObj && keeperObj.isAnimating) {
          const headPos = (typeof keeperObj.getActiveHeadPosition === 'function') ? keeperObj.getActiveHeadPosition() : null;
          if (headPos && (this.sprite.scale.x >= this._homeScale * this._collideScaleThreshold)) {
            const dxh = headPos.x - this.x;
            const dyh = headPos.y - this.y;
            const dist = Math.sqrt(dxh * dxh + dyh * dyh);
            if (dist <= HIT_RADIUS) {
              this._tweenCancelled = true;
              this._hasDeflected = true;
              this._suppressArrival = true;
              try { if (typeof this.onDeflect === 'function') this.onDeflect(); } catch(e) {}
              const inVx = endX - startX;
              const inVy = endY - startY;
              const inLen = Math.sqrt(inVx * inVx + inVy * inVy) || 1;
              const revNx = -inVx / inLen;
              const revNy = -inVy / inLen;
              const deflectDist = Math.max(120, inLen * 0.5);
              const deflectTargetX = this.x + revNx * deflectDist;
              const deflectTargetY = this.y + revNy * deflectDist;
              // short deflect tween (straight), then return home
              this._tweenTo(deflectTargetX, deflectTargetY, 300, () => {
                this._tweenTo(this._homeX, this._homeY, 400, () => {
                  try { if (this.sprite && this.sprite.scale) this.sprite.scale.set(this._homeScale, this._homeScale); } catch(e){}
                  this._hasDeflected = false;
                  this._currentTargetIndex = null;
                  try { if (typeof this.onSave === 'function') this.onSave(); } catch (e) {}
                }, false, 0);
              }, false, 0);
              return;
            }
          }
        }
      } catch (e) {}

      if (t < 1) requestAnimationFrame(animate); else {
        // finished
        try { if (typeof this.onGoal === 'function') this.onGoal(); } catch (e) {}
        // return home
        this._tweenTo(this._homeX, this._homeY, 200, () => { try { if (typeof this.onShotComplete === 'function') this.onShotComplete(); } catch (e) {} }, false, TWEEN_ARC_FACTOR_DEFAULT, 0);
      }
    };
    requestAnimationFrame(animate);
  }

  // Called by external controller to know when a full shot sequence finished
  public onShotComplete?: () => void;
  // Keeper-mode callbacks
  public onGoal?: () => void;
  public onSave?: () => void;

  // Shoot button removed — UI triggers shots programmatically now

  private resize() {
    const w = BASE_WIDTH;
    const h = BASE_HEIGHT;
    // position ball in logical coordinates so container transforms apply
    this.x = w / 2;
    this.y = 1.05 * h / 2;
    this._homeX = this.x;
    this._homeY = this.y;
  }

  public refresh() {
    this.resize();
  }

  // public API to shoot the ball: choose a random target and arc, do NOT snap to zone centers
  public shoot() {
    // schedule immediate shot (no snapping delay)
    setTimeout(() => {
      const idx = Math.floor(Math.random() * this._targets.length);
      const t = this._targets[idx];
      const screen = this._normalizedToScreen(t.x, t.y);
      // apply small random jitter so we don't land exactly on the zone center
      if (screen) {
        const jitterX = (Math.random() - 0.5) * 60; // +/-30px
        const jitterY = (Math.random() - 0.5) * 40; // +/-20px
        screen.x += jitterX;
        screen.y += jitterY;
      }
      // Decide arc side: left targets curve left, right targets curve right, middle random
      let arcSide = 0;
      try {
        // Inverted mapping: left targets should curve RIGHT (+1), right targets should curve LEFT (-1)
        if (t.x < 0.4) arcSide = 1;
        else if (t.x > 0.6) arcSide = -1;
        else arcSide = Math.random() < 0.5 ? -1 : 1;
      } catch (e) { arcSide = 0; }
      if (!screen) {
        this._finishShoot();
        return;
      }
      // tween to target, then either deflect or play goal fall animation
      this._tweenTo(screen.x, screen.y, 1000, () => {
        if (this._hasDeflected) {
          // deflected path already started; do nothing here
        } else if (this._suppressArrival) {
          // suppressed by external callback — just return home
          this._suppressArrival = false;
            this._tweenTo(this._homeX, this._homeY, 200, () => this._finishShoot(), false, TWEEN_ARC_FACTOR_DEFAULT, arcSide);
        } else {
          // Goal scored: fall to the goal frame bottom (ground) with physics-like motion
            this._fallToGoalGround(screen.x, screen.y, () => {
            try { if (typeof this.onGoal === 'function') this.onGoal(); } catch (e) {}
            this._tweenTo(this._homeX, this._homeY, 200, () => this._finishShoot(), false, TWEEN_ARC_FACTOR_DEFAULT, arcSide);
          });
        }
      }, true, TWEEN_ARC_FACTOR_DEFAULT, arcSide);
      // end tweenTo call
    }, 0);
  }

  private _finishShoot() {
    this._isShooting = false;
    // Button removed: ensure shooting flag reset only
      // do not record a specific snapped target index to avoid snap-based logic
      this._currentTargetIndex = null;
    try { if (typeof this.onShotComplete === 'function') this.onShotComplete(); } catch (e) {}
  }

  // convert normalized goal coordinates (0..1) into screen coordinates using goal2.png placement
  private _normalizedToScreen(nx: number, ny: number): { x: number; y: number } | null {
    try {
      const w = BASE_WIDTH;
      const h = BASE_HEIGHT;
      const tex = PIXI.Texture.from('./arts/bg2.png');
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

  private _tweenTo(destX: number, destY: number, duration: number, cb?: () => void, scaleUp?: boolean, arcFactor: number = TWEEN_ARC_FACTOR_DEFAULT, arcSide: number = 0) {
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
    // arc magnitude proportional to distance, clamped (increased so curves are more pronounced)
    const arcMagBase = Math.min(500, Math.max(80, len * 0.6));
    const arcMag = arcMagBase * Math.max(0, Math.min(2, arcFactor));
    // bias upward (smaller y) a bit so arc looks natural
    // Choose horizontal side of arc: caller may provide arcSide (-1 left, 1 right, 0 auto)
    let sideSign = 0;
    if (arcSide === -1 || arcSide === 1) sideSign = arcSide;
    else sideSign = (dx === 0) ? -1 : (dx > 0 ? -1 : 1);
    const controlX = midX + nx * arcMag * sideSign;
    const controlY = midY + ny * arcMag - Math.abs(len) * 0.02;
    // Debug: log arc parameters to verify curvature and chosen side
    

    this._tweenCancelled = false;
    const start = performance.now();
    const startScale = (this.sprite && this.sprite.scale) ? this.sprite.scale.x : 1;
    const targetScale = (typeof scaleUp === 'boolean') ? (scaleUp ? this._homeScale * this._collideScaleThreshold : this._homeScale) : startScale;
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

      // collision detection: require keeper head to be at the impact point
      try {
        const keeperObj = this.keeper as any;
        if (!this._hasDeflected && keeperObj && keeperObj.isAnimating && (this.sprite.scale.x >= this._homeScale * this._collideScaleThreshold)) {
          const headPos = (typeof keeperObj.getActiveHeadPosition === 'function') ? keeperObj.getActiveHeadPosition() : null;
          if (headPos) {
            const dxh = headPos.x - this.x;
            const dyh = headPos.y - this.y;
            const dist = Math.sqrt(dxh * dxh + dyh * dyh);
            if (dist <= HIT_RADIUS) {
              // cancel the current tween and perform a deflection away from keeper head
              this._tweenCancelled = true;
              this._hasDeflected = true;
              this._suppressArrival = true;
              try { if (typeof this.onDeflect === 'function') this.onDeflect(); } catch(e) {}
              const inVx = destX - startX;
              const inVy = destY - startY;
              const inLen = Math.sqrt(inVx * inVx + inVy * inVy) || 1;
              const revNx = -inVx / inLen;
              const revNy = -inVy / inLen;
              const deflectDist = Math.max(120, inLen * 0.5);
              const deflectTargetX = this.x + revNx * deflectDist;
              const deflectTargetY = this.y + revNy * deflectDist;
              this._tweenTo(deflectTargetX, deflectTargetY, 300, () => {
                this._tweenTo(this._homeX, this._homeY, 400, () => {
                  try { if (this.sprite && this.sprite.scale) this.sprite.scale.set(this._homeScale, this._homeScale); } catch(e){}
                  this._hasDeflected = false;
                  this._currentTargetIndex = null;
                  try { if (typeof this.onSave === 'function') this.onSave(); } catch (e) {}
                  if (cb) cb();
                }, false, 0);
              }, false, 0);
              return;
            }
          }
        }
      } catch (e) {}

      if (tRaw < 1) requestAnimationFrame(animate);
      else if (cb) cb();
    };
    requestAnimationFrame(animate);
  }

  // Compute the bottom Y coordinate (ground) of the displayed `goal3` frame.
  // Mirrors the layout used by GoalBackground: frame center at y = 1.4 * h / 2
  private _computeGoalFrameBottomY(): number | null {
    try {
      const w = BASE_WIDTH;
      const h = BASE_HEIGHT;
      const bgTex = PIXI.Texture.from('./arts/bg2.png');
      const frameTex = PIXI.Texture.from('./arts/goal3.png');
      if (!bgTex || !bgTex.width || !bgTex.height) return null;
      if (!frameTex || !frameTex.width || !frameTex.height) return null;
      const sx = w / bgTex.width;
      const sy = h / bgTex.height;
      const s = Math.max(sx, sy);
      const frameSx = (bgTex.width * s) / frameTex.width;
      const frameSy = (bgTex.height * s) / frameTex.height;
      const fs = Math.min(frameSx, frameSy) * 0.75; // match GoalBackground.frameScale default
      const frameDisplayH = frameTex.height * fs;
      const frameCenterY = 1.4 * h / 2;
      return frameCenterY + frameDisplayH / 2;
    } catch (e) { return null; }
  }

  // Physics-like fall to the computed ground Y with simple gravity + restitution bounce.
  private _fallToGoalGround(fromX: number, fromY: number, cb?: () => void) {
    try {
      const groundYBase = this._computeGoalFrameBottomY();
      if (groundYBase == null) { if (cb) cb(); return; }
      // ground factor controls how far above the absolute frame bottom the ball lands.
      // Increase this factor to lower the ground (larger Y). Default tuned to 0.95.
      const groundY = groundYBase * this._groundFactor;

      // physics params
      const gravity = 2200; // px / s^2 (tuned)
      let vy = 0; // initial vertical speed
      let vx = 0; // we'll nudge x toward fromX
      const restitution = 0.45; // bounce energy retained
      const minBounceV = 80; // when vy after bounce is below this, stop

      let last = performance.now();
      const startX = this.x;
      const startY = this.y;

      const step = (now: number) => {
        const dt = Math.min(0.04, (now - last) / 1000); // clamp dt
        last = now;

        // apply gravity
        vy += gravity * dt;
        this.y += vy * dt;

        // nudge x toward fromX smoothly
        vx = (fromX - this.x) * 6 * dt; // proportional control
        this.x += vx;

        if (this.y >= groundY) {
          // hit ground
          this.y = groundY;
          vy = -vy * restitution;
          // if very small bounce velocity, finish
          if (Math.abs(vy) < minBounceV) {
            this.y = groundY;
            if (cb) cb();
            return;
          }
        }

        requestAnimationFrame(step);
      };

      requestAnimationFrame(step);
    } catch (e) { if (cb) cb(); }
  }

  // Factor used to compute landing Y relative to computed frame bottom.
  // 1.0 = exactly the frame bottom; <1.0 = slightly above. Default 0.95.
  private _groundFactor: number = 0.95;

  public setGroundFactor(f: number) {
    if (typeof f !== 'number') return;
    this._groundFactor = Math.max(0.7, Math.min(1.05, f));
  }

  // pass-through removed

  destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    try { this.sprite.destroy(); } catch (e) {}
    super.destroy(options);
  }
}
